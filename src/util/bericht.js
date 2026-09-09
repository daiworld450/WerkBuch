// ---------------------------------------------------------------------------
// bericht.js — der Projektbericht als druckfertiges Dokument.
//
// Eine Baustelle in einer Chronologie: Fotos nach Bauphase, mit Datum, dazu
// die Eckdaten und die vom Kunden freigegebenen Nachträge. Das ist die
// Funktion, mit der Craftnote wirbt — und der Grund, warum ein Kunde nach
// getaner Arbeit noch etwas in der Hand hat.
//
// Bewusst HTML statt einer PDF-Bibliothek:
//   * Kein zusätzliches Paket, kein bezahlter Dienst, kein Server.
//   * Der Browser druckt es nach PDF — auf dem Mac wie auf dem iPhone.
//   * Seitenumbrüche lassen sich in CSS genau steuern (break-inside), was mit
//     einem selbst gebauten PDF-Schreiber deutlich mehr Arbeit wäre.
//
// Diese Datei ist reine Textverarbeitung: kein Firestore, kein React. Damit
// ist sie prüfbar (tests/bericht.test.cjs) — vor allem daraufhin, dass
// Kundentexte nicht das Dokument zerlegen können.
// ---------------------------------------------------------------------------

import { euroAusCent } from "./nachtrag";

/**
 * Macht Text für HTML unschädlich.
 *
 * Ohne das würde ein Baustellenname wie "Bad <Familie> Müller" das Dokument
 * durcheinanderbringen — und ein böswilliger Text könnte im gedruckten Bericht
 * Dinge behaupten, die nie eingegeben wurden.
 */
export function sicher(text) {
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
    typeof wert?.toDate === "function"
      ? wert.toDate()
      : wert instanceof Date
      ? wert
      : new Date(wert);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Der Zeitpunkt, der für ein Foto gilt: Aufnahme vor Upload. */
export function fotoZeit(foto) {
  const w = foto?.aufgenommenAm || foto?.erstelltAm;
  if (!w) return 0;
  if (typeof w?.seconds === "number") return w.seconds * 1000;
  if (typeof w?.toDate === "function") return w.toDate().getTime();
  const d = new Date(w);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Fotos nach Bauphase gruppieren, innerhalb der Phase chronologisch aufsteigend
 * (der Bericht erzählt vorwärts, nicht rückwärts). Leere Phasen fallen weg.
 */
export function nachPhasen(fotos, phasen) {
  const liste = Array.isArray(fotos) ? fotos : [];
  return (phasen || [])
    .map((phase) => ({
      phase,
      fotos: liste
        .filter((f) => f.phase === phase)
        .sort((a, b) => fotoZeit(a) - fotoZeit(b)),
    }))
    .filter((g) => g.fotos.length > 0);
}

/**
 * Baut den vollständigen Bericht als HTML-Seite.
 *
 * Alles eingebettet, keine fremden Dateien außer den Bildadressen selbst —
 * die Seite lässt sich damit speichern, drucken und weitergeben.
 */
export function berichtHtml({ baustelle, gruppen, nachtraege, erstelltAm }) {
  const b = baustelle || {};
  const heute = datum(erstelltAm || new Date());

  const kopfzeilen = [
    b.adresse ? `<div class="zeile"><span>Adresse</span>${sicher(b.adresse)}</div>` : "",
    b.kundeName ? `<div class="zeile"><span>Auftraggeber</span>${sicher(b.kundeName)}</div>` : "",
    b.geplantStart
      ? `<div class="zeile"><span>Zeitraum</span>${datum(b.geplantStart)}${
          b.geplantEnde ? " – " + datum(b.geplantEnde) : ""
        }</div>`
      : "",
    b.status ? `<div class="zeile"><span>Stand</span>${sicher(b.status)}</div>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const abschnitte = (gruppen || [])
    .map(
      (g) => `
    <section class="phase">
      <h2>${sicher(g.phase)}</h2>
      <div class="raster">
        ${g.fotos
          .map(
            (f) => `
        <figure>
          <img src="${sicher(f.url)}" alt="${sicher(g.phase)}" loading="lazy">
          <figcaption>
            ${f.notiz ? `<strong>${sicher(f.notiz)}</strong><br>` : ""}
            ${datum(f.aufgenommenAm || f.erstelltAm)}
          </figcaption>
        </figure>`
          )
          .join("")}
      </div>
    </section>`
    )
    .join("\n");

  const freigegeben = (nachtraege || []).filter(
    (n) => n.status === "freigegeben" || n.status === "abgerechnet"
  );

  const nachtragTeil = freigegeben.length
    ? `
    <section class="nachtraege">
      <h2>Zusätzlich beauftragte Leistungen</h2>
      <table>
        <thead><tr><th>Nr.</th><th>Leistung</th><th class="r">Menge</th><th class="r">Netto</th></tr></thead>
        <tbody>
          ${freigegeben
            .map(
              (n) => `<tr>
            <td>${sicher(n.nummer)}</td>
            <td>${sicher(n.titel)}${
                n.beschreibung ? `<br><span class="klein">${sicher(n.beschreibung)}</span>` : ""
              }</td>
            <td class="r">${String(n.menge).replace(".", ",")} ${sicher(n.einheit)}</td>
            <td class="r">${euroAusCent(n.nettoCent)}</td>
          </tr>`
            )
            .join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="3">Summe der freigegebenen Nachträge</td>
          <td class="r">${euroAusCent(
            freigegeben.reduce((s, n) => s + (n.nettoCent || 0), 0)
          )}</td>
        </tr></tfoot>
      </table>
      <p class="klein">
        Jede dieser Leistungen wurde vom Auftraggeber einzeln und nachweislich freigegeben.
      </p>
    </section>`
    : "";

  const anzahlFotos = (gruppen || []).reduce((s, g) => s + g.fotos.length, 0);

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Projektbericht — ${sicher(b.name || "Baustelle")}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #17171c; background: #fff; margin: 0;
    font-size: 11pt; line-height: 1.5;
  }
  header { border-bottom: 3px solid #D00000; padding-bottom: 14px; margin-bottom: 22px; }
  .marke { font-size: 10pt; letter-spacing: 2px; text-transform: uppercase; color: #D00000; font-weight: 700; }
  h1 { font-size: 22pt; margin: 6px 0 2px; line-height: 1.15; }
  .unter { color: #6a6a75; font-size: 10pt; }
  .eckdaten { margin: 18px 0 26px; }
  .zeile { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px solid #e8e8ee; font-size: 10.5pt; }
  .zeile span { width: 34mm; color: #6a6a75; flex: none; }

  h2 {
    font-size: 13pt; margin: 0 0 10px; padding-bottom: 6px;
    border-bottom: 1px solid #d8d8e0; letter-spacing: .3px;
  }
  /* Eine Bauphase soll nach Möglichkeit nicht mitten durchgeschnitten werden. */
  .phase { margin-bottom: 26px; break-inside: avoid-page; }
  .raster { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  figure { margin: 0; break-inside: avoid; }
  figure img {
    width: 100%; height: 62mm; object-fit: cover;
    border-radius: 4px; border: 1px solid #d8d8e0; background: #f2f2f6;
  }
  figcaption { font-size: 8.5pt; color: #6a6a75; margin-top: 4px; line-height: 1.35; }
  figcaption strong { color: #17171c; font-weight: 600; }

  .nachtraege { margin-top: 30px; break-inside: avoid-page; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e8e8ee; vertical-align: top; }
  th { color: #6a6a75; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: .5px; }
  .r { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; border-top: 2px solid #17171c; border-bottom: none; }
  .klein { font-size: 8.5pt; color: #6a6a75; }

  footer { margin-top: 34px; padding-top: 12px; border-top: 1px solid #d8d8e0; font-size: 8.5pt; color: #6a6a75; }
  @media print { .druckhinweis { display: none; } }
  .druckhinweis {
    background: #fff6d6; border: 1px solid #e6d089; border-radius: 6px;
    padding: 10px 14px; margin-bottom: 20px; font-size: 10pt;
  }
</style>
</head>
<body>
<div class="druckhinweis">
  Zum Speichern als PDF: <strong>Drucken</strong> wählen und als Ziel
  <strong>„Als PDF sichern“</strong> — das Fenster kann danach geschlossen werden.
</div>

<header>
  <div class="marke">Berisa Bau</div>
  <h1>${sicher(b.name || "Baustelle")}</h1>
  <div class="unter">Projektbericht · Stand ${heute} · ${anzahlFotos} ${
    anzahlFotos === 1 ? "Foto" : "Fotos"
  }</div>
</header>

<div class="eckdaten">
${kopfzeilen}
</div>

${abschnitte || '<p class="klein">Zu dieser Baustelle liegen noch keine Fotos vor.</p>'}

${nachtragTeil}

<footer>
  Berisa Bau · Fliesen, Badsanierung, Mikrozement, Renovierung · Mülheim an der Ruhr<br>
  Erstellt mit WerkBuch am ${heute}.
</footer>
</body>
</html>`;
}

export default { sicher, fotoZeit, nachPhasen, berichtHtml };
