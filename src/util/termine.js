// ---------------------------------------------------------------------------
// termine.js — gemeinsame Grundlagen für den Kalender.
//
// Termine liegen seit dem Kalender-Umbau in EINER top-level Sammlung
// "termine" (nicht mehr als Unterordner einer Baustelle). Nur so lässt sich
// mit einer einzigen Abfrage — where("handwerkerId","==",uid) — ein Kalender
// über alles bauen; die Baustelle ist bloß noch eine optionale Verknüpfung.
//
// Sortiert und gefiltert wird durchweg clientseitig, damit kein
// zusammengesetzter Firestore-Index nötig ist (gleiches Muster wie in
// BaustellenListScreen). Bei der Datenmenge eines Solo-Betriebs unkritisch.
// ---------------------------------------------------------------------------

import { farben } from "../theme";

// Die Arten eines Termins. Farben ausschließlich aus der bestehenden Palette
// abgeleitet, damit der Kalender nicht aus dem Design ausbricht.
export const TERMIN_ARTEN = [
  { key: "baustelle", label: "Baustelle", farbe: farben.rot },
  { key: "besichtigung", label: "Besichtigung", farbe: farben.blauHell },
  { key: "material", label: "Material", farbe: farben.gruen },
  { key: "buero", label: "Büro", farbe: farben.blau },
  { key: "privat", label: "Privat", farbe: "rgba(255,255,255,.55)" },
];

export const STANDARD_ART = "baustelle";

export function artInfo(key) {
  return (
    TERMIN_ARTEN.find((a) => a.key === key) ||
    TERMIN_ARTEN.find((a) => a.key === STANDARD_ART)
  );
}

// Kalendertag ohne Uhrzeit (00:00 Ortszeit).
export function tagOhneZeit(datum) {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Montag 00:00 der Woche, in der "datum" liegt.
export function montagDerWoche(datum) {
  const d = tagOhneZeit(datum);
  const index = (d.getDay() + 6) % 7; // JS: So=0 -> hier Mo=0 … So=6
  d.setDate(d.getDate() - index);
  return d;
}

export function ersterDesMonats(datum) {
  const d = tagOhneZeit(datum);
  d.setDate(1);
  return d;
}

export function letzterDesMonats(datum) {
  const d = tagOhneZeit(datum);
  d.setMonth(d.getMonth() + 1, 0);
  return d;
}

// Schlüssel für die Tages-Zuordnung: "JJJJ-MM-TT" in Ortszeit.
export function tagSchluessel(datum) {
  const d = tagOhneZeit(datum);
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${monat}-${tag}`;
}

export function tagePlus(datum, tage) {
  const d = new Date(datum);
  d.setDate(d.getDate() + tage);
  return d;
}

// Alle Kalendertage von start bis ende (einschließlich). Begrenzt, damit ein
// versehentlich riesiger Zeitraum den Kalender nicht lahmlegt.
export function tageZwischen(start, ende, maximum = 400) {
  const liste = [];
  let d = tagOhneZeit(start);
  const bis = tagOhneZeit(ende || start);
  while (d <= bis && liste.length < maximum) {
    liste.push(d);
    d = tagePlus(d, 1);
  }
  if (liste.length === 0) liste.push(tagOhneZeit(start));
  return liste;
}

// Uhrzeit als "HH:MM"
export function uhrzeitDe(wert) {
  const d = wert instanceof Date ? wert : null;
  if (!d || isNaN(d.getTime())) return "";
  const std = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${std}:${min}`;
}

const WOCHENTAG_LANG = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

export function wochentagLang(datum) {
  const d = new Date(datum);
  return WOCHENTAG_LANG[d.getDay()] || "";
}

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function monatJahr(datum) {
  const d = new Date(datum);
  return `${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}

export default {
  TERMIN_ARTEN,
  STANDARD_ART,
  artInfo,
  tagOhneZeit,
  montagDerWoche,
  ersterDesMonats,
  letzterDesMonats,
  tagSchluessel,
  tagePlus,
  tageZwischen,
  uhrzeitDe,
  wochentagLang,
  monatJahr,
};
