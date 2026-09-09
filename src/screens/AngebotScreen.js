// ---------------------------------------------------------------------------
// AngebotScreen.js — Angebote wie von einem Meisterbetrieb.
//
// Der Weg, für den das gebaut ist: Auf der Baustelle stehen, Maße eintippen,
// Vorlage wählen — und es liegt ein vollständiges Angebot vor, mit Positionen,
// Langtexten, DIN-Verweisen und Konditionen. Was danach bleibt, ist Feinarbeit
// an einzelnen Mengen, nicht das Schreiben von zwanzig Positionen.
//
// Der Katalog (37 Leistungen, 5 Gewerke) stammt unverändert aus dem
// Angebotswerkzeug des Betriebs; gepflegt wird er weiter dort.
//
// Der alte Weg — ein fertiges PDF hochladen — bleibt erhalten. Für Angebote,
// die anderswo entstanden sind, ist er weiterhin der kürzeste.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {
  collection,
  doc,
  onSnapshot,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { ladeDateiHoch } from "../cloudinary";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, radius, textStil } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Feld from "../components/Feld";
import Pill from "../components/Pill";
import Ladeanzeige from "../components/Ladeanzeige";
import Leerzustand from "../components/Leerzustand";
import fehlerText from "../util/fehler";
import { datumDe } from "../util/format";
import { centAus, euroAusCent } from "../util/nachtrag";
import {
  GEWERKE,
  LEISTUNGEN,
  MASSE_FELDER,
  KONDITIONEN_STANDARD,
  vorlageAnwenden,
  summeRechnen,
  naechsteNummer,
  gueltigBis,
  angebotHtml,
  gewerkZu,
} from "../util/angebot";

const STATUS = ["Entwurf", "Gesendet", "Angenommen", "Abgelehnt"];

export default function AngebotScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { istHandwerker, profil } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [angebot, setAngebot] = useState(null);
  const [baustelle, setBaustelle] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [arbeitet, setArbeitet] = useState(false);
  const [hochladen, setHochladen] = useState(false);

  // Vorlagen-Assistent
  const [gewerk, setGewerk] = useState(null);
  const [masse, setMasse] = useState({});

  // Positionsbearbeitung
  const [bearbeiteIndex, setBearbeiteIndex] = useState(null);
  const [posForm, setPosForm] = useState({ menge: "", preis: "" });
  const [katalogOffen, setKatalogOffen] = useState(false);
  const [altwegOffen, setAltwegOffen] = useState(false);

  useEffect(() => {
    const stops = [
      onSnapshot(
        doc(db, "baustellen", baustelleId, "angebot", "aktuell"),
        (s) => {
          setAngebot(s.exists() ? s.data() : null);
          setLaedt(false);
        },
        () => setLaedt(false)
      ),
      onSnapshot(
        doc(db, "baustellen", baustelleId),
        (s) => setBaustelle(s.exists() ? { id: s.id, ...s.data() } : null),
        () => {}
      ),
    ];
    return () => stops.forEach((f) => f());
  }, [baustelleId]);

  const positionen = angebot?.positionen || [];
  const summe = useMemo(() => summeRechnen(positionen), [positionen]);
  const konditionen = angebot?.konditionen || KONDITIONEN_STANDARD;

  async function speichern(felder) {
    const s = summeRechnen(felder.positionen ?? positionen);
    await setDoc(
      doc(db, "baustellen", baustelleId, "angebot", "aktuell"),
      {
        ...angebot,
        ...felder,
        nettoCent: s.nettoCent,
        ustCent: s.ustCent,
        bruttoCent: s.bruttoCent,
        // Das alte Feld bleibt gefüllt: Baustellenliste und Kalkulation lesen
        // es noch, und ein stiller Bruch dort wäre schlimmer als eine
        // doppelte Angabe.
        betrag: s.bruttoCent / 100,
        aktualisiertAm: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // ------------------------------------------------------- Vorlage anwenden
  async function vorlageErzeugen() {
    const g = gewerkZu(gewerk);
    if (!g) return;
    const zahlen = {};
    for (const f of MASSE_FELDER) zahlen[f.key] = masse[f.key] || 0;
    const neue = vorlageAnwenden(gewerk, zahlen);
    if (neue.length === 0) {
      Alert.alert(
        "Keine Positionen",
        "Mit diesen Maßen ergibt sich keine einzige Position. Bitte mindestens eine Fläche eintragen."
      );
      return;
    }

    setArbeitet(true);
    try {
      // Nummernkreis über alle Baustellen — deshalb einmal alle Angebote
      // ansehen. Bei der Menge eines Solobetriebs ist das ein Wimpernschlag.
      let nummer = angebot?.nummer;
      if (!nummer) {
        const bekannte = [];
        const alle = await getDocs(collection(db, "baustellen"));
        for (const b of alle.docs) {
          const a = b.data();
          if (a.angebotNummer) bekannte.push(a.angebotNummer);
        }
        nummer = naechsteNummer(bekannte);
      }

      await speichern({
        nummer,
        betreff: g.betreff,
        gewerk,
        masse: zahlen,
        positionen: neue,
        ustSatz: 19,
        datum: Timestamp.fromDate(new Date()),
        gueltigBis: Timestamp.fromDate(gueltigBis(new Date())),
        status: angebot?.status || "Entwurf",
        erstelltVon: profil?.id || null,
      });
      // Die Nummer auch auf die Baustelle, damit der nächste Nummernkreis sie
      // findet, ohne jedes Angebot einzeln zu laden.
      await updateDoc(doc(db, "baustellen", baustelleId), { angebotNummer: nummer }).catch(() => {});
      setGewerk(null);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setArbeitet(false);
    }
  }

  // ---------------------------------------------------------- Positionen
  function bearbeiten(i) {
    const p = positionen[i];
    setBearbeiteIndex(i);
    setPosForm({
      menge: String(p.menge).replace(".", ","),
      preis: ((p.einzelpreisCent || 0) / 100).toFixed(2).replace(".", ","),
    });
  }

  async function positionSpeichern() {
    const preis = centAus(posForm.preis);
    const neue = positionen.map((p, i) =>
      i === bearbeiteIndex
        ? { ...p, menge: parseFloat(String(posForm.menge).replace(",", ".")) || 0,
            einzelpreisCent: preis == null ? p.einzelpreisCent : preis }
        : p
    );
    try {
      await speichern({ positionen: neue });
      setBearbeiteIndex(null);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function positionEntfernen(i) {
    try {
      await speichern({ positionen: positionen.filter((_, x) => x !== i) });
      setBearbeiteIndex(null);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function ausKatalog(l) {
    const neue = [
      ...positionen,
      {
        schluessel: l.schluessel,
        kurztext: l.kurztext,
        langtext: l.langtext,
        einheit: l.einheit,
        menge: 1,
        einzelpreisCent: l.preisCent,
      },
    ];
    try {
      await speichern({ positionen: neue });
      setKatalogOffen(false);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function statusSetzen(neu) {
    try {
      await speichern({ status: neu });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  // ------------------------------------------------------------- Ausdruck
  function pdfErzeugen() {
    const html = angebotHtml({
      angebot: {
        ...angebot,
        datum: angebot?.datum,
        gueltigBis: angebot?.gueltigBis,
      },
      baustelle,
      positionen,
      konditionen,
      erstelltAm: new Date(),
    });

    if (Platform.OS !== "web") {
      Alert.alert(
        "Am Rechner erzeugen",
        "Das Angebot als PDF gibt es in der Browser-Fassung von WerkBuch — dort übernimmt der Browser das Speichern."
      );
      return;
    }
    const fenster = window.open("", "_blank");
    if (!fenster) {
      Alert.alert("Fenster wurde blockiert",
        "Bitte erlauben Sie für diese Seite Pop-up-Fenster und versuchen Sie es erneut.");
      return;
    }
    fenster.document.open();
    fenster.document.write(html);
    fenster.document.close();
  }

  // ------------------------------------------------------- fertiges PDF
  async function pdfWaehlen() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"], multiple: false, copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const datei = res.assets[0];
      if (datei.size && datei.size > 9.5 * 1024 * 1024) {
        Alert.alert("PDF zu groß",
          `Die Datei ist ${(datei.size / 1024 / 1024).toFixed(1)} MB groß. Maximal möglich sind 10 MB.`);
        return;
      }
      setHochladen(true);
      const { url, publicId, seiten } = await ladeDateiHoch(datei.uri, {
        typ: "pdf", dateiname: datei.name,
      });
      await speichern({
        pdfUrl: url, pdfPfad: publicId, seiten: seiten || 1,
        dateiname: datei.name, status: angebot?.status || "Gesendet",
      });
    } catch (e) {
      Alert.alert("Upload fehlgeschlagen", e?.message || fehlerText(e));
    } finally {
      setHochladen(false);
    }
  }

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand symbol="🔒" titel="Nur für den Betriebsinhaber"
          text="Angebote enthalten Preise und werden nur vom Inhaber erstellt." />
      </SafeAreaView>
    );
  }
  if (laedt) return <Ladeanzeige text="Angebot wird geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ---------------------------------------------- Kopf */}
          {angebot?.nummer ? (
            <View style={styles.kopf}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nummer}>{angebot.nummer}</Text>
                <Text style={styles.betreff}>{angebot.betreff}</Text>
                <Text style={styles.datum}>
                  {datumDe(angebot.datum)} · gültig bis {datumDe(angebot.gueltigBis)}
                </Text>
              </View>
            </View>
          ) : null}

          {/* ------------------------------ Vorlagen-Assistent */}
          {positionen.length === 0 ? (
            <Karte>
              <Text style={textStil.h3}>Angebot in Minuten</Text>
              <Text style={[textStil.klein, { marginTop: 6, marginBottom: 18 }]}>
                Gewerk wählen, Maße eintragen — die Positionen samt Langtexten und
                DIN-Verweisen entstehen daraus von selbst. Preise und Mengen lassen
                sich danach einzeln anpassen.
              </Text>

              <Text style={styles.label}>Gewerk</Text>
              <View style={styles.chips}>
                {GEWERKE.map((g) => (
                  <Pill key={g.schluessel} text={g.bezeichnung} aktiv={gewerk === g.schluessel}
                    onPress={() => setGewerk(g.schluessel)}
                    style={{ marginRight: 8, marginBottom: 8 }} />
                ))}
              </View>

              {gewerk ? (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>Maße</Text>
                  <Text style={[textStil.klein, { marginBottom: 12 }]}>
                    Was nicht vorkommt, bleibt leer — Positionen ohne Menge fallen weg.
                  </Text>
                  {MASSE_FELDER.map((f) => (
                    <Feld
                      key={f.key}
                      label={`${f.label} (${f.einheit})`}
                      wert={masse[f.key] != null ? String(masse[f.key]) : ""}
                      onChangeText={(t) => setMasse({ ...masse, [f.key]: t })}
                      keyboardType="decimal-pad"
                      platzhalter="0"
                    />
                  ))}
                  <Knopf titel="Positionen erzeugen" onPress={vorlageErzeugen} laedt={arbeitet} />
                </>
              ) : null}
            </Karte>
          ) : null}

          {/* ---------------------------------------- Positionen */}
          {positionen.length > 0 ? (
            <>
              <Text style={styles.abschnitt}>
                {positionen.length} {positionen.length === 1 ? "Position" : "Positionen"}
              </Text>

              {positionen.map((p, i) => (
                <Karte key={`${p.schluessel}-${i}`} style={styles.pos}>
                  {bearbeiteIndex === i ? (
                    <>
                      <Text style={styles.posTitel}>{p.kurztext}</Text>
                      <View style={styles.reihe}>
                        <View style={{ flex: 1 }}>
                          <Feld label={`Menge (${p.einheit})`} wert={posForm.menge}
                            keyboardType="decimal-pad"
                            onChangeText={(t) => setPosForm({ ...posForm, menge: t })} />
                        </View>
                        <View style={{ flex: 1.2 }}>
                          <Feld label="Einzelpreis netto" wert={posForm.preis}
                            keyboardType="decimal-pad"
                            onChangeText={(t) => setPosForm({ ...posForm, preis: t })} />
                        </View>
                      </View>
                      <Knopf titel="Übernehmen" onPress={positionSpeichern} />
                      <View style={styles.reihe}>
                        <Knopf titel="Abbrechen" variante="ghost"
                          onPress={() => setBearbeiteIndex(null)} style={{ flex: 1, marginTop: 8 }} />
                        <Knopf titel="Entfernen" variante="ghost"
                          onPress={() => positionEntfernen(i)} style={{ flex: 1, marginTop: 8 }} />
                      </View>
                    </>
                  ) : (
                    <Pressable onPress={() => bearbeiten(i)}>
                      <View style={styles.posKopf}>
                        <Text style={styles.posNr}>{i + 1}</Text>
                        <Text style={styles.posTitel}>{p.kurztext}</Text>
                      </View>
                      {p.langtext ? (
                        <Text style={styles.posLang} numberOfLines={3}>{p.langtext}</Text>
                      ) : null}
                      <View style={styles.posFuss}>
                        <Text style={styles.posMenge}>
                          {String(p.menge).replace(".", ",")} {p.einheit} ×{" "}
                          {euroAusCent(p.einzelpreisCent)}
                        </Text>
                        <Text style={styles.posSumme}>
                          {euroAusCent(Math.round(p.menge * p.einzelpreisCent))}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                </Karte>
              ))}

              {/* Katalog */}
              {katalogOffen ? (
                <Karte style={{ marginBottom: 12 }}>
                  <Text style={styles.label}>Position aus dem Katalog</Text>
                  {LEISTUNGEN.map((l) => (
                    <Pressable key={l.schluessel} onPress={() => ausKatalog(l)} style={styles.katalogZeile}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.katalogTitel}>{l.kurztext}</Text>
                        <Text style={styles.katalogPreis}>
                          {euroAusCent(l.preisCent)} je {l.einheit}
                        </Text>
                      </View>
                      <Text style={styles.ePfeil}>＋</Text>
                    </Pressable>
                  ))}
                  <Knopf titel="Schließen" variante="ghost" onPress={() => setKatalogOffen(false)} />
                </Karte>
              ) : (
                <Knopf titel="Position hinzufügen" variante="sekundaer"
                  onPress={() => setKatalogOffen(true)} style={{ marginBottom: 18 }} />
              )}

              {/* Summen */}
              <Karte style={styles.summenKarte}>
                <View style={styles.sZeile}>
                  <Text style={styles.sLabel}>Summe netto</Text>
                  <Text style={styles.sWert}>{euroAusCent(summe.nettoCent)}</Text>
                </View>
                <View style={styles.sZeile}>
                  <Text style={styles.sLabel}>zzgl. {summe.ustSatz} % Umsatzsteuer</Text>
                  <Text style={styles.sWert}>{euroAusCent(summe.ustCent)}</Text>
                </View>
                <View style={[styles.sZeile, styles.sGesamt]}>
                  <Text style={styles.sLabelGross}>Gesamtbetrag</Text>
                  <Text style={styles.sWertGross}>{euroAusCent(summe.bruttoCent)}</Text>
                </View>
              </Karte>

              <Knopf titel="Angebot als PDF" onPress={pdfErzeugen} style={{ marginTop: 18 }} />

              <Text style={styles.label2}>Stand</Text>
              <View style={styles.chips}>
                {STATUS.map((s) => (
                  <Pill key={s} text={s} aktiv={angebot?.status === s}
                    onPress={() => statusSetzen(s)}
                    style={{ marginRight: 8, marginBottom: 8 }} />
                ))}
              </View>

              {/* Konditionen */}
              <Text style={styles.abschnitt}>Konditionen</Text>
              <Karte>
                {konditionen.map((k) => (
                  <View key={k.key} style={styles.kond}>
                    <Text style={styles.kondTitel}>{k.titel}</Text>
                    <Text style={styles.kondText}>{k.text}</Text>
                  </View>
                ))}
                <Text style={styles.kondHinweis}>
                  Diese Bausteine stehen so in jedem Angebot. Sie ändern sie in
                  src/util/angebot.js an einer Stelle — dann gelten sie überall.
                </Text>
              </Karte>
            </>
          ) : null}

          {/* ---------------------------------- fertiges PDF (Altweg) */}
          <Pressable onPress={() => setAltwegOffen((o) => !o)}>
            <Text style={styles.altweg}>
              {altwegOffen ? "▾" : "▸"} Stattdessen ein fertiges PDF hochladen
            </Text>
          </Pressable>
          {altwegOffen ? (
            <Karte>
              <Text style={textStil.klein}>
                Für Angebote, die anderswo entstanden sind. Sie erscheinen dann hier mit
                Datei und Stand, ohne Positionen.
              </Text>
              {hochladen ? (
                <View style={styles.ladeReihe}>
                  <ActivityIndicator color={farben.rot} />
                  <Text style={styles.ladeText}>PDF wird hochgeladen …</Text>
                </View>
              ) : (
                <Knopf titel={angebot?.pdfUrl ? "Neues PDF hochladen" : "PDF hochladen"}
                  variante="sekundaer" onPress={pdfWaehlen} style={{ marginTop: 14 }} />
              )}
              {angebot?.dateiname ? (
                <Text style={styles.dateiname}>
                  Zuletzt: {angebot.dateiname} · {datumDe(angebot.aktualisiertAm)}
                </Text>
              ) : null}
            </Karte>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 16, paddingBottom: 56 },

  kopf: { marginBottom: 18 },
  nummer: { ...schrift.head, fontSize: 15, color: farben.rot, letterSpacing: 1.5 },
  betreff: { ...schrift.head, fontSize: 23, color: farben.text, letterSpacing: 0.5, marginTop: 4 },
  datum: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6 },

  label: {
    ...schrift.headHalb, fontSize: groessen.klein, color: farben.textWeich,
    letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10,
  },
  label2: {
    ...schrift.headHalb, fontSize: groessen.klein, color: farben.textWeich,
    letterSpacing: 0.5, textTransform: "uppercase", marginTop: 24, marginBottom: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  reihe: { flexDirection: "row", gap: 12 },

  abschnitt: {
    ...schrift.head, fontSize: 20, color: farben.text,
    letterSpacing: 0.5, marginTop: 26, marginBottom: 12,
  },
  pos: { marginBottom: 10, padding: 16 },
  posKopf: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  posNr: { ...schrift.head, fontSize: 14, color: farben.textMatt, minWidth: 20 },
  posTitel: { ...schrift.headHalb, fontSize: 17, color: farben.text, flex: 1, letterSpacing: 0.3 },
  posLang: { ...schrift.body, fontSize: 12, color: farben.textMatt, lineHeight: 18, marginTop: 8 },
  posFuss: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-end", marginTop: 12, gap: 12,
  },
  posMenge: { ...schrift.body, fontSize: 13, color: farben.textWeich, flex: 1 },
  posSumme: { ...schrift.head, fontSize: 18, color: farben.text },

  katalogZeile: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: farben.linie,
  },
  katalogTitel: { ...schrift.bodyMed, fontSize: 15, color: farben.text },
  katalogPreis: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 2 },
  ePfeil: { ...schrift.head, fontSize: 20, color: farben.rot },

  summenKarte: { paddingVertical: 18 },
  sZeile: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7, gap: 12 },
  sGesamt: {
    marginTop: 10, paddingTop: 13, borderTopWidth: 1,
    borderTopColor: farben.linie, marginBottom: 0,
  },
  sLabel: { ...schrift.body, fontSize: 14, color: farben.textMatt },
  sWert: { ...schrift.bodyMed, fontSize: 14, color: farben.textWeich },
  sLabelGross: { ...schrift.headHalb, fontSize: 17, color: farben.text, letterSpacing: 0.5 },
  sWertGross: { ...schrift.head, fontSize: 26, color: farben.text },

  kond: { marginBottom: 14 },
  kondTitel: { ...schrift.headHalb, fontSize: 14, color: farben.text, letterSpacing: 0.3 },
  kondText: { ...schrift.body, fontSize: 12.5, color: farben.textWeich, lineHeight: 20, marginTop: 4 },
  kondHinweis: {
    ...schrift.body, fontSize: 11, color: farben.textMatt, lineHeight: 17,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: farben.linie,
  },

  altweg: { ...schrift.bodyMed, fontSize: 14, color: farben.textMatt, marginTop: 34, marginBottom: 12 },
  ladeReihe: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  ladeText: { ...schrift.body, fontSize: 14, color: farben.textWeich },
  dateiname: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 12 },
});
