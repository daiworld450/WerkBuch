// ---------------------------------------------------------------------------
// AngebotScreen.js — Angebots-PDF.
// Handwerker: PDF hochladen, Betrag setzen, Status per Chips, Vorschau.
// Kunde: bildschirmfüllende Ansicht ohne Speichern/Teilen/Drucken,
//        Annehmen/Ablehnen bei Status "Gesendet", Wasserzeichen, Kopierschutz.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import Alert from "../util/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as ScreenCapture from "expo-screen-capture";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
} from "firebase/firestore";

import { db } from "../firebase";
import { ladeDateiHoch, pdfSeitenBild } from "../cloudinary";
import { linkVersenden } from "../portal";
import { useAuth } from "../context/AuthContext";
import { farben, schrift, groessen } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Pill from "../components/Pill";
import Feld from "../components/Feld";
import Leerzustand from "../components/Leerzustand";
import Ladeanzeige from "../components/Ladeanzeige";
import { datumDe, datumZeitDe, euroDe } from "../util/format";
import fehlerText from "../util/fehler";

// Der Handwerker steuert nur Entwurf/Gesendet direkt. "Angenommen" und
// "Abgelehnt" sind die Entscheidung des Kunden — die zeigt der Handwerker
// nur als Abzeichen an, statt sie versehentlich manuell setzen zu können.
const HANDWERKER_STATUS = ["Entwurf", "Gesendet"];
const KUNDEN_STATUS = ["Angenommen", "Abgelehnt"];

// Wasserzeichen-Gitter: halbtransparent, diagonal, nicht anklickbar.
function Wasserzeichen({ text }) {
  const reihen = Array.from({ length: 10 });
  const spalten = Array.from({ length: 4 });
  return (
    <View style={styles.wzWrap} pointerEvents="none">
      {reihen.map((_, r) => (
        <View key={r} style={styles.wzReihe}>
          {spalten.map((__, c) => (
            <Text key={c} style={styles.wzText}>
              {text}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// Eine einzelne PDF-Seite als Bild — ermittelt ihr echtes Seitenverhältnis
// (Hoch- oder Querformat, nicht jedes PDF ist A4) und passt die Höhe exakt
// an, damit die Seite vollständig und unverzerrt zu sehen ist.
function PdfSeite({ url, breite }) {
  // A4-Hochformat als Startwert, bis die echte Größe bekannt ist —
  // vermeidet ein Springen von Nullhöhe auf die richtige Höhe.
  const [verhaeltnis, setVerhaeltnis] = useState(1.414);

  useEffect(() => {
    let aktiv = true;
    Image.getSize(
      url,
      (w, h) => {
        if (aktiv && w > 0) setVerhaeltnis(h / w);
      },
      () => {} // bei Fehler beim A4-Startwert bleiben
    );
    return () => {
      aktiv = false;
    };
  }, [url]);

  return (
    <Image
      source={{ uri: url }}
      style={{
        width: breite,
        height: breite * verhaeltnis,
        backgroundColor: "#fff",
        marginBottom: 10,
        borderRadius: 8,
      }}
      resizeMode="contain"
    />
  );
}

// Zeigt alle PDF-Seiten als Bilder — funktioniert auf iPhone, Android und im
// Web identisch; ganz ohne PDF-Betrachter oder Download-Knopf.
function PdfSeiten({ pdfUrl, seiten = 1, breite }) {
  const urls = Array.from({ length: Math.max(1, seiten) }, (_, i) =>
    pdfSeitenBild(pdfUrl, i + 1)
  );
  return (
    <>
      {urls.map((u, i) => (
        <PdfSeite key={u} url={u} breite={breite} />
      ))}
    </>
  );
}

export default function AngebotScreen({ route }) {
  const { baustelleId, kundeEmail, kundeName } = route.params;
  const { profil, istHandwerker } = useAuth();
  const { width: fensterBreite } = useWindowDimensions();

  const [angebot, setAngebot] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [hochladen, setHochladen] = useState(false);
  const [betrag, setBetrag] = useState("");
  const [mail, setMail] = useState(kundeEmail || "");
  const [versendet, setVersendet] = useState(false);
  const [versendeLaeuft, setVersendeLaeuft] = useState(false);
  const [freigaben, setFreigaben] = useState([]);
  const [zulagen, setZulagen] = useState([]);

  // Kopierschutz für den Kunden (und auch beim Handwerker unschädlich)
  useFocusEffect(
    useCallback(() => {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );

  useEffect(() => {
    const stop = onSnapshot(
      doc(db, "baustellen", baustelleId, "angebot", "aktuell"),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setAngebot(d);
          if (d.betrag != null) setBetrag(String(d.betrag));
        } else {
          setAngebot(null);
        }
        setLaedt(false);
      },
      () => setLaedt(false)
    );
    return stop;
  }, [baustelleId]);

  // Freigaben und Zulagen-Bestellungen mitverfolgen — nur für den Handwerker
  // relevant, deshalb erst gar nicht abonnieren, wenn ein Kunde zusieht.
  useEffect(() => {
    if (!istHandwerker) return;
    const stopFreigaben = onSnapshot(
      query(collection(db, "baustellen", baustelleId, "freigaben"), orderBy("erstelltAm", "desc")),
      (snap) => setFreigaben(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    const stopZulagen = onSnapshot(
      collection(db, "baustellen", baustelleId, "zulagenBestellungen"),
      (snap) => setZulagen(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return () => {
      stopFreigaben();
      stopZulagen();
    };
  }, [baustelleId, istHandwerker]);

  async function linkSenden() {
    const adresse = mail.trim().toLowerCase();
    if (!adresse.includes("@")) {
      Alert.alert("E-Mail fehlt", "Bitte tragen Sie die E-Mail-Adresse des Kunden ein.");
      return;
    }
    setVersendeLaeuft(true);
    try {
      const antwort = await linkVersenden({ baustelleId, email: adresse, kundeName });
      setVersendet(true);
      Alert.alert(
        "Link versendet",
        `Der Kunde hat den Angebots-Link an ${antwort.gesendetAn} bekommen. Gültig bis ${datumDe(
          antwort.gueltigBis
        )}.`
      );
    } catch (e) {
      Alert.alert("Versand nicht möglich", e.message);
    } finally {
      setVersendeLaeuft(false);
    }
  }

  async function pdfWaehlen() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const datei = res.assets[0];

      // Cloudinary (Gratis-Tarif) erlaubt max. 10 MB pro Datei
      if (datei.size && datei.size > 9.5 * 1024 * 1024) {
        Alert.alert(
          "PDF zu groß",
          `Die Datei ist ${(datei.size / 1024 / 1024).toFixed(1)} MB groß. Maximal möglich sind 10 MB. Bitte verkleinern Sie das PDF (z. B. beim Export „reduzierte Größe“ wählen).`
        );
        return;
      }
      await pdfHochladen(datei);
    } catch (e) {
      Alert.alert("Fehler", e?.message || fehlerText(e));
    }
  }

  async function pdfHochladen(datei) {
    setHochladen(true);
    try {
      const { url, publicId, seiten } = await ladeDateiHoch(datei.uri, {
        typ: "pdf",
        dateiname: datei.name,
      });

      await setDoc(doc(db, "baustellen", baustelleId, "angebot", "aktuell"), {
        pdfUrl: url,
        pdfPfad: publicId,
        seiten: seiten || 1,
        dateiname: datei.name,
        betrag: betrag.trim() ? Number(betrag.replace(",", ".")) : null,
        status: "Gesendet", // automatisch beim Hochladen
        hochgeladenVon: profil.id,
        aktualisiertAm: serverTimestamp(),
      });
    } catch (e) {
      // Upload-Fehler mit konkreter Ursache anzeigen (hilft bei der Diagnose)
      const text = e?.message?.startsWith("Upload fehlgeschlagen")
        ? e.message
        : fehlerText(e);
      Alert.alert("Upload fehlgeschlagen", text);
    } finally {
      setHochladen(false);
    }
  }

  async function statusSetzen(neu) {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId, "angebot", "aktuell"), {
        status: neu,
        aktualisiertAm: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  async function betragSpeichern() {
    try {
      await updateDoc(doc(db, "baustellen", baustelleId, "angebot", "aktuell"), {
        betrag: betrag.trim() ? Number(betrag.replace(",", ".")) : null,
        aktualisiertAm: serverTimestamp(),
      });
      Alert.alert("Gespeichert", "Der Betrag wurde gespeichert.");
    } catch (e) {
      Alert.alert("Fehler", fehlerText(e));
    }
  }

  function zuruecksetzenFragen() {
    Alert.alert(
      "Auf „Gesendet“ zurücksetzen?",
      "Die Entscheidung des Kunden wird gelöscht — z. B. wenn der Kunde telefonisch eine Änderung mitgeteilt hat.",
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Zurücksetzen", style: "destructive", onPress: () => statusSetzen("Gesendet") },
      ]
    );
  }

  function kundeEntscheidung(neu) {
    const wort = neu === "Angenommen" ? "annehmen" : "ablehnen";
    Alert.alert(
      `Angebot ${wort}?`,
      `Möchten Sie das Angebot verbindlich ${wort}?`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: neu, onPress: () => statusSetzen(neu) },
      ]
    );
  }

  if (laedt) return <Ladeanzeige text="Angebot wird geladen …" />;

  // ---------------------------------------------------------------- KUNDE
  if (!istHandwerker) {
    if (!angebot) {
      return (
        <SafeAreaView style={styles.safe} edges={["bottom"]}>
          <Leerzustand
            symbol="📄"
            titel="Noch kein Angebot"
            text="Sobald Ihr Handwerker ein Angebot hochlädt, sehen Sie es hier."
          />
        </SafeAreaView>
      );
    }
    const wzText = `${profil?.name || "Kunde"} · ${datumDe(new Date())}`;
    return (
      <View style={styles.safe}>
        <View style={styles.kInfo}>
          <Pill text={angebot.status} aktiv={angebot.status === "Angenommen" || angebot.status === "Abgelehnt"} />
          <Text style={styles.kDatei} numberOfLines={1}>{angebot.dateiname}</Text>
        </View>

        <View style={styles.pdfWrap}>
          <ScrollView contentContainerStyle={styles.pdfScrollKunde}>
            <PdfSeiten
              pdfUrl={angebot.pdfUrl}
              seiten={angebot.seiten || 1}
              breite={fensterBreite - 24}
            />
          </ScrollView>
          <Wasserzeichen text={wzText} />
        </View>

        {angebot.status === "Gesendet" ? (
          <SafeAreaView edges={["bottom"]} style={styles.kAktionen}>
            <View style={{ flex: 1 }}>
              <Knopf titel="Angebot annehmen" variante="sekundaer" onPress={() => kundeEntscheidung("Angenommen")} style={styles.annehmen} />
            </View>
            <View style={{ flex: 1 }}>
              <Knopf titel="Ablehnen" onPress={() => kundeEntscheidung("Abgelehnt")} />
            </View>
          </SafeAreaView>
        ) : null}
      </View>
    );
  }

  // ------------------------------------------------------------ HANDWERKER
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {hochladen ? (
          <View style={styles.uploadReihe}>
            <ActivityIndicator color={farben.rot} />
            <Text style={styles.uploadText}>PDF wird hochgeladen …</Text>
          </View>
        ) : (
          <Knopf
            titel={angebot ? "Neues PDF hochladen" : "Angebots-PDF hochladen"}
            onPress={pdfWaehlen}
          />
        )}

        {angebot ? (
          <>
            <Karte style={{ marginTop: 18 }}>
              <View style={styles.hKopf}>
                <Text style={styles.hDatei} numberOfLines={1}>{angebot.dateiname}</Text>
                <Pill text={angebot.status} aktiv={angebot.status === "Angenommen" || angebot.status === "Abgelehnt"} />
              </View>
              <Text style={styles.hDatum}>
                Aktualisiert: {datumDe(angebot.aktualisiertAm)}
              </Text>
              {angebot.betrag != null ? (
                <Text style={styles.hBetrag}>{euroDe(angebot.betrag)}</Text>
              ) : null}
            </Karte>

            <Text style={styles.label}>Betrag (€)</Text>
            <View style={styles.betragReihe}>
              <View style={{ flex: 1 }}>
                <Feld wert={betrag} onChangeText={setBetrag} keyboardType="decimal-pad" platzhalter="0,00" />
              </View>
              <Knopf titel="Speichern" variante="sekundaer" onPress={betragSpeichern} style={styles.betragKnopf} />
            </View>

            <Text style={styles.label}>Status</Text>
            {KUNDEN_STATUS.includes(angebot.status) ? (
              // Kunde hat bereits entschieden — nur anzeigen, nicht antippbar.
              <View style={styles.entscheidungBox}>
                <View
                  style={[
                    styles.entscheidungBadge,
                    angebot.status === "Angenommen" ? styles.badgeGruen : styles.badgeRot,
                  ]}
                >
                  <Text style={styles.entscheidungText}>
                    {angebot.status === "Angenommen" ? "✓ Angenommen" : "✕ Abgelehnt"}
                  </Text>
                </View>
                <Text style={styles.entscheidungHinweis}>
                  Diese Entscheidung hat der Kunde getroffen.
                </Text>
                <Knopf
                  titel="Auf „Gesendet“ zurücksetzen"
                  variante="ghost"
                  onPress={zuruecksetzenFragen}
                  style={{ marginTop: 12 }}
                />
              </View>
            ) : (
              <View style={styles.chips}>
                {HANDWERKER_STATUS.map((s) => (
                  <Pill key={s} text={s} aktiv={angebot.status === s} onPress={() => statusSetzen(s)} style={{ marginRight: 8, marginBottom: 8 }} />
                ))}
              </View>
            )}

            {/* Angebots-Link an den Kunden — er braucht dafür kein Konto */}
            <Text style={styles.label}>Link an den Kunden</Text>
            <Text style={styles.linkErklaerung}>
              Der Kunde bekommt einen persönlichen Link und sieht das Angebot direkt
              auf dem Handy — ohne Anmeldung. Zusatzleistungen kann er dort selbst
              dazuwählen.
            </Text>
            <Feld
              wert={mail}
              onChangeText={setMail}
              platzhalter="kunde@beispiel.de"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Knopf
              titel={versendet ? "Link erneut senden" : "Angebots-Link senden"}
              variante="sekundaer"
              laedt={versendeLaeuft}
              onPress={linkSenden}
            />

            {/* Nachweis der Freigabe: was hat der Kunde wann bestätigt? */}
            {freigaben.length > 0 ? (
              <>
                <Text style={styles.label}>Freigabe des Kunden</Text>
                {freigaben.map((f) => (
                  <Karte key={f.id} style={{ marginBottom: 10 }}>
                    <View style={styles.hKopf}>
                      <Text style={styles.freigabeArt}>
                        {f.entscheidung === "angenommen" ? "✓ Beauftragt" : "✕ Abgelehnt"}
                      </Text>
                      {f.betragBruttoCent ? (
                        <Text style={styles.freigabeBetrag}>
                          {euroDe(f.betragBruttoCent / 100)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.freigabeZeile}>
                      {f.kundeName || f.kundeMail} · {datumZeitDe(f.erstelltAm)}
                    </Text>
                    <Text style={styles.freigabeKlein}>
                      Bestätigt per E-Mail-Code
                      {f.ipAdresse ? ` · ${f.ipAdresse}` : ""}
                    </Text>
                  </Karte>
                ))}
              </>
            ) : null}

            {/* Zulagen laufen über die Schlussrechnung, nicht über Online-Zahlung */}
            {zulagen.length > 0 ? (
              <>
                <Text style={styles.label}>Für die Schlussrechnung</Text>
                <Karte>
                  {zulagen.map((b) => (
                    <View key={b.id} style={{ marginBottom: 12 }}>
                      {b.status === "wartet_auf_pruefung" ? (
                        <Text style={styles.wartetHinweis}>
                          ⚠ Wartet auf Ihre Prüfung
                          {b.pruefGrund === "sonderwunsch"
                            ? " (Sonderwunsch)"
                            : b.pruefGrund === "summe"
                            ? " (über der Betragsgrenze)"
                            : b.pruefGrund === "anzahl"
                            ? " (über der Stückzahlgrenze)"
                            : ""}
                        </Text>
                      ) : null}
                      {(b.positionen || []).map((p) => (
                        <View key={p.sku} style={styles.zulagenZeile}>
                          <Text style={styles.zulagenText}>
                            {p.menge}× {p.name}
                          </Text>
                          <Text style={styles.zulagenBetrag}>{euroDe(p.bruttoCent / 100)}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                  <View style={styles.zulagenSumme}>
                    <Text style={styles.zulagenSummeLabel}>Summe Zusatzleistungen</Text>
                    <Text style={styles.zulagenSummeBetrag}>
                      {euroDe(zulagen.reduce((s, b) => s + (b.bruttoCent || 0), 0) / 100)}
                    </Text>
                  </View>
                  <Text style={styles.zulagenHinweis}>
                    Diese Positionen gehören auf die Schlussrechnung — es wurde nichts
                    online bezahlt.
                  </Text>
                </Karte>
              </>
            ) : null}

            <Text style={styles.label}>Vorschau</Text>
            <View style={styles.hPdfWrap}>
              <ScrollView contentContainerStyle={styles.pdfScrollHandwerker}>
                <PdfSeiten
                  pdfUrl={angebot.pdfUrl}
                  seiten={angebot.seiten || 1}
                  breite={fensterBreite - 72}
                />
              </ScrollView>
            </View>
          </>
        ) : (
          <Text style={styles.leer}>
            Noch kein Angebot hochgeladen. Wählen Sie oben eine PDF-Datei aus.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  uploadReihe: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14 },
  uploadText: { ...schrift.body, fontSize: 14, color: farben.textWeich },

  // Kunde
  kInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: farben.linie,
  },
  kDatei: { flex: 1, ...schrift.body, fontSize: 14, color: farben.textWeich },
  pdfWrap: { flex: 1, backgroundColor: "#000" },
  pdfScrollKunde: { paddingVertical: 16, paddingHorizontal: 12, alignItems: "center" },
  kAktionen: { flexDirection: "row", gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: farben.linie },
  annehmen: { backgroundColor: farben.gruen },

  // Wasserzeichen
  wzWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
    justifyContent: "space-around",
    transform: [{ rotate: "-45deg" }],
  },
  wzReihe: { flexDirection: "row", justifyContent: "space-around" },
  wzText: {
    color: "#ffffff",
    opacity: 0.12,
    fontSize: 15,
    ...schrift.headHalb,
    letterSpacing: 1,
  },

  // Handwerker
  hKopf: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  hDatei: { flex: 1, ...schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5 },
  hDatum: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 8 },
  hBetrag: { ...schrift.head, fontSize: 24, color: farben.text, letterSpacing: 0.5, marginTop: 10 },
  label: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  betragReihe: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  betragKnopf: { paddingHorizontal: 20, paddingVertical: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap" },
  entscheidungBox: { alignItems: "flex-start" },
  entscheidungBadge: {
    borderRadius: 500,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  badgeGruen: {
    backgroundColor: "rgba(56,209,122,.14)",
    borderColor: "rgba(56,209,122,.4)",
  },
  badgeRot: {
    backgroundColor: farben.auswahlBg,
    borderColor: farben.rot,
  },
  entscheidungText: {
    ...schrift.headHalb,
    fontSize: 15,
    color: farben.text,
    letterSpacing: 0.5,
  },
  entscheidungHinweis: {
    ...schrift.body,
    fontSize: 13,
    color: farben.textMatt,
    marginTop: 8,
  },
  linkErklaerung: {
    ...schrift.body,
    fontSize: 13,
    color: farben.textMatt,
    lineHeight: 20,
    marginBottom: 12,
  },
  freigabeArt: { ...schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5 },
  freigabeBetrag: { ...schrift.head, fontSize: 18, color: farben.text },
  freigabeZeile: { ...schrift.body, fontSize: 14, color: farben.textWeich, marginTop: 8 },
  freigabeKlein: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 4 },
  wartetHinweis: {
    ...schrift.bodyMed,
    fontSize: 13,
    color: farben.rotHell,
    marginBottom: 8,
  },
  zulagenZeile: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    gap: 12,
  },
  zulagenText: { ...schrift.body, fontSize: 14, color: farben.textWeich, flex: 1 },
  zulagenBetrag: { ...schrift.bodyMed, fontSize: 14, color: farben.text },
  zulagenSumme: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: farben.linie,
    paddingTop: 12,
    marginTop: 4,
  },
  zulagenSummeLabel: { ...schrift.headHalb, fontSize: 15, color: farben.text, letterSpacing: 0.5 },
  zulagenSummeBetrag: { ...schrift.head, fontSize: 19, color: farben.text },
  zulagenHinweis: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 10, lineHeight: 18 },
  hPdfWrap: {
    maxHeight: 560,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: farben.linie,
    backgroundColor: "#000",
  },
  pdfScrollHandwerker: { paddingVertical: 16, alignItems: "center" },
  leer: { ...schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 20 },
});
