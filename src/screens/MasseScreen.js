// ---------------------------------------------------------------------------
// MasseScreen.js — Raummaße speichern, Flächen live berechnen, freie
// Einzelmaße verwalten. Handwerker bearbeitet, Kunde sieht nur.
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
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Ladeanzeige from "../components/Ladeanzeige";
import { berechneAlles, zahl } from "../util/berechnung";
import { flaecheDe } from "../util/format";
import fehlerText from "../util/fehler";

const EINHEITEN = ["m", "cm", "m²"];

export default function MasseScreen({ route }) {
  const { baustelleId } = route.params;
  const { istHandwerker } = useAuth();

  const [raum, setRaum] = useState({ laenge: "", breite: "", hoehe: "", tuerenFenster: "" });
  const [einzel, setEinzel] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);

  // Neues Einzelmaß
  const [bez, setBez] = useState("");
  const [wert, setWert] = useState("");
  const [einheit, setEinheit] = useState("m");

  useEffect(() => {
    const stopRaum = onSnapshot(
      doc(db, "baustellen", baustelleId, "raum", "haupt"),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setRaum({
            laenge: d.laenge != null ? String(d.laenge) : "",
            breite: d.breite != null ? String(d.breite) : "",
            hoehe: d.hoehe != null ? String(d.hoehe) : "",
            tuerenFenster: d.tuerenFenster != null ? String(d.tuerenFenster) : "",
          });
        }
        setLaedt(false);
      },
      () => setLaedt(false)
    );

    const stopEinzel = onSnapshot(
      collection(db, "baustellen", baustelleId, "masse"),
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        liste.sort((a, b) => (a.erstelltAm?.seconds || 0) - (b.erstelltAm?.seconds || 0));
        setEinzel(liste);
      }
    );

    return () => {
      stopRaum();
      stopEinzel();
    };
  }, [baustelleId]);

  const ergebnis = berechneAlles(raum);

  async function raumSpeichern() {
    setSpeichert(true);
    try {
      await setDoc(
        doc(db, "baustellen", baustelleId, "raum", "haupt"),
        {
          laenge: zahl(raum.laenge),
          breite: zahl(raum.breite),
          hoehe: zahl(raum.hoehe),
          tuerenFenster: zahl(raum.tuerenFenster),
        },
        { merge: true }
      );
      Alert.alert("Gespeichert", "Die Raummaße wurden gespeichert.");
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setSpeichert(false);
    }
  }

  async function einzelHinzu() {
    if (!bez.trim() || !wert.trim()) {
      Alert.alert("Fehlt noch", "Bitte Bezeichnung und Wert eingeben.");
      return;
    }
    try {
      await addDoc(collection(db, "baustellen", baustelleId, "masse"), {
        bezeichnung: bez.trim(),
        wert: zahl(wert),
        einheit,
        erstelltAm: serverTimestamp(),
      });
      setBez("");
      setWert("");
      setEinheit("m");
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function einzelLoeschen(id) {
    try {
      await deleteDoc(doc(db, "baustellen", baustelleId, "masse", id));
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function ErgebnisKarte({ titel, wert: w, einheit: e = "m²" }) {
    return (
      <Karte style={styles.ergKarte}>
        <Text style={styles.ergLabel}>{titel}</Text>
        <Text style={styles.ergWert}>{flaecheDe(w, e)}</Text>
      </Karte>
    );
  }

  if (laedt) return <Ladeanzeige text="Maße werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Raummaße */}
          <Text style={styles.h}>Raummaße</Text>
          <Karte style={{ marginBottom: 18 }}>
            <View style={styles.reihe}>
              <View style={styles.halb}>
                <Feld
                  label="Länge (m)"
                  wert={raum.laenge}
                  onChangeText={(v) => setRaum({ ...raum, laenge: v })}
                  keyboardType="decimal-pad"
                  platzhalter="0,00"
                  editable={istHandwerker}
                />
              </View>
              <View style={styles.halb}>
                <Feld
                  label="Breite (m)"
                  wert={raum.breite}
                  onChangeText={(v) => setRaum({ ...raum, breite: v })}
                  keyboardType="decimal-pad"
                  platzhalter="0,00"
                  editable={istHandwerker}
                />
              </View>
            </View>
            <View style={styles.reihe}>
              <View style={styles.halb}>
                <Feld
                  label="Höhe (m)"
                  wert={raum.hoehe}
                  onChangeText={(v) => setRaum({ ...raum, hoehe: v })}
                  keyboardType="decimal-pad"
                  platzhalter="0,00"
                  editable={istHandwerker}
                />
              </View>
              <View style={styles.halb}>
                <Feld
                  label="Abzug Türen/Fenster (m²)"
                  wert={raum.tuerenFenster}
                  onChangeText={(v) => setRaum({ ...raum, tuerenFenster: v })}
                  keyboardType="decimal-pad"
                  platzhalter="0,00"
                  editable={istHandwerker}
                />
              </View>
            </View>
            {istHandwerker ? (
              <Knopf titel="Maße speichern" onPress={raumSpeichern} laedt={speichert} />
            ) : null}
          </Karte>

          {/* Ergebnis-Karten */}
          <Text style={styles.h}>Berechnete Flächen</Text>
          <View style={styles.ergGrid}>
            <ErgebnisKarte titel="Bodenfläche" wert={ergebnis.bodenflaeche} />
            <ErgebnisKarte titel="Wandfläche" wert={ergebnis.wandflaeche} />
            <ErgebnisKarte titel="Fliesenbedarf Boden" wert={ergebnis.fliesenbedarfBoden} />
            <ErgebnisKarte titel="Fliesenbedarf Wand" wert={ergebnis.fliesenbedarfWand} />
            <ErgebnisKarte titel="Umfang" wert={ergebnis.umfang} einheit="m" />
          </View>

          {/* Freie Einzelmaße */}
          <Text style={[styles.h, { marginTop: 22 }]}>Einzelmaße</Text>
          {einzel.length === 0 ? (
            <Text style={styles.leer}>Noch keine Einzelmaße erfasst.</Text>
          ) : (
            einzel.map((m) => (
              <View key={m.id} style={styles.mReihe}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mBez}>{m.bezeichnung}</Text>
                </View>
                <Text style={styles.mWert}>
                  {flaecheDe(m.wert, m.einheit).replace(" " + m.einheit, "")} {m.einheit}
                </Text>
                {istHandwerker ? (
                  <Pressable onPress={() => einzelLoeschen(m.id)} hitSlop={8}>
                    <Text style={styles.mLoeschen}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}

          {istHandwerker ? (
            <Karte style={{ marginTop: 14 }}>
              <Feld label="Bezeichnung" wert={bez} onChangeText={setBez} platzhalter="z. B. Nischenbreite" />
              <View style={styles.reihe}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Feld label="Wert" wert={wert} onChangeText={setWert} keyboardType="decimal-pad" platzhalter="0,00" />
                </View>
              </View>
              <Text style={styles.kleinLabel}>Einheit</Text>
              <View style={styles.einheitReihe}>
                {EINHEITEN.map((e) => (
                  <Pill key={e} text={e} aktiv={einheit === e} onPress={() => setEinheit(e)} style={{ marginRight: 8 }} />
                ))}
              </View>
              <Knopf titel="Einzelmaß hinzufügen" onPress={einzelHinzu} variante="sekundaer" style={{ marginTop: 14 }} />
            </Karte>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  h: {
    ...schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  reihe: { flexDirection: "row", gap: 10 },
  halb: { flex: 1 },
  ergGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  ergKarte: { width: "48.5%", marginBottom: 12, paddingVertical: 18 },
  ergLabel: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginBottom: 8 },
  ergWert: { ...schrift.head, fontSize: 24, color: farben.text, letterSpacing: 0.5 },
  leer: { ...schrift.body, fontSize: 14, color: farben.textMatt, marginBottom: 4 },
  mReihe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: farben.linie,
  },
  mBez: { ...schrift.body, fontSize: 15, color: farben.text },
  mWert: { ...schrift.head, fontSize: 16, color: farben.textWeich, letterSpacing: 0.5 },
  mLoeschen: { ...schrift.head, fontSize: 18, color: farben.rotHell, paddingHorizontal: 4 },
  kleinLabel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  einheitReihe: { flexDirection: "row", flexWrap: "wrap" },
});
