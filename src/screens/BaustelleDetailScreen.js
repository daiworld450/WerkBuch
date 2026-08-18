// ---------------------------------------------------------------------------
// BaustelleDetailScreen.js — Übersicht einer Baustelle mit fünf Einstiegen.
// Handwerker: Statuswechsel per Chips und Löschen (mit Sicherheitsabfrage).
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Karte from "../components/Karte";
import Pill from "../components/Pill";
import Knopf from "../components/Knopf";
import Fortschritt from "../components/Fortschritt";
import Statuspunkt from "../components/Statuspunkt";
import Ladeanzeige from "../components/Ladeanzeige";
import Leerzustand from "../components/Leerzustand";
import fehlerText from "../util/fehler";

const STATUS = ["In Planung", "In Ausführung", "Abgeschlossen"];

const EINSTIEGE = [
  { key: "Fotos", symbol: "📷", titel: "Fotos", text: "Bilder nach Bauphase sortiert" },
  { key: "Visualisierung", symbol: "🎨", titel: "Entwurf", text: "Foto aufnehmen, fertiges Bad zeigen" },
  { key: "Masse", symbol: "📐", titel: "Maße & Flächen", text: "Raummaße und automatische Flächenberechnung" },
  { key: "Material", symbol: "🧱", titel: "Material", text: "Fliesen, Boden, Sanitär" },
  { key: "Termine", symbol: "📅", titel: "Termine", text: "Zeitplan der Sanierung" },
];

export default function BaustelleDetailScreen({ route, navigation }) {
  const { baustelleId } = route.params;
  const { istHandwerker } = useAuth();
  const [baustelle, setBaustelle] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [weg, setWeg] = useState(false);

  useEffect(() => {
    const stop = onSnapshot(
      doc(db, "baustellen", baustelleId),
      (snap) => {
        if (snap.exists()) {
          setBaustelle({ id: snap.id, ...snap.data() });
        } else {
          setBaustelle(null);
        }
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  async function statusSetzen(neu) {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), { status: neu });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function loeschenFragen() {
    Alert.alert(
      "Baustelle löschen?",
      "Alle Fotos, Maße, Material, Termine und das Angebot werden unwiderruflich gelöscht.",
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Löschen", style: "destructive", onPress: loeschen },
      ]
    );
  }

  async function loeschen() {
    setWeg(true);
    try {
      // Alle Unterordner-Dokumente löschen. Die zugehörigen Fotos/PDFs liegen
      // bei Cloudinary; sie werden nicht mehr referenziert und zählen nur zum
      // (großzügigen) Gratis-Speicher. Eine serverseitige Bereinigung ließe
      // sich später über Cloudinary-Admin ergänzen.
      for (const uo of ["fotos", "angebot", "masse", "material", "termine", "raum"]) {
        await unterordnerLoeschen(uo);
      }
      // Hauptdokument
      await deleteDoc(doc(db, "baustellen", baustelleId));
      navigation.goBack();
    } catch (e) {
      setWeg(false);
      Alert.alert("Fehler beim Löschen", fehlerText(e));
    }
  }

  // Löscht alle Dokumente eines Unterordners.
  async function unterordnerLoeschen(name) {
    const snap = await getDocs(collection(db, "baustellen", baustelleId, name));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  }

  if (laedt) return <Ladeanzeige text="Baustelle wird geladen …" />;

  if (!baustelle) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="❓"
          titel="Baustelle nicht gefunden"
          text="Diese Baustelle wurde möglicherweise gelöscht."
        />
      </SafeAreaView>
    );
  }

  if (weg) return <Ladeanzeige text="Baustelle wird gelöscht …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Kopf */}
        <Text style={styles.name}>{baustelle.name}</Text>
        {baustelle.adresse ? (
          <Text style={styles.adresse}>{baustelle.adresse}</Text>
        ) : null}
        {baustelle.kundeName ? (
          <Text style={styles.kunde}>Kunde: {baustelle.kundeName}</Text>
        ) : null}

        <View style={styles.statusReihe}>
          <Statuspunkt status={baustelle.status} />
        </View>

        <View style={styles.fortReihe}>
          <Fortschritt prozent={baustelle.fortschritt || 0} style={{ flex: 1 }} />
          <Text style={styles.prozent}>
            {Math.round(baustelle.fortschritt || 0)} %
          </Text>
        </View>

        {/* Einstiegs-Karten */}
        {EINSTIEGE.map((e) => (
          <Karte
            key={e.key}
            onPress={() => navigation.navigate(e.key, { baustelleId })}
            style={styles.einstieg}
          >
            <Text style={styles.eSymbol}>{e.symbol}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.eTitel}>{e.titel}</Text>
              <Text style={styles.eText}>{e.text}</Text>
            </View>
            <Text style={styles.ePfeil}>›</Text>
          </Karte>
        ))}

        {/* Angebot – Text je nach Rolle */}
        <Karte
          onPress={() =>
            navigation.navigate("Angebot", {
              baustelleId,
              kundeEmail: baustelle?.kundeEmail || "",
              kundeName: baustelle?.kundeName || "",
            })
          }
          style={styles.einstieg}
        >
          <Text style={styles.eSymbol}>📄</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.eTitel}>Angebot</Text>
            <Text style={styles.eText}>
              {istHandwerker ? "PDF hochladen" : "Angebot ansehen"}
            </Text>
          </View>
          <Text style={styles.ePfeil}>›</Text>
        </Karte>

        {/* Handwerker-Bereich: Status + Löschen */}
        {istHandwerker ? (
          <View style={styles.hwBereich}>
            <Text style={styles.label}>Status ändern</Text>
            <View style={styles.chips}>
              {STATUS.map((s) => (
                <Pill
                  key={s}
                  text={s}
                  aktiv={baustelle.status === s}
                  onPress={() => statusSetzen(s)}
                  style={{ marginRight: 8, marginBottom: 8 }}
                />
              ))}
            </View>

            <Knopf
              titel="Baustelle löschen"
              variante="ghost"
              onPress={loeschenFragen}
              style={{ marginTop: 18 }}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  name: {
    ...schrift.head,
    fontSize: groessen.h1,
    color: farben.text,
    letterSpacing: 0.5,
  },
  adresse: { ...schrift.body, fontSize: 15, color: farben.textMatt, marginTop: 4 },
  kunde: { ...schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 2 },
  statusReihe: { marginTop: 14 },
  fortReihe: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, marginBottom: 22 },
  prozent: {
    ...schrift.head,
    fontSize: 16,
    color: farben.text,
    letterSpacing: 0.5,
    minWidth: 46,
    textAlign: "right",
  },
  einstieg: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  eSymbol: { fontSize: 26 },
  eTitel: { ...schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5 },
  eText: { ...schrift.body, fontSize: 13.5, color: farben.textMatt, marginTop: 2 },
  ePfeil: { ...schrift.head, fontSize: 26, color: farben.textMatt },
  hwBereich: { marginTop: 18 },
  label: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap" },
});
