// ---------------------------------------------------------------------------
// EinsatzplanScreen.js — Kalender-/Einsatzplanung für den Betriebsinhaber.
// Wochenansicht: welche Baustelle läuft wann, wie viele aktiv/geplant.
// Erste Version: liest alle eigenen Baustellen (wie BaustellenListScreen) und
// filtert clientseitig auf die angezeigte Woche — kein zusätzlicher
// Firestore-Index nötig, unkritisch bei der Datenmenge eines Solo-Betriebs.
// Grundlage je Baustelle: geplantStart/geplantEnde (siehe BaustelleDetailScreen).
// Fehlt geplantStart, leitet der Plan den Zeitraum aus den bereits gepflegten
// Terminen der Baustelle ab (frühester bis spätester Termin). So muss niemand
// denselben Zeitraum zweimal eintragen. Steht geplantStart, gilt weiterhin
// ausschließlich geplantStart/geplantEnde.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Statuspunkt from "../components/Statuspunkt";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import { datumDe, zuDate } from "../util/format";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Montag 00:00 der Woche, in der "datum" liegt.
function montagDerWoche(datum) {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  const index = (d.getDay() + 6) % 7; // JS: So=0 -> hier Mo=0 ... So=6
  d.setDate(d.getDate() - index);
  return d;
}

function tagOhneZeit(datum) {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function EinsatzplanScreen({ navigation }) {
  const { profil, istHandwerker } = useAuth();
  const [baustellen, setBaustellen] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [wochenStart, setWochenStart] = useState(() => montagDerWoche(new Date()));

  useEffect(() => {
    if (!profil || !istHandwerker) {
      setLaedt(false);
      return;
    }
    const q = query(collection(db, "baustellen"), where("handwerkerId", "==", profil.id));
    const stop = onSnapshot(
      q,
      (snap) => {
        setBaustellen(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [profil, istHandwerker]);

  // Zeitraum aus Terminen: nur für Baustellen ohne eigenen geplantStart.
  // Je Baustelle ein eigener Listener auf den Unterordner "termine" — eine
  // Sammelgruppen-Abfrage ginge nicht, weil die Firestore-Regeln den Zugriff
  // über die Baustelle prüfen.
  const [terminSpannen, setTerminSpannen] = useState({});
  const idsOhneStart = useMemo(
    () =>
      baustellen
        .filter((b) => !zuDate(b.geplantStart) && b.status !== "Abgeschlossen")
        .map((b) => b.id)
        .sort()
        .join(","),
    [baustellen]
  );

  useEffect(() => {
    const ids = idsOhneStart ? idsOhneStart.split(",") : [];
    if (!istHandwerker || ids.length === 0) {
      setTerminSpannen({});
      return;
    }
    const stops = ids.map((id) =>
      onSnapshot(
        collection(db, "baustellen", id, "termine"),
        (snap) => {
          let frueh = null;
          let spaet = null;
          snap.docs.forEach((d) => {
            const t = zuDate(d.data().datum);
            if (!t) return;
            if (!frueh || t < frueh) frueh = t;
            if (!spaet || t > spaet) spaet = t;
          });
          setTerminSpannen((alt) => ({
            ...alt,
            [id]: frueh ? { start: frueh, ende: spaet || frueh } : null,
          }));
        },
        () => setTerminSpannen((alt) => ({ ...alt, [id]: null }))
      )
    );
    return () => stops.forEach((stop) => stop());
  }, [idsOhneStart, istHandwerker]);

  const heute = useMemo(() => tagOhneZeit(new Date()), []);
  const wochenEnde = useMemo(() => {
    const e = new Date(wochenStart);
    e.setDate(e.getDate() + 6);
    return e;
  }, [wochenStart]);

  const { inWoche, ohneTermin, aktivAnzahl } = useMemo(() => {
    const inWoche = [];
    const ohneTermin = [];
    let aktivAnzahl = 0;

    for (const b of baustellen) {
      const eigenerStart = zuDate(b.geplantStart);
      const spanne = eigenerStart ? null : terminSpannen[b.id];
      const start = eigenerStart || (spanne ? spanne.start : null);
      if (!start) {
        if (b.status !== "Abgeschlossen") ohneTermin.push(b);
        continue;
      }
      const ende = eigenerStart
        ? zuDate(b.geplantEnde) || eigenerStart
        : spanne.ende;
      const s = tagOhneZeit(start);
      const e = tagOhneZeit(ende);

      if (s <= heute && heute <= e && b.status !== "Abgeschlossen") {
        aktivAnzahl += 1;
      }
      if (s <= wochenEnde && e >= wochenStart) {
        inWoche.push({ ...b, _start: s, _ende: e, _ausTerminen: !eigenerStart });
      }
    }
    inWoche.sort((a, b2) => a._start - b2._start);
    return { inWoche, ohneTermin, aktivAnzahl };
  }, [baustellen, terminSpannen, wochenStart, wochenEnde, heute]);

  function segmente(b) {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const tag = new Date(wochenStart);
      tag.setDate(tag.getDate() + i);
      arr.push(tag >= b._start && tag <= b._ende);
    }
    return arr;
  }

  function wocheVerschieben(tage) {
    setWochenStart((w) => {
      const n = new Date(w);
      n.setDate(n.getDate() + tage);
      return n;
    });
  }

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="📅"
          titel="Nur für den Handwerker"
          text="Die Einsatzplanung ist dem Betriebsinhaber vorbehalten."
        />
      </SafeAreaView>
    );
  }

  if (laedt) return <Ladeanzeige text="Einsatzplan wird geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.kopf}>
          <Pressable onPress={() => wocheVerschieben(-7)} hitSlop={10}>
            <Text style={styles.pfeil}>‹</Text>
          </Pressable>
          <View style={styles.kopfMitte}>
            <Text style={styles.wocheText}>
              {datumDe(wochenStart)} – {datumDe(wochenEnde)}
            </Text>
            <Pressable onPress={() => setWochenStart(montagDerWoche(new Date()))}>
              <Text style={styles.heuteLink}>Zu heute springen</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => wocheVerschieben(7)} hitSlop={10}>
            <Text style={styles.pfeil}>›</Text>
          </Pressable>
        </View>

        <View style={styles.zusammenfassung}>
          <View style={styles.zahlKarte}>
            <Text style={styles.zahl}>{aktivAnzahl}</Text>
            <Text style={styles.zahlLabel}>aktiv heute</Text>
          </View>
          <View style={styles.zahlKarte}>
            <Text style={styles.zahl}>{inWoche.length}</Text>
            <Text style={styles.zahlLabel}>diese Woche</Text>
          </View>
          <View style={styles.zahlKarte}>
            <Text style={styles.zahl}>{ohneTermin.length}</Text>
            <Text style={styles.zahlLabel}>ohne Termin</Text>
          </View>
        </View>

        <View style={styles.tageReihe}>
          {WOCHENTAGE.map((t, i) => {
            const tag = new Date(wochenStart);
            tag.setDate(tag.getDate() + i);
            const istHeute = tag.getTime() === heute.getTime();
            return (
              <Text key={t} style={[styles.tagLabel, istHeute && styles.tagHeute]}>
                {t}
              </Text>
            );
          })}
        </View>

        {inWoche.length === 0 ? (
          <Leerzustand
            symbol="📅"
            titel="Keine Baustelle in dieser Woche"
            text="Tragen Sie bei einer Baustelle unter „Einsatzplanung“ einen geplanten Zeitraum ein oder legen Sie Termine an, um sie hier zu sehen."
          />
        ) : (
          inWoche.map((b) => (
            <Karte
              key={b.id}
              onPress={() => navigation.navigate("BaustelleDetail", { baustelleId: b.id })}
              style={styles.bKarte}
            >
              <View style={styles.bKopf}>
                <Text style={styles.bName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Statuspunkt status={b.status} />
              </View>
              <Text style={styles.bZeitraum}>
                {datumDe(b._start)} – {datumDe(b._ende)}
                {b._ausTerminen ? " · aus den Terminen" : ""}
              </Text>
              <View style={styles.balkenReihe}>
                {segmente(b).map((aktiv, i) => (
                  <View key={i} style={[styles.balkenSegment, aktiv && styles.balkenAktiv]} />
                ))}
              </View>
            </Karte>
          ))
        )}

        {ohneTermin.length > 0 ? (
          <>
            <Text style={styles.abschnitt}>Ohne geplanten Zeitraum</Text>
            {ohneTermin.map((b) => (
              <Karte
                key={b.id}
                onPress={() => navigation.navigate("BaustelleDetail", { baustelleId: b.id })}
                style={styles.bKarteMatt}
              >
                <Text style={styles.bName}>{b.name}</Text>
                <Text style={styles.bHinweis}>Zeitraum eintragen oder Termine anlegen</Text>
              </Karte>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  kopf: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  kopfMitte: { flex: 1, alignItems: "center" },
  pfeil: { ...schrift.head, fontSize: 30, color: farben.rot, paddingHorizontal: 14 },
  wocheText: { ...schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5 },
  heuteLink: { ...schrift.bodyMed, fontSize: 12.5, color: farben.textMatt, marginTop: 4 },
  zusammenfassung: { flexDirection: "row", gap: 10, marginBottom: 18 },
  zahlKarte: {
    flex: 1,
    backgroundColor: farben.glas,
    borderWidth: 1,
    borderColor: farben.linie,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  zahl: { ...schrift.head, fontSize: 26, color: farben.text, letterSpacing: 0.5 },
  zahlLabel: {
    ...schrift.headHalb,
    fontSize: 11,
    color: farben.textMatt,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 2,
    textAlign: "center",
  },
  tageReihe: { flexDirection: "row", marginBottom: 10, paddingHorizontal: 4 },
  tagLabel: {
    flex: 1,
    textAlign: "center",
    ...schrift.headHalb,
    fontSize: 12,
    color: farben.textMatt,
    letterSpacing: 0.5,
  },
  tagHeute: { color: farben.rot },
  bKarte: { marginBottom: 12 },
  bKarteMatt: { marginBottom: 10, opacity: 0.7 },
  bKopf: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  bName: { ...schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5, flex: 1 },
  bZeitraum: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6 },
  balkenReihe: { flexDirection: "row", gap: 3, marginTop: 12 },
  balkenSegment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,.08)",
  },
  balkenAktiv: { backgroundColor: farben.rot },
  abschnitt: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 12,
  },
  bHinweis: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 4 },
});
