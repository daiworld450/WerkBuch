// ---------------------------------------------------------------------------
// App.js — Einstiegspunkt. Lädt Schriften, stellt Auth-Context und Navigation.
// ---------------------------------------------------------------------------

import "react-native-gesture-handler";
import React, { useCallback } from "react";
import { View, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Rajdhani_600SemiBold,
  Rajdhani_700Bold,
} from "@expo-google-fonts/rajdhani";
import { Rubik_400Regular, Rubik_500Medium } from "@expo-google-fonts/rubik";

import { AuthProvider } from "./src/context/AuthContext";
import Navigation from "./src/navigation";
import { farben } from "./src/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [schriftenBereit] = useFonts({
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
    Rubik_400Regular,
    Rubik_500Medium,
  });

  const onLayout = useCallback(async () => {
    if (schriftenBereit) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [schriftenBereit]);

  // Im Web nicht auf die Schriften warten — sie werden dort nachgeladen,
  // sonst bliebe die Seite bei einem Lade-Hänger dauerhaft leer.
  if (!schriftenBereit && Platform.OS !== "web") return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: farben.bg }} onLayout={onLayout}>
        <StatusBar style="light" />
        <AuthProvider>
          <Navigation />
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}
