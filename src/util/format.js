// ---------------------------------------------------------------------------
// format.js — deutsche Formatierung für Zahlen, Flächen, Währung, Datum
// ---------------------------------------------------------------------------

// Zahl mit 2 Nachkommastellen, deutsches Komma. z.B. 12.5 -> "12,50"
export function zahlDe(wert, nachkomma = 2) {
  const n = typeof wert === "number" && isFinite(wert) ? wert : 0;
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  });
}

// Fläche mit Einheit, z.B. "12,50 m²"
export function flaecheDe(wert, einheit = "m²") {
  return zahlDe(wert) + " " + einheit;
}

// Währung in Euro, z.B. 1234.5 -> "1.234,50 €"
export function euroDe(wert) {
  const n = typeof wert === "number" && isFinite(wert) ? wert : 0;
  return n.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

// Menge (bis 2 Nachkommastellen, aber ganze Zahlen ohne Nachkomma)
export function mengeDe(wert) {
  const n = typeof wert === "number" && isFinite(wert) ? wert : 0;
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

// Wandelt einen Firestore-Timestamp / Date / Millis sicher in ein JS-Date.
export function zuDate(wert) {
  if (!wert) return null;
  if (wert instanceof Date) return wert;
  if (typeof wert.toDate === "function") return wert.toDate(); // Firestore Timestamp
  if (typeof wert === "number") return new Date(wert);
  const d = new Date(wert);
  return isNaN(d.getTime()) ? null : d;
}

// Datum als TT.MM.JJJJ
export function datumDe(wert) {
  const d = zuDate(wert);
  if (!d) return "—";
  const tag = String(d.getDate()).padStart(2, "0");
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const jahr = d.getFullYear();
  return `${tag}.${monat}.${jahr}`;
}

// Datum als JJJJ-MM-TT in der Ortszeit des Geräts (für HTML-Datumsfelder).
// toISOString rechnet nach UTC um und liefert vor 2 Uhr morgens den Vortag.
export function datumIso(wert) {
  const d = zuDate(wert);
  if (!d) return "";
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

// Datum + Uhrzeit, z.B. "24.07.2026, 14:30"
export function datumZeitDe(wert) {
  const d = zuDate(wert);
  if (!d) return "—";
  const zeit = d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datumDe(d)}, ${zeit}`;
}

export default { zahlDe, flaecheDe, euroDe, mengeDe, datumDe, datumIso, datumZeitDe, zuDate };
