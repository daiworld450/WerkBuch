// ---------------------------------------------------------------------------
// NeueBaustelleScreen.js — nur Handwerker. Legt eine Baustelle an und
// verknüpft optional einen Kunden über dessen E-Mail-Adresse.
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
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

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
  const [kundenEmail, setKundenEmail] = useState("");
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [laedt, setLaedt] = useState(false);

  async function anlegen() {
    setFehler("");
    setHinweis("");
    if (!name.trim()) {
      setFehler("Bitte geben Sie eine Bezeichnung ein.");
      return;
    }
    setLaedt(true);
    try {
      let kundeId = null;
      let kundeName = null;

      // Kunde per E-Mail suchen (rolle == "kunde")
      const mail = kundenEmail.trim().toLowerCase();
      if (mail) {
        const q = query(
          collection(db, "users"),
          where("email", "==", mail),
          where("rolle", "==", "kunde")
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          kundeId = d.id;
          kundeName = d.data().name || null;
        } else {
          setHinweis(
            "Zu dieser E-Mail wurde noch kein Kundenkonto gefunden. Die Baustelle wird trotzdem angelegt — sobald sich der Kunde mit dieser Adresse registriert oder anmeldet, wird sie automatisch verknüpft."
          );
        }
      }

      await addDoc(collection(db, "baustellen"), {
        name: name.trim(),
        adresse: adresse.trim(),
        handwerkerId: profil.id,
        kundeId,
        kundeName,
        // Auch ohne Kundenkonto merken: Über diese Adresse wird später der
        // Angebots-Link verschickt — dafür braucht der Kunde kein Konto.
        kundeEmail: mail || null,
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
          {hinweis ? (
            <View style={styles.hinweis}>
              <Text style={styles.hinweisText}>{hinweis}</Text>
            </View>
          ) : null}

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
            label="E-Mail des Kunden (optional)"
            wert={kundenEmail}
            onChangeText={setKundenEmail}
            platzhalter="kunde@email.de"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.tipp}>
            Auch ohne bestehendes Kundenkonto möglich: Die Baustelle wird
            automatisch verknüpft, sobald sich der Kunde mit dieser Adresse
            anmeldet.
          </Text>

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
  tipp: {
    ...schrift.body,
    fontSize: 12.5,
    color: farben.textMatt,
    marginTop: -6,
    marginBottom: 4,
  },
  hinweis: {
    backgroundColor: "rgba(42,78,239,.12)",
    borderWidth: 1,
    borderColor: "rgba(42,78,239,.4)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  hinweisText: { ...schrift.body, fontSize: 14, color: farben.textWeich, lineHeight: 20 },
});
