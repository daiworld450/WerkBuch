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
import FreigabeScreen from "./src/screens/FreigabeScreen";
import { schluesselAusAdresse } from "./src/util/nachtrag";
import { farben } from "./src/theme";

// Steht in der aufgerufenen Adresse ein Freigabe-Schlüssel (…/?f=…), dann ist
// hier kein Handwerker unterwegs, sondern ein KUNDE. Er bekommt genau eine
// Seite zu sehen und kommt gar nicht erst an die Anmeldung.
//
// Die Prüfung läuft VOR allem anderen: kein Auth-Zuhörer, keine Navigation,
// keine Baustellenabfrage. So kann über diesen Weg auch nichts durchsickern,
// was den Kunden nichts angeht — und die Seite lädt auf einem Handy mit
// schlechtem Netz spürbar schneller.
const FREIGABE_SCHLUESSEL =
  Platform.OS === "web" && typeof window !== "undefined"
    ? schluesselAusAdresse(window.location?.href)
    : null;

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

  if (FREIGABE_SCHLUESSEL) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: farben.bg }} onLayout={onLayout}>
          <StatusBar style="light" />
          <FreigabeScreen schluessel={FREIGABE_SCHLUESSEL} />
        </View>
      </SafeAreaProvider>
    );
  }

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
