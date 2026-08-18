// ---------------------------------------------------------------------------
// VisualisierungScreen.js — Vorher-Nachher-Entwurf direkt auf der Baustelle.
//
// Der eigentliche Zweck: Der Handwerker sitzt beim Aufmaßtermin im alten Bad,
// fotografiert es, wählt einen Stil und zeigt dem Kunden eine Minute später,
// wie sein Bad aussehen kann. Das überzeugt beim Termin — nicht drei Tage
// später per E-Mail.
//
// Fertige Entwürfe werden an der Baustelle gespeichert. Der Kunde sieht sie
// damit in seinem eigenen Zugang wieder, zusammen mit allem anderen.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Platform,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as ScreenCapture from "expo-screen-capture";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen, textStil, radius } from "../theme";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Feld from "../components/Feld";
import Karte from "../components/Karte";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import Fehlerkasten from "../components/Fehlerkasten";
import fehlerText from "../util/fehler";
import { stileHolen, entwurfErstellen, istEingerichtet } from "../bauvision";

const BUDGETS = [
  { id: "sparsam", text: "Preisbewusst" },
  { id: "mittel", text: "Gehoben" },
  { id: "gehoben", text: "Hochwertig" },
];

export default function VisualisierungScreen({ route, navigation }) {
  const { baustelleId } = route.params;
  const { istHandwerker } = useAuth();

  const [stile, setStile] = useState([]);
  const [stil, setStil] = useState(null);
  const [budget, setBudget] = useState("mittel");
  const [wuensche, setWuensche] = useState("");

  const [fotoUri, setFotoUri] = useState(null);
  const [fotoBase64, setFotoBase64] = useState(null);

  const [rechnet, setRechnet] = useState(false);
  const [ergebnis, setErgebnis] = useState(null); // { vorher, bilder[] }
  const [ansicht, setAnsicht] = useState(0);      // 0 = vorher, 1..n = Entwürfe
  const [fehler, setFehler] = useState("");

  const [gespeicherte, setGespeicherte] = useState([]);
  const [laedt, setLaedt] = useState(true);

  // Kopierschutz, solange dieser Bildschirm sichtbar ist — wie in FotosScreen.
  useFocusEffect(
    useCallback(() => {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );

  // Bereits gespeicherte Entwürfe dieser Baustelle mitlesen.
  useEffect(() => {
    const stop = onSnapshot(
      collection(db, "baustellen", baustelleId, "visualisierungen"),
      (snap) => {
        const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        liste.sort((a, b) => (b.erstelltAm?.seconds || 0) - (a.erstelltAm?.seconds || 0));
        setGespeicherte(liste);
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  // Stilauswahl holen. Scheitert das, bleibt der Rest trotzdem bedienbar.
  useEffect(() => {
    if (!istEingerichtet() || !istHandwerker) return;
    stileHolen("bad")
      .then(setStile)
      .catch(() => setFehler("Die Stilauswahl konnte nicht geladen werden."));
  }, [istHandwerker]);

  // -------------------------------------------------------------- Foto

  async function fotoWaehlen() {
    if (Platform.OS === "web") {
      quelle("galerie");
      return;
    }
    Alert.alert("Foto des Raums", "Woher möchten Sie das Foto?", [
      { text: "Kamera", onPress: () => quelle("kamera") },
      { text: "Galerie", onPress: () => quelle("galerie") },
      { text: "Abbrechen", style: "cancel" },
    ]);
  }

  async function quelle(art) {
    try {
      let erg;
      if (art === "kamera") {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) {
          Alert.alert("Kein Zugriff", "Bitte erlauben Sie den Kamerazugriff in den Einstellungen.");
          return;
        }
        erg = await ImagePicker.launchCameraAsync({ quality: 1 });
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) {
          Alert.alert("Kein Zugriff", "Bitte erlauben Sie den Fotozugriff in den Einstellungen.");
          return;
        }
        erg = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
      }
      if (erg.canceled || !erg.assets?.length) return;

      // Auf 1600 px verkleinern: das reicht dem Modell völlig und spart auf
      // der Baustelle — wo das Netz oft schwach ist — spürbar Zeit.
      const klein = await ImageManipulator.manipulateAsync(
        erg.assets[0].uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setFotoUri(klein.uri);
      setFotoBase64(klein.base64);
      setErgebnis(null);
      setFehler("");
    } catch (e) {
      setFehler(fehlerText(e));
    }
  }

  // ---------------------------------------------------------- Erzeugen

  async function erzeugen() {
    if (!fotoBase64) {
      setFehler("Bitte zuerst ein Foto des Raums aufnehmen.");
      return;
    }
    if (!stil) {
      setFehler("Bitte einen Stil auswählen.");
      return;
    }
    setFehler("");
    setRechnet(true);
    try {
      const daten = await entwurfErstellen({
        bildBase64: fotoBase64,
        stil,
        gewerk: "bad",
        wuensche: wuensche.trim(),
        budget,
      });
      setErgebnis(daten);
      setAnsicht(1);
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setRechnet(false);
    }
  }

  async function speichern() {
    if (!ergebnis) return;
    try {
      const stilName = stile.find((s) => s.id === stil)?.name || stil;
      await addDoc(collection(db, "baustellen", baustelleId, "visualisierungen"), {
        vorherUrl: ergebnis.vorher,
        entwuerfe: ergebnis.bilder.map((b) => b.url),
        stil,
        stilName,
        budget,
        wuensche: wuensche.trim(),
        erstelltAm: serverTimestamp(),
      });
      Alert.alert(
        "Gespeichert",
        "Der Entwurf liegt jetzt bei der Baustelle. Ihr Kunde sieht ihn in seinem Zugang."
      );
      setErgebnis(null);
      setFotoUri(null);
      setFotoBase64(null);
      setWuensche("");
    } catch (e) {
      setFehler(fehlerText(e));
    }
  }

  // ---------------------------------------------------------- Anzeige

  if (laedt) return <Ladeanzeige text="Entwürfe werden geladen …" />;

  if (rechnet) {
    return (
      <Ladeanzeige text="Ihr Entwurf wird gerechnet — das dauert etwa eine Minute …" />
    );
  }

  // Der Kunde sieht nur die gespeicherten Entwürfe, erzeugt aber selbst keine.
  if (!istHandwerker) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {gespeicherte.length === 0 ? (
            <Leerzustand
              symbol="🎨"
              titel="Noch kein Entwurf"
              text="Sobald wir einen Gestaltungsentwurf für Ihr Bad erstellt haben, sehen Sie ihn hier."
            />
          ) : (
            gespeicherte.map((e) => <GespeicherterEntwurf key={e.id} eintrag={e} />)
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!istEingerichtet()) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Leerzustand
            symbol="⚙️"
            titel="Noch nicht eingerichtet"
            text={
              "Der Entwurfs-Dienst ist noch nicht verbunden. In der Datei " +
              "src/bauvision.js muss die Adresse des Dienstes eingetragen werden. " +
              "Die Anleitung dazu liegt unter bauvision/README.md."
            }
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Was gerade im großen Bild steht.
  const grossesBild =
    ergebnis && ansicht > 0 ? ergebnis.bilder[ansicht - 1]?.url : ergebnis?.vorher || fotoUri;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Fehlerkasten text={fehler} />

        {/* ---------------- Foto ---------------- */}
        <Text style={styles.abschnitt}>1 · Foto des Raums</Text>
        {grossesBild ? (
          <View>
            <Image source={{ uri: grossesBild }} style={styles.grossesBild} />
            {ergebnis ? (
              <View style={styles.umschalter}>
                <Pill text="Vorher" aktiv={ansicht === 0} onPress={() => setAnsicht(0)} />
                {ergebnis.bilder.map((_, i) => (
                  <Pill
                    key={i}
                    text={`Entwurf ${i + 1}`}
                    aktiv={ansicht === i + 1}
                    onPress={() => setAnsicht(i + 1)}
                  />
                ))}
              </View>
            ) : (
              <Knopf
                titel="Anderes Foto"
                variante="ghost"
                onPress={fotoWaehlen}
                style={{ marginTop: 12 }}
              />
            )}
          </View>
        ) : (
          <Pressable onPress={fotoWaehlen} style={styles.ablage}>
            <Text style={styles.ablageSymbol}>📷</Text>
            <Text style={styles.ablageTitel}>Foto aufnehmen</Text>
            <Text style={styles.ablageText}>
              Am besten aus der Türöffnung, mit Licht an — dann ist der ganze Raum drauf.
            </Text>
          </Pressable>
        )}

        {/* ---------------- Ergebnis speichern ---------------- */}
        {ergebnis ? (
          <>
            <Text style={styles.hinweis}>{ergebnis.hinweis}</Text>
            <Knopf titel="Bei der Baustelle speichern" onPress={speichern} style={{ marginTop: 16 }} />
            <Knopf
              titel="Neuer Entwurf"
              variante="ghost"
              onPress={() => {
                setErgebnis(null);
                setAnsicht(0);
              }}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <>
            {/* ---------------- Stil ---------------- */}
            <Text style={styles.abschnitt}>2 · Stil</Text>
            <View style={styles.pillReihe}>
              {stile.map((s) => (
                <Pill
                  key={s.id}
                  text={s.name}
                  aktiv={stil === s.id}
                  onPress={() => setStil(s.id)}
                  style={styles.pill}
                />
              ))}
            </View>
            {stil ? (
              <Text style={styles.stilKurz}>
                {stile.find((s) => s.id === stil)?.kurz || ""}
              </Text>
            ) : null}

            <Text style={styles.abschnitt}>3 · Ausstattung</Text>
            <View style={styles.pillReihe}>
              {BUDGETS.map((b) => (
                <Pill
                  key={b.id}
                  text={b.text}
                  aktiv={budget === b.id}
                  onPress={() => setBudget(b.id)}
                  style={styles.pill}
                />
              ))}
            </View>

            <Feld
              label="Wünsche des Kunden (freiwillig)"
              wert={wuensche}
              onChangeText={setWuensche}
              platzhalter="z. B. Dusche statt Wanne, bodengleich, dunkler Boden"
              multiline
              numberOfLines={3}
              maxLength={400}
            />

            <Knopf
              titel="Entwurf erstellen"
              onPress={erzeugen}
              deaktiviert={!fotoBase64 || !stil}
              style={{ marginTop: 18 }}
            />
          </>
        )}

        {/* ---------------- Frühere Entwürfe ---------------- */}
        {gespeicherte.length > 0 && (
          <>
            <Text style={[styles.abschnitt, { marginTop: 34 }]}>Frühere Entwürfe</Text>
            {gespeicherte.map((e) => (
              <GespeicherterEntwurf key={e.id} eintrag={e} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Ein gespeicherter Entwurf: Vorher klein, Entwürfe daneben.
function GespeicherterEntwurf({ eintrag }) {
  const [gross, setGross] = useState(eintrag.entwuerfe?.[0] || eintrag.vorherUrl);
  const alle = [eintrag.vorherUrl, ...(eintrag.entwuerfe || [])];

  return (
    <Karte style={{ marginTop: 14 }}>
      <Text style={styles.eintragTitel}>{eintrag.stilName || eintrag.stil}</Text>
      {eintrag.wuensche ? (
        <Text style={styles.eintragText}>„{eintrag.wuensche}"</Text>
      ) : null}
      <Image source={{ uri: gross }} style={styles.eintragBild} />
      <View style={styles.miniReihe}>
        {alle.filter(Boolean).map((u, i) => (
          <Pressable key={i} onPress={() => setGross(u)}>
            <Image
              source={{ uri: u }}
              style={[styles.mini, gross === u && styles.miniAktiv]}
            />
          </Pressable>
        ))}
      </View>
      <Text style={styles.miniBeschriftung}>
        {alle.length > 1 ? "Links das Original, daneben die Entwürfe" : ""}
      </Text>
    </Karte>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 18, paddingBottom: 60 },

  abschnitt: {
    ...schrift.head,
    fontSize: 15,
    color: farben.textMatt,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 12,
  },

  ablage: {
    borderWidth: 2,
    borderColor: farben.linie,
    borderStyle: "dashed",
    borderRadius: radius.karte,
    padding: 34,
    alignItems: "center",
    backgroundColor: farben.glas,
  },
  ablageSymbol: { fontSize: 40, marginBottom: 10 },
  ablageTitel: { ...schrift.head, fontSize: 19, color: farben.text, marginBottom: 6 },
  ablageText: { ...textStil.klein, textAlign: "center" },

  grossesBild: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.karte,
    backgroundColor: farben.bgErhoben,
  },
  umschalter: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },

  pillReihe: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { marginBottom: 2 },
  stilKurz: { ...textStil.klein, marginTop: 10 },

  hinweis: {
    ...textStil.klein,
    marginTop: 16,
    padding: 13,
    borderRadius: radius.feld,
    backgroundColor: "rgba(16,50,207,.12)",
    borderWidth: 1,
    borderColor: "rgba(16,50,207,.3)",
  },

  eintragTitel: { ...schrift.head, fontSize: 18, color: farben.text, marginBottom: 4 },
  eintragText: { ...textStil.klein, marginBottom: 10 },
  eintragBild: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.klein,
    backgroundColor: farben.bgErhoben,
  },
  miniReihe: { flexDirection: "row", gap: 8, marginTop: 10 },
  mini: {
    width: 62,
    height: 48,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: farben.bgErhoben,
  },
  miniAktiv: { borderColor: farben.rot },
  miniBeschriftung: { ...textStil.klein, fontSize: 11, marginTop: 8 },
});
