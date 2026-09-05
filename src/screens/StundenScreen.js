// ---------------------------------------------------------------------------
// StundenScreen.js — Arbeitsstunden EINER Baustelle.
//
// Ersetzt die Excel-Spalten „von–bis je Person". Aus von/bis wird die
// Stundenzahl vorgeschlagen; überschreiben bleibt möglich und ist der
// Normalfall, sobald eine Pause dazwischenliegt.
//
// EINGEFRORENER STUNDENSATZ: Beim Speichern wandert der aktuelle
// stundensatzKosten der Person als Kopie in den Eintrag. Ändert der Inhaber
// den Satz später, bleibt jede abgeschlossene Nachkalkulation so, wie sie
// war — sonst würde sich die Vergangenheit rückwirkend verändern.
//
// Zwei Sichten:
//   Inhaber     — alle Einträge aller Personen, mit Kosten in Euro.
//   Mitarbeiter — nur die EIGENEN Einträge, ohne jede Euro-Angabe.
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
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
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
import { datumDe, datumIso, zuDate, euroDe, mengeDe } from "../util/format";
import { tagOhneZeit, uhrzeitDe } from "../util/termine";
import {
  stundenAusZeit,
  zahlOderNull,
  jePerson,
  personalkosten,
  stundenSumme,
} from "../util/kalkulation";

// Gleicher Inline-Stil für die HTML-Felder wie in TerminScreen /
// BaustelleDetailScreen — der native Picker existiert unter
// react-native-web nicht.
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

const LEER = {
  personId: null,
  vonZeit: "08:00",
  bisZeit: "16:00",
  stunden: "8",
  taetigkeit: "",
};

// "HH:MM" -> Date von heute mit dieser Uhrzeit (nur für den nativen Picker).
function zeitAlsDate(zeit) {
  const d = new Date();
  const teile = String(zeit || "08:00").split(":");
  d.setHours(Number(teile[0]) || 0, Number(teile[1]) || 0, 0, 0);
  return d;
}

function alsZeitText(datum) {
  return uhrzeitDe(datum) || "08:00";
}

export default function StundenScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { profil, istHandwerker, istMitarbeiter, besitzerId, meinePersonId } =
    useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [eintraege, setEintraege] = useState([]);
  const [personen, setPersonen] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");

  const [form, setForm] = useState(LEER);
  const [datum, setDatum] = useState(() => tagOhneZeit(new Date()));
  const [editId, setEditId] = useState(null);
  const [formOffen, setFormOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [pickerAuf, setPickerAuf] = useState(null); // "datum" | "von" | "bis"

  // ------------------------------------------------------------- Personen
  // Inhaber: alle eigenen Personen. Mitarbeiter: NUR sein eigener Eintrag —
  // er soll die Stundensätze der Kollegen gar nicht erst geladen bekommen.
  useEffect(() => {
    if (istMitarbeiter) {
      if (!meinePersonId) {
        setPersonen([]);
        return;
      }
      let aktiv = true;
      (async () => {
        try {
          const snap = await getDoc(doc(db, "personen", meinePersonId));
          if (!aktiv) return;
          setPersonen(snap.exists() ? [{ id: snap.id, ...snap.data() }] : []);
        } catch (e) {
          if (aktiv) setPersonen([]);
        }
      })();
      return () => {
        aktiv = false;
      };
    }

    if (!besitzerId) return;
    const q = query(
      collection(db, "personen"),
      where("handwerkerId", "==", besitzerId)
    );
    const stop = onSnapshot(
      q,
      (snap) => {
        const l = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        l.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setPersonen(l);
      },
      () => setPersonen([])
    );
    return stop;
  }, [besitzerId, istMitarbeiter, meinePersonId]);

  // -------------------------------------------------------------- Stunden
  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "stunden"),
      (snap) => {
        let l = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Der Mitarbeiter sieht nur seine eigenen Einträge.
        if (istMitarbeiter) l = l.filter((e) => e.erstelltVon === profil?.id);
        // Clientseitig nach Datum absteigend — kein Index nötig.
        l.sort((a, b) => (b.datum?.seconds || 0) - (a.datum?.seconds || 0));
        setEintraege(l);
        setLaedt(false);
        setFehler("");
      },
      (e) => {
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    );
    return stop;
  }, [baustelleId, istMitarbeiter, profil?.id]);

  const aktivePersonen = useMemo(
    () => personen.filter((p) => p.aktiv !== false),
    [personen]
  );

  function feld(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // von/bis geändert -> Stundenzahl neu vorschlagen. Ein danach von Hand
  // eingetippter Wert bleibt stehen, bis wieder eine Uhrzeit geändert wird.
  function zeitSetzen(welche, wert) {
    setForm((f) => {
      const neu = { ...f, [welche === "von" ? "vonZeit" : "bisZeit"]: wert };
      const berechnet = stundenAusZeit(neu.vonZeit, neu.bisZeit);
      if (berechnet != null) {
        neu.stunden = String(berechnet).replace(".", ",");
      }
      return neu;
    });
  }

  function neuStart() {
    const vorgabe =
      (istMitarbeiter ? meinePersonId : null) ||
      form.personId ||
      aktivePersonen[0]?.id ||
      null;
    setForm({ ...LEER, personId: vorgabe });
    setDatum(tagOhneZeit(new Date()));
    setEditId(null);
    setFormOffen(true);
  }

  function darfAendern(e) {
    if (istHandwerker) return true;
    return istMitarbeiter && e.erstelltVon === profil?.id;
  }

  function bearbeiten(e) {
    if (!darfAendern(e)) return;
    setForm({
      personId: e.personId || null,
      vonZeit: e.vonZeit || "",
      bisZeit: e.bisZeit || "",
      stunden: e.stunden != null ? String(e.stunden).replace(".", ",") : "",
      taetigkeit: e.taetigkeit || "",
    });
    setDatum(zuDate(e.datum) || tagOhneZeit(new Date()));
    setEditId(e.id);
    setFormOffen(true);
  }

  function abbrechen() {
    setFormOffen(false);
    setForm(LEER);
    setEditId(null);
  }

  async function speichern() {
    const stunden = zahlOderNull(form.stunden);
    if (stunden == null || stunden <= 0) {
      Alert.alert("Stunden fehlen", "Bitte eine Stundenzahl größer als 0 eintragen.");
      return;
    }
    if (stunden > 24) {
      Alert.alert("Prüfen", "Mehr als 24 Stunden an einem Tag — bitte korrigieren.");
      return;
    }

    // Der Mitarbeiter bucht immer auf sich selbst, egal was im Formular steht.
    const personId = istMitarbeiter ? meinePersonId : form.personId;
    const person = personen.find((p) => p.id === personId);
    if (!person) {
      Alert.alert(
        "Person fehlt",
        istMitarbeiter
          ? "Ihr Konto ist noch keiner Person zugeordnet. Bitte den Betriebsinhaber ansprechen."
          : "Bitte wählen Sie aus, wer gearbeitet hat. Personen legen Sie unter „Personen“ an."
      );
      return;
    }

    const alt = editId ? eintraege.find((e) => e.id === editId) : null;
    // Der Satz wird beim Anlegen eingefroren. Beim Bearbeiten bleibt er
    // erhalten, solange die Person dieselbe ist — nur bei einem Wechsel der
    // Person zählt der Satz der neuen Person.
    const satz =
      alt && alt.personId === personId && alt.stundensatzKosten != null
        ? alt.stundensatzKosten
        : person.stundensatzKosten != null
        ? person.stundensatzKosten
        : 0;

    const daten = {
      datum: Timestamp.fromDate(tagOhneZeit(datum)),
      personId,
      personName: person.name || "",
      vonZeit: form.vonZeit.trim() || null,
      bisZeit: form.bisZeit.trim() || null,
      stunden,
      taetigkeit: form.taetigkeit.trim(),
      stundensatzKosten: satz,
    };

    setSpeichert(true);
    try {
      if (editId) {
        // erstelltVon bleibt unverändert — sonst könnte ein Mitarbeiter
        // durch Bearbeiten die Zuordnung eines fremden Eintrags übernehmen.
        await updateDoc(
          doc(db, "baustellen", baustelleId, "stunden", editId),
          daten
        );
      } else {
        await addDoc(collection(db, "baustellen", baustelleId, "stunden"), {
          ...daten,
          erstelltVon: profil?.id || null,
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

  function loeschenFragen(e) {
    if (!darfAendern(e)) return;
    Alert.alert(
      "Eintrag löschen?",
      `${datumDe(e.datum)} · ${e.personName || ""} · ${mengeDe(e.stunden)} Std.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(
                doc(db, "baustellen", baustelleId, "stunden", e.id)
              );
            } catch (err) {
              Alert.alert("Fehler", fehlerText(err));
            }
          },
        },
      ]
    );
  }

  // ------------------------------------------------------------ Bausteine
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
        <Pressable onPress={() => setPickerAuf("datum")} style={styles.datumFeld}>
          <Text style={styles.datumText}>{datumDe(datum)}</Text>
        </Pressable>
        {pickerAuf === "datum" ? (
          <DateTimePicker
            value={datum}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="dark"
            onChange={(ev, gewaehlt) => {
              setPickerAuf(Platform.OS === "ios" ? "datum" : null);
              if (gewaehlt) setDatum(tagOhneZeit(gewaehlt));
            }}
          />
        ) : null}
      </>
    );
  }

  function zeitFeld(welche) {
    const wert = welche === "von" ? form.vonZeit : form.bisZeit;
    if (Platform.OS === "web") {
      return (
        <input
          type="time"
          value={wert || ""}
          onChange={(ev) => zeitSetzen(welche, ev.target.value)}
          style={webDatumStil}
        />
      );
    }
    return (
      <>
        <Pressable onPress={() => setPickerAuf(welche)} style={styles.datumFeld}>
          <Text style={styles.datumText}>{wert || "—"} Uhr</Text>
        </Pressable>
        {pickerAuf === welche ? (
          <DateTimePicker
            value={zeitAlsDate(wert)}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="dark"
            onChange={(ev, gewaehlt) => {
              setPickerAuf(Platform.OS === "ios" ? welche : null);
              if (gewaehlt) zeitSetzen(welche, alsZeitText(gewaehlt));
            }}
          />
        ) : null}
      </>
    );
  }

  // ---------------------------------------------------------------- Summen
  const summeStunden = stundenSumme(eintraege);
  const summeKosten = personalkosten(eintraege);
  const gruppen = jePerson(eintraege);

  const vorschlag = stundenAusZeit(form.vonZeit, form.bisZeit);
  const eingetragen = zahlOderNull(form.stunden);
  const abweichung =
    vorschlag != null && eingetragen != null && Math.abs(vorschlag - eingetragen) > 0.01;

  if (laedt) return <Ladeanzeige text="Stunden werden geladen …" />;

  const kannErfassen = istHandwerker || (istMitarbeiter && !!meinePersonId);

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

          {istHandwerker && personen.length === 0 ? (
            <Karte style={{ marginBottom: 14 }}>
              <Text style={styles.hinweisTitel}>Erst Personen anlegen</Text>
              <Text style={styles.hinweis}>
                Stunden werden immer einer Person mit Stundensatz zugeordnet.
                Ohne Person lässt sich später kein Personalkostenanteil
                berechnen.
              </Text>
              <Knopf
                titel="Zu den Personen"
                variante="ghost"
                onPress={() => navigation.navigate("Personen")}
                style={{ marginTop: 14 }}
              />
            </Karte>
          ) : null}

          {istMitarbeiter && !meinePersonId ? (
            <Karte style={{ marginBottom: 14 }}>
              <Text style={styles.hinweisTitel}>Konto nicht zugeordnet</Text>
              <Text style={styles.hinweis}>
                Ihr Konto ist noch keiner Person zugeordnet. Bitte den
                Betriebsinhaber ansprechen.
              </Text>
            </Karte>
          ) : null}

          {eintraege.length === 0 && !formOffen ? (
            <Leerzustand
              symbol="⏱"
              titel="Noch keine Stunden"
              text="Tragen Sie ein, wer wann wie lange hier gearbeitet hat."
              knopfTitel={kannErfassen ? "Stunden erfassen" : undefined}
              onKnopf={kannErfassen ? neuStart : undefined}
            />
          ) : (
            eintraege.map((e) => (
              <Karte
                key={e.id}
                style={styles.eKarte}
                onPress={darfAendern(e) ? () => bearbeiten(e) : undefined}
              >
                <View style={styles.eKopf}>
                  <Text style={styles.eDatum}>{datumDe(e.datum)}</Text>
                  {darfAendern(e) ? (
                    <Pressable onPress={() => loeschenFragen(e)} hitSlop={8}>
                      <Text style={styles.eLoeschen}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.ePerson}>{e.personName || "—"}</Text>
                <Text style={styles.eZeile}>
                  {e.vonZeit && e.bisZeit ? `${e.vonZeit} – ${e.bisZeit} Uhr  ·  ` : ""}
                  {mengeDe(e.stunden)} Std.
                </Text>
                {e.taetigkeit ? (
                  <Text style={styles.eTaetigkeit}>{e.taetigkeit}</Text>
                ) : null}
                {istHandwerker ? (
                  <Text style={styles.eKosten}>
                    {euroDe((e.stunden || 0) * (e.stundensatzKosten || 0))}
                    {"  "}
                    <Text style={styles.eSatz}>
                      ({euroDe(e.stundensatzKosten || 0)} / Std.)
                    </Text>
                  </Text>
                ) : null}
              </Karte>
            ))
          )}

          {/* Summen */}
          {eintraege.length > 0 ? (
            <Karte style={styles.summeKarte}>
              <Text style={styles.summeTitel}>Summe</Text>
              {gruppen.map((g) => (
                <View key={g.personId} style={styles.summeZeile}>
                  <Text style={styles.summeName}>{g.personName}</Text>
                  <Text style={styles.summeWert}>
                    {mengeDe(g.stunden)} Std.
                    {istHandwerker ? `  ·  ${euroDe(g.kosten)}` : ""}
                  </Text>
                </View>
              ))}
              <View style={styles.summeStrich} />
              <View style={styles.summeZeile}>
                <Text style={styles.summeNameFett}>Gesamt</Text>
                <Text style={styles.summeWertFett}>
                  {mengeDe(summeStunden)} Std.
                  {istHandwerker ? `  ·  ${euroDe(summeKosten)}` : ""}
                </Text>
              </View>
            </Karte>
          ) : null}

          {/* Formular */}
          {kannErfassen && formOffen ? (
            <Karte style={{ marginTop: 8 }}>
              <Text style={styles.formTitel}>
                {editId ? "Eintrag bearbeiten" : "Stunden erfassen"}
              </Text>

              <Text style={styles.kleinLabel}>Datum</Text>
              {datumsFeld()}

              {istHandwerker ? (
                <>
                  <Text style={styles.kleinLabel}>Wer hat gearbeitet?</Text>
                  <View style={styles.chips}>
                    {aktivePersonen.map((p) => (
                      <Pill
                        key={p.id}
                        text={p.name}
                        aktiv={form.personId === p.id}
                        onPress={() => feld("personId", p.id)}
                        style={{ marginRight: 8, marginBottom: 8 }}
                      />
                    ))}
                  </View>
                  {aktivePersonen.length === 0 ? (
                    <Text style={styles.hinweis}>
                      Keine aktive Person vorhanden.
                    </Text>
                  ) : null}
                  <View style={{ height: 8 }} />
                </>
              ) : null}

              <View style={styles.reihe}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kleinLabel}>Von</Text>
                  {zeitFeld("von")}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kleinLabel}>Bis</Text>
                  {zeitFeld("bis")}
                </View>
              </View>

              <Feld
                label="Stunden"
                wert={form.stunden}
                onChangeText={(v) => feld("stunden", v)}
                keyboardType="decimal-pad"
                platzhalter="8"
              />
              <Text style={styles.hinweis}>
                {vorschlag != null
                  ? abweichung
                    ? `Aus den Uhrzeiten ergäben sich ${mengeDe(vorschlag)} Std. — Ihr Wert bleibt stehen (z. B. wegen Pause).`
                    : "Wird aus den Uhrzeiten berechnet. Pausen einfach abziehen."
                  : "Ohne Uhrzeiten die Stunden direkt eintragen."}
              </Text>

              <Feld
                label="Tätigkeit (optional)"
                wert={form.taetigkeit}
                onChangeText={(v) => feld("taetigkeit", v)}
                platzhalter="z. B. Boden fliesen"
                style={{ marginTop: 14 }}
              />

              <Knopf
                titel={editId ? "Änderungen speichern" : "Eintrag speichern"}
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

          {kannErfassen && !formOffen && eintraege.length > 0 ? (
            <Knopf titel="+ Stunden erfassen" onPress={neuStart} style={{ marginTop: 6 }} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  eKarte: { marginBottom: 10 },
  eKopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eDatum: { ...schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5, flex: 1 },
  eLoeschen: { ...schrift.head, fontSize: 18, color: farben.rotHell, paddingLeft: 10 },
  ePerson: { ...schrift.headHalb, fontSize: 14, color: farben.textWeich, letterSpacing: 0.5, marginTop: 4 },
  eZeile: { ...schrift.body, fontSize: 14, color: farben.textWeich, marginTop: 4 },
  eTaetigkeit: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6, fontStyle: "italic" },
  eKosten: { ...schrift.headHalb, fontSize: 14, color: farben.gruen, marginTop: 8, letterSpacing: 0.5 },
  eSatz: { ...schrift.body, fontSize: 12, color: farben.textMatt },
  summeKarte: { marginTop: 8, marginBottom: 18 },
  summeTitel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  summeZeile: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 12,
  },
  summeName: { ...schrift.body, fontSize: 14, color: farben.textWeich, flex: 1 },
  summeWert: { ...schrift.bodyMed, fontSize: 14, color: farben.text, textAlign: "right" },
  summeNameFett: { ...schrift.head, fontSize: 16, color: farben.text, letterSpacing: 0.5, flex: 1 },
  summeWertFett: { ...schrift.head, fontSize: 16, color: farben.text, letterSpacing: 0.5, textAlign: "right" },
  summeStrich: {
    height: 1,
    backgroundColor: farben.linie,
    marginVertical: 8,
  },
  formTitel: {
    ...schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  hinweisTitel: {
    ...schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  hinweis: { ...schrift.body, fontSize: 12.5, color: farben.textMatt, lineHeight: 18 },
  kleinLabel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  reihe: { flexDirection: "row", gap: 12 },
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
