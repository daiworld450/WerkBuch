// ---------------------------------------------------------------------------
// kalkulation.js — Nachkalkulation einer Baustelle.
//
// AUSSCHLIESSLICH reine Funktionen: kein Firestore, kein React, kein Zugriff
// auf irgendetwas außerhalb der übergebenen Argumente. Dadurch lässt sich die
// Rechnung ohne Netz und ohne Anmeldung prüfen, und mehrere Bildschirme
// (KalkulationScreen, AuswertungScreen, StundenScreen) rechnen garantiert
// dasselbe.
//
// Grundformel:
//   personalkosten = Σ (stunden × stundensatzKosten)
//   materialkosten = Σ (menge × einzelpreis)
//   sonstigeKosten = Σ betrag
//   gesamtkosten   = personal + material + sonstige
//   gewinn         = umsatz − gesamtkosten     (null, wenn kein Umsatz gesetzt)
//
// Wichtig: "kein Umsatz gesetzt" ist NICHT dasselbe wie "Umsatz 0". Eine noch
// nicht kalkulierte Baustelle liefert gewinn === null und darf nirgends als
// 0 € Gewinn in einen Durchschnitt einfließen — sonst sähe jede Auswertung
// besser oder schlechter aus, als sie ist.
// ---------------------------------------------------------------------------

import { zahl } from "./berechnung";

// Wie zahl(), aber unterscheidet "nicht gesetzt" (null) von "null Euro" (0).
// Leerer String, null, undefined und Unfug ergeben null.
export function zahlOderNull(wert) {
  if (wert == null) return null;
  if (typeof wert === "number") return isFinite(wert) ? wert : null;
  const roh = String(wert).trim();
  if (!roh) return null;
  const n = parseFloat(roh.replace(",", "."));
  return isFinite(n) ? n : null;
}

// "08:00" -> 8.0 (Stunden seit Mitternacht). Ungültiges ergibt null.
export function zeitInStunden(zeit) {
  if (!zeit) return null;
  const treffer = String(zeit).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!treffer) return null;
  const std = Number(treffer[1]);
  const min = Number(treffer[2]);
  if (!isFinite(std) || !isFinite(min)) return null;
  if (std < 0 || std > 23 || min < 0 || min > 59) return null;
  return std + min / 60;
}

// Stundenzahl aus "von" und "bis". Liegt "bis" vor "von", wird über
// Mitternacht hinweg gerechnet (Spätschicht) statt eine negative Zahl zu
// liefern. Das Ergebnis ist nur ein VORSCHLAG — Pausen zieht der Nutzer
// selbst ab, indem er die Stundenzahl überschreibt.
export function stundenAusZeit(vonZeit, bisZeit) {
  const von = zeitInStunden(vonZeit);
  const bis = zeitInStunden(bisZeit);
  if (von == null || bis == null) return null;
  let dauer = bis - von;
  if (dauer < 0) dauer += 24;
  return Math.round(dauer * 100) / 100;
}

// Σ (stunden × stundensatzKosten). Der Satz steckt im Stunden-Eintrag selbst
// (bei der Erfassung eingefroren) — nicht in der Person. Ändert der Inhaber
// später den Satz, bleiben abgeschlossene Baustellen dadurch unverändert.
export function personalkosten(stunden) {
  const liste = Array.isArray(stunden) ? stunden : [];
  return liste.reduce(
    (summe, e) => summe + zahl(e?.stunden) * zahl(e?.stundensatzKosten),
    0
  );
}

export function stundenSumme(stunden) {
  const liste = Array.isArray(stunden) ? stunden : [];
  return liste.reduce((summe, e) => summe + zahl(e?.stunden), 0);
}

// Σ (menge × einzelpreis) aus dem bestehenden material-Unterordner.
// Positionen ohne Einzelpreis zählen mit 0 € — sie sind erfasst, aber noch
// nicht bepreist.
export function materialkosten(material) {
  const liste = Array.isArray(material) ? material : [];
  return liste.reduce((summe, m) => {
    const preis = zahlOderNull(m?.einzelpreis);
    if (preis == null) return summe;
    return summe + zahl(m?.menge) * preis;
  }, 0);
}

export function sonstigeKosten(kosten) {
  const liste = Array.isArray(kosten) ? kosten : [];
  return liste.reduce((summe, k) => summe + zahl(k?.betrag), 0);
}

// Aufteilung der Stunden nach Person — für die Fußzeile im StundenScreen.
// Rückgabe absteigend nach Stunden sortiert.
export function jePerson(stunden) {
  const liste = Array.isArray(stunden) ? stunden : [];
  const karte = new Map();
  for (const e of liste) {
    const id = e?.personId || "ohne";
    const vorhanden = karte.get(id) || {
      personId: id,
      personName: e?.personName || "Ohne Person",
      stunden: 0,
      kosten: 0,
    };
    vorhanden.stunden += zahl(e?.stunden);
    vorhanden.kosten += zahl(e?.stunden) * zahl(e?.stundensatzKosten);
    if (!vorhanden.personName && e?.personName) vorhanden.personName = e.personName;
    karte.set(id, vorhanden);
  }
  return Array.from(karte.values()).sort((a, b) => b.stunden - a.stunden);
}

// Die vollständige Nachkalkulation EINER Baustelle.
//
//   kalkuliere({ umsatz, budget, stunden, material, kosten })
//
// umsatz/budget dürfen als Zahl, als String ("12500,50") oder als null
// kommen. Ist umsatz nicht gesetzt, sind gewinn, marge und ertragProStunde
// null — nicht 0.
export function kalkuliere(eingabe) {
  const e = eingabe || {};
  const umsatz = zahlOderNull(e.umsatz);
  const budget = zahlOderNull(e.budget);

  const personal = personalkosten(e.stunden);
  const material = materialkosten(e.material);
  const sonstige = sonstigeKosten(e.kosten);
  const gesamtkosten = personal + material + sonstige;
  const stundenGesamt = stundenSumme(e.stunden);

  const gewinn = umsatz == null ? null : umsatz - gesamtkosten;

  // Marge nur bei einem Umsatz ungleich 0 — sonst wäre sie eine Division
  // durch null und der Wert ohnehin ohne Aussage.
  const marge = umsatz != null && umsatz !== 0 ? gewinn / umsatz : null;

  const ertragProStunde =
    gewinn != null && stundenGesamt > 0 ? gewinn / stundenGesamt : null;

  const budgetAusnutzung =
    budget != null && budget !== 0 ? gesamtkosten / budget : null;

  return {
    umsatz,
    budget,
    personalkosten: personal,
    materialkosten: material,
    sonstigeKosten: sonstige,
    gesamtkosten,
    gewinn,
    marge,
    stundenGesamt,
    ertragProStunde,
    budgetAusnutzung,
    // Zentrale Unterscheidung für jede Auswertung: ist diese Baustelle
    // überhaupt kalkuliert? Nur dann darf sie in Durchschnitte einfließen.
    kalkuliert: umsatz != null,
  };
}

// Ampelstufe für die Budget-Ausnutzung.
// grün unter 80 %, gelb 80–100 %, rot darüber.
export function budgetAmpel(ausnutzung) {
  if (ausnutzung == null || !isFinite(ausnutzung)) return null;
  if (ausnutzung < 0.8) return "gruen";
  if (ausnutzung <= 1) return "gelb";
  return "rot";
}

// Ort einer Baustelle für die Gruppierung in der Auswertung.
// Die Adresse ist bei den importierten Baustellen oft leer — dann tritt der
// Baustellenname an ihre Stelle, damit die Gruppierung trotzdem etwas zeigt
// statt alles in einen Topf "unbekannt" zu werfen.
export function ortAus(baustelle) {
  const b = baustelle || {};
  const adresse = String(b.adresse || "").trim();
  if (!adresse) {
    const name = String(b.name || "").trim();
    return name || "Ohne Ort";
  }
  // "Musterstraße 12, 45127 Essen" / "45127 Essen" -> "Essen"
  const mitPlz = adresse.match(/\b\d{5}\b[ \t]+([^,\n]+)/);
  if (mitPlz && mitPlz[1].trim()) return mitPlz[1].trim();
  // "Musterstraße 12, Essen" -> "Essen"
  const teile = adresse
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (teile.length > 1) {
    const letzter = teile[teile.length - 1].replace(/^\d{4,5}\s*/, "").trim();
    if (letzter) return letzter;
  }
  return adresse;
}

// Kopfzahlen über mehrere Baustellen.
//
//   zeilen = [{ baustelle, erg }]  mit erg aus kalkuliere()
//
// Umsatz, Gewinn, Marge und €/Stunde beziehen sich AUSSCHLIESSLICH auf die
// kalkulierten Baustellen. Kosten und Stunden der nicht kalkulierten werden
// getrennt ausgewiesen (offeneKosten/offeneStunden) — sie sind echt
// angefallen, gehören aber in keine Gewinnrechnung, solange kein Umsatz
// hinterlegt ist.
export function summiereBaustellen(zeilen) {
  const liste = Array.isArray(zeilen) ? zeilen : [];
  const kalkulierte = liste.filter((z) => z?.erg?.kalkuliert);
  const offene = liste.filter((z) => !z?.erg?.kalkuliert);

  const umsatz = kalkulierte.reduce((s, z) => s + zahl(z.erg.umsatz), 0);
  const kosten = kalkulierte.reduce((s, z) => s + zahl(z.erg.gesamtkosten), 0);
  const stunden = kalkulierte.reduce((s, z) => s + zahl(z.erg.stundenGesamt), 0);
  const gewinn = umsatz - kosten;

  return {
    anzahl: liste.length,
    anzahlKalkuliert: kalkulierte.length,
    anzahlOffen: offene.length,
    umsatz,
    kosten,
    gewinn,
    // Gewichtete Gesamtmarge (Gewinn aller ÷ Umsatz aller) statt Mittelwert
    // der Einzelmargen — sonst zöge eine winzige Baustelle mit Traummarge
    // die Zahl hoch, ohne dass Geld dahintersteht.
    marge: umsatz !== 0 ? gewinn / umsatz : null,
    stunden,
    ertragProStunde: stunden > 0 ? gewinn / stunden : null,
    offeneKosten: offene.reduce((s, z) => s + zahl(z?.erg?.gesamtkosten), 0),
    offeneStunden: offene.reduce((s, z) => s + zahl(z?.erg?.stundenGesamt), 0),
  };
}

export default {
  zahlOderNull,
  zeitInStunden,
  stundenAusZeit,
  personalkosten,
  stundenSumme,
  materialkosten,
  sonstigeKosten,
  jePerson,
  kalkuliere,
  budgetAmpel,
  ortAus,
  summiereBaustellen,
};
