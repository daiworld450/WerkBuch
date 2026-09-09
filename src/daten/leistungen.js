// ---------------------------------------------------------------------------
// leistungen.js — der Leistungskatalog von Berisa Bau.
//
// AUTOMATISCH ERZEUGT von tools/leistungen-uebernehmen.py aus
// angebote-werkzeug/leistungen.json. Nicht von Hand aendern — Aenderungen
// gehoeren in die Quelle, sonst laufen zwei Preislisten auseinander.
//
// Die Langtexte enthalten die Verweise auf die einschlaegigen DIN-Normen und
// die anerkannten Regeln der Technik. Sie stehen so im Angebot beim Kunden.
//
// Preise sind RICHTPREISE in ganzen Cent, netto.
// ---------------------------------------------------------------------------

export const LEISTUNGEN = [
  {
    "schluessel": "baustelleneinrichtung",
    "reihenfolge": 10,
    "kurztext": "Baustelleneinrichtung",
    "langtext": "An- und Abtransport von Werkzeug, Maschinen und Material. Einrichten des Arbeitsbereichs, Bereitstellen von Stromversorgung und Wasseranschluss, Sichern der Zugangswege.",
    "einheit": "pauschal",
    "preisCent": 18000,
    "arbeitsanteil": 0.85
  },
  {
    "schluessel": "abdeckung_staubschutz",
    "reihenfolge": 20,
    "kurztext": "Staubschutz und Abdeckarbeiten",
    "langtext": "Staubschutzwand zum angrenzenden Wohnbereich, Abdecken von Böden, Türen und verbleibenden Einbauten mit Folie und Malervlies. Rückbau und Entsorgung der Schutzmaßnahmen nach Fertigstellung.",
    "einheit": "pauschal",
    "preisCent": 14500,
    "arbeitsanteil": 0.7
  },
  {
    "schluessel": "demontage_sanitaer",
    "reihenfolge": 30,
    "kurztext": "Demontage Sanitärobjekt",
    "langtext": "Fachgerechtes Abklemmen und Ausbauen je Sanitärobjekt (WC, Waschtisch, Duschabtrennung, Heizkörper). Absperren der Zuleitungen, Verschließen offener Anschlüsse, Zwischenlagerung der wiederverwendbaren Objekte auf der Baustelle.",
    "einheit": "Stk",
    "preisCent": 6500,
    "arbeitsanteil": 1.0
  },
  {
    "schluessel": "rueckbau_fliesen_wand",
    "reihenfolge": 40,
    "kurztext": "Rückbau Wandfliesen",
    "langtext": "Abschlagen des vorhandenen Wandbelags einschließlich Klebebett bis auf den tragfähigen Untergrund. Aufnehmen und Verladen des Abbruchmaterials.",
    "einheit": "m²",
    "preisCent": 2800,
    "arbeitsanteil": 0.95
  },
  {
    "schluessel": "rueckbau_fliesen_boden",
    "reihenfolge": 45,
    "kurztext": "Rückbau Bodenfliesen",
    "langtext": "Abschlagen des vorhandenen Bodenbelags einschließlich Klebebett bis auf den tragfähigen Estrich. Aufnehmen und Verladen des Abbruchmaterials.",
    "einheit": "m²",
    "preisCent": 3200,
    "arbeitsanteil": 0.95
  },
  {
    "schluessel": "rueckbau_bodenbelag",
    "reihenfolge": 45,
    "kurztext": "Aufnehmen des vorhandenen Bodenbelags",
    "langtext": "Aufnehmen von Teppich, Laminat, Vinyl oder PVC einschließlich Sockelleisten und Dämmunterlage. Entfernen von Klebstoffresten, soweit ohne Fräsen möglich.",
    "einheit": "m²",
    "preisCent": 1200,
    "arbeitsanteil": 0.9
  },
  {
    "schluessel": "entsorgung_container",
    "reihenfolge": 50,
    "kurztext": "Bauschuttentsorgung mit Containergestellung",
    "langtext": "Gestellung eines Absetzcontainers (3 m³), Standzeit bis 7 Tage, Abtransport und Entsorgung des mineralischen Bauschutts nach Nachweis. Getrennte Erfassung von Rest- und Verpackungsmaterial. Annahme: der Container kann auf dem Grundstück oder unmittelbar davor abgestellt werden. Eine erforderliche Sondernutzungserlaubnis der Stadt wird gesondert berechnet.",
    "einheit": "pauschal",
    "preisCent": 42000,
    "arbeitsanteil": 0.35
  },
  {
    "schluessel": "untergrundpruefung",
    "reihenfolge": 60,
    "kurztext": "Untergrundprüfung und Protokoll",
    "langtext": "Prüfung des Untergrunds auf Ebenheit, Festigkeit, Haftzugfestigkeit, Restfeuchte und Risse nach den anerkannten Regeln der Technik. Schriftliche Festhaltung des Ergebnisses. Zeigt die Prüfung Mängel, die über die angebotenen Vorbereitungsleistungen hinausgehen, wird vor Ausführung Rücksprache gehalten.",
    "einheit": "pauschal",
    "preisCent": 9500,
    "arbeitsanteil": 1.0
  },
  {
    "schluessel": "untergrund_vorbereitung_wand",
    "reihenfolge": 65,
    "kurztext": "Untergrundvorbereitung Wand",
    "langtext": "Reinigen und Entfetten der Fläche, Entfernen loser Bestandteile, Schließen von Fehlstellen und Ausbrüchen, Anschleifen glasierter Oberflächen zur Verbesserung der Haftung.",
    "einheit": "m²",
    "preisCent": 1400,
    "arbeitsanteil": 0.85
  },
  {
    "schluessel": "untergrund_spachtelung",
    "reihenfolge": 68,
    "kurztext": "Spachtelung der Wandfläche",
    "langtext": "Flächiges Ausspachteln zum Ausgleich von Unebenheiten und Fugenbildern, Schleifen und Entstauben der gespachtelten Fläche.",
    "einheit": "m²",
    "preisCent": 2200,
    "arbeitsanteil": 0.7
  },
  {
    "schluessel": "ausgleichsmasse",
    "reihenfolge": 70,
    "kurztext": "Nivellieren der Bodenfläche",
    "langtext": "Auftragen einer zementären Ausgleichsmasse in einer mittleren Schichtdicke bis 5 mm zur Herstellung einer ebenen, belegreifen Fläche. Ausführung nach DIN 18560. Größere Schichtdicken werden nach Aufmaß abgerechnet.",
    "einheit": "m²",
    "preisCent": 2400,
    "arbeitsanteil": 0.6
  },
  {
    "schluessel": "randdaemmstreifen",
    "reihenfolge": 72,
    "kurztext": "Randdämmstreifen und Bewegungsfugen",
    "langtext": "Anbringen von Randdämmstreifen an allen aufgehenden Bauteilen zur Entkopplung des Bodenaufbaus, Ausbildung erforderlicher Bewegungsfugen, Abschneiden der Streifen nach Aushärtung. Ausführung nach DIN 18560.",
    "einheit": "lfm",
    "preisCent": 480,
    "arbeitsanteil": 0.75
  },
  {
    "schluessel": "grundierung",
    "reihenfolge": 75,
    "kurztext": "Grundierung",
    "langtext": "Auftragen einer auf den Untergrund abgestimmten Grundierung zur Bindung von Restfeuchte und zur Regulierung der Saugfähigkeit. Trocknungszeit nach Herstellerangabe.",
    "einheit": "m²",
    "preisCent": 650,
    "arbeitsanteil": 0.6
  },
  {
    "schluessel": "haftbruecke",
    "reihenfolge": 78,
    "kurztext": "Haftbrücke auf Bestandsfliesen",
    "langtext": "Auftragen einer quarzgefüllten Haftbrücke auf den nicht saugenden Bestandsbelag zur Sicherung des Verbunds der nachfolgenden Schichten.",
    "einheit": "m²",
    "preisCent": 1100,
    "arbeitsanteil": 0.6
  },
  {
    "schluessel": "abdichtung_verbund",
    "reihenfolge": 80,
    "kurztext": "Verbundabdichtung im Spritzwasserbereich",
    "langtext": "Zweilagiges Auftragen einer Verbundabdichtung im Wassereinwirkungsbereich nach DIN 18534. Trocknungszeit zwischen den Lagen nach Herstellervorgabe, Schichtdickenkontrolle im nassen Zustand.",
    "einheit": "m²",
    "preisCent": 3400,
    "arbeitsanteil": 0.75
  },
  {
    "schluessel": "dichtband_ecken",
    "reihenfolge": 82,
    "kurztext": "Dichtbänder in Ecken und Anschlüssen",
    "langtext": "Einbetten systemzugehöriger Dichtbänder in allen Innen- und Außenecken sowie an Wand-Boden-Anschlüssen, überlappend verlegt. Bestandteil der Abdichtung nach DIN 18534.",
    "einheit": "lfm",
    "preisCent": 1250,
    "arbeitsanteil": 0.8
  },
  {
    "schluessel": "dichtmanschette",
    "reihenfolge": 84,
    "kurztext": "Dichtmanschette an Rohrdurchführung",
    "langtext": "Einbetten einer systemzugehörigen Wand- oder Bodenmanschette an jeder Rohrdurchführung und an jeder Armaturenanbindung im Wassereinwirkungsbereich nach DIN 18534.",
    "einheit": "Stk",
    "preisCent": 1800,
    "arbeitsanteil": 0.8
  },
  {
    "schluessel": "fliesen_wand",
    "reihenfolge": 90,
    "kurztext": "Wandfliesen ansetzen",
    "langtext": "Ansetzen des Wandbelags im Dünnbettverfahren nach DIN 18157, Klebstoff nach Format und Untergrund gewählt, bei Formaten ab 60 cm im kombinierten Verfahren. Zuschnitte, Ausschnitte für Armaturen und Steckdosen, fluchtgerechte Ausrichtung. Der Fliesenpreis ist mit 35 EUR/m² Einkauf kalkuliert; abweichende Materialwahl ändert die Position.",
    "einheit": "m²",
    "preisCent": 6200,
    "arbeitsanteil": 0.8
  },
  {
    "schluessel": "fliesen_boden",
    "reihenfolge": 92,
    "kurztext": "Bodenfliesen verlegen",
    "langtext": "Verlegen des Bodenbelags im Dünnbettverfahren nach DIN 18157, hohlraumfrei im Buttering-Floating-Verfahren, Gefälleausbildung zum Ablauf soweit erforderlich. Der Fliesenpreis ist mit 35 EUR/m² Einkauf kalkuliert; abweichende Materialwahl ändert die Position.",
    "einheit": "m²",
    "preisCent": 5800,
    "arbeitsanteil": 0.8
  },
  {
    "schluessel": "sockelleiste_fliese",
    "reihenfolge": 94,
    "kurztext": "Sockelfliesen setzen",
    "langtext": "Zuschneiden und Ansetzen des Sockels aus dem Bodenmaterial, Kanten gesäumt, Anschluss an die Wandfläche elastisch ausgebildet.",
    "einheit": "lfm",
    "preisCent": 1600,
    "arbeitsanteil": 0.85
  },
  {
    "schluessel": "verfugung",
    "reihenfolge": 96,
    "kurztext": "Verfugen der Fläche",
    "langtext": "Verfugen mit zementärem Fugenmörtel im gewählten Farbton, Abwaschen und Nachpolieren der Fläche.",
    "einheit": "m²",
    "preisCent": 900,
    "arbeitsanteil": 0.85
  },
  {
    "schluessel": "mikrozement_haftgrund_fliese",
    "reihenfolge": 100,
    "kurztext": "Haftgrund für Mikrozement auf Bestandsfliesen",
    "langtext": "Reinigen und Entfetten des Bestandsbelags, Auftragen eines quarzgefüllten Spezialhaftgrunds, Einbetten eines Armierungsgewebes im Bereich der Bestandsfugen zur Vermeidung durchzeichnender Fugenbilder.",
    "einheit": "m²",
    "preisCent": 1800,
    "arbeitsanteil": 0.6
  },
  {
    "schluessel": "mikrozement_aufbau_wand",
    "reihenfolge": 105,
    "kurztext": "Mikrozement Wandfläche, mehrlagiger Aufbau",
    "langtext": "Mehrlagiger Aufbau: Grundlage mit Armierungsgewebe, zwei Feinlagen mit Zwischenschliff, fugenlos ausgeführt. Oberflächenstruktur und Farbton nach Bemusterung. Handwerklich hergestellte Oberfläche, leichte Wolkenbildung und Kellenschlag sind gewollt und kein Mangel.",
    "einheit": "m²",
    "preisCent": 9600,
    "arbeitsanteil": 0.75
  },
  {
    "schluessel": "mikrozement_aufbau_boden",
    "reihenfolge": 107,
    "kurztext": "Mikrozement Bodenfläche, mehrlagiger Aufbau",
    "langtext": "Mehrlagiger Aufbau auf der Bodenfläche: Grundlage mit Armierungsgewebe, zwei Feinlagen mit Zwischenschliff, fugenlos ausgeführt, Anschluss an Ablauf und aufgehende Bauteile ausgebildet. Farbton nach Bemusterung.",
    "einheit": "m²",
    "preisCent": 10800,
    "arbeitsanteil": 0.75
  },
  {
    "schluessel": "mikrozement_versiegelung",
    "reihenfolge": 110,
    "kurztext": "Versiegelung der Mikrozementfläche",
    "langtext": "Zweikomponentige Polyurethanversiegelung in zwei bis drei Aufträgen, wasserdicht und reinigungsmittelbeständig, matt. Volle Belastbarkeit nach sieben Tagen.",
    "einheit": "m²",
    "preisCent": 2600,
    "arbeitsanteil": 0.7
  },
  {
    "schluessel": "maler_abkleben",
    "reihenfolge": 120,
    "kurztext": "Abkleben und Abdecken für Malerarbeiten",
    "langtext": "Abkleben von Türen, Fenstern, Zargen, Steckdosen und Bodenanschlüssen, Abdecken der Böden mit Malervlies, Rückbau nach Fertigstellung.",
    "einheit": "pauschal",
    "preisCent": 12000,
    "arbeitsanteil": 0.9
  },
  {
    "schluessel": "maler_untergrund",
    "reihenfolge": 122,
    "kurztext": "Untergrundvorbereitung für Anstrich",
    "langtext": "Reinigen der Fläche, Ausbessern kleiner Fehlstellen und Dübellöcher, Schleifen und Entstauben, Grundierung auf saugenden Untergründen.",
    "einheit": "m²",
    "preisCent": 800,
    "arbeitsanteil": 0.85
  },
  {
    "schluessel": "maler_anstrich",
    "reihenfolge": 125,
    "kurztext": "Anstrich, zweifach deckend",
    "langtext": "Zweifacher deckender Anstrich mit scheuerbeständiger Dispersionsfarbe, Nassabriebklasse 2, Farbton nach Wahl aus dem Standardsortiment. Volltöne und Sonderfarbtöne werden gesondert berechnet.",
    "einheit": "m²",
    "preisCent": 1400,
    "arbeitsanteil": 0.8
  },
  {
    "schluessel": "trittschalldaemmung",
    "reihenfolge": 130,
    "kurztext": "Trittschalldämmung verlegen",
    "langtext": "Verlegen einer Dämmunterlage mit integrierter Dampfbremse, stoßversetzt und dicht gestoßen, Überlappungen verklebt.",
    "einheit": "m²",
    "preisCent": 850,
    "arbeitsanteil": 0.5
  },
  {
    "schluessel": "bodenbelag_vinyl",
    "reihenfolge": 135,
    "kurztext": "Vinylboden verlegen",
    "langtext": "Verlegen eines Klick-Vinylbodens im Verband, Dehnungsfugen zu allen aufgehenden Bauteilen, Zuschnitte an Türzargen und Rohrdurchführungen. Der Belagpreis ist mit 25 EUR/m² Einkauf kalkuliert; abweichende Materialwahl ändert die Position.",
    "einheit": "m²",
    "preisCent": 4200,
    "arbeitsanteil": 0.65
  },
  {
    "schluessel": "bodenbelag_laminat",
    "reihenfolge": 135,
    "kurztext": "Laminatboden verlegen",
    "langtext": "Verlegen eines Klick-Laminatbodens im Verband, Dehnungsfugen zu allen aufgehenden Bauteilen, Zuschnitte an Türzargen und Rohrdurchführungen. Der Belagpreis ist mit 18 EUR/m² Einkauf kalkuliert; abweichende Materialwahl ändert die Position.",
    "einheit": "m²",
    "preisCent": 3400,
    "arbeitsanteil": 0.65
  },
  {
    "schluessel": "sockelleiste_holz",
    "reihenfolge": 140,
    "kurztext": "Sockelleisten montieren",
    "langtext": "Zuschneiden und Montieren von Sockelleisten passend zum Belag, Gehrungsschnitte in Ecken, Befestigung mit Clips oder Montagekleber.",
    "einheit": "lfm",
    "preisCent": 1200,
    "arbeitsanteil": 0.7
  },
  {
    "schluessel": "silikonfugen",
    "reihenfolge": 150,
    "kurztext": "Elastische Anschluss- und Trennfugen",
    "langtext": "Ausbilden elastischer Fugen an allen Wand-Boden- und Wand-Wand-Anschlüssen sowie an Anschlüssen zu Sanitärobjekten. Hinterfüllung mit Rundschnur, sanitärtaugliches Silikon, Farbton passend zum Fugenmörtel. Elastische Fugen sind Wartungsfugen und unterliegen nicht der Gewährleistung auf Dichtheit über die übliche Standzeit hinaus.",
    "einheit": "lfm",
    "preisCent": 1400,
    "arbeitsanteil": 0.85
  },
  {
    "schluessel": "wiedermontage_sanitaer",
    "reihenfolge": 160,
    "kurztext": "Wiedermontage Sanitärobjekt",
    "langtext": "Wiedereinbau und Anschluss je Sanitärobjekt einschließlich Dichtungen, Silikonanschluss und Dichtheitsprüfung. Neue Objekte werden nach Aufwand montiert und sind nicht im Preis enthalten.",
    "einheit": "Stk",
    "preisCent": 8500,
    "arbeitsanteil": 1.0
  },
  {
    "schluessel": "kleinmaterial",
    "reihenfolge": 170,
    "kurztext": "Klein- und Verbrauchsmaterial",
    "langtext": "Dübel, Schrauben, Profile, Kreuzstützen, Schleifmittel, Klebebänder, Folien, Reinigungsmittel, Verschleiß an Sägeblättern und Bohrern.",
    "einheit": "pauschal",
    "preisCent": 14500,
    "arbeitsanteil": 0.1
  },
  {
    "schluessel": "endreinigung",
    "reihenfolge": 180,
    "kurztext": "Endreinigung",
    "langtext": "Besenreine Übergabe des Arbeitsbereichs, Entfernen von Schutzmaßnahmen, Bauschlussreinigung der Oberflächen, Abfahren des Restmaterials.",
    "einheit": "pauschal",
    "preisCent": 16500,
    "arbeitsanteil": 0.95
  },
  {
    "schluessel": "stundenlohn",
    "reihenfolge": 190,
    "kurztext": "Regiestunde Facharbeiter",
    "langtext": "Arbeiten nach Aufwand, die nicht Bestandteil der oben aufgeführten Positionen sind, nach vorheriger Abstimmung.",
    "einheit": "Std",
    "preisCent": 5800,
    "arbeitsanteil": 1.0
  }
];

export const GEWERKE = [
  {
    "schluessel": "bad_mikrozement",
    "bezeichnung": "Badsanierung mit Mikrozement auf Bestandsfliesen",
    "betreff": "Komplettbadsanierung mit Mikrozement",
    "positionen": [
      {
        "schluessel": "baustelleneinrichtung",
        "formel": "1"
      },
      {
        "schluessel": "abdeckung_staubschutz",
        "formel": "1"
      },
      {
        "schluessel": "demontage_sanitaer",
        "formel": "sanitaerobjekte"
      },
      {
        "schluessel": "untergrundpruefung",
        "formel": "1"
      },
      {
        "schluessel": "untergrund_vorbereitung_wand",
        "formel": "wand_qm"
      },
      {
        "schluessel": "mikrozement_haftgrund_fliese",
        "formel": "wand_qm + boden_qm"
      },
      {
        "schluessel": "abdichtung_verbund",
        "formel": "dusche_qm"
      },
      {
        "schluessel": "dichtband_ecken",
        "formel": "dusche_umfang_m"
      },
      {
        "schluessel": "dichtmanschette",
        "formel": "2"
      },
      {
        "schluessel": "mikrozement_aufbau_wand",
        "formel": "wand_qm"
      },
      {
        "schluessel": "mikrozement_aufbau_boden",
        "formel": "boden_qm"
      },
      {
        "schluessel": "mikrozement_versiegelung",
        "formel": "wand_qm + boden_qm"
      },
      {
        "schluessel": "silikonfugen",
        "formel": "umfang_m + dusche_umfang_m"
      },
      {
        "schluessel": "wiedermontage_sanitaer",
        "formel": "sanitaerobjekte"
      },
      {
        "schluessel": "kleinmaterial",
        "formel": "1"
      },
      {
        "schluessel": "entsorgung_container",
        "formel": "1"
      },
      {
        "schluessel": "endreinigung",
        "formel": "1"
      }
    ]
  },
  {
    "schluessel": "bad_fliesen",
    "bezeichnung": "Badsanierung mit Fliesenbelag",
    "betreff": "Komplettbadsanierung",
    "positionen": [
      {
        "schluessel": "baustelleneinrichtung",
        "formel": "1"
      },
      {
        "schluessel": "abdeckung_staubschutz",
        "formel": "1"
      },
      {
        "schluessel": "demontage_sanitaer",
        "formel": "sanitaerobjekte"
      },
      {
        "schluessel": "rueckbau_fliesen_wand",
        "formel": "wand_qm"
      },
      {
        "schluessel": "rueckbau_fliesen_boden",
        "formel": "boden_qm"
      },
      {
        "schluessel": "entsorgung_container",
        "formel": "1"
      },
      {
        "schluessel": "untergrundpruefung",
        "formel": "1"
      },
      {
        "schluessel": "untergrund_vorbereitung_wand",
        "formel": "wand_qm"
      },
      {
        "schluessel": "ausgleichsmasse",
        "formel": "boden_qm"
      },
      {
        "schluessel": "randdaemmstreifen",
        "formel": "umfang_m"
      },
      {
        "schluessel": "grundierung",
        "formel": "wand_qm + boden_qm"
      },
      {
        "schluessel": "abdichtung_verbund",
        "formel": "dusche_qm + boden_qm"
      },
      {
        "schluessel": "dichtband_ecken",
        "formel": "umfang_m + dusche_umfang_m"
      },
      {
        "schluessel": "dichtmanschette",
        "formel": "3"
      },
      {
        "schluessel": "fliesen_wand",
        "formel": "wand_qm"
      },
      {
        "schluessel": "fliesen_boden",
        "formel": "boden_qm"
      },
      {
        "schluessel": "verfugung",
        "formel": "wand_qm + boden_qm"
      },
      {
        "schluessel": "silikonfugen",
        "formel": "umfang_m + dusche_umfang_m"
      },
      {
        "schluessel": "wiedermontage_sanitaer",
        "formel": "sanitaerobjekte"
      },
      {
        "schluessel": "kleinmaterial",
        "formel": "1"
      },
      {
        "schluessel": "endreinigung",
        "formel": "1"
      }
    ]
  },
  {
    "schluessel": "malerarbeiten",
    "bezeichnung": "Malerarbeiten",
    "betreff": "Malerarbeiten",
    "positionen": [
      {
        "schluessel": "baustelleneinrichtung",
        "formel": "1"
      },
      {
        "schluessel": "maler_abkleben",
        "formel": "1"
      },
      {
        "schluessel": "untergrundpruefung",
        "formel": "1"
      },
      {
        "schluessel": "maler_untergrund",
        "formel": "wand_qm"
      },
      {
        "schluessel": "maler_anstrich",
        "formel": "wand_qm"
      },
      {
        "schluessel": "kleinmaterial",
        "formel": "1"
      },
      {
        "schluessel": "endreinigung",
        "formel": "1"
      }
    ]
  },
  {
    "schluessel": "bodenverlegung",
    "bezeichnung": "Bodenverlegung",
    "betreff": "Bodenverlegung",
    "positionen": [
      {
        "schluessel": "baustelleneinrichtung",
        "formel": "1"
      },
      {
        "schluessel": "abdeckung_staubschutz",
        "formel": "1"
      },
      {
        "schluessel": "rueckbau_bodenbelag",
        "formel": "boden_qm"
      },
      {
        "schluessel": "entsorgung_container",
        "formel": "1"
      },
      {
        "schluessel": "untergrundpruefung",
        "formel": "1"
      },
      {
        "schluessel": "ausgleichsmasse",
        "formel": "boden_qm"
      },
      {
        "schluessel": "grundierung",
        "formel": "boden_qm"
      },
      {
        "schluessel": "randdaemmstreifen",
        "formel": "umfang_m"
      },
      {
        "schluessel": "trittschalldaemmung",
        "formel": "boden_qm"
      },
      {
        "schluessel": "bodenbelag_vinyl",
        "formel": "boden_qm"
      },
      {
        "schluessel": "sockelleiste_holz",
        "formel": "umfang_m"
      },
      {
        "schluessel": "kleinmaterial",
        "formel": "1"
      },
      {
        "schluessel": "endreinigung",
        "formel": "1"
      }
    ]
  },
  {
    "schluessel": "fliesen_flaeche",
    "bezeichnung": "Fliesenlegerarbeiten",
    "betreff": "Fliesenarbeiten",
    "positionen": [
      {
        "schluessel": "baustelleneinrichtung",
        "formel": "1"
      },
      {
        "schluessel": "abdeckung_staubschutz",
        "formel": "1"
      },
      {
        "schluessel": "untergrundpruefung",
        "formel": "1"
      },
      {
        "schluessel": "grundierung",
        "formel": "wand_qm + boden_qm"
      },
      {
        "schluessel": "fliesen_wand",
        "formel": "wand_qm"
      },
      {
        "schluessel": "fliesen_boden",
        "formel": "boden_qm"
      },
      {
        "schluessel": "sockelleiste_fliese",
        "formel": "umfang_m"
      },
      {
        "schluessel": "verfugung",
        "formel": "wand_qm + boden_qm"
      },
      {
        "schluessel": "silikonfugen",
        "formel": "umfang_m"
      },
      {
        "schluessel": "kleinmaterial",
        "formel": "1"
      },
      {
        "schluessel": "endreinigung",
        "formel": "1"
      }
    ]
  }
];

export default { LEISTUNGEN, GEWERKE };
