// ---------------------------------------------------------------------------
// cloudinary.js — Datei-Upload (Fotos + PDFs) OHNE eigenen Server und OHNE
// Firebase Storage. Nutzt einen kostenlosen Cloudinary-Account mit einem
// "unsigned upload preset". Es wird KEIN geheimer Schlüssel in der App
// gespeichert – nur Cloud-Name und Preset-Name, die beide unkritisch sind.
//
// >>> HIER IHRE CLOUDINARY-DATEN EINTRAGEN <<<
//
// So bekommen Sie die Werte (kostenlos, keine Kreditkarte):
//   1. Konto anlegen auf https://cloudinary.com  ("Sign up for free").
//   2. Im Dashboard steht oben Ihr "Cloud name" – diesen unten eintragen.
//   3. Zahnrad (Settings) -> Reiter "Upload" -> nach unten zu
//      "Upload presets" -> "Add upload preset".
//      - "Signing Mode" auf  Unsigned  stellen.
//      - Den vergebenen Preset-Namen (z. B. "berisa_unsigned") unten eintragen.
//      - Speichern.
//   4. WICHTIG für PDFs: Settings -> "Security" -> Häkchen bei
//      "Allow delivery of PDF and ZIP files" setzen (sonst wird das
//      Angebots-PDF beim Anzeigen blockiert).
// ---------------------------------------------------------------------------

// ▼▼▼ PLATZHALTER – durch Ihre echten Werte ersetzen ▼▼▼
export const CLOUDINARY = {
  cloudName: "iqigqezt",
  uploadPreset: "WerkBauBuch",
};
// ▲▲▲ PLATZHALTER ENDE ▲▲▲

// Lädt eine lokale Datei (uri) zu Cloudinary hoch.
//   typ: "image" für Fotos, "raw" für PDFs.
// Gibt { url, publicId } zurück. url ist die dauerhafte HTTPS-Adresse.
export async function ladeDateiHoch(uri, { typ = "image", dateiname } = {}) {
  const resource = typ === "raw" ? "raw" : "image";
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${resource}/upload`;

  const form = new FormData();
  form.append("file", {
    uri,
    type: typ === "raw" ? "application/pdf" : "image/jpeg",
    name: dateiname || `upload_${Date.now()}.${typ === "raw" ? "pdf" : "jpg"}`,
  });
  form.append("upload_preset", CLOUDINARY.uploadPreset);

  const res = await fetch(endpoint, { method: "POST", body: form });
  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data && data.error ? data.error.message : "Upload fehlgeschlagen.";
    throw new Error(msg);
  }
  return { url: data.secure_url, publicId: data.public_id };
}

export default { CLOUDINARY, ladeDateiHoch };
