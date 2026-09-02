// ---------------------------------------------------------------------------
// BaustelleDetailScreen.js — Übersicht einer Baustelle mit fünf Einstiegen.
// Handwerker: Statuswechsel per Chips und Löschen (mit Sicherheitsabfrage).
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
// Gleicher Datumswähler wie in TermineScreen — nativ per Community-Picker,
// im Web per HTML-Datumsfeld (unter react-native-web erlaubt).
const DateTimePicker =
  Platform.OS === "web"
    ? null
    : require("@react-native-community/datetimepicker").default;

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { bewertungAnfordern } from "../portal";
import { farben, schrift, groessen, textStil } from "../theme";
import Karte from "../components/Karte";
import Pill from "../components/Pill";
import Knopf from "../components/Knopf";
import Feld from "../components/Feld";
import Fortschritt from "../components/Fortschritt";
import Statuspunkt from "../components/Statuspunkt";
import Ladeanzeige from "../components/Ladeanzeige";
import Leerzustand from "../components/Leerzustand";
import fehlerText from "../util/fehler";
import { datumDe, datumIso, zuDate } from "../util/format";

const STATUS = ["In Planung", "In Ausführung", "Abgeschlossen"];

// Inline-Stil für das HTML-Datumsfeld im Web — identisch zu TermineScreen.
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

const EINSTIEGE = [
  { key: "Fotos", symbol: "📷", titel: "Fotos", text: "Bilder nach Bauphase sortiert" },
  { key: "Visualisierung", symbol: "🎨", titel: "Entwurf", text: "Foto aufnehmen, fertiges Bad zeigen" },
  { key: "Masse", symbol: "📐", titel: "Maße & Flächen", text: "Raummaße und automatische Flächenberechnung" },
  { key: "Material", symbol: "🧱", titel: "Material", text: "Fliesen, Boden, Sanitär" },
  { key: "Termine", symbol: "📅", titel: "Termine", text: "Zeitplan der Sanierung" },
];

export default function BaustelleDetailScreen({ route, navigation }) {
  const { baustelleId } = route.params;
  const { istHandwerker } = useAuth();
  const [baustelle, setBaustelle] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [weg, setWeg] = useState(false);
  const [kundeEmailEingabe, setKundeEmailEingabe] = useState("");
  const [kundeSuchtLaedt, setKundeSuchtLaedt] = useState(false);
  const [bewertungLaedt, setBewertungLaedt] = useState(false);

  // Einsatzplanung (geplanter Zeitraum für die Kalenderübersicht)
  const [planStart, setPlanStart] = useState(new Date());
  const [planEnde, setPlanEnde] = useState(new Date());
  const [planUebernommen, setPlanUebernommen] = useState(false);
  const [planStartPickerAuf, setPlanStartPickerAuf] = useState(false);
  const [planEndePickerAuf, setPlanEndePickerAuf] = useState(false);
  const [planLaedt, setPlanLaedt] = useState(false);

  useEffect(() => {
    const stop = onSnapshot(
      doc(db, "baustellen", baustelleId),
      (snap) => {
        if (snap.exists()) {
          const daten = { id: snap.id, ...snap.data() };
          setBaustelle(daten);
          setKundeEmailEingabe((vorher) => vorher || daten.kundeEmail || "");
          // Eingabefelder nur beim ersten Laden aus der Baustelle übernehmen,
          // damit eine laufende Eingabe nicht von einem Live-Update überschrieben wird.
          setPlanUebernommen((schonUebernommen) => {
            if (!schonUebernommen) {
              if (daten.geplantStart) setPlanStart(zuDate(daten.geplantStart));
              if (daten.geplantEnde) setPlanEnde(zuDate(daten.geplantEnde));
            }
            return true;
          });
        } else {
          setBaustelle(null);
        }
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  // Sucht per E-Mail erneut nach einem Kundenkonto und verknüpft es —
  // für Baustellen ohne (korrekte) Adresse, oder falls der Kunde sich beim
  // Anlegen noch nicht registriert hatte und die automatische Verknüpfung
  // beim Kunden-Login aus irgendeinem Grund noch nicht gegriffen hat.
  async function kundeVerknuepfen() {
    const mail = kundeEmailEingabe.trim().toLowerCase();
    if (!mail) {
      Alert.alert("Fehler", "Bitte eine E-Mail-Adresse eingeben.");
      return;
    }
    setKundeSuchtLaedt(true);
    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", mail),
        where("rolle", "==", "kunde")
      );
      const snap = await getDocs(q);
      let kundeId = null;
      let kundeName = null;
      if (!snap.empty) {
        const d = snap.docs[0];
        kundeId = d.id;
        kundeName = d.data().name || null;
      }
      await updateDoc(doc(db, "baustellen", baustelleId), {
        kundeEmail: mail,
        kundeId,
        kundeName,
      });
      if (!kundeId) {
        Alert.alert(
          "Noch kein Konto gefunden",
          "Die Adresse ist jetzt hinterlegt. Sobald sich der Kunde mit dieser E-Mail registriert oder anmeldet, wird die Baustelle automatisch mit seinem Konto verknüpft."
        );
      }
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setKundeSuchtLaedt(false);
    }
  }

  async function statusSetzen(neu) {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), { status: neu });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  // Geplanten Zeitraum speichern — Grundlage für die Einsatzplan-/
  // Kalenderübersicht (EinsatzplanScreen).
  async function planSpeichern() {
    if (planEnde < planStart) {
      Alert.alert("Prüfen", "Das Ende liegt vor dem Start.");
      return;
    }
    setPlanLaedt(true);
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), {
        geplantStart: Timestamp.fromDate(planStart),
        geplantEnde: Timestamp.fromDate(planEnde),
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setPlanLaedt(false);
    }
  }

  async function planEntfernen() {
    setPlanLaedt(true);
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), {
        geplantStart: null,
        geplantEnde: null,
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setPlanLaedt(false);
    }
  }

  // Bewertungsanfrage nach der Abnahme (Bauplan S13): bewusst ein expliziter
  // Klick statt eines automatischen Versands beim Statuswechsel — der
  // Statuschip lässt sich versehentlich mehrfach antippen, die Mail an den
  // Kunden soll aber nur einmal je Abnahme rausgehen. Wurde bereits einmal
  // angefragt, wird vorher noch einmal nachgefragt.
  function bewertungAnfragenKlick() {
    if (baustelle.bewertungAngefragtAm) {
      Alert.alert(
        "Erneut anfragen?",
        `Die Bewertungsanfrage wurde bereits am ${datumDe(baustelle.bewertungAngefragtAm)} verschickt. Trotzdem erneut senden?`,
        [
          { text: "Abbrechen", style: "cancel" },
          { text: "Erneut senden", onPress: bewertungAnfragenAusfuehren },
        ]
      );
      return;
    }
    bewertungAnfragenAusfuehren();
  }

  async function bewertungAnfragenAusfuehren() {
    setBewertungLaedt(true);
    try {
      const antwort = await bewertungAnfordern({ baustelleId });
      Alert.alert("Bewertungsanfrage gesendet", `Der Kunde hat eine E-Mail an ${antwort.gesendetAn} bekommen.`);
    } catch (e) {
      Alert.alert("Versand nicht möglich", e.message || fehlerText(e));
    } finally {
      setBewertungLaedt(false);
    }
  }

  function loeschenFragen() {
    Alert.alert(
      "Baustelle löschen?",
      "Alle Fotos, Maße, Material, Termine und das Angebot werden unwiderruflich gelöscht.",
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Löschen", style: "destructive", onPress: loeschen },
      ]
    );
  }

  async function loeschen() {
    setWeg(true);
    try {
      // Alle Unterordner-Dokumente löschen. Die zugehörigen Fotos/PDFs liegen
      // bei Cloudinary; sie werden nicht mehr referenziert und zählen nur zum
      // (großzügigen) Gratis-Speicher. Eine serverseitige Bereinigung ließe
      // sich später über Cloudinary-Admin ergänzen.
      for (const uo of ["fotos", "angebot", "masse", "material", "termine", "raum"]) {
        await unterordnerLoeschen(uo);
      }
      // Hauptdokument
      await deleteDoc(doc(db, "baustellen", baustelleId));
      navigation.goBack();
    } catch (e) {
      setWeg(false);
      Alert.alert("Fehler beim Löschen", fehlerText(e));
    }
  }

  // Löscht alle Dokumente eines Unterordners.
  async function unterordnerLoeschen(name) {
    const snap = await getDocs(collection(db, "baustellen", baustelleId, name));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  }

  if (laedt) return <Ladeanzeige text="Baustelle wird geladen …" />;

  if (!baustelle) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="❓"
          titel="Baustelle nicht gefunden"
          text="Diese Baustelle wurde möglicherweise gelöscht."
        />
      </SafeAreaView>
    );
  }

  if (weg) return <Ladeanzeige text="Baustelle wird gelöscht …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Kopf */}
        <Text style={styles.name}>{baustelle.name}</Text>
        {baustelle.adresse ? (
          <Text style={styles.adresse}>{baustelle.adresse}</Text>
        ) : null}
        {baustelle.kundeName ? (
          <Text style={styles.kunde}>Kunde: {baustelle.kundeName}</Text>
        ) : null}
        {baustelle.geplantStart ? (
          <Text style={styles.kunde}>
            Geplanter Zeitraum: {datumDe(baustelle.geplantStart)}
            {baustelle.geplantEnde ? ` – ${datumDe(baustelle.geplantEnde)}` : ""}
          </Text>
        ) : null}

        <View style={styles.statusReihe}>
          <Statuspunkt status={baustelle.status} />
        </View>

        <View style={styles.fortReihe}>
          <Fortschritt prozent={baustelle.fortschritt || 0} style={{ flex: 1 }} />
          <Text style={styles.prozent}>
            {Math.round(baustelle.fortschritt || 0)} %
          </Text>
        </View>

        {/* Einstiegs-Karten */}
        {EINSTIEGE.map((e) => (
          <Karte
            key={e.key}
            onPress={() => navigation.navigate(e.key, { baustelleId })}
            style={styles.einstieg}
          >
            <Text style={styles.eSymbol}>{e.symbol}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.eTitel}>{e.titel}</Text>
              <Text style={styles.eText}>{e.text}</Text>
            </View>
            <Text style={styles.ePfeil}>›</Text>
          </Karte>
        ))}

        {/* Angebot – Text je nach Rolle */}
        <Karte
          onPress={() =>
            navigation.navigate("Angebot", {
              baustelleId,
              kundeEmail: baustelle?.kundeEmail || "",
              kundeName: baustelle?.kundeName || "",
            })
          }
          style={styles.einstieg}
        >
          <Text style={styles.eSymbol}>📄</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.eTitel}>Angebot</Text>
            <Text style={styles.eText}>
              {istHandwerker ? "PDF hochladen" : "Angebot ansehen"}
            </Text>
          </View>
          <Text style={styles.ePfeil}>›</Text>
        </Karte>

        {/* Handwerker-Bereich: Status + Löschen */}
        {istHandwerker ? (
          <View style={styles.hwBereich}>
            <Text style={styles.label}>Status ändern</Text>
            <View style={styles.chips}>
              {STATUS.map((s) => (
                <Pill
                  key={s}
                  text={s}
                  aktiv={baustelle.status === s}
                  onPress={() => statusSetzen(s)}
                  style={{ marginRight: 8, marginBottom: 8 }}
                />
              ))}
            </View>

            {baustelle.status === "Abgeschlossen" ? (
              <>
                <Text style={[styles.label, { marginTop: 22 }]}>Bewertung</Text>
                <Text style={styles.kundeStatus}>
                  {baustelle.bewertungAngefragtAm
                    ? `Bewertungsanfrage gesendet am ${datumDe(baustelle.bewertungAngefragtAm)}.`
                    : "Baustelle ist abgeschlossen — jetzt eine Google-Bewertung anfragen?"}
                </Text>
                <Knopf
                  titel={baustelle.bewertungAngefragtAm ? "Erneut anfragen" : "Bewertung anfragen"}
                  variante="ghost"
                  onPress={bewertungAnfragenKlick}
                  laedt={bewertungLaedt}
                />
              </>
            ) : null}

            <Text style={[styles.label, { marginTop: 22 }]}>Einsatzplanung</Text>
            <Text style={styles.kundeStatus}>
              Geplanter Zeitraum für die Kalenderübersicht (Menüpunkt „Einsatzplan“).
            </Text>
            <View style={styles.planReihe}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kleinLabel}>Start</Text>
                {Platform.OS === "web" ? (
                  <input
                    type="date"
                    value={datumIso(planStart)}
                    onChange={(e) => {
                      const d = new Date(e.target.value + "T12:00:00");
                      if (!isNaN(d.getTime())) setPlanStart(d);
                    }}
                    style={webDatumStil}
                  />
                ) : (
                  <>
                    <Pressable onPress={() => setPlanStartPickerAuf(true)} style={styles.datumFeld}>
                      <Text style={styles.datumText}>{datumDe(planStart)}</Text>
                    </Pressable>
                    {planStartPickerAuf ? (
                      <DateTimePicker
                        value={planStart}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        themeVariant="dark"
                        onChange={(e, gewaehlt) => {
                          setPlanStartPickerAuf(Platform.OS === "ios");
                          if (gewaehlt) setPlanStart(gewaehlt);
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.kleinLabel}>Ende</Text>
                {Platform.OS === "web" ? (
                  <input
                    type="date"
                    value={datumIso(planEnde)}
                    onChange={(e) => {
                      const d = new Date(e.target.value + "T12:00:00");
                      if (!isNaN(d.getTime())) setPlanEnde(d);
                    }}
                    style={webDatumStil}
                  />
                ) : (
                  <>
                    <Pressable onPress={() => setPlanEndePickerAuf(true)} style={styles.datumFeld}>
                      <Text style={styles.datumText}>{datumDe(planEnde)}</Text>
                    </Pressable>
                    {planEndePickerAuf ? (
                      <DateTimePicker
                        value={planEnde}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        themeVariant="dark"
                        onChange={(e, gewaehlt) => {
                          setPlanEndePickerAuf(Platform.OS === "ios");
                          if (gewaehlt) setPlanEnde(gewaehlt);
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </View>
            <Knopf
              titel="Zeitraum speichern"
              variante="ghost"
              onPress={planSpeichern}
              laedt={planLaedt}
              style={{ marginTop: 4 }}
            />
            {baustelle.geplantStart ? (
              <Knopf
                titel="Zeitraum entfernen"
                variante="ghost"
                onPress={planEntfernen}
                laedt={planLaedt}
                style={{ marginTop: 10 }}
              />
            ) : null}

            <Text style={[styles.label, { marginTop: 22 }]}>Kunde verknüpfen</Text>
            <Text style={styles.kundeStatus}>
              {baustelle.kundeId
                ? `Verknüpft mit ${baustelle.kundeName || baustelle.kundeEmail}`
                : baustelle.kundeEmail
                ? "Adresse hinterlegt, aber noch kein Konto verknüpft — erscheint automatisch, sobald sich der Kunde damit anmeldet."
                : "Noch keine Kunden-E-Mail hinterlegt."}
            </Text>
            <Feld
              wert={kundeEmailEingabe}
              onChangeText={setKundeEmailEingabe}
              platzhalter="kunde@email.de"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Knopf
              titel="Speichern & Konto suchen"
              variante="ghost"
              onPress={kundeVerknuepfen}
              laedt={kundeSuchtLaedt}
              style={{ marginTop: 10 }}
            />

            <Knopf
              titel="Baustelle löschen"
              variante="ghost"
              onPress={loeschenFragen}
              style={{ marginTop: 18 }}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  name: {
    ...schrift.head,
    fontSize: groessen.h1,
    color: farben.text,
    letterSpacing: 0.5,
  },
  adresse: { ...schrift.body, fontSize: 15, color: farben.textMatt, marginTop: 4 },
  kunde: { ...schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 2 },
  statusReihe: { marginTop: 14 },
  fortReihe: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, marginBottom: 22 },
  prozent: {
    ...schrift.head,
    fontSize: 16,
    color: farben.text,
    letterSpacing: 0.5,
    minWidth: 46,
    textAlign: "right",
  },
  einstieg: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  eSymbol: { fontSize: 26 },
  eTitel: { ...schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5 },
  eText: { ...schrift.body, fontSize: 13.5, color: farben.textMatt, marginTop: 2 },
  ePfeil: { ...schrift.head, fontSize: 26, color: farben.textMatt },
  hwBereich: { marginTop: 18 },
  label: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  kundeStatus: {
    ...schrift.body,
    fontSize: 13,
    color: farben.textMatt,
    marginBottom: 10,
    lineHeight: 18,
  },
  planReihe: { flexDirection: "row", gap: 12 },
  kleinLabel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
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
