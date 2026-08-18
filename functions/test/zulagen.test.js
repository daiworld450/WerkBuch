// ---------------------------------------------------------------------------
// Tests der Preis- und Grenzlogik (Spezifikation Kapitel 6 und 17).
// Aufruf: npm test  (im Ordner functions/)
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import { stueckpreisCent, positionRechnen, summeRechnen, pruefungNoetig } from "../src/zulagen.js";
import { ZULAGEN_KATALOG, GRENZEN } from "../src/config.js";

const katalog = ZULAGEN_KATALOG;
const visExtra = katalog.find((z) => z.sku === "VIS_EXTRA");

test("Staffelpreis greift ab der vierten Visualisierung", () => {
  assert.equal(stueckpreisCent(visExtra, 1), 1900);
  assert.equal(stueckpreisCent(visExtra, 3), 1900);
  assert.equal(stueckpreisCent(visExtra, 4), 1500);
  assert.equal(stueckpreisCent(visExtra, 10), 1500);
  assert.equal(stueckpreisCent(visExtra, 11), 1200);
});

test("Umsatzsteuer wird korrekt aus dem Bruttopreis herausgerechnet", () => {
  // 19,00 € brutto bei 19 % → 15,97 € netto + 3,03 € Steuer
  const p = positionRechnen(visExtra, 1);
  assert.equal(p.bruttoCent, 1900);
  assert.equal(p.nettoCent, 1597);
  assert.equal(p.ustCent, 303);
  assert.equal(p.nettoCent + p.ustCent, p.bruttoCent);
});

test("Summe bleibt in sich stimmig — netto plus Steuer ergibt brutto", () => {
  const summe = summeRechnen(
    [
      { sku: "VIS_EXTRA", menge: 4 },
      { sku: "PRINT_SET", menge: 1 },
    ],
    katalog
  );
  assert.equal(summe.nettoCent + summe.ustCent, summe.bruttoCent);
  // 4 × 15,00 € (Staffel) + 24,00 € = 84,00 €
  assert.equal(summe.bruttoCent, 8400);
});

test("Guthaben wird über alle Positionen aufsummiert", () => {
  const summe = summeRechnen(
    [
      { sku: "VIS_EXTRA", menge: 2 }, // 2 × 1 Guthaben
      { sku: "ROOM_EXTRA", menge: 1 }, // 1 × 2 Guthaben
    ],
    katalog
  );
  assert.equal(summe.guthaben, 4);
});

test("Menge wird auf die erlaubte Höchstmenge begrenzt", () => {
  const summe = summeRechnen([{ sku: "EXPRESS_24H", menge: 99 }], katalog);
  assert.equal(summe.positionen[0].menge, 1); // maxMengeJeBestellung = 1
});

test("Unbekannte oder abgeschaltete Einträge werden übergangen", () => {
  const summe = summeRechnen([{ sku: "GIBT_ES_NICHT", menge: 3 }], katalog);
  assert.equal(summe.positionen.length, 0);
  assert.equal(summe.bruttoCent, 0);
});

test("Negative oder unsinnige Mengen erzeugen keine Position", () => {
  const summe = summeRechnen(
    [
      { sku: "VIS_EXTRA", menge: -5 },
      { sku: "VIS_EXTRA", menge: "abc" },
    ],
    katalog
  );
  assert.equal(summe.positionen.length, 0);
});

// -------------------------------------------------- Grenzen (Spezifikation 6.4)

test("Sonderwunsch verlangt immer eine persönliche Prüfung", () => {
  const summe = summeRechnen([{ sku: "STYLE_INDIV", menge: 1 }], katalog);
  assert.equal(pruefungNoetig(summe, { anzahl: 0, bruttoCent: 0 }).noetig, true);
  assert.equal(pruefungNoetig(summe, { anzahl: 0, bruttoCent: 0 }).grund, "sonderwunsch");
});

test("Bestellung unterhalb aller Grenzen läuft ohne Prüfung durch", () => {
  const summe = summeRechnen([{ sku: "VIS_EXTRA", menge: 2 }], katalog);
  assert.equal(pruefungNoetig(summe, { anzahl: 0, bruttoCent: 0 }).noetig, false);
});

test("Überschreiten der Summengrenze löst eine Prüfung aus", () => {
  // Spezifikation Kapitel 17: bei bereits 300 € freigegebenen Zulagen muss
  // jede weitere Bestellung zur Prüfung gehen.
  const summe = summeRechnen([{ sku: "VIS_EXTRA", menge: 1 }], katalog);
  const ergebnis = pruefungNoetig(summe, {
    anzahl: 1,
    bruttoCent: GRENZEN.zulagenSummeCentOhnePruefung,
  });
  assert.equal(ergebnis.noetig, true);
  assert.equal(ergebnis.grund, "summe");
});

test("Überschreiten der Stückzahlgrenze löst eine Prüfung aus", () => {
  const summe = summeRechnen([{ sku: "VIS_EXTRA", menge: 1 }], katalog);
  const ergebnis = pruefungNoetig(summe, {
    anzahl: GRENZEN.zulagenJeProjektOhnePruefung,
    bruttoCent: 100,
  });
  assert.equal(ergebnis.noetig, true);
  assert.equal(ergebnis.grund, "anzahl");
});

test("Keine kostenpflichtige Zulage ist im Katalog vorausgewählt", () => {
  // Spezifikation Kapitel 7: kostenpflichtige Optionen dürfen niemals
  // vorangekreuzt sein. Der Katalog kennt gar kein Feld dafür — dieser Test
  // hält fest, dass das so bleibt.
  for (const z of katalog) {
    assert.equal(z.vorausgewaehlt, undefined, `${z.sku} darf keine Vorauswahl haben`);
  }
});
