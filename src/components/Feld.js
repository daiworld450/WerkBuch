// ---------------------------------------------------------------------------
// Feld.js — Eingabefeld mit Label, Fokus-Rand und optionaler Fehleranzeige.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { farben, schrift, radius, groessen } from "../theme";

export default function Feld({
  label,
  wert,
  onChangeText,
  platzhalter,
  ...rest
}) {
  const [fokus, setFokus] = useState(false);
  return (
    <View style={styles.gruppe}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        value={wert != null ? String(wert) : ""}
        onChangeText={onChangeText}
        placeholder={platzhalter}
        placeholderTextColor={farben.platzhalter}
        onFocus={() => setFokus(true)}
        onBlur={() => setFokus(false)}
        style={[styles.feld, fokus && styles.feldFokus]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gruppe: { marginBottom: 16 },
  label: {
    ...schrift.headHalb,
    fontSize: groessen.klein,
    color: farben.textWeich,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  feld: {
    backgroundColor: farben.feldBg,
    borderWidth: 1.5,
    borderColor: farben.linie,
    borderRadius: radius.feld,
    paddingVertical: 15,
    paddingHorizontal: 16,
    color: farben.text,
    ...schrift.body,
    fontSize: groessen.text,
  },
  feldFokus: { borderColor: farben.feldFokus },
});
