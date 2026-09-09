// ---------------------------------------------------------------------------
// BerichtScreen.js — Projektbericht einer Baustelle.
//
// Zeigt, was im Bericht stehen wird, und erzeugt ihn dann als druckfertige
// Seite. Der Browser macht daraus ein PDF ("Drucken" → "Als PDF sichern") —
// auf dem Mac wie auf dem iPhone.
//
// Warum kein PDF-Schreiber in der App: Er wäre ein weiteres Paket, das
// gepflegt werden will, und deutlich mehr Arbeit für dasselbe Ergebnis.
// Seitenumbrüche, Schriften und Bildgrößen kann der Browser besser.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, doc, onSnapshot, getDoc } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Ladeanzeige from "../components/Ladeanzeige";
import Leerzustand from "../components/Leerzustand";
import { PHASEN } from "../util/baustelle";
import { nachPhasen, berichtHtml } from "../util/bericht";
import { euroAusCent, summe as nachtragSumme } from "../util/nachtrag";

export default function BerichtScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { istHandwerker } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [baustelle, setBaustelle] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [nachtraege, setNachtraege] = useState([]);
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "baustellen", baustelleId))
      .then((s) => {
        setBaustelle(s.exists() ? { id: s.id, ...s.data() } : null);
        setLaedt(false);
      })
      .catch(() => setLaedt(false));
  }, [baustelleId]);

  useEffect(() => {
    const stops = [
      onSnapshot(
        collection(db, "baustellen", baustelleId, "fotos"),
        (s) => setFotos(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setFotos([])
      ),
      onSnapshot(
        collection(db, "baustellen", baustelleId, "nachtraege"),
        (s) => setNachtraege(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setNachtraege([])
      ),
    ];
    return () => stops.forEach((f) => f());
  }, [baustelleId]);

  const gruppen = useMemo(() => nachPhasen(fotos, PHASEN), [fotos]);
  const freigegeben = nachtragSumme(nachtraege, ["freigegeben", "abgerechnet"]);

  function erzeugen() {
    const html = berichtHtml({ baustelle, gruppen, nachtraege, erstelltAm: new Date() });

    if (Platform.OS !== "web") {
      Alert.alert(
        "Am Rechner erzeugen",
        "Den Bericht als PDF gibt es in der Browser-Fassung von WerkBuch — " +
          "dort übernimmt der Browser das Speichern."
      );
      return;
    }

    // Eigenes Fenster statt eines Downloads: So sieht man den Bericht erst und
    // entscheidet dann, ob man ihn behält.
    const fenster = window.open("", "_blank");
    if (!fenster) {
      Alert.alert(
        "Fenster wurde blockiert",
        "Bitte erlauben Sie für diese Seite Pop-up-Fenster und versuchen Sie es erneut."
      );
      return;
    }
    fenster.document.open();
    fenster.document.write(html);
    fenster.document.close();
  }

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="🔒"
          titel="Nur für den Betriebsinhaber"
          text="Der Projektbericht enthält auch Beträge und wird deshalb nur vom Inhaber erzeugt."
        />
      </SafeAreaView>
    );
  }

  if (laedt) return <Ladeanzeige text="Bericht wird vorbereitet …" />;

  const anzahlFotos = gruppen.reduce((s, g) => s + g.fotos.length, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={textStil.h2}>{baustelle?.name || "Baustelle"}</Text>
        <Text style={[textStil.klein, { marginTop: 6, marginBottom: 20 }]}>
          Die ganze Sanierung in einem Dokument: Fotos nach Bauabschnitt, mit Datum,
          dazu die Eckdaten und die vom Kunden freigegebenen Nachträge.
        </Text>

        <Karte>
          <Text style={styles.zahl}>{anzahlFotos}</Text>
          <Text style={styles.zahlLabel}>
            {anzahlFotos === 1 ? "Foto im Bericht" : "Fotos im Bericht"}
          </Text>

          <View style={styles.trenner} />

          {gruppen.length === 0 ? (
            <Text style={styles.leer}>
              Noch keine Fotos erfasst. Der Bericht ließe sich erzeugen, wäre aber leer.
            </Text>
          ) : (
            gruppen.map((g) => (
              <View key={g.phase} style={styles.phaseZeile}>
                <Text style={styles.phaseName}>{g.phase}</Text>
                <Text style={styles.phaseAnzahl}>
                  {g.fotos.length} {g.fotos.length === 1 ? "Foto" : "Fotos"}
                </Text>
              </View>
            ))
          )}

          {freigegeben.anzahl > 0 ? (
            <>
              <View style={styles.trenner} />
              <View style={styles.phaseZeile}>
                <Text style={styles.phaseName}>
                  {freigegeben.anzahl === 1
                    ? "1 freigegebener Nachtrag"
                    : `${freigegeben.anzahl} freigegebene Nachträge`}
                </Text>
                <Text style={styles.phaseAnzahl}>{euroAusCent(freigegeben.nettoCent)}</Text>
              </View>
            </>
          ) : null}
        </Karte>

        <Knopf titel="Bericht erzeugen" onPress={erzeugen} style={{ marginTop: 22 }} />

        <Text style={styles.hinweis}>
          {Platform.OS === "web"
            ? "Der Bericht öffnet sich in einem neuen Fenster. Dort über „Drucken“ und " +
              "„Als PDF sichern“ speichern oder direkt an den Kunden weitergeben."
            : "Zum Speichern als PDF WerkBuch im Browser öffnen."}
        </Text>

        <Text style={styles.hinweisKlein}>
          Im Bericht stehen ausschließlich Fotos, Eckdaten und freigegebene Nachträge.
          Stunden, Einkaufspreise und die Kalkulation bleiben draußen — der Bericht ist
          zum Weitergeben gedacht.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  zahl: { ...schrift.head, fontSize: 46, color: farben.text, letterSpacing: 0.5 },
  zahlLabel: {
    ...schrift.headHalb, fontSize: groessen.klein, color: farben.textMatt,
    letterSpacing: 0.5, textTransform: "uppercase", marginTop: -4,
  },
  trenner: { height: 1, backgroundColor: farben.linie, marginVertical: 16 },
  phaseZeile: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 12 },
  phaseName: { ...schrift.bodyMed, fontSize: 15, color: farben.textWeich, flex: 1 },
  phaseAnzahl: { ...schrift.body, fontSize: 14, color: farben.textMatt },
  leer: { ...schrift.body, fontSize: 14, color: farben.textMatt },
  hinweis: { ...schrift.body, fontSize: 13, color: farben.textWeich, lineHeight: 21, marginTop: 18 },
  hinweisKlein: { ...schrift.body, fontSize: 12, color: farben.textMatt, lineHeight: 19, marginTop: 14 },
});
