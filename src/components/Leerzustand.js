// ---------------------------------------------------------------------------
// Leerzustand.js — freundliche Anzeige, wenn noch keine Daten vorhanden sind.
// Optional mit Aktions-Button.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { farben, schrift, textStil } from "../theme";
import Knopf from "./Knopf";

export default function Leerzustand({
  symbol = "📋",
  titel,
  text,
  knopfTitel,
  onKnopf,
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.symbol}>{symbol}</Text>
      {titel ? <Text style={styles.titel}>{titel}</Text> : null}
      {text ? <Text style={[textStil.body, styles.text]}>{text}</Text> : null}
      {knopfTitel && onKnopf ? (
        <Knopf titel={knopfTitel} onPress={onKnopf} style={{ marginTop: 8 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 20 },
  symbol: { fontSize: 44, marginBottom: 14 },
  titel: {
    ...schrift.head,
    fontSize: 20,
    color: farben.text,
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: "center",
  },
  text: { textAlign: "center", marginBottom: 18, maxWidth: 320 },
});
