// ---------------------------------------------------------------------------
// warteschlange.js — Fotos, die noch hochgeladen werden müssen.
//
// Der Grund: Im Keller, im Rohbau, im Treppenhaus gibt es kein Netz. Bisher
// hieß das: Foto weg. Ab jetzt wandert es in eine Warteschlange auf dem Gerät
// und geht raus, sobald wieder Empfang da ist — auch wenn die App
// zwischendurch geschlossen war.
//
// Aufgeteilt in zwei Hälften:
//   * DIESE DATEI ist die reine Logik und kennt weder Speicher noch Netz. Sie
//     ist ohne alles prüfbar (tests/warteschlange.test.cjs) — genau deshalb
//     steht sie getrennt: mit einem AsyncStorage-Import ließe sie sich im
//     Testlauf gar nicht erst laden.
//   * Der Teil, der wirklich speichert und sendet, steht in fotoVersand.js und
//     ruft nur diese Funktionen auf.
//
// Grenze mit Absicht: Ein Foto liegt als Base64 in der Warteschlange, und im
// Browser steht dafür nur wenig Platz zur Verfügung. Deshalb ein hartes Limit
// — und eine ehrliche Meldung, statt später still etwas zu verlieren.
// ---------------------------------------------------------------------------

// Rund 12 MB. Ein auf 1600 px verkleinertes Foto wiegt als Base64 etwa 0,4 MB,
// das reicht für rund 25 Bilder einer Baustelle ohne Netz.
export const MAX_BYTES = 12 * 1024 * 1024;
export const MAX_ANZAHL = 40;

/** Grobe Größe eines Eintrags in Bytes. Base64 ist der Löwenanteil. */
export function groesse(eintrag) {
  return (eintrag?.base64?.length || 0) + 400;
}

export function gesamtGroesse(liste) {
  return (Array.isArray(liste) ? liste : []).reduce((s, e) => s + groesse(e), 0);
}

/**
 * Passt noch etwas hinein? Gibt einen Grund zurück, wenn nicht — der wird dem
 * Nutzer wörtlich gezeigt, deshalb steht er hier und nicht im Bildschirm.
 */
export function passtNoch(liste, neuer) {
  const vorhanden = Array.isArray(liste) ? liste : [];
  if (vorhanden.length >= MAX_ANZAHL) {
    return {
      ok: false,
      grund:
        `Es warten bereits ${MAX_ANZAHL} Fotos auf den Upload. ` +
        "Sobald Sie wieder Empfang haben, gehen sie von selbst raus.",
    };
  }
  if (gesamtGroesse(vorhanden) + groesse(neuer) > MAX_BYTES) {
    return {
      ok: false,
      grund:
        "Der Zwischenspeicher für Fotos ohne Netz ist voll. " +
        "Sobald Sie wieder Empfang haben, leert er sich von selbst.",
    };
  }
  return { ok: true };
}

/** Neuer Eintrag. Die Kennung kommt von außen, damit nichts Zufälliges nötig ist. */
export function eintragAnlegen(kennung, daten) {
  return {
    id: kennung,
    baustelleId: daten.baustelleId,
    phase: daten.phase,
    notiz: daten.notiz || "",
    base64: daten.base64,
    dateiname: daten.dateiname,
    // Wann das Foto AUFGENOMMEN wurde — nicht, wann es hochgeladen wird. Bei
    // einem Foto, das abends übertragen wird, sind das verschiedene Tage.
    aufgenommenAm: daten.aufgenommenAm || null,
    hochgeladenVon: daten.hochgeladenVon || null,
    versuche: 0,
    letzterFehler: null,
  };
}

export function entfernen(liste, id) {
  return (Array.isArray(liste) ? liste : []).filter((e) => e.id !== id);
}

/**
 * Der nächste Eintrag, der gesendet werden soll.
 *
 * Einträge, die schon mehrfach gescheitert sind, rutschen nach hinten — sonst
 * blockiert ein einziges kaputtes Foto die ganze Schlange, und alle anderen
 * bleiben liegen, obwohl das Netz längst wieder da ist.
 */
export function naechster(liste) {
  const offen = (Array.isArray(liste) ? liste : []).filter((e) => (e.versuche || 0) < 5);
  if (offen.length === 0) return null;
  return offen.reduce(
    (beste, e) => ((e.versuche || 0) < (beste.versuche || 0) ? e : beste),
    offen[0]
  );
}

/** Zählt einen Fehlversuch. Nach fünf Versuchen ruht der Eintrag. */
export function fehlschlagVermerken(liste, id, fehler) {
  return (Array.isArray(liste) ? liste : []).map((e) =>
    e.id === id
      ? { ...e, versuche: (e.versuche || 0) + 1, letzterFehler: String(fehler || "").slice(0, 200) }
      : e
  );
}

/** Kurzer Satz für die Oberfläche. Leer, wenn nichts wartet. */
export function standText(liste) {
  const l = Array.isArray(liste) ? liste : [];
  if (l.length === 0) return "";
  const steckengeblieben = l.filter((e) => (e.versuche || 0) >= 5).length;
  const wartend = l.length - steckengeblieben;
  const teile = [];
  if (wartend === 1) teile.push("1 Foto wartet auf Empfang");
  else if (wartend > 1) teile.push(`${wartend} Fotos warten auf Empfang`);
  if (steckengeblieben === 1) teile.push("1 Foto ließ sich nicht senden");
  else if (steckengeblieben > 1) teile.push(`${steckengeblieben} Fotos ließen sich nicht senden`);
  return teile.join(" · ");
}
