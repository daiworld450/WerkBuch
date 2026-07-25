// ---------------------------------------------------------------------------
// Knopf.js — Button in drei Varianten: primaer (rot), sekundaer (blau), ghost
// Vollrund (borderRadius 500), Rajdhani, GROSSBUCHSTABEN.
// ---------------------------------------------------------------------------

import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { farben, schrift, radius } from "../theme";

export default function Knopf({
  titel,
  onPress,
  variante = "primaer", // "primaer" | "sekundaer" | "ghost"
  laedt = false,
  deaktiviert = false,
  style,
}) {
  const aus = deaktiviert || laedt;

  const hintergrund =
    variante === "primaer"
      ? farben.rot
      : variante === "sekundaer"
      ? farben.blau
      : "transparent";

  return (
    <Pressable
      onPress={onPress}
      disabled={aus}
      style={({ pressed }) => [
        styles.basis,
        { backgroundColor: hintergrund, opacity: aus ? 0.55 : pressed ? 0.85 : 1 },
        variante === "ghost" && styles.ghost,
        style,
      ]}
    >
      <View style={styles.inhalt}>
        {laedt && <ActivityIndicator color={farben.text} style={{ marginRight: 10 }} />}
        <Text style={styles.text}>{titel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  basis: {
    borderRadius: radius.pille,
    paddingVertical: 16,
    paddingHorizontal: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,.35)",
  },
  inhalt: { flexDirection: "row", alignItems: "center" },
  text: {
    fontFamily: schrift.head,
    fontSize: 18,
    color: farben.text,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
