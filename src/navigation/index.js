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
import FotoViewerScreen from "../screens/FotoViewerScreen";
import MasseScreen from "../screens/MasseScreen";
import MaterialScreen from "../screens/MaterialScreen";
import TermineScreen from "../screens/TermineScreen";
import AngebotScreen from "../screens/AngebotScreen";

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

export default function Navigation() {
  const { user, profil, laedt } = useAuth();

  if (laedt) return <Ladeanzeige text="Anmeldung wird geprüft …" />;

  const angemeldet = !!user;

  return (
    <NavigationContainer theme={AppTheme}>
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
              name="Angebot"
              component={AngebotScreen}
              options={{ title: "Angebot" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
