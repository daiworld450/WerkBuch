// ---------------------------------------------------------------------------
// TerminScreen.js — Termin anlegen und bearbeiten.
//
// Schreibt in die top-level Sammlung "termine" (nicht mehr in den Unterordner
// einer Baustelle). Die Baustelle ist eine optionale Verknüpfung; wird eine
// gewählt, wandern Name und Kundenkontakt als Kopie mit in den Termin, damit
// der Kalender sie ohne Nachladen anzeigen kann.
//
// Aufruf: route.params = { terminId?, vorgabeDatum?, baustelleId? }
//
// Datumswahl folgt dem im Projekt etablierten Muster (TermineScreen /
// BaustelleDetailScreen): nativ der Community-Picker, im Web ein
// HTML-<input type="date"|"time"> — der native Picker existiert unter
// react-native-web nicht.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
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
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
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
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { datumDe, datumIso, zuDate } from "../util/format";
import { TERMIN_ARTEN, STANDARD_ART, tagOhneZeit, uhrzeitDe } from "../util/termine";

// Inline-Stil für die HTML-Datums-/Zeitfelder im Web — identisch zu
// TermineScreen und BaustelleDetailScreen.
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

// Datum und Uhrzeit zu einem Zeitpunkt zusammensetzen.
function mitZeit(datum, stunde, minute) {
  const d = tagOhneZeit(datum);
  d.setHours(stunde, minute, 0, 0);
  return d;
}

export default function TerminScreen({ route, navigation }) {
  const { terminId, vorgabeDatum, baustelleId } = route.params || {};
  const { profil } = useAuth();
  const bearbeiten = !!terminId;

  const [laedt, setLaedt] = useState(bearbeiten);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");

  const startVorgabe = useMemo(() => {
    const d = vorgabeDatum ? zuDate(vorgabeDatum + "T12:00:00") : new Date();
    return tagOhneZeit(d || new Date());
  }, [vorgabeDatum]);

  const [titel, setTitel] = useState("");
  const [art, setArt] = useState(STANDARD_ART);
  const [ganztags, setGanztags] = useState(true);
  const [startTag, setStartTag] = useState(startVorgabe);
  const [endeTag, setEndeTag] = useState(startVorgabe);
  const [startStunde, setStartStunde] = useState(8);
  const [startMinute, setStartMinute] = useState(0);
  const [endeStunde, setEndeStunde] = useState(10);
  const [endeMinute, setEndeMinute] = useState(0);
  const [notiz, setNotiz] = useState("");
  const [gewaehlteBaustelle, setGewaehlteBaustelle] = useState(baustelleId || null);

  const [baustellen, setBaustellen] = useState([]);
  const [pickerAuf, setPickerAuf] = useState(null); // "startTag" | "endeTag" | "startZeit" | "endeZeit"

  useEffect(() => {
    navigation.setOptions({
      title: bearbeiten ? "Termin bearbeiten" : "Neuer Termin",
    });
  }, [bearbeiten, navigation]);

  // Eigene Baustellen zur Verknüpfung (clientseitig sortiert, kein Index nötig)
  useEffect(() => {
    if (!profil) return;
    const q = query(
      collection(db, "baustellen"),
      where("handwerkerId", "==", profil.id)
    );
    const stop = onSnapshot(
      q,
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        liste.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setBaustellen(liste);
      },
      () => {}
    );
    return stop;
  }, [profil]);

  // Bestehenden Termin laden
  useEffect(() => {
    if (!terminId) return;
    let aktiv = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "termine", terminId));
        if (!aktiv) return;
        if (!snap.exists()) {
          setFehler("Dieser Termin wurde nicht gefunden.");
          setLaedt(false);
          return;
        }
        const t = snap.data();
        const start = zuDate(t.start) || new Date();
        const ende = zuDate(t.ende) || start;
        setTitel(t.titel || "");
        setArt(t.art || STANDARD_ART);
        setGanztags(!!t.ganztags);
        setStartTag(tagOhneZeit(start));
        setEndeTag(tagOhneZeit(ende));
        setStartStunde(start.getHours());
        setStartMinute(start.getMinutes());
        setEndeStunde(ende.getHours());
        setEndeMinute(ende.getMinutes());
        setNotiz(t.notiz || "");
        setGewaehlteBaustelle(t.baustelleId || null);
        setLaedt(false);
      } catch (e) {
        if (!aktiv) return;
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [terminId]);

  const startZeitpunkt = ganztags
    ? mitZeit(startTag, 0, 0)
    : mitZeit(startTag, startStunde, startMinute);
  const endeZeitpunkt = ganztags
    ? mitZeit(endeTag, 23, 59)
    : mitZeit(endeTag, endeStunde, endeMinute);

  async function speichern() {
    if (!titel.trim()) {
      Alert.alert("Fehlt noch", "Bitte geben Sie einen Titel ein.");
      return;
    }
    if (endeZeitpunkt < startZeitpunkt) {
      Alert.alert(
        "Zeitraum stimmt nicht",
        "Das Ende darf nicht vor dem Beginn liegen. Bitte prüfen Sie Datum und Uhrzeit."
      );
      return;
    }
    if (!profil) {
      Alert.alert("Nicht angemeldet", "Bitte melden Sie sich erneut an.");
      return;
    }

    const b = baustellen.find((x) => x.id === gewaehlteBaustelle) || null;
    const daten = {
      handwerkerId: profil.id,
      titel: titel.trim(),
      notiz: notiz.trim(),
      start: Timestamp.fromDate(startZeitpunkt),
      ende: Timestamp.fromDate(endeZeitpunkt),
      ganztags,
      art,
      baustelleId: b ? b.id : null,
      baustelleName: b ? b.name || null : null,
      kundeName: b ? b.kundeName || null : null,
      kundeTelefon: b ? b.kundeTelefon || null : null,
    };

    setSpeichert(true);
    try {
      if (bearbeiten) {
        await updateDoc(doc(db, "termine", terminId), daten);
      } else {
        await addDoc(collection(db, "termine"), {
          ...daten,
          erledigt: false,
          erstelltAm: serverTimestamp(),
        });
      }
      navigation.goBack();
    } catch (e) {
      setSpeichert(false);
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function loeschenFragen() {
    Alert.alert("Termin löschen?", titel || "Dieser Termin wird entfernt.", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "termine", terminId));
            navigation.goBack();
          } catch (e) {
            Alert.alert("Fehler", fehlerText(e));
          }
        },
      },
    ]);
  }

  // -------------------------------------------------------- Bausteine
  function datumsFeld(welche) {
    const wert = welche === "start" ? startTag : endeTag;
    const setzen = (d) => {
      if (welche === "start") {
        setStartTag(d);
        // Endedatum mitziehen, solange es sonst vor dem Start läge.
        if (endeTag < d) setEndeTag(d);
      } else {
        setEndeTag(d);
      }
    };

    if (Platform.OS === "web") {
      return (
        <input
          type="date"
          value={datumIso(wert)}
          onChange={(e) => {
            const d = new Date(e.target.value + "T12:00:00");
            if (!isNaN(d.getTime())) setzen(tagOhneZeit(d));
          }}
          style={webDatumStil}
        />
      );
    }
    const name = welche === "start" ? "startTag" : "endeTag";
    return (
      <>
        <Pressable onPress={() => setPickerAuf(name)} style={styles.datumFeld}>
          <Text style={styles.datumText}>{datumDe(wert)}</Text>
        </Pressable>
        {pickerAuf === name ? (
          <DateTimePicker
            value={wert}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="dark"
            onChange={(e, gewaehlt) => {
              setPickerAuf(Platform.OS === "ios" ? name : null);
              if (gewaehlt) setzen(tagOhneZeit(gewaehlt));
            }}
          />
        ) : null}
      </>
    );
  }

  function zeitFeld(welche) {
    const stunde = welche === "start" ? startStunde : endeStunde;
    const minute = welche === "start" ? startMinute : endeMinute;
    const setzen = (h, m) => {
      if (welche === "start") {
        setStartStunde(h);
        setStartMinute(m);
      } else {
        setEndeStunde(h);
        setEndeMinute(m);
      }
    };

    if (Platform.OS === "web") {
      return (
        <input
          type="time"
          value={`${String(stunde).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}
          onChange={(e) => {
            const teile = String(e.target.value).split(":");
            const h = Number(teile[0]);
            const m = Number(teile[1]);
            if (isFinite(h) && isFinite(m)) setzen(h, m);
          }}
          style={webDatumStil}
        />
      );
    }
    const name = welche === "start" ? "startZeit" : "endeZeit";
    return (
      <>
        <Pressable onPress={() => setPickerAuf(name)} style={styles.datumFeld}>
          <Text style={styles.datumText}>
            {uhrzeitDe(mitZeit(new Date(), stunde, minute))} Uhr
          </Text>
        </Pressable>
        {pickerAuf === name ? (
          <DateTimePicker
            value={mitZeit(new Date(), stunde, minute)}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="dark"
            onChange={(e, gewaehlt) => {
              setPickerAuf(Platform.OS === "ios" ? name : null);
              if (gewaehlt) setzen(gewaehlt.getHours(), gewaehlt.getMinutes());
            }}
          />
        ) : null}
      </>
    );
  }

  if (laedt) return <Ladeanzeige text="Termin wird geladen …" />;

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

          <Karte>
            <Feld
              label="Titel"
              wert={titel}
              onChangeText={setTitel}
              platzhalter="z. B. Aufmaß Bad Familie Meier"
            />

            <Text style={styles.kleinLabel}>Art</Text>
            <View style={styles.pillReihe}>
              {TERMIN_ARTEN.map((a) => (
                <Pill
                  key={a.key}
                  text={a.label}
                  aktiv={art === a.key}
                  onPress={() => setArt(a.key)}
                  style={{ marginRight: 8, marginBottom: 8 }}
                />
              ))}
            </View>

            <Pressable
              onPress={() => setGanztags((g) => !g)}
              style={styles.schalterReihe}
            >
              <View style={[styles.schalter, ganztags && styles.schalterAn]}>
                <Text style={styles.schalterHaken}>{ganztags ? "✓" : ""}</Text>
              </View>
              <Text style={styles.schalterText}>Ganztägig</Text>
            </Pressable>

            <Text style={styles.kleinLabel}>Beginn</Text>
            {datumsFeld("start")}
            {!ganztags ? zeitFeld("start") : null}

            <Text style={styles.kleinLabel}>Ende</Text>
            {datumsFeld("ende")}
            {!ganztags ? zeitFeld("ende") : null}
          </Karte>

          <Karte style={{ marginTop: 14 }}>
            <Text style={styles.kleinLabel}>Baustelle verknüpfen (optional)</Text>
            <View style={styles.pillReihe}>
              <Pill
                text="Keine"
                aktiv={!gewaehlteBaustelle}
                onPress={() => setGewaehlteBaustelle(null)}
                style={{ marginRight: 8, marginBottom: 8 }}
              />
              {baustellen.map((b) => (
                <Pill
                  key={b.id}
                  text={b.name || "Ohne Namen"}
                  aktiv={gewaehlteBaustelle === b.id}
                  onPress={() => setGewaehlteBaustelle(b.id)}
                  style={{ marginRight: 8, marginBottom: 8 }}
                />
              ))}
            </View>
            {baustellen.length === 0 ? (
              <Text style={styles.hinweis}>
                Noch keine Baustelle angelegt — der Termin steht auch ohne
                Verknüpfung im Kalender.
              </Text>
            ) : null}

            <Feld
              label="Notiz (optional)"
              wert={notiz}
              onChangeText={setNotiz}
              platzhalter="Details zum Termin"
              multiline
              style={{ minHeight: 90, textAlignVertical: "top" }}
            />
          </Karte>

          <Knopf
            titel={bearbeiten ? "Änderungen speichern" : "Termin speichern"}
            onPress={speichern}
            laedt={speichert}
            style={{ marginTop: 18 }}
          />

          {bearbeiten ? (
            <Knopf
              titel="Termin löschen"
              variante="ghost"
              onPress={loeschenFragen}
              style={{ marginTop: 10 }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  kleinLabel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  pillReihe: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  hinweis: {
    ...schrift.body,
    fontSize: 13,
    color: farben.textMatt,
    marginBottom: 14,
  },
  schalterReihe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
    marginTop: 4,
  },
  schalter: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: farben.linie,
    backgroundColor: farben.feldBg,
    alignItems: "center",
    justifyContent: "center",
  },
  schalterAn: { borderColor: farben.rot, backgroundColor: farben.auswahlBg },
  schalterHaken: { ...schrift.head, fontSize: 15, color: farben.text },
  schalterText: {
    ...schrift.bodyMed,
    fontSize: groessen.text,
    color: farben.textWeich,
    marginLeft: 4,
  },
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
