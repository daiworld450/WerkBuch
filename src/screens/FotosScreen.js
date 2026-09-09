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
import { standText } from "../util/warteschlange";
import { einreihen, abarbeiten, laden as warteschlangeLaden } from "../util/fotoVersand";
import { datumDe } from "../util/format";
import fehlerText from "../util/fehler";

export default function FotosScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { profil, darfBearbeiten } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;
  const [phase, setPhase] = useState(PHASEN[0]);
  const [fotos, setFotos] = useState([]);
  const [notiz, setNotiz] = useState("");
  const [laedt, setLaedt] = useState(true);
  const [hochladen, setHochladen] = useState(false);
  const [wartend, setWartend] = useState([]);

  // Kopierschutz aktiv, solange dieser Bildschirm sichtbar ist
  useFocusEffect(
    useCallback(() => {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );

  // Beim Betreten des Bildschirms nachsehen, ob noch etwas vom letzten Mal
  // ohne Netz liegengeblieben ist — und es dann losschicken.
  useFocusEffect(
    useCallback(() => {
      let aktiv = true;
      warteschlangeLaden().then((l) => aktiv && setWartend(l));
      abarbeiten((l) => aktiv && setWartend(l)).catch(() => {});
      return () => {
        aktiv = false;
      };
    }, [])
  );

  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "fotos"),
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Nach dem AUFNAHMEDATUM sortieren, wo es bekannt ist — sonst stünde
        // ein abends nachgereichtes Foto vom Morgen ganz oben.
        const wann = (f) => f.aufgenommenAm?.seconds || f.erstelltAm?.seconds || 0;
        liste.sort((a, b) => wann(b) - wann(a));
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
    Alert.alert("Fotos hinzufügen", "Woher möchten Sie die Fotos?", [
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
        erg = await ImagePicker.launchCameraAsync({ quality: 1, exif: true });
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) {
          Alert.alert("Kein Zugriff", "Bitte erlauben Sie den Fotozugriff in den Einstellungen.");
          return;
        }
        // Mehrere auf einmal: Auf der Baustelle macht man selten ein einzelnes
        // Bild, und jedes einzeln auszuwählen kostet mehr Zeit als das
        // Fotografieren selbst.
        erg = await ImagePicker.launchImageLibraryAsync({
          quality: 1,
          exif: true,
          allowsMultipleSelection: true,
          selectionLimit: 20,
        });
      }
      if (erg.canceled || !erg.assets?.length) return;
      await hochladenFotos(erg.assets);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  // Das Aufnahmedatum aus den Bilddaten (EXIF) lesen.
  //
  // Bis hierher ging es verloren: manipulateAsync entfernt beim Verkleinern
  // ALLE Metadaten. Für den Standort ist das genau richtig — Kundenfotos
  // sollen keine Koordinaten mit sich tragen. Für das Datum war es ein
  // Verlust: Angezeigt wurde der Zeitpunkt des Hochladens, und wer abends
  // überträgt, hatte den falschen Tag an der Bauphase stehen.
  //
  // Also: das Datum VOR dem Verkleinern herauslesen und getrennt speichern.
  // Der Standort bleibt draußen, das Datum bleibt erhalten.
  function aufnahmeDatum(asset) {
    const exif = asset?.exif || {};
    // EXIF schreibt "2026:09:01 14:22:33" — mit Doppelpunkten im Datumsteil.
    const roh = exif.DateTimeOriginal || exif.DateTimeDigitized || exif.DateTime;
    if (typeof roh === "string") {
      const t = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(roh.trim());
      if (t) {
        const d = new Date(+t[1], +t[2] - 1, +t[3], +t[4], +t[5], +t[6]);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    }
    // Manche Geräte liefern stattdessen einen Zeitstempel in Millisekunden.
    if (typeof asset?.creationTime === "number" && asset.creationTime > 0) {
      return new Date(asset.creationTime).toISOString();
    }
    return null;
  }

  async function hochladenFotos(assets) {
    setHochladen(true);
    let eingereiht = 0;
    try {
      for (const asset of assets) {
        const genommenAm = aufnahmeDatum(asset);

        // Verkleinern und Metadaten abstreifen — inklusive Standort.
        const bearbeitet = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        // IMMER erst in die Warteschlange, nie direkt senden. Dadurch gibt es
        // nur EINEN Weg ins Netz — und der überlebt einen Funkloch-Moment.
        const erg = await einreihen({
          baustelleId,
          phase,
          notiz: notiz.trim(),
          base64: bearbeitet.base64,
          dateiname: `${baustelleId}_${phase}_${Date.now()}_${eingereiht}.jpg`,
          aufgenommenAm: genommenAm,
          hochgeladenVon: profil?.id || null,
        });

        if (!erg.ok) {
          setWartend(erg.liste);
          Alert.alert("Nicht alle Fotos übernommen", erg.grund);
          break;
        }
        setWartend(erg.liste);
        eingereiht += 1;
      }

      setNotiz("");
      // Und jetzt raus damit, soweit das Netz mitspielt.
      await abarbeiten(setWartend);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
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
      {/* Was noch auf Empfang wartet */}
      {wartend.length > 0 ? (
        <Pressable onPress={() => abarbeiten(setWartend)} style={styles.wartenLeiste}>
          <Text style={styles.wartenText}>{standText(wartend)}</Text>
          <Text style={styles.wartenHinweis}>Tippen zum erneuten Versuch</Text>
        </Pressable>
      ) : null}

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
        {darfBearbeiten ? (
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
                <Text style={styles.uploadText}>Fotos werden übernommen …</Text>
              </View>
            ) : (
              <Knopf titel="Fotos hinzufügen" onPress={fotoWaehlen} variante="sekundaer" />
            )}
          </View>
        ) : null}

        {/* Raster */}
        {proPhase.length === 0 ? (
          <Leerzustand
            symbol="🖼️"
            titel="Noch keine Fotos"
            text={
              darfBearbeiten
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
                <Text style={styles.datum}>
                  {datumDe(f.aufgenommenAm || f.erstelltAm)}
                </Text>
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
  datum: { ...schrift.body, fontSize: 11, color: farben.textMatt, marginTop: 3 },
  wartenLeiste: {
    backgroundColor: farben.auswahlBg,
    borderBottomWidth: 1,
    borderBottomColor: farben.linie,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  wartenText: { ...schrift.bodyMed, fontSize: 13, color: farben.text },
  wartenHinweis: { ...schrift.body, fontSize: 11, color: farben.textMatt, marginTop: 2 },
});
