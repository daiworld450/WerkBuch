// ---------------------------------------------------------------------------
// zulagen.js — Preisberechnung für die vom Kunden zusätzlich gewählten
// Leistungen (Spezifikation Kapitel 6).
//
// Zwei Regeln, die hier den Ausschlag geben:
//
//  1. Gerechnet wird ausschließlich in ganzen Cent. Kommazahlen sammeln
//     Rundungsfehler an, die in Summen sichtbar werden.
//  2. Die Umsatzsteuer wird JE STEUERSATZ getrennt gerundet, nicht auf der
//     Gesamtsumme (Spezifikation 6.3). Sonst weicht das angezeigte Ergebnis um
//     einzelne Cent von der Buchhaltung ab.
// ---------------------------------------------------------------------------

import { GRENZEN } from "./config.js";

// Kaufmännisch runden: 0,5 Cent geht auf. Math.round rundet bei negativen
// Zahlen zur Null hin, deshalb hier über den Betrag und mit Vorzeichen zurück.
function kaufmaennisch(wert) {
  return Math.sign(wert) * Math.round(Math.abs(wert));
}

// Ermittelt den Stückpreis für eine Menge. Ohne Staffeln gilt der Grundpreis.
// Staffeln gelten für die GESAMTE Menge, nicht gestuft je Stück — das ist für
// den Kunden nachvollziehbarer ("ab 4 Stück kostet jedes 15 €").
export function stueckpreisCent(zulage, menge) {
  const staffeln = zulage.staffeln || [];
  for (const staffel of staffeln) {
    const untenPasst = menge >= staffel.abMenge;
    const obenPasst = staffel.bisMenge == null || menge <= staffel.bisMenge;
    if (untenPasst && obenPasst) return staffel.preisCent;
  }
  return zulage.preisCent;
}

// Berechnet eine einzelne Position.
// Der Katalogpreis ist ein BRUTTO-Preis: gegenüber Verbrauchern sind
// Gesamtpreise inklusive Umsatzsteuer anzugeben (Preisangabenverordnung,
// Spezifikation 13.5). Netto und Steuer werden daraus herausgerechnet.
export function positionRechnen(zulage, menge) {
  const anzahl = Math.max(0, Math.floor(Number(menge) || 0));
  const einzelBruttoCent = stueckpreisCent(zulage, anzahl);
  const bruttoCent = einzelBruttoCent * anzahl;
  const satz = zulage.ustSatz || 0;
  const nettoCent = kaufmaennisch(bruttoCent / (1 + satz / 100));

  return {
    sku: zulage.sku,
    name: zulage.name,
    menge: anzahl,
    einheit: zulage.einheit,
    einzelBruttoCent,
    bruttoCent,
    nettoCent,
    ustSatz: satz,
    ustCent: bruttoCent - nettoCent,
    gibtGuthaben: (zulage.gibtGuthaben || 0) * anzahl,
    brauchtPruefung: !!zulage.braucht_pruefung,
  };
}

// Fasst mehrere Positionen zu einer Summe zusammen.
// auswahl: [{ sku, menge }], katalog: Liste der Katalog-Einträge
export function summeRechnen(auswahl, katalog) {
  const nachSku = new Map(katalog.map((z) => [z.sku, z]));
  const positionen = [];

  for (const eintrag of auswahl || []) {
    const zulage = nachSku.get(eintrag.sku);
    // Unbekannte oder abgeschaltete Einträge werden still übergangen: der
    // Katalog kann sich ändern, während ein Kunde die Seite offen hat.
    if (!zulage || !zulage.aktiv) continue;
    const menge = Math.min(
      Math.max(0, Math.floor(Number(eintrag.menge) || 0)),
      zulage.maxMengeJeBestellung || 99
    );
    if (menge <= 0) continue;
    positionen.push(positionRechnen(zulage, menge));
  }

  // Umsatzsteuer je Satz getrennt aufsummieren (Spezifikation 6.3).
  const ustJeSatz = {};
  for (const p of positionen) {
    ustJeSatz[p.ustSatz] = (ustJeSatz[p.ustSatz] || 0) + p.ustCent;
  }

  const nettoCent = positionen.reduce((s, p) => s + p.nettoCent, 0);
  const ustCent = Object.values(ustJeSatz).reduce((s, w) => s + w, 0);

  return {
    positionen,
    nettoCent,
    ustJeSatz,
    ustCent,
    bruttoCent: nettoCent + ustCent,
    guthaben: positionen.reduce((s, p) => s + p.gibtGuthaben, 0),
    brauchtPruefung: positionen.some((p) => p.brauchtPruefung),
  };
}

// Entscheidet, ob eine Bestellung direkt bestätigt werden darf oder dem
// Betrieb zur persönlichen Prüfung vorgelegt wird (Spezifikation 6.4).
// Die Bestellung wird nie abgelehnt — nur angehalten.
export function pruefungNoetig(summe, bereitsFreigegeben) {
  const anzahlGesamt =
    (bereitsFreigegeben?.anzahl || 0) + summe.positionen.reduce((s, p) => s + p.menge, 0);
  const summeGesamt = (bereitsFreigegeben?.bruttoCent || 0) + summe.bruttoCent;

  if (summe.brauchtPruefung) return { noetig: true, grund: "sonderwunsch" };
  if (anzahlGesamt > GRENZEN.zulagenJeProjektOhnePruefung) {
    return { noetig: true, grund: "anzahl" };
  }
  if (summeGesamt > GRENZEN.zulagenSummeCentOhnePruefung) {
    return { noetig: true, grund: "summe" };
  }
  return { noetig: false };
}

export default { stueckpreisCent, positionRechnen, summeRechnen, pruefungNoetig };
