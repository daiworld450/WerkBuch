// ---------------------------------------------------------------------------
// TermineScreen.js — Zeitplan EINER Baustelle.
//
// Liest seit dem Kalender-Umbau NICHT mehr den Unterordner
// baustellen/{id}/termine, sondern die top-level Sammlung "termine" und
// filtert clientseitig auf diese Baustelle (Abfrage nur über handwerkerId —
// so ist kein zusammengesetzter Firestore-Index nötig).
//
// Angelegt und bearbeitet werden Termine im gemeinsamen TerminScreen; hier
// bleiben Abhaken und Löschen direkt an der Liste. Es gibt nur noch die
// Handwerker-Sicht (kein Kundenzugang mehr).
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import { datumDe, zuDate } from "../util/format";
import fehlerText from "../util/fehler";
import { artInfo, uhrzeitDe } from "../util/termine";

export default function TermineScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { profil } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [termine, setTermine] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!profil) return;
    const q = query(
      collection(db, "termine"),
      where("handwerkerId", "==", profil.id)
    );
    const stop = onSnapshot(
      q,
      (snap) => {
        const liste = snap.docs
          .map((d) => {
            const daten = d.data();
            const start = zuDate(daten.start) || new Date();
            return { id: d.id, ...daten, _start: start, _ende: zuDate(daten.ende) || start };
          })
          // Clientseitig auf diese Baustelle filtern und sortieren
          .filter((t) => t.baustelleId === baustelleId);
        liste.sort((a, b) => a._start - b._start);
        setTermine(liste);
        setLaedt(false);
        setFehler("");
      },
      (e) => {
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    );
    return stop;
  }, [profil, baustelleId]);

  async function abhaken(t) {
    try {
      await updateDoc(doc(db, "termine", t.id), { erledigt: !t.erledigt });
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
            await deleteDoc(doc(db, "termine", t.id));
          } catch (e) {
            Alert.alert("Fehler", fehlerText(e));
          }
        },
      },
    ]);
  }

  function istVergangen(t) {
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    return t._ende < heute;
  }

  function neuerTermin() {
    navigation.navigate("Termin", { baustelleId });
  }

  if (laedt) return <Ladeanzeige text="Termine werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Fehlerkasten text={fehler} />

        {termine.length === 0 ? (
          <Leerzustand
            symbol="📅"
            titel="Noch keine Termine"
            text="Planen Sie die Schritte der Sanierung. Termine erscheinen auch im Kalender."
            knopfTitel="Termin hinzufügen"
            onKnopf={neuerTermin}
          />
        ) : (
          termine.map((t) => {
            const gedimmt = t.erledigt || istVergangen(t);
            const art = artInfo(t.art);
            const zeit = t.ganztags
              ? "Ganztägig"
              : `${uhrzeitDe(t._start)} – ${uhrzeitDe(t._ende)} Uhr`;
            return (
              <Karte
                key={t.id}
                onPress={() => navigation.navigate("Termin", { terminId: t.id })}
                style={[styles.tKarte, gedimmt && styles.gedimmt]}
              >
                <View style={styles.tReihe}>
                  <View style={[styles.tFarbe, { backgroundColor: art.farbe }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tDatum, gedimmt && styles.tMatt]}>
                      {datumDe(t._start)}
                      {t._ende && datumDe(t._ende) !== datumDe(t._start)
                        ? ` – ${datumDe(t._ende)}`
                        : ""}
                    </Text>
                    <Text style={styles.tZeit}>
                      {zeit} · {art.label}
                    </Text>
                    <Text style={[styles.tTitel, gedimmt && styles.tMatt]}>
                      {t.erledigt ? "✓ " : ""}
                      {t.titel}
                    </Text>
                    {t.notiz ? <Text style={styles.tNotiz}>{t.notiz}</Text> : null}
                  </View>
                </View>

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
              </Karte>
            );
          })
        )}

        {termine.length > 0 ? (
          <Knopf titel="+ Termin hinzufügen" onPress={neuerTermin} style={{ marginTop: 6 }} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  tKarte: { marginBottom: 12 },
  gedimmt: { opacity: 0.55 },
  tReihe: { flexDirection: "row", gap: 12 },
  tFarbe: { width: 5, borderRadius: 3, alignSelf: "stretch" },
  tDatum: { ...schrift.head, fontSize: 22, color: farben.text, letterSpacing: 0.5 },
  tZeit: { ...schrift.headHalb, fontSize: 13, color: farben.textMatt, letterSpacing: 0.5, marginTop: 2 },
  tTitel: { ...schrift.bodyMed, fontSize: 16, color: farben.text, marginTop: 4 },
  tMatt: { color: farben.textWeich },
  tNotiz: { ...schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 4, lineHeight: 20 },
  tAktionen: { flexDirection: "row", gap: 20, marginTop: 14 },
  tAktion: {
    ...schrift.headHalb,
    fontSize: 14,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
