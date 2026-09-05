// ---------------------------------------------------------------------------
// cloudinary.js — Datei-Upload (Fotos + PDFs) OHNE eigenen Server und OHNE
// Firebase Storage. Nutzt einen kostenlosen Cloudinary-Account mit einem
// "unsigned upload preset". Es wird KEIN geheimer Schlüssel in der App
// gespeichert – nur Cloud-Name und Preset-Name, die beide unkritisch sind.
//
// Upload-Technik: Die Datei wird als Base64-Daten-URI im Formularkörper
// gesendet (application/x-www-form-urlencoded). Das ist unter React Native /
// Expo Go deutlich zuverlässiger als FormData-Datei-Anhänge.
//
// Einrichtung (kostenlos, keine Kreditkarte): Konto auf https://cloudinary.com,
// Cloud name aus dem Dashboard, unsigniertes Upload-Preset unter
// Settings -> Upload -> Upload presets, und unter Settings -> Security den
// Haken bei "Allow delivery of PDF and ZIP files".
// ---------------------------------------------------------------------------

export const CLOUDINARY = {
  cloudName: "iqigqezt",
  uploadPreset: "WerkBauBuch",
};

// Liest eine lokale Datei als Base64-Daten-URI (über den eingebauten FileReader).
async function alsDataUri(uri, mime) {
  const res = await fetch(uri);
  const blob = await res.blob();
  const roh = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(blob);
  });
  // Mime-Typ ggf. auf den gewünschten Wert setzen (FileReader liefert oft octet-stream)
  return roh.replace(/^data:[^;]*;/, `data:${mime};`);
}

// Lädt eine lokale Datei (uri) zu Cloudinary hoch.
//   typ: "image" für Fotos, "pdf" für Angebots-PDFs.
//   base64 (optional): bereits vorhandene Base64-Daten (spart erneutes Lesen).
// Gibt { url, publicId, seiten } zurück. url ist die dauerhafte HTTPS-Adresse.
// PDFs werden bewusst als "image" hochgeladen: Cloudinary kann dann jede
// Seite als Bild ausliefern (pg_1, pg_2, …) — das nutzt die Angebots-Anzeige.
export async function ladeDateiHoch(uri, { typ = "image", dateiname, base64 } = {}) {
  const mime = typ === "pdf" ? "application/pdf" : "image/jpeg";
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`;

  const dataUri = base64
    ? `data:${mime};base64,${base64}`
    : await alsDataUri(uri, mime);

  const body =
    "upload_preset=" + encodeURIComponent(CLOUDINARY.uploadPreset) +
    "&file=" + encodeURIComponent(dataUri);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data && data.error ? data.error.message : `HTTP ${res.status}`;
    throw new Error("Upload fehlgeschlagen: " + msg);
  }
  return {
    url: data.secure_url,
    publicId: data.public_id,
    seiten: data.pages || 1, // Seitenzahl bei PDFs
  };
}

// Lädt eine beliebige Datei (xlsx, docx, etc.) zu Cloudinary als "raw" hoch —
// dort interpretiert Cloudinary sie NICHT als Bild (anders als ladeDateiHoch
// oben, das PDFs bewusst über den image-Endpunkt schickt, damit einzelne
// Seiten als Bild ausgeliefert werden können). Für die interne
// Dokumenten-Ablage (DokumenteScreen), wo jeder Dateityp erlaubt ist.
// Gibt { url, publicId } zurück.
export async function ladeRohdateiHoch(uri, { dateiname, mime, base64 } = {}) {
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/raw/upload`;
  const echtesMime = mime || "application/octet-stream";

  const dataUri = base64
    ? `data:${echtesMime};base64,${base64}`
    : await alsDataUri(uri, echtesMime);

  const body =
    "upload_preset=" + encodeURIComponent(CLOUDINARY.uploadPreset) +
    "&file=" + encodeURIComponent(dataUri) +
    (dateiname ? "&filename=" + encodeURIComponent(dateiname) : "");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data && data.error ? data.error.message : `HTTP ${res.status}`;
    throw new Error("Upload fehlgeschlagen: " + msg);
  }
  return {
    url: data.secure_url,
    publicId: data.public_id,
  };
}

// Liefert die Bild-URL einer einzelnen PDF-Seite (1-basiert).
// Beispiel: .../image/upload/v123/abc.pdf -> .../image/upload/pg_2,w_1200,f_jpg/v123/abc.jpg
export function pdfSeitenBild(pdfUrl, seite, breite = 1200) {
  if (!pdfUrl) return null;
  return pdfUrl
    .replace("/upload/", `/upload/pg_${seite},w_${breite},f_jpg/`)
    .replace(/\.pdf($|\?)/, ".jpg$1");
}

export default { CLOUDINARY, ladeDateiHoch, ladeRohdateiHoch, pdfSeitenBild };
