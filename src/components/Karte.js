// ---------------------------------------------------------------------------
// Karte.js — Glas-Karte. Optional anklickbar (onPress) und als Auswahlkachel.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { farben, radius } from "../theme";

export default function Karte({
  children,
  onPress,
  ausgewaehlt = false,
  style,
}) {
  const inhalt = (
    <View
      style={[
        styles.karte,
        ausgewaehlt && styles.ausgewaehlt,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        {inhalt}
      </Pressable>
    );
  }
  return inhalt;
}

const styles = StyleSheet.create({
  karte: {
    backgroundColor: farben.glas,
    borderWidth: 1,
    borderColor: farben.linie,
    borderRadius: radius.karte,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 30 },
    shadowOpacity: 0.5,
    shadowRadius: 80,
    elevation: 4,
  },
  ausgewaehlt: {
    borderColor: farben.rot,
    backgroundColor: farben.auswahlBg,
  },
});
