// ---------------------------------------------------------------------------
// bauvision.js — Anbindung an den BauVision-Dienst (Vorher-Nachher-Entwürfe).
//
// Der Dienst läuft als kleiner Cloudflare-Worker, dessen Quelltext unter
// bauvision/worker/ liegt. Warum nicht direkt aus der App zum KI-Anbieter?
// Weil dann der API-Schlüssel in der App stecken müsste — und eine App kann
// jeder auseinandernehmen. Der Worker hält den Schlüssel und die Kostenbremse.
//
// >>> NACH DEM VERÖFFENTLICHEN DES WORKERS HIER DIE ADRESSE EINTRAGEN <<<
// Sie steht am Ende von "npx wrangler deploy" und sieht so aus:
//   https://bauvision.IHR-KONTO.workers.dev
// ---------------------------------------------------------------------------

export const BAUVISION = {
  dienst: "", // <-- hier eintragen
};

function adresse(pfad) {
  if (!BAUVISION.dienst) {
    throw new Error(
      "Die Entwurfs-Funktion ist noch nicht eingerichtet. " +
        "Bitte in src/bauvision.js die Adresse des Dienstes eintragen."
    );
  }
  return BAUVISION.dienst.replace(/\/+$/, "") + pfad;
}

/** Sagt, ob die Funktion überhaupt eingerichtet ist — für das Ausblenden im Menü. */
export function istEingerichtet() {
  return Boolean(BAUVISION.dienst);
}

/** Holt die auswählbaren Stile für ein Gewerk. */
export async function stileHolen(gewerk = "bad") {
  const res = await fetch(adresse("/katalog?gewerk=" + encodeURIComponent(gewerk)));
  if (!res.ok) throw new Error("Die Stilauswahl konnte nicht geladen werden.");
  const daten = await res.json();
  return daten.stile || [];
}

/**
 * Erzeugt die Entwürfe.
 *
 * @param {object} a
 * @param {string} a.bildBase64 — Foto als reines Base64 (ohne "data:"-Vorspann)
 * @param {string} a.stil
 * @param {string} [a.gewerk]
 * @param {string} [a.wuensche]
 * @param {string} [a.budget]
 * @returns {Promise<{vorher:string, bilder:{url:string}[], hinweis:string}>}
 */
export async function entwurfErstellen({
  bildBase64,
  stil,
  gewerk = "bad",
  wuensche = "",
  budget = "mittel",
}) {
  const res = await fetch(adresse("/visualisieren"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bild: `data:image/jpeg;base64,${bildBase64}`,
      gewerk,
      stil,
      wuensche,
      budget,
      varianten: 2,
    }),
  });

  const daten = await res.json().catch(() => ({}));
  if (!res.ok || !daten.ok) {
    throw new Error(daten.fehler || "Der Entwurf konnte nicht erstellt werden.");
  }
  return daten;
}

export default { BAUVISION, istEingerichtet, stileHolen, entwurfErstellen };
