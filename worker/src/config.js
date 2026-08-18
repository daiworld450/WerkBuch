// ---------------------------------------------------------------------------
// config.js — ALLE einstellbaren Werte des Moduls an einer Stelle.
//
// Die Spezifikation (docs/spezifikation-angebote.md, Kapitel 19) listet diese
// Zahlen als offene Entscheidungen. Sie stehen deshalb bewusst hier gebündelt
// und nicht verstreut im Code: Preise und Grenzen ändern sich mit der
// Kalkulation, ohne dass dafür Programmlogik angefasst werden muss.
//
// Alle Geldbeträge sind Ganzzahlen in CENT (Spezifikation Kapitel 4) — mit
// Kommazahlen zu rechnen erzeugt Rundungsfehler, die sich in Summen aufaddieren
// und dann nicht mehr zur Buchhaltung passen.
//
// Unverändert aus functions/src/config.js übernommen (reine Logik, kein
// Node-/Firebase-Bezug) — mit einer Ausnahme: FIRMA.absenderMail steht jetzt
// auf das Betriebskonto berisabau@gmail.com (dieselbe Adresse, die auch die
// Firestore-Regel istBesitzer() prüft), statt der privaten Gmail-Adresse aus
// der alten Nodemailer-Fassung. Diese Adresse muss in Brevo als Absender
// verifiziert werden (siehe worker/src/mail.js).
// ---------------------------------------------------------------------------

// --------------------------------------------------------------- Grundpaket
// Was im normalen Angebotspreis bereits enthalten ist (Spezifikation 6.1).
export const GRUNDPAKET = {
  visualisierungen: 3,
  raeume: 1,
  korrekturrundenJeBild: 1,
};

// ------------------------------------------------------------ Zulagenkatalog
// Startbestückung aus Spezifikation 6.2. Wird beim ersten Start nach Firestore
// (Sammlung "zulagenKatalog") geschrieben und ist danach dort pflegbar.
//
// typ:      stueck  = Menge frei wählbar (Stepper)
//           pauschal = genau einmal buchbar
//           manuell  = Sonderwunsch, Preis erst nach Prüfung durch den Betrieb
// gibtGuthaben: wie viele Visualisierungen die Zulage freischaltet
export const ZULAGEN_KATALOG = [
  {
    sku: "VIS_EXTRA",
    name: "Weitere Visualisierung",
    beschreibung: "Ein zusätzlicher Vorher-/Nachher-Entwurf für Ihren Raum.",
    einheit: "Stück",
    preisCent: 1900,
    ustSatz: 19,
    typ: "stueck",
    gibtGuthaben: 1,
    maxMengeJeBestellung: 10,
    braucht_pruefung: false,
    aktiv: true,
    reihenfolge: 10,
    // Staffelpreise (Spezifikation 6.2): ab der 4. Visualisierung günstiger.
    staffeln: [
      { abMenge: 1, bisMenge: 3, preisCent: 1900 },
      { abMenge: 4, bisMenge: 10, preisCent: 1500 },
      { abMenge: 11, bisMenge: null, preisCent: 1200 },
    ],
  },
  {
    sku: "VIS_PAKET_5",
    name: "Paket: 5 weitere Visualisierungen",
    beschreibung: "Fünf zusätzliche Entwürfe zum Vorteilspreis.",
    einheit: "Paket",
    preisCent: 7900,
    ustSatz: 19,
    typ: "pauschal",
    gibtGuthaben: 5,
    maxMengeJeBestellung: 3,
    braucht_pruefung: false,
    aktiv: true,
    reihenfolge: 20,
    staffeln: [],
  },
  {
    sku: "ROOM_EXTRA",
    name: "Weiterer Raum",
    beschreibung: "Ein zusätzlicher Raum inklusive zwei Visualisierungen.",
    einheit: "Raum",
    preisCent: 4900,
    ustSatz: 19,
    typ: "stueck",
    gibtGuthaben: 2,
    maxMengeJeBestellung: 5,
    braucht_pruefung: false,
    aktiv: true,
    reihenfolge: 30,
    staffeln: [],
  },
  {
    sku: "EXPRESS_24H",
    name: "Express-Bearbeitung",
    beschreibung: "Ihre Entwürfe innerhalb von 24 Stunden.",
    einheit: "Pauschale",
    preisCent: 3900,
    ustSatz: 19,
    typ: "pauschal",
    gibtGuthaben: 0,
    maxMengeJeBestellung: 1,
    braucht_pruefung: false,
    aktiv: true,
    reihenfolge: 40,
    staffeln: [],
  },
  {
    sku: "STYLE_INDIV",
    name: "Individueller Stilwunsch",
    beschreibung:
      "Sie haben eine eigene Vorlage oder einen besonderen Wunsch? Wir melden uns mit einem Festpreis — noch keine Kosten.",
    einheit: "Anfrage",
    preisCent: 0,
    ustSatz: 19,
    typ: "manuell",
    gibtGuthaben: 0,
    maxMengeJeBestellung: 1,
    braucht_pruefung: true,
    aktiv: true,
    reihenfolge: 50,
    staffeln: [],
  },
  {
    sku: "PRINT_SET",
    name: "Ausdruck A3 + Versand",
    beschreibung: "Ihre Entwürfe gedruckt auf A3, per Post zugeschickt.",
    einheit: "Set",
    preisCent: 2400,
    ustSatz: 19,
    typ: "pauschal",
    gibtGuthaben: 0,
    maxMengeJeBestellung: 3,
    braucht_pruefung: false,
    aktiv: true,
    reihenfolge: 60,
    staffeln: [],
  },
];

// ------------------------------------------------------------------- Grenzen
// Schutz vor Missbrauch und vor Überraschungen auf der Schlussrechnung
// (Spezifikation 6.4). Wird eine Grenze überschritten, wird die Bestellung
// nicht abgelehnt, sondern dem Betrieb zur persönlichen Prüfung vorgelegt.
export const GRENZEN = {
  zulagenJeProjektOhnePruefung: 10,
  zulagenSummeCentOhnePruefung: 30000, // 300,00 €
  generierungenJeProjekt: 40,
  generierungenJeStunde: 6,
};

// -------------------------------------------------------------- Magic-Link
// Zugang für den Kunden ohne Konto und ohne Passwort (Spezifikation 3).
export const ZUGANG = {
  tokenGueltigTage: 30,
  tokenBytes: 32,
  codeStellen: 6,
  codeGueltigMinuten: 15,
  codeMaxVersuche: 5,
};

// ------------------------------------------------------------- Angebotsfrist
// Wie lange ein versendetes Angebot gültig bleibt. Die Spezifikation lässt die
// Wahl zwischen 14, 21 und 30 Tagen offen; 30 Tage ist die großzügigste
// Variante und erzeugt die wenigsten Nachfragen.
export const ANGEBOT = {
  gueltigTage: 30,
  // Ab wie vielen Resttagen im Portal ein Countdown eingeblendet wird.
  countdownAbTagen: 7,
};

// ------------------------------------------------------------ Rechtstexte
// Der WORTLAUT dieser Erklärungen wird bei jeder Freigabe als Volltext
// mitgespeichert (Spezifikation 8.2) — nicht nur ein Verweis. Texte ändern
// sich; Jahre später muss rekonstruierbar sein, was damals auf dem Bildschirm
// stand, nicht was heute in der Datenbank steht.
//
// Die Beschriftung des Bestell-Knopfes ist bewusst NICHT konfigurierbar:
// § 312j Abs. 3 BGB verlangt gegenüber Verbrauchern eine eindeutige
// Formulierung; "Weiter" oder "Bestätigen" wären unzulässig.
export const KNOPF_BESCHRIFTUNG = "Zahlungspflichtig beauftragen";

export const EINWILLIGUNGEN = {
  widerruf: {
    pflicht: true,
    text: "Ich habe die Widerrufsbelehrung zur Kenntnis genommen.",
  },
  sofortbeginn: {
    pflicht: true,
    text: "Ich verlange ausdrücklich, dass Berisa Bau vor Ablauf der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass mein Widerrufsrecht mit vollständiger Vertragserfüllung erlischt.",
  },
  // Bewusst freiwillig und getrennt: Werbe-Einwilligung darf nach DSGVO nicht
  // mit der Beauftragung gebündelt werden (Spezifikation 14).
  referenz: {
    pflicht: false,
    text: "Ich bin damit einverstanden, dass Berisa Bau anonymisierte Bilder meines Projekts als Referenz veröffentlicht. Diese Einwilligung ist freiwillig und jederzeit widerrufbar.",
  },
};

export const AGB_STAND = "2026-08-01";

// ------------------------------------------------------------- Absender/Firma
export const FIRMA = {
  name: "Berisa Bau",
  ort: "Mülheim an der Ruhr",
  absenderMail: "berisabau@gmail.com",
  portalBasis: "https://daiworld450.github.io/WerkBuch",
};

export default {
  GRUNDPAKET,
  ZULAGEN_KATALOG,
  GRENZEN,
  ZUGANG,
  ANGEBOT,
  KNOPF_BESCHRIFTUNG,
  EINWILLIGUNGEN,
  AGB_STAND,
  FIRMA,
};
