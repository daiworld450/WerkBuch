// ---------------------------------------------------------------------------
// baustelle.js — gemeinsame Helfer rund um eine Baustelle.
// Berechnet Fotoanzahl und Fortschritt neu und schreibt sie ins Hauptdokument.
// ---------------------------------------------------------------------------

import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

// Die sechs Bauphasen bestimmen den Fortschritt:
// Jede Phase mit mindestens einem Foto zählt als "erreicht".
export const PHASEN = [
  "Vorher",
  "Abriss",
  "Rohinstallation",
  "Fliesen",
  "Montage",
  "Fertig",
];

// Liest alle Fotos, zählt sie und leitet den Fortschritt ab (0–100).
export async function aktualisiereZaehler(baustelleId) {
  try {
    const snap = await getDocs(
      collection(db, "baustellen", baustelleId, "fotos")
    );
    const fotoAnzahl = snap.size;
    const phasenMitFoto = new Set();
    snap.docs.forEach((d) => {
      const p = d.data().phase;
      if (p) phasenMitFoto.add(p);
    });
    const fortschritt = Math.round((phasenMitFoto.size / PHASEN.length) * 100);
    await updateDoc(doc(db, "baustellen", baustelleId), {
      fotoAnzahl,
      fortschritt,
    });
  } catch (_) {
    // Zähler sind nur Komfort – Fehler hier dürfen den Ablauf nicht stoppen.
  }
}

export default { PHASEN, aktualisiereZaehler };
