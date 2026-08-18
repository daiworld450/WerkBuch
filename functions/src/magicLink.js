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
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import { ZUGANG } from "./config.js";

// Der rohe Token steht in der URL. base64url, damit er ohne Kodierung in einen
// Link passt und beim Kopieren aus einer E-Mail nicht zerbricht.
export function tokenErzeugen() {
  return crypto.randomBytes(ZUGANG.tokenBytes).toString("base64url");
}

export function tokenHashen(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function codeErzeugen() {
  // crypto.randomInt statt Math.random: bei einem Sicherheitscode darf die
  // Zufallsfolge nicht vorhersagbar sein.
  const max = 10 ** ZUGANG.codeStellen;
  return String(crypto.randomInt(0, max)).padStart(ZUGANG.codeStellen, "0");
}

export function codeHashen(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Zeitkonstanter Vergleich: ein normaler Stringvergleich bricht beim ersten
// abweichenden Zeichen ab und verrät über die Antwortzeit, wie viele Stellen
// stimmten.
export function hashGleich(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
export function codePruefen(daten, eingabe, jetzt = new Date()) {
  if (!daten?.codeHash) return { ok: false, grund: "kein_code" };

  const versuche = daten.codeVersuche || 0;
  if (versuche >= ZUGANG.codeMaxVersuche) return { ok: false, grund: "zu_viele_versuche" };

  const gueltigBis = daten.codeGueltigBis?.toDate?.() ?? daten.codeGueltigBis;
  if (gueltigBis && jetzt > gueltigBis) return { ok: false, grund: "abgelaufen" };

  if (!hashGleich(codeHashen(String(eingabe).trim()), daten.codeHash)) {
    return { ok: false, grund: "falsch", verbleibend: ZUGANG.codeMaxVersuche - versuche - 1 };
  }
  return { ok: true };
}

export default {
  tokenErzeugen,
  tokenHashen,
  codeErzeugen,
  codeHashen,
  hashGleich,
  ablaufDatum,
  portalAdresse,
  zugangPruefen,
  codePruefen,
};
