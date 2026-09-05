// ---------------------------------------------------------------------------
// KalenderScreen.js — vollwertiger Kalender des Betriebsinhabers.
// Ersetzt den früheren EinsatzplanScreen (reine Lese-Wochenansicht).
//
// Drei Ansichten: Monat (7-Spalten-Raster), Woche (Balken je Baustelle) und
// Tag (chronologische Liste). Angezeigt werden ZWEI Quellen gleichzeitig:
//
//   1. Freie Termine aus der top-level Sammlung "termine" (der Inhaber legt
//      sie selbst an, siehe TerminScreen) — farbige Streifen nach Art.
//   2. Die geplanten Zeiträume der Baustellen (geplantStart/geplantEnde auf
//      dem Baustellen-Dokument) — umrandete Balken „Baustelle läuft“.
//
// Beide Abfragen laufen über where("handwerkerId","==",uid); alles Weitere
// (Zeitraum, Sortierung) geschieht clientseitig — kein Firestore-Index nötig.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, radius } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Statuspunkt from "../components/Statuspunkt";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { datumDe, datumIso, zuDate } from "../util/format";
import {
  artInfo,
  tagOhneZeit,
  montagDerWoche,
  ersterDesMonats,
  letzterDesMonats,
  tagSchluessel,
  tagePlus,
  tageZwischen,
  uhrzeitDe,
  wochentagLang,
  monatJahr,
} from "../util/termine";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const ANSICHTEN = [
  { key: "monat", label: "Monat" },
  { key: "woche", label: "Woche" },
  { key: "tag", label: "Tag" },
];

// Ab dieser Zellenbreite passt Text in einen Tagesstreifen. Darunter (iPhone)
// bleiben es reine Farbbalken — so zerfällt das Monatsraster nicht.
const ZELLE_BREIT_AB = 92;

export default function KalenderScreen({ navigation }) {
  const { profil, istHandwerker } = useAuth();

  const [baustellen, setBaustellen] = useState([]);
  const [termine, setTermine] = useState([]);
  const [baustellenLaedt, setBaustellenLaedt] = useState(true);
  const [termineLaedt, setTermineLaedt] = useState(true);
  const [fehler, setFehler] = useState("");

  const [ansicht, setAnsicht] = useState("monat");
  const [anker, setAnker] = useState(() => tagOhneZeit(new Date()));
  const [gitterBreite, setGitterBreite] = useState(0);

  // ------------------------------------------------------------- Daten
  useEffect(() => {
    // Ohne Profil (noch nicht geladen / kein Handwerker) gar nicht erst
    // abfragen — sonst bliebe die Ladeanzeige für immer stehen.
    if (!profil || !istHandwerker) {
      setBaustellenLaedt(false);
      setTermineLaedt(false);
      return;
    }
    const q = query(
      collection(db, "baustellen"),
      where("handwerkerId", "==", profil.id)
    );
    const stop = onSnapshot(
      q,
      (snap) => {
        setBaustellen(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setBaustellenLaedt(false);
      },
      (e) => {
        setFehler(fehlerText(e));
        setBaustellenLaedt(false);
      }
    );
    return stop;
  }, [profil, istHandwerker]);

  useEffect(() => {
    if (!profil || !istHandwerker) return;
    const q = query(
      collection(db, "termine"),
      where("handwerkerId", "==", profil.id)
    );
    const stop = onSnapshot(
      q,
      (snap) => {
        const liste = snap.docs.map((d) => {
          const daten = d.data();
          const start = zuDate(daten.start) || new Date();
          return {
            id: d.id,
            ...daten,
            _start: start,
            _ende: zuDate(daten.ende) || start,
          };
        });
        // Clientseitig sortieren — kein zusammengesetzter Index nötig.
        liste.sort((a, b) => a._start - b._start);
        setTermine(liste);
        setTermineLaedt(false);
      },
      (e) => {
        setFehler(fehlerText(e));
        setTermineLaedt(false);
      }
    );
    return stop;
  }, [profil, istHandwerker]);

  const heute = useMemo(() => tagOhneZeit(new Date()), []);

  // ------------------------------------------------------- Zeiträume
  // zeitraum = der fachlich angezeigte Bereich (Monat/Woche/Tag).
  // gitter   = der tatsächlich gezeichnete Bereich; im Monat reicht er in den
  //            Vor- und Folgemonat hinein, damit volle Wochen entstehen.
  const { von, bis, gitterVon, gitterBis } = useMemo(() => {
    if (ansicht === "tag") {
      const t = tagOhneZeit(anker);
      return { von: t, bis: t, gitterVon: t, gitterBis: t };
    }
    if (ansicht === "woche") {
      const start = montagDerWoche(anker);
      const ende = tagePlus(start, 6);
      return { von: start, bis: ende, gitterVon: start, gitterBis: ende };
    }
    const start = ersterDesMonats(anker);
    const ende = letzterDesMonats(anker);
    const gVon = montagDerWoche(start);
    const gBis = tagePlus(montagDerWoche(ende), 6);
    return { von: start, bis: ende, gitterVon: gVon, gitterBis: gBis };
  }, [ansicht, anker]);

  // Wochenzeilen des Monatsrasters
  const wochenZeilen = useMemo(() => {
    if (ansicht !== "monat") return [];
    const zeilen = [];
    let tag = new Date(gitterVon);
    while (tag <= gitterBis) {
      const woche = [];
      for (let i = 0; i < 7; i++) {
        woche.push(new Date(tag));
        tag = tagePlus(tag, 1);
      }
      zeilen.push(woche);
    }
    return zeilen;
  }, [ansicht, gitterVon, gitterBis]);

  // -------------------------------------------- Einträge je Kalendertag
  // Ein Eintrag ist entweder ein freier Termin oder ein Baustellen-Zeitraum.
  const eintraegeProTag = useMemo(() => {
    const karte = {};
    const schiebe = (tag, eintrag) => {
      const k = tagSchluessel(tag);
      if (!karte[k]) karte[k] = [];
      karte[k].push(eintrag);
    };

    for (const t of termine) {
      for (const tag of tageZwischen(t._start, t._ende, 90)) {
        if (tag < gitterVon || tag > gitterBis) continue;
        schiebe(tag, { typ: "termin", termin: t });
      }
    }

    for (const b of baustellen) {
      const start = zuDate(b.geplantStart);
      if (!start) continue;
      const ende = zuDate(b.geplantEnde) || start;
      for (const tag of tageZwischen(start, ende, 400)) {
        if (tag < gitterVon || tag > gitterBis) continue;
        schiebe(tag, { typ: "baustelle", baustelle: b });
      }
    }

    // Innerhalb eines Tages: Baustellen-Balken zuerst, dann ganztägige
    // Termine, dann die Termine nach Uhrzeit.
    for (const k of Object.keys(karte)) {
      karte[k].sort((a, b) => {
        if (a.typ !== b.typ) return a.typ === "baustelle" ? -1 : 1;
        if (a.typ === "baustelle") {
          return (a.baustelle.name || "").localeCompare(b.baustelle.name || "");
        }
        const ag = a.termin.ganztags ? 0 : 1;
        const bg = b.termin.ganztags ? 0 : 1;
        if (ag !== bg) return ag - bg;
        return a.termin._start - b.termin._start;
      });
    }
    return karte;
  }, [termine, baustellen, gitterVon, gitterBis]);

  function eintraegeAmTag(tag) {
    return eintraegeProTag[tagSchluessel(tag)] || [];
  }

  function termineAmTag(tag) {
    return eintraegeAmTag(tag)
      .filter((e) => e.typ === "termin")
      .map((e) => e.termin);
  }

  function baustellenAmTag(tag) {
    return eintraegeAmTag(tag)
      .filter((e) => e.typ === "baustelle")
      .map((e) => e.baustelle);
  }

  // ------------------------------------------------------- Kennzahlen
  const kennzahlen = useMemo(() => {
    let aktivHeute = 0;
    let ohneTermin = 0;
    for (const b of baustellen) {
      const start = zuDate(b.geplantStart);
      if (!start) {
        if (b.status !== "Abgeschlossen") ohneTermin += 1;
        continue;
      }
      const ende = tagOhneZeit(zuDate(b.geplantEnde) || start);
      const s = tagOhneZeit(start);
      if (s <= heute && heute <= ende && b.status !== "Abgeschlossen") {
        aktivHeute += 1;
      }
    }
    const imZeitraum = termine.filter(
      (t) => tagOhneZeit(t._start) <= bis && tagOhneZeit(t._ende) >= von
    ).length;
    return { aktivHeute, ohneTermin, imZeitraum };
  }, [baustellen, termine, heute, von, bis]);

  const zeitraumLabel =
    ansicht === "monat"
      ? "diesen Monat"
      : ansicht === "woche"
      ? "diese Woche"
      : "an diesem Tag";

  // ------------------------------------------------------- Navigation
  function verschieben(richtung) {
    setAnker((alt) => {
      const d = new Date(alt);
      if (ansicht === "monat") {
        // Tag festhalten, aber am Monatsende sauber begrenzen (31.03. -> 30.04.)
        const tagImMonat = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + richtung);
        const letzter = letzterDesMonats(d).getDate();
        d.setDate(Math.min(tagImMonat, letzter));
        return tagOhneZeit(d);
      }
      return tagOhneZeit(tagePlus(d, richtung * (ansicht === "woche" ? 7 : 1)));
    });
  }

  const titel =
    ansicht === "monat"
      ? monatJahr(anker)
      : ansicht === "woche"
      ? `${datumDe(von)} – ${datumDe(bis)}`
      : `${wochentagLang(anker)}, ${datumDe(anker)}`;

  function neuerTermin() {
    navigation.navigate("Termin", { vorgabeDatum: datumIso(anker) });
  }

  function terminOeffnen(t) {
    navigation.navigate("Termin", { terminId: t.id });
  }

  function anrufen(nummer) {
    if (!nummer) return;
    Linking.openURL("tel:" + String(nummer).replace(/\s/g, "")).catch(() => {});
  }

  // --------------------------------------------------------- Anzeige
  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="📅"
          titel="Nur für den Handwerker"
          text="Der Kalender ist dem Betriebsinhaber vorbehalten."
        />
      </SafeAreaView>
    );
  }

  if (baustellenLaedt || termineLaedt) {
    return <Ladeanzeige text="Kalender wird geladen …" />;
  }

  const zelleBreit = gitterBreite > 0 && gitterBreite / 7 >= ZELLE_BREIT_AB;

  // Ein Streifen im Monatsraster (Termin) bzw. ein umrandeter Balken
  // (Baustellen-Zeitraum) — bewusst unterschiedlich, damit man sie auf den
  // ersten Blick auseinanderhält.
  function streifen(eintrag, i) {
    if (eintrag.typ === "baustelle") {
      return (
        <View key={"b" + i} style={[styles.streifen, styles.streifenBaustelle, zelleBreit && styles.streifenBreit]}>
          {zelleBreit ? (
            <Text style={styles.streifenTextBaustelle} numberOfLines={1}>
              {eintrag.baustelle.name || "Baustelle läuft"}
            </Text>
          ) : null}
        </View>
      );
    }
    const art = artInfo(eintrag.termin.art);
    return (
      <View
        key={"t" + i}
        style={[
          styles.streifen,
          zelleBreit && styles.streifenBreit,
          { backgroundColor: art.farbe, opacity: eintrag.termin.erledigt ? 0.45 : 1 },
        ]}
      >
        {zelleBreit ? (
          <Text style={styles.streifenText} numberOfLines={1}>
            {eintrag.termin.ganztags ? "" : uhrzeitDe(eintrag.termin._start) + " "}
            {eintrag.termin.titel}
          </Text>
        ) : null}
      </View>
    );
  }

  function monatsRaster() {
    const maxStreifen = 3;
    return (
      <>
        <View style={styles.gitterKopf}>
          {WOCHENTAGE.map((t) => (
            <Text key={t} style={styles.gitterKopfText}>
              {t}
            </Text>
          ))}
        </View>
        <View onLayout={(e) => setGitterBreite(e.nativeEvent.layout.width)}>
          {wochenZeilen.map((woche, zi) => (
            <View key={zi} style={styles.gitterZeile}>
              {woche.map((tag) => {
                const eintraege = eintraegeAmTag(tag);
                const fremd = tag < von || tag > bis;
                const istHeute = tag.getTime() === heute.getTime();
                const rest = eintraege.length - maxStreifen;
                return (
                  <Pressable
                    key={tag.getTime()}
                    onPress={() => {
                      setAnker(tag);
                      setAnsicht("tag");
                    }}
                    style={({ pressed }) => [
                      styles.zelle,
                      fremd && styles.zelleFremd,
                      istHeute && styles.zelleHeute,
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.zelleZahl,
                        fremd && styles.zelleZahlFremd,
                        istHeute && styles.zelleZahlHeute,
                      ]}
                    >
                      {tag.getDate()}
                    </Text>
                    {eintraege.slice(0, maxStreifen).map(streifen)}
                    {rest > 0 ? <Text style={styles.mehr}>+{rest}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </>
    );
  }

  function wochenAnsicht() {
    const tage = tageZwischen(von, bis);

    // Baustellen, deren geplanter Zeitraum die Woche berührt — wie bisher als
    // Balken über die sieben Tage.
    const inWoche = [];
    for (const b of baustellen) {
      const start = zuDate(b.geplantStart);
      if (!start) continue;
      const s = tagOhneZeit(start);
      const e = tagOhneZeit(zuDate(b.geplantEnde) || start);
      if (s <= bis && e >= von) inWoche.push({ ...b, _s: s, _e: e });
    }
    inWoche.sort((a, b) => a._s - b._s);

    const tageMitTerminen = tage.filter((t) => termineAmTag(t).length > 0);

    return (
      <>
        <View style={styles.tageReihe}>
          {tage.map((tag, i) => {
            const istHeute = tag.getTime() === heute.getTime();
            return (
              <Pressable
                key={tag.getTime()}
                style={styles.tagKopfZelle}
                onPress={() => {
                  setAnker(tag);
                  setAnsicht("tag");
                }}
              >
                <Text style={[styles.tagLabel, istHeute && styles.tagHeute]}>
                  {WOCHENTAGE[i]}
                </Text>
                <Text style={[styles.tagZahl, istHeute && styles.tagHeute]}>
                  {tag.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.abschnitt}>Baustellen in dieser Woche</Text>
        {inWoche.length === 0 ? (
          <Text style={styles.hinweis}>
            Keine Baustelle mit geplantem Zeitraum in dieser Woche.
          </Text>
        ) : (
          inWoche.map((b) => (
            <Karte
              key={b.id}
              onPress={() =>
                navigation.navigate("BaustelleDetail", { baustelleId: b.id })
              }
              style={{ marginBottom: 12 }}
            >
              <View style={styles.bKopf}>
                <Text style={styles.bName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Statuspunkt status={b.status} />
              </View>
              <Text style={styles.bZeitraum}>
                Baustelle läuft: {datumDe(b._s)} – {datumDe(b._e)}
              </Text>
              <View style={styles.balkenReihe}>
                {tage.map((tag) => {
                  const aktiv = tag >= b._s && tag <= b._e;
                  return (
                    <View
                      key={tag.getTime()}
                      style={[styles.balkenSegment, aktiv && styles.balkenAktiv]}
                    />
                  );
                })}
              </View>
            </Karte>
          ))
        )}

        <Text style={styles.abschnitt}>Termine in dieser Woche</Text>
        {tageMitTerminen.length === 0 ? (
          <Text style={styles.hinweis}>
            Diese Woche sind keine Termine eingetragen.
          </Text>
        ) : (
          tageMitTerminen.map((tag) => (
            <View key={tag.getTime()} style={{ marginBottom: 6 }}>
              <Text style={styles.tagTrenner}>
                {wochentagLang(tag)}, {datumDe(tag)}
              </Text>
              {termineAmTag(tag).map((t) => terminKarte(t))}
            </View>
          ))
        )}
      </>
    );
  }

  function terminKarte(t) {
    const art = artInfo(t.art);
    const zeit = t.ganztags
      ? "Ganztägig"
      : `${uhrzeitDe(t._start)} – ${uhrzeitDe(t._ende)}`;
    return (
      <Karte
        key={t.id}
        onPress={() => terminOeffnen(t)}
        style={[styles.tKarte, t.erledigt && styles.gedimmt]}
      >
        <View style={styles.tReihe}>
          <View style={[styles.tFarbe, { backgroundColor: art.farbe }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tZeit}>{zeit}</Text>
            <Text style={styles.tTitel}>
              {t.erledigt ? "✓ " : ""}
              {t.titel}
            </Text>
            <Text style={styles.tArt}>
              {art.label}
              {t.baustelleName ? ` · ${t.baustelleName}` : ""}
            </Text>
            {t.kundeName ? (
              <Text style={styles.tKunde}>Kunde: {t.kundeName}</Text>
            ) : null}
            {t.kundeTelefon ? (
              <Pressable onPress={() => anrufen(t.kundeTelefon)} hitSlop={8}>
                <Text style={styles.tAnruf}>📞 {t.kundeTelefon}</Text>
              </Pressable>
            ) : null}
            {t.notiz ? <Text style={styles.tNotiz}>{t.notiz}</Text> : null}
          </View>
        </View>
      </Karte>
    );
  }

  function tagesAnsicht() {
    const alle = termineAmTag(anker);
    const ganztags = alle.filter((t) => t.ganztags);
    const mitZeit = alle.filter((t) => !t.ganztags);
    const laufende = baustellenAmTag(anker);

    return (
      <>
        {laufende.length > 0 ? (
          <>
            <Text style={styles.abschnitt}>Baustelle läuft</Text>
            {laufende.map((b) => (
              <Karte
                key={b.id}
                onPress={() =>
                  navigation.navigate("BaustelleDetail", { baustelleId: b.id })
                }
                style={[styles.tKarte, styles.baustelleKarte]}
              >
                <View style={styles.bKopf}>
                  <Text style={styles.bName} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Statuspunkt status={b.status} />
                </View>
                <Text style={styles.bZeitraum}>
                  {datumDe(b.geplantStart)}
                  {b.geplantEnde ? ` – ${datumDe(b.geplantEnde)}` : ""}
                </Text>
              </Karte>
            ))}
          </>
        ) : null}

        {ganztags.length > 0 ? (
          <>
            <Text style={styles.abschnitt}>Ganztägig</Text>
            {ganztags.map((t) => terminKarte(t))}
          </>
        ) : null}

        {mitZeit.length > 0 ? (
          <>
            <Text style={styles.abschnitt}>Termine</Text>
            {mitZeit.map((t) => terminKarte(t))}
          </>
        ) : null}

        {alle.length === 0 && laufende.length === 0 ? (
          <Leerzustand
            symbol="📅"
            titel="Nichts an diesem Tag"
            text="Legen Sie einen Termin an — er wird für diesen Tag vorbelegt."
            knopfTitel="+ Neuer Termin"
            onKnopf={neuerTermin}
          />
        ) : null}
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Fehlerkasten text={fehler} />

        <View style={styles.ansichtReihe}>
          {ANSICHTEN.map((a) => (
            <Pill
              key={a.key}
              text={a.label}
              aktiv={ansicht === a.key}
              onPress={() => setAnsicht(a.key)}
              style={{ marginRight: 8 }}
            />
          ))}
        </View>

        <View style={styles.kopf}>
          <Pressable onPress={() => verschieben(-1)} hitSlop={10}>
            <Text style={styles.pfeil}>‹</Text>
          </Pressable>
          <View style={styles.kopfMitte}>
            <Text style={styles.titelText} numberOfLines={1}>
              {titel}
            </Text>
            <Pressable onPress={() => setAnker(tagOhneZeit(new Date()))}>
              <Text style={styles.heuteLink}>Heute</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => verschieben(1)} hitSlop={10}>
            <Text style={styles.pfeil}>›</Text>
          </Pressable>
        </View>

        <View style={styles.zusammenfassung}>
          <View style={styles.zahlKarte}>
            <Text style={styles.zahl}>{kennzahlen.aktivHeute}</Text>
            <Text style={styles.zahlLabel}>aktiv heute</Text>
          </View>
          <View style={styles.zahlKarte}>
            <Text style={styles.zahl}>{kennzahlen.imZeitraum}</Text>
            <Text style={styles.zahlLabel}>{zeitraumLabel}</Text>
          </View>
          <View style={styles.zahlKarte}>
            <Text style={styles.zahl}>{kennzahlen.ohneTermin}</Text>
            <Text style={styles.zahlLabel}>ohne Termin</Text>
          </View>
        </View>

        {ansicht === "monat"
          ? monatsRaster()
          : ansicht === "woche"
          ? wochenAnsicht()
          : tagesAnsicht()}
      </ScrollView>

      <View style={styles.fussLeiste}>
        <Knopf titel="+ Neuer Termin" onPress={neuerTermin} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 32 },

  ansichtReihe: { flexDirection: "row", marginBottom: 16 },

  kopf: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  kopfMitte: { flex: 1, alignItems: "center" },
  pfeil: { ...schrift.head, fontSize: 30, color: farben.rot, paddingHorizontal: 14 },
  titelText: {
    ...schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  heuteLink: { ...schrift.bodyMed, fontSize: 12.5, color: farben.textMatt, marginTop: 4 },

  zusammenfassung: { flexDirection: "row", gap: 10, marginBottom: 18 },
  zahlKarte: {
    flex: 1,
    backgroundColor: farben.glas,
    borderWidth: 1,
    borderColor: farben.linie,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 4,
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

  // ------------------------------------------------------ Monatsraster
  gitterKopf: { flexDirection: "row", marginBottom: 6 },
  gitterKopfText: {
    flex: 1,
    textAlign: "center",
    ...schrift.headHalb,
    fontSize: 12,
    color: farben.textMatt,
    letterSpacing: 0.5,
  },
  gitterZeile: { flexDirection: "row" },
  zelle: {
    flex: 1,
    minHeight: 78,
    margin: 1.5,
    padding: 4,
    borderRadius: 10,
    backgroundColor: farben.glas,
    borderWidth: 1,
    borderColor: farben.linie,
    overflow: "hidden",
  },
  zelleFremd: { opacity: 0.4 },
  zelleHeute: { borderColor: farben.rot, borderWidth: 1.5 },
  zelleZahl: {
    ...schrift.headHalb,
    fontSize: 13,
    color: farben.textWeich,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  zelleZahlFremd: { color: farben.textMatt },
  zelleZahlHeute: { color: farben.rot },
  streifen: { height: 6, borderRadius: 3, marginBottom: 2, justifyContent: "center" },
  streifenBreit: { height: 15, paddingHorizontal: 4 },
  streifenBaustelle: {
    backgroundColor: "rgba(255,255,255,.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.32)",
  },
  streifenText: { ...schrift.body, fontSize: 10, color: farben.text },
  streifenTextBaustelle: { ...schrift.body, fontSize: 10, color: farben.textWeich },
  mehr: { ...schrift.body, fontSize: 10, color: farben.textMatt, marginTop: 1 },

  // ---------------------------------------------------- Wochenansicht
  tageReihe: { flexDirection: "row", marginBottom: 16 },
  tagKopfZelle: { flex: 1, alignItems: "center" },
  tagLabel: {
    ...schrift.headHalb,
    fontSize: 12,
    color: farben.textMatt,
    letterSpacing: 0.5,
  },
  tagZahl: { ...schrift.head, fontSize: 16, color: farben.textWeich, marginTop: 2 },
  tagHeute: { color: farben.rot },
  tagTrenner: {
    ...schrift.headHalb,
    fontSize: 13,
    color: farben.textWeich,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
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
    marginTop: 16,
    marginBottom: 12,
  },
  hinweis: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginBottom: 6 },

  bKopf: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  bName: { ...schrift.head, fontSize: groessen.h3, color: farben.text, letterSpacing: 0.5, flex: 1 },
  bZeitraum: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6 },

  // ------------------------------------------------------- Terminkarte
  tKarte: { marginBottom: 12, padding: 16 },
  baustelleKarte: { borderColor: "rgba(255,255,255,.32)" },
  gedimmt: { opacity: 0.55 },
  tReihe: { flexDirection: "row", gap: 12 },
  tFarbe: { width: 5, borderRadius: radius.pille, alignSelf: "stretch" },
  tZeit: { ...schrift.headHalb, fontSize: 13, color: farben.textWeich, letterSpacing: 0.5 },
  tTitel: { ...schrift.head, fontSize: 18, color: farben.text, letterSpacing: 0.5, marginTop: 2 },
  tArt: { ...schrift.body, fontSize: 12.5, color: farben.textMatt, marginTop: 4 },
  tKunde: { ...schrift.body, fontSize: 13, color: farben.textWeich, marginTop: 6 },
  tAnruf: { ...schrift.bodyMed, fontSize: 14, color: farben.rotHell, marginTop: 4 },
  tNotiz: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6, lineHeight: 19 },

  fussLeiste: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: farben.linie,
    backgroundColor: farben.bg,
  },
});
