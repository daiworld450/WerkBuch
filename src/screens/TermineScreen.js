// ---------------------------------------------------------------------------
// TermineScreen.js — Zeitplan der Sanierung. Handwerker legt Termine an,
// hakt sie ab und löscht sie. Kunde sieht nur. Vergangene/erledigte Termine
// werden abgedunkelt mit grünem Häkchen dargestellt.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import { datumDe, zuDate } from "../util/format";
import fehlerText from "../util/fehler";

export default function TermineScreen({ route }) {
  const { baustelleId } = route.params;
  const { istHandwerker } = useAuth();

  const [termine, setTermine] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [formOffen, setFormOffen] = useState(false);
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [datum, setDatum] = useState(new Date());
  const [pickerAuf, setPickerAuf] = useState(false);

  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "termine"),
      (snap) => {
        const l = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        l.sort((a, b) => (a.datum?.seconds || 0) - (b.datum?.seconds || 0));
        setTermine(l);
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  async function speichern() {
    if (!titel.trim()) {
      Alert.alert("Fehlt noch", "Bitte geben Sie einen Titel ein.");
      return;
    }
    try {
      await addDoc(collection(db, "baustellen", baustelleId, "termine"), {
        datum: Timestamp.fromDate(datum),
        titel: titel.trim(),
        beschreibung: beschreibung.trim(),
        erledigt: false,
        erstelltAm: serverTimestamp(),
      });
      setTitel("");
      setBeschreibung("");
      setDatum(new Date());
      setFormOffen(false);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function abhaken(t) {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId, "termine", t.id), {
        erledigt: !t.erledigt,
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function loeschenFragen(t) {
    Alert.alert("Termin löschen?", t.titel, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "baustellen", baustelleId, "termine", t.id));
          } catch (e) {
            Alert.alert("Fehler", fehlerText(e));
          }
        },
      },
    ]);
  }

  function istVergangen(t) {
    const d = zuDate(t.datum);
    if (!d) return false;
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    return d < heute;
  }

  if (laedt) return <Ladeanzeige text="Termine werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {termine.length === 0 && !formOffen ? (
            <Leerzustand
              symbol="📅"
              titel="Noch keine Termine"
              text={
                istHandwerker
                  ? "Planen Sie die Schritte der Sanierung."
                  : "Sobald Termine geplant sind, sehen Sie hier Ihren Zeitplan."
              }
              knopfTitel={istHandwerker ? "Termin hinzufügen" : undefined}
              onKnopf={istHandwerker ? () => setFormOffen(true) : undefined}
            />
          ) : (
            termine.map((t) => {
              const gedimmt = t.erledigt || istVergangen(t);
              return (
                <Karte key={t.id} style={[styles.tKarte, gedimmt && styles.gedimmt]}>
                  <View style={styles.tReihe}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tDatum, gedimmt && styles.tMatt]}>
                        {datumDe(t.datum)}
                      </Text>
                      <Text style={[styles.tTitel, gedimmt && styles.tMatt]}>
                        {t.erledigt ? "✓ " : ""}
                        {t.titel}
                      </Text>
                      {t.beschreibung ? (
                        <Text style={styles.tBeschreibung}>{t.beschreibung}</Text>
                      ) : null}
                    </View>
                  </View>

                  {istHandwerker ? (
                    <View style={styles.tAktionen}>
                      <Pressable onPress={() => abhaken(t)} hitSlop={6}>
                        <Text style={[styles.tAktion, t.erledigt && { color: farben.gruen }]}>
                          {t.erledigt ? "✓ Erledigt" : "Abhaken"}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => loeschenFragen(t)} hitSlop={6}>
                        <Text style={[styles.tAktion, { color: farben.rotHell }]}>Löschen</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Karte>
              );
            })
          )}

          {/* Formular */}
          {istHandwerker && formOffen ? (
            <Karte style={{ marginTop: 8 }}>
              <Text style={styles.formTitel}>Neuer Termin</Text>

              <Text style={styles.kleinLabel}>Datum</Text>
              <Pressable onPress={() => setPickerAuf(true)} style={styles.datumFeld}>
                <Text style={styles.datumText}>{datumDe(datum)}</Text>
              </Pressable>
              {pickerAuf ? (
                <DateTimePicker
                  value={datum}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  themeVariant="dark"
                  onChange={(e, gewaehlt) => {
                    setPickerAuf(Platform.OS === "ios");
                    if (gewaehlt) setDatum(gewaehlt);
                  }}
                />
              ) : null}

              <Feld label="Titel" wert={titel} onChangeText={setTitel} platzhalter="z. B. Fliesenleger vor Ort" />
              <Feld
                label="Beschreibung (optional)"
                wert={beschreibung}
                onChangeText={setBeschreibung}
                platzhalter="Details zum Termin"
                multiline
              />

              <Knopf titel="Termin speichern" onPress={speichern} />
              <Knopf
                titel="Abbrechen"
                variante="ghost"
                onPress={() => setFormOffen(false)}
                style={{ marginTop: 10 }}
              />
            </Karte>
          ) : null}

          {istHandwerker && !formOffen && termine.length > 0 ? (
            <Knopf titel="+ Termin hinzufügen" onPress={() => setFormOffen(true)} style={{ marginTop: 6 }} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  tKarte: { marginBottom: 12 },
  gedimmt: { opacity: 0.55 },
  tReihe: { flexDirection: "row" },
  tDatum: { fontFamily: schrift.head, fontSize: 22, color: farben.text, letterSpacing: 0.5 },
  tTitel: { fontFamily: schrift.bodyMed, fontSize: 16, color: farben.text, marginTop: 4 },
  tMatt: { color: farben.textWeich },
  tBeschreibung: { fontFamily: schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 4, lineHeight: 20 },
  tAktionen: { flexDirection: "row", gap: 20, marginTop: 14 },
  tAktion: { fontFamily: schrift.headHalb, fontSize: 14, color: farben.textWeich, letterSpacing: 0.5, textTransform: "uppercase" },
  formTitel: { fontFamily: schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5, marginBottom: 14 },
  kleinLabel: {
    fontFamily: schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  datumFeld: {
    backgroundColor: farben.feldBg,
    borderWidth: 1.5,
    borderColor: farben.linie,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  datumText: { fontFamily: schrift.body, fontSize: 16, color: farben.text },
});
