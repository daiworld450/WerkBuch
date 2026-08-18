// ---------------------------------------------------------------------------
// index.js — Einstiegspunkt der Cloud Functions.
//
// Zwei Gruppen:
//   portal*          — vom Kunden aufgerufen, ohne Anmeldung, nur mit Token
//   angebotsLink*    — vom Handwerker aufgerufen, mit Anmeldung
// ---------------------------------------------------------------------------

import { initializeApp } from "firebase-admin/app";

initializeApp();

export {
  portalAnsehen,
  portalCodeAnfordern,
  portalCodePruefen,
  portalZulagenRechnen,
  portalFreigeben,
  portalAblehnen,
  portalRueckfrage,
  angebotsLinkVersenden,
} from "./src/portal.js";

export { katalogEinrichten } from "./src/katalog.js";
