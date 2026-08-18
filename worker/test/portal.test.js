// ---------------------------------------------------------------------------
// Tests der Portal-Logik (worker/src/portal.js) — insbesondere portalFreigeben,
// der rechtlich und fachlich wichtigste Vorgang des Moduls (Spezifikation 8.1,
// Kapitel 17).
//
// firestore.js und mail.js werden hier durch einfache In-Speicher-Fassungen
// ersetzt (node:test-Modul-Mocking) — kein echtes Netzwerk, aber dieselbe
// Transaktionslogik (Lesen vor Schreiben, exists-Vorbedingungen) wie der
// echte Firestore-REST-Client.
//
// Aufruf: node --experimental-test-module-mocks --test test/portal.test.js
// (siehe package.json-Skript "test")
// ---------------------------------------------------------------------------

import test, { mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------- Fake-Firestore

function neueFakeFirestore() {
  const dokumente = new Map(); // pfad -> Objekt (ohne "id")
  let zaehler = 0;

  function docId(pfad) {
    const teile = pfad.split("/");
    return teile[teile.length - 1];
  }
  function sammlungsPfad(pfad) {
    const teile = pfad.split("/");
    teile.pop();
    return teile.join("/");
  }

  const api = {
    _dokumente: dokumente,
    _setzenRoh(pfad, daten) {
      dokumente.set(pfad, { ...daten });
    },
    neueDokumentId() {
      zaehler += 1;
      return `fake-id-${zaehler}`;
    },
    async dokumentLesen(env, pfad) {
      const d = dokumente.get(pfad);
      return d ? { id: docId(pfad), ...d } : null;
    },
    async dokumentErstellen(env, pfad, daten) {
      if (dokumente.has(pfad)) throw new Error(`Fake-Firestore: ${pfad} existiert schon`);
      dokumente.set(pfad, { ...daten });
      return { id: docId(pfad), ...daten };
    },
    async dokumentAktualisieren(env, pfad, teilDaten) {
      const bestehend = dokumente.get(pfad) || {};
      const neu = { ...bestehend };
      for (const [k, v] of Object.entries(teilDaten)) {
        if (v === undefined) delete neu[k];
        else neu[k] = v;
      }
      dokumente.set(pfad, neu);
      return { id: docId(pfad), ...neu };
    },
    async sammlungAbfragen(env, pfad, { wo = [] } = {}) {
      const treffer = [];
      for (const [p, d] of dokumente.entries()) {
        if (sammlungsPfad(p) !== pfad) continue;
        const passt = wo.every(([feld, op, wert]) => {
          if (op === "==") return d[feld] === wert;
          if (op === "in") return (wert || []).includes(d[feld]);
          throw new Error(`Fake-Firestore: Operator ${op} nicht unterstützt`);
        });
        if (passt) treffer.push({ id: docId(p), ...d });
      }
      return treffer;
    },
    async transaktionAusfuehren(env, ablauf) {
      const schreibvorgaenge = [];
      const werkzeug = {
        async lesen(pfad) {
          return api.dokumentLesen(env, pfad);
        },
        async abfragen(pfad, opts) {
          return api.sammlungAbfragen(env, pfad, opts);
        },
        erstellen(pfad, daten) {
          schreibvorgaenge.push({ art: "erstellen", pfad, daten });
        },
        aktualisieren(pfad, teilDaten) {
          schreibvorgaenge.push({ art: "aktualisieren", pfad, teilDaten });
        },
      };
      const ergebnis = await ablauf(werkzeug);
      // "Commit": exakt wie der echte Client geprüft — erstellen nur, wenn es
      // das Dokument noch nicht gibt; aktualisieren nur, wenn es das schon gibt.
      for (const sv of schreibvorgaenge) {
        if (sv.art === "erstellen") {
          if (dokumente.has(sv.pfad)) throw new Error(`Transaktion: ${sv.pfad} existiert schon`);
          dokumente.set(sv.pfad, { ...sv.daten });
        } else {
          if (!dokumente.has(sv.pfad)) throw new Error(`Transaktion: ${sv.pfad} existiert nicht`);
          const bestehend = dokumente.get(sv.pfad);
          const neu = { ...bestehend };
          for (const [k, v] of Object.entries(sv.teilDaten)) {
            if (v === undefined) delete neu[k];
            else neu[k] = v;
          }
          dokumente.set(sv.pfad, neu);
        }
      }
      return ergebnis;
    },
  };
  return api;
}

function neuerMailAufzeichner() {
  const gesendet = [];
  return {
    gesendet,
    angebotsLinkSenden: mock.fn(async (env, daten) => { gesendet.push({ art: "link", daten }); }),
    codeSenden: mock.fn(async (env, daten) => { gesendet.push({ art: "code", daten }); }),
    freigabeBestaetigen: mock.fn(async (env, daten) => { gesendet.push({ art: "freigabe", daten }); }),
    betriebBenachrichtigen: mock.fn(async (env, daten) => { gesendet.push({ art: "betrieb", daten }); }),
  };
}

// ------------------------------------------------------- Aufbau der Fixtur

const ENV = { FIRESTORE_PROJEKT_ID: "test-projekt" };
const BAUSTELLE_ID = "b-1";
const TOKEN = "roher-test-token";

let fake, mailAufzeichner, portal, magicLink;

before(async () => {
  fake = neueFakeFirestore();
  mailAufzeichner = neuerMailAufzeichner();

  mock.module("../src/firestore.js", {
    exports: {
      dokumentLesen: fake.dokumentLesen,
      dokumentErstellen: fake.dokumentErstellen,
      dokumentAktualisieren: fake.dokumentAktualisieren,
      sammlungAbfragen: fake.sammlungAbfragen,
      transaktionAusfuehren: fake.transaktionAusfuehren,
      neueDokumentId: fake.neueDokumentId,
    },
  });
  mock.module("../src/mail.js", { exports: mailAufzeichner });

  portal = await import("../src/portal.js");
  magicLink = await import("../src/magicLink.js");
});

async function fixturAufsetzen() {
  fake._dokumente.clear();
  mailAufzeichner.gesendet.length = 0;

  const hash = await magicLink.tokenHashen(TOKEN);
  const codeHash = await magicLink.codeHashen("123456");

  fake._setzenRoh(`baustellen/${BAUSTELLE_ID}`, {
    name: "Bad Musterstraße",
    adresse: "Musterstraße 1",
    status: "In Ausführung",
    handwerkerId: "hw-1",
    kundeName: "Erika Musterfrau",
  });
  fake._setzenRoh(`baustellen/${BAUSTELLE_ID}/angebot/aktuell`, {
    pdfUrl: "https://res.cloudinary.com/demo/angebot.pdf",
    seiten: 3,
    betrag: 1248,
    status: "Gesendet",
  });
  fake._setzenRoh(`magicLinks/${hash}`, {
    baustelleId: BAUSTELLE_ID,
    email: "kunde@beispiel.de",
    kundeName: "Erika Musterfrau",
    laeuftAbAm: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    widerrufen: false,
    verifiziertAm: new Date(),
    codeHash,
    codeVersuche: 0,
  });
  fake._setzenRoh("zulagenKatalog/VIS_EXTRA", {
    sku: "VIS_EXTRA",
    name: "Weitere Visualisierung",
    beschreibung: "x",
    einheit: "Stück",
    preisCent: 1900,
    ustSatz: 19,
    typ: "stueck",
    gibtGuthaben: 1,
    maxMengeJeBestellung: 10,
    braucht_pruefung: false,
    aktiv: true,
    reihenfolge: 10,
    staffeln: [],
  });

  return { hash };
}

// ------------------------------------------------------------ portalAnsehen

test("portalAnsehen liefert Angebot, Katalog und Abdruck", async () => {
  await fixturAufsetzen();
  const ergebnis = await portal.portalAnsehen({}, { token: TOKEN });
  assert.equal(ergebnis.baustelle.name, "Bad Musterstraße");
  assert.equal(ergebnis.angebot.betragCent, 124800);
  assert.equal(ergebnis.katalog.length, 1);
  assert.equal(ergebnis.katalog[0].sku, "VIS_EXTRA");
  assert.equal(typeof ergebnis.angebot.abdruck, "string");
  assert.equal(ergebnis.angebot.abdruck.length, 64);
});

test("portalAnsehen mit unbekanntem Token wirft ZUGANG_UNGUELTIG", async () => {
  await fixturAufsetzen();
  await assert.rejects(
    () => portal.portalAnsehen({}, { token: "existiert-nicht" }),
    (e) => e.code === "ZUGANG_UNGUELTIG"
  );
});

// -------------------------------------------------------------- Freigeben

test("portalFreigeben legt einen Freigabe-Datensatz und (bei Zulage) eine Bestellung + Guthaben an", async () => {
  await fixturAufsetzen();
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });

  const ergebnis = await portal.portalFreigeben(
    {},
    {
      token: TOKEN,
      idempotenzSchluessel: "schluessel-1",
      erwarteterAbdruck: angebotDaten.angebot.abdruck,
      erwarteterBetragCent: 124800 + 1900,
      auswahl: [{ sku: "VIS_EXTRA", menge: 1 }],
      einwilligungen: { widerruf: true, sofortbeginn: true },
    },
    { ip: "1.2.3.4", userAgent: "Testbrowser" }
  );

  assert.equal(ergebnis.entscheidung, "angenommen");
  assert.equal(ergebnis.gesamtCent, 124800 + 1900);

  const freigabe = fake._dokumente.get(`baustellen/${BAUSTELLE_ID}/freigaben/schluessel-1`);
  assert.ok(freigabe, "Freigabe-Datensatz muss existieren");
  assert.equal(freigabe.betragBruttoCent, 124800 + 1900);
  assert.equal(freigabe.ipAdresse, "1.2.3.4");

  const angebotNachher = fake._dokumente.get(`baustellen/${BAUSTELLE_ID}/angebot/aktuell`);
  assert.equal(angebotNachher.status, "Angenommen");

  const bestellungen = [...fake._dokumente.entries()].filter(([p]) =>
    p.startsWith(`baustellen/${BAUSTELLE_ID}/zulagenBestellungen/`)
  );
  assert.equal(bestellungen.length, 1);
  assert.equal(bestellungen[0][1].status, "bestaetigt");

  const guthabenEintraege = [...fake._dokumente.entries()].filter(([p]) =>
    p.startsWith(`baustellen/${BAUSTELLE_ID}/guthaben/`)
  );
  // Ein Eintrag für die Zulage (1 Guthaben) + ein Eintrag für das Grundpaket
  // (3 Guthaben, da es die erste Freigabe für diesen Zugang ist).
  assert.equal(guthabenEintraege.length, 2);
  const gruende = guthabenEintraege.map(([, d]) => d.grund).sort();
  assert.deepEqual(gruende, ["paket", "zulage"]);

  assert.equal(mailAufzeichner.gesendet.filter((m) => m.art === "freigabe").length, 1);
  assert.equal(mailAufzeichner.gesendet.filter((m) => m.art === "betrieb").length, 1);
});

test("Überschrittene Betragsgrenze führt zur persönlichen Prüfung statt zur automatischen Bestätigung", async () => {
  await fixturAufsetzen();
  // Auf dieser Baustelle sind schon 300 € an Zulagen freigegeben — genau die
  // Grenze aus Spezifikation 6.4/17. Jede weitere Bestellung muss angehalten
  // werden, statt automatisch durchzulaufen.
  fake._setzenRoh(`baustellen/${BAUSTELLE_ID}/zulagenBestellungen/schon-vorhanden`, {
    status: "bestaetigt",
    bruttoCent: 30000,
    positionen: [{ sku: "VIS_EXTRA", menge: 1, bruttoCent: 30000, gibtGuthaben: 1 }],
  });
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });

  const ergebnis = await portal.portalFreigeben(
    {},
    {
      token: TOKEN,
      idempotenzSchluessel: "ueber-der-grenze",
      erwarteterAbdruck: angebotDaten.angebot.abdruck,
      erwarteterBetragCent: 124800 + 1900,
      auswahl: [{ sku: "VIS_EXTRA", menge: 1 }],
      einwilligungen: { widerruf: true, sofortbeginn: true },
    },
    {}
  );

  assert.equal(ergebnis.wartetAufPruefung, true);
  assert.equal(ergebnis.pruefGrund, "summe");

  const neueBestellung = [...fake._dokumente.entries()].find(
    ([p, d]) => p.startsWith(`baustellen/${BAUSTELLE_ID}/zulagenBestellungen/`) && d.freigabeId === "ueber-der-grenze"
  );
  assert.equal(neueBestellung[1].status, "wartet_auf_pruefung");

  // Ohne Prüfung kein Guthaben — nur der (unveränderte) Grundpaket-Eintrag
  // darf entstanden sein, keiner für die wartende Zulage.
  const guthabenFuerZulage = [...fake._dokumente.entries()].filter(
    ([p, d]) => p.startsWith(`baustellen/${BAUSTELLE_ID}/guthaben/`) && d.grund === "zulage"
  );
  assert.equal(guthabenFuerZulage.length, 0, "wartende Zulage darf kein Guthaben gutschreiben");
});

test("Ein Angebot ohne hinterlegten Betrag lässt sich trotzdem freigeben", async () => {
  await fixturAufsetzen();
  fake._setzenRoh(`baustellen/${BAUSTELLE_ID}/angebot/aktuell`, {
    pdfUrl: "https://res.cloudinary.com/demo/angebot.pdf",
    seiten: 1,
    betrag: null,
    status: "Gesendet",
  });
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });
  assert.equal(angebotDaten.angebot.betragCent, null);

  const ergebnis = await portal.portalFreigeben(
    {},
    {
      token: TOKEN,
      idempotenzSchluessel: "ohne-betrag",
      erwarteterAbdruck: angebotDaten.angebot.abdruck,
      erwarteterBetragCent: 0,
      auswahl: [],
      einwilligungen: { widerruf: true, sofortbeginn: true },
    },
    {}
  );

  assert.equal(ergebnis.entscheidung, "angenommen");
  assert.equal(ergebnis.gesamtCent, 0);
});

test("Doppelte Freigabe mit demselben Schlüssel gibt dieselbe Antwort zurück, ohne erneut zu schreiben oder zu mailen", async () => {
  await fixturAufsetzen();
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });
  const eingabe = {
    token: TOKEN,
    idempotenzSchluessel: "schluessel-doppelt",
    erwarteterAbdruck: angebotDaten.angebot.abdruck,
    erwarteterBetragCent: 124800,
    auswahl: [],
    einwilligungen: { widerruf: true, sofortbeginn: true },
  };

  const erste = await portal.portalFreigeben({}, eingabe, {});
  mailAufzeichner.gesendet.length = 0; // Zähler zurücksetzen, um die Wiederholung isoliert zu prüfen

  const zweite = await portal.portalFreigeben({}, eingabe, {});
  assert.deepEqual(zweite, erste);
  assert.equal(mailAufzeichner.gesendet.length, 0, "bei einer Wiederholung darf keine Mail erneut versendet werden");
});

test("Geänderter Abdruck während offener Sitzung löst CONFLICT_DOCUMENT_CHANGED (409) aus", async () => {
  await fixturAufsetzen();
  await assert.rejects(
    () =>
      portal.portalFreigeben(
        {},
        {
          token: TOKEN,
          idempotenzSchluessel: "schluessel-2",
          erwarteterAbdruck: "ein-veralteter-abdruck",
          erwarteterBetragCent: 124800,
          auswahl: [],
          einwilligungen: { widerruf: true, sofortbeginn: true },
        },
        {}
      ),
    (e) => e.code === "CONFLICT_DOCUMENT_CHANGED" && e.httpStatus === 409
  );
});

test("Geänderter Betrag löst CONFLICT_AMOUNT_CHANGED (409) aus", async () => {
  await fixturAufsetzen();
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });
  await assert.rejects(
    () =>
      portal.portalFreigeben(
        {},
        {
          token: TOKEN,
          idempotenzSchluessel: "schluessel-3",
          erwarteterAbdruck: angebotDaten.angebot.abdruck,
          erwarteterBetragCent: 1,
          auswahl: [],
          einwilligungen: { widerruf: true, sofortbeginn: true },
        },
        {}
      ),
    (e) => e.code === "CONFLICT_AMOUNT_CHANGED" && e.httpStatus === 409
  );
});

test("Freigabe ohne erwarteterAbdruck wird abgelehnt, statt die Prüfung stillschweigend zu überspringen", async () => {
  // Regressionstest: erwarteterAbdruck/-Betrag waren zunächst nur GEPRÜFT,
  // wenn mitgeschickt — ein weggelassenes Feld hätte Schritt 2b/2c aus
  // Spezifikation 8.1 komplett umgangen. Beide sind jetzt Pflicht.
  await fixturAufsetzen();
  await assert.rejects(
    () =>
      portal.portalFreigeben(
        {},
        {
          token: TOKEN,
          idempotenzSchluessel: "ohne-abdruck",
          erwarteterBetragCent: 124800,
          auswahl: [],
          einwilligungen: { widerruf: true, sofortbeginn: true },
        },
        {}
      ),
    (e) => e.code === "ABDRUCK_FEHLT"
  );
  assert.equal(fake._dokumente.has(`baustellen/${BAUSTELLE_ID}/freigaben/ohne-abdruck`), false);
});

test("Freigabe ohne erwarteterBetragCent wird abgelehnt, statt die Prüfung stillschweigend zu überspringen", async () => {
  await fixturAufsetzen();
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });
  await assert.rejects(
    () =>
      portal.portalFreigeben(
        {},
        {
          token: TOKEN,
          idempotenzSchluessel: "ohne-betrag",
          erwarteterAbdruck: angebotDaten.angebot.abdruck,
          auswahl: [],
          einwilligungen: { widerruf: true, sofortbeginn: true },
        },
        {}
      ),
    (e) => e.code === "BETRAG_FEHLT"
  );
  assert.equal(fake._dokumente.has(`baustellen/${BAUSTELLE_ID}/freigaben/ohne-betrag`), false);
});

test("Fehlende Pflicht-Einwilligung löst EINWILLIGUNG_FEHLT (422) aus, keine Freigabe entsteht", async () => {
  await fixturAufsetzen();
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });
  await assert.rejects(
    () =>
      portal.portalFreigeben(
        {},
        {
          token: TOKEN,
          idempotenzSchluessel: "schluessel-4",
          erwarteterAbdruck: angebotDaten.angebot.abdruck,
          erwarteterBetragCent: 124800,
          auswahl: [],
          einwilligungen: { widerruf: true }, // sofortbeginn fehlt
        },
        {}
      ),
    (e) => e.code === "EINWILLIGUNG_FEHLT" && e.httpStatus === 422
  );
  assert.equal(fake._dokumente.has(`baustellen/${BAUSTELLE_ID}/freigaben/schluessel-4`), false);
});

test("Freigabe ohne verifizierten Zugang wird mit 401 abgewiesen", async () => {
  const { hash } = await fixturAufsetzen();
  // Verifikation zurücknehmen — simuliert einen Kunden, der den Code nie bestätigt hat.
  await fake.dokumentAktualisieren({}, `magicLinks/${hash}`, { verifiziertAm: undefined });
  await assert.rejects(
    () =>
      portal.portalFreigeben(
        {},
        {
          token: TOKEN,
          idempotenzSchluessel: "schluessel-5",
          auswahl: [],
          einwilligungen: { widerruf: true, sofortbeginn: true },
        },
        {}
      ),
    (e) => e.code === "NICHT_VERIFIZIERT" && e.httpStatus === 401
  );
});

test("Grundpaket-Guthaben wird bei einer zweiten Freigabe desselben Zugangs nicht doppelt gutgeschrieben", async () => {
  await fixturAufsetzen();
  const angebotDaten = await portal.portalAnsehen({}, { token: TOKEN });

  await portal.portalFreigeben(
    {},
    {
      token: TOKEN,
      idempotenzSchluessel: "erste-freigabe",
      erwarteterAbdruck: angebotDaten.angebot.abdruck,
      erwarteterBetragCent: 124800,
      auswahl: [],
      einwilligungen: { widerruf: true, sofortbeginn: true },
    },
    {}
  );

  // Zweite, andere Freigabe (anderer Idempotenzschlüssel) auf demselben
  // Zugang — der Abdruck hat sich durch die erste Freigabe bereits geändert
  // (Status "Angenommen"), deshalb hier frisch abgefragt. erwarteterAbdruck/
  // -Betrag sind seit der Korrektur Pflichtfelder; das isoliert prüfen wir
  // weiter unten separat.
  const angebotJetzt = await portal.portalAnsehen({}, { token: TOKEN });
  await portal.portalFreigeben(
    {},
    {
      token: TOKEN,
      idempotenzSchluessel: "zweite-freigabe",
      erwarteterAbdruck: angebotJetzt.angebot.abdruck,
      erwarteterBetragCent: 124800,
      auswahl: [],
      einwilligungen: { widerruf: true, sofortbeginn: true },
    },
    {}
  );

  const guthabenPaket = [...fake._dokumente.entries()].filter(
    ([p, d]) => p.startsWith(`baustellen/${BAUSTELLE_ID}/guthaben/`) && d.grund === "paket"
  );
  assert.equal(guthabenPaket.length, 1, "Grundpaket darf nur einmal gutgeschrieben werden");
});

// -------------------------------------------------------------- Ablehnen

test("portalAblehnen setzt Status auf Abgelehnt und sendet Mails nur einmal bei Wiederholung", async () => {
  await fixturAufsetzen();
  const eingabe = { token: TOKEN, idempotenzSchluessel: "ablehnung-1", grund: "zu teuer" };

  await portal.portalAblehnen({}, eingabe, {});
  const angebotNachher = fake._dokumente.get(`baustellen/${BAUSTELLE_ID}/angebot/aktuell`);
  assert.equal(angebotNachher.status, "Abgelehnt");
  assert.equal(mailAufzeichner.gesendet.length, 2); // Kunde + Betrieb

  mailAufzeichner.gesendet.length = 0;
  await portal.portalAblehnen({}, eingabe, {});
  assert.equal(mailAufzeichner.gesendet.length, 0, "Wiederholung darf keine zweite Mail auslösen");
});

// ------------------------------------------------------------ Code-Prüfung

test("portalCodePruefen zählt Fehlversuche hoch und sperrt nach der Höchstzahl", async () => {
  const { hash } = await fixturAufsetzen();
  await fake.dokumentAktualisieren({}, `magicLinks/${hash}`, { codeVersuche: 4 }); // ZUGANG.codeMaxVersuche = 5

  await assert.rejects(
    () => portal.portalCodePruefen({}, { token: TOKEN, code: "000000" }),
    (e) => e.code === "CODE_FALSCH"
  );
  const nachher = fake._dokumente.get(`magicLinks/${hash}`);
  assert.equal(nachher.codeVersuche, 5);

  await assert.rejects(
    () => portal.portalCodePruefen({}, { token: TOKEN, code: "123456" }),
    (e) => e.code === "CODE_UNGUELTIG" && e.details.grund === "zu_viele_versuche"
  );
});

// ------------------------------------------------------------ Link versenden

test("angebotsLinkVersenden ohne Anmeldung wird mit 401 abgewiesen", async () => {
  await fixturAufsetzen();
  await assert.rejects(
    () => portal.angebotsLinkVersenden({}, { baustelleId: BAUSTELLE_ID, email: "x@y.de" }, {}),
    (e) => e.code === "NICHT_ANGEMELDET" && e.httpStatus === 401
  );
});

test("angebotsLinkVersenden für eine fremde Baustelle wird mit 403 abgewiesen", async () => {
  await fixturAufsetzen();
  await assert.rejects(
    () =>
      portal.angebotsLinkVersenden(
        {},
        { baustelleId: BAUSTELLE_ID, email: "x@y.de" },
        { auth: { uid: "jemand-anderes" } }
      ),
    (e) => e.code === "KEIN_ZUGRIFF" && e.httpStatus === 403
  );
});

test("angebotsLinkVersenden widerruft alte Links und legt genau einen neuen an", async () => {
  const { hash: alterHash } = await fixturAufsetzen();

  const ergebnis = await portal.angebotsLinkVersenden(
    {},
    { baustelleId: BAUSTELLE_ID, email: "neu@beispiel.de", kundeName: "Neuer Kunde" },
    { auth: { uid: "hw-1" } }
  );

  assert.ok(ergebnis.adresse.includes("/angebot/"));
  const alterZugang = fake._dokumente.get(`magicLinks/${alterHash}`);
  assert.equal(alterZugang.widerrufen, true);

  const neueLinks = [...fake._dokumente.entries()].filter(
    ([p, d]) => p.startsWith("magicLinks/") && p !== `magicLinks/${alterHash}`
  );
  assert.equal(neueLinks.length, 1);
  assert.equal(neueLinks[0][1].email, "neu@beispiel.de");
  assert.equal(mailAufzeichner.gesendet.filter((m) => m.art === "link").length, 1);
});

// -------------------------------------------------------- Katalog einrichten

test("katalogEinrichten ohne Anmeldung wird mit 401 abgewiesen", async () => {
  await fixturAufsetzen();
  await assert.rejects(
    () => portal.katalogEinrichten({}, {}, {}),
    (e) => e.code === "NICHT_ANGEMELDET" && e.httpStatus === 401
  );
});

test("katalogEinrichten für einen Nicht-Besitzer wird mit 403 abgewiesen, selbst mit gültiger Anmeldung", async () => {
  await fixturAufsetzen();
  await assert.rejects(
    () =>
      portal.katalogEinrichten(
        {},
        {},
        { auth: { uid: "irgendwer", email: "fremd@beispiel.de", emailVerifiziert: true } }
      ),
    (e) => e.code === "KEIN_ZUGRIFF" && e.httpStatus === 403
  );
});

test("katalogEinrichten mit nicht bestätigter Besitzer-E-Mail wird ebenfalls abgewiesen", async () => {
  await fixturAufsetzen();
  await assert.rejects(
    () =>
      portal.katalogEinrichten(
        {},
        {},
        { auth: { uid: "hw-1", email: "berisabau@gmail.com", emailVerifiziert: false } }
      ),
    (e) => e.code === "KEIN_ZUGRIFF"
  );
});

test("katalogEinrichten legt fehlende Einträge an, überschreibt aber vorhandene nicht", async () => {
  await fixturAufsetzen(); // enthält bereits zulagenKatalog/VIS_EXTRA mit preisCent 1900
  fake._dokumente.set("zulagenKatalog/VIS_EXTRA", { ...fake._dokumente.get("zulagenKatalog/VIS_EXTRA"), preisCent: 9999 });

  const ergebnis = await portal.katalogEinrichten(
    {},
    {},
    { auth: { uid: "hw-1", email: "berisabau@gmail.com", emailVerifiziert: true } }
  );

  assert.ok(ergebnis.gesamt >= 5, "der volle Katalog aus config.js muss als Grundlage dienen");
  assert.equal(ergebnis.angelegt, ergebnis.gesamt - 1, "nur der eine schon vorhandene Eintrag wird übersprungen");
  assert.equal(
    fake._dokumente.get("zulagenKatalog/VIS_EXTRA").preisCent,
    9999,
    "vorhandener, ggf. vom Betrieb angepasster Preis darf nicht zurückgesetzt werden"
  );
  assert.ok(fake._dokumente.has("zulagenKatalog/EXPRESS_24H"), "neuer Eintrag muss angelegt worden sein");
});
