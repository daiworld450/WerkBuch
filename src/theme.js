// ---------------------------------------------------------------------------
// theme.js — Design-System der App (1:1 aus der Berisa-Bau-Landingpage)
// Farben, Schriften, Größen und gemeinsame Style-Bausteine an einem Ort.
// ---------------------------------------------------------------------------

export const farben = {
  bg: "#0b0b0f", // App-Hintergrund, tiefschwarz
  bgTief: "#07070a", // Footer / unterste Ebene
  bgErhoben: "#12121c", // erhobene Flächen, Verläufe
  blau: "#1032CF", // Primärakzent
  blauHell: "#2A4EEF", // Hover / aktiv
  rot: "#D00000", // Haupt-CTA, Auswahl aktiv
  rotHell: "#ff2d2d", // Hover
  gruen: "#38d17a", // Erfolg, Häkchen, Status "fertig"
  text: "#ffffff",
  textWeich: "rgba(255,255,255,.82)",
  textMatt: "rgba(255,255,255,.60)",
  linie: "rgba(255,255,255,.14)",
  glas: "rgba(255,255,255,.04)", // Karten-Hintergrund
  glasHover: "rgba(255,255,255,.09)",

  // abgeleitete Töne (nicht in der Spec, aber im Design gebraucht)
  feldBg: "rgba(255,255,255,.05)",
  feldFokus: "rgba(255,255,255,.6)",
  platzhalter: "rgba(255,255,255,.4)",
  fehlerBg: "rgba(255,92,92,.12)",
  fehlerLinie: "rgba(255,92,92,.4)",
  fehlerText: "#ff8a8a",
  auswahlBg: "rgba(208,0,0,.14)",
  gruenRing: "rgba(56,209,122,.2)",
};

// Schrift: der kräftige, breite Rajdhani/Rubik-Look der Landingpage
// (werden in App.js über expo-font geladen). Jeweils { fontFamily } —
// per Spread (...schrift.head) einsetzen.
export const schrift = {
  head: { fontFamily: "Rajdhani_700Bold" },
  headHalb: { fontFamily: "Rajdhani_600SemiBold" },
  body: { fontFamily: "Rubik_400Regular" },
  bodyMed: { fontFamily: "Rubik_500Medium" },
};

export const groessen = {
  h1: 34,
  h2: 26,
  h3: 20,
  text: 16,
  klein: 13,
};

export const radius = {
  klein: 14,
  karte: 22,
  pille: 500,
  feld: 12,
};

// Wiederverwendbare Text-Stile
export const textStil = {
  h1: {
    ...schrift.head,
    fontSize: groessen.h1,
    color: farben.text,
    letterSpacing: 0.5,
  },
  h2: {
    ...schrift.head,
    fontSize: groessen.h2,
    color: farben.text,
    letterSpacing: 0.5,
  },
  h3: {
    ...schrift.head,
    fontSize: groessen.h3,
    color: farben.text,
    letterSpacing: 0.5,
  },
  body: {
    ...schrift.body,
    fontSize: groessen.text,
    color: farben.textWeich,
    lineHeight: groessen.text * 1.55,
  },
  klein: {
    ...schrift.body,
    fontSize: groessen.klein,
    color: farben.textMatt,
    lineHeight: groessen.klein * 1.55,
  },
};

// Karten-Basisstil
export const karteStil = {
  backgroundColor: farben.glas,
  borderWidth: 1,
  borderColor: farben.linie,
  borderRadius: radius.karte,
  padding: 20,
};

export default { farben, schrift, groessen, radius, textStil, karteStil };
