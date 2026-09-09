// ---------------------------------------------------------------------------
// NachtragScreen.js — ein einzelner Nachtrag: bearbeiten, Fotos anhängen,
// Freigabe-Link erzeugen, Entscheidung des Kunden sehen.
//
// Der Ablauf, um den es geht:
//
//   1. Inhaber schreibt auf, was dazukommt, und was es kostet.
//   2. Er erzeugt einen Link. In diesem Moment wird der gezeigte Stand
//      EINGEFROREN — Text, Menge, Preis, Fotos — und mit einer Prüfsumme
//      versehen.
//   3. Der Kunde öffnet den Link (kein Login, keine App) und entscheidet.
//   4. Seine Entscheidung wird unveränderlich abgelegt: Serverzeitpunkt,
//      Ergebnis und der Text, den er wörtlich vor sich hatte.
//
// Warum der Stand eingefroren wird: Wäre er nachträglich änderbar, könnte man
// nach der Freigabe den Preis hochsetzen und behaupten, der Kunde habe das so
// freigegeben. Der Nachweis wäre wertlos — und zwar genau dann, wenn man ihn
// braucht. Die Firestore-Regeln setzen das durch, nicht dieser Bildschirm.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Platform,
  Share,
  Linking,
  ActivityIndicator,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
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
import fehlerText from "../util/fehler";
import { datumZeitDe } from "../util/format";
import {
  EINHEITEN,
  UST_SATZ,
  centAus,
  euroAusCent,
  rechne,
  statusLabel,
  schluesselErzeugen,
  anzeigeAus,
  wortlaut,
  abdruck,
  gueltigBis,
  freigabeAdresse,
} from "../util/nachtrag";

export default function NachtragScreen({ route, navigation }) {
  const { baustelleId, nachtragId } = route.params || {};
  const { istHandwerker } = useAuth();

  useEffect(() => {
    if (!baustelleId || !nachtragId) navigation.replace("Baustellen");
  }, [baustelleId, nachtragId]);
  if (!baustelleId || !nachtragId) return null;

  const [nachtrag, setNachtrag] = useState(null);
  const [baustelle, setBaustelle] = useState(null);
  const [entscheidung, setEntscheidung] = useState(null);
  const [link, setLink] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [arbeitet, setArbeitet] = useState(false);
  const [hochladen, setHochladen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [form, setForm] = useState(null);

  const pfad = ["baustellen", baustelleId, "nachtraege", nachtragId];

  // ------------------------------------------------------------ Laden
  useEffect(() => {
    const stop = onSnapshot(
      doc(db, ...pfad),
      (snap) => {
        if (!snap.exists()) {
          navigation.goBack();
          return;
        }
        const d = { id: snap.id, ...snap.data() };
        setNachtrag(d);
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId, nachtragId]);

  useEffect(() => {
    getDoc(doc(db, "baustellen", baustelleId))
      .then((s) => setBaustelle(s.exists() ? { id: s.id, ...s.data() } : null))
      .catch(() => {});
  }, [baustelleId]);

  // Die Entscheidung des Kunden liegt in einer eigenen, top-level Sammlung —
  // unveränderlich, auch für uns. Wir hören nur zu.
  useEffect(() => {
    const schluessel = nachtrag?.freigabeSchluessel;
    if (!schluessel) {
      setEntscheidung(null);
      setLink(null);
      return;
    }
    const stopE = onSnapshot(
      doc(db, "freigabeEntscheidungen", schluessel),
      (s) => setEntscheidung(s.exists() ? s.data() : null),
      () => {}
    );
    const stopL = onSnapshot(
      doc(db, "freigabeLinks", schluessel),
      (s) => setLink(s.exists() ? s.data() : null),
      () => {}
    );
    return () => {
      stopE();
      stopL();
    };
  }, [nachtrag?.freigabeSchluessel]);

  // Kommt eine Entscheidung herein, wird der Stand des Nachtrags nachgezogen.
  // Der Beweis ist die Entscheidung selbst — dieses Feld ist nur der
  // Arbeitsstand für die Listen und die Auftragssumme.
  useEffect(() => {
    if (!entscheidung || !nachtrag) return;
    if (nachtrag.status === "freigegeben" || nachtrag.status === "abgelehnt" ||
        nachtrag.status === "abgerechnet") return;
    updateDoc(doc(db, ...pfad), {
      status: entscheidung.ergebnis,
      entschiedenAm: entscheidung.zeitpunkt || serverTimestamp(),
      aktualisiertAm: serverTimestamp(),
    }).catch(() => {});
  }, [entscheidung, nachtrag?.status]);

  const gesperrt = nachtrag && nachtrag.status !== "offen";

  const vorschau = useMemo(() => {
    if (!form) return null;
    return rechne({ menge: form.menge, einzelpreisCent: centAus(form.einzelpreis) || 0 });
  }, [form]);

  function bearbeitenStarten() {
    setForm({
      titel: nachtrag.titel || "",
      beschreibung: nachtrag.beschreibung || "",
      menge: String(nachtrag.menge ?? 1).replace(".", ","),
      einheit: nachtrag.einheit || "pauschal",
      einzelpreis: ((nachtrag.einzelpreisCent || 0) / 100).toFixed(2).replace(".", ","),
    });
    setBearbeiten(true);
  }

  async function speichern() {
    const preis = centAus(form.einzelpreis);
    if (!form.titel.trim() || preis == null) {
      Alert.alert("Unvollständig", "Titel und Einzelpreis werden gebraucht.");
      return;
    }
    const r = rechne({ menge: form.menge, einzelpreisCent: preis });
    setArbeitet(true);
    try {
      await updateDoc(doc(db, ...pfad), {
        titel: form.titel.trim(),
        beschreibung: form.beschreibung.trim(),
        menge: r.menge,
        einheit: form.einheit,
        einzelpreisCent: r.einzelpreisCent,
        nettoCent: r.nettoCent,
        ustSatz: r.ustSatz,
        ustCent: r.ustCent,
        bruttoCent: r.bruttoCent,
        aktualisiertAm: serverTimestamp(),
      });
      setBearbeiten(false);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setArbeitet(false);
    }
  }

  // ------------------------------------------------------------- Fotos
  async function fotoHinzufuegen() {
    try {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) {
        Alert.alert("Kein Zugriff", "Bitte erlauben Sie den Fotozugriff in den Einstellungen.");
        return;
      }
      const erg = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
      if (erg.canceled || !erg.assets?.length) return;

      setHochladen(true);
      const bearbeitet = await ImageManipulator.manipulateAsync(
        erg.assets[0].uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const { url } = await ladeDateiHoch(bearbeitet.uri, {
        typ: "image",
        dateiname: `nachtrag_${nachtragId}_${Date.now()}.jpg`,
        base64: bearbeitet.base64,
      });
      await updateDoc(doc(db, ...pfad), {
        fotos: [...(nachtrag.fotos || []), url],
        aktualisiertAm: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Fehler", e?.message || fehlerText(e));
    } finally {
      setHochladen(false);
    }
  }

  async function fotoEntfernen(url) {
    try {
      await updateDoc(doc(db, ...pfad), {
        fotos: (nachtrag.fotos || []).filter((f) => f !== url),
        aktualisiertAm: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  // ------------------------------------------------------ Freigabe-Link
  async function linkErzeugen() {
    setArbeitet(true);
    try {
      const schluessel = schluesselErzeugen();
      const anzeige = anzeigeAus({
        betrieb: "Berisa Bau",
        baustelleName: baustelle?.name || "",
        kundeName: baustelle?.kundeName || "",
        nachtrag,
        fotos: nachtrag.fotos || [],
      });

      await setDoc(doc(db, "freigabeLinks", schluessel), {
        handwerkerId: baustelle?.handwerkerId || null,
        baustelleId,
        nachtragId,
        anzeige,
        // Der Wortlaut wird MITGESPEICHERT, nicht nur der Verweis auf eine
        // Vorlage. Ändert sich die Vorlage später, bleibt dieser Beleg, wie er
        // war.
        wortlaut: wortlaut(anzeige),
        abdruck: abdruck(anzeige),
        gueltigBis: Timestamp.fromDate(gueltigBis(new Date(), 30)),
        widerrufen: false,
        erstelltAm: serverTimestamp(),
      });

      await updateDoc(doc(db, ...pfad), {
        status: "gesendet",
        freigabeSchluessel: schluessel,
        gesendetAm: serverTimestamp(),
        aktualisiertAm: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Der Link konnte nicht erzeugt werden", e?.message || fehlerText(e));
    } finally {
      setArbeitet(false);
    }
  }

  async function linkZurueckziehen() {
    Alert.alert(
      "Link zurückziehen?",
      "Der Kunde kann den Nachtrag danach nicht mehr öffnen. Eine bereits erteilte Freigabe bleibt bestehen.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Zurückziehen",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "freigabeLinks", nachtrag.freigabeSchluessel), {
                widerrufen: true,
                widerrufenAm: serverTimestamp(),
              });
              if (nachtrag.status === "gesendet") {
                await updateDoc(doc(db, ...pfad), { status: "offen", aktualisiertAm: serverTimestamp() });
              }
            } catch (e) {
              Alert.alert("Fehler", fehlerText(e));
            }
          },
        },
      ]
    );
  }

  const adresse = nachtrag?.freigabeSchluessel ? freigabeAdresse(nachtrag.freigabeSchluessel) : null;

  const nachricht = adresse
    ? `Hallo${baustelle?.kundeName ? " " + baustelle.kundeName : ""}, ` +
      `auf der Baustelle ist etwas dazugekommen: ${nachtrag?.titel}. ` +
      `Gesamtbetrag ${euroAusCent(nachtrag?.bruttoCent)} brutto. ` +
      `Hier können Sie es ansehen und freigeben: ${adresse}`
    : "";

  async function teilen() {
    try {
      if (Platform.OS === "web") {
        if (navigator?.share) {
          await navigator.share({ text: nachricht });
          return;
        }
        await navigator.clipboard.writeText(nachricht);
        Alert.alert("Kopiert", "Die Nachricht liegt in der Zwischenablage — jetzt in WhatsApp einfügen.");
        return;
      }
      await Share.share({ message: nachricht });
    } catch (e) {
      // Abbrechen durch den Nutzer ist kein Fehler.
    }
  }

  function perWhatsApp() {
    Linking.openURL("https://wa.me/?text=" + encodeURIComponent(nachricht)).catch(() =>
      Alert.alert("WhatsApp nicht erreichbar", "Bitte den Link von Hand kopieren.")
    );
  }

  async function alsAbgerechnet() {
    try {
      await updateDoc(doc(db, ...pfad), { status: "abgerechnet", aktualisiertAm: serverTimestamp() });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function loeschen() {
    Alert.alert("Nachtrag löschen?", `${nachtrag.nummer} · ${nachtrag.titel}`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Löschen",
        style: "destructive",
        onPress: async () => {
          try {
            // Der Freigabe-Link wird mitgelöscht, die ENTSCHEIDUNG nicht —
            // die ist unveränderlich und bleibt als Beleg bestehen.
            if (nachtrag.freigabeSchluessel) {
              await deleteDoc(doc(db, "freigabeLinks", nachtrag.freigabeSchluessel)).catch(() => {});
            }
            await deleteDoc(doc(db, ...pfad));
            navigation.goBack();
          } catch (e) {
            Alert.alert("Fehler", fehlerText(e));
          }
        },
      },
    ]);
  }

  if (!istHandwerker) return <Ladeanzeige text="Kein Zugriff." />;
  if (laedt || !nachtrag) return <Ladeanzeige text="Nachtrag wird geladen …" />;

  const r = rechne(nachtrag);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Kopf */}
        <View style={styles.kopf}>
          <Text style={styles.nummer}>{nachtrag.nummer}</Text>
          <Pill text={statusLabel(nachtrag.status)} aktiv={nachtrag.status === "freigegeben"} />
        </View>

        {bearbeiten ? (
          <Karte>
            <Feld label="Was kommt dazu?" wert={form.titel}
                  onChangeText={(t) => setForm({ ...form, titel: t })} />
            <Feld label="Warum (optional)" wert={form.beschreibung}
                  onChangeText={(t) => setForm({ ...form, beschreibung: t })}
                  multiline style={{ minHeight: 90, textAlignVertical: "top" }} />
            <Text style={styles.label}>Einheit</Text>
            <View style={styles.chips}>
              {EINHEITEN.map((e) => (
                <Pill key={e} text={e} aktiv={form.einheit === e}
                      onPress={() => setForm({ ...form, einheit: e })}
                      style={{ marginRight: 8, marginBottom: 8 }} />
              ))}
            </View>
            <View style={styles.reihe}>
              <View style={{ flex: 1 }}>
                <Feld label="Menge" wert={form.menge} keyboardType="decimal-pad"
                      onChangeText={(t) => setForm({ ...form, menge: t })} />
              </View>
              <View style={{ flex: 1.4 }}>
                <Feld label="Einzelpreis netto" wert={form.einzelpreis} keyboardType="decimal-pad"
                      onChangeText={(t) => setForm({ ...form, einzelpreis: t })} />
              </View>
            </View>
            {vorschau ? (
              <Text style={styles.vorschau}>
                {euroAusCent(vorschau.nettoCent)} netto · {euroAusCent(vorschau.bruttoCent)} brutto
              </Text>
            ) : null}
            <Knopf titel="Speichern" onPress={speichern} laedt={arbeitet} />
            <Knopf titel="Abbrechen" variante="ghost" onPress={() => setBearbeiten(false)}
                   style={{ marginTop: 8 }} />
          </Karte>
        ) : (
          <Karte>
            <Text style={textStil.h2}>{nachtrag.titel}</Text>
            {nachtrag.beschreibung ? (
              <Text style={[textStil.body, { marginTop: 10 }]}>{nachtrag.beschreibung}</Text>
            ) : null}

            <View style={styles.rechnung}>
              <View style={styles.rZeile}>
                <Text style={styles.rLabel}>
                  {String(nachtrag.menge).replace(".", ",")} {nachtrag.einheit} ×{" "}
                  {euroAusCent(nachtrag.einzelpreisCent)}
                </Text>
                <Text style={styles.rWert}>{euroAusCent(r.nettoCent)}</Text>
              </View>
              <View style={styles.rZeile}>
                <Text style={styles.rLabel}>zzgl. {nachtrag.ustSatz || UST_SATZ} % USt</Text>
                <Text style={styles.rWert}>{euroAusCent(r.ustCent)}</Text>
              </View>
              <View style={[styles.rZeile, styles.rSumme]}>
                <Text style={styles.rLabelGross}>Gesamt brutto</Text>
                <Text style={styles.rWertGross}>{euroAusCent(r.bruttoCent)}</Text>
              </View>
            </View>

            {!gesperrt ? (
              <Knopf titel="Bearbeiten" variante="ghost" onPress={bearbeitenStarten} />
            ) : (
              <Text style={styles.gesperrtHinweis}>
                Dieser Nachtrag ist beim Kunden. Solange er dort liegt, lässt er sich nicht
                mehr ändern — sonst stünde am Ende etwas anderes im Nachweis, als der Kunde
                gesehen hat.
              </Text>
            )}
          </Karte>
        )}

        {/* Fotos */}
        <Text style={styles.abschnitt}>Fotos</Text>
        <Text style={[textStil.klein, { marginBottom: 12 }]}>
          Ein Bild vom Problem überzeugt schneller als jede Beschreibung.
        </Text>
        <View style={styles.fotoRaster}>
          {(nachtrag.fotos || []).map((url) => (
            <View key={url} style={styles.fotoZelle}>
              <Image source={{ uri: url }} style={styles.foto} />
              {!gesperrt ? (
                <Pressable onPress={() => fotoEntfernen(url)} style={styles.fotoWeg} hitSlop={8}>
                  <Text style={styles.fotoWegText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
        {!gesperrt ? (
          hochladen ? (
            <View style={styles.ladeReihe}>
              <ActivityIndicator color={farben.rot} />
              <Text style={styles.ladeText}>Foto wird hochgeladen …</Text>
            </View>
          ) : (
            <Knopf titel="Foto hinzufügen" variante="sekundaer" onPress={fotoHinzufuegen} />
          )
        ) : null}

        {/* Freigabe */}
        <Text style={styles.abschnitt}>Freigabe durch den Kunden</Text>

        {!nachtrag.freigabeSchluessel ? (
          <Karte>
            <Text style={textStil.body}>
              Sie erzeugen einen Link und schicken ihn dem Kunden — per WhatsApp, SMS oder
              E-Mail. Er braucht weder App noch Passwort. Was er dort sieht, wird in diesem
              Moment festgeschrieben und lässt sich danach nicht mehr ändern.
            </Text>
            <Knopf
              titel="Freigabe-Link erzeugen"
              onPress={linkErzeugen}
              laedt={arbeitet}
              style={{ marginTop: 18 }}
            />
          </Karte>
        ) : (
          <>
            {entscheidung ? (
              <Karte
                style={{
                  borderColor:
                    entscheidung.ergebnis === "freigegeben" ? farben.gruen : farben.fehlerLinie,
                }}
              >
                <Text
                  style={[
                    styles.ergebnis,
                    { color: entscheidung.ergebnis === "freigegeben" ? farben.gruen : farben.fehlerText },
                  ]}
                >
                  {entscheidung.ergebnis === "freigegeben"
                    ? "Vom Kunden freigegeben"
                    : "Vom Kunden abgelehnt"}
                </Text>
                <Text style={styles.nachweisZeile}>
                  {datumZeitDe(entscheidung.zeitpunkt)} Uhr · Zeitstempel vom Server
                </Text>
                {entscheidung.name ? (
                  <Text style={styles.nachweisZeile}>Bestätigt von: {entscheidung.name}</Text>
                ) : null}
                <Text style={styles.nachweisZeile}>
                  Prüfsumme des freigegebenen Standes: {String(entscheidung.abdruck).slice(0, 16)}…
                </Text>

                <Text style={styles.wortlautTitel}>Was der Kunde vor sich hatte</Text>
                <Text style={styles.wortlautText}>{entscheidung.wortlaut}</Text>

                <Text style={styles.unveraenderlich}>
                  Dieser Nachweis ist unveränderlich — auch für Sie. Weder Text noch Zeitpunkt
                  noch Ergebnis lassen sich nachträglich anfassen.
                </Text>

                {entscheidung.ergebnis === "freigegeben" && nachtrag.status !== "abgerechnet" ? (
                  <Knopf titel="Als abgerechnet markieren" variante="ghost"
                         onPress={alsAbgerechnet} style={{ marginTop: 16 }} />
                ) : null}
              </Karte>
            ) : (
              <Karte>
                <Text style={styles.wartet}>Wartet auf den Kunden</Text>
                <Text style={[textStil.klein, { marginTop: 6 }]}>
                  {link?.widerrufen
                    ? "Der Link wurde zurückgezogen."
                    : `Der Link gilt bis ${datumZeitDe(link?.gueltigBis)} Uhr.`}
                </Text>

                <Text style={styles.linkKasten} selectable>
                  {adresse}
                </Text>

                {!link?.widerrufen ? (
                  <>
                    <Knopf titel="Per WhatsApp schicken" onPress={perWhatsApp} />
                    <Knopf titel="Nachricht kopieren / teilen" variante="sekundaer"
                           onPress={teilen} style={{ marginTop: 8 }} />
                    <Knopf titel="Link zurückziehen" variante="ghost"
                           onPress={linkZurueckziehen} style={{ marginTop: 8 }} />
                  </>
                ) : (
                  <Knopf titel="Neuen Link erzeugen" onPress={linkErzeugen}
                         laedt={arbeitet} style={{ marginTop: 8 }} />
                )}
              </Karte>
            )}
          </>
        )}

        <Knopf titel="Nachtrag löschen" variante="ghost" onPress={loeschen}
               style={{ marginTop: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 16, paddingBottom: 56 },

  kopf: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  nummer: { ...schrift.head, fontSize: 16, color: farben.textMatt, letterSpacing: 1.5 },

  label: {
    ...schrift.headHalb, fontSize: groessen.klein, color: farben.textWeich,
    letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  reihe: { flexDirection: "row", gap: 12 },
  vorschau: { ...schrift.bodyMed, fontSize: 15, color: farben.text, marginBottom: 16 },

  rechnung: {
    backgroundColor: farben.bgErhoben, borderRadius: radius.feld,
    padding: 16, marginTop: 18, marginBottom: 16,
  },
  rZeile: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, gap: 12 },
  rSumme: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: farben.linie, marginBottom: 0 },
  rLabel: { ...schrift.body, fontSize: 14, color: farben.textMatt, flex: 1 },
  rWert: { ...schrift.bodyMed, fontSize: 14, color: farben.textWeich },
  rLabelGross: { ...schrift.headHalb, fontSize: 16, color: farben.text, letterSpacing: 0.5 },
  rWertGross: { ...schrift.head, fontSize: 20, color: farben.text },

  gesperrtHinweis: { ...schrift.body, fontSize: 13, color: farben.textMatt, lineHeight: 20 },

  abschnitt: {
    ...schrift.head, fontSize: 20, color: farben.text,
    letterSpacing: 0.5, marginTop: 30, marginBottom: 6,
  },
  fotoRaster: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  fotoZelle: { width: 100, height: 100 },
  foto: { width: 100, height: 100, borderRadius: 12, backgroundColor: farben.bgErhoben },
  fotoWeg: {
    position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: farben.rot, alignItems: "center", justifyContent: "center",
  },
  fotoWegText: { color: "#fff", fontSize: 13, lineHeight: 16 },
  ladeReihe: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  ladeText: { ...schrift.body, fontSize: 14, color: farben.textWeich },

  wartet: { ...schrift.head, fontSize: 19, color: farben.blauHell, letterSpacing: 0.5 },
  linkKasten: {
    ...schrift.body, fontSize: 12, color: farben.textWeich,
    backgroundColor: farben.bgErhoben, borderRadius: radius.feld,
    padding: 14, marginTop: 16, marginBottom: 16,
  },

  ergebnis: { ...schrift.head, fontSize: 21, letterSpacing: 0.5 },
  nachweisZeile: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 6 },
  wortlautTitel: {
    ...schrift.headHalb, fontSize: groessen.klein, color: farben.textWeich,
    letterSpacing: 0.5, textTransform: "uppercase", marginTop: 20, marginBottom: 8,
  },
  wortlautText: {
    ...schrift.body, fontSize: 13, color: farben.textWeich, lineHeight: 21,
    backgroundColor: farben.bgErhoben, borderRadius: radius.feld, padding: 14,
  },
  unveraenderlich: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 12, lineHeight: 18 },
});
