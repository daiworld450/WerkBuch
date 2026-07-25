// ---------------------------------------------------------------------------
// firebase.js — zentrale Firebase-Initialisierung
//
// >>> HIER IHRE ZUGANGSDATEN EINTRAGEN <<<
//
// So finden Sie die Werte in der Firebase-Konsole (https://console.firebase.google.com):
//   1. Projekt öffnen (oder unter "Projekt hinzufügen" neu anlegen).
//   2. Links oben auf das Zahnrad ⚙ -> "Projekteinstellungen".
//   3. Reiter "Allgemein" -> nach unten scrollen zu "Ihre Apps".
//   4. Auf das Web-Symbol </> klicken ("App hinzufügen" -> Web),
//      einen Namen vergeben (z.B. "Berisa Bau App"), registrieren.
//   5. Firebase zeigt jetzt das Objekt "firebaseConfig" an – genau diese
//      Werte hier unten eintragen (apiKey, authDomain, projectId, ...).
//
// Aktivieren Sie außerdem in der Konsole:
//   - Authentication -> "Anmeldemethode" -> "E-Mail/Passwort" aktivieren.
//   - Firestore Database -> "Datenbank erstellen" (Produktionsmodus).
// Die passenden Firestore-Regeln liegen in firestore.rules.
//
// Hinweis: Fotos und PDFs werden NICHT bei Firebase Storage gespeichert
// (das würde inzwischen den kostenpflichtigen Blaze-Tarif verlangen), sondern
// bei Cloudinary – siehe src/cloudinary.js. Firebase bleibt damit im
// kostenlosen Spark-Tarif.
// ---------------------------------------------------------------------------

import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ▼▼▼ PLATZHALTER – durch Ihre echten Werte ersetzen ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyAYcOrsD0pSF7D1qWoyMWzhUUBj0beinLY",
  authDomain: "berisa-bau.firebaseapp.com",
  projectId: "berisa-bau",
  storageBucket: "berisa-bau.firebasestorage.app",
  messagingSenderId: "397146225833",
  appId: "1:397146225833:web:7600798024a33c6ab4bdb8",
};
// ▲▲▲ PLATZHALTER ENDE ▲▲▲

const app = initializeApp(firebaseConfig);

// Auth mit dauerhafter Anmeldung über AsyncStorage
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

export default app;
