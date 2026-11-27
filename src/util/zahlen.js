// ---------------------------------------------------------------------------
// zahlen.js — Umsatz und Budget einer Baustelle.
//
// Beides liegt NICHT im Baustellen-Dokument, sondern in baustellen/{id}/zahlen/aktuell.
// Grund: Firestore kann einzelne Felder nicht verbergen. Wer das Baustellen-
// Dokument lesen darf (auch der zugewiesene Mitarbeiter, damit er Name und
// Adresse sieht), bekäme sonst Umsatz und Budget gleich mit. Der Unterordner
// "zahlen" ist in firestore.rules nur dem Inhaber geöffnet.
// ---------------------------------------------------------------------------

import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export function zahlenRef(baustelleId) {
  return doc(db, "baustellen", baustelleId, "zahlen", "aktuell");
}

export function zahlenSetzen(baustelleId, { umsatz, budget }) {
  return setDoc(zahlenRef(baustelleId), { umsatz, budget }, { merge: true });
}
