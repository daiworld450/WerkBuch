// ---------------------------------------------------------------------------
// berechnung.js — Flächen- und Bedarfsformeln für den Maße-Bildschirm
// Alle Eingaben werden defensiv in Zahlen umgewandelt (Standard 0),
// damit fehlende Felder nie zu Abstürzen führen.
// ---------------------------------------------------------------------------

const VERSCHNITT = 1.1; // 10 % Fliesen-Verschnitt

// Wandelt beliebige Eingabe (String mit Komma, undefined, null) sicher in eine Zahl.
export function zahl(wert) {
  if (typeof wert === "number") return isFinite(wert) ? wert : 0;
  if (wert == null) return 0;
  const n = parseFloat(String(wert).replace(",", "."));
  return isFinite(n) ? n : 0;
}

// Bodenfläche = Länge × Breite
export function bodenflaeche(laenge, breite) {
  return zahl(laenge) * zahl(breite);
}

// Wandfläche = 2 × (Länge + Breite) × Höhe − Abzug (Türen/Fenster)
export function wandflaeche(laenge, breite, hoehe, abzug) {
  const roh = 2 * (zahl(laenge) + zahl(breite)) * zahl(hoehe) - zahl(abzug);
  return roh > 0 ? roh : 0;
}

// Umfang = 2 × (Länge + Breite)
export function umfang(laenge, breite) {
  return 2 * (zahl(laenge) + zahl(breite));
}

// Fliesenbedarf = Fläche × 1,10
export function fliesenbedarf(flaeche) {
  return zahl(flaeche) * VERSCHNITT;
}

// Komplettes Ergebnis-Set für die Ergebniskarten
export function berechneAlles(raum) {
  const r = raum || {};
  const boden = bodenflaeche(r.laenge, r.breite);
  const wand = wandflaeche(r.laenge, r.breite, r.hoehe, r.tuerenFenster);
  return {
    bodenflaeche: boden,
    wandflaeche: wand,
    umfang: umfang(r.laenge, r.breite),
    fliesenbedarfBoden: fliesenbedarf(boden),
    fliesenbedarfWand: fliesenbedarf(wand),
  };
}

export default { zahl, bodenflaeche, wandflaeche, umfang, fliesenbedarf, berechneAlles };
