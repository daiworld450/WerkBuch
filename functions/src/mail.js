// ---------------------------------------------------------------------------
// mail.js — E-Mail-Versand (Angebots-Link, Sicherheitscode, Bestätigungen).
//
// Versand über ein Gmail-App-Passwort, hinterlegt als Firebase-Secret
// (MAIL_PASSWORT). Ein App-Passwort ist NICHT das normale Google-Kennwort,
// sondern ein eigens erzeugtes Kennwort nur für dieses Programm — es lässt
// sich einzeln widerrufen, ohne das Konto anzufassen.
//
// Betreffzeilen enthalten immer Nummer und Betrag im Klartext, damit die Mails
// im Postfach auffindbar bleiben (Spezifikation Kapitel 11).
// ---------------------------------------------------------------------------

import nodemailer from "nodemailer";
import { FIRMA } from "./config.js";

let transport = null;

function holeTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: FIRMA.absenderMail,
      pass: process.env.MAIL_PASSWORT,
    },
  });
  return transport;
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
    <div style="color:#D00000;font-weight:700;letter-spacing:2px;font-size:13px">${FIRMA.name.toUpperCase()}</div>
    <h1 style="font-size:22px;margin:12px 0 18px">${titel}</h1>
    ${inhaltHtml}
    <p style="color:rgba(255,255,255,.5);font-size:12px;margin-top:28px;border-top:1px solid rgba(255,255,255,.14);padding-top:16px">
      ${FIRMA.name} · ${FIRMA.ort}
    </p>
  </div>
</body></html>`;
}

async function senden({ an, betreff, html, text }) {
  await holeTransport().sendMail({
    from: `"${FIRMA.name}" <${FIRMA.absenderMail}>`,
    to: an,
    subject: betreff,
    text,
    html,
  });
}

export async function angebotsLinkSenden({ an, kundeName, adresse, betragCent, gueltigBis }) {
  const betragText = betragCent != null ? ` über ${euro(betragCent)}` : "";
  const betreff = `Ihr Angebot von ${FIRMA.name}${betragText}`;
  const html = rahmen(
    "Ihr Angebot liegt bereit",
    `<p style="color:rgba(255,255,255,.82);line-height:1.6">
       Guten Tag ${kundeName || ""},<br><br>
       Ihr Angebot ist fertig. Sie können es über den folgenden Link ansehen —
       ohne Anmeldung, direkt auf dem Handy:
     </p>
     <p style="margin:24px 0">
       <a href="${adresse}" style="display:inline-block;background:#D00000;color:#fff;text-decoration:none;padding:14px 28px;border-radius:500px;font-weight:700">
         Angebot ansehen
       </a>
     </p>
     <p style="color:rgba(255,255,255,.6);font-size:13px;line-height:1.6">
       Der Link ist persönlich für Sie und gültig bis ${gueltigBis}.
       Bitte leiten Sie ihn nicht weiter.
     </p>`
  );
  const text = `Guten Tag ${kundeName || ""},

Ihr Angebot von ${FIRMA.name} liegt bereit:
${adresse}

Der Link ist persönlich für Sie und gültig bis ${gueltigBis}.

${FIRMA.name} · ${FIRMA.ort}`;

  await senden({ an, betreff, html, text });
}

export async function codeSenden({ an, code }) {
  const betreff = `Ihr Bestätigungscode: ${code}`;
  const html = rahmen(
    "Ihr Bestätigungscode",
    `<p style="color:rgba(255,255,255,.82);line-height:1.6">
       Bitte geben Sie diesen Code im Angebots-Portal ein:
     </p>
     <div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;padding:20px;background:rgba(255,255,255,.05);border-radius:12px;margin:20px 0">
       ${code}
     </div>
     <p style="color:rgba(255,255,255,.6);font-size:13px">
       Der Code ist 15 Minuten gültig. Wenn Sie ihn nicht angefordert haben,
       können Sie diese E-Mail ignorieren.
     </p>`
  );
  await senden({
    an,
    betreff,
    html,
    text: `Ihr Bestätigungscode: ${code}\n\nDer Code ist 15 Minuten gültig.`,
  });
}

export async function freigabeBestaetigen({ an, kundeName, entscheidung, betragCent, zeitpunkt, positionen }) {
  const angenommen = entscheidung === "angenommen";
  const betreff = angenommen
    ? `Auftragsbestätigung über ${euro(betragCent)} — ${FIRMA.name}`
    : `Ihre Rückmeldung zum Angebot — ${FIRMA.name}`;

  const liste = (positionen || [])
    .map(
      (p) =>
        `<tr><td style="padding:6px 0;color:rgba(255,255,255,.82)">${p.menge}× ${p.name}</td>
         <td style="padding:6px 0;text-align:right;color:#fff">${euro(p.bruttoCent)}</td></tr>`
    )
    .join("");

  const html = rahmen(
    angenommen ? "Vielen Dank für Ihren Auftrag" : "Ihre Rückmeldung ist angekommen",
    angenommen
      ? `<p style="color:rgba(255,255,255,.82);line-height:1.6">
           Guten Tag ${kundeName || ""},<br><br>
           wir bestätigen Ihre Beauftragung vom ${zeitpunkt}.
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
           Guten Tag ${kundeName || ""},<br><br>
           Sie haben das Angebot am ${zeitpunkt} abgelehnt. Wir melden uns bei
           Ihnen, falls Sie Fragen haben oder ein neues Angebot wünschen.
         </p>`
  );

  await senden({
    an,
    betreff,
    html,
    text: angenommen
      ? `Auftragsbestätigung vom ${zeitpunkt}\nGesamt inkl. MwSt.: ${euro(betragCent)}`
      : `Ihre Ablehnung vom ${zeitpunkt} ist bei uns eingegangen.`,
  });
}

// Meldung an den Betrieb (nicht an den Kunden).
export async function betriebBenachrichtigen({ an, titel, zeilen }) {
  const html = rahmen(
    titel,
    `<ul style="color:rgba(255,255,255,.82);line-height:1.8;padding-left:18px">
       ${zeilen.map((z) => `<li>${z}</li>`).join("")}
     </ul>`
  );
  await senden({ an, betreff: `WerkBuch: ${titel}`, html, text: zeilen.join("\n") });
}

export default { angebotsLinkSenden, codeSenden, freigabeBestaetigen, betriebBenachrichtigen };
