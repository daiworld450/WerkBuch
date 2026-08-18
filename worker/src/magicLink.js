// ---------------------------------------------------------------------------
// magicLink.js — Zugang für den Kunden ohne Konto und ohne Passwort.
//
// Der Kunde bekommt einen Link mit einem langen Zufallswert (Token). In der
// Datenbank liegt davon NUR der SHA-256-Abdruck: Wer die Datenbank liest, kann
// daraus keinen funktionierenden Link zurückrechnen (Spezifikation Kapitel 3).
//
// Ansehen darf man mit dem Link allein. Für die verbindliche FREIGABE wird
// zusätzlich ein sechsstelliger Code an die hinterlegte E-Mail-Adresse
// geschickt. Damit kann ein weitergeleiteter Link zwar gelesen, aber nichts
// Kostenpflichtiges bestellt werden.
//
// Portierung von functions/src/magicLink.js: Cloudflare Workers haben kein
// node:crypto. Ersetzt durch die Web Crypto API (überall dort verfügbar, wo
// auch fetch existiert — kein zusätzliches Paket nötig, genau wie im
// bauvision/worker-Vorbild). Dadurch werden tokenHashen/codeHashen/
// codePruefen async (crypto.subtle.digest liefert ein Promise) — im
// Node-Original waren sie synchron.
// ---------------------------------------------------------------------------

import { ZUGANG } from "./config.js";

function bytesZuBase64Url(bytes) {
  let roh = "";
  for (const b of bytes) roh += String.fromCharCode(b);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesZuHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Exportiert, weil portal.js dieselbe Grundfunktion für den Angebots-Abdruck
// braucht (Spezifikation 8.1) — eine SHA-256-Hex-Hilfsfunktion, kein
// magic-link-spezifisches Wissen.
export async function sha256Hex(text) {
  const daten = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", daten);
  return bytesZuHex(new Uint8Array(digest));
}

// Der rohe Token steht in der URL. base64url, damit er ohne Kodierung in einen
// Link passt und beim Kopieren aus einer E-Mail nicht zerbricht.
export function tokenErzeugen() {
  const bytes = new Uint8Array(ZUGANG.tokenBytes);
  crypto.getRandomValues(bytes);
  return bytesZuBase64Url(bytes);
}

export async function tokenHashen(token) {
  return sha256Hex(token);
}

// Sechsstelliger Code über Verwerfungs-Stichprobe (rejection sampling) statt
// Modulo auf eine rohe Zufallszahl — sonst wären die letzten, unvollständigen
// Werte des uint32-Bereichs leicht häufiger als die übrigen (Modulo-Bias).
// Bei einem Sicherheitscode darf die Verteilung nicht verzerrt sein.
export function codeErzeugen() {
  const max = 10 ** ZUGANG.codeStellen;
  const grenze = Math.floor(0x100000000 / max) * max;
  const arr = new Uint32Array(1);
  let wert;
  do {
    crypto.getRandomValues(arr);
    wert = arr[0];
  } while (wert >= grenze);
  return String(wert % max).padStart(ZUGANG.codeStellen, "0");
}

export async function codeHashen(code) {
  return sha256Hex(code);
}

// Zeitkonstanter Vergleich: ein normaler Stringvergleich bricht beim ersten
// abweichenden Zeichen ab und verrät über die Antwortzeit, wie viele Stellen
// stimmten. Beide Eingaben sind hier immer SHA-256-Abdrücke fester Länge
// (64 Hex-Zeichen) — der Längenvergleich vorab ist deshalb unkritisch, exakt
// wie im ursprünglichen node:crypto.timingSafeEqual-Aufruf.
export function hashGleich(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) {
    unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return unterschied === 0;
}

export function ablaufDatum(tage) {
  return new Date(Date.now() + tage * 24 * 60 * 60 * 1000);
}

export function portalAdresse(basis, token) {
  return `${basis}/angebot/${token}`;
}

// Prüft den Zustand eines Zugangs-Datensatzes. Gibt einen Klartext-Grund
// zurück, damit der Aufrufer eine verständliche Meldung erzeugen kann.
export function zugangPruefen(daten, jetzt = new Date()) {
  if (!daten) return { gueltig: false, grund: "unbekannt" };
  if (daten.widerrufen) return { gueltig: false, grund: "widerrufen" };

  const ablauf = daten.laeuftAbAm?.toDate?.() ?? daten.laeuftAbAm;
  if (ablauf && jetzt > ablauf) return { gueltig: false, grund: "abgelaufen" };

  return { gueltig: true, verifiziert: !!daten.verifiziertAm };
}

// Prüft den eingegebenen Sechsstelligen-Code gegen den gespeicherten Abdruck.
export async function codePruefen(daten, eingabe, jetzt = new Date()) {
  if (!daten?.codeHash) return { ok: false, grund: "kein_code" };

  const versuche = daten.codeVersuche || 0;
  if (versuche >= ZUGANG.codeMaxVersuche) return { ok: false, grund: "zu_viele_versuche" };

  const gueltigBis = daten.codeGueltigBis?.toDate?.() ?? daten.codeGueltigBis;
  if (gueltigBis && jetzt > gueltigBis) return { ok: false, grund: "abgelaufen" };

  const abdruck = await codeHashen(String(eingabe).trim());
  if (!hashGleich(abdruck, daten.codeHash)) {
    return { ok: false, grund: "falsch", verbleibend: ZUGANG.codeMaxVersuche - versuche - 1 };
  }
  return { ok: true };
}

export default {
  tokenErzeugen,
  tokenHashen,
  codeErzeugen,
  codeHashen,
  sha256Hex,
  hashGleich,
  ablaufDatum,
  portalAdresse,
  zugangPruefen,
  codePruefen,
};
