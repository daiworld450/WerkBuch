// ---------------------------------------------------------------------------
// Tests des Worker-Routers (worker/src/index.js).
//
// portal.js und authToken.js werden gemockt — geprüft wird nur das Routing
// selbst: richtige Weiterleitung, CORS-Positivliste, Fehler-Zuordnung auf
// HTTP-Status, Anmeldeprüfung für den geschützten Endpunkt.
// ---------------------------------------------------------------------------

import test, { mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

const ENV = {
  FIRESTORE_PROJEKT_ID: "berisa-bau",
  ERLAUBTE_HERKUENFTE: "https://daiworld450.github.io",
};

let portalMocks, authMock, worker, PortalFehler;

before(async () => {
  // Eine echte PortalFehler-Klasse wird gebraucht, damit "instanceof" im
  // Router funktioniert — deshalb hier real definiert statt komplett gemockt.
  class FakePortalFehler extends Error {
    constructor(code, nachricht, details = {}, httpStatus = 400) {
      super(nachricht);
      this.code = code;
      this.details = details;
      this.httpStatus = httpStatus;
    }
  }
  PortalFehler = FakePortalFehler;

  portalMocks = {
    portalAnsehen: mock.fn(async (env, daten) => ({ ok: true, token: daten.token })),
    portalCodeAnfordern: mock.fn(async () => ({ ok: true })),
    portalCodePruefen: mock.fn(async () => ({ ok: true })),
    portalZulagenRechnen: mock.fn(async () => ({ ok: true })),
    portalFreigeben: mock.fn(async () => ({ ok: true })),
    portalAblehnen: mock.fn(async () => ({ ok: true })),
    portalRueckfrage: mock.fn(async () => ({ ok: true })),
    angebotsLinkVersenden: mock.fn(async (env, daten, kontext) => ({ ok: true, uid: kontext.auth?.uid })),
    bewertungAnfordern: mock.fn(async (env, daten, kontext) => ({ ok: true, uid: kontext.auth?.uid })),
    katalogEinrichten: mock.fn(async () => ({ ok: true })),
    PortalFehler,
  };
  mock.module("../src/portal.js", { exports: portalMocks });

  authMock = { idTokenPruefen: mock.fn(async () => ({ uid: "hw-1", email: "hw@beispiel.de" })) };
  mock.module("../src/authToken.js", { exports: authMock });

  worker = (await import("../src/index.js")).default;
});

beforeEach(() => {
  for (const fn of Object.values(portalMocks)) {
    if (typeof fn === "function" && fn.mock) fn.mock.resetCalls();
  }
  authMock.idTokenPruefen.mock.resetCalls();
});

function anfrage(pfad, { methode = "POST", koerper, kopf = {} } = {}) {
  return new Request(`https://werkbuch.beispiel.workers.dev${pfad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...kopf },
    body: koerper !== undefined ? JSON.stringify(koerper) : undefined,
  });
}

test("/gesundheit antwortet ohne Weiterleitung an portal.js", async () => {
  const antwort = await worker.fetch(anfrage("/gesundheit", { methode: "GET" }), ENV);
  assert.equal(antwort.status, 200);
  const daten = await antwort.json();
  assert.equal(daten.ok, true);
});

test("Unbekannter Pfad ergibt 404", async () => {
  const antwort = await worker.fetch(anfrage("/nirgendwo", { koerper: {} }), ENV);
  assert.equal(antwort.status, 404);
});

test("Falsche Methode auf einem bekannten Pfad ergibt 405", async () => {
  const antwort = await worker.fetch(anfrage("/portal/ansehen", { methode: "GET" }), ENV);
  assert.equal(antwort.status, 405);
});

test("Kaputtes JSON ergibt 400 statt Absturz", async () => {
  const rohe = new Request("https://werkbuch.beispiel.workers.dev/portal/ansehen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ das ist kein json",
  });
  const antwort = await worker.fetch(rohe, ENV);
  assert.equal(antwort.status, 400);
});

test("/portal/ansehen leitet an portalAnsehen weiter und gibt dessen Antwort zurück", async () => {
  const antwort = await worker.fetch(anfrage("/portal/ansehen", { koerper: { token: "abc" } }), ENV);
  assert.equal(antwort.status, 200);
  const daten = await antwort.json();
  assert.equal(daten.token, "abc");
  assert.equal(portalMocks.portalAnsehen.mock.calls.length, 1);
});

test("PortalFehler wird 1:1 auf den passenden HTTP-Status abgebildet", async () => {
  portalMocks.portalFreigeben.mock.mockImplementationOnce(async () => {
    throw new PortalFehler("CONFLICT_AMOUNT_CHANGED", "Der Betrag hat sich geändert.", { x: 1 }, 409);
  });
  const antwort = await worker.fetch(anfrage("/portal/freigeben", { koerper: {} }), ENV);
  assert.equal(antwort.status, 409);
  const daten = await antwort.json();
  assert.equal(daten.fehler.code, "CONFLICT_AMOUNT_CHANGED");
  assert.equal(daten.fehler.x, 1);
});

test("Unerwarteter Fehler wird als 500 mit generischer Meldung beantwortet, ohne Interna preiszugeben", async () => {
  portalMocks.portalAnsehen.mock.mockImplementationOnce(async () => {
    throw new Error("geheimer Stacktrace-Text, der niemals beim Kunden landen darf");
  });
  const antwort = await worker.fetch(anfrage("/portal/ansehen", { koerper: {} }), ENV);
  assert.equal(antwort.status, 500);
  const daten = await antwort.json();
  assert.equal(daten.fehler.code, "UNBEKANNT");
  assert.doesNotMatch(daten.fehler.nachricht, /Stacktrace/);
});

test("Geschützter Endpunkt ohne Authorization-Header wird mit 401 abgewiesen, portal.js wird nicht aufgerufen", async () => {
  const antwort = await worker.fetch(
    anfrage("/handwerker/link-versenden", { koerper: { baustelleId: "b-1" } }),
    ENV
  );
  assert.equal(antwort.status, 401);
  assert.equal(portalMocks.angebotsLinkVersenden.mock.calls.length, 0);
});

test("Geschützter Endpunkt mit ungültigem Token wird mit 401 abgewiesen", async () => {
  authMock.idTokenPruefen.mock.mockImplementationOnce(async () => {
    throw new Error("Anmeldung ungültig.");
  });
  const antwort = await worker.fetch(
    anfrage("/handwerker/link-versenden", {
      koerper: { baustelleId: "b-1" },
      kopf: { Authorization: "Bearer kaputtes-token" },
    }),
    ENV
  );
  assert.equal(antwort.status, 401);
});

test("Geschützter Endpunkt mit gültigem Token reicht kontext.auth an portal.js weiter", async () => {
  const antwort = await worker.fetch(
    anfrage("/handwerker/link-versenden", {
      koerper: { baustelleId: "b-1" },
      kopf: { Authorization: "Bearer echtes-token" },
    }),
    ENV
  );
  assert.equal(antwort.status, 200);
  const daten = await antwort.json();
  assert.equal(daten.uid, "hw-1");
  assert.equal(authMock.idTokenPruefen.mock.calls.length, 1);
  assert.equal(authMock.idTokenPruefen.mock.calls[0].arguments[0], "echtes-token");
});

test("/handwerker/bewertung-anfordern leitet an bewertungAnfordern weiter (Anmeldung erforderlich)", async () => {
  const antwort = await worker.fetch(
    anfrage("/handwerker/bewertung-anfordern", {
      koerper: { baustelleId: "b-1" },
      kopf: { Authorization: "Bearer echtes-token" },
    }),
    ENV
  );
  assert.equal(antwort.status, 200);
  const daten = await antwort.json();
  assert.equal(daten.uid, "hw-1");
  assert.equal(portalMocks.bewertungAnfordern.mock.calls.length, 1);
});

test("/handwerker/bewertung-anfordern ohne Authorization-Header wird mit 401 abgewiesen", async () => {
  const antwort = await worker.fetch(
    anfrage("/handwerker/bewertung-anfordern", { koerper: { baustelleId: "b-1" } }),
    ENV
  );
  assert.equal(antwort.status, 401);
  assert.equal(portalMocks.bewertungAnfordern.mock.calls.length, 0);
});

// -------------------------------------------------------------------- CORS

test("Zugelassene Herkunft bekommt Access-Control-Allow-Origin gespiegelt", async () => {
  const antwort = await worker.fetch(
    anfrage("/gesundheit", { methode: "GET", kopf: { Origin: "https://daiworld450.github.io" } }),
    ENV
  );
  assert.equal(antwort.headers.get("Access-Control-Allow-Origin"), "https://daiworld450.github.io");
});

test("Fremde Herkunft bekommt KEIN Access-Control-Allow-Origin — Browser blockiert die Antwort dann selbst", async () => {
  const antwort = await worker.fetch(
    anfrage("/gesundheit", { methode: "GET", kopf: { Origin: "https://boesartig.example" } }),
    ENV
  );
  assert.equal(antwort.headers.get("Access-Control-Allow-Origin"), null);
});

test("OPTIONS-Preflight wird direkt beantwortet, ohne portal.js aufzurufen", async () => {
  const antwort = await worker.fetch(anfrage("/portal/ansehen", { methode: "OPTIONS" }), ENV);
  assert.equal(antwort.status, 204);
  assert.equal(portalMocks.portalAnsehen.mock.calls.length, 0);
});
