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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, radius } from "../theme";
import Knopf from "../components/Knopf";
import Fortschritt from "../components/Fortschritt";
import { statusFarbe } from "../components/Statuspunkt";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { listenReihen } from "../util/baustellenListe";
import { anzeigeFortschritt } from "../util/baustelle";
import { VERSION } from "../version";

export default function BaustellenListScreen({ navigation }) {
  const { profil, abmelden, istHandwerker, istMitarbeiter } = useAuth();
  // Ab dieser Breite eine Tabelle mit festen Spalten, darunter zweizeilige Zeilen.
  const { width } = useWindowDimensions();
  const schmal = width < 720;
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

        <View style={styles.werkzeugReihe}>
          <Text style={styles.abschnitt}>
            {baustellen.length === 1 ? "1 Baustelle" : `${baustellen.length} Baustellen`}
          </Text>
          {istHandwerker && !schmal ? (
            <Pressable
              onPress={() => navigation.navigate("NeueBaustelle")}
              style={({ pressed }) => [styles.neuKnopf, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.neuText}>+ Neue Baustelle</Text>
            </Pressable>
          ) : null}
        </View>

        {!schmal && baustellen.length > 0 ? (
          <View style={[styles.reihe, styles.spaltenKopf]}>
            <Text style={[styles.spaltenText, styles.spName]}>Kunde</Text>
            <Text style={[styles.spaltenText, styles.spNummer]}>Auftrag</Text>
            <Text style={[styles.spaltenText, styles.spOrt]}>Ort</Text>
            <Text style={[styles.spaltenText, styles.spStatus]}>Status</Text>
            <Text style={[styles.spaltenText, styles.spFotos]}>Fotos</Text>
            <Text style={[styles.spaltenText, styles.spFortschritt]}>Fortschritt</Text>
          </View>
        ) : null}
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

  // Eine Baustelle = eine Zeile. Breit: Tabelle mit festen Spalten (Kunde,
  // Auftrag, Ort, Status, Fotos, Fortschritt). Schmal (Handy): zwei Zeilen.
  // Die Auftragsnummer hält gleichnamige Baustellen (z. B. drei Aufträge für
  // denselben Kunden) auseinander.
  function karte(item) {
    const prozent = anzeigeFortschritt(item);
    const fotos = item.fotoAnzahl || 0;
    const farbe = statusFarbe(item.status);
    const oeffnen = () =>
      navigation.navigate("BaustelleDetail", { baustelleId: item.id });
    const reiheStil = ({ pressed, hovered }) => [
      styles.reihe,
      (pressed || hovered) && styles.reiheHover,
    ];

    if (schmal) {
      const meta = [item.angebotsNummer, item.adresse, fotos ? `${fotos} Fotos` : ""]
        .filter(Boolean)
        .join("  ·  ");
      return (
        <Pressable onPress={oeffnen} style={reiheStil}>
          <View style={styles.schmalInhalt}>
            <View style={styles.schmalOben}>
              <View style={[styles.punkt, { backgroundColor: farbe }]} />
              <Text style={styles.bName} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.bStatus, { color: farbe }]} numberOfLines={1}>
                {item.status || ""}
              </Text>
            </View>
            {meta || prozent > 0 ? (
              <View style={styles.schmalMitte}>
                <Text style={styles.bMeta} numberOfLines={1}>{meta}</Text>
                {prozent > 0 ? <Text style={styles.bProzent}>{prozent} %</Text> : null}
              </View>
            ) : null}
            {prozent > 0 ? <Fortschritt prozent={prozent} style={styles.bBalken} /> : null}
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable onPress={oeffnen} style={reiheStil}>
        <View style={[styles.spName, styles.spNameInhalt]}>
          <View style={[styles.punkt, { backgroundColor: farbe }]} />
          <Text style={styles.bName} numberOfLines={1}>{item.name}</Text>
        </View>
        <Text style={[styles.zelle, styles.spNummer, styles.zelleNummer]} numberOfLines={1}>
          {item.angebotsNummer || ""}
        </Text>
        <Text style={[styles.zelle, styles.spOrt]} numberOfLines={1}>
          {item.adresse || ""}
        </Text>
        <Text style={[styles.zelle, styles.spStatus, { color: farbe }]} numberOfLines={1}>
          {item.status || ""}
        </Text>
        <Text style={[styles.zelle, styles.spFotos]}>{fotos || ""}</Text>
        <View style={styles.spFortschritt}>
          {prozent > 0 ? (
            <>
              <Fortschritt prozent={prozent} style={{ flex: 1, height: 4 }} />
              <Text style={styles.spProzent}>{prozent} %</Text>
            </>
          ) : null}
        </View>
      </Pressable>
    );
  }

  if (laedt) return <Ladeanzeige text="Baustellen werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
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

      {istHandwerker && schmal && baustellen.length > 0 ? (
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

const SPALTEN_ABSTAND = 12;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  // Auf großen Bildschirmen nicht über die ganze Breite ziehen.
  liste: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
  },
  kopfBereich: { marginBottom: 4 },
  kopf: { flexDirection: "row", alignItems: "flex-start" },
  hallo: {
    ...schrift.head,
    fontSize: 28,
    color: farben.text,
    letterSpacing: 0.5,
  },
  untertitel: {
    ...schrift.body,
    fontSize: 13,
    color: farben.textMatt,
    marginTop: 2,
  },
  abmelden: {
    ...schrift.bodyMed,
    fontSize: 13,
    color: farben.textMatt,
    paddingTop: 6,
  },
  linkReihe: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: farben.linie,
  },
  link: { ...schrift.bodyMed, fontSize: 14, color: farben.textWeich },
  werkzeugReihe: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 10,
  },
  abschnitt: {
    ...schrift.headHalb,
    fontSize: 15,
    color: farben.textWeich,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  neuKnopf: {
    backgroundColor: farben.rot,
    borderRadius: radius.pille,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  neuText: {
    ...schrift.head,
    fontSize: 14,
    color: farben.text,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // --- Tabellenzeilen ------------------------------------------------------
  reihe: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPALTEN_ABSTAND,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,.07)",
  },
  reiheHover: { backgroundColor: farben.glasHover },
  spaltenKopf: {
    paddingVertical: 8,
    borderBottomColor: farben.linie,
    backgroundColor: "rgba(255,255,255,.03)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  spaltenText: {
    ...schrift.bodyMed,
    fontSize: 11,
    color: farben.textMatt,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  spName: { flex: 3, minWidth: 0 },
  spNameInhalt: { flexDirection: "row", alignItems: "center", gap: 10 },
  spNummer: { width: 72 },
  spOrt: { flex: 3, minWidth: 0 },
  spStatus: { width: 92 },
  spFotos: { width: 44, textAlign: "right" },
  spFortschritt: {
    width: 132,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  zelle: { ...schrift.body, fontSize: 13, color: farben.textMatt },
  zelleNummer: { ...schrift.bodyMed, color: farben.textWeich },
  spProzent: {
    ...schrift.headHalb,
    fontSize: 13,
    color: farben.text,
    width: 38,
    textAlign: "right",
  },
  punkt: { width: 8, height: 8, borderRadius: 4 },
  bName: {
    ...schrift.head,
    flex: 1,
    fontSize: 17,
    color: farben.text,
    letterSpacing: 0.3,
  },

  // --- schmal (Handy) ------------------------------------------------------
  schmalInhalt: { flex: 1 },
  schmalOben: { flexDirection: "row", alignItems: "center", gap: 8 },
  schmalMitte: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 3,
    paddingLeft: 16,
  },
  bStatus: { ...schrift.body, fontSize: 11 },
  bMeta: { ...schrift.body, flex: 1, fontSize: 12, color: farben.textMatt },
  bProzent: { ...schrift.headHalb, fontSize: 13, color: farben.text },
  bBalken: { height: 3, marginTop: 7, marginLeft: 16 },

  monat: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 22,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  stand: {
    ...schrift.body,
    fontSize: 11,
    color: farben.textMatt,
    textAlign: "center",
    marginTop: 24,
  },
  fussLeiste: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: farben.linie,
    backgroundColor: farben.bg,
  },
});
