// ---------------------------------------------------------------------------
// Pill.js — kleines Chip/Pill-Element. Optional anklickbar und aktiv (rot).
// ---------------------------------------------------------------------------

import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { farben, schrift, radius } from "../theme";

export default function Pill({ text, onPress, aktiv = false, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.pill,
        aktiv && styles.aktiv,
        pressed && onPress && { opacity: 0.85 },
        style,
      ]}
    >
      <Text style={[styles.text, aktiv && styles.textAktiv]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.pille,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: farben.linie,
    backgroundColor: "rgba(255,255,255,.06)",
    alignSelf: "flex-start",
  },
  aktiv: {
    borderColor: farben.rot,
    backgroundColor: farben.auswahlBg,
  },
  text: {
    fontFamily: schrift.headHalb,
    fontSize: 13,
    color: farben.textWeich,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  textAktiv: { color: farben.text },
});
