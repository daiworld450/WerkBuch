// ---------------------------------------------------------------------------
// nachtrag.js — Nachträge und Zulagen: rechnen, beschreiben, freigeben.
//
// Das ist der Kern dessen, was WerkBuch von plancraft, Craftnote und ToolTime
// unterscheidet: Eine zusätzliche Leistung wird nicht mündlich vereinbart und
// später bestritten, sondern einzeln aufgeschrieben, dem Kunden gezeigt und
// von ihm per Klick freigegeben — nachweisbar.
//
// Wie überall dort, wo es um Geld geht, wird AUSSCHLIESSLICH in ganzen Cent
// gerechnet. Fließkommazahlen sammeln Rundungsfehler an, die in Summen
// sichtbar werden und in einer Rechnung nichts zu suchen haben.
//
// Diese Datei ist frei von Firestore und React: sie lässt sich ohne Netz und
// ohne Anmeldung prüfen (siehe tests/nachtrag.test.cjs).
// ---------------------------------------------------------------------------

import { sha256Hex } from "./sha256";

export const UST_SATZ = 19;

// Der Weg eines Nachtrags. Weiter geht es nur vorwärts; "abgerechnet" ist das
// Ende. Ein abgelehnter Nachtrag bleibt abgelehnt — wer es doch machen will,
// legt einen neuen an. Das hält die Nachweiskette gerade.
export const STATUS = {
  offen: { label: "Offen", naechste: ["gesendet"] },
  gesendet: { label: "Beim Kunden", naechste: ["freigegeben", "abgelehnt", "offen"] },
  freigegeben: { label: "Freigegeben", naechste: ["abgerechnet"] },
  abgelehnt: { label: "Abgelehnt", naechste: [] },
  abgerechnet: { label: "Abgerechnet", naechste: [] },
};

export function statusLabel(status) {
  return STATUS[status]?.label || "Offen";
}

export function statusWechselErlaubt(von, nach) {
  return (STATUS[von]?.naechste || []).includes(nach);
}

export const EINHEITEN = ["m²", "lfd. m", "Stk.", "Std.", "pauschal"];

// Die Beschriftung des Freigabe-Knopfes. Sie steht hier und nicht im
// Bildschirm, weil sie WÖRTLICH im Nachweis auftaucht: Der Kunde muss belegbar
// gesehen haben, dass sein Klick etwas kostet. Ändert sich der Text, ändert
// sich der Wortlaut des Nachweises mit — und alte Nachweise behalten ihren
// eigenen, mitgespeicherten Wortlaut.
export const KNOPF_TEXT = "„Kostenpflichtig beauftragen“";
export const KNOPF_LABEL = "Kostenpflichtig beauftragen";

// ------------------------------------------------------------------ Geld

/**
 * Eingabe wie "45,50" oder "45.5" oder 45.5 → 4550 Cent.
 * Leeres oder unsinniges ergibt null (nicht 0) — "nichts eingetragen" ist
 * etwas anderes als "kostet nichts".
 */
export function centAus(eingabe) {
  if (eingabe == null) return null;
  if (typeof eingabe === "number") {
    return isFinite(eingabe) ? Math.round(eingabe * 100) : null;
  }
  const roh = String(eingabe).trim().replace(/\s|€/g, "").replace(",", ".");
  if (!roh) return null;
  const n = parseFloat(roh);
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

/** 4550 → "45,50 €" · 1234567 → "12.345,67 €" */
export function euroAusCent(cent) {
  if (cent == null || !isFinite(cent)) return "—";
  const negativ = cent < 0;
  const betrag = Math.abs(Math.round(cent));
  const ganze = String(Math.floor(betrag / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = String(betrag % 100).padStart(2, "0");
  return `${negativ ? "−" : ""}${ganze},${rest} €`;
}

/** Menge lesen: "8,5" → 8.5. Negatives wird zu 0. */
export function mengeAus(eingabe) {
  if (eingabe == null) return 0;
  if (typeof eingabe === "number") return isFinite(eingabe) && eingabe > 0 ? eingabe : 0;
  const n = parseFloat(String(eingabe).trim().replace(",", "."));
  return isFinite(n) && n > 0 ? n : 0;
}

// Kaufmännisch runden — bei 0,5 aufwärts, auch im Negativen symmetrisch.
function kaufmaennisch(wert) {
  return Math.sign(wert) * Math.round(Math.abs(wert));
}

/**
 * Die Rechnung eines Nachtrags.
 *
 *   netto  = Menge × Einzelpreis          (auf ganze Cent gerundet)
 *   USt    = netto × Satz / 100           (getrennt gerundet)
 *   brutto = netto + USt
 *
 * Bewusst NICHT brutto = round(netto × 1,19): so weicht die ausgewiesene
 * Steuer sonst um einen Cent von der Differenz ab, und genau das fällt in der
 * Buchhaltung auf.
 */
export function rechne({ menge, einzelpreisCent, ustSatz = UST_SATZ }) {
  const m = mengeAus(menge);
  const preis = einzelpreisCent == null ? 0 : Math.round(einzelpreisCent);
  const satz = isFinite(ustSatz) ? ustSatz : UST_SATZ;

  const nettoCent = kaufmaennisch(m * preis);
  const ustCent = kaufmaennisch((nettoCent * satz) / 100);

  return {
    menge: m,
    einzelpreisCent: preis,
    ustSatz: satz,
    nettoCent,
    ustCent,
    bruttoCent: nettoCent + ustCent,
  };
}

/** Summe über mehrere Nachträge, wahlweise nur die eines Status. */
export function summe(nachtraege, nurStatus) {
  const liste = Array.isArray(nachtraege) ? nachtraege : [];
  const gefiltert = nurStatus
    ? liste.filter((n) => (Array.isArray(nurStatus) ? nurStatus : [nurStatus]).includes(n?.status))
    : liste;
  return gefiltert.reduce(
    (s, n) => ({
      anzahl: s.anzahl + 1,
      nettoCent: s.nettoCent + (n?.nettoCent || 0),
      ustCent: s.ustCent + (n?.ustCent || 0),
      bruttoCent: s.bruttoCent + (n?.bruttoCent || 0),
    }),
    { anzahl: 0, nettoCent: 0, ustCent: 0, bruttoCent: 0 }
  );
}

/**
 * Was am Ende in Rechnung geht: Auftragssumme plus alle FREIGEGEBENEN
 * Nachträge. Offene und abgelehnte zählen nicht mit — ein Nachtrag, den
 * niemand freigegeben hat, ist keine Forderung.
 */
export function auftragssumme(angebotBetragCent, nachtraege) {
  const grund = angebotBetragCent == null ? null : Math.round(angebotBetragCent);
  const zusatz = summe(nachtraege, ["freigegeben", "abgerechnet"]);
  return {
    grundCent: grund,
    nachtraegeNettoCent: zusatz.nettoCent,
    anzahlFreigegeben: zusatz.anzahl,
    // Ohne hinterlegte Auftragssumme lässt sich keine Gesamtsumme bilden —
    // dann steht null da, nicht die Nachtragssumme allein.
    gesamtCent: grund == null ? null : grund + zusatz.nettoCent,
  };
}


// Wo die Freigabeseite liegt. Bewusst ein Abfrage-Anhängsel (?f=…) und kein
// eigener Pfad: GitHub Pages kennt keine Serverrouten, jede Unterseite würde
// mit einem 404 im Statuscode ausgeliefert. Ein Anhängsel an der bestehenden
// Adresse funktioniert überall und lässt sich per WhatsApp verschicken.
export const FREIGABE_BASIS = "https://daiworld450.github.io/WerkBuch/";

export function freigabeAdresse(schluessel) {
  return `${FREIGABE_BASIS}?f=${schluessel}`;
}

/** Liest den Schlüssel aus der aufgerufenen Adresse. Null, wenn keiner drinsteht. */
export function schluesselAusAdresse(adresse) {
  const roh = String(adresse || "");
  const treffer = /[?&]f=([A-Za-z0-9]{20,64})\b/.exec(roh);
  return treffer ? treffer[1] : null;
}

// ------------------------------------------------------------ Freigabe-Link

const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * Erzeugt einen Zugangs-Schlüssel für die Freigabeseite: 32 Zeichen aus einem
 * Alphabet ohne verwechselbare Zeichen (kein O/0, kein I/l/1).
 *
 * Bewusst KEIN Rückfall auf Math.random: Dieser Schlüssel ist der einzige
 * Schutz der Freigabeseite. Eine schwache Zufallsquelle wäre hier keine
 * Bequemlichkeit, sondern ein stilles Loch. Fehlt die Quelle, bricht die
 * Funktion mit einer klaren Meldung ab.
 */
export function schluesselErzeugen(zufallsquelle) {
  const quelle =
    zufallsquelle ||
    (typeof globalThis !== "undefined" &&
      globalThis.crypto &&
      typeof globalThis.crypto.getRandomValues === "function" &&
      ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n))));

  if (!quelle) {
    throw new Error(
      "Auf diesem Gerät steht keine sichere Zufallsquelle bereit. " +
        "Der Freigabe-Link kann deshalb nicht erzeugt werden."
    );
  }

  const bytes = quelle(32);
  let schluessel = "";
  for (let i = 0; i < 32; i++) schluessel += ZEICHEN[bytes[i] % ZEICHEN.length];
  return schluessel;
}

/**
 * Der eingefrorene Stand, den der Kunde zu sehen bekommt. Alles, was auf der
 * Freigabeseite steht, kommt AUS DIESEM OBJEKT — die Seite liest nichts aus
 * der Baustelle nach. Zwei Gründe: der Kunde bekommt keinen Zugriff auf
 * Betriebsdaten, und was er gesehen hat, bleibt nachvollziehbar.
 */
export function anzeigeAus({ betrieb, baustelleName, kundeName, nachtrag, fotos }) {
  const r = rechne(nachtrag || {});
  return {
    betrieb: betrieb || "Berisa Bau",
    baustelleName: baustelleName || "",
    kundeName: kundeName || "",
    nummer: nachtrag?.nummer || "",
    titel: nachtrag?.titel || "",
    beschreibung: nachtrag?.beschreibung || "",
    menge: r.menge,
    einheit: nachtrag?.einheit || "pauschal",
    einzelpreisCent: r.einzelpreisCent,
    nettoCent: r.nettoCent,
    ustSatz: r.ustSatz,
    ustCent: r.ustCent,
    bruttoCent: r.bruttoCent,
    fotos: (fotos || []).map((f) => (typeof f === "string" ? f : f?.url)).filter(Boolean),
  };
}

/**
 * Der Text, den der Kunde tatsächlich vor sich hat — Wort für Wort.
 *
 * Er wird bei der Freigabe MITGESPEICHERT, nicht bloß als Verweis auf eine
 * Vorlage. Das ist der Unterschied zwischen einem Nachweis und einer
 * Behauptung: Ändert sich die Vorlage später, ändert sich der Beleg nicht.
 */
export function wortlaut(anzeige) {
  const a = anzeige || {};
  const zeilen = [
    `${a.betrieb} — Nachtrag ${a.nummer}`,
    a.baustelleName ? `Baustelle: ${a.baustelleName}` : null,
    a.kundeName ? `Auftraggeber: ${a.kundeName}` : null,
    "",
    a.titel,
    a.beschreibung || null,
    "",
    `Menge: ${String(a.menge).replace(".", ",")} ${a.einheit}`,
    `Einzelpreis: ${euroAusCent(a.einzelpreisCent)} netto je ${a.einheit}`,
    `Summe netto: ${euroAusCent(a.nettoCent)}`,
    `zzgl. ${a.ustSatz} % Umsatzsteuer: ${euroAusCent(a.ustCent)}`,
    `Gesamtbetrag: ${euroAusCent(a.bruttoCent)} brutto`,
    "",
    `Mit dem Klick auf ${KNOPF_TEXT} beauftrage ich ${a.betrieb} verbindlich ` +
      "mit der oben beschriebenen zusätzlichen Leistung zum Gesamtbetrag von " +
      `${euroAusCent(a.bruttoCent)} brutto (inklusive ${a.ustSatz} % ` +
      "Umsatzsteuer). Der Betrag kommt zur vereinbarten Auftragssumme hinzu.",
  ];
  return zeilen.filter((z) => z !== null).join("\n");
}

/**
 * Der Abdruck über den gezeigten Stand. Er wird beim Erzeugen des Links
 * gebildet und bei der Freigabe erneut geprüft (in den Firestore-Regeln).
 *
 * Die Reihenfolge der Felder ist hier fest verdrahtet und nicht aus einem
 * Objekt abgeleitet — sonst hinge das Ergebnis an der Reihenfolge, in der
 * JavaScript zufällig die Schlüssel ausgibt, und ein und derselbe Stand
 * ergäbe auf zwei Geräten zwei verschiedene Abdrücke.
 */
export function abdruck(anzeige) {
  const a = anzeige || {};
  const teile = [
    a.betrieb, a.baustelleName, a.kundeName, a.nummer, a.titel, a.beschreibung,
    String(a.menge), a.einheit,
    String(a.einzelpreisCent), String(a.nettoCent), String(a.ustSatz),
    String(a.ustCent), String(a.bruttoCent),
    (a.fotos || []).join("|"),
  ];
  return sha256Hex(teile.map((t) => String(t == null ? "" : t)).join("␟"));
}

/** Gültigkeitsende eines Links: 30 Tage ab jetzt. */
export function gueltigBis(ab = new Date(), tage = 30) {
  const d = new Date(ab);
  d.setDate(d.getDate() + tage);
  return d;
}

/** Nächste freie Nachtragsnummer je Baustelle: NT-1, NT-2, … */
export function naechsteNummer(vorhandene) {
  const zahlen = (Array.isArray(vorhandene) ? vorhandene : [])
    .map((n) => {
      const treffer = /^NT-(\d+)$/.exec(String(n?.nummer || ""));
      return treffer ? Number(treffer[1]) : 0;
    })
    .filter((z) => z > 0);
  return `NT-${(zahlen.length ? Math.max(...zahlen) : 0) + 1}`;
}

export default {
  UST_SATZ, STATUS, EINHEITEN, KNOPF_TEXT, KNOPF_LABEL,
  statusLabel, statusWechselErlaubt,
  centAus, euroAusCent, mengeAus, rechne, summe, auftragssumme,
  schluesselErzeugen, anzeigeAus, wortlaut, abdruck, gueltigBis, naechsteNummer,
  FREIGABE_BASIS, freigabeAdresse, schluesselAusAdresse,
};
