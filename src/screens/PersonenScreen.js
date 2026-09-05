// ---------------------------------------------------------------------------
// PersonenScreen.js — wer auf den Baustellen arbeitet.
//
// Eine Person ist zunächst nur ein Name mit einem Stundensatz (was die Stunde
// den BETRIEB kostet, nicht was der Kunde zahlt). Erst wenn eine E-Mail
// hinterlegt ist und sich jemand mit genau dieser E-Mail registriert, wird
// daraus ein echtes Mitarbeiter-Konto (siehe AuthContext.registrieren).
//
// Nur der Betriebsinhaber. Der Stundensatz ist eine interne Kostengröße —
// ein Mitarbeiter darf ihn nicht sehen.
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
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
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
import Fehlerkasten from "../components/Fehlerkasten";
import { euroDe } from "../util/format";
import { zahlOderNull } from "../util/kalkulation";
import fehlerText from "../util/fehler";

const LEER = { name: "", stundensatzKosten: "", email: "", aktiv: true };

export default function PersonenScreen({ navigation }) {
  const { profil, istHandwerker } = useAuth();

  const [liste, setListe] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");
  const [form, setForm] = useState(LEER);
  const [editId, setEditId] = useState(null);
  const [formOffen, setFormOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  // Vorschlagswert für neue Personen (users/{uid}.stundensatzKostenStandard)
  const [standard, setStandard] = useState("");
  const [standardSpeichert, setStandardSpeichert] = useState(false);

  useEffect(() => {
    if (profil?.stundensatzKostenStandard != null) {
      setStandard(String(profil.stundensatzKostenStandard).replace(".", ","));
    }
  }, [profil?.stundensatzKostenStandard]);

  useEffect(() => {
    if (!profil || !istHandwerker) {
      setLaedt(false);
      return;
    }
    const q = query(
      collection(db, "personen"),
      where("handwerkerId", "==", profil.id)
    );
    const stop = onSnapshot(
      q,
      (snap) => {
        const l = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Clientseitig sortieren: aktive zuerst, dann nach Name.
        l.sort((a, b) => {
          if (!!a.aktiv !== !!b.aktiv) return a.aktiv ? -1 : 1;
          return (a.name || "").localeCompare(b.name || "");
        });
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
  }, [profil, istHandwerker]);

  function feld(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function neuStart() {
    setForm({ ...LEER, stundensatzKosten: standard });
    setEditId(null);
    setFormOffen(true);
  }

  function bearbeiten(p) {
    setForm({
      name: p.name || "",
      stundensatzKosten:
        p.stundensatzKosten != null
          ? String(p.stundensatzKosten).replace(".", ",")
          : "",
      email: p.email || "",
      aktiv: p.aktiv !== false,
    });
    setEditId(p.id);
    setFormOffen(true);
  }

  function abbrechen() {
    setFormOffen(false);
    setForm(LEER);
    setEditId(null);
  }

  async function standardSpeichern() {
    setStandardSpeichert(true);
    try {
      await updateDoc(doc(db, "users", profil.id), {
        stundensatzKostenStandard: zahlOderNull(standard),
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setStandardSpeichert(false);
    }
  }

  async function speichern() {
    if (!form.name.trim()) {
      Alert.alert("Fehlt noch", "Bitte geben Sie einen Namen ein.");
      return;
    }
    const satz = zahlOderNull(form.stundensatzKosten);
    if (satz == null) {
      Alert.alert(
        "Stundensatz fehlt",
        "Ohne Stundensatz lässt sich später kein Personalkostenanteil berechnen."
      );
      return;
    }
    const mail = form.email.trim().toLowerCase();

    // Doppelte E-Mail würde die Konto-Verknüpfung bei der Registrierung
    // mehrdeutig machen — dort wird der erste Treffer genommen.
    if (mail) {
      const doppelt = liste.find((p) => p.id !== editId && p.email === mail);
      if (doppelt) {
        Alert.alert(
          "E-Mail schon vergeben",
          `„${doppelt.name}“ nutzt diese E-Mail bereits.`
        );
        return;
      }
    }

    const daten = {
      handwerkerId: profil.id,
      name: form.name.trim(),
      stundensatzKosten: satz,
      aktiv: !!form.aktiv,
      email: mail || null,
    };

    setSpeichert(true);
    try {
      if (editId) {
        // uid wird hier NICHT angefasst — die setzt der Mitarbeiter selbst
        // bei seiner Registrierung.
        await updateDoc(doc(db, "personen", editId), daten);
      } else {
        await addDoc(collection(db, "personen"), {
          ...daten,
          uid: null,
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

  function loeschenFragen(p) {
    Alert.alert(
      "Person löschen?",
      `„${p.name}“ wird entfernt. Bereits erfasste Stunden bleiben erhalten — der Stundensatz steckt fest im jeweiligen Eintrag.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "personen", p.id));
            } catch (e) {
              Alert.alert("Fehler", fehlerText(e));
            }
          },
        },
      ]
    );
  }

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="🔒"
          titel="Nur für den Betriebsinhaber"
          text="Personen und Stundensätze verwaltet der Inhaber."
        />
      </SafeAreaView>
    );
  }

  if (laedt) return <Ladeanzeige text="Personen werden geladen …" />;

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
              symbol="👷"
              titel="Noch keine Person"
              text="Legen Sie sich selbst und Ihre Mitarbeiter an — mit dem Stundensatz, den die Arbeitsstunde den Betrieb kostet."
              knopfTitel="Person anlegen"
              onKnopf={neuStart}
            />
          ) : (
            liste.map((p) => (
              <Karte
                key={p.id}
                style={styles.pKarte}
                onPress={() => bearbeiten(p)}
              >
                <View style={styles.pKopf}>
                  <Text style={styles.pName}>{p.name}</Text>
                  <Pressable onPress={() => loeschenFragen(p)} hitSlop={8}>
                    <Text style={styles.pLoeschen}>✕</Text>
                  </Pressable>
                </View>
                <Text style={styles.pZeile}>
                  {euroDe(p.stundensatzKosten || 0)} / Stunde (Kosten)
                </Text>
                {p.email ? <Text style={styles.pZeile}>{p.email}</Text> : null}
                <View style={styles.pPills}>
                  <Pill
                    text={p.aktiv !== false ? "Aktiv" : "Inaktiv"}
                    aktiv={p.aktiv !== false}
                    style={{ marginRight: 8 }}
                  />
                  <Pill
                    text={p.uid ? "Konto verknüpft" : "Kein Konto"}
                    aktiv={!!p.uid}
                  />
                </View>
                {p.email && !p.uid ? (
                  <Text style={styles.pHinweis}>
                    Der Mitarbeiter registriert sich in der App selbst mit
                    genau dieser E-Mail — dann verknüpft sich das Konto
                    automatisch.
                  </Text>
                ) : null}
              </Karte>
            ))
          )}

          {formOffen ? (
            <Karte style={{ marginTop: 8 }}>
              <Text style={styles.formTitel}>
                {editId ? "Person bearbeiten" : "Neue Person"}
              </Text>

              <Feld
                label="Name"
                wert={form.name}
                onChangeText={(v) => feld("name", v)}
                platzhalter="z. B. Seba"
              />
              <Feld
                label="Stundensatz € (Kosten für den Betrieb)"
                wert={form.stundensatzKosten}
                onChangeText={(v) => feld("stundensatzKosten", v)}
                keyboardType="decimal-pad"
                platzhalter="0,00"
              />
              <Feld
                label="E-Mail (optional, für ein eigenes Konto)"
                wert={form.email}
                onChangeText={(v) => feld("email", v)}
                platzhalter="mitarbeiter@email.de"
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.kleinLabel}>Status</Text>
              <View style={styles.chips}>
                <Pill
                  text="Aktiv"
                  aktiv={!!form.aktiv}
                  onPress={() => feld("aktiv", true)}
                  style={{ marginRight: 8, marginBottom: 14 }}
                />
                <Pill
                  text="Inaktiv"
                  aktiv={!form.aktiv}
                  onPress={() => feld("aktiv", false)}
                  style={{ marginBottom: 14 }}
                />
              </View>

              <Knopf
                titel={editId ? "Änderungen speichern" : "Person speichern"}
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
            <Knopf titel="+ Person anlegen" onPress={neuStart} style={{ marginTop: 6 }} />
          ) : null}

          {/* Vorschlagswert für neue Personen */}
          <Karte style={{ marginTop: 22 }}>
            <Text style={styles.formTitel}>Standard-Stundensatz</Text>
            <Text style={styles.pHinweis}>
              Wird bei einer neuen Person als Vorschlag eingetragen. Ändert
              nichts an bereits erfassten Stunden.
            </Text>
            <Feld
              label="Vorschlag €/Stunde"
              wert={standard}
              onChangeText={setStandard}
              keyboardType="decimal-pad"
              platzhalter="0,00"
              style={{ marginTop: 12 }}
            />
            <Knopf
              titel="Standard speichern"
              variante="ghost"
              onPress={standardSpeichern}
              laedt={standardSpeichert}
            />
          </Karte>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  pKarte: { marginBottom: 12 },
  pKopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  pName: { ...schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5, flex: 1 },
  pLoeschen: { ...schrift.head, fontSize: 18, color: farben.rotHell, paddingLeft: 10 },
  pZeile: { ...schrift.body, fontSize: 14, color: farben.textWeich, marginTop: 4 },
  pPills: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  pHinweis: {
    ...schrift.body,
    fontSize: 12.5,
    color: farben.textMatt,
    marginTop: 10,
    lineHeight: 18,
  },
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
});
