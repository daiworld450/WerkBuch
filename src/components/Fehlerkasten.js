// ---------------------------------------------------------------------------
// Fehlerkasten.js — roter Hinweiskasten für Fehlermeldungen.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { farben, schrift, radius } from "../theme";

export default function Fehlerkasten({ text }) {
  if (!text) return null;
  return (
    <View style={styles.kasten}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kasten: {
    backgroundColor: farben.fehlerBg,
    borderWidth: 1,
    borderColor: farben.fehlerLinie,
    borderRadius: radius.feld,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  text: {
    fontFamily: schrift.body,
    fontSize: 14,
    color: farben.fehlerText,
    lineHeight: 20,
  },
});
