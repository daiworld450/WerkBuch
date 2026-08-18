// ---------------------------------------------------------------------------
// portal.js — die Schnittstellen des Kundenportals.
//
// Der Kunde ist hier NICHT angemeldet. Alles, was er mitbringt, ist der Token
// aus seinem Link. Deshalb prüft jede Funktion zuerst diesen Token — und die
// Freigabe zusätzlich den per E-Mail zugestellten Sicherheitscode.
//
// Der Ablauf der Freigabe (freigeben) folgt Spezifikation Kapitel 8.1 Schritt
// für Schritt. Zwei Prüfungen darin sind der eigentliche Kern des Moduls:
//
//   - Dokument-Abdruck: Hat sich das Angebot geändert, seit der Kunde es
//     geöffnet hat?
//   - Betrag: Stimmt die Summe, die er auf dem Bildschirm sah, noch?
//
// Beides verhindert, dass jemand etwas anderes freigibt, als er gesehen hat.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

import { ZUGANG, ANGEBOT, EINWILLIGUNGEN, KNOPF_BESCHRIFTUNG, AGB_STAND, FIRMA, GRUNDPAKET } from "./config.js";
import {
  tokenErzeugen,
  tokenHashen,
  codeErzeugen,
  codeHashen,
  ablaufDatum,
  portalAdresse,
  zugangPruefen,
  codePruefen,
} from "./magicLink.js";
import { summeRechnen, pruefungNoetig } from "./zulagen.js";
import { angebotsLinkSenden, codeSenden, freigabeBestaetigen, betriebBenachrichtigen } from "./mail.js";

const db = () => getFirestore();

const REGION = "europe-west3"; // Frankfurt — Daten bleiben in der EU
const GEHEIM = ["MAIL_PASSWORT"];

// Einheitliches Fehlerformat mit deutschem Klartext (Spezifikation Kapitel 15).
// Der Kunde bekommt nie eine technische Meldung zu sehen.
function fehler(code, nachricht, details) {
  return new HttpsError("failed-precondition", nachricht, { code, ...details });
}

// Der Abdruck über den fachlichen Inhalt des Angebots. Ändert der Handwerker
// PDF, Betrag oder Status, ändert sich der Abdruck — und eine Freigabe, die
// noch den alten Stand meint, wird abgelehnt statt stillschweigend übernommen.
export function angebotAbdruck(angebot) {
  const kern = JSON.stringify({
    pdfUrl: angebot?.pdfUrl || null,
    seiten: angebot?.seiten || 0,
    betrag: angebot?.betrag ?? null,
    status: angebot?.status || null,
  });
  return crypto.createHash("sha256").update(kern).digest("hex");
}

// Lädt den Zugang zum Token und die zugehörige Baustelle. Wirft, wenn der
// Token unbekannt, abgelaufen oder widerrufen ist.
async function zugangLaden(token, { verifiziertNoetig = false } = {}) {
  if (!token || typeof token !== "string") {
    throw fehler("TOKEN_FEHLT", "Der Link ist unvollständig. Bitte öffnen Sie ihn erneut aus Ihrer E-Mail.");
  }

  const hash = tokenHashen(token);
  const snap = await db().collection("magicLinks").doc(hash).get();
  const daten = snap.exists ? snap.data() : null;
  const stand = zugangPruefen(daten);

  if (!stand.gueltig) {
    const texte = {
      unbekannt: "Dieser Link ist uns nicht bekannt. Bitte prüfen Sie, ob Sie ihn vollständig geöffnet haben.",
      abgelaufen: "Dieser Link ist abgelaufen. Bitte fordern Sie ein neues Angebot an.",
      widerrufen: "Dieser Link wurde zurückgezogen. Bitte wenden Sie sich an uns.",
    };
    throw fehler("ZUGANG_UNGUELTIG", texte[stand.grund] || texte.unbekannt, { grund: stand.grund });
  }

  if (verifiziertNoetig && !stand.verifiziert) {
    throw new HttpsError(
      "unauthenticated",
      "Bitte bestätigen Sie zuerst den Code, den wir Ihnen per E-Mail geschickt haben.",
      { code: "NICHT_VERIFIZIERT" }
    );
  }

  const bausnap = await db().collection("baustellen").doc(daten.baustelleId).get();
  if (!bausnap.exists) {
    throw fehler("BAUSTELLE_FEHLT", "Zu diesem Link finden wir kein Projekt mehr.");
  }

  return { hash, zugang: daten, baustelleId: daten.baustelleId, baustelle: bausnap.data() };
}

async function katalogLaden() {
  const snap = await db().collection("zulagenKatalog").where("aktiv", "==", true).get();
  return snap.docs.map((d) => ({ sku: d.id, ...d.data() })).sort((a, b) => a.reihenfolge - b.reihenfolge);
}

// Summiert alle bereits bestätigten Zulagen — Grundlage für die Grenzen aus
// Spezifikation 6.4 und für die Anzeige "offen für die Schlussrechnung".
async function bereitsFreigegeben(baustelleId) {
  const snap = await db()
    .collection("baustellen")
    .doc(baustelleId)
    .collection("zulagenBestellungen")
    .where("status", "in", ["bestaetigt", "wird_erstellt", "fertig"])
    .get();

  let anzahl = 0;
  let bruttoCent = 0;
  for (const d of snap.docs) {
    const b = d.data();
    anzahl += (b.positionen || []).reduce((s, p) => s + p.menge, 0);
    bruttoCent += b.bruttoCent || 0;
  }
  return { anzahl, bruttoCent };
}

async function protokollieren(baustelleId, eintrag) {
  await db()
    .collection("baustellen")
    .doc(baustelleId)
    .collection("protokoll")
    .add({ ...eintrag, zeitpunkt: FieldValue.serverTimestamp() });
}

// --------------------------------------------------------------------------
// Angebot ansehen. Funktioniert ohne Code — Lesen ist erlaubt, nur Freigeben
// nicht (Spezifikation Kapitel 3).
// --------------------------------------------------------------------------
export const portalAnsehen = onCall({ region: REGION, cors: true }, async (req) => {
  const { token } = req.data || {};
  const { zugang, baustelleId, baustelle } = await zugangLaden(token);

  const angebotSnap = await db()
    .collection("baustellen")
    .doc(baustelleId)
    .collection("angebot")
    .doc("aktuell")
    .get();
  const angebot = angebotSnap.exists ? angebotSnap.data() : null;

  const [katalog, freigegeben] = await Promise.all([katalogLaden(), bereitsFreigegeben(baustelleId)]);

  const gueltigBis = zugang.angebotGueltigBis?.toDate?.() || null;
  const abgelaufen = gueltigBis ? new Date() > gueltigBis : false;

  await protokollieren(baustelleId, {
    aktion: "angebot_angesehen",
    akteur: "kunde",
    akteurMail: zugang.email,
  });

  // Beim ersten Öffnen den Handwerker benachrichtigen (Spezifikation 11).
  if (!zugang.ersteAnsichtAm) {
    await db().collection("magicLinks").doc(tokenHashen(token)).update({
      ersteAnsichtAm: FieldValue.serverTimestamp(),
    });
  }

  return {
    kunde: { name: zugang.kundeName || baustelle.kundeName || "", email: zugang.email },
    baustelle: { name: baustelle.name, adresse: baustelle.adresse, status: baustelle.status },
    angebot: angebot
      ? {
          dateiname: angebot.dateiname,
          pdfUrl: angebot.pdfUrl,
          seiten: angebot.seiten || 1,
          betragCent: angebot.betrag != null ? Math.round(angebot.betrag * 100) : null,
          status: angebot.status,
          abdruck: angebotAbdruck(angebot),
        }
      : null,
    katalog: katalog.map((z) => ({
      sku: z.sku,
      name: z.name,
      beschreibung: z.beschreibung,
      einheit: z.einheit,
      preisCent: z.preisCent,
      typ: z.typ,
      gibtGuthaben: z.gibtGuthaben,
      maxMenge: z.maxMengeJeBestellung,
      brauchtPruefung: !!z.braucht_pruefung,
      staffeln: z.staffeln || [],
    })),
    grundpaket: GRUNDPAKET,
    bereitsGewaehlt: freigegeben,
    einwilligungen: EINWILLIGUNGEN,
    knopfBeschriftung: KNOPF_BESCHRIFTUNG,
    verifiziert: !!zugang.verifiziertAm,
    gueltigBis: gueltigBis ? gueltigBis.toISOString() : null,
    abgelaufen,
    countdownAbTagen: ANGEBOT.countdownAbTagen,
  };
});

// --------------------------------------------------------------------------
// Sicherheitscode anfordern und prüfen.
// --------------------------------------------------------------------------
export const portalCodeAnfordern = onCall({ region: REGION, cors: true, secrets: GEHEIM }, async (req) => {
  const { token } = req.data || {};
  const { hash, zugang } = await zugangLaden(token);

  const code = codeErzeugen();
  await db()
    .collection("magicLinks")
    .doc(hash)
    .update({
      codeHash: codeHashen(code),
      codeGueltigBis: Timestamp.fromDate(new Date(Date.now() + ZUGANG.codeGueltigMinuten * 60 * 1000)),
      codeVersuche: 0,
    });

  await codeSenden({ an: zugang.email, code });

  // Die Adresse nur angedeutet zurückgeben — sie steht zwar in der Mail des
  // Kunden, muss aber nicht jedem gezeigt werden, der den Link besitzt.
  const [vorne, hinten] = String(zugang.email).split("@");
  return {
    gesendetAn: `${vorne.slice(0, 2)}${"•".repeat(Math.max(1, vorne.length - 2))}@${hinten}`,
    gueltigMinuten: ZUGANG.codeGueltigMinuten,
  };
});

export const portalCodePruefen = onCall({ region: REGION, cors: true }, async (req) => {
  const { token, code } = req.data || {};
  const { hash, zugang, baustelleId } = await zugangLaden(token);

  const ergebnis = codePruefen(zugang, code);

  if (!ergebnis.ok) {
    if (ergebnis.grund === "falsch") {
      await db().collection("magicLinks").doc(hash).update({ codeVersuche: FieldValue.increment(1) });
      throw fehler(
        "CODE_FALSCH",
        ergebnis.verbleibend > 0
          ? `Der Code stimmt nicht. Sie haben noch ${ergebnis.verbleibend} Versuche.`
          : "Der Code stimmt nicht. Bitte fordern Sie einen neuen an.",
        { verbleibend: ergebnis.verbleibend }
      );
    }
    const texte = {
      kein_code: "Bitte fordern Sie zuerst einen Code an.",
      zu_viele_versuche: "Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.",
      abgelaufen: "Der Code ist abgelaufen. Bitte fordern Sie einen neuen an.",
    };
    throw fehler("CODE_UNGUELTIG", texte[ergebnis.grund], { grund: ergebnis.grund });
  }

  await db().collection("magicLinks").doc(hash).update({
    verifiziertAm: FieldValue.serverTimestamp(),
    codeHash: FieldValue.delete(),
    codeGueltigBis: FieldValue.delete(),
    codeVersuche: 0,
  });

  await protokollieren(baustelleId, {
    aktion: "verifiziert",
    akteur: "kunde",
    akteurMail: zugang.email,
  });

  return { verifiziert: true };
});

// --------------------------------------------------------------------------
// Zwischenstand der Zulagen-Auswahl speichern und Summe berechnen.
// Legt noch KEINE Bestellung an (Spezifikation Kapitel 17, erstes Szenario) —
// erst die Freigabe tut das.
// --------------------------------------------------------------------------
export const portalZulagenRechnen = onCall({ region: REGION, cors: true }, async (req) => {
  const { token, auswahl } = req.data || {};
  const { hash, baustelleId } = await zugangLaden(token);

  const [katalog, freigegeben] = await Promise.all([katalogLaden(), bereitsFreigegeben(baustelleId)]);
  const summe = summeRechnen(auswahl, katalog);
  const pruefung = pruefungNoetig(summe, freigegeben);

  // Auswahl merken, damit sie beim Neuladen der Seite erhalten bleibt.
  await db()
    .collection("magicLinks")
    .doc(hash)
    .update({ auswahl: auswahl || [], auswahlAm: FieldValue.serverTimestamp() });

  return { summe, pruefung };
});

// --------------------------------------------------------------------------
// Die Freigabe. Der rechtlich und fachlich wichtigste Vorgang des Moduls.
// Ablauf exakt nach Spezifikation 8.1.
// --------------------------------------------------------------------------
export const portalFreigeben = onCall({ region: REGION, cors: true, secrets: GEHEIM }, async (req) => {
  const { token, idempotenzSchluessel, erwarteterAbdruck, erwarteterBetragCent, auswahl, einwilligungen } =
    req.data || {};

  if (!idempotenzSchluessel || typeof idempotenzSchluessel !== "string") {
    throw fehler("SCHLUESSEL_FEHLT", "Technischer Fehler bei der Übertragung. Bitte laden Sie die Seite neu.");
  }

  const { zugang, baustelleId } = await zugangLaden(token, { verifiziertNoetig: true });

  const bausRef = db().collection("baustellen").doc(baustelleId);
  const freigabeRef = bausRef.collection("freigaben").doc(idempotenzSchluessel);
  const angebotRef = bausRef.collection("angebot").doc("aktuell");

  const [katalog, freigegeben] = await Promise.all([katalogLaden(), bereitsFreigegeben(baustelleId)]);

  // Alles Prüfen und Schreiben in EINER Transaktion, damit zwei gleichzeitige
  // Freigaben sich nicht überholen können.
  const ergebnis = await db().runTransaction(async (tx) => {
    // Schritt 2d: Wurde mit diesem Schlüssel schon freigegeben? Dann die alte
    // Antwort zurückgeben und nichts erneut anlegen. Das ist der Schutz gegen
    // Doppelklick und gegen Wiederholung nach Netzabbruch.
    const vorhanden = await tx.get(freigabeRef);
    if (vorhanden.exists) {
      const d = vorhanden.data();
      return { wiederholung: true, antwort: d.antwort };
    }

    const angebotSnap = await tx.get(angebotRef);
    if (!angebotSnap.exists) {
      throw fehler("KEIN_ANGEBOT", "Zu diesem Projekt liegt derzeit kein Angebot vor.");
    }
    const angebot = angebotSnap.data();

    // Schritt 2b: Ist das Angebot noch dasselbe wie beim Öffnen der Seite?
    const abdruckJetzt = angebotAbdruck(angebot);
    if (erwarteterAbdruck && erwarteterAbdruck !== abdruckJetzt) {
      throw fehler(
        "CONFLICT_DOCUMENT_CHANGED",
        "Das Angebot wurde soeben geändert. Bitte sehen Sie sich die aktualisierte Fassung an.",
        { abdruckJetzt }
      );
    }

    const summe = summeRechnen(auswahl, katalog);
    const angebotCent = angebot.betrag != null ? Math.round(angebot.betrag * 100) : 0;
    const gesamtCent = angebotCent + summe.bruttoCent;

    // Schritt 2c: Stimmt der Betrag, den der Kunde gesehen hat?
    if (erwarteterBetragCent != null && Number(erwarteterBetragCent) !== gesamtCent) {
      throw fehler(
        "CONFLICT_AMOUNT_CHANGED",
        "Der Betrag hat sich geändert. Bitte prüfen Sie die aktualisierte Übersicht.",
        { erwartet: Number(erwarteterBetragCent), tatsaechlich: gesamtCent }
      );
    }

    // Schritt 2e: Alle Pflicht-Einwilligungen gesetzt?
    for (const [schluessel, regel] of Object.entries(EINWILLIGUNGEN)) {
      if (regel.pflicht && !einwilligungen?.[schluessel]) {
        throw new HttpsError(
          "invalid-argument",
          "Bitte bestätigen Sie alle Pflichtangaben, bevor Sie beauftragen.",
          { code: "EINWILLIGUNG_FEHLT", feld: schluessel }
        );
      }
    }

    const pruefung = pruefungNoetig(summe, freigegeben);
    const jetzt = new Date();

    // Der WORTLAUT der Erklärungen wird mitgespeichert, nicht nur ein Verweis
    // (Spezifikation 8.2). Texte ändern sich — später muss rekonstruierbar
    // sein, was damals auf dem Bildschirm stand.
    const einwilligungsTexte = { knopfBeschriftung: KNOPF_BESCHRIFTUNG, agbStand: AGB_STAND };
    for (const [schluessel, regel] of Object.entries(EINWILLIGUNGEN)) {
      if (einwilligungen?.[schluessel]) einwilligungsTexte[schluessel] = regel.text;
    }

    const antwort = {
      entscheidung: "angenommen",
      gesamtCent,
      angebotCent,
      zulagenCent: summe.bruttoCent,
      positionen: summe.positionen,
      wartetAufPruefung: pruefung.noetig,
      pruefGrund: pruefung.grund || null,
      zeitpunkt: jetzt.toISOString(),
    };

    // Der Freigabe-Datensatz ist unveränderlich (Sicherheitsregeln erlauben
    // kein Ändern und kein Löschen) — er ist der Nachweis der Beauftragung.
    tx.set(freigabeRef, {
      gegenstand: "angebot",
      baustelleId,
      dokumentAbdruck: abdruckJetzt,
      betragBruttoCent: gesamtCent,
      entscheidung: "angenommen",
      kundeName: zugang.kundeName || "",
      kundeMail: zugang.email,
      verifikationsArt: "email_code",
      ipAdresse: req.rawRequest?.ip || null,
      browserKennung: req.rawRequest?.headers?.["user-agent"] || null,
      einwilligungsTexte,
      antwort,
      erstelltAm: FieldValue.serverTimestamp(),
    });

    // Angebotsstatus mitziehen, damit Handwerker-Ansicht und Portal dasselbe
    // zeigen.
    tx.update(angebotRef, { status: "Angenommen", aktualisiertAm: FieldValue.serverTimestamp() });

    // Zulagen als eigene Bestellung anlegen (getrennte Spur B, Spezifikation
    // Kapitel 2) — ohne Zahlung, sie laufen über die Schlussrechnung.
    if (summe.positionen.length > 0) {
      const bestellRef = bausRef.collection("zulagenBestellungen").doc();
      tx.set(bestellRef, {
        positionen: summe.positionen,
        nettoCent: summe.nettoCent,
        ustJeSatz: summe.ustJeSatz,
        bruttoCent: summe.bruttoCent,
        guthaben: summe.guthaben,
        status: pruefung.noetig ? "wartet_auf_pruefung" : "bestaetigt",
        pruefGrund: pruefung.grund || null,
        freigabeId: idempotenzSchluessel,
        abrechnung: "schlussrechnung",
        erstelltAm: FieldValue.serverTimestamp(),
      });

      // Guthaben nur gutschreiben, wenn keine Prüfung aussteht.
      if (!pruefung.noetig && summe.guthaben > 0) {
        tx.set(bausRef.collection("guthaben").doc(), {
          veraenderung: summe.guthaben,
          grund: "zulage",
          bezugTyp: "zulagenBestellung",
          bezugId: bestellRef.id,
          erstelltAm: FieldValue.serverTimestamp(),
        });
      }
    }

    // Grundkontingent bei der ersten Annahme gutschreiben (Spezifikation 6.1).
    if (!zugang.grundpaketGebucht) {
      tx.set(bausRef.collection("guthaben").doc(), {
        veraenderung: GRUNDPAKET.visualisierungen,
        grund: "paket",
        bezugTyp: "freigabe",
        bezugId: idempotenzSchluessel,
        erstelltAm: FieldValue.serverTimestamp(),
      });
    }

    tx.set(bausRef.collection("protokoll").doc(), {
      aktion: "angebot_freigegeben",
      akteur: "kunde",
      akteurMail: zugang.email,
      betragCent: gesamtCent,
      zeitpunkt: FieldValue.serverTimestamp(),
    });

    return { wiederholung: false, antwort };
  });

  // Nach dem Festschreiben: Mails versenden. Bewusst außerhalb der Transaktion
  // — ein Mailproblem darf eine gültige Beauftragung nicht rückgängig machen.
  if (!ergebnis.wiederholung) {
    await db().collection("magicLinks").doc(tokenHashen(token)).update({ grundpaketGebucht: true });

    const a = ergebnis.antwort;
    try {
      await freigabeBestaetigen({
        an: zugang.email,
        kundeName: zugang.kundeName,
        entscheidung: "angenommen",
        betragCent: a.gesamtCent,
        zeitpunkt: new Date(a.zeitpunkt).toLocaleString("de-DE"),
        positionen: a.positionen,
      });
      await betriebBenachrichtigen({
        an: FIRMA.absenderMail,
        titel: "Angebot angenommen",
        zeilen: [
          `Kunde: ${zugang.kundeName || zugang.email}`,
          `Betrag gesamt: ${(a.gesamtCent / 100).toFixed(2)} €`,
          a.positionen.length ? `Zulagen: ${a.positionen.map((p) => `${p.menge}× ${p.name}`).join(", ")}` : "Keine Zulagen",
          a.wartetAufPruefung ? `⚠ Wartet auf Ihre Prüfung (${a.pruefGrund})` : "Automatisch bestätigt",
        ],
      });
    } catch (e) {
      // Mailfehler protokollieren, aber die Freigabe bleibt gültig.
      await protokollieren(baustelleId, { aktion: "mail_fehlgeschlagen", fehler: String(e?.message || e) });
    }
  }

  return ergebnis.antwort;
});

// --------------------------------------------------------------------------
// Ablehnen. Bewusst schlicht: keine Einwilligungen, keine Betragsprüfung.
// --------------------------------------------------------------------------
export const portalAblehnen = onCall({ region: REGION, cors: true, secrets: GEHEIM }, async (req) => {
  const { token, idempotenzSchluessel, grund } = req.data || {};
  const { zugang, baustelleId } = await zugangLaden(token, { verifiziertNoetig: true });

  const bausRef = db().collection("baustellen").doc(baustelleId);
  const freigabeRef = bausRef.collection("freigaben").doc(idempotenzSchluessel || crypto.randomUUID());

  await db().runTransaction(async (tx) => {
    const vorhanden = await tx.get(freigabeRef);
    if (vorhanden.exists) return;

    tx.set(freigabeRef, {
      gegenstand: "angebot",
      baustelleId,
      entscheidung: "abgelehnt",
      grund: grund || null,
      kundeName: zugang.kundeName || "",
      kundeMail: zugang.email,
      verifikationsArt: "email_code",
      ipAdresse: req.rawRequest?.ip || null,
      erstelltAm: FieldValue.serverTimestamp(),
    });
    tx.update(bausRef.collection("angebot").doc("aktuell"), {
      status: "Abgelehnt",
      aktualisiertAm: FieldValue.serverTimestamp(),
    });
    tx.set(bausRef.collection("protokoll").doc(), {
      aktion: "angebot_abgelehnt",
      akteur: "kunde",
      akteurMail: zugang.email,
      zeitpunkt: FieldValue.serverTimestamp(),
    });
  });

  try {
    await freigabeBestaetigen({
      an: zugang.email,
      kundeName: zugang.kundeName,
      entscheidung: "abgelehnt",
      betragCent: 0,
      zeitpunkt: new Date().toLocaleString("de-DE"),
    });
    await betriebBenachrichtigen({
      an: FIRMA.absenderMail,
      titel: "Angebot abgelehnt",
      zeilen: [`Kunde: ${zugang.kundeName || zugang.email}`, `Grund: ${grund || "nicht angegeben"}`],
    });
  } catch (e) {
    await protokollieren(baustelleId, { aktion: "mail_fehlgeschlagen", fehler: String(e?.message || e) });
  }

  return { entscheidung: "abgelehnt" };
});

// --------------------------------------------------------------------------
// Rückfrage stellen (ohne Verifikation — es entstehen keine Kosten).
// --------------------------------------------------------------------------
export const portalRueckfrage = onCall({ region: REGION, cors: true, secrets: GEHEIM }, async (req) => {
  const { token, nachricht } = req.data || {};
  const text = String(nachricht || "").trim();
  if (!text) throw fehler("LEER", "Bitte schreiben Sie Ihre Frage in das Textfeld.");

  const { zugang, baustelleId, baustelle } = await zugangLaden(token);

  await db().collection("baustellen").doc(baustelleId).collection("nachrichten").add({
    von: "kunde",
    vonMail: zugang.email,
    text: text.slice(0, 2000),
    erstelltAm: FieldValue.serverTimestamp(),
  });

  await betriebBenachrichtigen({
    an: FIRMA.absenderMail,
    titel: `Rückfrage zu ${baustelle.name}`,
    zeilen: [`Von: ${zugang.kundeName || zugang.email}`, text],
  }).catch(() => {});

  return { gesendet: true };
});

// --------------------------------------------------------------------------
// Handwerker-Seite: Angebots-Link erzeugen und versenden.
// Diese Funktion verlangt eine normale Anmeldung.
// --------------------------------------------------------------------------
export const angebotsLinkVersenden = onCall({ region: REGION, cors: true, secrets: GEHEIM }, async (req) => {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Bitte melden Sie sich an.");
  }
  const { baustelleId, email, kundeName } = req.data || {};
  const bausRef = db().collection("baustellen").doc(baustelleId);
  const bausSnap = await bausRef.get();

  if (!bausSnap.exists || bausSnap.data().handwerkerId !== req.auth.uid) {
    throw new HttpsError("permission-denied", "Diese Baustelle gehört nicht zu Ihrem Konto.");
  }
  const empfaenger = String(email || "").trim().toLowerCase();
  if (!empfaenger.includes("@")) {
    throw fehler("MAIL_UNGUELTIG", "Bitte geben Sie eine gültige E-Mail-Adresse des Kunden an.");
  }

  const angebotSnap = await bausRef.collection("angebot").doc("aktuell").get();
  if (!angebotSnap.exists) {
    throw fehler("KEIN_ANGEBOT", "Laden Sie zuerst ein Angebots-PDF hoch.");
  }
  const angebot = angebotSnap.data();

  // Frühere Links für dieselbe Baustelle ungültig machen: es soll immer nur
  // ein gültiger Zugang je Kunde existieren (Spezifikation Kapitel 3).
  const alte = await db().collection("magicLinks").where("baustelleId", "==", baustelleId).get();
  const stapel = db().batch();
  alte.docs.forEach((d) => stapel.update(d.ref, { widerrufen: true }));

  const token = tokenErzeugen();
  const gueltigBis = ablaufDatum(ZUGANG.tokenGueltigTage);
  const angebotGueltigBis = ablaufDatum(ANGEBOT.gueltigTage);

  stapel.set(db().collection("magicLinks").doc(tokenHashen(token)), {
    baustelleId,
    email: empfaenger,
    kundeName: kundeName || bausSnap.data().kundeName || "",
    laeuftAbAm: Timestamp.fromDate(gueltigBis),
    angebotGueltigBis: Timestamp.fromDate(angebotGueltigBis),
    widerrufen: false,
    erstelltVon: req.auth.uid,
    erstelltAm: FieldValue.serverTimestamp(),
  });
  await stapel.commit();

  const adresse = portalAdresse(FIRMA.portalBasis, token);
  await angebotsLinkSenden({
    an: empfaenger,
    kundeName: kundeName || bausSnap.data().kundeName,
    adresse,
    betragCent: angebot.betrag != null ? Math.round(angebot.betrag * 100) : null,
    gueltigBis: angebotGueltigBis.toLocaleDateString("de-DE"),
  });

  await protokollieren(baustelleId, {
    aktion: "link_versendet",
    akteur: "handwerker",
    akteurId: req.auth.uid,
    empfaenger,
  });

  return { gesendetAn: empfaenger, gueltigBis: angebotGueltigBis.toISOString(), adresse };
});

export default {
  portalAnsehen,
  portalCodeAnfordern,
  portalCodePruefen,
  portalZulagenRechnen,
  portalFreigeben,
  portalAblehnen,
  portalRueckfrage,
  angebotsLinkVersenden,
};
