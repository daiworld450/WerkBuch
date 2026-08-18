// ---------------------------------------------------------------------------
// portal.js — die Schnittstellen des Kundenportals.
//
// Der Kunde ist hier NICHT angemeldet. Alles, was er mitbringt, ist der Token
// aus seinem Link. Deshalb prüft jede Funktion zuerst diesen Token — und die
// Freigabe zusätzlich den per E-Mail zugestellten Sicherheitscode.
//
// Der Ablauf der Freigabe (portalFreigeben) folgt Spezifikation Kapitel 8.1
// Schritt für Schritt. Zwei Prüfungen darin sind der eigentliche Kern des
// Moduls:
//
//   - Dokument-Abdruck: Hat sich das Angebot geändert, seit der Kunde es
//     geöffnet hat?
//   - Betrag: Stimmt die Summe, die er auf dem Bildschirm sah, noch?
//
// Beides verhindert, dass jemand etwas anderes freigibt, als er gesehen hat.
//
// Portierung von functions/src/portal.js: kein firebase-functions/firebase-
// admin mehr (siehe firestore.js), stattdessen reine async-Funktionen mit der
// Signatur (env, daten, kontext) — router-unabhängig und leicht zu testen.
// kontext trägt, was im Firebase-Original automatisch am Request hing:
// { ip, userAgent, auth }. Der Router (index.js) liest das aus dem
// HTTP-Request und der Firebase-ID-Token-Prüfung (authToken.js).
//
// Zwei bewusste Korrekturen gegenüber der Node-Fassung, beide beim Portieren
// aufgefallen:
//
//  1. Der grundpaketGebucht-Zähler wurde dort AUSSERHALB der Freigabe-
//     Transaktion gelesen (bei zugangLaden) und aktualisiert. Zwei zeitgleiche
//     Freigaben mit UNTERSCHIEDLICHEM Idempotenzschlüssel hätten das
//     Grundkontingent doppelt gutschreiben können. Hier wird das
//     magicLinks-Dokument zusätzlich frisch INNERHALB der Transaktion
//     gelesen, und die Aktualisierung ist Teil desselben atomaren Commits.
//  2. portalAblehnen sendete bei einer Wiederholung mit demselben
//     Idempotenzschlüssel zwar keinen doppelten Firestore-Schreibvorgang,
//     aber trotzdem ein zweites Mal die Bestätigungs-/Benachrichtigungsmail.
//     Jetzt wie bei portalFreigeben: Mail nur bei einer echten Erstausführung.
//
// Zusätzlich portiert: katalogEinrichten (ursprünglich functions/src/
// katalog.js). Die Berechtigungsprüfung dort ("Firestore-Feld rolle ==
// handwerker") war genau die Schwachstelle, die den kritischen Sicherheits-
// fund ausgelöst hat (siehe firestore.rules, istBesitzer()) — hier deshalb
// von Anfang an über die verifizierte E-Mail aus dem ID-Token geprüft, nicht
// über ein Firestore-Feld.
// ---------------------------------------------------------------------------

import {
  ZUGANG,
  ANGEBOT,
  EINWILLIGUNGEN,
  KNOPF_BESCHRIFTUNG,
  AGB_STAND,
  FIRMA,
  GRUNDPAKET,
  ZULAGEN_KATALOG,
} from "./config.js";
import {
  tokenErzeugen,
  tokenHashen,
  codeErzeugen,
  codeHashen,
  sha256Hex,
  ablaufDatum,
  portalAdresse,
  zugangPruefen,
  codePruefen,
} from "./magicLink.js";
import { summeRechnen, pruefungNoetig } from "./zulagen.js";
import { angebotsLinkSenden, codeSenden, freigabeBestaetigen, betriebBenachrichtigen } from "./mail.js";
import {
  dokumentLesen,
  dokumentErstellen,
  dokumentAktualisieren,
  sammlungAbfragen,
  transaktionAusfuehren,
  neueDokumentId,
} from "./firestore.js";

// Einheitliches Fehlerformat mit deutschem Klartext (Spezifikation Kapitel 15)
// und einem HTTP-Status, den der Router 1:1 weiterreicht. Der Kunde bekommt
// nie eine technische Meldung zu sehen — nur "nachricht".
export class PortalFehler extends Error {
  constructor(code, nachricht, details = {}, httpStatus = 400) {
    super(nachricht);
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus;
  }
}

function fehler(code, nachricht, details, httpStatus) {
  return new PortalFehler(code, nachricht, details, httpStatus);
}

// Der Abdruck über den fachlichen Inhalt des Angebots. Ändert der Handwerker
// PDF, Betrag oder Status, ändert sich der Abdruck — und eine Freigabe, die
// noch den alten Stand meint, wird abgelehnt statt stillschweigend übernommen.
export async function angebotAbdruck(angebot) {
  const kern = JSON.stringify({
    pdfUrl: angebot?.pdfUrl || null,
    seiten: angebot?.seiten || 0,
    betrag: angebot?.betrag ?? null,
    status: angebot?.status || null,
  });
  return sha256Hex(kern);
}

// Lädt den Zugang zum Token und die zugehörige Baustelle. Wirft, wenn der
// Token unbekannt, abgelaufen oder widerrufen ist.
async function zugangLaden(env, token, { verifiziertNoetig = false } = {}) {
  if (!token || typeof token !== "string") {
    throw fehler("TOKEN_FEHLT", "Der Link ist unvollständig. Bitte öffnen Sie ihn erneut aus Ihrer E-Mail.");
  }

  const hash = await tokenHashen(token);
  const daten = await dokumentLesen(env, `magicLinks/${hash}`);
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
    throw fehler(
      "NICHT_VERIFIZIERT",
      "Bitte bestätigen Sie zuerst den Code, den wir Ihnen per E-Mail geschickt haben.",
      {},
      401
    );
  }

  const baustelle = await dokumentLesen(env, `baustellen/${daten.baustelleId}`);
  if (!baustelle) {
    throw fehler("BAUSTELLE_FEHLT", "Zu diesem Link finden wir kein Projekt mehr.");
  }

  return { hash, zugang: daten, baustelleId: daten.baustelleId, baustelle };
}

// tx (optional): die Transaktions-Werkzeuge aus transaktionAusfuehren. Ohne
// tx läuft die Abfrage außerhalb jeder Transaktion (Lese-Endpunkte wie
// portalAnsehen/portalZulagenRechnen — dort unkritisch, es wird nichts
// geschrieben). MIT tx wird die Abfrage Teil der Transaktion, damit ihr
// Ergebnis innerhalb derselben Transaktion als Entscheidungsgrundlage für
// Schreibvorgänge dienen darf (portalFreigeben) — sonst könnte sich der
// Katalogpreis bzw. die bereits freigegebene Summe zwischen dem Lesen und
// dem Commit unbemerkt ändern (dieselbe Fehlerklasse wie beim
// grundpaketGebucht-Fund, siehe Dateikopf).
async function katalogLaden(env, tx) {
  const dokumente = await (tx
    ? tx.abfragen("zulagenKatalog", { wo: [["aktiv", "==", true]] })
    : sammlungAbfragen(env, "zulagenKatalog", { wo: [["aktiv", "==", true]] }));
  return dokumente.map((d) => ({ ...d, sku: d.id })).sort((a, b) => a.reihenfolge - b.reihenfolge);
}

// Summiert alle bereits bestätigten Zulagen — Grundlage für die Grenzen aus
// Spezifikation 6.4 und für die Anzeige "offen für die Schlussrechnung".
async function bereitsFreigegeben(env, baustelleId, tx) {
  const wo = { wo: [["status", "in", ["bestaetigt", "wird_erstellt", "fertig"]]] };
  const dokumente = await (tx
    ? tx.abfragen(`baustellen/${baustelleId}/zulagenBestellungen`, wo)
    : sammlungAbfragen(env, `baustellen/${baustelleId}/zulagenBestellungen`, wo));
  let anzahl = 0;
  let bruttoCent = 0;
  for (const b of dokumente) {
    anzahl += (b.positionen || []).reduce((s, p) => s + p.menge, 0);
    bruttoCent += b.bruttoCent || 0;
  }
  return { anzahl, bruttoCent };
}

async function protokollieren(env, baustelleId, eintrag) {
  await dokumentErstellen(env, `baustellen/${baustelleId}/protokoll/${neueDokumentId()}`, {
    ...eintrag,
    zeitpunkt: new Date(),
  });
}

// ----------------------------------------------------------------------
// Angebot ansehen. Funktioniert ohne Code — Lesen ist erlaubt, nur Freigeben
// nicht (Spezifikation Kapitel 3).
// ----------------------------------------------------------------------
export async function portalAnsehen(env, daten) {
  const { token } = daten || {};
  const { hash, zugang, baustelleId, baustelle } = await zugangLaden(env, token);

  const angebot = await dokumentLesen(env, `baustellen/${baustelleId}/angebot/aktuell`);
  const [katalog, freigegeben] = await Promise.all([katalogLaden(env), bereitsFreigegeben(env, baustelleId)]);

  const gueltigBis = zugang.angebotGueltigBis || null;
  const abgelaufen = gueltigBis ? new Date() > gueltigBis : false;

  await protokollieren(env, baustelleId, {
    aktion: "angebot_angesehen",
    akteur: "kunde",
    akteurMail: zugang.email,
  });

  // Beim ersten Öffnen den Handwerker benachrichtigen (Spezifikation 11).
  if (!zugang.ersteAnsichtAm) {
    await dokumentAktualisieren(env, `magicLinks/${hash}`, { ersteAnsichtAm: new Date() });
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
          abdruck: await angebotAbdruck(angebot),
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
}

// ----------------------------------------------------------------------
// Sicherheitscode anfordern und prüfen.
// ----------------------------------------------------------------------
export async function portalCodeAnfordern(env, daten) {
  const { token } = daten || {};
  const { hash, zugang } = await zugangLaden(env, token);

  const code = codeErzeugen();
  await dokumentAktualisieren(env, `magicLinks/${hash}`, {
    codeHash: await codeHashen(code),
    codeGueltigBis: new Date(Date.now() + ZUGANG.codeGueltigMinuten * 60 * 1000),
    codeVersuche: 0,
  });

  await codeSenden(env, { an: zugang.email, code });

  // Die Adresse nur angedeutet zurückgeben — sie steht zwar in der Mail des
  // Kunden, muss aber nicht jedem gezeigt werden, der den Link besitzt.
  const [vorne, hinten] = String(zugang.email).split("@");
  return {
    gesendetAn: `${vorne.slice(0, 2)}${"•".repeat(Math.max(1, vorne.length - 2))}@${hinten}`,
    gueltigMinuten: ZUGANG.codeGueltigMinuten,
  };
}

export async function portalCodePruefen(env, daten) {
  const { token, code } = daten || {};
  const { hash, zugang, baustelleId } = await zugangLaden(env, token);

  const ergebnis = await codePruefen(zugang, code);

  if (!ergebnis.ok) {
    if (ergebnis.grund === "falsch") {
      await dokumentAktualisieren(env, `magicLinks/${hash}`, {
        codeVersuche: (zugang.codeVersuche || 0) + 1,
      });
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

  // codeHash/codeGueltigBis werden über updateMask-ohne-Wert gelöscht — siehe
  // firestore.js: ein Feld im Mask ohne Eintrag in fields heißt "entfernen".
  await dokumentAktualisieren(env, `magicLinks/${hash}`, {
    verifiziertAm: new Date(),
    codeHash: undefined,
    codeGueltigBis: undefined,
    codeVersuche: 0,
  });

  await protokollieren(env, baustelleId, {
    aktion: "verifiziert",
    akteur: "kunde",
    akteurMail: zugang.email,
  });

  return { verifiziert: true };
}

// ----------------------------------------------------------------------
// Zwischenstand der Zulagen-Auswahl speichern und Summe berechnen.
// Legt noch KEINE Bestellung an (Spezifikation Kapitel 17, erstes Szenario) —
// erst die Freigabe tut das.
// ----------------------------------------------------------------------
export async function portalZulagenRechnen(env, daten) {
  const { token, auswahl } = daten || {};
  const { hash, baustelleId } = await zugangLaden(env, token);

  const [katalog, freigegeben] = await Promise.all([katalogLaden(env), bereitsFreigegeben(env, baustelleId)]);
  const summe = summeRechnen(auswahl, katalog);
  const pruefung = pruefungNoetig(summe, freigegeben);

  // Auswahl merken, damit sie beim Neuladen der Seite erhalten bleibt.
  await dokumentAktualisieren(env, `magicLinks/${hash}`, { auswahl: auswahl || [], auswahlAm: new Date() });

  return { summe, pruefung };
}

// ----------------------------------------------------------------------
// Die Freigabe. Der rechtlich und fachlich wichtigste Vorgang des Moduls.
// Ablauf nach Spezifikation 8.1.
// ----------------------------------------------------------------------
export async function portalFreigeben(env, daten, kontext = {}) {
  const { token, idempotenzSchluessel, erwarteterAbdruck, erwarteterBetragCent, auswahl, einwilligungen } =
    daten || {};

  if (!idempotenzSchluessel || typeof idempotenzSchluessel !== "string" || idempotenzSchluessel.includes("/")) {
    throw fehler("SCHLUESSEL_FEHLT", "Technischer Fehler bei der Übertragung. Bitte laden Sie die Seite neu.");
  }

  // Reihenfolge nach Spezifikation 8.1: erst Zugang/Anmeldung (Schritt 2a,
  // sonst 401), danach erst die restlichen Pflichtangaben prüfen.
  const { hash, zugang, baustelleId } = await zugangLaden(env, token, { verifiziertNoetig: true });

  // erwarteterAbdruck/-Betrag sind PFLICHT, nicht optional geprüft:
  // portalAnsehen liefert immer einen Abdruck (sobald ein Angebot existiert)
  // und immer eine berechenbare Summe (auch 0 bei einem Angebot ohne
  // Betrag) — der Client hat also nie einen legitimen Grund, sie
  // wegzulassen. Ohne diese Pflicht hätte ein Aufruf, der die Felder
  // einfach ausließe, Schritt 2b/2c aus Spezifikation 8.1 komplett umgangen
  // — genau die zwei Prüfungen, die verhindern sollen, dass jemand etwas
  // anderes freigibt, als er sah.
  if (typeof erwarteterAbdruck !== "string" || !erwarteterAbdruck) {
    throw fehler("ABDRUCK_FEHLT", "Technischer Fehler bei der Übertragung. Bitte laden Sie die Seite neu.");
  }
  if (erwarteterBetragCent == null || Number.isNaN(Number(erwarteterBetragCent))) {
    throw fehler("BETRAG_FEHLT", "Technischer Fehler bei der Übertragung. Bitte laden Sie die Seite neu.");
  }

  const freigabePfad = `baustellen/${baustelleId}/freigaben/${idempotenzSchluessel}`;
  const angebotPfad = `baustellen/${baustelleId}/angebot/aktuell`;
  const magicLinkPfad = `magicLinks/${hash}`;

  // Alles Lesen, Prüfen und Schreiben in EINER Transaktion, damit zwei
  // gleichzeitige Freigaben sich nicht überholen können. Katalog und bereits
  // freigegebene Summe werden bewusst ERST HIER (über tx.abfragen), nicht
  // vor der Transaktion geladen — sonst könnte sich ein Zulagenpreis oder
  // die Prüfschwelle aus Spezifikation 6.4 zwischen dem Lesen und dem
  // Commit unbemerkt ändern (dieselbe Fehlerklasse wie beim
  // grundpaketGebucht-Fund, siehe Dateikopf).
  const ergebnis = await transaktionAusfuehren(env, async (tx) => {
    // Schritt 2d: Wurde mit diesem Schlüssel schon freigegeben? Dann die alte
    // Antwort zurückgeben und nichts erneut anlegen. Das ist der Schutz gegen
    // Doppelklick und gegen Wiederholung nach Netzabbruch.
    const vorhandeneFreigabe = await tx.lesen(freigabePfad);
    if (vorhandeneFreigabe) {
      return { wiederholung: true, antwort: vorhandeneFreigabe.antwort };
    }

    const angebot = await tx.lesen(angebotPfad);
    if (!angebot) {
      throw fehler("KEIN_ANGEBOT", "Zu diesem Projekt liegt derzeit kein Angebot vor.");
    }

    const [katalog, freigegeben] = await Promise.all([
      katalogLaden(env, tx),
      bereitsFreigegeben(env, baustelleId, tx),
    ]);

    // Frischer Blick auf den Grundpaket-Status INNERHALB der Transaktion
    // (nicht der vor der Transaktion geladene "zugang") — schließt eine Lücke
    // der Node-Fassung, in der zwei gleichzeitige Freigaben mit
    // unterschiedlichem Idempotenzschlüssel das Kontingent doppelt hätten
    // gutschreiben können.
    const magicLinkJetzt = await tx.lesen(magicLinkPfad);

    // Schritt 2b: Ist das Angebot noch dasselbe wie beim Öffnen der Seite?
    const abdruckJetzt = await angebotAbdruck(angebot);
    if (erwarteterAbdruck !== abdruckJetzt) {
      throw fehler(
        "CONFLICT_DOCUMENT_CHANGED",
        "Das Angebot wurde soeben geändert. Bitte sehen Sie sich die aktualisierte Fassung an.",
        { abdruckJetzt },
        409
      );
    }

    const summe = summeRechnen(auswahl, katalog);
    const angebotCent = angebot.betrag != null ? Math.round(angebot.betrag * 100) : 0;
    const gesamtCent = angebotCent + summe.bruttoCent;

    // Schritt 2c: Stimmt der Betrag, den der Kunde gesehen hat?
    if (Number(erwarteterBetragCent) !== gesamtCent) {
      throw fehler(
        "CONFLICT_AMOUNT_CHANGED",
        "Der Betrag hat sich geändert. Bitte prüfen Sie die aktualisierte Übersicht.",
        { erwartet: Number(erwarteterBetragCent), tatsaechlich: gesamtCent },
        409
      );
    }

    // Schritt 2e: Alle Pflicht-Einwilligungen gesetzt?
    for (const [schluessel, regel] of Object.entries(EINWILLIGUNGEN)) {
      if (regel.pflicht && !einwilligungen?.[schluessel]) {
        throw fehler(
          "EINWILLIGUNG_FEHLT",
          "Bitte bestätigen Sie alle Pflichtangaben, bevor Sie beauftragen.",
          { feld: schluessel },
          422
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
    tx.erstellen(freigabePfad, {
      gegenstand: "angebot",
      baustelleId,
      dokumentAbdruck: abdruckJetzt,
      betragBruttoCent: gesamtCent,
      entscheidung: "angenommen",
      kundeName: zugang.kundeName || "",
      kundeMail: zugang.email,
      verifikationsArt: "email_code",
      ipAdresse: kontext.ip || null,
      browserKennung: kontext.userAgent || null,
      einwilligungsTexte,
      antwort,
      erstelltAm: jetzt,
    });

    // Angebotsstatus mitziehen, damit Handwerker-Ansicht und Portal dasselbe
    // zeigen.
    tx.aktualisieren(angebotPfad, { status: "Angenommen", aktualisiertAm: jetzt });

    // Zulagen als eigene Bestellung anlegen (getrennte Spur B, Spezifikation
    // Kapitel 2) — ohne Zahlung, sie laufen über die Schlussrechnung.
    if (summe.positionen.length > 0) {
      const bestellId = neueDokumentId();
      tx.erstellen(`baustellen/${baustelleId}/zulagenBestellungen/${bestellId}`, {
        positionen: summe.positionen,
        nettoCent: summe.nettoCent,
        ustJeSatz: summe.ustJeSatz,
        bruttoCent: summe.bruttoCent,
        guthaben: summe.guthaben,
        status: pruefung.noetig ? "wartet_auf_pruefung" : "bestaetigt",
        pruefGrund: pruefung.grund || null,
        freigabeId: idempotenzSchluessel,
        abrechnung: "schlussrechnung",
        erstelltAm: jetzt,
      });

      // Guthaben nur gutschreiben, wenn keine Prüfung aussteht.
      if (!pruefung.noetig && summe.guthaben > 0) {
        tx.erstellen(`baustellen/${baustelleId}/guthaben/${neueDokumentId()}`, {
          veraenderung: summe.guthaben,
          grund: "zulage",
          bezugTyp: "zulagenBestellung",
          bezugId: bestellId,
          erstelltAm: jetzt,
        });
      }
    }

    // Grundkontingent bei der ersten Annahme gutschreiben (Spezifikation 6.1)
    // — geprüft am frischen, innerhalb dieser Transaktion gelesenen Stand.
    if (!magicLinkJetzt?.grundpaketGebucht) {
      tx.erstellen(`baustellen/${baustelleId}/guthaben/${neueDokumentId()}`, {
        veraenderung: GRUNDPAKET.visualisierungen,
        grund: "paket",
        bezugTyp: "freigabe",
        bezugId: idempotenzSchluessel,
        erstelltAm: jetzt,
      });
      tx.aktualisieren(magicLinkPfad, { grundpaketGebucht: true });
    }

    tx.erstellen(`baustellen/${baustelleId}/protokoll/${neueDokumentId()}`, {
      aktion: "angebot_freigegeben",
      akteur: "kunde",
      akteurMail: zugang.email,
      betragCent: gesamtCent,
      zeitpunkt: jetzt,
    });

    return { wiederholung: false, antwort };
  });

  // Nach dem Festschreiben: Mails versenden. Bewusst außerhalb der Transaktion
  // — ein Mailproblem darf eine gültige Beauftragung nicht rückgängig machen.
  if (!ergebnis.wiederholung) {
    const a = ergebnis.antwort;
    try {
      await freigabeBestaetigen(env, {
        an: zugang.email,
        kundeName: zugang.kundeName,
        entscheidung: "angenommen",
        betragCent: a.gesamtCent,
        zeitpunkt: new Date(a.zeitpunkt).toLocaleString("de-DE"),
        positionen: a.positionen,
      });
      await betriebBenachrichtigen(env, {
        an: FIRMA.absenderMail,
        titel: "Angebot angenommen",
        zeilen: [
          `Kunde: ${zugang.kundeName || zugang.email}`,
          `Betrag gesamt: ${(a.gesamtCent / 100).toFixed(2)} €`,
          a.positionen.length
            ? `Zulagen: ${a.positionen.map((p) => `${p.menge}× ${p.name}`).join(", ")}`
            : "Keine Zulagen",
          a.wartetAufPruefung ? `⚠ Wartet auf Ihre Prüfung (${a.pruefGrund})` : "Automatisch bestätigt",
        ],
      });
    } catch (e) {
      // Mailfehler protokollieren, aber die Freigabe bleibt gültig.
      await protokollieren(env, baustelleId, { aktion: "mail_fehlgeschlagen", fehler: String(e?.message || e) });
    }
  }

  return ergebnis.antwort;
}

// ----------------------------------------------------------------------
// Ablehnen. Bewusst schlicht: keine Einwilligungen, keine Betragsprüfung.
// ----------------------------------------------------------------------
export async function portalAblehnen(env, daten, kontext = {}) {
  const { token, idempotenzSchluessel, grund } = daten || {};
  const { zugang, baustelleId } = await zugangLaden(env, token, { verifiziertNoetig: true });

  const schluessel =
    idempotenzSchluessel && typeof idempotenzSchluessel === "string" && !idempotenzSchluessel.includes("/")
      ? idempotenzSchluessel
      : crypto.randomUUID();
  const freigabePfad = `baustellen/${baustelleId}/freigaben/${schluessel}`;
  const angebotPfad = `baustellen/${baustelleId}/angebot/aktuell`;

  const ergebnis = await transaktionAusfuehren(env, async (tx) => {
    const vorhanden = await tx.lesen(freigabePfad);
    if (vorhanden) return { wiederholung: true };

    const jetzt = new Date();
    tx.erstellen(freigabePfad, {
      gegenstand: "angebot",
      baustelleId,
      entscheidung: "abgelehnt",
      grund: grund || null,
      kundeName: zugang.kundeName || "",
      kundeMail: zugang.email,
      verifikationsArt: "email_code",
      ipAdresse: kontext.ip || null,
      erstelltAm: jetzt,
    });
    tx.aktualisieren(angebotPfad, { status: "Abgelehnt", aktualisiertAm: jetzt });
    tx.erstellen(`baustellen/${baustelleId}/protokoll/${neueDokumentId()}`, {
      aktion: "angebot_abgelehnt",
      akteur: "kunde",
      akteurMail: zugang.email,
      zeitpunkt: jetzt,
    });

    return { wiederholung: false };
  });

  // Mails nur bei einer echten Erstausführung — sonst bekäme ein Kunde nach
  // einem Netzabbruch und Wiederholungsversuch zweimal dieselbe Mail
  // (Korrektur gegenüber der Node-Fassung, siehe Dateikopf).
  if (!ergebnis.wiederholung) {
    try {
      await freigabeBestaetigen(env, {
        an: zugang.email,
        kundeName: zugang.kundeName,
        entscheidung: "abgelehnt",
        betragCent: 0,
        zeitpunkt: new Date().toLocaleString("de-DE"),
      });
      await betriebBenachrichtigen(env, {
        an: FIRMA.absenderMail,
        titel: "Angebot abgelehnt",
        zeilen: [`Kunde: ${zugang.kundeName || zugang.email}`, `Grund: ${grund || "nicht angegeben"}`],
      });
    } catch (e) {
      await protokollieren(env, baustelleId, { aktion: "mail_fehlgeschlagen", fehler: String(e?.message || e) });
    }
  }

  return { entscheidung: "abgelehnt" };
}

// ----------------------------------------------------------------------
// Rückfrage stellen (ohne Verifikation — es entstehen keine Kosten).
// ----------------------------------------------------------------------
export async function portalRueckfrage(env, daten) {
  const { token, nachricht } = daten || {};
  const text = String(nachricht || "").trim();
  if (!text) throw fehler("LEER", "Bitte schreiben Sie Ihre Frage in das Textfeld.");

  const { zugang, baustelleId, baustelle } = await zugangLaden(env, token);

  await dokumentErstellen(env, `baustellen/${baustelleId}/nachrichten/${neueDokumentId()}`, {
    von: "kunde",
    vonMail: zugang.email,
    text: text.slice(0, 2000),
    erstelltAm: new Date(),
  });

  await betriebBenachrichtigen(env, {
    an: FIRMA.absenderMail,
    titel: `Rückfrage zu ${baustelle.name}`,
    zeilen: [`Von: ${zugang.kundeName || zugang.email}`, text],
  }).catch(() => {});

  return { gesendet: true };
}

// ----------------------------------------------------------------------
// Handwerker-Seite: Angebots-Link erzeugen und versenden.
// Diese Funktion verlangt eine echte Anmeldung — kontext.auth kommt vom
// Router, der das mitgeschickte Firebase-ID-Token vorher geprüft hat
// (authToken.js).
// ----------------------------------------------------------------------
export async function angebotsLinkVersenden(env, daten, kontext = {}) {
  if (!kontext.auth) {
    throw fehler("NICHT_ANGEMELDET", "Bitte melden Sie sich an.", {}, 401);
  }
  const { baustelleId, email, kundeName } = daten || {};
  // baustelleId kommt direkt aus dem Anfragekörper und wandert unten
  // ungeprüft in mehrere Firestore-Pfade (`baustellen/${baustelleId}/...`).
  // Ohne diese Prüfung könnte ein Wert mit "/" die Pfadsegmente verschieben
  // — die anschließende handwerkerId-Prüfung fängt einen echten Zugriff auf
  // fremde Daten zwar ab, aber der Server sollte sich darauf nicht als
  // einzige Verteidigungslinie verlassen.
  if (typeof baustelleId !== "string" || !baustelleId || baustelleId.includes("/")) {
    throw fehler("BAUSTELLE_UNGUELTIG", "Diese Baustelle wurde nicht gefunden.");
  }
  const baustelle = await dokumentLesen(env, `baustellen/${baustelleId}`);

  if (!baustelle || baustelle.handwerkerId !== kontext.auth.uid) {
    throw fehler("KEIN_ZUGRIFF", "Diese Baustelle gehört nicht zu Ihrem Konto.", {}, 403);
  }
  const empfaenger = String(email || "").trim().toLowerCase();
  if (!empfaenger.includes("@")) {
    throw fehler("MAIL_UNGUELTIG", "Bitte geben Sie eine gültige E-Mail-Adresse des Kunden an.");
  }

  const angebot = await dokumentLesen(env, `baustellen/${baustelleId}/angebot/aktuell`);
  if (!angebot) {
    throw fehler("KEIN_ANGEBOT", "Laden Sie zuerst ein Angebots-PDF hoch.");
  }

  // Frühere Links für dieselbe Baustelle ungültig machen: es soll immer nur
  // ein gültiger Zugang je Kunde existieren (Spezifikation Kapitel 3).
  const alte = await sammlungAbfragen(env, "magicLinks", { wo: [["baustelleId", "==", baustelleId]] });
  await Promise.all(
    alte.map((d) => dokumentAktualisieren(env, `magicLinks/${d.id}`, { widerrufen: true }))
  );

  const token = tokenErzeugen();
  const hash = await tokenHashen(token);
  const gueltigBis = ablaufDatum(ZUGANG.tokenGueltigTage);
  const angebotGueltigBis = ablaufDatum(ANGEBOT.gueltigTage);

  await dokumentErstellen(env, `magicLinks/${hash}`, {
    baustelleId,
    email: empfaenger,
    kundeName: kundeName || baustelle.kundeName || "",
    laeuftAbAm: gueltigBis,
    angebotGueltigBis,
    widerrufen: false,
    erstelltVon: kontext.auth.uid,
    erstelltAm: new Date(),
  });

  const adresse = portalAdresse(FIRMA.portalBasis, token);
  await angebotsLinkSenden(env, {
    an: empfaenger,
    kundeName: kundeName || baustelle.kundeName,
    adresse,
    betragCent: angebot.betrag != null ? Math.round(angebot.betrag * 100) : null,
    gueltigBis: angebotGueltigBis.toLocaleDateString("de-DE"),
  });

  await protokollieren(env, baustelleId, {
    aktion: "link_versendet",
    akteur: "handwerker",
    akteurId: kontext.auth.uid,
    empfaenger,
  });

  return { gesendetAn: empfaenger, gueltigBis: angebotGueltigBis.toISOString(), adresse };
}

// ----------------------------------------------------------------------
// Katalog-Startbestückung. Legt die Zulagen aus config.js in Firestore an,
// überschreibt aber NIE einen vorhandenen Eintrag — Preise, die der Betrieb
// selbst angepasst hat, dürfen durch ein erneutes Ausführen nicht auf die
// Startwerte zurückfallen.
//
// Nur der Betriebsinhaber darf das auslösen. Absichtlich über die verifizierte
// E-Mail aus dem ID-Token geprüft (dieselbe Adresse wie FIRMA.absenderMail,
// die auch firestore.rules' istBesitzer() für den direkten Client-Zugriff
// verwendet) — NICHT über ein Firestore-Feld wie "rolle", das sich ein
// Nutzer selbst hätte zuweisen können (siehe Sicherheitskorrektur).
// ----------------------------------------------------------------------
export async function katalogEinrichten(env, daten, kontext = {}) {
  if (!kontext.auth) {
    throw fehler("NICHT_ANGEMELDET", "Bitte melden Sie sich an.", {}, 401);
  }
  if (kontext.auth.email !== FIRMA.absenderMail || !kontext.auth.emailVerifiziert) {
    throw fehler("KEIN_ZUGRIFF", "Nur der Betrieb darf den Katalog einrichten.", {}, 403);
  }

  let neu = 0;
  for (const zulage of ZULAGEN_KATALOG) {
    const vorhanden = await dokumentLesen(env, `zulagenKatalog/${zulage.sku}`);
    if (vorhanden) continue;

    const { sku, ...felder } = zulage;
    await dokumentErstellen(env, `zulagenKatalog/${sku}`, { ...felder, erstelltAm: new Date() });
    neu++;
  }

  return { angelegt: neu, gesamt: ZULAGEN_KATALOG.length };
}

export default {
  PortalFehler,
  angebotAbdruck,
  portalAnsehen,
  portalCodeAnfordern,
  portalCodePruefen,
  portalZulagenRechnen,
  portalFreigeben,
  portalAblehnen,
  portalRueckfrage,
  angebotsLinkVersenden,
  katalogEinrichten,
};
