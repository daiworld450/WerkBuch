// ---------------------------------------------------------------------------
// baustellenListe.js — Reihenfolge und Zeitgruppen der Baustellenliste.
//
// Ohne jede Zeitangabe (kein Status "Abgeschlossen", kein Zeitraum, keine
// Auftragsnummer) bleibt die Liste, wie sie war: geordnet danach, wann der
// Kunde in sevDesk angelegt wurde, oben der zuletzt angelegte, unten der
// älteste. Maßgeblich ist das Feld reihenfolge auf der Baustelle: der
// Anlagezeitpunkt des Kunden als Zahl JJJJMMTTHHMM (Contact.create aus
// sevDesk, bei Kunden nur aus der Zentrale das Anlagedatum der Kartei). Nicht
// die Kundennummer: sie bricht (Nummer 147) und läuft seit 09/2026 in zwei
// Kreisen (sevDesk, Zentrale).
//
//   Feld fehlt      — in der App neu angelegt: ganz oben, die jüngste zuerst.
//   reihenfolge > 0 — absteigend.
//   reihenfolge 0   — noch nicht eingeordnet (kein Kunde in sevDesk): ganz
//                     unten unter eigener Überschrift, nach Name.
//
// Sobald es Zeitangaben gibt (seit 28.11.2026 aus der Zentrale: Status und
// Abschlussdatum nach Rechnungen und Angeboten), ordnet die Liste nach der Zeit:
//
//   Laufend           — In Ausführung, oder der geplante Zeitraum umfasst heute
//   Anstehend         — Start in der Zukunft oder ein Auftrag (Auftragsnummer)
//                       ohne Abschluss, der nächste Start zuerst
//   Noch offen        — In Planung, ohne Zeitraum und ohne Auftragsnummer
//   Abgeschlossen JJJJ — je Jahr des Abschlusses, das jüngste Jahr zuerst
//   Noch nicht eingeordnet — wie bisher ganz unten
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

function zeit(wert) {
  const d = zuDate(wert);
  return d ? d.getTime() : null;
}

// Jahr aus einem Datumsfeld. Text "JJJJ-MM-TT" wird direkt gelesen, damit die
// Zeitzone das Jahr nicht um einen Tag verschiebt.
function jahrAus(wert) {
  if (typeof wert === "string" && /^\d{4}-\d{2}-\d{2}/.test(wert)) return Number(wert.slice(0, 4));
  const d = zuDate(wert);
  return d ? d.getFullYear() : null;
}

function jahrDerReihenfolge(b) {
  const n = nummer(b);
  return n && n > 100000000000 ? Math.floor(n / 100000000) : null;
}

// In welche Zeitgruppe gehört die Baustelle?
//   { art: "fertig", jahr }  |  { art: "laufend" }  |  { art: "anstehend" }  |  { art: "offen" }
export function zeitGruppe(b, heute = new Date()) {
  if (b.status === "Abgeschlossen") {
    const jahr =
      jahrAus(b.abschlussAm) ||
      jahrAus(b.geplantEnde) ||
      jahrDerReihenfolge(b) ||
      jahrAus(b.erstelltAm) ||
      heute.getFullYear();
    return { art: "fertig", jahr };
  }
  const start = zeit(b.geplantStart);
  const ende = zeit(b.geplantEnde);
  const tagesStart = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime();
  const tagesEnde = tagesStart + 24 * 60 * 60 * 1000 - 1;
  if (b.status === "In Ausführung") return { art: "laufend" };
  // Der Zeitraum umfasst heute (auch am letzten Tag bis Mitternacht).
  if (start !== null && ende !== null && start <= tagesEnde && ende >= tagesStart) return { art: "laufend" };
  if ((start !== null && start > tagesEnde) || b.angebotsNummer) return { art: "anstehend" };
  // Ohne Feld reihenfolge: in der App neu angelegt und noch ohne Zeitraum — es wird gleich geplant.
  if (nummer(b) === null) return { art: "anstehend" };
  return { art: "offen" };
}

function nachName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), "de", { sensitivity: "base" });
}

// Vergleich zweier Zahlen, auch bei Infinity (Infinity - Infinity wäre NaN).
function vergleich(x, y) {
  return x === y ? 0 : x < y ? -1 : 1;
}

function absteigend(a, b) {
  return (nummer(b) || 0) - (nummer(a) || 0) || angelegtAm(b) - angelegtAm(a);
}

// Die Zeilen der Liste: Baustellen, dazwischen Überschriften.
// Jede Zeile hat eine eindeutige id.
export function listenReihen(baustellen, heute = new Date()) {
  const gruppen = { laufend: [], anstehend: [], offen: [], fertig: new Map() };
  for (const b of baustellen) {
    const g = zeitGruppe(b, heute);
    if (g.art === "fertig") {
      if (!gruppen.fertig.has(g.jahr)) gruppen.fertig.set(g.jahr, []);
      gruppen.fertig.get(g.jahr).push(b);
    } else {
      gruppen[g.art].push(b);
    }
  }

  const zeile = (b) => ({ typ: "baustelle", id: b.id, baustelle: b });
  const kopf = (id, titel) => ({ typ: "monat", id, titel });
  const nummeriert = (liste) => liste.filter((b) => (nummer(b) || 0) > 0);
  const ohneNummer = (liste) => liste.filter((b) => nummer(b) === 0);

  // Gibt es keine Zeitangabe, bleibt es bei der Reihenfolge nach Kundenanlage.
  const hatZeit = gruppen.laufend.length || gruppen.fertig.size || gruppen.anstehend.some((b) => nummer(b) !== null);
  if (!hatZeit) {
    const neu = [];
    const mit = [];
    const alt = [];
    for (const b of baustellen) {
      const n = nummer(b);
      (n === null ? neu : n > 0 ? mit : alt).push(b);
    }
    neu.sort((a, b) => angelegtAm(b) - angelegtAm(a));
    mit.sort(absteigend);
    alt.sort(nachName);
    const reihen = [...neu.map(zeile), ...mit.map(zeile)];
    if (alt.length) {
      reihen.push(kopf("nicht-eingeordnet", "Noch nicht eingeordnet"));
      reihen.push(...alt.map(zeile));
    }
    return reihen;
  }

  const reihen = [];
  const abschnitt = (id, titel, liste) => {
    if (!liste.length) return;
    reihen.push(kopf(id, titel));
    reihen.push(...liste.map(zeile));
  };

  abschnitt(
    "zeit-laufend",
    "Laufend",
    [...gruppen.laufend].sort((a, b) => vergleich(zeit(a.geplantEnde) ?? Infinity, zeit(b.geplantEnde) ?? Infinity) || nachName(a, b))
  );
  abschnitt(
    "zeit-anstehend",
    "Anstehend",
    [...gruppen.anstehend].sort((a, b) => {
      // Der nächste Start zuerst. Neu in der App angelegt (kein Feld reihenfolge)
      // und noch ohne Start: ganz oben, es wird gleich geplant. Ohne Start sonst: unten.
      const schluessel = (x) => zeit(x.geplantStart) ?? (nummer(x) === null ? -Infinity : Infinity);
      return vergleich(schluessel(a), schluessel(b)) || absteigend(a, b);
    })
  );
  abschnitt("zeit-offen", "Noch offen", nummeriert(gruppen.offen).sort(absteigend));
  [...gruppen.fertig.keys()]
    .sort((a, b) => b - a)
    .forEach((jahr) => {
      const liste = [...gruppen.fertig.get(jahr)].sort((a, b) => {
        const da = zeit(a.abschlussAm) ?? zeit(a.geplantEnde) ?? 0;
        const db = zeit(b.abschlussAm) ?? zeit(b.geplantEnde) ?? 0;
        return db - da || absteigend(a, b) || nachName(a, b);
      });
      abschnitt(`zeit-fertig-${jahr}`, `Abgeschlossen ${jahr}`, liste);
    });
  abschnitt("zeit-nicht-eingeordnet", "Noch nicht eingeordnet", [...ohneNummer(gruppen.offen)].sort(nachName));
  return reihen;
}
