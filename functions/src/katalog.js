// ---------------------------------------------------------------------------
// katalog.js — schreibt die Startbestückung des Zulagen-Katalogs nach
// Firestore. Danach ist der Katalog dort pflegbar, ohne Code anzufassen.
//
// Bereits vorhandene Einträge werden NICHT überschrieben: Preise, die der
// Betrieb angepasst hat, dürfen durch ein erneutes Ausführen nicht auf die
// Startwerte zurückfallen.
// ---------------------------------------------------------------------------

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { ZULAGEN_KATALOG } from "./config.js";

export const katalogEinrichten = onCall({ region: "europe-west3", cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Bitte melden Sie sich an.");

  const db = getFirestore();
  const profil = await db.collection("users").doc(req.auth.uid).get();
  if (!profil.exists || profil.data().rolle !== "handwerker") {
    throw new HttpsError("permission-denied", "Nur der Betrieb darf den Katalog einrichten.");
  }

  const stapel = db.batch();
  let neu = 0;

  for (const zulage of ZULAGEN_KATALOG) {
    const ref = db.collection("zulagenKatalog").doc(zulage.sku);
    const vorhanden = await ref.get();
    if (vorhanden.exists) continue;

    const { sku, ...felder } = zulage;
    stapel.set(ref, { ...felder, erstelltAm: FieldValue.serverTimestamp() });
    neu++;
  }

  await stapel.commit();
  return { angelegt: neu, gesamt: ZULAGEN_KATALOG.length };
});

export default { katalogEinrichten };
