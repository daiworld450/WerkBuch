// ---------------------------------------------------------------------------
// Prüfungen der Nachkalkulation.
//
// Diese Rechnung entscheidet, ob eine Baustelle Geld gebracht hat. Ein Fehler
// hier fällt nicht auf — er sieht bloß nach einem anderen Ergebnis aus. Deshalb
// stehen hier vor allem die Fälle, in denen eine naheliegende Vereinfachung
// falsch wäre.
// ---------------------------------------------------------------------------

require("./laden.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
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
} = require("../src/util/kalkulation.js");

// ------------------------------------------------------------- Zahlenwerte

test("Nicht gesetzt und null Euro sind zweierlei", () => {
  assert.equal(zahlOderNull(null), null);
  assert.equal(zahlOderNull(""), null);
  assert.equal(zahlOderNull("   "), null);
  assert.equal(zahlOderNull(undefined), null);
  assert.equal(zahlOderNull(0), 0);
  assert.equal(zahlOderNull("0"), 0);
});

test("Deutsche Kommazahlen werden gelesen", () => {
  assert.equal(zahlOderNull("12500,50"), 12500.5);
  assert.equal(zahlOderNull("1,5"), 1.5);
});

test("Unfug ergibt null, nicht null Euro", () => {
  assert.equal(zahlOderNull("abc"), null);
  assert.equal(zahlOderNull(NaN), null);
  assert.equal(zahlOderNull(Infinity), null);
});

// ---------------------------------------------------------------- Uhrzeiten

test("Uhrzeit wird in Stunden umgerechnet", () => {
  assert.equal(zeitInStunden("08:00"), 8);
  assert.equal(zeitInStunden("08:30"), 8.5);
  assert.equal(zeitInStunden("00:15"), 0.25);
});

test("Unmögliche Uhrzeiten werden abgewiesen", () => {
  assert.equal(zeitInStunden("24:00"), null);
  assert.equal(zeitInStunden("08:60"), null);
  assert.equal(zeitInStunden("8"), null);
  assert.equal(zeitInStunden(""), null);
});

test("Eine Schicht über Mitternacht ergibt keine negative Dauer", () => {
  assert.equal(stundenAusZeit("22:00", "02:00"), 4);
  assert.equal(stundenAusZeit("07:00", "16:30"), 9.5);
});

// ------------------------------------------------------------------- Kosten

test("Personalkosten nehmen den eingefrorenen Satz aus dem Eintrag", () => {
  const stunden = [
    { stunden: 8, stundensatzKosten: 25 },
    { stunden: 4, stundensatzKosten: 30 },
  ];
  assert.equal(personalkosten(stunden), 8 * 25 + 4 * 30);
  assert.equal(stundenSumme(stunden), 12);
});

test("Ein später geänderter Personen-Stundensatz verändert alte Einträge nicht", () => {
  // Genau dafür wird der Satz beim Erfassen kopiert: Der Eintrag trägt seinen
  // eigenen Satz, unabhängig davon, was heute in "personen" steht.
  const alt = [{ stunden: 10, stundensatzKosten: 22 }];
  assert.equal(personalkosten(alt), 220);
});

test("Material ohne Einzelpreis zählt nicht mit", () => {
  const material = [
    { menge: 10, einzelpreis: 12.5 },
    { menge: 5, einzelpreis: null },   // erfasst, aber noch nicht bepreist
    { menge: 3 },
  ];
  assert.equal(materialkosten(material), 125);
});

test("Leere Listen ergeben null Euro, keinen Absturz", () => {
  assert.equal(personalkosten(null), 0);
  assert.equal(materialkosten(undefined), 0);
  assert.equal(sonstigeKosten([]), 0);
  assert.equal(stundenSumme("keine Liste"), 0);
});

test("Stunden werden je Person zusammengefasst, absteigend sortiert", () => {
  const erg = jePerson([
    { personId: "a", personName: "Damir", stunden: 4, stundensatzKosten: 25 },
    { personId: "b", personName: "Seba", stunden: 9, stundensatzKosten: 20 },
    { personId: "a", personName: "Damir", stunden: 3, stundensatzKosten: 25 },
  ]);
  assert.equal(erg.length, 2);
  assert.equal(erg[0].personName, "Seba");
  assert.equal(erg[0].stunden, 9);
  assert.equal(erg[1].stunden, 7);
  assert.equal(erg[1].kosten, 175);
});

// ------------------------------------------------------------- Kalkulation

test("Vollständige Kalkulation einer abgeschlossenen Baustelle", () => {
  const erg = kalkuliere({
    umsatz: 12000,
    budget: 9000,
    stunden: [{ stunden: 100, stundensatzKosten: 28 }],   // 2.800
    material: [{ menge: 40, einzelpreis: 45 }],           // 1.800
    kosten: [{ betrag: 400 }],                            //   400
  });
  assert.equal(erg.gesamtkosten, 5000);
  assert.equal(erg.gewinn, 7000);
  assert.equal(erg.marge, 7000 / 12000);
  assert.equal(erg.stundenGesamt, 100);
  assert.equal(erg.ertragProStunde, 70);
  assert.equal(erg.budgetAusnutzung, 5000 / 9000);
  assert.equal(erg.kalkuliert, true);
});

test("Ohne Umsatz ist der Gewinn nicht bekannt — und nicht null Euro", () => {
  const erg = kalkuliere({
    stunden: [{ stunden: 10, stundensatzKosten: 30 }],
    material: [],
    kosten: [],
  });
  assert.equal(erg.gesamtkosten, 300);
  assert.equal(erg.gewinn, null);
  assert.equal(erg.marge, null);
  assert.equal(erg.ertragProStunde, null);
  assert.equal(erg.kalkuliert, false);
});

test("Umsatz null Euro ist eine echte Angabe und ergibt einen Verlust", () => {
  const erg = kalkuliere({ umsatz: 0, kosten: [{ betrag: 500 }] });
  assert.equal(erg.gewinn, -500);
  assert.equal(erg.kalkuliert, true);
  assert.equal(erg.marge, null, "Marge bei Umsatz 0 wäre eine Division durch null");
});

test("Ein Verlust wird als Verlust ausgewiesen", () => {
  const erg = kalkuliere({ umsatz: 3000, kosten: [{ betrag: 4200 }] });
  assert.equal(erg.gewinn, -1200);
  assert.ok(erg.marge < 0);
});

test("Budget-Ampel", () => {
  assert.equal(budgetAmpel(0.5), "gruen");
  assert.equal(budgetAmpel(0.79), "gruen");
  assert.equal(budgetAmpel(0.8), "gelb");
  assert.equal(budgetAmpel(1), "gelb");
  assert.equal(budgetAmpel(1.01), "rot");
  assert.equal(budgetAmpel(null), null);
});

// ------------------------------------------------------------------ Ortsbezug

test("Ort wird aus der Adresse gelesen", () => {
  assert.equal(ortAus({ adresse: "Musterstraße 12, 45127 Essen" }), "Essen");
  assert.equal(ortAus({ adresse: "45468 Mülheim an der Ruhr" }), "Mülheim an der Ruhr");
  assert.equal(ortAus({ adresse: "Musterstraße 12, Essen" }), "Essen");
});

test("Ohne Adresse tritt der Baustellenname an ihre Stelle", () => {
  assert.equal(ortAus({ adresse: "", name: "Bad Familie Müller" }), "Bad Familie Müller");
  assert.equal(ortAus({}), "Ohne Ort");
});

// ------------------------------------------------------ Summe über Baustellen

test("Nicht kalkulierte Baustellen bleiben aus Umsatz und Gewinn heraus", () => {
  const zeilen = [
    { baustelle: { name: "A" }, erg: kalkuliere({ umsatz: 10000, kosten: [{ betrag: 6000 }] }) },
    { baustelle: { name: "B" }, erg: kalkuliere({ umsatz: 5000, kosten: [{ betrag: 2000 }] }) },
    // noch offen: Kosten sind echt angefallen, gehören aber in keine Gewinnrechnung
    { baustelle: { name: "C" }, erg: kalkuliere({ kosten: [{ betrag: 3000 }],
                                                  stunden: [{ stunden: 20, stundensatzKosten: 25 }] }) },
  ];
  const s = summiereBaustellen(zeilen);
  assert.equal(s.anzahl, 3);
  assert.equal(s.anzahlKalkuliert, 2);
  assert.equal(s.anzahlOffen, 1);
  assert.equal(s.umsatz, 15000);
  assert.equal(s.kosten, 8000);
  assert.equal(s.gewinn, 7000);
  assert.equal(s.offeneKosten, 3500, "3.000 sonstige + 500 Personal der offenen Baustelle");
  assert.equal(s.offeneStunden, 20);
});

test("Die Gesamtmarge ist gewichtet, nicht der Mittelwert der Einzelmargen", () => {
  // Kleine Baustelle mit Traummarge, große mit magerer Marge.
  const zeilen = [
    { erg: kalkuliere({ umsatz: 100, kosten: [{ betrag: 10 }] }) },      // 90 %
    { erg: kalkuliere({ umsatz: 100000, kosten: [{ betrag: 95000 }] }) }, //  5 %
  ];
  const s = summiereBaustellen(zeilen);
  const mittelwertWaereFalsch = (0.9 + 0.05) / 2;
  assert.equal(s.marge, 5090 / 100100);
  assert.ok(s.marge < 0.1, "gewichtet liegt die Marge nahe bei 5 %");
  assert.ok(Math.abs(s.marge - mittelwertWaereFalsch) > 0.4);
});

test("Ohne Baustellen bleibt alles bei null, ohne Absturz", () => {
  const s = summiereBaustellen([]);
  assert.equal(s.anzahl, 0);
  assert.equal(s.umsatz, 0);
  assert.equal(s.marge, null);
  assert.equal(s.ertragProStunde, null);
});
