// ---------------------------------------------------------------------------
// Prüfungen des Projektberichts.
//
// Zwei Dinge müssen stimmen, sonst ist der Bericht schlimmer als keiner:
// die Chronologie (sonst erzählt er die Sanierung rückwärts) und die
// Unschädlichkeit fremder Texte (sonst zerlegt ein Kundenname das Dokument).
// ---------------------------------------------------------------------------

require("./laden.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const B = require("../src/util/bericht.js");

const PHASEN = ["Vorher", "Abriss", "Rohinstallation", "Fliesen", "Montage", "Fertig"];

function foto(phase, tag, notiz) {
  return {
    url: `https://example.invalid/${phase}-${tag}.jpg`,
    phase,
    notiz,
    aufgenommenAm: { seconds: Math.floor(new Date(`2026-09-${tag}T09:00:00Z`).getTime() / 1000) },
  };
}

// ------------------------------------------------------------ Reihenfolge

test("Innerhalb einer Phase wird vorwärts erzählt", () => {
  const g = B.nachPhasen([foto("Abriss", "12"), foto("Abriss", "03"), foto("Abriss", "08")], PHASEN);
  const tage = g[0].fotos.map((f) => f.url.slice(-6, -4));
  assert.deepEqual(tage, ["03", "08", "12"]);
});

test("Die Phasen kommen in der Reihenfolge der Bauabschnitte", () => {
  const g = B.nachPhasen([foto("Fertig", "20"), foto("Vorher", "01"), foto("Fliesen", "10")], PHASEN);
  assert.deepEqual(g.map((x) => x.phase), ["Vorher", "Fliesen", "Fertig"]);
});

test("Phasen ohne Fotos erscheinen gar nicht", () => {
  const g = B.nachPhasen([foto("Vorher", "01")], PHASEN);
  assert.equal(g.length, 1);
});

test("Das Aufnahmedatum schlägt den Uploadzeitpunkt", () => {
  const frueh = { aufgenommenAm: { seconds: 1000 }, erstelltAm: { seconds: 99999 } };
  assert.equal(B.fotoZeit(frueh), 1000 * 1000);
  const ohne = { erstelltAm: { seconds: 500 } };
  assert.equal(B.fotoZeit(ohne), 500 * 1000);
  assert.equal(B.fotoZeit({}), 0);
});

// -------------------------------------------------------- fremde Texte

test("Spitze Klammern in Texten können das Dokument nicht zerlegen", () => {
  assert.equal(B.sicher('<script>alert(1)</script>'),
    "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(B.sicher('Bad "Müller" & Sohn'), "Bad &quot;Müller&quot; &amp; Sohn");
  assert.equal(B.sicher(null), "");
});

test("Ein Baustellenname mit Klammern landet unschädlich im Bericht", () => {
  const html = B.berichtHtml({
    baustelle: { name: 'Bad <b>Müller</b>', kundeName: 'Max & Co' },
    gruppen: [],
    nachtraege: [],
    erstelltAm: new Date("2026-09-09T10:00:00Z"),
  });
  assert.ok(!html.includes("<b>Müller</b>"), "roher HTML-Code darf nicht durchkommen");
  assert.ok(html.includes("Bad &lt;b&gt;Müller&lt;/b&gt;"));
  assert.ok(html.includes("Max &amp; Co"));
});

// ------------------------------------------------------------- Inhalt

const BAUSTELLE = {
  name: "Bad Familie Müller",
  adresse: "Musterstraße 12, 45468 Mülheim",
  kundeName: "Max Mustermann",
  status: "Abgeschlossen",
  geplantStart: new Date("2026-08-01T00:00:00Z"),
  geplantEnde: new Date("2026-08-22T00:00:00Z"),
};

test("Der Bericht enthält Eckdaten, Phasen und Fotoanzahl", () => {
  const gruppen = B.nachPhasen([foto("Vorher", "01", "Ausgangslage"), foto("Fertig", "20")], PHASEN);
  const html = B.berichtHtml({
    baustelle: BAUSTELLE, gruppen, nachtraege: [],
    erstelltAm: new Date("2026-09-09T10:00:00Z"),
  });
  assert.ok(html.includes("Bad Familie Müller"));
  assert.ok(html.includes("Musterstraße 12"));
  assert.ok(html.includes("Max Mustermann"));
  assert.ok(html.includes("01.08.2026 – 22.08.2026"));
  assert.ok(html.includes("2 Fotos"));
  assert.ok(html.includes("Ausgangslage"));
  assert.ok(html.includes(">Vorher</h2>"));
  assert.ok(html.includes(">Fertig</h2>"));
});

test("Nur freigegebene Nachträge stehen im Bericht", () => {
  const nachtraege = [
    { nummer: "NT-1", titel: "Estrich", menge: 8.5, einheit: "m²", nettoCent: 38675, status: "freigegeben" },
    { nummer: "NT-2", titel: "Geheim-Angebot", menge: 1, einheit: "pauschal", nettoCent: 500000, status: "offen" },
    { nummer: "NT-3", titel: "Abgelehnt", menge: 1, einheit: "pauschal", nettoCent: 100000, status: "abgelehnt" },
  ];
  const html = B.berichtHtml({ baustelle: BAUSTELLE, gruppen: [], nachtraege,
                               erstelltAm: new Date("2026-09-09T10:00:00Z") });
  assert.ok(html.includes("Estrich"));
  assert.ok(!html.includes("Geheim-Angebot"), "ein offener Nachtrag gehört nicht in den Bericht");
  assert.ok(!html.includes("Abgelehnt"));
  assert.ok(html.includes("386,75 €"));
});

test("Ohne Nachträge fehlt der ganze Abschnitt", () => {
  const html = B.berichtHtml({ baustelle: BAUSTELLE, gruppen: [], nachtraege: [] });
  assert.ok(!html.includes("Zusätzlich beauftragte Leistungen"));
});

test("Eine Baustelle ohne Fotos ergibt einen Bericht statt eines Fehlers", () => {
  const html = B.berichtHtml({ baustelle: BAUSTELLE, gruppen: [], nachtraege: [] });
  assert.ok(html.includes("noch keine Fotos"));
  assert.ok(html.startsWith("<!doctype html>"));
});

test("Auch ganz ohne Daten entsteht ein gültiges Dokument", () => {
  const html = B.berichtHtml({});
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.trimEnd().endsWith("</html>"));
  assert.ok(!html.includes("undefined"));
});

test("Der Druck ist auf A4 eingerichtet und schneidet Phasen nicht mittendurch", () => {
  const html = B.berichtHtml({ baustelle: BAUSTELLE, gruppen: [], nachtraege: [] });
  assert.ok(html.includes("size: A4"));
  assert.ok(html.includes("break-inside: avoid-page"));
});
