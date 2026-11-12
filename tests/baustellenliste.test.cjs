// ---------------------------------------------------------------------------
// Prüfungen der Baustellenliste: nach Anlage der Kunden geordnet (Feld reihenfolge,
// Anlagezeitpunkt in sevDesk), neueste Kunden oben, Altbestand ohne Nummer unten.
// ---------------------------------------------------------------------------

require("./laden.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { listenReihen } = require("../src/util/baustellenListe.js");

const tag = (iso) => new Date(iso + "T12:00:00");
const b = (id, extra) => ({ id, name: id, erstelltAm: tag("2026-10-20"), ...extra });
const ids = (reihen) => reihen.map((r) => (r.typ === "monat" ? "[" + r.titel + "]" : r.id));

test("Jüngster Kunde oben, älteste unten", () => {
  const reihen = listenReihen([
    b("alt", { reihenfolge: 202410080917 }),
    b("neu", { reihenfolge: 202610211200 }),
    b("mitte", { reihenfolge: 202604092228 }),
  ]);
  assert.deepEqual(ids(reihen), ["neu", "mitte", "alt"]);
});

test("Altbestand ohne passenden Kunden (Nummer 0) steht ganz unten unter eigener Überschrift, nach Name", () => {
  const reihen = listenReihen([
    b("Zainab", { reihenfolge: 0 }),
    b("mit", { reihenfolge: 1050 }),
    b("Heißen", { reihenfolge: 0 }),
  ]);
  assert.deepEqual(ids(reihen), ["mit", "[Noch nicht eingeordnet]", "Heißen", "Zainab"]);
});

test("In der App neu angelegte Baustelle (Feld fehlt) steht ganz oben, die jüngste zuerst", () => {
  const reihen = listenReihen([
    b("nummeriert", { reihenfolge: 202610211200 }),
    b("neuA", { erstelltAm: tag("2026-11-12") }),
    b("neuB", { erstelltAm: tag("2026-11-13") }),
  ]);
  assert.deepEqual(ids(reihen), ["neuB", "neuA", "nummeriert"]);
});

test("Ohne Altbestand gibt es keine Überschrift", () => {
  const reihen = listenReihen([b("a", { reihenfolge: 1 }), b("c", { reihenfolge: 2 })]);
  assert.equal(reihen.some((r) => r.typ === "monat"), false);
});

test("Gleiche Reihenfolge: die später angelegte Baustelle zuerst; jede Zeile hat eine eigene id", () => {
  const reihen = listenReihen([
    b("a", { reihenfolge: 1167, erstelltAm: tag("2026-10-20") }),
    b("b", { reihenfolge: 1167, erstelltAm: tag("2026-10-26") }),
    b("c", { reihenfolge: 0 }),
  ]);
  assert.deepEqual(ids(reihen), ["b", "a", "[Noch nicht eingeordnet]", "c"]);
  assert.equal(new Set(reihen.map((r) => r.id)).size, reihen.length);
});

test("Werte als Text (\"1219\") und leere Liste", () => {
  assert.deepEqual(ids(listenReihen([b("x", { reihenfolge: "1010" }), b("y", { reihenfolge: "1219" })])), ["y", "x"]);
  assert.deepEqual(listenReihen([]), []);
});
