// ---------------------------------------------------------------------------
// Tests des Mailversands über Brevo (worker/src/mail.js).
//
// global.fetch wird auf einen Aufzeichner umgeleitet — kein echter Versand,
// aber die tatsächlich gebaute Anfrage (Empfänger, Betreff, HTML-Inhalt) wird
// geprüft. Besonderes Augenmerk: Werte aus Kunden-/Handwerkereingaben dürfen
// nicht ungeschützt ins HTML wandern (siehe Kommentar in mail.js).
// ---------------------------------------------------------------------------

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  angebotsLinkSenden,
  codeSenden,
  freigabeBestaetigen,
  bewertungAnfragen,
  betriebBenachrichtigen,
} from "../src/mail.js";

let echterFetch;
let letzteAnfrage;

before(() => {
  echterFetch = global.fetch;
});
after(() => {
  global.fetch = echterFetch;
});

beforeEach(() => {
  letzteAnfrage = null;
  global.fetch = async (url, optionen) => {
    letzteAnfrage = { url: String(url), optionen, koerper: JSON.parse(optionen.body) };
    return new Response(JSON.stringify({ messageId: "test-1" }), { status: 201 });
  };
});

const ENV = { BREVO_API_KEY: "test-schluessel" };

test("angebotsLinkSenden ruft Brevo mit den richtigen Grunddaten auf", async () => {
  await angebotsLinkSenden(ENV, {
    an: "kunde@beispiel.de",
    kundeName: "Max Mustermann",
    adresse: "https://daiworld450.github.io/WerkBuch/angebot/abc123",
    betragCent: 124800,
    gueltigBis: "17.09.2026",
  });

  assert.equal(letzteAnfrage.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(letzteAnfrage.optionen.headers["api-key"], "test-schluessel");
  assert.equal(letzteAnfrage.koerper.to[0].email, "kunde@beispiel.de");
  assert.match(letzteAnfrage.koerper.subject, /1\.248,00/);
  assert.match(letzteAnfrage.koerper.htmlContent, /Max Mustermann/);
  assert.match(letzteAnfrage.koerper.textContent, /abc123/);
});

test("angebotsLinkSenden ohne Brevo-Schlüssel wirft einen klaren Fehler", async () => {
  await assert.rejects(
    () => angebotsLinkSenden({}, { an: "x@y.de", adresse: "https://x", gueltigBis: "heute" }),
    /BREVO_API_KEY/
  );
});

test("Kundenname mit HTML-Zeichen landet escaped in der Mail, nicht als rohes HTML", async () => {
  await angebotsLinkSenden(ENV, {
    an: "kunde@beispiel.de",
    kundeName: '<img src=x onerror="alert(1)">',
    adresse: "https://x",
    gueltigBis: "heute",
  });
  assert.doesNotMatch(letzteAnfrage.koerper.htmlContent, /<img src=x onerror/);
  assert.match(letzteAnfrage.koerper.htmlContent, /&lt;img/);
});

test("codeSenden überträgt den Code in Betreff und Inhalt", async () => {
  await codeSenden(ENV, { an: "kunde@beispiel.de", code: "482913" });
  assert.match(letzteAnfrage.koerper.subject, /482913/);
  assert.match(letzteAnfrage.koerper.htmlContent, /482913/);
});

test("freigabeBestaetigen (angenommen) listet Positionen und Gesamtsumme", async () => {
  await freigabeBestaetigen(ENV, {
    an: "kunde@beispiel.de",
    kundeName: "Erika Musterfrau",
    entscheidung: "angenommen",
    betragCent: 132700,
    zeitpunkt: "18.08.2026, 14:32 Uhr",
    positionen: [{ menge: 1, name: "Weitere Visualisierung", bruttoCent: 1900 }],
  });
  assert.match(letzteAnfrage.koerper.htmlContent, /Weitere Visualisierung/);
  assert.match(letzteAnfrage.koerper.htmlContent, /1\.327,00/);
});

test("freigabeBestaetigen (abgelehnt) nennt keine Summe im Betreff", async () => {
  await freigabeBestaetigen(ENV, {
    an: "kunde@beispiel.de",
    kundeName: "Erika Musterfrau",
    entscheidung: "abgelehnt",
    zeitpunkt: "18.08.2026",
    positionen: [],
  });
  assert.doesNotMatch(letzteAnfrage.koerper.subject, /€/);
});

test("betriebBenachrichtigen escaped Zeilen (z.B. Kundenrückfrage) im HTML", async () => {
  await betriebBenachrichtigen(ENV, {
    an: "berisabau@gmail.com",
    titel: "Neue Rückfrage",
    zeilen: ['Kunde schreibt: <script>böse()</script>'],
  });
  assert.doesNotMatch(letzteAnfrage.koerper.htmlContent, /<script>/);
  assert.match(letzteAnfrage.koerper.htmlContent, /&lt;script&gt;/);
});

test("bewertungAnfragen verlinkt den mitgegebenen Bewertungslink und Kundennamen", async () => {
  await bewertungAnfragen(ENV, {
    an: "kunde@beispiel.de",
    kundeName: "Erika Musterfrau",
    bewertungsLink: "https://g.page/r/beispiel/review",
  });
  assert.match(letzteAnfrage.koerper.htmlContent, /Erika Musterfrau/);
  assert.match(letzteAnfrage.koerper.htmlContent, /https:\/\/g\.page\/r\/beispiel\/review/);
  assert.match(letzteAnfrage.koerper.textContent, /https:\/\/g\.page\/r\/beispiel\/review/);
});

test("bewertungAnfragen escaped einen manipulierten Kundennamen im HTML", async () => {
  await bewertungAnfragen(ENV, {
    an: "kunde@beispiel.de",
    kundeName: '<img src=x onerror="alert(1)">',
    bewertungsLink: "https://g.page/r/beispiel/review",
  });
  assert.doesNotMatch(letzteAnfrage.koerper.htmlContent, /<img src=x onerror/);
  assert.match(letzteAnfrage.koerper.htmlContent, /&lt;img/);
});

test("Fehlschlag bei Brevo wirft mit HTTP-Status in der Meldung", async () => {
  global.fetch = async () => new Response("ungültiger Absender", { status: 400 });
  await assert.rejects(
    () => codeSenden(ENV, { an: "kunde@beispiel.de", code: "123456" }),
    /HTTP 400/
  );
});
