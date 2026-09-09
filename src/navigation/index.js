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
import TerminScreen from "../screens/TerminScreen";
import KalenderScreen from "../screens/KalenderScreen";
import DokumenteScreen from "../screens/DokumenteScreen";
import StundenScreen from "../screens/StundenScreen";
import KostenScreen from "../screens/KostenScreen";
import KalkulationScreen from "../screens/KalkulationScreen";
import PersonenScreen from "../screens/PersonenScreen";
import AuswertungScreen from "../screens/AuswertungScreen";
import NachtraegeScreen from "../screens/NachtraegeScreen";
import NachtragScreen from "../screens/NachtragScreen";
import BerichtScreen from "../screens/BerichtScreen";

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
              name="Kalender"
              component={KalenderScreen}
              options={{ title: "Kalender" }}
            />
            <Stack.Screen
              name="Termin"
              component={TerminScreen}
              options={({ route }) => ({
                title: route.params?.terminId ? "Termin bearbeiten" : "Neuer Termin",
              })}
            />
            {/* Nachkalkulation. Die Rollen-Trennung passiert NICHT hier —
                jeder Bildschirm prüft sie selbst und die Firestore-Regeln
                setzen sie serverseitig durch. Ein Mitarbeiter, der eine
                Adresse errät, sieht in Kosten/Kalkulation/Personen/Auswertung
                deshalb nur den Hinweis „Nur für den Betriebsinhaber". */}
            <Stack.Screen
              name="Stunden"
              component={StundenScreen}
              options={{ title: "Stunden" }}
            />
            <Stack.Screen
              name="Kosten"
              component={KostenScreen}
              options={{ title: "Sonstige Kosten" }}
            />
            <Stack.Screen
              name="Kalkulation"
              component={KalkulationScreen}
              options={{ title: "Kalkulation" }}
            />
            <Stack.Screen
              name="Personen"
              component={PersonenScreen}
              options={{ title: "Personen" }}
            />
            <Stack.Screen
              name="Auswertung"
              component={AuswertungScreen}
              options={{ title: "Auswertung" }}
            />
            {/* Nachträge: zusätzliche Leistungen mit Freigabe durch den
                Kunden. Die Kundenseite selbst liegt NICHT in dieser
                Navigation — sie wird in App.js noch vor der Anmeldung
                ausgeliefert, damit ein Kunde gar nicht erst hierher kommt. */}
            <Stack.Screen
              name="Nachtraege"
              component={NachtraegeScreen}
              options={{ title: "Nachträge" }}
            />
            <Stack.Screen
              name="Nachtrag"
              component={NachtragScreen}
              options={{ title: "Nachtrag" }}
            />
            <Stack.Screen
              name="Bericht"
              component={BerichtScreen}
              options={{ title: "Projektbericht" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
