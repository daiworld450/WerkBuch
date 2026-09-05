// ---------------------------------------------------------------------------
// BaustellenListScreen.js — Startbildschirm nach dem Login.
// Alle Baustellen mit handwerkerId == uid — es gibt keine Kunden-Sicht mehr.
// Live über onSnapshot.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, onSnapshot } from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Fortschritt from "../components/Fortschritt";
import Statuspunkt from "../components/Statuspunkt";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";

export default function BaustellenListScreen({ navigation }) {
  const { profil, abmelden } = useAuth();
  const [baustellen, setBaustellen] = useState([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!profil) return;
    const q = query(collection(db, "baustellen"), where("handwerkerId", "==", profil.id));

    const stop = onSnapshot(
      q,
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Nach Erstelldatum absteigend sortieren (clientseitig, kein Index nötig)
        liste.sort((a, b) => {
          const ta = a.erstelltAm?.seconds || 0;
          const tb = b.erstelltAm?.seconds || 0;
          return tb - ta;
        });
        setBaustellen(liste);
        setLaedt(false);
        setFehler("");
      },
      (e) => {
        setFehler(fehlerText(e));
        setLaedt(false);
      }
    );
    return stop;
  }, [profil]);

  function kopf() {
    return (
      <View style={styles.kopf}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hallo}>Hallo {profil?.name || ""}</Text>
          <Pill text="Handwerker" style={{ marginTop: 8 }} />
        </View>
        <Pressable
          onPress={() => navigation.navigate("Einsatzplan")}
          hitSlop={10}
          style={{ marginRight: 18 }}
        >
          <Text style={styles.einsatzplanLink}>📅 Einsatzplan</Text>
        </Pressable>
        <Pressable onPress={abmelden} hitSlop={10}>
          <Text style={styles.abmelden}>Abmelden</Text>
        </Pressable>
      </View>
    );
  }

  function karte({ item }) {
    return (
      <Karte
        onPress={() =>
          navigation.navigate("BaustelleDetail", { baustelleId: item.id })
        }
        style={{ marginBottom: 14 }}
      >
        <Text style={styles.bName}>{item.name}</Text>
        {item.adresse ? (
          <Text style={styles.bAdresse}>{item.adresse}</Text>
        ) : null}

        <View style={styles.bStatusReihe}>
          <Statuspunkt status={item.status} />
          <Text style={styles.bFotos}>{item.fotoAnzahl || 0} Fotos</Text>
        </View>

        <View style={styles.bFortschritt}>
          <Fortschritt prozent={item.fortschritt || 0} style={{ flex: 1 }} />
          <Text style={styles.bProzent}>{Math.round(item.fortschritt || 0)} %</Text>
        </View>
      </Karte>
    );
  }

  if (laedt) return <Ladeanzeige text="Baustellen werden geladen …" />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={baustellen}
        keyExtractor={(i) => i.id}
        renderItem={karte}
        ListHeaderComponent={
          <>
            {kopf()}
            <Fehlerkasten text={fehler} />
          </>
        }
        ListEmptyComponent={
          <Leerzustand
            symbol="🏗️"
            titel="Noch keine Baustelle"
            text="Legen Sie Ihre erste Baustelle an, um Fotos, Maße und Material zu dokumentieren."
            knopfTitel="+ Neue Baustelle"
            onKnopf={() => navigation.navigate("NeueBaustelle")}
          />
        }
        contentContainerStyle={styles.liste}
      />

      {baustellen.length > 0 ? (
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
  liste: { padding: 20, paddingBottom: 40 },
  kopf: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  hallo: {
    ...schrift.head,
    fontSize: groessen.h1,
    color: farben.text,
    letterSpacing: 0.5,
  },
  abmelden: {
    ...schrift.bodyMed,
    fontSize: 14,
    color: farben.textMatt,
    paddingTop: 6,
  },
  einsatzplanLink: {
    ...schrift.bodyMed,
    fontSize: 14,
    color: farben.textWeich,
    paddingTop: 6,
  },
  bName: {
    ...schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
  },
  bAdresse: {
    ...schrift.body,
    fontSize: 14,
    color: farben.textMatt,
    marginTop: 3,
  },
  bStatusReihe: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  bFotos: { ...schrift.body, fontSize: 13, color: farben.textMatt },
  bFortschritt: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  bProzent: {
    ...schrift.head,
    fontSize: 16,
    color: farben.text,
    letterSpacing: 0.5,
    minWidth: 46,
    textAlign: "right",
  },
  fussLeiste: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: farben.linie,
    backgroundColor: farben.bg,
  },
});
