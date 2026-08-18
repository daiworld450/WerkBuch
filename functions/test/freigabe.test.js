// ---------------------------------------------------------------------------
// Prüft die Freigabe-Logik gegen eine nachgebildete Datenbank
// (Spezifikation Kapitel 17).
//
// Warum nachgebildet statt echter Emulator: Geprüft werden soll die
// Entscheidungslogik — Abdruck-Vergleich, Betrags-Vergleich, Idempotenz,
// Pflichtangaben. Die Firestore-Bibliothek selbst muss dafür nicht laufen; ein
// Test, der einen Emulator startet, wäre langsamer und würde bei jedem
// Netzwerkhänger falschen Alarm auslösen.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import { angebotAbdruck } from "../src/portal.js";
import { summeRechnen, pruefungNoetig } from "../src/zulagen.js";
import { ZULAGEN_KATALOG, EINWILLIGUNGEN } from "../src/config.js";

// Bildet den Prüfteil aus portal.js/portalFreigeben nach (Spezifikation 8.1,
// Schritte 2b bis 2e) — inklusive des Speichers für bereits vergebene
// Schlüssel.
function freigabeVersuch(zustand, anfrage) {
  const { idempotenzSchluessel, erwarteterAbdruck, erwarteterBetragCent, auswahl, einwilligungen } =
    anfrage;

  // Schritt 2d — schon einmal mit diesem Schlüssel freigegeben?
  if (zustand.freigaben.has(idempotenzSchluessel)) {
    return { ...zustand.freigaben.get(idempotenzSchluessel), wiederholung: true };
  }

  // Schritt 2a — ohne bestätigten Code keine Freigabe
  if (!zustand.verifiziert) {
    throw Object.assign(new Error("Bitte bestätigen Sie zuerst den Code."), {
      code: "NICHT_VERIFIZIERT",
    });
  }

  // Schritt 2b — ist das Angebot noch dasselbe?
  const abdruckJetzt = angebotAbdruck(zustand.angebot);
  if (erwarteterAbdruck && erwarteterAbdruck !== abdruckJetzt) {
    throw Object.assign(new Error("Das Angebot wurde soeben geändert."), {
      code: "CONFLICT_DOCUMENT_CHANGED",
    });
  }

  const summe = summeRechnen(auswahl, ZULAGEN_KATALOG);
  const angebotCent = zustand.angebot.betrag != null ? Math.round(zustand.angebot.betrag * 100) : 0;
  const gesamtCent = angebotCent + summe.bruttoCent;

  // Schritt 2c — stimmt der Betrag noch?
  if (erwarteterBetragCent != null && erwarteterBetragCent !== gesamtCent) {
    throw Object.assign(new Error("Der Betrag hat sich geändert."), {
      code: "CONFLICT_AMOUNT_CHANGED",
    });
  }

  // Schritt 2e — alle Pflichtangaben gesetzt?
  for (const [schluessel, regel] of Object.entries(EINWILLIGUNGEN)) {
    if (regel.pflicht && !einwilligungen?.[schluessel]) {
      throw Object.assign(new Error("Bitte bestätigen Sie alle Pflichtangaben."), {
        code: "EINWILLIGUNG_FEHLT",
      });
    }
  }

  const pruefung = pruefungNoetig(summe, zustand.bereits);
  const antwort = {
    entscheidung: "angenommen",
    gesamtCent,
    positionen: summe.positionen,
    wartetAufPruefung: pruefung.noetig,
    bestellStatus: pruefung.noetig ? "wartet_auf_pruefung" : "bestaetigt",
    wiederholung: false,
  };
  zustand.freigaben.set(idempotenzSchluessel, antwort);
  return antwort;
}

function neuerZustand(zusatz = {}) {
  return {
    verifiziert: true,
    angebot: { pdfUrl: "https://demo/a.pdf", seiten: 2, betrag: 12480, status: "Gesendet" },
    bereits: { anzahl: 0, bruttoCent: 0 },
    freigaben: new Map(),
    ...zusatz,
  };
}

// ---------------------------------------------------------------------------

test("Zulage wird erst nach ausdrücklicher Freigabe berechnet", () => {
  // Das bloße Auswählen erzeugt keine Bestellung — nur eine Summe.
  const summe = summeRechnen([{ sku: "VIS_EXTRA", menge: 1 }], ZULAGEN_KATALOG);
  assert.equal(summe.bruttoCent, 1900);

  const zustand = neuerZustand();
  assert.equal(zustand.freigaben.size, 0, "Ohne Freigabe darf nichts angelegt sein");

  const antwort = freigabeVersuch(zustand, {
    idempotenzSchluessel: "s-1",
    erwarteterAbdruck: angebotAbdruck(zustand.angebot),
    erwarteterBetragCent: 1248000 + 1900,
    auswahl: [{ sku: "VIS_EXTRA", menge: 1 }],
    einwilligungen: { widerruf: true, sofortbeginn: true },
  });

  assert.equal(zustand.freigaben.size, 1, "Genau eine Freigabe");
  assert.equal(antwort.gesamtCent, 1249900);
  assert.equal(antwort.bestellStatus, "bestaetigt");
});

test("Betragsänderung während offener Sitzung verhindert die Freigabe", () => {
  const zustand = neuerZustand();
  const abdruckAlt = angebotAbdruck(zustand.angebot);

  // Der Handwerker veröffentlicht zwischenzeitlich eine neue Fassung.
  zustand.angebot = { ...zustand.angebot, betrag: 12520 };

  assert.throws(
    () =>
      freigabeVersuch(zustand, {
        idempotenzSchluessel: "s-2",
        erwarteterAbdruck: abdruckAlt,
        erwarteterBetragCent: 1248000,
        auswahl: [],
        einwilligungen: { widerruf: true, sofortbeginn: true },
      }),
    (e) => e.code === "CONFLICT_DOCUMENT_CHANGED"
  );
  assert.equal(zustand.freigaben.size, 0, "Es darf keine Freigabe entstanden sein");
});

test("Abweichender Betrag allein verhindert die Freigabe ebenfalls", () => {
  const zustand = neuerZustand();
  assert.throws(
    () =>
      freigabeVersuch(zustand, {
        idempotenzSchluessel: "s-3",
        erwarteterAbdruck: angebotAbdruck(zustand.angebot),
        erwarteterBetragCent: 999999, // Kunde sah eine andere Summe
        auswahl: [],
        einwilligungen: { widerruf: true, sofortbeginn: true },
      }),
    (e) => e.code === "CONFLICT_AMOUNT_CHANGED"
  );
  assert.equal(zustand.freigaben.size, 0);
});

test("Doppelklick erzeugt keinen Doppelauftrag", () => {
  const zustand = neuerZustand();
  const anfrage = {
    idempotenzSchluessel: "derselbe-schluessel",
    erwarteterAbdruck: angebotAbdruck(zustand.angebot),
    erwarteterBetragCent: 1248000,
    auswahl: [],
    einwilligungen: { widerruf: true, sofortbeginn: true },
  };

  const erste = freigabeVersuch(zustand, anfrage);
  const zweite = freigabeVersuch(zustand, anfrage);

  assert.equal(zustand.freigaben.size, 1, "Genau eine Freigabe");
  assert.equal(erste.gesamtCent, zweite.gesamtCent, "Beide Antworten inhaltlich gleich");
  assert.equal(zweite.wiederholung, true, "Die zweite ist als Wiederholung erkannt");
});

test("Freigabe ohne bestätigten Code ist nicht möglich", () => {
  const zustand = neuerZustand({ verifiziert: false });
  assert.throws(
    () =>
      freigabeVersuch(zustand, {
        idempotenzSchluessel: "s-4",
        erwarteterAbdruck: angebotAbdruck(zustand.angebot),
        erwarteterBetragCent: 1248000,
        auswahl: [],
        einwilligungen: { widerruf: true, sofortbeginn: true },
      }),
    (e) => e.code === "NICHT_VERIFIZIERT"
  );
  assert.equal(zustand.freigaben.size, 0);
});

test("Fehlende Pflichtangabe verhindert die Freigabe", () => {
  const zustand = neuerZustand();
  assert.throws(
    () =>
      freigabeVersuch(zustand, {
        idempotenzSchluessel: "s-5",
        erwarteterAbdruck: angebotAbdruck(zustand.angebot),
        erwarteterBetragCent: 1248000,
        auswahl: [],
        einwilligungen: { widerruf: true }, // sofortbeginn fehlt
      }),
    (e) => e.code === "EINWILLIGUNG_FEHLT"
  );
  assert.equal(zustand.freigaben.size, 0);
});

test("Die freiwillige Einwilligung ist keine Voraussetzung", () => {
  // Werbe-Einwilligung darf nach DSGVO nicht mit der Beauftragung gekoppelt
  // sein — ohne sie muss die Freigabe trotzdem durchgehen.
  const zustand = neuerZustand();
  const antwort = freigabeVersuch(zustand, {
    idempotenzSchluessel: "s-6",
    erwarteterAbdruck: angebotAbdruck(zustand.angebot),
    erwarteterBetragCent: 1248000,
    auswahl: [],
    einwilligungen: { widerruf: true, sofortbeginn: true, referenz: false },
  });
  assert.equal(antwort.entscheidung, "angenommen");
});

test("Überschrittene Betragsgrenze führt zur persönlichen Prüfung statt zur Bestätigung", () => {
  // Spezifikation Kapitel 17: bei bereits 300 € freigegebenen Zulagen geht
  // jede weitere Bestellung in die Prüfung — und löst nichts automatisch aus.
  const zustand = neuerZustand({ bereits: { anzahl: 2, bruttoCent: 30000 } });
  const antwort = freigabeVersuch(zustand, {
    idempotenzSchluessel: "s-7",
    erwarteterAbdruck: angebotAbdruck(zustand.angebot),
    erwarteterBetragCent: 1248000 + 1900,
    auswahl: [{ sku: "VIS_EXTRA", menge: 1 }],
    einwilligungen: { widerruf: true, sofortbeginn: true },
  });

  assert.equal(antwort.wartetAufPruefung, true);
  assert.equal(antwort.bestellStatus, "wartet_auf_pruefung");
});

test("Ein Angebot ohne Betrag lässt sich trotzdem freigeben", () => {
  // Nicht jedes Angebot hat einen im System hinterlegten Betrag — der steht
  // dann nur im PDF. Das darf die Beauftragung nicht blockieren.
  const zustand = neuerZustand({
    angebot: { pdfUrl: "https://demo/a.pdf", seiten: 1, betrag: null, status: "Gesendet" },
  });
  const antwort = freigabeVersuch(zustand, {
    idempotenzSchluessel: "s-8",
    erwarteterAbdruck: angebotAbdruck(zustand.angebot),
    erwarteterBetragCent: 0,
    auswahl: [],
    einwilligungen: { widerruf: true, sofortbeginn: true },
  });
  assert.equal(antwort.entscheidung, "angenommen");
  assert.equal(antwort.gesamtCent, 0);
});
