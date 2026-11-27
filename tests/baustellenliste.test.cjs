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

// --- Zeitgruppen (28.11.2026): Status und Zeitraum aus der Zentrale ----------
const { zeitGruppe } = require("../src/util/baustellenListe.js");
const HEUTE = new Date("2026-11-28T10:00:00");

test("Zeitgruppen: laufend, anstehend, noch offen, abgeschlossen nach Jahr, nicht eingeordnet", () => {
  const reihen = listenReihen(
    [
      b("alt-fertig", { reihenfolge: 202501112321, status: "Abgeschlossen", abschlussAm: "2025-03-25" }),
      b("neu-fertig", { reihenfolge: 202606122218, status: "Abgeschlossen", abschlussAm: "2026-07-16" }),
      b("spaeter", { reihenfolge: 202611080000, status: "In Planung", angebotsNummer: "AN-729", geplantStart: "2027-03-01T06:00:00Z", geplantEnde: "2027-03-31T16:00:00Z" }),
      b("bald", { reihenfolge: 202610281200, status: "In Planung", angebotsNummer: "AN-727", geplantStart: "2026-12-04T06:00:00Z", geplantEnde: "2026-12-04T16:00:00Z" }),
      b("heute", { reihenfolge: 202610010000, status: "In Planung", geplantStart: "2026-11-27T06:00:00Z", geplantEnde: "2026-12-11T16:00:00Z" }),
      b("offen", { reihenfolge: 202604092228, status: "In Planung" }),
      b("ohne", { reihenfolge: 0, status: "In Planung" }),
      b("stadt", { reihenfolge: 0, status: "Abgeschlossen", geplantEnde: "2025-09-08T16:00:00Z" }),
    ],
    HEUTE
  );
  assert.deepEqual(ids(reihen), [
    "[Laufend]", "heute",
    "[Anstehend]", "bald", "spaeter",
    "[Noch offen]", "offen",
    "[Abgeschlossen 2026]", "neu-fertig",
    "[Abgeschlossen 2025]", "stadt", "alt-fertig",
    "[Noch nicht eingeordnet]", "ohne",
  ]);
  assert.equal(new Set(reihen.map((r) => r.id)).size, reihen.length);
});

test("Zeitgruppe: letzter Tag des Zeitraums zählt noch als laufend, danach nicht mehr", () => {
  const z = { status: "In Planung", reihenfolge: 1, geplantStart: "2026-11-20T06:00:00", geplantEnde: "2026-11-28T16:00:00" };
  assert.equal(zeitGruppe(z, new Date("2026-11-28T20:00:00")).art, "laufend");
  assert.equal(zeitGruppe(z, new Date("2026-11-29T08:00:00")).art, "offen");
});

test("Zeitgruppe: Status In Ausführung ist laufend, Abgeschlossen nimmt das Jahr aus abschlussAm", () => {
  assert.equal(zeitGruppe({ status: "In Ausführung", reihenfolge: 5 }, HEUTE).art, "laufend");
  assert.deepEqual(zeitGruppe({ status: "Abgeschlossen", abschlussAm: "2025-12-31" }, HEUTE), { art: "fertig", jahr: 2025 });
  // ohne Datum: Jahr aus der Reihenfolge, zuletzt das laufende Jahr
  assert.deepEqual(zeitGruppe({ status: "Abgeschlossen", reihenfolge: 202412032123 }, HEUTE), { art: "fertig", jahr: 2024 });
  assert.deepEqual(zeitGruppe({ status: "Abgeschlossen" }, HEUTE), { art: "fertig", jahr: 2026 });
});

test("Zeitgruppen: in der App neu angelegte Baustelle steht unter Anstehend ganz oben", () => {
  const reihen = listenReihen(
    [
      b("fertig", { reihenfolge: 202501112321, status: "Abgeschlossen", abschlussAm: "2025-03-25" }),
      b("angelegt", { status: "In Planung", erstelltAm: tag("2026-11-28") }),
      b("auftrag", { reihenfolge: 202610281200, status: "In Planung", angebotsNummer: "AN-727", geplantStart: "2026-12-04T06:00:00Z", geplantEnde: "2026-12-04T16:00:00Z" }),
    ],
    HEUTE
  );
  assert.deepEqual(ids(reihen), ["[Anstehend]", "angelegt", "auftrag", "[Abgeschlossen 2025]", "fertig"]);
});

test("Anstehend: der nächste Start zuerst, auch wenn das Feld reihenfolge fehlt", () => {
  const reihen = listenReihen(
    [
      b("spaet", { status: "In Planung", angebotsNummer: "AN-729", geplantStart: "2027-03-01T06:00:00Z", geplantEnde: "2027-03-31T16:00:00Z" }),
      b("frueh", { status: "In Planung", angebotsNummer: "AN-727", geplantStart: "2026-11-30T06:00:00Z", geplantEnde: "2026-12-11T16:00:00Z" }),
      b("mitte", { reihenfolge: 202609301200, status: "In Planung", angebotsNummer: "AN-718", geplantStart: "2026-12-03T09:00:00Z", geplantEnde: "2026-12-03T16:00:00Z" }),
    ],
    new Date("2026-11-20T10:00:00")
  );
  assert.deepEqual(ids(reihen), ["[Anstehend]", "frueh", "mitte", "spaet"]);
});
