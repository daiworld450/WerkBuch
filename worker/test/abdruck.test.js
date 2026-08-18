// ---------------------------------------------------------------------------
// Tests des Dokument-Abdrucks (Spezifikation Kapitel 8.1, Prüfschritt 2b).
//
// Der Abdruck ist die Absicherung dagegen, dass ein Kunde etwas anderes
// freigibt, als er auf dem Bildschirm gesehen hat. Ändert sich am Angebot
// irgendetwas Preisrelevantes, muss sich der Abdruck ändern.
//
// Portierung von functions/test/abdruck.test.js: angebotAbdruck ist in der
// Worker-Fassung async (Web Crypto statt node:crypto) — alle Aufrufe hier
// entsprechend mit await.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import { angebotAbdruck } from "../src/portal.js";

const angebot = {
  pdfUrl: "https://res.cloudinary.com/demo/angebot.pdf",
  seiten: 3,
  betrag: 12480,
  status: "Gesendet",
  dateiname: "Angebot-Bad.pdf",
};

test("Gleiches Angebot ergibt denselben Abdruck", async () => {
  assert.equal(await angebotAbdruck(angebot), await angebotAbdruck({ ...angebot }));
});

test("Geänderter Betrag ändert den Abdruck", async () => {
  assert.notEqual(await angebotAbdruck(angebot), await angebotAbdruck({ ...angebot, betrag: 12520 }));
});

test("Neues PDF ändert den Abdruck", async () => {
  assert.notEqual(
    await angebotAbdruck(angebot),
    await angebotAbdruck({ ...angebot, pdfUrl: "https://res.cloudinary.com/demo/angebot-v2.pdf" })
  );
});

test("Geänderter Status ändert den Abdruck", async () => {
  assert.notEqual(await angebotAbdruck(angebot), await angebotAbdruck({ ...angebot, status: "Entwurf" }));
});

test("Geänderte Seitenzahl ändert den Abdruck", async () => {
  assert.notEqual(await angebotAbdruck(angebot), await angebotAbdruck({ ...angebot, seiten: 4 }));
});

test("Rein kosmetische Änderungen ändern den Abdruck nicht", async () => {
  // Der Dateiname steht nicht im Abdruck: ihn umzubenennen ändert nichts am
  // Inhalt dessen, was der Kunde freigibt — ein Konflikt wäre hier nur lästig.
  assert.equal(
    await angebotAbdruck(angebot),
    await angebotAbdruck({ ...angebot, dateiname: "Angebot-Badsanierung-final.pdf" })
  );
});

test("Fehlendes Angebot erzeugt trotzdem einen stabilen Abdruck", async () => {
  assert.equal(await angebotAbdruck(null), await angebotAbdruck(undefined));
  assert.equal((await angebotAbdruck(null)).length, 64);
});
