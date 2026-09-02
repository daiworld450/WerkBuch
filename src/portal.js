// ---------------------------------------------------------------------------
// portal.js — Zugang zu den Server-Funktionen des Kundenportals.
//
// Warum überhaupt ein Server dazwischen: Der Kunde ist im Portal NICHT
// angemeldet. Firestore-Sicherheitsregeln können aber nur angemeldete Nutzer
// unterscheiden — sie können nicht prüfen, ob jemand einen gültigen Link
// besitzt. Deshalb läuft im Portal jeder Zugriff über diese Funktionen, die
// serverseitig den Token prüfen.
//
// Läuft jetzt gegen den Cloudflare Worker (worker/) statt gegen Firebase
// Cloud Functions — Cloud Functions hätten den kostenpflichtigen Blaze-Tarif
// vorausgesetzt. Gleiche Funktionsnamen, gleiche Parameter, gleiche
// Rückgabeform wie vorher: PortalScreen.js und AngebotScreen.js mussten für
// diese Umstellung nicht angefasst werden.
// ---------------------------------------------------------------------------

import { auth } from "./firebase";

const WORKER_BASIS = "https://werkbuch.werkbuch-berisabau.workers.dev";

// Name → Pfad auf dem Worker (siehe worker/src/index.js).
const PFADE = {
  angebotLaden: "/portal/ansehen",
  codeAnfordern: "/portal/code-anfordern",
  codePruefen: "/portal/code-pruefen",
  zulagenRechnen: "/portal/zulagen-rechnen",
  freigeben: "/portal/freigeben",
  ablehnen: "/portal/ablehnen",
  rueckfrageSenden: "/portal/rueckfrage",
  linkVersenden: "/handwerker/link-versenden",
  bewertungAnfordern: "/handwerker/bewertung-anfordern",
  katalogEinrichten: "/handwerker/katalog-einrichten",
};

// Diese verlangen eine echte Handwerker-Anmeldung — der Worker prüft das
// serverseitig noch einmal nach (authToken.js), das ID-Token hier ist nur
// der Transportweg dafür, kein Vertrauensbeweis für sich allein.
const ANGEMELDETE_PFADE = new Set([
  "/handwerker/link-versenden",
  "/handwerker/bewertung-anfordern",
  "/handwerker/katalog-einrichten",
]);

function ruf(name) {
  const pfad = PFADE[name];
  return async (daten) => {
    const kopfzeilen = { "Content-Type": "application/json" };

    if (ANGEMELDETE_PFADE.has(pfad)) {
      if (!auth.currentUser) {
        const fehler = new Error("Bitte melden Sie sich an.");
        fehler.code = "NICHT_ANGEMELDET";
        throw fehler;
      }
      kopfzeilen.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    }

    let antwort;
    try {
      antwort = await fetch(WORKER_BASIS + pfad, {
        method: "POST",
        headers: kopfzeilen,
        body: JSON.stringify(daten || {}),
      });
    } catch {
      const fehler = new Error("Verbindung fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung.");
      fehler.code = "VERBINDUNG";
      throw fehler;
    }

    let koerper = null;
    try {
      koerper = await antwort.json();
    } catch {
      // Antwort war kein JSON — bleibt null, unten als UNBEKANNT behandelt.
    }

    if (!antwort.ok) {
      const info = koerper?.fehler || {};
      const fehler = new Error(info.nachricht || "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.");
      fehler.code = info.code || "UNBEKANNT";
      fehler.details = info;
      throw fehler;
    }

    return koerper;
  };
}

export const angebotLaden = ruf("angebotLaden");
export const codeAnfordern = ruf("codeAnfordern");
export const codePruefen = ruf("codePruefen");
export const zulagenRechnen = ruf("zulagenRechnen");
export const freigeben = ruf("freigeben");
export const ablehnen = ruf("ablehnen");
export const rueckfrageSenden = ruf("rueckfrageSenden");

// Vom Handwerker aufgerufen (mit Anmeldung)
export const linkVersenden = ruf("linkVersenden");
export const bewertungAnfordern = ruf("bewertungAnfordern");
export const katalogEinrichten = ruf("katalogEinrichten");

// Erzeugt einen Schlüssel, der eine Freigabe eindeutig macht. Wird der Knopf
// zweimal gedrückt oder bricht die Verbindung ab, kommt derselbe Schlüssel
// erneut an — der Server erkennt das und legt nichts doppelt an.
export function idempotenzSchluessel() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Rückfallebene für ältere Umgebungen ohne crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default {
  angebotLaden,
  codeAnfordern,
  codePruefen,
  zulagenRechnen,
  freigeben,
  ablehnen,
  rueckfrageSenden,
  linkVersenden,
  bewertungAnfordern,
  katalogEinrichten,
  idempotenzSchluessel,
};
