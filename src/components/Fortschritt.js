// ---------------------------------------------------------------------------
// Fortschritt.js — Fortschrittsbalken (Höhe 7, vollrund) mit Verlauf Rot->RotHell.
// ---------------------------------------------------------------------------

import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { farben, radius } from "../theme";

export default function Fortschritt({ prozent = 0, style }) {
  const wert = Math.max(0, Math.min(100, Number(prozent) || 0));
  return (
    <View style={[styles.spur, style]}>
      <LinearGradient
        colors={[farben.rot, farben.rotHell]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fuellung, { width: `${wert}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  spur: {
    height: 7,
    borderRadius: radius.pille,
    backgroundColor: "rgba(255,255,255,.1)",
    overflow: "hidden",
  },
  fuellung: {
    height: "100%",
    borderRadius: radius.pille,
  },
});
