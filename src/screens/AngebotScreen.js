// ---------------------------------------------------------------------------
// AngebotScreen.js — Angebots-PDF.
// Handwerker: PDF hochladen, Betrag setzen, Status per Chips, Vorschau.
// Kunde: bildschirmfüllende Ansicht ohne Speichern/Teilen/Drucken,
//        Annehmen/Ablehnen bei Status "Gesendet", Wasserzeichen, Kopierschutz.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as ScreenCapture from "expo-screen-capture";
import Pdf from "react-native-pdf";
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

import { db } from "../firebase";
import { ladeDateiHoch } from "../cloudinary";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Feld from "../components/Feld";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import { datumDe, euroDe } from "../util/format";
import fehlerText from "../util/fehler";

const STATUS = ["Entwurf", "Gesendet", "Angenommen", "Abgelehnt"];

// Wasserzeichen-Gitter: halbtransparent, diagonal, nicht anklickbar.
function Wasserzeichen({ text }) {
  const reihen = Array.from({ length: 10 });
  const spalten = Array.from({ length: 4 });
  return (
    <View style={styles.wzWrap} pointerEvents="none">
      {reihen.map((_, r) => (
        <View key={r} style={styles.wzReihe}>
          {spalten.map((__, c) => (
            <Text key={c} style={styles.wzText}>
              {text}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function AngebotScreen({ route }) {
  const { baustelleId } = route.params;
  const { profil, istHandwerker } = useAuth();

  const [angebot, setAngebot] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [hochladen, setHochladen] = useState(false);
  const [betrag, setBetrag] = useState("");

  // Kopierschutz für den Kunden (und auch beim Handwerker unschädlich)
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
      doc(db, "baustellen", baustelleId, "angebot", "aktuell"),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setAngebot(d);
          if (d.betrag != null) setBetrag(String(d.betrag));
        } else {
          setAngebot(null);
        }
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  async function pdfWaehlen() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      await pdfHochladen(res.assets[0]);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function pdfHochladen(datei) {
    setHochladen(true);
    try {
      const { url, publicId } = await ladeDateiHoch(datei.uri, {
        typ: "raw",
        dateiname: datei.name,
      });

      await setDoc(doc(db, "baustellen", baustelleId, "angebot", "aktuell"), {
        pdfUrl: url,
        pdfPfad: publicId,
        dateiname: datei.name,
        betrag: betrag.trim() ? Number(betrag.replace(",", ".")) : null,
        status: "Gesendet", // automatisch beim Hochladen
        hochgeladenVon: profil.id,
        aktualisiertAm: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Upload fehlgeschlagen", fehlerText(e));
    } finally {
      setHochladen(false);
    }
  }

  async function statusSetzen(neu) {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId, "angebot", "aktuell"), {
        status: neu,
        aktualisiertAm: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function betragSpeichern() {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId, "angebot", "aktuell"), {
        betrag: betrag.trim() ? Number(betrag.replace(",", ".")) : null,
        aktualisiertAm: serverTimestamp(),
      });
      Alert.alert("Gespeichert", "Der Betrag wurde gespeichert.");
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function kundeEntscheidung(neu) {
    const wort = neu === "Angenommen" ? "annehmen" : "ablehnen";
    Alert.alert(
      `Angebot ${wort}?`,
      `Möchten Sie das Angebot verbindlich ${wort}?`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: neu, onPress: () => statusSetzen(neu) },
      ]
    );
  }

  if (laedt) return <Ladeanzeige text="Angebot wird geladen …" />;

  // ---------------------------------------------------------------- KUNDE
  if (!istHandwerker) {
    if (!angebot) {
      return (
        <SafeAreaView style={styles.safe} edges={["bottom"]}>
          <Leerzustand
            symbol="📄"
            titel="Noch kein Angebot"
            text="Sobald Ihr Handwerker ein Angebot hochlädt, sehen Sie es hier."
          />
        </SafeAreaView>
      );
    }
    const wzText = `${profil?.name || "Kunde"} · ${datumDe(new Date())}`;
    return (
      <View style={styles.safe}>
        <View style={styles.kInfo}>
          <Pill text={angebot.status} aktiv={angebot.status === "Angenommen"} />
          <Text style={styles.kDatei} numberOfLines={1}>{angebot.dateiname}</Text>
        </View>

        <View style={styles.pdfWrap}>
          <Pdf
            source={{ uri: angebot.pdfUrl, cache: true }}
            trustAllCerts={false}
            style={styles.pdf}
            renderActivityIndicator={() => <ActivityIndicator color={farben.rot} size="large" />}
            onError={() => {}}
          />
          <Wasserzeichen text={wzText} />
        </View>

        {angebot.status === "Gesendet" ? (
          <SafeAreaView edges={["bottom"]} style={styles.kAktionen}>
            <View style={{ flex: 1 }}>
              <Knopf titel="Angebot annehmen" variante="sekundaer" onPress={() => kundeEntscheidung("Angenommen")} style={styles.annehmen} />
            </View>
            <View style={{ flex: 1 }}>
              <Knopf titel="Ablehnen" onPress={() => kundeEntscheidung("Abgelehnt")} />
            </View>
          </SafeAreaView>
        ) : null}
      </View>
    );
  }

  // ------------------------------------------------------------ HANDWERKER
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {hochladen ? (
          <View style={styles.uploadReihe}>
            <ActivityIndicator color={farben.rot} />
            <Text style={styles.uploadText}>PDF wird hochgeladen …</Text>
          </View>
        ) : (
          <Knopf
            titel={angebot ? "Neues PDF hochladen" : "Angebots-PDF hochladen"}
            onPress={pdfWaehlen}
          />
        )}

        {angebot ? (
          <>
            <Karte style={{ marginTop: 18 }}>
              <View style={styles.hKopf}>
                <Text style={styles.hDatei} numberOfLines={1}>{angebot.dateiname}</Text>
                <Pill text={angebot.status} aktiv={angebot.status === "Angenommen"} />
              </View>
              <Text style={styles.hDatum}>
                Aktualisiert: {datumDe(angebot.aktualisiertAm)}
              </Text>
              {angebot.betrag != null ? (
                <Text style={styles.hBetrag}>{euroDe(angebot.betrag)}</Text>
              ) : null}
            </Karte>

            <Text style={styles.label}>Betrag (€)</Text>
            <View style={styles.betragReihe}>
              <View style={{ flex: 1 }}>
                <Feld wert={betrag} onChangeText={setBetrag} keyboardType="decimal-pad" platzhalter="0,00" />
              </View>
              <Knopf titel="Speichern" variante="sekundaer" onPress={betragSpeichern} style={styles.betragKnopf} />
            </View>

            <Text style={styles.label}>Status</Text>
            <View style={styles.chips}>
              {STATUS.map((s) => (
                <Pill key={s} text={s} aktiv={angebot.status === s} onPress={() => statusSetzen(s)} style={{ marginRight: 8, marginBottom: 8 }} />
              ))}
            </View>

            <Text style={styles.label}>Vorschau</Text>
            <View style={styles.hPdfWrap}>
              <Pdf
                source={{ uri: angebot.pdfUrl, cache: true }}
                style={styles.hPdf}
                renderActivityIndicator={() => <ActivityIndicator color={farben.rot} />}
                onError={() => {}}
              />
            </View>
          </>
        ) : (
          <Text style={styles.leer}>
            Noch kein Angebot hochgeladen. Wählen Sie oben eine PDF-Datei aus.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  uploadReihe: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14 },
  uploadText: { fontFamily: schrift.body, fontSize: 14, color: farben.textWeich },

  // Kunde
  kInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: farben.linie,
  },
  kDatei: { flex: 1, fontFamily: schrift.body, fontSize: 14, color: farben.textWeich },
  pdfWrap: { flex: 1, backgroundColor: "#000" },
  pdf: { flex: 1, backgroundColor: "#000" },
  kAktionen: { flexDirection: "row", gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: farben.linie },
  annehmen: { backgroundColor: farben.gruen },

  // Wasserzeichen
  wzWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
    justifyContent: "space-around",
    transform: [{ rotate: "-45deg" }],
  },
  wzReihe: { flexDirection: "row", justifyContent: "space-around" },
  wzText: {
    color: "#ffffff",
    opacity: 0.12,
    fontSize: 15,
    fontFamily: schrift.headHalb,
    letterSpacing: 1,
  },

  // Handwerker
  hKopf: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  hDatei: { flex: 1, fontFamily: schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5 },
  hDatum: { fontFamily: schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 8 },
  hBetrag: { fontFamily: schrift.head, fontSize: 24, color: farben.text, letterSpacing: 0.5, marginTop: 10 },
  label: {
    fontFamily: schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  betragReihe: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  betragKnopf: { paddingHorizontal: 20, paddingVertical: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  hPdfWrap: {
    height: 420,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: farben.linie,
    backgroundColor: "#000",
  },
  hPdf: { flex: 1, width: width - 40, backgroundColor: "#000" },
  leer: { fontFamily: schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 20 },
});
