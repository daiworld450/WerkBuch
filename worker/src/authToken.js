// ---------------------------------------------------------------------------
// authToken.js — prüft ein Firebase-ID-Token, OHNE firebase-admin.
//
// Wird nur für angebotsLinkVersenden gebraucht: der einzige Endpunkt, der
// eine echte Handwerker-Anmeldung voraussetzt (alle anderen laufen über den
// Magic-Link, also ohne Firebase-Auth). Der Client schickt sein normales
// Firebase-ID-Token (auth.currentUser.getIdToken()) im Authorization-Header
// mit; dieses Modul prüft Signatur und Ansprüche selbst nach.
//
// Firebase-ID-Tokens sind gewöhnliche, von Google signierte RS256-JWTs. Die
// dafür nötigen öffentlichen Schlüssel liegen offen unter einer festen
// Google-Adresse — kein Geheimnis, kein Dienstkonto nötig, nur Prüfung.
// ---------------------------------------------------------------------------

const JWK_ADRESSE =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// Ein paar Minuten Toleranz für Uhrenabweichungen zwischen Client, Google und
// diesem Worker — striktes ">" bei exp/iat wäre in der Praxis zu empfindlich.
const UHR_TOLERANZ_SEKUNDEN = 300;

// Schlüssel werden pro Worker-Prozess zwischengespeichert. Google wechselt
// sie selten und kündigt das über den Cache-Control-Header an; ein fester
// Stunden-Richtwert ist hier ausreichend genau und hält den Code einfach.
let zwischengespeicherteSchluessel = null; // { schluesselNachKid, ablaufAm }
const SCHLUESSEL_CACHE_MINUTEN = 60;

function base64UrlZuBytes(text) {
  const normal = text.replace(/-/g, "+").replace(/_/g, "/");
  const aufgefuellt = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  const roh = atob(aufgefuellt);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

function base64UrlZuJson(text) {
  return JSON.parse(new TextDecoder().decode(base64UrlZuBytes(text)));
}

async function oeffentlicheSchluesselHolen() {
  const jetzt = Date.now();
  if (zwischengespeicherteSchluessel && zwischengespeicherteSchluessel.ablaufAm > jetzt) {
    return zwischengespeicherteSchluessel.schluesselNachKid;
  }

  const antwort = await fetch(JWK_ADRESSE);
  if (!antwort.ok) {
    throw new Error(`Konnte Googles öffentliche Schlüssel nicht laden (HTTP ${antwort.status})`);
  }
  const { keys } = await antwort.json();

  const schluesselNachKid = new Map();
  for (const jwk of keys || []) {
    const schluessel = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    schluesselNachKid.set(jwk.kid, schluessel);
  }

  zwischengespeicherteSchluessel = {
    schluesselNachKid,
    ablaufAm: jetzt + SCHLUESSEL_CACHE_MINUTEN * 60_000,
  };
  return schluesselNachKid;
}

/**
 * Prüft ein Firebase-ID-Token vollständig: Signatur UND alle Ansprüche.
 *
 * @param {string} token — der rohe JWT-String aus dem Authorization-Header
 *                          (ohne das "Bearer "-Präfix)
 * @param {string} projektId — z.B. "berisa-bau", zur Prüfung von iss/aud
 * @returns {Promise<{uid: string, email: string|null, emailVerifiziert: boolean}>}
 * @throws {Error} bei jeder Art von ungültigem Token — die Nachricht ist
 *                  bewusst generisch ("Anmeldung ungültig"), damit sie nie
 *                  verrät, WARUM genau die Prüfung fehlschlug (kein
 *                  Angriffs-Feedback).
 */
export async function idTokenPruefen(token, projektId) {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Anmeldung ungültig.");
  }
  const [kopfB64, anspruchB64, signaturB64] = token.split(".");

  let kopf, anspruch;
  try {
    kopf = base64UrlZuJson(kopfB64);
    anspruch = base64UrlZuJson(anspruchB64);
  } catch {
    throw new Error("Anmeldung ungültig.");
  }

  if (kopf.alg !== "RS256") throw new Error("Anmeldung ungültig.");

  const schluesselNachKid = await oeffentlicheSchluesselHolen();
  const schluessel = schluesselNachKid.get(kopf.kid);
  if (!schluessel) throw new Error("Anmeldung ungültig.");

  const gueltig = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    schluessel,
    base64UrlZuBytes(signaturB64),
    new TextEncoder().encode(`${kopfB64}.${anspruchB64}`)
  );
  if (!gueltig) throw new Error("Anmeldung ungültig.");

  const jetzt = Math.floor(Date.now() / 1000);
  if (anspruch.iss !== `https://securetoken.google.com/${projektId}`) {
    throw new Error("Anmeldung ungültig.");
  }
  if (anspruch.aud !== projektId) throw new Error("Anmeldung ungültig.");
  if (typeof anspruch.exp !== "number" || jetzt > anspruch.exp + UHR_TOLERANZ_SEKUNDEN) {
    throw new Error("Anmeldung ungültig.");
  }
  if (typeof anspruch.iat !== "number" || anspruch.iat > jetzt + UHR_TOLERANZ_SEKUNDEN) {
    throw new Error("Anmeldung ungültig.");
  }
  if (typeof anspruch.auth_time !== "number" || anspruch.auth_time > jetzt + UHR_TOLERANZ_SEKUNDEN) {
    throw new Error("Anmeldung ungültig.");
  }
  if (!anspruch.sub || typeof anspruch.sub !== "string") {
    throw new Error("Anmeldung ungültig.");
  }

  return {
    uid: anspruch.sub,
    email: anspruch.email || null,
    emailVerifiziert: !!anspruch.email_verified,
  };
}

export default { idTokenPruefen };
