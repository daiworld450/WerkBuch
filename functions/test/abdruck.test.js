// ---------------------------------------------------------------------------
// Tests des Dokument-Abdrucks (Spezifikation Kapitel 8.1, Prüfschritt 2b).
//
// Der Abdruck ist die Absicherung dagegen, dass ein Kunde etwas anderes
// freigibt, als er auf dem Bildschirm gesehen hat. Ändert sich am Angebot
// irgendetwas Preisrelevantes, muss sich der Abdruck ändern.
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

test("Gleiches Angebot ergibt denselben Abdruck", () => {
  assert.equal(angebotAbdruck(angebot), angebotAbdruck({ ...angebot }));
});

test("Geänderter Betrag ändert den Abdruck", () => {
  assert.notEqual(angebotAbdruck(angebot), angebotAbdruck({ ...angebot, betrag: 12520 }));
});

test("Neues PDF ändert den Abdruck", () => {
  assert.notEqual(
    angebotAbdruck(angebot),
    angebotAbdruck({ ...angebot, pdfUrl: "https://res.cloudinary.com/demo/angebot-v2.pdf" })
  );
});

test("Geänderter Status ändert den Abdruck", () => {
  assert.notEqual(angebotAbdruck(angebot), angebotAbdruck({ ...angebot, status: "Entwurf" }));
});

test("Geänderte Seitenzahl ändert den Abdruck", () => {
  assert.notEqual(angebotAbdruck(angebot), angebotAbdruck({ ...angebot, seiten: 4 }));
});

test("Rein kosmetische Änderungen ändern den Abdruck nicht", () => {
  // Der Dateiname steht nicht im Abdruck: ihn umzubenennen ändert nichts am
  // Inhalt dessen, was der Kunde freigibt — ein Konflikt wäre hier nur lästig.
  assert.equal(
    angebotAbdruck(angebot),
    angebotAbdruck({ ...angebot, dateiname: "Angebot-Badsanierung-final.pdf" })
  );
});

test("Fehlendes Angebot erzeugt trotzdem einen stabilen Abdruck", () => {
  assert.equal(angebotAbdruck(null), angebotAbdruck(undefined));
  assert.equal(angebotAbdruck(null).length, 64);
});
