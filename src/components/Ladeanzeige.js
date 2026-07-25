// ---------------------------------------------------------------------------
// Ladeanzeige.js — zentrierter Spinner mit optionalem Text.
// ---------------------------------------------------------------------------

import React from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { farben, textStil } from "../theme";

export default function Ladeanzeige({ text = "Wird geladen …" }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={farben.rot} />
      {text ? <Text style={[textStil.klein, styles.text]}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: farben.bg,
  },
  text: { marginTop: 14 },
});
