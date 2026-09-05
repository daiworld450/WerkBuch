// ---------------------------------------------------------------------------
// DokumenteScreen.js — interne Dokumenten-Ablage pro Baustelle: beliebige
// Dateien (PDF, Excel, Word, etc.) hochladen, öffnen, wieder entfernen.
// Keine Bauphasen, keine Bildbearbeitung — bewusst einfacher als FotosScreen.
//
// Löschen entfernt nur den Firestore-Eintrag, nicht die Cloudinary-Datei —
// genau wie bei Fotos: Einträge verschwinden aus der App, die Dateien
// bleiben unreferenziert bei Cloudinary liegen (siehe
// PROJEKT-ZUSAMMENFASSUNG.md).
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Linking } from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { ladeRohdateiHoch } from "../cloudinary";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import { datumDe } from "../util/format";
import fehlerText from "../util/fehler";

// Dateigröße lesbar formatieren (Bytes -> KB/MB).
function groesseText(bytes) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Dateiendung aus dem Namen, in Großbuchstaben (z. B. "PDF", "XLSX").
function endungAus(name) {
  const treffer = /\.([a-zA-Z0-9]+)$/.exec(name || "");
  return treffer ? treffer[1].toUpperCase() : null;
}

export default function DokumenteScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [dokumente, setDokumente] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [hochladen, setHochladen] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "dokumente"),
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        liste.sort((a, b) => (b.hochgeladenAm?.seconds || 0) - (a.hochgeladenAm?.seconds || 0));
        setDokumente(liste);
        setLaedt(false);
        setFehler("");
      },
      (e) => {
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    );
    return stop;
  }, [baustelleId]);

  async function dateiWaehlen() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      await dateiHochladen(res.assets[0]);
    } catch (e) {
      Alert.alert("Fehler", e?.message || fehlerText(e));
    }
  }

  async function dateiHochladen(datei) {
    setHochladen(true);
    try {
      const { url, publicId } = await ladeRohdateiHoch(datei.uri, {
        dateiname: datei.name,
        mime: datei.mimeType,
      });

      await addDoc(collection(db, "baustellen", baustelleId, "dokumente"), {
        name: datei.name,
        url,
        publicId,
        typ: datei.mimeType || endungAus(datei.name) || null,
        groesse: datei.size || null,
        hochgeladenAm: serverTimestamp(),
      });
    } catch (e) {
      const text = e?.message?.startsWith("Upload fehlgeschlagen")
        ? e.message
        : fehlerText(e);
      Alert.alert("Upload fehlgeschlagen", text);
    } finally {
      setHochladen(false);
    }
  }

  function oeffnen(d) {
    Linking.openURL(d.url).catch(() => {
      Alert.alert("Fehler", "Die Datei konnte nicht geöffnet werden.");
    });
  }

  function loeschenFragen(d) {
    Alert.alert(
      "Dokument entfernen?",
      `„${d.name}“ wird aus der App entfernt.`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Entfernen", style: "destructive", onPress: () => loeschen(d) },
      ]
    );
  }

  async function loeschen(d) {
    try {
      // Entfernt nur den Firestore-Eintrag — die Datei bleibt bewusst bei
      // Cloudinary liegen (siehe Kommentar oben).
      await deleteDoc(doc(db, "baustellen", baustelleId, "dokumente", d.id));
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  if (laedt) return <Ladeanzeige text="Dokumente werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Fehlerkasten text={fehler} />

        <Knopf
          titel="Datei hochladen"
          onPress={dateiWaehlen}
          laedt={hochladen}
          style={{ marginBottom: 18 }}
        />

        {dokumente.length === 0 ? (
          <Leerzustand
            symbol="📎"
            titel="Noch keine Dokumente"
            text="Laden Sie Rechnungen, Kalkulationen, Pläne oder andere Dateien hoch."
          />
        ) : (
          dokumente.map((d) => (
            <Karte key={d.id} style={styles.zeile}>
              <View style={styles.kopf}>
                <Text style={styles.symbol}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.info}>
                    {datumDe(d.hochgeladenAm)}
                    {groesseText(d.groesse) ? ` · ${groesseText(d.groesse)}` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.aktionen}>
                <Knopf titel="Öffnen" variante="sekundaer" onPress={() => oeffnen(d)} style={styles.aktionsKnopf} />
                <Knopf titel="Löschen" variante="ghost" onPress={() => loeschenFragen(d)} style={styles.aktionsKnopf} />
              </View>
            </Karte>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  zeile: { marginBottom: 12 },
  kopf: { flexDirection: "row", alignItems: "center", gap: 12 },
  symbol: { fontSize: 26 },
  name: { ...schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5 },
  info: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 2 },
  aktionen: { flexDirection: "row", gap: 10, marginTop: 14 },
  aktionsKnopf: { flex: 1, paddingVertical: 12 },
});
