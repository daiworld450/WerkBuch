// ---------------------------------------------------------------------------
// dialog.js — plattformübergreifender Ersatz für Alert.alert.
// Auf iPhone/Android: der normale native Dialog.
// Im Web: window.alert / window.confirm (dort gibt es Alert.alert nicht).
// Gleiche Aufruf-Signatur wie React Natives Alert — als Drop-in nutzbar.
// ---------------------------------------------------------------------------

import { Alert as RNAlert, Platform } from "react-native";

const Alert = {
  alert(titel, text, knoepfe) {
    if (Platform.OS !== "web") {
      RNAlert.alert(titel, text, knoepfe);
      return;
    }

    const nachricht = text ? `${titel}\n\n${text}` : titel;

    // Nur Hinweis (kein oder ein Knopf)
    if (!knoepfe || knoepfe.length <= 1) {
      window.alert(nachricht);
      if (knoepfe && knoepfe[0] && knoepfe[0].onPress) knoepfe[0].onPress();
      return;
    }

    const aktionen = knoepfe.filter((k) => k.style !== "cancel");
    const abbruch = knoepfe.find((k) => k.style === "cancel");

    // Standardfall: eine Aktion + Abbrechen -> confirm
    if (aktionen.length === 1) {
      if (window.confirm(nachricht)) {
        if (aktionen[0].onPress) aktionen[0].onPress();
      } else if (abbruch && abbruch.onPress) {
        abbruch.onPress();
      }
      return;
    }

    // Mehrere Aktionen: nacheinander abfragen (einfach, aber verlässlich)
    for (const k of aktionen) {
      if (window.confirm(`${nachricht}\n\n„${k.text}“?`)) {
        if (k.onPress) k.onPress();
        return;
      }
    }
    if (abbruch && abbruch.onPress) abbruch.onPress();
  },
};

export default Alert;
