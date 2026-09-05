// ---------------------------------------------------------------------------
// LoginScreen.js — Anmeldung mit E-Mail und Passwort.
// ---------------------------------------------------------------------------

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Logo from "../components/Logo";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";

export default function LoginScreen({ navigation }) {
  const { anmelden } = useAuth();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);
  const scrollRef = useRef(null);

  // Auf kurzen Bildschirmen (z.B. Querformat) sitzt die Fehlermeldung sonst
  // über dem sichtbaren Bereich — dann wirkt der Knopf, als täte er nichts.
  function fehlerZeigen(text) {
    setFehler(text);
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }

  async function login() {
    setFehler("");
    if (!email.trim() || !passwort) {
      fehlerZeigen("Bitte E-Mail und Passwort eingeben.");
      return;
    }
    setLaedt(true);
    try {
      await anmelden(email, passwort);
      // Navigation wechselt automatisch über den Auth-Status.
    } catch (e) {
      fehlerZeigen(fehlerText(e));
    } finally {
      setLaedt(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoBox}>
            <Logo height={38} />
            <Text style={styles.appName}>WerkBuch</Text>
            <Text style={styles.appOwner}>von Berisa Bau</Text>
          </View>

          <Text style={styles.titel}>Willkommen zurück</Text>
          <Text style={[textStil.body, styles.unter]}>
            Melden Sie sich an, um Ihre Baustellen zu sehen.
          </Text>

          <Fehlerkasten text={fehler} />

          <Feld
            label="E-Mail"
            wert={email}
            onChangeText={setEmail}
            platzhalter="ihre@email.de"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Feld
            label="Passwort"
            wert={passwort}
            onChangeText={setPasswort}
            platzhalter="••••••••"
            secureTextEntry
          />

          <Knopf
            titel="Anmelden"
            onPress={login}
            laedt={laedt}
            style={{ marginTop: 8 }}
          />

          <Pressable
            onPress={() => navigation.navigate("Register")}
            style={styles.link}
          >
            <Text style={styles.linkText}>
              Noch kein Konto?{" "}
              <Text style={styles.linkStark}>Registrieren</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoBox: { alignItems: "center", marginBottom: 36 },
  appName: {
    ...schrift.head,
    fontSize: 40,
    color: farben.text,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 14,
  },
  appOwner: {
    ...schrift.headHalb,
    fontSize: 13,
    color: farben.textMatt,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },
  titel: {
    ...schrift.head,
    fontSize: groessen.h1,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  unter: { marginBottom: 26 },
  link: { marginTop: 22, alignItems: "center" },
  linkText: { ...schrift.body, fontSize: 15, color: farben.textMatt },
  linkStark: { ...schrift.bodyMed, color: farben.rotHell },
});
