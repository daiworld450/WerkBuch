// ---------------------------------------------------------------------------
// Prüfungen für Nachträge: Preisrechnung und Freigabelogik.
//
// Diese beiden sind laut Vorgabe Pflicht — und das aus gutem Grund. Ein Fehler
// in der Preisrechnung landet in einer Rechnung. Ein Fehler in der
// Freigabelogik macht den Nachweis wertlos, auf den man sich im Streitfall
// beruft. Beides fällt im Betrieb erst auf, wenn es zu spät ist.
// ---------------------------------------------------------------------------

require("./laden.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const N = require("../src/util/nachtrag.js");
const { sha256Hex } = require("../src/util/sha256.js");

// ============================================================ Preisrechnung

test("Eurobetrag wird in ganze Cent gelesen", () => {
  assert.equal(N.centAus("45,50"), 4550);
  assert.equal(N.centAus("45.50"), 4550);
  assert.equal(N.centAus(" 45,50 € "), 4550);
  assert.equal(N.centAus(45.5), 4550);
  assert.equal(N.centAus("0,01"), 1);
  assert.equal(N.centAus("1250"), 125000);
});

test("Kein Preis eingetragen ist nicht dasselbe wie Preis null", () => {
  assert.equal(N.centAus(""), null);
  assert.equal(N.centAus(null), null);
  assert.equal(N.centAus("abc"), null);
  assert.equal(N.centAus("0"), 0);
});

test("Der berüchtigte Rundungsfall 0,1 + 0,2 tritt gar nicht erst auf", () => {
  // In Euro als Fließkomma wäre 0.1 + 0.2 === 0.30000000000000004.
  const a = N.centAus("0,10");
  const b = N.centAus("0,20");
  assert.equal(a + b, 30);
  assert.equal(N.euroAusCent(a + b), "0,30 €");
});

test("Cent werden deutsch dargestellt, mit Tausenderpunkt", () => {
  assert.equal(N.euroAusCent(4550), "45,50 €");
  assert.equal(N.euroAusCent(0), "0,00 €");
  assert.equal(N.euroAusCent(5), "0,05 €");
  assert.equal(N.euroAusCent(1234567), "12.345,67 €");
  assert.equal(N.euroAusCent(100000000), "1.000.000,00 €");
  assert.equal(N.euroAusCent(-4550), "−45,50 €");
  assert.equal(N.euroAusCent(null), "—");
});

test("Umsatzsteuer wird getrennt gerundet, nicht aus dem Bruttowert zurück", () => {
  // 8,5 m² × 45,50 € = 386,75 € netto
  const r = N.rechne({ menge: "8,5", einzelpreisCent: 4550 });
  assert.equal(r.nettoCent, 38675);
  assert.equal(r.ustCent, 7348, "38675 × 0,19 = 7348,25 → 7348");
  assert.equal(r.bruttoCent, 46023);
  // Die Probe, auf die es ankommt: netto + Steuer ergibt exakt brutto.
  assert.equal(r.nettoCent + r.ustCent, r.bruttoCent);
});

test("Auch bei krummen Mengen bleibt netto + Steuer gleich brutto", () => {
  for (const menge of ["0,33", "1,07", "12,49", "99,99", "0,01"]) {
    for (const preis of [1, 999, 4550, 123456]) {
      const r = N.rechne({ menge, einzelpreisCent: preis });
      assert.equal(
        r.nettoCent + r.ustCent,
        r.bruttoCent,
        `Menge ${menge}, Preis ${preis}`
      );
      assert.ok(Number.isInteger(r.nettoCent), "netto muss ganzzahlig sein");
      assert.ok(Number.isInteger(r.ustCent), "Steuer muss ganzzahlig sein");
    }
  }
});

test("Der Einzelpreis ist immer ein ganzer Cent", () => {
  // Halbe Cent gibt es auf keiner Rechnung. Kommt so etwas herein, wird der
  // Preis zuerst auf ganze Cent gebracht — und erst danach multipliziert.
  assert.equal(N.rechne({ menge: 3, einzelpreisCent: 1.5 }).einzelpreisCent, 2);
  assert.equal(N.rechne({ menge: 3, einzelpreisCent: 1.5 }).nettoCent, 6);
});

test("Bei der Mengenrechnung wird kaufmännisch gerundet", () => {
  // 0,5 × 1 Cent = 0,5 Cent → 1 Cent (halbe Cent gehen auf)
  assert.equal(N.rechne({ menge: "0,5", einzelpreisCent: 1 }).nettoCent, 1);
  // 0,4 × 1 Cent = 0,4 Cent → 0 Cent
  assert.equal(N.rechne({ menge: "0,4", einzelpreisCent: 1 }).nettoCent, 0);
  // 2,345 m² × 12,00 € = 28,14 €
  assert.equal(N.rechne({ menge: "2,345", einzelpreisCent: 1200 }).nettoCent, 2814);
});

test("Menge null oder negativ ergibt null Euro, keinen negativen Nachtrag", () => {
  assert.equal(N.rechne({ menge: 0, einzelpreisCent: 4550 }).bruttoCent, 0);
  assert.equal(N.rechne({ menge: "-5", einzelpreisCent: 4550 }).bruttoCent, 0);
  assert.equal(N.rechne({ menge: "abc", einzelpreisCent: 4550 }).nettoCent, 0);
});

test("Ein Pauschalpreis rechnet mit Menge 1", () => {
  const r = N.rechne({ menge: 1, einzelpreisCent: 125000, ustSatz: 19 });
  assert.equal(r.nettoCent, 125000);
  assert.equal(r.ustCent, 23750);
  assert.equal(r.bruttoCent, 148750);
});

// ================================================================== Summen

const BEISPIELE = [
  { status: "freigegeben", nettoCent: 38675, ustCent: 7348, bruttoCent: 46023 },
  { status: "offen", nettoCent: 100000, ustCent: 19000, bruttoCent: 119000 },
  { status: "abgelehnt", nettoCent: 50000, ustCent: 9500, bruttoCent: 59500 },
  { status: "abgerechnet", nettoCent: 20000, ustCent: 3800, bruttoCent: 23800 },
];

test("Nur freigegebene und abgerechnete Nachträge erhöhen die Auftragssumme", () => {
  const s = N.auftragssumme(1200000, BEISPIELE);
  assert.equal(s.anzahlFreigegeben, 2);
  assert.equal(s.nachtraegeNettoCent, 38675 + 20000);
  assert.equal(s.gesamtCent, 1200000 + 58675);
});

test("Ein offener Nachtrag ist keine Forderung", () => {
  const nurOffen = [{ status: "offen", nettoCent: 999999, ustCent: 0, bruttoCent: 999999 }];
  assert.equal(N.auftragssumme(500000, nurOffen).gesamtCent, 500000);
});

test("Ein abgelehnter Nachtrag zählt nie mit", () => {
  const nurAbgelehnt = [{ status: "abgelehnt", nettoCent: 50000, ustCent: 9500, bruttoCent: 59500 }];
  assert.equal(N.auftragssumme(500000, nurAbgelehnt).nachtraegeNettoCent, 0);
});

test("Ohne hinterlegte Auftragssumme bleibt die Gesamtsumme unbekannt", () => {
  const s = N.auftragssumme(null, BEISPIELE);
  assert.equal(s.gesamtCent, null, "nicht die Nachtragssumme allein ausgeben");
  assert.equal(s.nachtraegeNettoCent, 58675, "die Nachträge selbst zählen trotzdem");
});

test("Summe über eine leere Liste stürzt nicht ab", () => {
  assert.deepEqual(N.summe(null), { anzahl: 0, nettoCent: 0, ustCent: 0, bruttoCent: 0 });
  assert.equal(N.auftragssumme(1000, []).gesamtCent, 1000);
});

// ============================================================ Statusmodell

test("Der Weg eines Nachtrags geht nur vorwärts", () => {
  assert.ok(N.statusWechselErlaubt("offen", "gesendet"));
  assert.ok(N.statusWechselErlaubt("gesendet", "freigegeben"));
  assert.ok(N.statusWechselErlaubt("freigegeben", "abgerechnet"));
});

test("Ein abgelehnter Nachtrag lässt sich nicht nachträglich freigeben", () => {
  assert.equal(N.statusWechselErlaubt("abgelehnt", "freigegeben"), false);
  assert.equal(N.statusWechselErlaubt("abgelehnt", "gesendet"), false);
});

test("Ein abgerechneter Nachtrag ist abgeschlossen", () => {
  assert.equal(N.statusWechselErlaubt("abgerechnet", "offen"), false);
  assert.equal(N.statusWechselErlaubt("abgerechnet", "freigegeben"), false);
});

test("Aus dem Nichts lässt sich nichts freigeben", () => {
  assert.equal(N.statusWechselErlaubt("offen", "freigegeben"), false,
    "erst senden, dann freigeben — sonst fehlt der Nachweis, dass der Kunde ihn sah");
});

// =========================================================== Nummernvergabe

test("Nachtragsnummern laufen je Baustelle fortlaufend", () => {
  assert.equal(N.naechsteNummer([]), "NT-1");
  assert.equal(N.naechsteNummer([{ nummer: "NT-1" }]), "NT-2");
  assert.equal(N.naechsteNummer([{ nummer: "NT-1" }, { nummer: "NT-2" }]), "NT-3");
});

test("Eine Lücke durch einen gelöschten Nachtrag wird nicht wiederverwendet", () => {
  // NT-2 wurde gelöscht. Die nächste Nummer ist trotzdem NT-4, nicht NT-2 —
  // sonst gäbe es zwei Belege mit derselben Nummer.
  assert.equal(N.naechsteNummer([{ nummer: "NT-1" }, { nummer: "NT-3" }]), "NT-4");
});

// ========================================================== Freigabe-Nachweis

const ANZEIGE = N.anzeigeAus({
  betrieb: "Berisa Bau",
  baustelleName: "Bad Familie Müller",
  kundeName: "Max Mustermann",
  nachtrag: {
    nummer: "NT-1",
    titel: "Estrich zusätzlich",
    beschreibung: "Der Bestandsestrich trägt nicht.",
    menge: "8,5",
    einheit: "m²",
    einzelpreisCent: 4550,
  },
  fotos: [{ url: "https://example.invalid/a.jpg" }],
});

test("Der eingefrorene Stand enthält die fertige Rechnung", () => {
  assert.equal(ANZEIGE.nettoCent, 38675);
  assert.equal(ANZEIGE.bruttoCent, 46023);
  assert.equal(ANZEIGE.ustSatz, 19);
  assert.deepEqual(ANZEIGE.fotos, ["https://example.invalid/a.jpg"]);
});

test("Der Abdruck ist bei gleichem Stand immer derselbe", () => {
  assert.equal(N.abdruck(ANZEIGE), N.abdruck({ ...ANZEIGE }));
  assert.equal(N.abdruck(ANZEIGE).length, 64);
});

test("Der Abdruck hängt nicht an der Reihenfolge der Felder", () => {
  // Ein Objekt mit umgekehrt eingetragenen Schlüsseln beschreibt denselben
  // Stand — und muss denselben Abdruck ergeben.
  const umgekehrt = {};
  Object.keys(ANZEIGE).reverse().forEach((k) => { umgekehrt[k] = ANZEIGE[k]; });
  assert.equal(N.abdruck(umgekehrt), N.abdruck(ANZEIGE));
});

test("Ein einziger geänderter Cent ergibt einen anderen Abdruck", () => {
  const teurer = { ...ANZEIGE, bruttoCent: ANZEIGE.bruttoCent + 1 };
  assert.notEqual(N.abdruck(teurer), N.abdruck(ANZEIGE));
});

test("Auch ein geänderter Beschreibungstext ändert den Abdruck", () => {
  const anders = { ...ANZEIGE, beschreibung: "Der Bestandsestrich trägt nicht!" };
  assert.notEqual(N.abdruck(anders), N.abdruck(ANZEIGE));
});

test("Ein zusätzliches Foto ändert den Abdruck", () => {
  const mehr = { ...ANZEIGE, fotos: [...ANZEIGE.fotos, "https://example.invalid/b.jpg"] };
  assert.notEqual(N.abdruck(mehr), N.abdruck(ANZEIGE));
});

test("Felder lassen sich nicht ineinander schieben", () => {
  // Ohne Trennzeichen zwischen den Feldern ergäben "AB"+"C" und "A"+"BC"
  // denselben Abdruck. Genau das darf nicht sein.
  const a = N.abdruck({ ...ANZEIGE, titel: "Estrich", beschreibung: "zusätzlich" });
  const b = N.abdruck({ ...ANZEIGE, titel: "Estrichzusätzlich", beschreibung: "" });
  assert.notEqual(a, b);
});

test("Der Wortlaut nennt Betrag, Steuer und die Beschriftung des Knopfes", () => {
  const text = N.wortlaut(ANZEIGE);
  assert.ok(text.includes("460,23 €"), "der Bruttobetrag muss im Text stehen");
  assert.ok(text.includes("386,75 €"), "der Nettobetrag ebenso");
  assert.ok(text.includes("19 % Umsatzsteuer"));
  assert.ok(text.includes("Kostenpflichtig beauftragen"),
    "der Kunde muss belegbar gelesen haben, dass sein Klick etwas kostet");
  assert.ok(text.includes("NT-1"));
  assert.ok(text.includes("Estrich zusätzlich"));
});

test("Der Wortlaut kommt ohne fehlende Angaben aus", () => {
  const knapp = N.anzeigeAus({ nachtrag: { nummer: "NT-9", titel: "Kleinigkeit", menge: 1,
                                           einheit: "pauschal", einzelpreisCent: 5000 } });
  const text = N.wortlaut(knapp);
  assert.ok(!text.includes("undefined"));
  assert.ok(!text.includes("null"));
  assert.ok(text.includes("59,50 €"));
});

// ============================================================= Zugangslinks

test("Der Zugangsschlüssel ist 32 Zeichen lang und meidet Verwechselbares", () => {
  let zaehler = 0;
  const quelle = (n) => Uint8Array.from({ length: n }, () => (zaehler++ * 7) % 256);
  const s = N.schluesselErzeugen(quelle);
  assert.equal(s.length, 32);
  assert.ok(!/[0O1lI]/.test(s), "keine verwechselbaren Zeichen");
});

test("Ohne sichere Zufallsquelle wird kein Link erzeugt", () => {
  const ohneCrypto = { ...globalThis };
  const merker = globalThis.crypto;
  try {
    delete globalThis.crypto;
    assert.throws(() => N.schluesselErzeugen(), /Zufallsquelle/);
  } finally {
    globalThis.crypto = merker;
    void ohneCrypto;
  }
});

test("Zwei Schlüssel sind verschieden", () => {
  const a = N.schluesselErzeugen();
  const b = N.schluesselErzeugen();
  assert.notEqual(a, b);
  assert.equal(a.length, 32);
});

test("Ein Link läuft nach 30 Tagen ab", () => {
  const start = new Date("2026-09-09T10:00:00Z");
  const ende = N.gueltigBis(start);
  assert.equal(Math.round((ende - start) / 86400000), 30);
});

// ------------------------------------------- die Prüfsumme selbst

test("SHA-256 stimmt mit dem bekannten Wert überein", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});
