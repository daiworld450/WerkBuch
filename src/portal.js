// ---------------------------------------------------------------------------
// portal.js — Zugang zu den Server-Funktionen des Kundenportals.
//
// Warum überhaupt ein Server dazwischen: Der Kunde ist im Portal NICHT
// angemeldet. Firestore-Sicherheitsregeln können aber nur angemeldete Nutzer
// unterscheiden — sie können nicht prüfen, ob jemand einen gültigen Link
// besitzt. Deshalb läuft im Portal jeder Zugriff über diese Funktionen, die
// serverseitig den Token prüfen.
// ---------------------------------------------------------------------------

import { getFunctions, httpsCallable } from "firebase/functions";
import app from "./firebase";

// Frankfurt — dieselbe Region wie in den Cloud Functions festgelegt.
const functions = getFunctions(app, "europe-west3");

function ruf(name) {
  const fn = httpsCallable(functions, name);
  return async (daten) => {
    try {
      const antwort = await fn(daten);
      return antwort.data;
    } catch (e) {
      // Cloud Functions verpacken den Fehlertext in e.message und die
      // Zusatzangaben in e.details. Beides zu einem Fehler zusammenführen,
      // damit die Oberfläche den deutschen Klartext direkt anzeigen kann.
      const fehler = new Error(e?.message || "Verbindung fehlgeschlagen.");
      fehler.code = e?.details?.code || e?.code || "UNBEKANNT";
      fehler.details = e?.details || {};
      throw fehler;
    }
  };
}

export const angebotLaden = ruf("portalAnsehen");
export const codeAnfordern = ruf("portalCodeAnfordern");
export const codePruefen = ruf("portalCodePruefen");
export const zulagenRechnen = ruf("portalZulagenRechnen");
export const freigeben = ruf("portalFreigeben");
export const ablehnen = ruf("portalAblehnen");
export const rueckfrageSenden = ruf("portalRueckfrage");

// Vom Handwerker aufgerufen (mit Anmeldung)
export const linkVersenden = ruf("angebotsLinkVersenden");
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
  katalogEinrichten,
  idempotenzSchluessel,
};
