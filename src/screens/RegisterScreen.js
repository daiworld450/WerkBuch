// ---------------------------------------------------------------------------
// RegisterScreen.js — Registrierung. Es gibt nur noch die Rolle "handwerker"
// (kein Kunden-Konto mehr) — legt das users/{uid}-Dokument entsprechend an.
// ---------------------------------------------------------------------------

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";

export default function RegisterScreen() {
  const { registrieren } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);
  const scrollRef = useRef(null);

  // Das Formular ist länger als der Bildschirm — der Knopf "Konto erstellen"
  // sitzt unten, die Fehlermeldung erscheint oben (über dem Namensfeld).
  // Ohne dieses Hochscrollen bleibt sie unsichtbar und es wirkt so, als würde
  // der Knopf gar nichts tun.
  function fehlerZeigen(text) {
    setFehler(text);
    // react-native-web hat scrollTo({animated:true}) schon mal ignoriert —
    // deshalb ohne Animation, dafür zuverlässig.
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }

  async function konto() {
    setFehler("");
    if (!name.trim() || !email.trim() || !passwort) {
      fehlerZeigen("Bitte Name, E-Mail und Passwort ausfüllen.");
      return;
    }
    if (passwort.length < 6) {
      fehlerZeigen("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    setLaedt(true);
    try {
      await registrieren({ name, email, telefon, passwort, rolle: "handwerker" });
      // Navigation wechselt automatisch über den Auth-Status.
    } catch (e) {
      fehlerZeigen(fehlerText(e));
    } finally {
      setLaedt(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.titel}>Konto erstellen</Text>
          <Text style={[textStil.body, styles.unter]}>
            Legen Sie Ihr Handwerker-Konto an.
          </Text>

          <Fehlerkasten text={fehler} />

          <Feld label="Name" wert={name} onChangeText={setName} platzhalter="Max Mustermann" />
          <Feld
            label="E-Mail"
            wert={email}
            onChangeText={setEmail}
            platzhalter="ihre@email.de"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Feld
            label="Telefon"
            wert={telefon}
            onChangeText={setTelefon}
            platzhalter="0176 12345678"
            keyboardType="phone-pad"
          />
          <Feld
            label="Passwort"
            wert={passwort}
            onChangeText={setPasswort}
            platzhalter="Mindestens 6 Zeichen"
            secureTextEntry
          />

          <Knopf
            titel="Konto erstellen"
            onPress={konto}
            laedt={laedt}
            style={{ marginTop: 20 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  titel: {
    ...schrift.head,
    fontSize: groessen.h2,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  unter: { marginBottom: 22 },
});
