// ---------------------------------------------------------------------------
// Statuspunkt.js — grüner Kreis (8x8) mit Ring, plus Statustext daneben.
// Farbe passt sich dem Status an.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { farben, schrift } from "../theme";

// Ordnet jedem Baustellen-Status eine Farbe zu
function statusFarbe(status) {
  if (status === "Abgeschlossen") return farben.gruen;
  if (status === "In Ausführung") return farben.blauHell;
  return farben.textMatt; // In Planung / sonstiges
}

export default function Statuspunkt({ status }) {
  const c = statusFarbe(status);
  return (
    <View style={styles.reihe}>
      <View
        style={[
          styles.punkt,
          { backgroundColor: c, shadowColor: c },
        ]}
      />
      <Text style={styles.text}>{status || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reihe: { flexDirection: "row", alignItems: "center", gap: 8 },
  punkt: {
    width: 8,
    height: 8,
    borderRadius: 4,
    // Ring über elevation/shadow angedeutet
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    borderWidth: 4,
    borderColor: farben.gruenRing,
  },
  text: {
    fontFamily: schrift.headHalb,
    fontSize: 13,
    color: farben.textWeich,
    letterSpacing: 0.5,
    marginLeft: 6,
  },
});
