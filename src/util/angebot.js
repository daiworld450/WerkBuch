// ---------------------------------------------------------------------------
// angebot.js — Angebote, wie sie ein Meisterbetrieb schreibt.
//
// Positionen mit Kurz- und Langtext, Verweisen auf die einschlägigen DIN-Normen
// und die anerkannten Regeln der Technik, Mengen, Einheitspreise. Dazu
// Vorlagen je Gewerk, damit ein Angebot in Minuten steht statt in Stunden.
//
// Der Katalog kommt aus src/daten/leistungen.js und stammt unverändert aus
// angebote-werkzeug/leistungen.json — dort wird er gepflegt. Zwei getrennte
// Preislisten wären schlimmer als eine an der falschen Stelle.
//
// Gerechnet wird in ganzen Cent, die Umsatzsteuer je Satz getrennt gerundet.
// Reine Funktionen, keine Firestore- und keine React-Abhängigkeit — prüfbar in
// tests/angebot.test.cjs.
// ---------------------------------------------------------------------------

import { LEISTUNGEN, GEWERKE } from "../daten/leistungen";
import { euroAusCent, mengeAus, UST_SATZ } from "./nachtrag";

export { LEISTUNGEN, GEWERKE, euroAusCent };

// Die Maße, aus denen sich die Mengen einer Vorlage ergeben.
export const MASSE_FELDER = [
  { key: "wand_qm", label: "Wandfläche", einheit: "m²" },
  { key: "boden_qm", label: "Bodenfläche", einheit: "m²" },
  { key: "dusche_qm", label: "Duschbereich", einheit: "m²" },
  { key: "dusche_umfang_m", label: "Umfang Dusche", einheit: "lfm" },
  { key: "umfang_m", label: "Raumumfang", einheit: "lfm" },
  { key: "sanitaerobjekte", label: "Sanitärobjekte", einheit: "Stk" },
];

export function leistungZu(schluessel) {
  return LEISTUNGEN.find((l) => l.schluessel === schluessel) || null;
}

export function gewerkZu(schluessel) {
  return GEWERKE.find((g) => g.schluessel === schluessel) || null;
}

/**
 * Wertet eine Mengenformel aus — etwa "wand_qm + boden_qm" oder "2".
 *
 * Bewusst KEIN eval und keine Ausdrucks-Bibliothek: Die Formeln stammen zwar
 * aus dem eigenen Katalog, aber ein Auswerter, der beliebigen Code ausführen
 * kann, ist eine offene Tür, die man später vergisst. Gebraucht werden nur
 * Summen aus Zahlen und bekannten Maßen — mehr kann das hier auch nicht.
 */
export function formelRechnen(formel, masse) {
  const m = masse || {};
  return String(formel || "0")
    .split("+")
    .reduce((summe, teil) => {
      const t = teil.trim();
      if (!t) return summe;
      if (/^[\d.,]+$/.test(t)) return summe + mengeAus(t);
      return summe + mengeAus(m[t]);
    }, 0);
}

/**
 * Aus einer Gewerk-Vorlage und den Maßen die Positionen erzeugen.
 * Positionen mit Menge 0 fallen weg — ein Bad ohne Dusche braucht keine
 * Abdichtung im Duschbereich.
 */
export function vorlageAnwenden(gewerkSchluessel, masse) {
  const gewerk = gewerkZu(gewerkSchluessel);
  if (!gewerk) return [];

  return gewerk.positionen
    .map(({ schluessel, formel }) => {
      const l = leistungZu(schluessel);
      if (!l) return null;
      const menge = Math.round(formelRechnen(formel, masse) * 100) / 100;
      if (menge <= 0) return null;
      return {
        schluessel,
        kurztext: l.kurztext,
        langtext: l.langtext,
        einheit: l.einheit,
        menge,
        einzelpreisCent: l.preisCent,
      };
    })
    .filter(Boolean);
}

/** Eine einzelne Position rechnen. */
export function positionRechnen(position, ustSatz = UST_SATZ) {
  const menge = mengeAus(position?.menge);
  const preis = Math.round(position?.einzelpreisCent || 0);
  const nettoCent = Math.sign(menge * preis) * Math.round(Math.abs(menge * preis));
  return { ...position, menge, einzelpreisCent: preis, nettoCent, ustSatz };
}

/**
 * Die Summe eines Angebots.
 *
 * Die Umsatzsteuer wird auf die NETTOSUMME gerechnet, nicht je Position
 * einzeln und dann addiert — sonst weicht das Ergebnis um einzelne Cent von
 * jeder Rechnung ab, die dieselben Positionen enthält.
 */
export function summeRechnen(positionen, ustSatz = UST_SATZ) {
  const gerechnet = (Array.isArray(positionen) ? positionen : []).map((p) =>
    positionRechnen(p, ustSatz)
  );
  const nettoCent = gerechnet.reduce((s, p) => s + p.nettoCent, 0);
  const ustCent = Math.sign(nettoCent) * Math.round(Math.abs((nettoCent * ustSatz) / 100));
  return {
    positionen: gerechnet,
    anzahl: gerechnet.length,
    nettoCent,
    ustSatz,
    ustCent,
    bruttoCent: nettoCent + ustCent,
  };
}

/** Angebotsnummer: AN-2026-0042, fortlaufend je Jahr. */
export function naechsteNummer(vorhandene, jahr) {
  const j = jahr || new Date().getFullYear();
  const zahlen = (Array.isArray(vorhandene) ? vorhandene : [])
    .map((n) => {
      const t = new RegExp(`^AN-${j}-(\\d+)$`).exec(String(n || ""));
      return t ? Number(t[1]) : 0;
    })
    .filter((z) => z > 0);
  const naechste = (zahlen.length ? Math.max(...zahlen) : 0) + 1;
  return `AN-${j}-${String(naechste).padStart(4, "0")}`;
}

// ---------------------------------------------------------------- Konditionen
//
// Textbausteine, keine fest verdrahteten Sätze. Der Betrieb ändert seine
// Konditionen, und dann soll er das an einer Stelle tun — nicht in jedem
// Angebot neu tippen und dabei jedes Mal etwas anders formulieren.
//
// Die Startwerte sind die vom Inhaber festgelegten.
export const KONDITIONEN_STANDARD = [
  {
    key: "vorort",
    titel: "Vor-Ort-Termin",
    text:
      "Der Vor-Ort-Termin inklusive Aufmaß und Angebotserstellung wird mit " +
      "100,00 € pauschal berechnet. Bei Auftragserteilung wird dieser Betrag " +
      "vollständig erlassen.",
  },
  {
    key: "anzahlung",
    titel: "Anzahlung",
    text:
      "Nach Auftragsbestätigung wird eine Anzahlung von 15 % der Auftragssumme " +
      "fällig. Der Restbetrag ist nach Abnahme der Leistung zu zahlen.",
  },
  {
    key: "vorlauf",
    titel: "Ausführungszeitraum",
    text:
      "Der Baubeginn erfolgt nach Absprache, in der Regel 2 bis 4 Wochen nach " +
      "Auftragsbestätigung.",
  },
  {
    key: "gueltigkeit",
    titel: "Bindefrist",
    text: "An dieses Angebot halten wir uns 30 Tage ab Angebotsdatum gebunden.",
  },
  {
    key: "grundlage",
    titel: "Ausführungsgrundlage",
    text:
      "Die Ausführung erfolgt nach den anerkannten Regeln der Technik sowie " +
      "den jeweils einschlägigen DIN-Normen. Die Richtpreise beziehen sich auf " +
      "die im Aufmaß erfassten Mengen; Mehr- oder Mindermengen werden nach " +
      "tatsächlichem Aufmaß abgerechnet. Zusätzliche Leistungen werden vor " +
      "Ausführung als Nachtrag vorgelegt und erst nach Ihrer Freigabe " +
      "ausgeführt.",
  },
];

/** Gültigkeitsende eines Angebots. */
export function gueltigBis(ab = new Date(), tage = 30) {
  const d = new Date(ab);
  d.setDate(d.getDate() + tage);
  return d;
}

// ------------------------------------------------------------------- Ausdruck

function sicher(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function datum(wert) {
  if (!wert) return "";
  const d =
    typeof wert?.toDate === "function" ? wert.toDate() : wert instanceof Date ? wert : new Date(wert);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function mengeText(m) {
  return String(Math.round(mengeAus(m) * 100) / 100).replace(".", ",");
}

export const BETRIEB = {
  name: "Berisa Bau",
  zeile: "Fliesen · Badsanierung · Mikrozement · Renovierung",
  ort: "Mülheim an der Ruhr",
  telefon: "+49 155 6553 5408",
  email: "info@berisabau.de",
};

/**
 * Das Angebot als druckfertige Seite. Der Browser macht daraus ein PDF.
 *
 * Die Seitenumbrüche sind der Grund, warum das hier und nicht in einem selbst
 * gebauten PDF-Schreiber steht: Eine Position darf nicht zwischen Kurztext und
 * Preis auseinandergerissen werden, und die Konditionen sollen zusammenbleiben.
 * Beides erledigt CSS mit break-inside in zwei Zeilen.
 */
export function angebotHtml({ angebot, baustelle, positionen, konditionen, erstelltAm }) {
  const a = angebot || {};
  const b = baustelle || {};
  const s = summeRechnen(positionen, a.ustSatz || UST_SATZ);
  const heute = datum(erstelltAm || a.datum || new Date());
  const bis = datum(a.gueltigBis || gueltigBis(erstelltAm || new Date()));

  const zeilen = s.positionen
    .map(
      (p, i) => `
    <tr class="pos">
      <td class="nr">${i + 1}</td>
      <td>
        <div class="kurz">${sicher(p.kurztext)}</div>
        ${p.langtext ? `<div class="lang">${sicher(p.langtext)}</div>` : ""}
      </td>
      <td class="r nowrap">${mengeText(p.menge)} ${sicher(p.einheit)}</td>
      <td class="r nowrap">${euroAusCent(p.einzelpreisCent)}</td>
      <td class="r nowrap"><strong>${euroAusCent(p.nettoCent)}</strong></td>
    </tr>`
    )
    .join("");

  const kond = (konditionen && konditionen.length ? konditionen : KONDITIONEN_STANDARD)
    .map((k) => `<div class="kond"><strong>${sicher(k.titel)}</strong><p>${sicher(k.text)}</p></div>`)
    .join("");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${sicher(a.nummer || "Angebot")} — ${sicher(BETRIEB.name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #17171c; background: #fff; margin: 0; font-size: 10.5pt; line-height: 1.5;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 3px solid #D00000; padding-bottom: 12px; }
  .marke { font-size: 13pt; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #D00000; }
  .markeUnter { font-size: 8.5pt; color: #6a6a75; margin-top: 2px; }
  .absender { text-align: right; font-size: 8.5pt; color: #6a6a75; line-height: 1.6; }

  .anschrift { margin: 26px 0 8px; font-size: 11pt; line-height: 1.5; }
  .anschrift .klein { font-size: 9pt; color: #6a6a75; }
  .kopfzeile { display: flex; justify-content: space-between; align-items: flex-end;
               margin: 22px 0 6px; }
  h1 { font-size: 17pt; margin: 0; }
  .datumBlock { text-align: right; font-size: 9pt; color: #6a6a75; line-height: 1.6; }
  .betreff { font-size: 11pt; font-weight: 600; margin-bottom: 18px; }

  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .5px;
             color: #6a6a75; text-align: left; padding: 0 8px 7px; border-bottom: 1.5px solid #17171c; }
  /* Eine Position darf nicht zwischen Text und Preis zerschnitten werden. */
  tr.pos { break-inside: avoid; }
  tr.pos td { padding: 10px 8px; border-bottom: 1px solid #e8e8ee; vertical-align: top; }
  .nr { color: #9a9aa5; width: 8mm; }
  .kurz { font-weight: 600; }
  .lang { font-size: 8.5pt; color: #55555f; margin-top: 3px; line-height: 1.45; }
  .r { text-align: right; }
  .nowrap { white-space: nowrap; }

  .summen { margin-top: 14px; margin-left: auto; width: 78mm; break-inside: avoid; }
  .summen div { display: flex; justify-content: space-between; padding: 5px 8px; }
  .summen .gesamt { border-top: 2px solid #17171c; margin-top: 4px; padding-top: 9px;
                    font-size: 13pt; font-weight: 800; }

  .konditionen { margin-top: 30px; break-inside: avoid-page; }
  .konditionen h2 { font-size: 11pt; border-bottom: 1px solid #d8d8e0;
                    padding-bottom: 5px; margin: 0 0 12px; }
  .kond { margin-bottom: 11px; break-inside: avoid; }
  .kond strong { font-size: 9.5pt; }
  .kond p { margin: 2px 0 0; font-size: 9pt; color: #45454f; line-height: 1.5; }

  footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #d8d8e0;
           font-size: 8pt; color: #6a6a75; line-height: 1.6; }
  @media print { .druckhinweis { display: none; } }
  .druckhinweis { background: #fff6d6; border: 1px solid #e6d089; border-radius: 6px;
                  padding: 10px 14px; margin-bottom: 18px; font-size: 10pt; }
</style>
</head>
<body>
<div class="druckhinweis">
  Zum Speichern als PDF: <strong>Drucken</strong> wählen und als Ziel
  <strong>„Als PDF sichern“</strong>.
</div>

<header>
  <div>
    <div class="marke">${sicher(BETRIEB.name)}</div>
    <div class="markeUnter">${sicher(BETRIEB.zeile)}</div>
  </div>
  <div class="absender">
    ${sicher(BETRIEB.ort)}<br>
    ${sicher(BETRIEB.telefon)}<br>
    ${sicher(BETRIEB.email)}
  </div>
</header>

<div class="anschrift">
  <div class="klein">Angebot für</div>
  ${sicher(b.kundeName || "—")}<br>
  ${b.adresse ? `<span class="klein">${sicher(b.adresse)}</span>` : ""}
</div>

<div class="kopfzeile">
  <h1>Angebot ${sicher(a.nummer || "")}</h1>
  <div class="datumBlock">
    Datum: ${heute}<br>
    Gültig bis: ${bis}
  </div>
</div>
<div class="betreff">${sicher(a.betreff || b.name || "Bauleistung")}</div>

<table>
  <thead>
    <tr>
      <th></th><th>Leistung</th>
      <th class="r">Menge</th><th class="r">Einzelpreis</th><th class="r">Gesamt</th>
    </tr>
  </thead>
  <tbody>${zeilen || '<tr><td colspan="5" class="lang">Noch keine Positionen erfasst.</td></tr>'}</tbody>
</table>

<div class="summen">
  <div><span>Summe netto</span><span>${euroAusCent(s.nettoCent)}</span></div>
  <div><span>zzgl. ${s.ustSatz} % Umsatzsteuer</span><span>${euroAusCent(s.ustCent)}</span></div>
  <div class="gesamt"><span>Gesamtbetrag</span><span>${euroAusCent(s.bruttoCent)}</span></div>
</div>

<section class="konditionen">
  <h2>Konditionen</h2>
  ${kond}
</section>

<footer>
  ${sicher(BETRIEB.name)} · ${sicher(BETRIEB.zeile)} · ${sicher(BETRIEB.ort)}<br>
  Alle Preise in Euro. Gegenüber Verbrauchern verstehen sich die ausgewiesenen
  Gesamtbeträge inklusive Umsatzsteuer.
</footer>
</body>
</html>`;
}

export default {
  LEISTUNGEN, GEWERKE, MASSE_FELDER, KONDITIONEN_STANDARD, BETRIEB,
  leistungZu, gewerkZu, formelRechnen, vorlageAnwenden,
  positionRechnen, summeRechnen, naechsteNummer, gueltigBis, angebotHtml,
};
