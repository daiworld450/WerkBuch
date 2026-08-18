// ---------------------------------------------------------------------------
// Tests der Firebase-ID-Token-Prüfung ohne firebase-admin (worker/src/authToken.js).
//
// Google wird hier nicht wirklich angefragt: ein Test-Schlüsselpaar spielt
// die Rolle von Googles Signaturschlüssel, global.fetch wird für die
// JWK-Adresse auf dieses Test-Schlüsselpaar umgeleitet. Geprüft wird damit
// die tatsächliche Prüflogik (Signatur + alle Ansprüche), nicht nur, dass
// irgendein Netzwerkaufruf passiert.
// ---------------------------------------------------------------------------

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const PROJEKT_ID = "berisa-bau";
const KID = "test-schluessel-1";

let echterFetch;
let schluesselpaar;
let jwk;

function bytesZuBase64Url(bytes) {
  let roh = "";
  for (const b of bytes) roh += String.fromCharCode(b);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenBauen(anspruch, { privateKey = schluesselpaar.privateKey, kid = KID } = {}) {
  const kopf = { alg: "RS256", kid, typ: "JWT" };
  const unsigniert =
    bytesZuBase64Url(new TextEncoder().encode(JSON.stringify(kopf))) +
    "." +
    bytesZuBase64Url(new TextEncoder().encode(JSON.stringify(anspruch)));
  const signatur = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsigniert)
  );
  return unsigniert + "." + bytesZuBase64Url(new Uint8Array(signatur));
}

function gueltigerAnspruch(zusatz = {}) {
  const jetzt = Math.floor(Date.now() / 1000);
  return {
    iss: `https://securetoken.google.com/${PROJEKT_ID}`,
    aud: PROJEKT_ID,
    iat: jetzt - 10,
    exp: jetzt + 3600,
    auth_time: jetzt - 10,
    sub: "nutzer-abc123",
    email: "handwerker@berisabau.de",
    email_verified: true,
    ...zusatz,
  };
}

before(async () => {
  schluesselpaar = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const roheJwk = await crypto.subtle.exportKey("jwk", schluesselpaar.publicKey);
  jwk = { ...roheJwk, kid: KID, alg: "RS256", use: "sig" };

  echterFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    }
    throw new Error("Unerwarteter fetch-Aufruf in diesem Test: " + url);
  };
});

after(() => {
  global.fetch = echterFetch;
});

// Das Modul cacht die geladenen Schlüssel prozessweit — für die Tests hier
// unproblematisch, da alle mit demselben Test-JWK arbeiten. Frischer Import
// pro Testdatei reicht.
const { idTokenPruefen } = await import("../src/authToken.js");

test("Gültiges Token wird angenommen und liefert uid/E-Mail", async () => {
  const token = await tokenBauen(gueltigerAnspruch());
  const ergebnis = await idTokenPruefen(token, PROJEKT_ID);
  assert.equal(ergebnis.uid, "nutzer-abc123");
  assert.equal(ergebnis.email, "handwerker@berisabau.de");
  assert.equal(ergebnis.emailVerifiziert, true);
});

test("Token mit falscher Signatur wird abgelehnt", async () => {
  const fremdesPaar = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  // Signiert mit einem ANDEREN privaten Schlüssel, behauptet aber dieselbe kid
  // — genau der Angriff, den die Signaturprüfung abfangen muss.
  const token = await tokenBauen(gueltigerAnspruch(), { privateKey: fremdesPaar.privateKey });
  await assert.rejects(() => idTokenPruefen(token, PROJEKT_ID), /Anmeldung ungültig/);
});

test("Abgelaufenes Token wird abgelehnt", async () => {
  const jetzt = Math.floor(Date.now() / 1000);
  const token = await tokenBauen(gueltigerAnspruch({ exp: jetzt - 1000, iat: jetzt - 5000, auth_time: jetzt - 5000 }));
  await assert.rejects(() => idTokenPruefen(token, PROJEKT_ID), /Anmeldung ungültig/);
});

test("Falsches Projekt (aud) wird abgelehnt", async () => {
  const token = await tokenBauen(gueltigerAnspruch({ aud: "irgendein-anderes-projekt" }));
  await assert.rejects(() => idTokenPruefen(token, PROJEKT_ID), /Anmeldung ungültig/);
});

test("Falscher Aussteller (iss) wird abgelehnt", async () => {
  const token = await tokenBauen(gueltigerAnspruch({ iss: "https://securetoken.google.com/fremd" }));
  await assert.rejects(() => idTokenPruefen(token, PROJEKT_ID), /Anmeldung ungültig/);
});

test("Unbekannte kid (Schlüssel nicht im Cache) wird abgelehnt", async () => {
  const token = await tokenBauen(gueltigerAnspruch(), { kid: "kid-die-es-nicht-gibt" });
  await assert.rejects(() => idTokenPruefen(token, PROJEKT_ID), /Anmeldung ungültig/);
});

test("Fehlendes sub (uid) wird abgelehnt", async () => {
  const anspruch = gueltigerAnspruch();
  delete anspruch.sub;
  const token = await tokenBauen(anspruch);
  await assert.rejects(() => idTokenPruefen(token, PROJEKT_ID), /Anmeldung ungültig/);
});

test("Kaputtes Token (kein gültiges JWT-Format) wird abgelehnt", async () => {
  await assert.rejects(() => idTokenPruefen("kein.jwt", PROJEKT_ID), /Anmeldung ungültig/);
  await assert.rejects(() => idTokenPruefen("", PROJEKT_ID), /Anmeldung ungültig/);
  await assert.rejects(() => idTokenPruefen(null, PROJEKT_ID), /Anmeldung ungültig/);
});

test("alg ungleich RS256 wird abgelehnt (Alg-Verwirrung verhindern)", async () => {
  const anspruch = gueltigerAnspruch();
  const kopf = { alg: "none", kid: KID, typ: "JWT" };
  const gefaelscht =
    bytesZuBase64Url(new TextEncoder().encode(JSON.stringify(kopf))) +
    "." +
    bytesZuBase64Url(new TextEncoder().encode(JSON.stringify(anspruch))) +
    ".";
  await assert.rejects(() => idTokenPruefen(gefaelscht, PROJEKT_ID), /Anmeldung ungültig/);
});
