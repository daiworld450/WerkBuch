// ---------------------------------------------------------------------------
// PortalScreen.js — die Ansicht für den Kunden, geöffnet über seinen
// persönlichen Link. Ohne Anmeldung, ohne App-Installation.
//
// Fünf Schritte in einem Bildschirm (Spezifikation Kapitel 7):
//   uebersicht  → Angebot ansehen, Summe immer sichtbar
//   zulagen     → Zusatzleistungen wählen (nie vorangekreuzt)
//   pruefen     → Zusammenfassung, Einwilligungen, verbindlicher Knopf
//   fertig      → Bestätigung
//
// Bewusst ein Bildschirm mit innerem Ablauf statt fünf einzelner Seiten: der
// Weg ist linear, und ein versehentliches Zurückspringen mitten in einer
// Beauftragung soll gar nicht erst möglich sein.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Alert from "../util/dialog";
import { pdfSeitenBild } from "../cloudinary";
import * as Portal from "../portal";
import { farben, schrift, groessen, radius } from "../theme";
import Karte from "../components/Karte";
import Knopf from "../components/Knopf";
import Feld from "../components/Feld";
import Ladeanzeige from "../components/Ladeanzeige";
import { datumDe } from "../util/format";

const euroCent = (cent) =>
  ((cent || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// --------------------------------------------------------------- Bausteine

function Kopfzeile({ daten }) {
  const gueltig = daten.gueltigBis ? new Date(daten.gueltigBis) : null;
  const tageRest = gueltig ? Math.ceil((gueltig - new Date()) / 86400000) : null;
  const knapp = tageRest != null && tageRest <= daten.countdownAbTagen;

  return (
    <View style={styles.kopf}>
      <Text style={styles.marke}>BERISA BAU</Text>
      <Text style={styles.kopfTitel}>{daten.baustelle?.name || "Ihr Angebot"}</Text>
      {daten.baustelle?.adresse ? (
        <Text style={styles.kopfAdresse}>{daten.baustelle.adresse}</Text>
      ) : null}
      {gueltig ? (
        <Text style={[styles.gueltig, knapp && styles.gueltigKnapp]}>
          {daten.abgelaufen
            ? "Frist abgelaufen"
            : knapp
            ? `Nur noch ${tageRest} ${tageRest === 1 ? "Tag" : "Tage"} gültig`
            : `Gültig bis ${datumDe(gueltig)}`}
        </Text>
      ) : null}
    </View>
  );
}

// Eine PDF-Seite als Bild — dasselbe Verfahren wie in der App: kein
// PDF-Betrachter, also auch keine Leiste zum Herunterladen oder Teilen.
function PdfSeite({ url, breite }) {
  const [verhaeltnis, setVerhaeltnis] = useState(1.414); // A4 als Startwert

  useEffect(() => {
    let aktiv = true;
    Image.getSize(
      url,
      (w, h) => {
        if (aktiv && w > 0) setVerhaeltnis(h / w);
      },
      () => {}
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

function Wasserzeichen({ text }) {
  return (
    <View style={styles.wzWrap} pointerEvents="none">
      {Array.from({ length: 10 }).map((_, r) => (
        <View key={r} style={styles.wzReihe}>
          {Array.from({ length: 4 }).map((__, c) => (
            <Text key={c} style={styles.wzText}>
              {text}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// Karte für eine wählbare Zusatzleistung. Menge über Plus/Minus, damit auf
// dem Handy nichts eingetippt werden muss.
function ZulagenKarte({ zulage, menge, onAendern }) {
  const manuell = zulage.typ === "manuell";
  return (
    <Karte style={styles.zulageKarte} ausgewaehlt={menge > 0}>
      <View style={styles.zulageKopf}>
        <Text style={styles.zulageName}>{zulage.name}</Text>
        {manuell ? (
          <Text style={styles.zulagePreisFrei}>auf Anfrage</Text>
        ) : (
          <Text style={styles.zulagePreis}>{euroCent(zulage.preisCent)}</Text>
        )}
      </View>
      <Text style={styles.zulageText}>{zulage.beschreibung}</Text>

      {zulage.staffeln?.length > 1 ? (
        <Text style={styles.staffelHinweis}>
          Ab {zulage.staffeln[1].abMenge} Stück je {euroCent(zulage.staffeln[1].preisCent)}
        </Text>
      ) : null}

      <View style={styles.stepper}>
        <Pressable
          onPress={() => onAendern(Math.max(0, menge - 1))}
          disabled={menge <= 0}
          style={({ pressed }) => [
            styles.stepKnopf,
            menge <= 0 && styles.stepAus,
            pressed && styles.stepGedrueckt,
          ]}
        >
          <Text style={styles.stepZeichen}>−</Text>
        </Pressable>

        <Text style={styles.stepMenge}>{menge}</Text>

        <Pressable
          onPress={() => onAendern(Math.min(zulage.maxMenge || 10, menge + 1))}
          disabled={menge >= (zulage.maxMenge || 10)}
          style={({ pressed }) => [
            styles.stepKnopf,
            menge >= (zulage.maxMenge || 10) && styles.stepAus,
            pressed && styles.stepGedrueckt,
          ]}
        >
          <Text style={styles.stepZeichen}>+</Text>
        </Pressable>

        {zulage.gibtGuthaben > 0 ? (
          <Text style={styles.guthabenHinweis}>
            +{zulage.gibtGuthaben} {zulage.gibtGuthaben === 1 ? "Entwurf" : "Entwürfe"}
          </Text>
        ) : null}
      </View>
    </Karte>
  );
}

// Ankreuzfeld. Bewusst groß genug, um auf dem Handy sicher zu treffen.
function Ankreuzfeld({ text, wert, onAendern, pflicht }) {
  return (
    <Pressable onPress={() => onAendern(!wert)} style={styles.kreuzZeile}>
      <View style={[styles.kreuzKasten, wert && styles.kreuzGesetzt]}>
        {wert ? <Text style={styles.kreuzHaken}>✓</Text> : null}
      </View>
      <Text style={styles.kreuzText}>
        {text}
        {pflicht ? <Text style={styles.kreuzPflicht}> *</Text> : null}
      </Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ Screen

export default function PortalScreen({ route }) {
  const token = route?.params?.token;
  const { width: fensterBreite } = useWindowDimensions();

  const [daten, setDaten] = useState(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState(null);
  const [schritt, setSchritt] = useState("uebersicht");

  const [auswahl, setAuswahl] = useState({}); // { sku: menge }
  const [summe, setSumme] = useState(null);
  const [pruefung, setPruefung] = useState(null);

  const [codeAngefordert, setCodeAngefordert] = useState(false);
  const [codeEingabe, setCodeEingabe] = useState("");
  const [codeZiel, setCodeZiel] = useState("");
  const [einwilligungen, setEinwilligungen] = useState({});
  const [arbeitet, setArbeitet] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);
  const [rueckfrage, setRueckfrage] = useState("");

  // Der Schlüssel wird EINMAL je Sitzung erzeugt und bei jedem Versuch
  // mitgeschickt. Dadurch erkennt der Server einen zweiten Klick als
  // Wiederholung, statt zweimal zu beauftragen.
  const schluessel = useMemo(() => Portal.idempotenzSchluessel(), []);

  const neuLaden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const antwort = await Portal.angebotLaden({ token });
      setDaten(antwort);
    } catch (e) {
      setFehler(e.message);
    } finally {
      setLaedt(false);
    }
  }, [token]);

  useEffect(() => {
    neuLaden();
  }, [neuLaden]);

  // Summe bei jeder Mengenänderung serverseitig neu berechnen. Der Client
  // rechnet bewusst nicht selbst — sonst gäbe es zwei Wahrheiten über den
  // Preis, und die im Browser wäre manipulierbar.
  useEffect(() => {
    if (!daten) return;
    const eintraege = Object.entries(auswahl)
      .filter(([, m]) => m > 0)
      .map(([sku, menge]) => ({ sku, menge }));

    if (eintraege.length === 0) {
      setSumme(null);
      setPruefung(null);
      return;
    }
    let aktiv = true;
    Portal.zulagenRechnen({ token, auswahl: eintraege })
      .then((a) => {
        if (!aktiv) return;
        setSumme(a.summe);
        setPruefung(a.pruefung);
      })
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, [auswahl, daten, token]);

  const angebotCent = daten?.angebot?.betragCent || 0;
  const zulagenCent = summe?.bruttoCent || 0;
  const gesamtCent = angebotCent + zulagenCent;
  // Enthaltene Umsatzsteuer aus dem Bruttobetrag herausgerechnet — alle
  // Leistungen dieses Moduls liegen beim Regelsatz.
  const ustCent = gesamtCent - Math.round(gesamtCent / 1.19);

  async function codeHolen() {
    setArbeitet(true);
    try {
      const a = await Portal.codeAnfordern({ token });
      setCodeZiel(a.gesendetAn);
      setCodeAngefordert(true);
    } catch (e) {
      Alert.alert("Fehler", e.message);
    } finally {
      setArbeitet(false);
    }
  }

  async function codeAbsenden() {
    setArbeitet(true);
    try {
      await Portal.codePruefen({ token, code: codeEingabe });
      setDaten((d) => ({ ...d, verifiziert: true }));
      setCodeEingabe("");
    } catch (e) {
      Alert.alert("Code stimmt nicht", e.message);
    } finally {
      setArbeitet(false);
    }
  }

  async function beauftragen() {
    setArbeitet(true);
    try {
      const eintraege = Object.entries(auswahl)
        .filter(([, m]) => m > 0)
        .map(([sku, menge]) => ({ sku, menge }));

      const antwort = await Portal.freigeben({
        token,
        idempotenzSchluessel: schluessel,
        erwarteterAbdruck: daten.angebot.abdruck,
        erwarteterBetragCent: gesamtCent,
        auswahl: eintraege,
        einwilligungen,
      });
      setErgebnis(antwort);
      setSchritt("fertig");
    } catch (e) {
      // Hat sich das Angebot zwischenzeitlich geändert, wird der Kunde nicht
      // mit einer technischen Meldung allein gelassen, sondern bekommt die
      // aktuelle Fassung neu geladen.
      if (e.code === "CONFLICT_DOCUMENT_CHANGED" || e.code === "CONFLICT_AMOUNT_CHANGED") {
        Alert.alert("Das Angebot hat sich geändert", e.message, [
          {
            text: "Aktuelle Fassung ansehen",
            onPress: () => {
              setSchritt("uebersicht");
              neuLaden();
            },
          },
        ]);
      } else {
        Alert.alert("Nicht möglich", e.message);
      }
    } finally {
      setArbeitet(false);
    }
  }

  function ablehnenFragen() {
    Alert.alert("Angebot ablehnen?", "Möchten Sie dieses Angebot ablehnen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Ablehnen",
        style: "destructive",
        onPress: async () => {
          setArbeitet(true);
          try {
            await Portal.ablehnen({ token, idempotenzSchluessel: `${schluessel}-nein` });
            setErgebnis({ entscheidung: "abgelehnt" });
            setSchritt("fertig");
          } catch (e) {
            Alert.alert("Fehler", e.message);
          } finally {
            setArbeitet(false);
          }
        },
      },
    ]);
  }

  async function rueckfrageAbsenden() {
    if (!rueckfrage.trim()) return;
    setArbeitet(true);
    try {
      await Portal.rueckfrageSenden({ token, nachricht: rueckfrage });
      setRueckfrage("");
      Alert.alert("Danke", "Ihre Frage ist bei uns eingegangen. Wir melden uns.");
    } catch (e) {
      Alert.alert("Fehler", e.message);
    } finally {
      setArbeitet(false);
    }
  }

  // ------------------------------------------------------------- Zustände

  if (laedt) return <Ladeanzeige text="Angebot wird geladen …" />;

  if (fehler) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.mitte}>
          <Text style={styles.fehlerSymbol}>🔒</Text>
          <Text style={styles.fehlerTitel}>Kein Zugriff</Text>
          <Text style={styles.fehlerText}>{fehler}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!daten?.angebot) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.mitte}>
          <Text style={styles.fehlerSymbol}>📄</Text>
          <Text style={styles.fehlerTitel}>Noch kein Angebot</Text>
          <Text style={styles.fehlerText}>
            Sobald Ihr Angebot fertig ist, sehen Sie es an dieser Stelle.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // --------------------------------------------------------------- fertig
  if (schritt === "fertig") {
    const angenommen = ergebnis?.entscheidung === "angenommen";
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.mitte}>
            <View style={[styles.hakenKreis, !angenommen && styles.hakenKreisRot]}>
              <Text style={styles.hakenGross}>{angenommen ? "✓" : "✕"}</Text>
            </View>
            <Text style={styles.fertigTitel}>
              {angenommen ? "Vielen Dank für Ihren Auftrag" : "Rückmeldung erhalten"}
            </Text>

            {angenommen ? (
              <>
                <Text style={styles.fertigBetrag}>{euroCent(ergebnis.gesamtCent)}</Text>
                <Text style={styles.fertigText}>
                  Eine Bestätigung wurde an {daten.kunde.email} gesendet.
                </Text>

                {ergebnis.positionen?.length ? (
                  <Karte style={{ marginTop: 24, width: "100%" }}>
                    <Text style={styles.blockTitel}>Zusätzlich gewählt</Text>
                    {ergebnis.positionen.map((p) => (
                      <View key={p.sku} style={styles.zeile}>
                        <Text style={styles.zeileText}>
                          {p.menge}× {p.name}
                        </Text>
                        <Text style={styles.zeileBetrag}>{euroCent(p.bruttoCent)}</Text>
                      </View>
                    ))}
                    {ergebnis.wartetAufPruefung ? (
                      <Text style={styles.pruefHinweis}>
                        Wir prüfen Ihre Zusatzwünsche persönlich und melden uns dazu bei
                        Ihnen.
                      </Text>
                    ) : (
                      <Text style={styles.pruefHinweis}>
                        Zusatzleistungen erscheinen als eigene Position auf der
                        Schlussrechnung.
                      </Text>
                    )}
                  </Karte>
                ) : null}
              </>
            ) : (
              <Text style={styles.fertigText}>
                Ihre Ablehnung ist bei uns eingegangen. Wir melden uns bei Ihnen.
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------- Zulagen
  if (schritt === "zulagen") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.abschnittTitel}>Zusätzliche Leistungen</Text>
          <Text style={styles.abschnittText}>
            Im Angebot enthalten sind bereits {daten.grundpaket.visualisierungen}{" "}
            Visualisierungen. Sie können optional weitere Leistungen hinzufügen — es
            entstehen erst Kosten, wenn Sie am Ende ausdrücklich beauftragen.
          </Text>

          {daten.katalog.map((z) => (
            <ZulagenKarte
              key={z.sku}
              zulage={z}
              menge={auswahl[z.sku] || 0}
              onAendern={(m) => setAuswahl((a) => ({ ...a, [z.sku]: m }))}
            />
          ))}

          {pruefung?.noetig ? (
            <View style={styles.hinweisKasten}>
              <Text style={styles.hinweisText}>
                {pruefung.grund === "sonderwunsch"
                  ? "Für Ihren Sonderwunsch melden wir uns mit einem Festpreis — es entstehen dadurch noch keine Kosten."
                  : "Ihre Auswahl schauen wir uns persönlich an und bestätigen sie Ihnen. Es wird nichts automatisch ausgelöst."}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <SummenLeiste
          angebotCent={angebotCent}
          zulagenCent={zulagenCent}
          gesamtCent={gesamtCent}
          knopf="Weiter zur Übersicht"
          onKnopf={() => setSchritt("pruefen")}
          zurueck={() => setSchritt("uebersicht")}
        />
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------- Prüfen
  if (schritt === "pruefen") {
    const pflichtOffen = Object.entries(daten.einwilligungen)
      .filter(([, r]) => r.pflicht)
      .some(([k]) => !einwilligungen[k]);

    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.abschnittTitel}>Ihre Beauftragung</Text>

          <Karte style={{ marginBottom: 14 }}>
            <Text style={styles.blockTitel}>Leistung</Text>
            <View style={styles.zeile}>
              <Text style={styles.zeileText}>{daten.baustelle.name}</Text>
              <Text style={styles.zeileBetrag}>{euroCent(angebotCent)}</Text>
            </View>
          </Karte>

          {summe?.positionen?.length ? (
            <Karte style={{ marginBottom: 14 }}>
              <Text style={styles.blockTitel}>Zusätzlich gewählt</Text>
              {summe.positionen.map((p) => (
                <View key={p.sku} style={styles.zeile}>
                  <Text style={styles.zeileText}>
                    {p.menge}× {p.name}
                    <Text style={styles.zeileKlein}>  je {euroCent(p.einzelBruttoCent)}</Text>
                  </Text>
                  <Text style={styles.zeileBetrag}>{euroCent(p.bruttoCent)}</Text>
                </View>
              ))}
            </Karte>
          ) : null}

          <Karte style={{ marginBottom: 18 }}>
            <View style={styles.zeile}>
              <Text style={styles.zeileText}>Nettobetrag</Text>
              <Text style={styles.zeileBetrag}>{euroCent(gesamtCent - ustCent)}</Text>
            </View>
            <View style={styles.zeile}>
              <Text style={styles.zeileText}>enthaltene Umsatzsteuer 19 %</Text>
              <Text style={styles.zeileBetrag}>{euroCent(ustCent)}</Text>
            </View>
            <View style={[styles.zeile, styles.zeileGesamt]}>
              <Text style={styles.gesamtLabel}>Gesamt inkl. MwSt.</Text>
              <Text style={styles.gesamtBetrag}>{euroCent(gesamtCent)}</Text>
            </View>
          </Karte>

          <Text style={styles.blockTitel}>Zahlung</Text>
          <Text style={styles.abschnittText}>
            Die Abrechnung erfolgt wie gewohnt per Rechnung. Zusätzlich gewählte
            Leistungen erscheinen als eigene Position auf der Schlussrechnung — Sie
            zahlen hier nichts online.
          </Text>

          {/* Verifikation: ohne bestätigten Code keine Beauftragung */}
          {!daten.verifiziert ? (
            <Karte style={styles.verifyKarte}>
              <Text style={styles.blockTitel}>Kurze Bestätigung</Text>
              <Text style={styles.abschnittText}>
                Zu Ihrer Sicherheit senden wir Ihnen einen Code per E-Mail. Erst damit
                können Sie verbindlich beauftragen.
              </Text>
              {!codeAngefordert ? (
                <Knopf
                  titel="Code per E-Mail anfordern"
                  variante="sekundaer"
                  laedt={arbeitet}
                  onPress={codeHolen}
                />
              ) : (
                <>
                  <Text style={styles.codeZiel}>Gesendet an {codeZiel}</Text>
                  <Feld
                    wert={codeEingabe}
                    onChangeText={setCodeEingabe}
                    platzhalter="6-stelliger Code"
                    keyboardType="number-pad"
                  />
                  <Knopf
                    titel="Code bestätigen"
                    variante="sekundaer"
                    laedt={arbeitet}
                    deaktiviert={codeEingabe.trim().length < 6}
                    onPress={codeAbsenden}
                    style={{ marginTop: 10 }}
                  />
                  <Pressable onPress={codeHolen}>
                    <Text style={styles.nochmal}>Neuen Code senden</Text>
                  </Pressable>
                </>
              )}
            </Karte>
          ) : (
            <>
              <Text style={styles.blockTitel}>Bitte bestätigen</Text>
              {Object.entries(daten.einwilligungen).map(([schluessel, regel]) => (
                <Ankreuzfeld
                  key={schluessel}
                  text={regel.text}
                  pflicht={regel.pflicht}
                  wert={!!einwilligungen[schluessel]}
                  onAendern={(w) => setEinwilligungen((e) => ({ ...e, [schluessel]: w }))}
                />
              ))}

              <Knopf
                titel={daten.knopfBeschriftung}
                laedt={arbeitet}
                deaktiviert={pflichtOffen || daten.abgelaufen}
                onPress={beauftragen}
                style={{ marginTop: 20 }}
              />
              <Text style={styles.pflichtHinweis}>* Pflichtangabe</Text>
            </>
          )}

          <Pressable onPress={() => setSchritt("zulagen")}>
            <Text style={styles.zurueckLink}>← Auswahl ändern</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------------- Übersicht
  const wzText = `${daten.kunde.name || "Kunde"} · ${datumDe(new Date())}`;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Kopfzeile daten={daten} />

        {daten.abgelaufen ? (
          <View style={styles.hinweisKasten}>
            <Text style={styles.hinweisText}>
              Die Frist für dieses Angebot ist abgelaufen. Sie können es weiterhin
              ansehen — für eine Beauftragung fordern Sie bitte ein neues Angebot an.
            </Text>
          </View>
        ) : null}

        <View style={styles.pdfRahmen}>
          <PdfSeiten
            pdfUrl={daten.angebot.pdfUrl}
            seiten={daten.angebot.seiten}
            breite={Math.min(fensterBreite, 720) - 48}
          />
          <Wasserzeichen text={wzText} />
        </View>

        <Text style={styles.blockTitel}>Eine Frage zum Angebot?</Text>
        <Feld
          wert={rueckfrage}
          onChangeText={setRueckfrage}
          platzhalter="Ihre Frage an uns …"
          multiline
          numberOfLines={4}
          style={{ minHeight: 100, textAlignVertical: "top" }}
        />
        <Knopf
          titel="Frage senden"
          variante="ghost"
          laedt={arbeitet}
          deaktiviert={!rueckfrage.trim()}
          onPress={rueckfrageAbsenden}
          style={{ marginTop: 10 }}
        />

        <Pressable onPress={ablehnenFragen} style={{ marginTop: 28 }}>
          <Text style={styles.ablehnenLink}>Angebot ablehnen</Text>
        </Pressable>
      </ScrollView>

      {!daten.abgelaufen ? (
        <SummenLeiste
          angebotCent={angebotCent}
          zulagenCent={zulagenCent}
          gesamtCent={gesamtCent}
          knopf="Angebot annehmen"
          zweitKnopf="Zusatzleistungen ansehen"
          onZweitKnopf={() => setSchritt("zulagen")}
          onKnopf={() => setSchritt("pruefen")}
        />
      ) : null}
    </SafeAreaView>
  );
}

function PdfSeiten({ pdfUrl, seiten = 1, breite }) {
  const urls = Array.from({ length: Math.max(1, seiten) }, (_, i) => pdfSeitenBild(pdfUrl, i + 1));
  return (
    <>
      {urls.map((u) => (
        <PdfSeite key={u} url={u} breite={breite} />
      ))}
    </>
  );
}

// Summenleiste, die am unteren Rand stehen bleibt (Spezifikation Kapitel 7):
// Der Gesamtbetrag soll nie aus dem Blick geraten.
function SummenLeiste({ angebotCent, zulagenCent, gesamtCent, knopf, onKnopf, zweitKnopf, onZweitKnopf, zurueck }) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.leiste}>
      <View style={styles.leisteZeile}>
        <View>
          <Text style={styles.leisteLabel}>Gesamt inkl. MwSt.</Text>
          {zulagenCent > 0 ? (
            <Text style={styles.leisteAufteilung}>
              {euroCent(angebotCent)} + {euroCent(zulagenCent)} Zusatz
            </Text>
          ) : null}
        </View>
        <Text style={styles.leisteBetrag}>{euroCent(gesamtCent)}</Text>
      </View>

      {zweitKnopf ? (
        <Knopf titel={zweitKnopf} variante="ghost" onPress={onZweitKnopf} style={{ marginBottom: 10 }} />
      ) : null}
      <Knopf titel={knopf} onPress={onKnopf} />
      {zurueck ? (
        <Pressable onPress={zurueck}>
          <Text style={styles.zurueckLink}>← Zurück</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: farben.bg },
  scroll: { padding: 24, paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: "center" },
  mitte: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },

  kopf: { marginBottom: 20 },
  marke: { ...schrift.head, fontSize: 13, color: farben.rot, letterSpacing: 3 },
  kopfTitel: { ...schrift.head, fontSize: groessen.h1, color: farben.text, marginTop: 8, letterSpacing: 0.5 },
  kopfAdresse: { ...schrift.body, fontSize: 14, color: farben.textMatt, marginTop: 4 },
  gueltig: { ...schrift.bodyMed, fontSize: 13, color: farben.textMatt, marginTop: 10 },
  gueltigKnapp: { color: farben.rotHell },

  pdfRahmen: {
    backgroundColor: "#000",
    borderRadius: radius.klein,
    padding: 12,
    marginBottom: 24,
    overflow: "hidden",
  },
  wzWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
    justifyContent: "space-around",
    transform: [{ rotate: "-45deg" }],
  },
  wzReihe: { flexDirection: "row", justifyContent: "space-around" },
  wzText: { color: "#fff", opacity: 0.12, fontSize: 15, ...schrift.headHalb, letterSpacing: 1 },

  abschnittTitel: { ...schrift.head, fontSize: groessen.h2, color: farben.text, marginBottom: 10, letterSpacing: 0.5 },
  abschnittText: { ...schrift.body, fontSize: 15, color: farben.textWeich, lineHeight: 23, marginBottom: 18 },
  blockTitel: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 10,
  },

  zulageKarte: { marginBottom: 12 },
  zulageKopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  zulageName: { ...schrift.head, fontSize: 18, color: farben.text, flex: 1, letterSpacing: 0.3 },
  zulagePreis: { ...schrift.head, fontSize: 18, color: farben.text },
  zulagePreisFrei: { ...schrift.bodyMed, fontSize: 14, color: farben.textMatt },
  zulageText: { ...schrift.body, fontSize: 14, color: farben.textWeich, lineHeight: 21, marginTop: 6 },
  staffelHinweis: { ...schrift.body, fontSize: 12, color: farben.gruen, marginTop: 6 },

  stepper: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 14 },
  stepKnopf: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: farben.linie,
    backgroundColor: farben.feldBg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepAus: { opacity: 0.3 },
  stepGedrueckt: { backgroundColor: farben.glasHover },
  stepZeichen: { ...schrift.head, fontSize: 22, color: farben.text, lineHeight: 26 },
  stepMenge: { ...schrift.head, fontSize: 20, color: farben.text, minWidth: 28, textAlign: "center" },
  guthabenHinweis: { ...schrift.body, fontSize: 12, color: farben.gruen, marginLeft: "auto" },

  zeile: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, gap: 12 },
  zeileText: { ...schrift.body, fontSize: 15, color: farben.textWeich, flex: 1 },
  zeileKlein: { fontSize: 12, color: farben.textMatt },
  zeileBetrag: { ...schrift.bodyMed, fontSize: 15, color: farben.text },
  zeileGesamt: { borderTopWidth: 1, borderTopColor: farben.linie, marginTop: 10, paddingTop: 14 },
  gesamtLabel: { ...schrift.head, fontSize: 17, color: farben.text, letterSpacing: 0.5 },
  gesamtBetrag: { ...schrift.head, fontSize: 24, color: farben.text, letterSpacing: 0.5 },

  verifyKarte: { marginTop: 10, marginBottom: 10 },
  codeZiel: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginBottom: 10 },
  nochmal: { ...schrift.body, fontSize: 13, color: farben.textMatt, textAlign: "center", marginTop: 12, textDecorationLine: "underline" },

  kreuzZeile: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 11 },
  kreuzKasten: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: farben.linie,
    backgroundColor: farben.feldBg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  kreuzGesetzt: { backgroundColor: farben.rot, borderColor: farben.rot },
  kreuzHaken: { color: "#fff", fontSize: 15, fontWeight: "700" },
  kreuzText: { ...schrift.body, fontSize: 14, color: farben.textWeich, flex: 1, lineHeight: 21 },
  kreuzPflicht: { color: farben.rot },
  pflichtHinweis: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 10, textAlign: "center" },

  hinweisKasten: {
    backgroundColor: "rgba(16,50,207,.14)",
    borderWidth: 1,
    borderColor: "rgba(42,78,239,.4)",
    borderRadius: radius.klein,
    padding: 16,
    marginBottom: 18,
  },
  hinweisText: { ...schrift.body, fontSize: 14, color: farben.textWeich, lineHeight: 21 },
  pruefHinweis: { ...schrift.body, fontSize: 13, color: farben.textMatt, marginTop: 12, lineHeight: 20 },

  leiste: {
    borderTopWidth: 1,
    borderTopColor: farben.linie,
    backgroundColor: "rgba(11,11,15,.96)",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  leisteZeile: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  leisteLabel: { ...schrift.bodyMed, fontSize: 13, color: farben.textMatt },
  leisteAufteilung: { ...schrift.body, fontSize: 12, color: farben.textMatt, marginTop: 2 },
  leisteBetrag: { ...schrift.head, fontSize: 26, color: farben.text, letterSpacing: 0.5 },

  zurueckLink: { ...schrift.bodyMed, fontSize: 14, color: farben.textMatt, textAlign: "center", marginTop: 14 },
  ablehnenLink: { ...schrift.body, fontSize: 14, color: farben.textMatt, textAlign: "center", textDecorationLine: "underline" },

  fehlerSymbol: { fontSize: 52, marginBottom: 16 },
  fehlerTitel: { ...schrift.head, fontSize: groessen.h2, color: farben.text, marginBottom: 10, textAlign: "center" },
  fehlerText: { ...schrift.body, fontSize: 15, color: farben.textMatt, textAlign: "center", lineHeight: 23 },

  hakenKreis: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(56,209,122,.16)",
    borderWidth: 2,
    borderColor: farben.gruen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  hakenKreisRot: { backgroundColor: farben.auswahlBg, borderColor: farben.rot },
  hakenGross: { fontSize: 44, color: farben.text },
  fertigTitel: { ...schrift.head, fontSize: groessen.h2, color: farben.text, textAlign: "center", letterSpacing: 0.5 },
  fertigBetrag: { ...schrift.head, fontSize: 34, color: farben.text, marginTop: 14, letterSpacing: 0.5 },
  fertigText: { ...schrift.body, fontSize: 14, color: farben.textMatt, textAlign: "center", marginTop: 12, lineHeight: 21 },
});
