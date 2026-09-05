// ---------------------------------------------------------------------------
// fehler.js — übersetzt Firebase-Fehlercodes in verständliches Deutsch
// ---------------------------------------------------------------------------

const KARTE = {
  "auth/invalid-email": "Die E-Mail-Adresse ist ungültig.",
  "auth/user-disabled": "Dieses Konto wurde deaktiviert.",
  "auth/user-not-found": "Es gibt kein Konto mit dieser E-Mail-Adresse.",
  "auth/wrong-password": "E-Mail oder Passwort ist falsch.",
  "auth/invalid-credential": "E-Mail oder Passwort ist falsch.",
  "auth/email-already-in-use": "Diese E-Mail-Adresse wird bereits verwendet.",
  "auth/weak-password": "Das Passwort ist zu schwach (mindestens 6 Zeichen).",
  "auth/missing-password": "Bitte geben Sie ein Passwort ein.",
  "auth/network-request-failed":
    "Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.",
  "auth/too-many-requests":
    "Zu viele Versuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.",
  "auth/unauthorized-domain":
    "Diese Adresse ist bei der Anmeldung noch nicht freigeschaltet. Bitte den Betreiber informieren.",
  "permission-denied":
    "Keine Berechtigung für diese Aktion.",
  "unavailable":
    "Server nicht erreichbar. Bitte prüfen Sie Ihre Internetverbindung.",
};

export function fehlerText(fehler) {
  if (!fehler) return "Ein unbekannter Fehler ist aufgetreten.";
  const code = fehler.code || fehler.message || "";
  for (const key of Object.keys(KARTE)) {
    if (code.includes(key)) return KARTE[key];
  }
  // Falls kein Code passt, keine englische Rohmeldung zeigen:
  return "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.";
}

export default fehlerText;
