// ---------------------------------------------------------------------------
// BaustelleDetailScreen.js — Übersicht einer Baustelle mit ihren Einstiegen.
// Handwerker: Statuswechsel per Chips und Löschen (mit Sicherheitsabfrage).
//
// ROLLEN-TRENNUNG: Der Mitarbeiter sieht nur die Kacheln, mit denen er auch
// arbeiten soll (Fotos, Maße, Stunden). Material, Kosten, Kalkulation,
// Angebot und Dokumente führen zu Geldbeträgen und bleiben dem Inhaber
// vorbehalten — die Kacheln fehlen, und die Firestore-Regeln lassen ihn dort
// auch dann nicht lesen, wenn er den Bildschirm anders erreicht.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Linking,
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
  arrayUnion,
  arrayRemove,
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
import { datumDe, datumIso, zuDate, euroDe } from "../util/format";
import { kalkuliere } from "../util/kalkulation";

const STATUS = ["In Planung", "In Ausführung", "Abgeschlossen"];

// Fester Google-Bewertungslink der Firma (aus worker/src/config.js
// FIRMA.googleBewertungsLink übernommen) — der Bewertungsversand läuft nicht
// mehr über den Cloudflare-Worker/E-Mail, sondern direkt per WhatsApp-Link.
const GOOGLE_BEWERTUNG_LINK =
  "https://www.google.com/maps/place//data=!4m3!3m2!1s0x47b8c1e16ee340bf:0xd14070e51d5d33e7!12e1";

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

// nurInhaber: true = Kachel erscheint für den Mitarbeiter gar nicht.
const EINSTIEGE = [
  { key: "Fotos", symbol: "📷", titel: "Fotos", text: "Bilder nach Bauphase sortiert" },
  { key: "Visualisierung", symbol: "🎨", titel: "Entwurf", text: "Foto aufnehmen, fertiges Bad zeigen", nurInhaber: true },
  { key: "Masse", symbol: "📐", titel: "Maße & Flächen", text: "Raummaße und automatische Flächenberechnung" },
  { key: "Material", symbol: "🧱", titel: "Material", text: "Fliesen, Boden, Sanitär", nurInhaber: true },
  { key: "Stunden", symbol: "⏱", titel: "Stunden", text: "Wer wann wie lange gearbeitet hat" },
  { key: "Kosten", symbol: "🧾", titel: "Kosten", text: "Fahrt, Werkzeug, Fremdleistung", nurInhaber: true },
  { key: "Kalkulation", symbol: "📊", titel: "Kalkulation", text: "Umsatz, Kosten, Gewinn dieser Baustelle", nurInhaber: true },
  // Der Unterschied zu plancraft, Craftnote und ToolTime: eine zusätzliche
  // Leistung wird nicht mündlich vereinbart, sondern vom Kunden per Link
  // freigegeben — nachweisbar.
  { key: "Nachtraege", symbol: "➕", titel: "Nachträge", text: "Zusätzliche Leistungen, vom Kunden freigegeben", nurInhaber: true },
  // Termine liegen in der top-level Sammlung "termine" und sind über
  // handwerkerId an den Inhaber gebunden — der Mitarbeiter kann sie nicht
  // lesen, deshalb bekommt er die Kachel auch nicht.
  { key: "Termine", symbol: "📅", titel: "Termine", text: "Zeitplan der Sanierung", nurInhaber: true },
  { key: "Dokumente", symbol: "📎", titel: "Dokumente", text: "Beliebige Dateien: Rechnungen, Kalkulationen, Pläne", nurInhaber: true },
  { key: "Bericht", symbol: "📘", titel: "Projektbericht", text: "Die ganze Sanierung als PDF für den Kunden", nurInhaber: true },
];

export default function BaustelleDetailScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { istHandwerker, profil } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;
  const [baustelle, setBaustelle] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [weg, setWeg] = useState(false);
  const [kundeName, setKundeName] = useState("");
  const [kundeTelefon, setKundeTelefon] = useState("");
  const [kundeUebernommen, setKundeUebernommen] = useState(false);
  const [kundeSpeichertLaedt, setKundeSpeichertLaedt] = useState(false);

  // Einsatzplanung (geplanter Zeitraum für die Kalenderübersicht)
  const [planStart, setPlanStart] = useState(new Date());
  const [planEnde, setPlanEnde] = useState(new Date());
  const [planUebernommen, setPlanUebernommen] = useState(false);
  const [planStartPickerAuf, setPlanStartPickerAuf] = useState(false);
  const [planEndePickerAuf, setPlanEndePickerAuf] = useState(false);
  const [planLaedt, setPlanLaedt] = useState(false);

  // Nachkalkulation für die kompakte Gewinn-Zeile im Kopf. Nur der Inhaber
  // lädt diese drei Unterordner — der Mitarbeiter darf kosten/material gar
  // nicht lesen.
  const [stundenListe, setStundenListe] = useState([]);
  const [materialListe, setMaterialListe] = useState([]);
  const [kostenListe, setKostenListe] = useState([]);

  // Personen mit verknüpftem Konto — nur die lassen sich zuweisen.
  const [personen, setPersonen] = useState([]);
  const [zuweisungLaedt, setZuweisungLaedt] = useState(false);

  useEffect(() => {
    const stop = onSnapshot(
      doc(db, "baustellen", baustelleId),
      (snap) => {
        if (snap.exists()) {
          const daten = { id: snap.id, ...snap.data() };
          setBaustelle(daten);
          // Eingabefelder nur beim ersten Laden aus der Baustelle übernehmen,
          // damit eine laufende Eingabe nicht von einem Live-Update überschrieben wird.
          setKundeUebernommen((schonUebernommen) => {
            if (!schonUebernommen) {
              setKundeName(daten.kundeName || "");
              setKundeTelefon(daten.kundeTelefon || "");
            }
            return true;
          });
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

  // Zahlen für die Gewinn-Zeile (nur Inhaber).
  useEffect(() => {
    if (!istHandwerker) return;
    const stops = [
      onSnapshot(
        collection(db, "baustellen", baustelleId, "stunden"),
        (s) => setStundenListe(s.docs.map((d) => d.data())),
        () => setStundenListe([])
      ),
      onSnapshot(
        collection(db, "baustellen", baustelleId, "material"),
        (s) => setMaterialListe(s.docs.map((d) => d.data())),
        () => setMaterialListe([])
      ),
      onSnapshot(
        collection(db, "baustellen", baustelleId, "kosten"),
        (s) => setKostenListe(s.docs.map((d) => d.data())),
        () => setKostenListe([])
      ),
    ];
    return () => stops.forEach((s) => s());
  }, [baustelleId, istHandwerker]);

  // Personen des Betriebs für die Zuweisung (nur Inhaber).
  useEffect(() => {
    if (!istHandwerker || !profil) return;
    const stop = onSnapshot(
      query(collection(db, "personen"), where("handwerkerId", "==", profil.id)),
      (snap) => {
        const l = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        l.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setPersonen(l);
      },
      () => setPersonen([])
    );
    return stop;
  }, [istHandwerker, profil?.id]);

  // Zuweisung an-/abwählen. Geschrieben wird das Feld zugewieseneNutzer auf
  // der Baustelle — ein Array von uids, aus dem die Firestore-Regeln den
  // Lesezugriff des Mitarbeiters ableiten. arrayUnion/arrayRemove statt
  // "ganzes Array neu schreiben", damit zwei gleichzeitige Änderungen sich
  // nicht gegenseitig überschreiben.
  async function zuweisungUmschalten(person) {
    if (!person.uid) return;
    const drin = (baustelle?.zugewieseneNutzer || []).includes(person.uid);
    setZuweisungLaedt(true);
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), {
        zugewieseneNutzer: drin ? arrayRemove(person.uid) : arrayUnion(person.uid),
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setZuweisungLaedt(false);
    }
  }

  // Kunde ist nur noch reine Kontakt-Information auf der Baustelle — kein
  // Konto, keine Suche, keine Verknüpfung.
  async function kundeSpeichern() {
    setKundeSpeichertLaedt(true);
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), {
        kundeName: kundeName.trim() || null,
        kundeTelefon: kundeTelefon.trim() || null,
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setKundeSpeichertLaedt(false);
    }
  }

  function anrufen() {
    const nummer = baustelle?.kundeTelefon;
    if (!nummer) return;
    Linking.openURL(`tel:${nummer}`).catch(() => {});
  }

  async function statusSetzen(neu) {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId), { status: neu });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  // Geplanten Zeitraum speichern — Grundlage für die Balken „Baustelle läuft“
  // im Kalender (KalenderScreen).
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

  // Bewertungsanfrage nach der Abnahme (Bauplan S13): läuft jetzt ohne
  // Cloudflare-Worker/E-Mail über einen WhatsApp-Link mit vorformuliertem
  // Text — nur möglich, wenn eine Telefonnummer hinterlegt ist.
  function bewertungAnfragenKlick() {
    const nummer = baustelle?.kundeTelefon;
    if (!nummer) return;
    const nummerFuerWhatsapp = nummer.replace(/[^0-9+]/g, "").replace(/^0/, "49");
    const text = `Hallo${baustelle?.kundeName ? " " + baustelle.kundeName : ""}, vielen Dank für Ihr Vertrauen! Über eine kurze Google-Bewertung würden wir uns sehr freuen: ${GOOGLE_BEWERTUNG_LINK}`;
    Linking.openURL(
      `https://wa.me/${nummerFuerWhatsapp}?text=${encodeURIComponent(text)}`
    ).catch(() => {});
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
      for (const uo of ["fotos", "angebot", "masse", "material", "raum", "dokumente"]) {
        await unterordnerLoeschen(uo);
      }
      // Termine liegen seit dem Kalender-Umbau NICHT mehr als Unterordner an
      // der Baustelle, sondern in der top-level Sammlung "termine". Die
      // zugehörigen werden hier mitgelöscht — sonst blieben Geister-Termine
      // mit einer Verknüpfung auf eine gelöschte Baustelle im Kalender stehen.
      await termineDerBaustelleLoeschen();
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

  // Löscht alle Termine, die mit dieser Baustelle verknüpft sind. Abgefragt
  // wird nur über handwerkerId (kein zusammengesetzter Index nötig), die
  // Zuordnung zur Baustelle geschieht clientseitig.
  async function termineDerBaustelleLoeschen() {
    if (!profil) return;
    const snap = await getDocs(
      query(collection(db, "termine"), where("handwerkerId", "==", profil.id))
    );
    for (const d of snap.docs) {
      if (d.data().baustelleId === baustelleId) await deleteDoc(d.ref);
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

  const erg = istHandwerker
    ? kalkuliere({
        umsatz: baustelle.umsatz,
        budget: baustelle.budget,
        stunden: stundenListe,
        material: materialListe,
        kosten: kostenListe,
      })
    : null;
  const zugewiesen = baustelle.zugewieseneNutzer || [];
  const mitKonto = personen.filter((p) => !!p.uid);

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
        {baustelle.kundeTelefon ? (
          <Pressable onPress={anrufen} hitSlop={8}>
            <Text style={styles.kundeAnruf}>📞 {baustelle.kundeTelefon}</Text>
          </Pressable>
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

        {/* Kompakte Geldzeile — erst sobald eine Auftragssumme hinterlegt ist.
            Ohne Umsatz gäbe es keinen Gewinn zu zeigen, nur eine irreführende
            Null. */}
        {istHandwerker && erg?.kalkuliert ? (
          <Pressable
            onPress={() => navigation.navigate("Kalkulation", { baustelleId })}
            style={({ pressed }) => [styles.geldZeile, pressed && { opacity: 0.85 }]}
          >
            <Text
              style={[
                styles.geldWert,
                { color: erg.gewinn >= 0 ? farben.gruen : farben.rotHell },
              ]}
            >
              {euroDe(erg.gewinn)}
            </Text>
            <Text style={styles.geldKlein}>
              Gewinn
              {erg.marge != null
                ? ` · Marge ${(erg.marge * 100).toLocaleString("de-DE", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })} %`
                : ""}
              {` · Umsatz ${euroDe(erg.umsatz)}`}
            </Text>
          </Pressable>
        ) : null}

        {/* Einstiegs-Karten */}
        {EINSTIEGE.filter((e) => istHandwerker || !e.nurInhaber).map((e) => (
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
                  {baustelle.kundeTelefon
                    ? "Baustelle ist abgeschlossen — per WhatsApp um eine Google-Bewertung bitten?"
                    : "Für eine Bewertungsanfrage per WhatsApp erst eine Telefonnummer beim Kunden hinterlegen."}
                </Text>
                <Knopf
                  titel="Bewertung per WhatsApp anfragen"
                  variante="ghost"
                  onPress={bewertungAnfragenKlick}
                  deaktiviert={!baustelle.kundeTelefon}
                />
              </>
            ) : null}

            {/* Wer arbeitet hier — steuert, welche Baustelle ein Mitarbeiter
                überhaupt sieht. Nur Personen MIT verknüpftem Konto lassen
                sich zuweisen; ohne Konto gäbe es keine uid, die im Array
                stehen könnte. */}
            <Text style={[styles.label, { marginTop: 22 }]}>Wer arbeitet hier</Text>
            {mitKonto.length === 0 ? (
              <Text style={styles.kundeStatus}>
                Noch niemand mit eigenem Konto. Legen Sie unter „Personen“ eine
                Person mit E-Mail an — sobald sie sich in der App mit genau
                dieser E-Mail registriert, erscheint sie hier.
              </Text>
            ) : (
              <>
                <Text style={styles.kundeStatus}>
                  Ausgewählte sehen diese Baustelle und tragen ihre Stunden und
                  Fotos selbst ein. Kosten, Umsatz und Angebot bleiben verborgen.
                </Text>
                <View style={styles.chips}>
                  {mitKonto.map((p) => (
                    <Pill
                      key={p.id}
                      text={p.name}
                      aktiv={zugewiesen.includes(p.uid)}
                      onPress={zuweisungLaedt ? undefined : () => zuweisungUmschalten(p)}
                      style={{ marginRight: 8, marginBottom: 8 }}
                    />
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.label, { marginTop: 22 }]}>Einsatzplanung</Text>
            <Text style={styles.kundeStatus}>
              Geplanter Zeitraum für die Kalenderübersicht (Menüpunkt „Kalender“).
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

            <Text style={[styles.label, { marginTop: 22 }]}>Kunde</Text>
            <Feld
              label="Name des Kunden"
              wert={kundeName}
              onChangeText={setKundeName}
              platzhalter="Max Mustermann"
            />
            <Feld
              label="Telefonnummer"
              wert={kundeTelefon}
              onChangeText={setKundeTelefon}
              platzhalter="0176 12345678"
              keyboardType="phone-pad"
            />
            <Knopf
              titel="Kunde speichern"
              variante="ghost"
              onPress={kundeSpeichern}
              laedt={kundeSpeichertLaedt}
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
  kundeAnruf: { ...schrift.bodyMed, fontSize: 14, color: farben.rot, marginTop: 4 },
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
  geldZeile: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: farben.linie,
    paddingVertical: 14,
    marginBottom: 18,
  },
  geldWert: { ...schrift.head, fontSize: 24, letterSpacing: 0.5 },
  geldKlein: { ...schrift.body, fontSize: 13, color: farben.textMatt },
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
