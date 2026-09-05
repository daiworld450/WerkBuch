// ---------------------------------------------------------------------------
// AuswertungScreen.js — Nachkalkulation über ALLE Baustellen.
//
// Zweck: die schwächste Baustelle soll sofort auffallen. Deshalb eine
// sortierbare Tabelle statt schöner Diagramme.
//
// Ladeweg: eine Abfrage für die Baustellen (where handwerkerId == uid), dann
// je Baustelle drei Unterabfragen (stunden/material/kosten). Bei 20
// Baustellen sind das 60 Abfragen — vertretbar, aber sie laufen parallel
// (Promise.all) und der Fortschritt wird angezeigt, damit die Wartezeit nicht
// wie ein Hänger wirkt.
//
// Bewusst EINMALIGES Laden (getDocs, kein onSnapshot): 60 Dauer-Listener
// hätte niemand etwas davon; stattdessen gibt es einen Knopf zum Neuladen.
//
// Nur der Betriebsinhaber.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { euroDe, mengeDe, zuDate } from "../util/format";
import { kalkuliere, ortAus, summiereBaustellen } from "../util/kalkulation";

const SORTIERUNGEN = [
  { key: "gewinn", label: "Gewinn" },
  { key: "marge", label: "Marge" },
  { key: "proStunde", label: "€/Stunde" },
];

const ZEITRAEUME = [
  { key: "alle", label: "Alle" },
  { key: "jahr", label: "Dieses Jahr" },
  { key: "vorjahr", label: "Vorjahr" },
];

function prozentDe(anteil) {
  if (anteil == null || !isFinite(anteil)) return "—";
  return (
    (anteil * 100).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + " %"
  );
}

// Maßgebliches Jahr einer Baustelle: der geplante Start, ersatzweise das
// Anlegedatum. Ohne beides bleibt sie nur im Zeitraum „Alle".
function jahrVon(baustelle) {
  const d = zuDate(baustelle?.geplantStart) || zuDate(baustelle?.erstelltAm);
  return d ? d.getFullYear() : null;
}

export default function AuswertungScreen({ navigation }) {
  const { profil, istHandwerker } = useAuth();

  const [zeilen, setZeilen] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fortschritt, setFortschritt] = useState({ fertig: 0, gesamt: 0 });
  const [fehler, setFehler] = useState("");

  const [sortierung, setSortierung] = useState("gewinn");
  const [zeitraum, setZeitraum] = useState("alle");

  const laden = useCallback(async () => {
    if (!profil || !istHandwerker) {
      setLaedt(false);
      return;
    }
    setLaedt(true);
    setFehler("");
    setFortschritt({ fertig: 0, gesamt: 0 });
    try {
      const bSnap = await getDocs(
        query(collection(db, "baustellen"), where("handwerkerId", "==", profil.id))
      );
      const baustellen = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFortschritt({ fertig: 0, gesamt: baustellen.length });

      let fertig = 0;
      const ergebnisse = await Promise.all(
        baustellen.map(async (b) => {
          const [stunden, material, kosten] = await Promise.all([
            getDocs(collection(db, "baustellen", b.id, "stunden")),
            getDocs(collection(db, "baustellen", b.id, "material")),
            getDocs(collection(db, "baustellen", b.id, "kosten")),
          ]);
          fertig += 1;
          setFortschritt({ fertig, gesamt: baustellen.length });
          return {
            baustelle: b,
            erg: kalkuliere({
              umsatz: b.umsatz,
              budget: b.budget,
              stunden: stunden.docs.map((d) => d.data()),
              material: material.docs.map((d) => d.data()),
              kosten: kosten.docs.map((d) => d.data()),
            }),
          };
        })
      );
      setZeilen(ergebnisse);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaedt(false);
    }
  }, [profil, istHandwerker]);

  useEffect(() => {
    laden();
  }, [laden]);

  // ------------------------------------------------------------- Filtern
  const gefiltert = useMemo(() => {
    if (zeitraum === "alle") return zeilen;
    const jetzt = new Date().getFullYear();
    const gesucht = zeitraum === "jahr" ? jetzt : jetzt - 1;
    return zeilen.filter((z) => jahrVon(z.baustelle) === gesucht);
  }, [zeilen, zeitraum]);

  // Kalkulierte zuerst und untereinander sortiert; die nicht kalkulierten
  // hängen unsortiert hinten dran — sie haben keinen Gewinn, mit dem man sie
  // einreihen könnte, und dürfen nicht so tun, als wären sie die schlechtesten.
  const sortiert = useMemo(() => {
    const kalk = gefiltert.filter((z) => z.erg.kalkuliert);
    const offen = gefiltert.filter((z) => !z.erg.kalkuliert);
    const wert = (z) =>
      sortierung === "gewinn"
        ? z.erg.gewinn
        : sortierung === "marge"
        ? z.erg.marge
        : z.erg.ertragProStunde;
    kalk.sort((a, b) => {
      const wa = wert(a);
      const wb = wert(b);
      // Baustellen ohne Kennzahl (z.B. keine Stunden erfasst) nach unten.
      if (wa == null && wb == null) return 0;
      if (wa == null) return 1;
      if (wb == null) return -1;
      return wa - wb; // aufsteigend: die schwächste steht oben
    });
    offen.sort((a, b) =>
      (a.baustelle.name || "").localeCompare(b.baustelle.name || "")
    );
    return { kalk, offen };
  }, [gefiltert, sortierung]);

  const gesamt = useMemo(() => summiereBaustellen(gefiltert), [gefiltert]);

  // ------------------------------------------------------- Gruppe nach Ort
  const orte = useMemo(() => {
    const karte = new Map();
    for (const z of gefiltert) {
      const ort = ortAus(z.baustelle);
      const eintrag = karte.get(ort) || { ort, zeilen: [] };
      eintrag.zeilen.push(z);
      karte.set(ort, eintrag);
    }
    return Array.from(karte.values())
      .map((e) => ({ ...e, summe: summiereBaustellen(e.zeilen) }))
      .sort((a, b) => b.summe.umsatz - a.summe.umsatz);
  }, [gefiltert]);

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="🔒"
          titel="Nur für den Betriebsinhaber"
          text="Die Auswertung über alle Baustellen sieht ausschließlich der Inhaber."
        />
      </SafeAreaView>
    );
  }

  if (laedt) {
    return (
      <Ladeanzeige
        text={
          fortschritt.gesamt > 0
            ? `Baustelle ${fortschritt.fertig} von ${fortschritt.gesamt} wird gerechnet …`
            : "Baustellen werden geladen …"
        }
      />
    );
  }

  function kennzahl(label, wert, stil) {
    return (
      <View style={styles.kachel}>
        <Text style={styles.kLabel}>{label}</Text>
        <Text style={[styles.kWert, stil]}>{wert}</Text>
      </View>
    );
  }

  function tabellenZeile(z) {
    const e = z.erg;
    const gewinnFarbe =
      e.gewinn == null
        ? farben.textMatt
        : e.gewinn >= 0
        ? farben.gruen
        : farben.rotHell;
    return (
      <Pressable
        key={z.baustelle.id}
        onPress={() =>
          navigation.navigate("Kalkulation", { baustelleId: z.baustelle.id })
        }
        style={({ pressed }) => [styles.tZeile, pressed && { opacity: 0.8 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.tName} numberOfLines={1}>
            {z.baustelle.name || "Ohne Namen"}
          </Text>
          <Text style={styles.tUnter} numberOfLines={1}>
            {ortAus(z.baustelle)} · {mengeDe(e.stundenGesamt)} Std. ·{" "}
            {euroDe(e.gesamtkosten)} Kosten
          </Text>
        </View>
        <View style={styles.tRechts}>
          <Text style={[styles.tGewinn, { color: gewinnFarbe }]}>
            {e.gewinn == null ? "—" : euroDe(e.gewinn)}
          </Text>
          <Text style={styles.tKlein}>
            {prozentDe(e.marge)}
            {e.ertragProStunde != null
              ? ` · ${euroDe(e.ertragProStunde)}/Std.`
              : ""}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Fehlerkasten text={fehler} />

        {/* Zeitfilter */}
        <View style={styles.chips}>
          {ZEITRAEUME.map((z) => (
            <Pill
              key={z.key}
              text={z.label}
              aktiv={zeitraum === z.key}
              onPress={() => setZeitraum(z.key)}
              style={{ marginRight: 8, marginBottom: 8 }}
            />
          ))}
        </View>

        {gefiltert.length === 0 ? (
          <Leerzustand
            symbol="📊"
            titel="Nichts im Zeitraum"
            text="In diesem Zeitraum liegt keine Baustelle. Wählen Sie „Alle“."
          />
        ) : (
          <>
            {/* Kopfzahlen */}
            <Karte style={{ marginBottom: 14 }}>
              <Text style={styles.blockTitel}>
                Gesamt ({gesamt.anzahlKalkuliert} kalkulierte Baustellen)
              </Text>
              <View style={styles.kacheln}>
                {kennzahl("Umsatz", euroDe(gesamt.umsatz))}
                {kennzahl("Kosten", euroDe(gesamt.kosten))}
                {kennzahl(
                  "Gewinn",
                  euroDe(gesamt.gewinn),
                  { color: gesamt.gewinn >= 0 ? farben.gruen : farben.rotHell }
                )}
                {kennzahl("Marge", prozentDe(gesamt.marge))}
                {kennzahl("Stunden", `${mengeDe(gesamt.stunden)} Std.`)}
                {kennzahl(
                  "€ / Stunde",
                  gesamt.ertragProStunde == null
                    ? "—"
                    : euroDe(gesamt.ertragProStunde)
                )}
              </View>
              {gesamt.anzahlOffen > 0 ? (
                <Text style={styles.hinweis}>
                  {gesamt.anzahlOffen}{" "}
                  {gesamt.anzahlOffen === 1 ? "Baustelle ist" : "Baustellen sind"}{" "}
                  noch nicht kalkuliert (kein Umsatz hinterlegt) und
                  {" "}
                  <Text style={styles.hinweisFett}>nicht</Text> in den Zahlen
                  oben enthalten — dort stecken bereits {euroDe(gesamt.offeneKosten)}{" "}
                  Kosten und {mengeDe(gesamt.offeneStunden)} Stunden.
                </Text>
              ) : null}
            </Karte>

            {/* Tabelle */}
            <Karte style={{ marginBottom: 14 }}>
              <Text style={styles.blockTitel}>Je Baustelle</Text>
              <Text style={styles.hinweisOben}>
                Sortiert aufsteigend — oben steht die schwächste.
              </Text>
              <View style={styles.chips}>
                {SORTIERUNGEN.map((s) => (
                  <Pill
                    key={s.key}
                    text={s.label}
                    aktiv={sortierung === s.key}
                    onPress={() => setSortierung(s.key)}
                    style={{ marginRight: 8, marginBottom: 8 }}
                  />
                ))}
              </View>
              <View style={{ height: 6 }} />
              {sortiert.kalk.map(tabellenZeile)}
              {sortiert.kalk.length === 0 ? (
                <Text style={styles.hinweis}>
                  Noch keine Baustelle mit hinterlegtem Umsatz.
                </Text>
              ) : null}

              {sortiert.offen.length > 0 ? (
                <>
                  <View style={styles.strich} />
                  <Text style={styles.blockTitel}>Nicht kalkuliert</Text>
                  {sortiert.offen.map(tabellenZeile)}
                </>
              ) : null}
            </Karte>

            {/* Nach Ort */}
            <Karte style={{ marginBottom: 14 }}>
              <Text style={styles.blockTitel}>Nach Ort</Text>
              <Text style={styles.hinweisOben}>
                Ort aus der Adresse; fehlt sie, steht der Baustellenname.
              </Text>
              {orte.map((o) => (
                <View key={o.ort} style={styles.ortZeile}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tName} numberOfLines={1}>
                      {o.ort}
                    </Text>
                    <Text style={styles.tUnter}>
                      {o.zeilen.length}{" "}
                      {o.zeilen.length === 1 ? "Baustelle" : "Baustellen"} ·{" "}
                      {mengeDe(o.summe.stunden + o.summe.offeneStunden)} Std.
                    </Text>
                  </View>
                  <View style={styles.tRechts}>
                    <Text style={styles.tGewinn}>{euroDe(o.summe.umsatz)}</Text>
                    <Text
                      style={[
                        styles.tKlein,
                        {
                          color:
                            o.summe.gewinn >= 0 ? farben.gruen : farben.rotHell,
                        },
                      ]}
                    >
                      {euroDe(o.summe.gewinn)} Gewinn
                    </Text>
                  </View>
                </View>
              ))}
            </Karte>
          </>
        )}

        <Knopf
          titel="Neu berechnen"
          variante="ghost"
          onPress={laden}
          style={{ marginTop: 6 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  blockTitel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  kacheln: { flexDirection: "row", flexWrap: "wrap" },
  kachel: { width: "50%", paddingRight: 10, marginBottom: 16 },
  kLabel: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginBottom: 3 },
  kWert: { ...schrift.head, fontSize: 21, color: farben.text, letterSpacing: 0.5 },
  tZeile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: farben.linie,
  },
  ortZeile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: farben.linie,
  },
  tName: { ...schrift.headHalb, fontSize: 15.5, color: farben.text, letterSpacing: 0.5 },
  tUnter: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 2 },
  tRechts: { alignItems: "flex-end" },
  tGewinn: { ...schrift.head, fontSize: 16, letterSpacing: 0.5, color: farben.text },
  tKlein: { ...schrift.body, fontSize: 11.5, color: farben.textMatt, marginTop: 2 },
  strich: { height: 1, backgroundColor: farben.linie, marginVertical: 16 },
  hinweis: {
    ...schrift.body,
    fontSize: 12.5,
    color: farben.textMatt,
    lineHeight: 18,
    marginTop: 6,
  },
  hinweisFett: { ...schrift.bodyMed, color: farben.textWeich },
  hinweisOben: {
    ...schrift.body,
    fontSize: 12.5,
    color: farben.textMatt,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 12,
  },
});
