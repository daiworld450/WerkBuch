// ---------------------------------------------------------------------------
// fotoVersand.js — der Teil der Foto-Warteschlange, der wirklich speichert
// und sendet. Die Entscheidungen (passt es noch rein, was kommt als Nächstes,
// wann gibt ein Eintrag auf) stehen in warteschlange.js und sind dort geprüft.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";

import { db } from "../firebase";
import { ladeDateiHoch } from "../cloudinary";
import { aktualisiereZaehler } from "./baustelle";
import { pruefeEinordnung, einordnungsFelder } from "./einordnung";
import {
  passtNoch,
  eintragAnlegen,
  entfernen,
  naechster,
  fehlschlagVermerken,
} from "./warteschlange";

const SPEICHERORT = "werkbuch.fotos.warteschlange.v1";

export async function laden() {
  try {
    const roh = await AsyncStorage.getItem(SPEICHERORT);
    const liste = roh ? JSON.parse(roh) : [];
    return Array.isArray(liste) ? liste : [];
  } catch (e) {
    return [];
  }
}

export async function speichern(liste) {
  try {
    await AsyncStorage.setItem(SPEICHERORT, JSON.stringify(liste || []));
    return true;
  } catch (e) {
    // Speicher voll. Nicht still schlucken — der Aufrufer muss das dem Nutzer
    // sagen können, sonst verschwindet ein Foto ohne Hinweis.
    return false;
  }
}

/** Legt ein Foto in die Warteschlange. Gibt { ok, grund, liste } zurück. */
export async function einreihen(daten) {
  const liste = await laden();
  // Letzte Absicherung: ohne Phase und Raum kommt nichts in die Schlange,
  // auch wenn ein Bildschirm die Abfrage einmal vergisst.
  const einordnung = pruefeEinordnung(daten);
  if (!einordnung.ok) return { ok: false, grund: einordnung.grund, liste };
  const kennung = `${Date.now()}-${liste.length}-${(daten.base64 || "").length % 9973}`;
  const eintrag = eintragAnlegen(kennung, daten);

  const platz = passtNoch(liste, eintrag);
  if (!platz.ok) return { ok: false, grund: platz.grund, liste };

  const neue = [...liste, eintrag];
  if (!(await speichern(neue))) {
    return {
      ok: false,
      grund:
        "Das Foto ließ sich nicht zwischenspeichern — der Platz auf dem Gerät reicht nicht. " +
        "Bitte mit Empfang erneut versuchen.",
      liste,
    };
  }
  return { ok: true, liste: neue };
}

/**
 * Arbeitet die Warteschlange ab, solange etwas geht.
 * beiAenderung wird nach jedem Schritt mit der aktuellen Liste aufgerufen.
 */
export async function abarbeiten(beiAenderung) {
  let liste = await laden();
  if (liste.length === 0) return liste;

  for (;;) {
    const eintrag = naechster(liste);
    if (!eintrag) break;

    try {
      const { url, publicId } = await ladeDateiHoch(
        `data:image/jpeg;base64,${eintrag.base64}`,
        { typ: "image", dateiname: eintrag.dateiname, base64: eintrag.base64 }
      );

      await addDoc(collection(db, "baustellen", eintrag.baustelleId, "fotos"), {
        url,
        publicId,
        phase: eintrag.phase,
        ...einordnungsFelder(eintrag),
        notiz: eintrag.notiz,
        hochgeladenVon: eintrag.hochgeladenVon,
        // Zwei verschiedene Zeitpunkte, mit Absicht getrennt.
        aufgenommenAm: eintrag.aufgenommenAm
          ? Timestamp.fromDate(new Date(eintrag.aufgenommenAm))
          : null,
        erstelltAm: serverTimestamp(),
      });

      liste = entfernen(liste, eintrag.id);
      await speichern(liste);
      beiAenderung?.(liste);
      aktualisiereZaehler(eintrag.baustelleId);
    } catch (e) {
      liste = fehlschlagVermerken(liste, eintrag.id, e?.message || e);
      await speichern(liste);
      beiAenderung?.(liste);
      // Kein Netz oder Gegenstelle nicht erreichbar: Abbruch. Weiter geht es
      // beim nächsten Aufruf — stures Weiterprobieren leert nur den Akku.
      break;
    }
  }
  return liste;
}

export async function leeren() {
  await AsyncStorage.removeItem(SPEICHERORT).catch(() => {});
}
