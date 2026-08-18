// ---------------------------------------------------------------------------
// AuthContext.js — hält den angemeldeten Nutzer + sein users-Dokument bereit.
// Stellt Anmeldung, Registrierung und Abmeldung als einfache Funktionen bereit.
// ---------------------------------------------------------------------------

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

// Holt Baustellen nach, die auf dieses Kundenkonto warten: Der Handwerker
// kann eine Baustelle anlegen, bevor der Kunde überhaupt ein Konto hat —
// kundeId bleibt dann zunächst leer, nur kundeEmail ist gesetzt. Meldet
// sich später jemand mit genau dieser E-Mail-Adresse als Kunde an, holt
// diese Funktion die Verknüpfung nach. Ohne sie bliebe die Baustelle für
// den Kunden für immer unsichtbar, egal wie oft er sich anmeldet.
async function kundeBaustellenVerknuepfen(profilDaten) {
  if (!profilDaten || profilDaten.rolle !== "kunde" || !profilDaten.email) return;
  try {
    const q = query(
      collection(db, "baustellen"),
      where("kundeEmail", "==", profilDaten.email),
      where("kundeId", "==", null)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      try {
        await updateDoc(d.ref, {
          kundeId: profilDaten.id,
          kundeName: profilDaten.name || null,
        });
      } catch {
        // Verknüpfung von den Firestore-Regeln abgelehnt — beim nächsten
        // Anmelden erneut versucht, kein Abbruch der Anmeldung deswegen.
      }
    }
  } catch {
    // Reiner Komfort-Schritt im Hintergrund, kein kritischer Pfad — die
    // Anmeldung selbst soll auch klappen, wenn dieser Abgleich fehlschlägt.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase-Auth-Nutzer
  const [profil, setProfil] = useState(null); // users/{uid}-Dokument
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    const abmelden = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          const p = snap.exists() ? { id: u.uid, ...snap.data() } : null;
          setProfil(p);
          kundeBaustellenVerknuepfen(p);
        } catch (e) {
          setProfil(null);
        }
      } else {
        setProfil(null);
      }
      setLaedt(false);
    });
    return abmelden;
  }, []);

  async function anmelden(email, passwort) {
    const cred = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      passwort
    );
    // Profil direkt nachladen, damit Rolle sofort verfügbar ist
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    const p = snap.exists() ? { id: cred.user.uid, ...snap.data() } : null;
    setProfil(p);
    kundeBaustellenVerknuepfen(p);
    return cred.user;
  }

  async function registrieren({ name, email, telefon, passwort, rolle }) {
    const cred = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      passwort
    );
    const daten = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      rolle, // "handwerker" | "kunde"
      telefon: telefon ? telefon.trim() : null,
      erstelltAm: serverTimestamp(),
    };
    await setDoc(doc(db, "users", cred.user.uid), daten);
    sendEmailVerification(cred.user).catch(() => {});
    const p = { id: cred.user.uid, ...daten };
    setProfil(p);
    kundeBaustellenVerknuepfen(p);
    return cred.user;
  }

  async function abmelden() {
    await signOut(auth);
    setProfil(null);
  }

  const wert = {
    user,
    profil,
    laedt,
    istHandwerker: profil?.rolle === "handwerker",
    istKunde: profil?.rolle === "kunde",
    anmelden,
    registrieren,
    abmelden,
  };

  return <AuthContext.Provider value={wert}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider genutzt werden.");
  return ctx;
}

export default AuthContext;
