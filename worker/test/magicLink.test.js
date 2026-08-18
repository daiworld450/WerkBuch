// ---------------------------------------------------------------------------
// Tests des Zugangs per Link und des Sicherheitscodes
// (Spezifikation Kapitel 3 und 17).
//
// Portierung von functions/test/magicLink.test.js: tokenHashen, codeHashen
// und codePruefen sind in der Worker-Fassung async (Web Crypto statt
// node:crypto) — alle betroffenen Aufrufe hier entsprechend mit await.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  tokenErzeugen,
  tokenHashen,
  codeErzeugen,
  codeHashen,
  hashGleich,
  zugangPruefen,
  codePruefen,
  portalAdresse,
} from "../src/magicLink.js";
import { ZUGANG } from "../src/config.js";

test("Token ist lang, zufällig und link-tauglich", () => {
  const a = tokenErzeugen();
  const b = tokenErzeugen();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40, "Token zu kurz");
  // base64url: keine Zeichen, die in einer URL zerbrechen
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test("Aus dem Abdruck lässt sich der Token nicht zurücklesen", async () => {
  const token = tokenErzeugen();
  const abdruck = await tokenHashen(token);
  assert.notEqual(abdruck, token);
  assert.equal(abdruck.length, 64); // SHA-256 in Hex
  // Gleicher Token ergibt immer denselben Abdruck (sonst wäre er nicht suchbar)
  assert.equal(await tokenHashen(token), abdruck);
});

test("Code hat die vorgegebene Stellenzahl, auch mit führenden Nullen", () => {
  for (let i = 0; i < 50; i++) {
    const code = codeErzeugen();
    assert.equal(code.length, ZUGANG.codeStellen);
    assert.match(code, /^[0-9]+$/);
  }
});

test("Vergleich zweier Abdrücke arbeitet zeichenweise sicher", async () => {
  const a = await codeHashen("123456");
  assert.equal(hashGleich(a, await codeHashen("123456")), true);
  assert.equal(hashGleich(a, await codeHashen("123457")), false);
  assert.equal(hashGleich(a, "zu-kurz"), false);
  assert.equal(hashGleich(a, null), false);
});

test("Portal-Adresse wird korrekt zusammengesetzt", () => {
  assert.equal(
    portalAdresse("https://beispiel.de/WerkBuch", "abc123"),
    "https://beispiel.de/WerkBuch/angebot/abc123"
  );
});

// ------------------------------------------------------------- Zugangsprüfung

test("Unbekannter Zugang wird abgewiesen", () => {
  assert.deepEqual(zugangPruefen(null), { gueltig: false, grund: "unbekannt" });
});

test("Zurückgezogener Zugang wird abgewiesen", () => {
  const ergebnis = zugangPruefen({ widerrufen: true });
  assert.equal(ergebnis.gueltig, false);
  assert.equal(ergebnis.grund, "widerrufen");
});

test("Abgelaufener Zugang wird abgewiesen", () => {
  const gestern = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ergebnis = zugangPruefen({ laeuftAbAm: gestern });
  assert.equal(ergebnis.gueltig, false);
  assert.equal(ergebnis.grund, "abgelaufen");
});

test("Gültiger Zugang meldet, ob er schon bestätigt wurde", () => {
  const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000);
  assert.deepEqual(zugangPruefen({ laeuftAbAm: morgen }), { gueltig: true, verifiziert: false });
  assert.deepEqual(zugangPruefen({ laeuftAbAm: morgen, verifiziertAm: new Date() }), {
    gueltig: true,
    verifiziert: true,
  });
});

// ----------------------------------------------------------------- Codeprüfung

async function zugangMitCode(code, zusatz = {}) {
  return {
    codeHash: await codeHashen(code),
    codeGueltigBis: new Date(Date.now() + 10 * 60 * 1000),
    codeVersuche: 0,
    ...zusatz,
  };
}

test("Richtiger Code wird angenommen", async () => {
  assert.deepEqual(await codePruefen(await zugangMitCode("123456"), "123456"), { ok: true });
});

test("Leerzeichen um den Code stören nicht", async () => {
  assert.deepEqual(await codePruefen(await zugangMitCode("123456"), " 123456 "), { ok: true });
});

test("Falscher Code nennt die verbleibenden Versuche", async () => {
  const ergebnis = await codePruefen(await zugangMitCode("123456"), "999999");
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "falsch");
  assert.equal(ergebnis.verbleibend, ZUGANG.codeMaxVersuche - 1);
});

test("Nach zu vielen Fehlversuchen wird gesperrt", async () => {
  const ergebnis = await codePruefen(
    await zugangMitCode("123456", { codeVersuche: ZUGANG.codeMaxVersuche }),
    "123456"
  );
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "zu_viele_versuche");
});

test("Abgelaufener Code wird nicht mehr angenommen", async () => {
  const ergebnis = await codePruefen(
    await zugangMitCode("123456", { codeGueltigBis: new Date(Date.now() - 1000) }),
    "123456"
  );
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "abgelaufen");
});

test("Ohne angeforderten Code ist keine Prüfung möglich", async () => {
  const ergebnis = await codePruefen({}, "123456");
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "kein_code");
});
