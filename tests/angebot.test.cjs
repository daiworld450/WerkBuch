// ---------------------------------------------------------------------------
// Prüfungen des Angebotsmoduls.
//
// Ein Angebot ist das erste, was ein Kunde von einem Betrieb sieht — und die
// Zahl, an der er den Auftrag festmacht. Ein Rundungsfehler hier steht später
// in der Rechnung und muss erklärt werden.
// ---------------------------------------------------------------------------

require("./laden.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const A = require("../src/util/angebot.js");

// ------------------------------------------------------------- der Katalog

test("Der Katalog aus dem Angebotswerkzeug ist vollständig übernommen", () => {
  assert.equal(A.LEISTUNGEN.length, 37);
  assert.equal(A.GEWERKE.length, 5);
});

test("Die Langtexte tragen die Verweise auf die DIN-Normen", () => {
  const mitDin = A.LEISTUNGEN.filter((l) => /DIN\s*\d/.test(l.langtext));
  assert.ok(mitDin.length >= 5, "die DIN-Verweise dürfen beim Übernehmen nicht verlorengehen");
  const abdichtung = A.leistungZu("abdichtung_verbund");
  assert.match(abdichtung.langtext, /DIN 18534/);
});

test("Jede Leistung hat Kurztext, Einheit und einen Preis in ganzen Cent", () => {
  for (const l of A.LEISTUNGEN) {
    assert.ok(l.kurztext, `${l.schluessel}: Kurztext fehlt`);
    assert.ok(l.einheit, `${l.schluessel}: Einheit fehlt`);
    assert.ok(Number.isInteger(l.preisCent), `${l.schluessel}: Preis nicht in ganzen Cent`);
    assert.ok(l.preisCent >= 0, `${l.schluessel}: negativer Preis`);
  }
});

// ------------------------------------------------------------ Mengenformeln

test("Formeln aus dem Katalog werden ausgewertet", () => {
  const masse = { wand_qm: 22, boden_qm: 8, dusche_qm: 4, dusche_umfang_m: 5,
                  umfang_m: 12, sanitaerobjekte: 3 };
  assert.equal(A.formelRechnen("wand_qm", masse), 22);
  assert.equal(A.formelRechnen("wand_qm + boden_qm", masse), 30);
  assert.equal(A.formelRechnen("umfang_m + dusche_umfang_m", masse), 17);
  assert.equal(A.formelRechnen("2", masse), 2);
  assert.equal(A.formelRechnen("sanitaerobjekte", masse), 3);
});

test("Ein unbekanntes Maß ergibt null, keinen Fehler", () => {
  assert.equal(A.formelRechnen("gibt_es_nicht", { wand_qm: 10 }), 0);
  assert.equal(A.formelRechnen("", {}), 0);
  assert.equal(A.formelRechnen(null, null), 0);
});

test("Die Formelauswertung führt keinen fremden Code aus", () => {
  // Ohne eigenen Auswerter wäre das hier eine offene Tür. Ergebnis muss 0
  // sein, und es darf nichts passieren.
  assert.equal(A.formelRechnen("process.exit(1)", {}), 0);
  assert.equal(A.formelRechnen("1;2", {}), 0);
});

// ---------------------------------------------------------------- Vorlagen

const BAD = { wand_qm: 22, boden_qm: 8, dusche_qm: 4, dusche_umfang_m: 5,
              umfang_m: 12, sanitaerobjekte: 3 };

test("Eine Gewerk-Vorlage erzeugt ein vollständiges Angebot", () => {
  const p = A.vorlageAnwenden("bad_mikrozement", BAD);
  assert.ok(p.length >= 12, "ein Komplettbad besteht aus vielen Positionen");
  const schluessel = p.map((x) => x.schluessel);
  assert.ok(schluessel.includes("baustelleneinrichtung"));
  assert.ok(schluessel.includes("mikrozement_aufbau_wand"));
  assert.ok(schluessel.includes("endreinigung"));
  // Die Positionen tragen den Langtext mit — er steht im Angebot beim Kunden.
  assert.ok(p.every((x) => typeof x.langtext === "string"));
});

test("Mengen kommen aus den Maßen, nicht aus der Luft", () => {
  const p = A.vorlageAnwenden("bad_mikrozement", BAD);
  const wand = p.find((x) => x.schluessel === "mikrozement_aufbau_wand");
  assert.equal(wand.menge, 22);
  const versiegelung = p.find((x) => x.schluessel === "mikrozement_versiegelung");
  assert.equal(versiegelung.menge, 30, "Wand plus Boden");
});

test("Ohne Dusche fallen die Duschpositionen weg", () => {
  const ohneDusche = { ...BAD, dusche_qm: 0, dusche_umfang_m: 0 };
  const p = A.vorlageAnwenden("bad_mikrozement", ohneDusche);
  assert.ok(!p.some((x) => x.schluessel === "abdichtung_verbund"),
    "eine Position mit Menge 0 gehört nicht ins Angebot");
  assert.ok(p.some((x) => x.schluessel === "mikrozement_aufbau_wand"));
});

test("Ein unbekanntes Gewerk ergibt eine leere Liste statt eines Absturzes", () => {
  assert.deepEqual(A.vorlageAnwenden("gibt_es_nicht", BAD), []);
  assert.deepEqual(A.vorlageAnwenden(null, null), []);
});

// ------------------------------------------------------------------ Summen

test("Eine Position wird auf ganze Cent gerechnet", () => {
  const p = A.positionRechnen({ menge: "8,5", einzelpreisCent: 4550 });
  assert.equal(p.nettoCent, 38675);
  assert.ok(Number.isInteger(p.nettoCent));
});

test("Die Umsatzsteuer wird auf die Nettosumme gerechnet, nicht je Position", () => {
  // Je Position gerundet und dann addiert käme hier ein anderer Cent heraus.
  const s = A.summeRechnen([
    { menge: 1, einzelpreisCent: 333 },
    { menge: 1, einzelpreisCent: 333 },
    { menge: 1, einzelpreisCent: 333 },
  ]);
  assert.equal(s.nettoCent, 999);
  assert.equal(s.ustCent, 190, "999 × 0,19 = 189,81 → 190");
  assert.equal(s.bruttoCent, 1189);
  assert.equal(s.nettoCent + s.ustCent, s.bruttoCent);
});

test("Netto plus Steuer ergibt bei jedem Angebot genau brutto", () => {
  for (let n = 1; n < 400; n += 7) {
    const s = A.summeRechnen([{ menge: n, einzelpreisCent: 1234 }]);
    assert.equal(s.nettoCent + s.ustCent, s.bruttoCent, `bei Menge ${n}`);
  }
});

test("Ein Komplettbad ergibt eine plausible Summe", () => {
  const s = A.summeRechnen(A.vorlageAnwenden("bad_mikrozement", BAD));
  assert.ok(s.nettoCent > 300000, "ein Komplettbad liegt über 3.000 €");
  assert.ok(s.nettoCent < 3000000, "und unter 30.000 €");
  assert.equal(s.bruttoCent, s.nettoCent + s.ustCent);
});

test("Ein leeres Angebot ergibt null Euro, keinen Fehler", () => {
  const s = A.summeRechnen([]);
  assert.equal(s.nettoCent, 0);
  assert.equal(s.bruttoCent, 0);
  assert.equal(s.anzahl, 0);
  assert.equal(A.summeRechnen(null).nettoCent, 0);
});

// ------------------------------------------------------------- Nummernkreis

test("Angebotsnummern laufen je Jahr fortlaufend", () => {
  assert.equal(A.naechsteNummer([], 2026), "AN-2026-0001");
  assert.equal(A.naechsteNummer(["AN-2026-0001"], 2026), "AN-2026-0002");
  assert.equal(A.naechsteNummer(["AN-2026-0001", "AN-2026-0009"], 2026), "AN-2026-0010");
});

test("Das Jahr trennt die Nummernkreise", () => {
  assert.equal(A.naechsteNummer(["AN-2025-0042"], 2026), "AN-2026-0001");
});

test("Eine Lücke wird nicht wiederverwendet", () => {
  assert.equal(A.naechsteNummer(["AN-2026-0001", "AN-2026-0003"], 2026), "AN-2026-0004");
});

// ------------------------------------------------------------- Konditionen

test("Die Konditionen tragen die festgelegten Werte", () => {
  const alle = A.KONDITIONEN_STANDARD.map((k) => k.text).join(" ");
  assert.match(alle, /100,00 € pauschal/, "Vor-Ort-Termin 100 €");
  assert.match(alle, /erlassen/, "bei Auftragserteilung erlassen");
  assert.match(alle, /15 %/, "15 % Anzahlung");
  assert.match(alle, /2 bis 4 Wochen/, "Vorlauf bis Baubeginn");
});

test("Die Konditionen nennen die Grundlage der Ausführung", () => {
  const grundlage = A.KONDITIONEN_STANDARD.find((k) => k.key === "grundlage");
  assert.match(grundlage.text, /anerkannten Regeln der Technik/);
  assert.match(grundlage.text, /DIN-Normen/);
  assert.match(grundlage.text, /Nachtrag/, "der Nachtragsweg gehört in die Konditionen");
});

test("Ein Angebot ist 30 Tage gültig", () => {
  const start = new Date("2026-09-09T10:00:00Z");
  assert.equal(Math.round((A.gueltigBis(start) - start) / 86400000), 30);
});

// ---------------------------------------------------------------- Ausdruck

const BAUSTELLE = { name: "Bad Familie Müller", adresse: "Musterstraße 12, 45468 Mülheim",
                    kundeName: "Max Mustermann" };

test("Das gedruckte Angebot enthält alles Wesentliche", () => {
  const positionen = A.vorlageAnwenden("bad_mikrozement", BAD);
  const html = A.angebotHtml({
    angebot: { nummer: "AN-2026-0001", betreff: "Komplettbadsanierung mit Mikrozement" },
    baustelle: BAUSTELLE, positionen, konditionen: null,
    erstelltAm: new Date("2026-09-09T10:00:00Z"),
  });
  assert.ok(html.includes("AN-2026-0001"));
  assert.ok(html.includes("Max Mustermann"));
  assert.ok(html.includes("Komplettbadsanierung"));
  assert.ok(html.includes("Baustelleneinrichtung"));
  assert.ok(html.includes("09.09.2026"));
  assert.ok(html.includes("09.10.2026"), "die Bindefrist von 30 Tagen");
  assert.ok(html.includes("Umsatzsteuer"));
  assert.ok(html.includes("100,00 € pauschal"), "die Konditionen gehören ins Dokument");
  assert.ok(html.includes("DIN 18534"), "die DIN-Verweise stehen beim Kunden im Angebot");
});

test("Die Seitenumbrüche sind kontrolliert", () => {
  const html = A.angebotHtml({ angebot: {}, baustelle: BAUSTELLE,
                               positionen: A.vorlageAnwenden("bad_fliesen", BAD) });
  assert.ok(html.includes("size: A4"));
  assert.ok(html.includes("tr.pos { break-inside: avoid; }"),
    "eine Position darf nicht zwischen Text und Preis zerschnitten werden");
});

test("Fremde Texte können das Angebot nicht zerlegen", () => {
  const html = A.angebotHtml({
    angebot: { nummer: "AN-1", betreff: '<script>böse</script>' },
    baustelle: { kundeName: 'Max <b>&</b> Co' },
    positionen: [],
  });
  assert.ok(!html.includes("<script>böse"));
  assert.ok(html.includes("Max &lt;b&gt;&amp;&lt;/b&gt; Co"));
});

test("Ein Angebot ohne Positionen ist ein gültiges Dokument", () => {
  const html = A.angebotHtml({ angebot: {}, baustelle: {}, positionen: [] });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("Noch keine Positionen"));
  assert.ok(!html.includes("undefined"));
});
