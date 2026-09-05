// ---------------------------------------------------------------------------
// KostenScreen.js — sonstige Kosten EINER Baustelle.
//
// Alles, was weder Material (eigener Bildschirm) noch Personal (Stunden) ist:
// Fahrt/„Tank", Werkzeug, Fremdleistung, Sonstiges.
//
// Nur der Betriebsinhaber — der Mitarbeiter bekommt weder Bildschirm noch
// Kachel, und die Firestore-Regel für den Unterordner „kosten" lässt ihn
// auch nicht lesen.
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
const DateTimePicker =
  Platform.OS === "web"
    ? null
    : require("@react-native-community/datetimepicker").default;
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Feld from "../components/Feld";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { datumDe, datumIso, zuDate, euroDe } from "../util/format";
import { tagOhneZeit } from "../util/termine";
import { zahlOderNull, sonstigeKosten } from "../util/kalkulation";

export const KOSTEN_ARTEN = [
  { key: "fahrt", label: "Fahrt / Tank", symbol: "⛽" },
  { key: "werkzeug", label: "Werkzeug", symbol: "🔧" },
  { key: "fremdleistung", label: "Fremdleistung", symbol: "🤝" },
  { key: "sonstiges", label: "Sonstiges", symbol: "🧾" },
];

function artInfo(key) {
  return KOSTEN_ARTEN.find((a) => a.key === key) || KOSTEN_ARTEN[3];
}

const webDatumStil = {
  background: "rgba(255,255,255,.05)",
  border: "1.5px solid rgba(255,255,255,.14)",
  borderRadius: 12,
  padding: "15px 16px",
  color: "#fff",
  fontSize: 16,
  marginBottom: 16,
  colorScheme: "dark",
  width: "100%",
};

const LEER = { art: "fahrt", bezeichnung: "", betrag: "" };

export default function KostenScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { istHandwerker } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [liste, setListe] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [form, setForm] = useState(LEER);
  const [datum, setDatum] = useState(() => tagOhneZeit(new Date()));
  const [editId, setEditId] = useState(null);
  const [formOffen, setFormOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [pickerAuf, setPickerAuf] = useState(false);

  useEffect(() => {
    if (!istHandwerker) {
      setLaedt(false);
      return;
    }
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "kosten"),
      (snap) => {
        const l = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        l.sort((a, b) => (b.datum?.seconds || 0) - (a.datum?.seconds || 0));
        setListe(l);
        setLaedt(false);
        setFehler("");
      },
      (e) => {
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    );
    return stop;
  }, [baustelleId, istHandwerker]);

  function feld(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function neuStart() {
    setForm(LEER);
    setDatum(tagOhneZeit(new Date()));
    setEditId(null);
    setFormOffen(true);
  }

  function bearbeiten(k) {
    setForm({
      art: k.art || "sonstiges",
      bezeichnung: k.bezeichnung || "",
      betrag: k.betrag != null ? String(k.betrag).replace(".", ",") : "",
    });
    setDatum(zuDate(k.datum) || tagOhneZeit(new Date()));
    setEditId(k.id);
    setFormOffen(true);
  }

  function abbrechen() {
    setFormOffen(false);
    setForm(LEER);
    setEditId(null);
  }

  async function speichern() {
    if (!form.bezeichnung.trim()) {
      Alert.alert("Fehlt noch", "Bitte geben Sie eine Bezeichnung ein.");
      return;
    }
    const betrag = zahlOderNull(form.betrag);
    if (betrag == null) {
      Alert.alert("Betrag fehlt", "Bitte einen Betrag in Euro eintragen.");
      return;
    }
    const daten = {
      art: form.art,
      bezeichnung: form.bezeichnung.trim(),
      betrag,
      datum: Timestamp.fromDate(tagOhneZeit(datum)),
    };
    setSpeichert(true);
    try {
      if (editId) {
        await updateDoc(doc(db, "baustellen", baustelleId, "kosten", editId), daten);
      } else {
        await addDoc(collection(db, "baustellen", baustelleId, "kosten"), {
          ...daten,
          erstelltAm: serverTimestamp(),
        });
      }
      abbrechen();
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setSpeichert(false);
    }
  }

  function loeschenFragen(k) {
    Alert.alert("Kosten löschen?", `${k.bezeichnung} · ${euroDe(k.betrag || 0)}`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "baustellen", baustelleId, "kosten", k.id));
          } catch (e) {
            Alert.alert("Fehler", fehlerText(e));
          }
        },
      },
    ]);
  }

  function datumsFeld() {
    if (Platform.OS === "web") {
      return (
        <input
          type="date"
          value={datumIso(datum)}
          onChange={(ev) => {
            const d = new Date(ev.target.value + "T12:00:00");
            if (!isNaN(d.getTime())) setDatum(tagOhneZeit(d));
          }}
          style={webDatumStil}
        />
      );
    }
    return (
      <>
        <Pressable onPress={() => setPickerAuf(true)} style={styles.datumFeld}>
          <Text style={styles.datumText}>{datumDe(datum)}</Text>
        </Pressable>
        {pickerAuf ? (
          <DateTimePicker
            value={datum}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="dark"
            onChange={(ev, gewaehlt) => {
              setPickerAuf(Platform.OS === "ios");
              if (gewaehlt) setDatum(tagOhneZeit(gewaehlt));
            }}
          />
        ) : null}
      </>
    );
  }

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="🔒"
          titel="Nur für den Betriebsinhaber"
          text="Kosten sieht und pflegt der Inhaber."
        />
      </SafeAreaView>
    );
  }

  if (laedt) return <Ladeanzeige text="Kosten werden geladen …" />;

  const summe = sonstigeKosten(liste);

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

          {liste.length === 0 && !formOffen ? (
            <Leerzustand
              symbol="🧾"
              titel="Noch keine Kosten"
              text="Fahrten, Werkzeug, Fremdleistungen — alles außer Material und Arbeitsstunden."
              knopfTitel="Kosten erfassen"
              onKnopf={neuStart}
            />
          ) : (
            liste.map((k) => {
              const a = artInfo(k.art);
              return (
                <Karte key={k.id} style={styles.kKarte} onPress={() => bearbeiten(k)}>
                  <View style={styles.kKopf}>
                    <Text style={styles.kBez}>
                      {a.symbol} {k.bezeichnung}
                    </Text>
                    <Pressable onPress={() => loeschenFragen(k)} hitSlop={8}>
                      <Text style={styles.kLoeschen}>✕</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.kZeile}>
                    {a.label} · {datumDe(k.datum)}
                  </Text>
                  <Text style={styles.kBetrag}>{euroDe(k.betrag || 0)}</Text>
                </Karte>
              );
            })
          )}

          {liste.length > 0 ? (
            <Karte style={styles.summeKarte}>
              <Text style={styles.summeLabel}>Summe sonstige Kosten</Text>
              <Text style={styles.summeWert}>{euroDe(summe)}</Text>
            </Karte>
          ) : null}

          {formOffen ? (
            <Karte style={{ marginTop: 8 }}>
              <Text style={styles.formTitel}>
                {editId ? "Kosten bearbeiten" : "Neue Kosten"}
              </Text>

              <Text style={styles.kleinLabel}>Art</Text>
              <View style={styles.chips}>
                {KOSTEN_ARTEN.map((a) => (
                  <Pill
                    key={a.key}
                    text={a.label}
                    aktiv={form.art === a.key}
                    onPress={() => feld("art", a.key)}
                    style={{ marginRight: 8, marginBottom: 8 }}
                  />
                ))}
              </View>
              <View style={{ height: 8 }} />

              <Feld
                label="Bezeichnung"
                wert={form.bezeichnung}
                onChangeText={(v) => feld("bezeichnung", v)}
                platzhalter="z. B. Tanken Fahrt Essen"
              />
              <Feld
                label="Betrag €"
                wert={form.betrag}
                onChangeText={(v) => feld("betrag", v)}
                keyboardType="decimal-pad"
                platzhalter="0,00"
              />

              <Text style={styles.kleinLabel}>Datum</Text>
              {datumsFeld()}

              <Knopf
                titel={editId ? "Änderungen speichern" : "Kosten speichern"}
                onPress={speichern}
                laedt={speichert}
              />
              <Knopf
                titel="Abbrechen"
                variante="ghost"
                onPress={abbrechen}
                style={{ marginTop: 10 }}
              />
            </Karte>
          ) : null}

          {!formOffen && liste.length > 0 ? (
            <Knopf titel="+ Kosten erfassen" onPress={neuStart} style={{ marginTop: 6 }} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  kKarte: { marginBottom: 10 },
  kKopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  kBez: { ...schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5, flex: 1 },
  kLoeschen: { ...schrift.head, fontSize: 18, color: farben.rotHell, paddingLeft: 10 },
  kZeile: { ...schrift.body, fontSize: 13.5, color: farben.textMatt, marginTop: 4 },
  kBetrag: { ...schrift.head, fontSize: 20, color: farben.text, letterSpacing: 0.5, marginTop: 8 },
  summeKarte: { marginBottom: 18, alignItems: "center", paddingVertical: 20 },
  summeLabel: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginBottom: 6 },
  summeWert: { ...schrift.head, fontSize: 30, color: farben.text, letterSpacing: 0.5 },
  formTitel: {
    ...schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  kleinLabel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  datumFeld: {
    backgroundColor: farben.feldBg,
    borderWidth: 1.5,
    borderColor: farben.linie,
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  datumText: { ...schrift.body, fontSize: 16, color: farben.text },
});
