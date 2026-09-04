// ---------------------------------------------------------------------------
// FotoViewerScreen.js — Vollbild-Galerie. Wischen zum Blättern, oben rechts
// "Schließen". Kein Speichern/Teilen/Download. Handwerker kann löschen.
// Kopierschutz aktiv, solange sichtbar.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  FlatList,
  useWindowDimensions,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as ScreenCapture from "expo-screen-capture";
import { doc, deleteDoc } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift } from "../theme";
import { datumDe } from "../util/format";
import { aktualisiereZaehler } from "../util/baustelle";
import fehlerText from "../util/fehler";

export default function FotoViewerScreen({ route, navigation }) {
  const { baustelleId, fotos: fotosParam, start = 0 } = route.params || {};
  const { istHandwerker } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;
  const { width, height } = useWindowDimensions();

  const [fotos, setFotos] = useState(fotosParam || []);
  const [index, setIndex] = useState(start);
  const listeRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );

  const aktuell = fotos[index];

  function loeschenFragen() {
    Alert.alert("Foto löschen?", "Dieses Foto wird unwiderruflich entfernt.", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", style: "destructive", onPress: loeschen },
    ]);
  }

  async function loeschen() {
    if (!aktuell) return;
    try {
      await deleteDoc(doc(db, "baustellen", baustelleId, "fotos", aktuell.id));
      await aktualisiereZaehler(baustelleId);

      const rest = fotos.filter((f) => f.id !== aktuell.id);
      if (rest.length === 0) {
        navigation.goBack();
        return;
      }
      const neuerIndex = Math.min(index, rest.length - 1);
      setFotos(rest);
      setIndex(neuerIndex);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function onScroll(e) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listeRef}
        data={fotos}
        keyExtractor={(i) => i.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <View style={{ width, height, justifyContent: "center" }}>
            <Image
              source={{ uri: item.url }}
              style={{ width, height: height * 0.72 }}
              resizeMode="contain"
            />
          </View>
        )}
      />

      {/* Kopfzeile: Schließen */}
      <SafeAreaView style={styles.topBar} edges={["top"]}>
        <Text style={styles.zaehler}>
          {fotos.length ? `${index + 1} / ${fotos.length}` : ""}
        </Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.schliessen}>✕ Schließen</Text>
        </Pressable>
      </SafeAreaView>

      {/* Fußzeile: Notiz, Datum, ggf. Löschen */}
      <SafeAreaView style={styles.bottomBar} edges={["bottom"]}>
        {aktuell?.notiz ? <Text style={styles.notiz}>{aktuell.notiz}</Text> : null}
        <Text style={styles.datum}>
          {aktuell?.phase ? `${aktuell.phase} · ` : ""}
          {datumDe(aktuell?.erstelltAm)}
        </Text>
        {istHandwerker && aktuell ? (
          <Pressable onPress={loeschenFragen} style={styles.loeschen} hitSlop={8}>
            <Text style={styles.loeschenText}>Foto löschen</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#000" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  zaehler: { ...schrift.head, fontSize: 16, color: farben.textWeich, letterSpacing: 0.5 },
  schliessen: {
    ...schrift.headHalb,
    fontSize: 15,
    color: farben.text,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  notiz: { ...schrift.body, fontSize: 15, color: farben.text, marginBottom: 4 },
  datum: { ...schrift.body, fontSize: 13, color: farben.textMatt },
  loeschen: { marginTop: 14, alignSelf: "flex-start" },
  loeschenText: {
    ...schrift.headHalb,
    fontSize: 14,
    color: farben.rotHell,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
