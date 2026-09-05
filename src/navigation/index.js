// ---------------------------------------------------------------------------
// navigation/index.js — Stack-Navigation. Trennt Auth-Fluss (Login/Register)
// vom angemeldeten Bereich. Dunkles Theme durchgehend.
// ---------------------------------------------------------------------------

import React from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import { farben, schrift } from "../theme";
import Ladeanzeige from "../components/Ladeanzeige";

import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import BaustellenListScreen from "../screens/BaustellenListScreen";
import NeueBaustelleScreen from "../screens/NeueBaustelleScreen";
import BaustelleDetailScreen from "../screens/BaustelleDetailScreen";
import FotosScreen from "../screens/FotosScreen";
import VisualisierungScreen from "../screens/VisualisierungScreen";
import FotoViewerScreen from "../screens/FotoViewerScreen";
import MasseScreen from "../screens/MasseScreen";
import MaterialScreen from "../screens/MaterialScreen";
import TermineScreen from "../screens/TermineScreen";
import AngebotScreen from "../screens/AngebotScreen";
import EinsatzplanScreen from "../screens/EinsatzplanScreen";
import DokumenteScreen from "../screens/DokumenteScreen";

const Stack = createNativeStackNavigator();

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: farben.bg,
    card: "rgba(11,11,15,.82)",
    text: farben.text,
    border: farben.linie,
    primary: farben.rot,
    notification: farben.rot,
  },
};

const kopfOptionen = {
  headerStyle: { backgroundColor: farben.bg },
  // Zurück-Pfeil (und -Titel auf iOS) in Rot — Titel bleibt über
  // headerTitleStyle separat weiß.
  headerTintColor: farben.rot,
  headerTitleStyle: {
    ...schrift.head,
    fontSize: 20,
    letterSpacing: 0.5,
    color: farben.text,
  },
  headerBackTitleStyle: { ...schrift.bodyMed },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: farben.bg },
};

// Adressen im Browser. GitHub Pages liefert diese App unter
// https://daiworld450.github.io/WerkBuch/ aus — React Navigation kennt diesen
// Unterordner nicht von selbst und würde sonst z.B. "/anmelden" statt
// "/WerkBuch/anmelden" in die Adressleiste schreiben. Ein Neuladen oder ein
// Zurück/Vor im Browser würde dann auf eine echte GitHub-404-Seite treffen,
// weil es unter der Domain ohne "/WerkBuch" keine Seite gibt. Deshalb bekommt
// jeder Pfad das Präfix fest mitgegeben (muss zum "--base=" in
// tools/patch-index.js passen).
const BASISPFAD = "WerkBuch";
const linking = {
  prefixes: [],
  config: {
    screens: {
      Login: `${BASISPFAD}/anmelden`,
      Register: `${BASISPFAD}/registrieren`,
      Baustellen: `${BASISPFAD}/baustellen`,
    },
  },
};

export default function Navigation() {
  const { user, laedt } = useAuth();

  if (laedt) return <Ladeanzeige text="Anmeldung wird geprüft …" />;

  const angemeldet = !!user;

  return (
    <NavigationContainer theme={AppTheme} linking={linking}>
      <Stack.Navigator screenOptions={kopfOptionen}>
        {!angemeldet ? (
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ title: "Registrieren" }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Baustellen"
              component={BaustellenListScreen}
              options={{ title: "Meine Baustellen" }}
            />
            <Stack.Screen
              name="NeueBaustelle"
              component={NeueBaustelleScreen}
              options={{ title: "Neue Baustelle" }}
            />
            <Stack.Screen
              name="BaustelleDetail"
              component={BaustelleDetailScreen}
              options={{ title: "Baustelle" }}
            />
            <Stack.Screen
              name="Fotos"
              component={FotosScreen}
              options={{ title: "Fotos" }}
            />
            <Stack.Screen
              name="FotoViewer"
              component={FotoViewerScreen}
              options={{ headerShown: false, presentation: "fullScreenModal" }}
            />
            <Stack.Screen
              name="Visualisierung"
              component={VisualisierungScreen}
              options={{ title: "Entwurf" }}
            />
            <Stack.Screen
              name="Masse"
              component={MasseScreen}
              options={{ title: "Maße & Flächen" }}
            />
            <Stack.Screen
              name="Material"
              component={MaterialScreen}
              options={{ title: "Material" }}
            />
            <Stack.Screen
              name="Termine"
              component={TermineScreen}
              options={{ title: "Termine" }}
            />
            <Stack.Screen
              name="Dokumente"
              component={DokumenteScreen}
              options={{ title: "Dokumente" }}
            />
            <Stack.Screen
              name="Angebot"
              component={AngebotScreen}
              options={{ title: "Angebot" }}
            />
            <Stack.Screen
              name="Einsatzplan"
              component={EinsatzplanScreen}
              options={{ title: "Einsatzplan" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
