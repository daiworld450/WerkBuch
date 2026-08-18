// ---------------------------------------------------------------------------
// Prüft die Firestore-Sicherheitsregeln gegen den Firebase-Emulator.
//
// Der wichtigste Fall hier: Freigaben, Protokoll und Guthaben müssen für JEDEN
// Client schreibgeschützt sein — auch für den Handwerker. Firestore verknüpft
// alle passenden Regeln mit ODER; eine allgemeine Sammelregel kann eine
// speziellere Sperre deshalb versehentlich wieder aufheben. Genau dieser
// Fehler wäre ohne Test unbemerkt geblieben und hätte den ganzen Nachweis
// wertlos gemacht.
//
// Aufruf: npm run test:regeln   (startet den Emulator selbst)
// ---------------------------------------------------------------------------

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

const HANDWERKER = "hw-1";
const KUNDE = "ku-1";
const FREMDER = "fremd-1";
const BAUSTELLE = "b-1";

let umgebung;

before(async () => {
  umgebung = await initializeTestEnvironment({
    projectId: "werkbuch-regeltest",
    firestore: {
      rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  // Ausgangsdaten ohne Regelprüfung anlegen
  await umgebung.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", HANDWERKER), { rolle: "handwerker", email: "hw@test.de" });
    await setDoc(doc(db, "users", KUNDE), { rolle: "kunde", email: "ku@test.de" });
    await setDoc(doc(db, "baustellen", BAUSTELLE), {
      name: "Bad Musterstraße",
      handwerkerId: HANDWERKER,
      kundeId: KUNDE,
    });
    await setDoc(doc(db, "baustellen", BAUSTELLE, "freigaben", "f-1"), {
      entscheidung: "angenommen",
      betragBruttoCent: 124800,
    });
    await setDoc(doc(db, "baustellen", BAUSTELLE, "protokoll", "p-1"), { aktion: "angesehen" });
    await setDoc(doc(db, "baustellen", BAUSTELLE, "guthaben", "g-1"), { veraenderung: 3 });
    await setDoc(doc(db, "baustellen", BAUSTELLE, "zulagenBestellungen", "z-1"), {
      status: "bestaetigt",
      bruttoCent: 1900,
      positionen: [{ sku: "VIS_EXTRA", menge: 1, bruttoCent: 1900 }],
    });
    await setDoc(doc(db, "magicLinks", "abdruck-1"), { baustelleId: BAUSTELLE });
  });
});

after(async () => {
  await umgebung?.cleanup();
});

const alsHandwerker = () => umgebung.authenticatedContext(HANDWERKER).firestore();
const alsKunde = () => umgebung.authenticatedContext(KUNDE).firestore();
const alsFremder = () => umgebung.authenticatedContext(FREMDER).firestore();

// ------------------------------------------------------- Freigaben (Nachweis)

test("Freigaben: Handwerker und Kunde dürfen lesen", async () => {
  await assertSucceeds(getDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "freigaben", "f-1")));
  await assertSucceeds(getDoc(doc(alsKunde(), "baustellen", BAUSTELLE, "freigaben", "f-1")));
});

test("Freigaben: Fremde dürfen nicht lesen", async () => {
  await assertFails(getDoc(doc(alsFremder(), "baustellen", BAUSTELLE, "freigaben", "f-1")));
});

test("Freigaben: auch der Handwerker darf den Betrag NICHT nachträglich ändern", async () => {
  await assertFails(
    updateDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "freigaben", "f-1"), {
      betragBruttoCent: 1,
    })
  );
});

test("Freigaben: auch der Handwerker darf nichts löschen", async () => {
  await assertFails(deleteDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "freigaben", "f-1")));
});

test("Freigaben: niemand darf welche erfinden", async () => {
  await assertFails(
    setDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "freigaben", "erfunden"), {
      entscheidung: "angenommen",
    })
  );
  await assertFails(
    setDoc(doc(alsKunde(), "baustellen", BAUSTELLE, "freigaben", "erfunden-2"), {
      entscheidung: "angenommen",
    })
  );
});

// ------------------------------------------------------------------ Protokoll

test("Protokoll: nur der Handwerker liest, niemand schreibt", async () => {
  await assertSucceeds(getDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "protokoll", "p-1")));
  await assertFails(getDoc(doc(alsKunde(), "baustellen", BAUSTELLE, "protokoll", "p-1")));
  await assertFails(
    updateDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "protokoll", "p-1"), { aktion: "x" })
  );
});

// ------------------------------------------------------------------- Guthaben

test("Guthaben: lesbar für beide, änderbar für niemanden", async () => {
  await assertSucceeds(getDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "guthaben", "g-1")));
  await assertSucceeds(getDoc(doc(alsKunde(), "baustellen", BAUSTELLE, "guthaben", "g-1")));
  await assertFails(
    updateDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "guthaben", "g-1"), { veraenderung: 999 })
  );
  await assertFails(
    addDoc(collection(alsHandwerker(), "baustellen", BAUSTELLE, "guthaben"), { veraenderung: 50 })
  );
});

// -------------------------------------------------------- Zulagen-Bestellungen

test("Zulagen: Handwerker darf eine wartende Bestellung freigeben", async () => {
  await assertSucceeds(
    updateDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "zulagenBestellungen", "z-1"), {
      status: "bestaetigt",
      geprueftAm: new Date(),
    })
  );
});

test("Zulagen: Handwerker darf den Betrag der Kundenbestellung nicht verändern", async () => {
  await assertFails(
    updateDoc(doc(alsHandwerker(), "baustellen", BAUSTELLE, "zulagenBestellungen", "z-1"), {
      bruttoCent: 99900,
    })
  );
});

test("Zulagen: Kunde darf nichts ändern", async () => {
  await assertFails(
    updateDoc(doc(alsKunde(), "baustellen", BAUSTELLE, "zulagenBestellungen", "z-1"), {
      status: "bestaetigt",
    })
  );
});

test("Zulagen: niemand darf eine Bestellung am Portal vorbei anlegen", async () => {
  await assertFails(
    addDoc(collection(alsKunde(), "baustellen", BAUSTELLE, "zulagenBestellungen"), {
      status: "bestaetigt",
      bruttoCent: 0,
    })
  );
});

// ------------------------------------------------------------------ magicLinks

test("Zugangsdaten sind für keinen Client sichtbar", async () => {
  await assertFails(getDoc(doc(alsHandwerker(), "magicLinks", "abdruck-1")));
  await assertFails(getDoc(doc(alsKunde(), "magicLinks", "abdruck-1")));
  await assertFails(setDoc(doc(alsHandwerker(), "magicLinks", "neu"), { baustelleId: BAUSTELLE }));
});

// ------------------------------------------------- bestehende Regeln unberührt

test("Fotos bleiben wie bisher: Handwerker schreibt, Kunde liest", async () => {
  await assertSucceeds(
    addDoc(collection(alsHandwerker(), "baustellen", BAUSTELLE, "fotos"), { phase: "Vorher" })
  );
  await assertFails(
    addDoc(collection(alsKunde(), "baustellen", BAUSTELLE, "fotos"), { phase: "Vorher" })
  );
});

test("Angebot bleibt wie bisher: Kunde darf nur den Status setzen", async () => {
  await umgebung.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "baustellen", BAUSTELLE, "angebot", "aktuell"), {
      status: "Gesendet",
      betrag: 1248,
    });
  });
  await assertSucceeds(
    updateDoc(doc(alsKunde(), "baustellen", BAUSTELLE, "angebot", "aktuell"), {
      status: "Angenommen",
      aktualisiertAm: new Date(),
    })
  );
  await assertFails(
    updateDoc(doc(alsKunde(), "baustellen", BAUSTELLE, "angebot", "aktuell"), { betrag: 1 })
  );
});

test("Zulagen-Katalog: Handwerker pflegt, Kunde liest nur", async () => {
  await assertSucceeds(
    setDoc(doc(alsHandwerker(), "zulagenKatalog", "VIS_EXTRA"), { name: "Test", preisCent: 1900 })
  );
  await assertSucceeds(getDoc(doc(alsKunde(), "zulagenKatalog", "VIS_EXTRA")));
  await assertFails(
    setDoc(doc(alsKunde(), "zulagenKatalog", "VIS_EXTRA"), { preisCent: 1 })
  );
});
