// ---------------------------------------------------------------------------
// bauvision.js — Anbindung an den BauVision-Dienst (Vorher-Nachher-Entwürfe).
//
// Der Dienst läuft als kleiner Cloudflare-Worker, dessen Quelltext unter
// bauvision/worker/ liegt. Warum nicht direkt aus der App zum KI-Anbieter?
// Weil dann der API-Schlüssel in der App stecken müsste — und eine App kann
// jeder auseinandernehmen. Der Worker hält den Schlüssel und die Kostenbremse.
//
// Der Worker ist veröffentlicht (01.09.2026). Ändert sich die Adresse einmal,
// steht die neue am Ende von "npx wrangler deploy" im Ordner bauvision/worker.
// ---------------------------------------------------------------------------

export const BAUVISION = {
  dienst: "https://bauvision.werkbuch-berisabau.workers.dev",
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
 * Gibt einen Auftrag ab und wartet, bis die Entwürfe fertig sind.
 *
 * Seit dem 01.09.2026 rechnet nicht mehr ein bezahlter Anbieter, sondern das
 * MacBook im Betrieb (siehe bauvision/CLAUDE.md). Das ändert den Ablauf: Der
 * Dienst antwortet nicht mehr mit fertigen Bildern, sondern nimmt den Auftrag
 * an und meldet später, dass er fertig ist.
 *
 * Für die App heißt das: abgeben, dann in Ruhe nachfragen. Der Rückruf
 * `beiStand` wird dabei laufend über den Zwischenstand informiert — damit der
 * Handwerker beim Kunden nicht vor einem Bildschirm sitzt, auf dem nichts
 * passiert.
 *
 * @param {object} a
 * @param {string} a.bildBase64 — Foto als reines Base64 (ohne "data:"-Vorspann)
 * @param {string} a.stil
 * @param {string} [a.gewerk]
 * @param {string} [a.wuensche]
 * @param {string} [a.budget]
 * @param {(stand:object)=>void} [a.beiStand] — wird bei jeder Nachfrage aufgerufen
 * @param {number} [a.gedultSekunden] — wie lange gewartet wird, bevor aufgegeben wird
 * @returns {Promise<{vorher:string, bilder:{url:string}[], hinweis:string, adresse:string}>}
 */
export async function entwurfErstellen({
  bildBase64,
  stil,
  gewerk = "bad",
  wuensche = "",
  budget = "mittel",
  beiStand,
  gedultSekunden = 600,
}) {
  const abgabe = await fetch(adresse("/auftrag"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fotos: [`data:image/jpeg;base64,${bildBase64}`],
      gewerk,
      stil,
      wunsch: wuensche,
      budget,
      // Der Handwerker fotografiert seinen eigenen Aufmaßtermin — die
      // Einwilligung holt er beim Kunden vor Ort ein, nicht über ein Formular.
      // Die Referenzfreigabe bleibt trotzdem aus: Sie muss ausdrücklich
      // erteilt werden, und das kann diese App nicht für den Kunden tun.
      einwilligung: { verarbeitung: true, keinePersonen: true, referenz: false },
    }),
  });

  const angenommen = await abgabe.json().catch(() => ({}));
  if (!abgabe.ok || !angenommen.ok) {
    throw new Error(angenommen.fehler || "Der Auftrag konnte nicht abgegeben werden.");
  }

  const frist = Date.now() + gedultSekunden * 1000;
  let wartezeit = 4000;

  for (;;) {
    const stand = await auftragLesen(angenommen.id);
    beiStand?.(stand);

    if (stand.zustand === "fertig" && stand.entwuerfe?.length) {
      return {
        vorher: stand.vorher?.[0] || "",
        bilder: stand.entwuerfe.map((e) => ({ url: e.bild, geprueft: e.geprueft })),
        hinweis: stand.hinweis,
        adresse: angenommen.adresse,
        id: angenommen.id,
      };
    }

    if (stand.zustand === "handarbeit") {
      throw new Error(
        "Für diesen Raum liefert die Maschine nichts Brauchbares. " +
          "Der Entwurf wird von Hand erstellt."
      );
    }

    if (Date.now() > frist) {
      // Kein Fehler im eigentlichen Sinn: Der Auftrag läuft weiter, nur eben
      // nicht mehr, während jemand zusieht. Deshalb kommt die Adresse mit.
      const f = new Error(
        "Die Entwürfe sind noch nicht fertig — meist ist der Rechner im Büro gerade aus. " +
          "Sie kommen später unter diesem Link: " + angenommen.adresse
      );
      f.adresse = angenommen.adresse;
      f.id = angenommen.id;
      throw f;
    }

    await new Promise((r) => setTimeout(r, wartezeit));
    // Anfangs häufiger nachfragen, dann seltener: Die ersten Sekunden sind
    // die, in denen jemand wirklich auf den Bildschirm schaut.
    wartezeit = Math.min(15000, Math.round(wartezeit * 1.25));
  }
}

/** Fragt den Stand eines Auftrags ab. */
export async function auftragLesen(id) {
  const res = await fetch(adresse("/auftrag/" + encodeURIComponent(id)));
  const daten = await res.json().catch(() => ({}));
  if (!res.ok || !daten.ok) throw new Error(daten.fehler || "Der Auftrag ist nicht auffindbar.");
  return daten;
}

export default { BAUVISION, istEingerichtet, stileHolen, entwurfErstellen, auftragLesen };
