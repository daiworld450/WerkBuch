// ---------------------------------------------------------------------------
// einordnung.js — Phase und Raum eines Fotos, reine Logik ohne Netz und Speicher.
//
// Warum es das gibt: Aus den WerkBuch-Fotos werden die Beiträge für Instagram
// und Co. gebaut (baustellen-zuordnung/werkbuch_nach_social.py). Dafür muss
// jedes Foto wissen, in welchem Raum es entstand und in welcher Bauphase. Bis
// 22.10.2026 fragte die App nur nach der Phase und setzte stillschweigend die
// erste an — Folge: Dutzende Fotos als „Vorher“ oder „Rohinstallation“, die
// etwas ganz anderes zeigten, und Baustellen ohne ein einziges Fertig-Foto.
//
// Deshalb: keine Vorauswahl, beides ist Pflicht.
//
// Die Raum-Werte sind bewusst ohne Umlaute (Kueche, Aussentreppe). So stehen
// sie schon im Bestand, und der Generator schlägt den Titel darüber nach.
// ---------------------------------------------------------------------------

export const BEREICHE = [
  { wert: "Bad", label: "Bad" },
  { wert: "WC", label: "WC" },
  { wert: "Kueche", label: "Küche" },
  { wert: "Flur", label: "Flur" },
  { wert: "Wohnzimmer", label: "Wohnzimmer" },
  { wert: "Zimmer", label: "Zimmer" },
  { wert: "Balkon", label: "Balkon" },
  { wert: "Aussentreppe", label: "Außentreppe" },
  { wert: "Aussenbereich", label: "Außenbereich" },
  { wert: "Wohnung", label: "Wohnung" },
];

/** Freitext zu einem Raum-Wert: ohne Umlaute, ohne Leerzeichen, erster Buchstabe groß. */
export function bereichWert(text) {
  let t = String(text || "").trim();
  for (const [von, nach] of [["ä", "ae"], ["ö", "oe"], ["ü", "ue"], ["Ä", "Ae"], ["Ö", "Oe"], ["Ü", "Ue"], ["ß", "ss"]]) {
    t = t.split(von).join(nach);
  }
  t = t.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** Anzeigename zu einem gespeicherten Raum-Wert. */
export function bereichLabel(wert) {
  const treffer = BEREICHE.find((b) => b.wert === wert);
  return treffer ? treffer.label : String(wert || "");
}

/** Ist die Einordnung vollständig? Der Grund wird dem Nutzer wörtlich gezeigt. */
export function pruefeEinordnung({ phase, bereich }) {
  const fehlt = [];
  if (!phase) fehlt.push("die Bauphase");
  if (!bereich) fehlt.push("den Raum");
  if (fehlt.length === 0) return { ok: true };
  return {
    ok: false,
    grund: `Bitte zuerst ${fehlt.join(" und ")} wählen. Ohne das lässt sich das Foto später nicht zuordnen.`,
  };
}

/** Heutiges Datum (Ortszeit) als JJJJ-MM-TT — gleiche Form wie im Bestand. */
export function heute(jetzt = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}`;
}

/** Felder, die zusätzlich zu Phase und Notiz ins Foto-Dokument gehören. */
export function einordnungsFelder(eintrag) {
  if (!eintrag?.bereich) return {};
  return {
    bereich: eintrag.bereich,
    // Beides hat der Handwerker selbst gewählt, vor Ort — also gesichert.
    geprueft: true,
    eingeordnet: eintrag.eingeordnet || heute(),
  };
}

export default { BEREICHE, bereichWert, bereichLabel, pruefeEinordnung, heute, einordnungsFelder };
