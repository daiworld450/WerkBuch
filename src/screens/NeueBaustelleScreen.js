// ---------------------------------------------------------------------------
// NeueBaustelleScreen.js — nur Handwerker. Legt eine Baustelle an. Der Kunde
// ist reine Kontakt-Information (Name + Telefon), kein eigenes Konto.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";

export default function NeueBaustelleScreen({ navigation }) {
  const { profil } = useAuth();
  const [name, setName] = useState("");
  const [adresse, setAdresse] = useState("");
  const [kundeName, setKundeName] = useState("");
  const [kundeTelefon, setKundeTelefon] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  async function anlegen() {
    setFehler("");
    if (!name.trim()) {
      setFehler("Bitte geben Sie eine Bezeichnung ein.");
      return;
    }
    setLaedt(true);
    try {
      await addDoc(collection(db, "baustellen"), {
        name: name.trim(),
        adresse: adresse.trim(),
        handwerkerId: profil.id,
        kundeName: kundeName.trim() || null,
        kundeTelefon: kundeTelefon.trim() || null,
        status: "In Planung",
        fortschritt: 0,
        fotoAnzahl: 0,
        // Einsatzplanung (Kalenderübersicht): Zeitraum wird erst später in der
        // Baustelle selbst eingetragen, deshalb hier noch leer.
        geplantStart: null,
        geplantEnde: null,
        // Stub für später echte Mitarbeiter-Accounts — die gibt es im System
        // noch nicht. Bewusst nicht in der UI editierbar, nur als Datenfeld
        // vorbereitet (siehe BaustelleDetailScreen / Firestore-Regeln).
        zugewieseneNutzer: [],
        erstelltAm: serverTimestamp(),
      });

      navigation.goBack();
    } catch (e) {
      setFehler(fehlerText(e));
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
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[textStil.body, styles.unter]}>
            Erfassen Sie die Eckdaten. Fotos, Maße und Material folgen im
            nächsten Schritt.
          </Text>

          <Fehlerkasten text={fehler} />

          <Feld
            label="Bezeichnung"
            wert={name}
            onChangeText={setName}
            platzhalter="z. B. Bad Familie Müller"
          />
          <Feld
            label="Adresse"
            wert={adresse}
            onChangeText={setAdresse}
            platzhalter="Straße, PLZ, Ort"
          />
          <Feld
            label="Name des Kunden (optional)"
            wert={kundeName}
            onChangeText={setKundeName}
            platzhalter="Max Mustermann"
          />
          <Feld
            label="Telefonnummer (optional)"
            wert={kundeTelefon}
            onChangeText={setKundeTelefon}
            platzhalter="0176 12345678"
            keyboardType="phone-pad"
          />

          <Knopf
            titel="Baustelle anlegen"
            onPress={anlegen}
            laedt={laedt}
            style={{ marginTop: 18 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  unter: { marginBottom: 22, marginTop: 6 },
});
