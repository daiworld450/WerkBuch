// ---------------------------------------------------------------------------
// AngebotScreen.js — Angebots-PDF (nur Handwerker-Ansicht, kein Kunden-Login
// mehr): PDF hochladen, Betrag eingeben, Status frei wählen (Entwurf,
// Gesendet, Angenommen, Abgelehnt) — der Handwerker trägt selbst ein, was der
// Kunde mündlich/telefonisch mitgeteilt hat.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { ladeDateiHoch, pdfSeitenBild } from "../cloudinary";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Feld from "../components/Feld";
import Ladeanzeige from "../components/Ladeanzeige";
import { datumDe, euroDe } from "../util/format";
import fehlerText from "../util/fehler";

// Der Handwerker wählt den Status frei — er trägt selbst ein, was der Kunde
// mündlich/telefonisch mitgeteilt hat. Kein Kunden-Login, keine automatische
// Übernahme.
const STATUS = ["Entwurf", "Gesendet", "Angenommen", "Abgelehnt"];

// Eine einzelne PDF-Seite als Bild — ermittelt ihr echtes Seitenverhältnis
// (Hoch- oder Querformat, nicht jedes PDF ist A4) und passt die Höhe exakt
// an, damit die Seite vollständig und unverzerrt zu sehen ist.
function PdfSeite({ url, breite }) {
  // A4-Hochformat als Startwert, bis die echte Größe bekannt ist —
  // vermeidet ein Springen von Nullhöhe auf die richtige Höhe.
  const [verhaeltnis, setVerhaeltnis] = useState(1.414);

  useEffect(() => {
    let aktiv = true;
    Image.getSize(
      url,
      (w, h) => {
        if (aktiv && w > 0) setVerhaeltnis(h / w);
      },
      () => {} // bei Fehler beim A4-Startwert bleiben
    );
    return () => {
      aktiv = false;
    };
  }, [url]);

  return (
    <Image
      source={{ uri: url }}
      style={{
        width: breite,
        height: breite * verhaeltnis,
        backgroundColor: "#fff",
        marginBottom: 10,
        borderRadius: 8,
      }}
      resizeMode="contain"
    />
  );
}

// Zeigt alle PDF-Seiten als Bilder — funktioniert auf iPhone, Android und im
// Web identisch; ganz ohne PDF-Betrachter oder Download-Knopf.
function PdfSeiten({ pdfUrl, seiten = 1, breite }) {
  const urls = Array.from({ length: Math.max(1, seiten) }, (_, i) =>
    pdfSeitenBild(pdfUrl, i + 1)
  );
  return (
    <>
      {urls.map((u, i) => (
        <PdfSeite key={u} url={u} breite={breite} />
      ))}
    </>
  );
}

export default function AngebotScreen({ route, navigation }) {
  const { baustelleId, kundeName } = route.params || {};
  const { profil } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;
  const { width: fensterBreite } = useWindowDimensions();

  const [angebot, setAngebot] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [hochladen, setHochladen] = useState(false);
  const [betrag, setBetrag] = useState("");

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
        type: ["application/pdf"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const datei = res.assets[0];

      // Cloudinary (Gratis-Tarif) erlaubt max. 10 MB pro Datei
      if (datei.size && datei.size > 9.5 * 1024 * 1024) {
        Alert.alert(
          "PDF zu groß",
          `Die Datei ist ${(datei.size / 1024 / 1024).toFixed(1)} MB groß. Maximal möglich sind 10 MB. Bitte verkleinern Sie das PDF (z. B. beim Export „reduzierte Größe“ wählen).`
        );
        return;
      }
      await pdfHochladen(datei);
    } catch (e) {
      Alert.alert("Fehler", e?.message || fehlerText(e));
    }
  }

  async function pdfHochladen(datei) {
    setHochladen(true);
    try {
      const { url, publicId, seiten } = await ladeDateiHoch(datei.uri, {
        typ: "pdf",
        dateiname: datei.name,
      });

      await setDoc(doc(db, "baustellen", baustelleId, "angebot", "aktuell"), {
        pdfUrl: url,
        pdfPfad: publicId,
        seiten: seiten || 1,
        dateiname: datei.name,
        betrag: betrag.trim() ? Number(betrag.replace(",", ".")) : null,
        status: "Gesendet", // automatisch beim Hochladen
        hochgeladenVon: profil.id,
        aktualisiertAm: serverTimestamp(),
      });
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

  if (laedt) return <Ladeanzeige text="Angebot wird geladen …" />;

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
                <Text style={styles.hDatei} numberOfLines={1}>
                  {angebot.dateiname}
                  {kundeName ? ` — ${kundeName}` : ""}
                </Text>
                <Pill text={angebot.status} aktiv={angebot.status === "Angenommen" || angebot.status === "Abgelehnt"} />
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
              <ScrollView contentContainerStyle={styles.pdfScrollHandwerker}>
                <PdfSeiten
                  pdfUrl={angebot.pdfUrl}
                  seiten={angebot.seiten || 1}
                  breite={fensterBreite - 72}
                />
              </ScrollView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  uploadReihe: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14 },
  uploadText: { ...schrift.body, fontSize: 14, color: farben.textWeich },

  hKopf: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  hDatei: { flex: 1, ...schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5 },
  hDatum: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 8 },
  hBetrag: { ...schrift.head, fontSize: 24, color: farben.text, letterSpacing: 0.5, marginTop: 10 },
  label: {
    ...schrift.headHalb,
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
    maxHeight: 560,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: farben.linie,
    backgroundColor: "#000",
  },
  pdfScrollHandwerker: { paddingVertical: 16, alignItems: "center" },
  leer: { ...schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 20 },
});
