// ---------------------------------------------------------------------------
// Prüfungen der Einordnung (Bauphase + Raum) beim Foto-Upload.
//
// Was hier schiefgehen kann, fällt erst bei den Beiträgen auf: ein Foto im
// falschen Raum landet in einem Vorher/Nachher-Paar, das nie existierte.
// ---------------------------------------------------------------------------

require("./laden.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const E = require("../src/util/einordnung.js");
const W = require("../src/util/warteschlange.js");

test("Ohne Phase oder Raum ist die Einordnung unvollständig", () => {
  assert.equal(E.pruefeEinordnung({ phase: null, bereich: "Bad" }).ok, false);
  assert.equal(E.pruefeEinordnung({ phase: "Fliesen", bereich: "" }).ok, false);
  assert.equal(E.pruefeEinordnung({}).ok, false);
});

test("Der Grund nennt, was fehlt", () => {
  assert.match(E.pruefeEinordnung({ bereich: "Bad" }).grund, /Bauphase/);
  assert.match(E.pruefeEinordnung({ phase: "Fertig" }).grund, /Raum/);
  const beides = E.pruefeEinordnung({}).grund;
  assert.match(beides, /Bauphase und den Raum/);
});

test("Mit Phase und Raum ist alles in Ordnung", () => {
  assert.equal(E.pruefeEinordnung({ phase: "Fertig", bereich: "Bad" }).ok, true);
});

test("Freitext wird zum Raum-Wert wie im Bestand: ohne Umlaute, groß", () => {
  assert.equal(E.bereichWert("küche"), "Kueche");
  assert.equal(E.bereichWert("  Außentreppe "), "Aussentreppe");
  assert.equal(E.bereichWert("gäste wc"), "Gaeste-wc");
  assert.equal(E.bereichWert("Keller"), "Keller");
});

test("Leerer oder nur aus Zeichen bestehender Freitext ergibt keinen Raum", () => {
  assert.equal(E.bereichWert(""), "");
  assert.equal(E.bereichWert("   "), "");
  assert.equal(E.bereichWert("???"), "");
  assert.equal(E.bereichWert(null), "");
});

test("Alle Vorschläge sind schon in der Schreibweise des Bestands", () => {
  for (const b of E.BEREICHE) assert.equal(E.bereichWert(b.wert), b.wert, b.wert);
});

test("Der Anzeigename hat Umlaute, der gespeicherte Wert nicht", () => {
  assert.equal(E.bereichLabel("Kueche"), "Küche");
  assert.equal(E.bereichLabel("Keller"), "Keller");
});

test("Das Datum hat die Form JJJJ-MM-TT in Ortszeit", () => {
  assert.equal(E.heute(new Date(2026, 9, 5, 23, 59)), "2026-10-05");
});

test("Ein eingeordnetes Foto bekommt Raum, geprüft und Datum", () => {
  const f = E.einordnungsFelder({ bereich: "Bad", eingeordnet: "2026-10-22" });
  assert.deepEqual(f, { bereich: "Bad", geprueft: true, eingeordnet: "2026-10-22" });
});

test("Ein Eintrag aus der Zeit davor wird wie bisher ohne geprüft gesendet", () => {
  assert.deepEqual(E.einordnungsFelder({ phase: "Abriss" }), {});
  assert.deepEqual(E.einordnungsFelder(null), {});
});

test("Raum und Datum überleben die Warteschlange", () => {
  const e = W.eintragAnlegen("x", {
    baustelleId: "b1", phase: "Fertig", bereich: "Kueche", eingeordnet: "2026-10-22",
    base64: "AAAA", dateiname: "a.jpg",
  });
  assert.equal(e.bereich, "Kueche");
  assert.equal(e.eingeordnet, "2026-10-22");
  assert.equal(E.einordnungsFelder(e).geprueft, true);
});
