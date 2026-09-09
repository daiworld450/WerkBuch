// ---------------------------------------------------------------------------
// NachtraegeScreen.js — alle Nachträge einer Baustelle.
//
// Ein Nachtrag ist eine zusätzliche Leistung, die während der Bauzeit dazu-
// kommt: der Estrich trägt nicht, hinter der Wand liegt eine alte Leitung, der
// Kunde möchte doch eine Nische. Bisher wurde so etwas auf der Baustelle
// mündlich besprochen und später bestritten. Hier wird es aufgeschrieben,
// gerechnet und dem Kunden zur Freigabe geschickt.
//
// Nur der Inhaber. Der Mitarbeiter sieht die Kachel gar nicht erst, und die
// Firestore-Regeln weisen ihn ab, falls er die Adresse errät.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, radius, textStil } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Feld from "../components/Feld";
import Pill from "../components/Pill";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import fehlerText from "../util/fehler";
import { datumDe } from "../util/format";
import {
  EINHEITEN,
  UST_SATZ,
  centAus,
  euroAusCent,
  rechne,
  summe,
  statusLabel,
  naechsteNummer,
} from "../util/nachtrag";

const LEER = {
  titel: "",
  beschreibung: "",
  menge: "1",
  einheit: "pauschal",
  einzelpreis: "",
};

// Farbe je Stand — dieselbe Sprache wie im Rest der App.
function statusFarbe(status) {
  if (status === "freigegeben" || status === "abgerechnet") return farben.gruen;
  if (status === "abgelehnt") return farben.rotHell;
  if (status === "gesendet") return farben.blauHell;
  return farben.textMatt;
}

export default function NachtraegeScreen({ route, navigation }) {
  const { baustelleId } = route.params || {};
  const { istHandwerker } = useAuth();

  useEffect(() => {
    if (!baustelleId) navigation.replace("Baustellen");
  }, [baustelleId]);
  if (!baustelleId) return null;

  const [nachtraege, setNachtraege] = useState([]);
  const [baustelle, setBaustelle] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [formOffen, setFormOffen] = useState(false);
  const [form, setForm] = useState(LEER);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "nachtraege"),
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Neueste zuerst. Sortiert wird hier und nicht in der Abfrage, damit
        // kein zusammengesetzter Index nötig wird (gleiches Muster wie überall).
        liste.sort((a, b) => (b.erstelltAm?.seconds || 0) - (a.erstelltAm?.seconds || 0));
        setNachtraege(liste);
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  useEffect(() => {
    getDoc(doc(db, "baustellen", baustelleId))
      .then((s) => setBaustelle(s.exists() ? { id: s.id, ...s.data() } : null))
      .catch(() => {});
  }, [baustelleId]);

  // Laufende Vorschau, während getippt wird — der Kunde sieht später genau
  // diese Zahlen, also soll sie hier schon jemand gegenprüfen können.
  const vorschau = useMemo(
    () => rechne({ menge: form.menge, einzelpreisCent: centAus(form.einzelpreis) || 0 }),
    [form.menge, form.einzelpreis]
  );

  const offen = summe(nachtraege, ["offen", "gesendet"]);
  const anerkannt = summe(nachtraege, ["freigegeben", "abgerechnet"]);

  async function anlegen() {
    const preis = centAus(form.einzelpreis);
    if (!form.titel.trim()) {
      Alert.alert("Es fehlt der Titel", "Wie soll die zusätzliche Leistung heißen?");
      return;
    }
    if (preis == null) {
      Alert.alert("Es fehlt der Preis", "Ohne Einzelpreis lässt sich nichts freigeben.");
      return;
    }
    const r = rechne({ menge: form.menge, einzelpreisCent: preis });
    if (r.nettoCent <= 0) {
      Alert.alert("Betrag ist null", "Menge und Einzelpreis ergeben zusammen 0 €.");
      return;
    }

    setSpeichert(true);
    try {
      await addDoc(collection(db, "baustellen", baustelleId, "nachtraege"), {
        nummer: naechsteNummer(nachtraege),
        titel: form.titel.trim(),
        beschreibung: form.beschreibung.trim(),
        menge: r.menge,
        einheit: form.einheit,
        einzelpreisCent: r.einzelpreisCent,
        nettoCent: r.nettoCent,
        ustSatz: r.ustSatz,
        ustCent: r.ustCent,
        bruttoCent: r.bruttoCent,
        fotos: [],
        status: "offen",
        handwerkerId: baustelle?.handwerkerId || null,
        erstelltAm: serverTimestamp(),
        aktualisiertAm: serverTimestamp(),
      });
      setForm(LEER);
      setFormOffen(false);
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    } finally {
      setSpeichert(false);
    }
  }

  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Leerzustand
          symbol="🔒"
          titel="Nur für den Betriebsinhaber"
          text="Nachträge enthalten Preise und werden deshalb nur vom Inhaber gepflegt."
        />
      </SafeAreaView>
    );
  }

  if (laedt) return <Ladeanzeige text="Nachträge werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Kopfzahlen */}
          {nachtraege.length > 0 ? (
            <Karte style={styles.kopf}>
              <View style={styles.kopfReihe}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kopfLabel}>Vom Kunden freigegeben</Text>
                  <Text style={[styles.kopfWert, { color: farben.gruen }]}>
                    {euroAusCent(anerkannt.nettoCent)}
                  </Text>
                  <Text style={styles.kopfKlein}>
                    {anerkannt.anzahl === 1 ? "1 Nachtrag" : `${anerkannt.anzahl} Nachträge`} · netto
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kopfLabel}>Noch offen</Text>
                  <Text style={styles.kopfWert}>{euroAusCent(offen.nettoCent)}</Text>
                  <Text style={styles.kopfKlein}>
                    {offen.anzahl === 1 ? "1 Nachtrag" : `${offen.anzahl} Nachträge`} · netto
                  </Text>
                </View>
              </View>
              <Text style={styles.kopfHinweis}>
                In die Auftragssumme fließt nur, was freigegeben ist.
              </Text>
            </Karte>
          ) : null}

          {/* Formular */}
          {formOffen ? (
            <Karte style={{ marginBottom: 18 }}>
              <Text style={textStil.h3}>Neuer Nachtrag</Text>
              <Text style={[textStil.klein, { marginTop: 6, marginBottom: 16 }]}>
                Kurz und verständlich — der Kunde liest genau diesen Text.
              </Text>

              <Feld
                label="Was kommt dazu?"
                wert={form.titel}
                onChangeText={(t) => setForm({ ...form, titel: t })}
                platzhalter="z. B. Estrich zusätzlich"
              />
              <Feld
                label="Warum (optional)"
                wert={form.beschreibung}
                onChangeText={(t) => setForm({ ...form, beschreibung: t })}
                platzhalter="Der Bestandsestrich trägt die neuen Fliesen nicht."
                multiline
                style={{ minHeight: 90, textAlignVertical: "top" }}
              />

              <Text style={styles.label}>Einheit</Text>
              <View style={styles.chips}>
                {EINHEITEN.map((e) => (
                  <Pill
                    key={e}
                    text={e}
                    aktiv={form.einheit === e}
                    onPress={() => setForm({ ...form, einheit: e })}
                    style={{ marginRight: 8, marginBottom: 8 }}
                  />
                ))}
              </View>

              <View style={styles.reihe}>
                <View style={{ flex: 1 }}>
                  <Feld
                    label="Menge"
                    wert={form.menge}
                    onChangeText={(t) => setForm({ ...form, menge: t })}
                    keyboardType="decimal-pad"
                    platzhalter="1"
                  />
                </View>
                <View style={{ flex: 1.4 }}>
                  <Feld
                    label={`Einzelpreis netto je ${form.einheit}`}
                    wert={form.einzelpreis}
                    onChangeText={(t) => setForm({ ...form, einzelpreis: t })}
                    keyboardType="decimal-pad"
                    platzhalter="0,00"
                  />
                </View>
              </View>

              {/* Vorschau der Rechnung */}
              <View style={styles.rechnung}>
                <View style={styles.rZeile}>
                  <Text style={styles.rLabel}>Summe netto</Text>
                  <Text style={styles.rWert}>{euroAusCent(vorschau.nettoCent)}</Text>
                </View>
                <View style={styles.rZeile}>
                  <Text style={styles.rLabel}>zzgl. {UST_SATZ} % USt</Text>
                  <Text style={styles.rWert}>{euroAusCent(vorschau.ustCent)}</Text>
                </View>
                <View style={[styles.rZeile, styles.rSumme]}>
                  <Text style={styles.rLabelGross}>Gesamt brutto</Text>
                  <Text style={styles.rWertGross}>{euroAusCent(vorschau.bruttoCent)}</Text>
                </View>
              </View>

              <Knopf titel="Nachtrag anlegen" onPress={anlegen} laedt={speichert} />
              <Knopf
                titel="Abbrechen"
                variante="ghost"
                onPress={() => {
                  setForm(LEER);
                  setFormOffen(false);
                }}
                style={{ marginTop: 8 }}
              />
            </Karte>
          ) : (
            <Knopf
              titel="Nachtrag anlegen"
              onPress={() => setFormOffen(true)}
              style={{ marginBottom: 18 }}
            />
          )}

          {/* Liste */}
          {nachtraege.length === 0 && !formOffen ? (
            <Leerzustand
              symbol="➕"
              titel="Noch kein Nachtrag"
              text={
                "Wenn auf der Baustelle etwas dazukommt, schreiben Sie es hier auf. " +
                "Der Kunde gibt es per Link frei — nachweisbar, ohne App und ohne Anmeldung."
              }
            />
          ) : null}

          {nachtraege.map((n) => (
            <Karte
              key={n.id}
              style={styles.eintrag}
              onPress={() => navigation.navigate("Nachtrag", { baustelleId, nachtragId: n.id })}
            >
              <View style={styles.eKopf}>
                <Text style={styles.eNummer}>{n.nummer}</Text>
                <View style={[styles.punkt, { backgroundColor: statusFarbe(n.status) }]} />
                <Text style={[styles.eStatus, { color: statusFarbe(n.status) }]}>
                  {statusLabel(n.status)}
                </Text>
              </View>
              <Text style={styles.eTitel} numberOfLines={2}>{n.titel}</Text>
              <View style={styles.eFuss}>
                <Text style={styles.eMenge}>
                  {String(n.menge).replace(".", ",")} {n.einheit} · {euroAusCent(n.einzelpreisCent)}
                </Text>
                <Text style={styles.eBetrag}>{euroAusCent(n.bruttoCent)}</Text>
              </View>
              {n.entschiedenAm ? (
                <Text style={styles.eDatum}>
                  {n.status === "abgelehnt" ? "Abgelehnt" : "Freigegeben"} am{" "}
                  {datumDe(n.entschiedenAm)}
                </Text>
              ) : null}
            </Karte>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 16, paddingBottom: 48 },

  kopf: { marginBottom: 18 },
  kopfReihe: { flexDirection: "row", gap: 16 },
  kopfLabel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textMatt,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  kopfWert: { ...schrift.head, fontSize: 24, color: farben.text, marginTop: 4 },
  kopfKlein: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 2 },
  kopfHinweis: {
    ...schrift.body,
    fontSize: 12,
    color: farben.textMatt,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: farben.linie,
  },

  label: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  reihe: { flexDirection: "row", gap: 12 },

  rechnung: {
    backgroundColor: farben.bgErhoben,
    borderRadius: radius.feld,
    padding: 16,
    marginBottom: 18,
  },
  rZeile: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  rSumme: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: farben.linie, marginBottom: 0 },
  rLabel: { ...schrift.body, fontSize: 14, color: farben.textMatt },
  rWert: { ...schrift.bodyMed, fontSize: 14, color: farben.textWeich },
  rLabelGross: { ...schrift.headHalb, fontSize: 16, color: farben.text, letterSpacing: 0.5 },
  rWertGross: { ...schrift.head, fontSize: 20, color: farben.text },

  eintrag: { marginBottom: 12, padding: 18 },
  eKopf: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  eNummer: {
    ...schrift.head,
    fontSize: 14,
    color: farben.textMatt,
    letterSpacing: 1,
    flex: 1,
  },
  punkt: { width: 8, height: 8, borderRadius: 4 },
  eStatus: { ...schrift.headHalb, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" },
  eTitel: { ...schrift.head, fontSize: 18, color: farben.text, letterSpacing: 0.5 },
  eFuss: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 10,
  },
  eMenge: { ...schrift.body, fontSize: 13, color: farben.textMatt, flex: 1 },
  eBetrag: { ...schrift.head, fontSize: 19, color: farben.text },
  eDatum: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 8 },
});
