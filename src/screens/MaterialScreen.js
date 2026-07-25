// ---------------------------------------------------------------------------
// MaterialScreen.js — Materialliste, gruppiert nach Kategorie.
// Zeilensummen + Gesamtsumme nur für Handwerker. Menge kann aus der
// Flächenberechnung übernommen werden. Handwerker legt an/bearbeitet/löscht.
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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
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
import { berechneAlles, zahl } from "../util/berechnung";
import { euroDe, mengeDe } from "../util/format";
import fehlerText from "../util/fehler";

const KATEGORIEN = ["Fliesen Boden", "Fliesen Wand", "Bodenbelag", "Sanitär", "Sonstiges"];
const EINHEITEN = ["m²", "Stück", "lfm", "Pack"];

const LEER = {
  kategorie: "Fliesen Boden",
  bezeichnung: "",
  format: "",
  menge: "",
  einheit: "m²",
  einzelpreis: "",
  bemerkung: "",
};

export default function MaterialScreen({ route }) {
  const { baustelleId } = route.params;
  const { istHandwerker } = useAuth();

  const [liste, setListe] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [form, setForm] = useState(LEER);
  const [editId, setEditId] = useState(null);
  const [formOffen, setFormOffen] = useState(false);

  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "material"),
      (snap) => {
        const l = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        l.sort((a, b) => (a.erstelltAm?.seconds || 0) - (b.erstelltAm?.seconds || 0));
        setListe(l);
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  function feld(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function neuStart() {
    setForm(LEER);
    setEditId(null);
    setFormOffen(true);
  }

  function bearbeiten(m) {
    setForm({
      kategorie: m.kategorie || "Fliesen Boden",
      bezeichnung: m.bezeichnung || "",
      format: m.format || "",
      menge: m.menge != null ? String(m.menge) : "",
      einheit: m.einheit || "m²",
      einzelpreis: m.einzelpreis != null ? String(m.einzelpreis) : "",
      bemerkung: m.bemerkung || "",
    });
    setEditId(m.id);
    setFormOffen(true);
  }

  // Menge aus der Flächenberechnung übernehmen (nur sinnvoll bei Fliesen)
  async function mengeUebernehmen() {
    try {
      const snap = await getDoc(doc(db, "baustellen", baustelleId, "raum", "haupt"));
      if (!snap.exists()) {
        Alert.alert("Keine Maße", "Es wurden noch keine Raummaße erfasst.");
        return;
      }
      const erg = berechneAlles(snap.data());
      let menge = null;
      if (form.kategorie === "Fliesen Boden") menge = erg.fliesenbedarfBoden;
      else if (form.kategorie === "Fliesen Wand") menge = erg.fliesenbedarfWand;
      else {
        Alert.alert("Nur für Fliesen", "Die Übernahme funktioniert für „Fliesen Boden“ oder „Fliesen Wand“.");
        return;
      }
      setForm((f) => ({ ...f, menge: menge.toFixed(2).replace(".", ","), einheit: "m²" }));
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function speichern() {
    if (!form.bezeichnung.trim()) {
      Alert.alert("Fehlt noch", "Bitte geben Sie eine Bezeichnung ein.");
      return;
    }
    const daten = {
      kategorie: form.kategorie,
      bezeichnung: form.bezeichnung.trim(),
      format: form.format.trim() || null,
      menge: zahl(form.menge),
      einheit: form.einheit,
      einzelpreis: form.einzelpreis.trim() ? zahl(form.einzelpreis) : null,
      bemerkung: form.bemerkung.trim(),
    };
    try {
      if (editId) {
        await updateDoc(doc(db, "baustellen", baustelleId, "material", editId), daten);
      } else {
        await addDoc(collection(db, "baustellen", baustelleId, "material"), {
          ...daten,
          erstelltAm: serverTimestamp(),
        });
      }
      setForm(LEER);
      setEditId(null);
      setFormOffen(false);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function loeschenFragen(m) {
    Alert.alert("Position löschen?", m.bezeichnung, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "baustellen", baustelleId, "material", m.id));
          } catch (e) {
            Alert.alert("Fehler", fehlerText(e));
          }
        },
      },
    ]);
  }

  const gesamt = liste.reduce(
    (s, m) => s + (m.einzelpreis ? zahl(m.menge) * zahl(m.einzelpreis) : 0),
    0
  );

  if (laedt) return <Ladeanzeige text="Material wird geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {liste.length === 0 && !formOffen ? (
            <Leerzustand
              symbol="🧱"
              titel="Noch kein Material"
              text={
                istHandwerker
                  ? "Erfassen Sie Fliesen, Bodenbelag, Sanitär und mehr."
                  : "Sobald Material erfasst wird, sehen Sie es hier."
              }
              knopfTitel={istHandwerker ? "Material hinzufügen" : undefined}
              onKnopf={istHandwerker ? neuStart : undefined}
            />
          ) : (
            KATEGORIEN.map((kat) => {
              const gruppe = liste.filter((m) => m.kategorie === kat);
              if (gruppe.length === 0) return null;
              return (
                <View key={kat} style={{ marginBottom: 18 }}>
                  <Text style={styles.katH}>{kat}</Text>
                  {gruppe.map((m) => (
                    <Karte key={m.id} style={styles.mKarte} onPress={istHandwerker ? () => bearbeiten(m) : undefined}>
                      <View style={styles.mKopf}>
                        <Text style={styles.mBez}>{m.bezeichnung}</Text>
                        {istHandwerker ? (
                          <Pressable onPress={() => loeschenFragen(m)} hitSlop={8}>
                            <Text style={styles.mLoeschen}>✕</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {m.format ? <Text style={styles.mZeile}>Format: {m.format}</Text> : null}
                      <Text style={styles.mZeile}>
                        Menge: {mengeDe(m.menge)} {m.einheit}
                        {m.einzelpreis != null ? `  ·  ${euroDe(m.einzelpreis)} / ${m.einheit}` : ""}
                      </Text>
                      {m.einzelpreis != null && istHandwerker ? (
                        <Text style={styles.mSumme}>
                          Zeilensumme: {euroDe(zahl(m.menge) * zahl(m.einzelpreis))}
                        </Text>
                      ) : null}
                      {m.bemerkung ? <Text style={styles.mBemerkung}>{m.bemerkung}</Text> : null}
                    </Karte>
                  ))}
                </View>
              );
            })
          )}

          {/* Gesamtsumme nur Handwerker */}
          {istHandwerker && gesamt > 0 ? (
            <Karte style={styles.gesamtKarte}>
              <Text style={styles.gesamtLabel}>Gesamtsumme Material</Text>
              <Text style={styles.gesamtWert}>{euroDe(gesamt)}</Text>
            </Karte>
          ) : null}

          {/* Formular */}
          {istHandwerker && formOffen ? (
            <Karte style={{ marginTop: 8 }}>
              <Text style={styles.formTitel}>
                {editId ? "Position bearbeiten" : "Neue Position"}
              </Text>

              <Text style={styles.kleinLabel}>Kategorie</Text>
              <View style={styles.chips}>
                {KATEGORIEN.map((k) => (
                  <Pill key={k} text={k} aktiv={form.kategorie === k} onPress={() => feld("kategorie", k)} style={{ marginRight: 8, marginBottom: 8 }} />
                ))}
              </View>

              <Feld label="Bezeichnung" wert={form.bezeichnung} onChangeText={(v) => feld("bezeichnung", v)} platzhalter="z. B. Feinsteinzeug Betonoptik grau" />
              <Feld label="Format (optional)" wert={form.format} onChangeText={(v) => feld("format", v)} platzhalter="z. B. 60 × 120 cm" />

              <View style={styles.reihe}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Feld label="Menge" wert={form.menge} onChangeText={(v) => feld("menge", v)} keyboardType="decimal-pad" platzhalter="0,00" />
                </View>
              </View>

              <Text style={styles.kleinLabel}>Einheit</Text>
              <View style={styles.chips}>
                {EINHEITEN.map((e) => (
                  <Pill key={e} text={e} aktiv={form.einheit === e} onPress={() => feld("einheit", e)} style={{ marginRight: 8, marginBottom: 8 }} />
                ))}
              </View>

              {(form.kategorie === "Fliesen Boden" || form.kategorie === "Fliesen Wand") ? (
                <Knopf titel="Menge aus Flächenberechnung übernehmen" variante="ghost" onPress={mengeUebernehmen} style={{ marginBottom: 14 }} />
              ) : null}

              <Feld label="Einzelpreis € (optional)" wert={form.einzelpreis} onChangeText={(v) => feld("einzelpreis", v)} keyboardType="decimal-pad" platzhalter="0,00" />
              <Feld label="Bemerkung (optional)" wert={form.bemerkung} onChangeText={(v) => feld("bemerkung", v)} platzhalter="z. B. Lieferzeit 2 Wochen" />

              <Knopf titel={editId ? "Änderungen speichern" : "Position speichern"} onPress={speichern} />
              <Knopf
                titel="Abbrechen"
                variante="ghost"
                onPress={() => { setFormOffen(false); setForm(LEER); setEditId(null); }}
                style={{ marginTop: 10 }}
              />
            </Karte>
          ) : null}

          {/* Hinzufügen-Button, wenn Liste nicht leer */}
          {istHandwerker && !formOffen && liste.length > 0 ? (
            <Knopf titel="+ Material hinzufügen" onPress={neuStart} style={{ marginTop: 6 }} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  katH: {
    fontFamily: schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  mKarte: { marginBottom: 10 },
  mKopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  mBez: { fontFamily: schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5, flex: 1 },
  mLoeschen: { fontFamily: schrift.head, fontSize: 18, color: farben.rotHell, paddingLeft: 10 },
  mZeile: { fontFamily: schrift.body, fontSize: 14, color: farben.textWeich, marginTop: 4 },
  mSumme: { fontFamily: schrift.headHalb, fontSize: 14, color: farben.gruen, marginTop: 6, letterSpacing: 0.5 },
  mBemerkung: { fontFamily: schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6, fontStyle: "italic" },
  gesamtKarte: { marginBottom: 18, alignItems: "center", paddingVertical: 20 },
  gesamtLabel: { fontFamily: schrift.body, fontSize: 13, color: farben.textMatt, marginBottom: 6 },
  gesamtWert: { fontFamily: schrift.head, fontSize: 30, color: farben.text, letterSpacing: 0.5 },
  formTitel: { fontFamily: schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5, marginBottom: 14 },
  kleinLabel: {
    fontFamily: schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  reihe: { flexDirection: "row" },
});
