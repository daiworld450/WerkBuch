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
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

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
          setProfil(snap.exists() ? { id: u.uid, ...snap.data() } : null);
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
    setProfil(snap.exists() ? { id: cred.user.uid, ...snap.data() } : null);
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
    setProfil({ id: cred.user.uid, ...daten });
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
