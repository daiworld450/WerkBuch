// ---------------------------------------------------------------------------
// mail.js — E-Mail-Versand (Angebots-Link, Sicherheitscode, Bestätigungen).
//
// Portierung von functions/src/mail.js: Cloudflare Workers haben keinen
// rohen TCP-Zugriff, Nodemailer/SMTP funktioniert dort nicht. Versand läuft
// stattdessen über Brevos HTTP-API (dauerhaft kostenlos, 300 Mails/Tag, keine
// Kreditkarte — Nutzerentscheidung). Der Absender (FIRMA.absenderMail, siehe
// config.js) muss vorher in Brevo als Absender verifiziert werden.
//
// Betreffzeilen enthalten immer Nummer und Betrag im Klartext, damit die Mails
// im Postfach auffindbar bleiben (Spezifikation Kapitel 11).
//
// Zusätzlich gegenüber der Node-Fassung: alle Werte, die aus Kunden- oder
// Handwerkereingaben stammen (Name, Nachricht, Positionsbezeichnung), werden
// vor dem Einbetten ins HTML escaped. Die alte Fassung tat das nicht — bei
// einem Namen oder einer Rückfrage mit spitzen Klammern wäre rohes HTML in
// die Mail gewandert. E-Mail-Clients führen darin zwar kein Skript aus, aber
// kaputtes Layout oder eingeschmuggelte Links sind trotzdem vermeidbar.
// ---------------------------------------------------------------------------

import { FIRMA } from "./config.js";

const BREVO_ENDPUNKT = "https://api.brevo.com/v3/smtp/email";

function htmlEscape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (z) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[z]);
}

function euro(cent) {
  return (cent / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// Gemeinsamer Rahmen für alle Mails. Bewusst schlicht und mit Textfassung:
// reine Bild-HTML-Mails landen häufiger im Spam und sind unlesbar, wenn der
// Empfänger Bilder blockiert.
function rahmen(titel, inhaltHtml) {
  return `<!doctype html>
<html lang="de"><body style="margin:0;background:#0b0b0f;padding:24px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#12121c;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:28px;color:#fff">
    <div style="color:#D00000;font-weight:700;letter-spacing:2px;font-size:13px">${htmlEscape(FIRMA.name.toUpperCase())}</div>
    <h1 style="font-size:22px;margin:12px 0 18px">${htmlEscape(titel)}</h1>
    ${inhaltHtml}
    <p style="color:rgba(255,255,255,.5);font-size:12px;margin-top:28px;border-top:1px solid rgba(255,255,255,.14);padding-top:16px">
      ${htmlEscape(FIRMA.name)} · ${htmlEscape(FIRMA.ort)}
    </p>
  </div>
</body></html>`;
}

async function senden(env, { an, betreff, html, text }) {
  if (!env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY ist nicht gesetzt (wrangler secret put).");
  }
  const antwort = await fetch(BREVO_ENDPUNKT, {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: FIRMA.name, email: FIRMA.absenderMail },
      to: [{ email: an }],
      subject: betreff,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!antwort.ok) {
    const fehlerText = await antwort.text().catch(() => "");
    throw new Error(`Mailversand fehlgeschlagen (HTTP ${antwort.status}): ${fehlerText.slice(0, 300)}`);
  }
}

export async function angebotsLinkSenden(env, { an, kundeName, adresse, betragCent, gueltigBis }) {
  const betragText = betragCent != null ? ` über ${euro(betragCent)}` : "";
  const betreff = `Ihr Angebot von ${FIRMA.name}${betragText}`;
  const nameSicher = htmlEscape(kundeName || "");
  const html = rahmen(
    "Ihr Angebot liegt bereit",
    `<p style="color:rgba(255,255,255,.82);line-height:1.6">
       Guten Tag ${nameSicher},<br><br>
       Ihr Angebot ist fertig. Sie können es über den folgenden Link ansehen —
       ohne Anmeldung, direkt auf dem Handy:
     </p>
     <p style="margin:24px 0">
       <a href="${htmlEscape(adresse)}" style="display:inline-block;background:#D00000;color:#fff;text-decoration:none;padding:14px 28px;border-radius:500px;font-weight:700">
         Angebot ansehen
       </a>
     </p>
     <p style="color:rgba(255,255,255,.6);font-size:13px;line-height:1.6">
       Der Link ist persönlich für Sie und gültig bis ${htmlEscape(gueltigBis)}.
       Bitte leiten Sie ihn nicht weiter.
     </p>`
  );
  const text = `Guten Tag ${kundeName || ""},

Ihr Angebot von ${FIRMA.name} liegt bereit:
${adresse}

Der Link ist persönlich für Sie und gültig bis ${gueltigBis}.

${FIRMA.name} · ${FIRMA.ort}`;

  await senden(env, { an, betreff, html, text });
}

export async function codeSenden(env, { an, code }) {
  const betreff = `Ihr Bestätigungscode: ${code}`;
  const html = rahmen(
    "Ihr Bestätigungscode",
    `<p style="color:rgba(255,255,255,.82);line-height:1.6">
       Bitte geben Sie diesen Code im Angebots-Portal ein:
     </p>
     <div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;padding:20px;background:rgba(255,255,255,.05);border-radius:12px;margin:20px 0">
       ${htmlEscape(code)}
     </div>
     <p style="color:rgba(255,255,255,.6);font-size:13px">
       Der Code ist 15 Minuten gültig. Wenn Sie ihn nicht angefordert haben,
       können Sie diese E-Mail ignorieren.
     </p>`
  );
  await senden(env, {
    an,
    betreff,
    html,
    text: `Ihr Bestätigungscode: ${code}\n\nDer Code ist 15 Minuten gültig.`,
  });
}

export async function freigabeBestaetigen(
  env,
  { an, kundeName, entscheidung, betragCent, zeitpunkt, positionen }
) {
  const angenommen = entscheidung === "angenommen";
  const betreff = angenommen
    ? `Auftragsbestätigung über ${euro(betragCent)} — ${FIRMA.name}`
    : `Ihre Rückmeldung zum Angebot — ${FIRMA.name}`;
  const nameSicher = htmlEscape(kundeName || "");
  const zeitpunktSicher = htmlEscape(zeitpunkt);

  const liste = (positionen || [])
    .map(
      (p) =>
        `<tr><td style="padding:6px 0;color:rgba(255,255,255,.82)">${htmlEscape(p.menge)}× ${htmlEscape(p.name)}</td>
         <td style="padding:6px 0;text-align:right;color:#fff">${euro(p.bruttoCent)}</td></tr>`
    )
    .join("");

  const html = rahmen(
    angenommen ? "Vielen Dank für Ihren Auftrag" : "Ihre Rückmeldung ist angekommen",
    angenommen
      ? `<p style="color:rgba(255,255,255,.82);line-height:1.6">
           Guten Tag ${nameSicher},<br><br>
           wir bestätigen Ihre Beauftragung vom ${zeitpunktSicher}.
         </p>
         ${liste ? `<table style="width:100%;margin:18px 0;border-collapse:collapse">${liste}</table>` : ""}
         <p style="font-size:20px;font-weight:700;margin:18px 0;border-top:1px solid rgba(255,255,255,.14);padding-top:14px">
           Gesamt inkl. MwSt.: ${euro(betragCent)}
         </p>
         <p style="color:rgba(255,255,255,.6);font-size:13px;line-height:1.6">
           Zusätzlich gewählte Leistungen erscheinen als eigene Position auf der
           Schlussrechnung. Wir melden uns zur weiteren Abstimmung bei Ihnen.
         </p>`
      : `<p style="color:rgba(255,255,255,.82);line-height:1.6">
           Guten Tag ${nameSicher},<br><br>
           Sie haben das Angebot am ${zeitpunktSicher} abgelehnt. Wir melden uns bei
           Ihnen, falls Sie Fragen haben oder ein neues Angebot wünschen.
         </p>`
  );

  await senden(env, {
    an,
    betreff,
    html,
    text: angenommen
      ? `Auftragsbestätigung vom ${zeitpunkt}\nGesamt inkl. MwSt.: ${euro(betragCent)}`
      : `Ihre Ablehnung vom ${zeitpunkt} ist bei uns eingegangen.`,
  });
}

// Bewertungsanfrage nach der Abnahme (S13). Wird ausgelöst, wenn der
// Handwerker eine Baustelle als "Abgeschlossen" markiert und im Anschluss
// die Bewertungsanfrage antriggert (siehe portal.js bewertungAnfordern).
// Kurzer, freundlicher Text nach demselben Rahmen wie die übrigen Mails —
// bewusst ohne Druck oder mehrfache Wiederholung des Wunsches.
export async function bewertungAnfragen(env, { an, kundeName, bewertungsLink }) {
  const betreff = `Wie war's? Ihre Meinung zählt für uns — ${FIRMA.name}`;
  const nameSicher = htmlEscape(kundeName || "");
  const linkSicher = htmlEscape(bewertungsLink);
  const html = rahmen(
    "Vielen Dank für Ihr Vertrauen",
    `<p style="color:rgba(255,255,255,.82);line-height:1.6">
       Guten Tag ${nameSicher},<br><br>
       Ihre Baustelle ist abgeschlossen — wir hoffen, Sie sind mit dem
       Ergebnis zufrieden. Wenn Sie zwei Minuten Zeit haben, würden wir uns
       sehr über eine kurze Google-Bewertung freuen. Das hilft uns und
       anderen Kunden bei der Entscheidung.
     </p>
     <p style="margin:24px 0">
       <a href="${linkSicher}" style="display:inline-block;background:#D00000;color:#fff;text-decoration:none;padding:14px 28px;border-radius:500px;font-weight:700">
         Jetzt bewerten
       </a>
     </p>
     <p style="color:rgba(255,255,255,.6);font-size:13px;line-height:1.6">
       Vielen Dank für Ihre Zeit — und für den Auftrag.
     </p>`
  );
  const text = `Guten Tag ${kundeName || ""},

Ihre Baustelle ist abgeschlossen. Wir würden uns über eine kurze Google-Bewertung freuen:
${bewertungsLink}

Vielen Dank für Ihre Zeit — und für den Auftrag.

${FIRMA.name} · ${FIRMA.ort}`;

  await senden(env, { an, betreff, html, text });
}

// Meldung an den Betrieb (nicht an den Kunden). "zeilen" kann Kundeneingaben
// enthalten (z.B. eine Rückfrage) — deshalb ebenfalls escaped.
export async function betriebBenachrichtigen(env, { an, titel, zeilen }) {
  const html = rahmen(
    titel,
    `<ul style="color:rgba(255,255,255,.82);line-height:1.8;padding-left:18px">
       ${zeilen.map((z) => `<li>${htmlEscape(z)}</li>`).join("")}
     </ul>`
  );
  await senden(env, { an, betreff: `WerkBuch: ${titel}`, html, text: zeilen.join("\n") });
}

export default {
  angebotsLinkSenden,
  codeSenden,
  freigabeBestaetigen,
  bewertungAnfragen,
  betriebBenachrichtigen,
};
