// ---------------------------------------------------------------------------
// AuthContext.js — hält den angemeldeten Nutzer + sein users-Dokument bereit.
// Stellt Anmeldung, Registrierung und Abmeldung als einfache Funktionen bereit.
//
// Seit der Mitarbeiter-Stufe gibt es ZWEI Rollen:
//   "handwerker"  — der Betriebsinhaber. Sieht und ändert alles.
//   "mitarbeiter" — trägt nur eigene Stunden und Fotos ein. Keine Preise,
//                   keine Kosten, kein Umsatz, kein Angebot.
//
// Es gibt bewusst KEINEN E-Mail-Einladungsversand (kein Mailserver). Statt
// dessen legt der Inhaber unter "Personen" einen Eintrag mit E-Mail an; wer
// sich später mit GENAU dieser E-Mail registriert, wird automatisch zum
// Mitarbeiter dieses Betriebs. Siehe registrieren().
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
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
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
          const p = snap.exists() ? { id: u.uid, ...snap.data() } : null;
          setProfil(p);
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
    return cred.user;
  }

  // Sucht eine vom Inhaber angelegte Person mit dieser E-Mail.
  // Abfrage nur über EIN Feld (email) — kein zusammengesetzter Index nötig,
  // gleiches Muster wie überall sonst in der App.
  async function personZuEmail(mail) {
    try {
      const snap = await getDocs(
        query(collection(db, "personen"), where("email", "==", mail))
      );
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    } catch (e) {
      // Findet die Suche nichts oder scheitert sie, entsteht ganz normal ein
      // Inhaber-Konto. Eine fehlgeschlagene Verknüpfung darf niemanden an der
      // Registrierung hindern.
      return null;
    }
  }

  async function registrieren({ name, email, telefon, passwort, rolle }) {
    const mail = email.trim().toLowerCase();

    const cred = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      passwort
    );

    // Erst JETZT nachsehen, ob der Inhaber diese E-Mail als Person hinterlegt
    // hat — vor dem users-Dokument, aber nach dem Anlegen des Kontos.
    //
    // Die Reihenfolge ist entscheidend und war beim ersten Versuch falsch
    // herum: Die Regel für "personen" verlangt angemeldet(), und angemeldet
    // ist man erst NACH createUserWithEmailAndPassword (die Funktion meldet
    // direkt an). Vorher wird jede Abfrage abgewiesen — jeder Mitarbeiter
    // wäre stillschweigend als Inhaber angelegt worden.
    const person = await personZuEmail(mail);

    const daten = {
      name: name.trim(),
      email: mail,
      rolle: person ? "mitarbeiter" : rolle || "handwerker",
      telefon: telefon ? telefon.trim() : null,
      erstelltAm: serverTimestamp(),
    };
    if (person) {
      // Zu welchem Betrieb das Konto gehört und welcher Personen-Eintrag es
      // ist. Beides liegt im users-Dokument, damit kein Bildschirm erst
      // suchen muss, wem er zuarbeitet.
      daten.gehoertZu = person.handwerkerId || null;
      daten.personId = person.id;
    }
    await setDoc(doc(db, "users", cred.user.uid), daten);

    if (person) {
      // Gegenrichtung: die Person bekommt die uid. Die Firestore-Regel
      // erlaubt genau diesen einen Schreibzugriff (nur das Feld uid, nur auf
      // die Person mit der eigenen E-Mail) — siehe firestore.rules.
      try {
        await updateDoc(doc(db, "personen", person.id), { uid: cred.user.uid });
      } catch (e) {
        // Schlägt das fehl, existiert das Konto trotzdem; der Inhaber kann
        // die Verknüpfung im Personen-Bildschirm sehen und neu anstoßen.
      }
    }

    sendEmailVerification(cred.user).catch(() => {});
    const p = { id: cred.user.uid, ...daten };
    setProfil(p);
    return cred.user;
  }

  async function abmelden() {
    await signOut(auth);
    setProfil(null);
  }

  const istHandwerker = profil?.rolle === "handwerker";
  const istMitarbeiter = profil?.rolle === "mitarbeiter";

  const wert = {
    user,
    profil,
    laedt,
    istHandwerker,
    istMitarbeiter,
    // Wessen Daten sehe ich? Der Inhaber seine eigenen, der Mitarbeiter die
    // seines Betriebs. Überall dort einsetzen, wo nach handwerkerId gefragt
    // wird (z.B. die Personenliste im StundenScreen).
    besitzerId: istMitarbeiter ? profil?.gehoertZu || null : profil?.id || null,
    // Der eigene Personen-Eintrag des Mitarbeiters — er darf Stunden nur auf
    // diese Person buchen.
    meinePersonId: istMitarbeiter ? profil?.personId || null : null,
    // Fotos und Maße darf auch der Mitarbeiter pflegen; Preise, Kosten und
    // Umsatz bleiben an istHandwerker gebunden.
    darfBearbeiten: istHandwerker || istMitarbeiter,
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
