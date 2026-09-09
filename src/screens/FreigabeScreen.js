// ---------------------------------------------------------------------------
// FreigabeScreen.js — die Seite, die der KUNDE sieht.
//
// Sie ist der einzige Teil von WerkBuch, den jemand ohne Anmeldung öffnet.
// Deshalb gelten hier andere Regeln als im Rest der App:
//
//  - Sie lädt AUSSCHLIESSLICH das Link-Dokument. Kein Blick in die Baustelle,
//    keine Preise anderer Vorgänge, keine anderen Kunden. Alles, was der Kunde
//    sieht, wurde beim Erzeugen des Links als Kopie eingefroren.
//  - Sie zeigt den Betrag GROSS und BRUTTO. Gegenüber Verbrauchern sind
//    Gesamtpreise inklusive Umsatzsteuer anzugeben.
//  - Der Knopf heißt „Kostenpflichtig beauftragen“ und nicht „OK“. Wer klickt,
//    soll gelesen haben, dass er etwas bestellt.
//  - Sie ist für einen Daumen auf einer Baustelle gebaut: große Flächen,
//    wenig Text über der Falz, keine Eingabe außer dem eigenen Namen.
//
// Die Sicherheit liegt NICHT in diesem Bildschirm, sondern in den
// Firestore-Regeln: Sie prüfen Gültigkeit, Prüfsumme, Serverzeitpunkt und
// lassen genau eine Entscheidung zu.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "../firebase";
import { farben, schrift, groessen, radius } from "../theme";
import Knopf from "../components/Knopf";
import Feld from "../components/Feld";
import { euroAusCent, KNOPF_LABEL } from "../util/nachtrag";
import { datumZeitDe } from "../util/format";

export default function FreigabeScreen({ schluessel }) {
  const { width } = useWindowDimensions();
  const [zustand, setZustand] = useState("laedt");
  const [link, setLink] = useState(null);
  const [entscheidung, setEntscheidung] = useState(null);
  const [name, setName] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const [linkSnap, entSnap] = await Promise.all([
          getDoc(doc(db, "freigabeLinks", schluessel)),
          getDoc(doc(db, "freigabeEntscheidungen", schluessel)).catch(() => null),
        ]);
        if (!aktiv) return;

        if (!linkSnap.exists()) {
          setZustand("unbekannt");
          return;
        }
        const daten = linkSnap.data();
        setLink(daten);

        if (entSnap && entSnap.exists()) {
          setEntscheidung(entSnap.data());
          setZustand("entschieden");
          return;
        }
        if (daten.widerrufen) {
          setZustand("zurueckgezogen");
          return;
        }
        const bis = daten.gueltigBis?.toDate ? daten.gueltigBis.toDate() : null;
        if (bis && bis.getTime() < Date.now()) {
          setZustand("abgelaufen");
          return;
        }
        setZustand("offen");
      } catch (e) {
        if (aktiv) setZustand("unbekannt");
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [schluessel]);

  async function entscheiden(ergebnis) {
    setSendet(true);
    setFehler("");
    try {
      const eintrag = {
        ergebnis,
        // Genau der Stand, den diese Seite gezeigt hat. Die Regel vergleicht
        // ihn mit dem im Link hinterlegten — passt er nicht, wird abgewiesen.
        abdruck: link.abdruck,
        wortlaut: link.wortlaut,
        // serverTimestamp: die Zeit kommt von Google, nicht von diesem Gerät.
        zeitpunkt: serverTimestamp(),
        name: name.trim() || null,
      };
      await setDoc(doc(db, "freigabeEntscheidungen", schluessel), eintrag);
      setEntscheidung({ ...eintrag, zeitpunkt: new Date() });
      setZustand("entschieden");
    } catch (e) {
      // Der häufigste Fall: zwei Klicks kurz hintereinander, oder der Stand
      // wurde in der Zwischenzeit geändert. Beides wird von der Regel
      // abgewiesen — und beides ist so gewollt.
      setFehler(
        "Das hat nicht geklappt. Möglicherweise wurde bereits entschieden oder der " +
          "Vorgang wurde inzwischen geändert. Bitte laden Sie die Seite neu."
      );
      setSendet(false);
    }
  }

  // ------------------------------------------------------------- Zustände
  if (zustand === "laedt") {
    return (
      <View style={styles.mitte}>
        <ActivityIndicator color={farben.rot} size="large" />
        <Text style={styles.mitteText}>Wird geladen …</Text>
      </View>
    );
  }

  if (zustand === "unbekannt" || zustand === "abgelaufen" || zustand === "zurueckgezogen") {
    const texte = {
      unbekannt: {
        titel: "Dieser Link ist uns nicht bekannt",
        text: "Bitte prüfen Sie, ob Sie ihn vollständig geöffnet haben — manche Nachrichten kürzen lange Adressen ab.",
      },
      abgelaufen: {
        titel: "Dieser Link ist abgelaufen",
        text: "Melden Sie sich kurz bei uns, dann schicken wir Ihnen einen neuen.",
      },
      zurueckgezogen: {
        titel: "Dieser Vorgang wurde zurückgezogen",
        text: "Bitte wenden Sie sich an uns, wenn Sie dazu eine Frage haben.",
      },
    }[zustand];
    return (
      <View style={styles.mitte}>
        <Text style={styles.hinweisTitel}>{texte.titel}</Text>
        <Text style={styles.hinweisText}>{texte.text}</Text>
        <Text style={styles.betriebFuss}>Berisa Bau · Mülheim an der Ruhr</Text>
      </View>
    );
  }

  const a = link.anzeige || {};
  const bildBreite = Math.min(width - 40, 620);

  if (zustand === "entschieden") {
    const jaa = entscheidung?.ergebnis === "freigegeben";
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.abschluss, jaa ? styles.abschlussJa : styles.abschlussNein]}>
            <Text style={styles.abschlussZeichen}>{jaa ? "✓" : "×"}</Text>
            <Text style={styles.abschlussTitel}>
              {jaa ? "Vielen Dank — der Auftrag ist erteilt" : "Ihre Ablehnung ist notiert"}
            </Text>
            <Text style={styles.abschlussText}>
              {jaa
                ? `Wir führen die Arbeit aus. Der Betrag von ${euroAusCent(a.bruttoCent)} kommt zur ` +
                  "vereinbarten Auftragssumme hinzu und erscheint auf der Schlussrechnung."
                : "Wir führen diese zusätzliche Leistung nicht aus. Wenn Sie es sich anders " +
                  "überlegen, melden Sie sich einfach bei uns."}
            </Text>
            <Text style={styles.abschlussZeit}>
              {datumZeitDe(entscheidung?.zeitpunkt)} Uhr
            </Text>
          </View>

          <Text style={styles.belegTitel}>Ihr Beleg</Text>
          <Text style={styles.belegText}>{link.wortlaut}</Text>
          <Text style={styles.belegHinweis}>
            Diesen Wortlaut haben wir zusammen mit dem Zeitpunkt unveränderlich gespeichert.
            Machen Sie sich gern einen Bildschirmabzug für Ihre Unterlagen.
          </Text>
          <Text style={styles.betriebFuss}>Berisa Bau · Mülheim an der Ruhr</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------- offen: die Seite
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.betrieb}>{a.betrieb || "Berisa Bau"}</Text>
        <Text style={styles.ueber}>Zusätzliche Leistung zur Freigabe</Text>

        {a.baustelleName ? <Text style={styles.baustelle}>{a.baustelleName}</Text> : null}

        <Text style={styles.titel}>{a.titel}</Text>
        {a.beschreibung ? <Text style={styles.beschreibung}>{a.beschreibung}</Text> : null}

        {(a.fotos || []).map((url) => (
          <Image
            key={url}
            source={{ uri: url }}
            style={{
              width: bildBreite,
              height: bildBreite * 0.72,
              borderRadius: radius.klein,
              backgroundColor: farben.bgErhoben,
              marginTop: 16,
            }}
            resizeMode="cover"
          />
        ))}

        {/* Die Zahlen */}
        <View style={styles.rechnung}>
          <View style={styles.rZeile}>
            <Text style={styles.rLabel}>
              {String(a.menge).replace(".", ",")} {a.einheit} × {euroAusCent(a.einzelpreisCent)}
            </Text>
            <Text style={styles.rWert}>{euroAusCent(a.nettoCent)}</Text>
          </View>
          <View style={styles.rZeile}>
            <Text style={styles.rLabel}>zzgl. {a.ustSatz} % Umsatzsteuer</Text>
            <Text style={styles.rWert}>{euroAusCent(a.ustCent)}</Text>
          </View>
          <View style={styles.rSumme}>
            <Text style={styles.rSummeLabel}>Gesamtbetrag</Text>
            <Text style={styles.rSummeWert}>{euroAusCent(a.bruttoCent)}</Text>
            <Text style={styles.rSummeKlein}>inklusive Umsatzsteuer</Text>
          </View>
        </View>

        <Text style={styles.zusage}>
          Mit dem Klick auf „{KNOPF_LABEL}“ beauftragen Sie {a.betrieb || "Berisa Bau"}{" "}
          verbindlich mit der oben beschriebenen zusätzlichen Leistung zum Gesamtbetrag von{" "}
          {euroAusCent(a.bruttoCent)} brutto. Der Betrag kommt zur vereinbarten Auftragssumme
          hinzu.
        </Text>

        <Feld
          label="Ihr Name (freiwillig)"
          wert={name}
          onChangeText={setName}
          platzhalter={a.kundeName || "Vor- und Nachname"}
        />

        {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}

        <Knopf
          titel={KNOPF_LABEL}
          onPress={() => entscheiden("freigegeben")}
          laedt={sendet}
          style={{ marginTop: 4 }}
        />
        <Knopf
          titel="Ablehnen"
          variante="ghost"
          onPress={() => entscheiden("abgelehnt")}
          deaktiviert={sendet}
          style={{ marginTop: 10 }}
        />

        <Text style={styles.datenschutz}>
          Wir speichern zu Ihrer Entscheidung den Zeitpunkt, das Ergebnis und den oben
          gezeigten Text — mehr nicht. Grundlage ist die Durchführung unseres Vertrags
          (Art. 6 Abs. 1 lit. b DSGVO). Der Link läuft nach 30 Tagen ab.
        </Text>
        <Text style={styles.betriebFuss}>Berisa Bau · Mülheim an der Ruhr</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 60, maxWidth: 660, width: "100%", alignSelf: "center" },

  mitte: { flex: 1, backgroundColor: farben.bg, alignItems: "center", justifyContent: "center", padding: 32 },
  mitteText: { ...schrift.body, fontSize: 15, color: farben.textMatt, marginTop: 16 },
  hinweisTitel: { ...schrift.head, fontSize: 24, color: farben.text, textAlign: "center", letterSpacing: 0.5 },
  hinweisText: { ...schrift.body, fontSize: 15, color: farben.textWeich, textAlign: "center", marginTop: 12, lineHeight: 24 },

  betrieb: { ...schrift.head, fontSize: 15, color: farben.rot, letterSpacing: 2, textTransform: "uppercase" },
  ueber: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 4 },
  baustelle: { ...schrift.body, fontSize: 14, color: farben.textWeich, marginTop: 18 },
  titel: { ...schrift.head, fontSize: 30, color: farben.text, letterSpacing: 0.5, marginTop: 6, lineHeight: 36 },
  beschreibung: { ...schrift.body, fontSize: 16, color: farben.textWeich, lineHeight: 26, marginTop: 12 },

  rechnung: {
    backgroundColor: farben.glas,
    borderWidth: 1,
    borderColor: farben.linie,
    borderRadius: radius.karte,
    padding: 20,
    marginTop: 24,
  },
  rZeile: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  rLabel: { ...schrift.body, fontSize: 14, color: farben.textMatt, flex: 1 },
  rWert: { ...schrift.bodyMed, fontSize: 14, color: farben.textWeich },
  rSumme: { marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: farben.linie },
  rSummeLabel: { ...schrift.headHalb, fontSize: 13, color: farben.textMatt, letterSpacing: 1, textTransform: "uppercase" },
  rSummeWert: { ...schrift.head, fontSize: 40, color: farben.text, letterSpacing: 0.5, marginTop: 4 },
  rSummeKlein: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 2 },

  zusage: { ...schrift.body, fontSize: 14, color: farben.textWeich, lineHeight: 23, marginTop: 24, marginBottom: 22 },
  fehler: {
    ...schrift.body, fontSize: 14, color: farben.fehlerText,
    backgroundColor: farben.fehlerBg, borderWidth: 1, borderColor: farben.fehlerLinie,
    borderRadius: radius.feld, padding: 14, marginBottom: 16, lineHeight: 21,
  },
  datenschutz: { ...schrift.body, fontSize: 12, color: farben.textMatt, lineHeight: 19, marginTop: 28 },
  betriebFuss: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 24, textAlign: "center" },

  abschluss: { borderRadius: radius.karte, borderWidth: 1, padding: 24, alignItems: "center", marginTop: 20 },
  abschlussJa: { borderColor: farben.gruen, backgroundColor: farben.gruenRing },
  abschlussNein: { borderColor: farben.linie, backgroundColor: farben.glas },
  abschlussZeichen: { ...schrift.head, fontSize: 48, color: farben.text, lineHeight: 56 },
  abschlussTitel: { ...schrift.head, fontSize: 24, color: farben.text, textAlign: "center", letterSpacing: 0.5, marginTop: 6 },
  abschlussText: { ...schrift.body, fontSize: 15, color: farben.textWeich, textAlign: "center", lineHeight: 24, marginTop: 12 },
  abschlussZeit: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 16 },

  belegTitel: {
    ...schrift.headHalb, fontSize: groessen.klein, color: farben.textWeich,
    letterSpacing: 1, textTransform: "uppercase", marginTop: 34, marginBottom: 10,
  },
  belegText: {
    ...schrift.body, fontSize: 13, color: farben.textWeich, lineHeight: 22,
    backgroundColor: farben.bgErhoben, borderRadius: radius.feld, padding: 16,
  },
  belegHinweis: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 12, lineHeight: 19 },
});
