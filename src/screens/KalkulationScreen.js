// ---------------------------------------------------------------------------
// KalkulationScreen.js — Nachkalkulation EINER Baustelle.
//
// Beantwortet die eine Frage, die in Excel bisher am Monatsende beantwortet
// wurde: Was ist an dieser Baustelle hängengeblieben?
//
// Umsatz (was der Kunde zahlt) und Budget stehen auf dem Baustellen-Dokument.
// Alles andere wird aus den drei Unterordnern gerechnet — gerechnet wird in
// util/kalkulation.js, damit AuswertungScreen dieselben Zahlen liefert.
//
// Nur der Betriebsinhaber.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { euroDe, mengeDe } from "../util/format";
import { kalkuliere, budgetAmpel, zahlOderNull } from "../util/kalkulation";

const AMPEL_FARBE = {
  gruen: farben.gruen,
  gelb: "#e8b93a",
  rot: farben.rotHell,
};

const AMPEL_TEXT = {
  gruen: "Im Rahmen",
  gelb: "Wird knapp",
  rot: "Budget überschritten",
};

// Prozent mit einer Nachkommastelle, z.B. 0.6672 -> "66,7 %"
function prozentDe(anteil) {
  if (anteil == null || !isFinite(anteil)) return "—";
  return (
    (anteil * 100).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + " %"
  );
}

export default function KalkulationScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { istHandwerker } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [baustelle, setBaustelle] = useState(null);
  const [stunden, setStunden] = useState([]);
  const [material, setMaterial] = useState([]);
  const [kosten, setKosten] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");

  const [umsatz, setUmsatz] = useState("");
  const [budget, setBudget] = useState("");
  const [uebernommen, setUebernommen] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!istHandwerker) {
      setLaedt(false);
      return;
    }
    const stop = onSnapshot(
      doc(db, "baustellen", baustelleId),
      (snap) => {
        const daten = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setBaustelle(daten);
        // Eingabefelder nur einmal übernehmen, damit ein Live-Update keine
        // laufende Eingabe überschreibt (gleiches Muster wie im Detail-Screen).
        setUebernommen((schon) => {
          if (!schon && daten) {
            setUmsatz(
              daten.umsatz != null ? String(daten.umsatz).replace(".", ",") : ""
            );
            setBudget(
              daten.budget != null ? String(daten.budget).replace(".", ",") : ""
            );
          }
          return true;
        });
        setLaedt(false);
      },
      (e) => {
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    );
    return stop;
  }, [baustelleId, istHandwerker]);

  useEffect(() => {
    if (!istHandwerker) return;
    const stops = [
      onSnapshot(
        collection(db, "baustellen", baustelleId, "stunden"),
        (s) => setStunden(s.docs.map((d) => d.data())),
        () => setStunden([])
      ),
      onSnapshot(
        collection(db, "baustellen", baustelleId, "material"),
        (s) => setMaterial(s.docs.map((d) => d.data())),
        () => setMaterial([])
      ),
      onSnapshot(
        collection(db, "baustellen", baustelleId, "kosten"),
        (s) => setKosten(s.docs.map((d) => d.data())),
        () => setKosten([])
      ),
    ];
    return () => stops.forEach((s) => s());
  }, [baustelleId, istHandwerker]);

  async function zahlenSpeichern() {
    setSpeichert(true);
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), {
        umsatz: zahlOderNull(umsatz),
        budget: zahlOderNull(budget),
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setSpeichert(false);
    }
  }

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="🔒"
          titel="Nur für den Betriebsinhaber"
          text="Umsatz, Kosten und Gewinn sieht ausschließlich der Inhaber."
        />
      </SafeAreaView>
    );
  }

  if (laedt) return <Ladeanzeige text="Kalkulation wird geladen …" />;

  // Gerechnet wird mit den EINGETIPPTEN Werten, nicht mit dem gespeicherten
  // Stand — so sieht man beim Tippen sofort, was ein anderer Umsatz bedeutet.
  const erg = kalkuliere({ umsatz, budget, stunden, material, kosten });
  const ampel = budgetAmpel(erg.budgetAusnutzung);
  const ungespeichert =
    zahlOderNull(umsatz) !== (baustelle?.umsatz ?? null) ||
    zahlOderNull(budget) !== (baustelle?.budget ?? null);

  const gewinnFarbe =
    erg.gewinn == null
      ? farben.textMatt
      : erg.gewinn >= 0
      ? farben.gruen
      : farben.rotHell;

  function zeile(label, wert, stil) {
    return (
      <View style={styles.zeile}>
        <Text style={styles.zLabel}>{label}</Text>
        <Text style={[styles.zWert, stil]}>{wert}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Fehlerkasten text={fehler} />

          {baustelle?.name ? (
            <Text style={styles.name}>{baustelle.name}</Text>
          ) : null}

          {/* Gewinn ganz oben — die eine Zahl, um die es geht. */}
          <Karte style={styles.gewinnKarte}>
            <Text style={styles.gewinnLabel}>Gewinn</Text>
            <Text style={[styles.gewinnWert, { color: gewinnFarbe }]}>
              {erg.gewinn == null ? "—" : euroDe(erg.gewinn)}
            </Text>
            {erg.gewinn == null ? (
              <Text style={styles.gewinnHinweis}>
                Noch nicht kalkuliert — tragen Sie unten die Auftragssumme ein.
              </Text>
            ) : (
              <Text style={styles.gewinnHinweis}>
                Marge {prozentDe(erg.marge)}
                {erg.ertragProStunde != null
                  ? `  ·  ${euroDe(erg.ertragProStunde)} pro Stunde`
                  : ""}
              </Text>
            )}
          </Karte>

          {/* Aufschlüsselung */}
          <Karte style={{ marginBottom: 14 }}>
            <Text style={styles.blockTitel}>Kosten</Text>
            {zeile("Personal", euroDe(erg.personalkosten))}
            {zeile("Material", euroDe(erg.materialkosten))}
            {zeile("Sonstiges", euroDe(erg.sonstigeKosten))}
            <View style={styles.strich} />
            {zeile("Gesamtkosten", euroDe(erg.gesamtkosten), styles.zWertFett)}
            <View style={{ height: 10 }} />
            {zeile(
              "Umsatz",
              erg.umsatz == null ? "nicht gesetzt" : euroDe(erg.umsatz),
              styles.zWertFett
            )}
          </Karte>

          {/* Kennzahlen */}
          <Karte style={{ marginBottom: 14 }}>
            <Text style={styles.blockTitel}>Kennzahlen</Text>
            {zeile("Arbeitsstunden", `${mengeDe(erg.stundenGesamt)} Std.`)}
            {zeile("Marge", prozentDe(erg.marge))}
            {zeile(
              "Ertrag je Stunde",
              erg.ertragProStunde == null ? "—" : euroDe(erg.ertragProStunde)
            )}
          </Karte>

          {/* Budget-Ampel */}
          {ampel ? (
            <Karte style={[styles.ampelKarte, { borderColor: AMPEL_FARBE[ampel] }]}>
              <View style={styles.ampelKopf}>
                <View
                  style={[styles.ampelPunkt, { backgroundColor: AMPEL_FARBE[ampel] }]}
                />
                <Text style={[styles.ampelText, { color: AMPEL_FARBE[ampel] }]}>
                  {AMPEL_TEXT[ampel]}
                </Text>
              </View>
              <Text style={styles.ampelZahl}>
                {prozentDe(erg.budgetAusnutzung)} des Budgets verbraucht
              </Text>
              <Text style={styles.ampelKlein}>
                {euroDe(erg.gesamtkosten)} von {euroDe(erg.budget || 0)}
              </Text>
            </Karte>
          ) : null}

          {/* Eingabe */}
          <Karte style={{ marginTop: 8 }}>
            <Text style={styles.blockTitel}>Auftragssumme und Budget</Text>
            <Feld
              label="Umsatz € (was der Kunde zahlt)"
              wert={umsatz}
              onChangeText={setUmsatz}
              keyboardType="decimal-pad"
              platzhalter="0,00"
            />
            <Feld
              label="Kostenbudget € (optional)"
              wert={budget}
              onChangeText={setBudget}
              keyboardType="decimal-pad"
              platzhalter="0,00"
            />
            <Text style={styles.hinweis}>
              Leer lassen heißt „noch nicht kalkuliert“ — die Baustelle bleibt
              dann aus allen Durchschnitten der Gesamtauswertung heraus. Das
              ist etwas anderes als 0 €.
            </Text>
            <Knopf
              titel={ungespeichert ? "Speichern" : "Gespeichert"}
              onPress={zahlenSpeichern}
              laedt={speichert}
              deaktiviert={!ungespeichert}
              style={{ marginTop: 14 }}
            />
          </Karte>

          {/* Absprünge */}
          <Knopf
            titel="Stunden bearbeiten"
            variante="ghost"
            onPress={() => navigation.navigate("Stunden", { baustelleId })}
            style={{ marginTop: 18 }}
          />
          <Knopf
            titel="Material bearbeiten"
            variante="ghost"
            onPress={() => navigation.navigate("Material", { baustelleId })}
            style={{ marginTop: 10 }}
          />
          <Knopf
            titel="Sonstige Kosten bearbeiten"
            variante="ghost"
            onPress={() => navigation.navigate("Kosten", { baustelleId })}
            style={{ marginTop: 10 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  name: {
    ...schrift.head,
    fontSize: groessen.h2,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  gewinnKarte: { alignItems: "center", paddingVertical: 26, marginBottom: 14 },
  gewinnLabel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textMatt,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  gewinnWert: { ...schrift.head, fontSize: 40, letterSpacing: 0.5 },
  gewinnHinweis: {
    ...schrift.body,
    fontSize: 13,
    color: farben.textMatt,
    marginTop: 10,
    textAlign: "center",
  },
  blockTitel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  zeile: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
    gap: 12,
  },
  zLabel: { ...schrift.body, fontSize: 14.5, color: farben.textWeich, flex: 1 },
  zWert: { ...schrift.bodyMed, fontSize: 15, color: farben.text, textAlign: "right" },
  zWertFett: { ...schrift.head, fontSize: 18, letterSpacing: 0.5 },
  strich: { height: 1, backgroundColor: farben.linie, marginVertical: 8 },
  ampelKarte: { marginBottom: 14, borderWidth: 1.5 },
  ampelKopf: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  ampelPunkt: { width: 10, height: 10, borderRadius: 5 },
  ampelText: { ...schrift.head, fontSize: 17, letterSpacing: 0.5 },
  ampelZahl: { ...schrift.bodyMed, fontSize: 15, color: farben.text },
  ampelKlein: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 4 },
  hinweis: {
    ...schrift.body,
    fontSize: 12.5,
    color: farben.textMatt,
    lineHeight: 18,
    marginTop: 2,
  },
});
