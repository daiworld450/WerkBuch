// ---------------------------------------------------------------------------
// firestore.js — Firestore-Zugriff aus dem Cloudflare Worker, OHNE
// firebase-admin (das läuft nicht in Workers — kein Node-Runtime, kein gRPC).
//
// Ersetzt wird es durch das, was firebase-admin unter der Haube ohnehin tut:
// ein Google-Dienstkonto per signiertem JWT gegen ein kurzlebiges
// OAuth2-Zugriffstoken tauschen, damit gegen die Firestore-REST-API sprechen.
// Dieser Zugriff hat Admin-Rechte und umgeht firestore.rules bewusst — genau
// wie das Admin-SDK es bisher lokal tat. Die Regeln bleiben trotzdem wichtig:
// sie schützen den DIREKTEN Client-Zugriff (App/Browser), nicht den Worker.
//
// Alles hier läuft mit reinen Web-Standard-APIs (fetch, crypto.subtle) — kein
// npm-Paket, genau wie im bauvision/worker-Vorbild.
// ---------------------------------------------------------------------------

const OAUTH_AUD = "https://oauth2.googleapis.com/token";
const OAUTH_SCOPE = "https://www.googleapis.com/auth/datastore";

// Zugriffstoken werden pro Worker-Prozess zwischengespeichert (nicht pro
// Anfrage neu geholt/signiert) — ein Worker-Isolat bedient oft mehrere
// Anfragen nacheinander, solange er lebt. Kein Zustand über Anfragen hinweg
// GARANTIERT, aber wenn er da ist, sinnvoll genutzt.
let zwischengespeichertesToken = null; // { wert, ablaufAm }

// ============================================================ Kodierung ===

function textZuBytes(text) {
  return new TextEncoder().encode(text);
}

function bytesZuBase64Url(bytes) {
  let roh = "";
  for (const b of bytes) roh += String.fromCharCode(b);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlZuBytes(text) {
  const normal = text.replace(/-/g, "+").replace(/_/g, "/");
  const aufgefuellt = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  const roh = atob(aufgefuellt);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

// PEM ("-----BEGIN PRIVATE KEY-----...") zu den rohen DER-Bytes für
// crypto.subtle.importKey.
function pemZuDerBytes(pem) {
  const rumpf = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return base64UrlZuBytes(rumpf.replace(/\+/g, "-").replace(/\//g, "_"));
}

// ==================================================== Dienstkonto-Zugriff ===

async function schluesselImportieren(privateKeyPem) {
  const der = pemZuDerBytes(privateKeyPem);
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Exportiert (nur) für Tests: erlaubt, die JWT-Erzeugung mit einem
// selbst erzeugten Test-Schlüsselpaar offline zu prüfen, ohne echte
// Google-Zugangsdaten oder eine Netzwerkverbindung zu brauchen.
export async function signiertesJwtErzeugen(dienstkonto) {
  const jetzt = Math.floor(Date.now() / 1000);
  const kopf = { alg: "RS256", typ: "JWT" };
  const anspruch = {
    iss: dienstkonto.client_email,
    scope: OAUTH_SCOPE,
    aud: OAUTH_AUD,
    iat: jetzt,
    exp: jetzt + 3600,
  };
  const unsigniert =
    bytesZuBase64Url(textZuBytes(JSON.stringify(kopf))) +
    "." +
    bytesZuBase64Url(textZuBytes(JSON.stringify(anspruch)));

  const schluessel = await schluesselImportieren(dienstkonto.private_key);
  const signatur = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    schluessel,
    textZuBytes(unsigniert)
  );
  return unsigniert + "." + bytesZuBase64Url(new Uint8Array(signatur));
}

async function zugriffstokenHolen(dienstkonto) {
  const jetzt = Date.now();
  if (zwischengespeichertesToken && zwischengespeichertesToken.ablaufAm > jetzt + 60_000) {
    return zwischengespeichertesToken.wert;
  }

  const jwt = await signiertesJwtErzeugen(dienstkonto);
  const antwort = await fetch(OAUTH_AUD, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=" +
      encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" +
      encodeURIComponent(jwt),
  });
  if (!antwort.ok) {
    // Nie den Rohtext der Google-Antwort weiterreichen — der könnte im
    // Fehlerfall Details preisgeben, die nicht in ein Client-facing Log
    // gehören. Nur Statuscode.
    throw new Error(`Dienstkonto-Anmeldung fehlgeschlagen (HTTP ${antwort.status})`);
  }
  const daten = await antwort.json();
  zwischengespeichertesToken = {
    wert: daten.access_token,
    ablaufAm: jetzt + (daten.expires_in || 3600) * 1000,
  };
  return zwischengespeichertesToken.wert;
}

// ============================================================ Typwerte ===
//
// Firestores REST-API verlangt jeden Feldwert typisiert eingepackt, z. B.
// { stringValue: "x" } statt einfach "x". integerValue ist dabei bewusst ein
// STRING (JSON-Zahlen verlieren sonst bei sehr großen int64-Werten
// Genauigkeit) — bei uns immer unproblematisch, da Beträge in Cent und
// Zähler weit innerhalb des sicheren JS-Zahlenbereichs bleiben.

function zuFirestoreWert(wert) {
  if (wert === null || wert === undefined) return { nullValue: null };
  if (typeof wert === "string") return { stringValue: wert };
  if (typeof wert === "boolean") return { booleanValue: wert };
  if (typeof wert === "number") {
    return Number.isInteger(wert)
      ? { integerValue: String(wert) }
      : { doubleValue: wert };
  }
  if (wert instanceof Date) return { timestampValue: wert.toISOString() };
  if (Array.isArray(wert)) {
    return { arrayValue: { values: wert.map(zuFirestoreWert) } };
  }
  if (typeof wert === "object") return { mapValue: { fields: zuFirestoreFelder(wert) } };
  throw new Error(`Firestore-Kodierung: unbekannter Typ für Wert ${JSON.stringify(wert)}`);
}

function vonFirestoreWert(wert) {
  if (!wert || typeof wert !== "object") return null;
  if ("nullValue" in wert) return null;
  if ("stringValue" in wert) return wert.stringValue;
  if ("booleanValue" in wert) return wert.booleanValue;
  if ("integerValue" in wert) return Number(wert.integerValue);
  if ("doubleValue" in wert) return wert.doubleValue;
  if ("timestampValue" in wert) return new Date(wert.timestampValue);
  if ("arrayValue" in wert) return (wert.arrayValue.values || []).map(vonFirestoreWert);
  if ("mapValue" in wert) return vonFirestoreFelder(wert.mapValue.fields || {});
  if ("referenceValue" in wert) return wert.referenceValue;
  return null;
}

// Objekt → { fields: {...} }-Rumpf. undefined-Felder werden übergangen
// (Firestore kennt keinen "undefined"-Typ, ein reines Weglassen entspricht
// dem üblichen Verhalten der Client-SDKs).
export function zuFirestoreFelder(objekt) {
  const felder = {};
  for (const [schluessel, wert] of Object.entries(objekt || {})) {
    if (wert === undefined) continue;
    felder[schluessel] = zuFirestoreWert(wert);
  }
  return felder;
}

export function vonFirestoreFelder(felder) {
  const objekt = {};
  for (const [schluessel, wert] of Object.entries(felder || {})) {
    objekt[schluessel] = vonFirestoreWert(wert);
  }
  return objekt;
}

// Vollständiges REST-Dokument ({name, fields, ...}) → einfaches JS-Objekt,
// ergänzt um "id" (letztes Namenssegment) — praktisch für Listenergebnisse.
export function vonFirestoreDokument(dokument) {
  if (!dokument || !dokument.fields) return null;
  const teile = dokument.name.split("/");
  return { id: teile[teile.length - 1], ...vonFirestoreFelder(dokument.fields) };
}

// ============================================================ Pfade ===

function projektPfad(env) {
  return `projects/${env.FIRESTORE_PROJEKT_ID}/databases/(default)/documents`;
}

// Entspricht firebase-admins collection(...).doc() ohne Argument: eine neue,
// zufällige Dokument-ID für Sammlungen ohne fachlich sprechenden Schlüssel
// (Protokoll-Einträge, Guthaben-Buchungen, Zulagen-Bestellungen). Muss nicht
// exakt Firestores eigenem Push-ID-Algorithmus entsprechen — nur hinreichend
// zufällig und URL-/Pfad-sicher sein.
export function neueDokumentId() {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return bytesZuBase64Url(bytes);
}

function vollerDokumentname(env, pfad) {
  const bereinigt = pfad.replace(/^\/+/, "");
  return `${projektPfad(env)}/${bereinigt}`;
}

// ============================================================ Kern-Fetch ===

async function dienstkontoLaden(env) {
  if (!env.FIRESTORE_DIENSTKONTO_JSON) {
    throw new Error("FIRESTORE_DIENSTKONTO_JSON ist nicht gesetzt (wrangler secret put).");
  }
  return JSON.parse(env.FIRESTORE_DIENSTKONTO_JSON);
}

async function firestoreFetch(env, pfadOderUrl, { methode = "GET", koerper, transaktion } = {}) {
  const dienstkonto = await dienstkontoLaden(env);
  const token = await zugriffstokenHolen(dienstkonto);
  const basis = "https://firestore.googleapis.com/v1/";
  const url = pfadOderUrl.startsWith("http") ? pfadOderUrl : basis + pfadOderUrl;

  const nutzlast = koerper && transaktion ? { ...koerper, transaction: transaktion } : koerper;

  const antwort = await fetch(url, {
    method: methode,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(nutzlast ? { "Content-Type": "application/json" } : {}),
    },
    body: nutzlast ? JSON.stringify(nutzlast) : undefined,
  });

  if (!antwort.ok) {
    const fehlerText = await antwort.text().catch(() => "");
    throw new Error(`Firestore-Anfrage fehlgeschlagen (HTTP ${antwort.status}): ${fehlerText.slice(0, 300)}`);
  }
  if (antwort.status === 204) return null;
  return antwort.json();
}

// ============================================================ Einzeldokumente ===

// Liefert null statt zu werfen, wenn das Dokument nicht existiert (Firestore
// antwortet dann mit HTTP 404) — das ist der Normalfall bei "gibt es das?"
// und soll den Aufrufer nicht zum try/catch zwingen.
export async function dokumentLesen(env, pfad, { transaktion } = {}) {
  const url =
    `${projektPfad(env)}/${pfad.replace(/^\/+/, "")}` +
    (transaktion ? `?transaction=${encodeURIComponent(transaktion)}` : "");
  try {
    const dokument = await firestoreFetch(env, url);
    return vonFirestoreDokument(dokument);
  } catch (e) {
    if (String(e.message).includes("HTTP 404")) return null;
    throw e;
  }
}

// Legt ein Dokument mit fester ID an — schlägt fehl (HTTP 409/400 je nach
// Konstellation), wenn es schon existiert. Firestore REST verlangt dafür
// documentId als Query-Parameter und den KOLLEKTIONS-Pfad als Ziel.
export async function dokumentErstellen(env, pfad, daten) {
  const teile = pfad.replace(/^\/+/, "").split("/");
  const dokumentId = teile.pop();
  const sammlungsPfad = teile.join("/");
  const ziel = `${projektPfad(env)}/${sammlungsPfad}?documentId=${encodeURIComponent(dokumentId)}`;
  const dokument = await firestoreFetch(env, ziel, {
    methode: "POST",
    koerper: { fields: zuFirestoreFelder(daten) },
  });
  return vonFirestoreDokument(dokument);
}

// Ersetzt/legt ein Dokument vollständig an (wie setDoc ohne merge).
export async function dokumentSetzen(env, pfad, daten) {
  const ziel = `${projektPfad(env)}/${pfad.replace(/^\/+/, "")}`;
  const dokument = await firestoreFetch(env, ziel, {
    methode: "PATCH",
    koerper: { fields: zuFirestoreFelder(daten) },
  });
  return vonFirestoreDokument(dokument);
}

// Ändert NUR die angegebenen Felder (wie updateDoc) — über updateMask.
export async function dokumentAktualisieren(env, pfad, teilDaten) {
  const schluessel = Object.keys(teilDaten);
  const maske = schluessel.map((s) => `updateMask.fieldPaths=${encodeURIComponent(s)}`).join("&");
  const ziel = `${projektPfad(env)}/${pfad.replace(/^\/+/, "")}?${maske}`;
  const dokument = await firestoreFetch(env, ziel, {
    methode: "PATCH",
    koerper: { fields: zuFirestoreFelder(teilDaten) },
  });
  return vonFirestoreDokument(dokument);
}

// ============================================================ Abfragen ===

// Einfache where-Abfrage über eine Sub-/Sammlung, entspricht
// query(collection(...), where(feld, vergleich, wert)).
//
// transaktion (optional): macht die Abfrage Teil einer laufenden Transaktion
// (transaktionAusfuehren) — nötig, wenn ihr Ergebnis innerhalb derselben
// Transaktion als Entscheidungsgrundlage dient. Sonst könnte sich der
// Datenstand zwischen dem Lesen außerhalb und dem Schreiben innerhalb der
// Transaktion unbemerkt ändern (siehe portal.js, Kopf-Kommentar).
export async function sammlungAbfragen(
  env,
  pfad,
  { wo = [], limit, transaktion } = {}
) {
  const teile = pfad.replace(/^\/+/, "").split("/");
  const sammlungId = teile.pop();
  const elternPfad = teile.join("/");
  const struktur = {
    structuredQuery: {
      from: [{ collectionId: sammlungId }],
      ...(wo.length
        ? {
            where: {
              compositeFilter: {
                op: "AND",
                filters: wo.map(([feld, op, wert]) => ({
                  fieldFilter: {
                    field: { fieldPath: feld },
                    op: vergleichsOperator(op),
                    value: zuFirestoreWert(wert),
                  },
                })),
              },
            },
          }
        : {}),
      ...(limit ? { limit } : {}),
    },
    ...(transaktion ? { transaction: transaktion } : {}),
  };
  // runQuery wird gegen den ELTERN-Pfad aufgerufen (bei einer Sub-Sammlung
  // das Baustellen-Dokument, sonst die Dokumenten-Wurzel), nicht gegen die
  // Sammlung selbst — die steht in structuredQuery.from.
  const eltern = elternPfad ? `${projektPfad(env)}/${elternPfad}` : projektPfad(env);
  const ziel = `${eltern}:runQuery`;
  // WICHTIG: "transaction" steht hier bereits im Anfragekörper (struktur),
  // nicht als separater firestoreFetch-Parameter — runQuery verlangt das
  // anders als GET-Einzeldokument-Lesevorgänge (dort als Query-Parameter).
  const antwortZeilen = await firestoreFetch(env, ziel, { methode: "POST", koerper: struktur });
  return (antwortZeilen || [])
    .filter((z) => z.document)
    .map((z) => vonFirestoreDokument(z.document));
}

function vergleichsOperator(op) {
  const zuordnung = {
    "==": "EQUAL",
    "!=": "NOT_EQUAL",
    "<": "LESS_THAN",
    "<=": "LESS_THAN_OR_EQUAL",
    ">": "GREATER_THAN",
    ">=": "GREATER_THAN_OR_EQUAL",
    "in": "IN",
    "array-contains": "ARRAY_CONTAINS",
  };
  const gefunden = zuordnung[op];
  if (!gefunden) throw new Error(`Unbekannter Vergleichsoperator: ${op}`);
  return gefunden;
}

// ============================================================ Transaktionen ===
//
// Bildet den Ablauf aus Spezifikation 8.1 nach: Lesen zuerst, dann in EINEM
// commit alle Schreibvorgänge — atomar, oder gar nicht. Anders als bei
// firebase-admins runTransaction() gibt es hier keine automatischen
// Wiederholversuche bei Konflikten; bei WerkBuchs Umfang (ein Betrieb, kein
// gleichzeitiger Massenzugriff auf dieselbe Baustelle) ist das Risiko eines
// echten Schreibkonflikts vernachlässigbar — ein Fehlschlag wirft einfach,
// der Aufrufer (portal.js) meldet dann "bitte erneut versuchen".
export async function transaktionAusfuehren(env, ablauf) {
  const begonnen = await firestoreFetch(env, `${projektPfad(env)}:beginTransaction`, {
    methode: "POST",
    koerper: { options: { readWrite: {} } },
  });
  const transaktion = begonnen.transaction;
  const schreibvorgaenge = [];

  const werkzeug = {
    async lesen(pfad) {
      return dokumentLesen(env, pfad, { transaktion });
    },
    async abfragen(pfad, opts) {
      return sammlungAbfragen(env, pfad, { ...opts, transaktion });
    },
    erstellen(pfad, daten) {
      schreibvorgaenge.push({
        update: { name: vollerDokumentname(env, pfad), fields: zuFirestoreFelder(daten) },
        currentDocument: { exists: false },
      });
    },
    setzen(pfad, daten) {
      schreibvorgaenge.push({
        update: { name: vollerDokumentname(env, pfad), fields: zuFirestoreFelder(daten) },
      });
    },
    aktualisieren(pfad, teilDaten) {
      schreibvorgaenge.push({
        update: { name: vollerDokumentname(env, pfad), fields: zuFirestoreFelder(teilDaten) },
        updateMask: { fieldPaths: Object.keys(teilDaten) },
        currentDocument: { exists: true },
      });
    },
  };

  try {
    const ergebnis = await ablauf(werkzeug);
    if (schreibvorgaenge.length) {
      await firestoreFetch(env, `${projektPfad(env)}:commit`, {
        methode: "POST",
        koerper: { writes: schreibvorgaenge, transaction: transaktion },
      });
    } else {
      await firestoreFetch(env, `${projektPfad(env)}:rollback`, {
        methode: "POST",
        koerper: { transaction: transaktion },
      });
    }
    return ergebnis;
  } catch (fehler) {
    await firestoreFetch(env, `${projektPfad(env)}:rollback`, {
      methode: "POST",
      koerper: { transaction: transaktion },
    }).catch(() => {});
    throw fehler;
  }
}

export default {
  zuFirestoreFelder,
  vonFirestoreFelder,
  vonFirestoreDokument,
  dokumentLesen,
  dokumentErstellen,
  dokumentSetzen,
  dokumentAktualisieren,
  sammlungAbfragen,
  transaktionAusfuehren,
};
