// ---------------------------------------------------------------------------
// baustellenListe.js — Reihenfolge der Baustellenliste.
//
// Die Liste ist danach geordnet, wann der Kunde in sevDesk angelegt wurde:
// oben der zuletzt angelegte Kunde, unten der älteste. Maßgeblich ist das Feld
// reihenfolge auf der Baustelle: der Anlagezeitpunkt des Kunden als Zahl
// JJJJMMTTHHMM (Contact.create aus sevDesk, bei Kunden nur aus der Zentrale
// das Anlagedatum der Kartei). Nicht die Kundennummer: sie bricht (Nummer 147)
// und läuft seit 09/2026 in zwei Kreisen (sevDesk, Zentrale).
//
//   Feld fehlt      — in der App neu angelegt: ganz oben, die jüngste zuerst.
//   reihenfolge > 0 — absteigend.
//   reihenfolge 0   — noch nicht eingeordnet (kein Kunde in sevDesk): ganz
//                     unten unter eigener Überschrift, nach Name.
// ---------------------------------------------------------------------------

import { zuDate } from "./format";

function nummer(b) {
  const n = Number(b.reihenfolge);
  return b.reihenfolge === undefined || b.reihenfolge === null || Number.isNaN(n) ? null : n;
}

function angelegtAm(b) {
  const d = zuDate(b.erstelltAm);
  return d ? d.getTime() : 0;
}

// Die Zeilen der Liste: Baustellen, vor dem Altbestand eine Überschrift.
// Jede Zeile hat eine eindeutige id.
export function listenReihen(baustellen) {
  const neu = [];
  const mit = [];
  const alt = [];
  for (const b of baustellen) {
    const n = nummer(b);
    (n === null ? neu : n > 0 ? mit : alt).push(b);
  }

  neu.sort((a, b) => angelegtAm(b) - angelegtAm(a));
  mit.sort((a, b) => nummer(b) - nummer(a) || angelegtAm(b) - angelegtAm(a));
  alt.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de", { sensitivity: "base" }));

  const zeile = (b) => ({ typ: "baustelle", id: b.id, baustelle: b });
  const reihen = [...neu.map(zeile), ...mit.map(zeile)];
  if (alt.length) {
    reihen.push({ typ: "monat", id: "nicht-eingeordnet", titel: "Noch nicht eingeordnet" });
    reihen.push(...alt.map(zeile));
  }
  return reihen;
}
