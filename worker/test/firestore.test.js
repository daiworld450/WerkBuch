// ---------------------------------------------------------------------------
// Tests des Firestore-REST-Clients (worker/src/firestore.js).
//
// Ohne Netzwerk und ohne echte Google-Zugangsdaten prüfbar sind zwei Dinge:
//  1. Die Kodierung/Dekodierung zwischen einfachen JS-Werten und Firestores
//     typisiertem REST-Format muss verlustfrei hin und zurück funktionieren.
//  2. Die Dienstkonto-JWT-Erzeugung muss ein korrekt signiertes RS256-JWT
//     liefern — geprüft mit einem selbst erzeugten Test-Schlüsselpaar, nicht
//     mit echten Zugangsdaten.
//
// Was hier NICHT geprüft wird (braucht ein echtes Firestore-Projekt): die
// eigentlichen HTTP-Aufrufe gegen firestore.googleapis.com, Transaktions-
// Konfliktverhalten. Das deckt der End-to-End-Check nach dem Deploy ab.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  zuFirestoreFelder,
  vonFirestoreFelder,
  vonFirestoreDokument,
  signiertesJwtErzeugen,
  sammlungAbfragen,
} from "../src/firestore.js";

// ---------------------------------------------------------------- Kodierung

test("Feld-Kodierung: alle Werttypen überstehen den Hin- und Rückweg", () => {
  const original = {
    text: "Berisa Bau",
    zahlGanz: 124800,
    zahlKomma: 19.5,
    wahr: true,
    falsch: false,
    leer: null,
    datum: new Date("2026-08-18T12:00:00.000Z"),
    liste: [1, "zwei", true, null],
    verschachtelt: { a: 1, b: { c: "tief" } },
  };
  const kodiert = zuFirestoreFelder(original);
  const dekodiert = vonFirestoreFelder(kodiert);

  assert.equal(dekodiert.text, "Berisa Bau");
  assert.equal(dekodiert.zahlGanz, 124800);
  assert.equal(dekodiert.zahlKomma, 19.5);
  assert.equal(dekodiert.wahr, true);
  assert.equal(dekodiert.falsch, false);
  assert.equal(dekodiert.leer, null);
  assert.equal(dekodiert.datum.toISOString(), "2026-08-18T12:00:00.000Z");
  assert.deepEqual(dekodiert.liste, [1, "zwei", true, null]);
  assert.deepEqual(dekodiert.verschachtelt, { a: 1, b: { c: "tief" } });
});

test("Feld-Kodierung: Ganzzahlen werden intern als String geführt (int64-sicher)", () => {
  const kodiert = zuFirestoreFelder({ betragCent: 124800 });
  assert.equal(kodiert.betragCent.integerValue, "124800");
  assert.equal(typeof kodiert.betragCent.integerValue, "string");
});

test("Feld-Kodierung: undefined-Felder werden weggelassen, nicht als nullValue gesendet", () => {
  const kodiert = zuFirestoreFelder({ a: 1, b: undefined });
  assert.ok("a" in kodiert);
  assert.ok(!("b" in kodiert));
});

test("Dokument-Dekodierung liest die ID aus dem letzten Namensabschnitt", () => {
  const dokument = {
    name: "projects/berisa-bau/databases/(default)/documents/zulagenKatalog/VIS_EXTRA",
    fields: { preisCent: { integerValue: "1900" } },
  };
  const ergebnis = vonFirestoreDokument(dokument);
  assert.equal(ergebnis.id, "VIS_EXTRA");
  assert.equal(ergebnis.preisCent, 1900);
});

test("Dokument-Dekodierung ohne fields liefert null (z.B. leeres Antwortobjekt)", () => {
  assert.equal(vonFirestoreDokument({ name: "x" }), null);
  assert.equal(vonFirestoreDokument(null), null);
});

// ------------------------------------------------------- Dienstkonto-JWT

// Test-Schlüsselpaar NUR für diesen Test — keine echten Google-Zugangsdaten.
async function testDienstkontoErzeugen() {
  const paar = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", paar.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  const pem =
    "-----BEGIN PRIVATE KEY-----\n" +
    (base64.match(/.{1,64}/g) || []).join("\n") +
    "\n-----END PRIVATE KEY-----\n";
  return {
    dienstkonto: { client_email: "test@beispiel.iam.gserviceaccount.com", private_key: pem },
    oeffentlicherSchluessel: paar.publicKey,
  };
}

function base64UrlDecodeJson(segment) {
  const normal = segment.replace(/-/g, "+").replace(/_/g, "/");
  const aufgefuellt = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  return JSON.parse(Buffer.from(aufgefuellt, "base64").toString("utf8"));
}

test("Dienstkonto-JWT ist wohlgeformt, korrekt signiert und trägt die richtigen Ansprüche", async () => {
  const { dienstkonto, oeffentlicherSchluessel } = await testDienstkontoErzeugen();
  const jwt = await signiertesJwtErzeugen(dienstkonto);

  const teile = jwt.split(".");
  assert.equal(teile.length, 3, "JWT muss aus Kopf.Anspruch.Signatur bestehen");

  const kopf = base64UrlDecodeJson(teile[0]);
  assert.equal(kopf.alg, "RS256");
  assert.equal(kopf.typ, "JWT");

  const anspruch = base64UrlDecodeJson(teile[1]);
  assert.equal(anspruch.iss, "test@beispiel.iam.gserviceaccount.com");
  assert.equal(anspruch.scope, "https://www.googleapis.com/auth/datastore");
  assert.equal(anspruch.aud, "https://oauth2.googleapis.com/token");
  assert.ok(anspruch.exp > anspruch.iat, "exp muss nach iat liegen");
  assert.equal(anspruch.exp - anspruch.iat, 3600);

  // Signatur mit dem passenden öffentlichen Schlüssel verifizieren.
  const signaturBytes = Buffer.from(teile[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const gueltig = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    oeffentlicherSchluessel,
    signaturBytes,
    new TextEncoder().encode(`${teile[0]}.${teile[1]}`)
  );
  assert.equal(gueltig, true, "Signatur muss mit dem öffentlichen Schlüssel des Dienstkontos passen");
});

test("Dienstkonto-JWT mit falschem Schlüssel lässt sich NICHT verifizieren", async () => {
  const { dienstkonto } = await testDienstkontoErzeugen();
  const { oeffentlicherSchluessel: fremderSchluessel } = await testDienstkontoErzeugen();
  const jwt = await signiertesJwtErzeugen(dienstkonto);
  const teile = jwt.split(".");
  const signaturBytes = Buffer.from(teile[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const gueltig = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    fremderSchluessel,
    signaturBytes,
    new TextEncoder().encode(`${teile[0]}.${teile[1]}`)
  );
  assert.equal(gueltig, false);
});

// -------------------------------------------------- sammlungAbfragen (transaktion)

test("sammlungAbfragen schickt das transaction-Feld nur mit, wenn eine Transaktion übergeben wird", async (t) => {
  const { dienstkonto } = await testDienstkontoErzeugen();
  const env = {
    FIRESTORE_PROJEKT_ID: "test-projekt",
    FIRESTORE_DIENSTKONTO_JSON: JSON.stringify(dienstkonto),
  };

  const angefragteKoerper = [];
  const echterFetch = global.fetch;
  global.fetch = async (url, optionen) => {
    const urlText = String(url);
    if (urlText.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    if (urlText.includes(":runQuery")) {
      angefragteKoerper.push(JSON.parse(optionen.body));
      return new Response(JSON.stringify([]), { status: 200 });
    }
    throw new Error("Unerwarteter fetch-Aufruf: " + urlText);
  };
  t.after(() => {
    global.fetch = echterFetch;
  });

  await sammlungAbfragen(env, "zulagenKatalog", { wo: [["aktiv", "==", true]] });
  await sammlungAbfragen(env, "zulagenKatalog", { wo: [["aktiv", "==", true]], transaktion: "tx-abc123" });

  assert.equal("transaction" in angefragteKoerper[0], false, "ohne Transaktion darf das Feld fehlen");
  assert.equal(angefragteKoerper[1].transaction, "tx-abc123", "mit Transaktion muss das Feld gesetzt sein");
});
