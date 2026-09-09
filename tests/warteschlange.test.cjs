// ---------------------------------------------------------------------------
// Prüfungen der Foto-Warteschlange.
//
// Was hier schiefgehen kann, merkt niemand sofort: Ein Foto verschwindet still
// und fällt erst Wochen später auf, wenn der Projektbericht eine Lücke hat.
// ---------------------------------------------------------------------------

require("./laden.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const W = require("../src/util/warteschlange.js");

function foto(id, groesseKb = 400, versuche = 0) {
  return W.eintragAnlegen(id, {
    baustelleId: "b1",
    phase: "Abriss",
    base64: "x".repeat(groesseKb * 1024),
    dateiname: `${id}.jpg`,
  });
}

test("Ein Foto ohne Netz landet mit allem Nötigen in der Schlange", () => {
  const e = W.eintragAnlegen("abc", {
    baustelleId: "b1",
    phase: "Fliesen",
    notiz: "Wandanschluss links",
    base64: "AAAA",
    dateiname: "a.jpg",
    aufgenommenAm: "2026-09-01T14:22:00.000Z",
    hochgeladenVon: "uid1",
  });
  assert.equal(e.id, "abc");
  assert.equal(e.phase, "Fliesen");
  assert.equal(e.aufgenommenAm, "2026-09-01T14:22:00.000Z");
  assert.equal(e.versuche, 0);
});

test("Das Aufnahmedatum ist etwas anderes als der Uploadzeitpunkt", () => {
  // Genau darum geht es: Wer abends im WLAN überträgt, was er morgens
  // fotografiert hat, soll den Morgen in der Bauphase stehen haben.
  const e = W.eintragAnlegen("x", { baustelleId: "b", phase: "P", base64: "A",
                                    aufgenommenAm: "2026-09-01T08:00:00.000Z" });
  assert.equal(e.aufgenommenAm, "2026-09-01T08:00:00.000Z");
});

test("Ohne Aufnahmedatum bleibt das Feld leer statt geraten", () => {
  const e = W.eintragAnlegen("x", { baustelleId: "b", phase: "P", base64: "A" });
  assert.equal(e.aufgenommenAm, null);
});

test("Bis zur Grenze passt alles hinein", () => {
  const liste = [foto("a"), foto("b")];
  assert.equal(W.passtNoch(liste, foto("c")).ok, true);
});

test("Ist der Zwischenspeicher voll, wird das gesagt statt still verworfen", () => {
  // 30 × 400 KB ≈ 12 MB
  const voll = Array.from({ length: 30 }, (_, i) => foto("f" + i));
  const erg = W.passtNoch(voll, foto("noch1"));
  assert.equal(erg.ok, false);
  assert.match(erg.grund, /voll/);
  assert.match(erg.grund, /Empfang/, "die Meldung muss sagen, wie es weitergeht");
});

test("Auch die schiere Anzahl ist begrenzt", () => {
  const viele = Array.from({ length: W.MAX_ANZAHL }, (_, i) => foto("k" + i, 1));
  const erg = W.passtNoch(viele, foto("k99", 1));
  assert.equal(erg.ok, false);
  assert.match(erg.grund, new RegExp(String(W.MAX_ANZAHL)));
});

test("Abgearbeitet wird der Reihe nach", () => {
  const liste = [foto("a"), foto("b"), foto("c")];
  assert.equal(W.naechster(liste).id, "a");
  assert.equal(W.naechster(W.entfernen(liste, "a")).id, "b");
});

test("Ein hakendes Foto blockiert die anderen nicht", () => {
  // "a" ist schon zweimal gescheitert — "b" kommt zuerst dran.
  let liste = [foto("a"), foto("b")];
  liste = W.fehlschlagVermerken(liste, "a", "Netz weg");
  liste = W.fehlschlagVermerken(liste, "a", "Netz weg");
  assert.equal(W.naechster(liste).id, "b");
});

test("Nach fünf Fehlversuchen ruht ein Eintrag", () => {
  let liste = [foto("a")];
  for (let i = 0; i < 5; i++) liste = W.fehlschlagVermerken(liste, "a", "kaputt");
  assert.equal(liste[0].versuche, 5);
  assert.equal(W.naechster(liste), null, "sonst läuft die App endlos gegen dieselbe Wand");
});

test("Der letzte Fehler wird vermerkt, aber gekürzt", () => {
  const liste = W.fehlschlagVermerken([foto("a")], "a", "F".repeat(1000));
  assert.equal(liste[0].letzterFehler.length, 200);
});

test("Entfernen trifft nur den gemeinten Eintrag", () => {
  const liste = [foto("a"), foto("b"), foto("c")];
  const rest = W.entfernen(liste, "b");
  assert.deepEqual(rest.map((e) => e.id), ["a", "c"]);
});

test("Der Stand wird in ganzen Sätzen gemeldet", () => {
  assert.equal(W.standText([]), "");
  assert.equal(W.standText([foto("a")]), "1 Foto wartet auf Empfang");
  assert.equal(W.standText([foto("a"), foto("b")]), "2 Fotos warten auf Empfang");

  let mitProblem = [foto("a"), foto("b")];
  for (let i = 0; i < 5; i++) mitProblem = W.fehlschlagVermerken(mitProblem, "a", "x");
  assert.equal(
    W.standText(mitProblem),
    "1 Foto wartet auf Empfang · 1 Foto ließ sich nicht senden"
  );
});

test("Kaputte Eingaben führen zu keinem Absturz", () => {
  assert.equal(W.gesamtGroesse(null), 0);
  assert.equal(W.naechster(undefined), null);
  assert.deepEqual(W.entfernen(null, "a"), []);
  assert.equal(W.standText("keine Liste"), "");
  assert.equal(W.passtNoch(null, foto("a")).ok, true);
});
