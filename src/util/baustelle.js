// ---------------------------------------------------------------------------
// baustelle.js — gemeinsame Helfer rund um eine Baustelle.
// Berechnet Fotoanzahl und Fortschritt neu und schreibt sie ins Hauptdokument.
// ---------------------------------------------------------------------------

import { collection, getDocs, getDoc, doc, updateDoc } from "firebase/firestore";
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

// Eine abgeschlossene Baustelle steht immer bei 100 %. Die sechs Foto-Phasen
// zeigen nur, wie vollständig die Fotos sind, nicht den Stand der Arbeit: ein
// fertiger Auftrag mit Fotos aus nur zwei Phasen stand sonst bei 33 %.
export function anzeigeFortschritt(baustelle) {
  if (baustelle?.status === "Abgeschlossen") return 100;
  return Math.round(baustelle?.fortschritt || 0);
}

// Liest alle Fotos, zählt sie und leitet den Fortschritt ab (0–100).
// Abgeschlossen: immer 100, egal welche Phasen Fotos haben.
export async function aktualisiereZaehler(baustelleId) {
  try {
    const baustelleDoc = await getDoc(doc(db, "baustellen", baustelleId));
    const snap = await getDocs(
      collection(db, "baustellen", baustelleId, "fotos")
    );
    const fotoAnzahl = snap.size;
    const phasenMitFoto = new Set();
    snap.docs.forEach((d) => {
      const p = d.data().phase;
      if (p) phasenMitFoto.add(p);
    });
    const fortschritt =
      baustelleDoc.data()?.status === "Abgeschlossen"
        ? 100
        : Math.round((phasenMitFoto.size / PHASEN.length) * 100);
    await updateDoc(doc(db, "baustellen", baustelleId), {
      fotoAnzahl,
      fortschritt,
    });
  } catch (_) {
    // Zähler sind nur Komfort – Fehler hier dürfen den Ablauf nicht stoppen.
  }
}

export default { PHASEN, aktualisiereZaehler, anzeigeFortschritt };
