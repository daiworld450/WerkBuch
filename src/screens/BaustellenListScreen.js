// ---------------------------------------------------------------------------
// BaustellenListScreen.js — Startbildschirm nach dem Login.
//
// Zwei Sichten, je nach Rolle:
//   Inhaber     — alle eigenen Baustellen (where handwerkerId == uid).
//   Mitarbeiter — nur die ihm zugewiesenen
//                 (where zugewieseneNutzer array-contains uid).
//
// Beides sind Ein-Feld-Abfragen; sortiert wird clientseitig, damit kein
// zusammengesetzter Firestore-Index nötig ist.
//
// Die Kopfzeile ist zugleich der Einstieg in alles, was nicht an EINE
// Baustelle hängt: Kalender, Auswertung und Personen. Es gibt in dieser App
// keine Tab-Leiste und keinen Einstellungs-Bildschirm — und da diese Liste
// der Startbildschirm ist, ist sie die einzige Stelle, die jeder Weg ohnehin
// passiert. Alle drei sind dem Inhaber vorbehalten.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Knopf from "../components/Knopf";
import Fortschritt from "../components/Fortschritt";
import { statusFarbe } from "../components/Statuspunkt";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { listenReihen } from "../util/baustellenListe";
import { VERSION } from "../version";

export default function BaustellenListScreen({ navigation }) {
  const { profil, abmelden, istHandwerker, istMitarbeiter } = useAuth();
  const [baustellen, setBaustellen] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!profil) return;
    const q = istMitarbeiter
      ? query(
          collection(db, "baustellen"),
          where("zugewieseneNutzer", "array-contains", profil.id)
        )
      : query(collection(db, "baustellen"), where("handwerkerId", "==", profil.id));

    const stop = onSnapshot(
      q,
      (snap) => {
        // Geordnet wird erst in listenReihen (nach Feld reihenfolge, clientseitig,
        // kein Index nötig).
        setBaustellen(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLaedt(false);
        setFehler("");
      },
      (e) => {
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    );
    return stop;
  }, [profil, istMitarbeiter]);

  function kopf() {
    return (
      <View style={styles.kopfBereich}>
        <View style={styles.kopf}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hallo}>Hallo {profil?.name || ""}</Text>
            <Text style={styles.untertitel}>
              {istMitarbeiter ? "Mitarbeiter" : "Handwerker"}
              {baustellen.length ? `  ·  ${baustellen.length} Baustellen` : ""}
            </Text>
          </View>
          <Pressable onPress={abmelden} hitSlop={10}>
            <Text style={styles.abmelden}>Abmelden</Text>
          </Pressable>
        </View>

        {/* Was nicht an EINE Baustelle hängt. Der Kalender zeigt dem
            Mitarbeiter nur die Zeiträume seiner Baustellen; Auswertung und
            Personen sind dem Inhaber vorbehalten. */}
        <View style={styles.linkReihe}>
          <Pressable onPress={() => navigation.navigate("Kalender")} hitSlop={8}>
            <Text style={styles.link}>📅 Kalender</Text>
          </Pressable>
          {istHandwerker ? (
            <>
              <Pressable onPress={() => navigation.navigate("Auswertung")} hitSlop={8}>
                <Text style={styles.link}>📊 Auswertung</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate("Personen")} hitSlop={8}>
                <Text style={styles.link}>👷 Personen</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const reihen = useMemo(() => listenReihen(baustellen), [baustellen]);

  function zeile({ item: reihe }) {
    if (reihe.typ === "monat") {
      return <Text style={styles.monat}>{reihe.titel}</Text>;
    }
    return karte(reihe.baustelle);
  }

  // Kompakte Zeile statt großer Karte: Name + Status oben, darunter
  // Auftragsnummer, Ort und Fotos in einer Zeile; Fortschritt nur, wenn es einen gibt.
  // Die Auftragsnummer hält gleichnamige Baustellen (z. B. drei Aufträge für
  // denselben Kunden) auseinander.
  function karte(item) {
    const prozent = Math.round(item.fortschritt || 0);
    const fotos = item.fotoAnzahl || 0;
    const farbe = statusFarbe(item.status);
    const meta = [item.adresse, fotos ? `${fotos} Fotos` : ""].filter(Boolean).join("  ·  ");
    return (
      <Pressable
        onPress={() =>
          navigation.navigate("BaustelleDetail", { baustelleId: item.id })
        }
        style={({ pressed }) => [styles.zeile, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.zeileOben}>
          <View style={[styles.punkt, { backgroundColor: farbe }]} />
          <Text style={styles.bName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.bStatus, { color: farbe }]} numberOfLines={1}>
            {item.status || ""}
          </Text>
        </View>
        {item.angebotsNummer || meta || prozent > 0 ? (
          <View style={styles.zeileMitte}>
            <Text style={styles.bMeta} numberOfLines={1}>
              {item.angebotsNummer ? (
                <Text style={styles.bNummer}>
                  {item.angebotsNummer}
                  {meta ? "  ·  " : ""}
                </Text>
              ) : null}
              {meta}
            </Text>
            {prozent > 0 ? <Text style={styles.bProzent}>{prozent} %</Text> : null}
          </View>
        ) : null}
        {prozent > 0 ? (
          <Fortschritt prozent={prozent} style={styles.bBalken} />
        ) : null}
      </Pressable>
    );
  }

  if (laedt) return <Ladeanzeige text="Baustellen werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={reihen}
        keyExtractor={(i) => i.id}
        renderItem={zeile}
        ListHeaderComponent={
          <>
            {kopf()}
            <Fehlerkasten text={fehler} />
          </>
        }
        ListEmptyComponent={
          istMitarbeiter ? (
            <Leerzustand
              symbol="🏗️"
              titel="Keine Baustelle zugewiesen"
              text="Sobald Ihnen eine Baustelle zugewiesen wird, erscheint sie hier."
            />
          ) : (
            <Leerzustand
              symbol="🏗️"
              titel="Noch keine Baustelle"
              text="Legen Sie Ihre erste Baustelle an, um Fotos, Maße und Material zu dokumentieren."
              knopfTitel="+ Neue Baustelle"
              onKnopf={() => navigation.navigate("NeueBaustelle")}
            />
          )
        }
        contentContainerStyle={styles.liste}
        ListFooterComponent={
          // Welcher Stand hier gerade läuft. Klingt nach Kleinkram, ist es
          // nicht: Eine installierte Web-App hält die alte Fassung hartnäckig
          // im Zwischenspeicher. Am 05.09. hat genau das eine halbe Stunde
          // Fehlersuche gekostet — der Kalender war längst da, im Browser lag
          // aber noch die Fassung davor. Ein Tippen darauf lädt neu.
          <Pressable
            onPress={() => {
              if (Platform.OS === "web" && typeof window !== "undefined") {
                window.location.reload(true);
              }
            }}
            hitSlop={10}
          >
            <Text style={styles.stand}>
              Stand {VERSION.stand}
              {Platform.OS === "web" ? "  ·  tippen zum Neuladen" : ""}
            </Text>
          </Pressable>
        }
      />

      {istHandwerker && baustellen.length > 0 ? (
        <View style={styles.fussLeiste}>
          <Knopf
            titel="+ Neue Baustelle"
            onPress={() => navigation.navigate("NeueBaustelle")}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  // Auf großen Bildschirmen nicht über die ganze Breite ziehen.
  liste: {
    padding: 16,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  kopfBereich: { marginBottom: 12 },
  kopf: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  linkReihe: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 10,
  },
  link: { ...schrift.bodyMed, fontSize: 13, color: farben.textWeich },
  hallo: {
    ...schrift.head,
    fontSize: 24,
    color: farben.text,
    letterSpacing: 0.5,
  },
  untertitel: {
    ...schrift.body,
    fontSize: 12,
    color: farben.textMatt,
    marginTop: 2,
  },
  abmelden: {
    ...schrift.bodyMed,
    fontSize: 13,
    color: farben.textMatt,
    paddingTop: 4,
  },
  zeile: {
    backgroundColor: farben.glas,
    borderWidth: 1,
    borderColor: farben.linie,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  zeileOben: { flexDirection: "row", alignItems: "center", gap: 8 },
  punkt: { width: 8, height: 8, borderRadius: 4 },
  bName: {
    ...schrift.head,
    flex: 1,
    fontSize: 17,
    color: farben.text,
    letterSpacing: 0.3,
  },
  bStatus: { ...schrift.body, fontSize: 11 },
  zeileMitte: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 3,
    paddingLeft: 16,
  },
  bMeta: { ...schrift.body, flex: 1, fontSize: 12, color: farben.textMatt },
  bNummer: { ...schrift.bodyMed, color: farben.textWeich },
  bProzent: { ...schrift.headHalb, fontSize: 13, color: farben.text },
  bBalken: { height: 3, marginTop: 7, marginLeft: 16 },
  monat: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 8,
  },
  stand: {
    ...schrift.body,
    fontSize: 11,
    color: farben.textMatt,
    textAlign: "center",
    marginTop: 18,
  },
  fussLeiste: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: farben.linie,
    backgroundColor: farben.bg,
  },
});
