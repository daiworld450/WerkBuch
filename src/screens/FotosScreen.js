// ---------------------------------------------------------------------------
// FotosScreen.js — Fotos nach Bauphase. Handwerker kann Kamera/Galerie nutzen,
// Bilder werden komprimiert, nach Storage geladen und in Firestore erfasst.
// Kopierschutz: preventScreenCapture beim Betreten.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as ScreenCapture from "expo-screen-capture";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { ladeDateiHoch } from "../cloudinary";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Pill from "../components/Pill";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import { PHASEN, aktualisiereZaehler } from "../util/baustelle";
import fehlerText from "../util/fehler";

export default function FotosScreen({ route, navigation }) {
  const { baustelleId } = route.params;
  const { profil, istHandwerker } = useAuth();
  const [phase, setPhase] = useState(PHASEN[0]);
  const [fotos, setFotos] = useState([]);
  const [notiz, setNotiz] = useState("");
  const [laedt, setLaedt] = useState(true);
  const [hochladen, setHochladen] = useState(false);

  // Kopierschutz aktiv, solange dieser Bildschirm sichtbar ist
  useFocusEffect(
    useCallback(() => {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );

  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "fotos"),
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        liste.sort((a, b) => (b.erstelltAm?.seconds || 0) - (a.erstelltAm?.seconds || 0));
        setFotos(liste);
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  const proPhase = fotos.filter((f) => f.phase === phase);

  function anzahl(p) {
    return fotos.filter((f) => f.phase === p).length;
  }

  async function fotoWaehlen() {
    // Im Web direkt den Dateiwähler öffnen (iOS bietet dort selbst
    // "Fotoübersicht / Foto aufnehmen" an)
    if (Platform.OS === "web") {
      quelle("galerie");
      return;
    }
    Alert.alert("Foto hinzufügen", "Woher möchten Sie das Foto?", [
      { text: "Kamera", onPress: () => quelle("kamera") },
      { text: "Galerie", onPress: () => quelle("galerie") },
      { text: "Abbrechen", style: "cancel" },
    ]);
  }

  async function quelle(art) {
    try {
      let erg;
      if (art === "kamera") {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) {
          Alert.alert("Kein Zugriff", "Bitte erlauben Sie den Kamerazugriff in den Einstellungen.");
          return;
        }
        erg = await ImagePicker.launchCameraAsync({ quality: 1 });
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) {
          Alert.alert("Kein Zugriff", "Bitte erlauben Sie den Fotozugriff in den Einstellungen.");
          return;
        }
        erg = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
      }
      if (erg.canceled || !erg.assets?.length) return;
      await hochladenFoto(erg.assets[0].uri);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function hochladenFoto(uri) {
    setHochladen(true);
    try {
      // Auf max. 1600 px Breite verkleinern, Qualität 0.7 (Base64 direkt mitnehmen)
      const bearbeitet = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const { url, publicId } = await ladeDateiHoch(bearbeitet.uri, {
        typ: "image",
        dateiname: `${baustelleId}_${phase}_${Date.now()}.jpg`,
        base64: bearbeitet.base64,
      });

      await addDoc(collection(db, "baustellen", baustelleId, "fotos"), {
        url,
        publicId,
        phase,
        notiz: notiz.trim(),
        hochgeladenVon: profil.id,
        erstelltAm: serverTimestamp(),
      });

      setNotiz("");
      await aktualisiereZaehler(baustelleId);
    } catch (e) {
      // Upload-Fehler mit konkreter Ursache anzeigen (hilft bei der Diagnose)
      const text = e?.message?.startsWith("Upload fehlgeschlagen")
        ? e.message
        : fehlerText(e);
      Alert.alert("Upload fehlgeschlagen", text);
    } finally {
      setHochladen(false);
    }
  }

  function oeffneViewer(index) {
    navigation.navigate("FotoViewer", {
      baustelleId,
      fotos: proPhase,
      start: index,
    });
  }

  if (laedt) return <Ladeanzeige text="Fotos werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Phasen-Chips */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipLeiste}
        >
          {PHASEN.map((p) => (
            <Pill
              key={p}
              text={`${p} (${anzahl(p)})`}
              aktiv={phase === p}
              onPress={() => setPhase(p)}
              style={{ marginRight: 8 }}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Handwerker: Notiz + Hinzufügen */}
        {istHandwerker ? (
          <View style={styles.addBox}>
            <Feld
              label={`Notiz für Phase „${phase}“ (optional)`}
              wert={notiz}
              onChangeText={setNotiz}
              platzhalter="z. B. Wandanschluss links"
            />
            {hochladen ? (
              <View style={styles.uploadReihe}>
                <ActivityIndicator color={farben.rot} />
                <Text style={styles.uploadText}>Foto wird hochgeladen …</Text>
              </View>
            ) : (
              <Knopf titel="Foto hinzufügen" onPress={fotoWaehlen} variante="sekundaer" />
            )}
          </View>
        ) : null}

        {/* Raster */}
        {proPhase.length === 0 ? (
          <Leerzustand
            symbol="🖼️"
            titel="Noch keine Fotos"
            text={
              istHandwerker
                ? `Für die Phase „${phase}“ wurde noch kein Foto hinzugefügt.`
                : `Für die Phase „${phase}“ liegen noch keine Bilder vor.`
            }
          />
        ) : (
          <View style={styles.raster}>
            {proPhase.map((f, i) => (
              <Pressable key={f.id} style={styles.zelle} onPress={() => oeffneViewer(i)}>
                <Image source={{ uri: f.url }} style={styles.bild} />
                {f.notiz ? <Text style={styles.notiz} numberOfLines={2}>{f.notiz}</Text> : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  chipLeiste: { paddingHorizontal: 16, paddingVertical: 12 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  addBox: { marginBottom: 18 },
  uploadReihe: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, justifyContent: "center" },
  uploadText: { ...schrift.body, fontSize: 14, color: farben.textWeich },
  raster: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  zelle: { width: "48.5%", marginBottom: 14 },
  bild: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: farben.bgErhoben,
    borderWidth: 1,
    borderColor: farben.linie,
  },
  notiz: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6 },
});
