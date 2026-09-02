// ---------------------------------------------------------------------------
// index.js — der Worker-Einstiegspunkt. Verbindet HTTP-Anfragen der App mit
// den Funktionen aus portal.js.
//
// Muster nach bauvision/worker/src/index.js: kein Framework, ein einziger
// fetch-Handler mit Pfad-Verzweigung, einheitliche Fehlerantwort als JSON.
// ---------------------------------------------------------------------------

import {
  portalAnsehen,
  portalCodeAnfordern,
  portalCodePruefen,
  portalZulagenRechnen,
  portalFreigeben,
  portalAblehnen,
  portalRueckfrage,
  angebotsLinkVersenden,
  bewertungAnfordern,
  katalogEinrichten,
  PortalFehler,
} from "./portal.js";
import { idTokenPruefen } from "./authToken.js";

// Pfad → { fn, brauchtAnmeldung }. Alle Endpunkte sind POST — passend zum
// Callable-Muster, das der Client bisher (httpsCallable) gewohnt war.
const ENDPUNKTE = {
  "/portal/ansehen": { fn: portalAnsehen },
  "/portal/code-anfordern": { fn: portalCodeAnfordern },
  "/portal/code-pruefen": { fn: portalCodePruefen },
  "/portal/zulagen-rechnen": { fn: portalZulagenRechnen },
  "/portal/freigeben": { fn: portalFreigeben },
  "/portal/ablehnen": { fn: portalAblehnen },
  "/portal/rueckfrage": { fn: portalRueckfrage },
  "/handwerker/link-versenden": { fn: angebotsLinkVersenden, brauchtAnmeldung: true },
  "/handwerker/bewertung-anfordern": { fn: bewertungAnfordern, brauchtAnmeldung: true },
  "/handwerker/katalog-einrichten": { fn: katalogEinrichten, brauchtAnmeldung: true },
};

// Anders als bei BauVisions öffentlichem Vorschau-Endpunkt (dort HERKUNFT="",
// weil die Oberfläche vom selben Worker mitausgeliefert wird) läuft die
// WerkBuch-Oberfläche auf einer eigenen Adresse (GitHub Pages) — deshalb hier
// eine feste Positivliste statt Origin-Reflexion. Verhindert, dass eine
// fremde Webseite im Browser eines Kunden/Handwerkers unbemerkt Anfragen an
// diesen Worker stellt. Betrifft nur Web-Aufrufe: die native App unterliegt
// als Nicht-Browser ohnehin keiner CORS-Prüfung.
function kopfzeilen(anfrage, env) {
  const erlaubt = (env.ERLAUBTE_HERKUENFTE || "").split(",").map((h) => h.trim()).filter(Boolean);
  const herkunft = anfrage.headers.get("Origin");
  const zugelassen = herkunft && erlaubt.includes(herkunft);
  return {
    ...(zugelassen ? { "Access-Control-Allow-Origin": herkunft } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

function jsonAntwort(daten, status, extraKopf = {}) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraKopf },
  });
}

export default {
  async fetch(anfrage, env, ctx) {
    const zusatzKopf = kopfzeilen(anfrage, env);
    const url = new URL(anfrage.url);
    const pfad = url.pathname.replace(/\/+$/, "") || "/";

    if (anfrage.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: zusatzKopf });
    }

    if (pfad === "/gesundheit") {
      return jsonAntwort({ ok: true, dienst: "werkbuch-worker" }, 200, zusatzKopf);
    }

    const ziel = ENDPUNKTE[pfad];
    if (!ziel) {
      return jsonAntwort({ fehler: "Unbekannter Endpunkt." }, 404, zusatzKopf);
    }
    if (anfrage.method !== "POST") {
      return jsonAntwort({ fehler: "Nur POST erlaubt." }, 405, zusatzKopf);
    }

    let daten;
    try {
      daten = await anfrage.json();
    } catch {
      return jsonAntwort({ fehler: "Die Anfrage ist kein gültiges JSON." }, 400, zusatzKopf);
    }

    const kontext = {
      ip: anfrage.headers.get("cf-connecting-ip") || null,
      userAgent: anfrage.headers.get("user-agent") || null,
    };

    if (ziel.brauchtAnmeldung) {
      const kopfwert = anfrage.headers.get("Authorization") || "";
      const treffer = /^Bearer (.+)$/.exec(kopfwert);
      if (!treffer) {
        return jsonAntwort(
          { fehler: { code: "NICHT_ANGEMELDET", nachricht: "Bitte melden Sie sich an." } },
          401,
          zusatzKopf
        );
      }
      try {
        kontext.auth = await idTokenPruefen(treffer[1], env.FIRESTORE_PROJEKT_ID);
      } catch {
        return jsonAntwort(
          { fehler: { code: "NICHT_ANGEMELDET", nachricht: "Ihre Anmeldung ist ungültig oder abgelaufen. Bitte melden Sie sich erneut an." } },
          401,
          zusatzKopf
        );
      }
    }

    try {
      const ergebnis = await ziel.fn(env, daten, kontext);
      return jsonAntwort(ergebnis, 200, zusatzKopf);
    } catch (e) {
      if (e instanceof PortalFehler) {
        return jsonAntwort(
          { fehler: { code: e.code, nachricht: e.message, ...e.details } },
          e.httpStatus,
          zusatzKopf
        );
      }
      // Unerwarteter Fehler: niemals Interna (Stacktrace, Rohtext von Google/
      // Brevo) an den Client durchreichen — nur protokollieren.
      console.error("Unerwarteter Fehler:", e);
      return jsonAntwort(
        { fehler: { code: "UNBEKANNT", nachricht: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut." } },
        500,
        zusatzKopf
      );
    }
  },
};
