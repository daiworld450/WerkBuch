# WerkBuch – von Berisa Bau

Native App für iOS und Android (Name: **WerkBuch**, Inhaber: **Berisa Bau**,
Mülheim an der Ruhr). Handwerker dokumentieren Baustellen (Fotos nach Bauphase,
Maße, Material, Termine, Angebot), Kunden sehen **ausschließlich ihre eigene**
Baustelle – ohne Möglichkeit zum Herunterladen, Teilen oder Speichern.

- **Framework:** React Native + Expo SDK 51 (Managed Workflow)
- **Sprache:** JavaScript
- **Backend:** Firebase (Auth + Firestore) – kostenloser **Spark-Plan**, keine Kreditkarte
- **Dateien (Fotos + PDFs):** **Cloudinary** (kostenlos, keine Kreditkarte)
- **Navigation:** React Navigation (native-stack)

> ℹ️ **Warum Cloudinary statt Firebase Storage?** Firebase verlangt für Storage
> inzwischen den kostenpflichtigen Blaze-Tarif (mit Kreditkarte). Um alles
> vollständig kostenlos und ohne Karte zu halten, liegen Fotos und Angebots-PDFs
> bei Cloudinary. Firebase bleibt dadurch im Gratis-Spark-Tarif.

> ⚠️ **Wichtig:** Die App nutzt `react-native-pdf` (nativer Code). Sie läuft
> deshalb **nicht in Expo Go**. Sie brauchen einen **Development Build** oder
> einen **EAS Build** (siehe unten).

---

## 1. Firebase-Projekt anlegen

1. Öffnen Sie die [Firebase-Konsole](https://console.firebase.google.com) und
   klicken Sie auf **„Projekt hinzufügen"**. Namen vergeben (z. B. „Berisa Bau"),
   Google Analytics ist optional.
2. **Authentication** → **„Erste Schritte"** → Reiter **„Anmeldemethode"** →
   **E-Mail/Passwort** aktivieren.
3. **Firestore Database** → **„Datenbank erstellen"** → Region **eur3 (europe-west)**
   → im **Produktionsmodus** starten.
4. Zugangsdaten holen: **⚙ Projekteinstellungen** → **Allgemein** → nach unten zu
   **„Ihre Apps"** → Web-Symbol **`</>`** → App registrieren. Firebase zeigt das
   Objekt **`firebaseConfig`**.
5. Diese Werte in **`src/firebase.js`** an den markierten Platzhaltern eintragen
   (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).

> **Storage brauchen Sie NICHT** zu aktivieren – Dateien liegen bei Cloudinary
> (siehe nächster Abschnitt).

## 1b. Cloudinary einrichten (für Fotos + PDFs)

1. Kostenloses Konto auf **https://cloudinary.com** anlegen (**„Sign up for free"**,
   keine Kreditkarte).
2. Im **Dashboard** oben den **„Cloud name"** notieren.
3. **Settings (Zahnrad)** → Reiter **„Upload"** → **„Upload presets"** →
   **„Add upload preset"**:
   - **Signing Mode** auf **`Unsigned`** stellen.
   - Preset-Namen notieren (z. B. `berisa_unsigned`) → **Save**.
4. **Settings** → Reiter **„Security"** → Haken bei
   **„Allow delivery of PDF and ZIP files"** setzen (sonst wird das Angebots-PDF
   beim Anzeigen blockiert).
5. **Cloud name** und **Preset-Name** in **`src/cloudinary.js`** an den
   markierten Platzhaltern eintragen.

---

## 2. Sicherheitsregeln hochladen

Die passende Regel-Datei ist **`firestore.rules`**.

**Über die Konsole (einfach):**
- Firestore → Reiter **„Regeln"** → Inhalt von `firestore.rules` einfügen → **Veröffentlichen**.

> Die Datei **`storage.rules`** liegt dem Projekt weiterhin bei, wird aber
> **nicht benötigt**, solange Sie Cloudinary verwenden. Sie ist nur relevant,
> falls Sie später doch auf Firebase Storage (Blaze-Tarif) umsteigen.

**Firestore-Indizes:** Die App sortiert Listen bewusst **im Client**
(nach `erstelltAm`/`datum`), damit **keine zusammengesetzten Indizes** nötig sind.
Sie können die App also ohne zusätzliche Indexe sofort nutzen.

---

## 3. Installieren und starten

Voraussetzungen: **Node.js 18+** und (für Builds) ein **Expo-Konto**
(`npm install -g eas-cli`, dann `eas login`).

```bash
cd BerisaBauApp
npm install
```

Development Build (empfohlen, weil `react-native-pdf` nativen Code braucht):
```bash
# Einmalig einen Dev-Client bauen (Cloud-Build über EAS):
eas build --profile development --platform android

# danach den Dev-Server starten und die installierte Dev-App verbinden:
npm start
```

---

## 4. Android-APK bauen (zum Weitergeben)

```bash
eas build --platform android --profile preview
```

Nach dem Build erhalten Sie einen Download-Link zur **APK**. Diese lässt sich
direkt auf Android-Geräten installieren (Installation aus unbekannten Quellen
muss erlaubt sein).

---

## 3b. Kundenportal & Zulagen (Modul `offers`/`addons`)

Der Kunde bekommt einen persönlichen Link und sieht sein Angebot ohne
Anmeldung — auf dem Handy, im Browser. Er kann dort optionale Zusatzleistungen
dazuwählen und verbindlich beauftragen. Jede Freigabe wird beweissicher
protokolliert. Vollständige Beschreibung: `docs/spezifikation-angebote.md`.

**Was der Handwerker tut:** Angebots-PDF wie gewohnt hochladen → im
Angebots-Bildschirm die Kunden-E-Mail eintragen → „Angebots-Link senden".

**Was serverseitig läuft:** Cloud Functions in `functions/`. Sie prüfen den
Link-Token, versenden den Sicherheitscode und schreiben die Freigabe-Datensätze.
Der Kunde ist nicht angemeldet — Firestore-Regeln allein könnten seinen Zugriff
deshalb gar nicht prüfen.

### Einmalige Einrichtung

1. **Blaze-Tarif aktivieren** (Firebase-Konsole → Tarif). Cloud Functions gibt
   es nicht im Spark-Tarif. Die kostenlosen Kontingente bleiben identisch; bei
   dem hier zu erwartenden Umfang entstehen praktisch keine Kosten.
2. **Gmail-App-Passwort erzeugen** (Google-Konto → Sicherheit →
   Bestätigung in zwei Schritten → App-Passwörter). Das ist **nicht** das
   normale Kennwort und einzeln widerrufbar.
3. Passwort als Secret hinterlegen und Functions veröffentlichen:
   ```bash
   firebase functions:secrets:set MAIL_PASSWORT
   firebase deploy --only functions,firestore:rules
   ```
4. Einmalig den Zulagen-Katalog anlegen: Funktion `katalogEinrichten` aufrufen
   (aus der App heraus als Handwerker, oder in der Firebase-Konsole). Danach
   sind Preise und Texte direkt in Firestore unter `zulagenKatalog` pflegbar.

### Preise und Grenzen ändern

Alle einstellbaren Werte stehen gebündelt in `functions/src/config.js`:
Grundkontingent, Zulagenpreise samt Staffeln, Prüfgrenzen (Stückzahl und
Summe), Gültigkeitsdauer, Rechtstexte. Nach einer Änderung `firebase deploy
--only functions`. Bereits in Firestore angelegte Katalogeinträge werden dabei
**nicht** überschrieben — dort geänderte Preise bleiben erhalten.

### Tests

```bash
cd functions && npm test
```

Deckt die Akzeptanzkriterien aus Kapitel 17 der Spezifikation ab: Preisstaffeln,
getrennte Steuerrundung, Prüfgrenzen, Zugangs- und Codeprüfung, Dokument-Abdruck,
Doppelklick-Schutz, Pflichtangaben.

Die Sicherheitsregeln werden getrennt gegen den Emulator geprüft (startet ihn
selbst, braucht keine Anmeldung):

```bash
cd functions && npm run test:regeln
```

> ⚠️ **Fallstrick, den dieser Test abdeckt:** Firestore verknüpft alle
> zutreffenden Regeln mit **ODER**. Eine allgemeine Sammelregel wie
> `match /{unterordner}/{docId}` greift deshalb auch auf `freigaben`,
> `protokoll` und `guthaben` — und würde deren Schreibsperre wieder aufheben,
> obwohl dort ausdrücklich `allow write: if false` steht. Die Sammelregel
> schließt diese Sammlungen deshalb ausdrücklich aus. Wer später eine weitere
> Nachweis-Sammlung ergänzt, muss sie **auch** in diese Ausschlussliste
> eintragen — sonst ist sie beschreibbar, ohne dass es auffällt.

---

## 4b. Web-App (Nutzung im Alltag: iPhone-Homescreen, Browser)

Die Web-Version läuft identisch zu Android/iOS und wird **automatisch bei
jedem Push auf `main`** über GitHub Actions gebaut und veröffentlicht:

**Live:** https://daiworld450.github.io/WerkBuch/

- Auf dem iPhone in **Safari** öffnen → Teilen-Symbol → **„Zum
  Home-Bildschirm"** → startet danach bildschirmfüllend wie eine native App.
- Lokal von Hand bauen: `npm run build:web` erzeugt `dist/` (fertig für
  GitHub Pages, inkl. iPhone-/PWA-Tags und korrektem `/WerkBuch/`-Basispfad).
- Workflow-Datei: `.github/workflows/deploy.yml`. Nach einem `git push` dauert
  die Veröffentlichung ca. 2–3 Minuten (Fortschritt im Reiter **„Actions"**
  des Repos sichtbar).

---

## 5. iOS-Build

```bash
eas build --platform ios --profile preview
```

Für iOS benötigen Sie:
- ein **Apple-ID-Konto**; für Installation auf echten Geräten bzw. TestFlight ein
  **Apple Developer Program**-Konto (99 $/Jahr).
- EAS fragt beim ersten iOS-Build nach Ihren Apple-Zugangsdaten und legt die
  nötigen Zertifikate/Provisioning-Profile automatisch an.
- Mit `--profile preview` (Option `"simulator": true`) können Sie die App auch
  ohne Entwicklerkonto im **iOS-Simulator** testen.

---

## 6. Zwei Testkonten anlegen und ausprobieren

1. App starten, **„Registrieren"**.
2. **Handwerker-Konto** anlegen: Name, E-Mail (z. B. `handwerker@test.de`),
   Telefon, Passwort → Rolle **Handwerker** → **Konto erstellen**.
3. Abmelden, erneut **„Registrieren"**, jetzt **Kunden-Konto**
   (z. B. `kunde@test.de`) → Rolle **Kunde**.
4. Als **Handwerker** anmelden → **„+ Neue Baustelle"** → Bezeichnung, Adresse und
   als Kunden-E-Mail `kunde@test.de` eintragen → **Baustelle anlegen**.
5. Baustelle öffnen und ausprobieren:
   - **Fotos**: Bauphase wählen, Foto aus Kamera/Galerie hinzufügen.
   - **Maße & Flächen**: Länge/Breite/Höhe eingeben → Flächen werden live berechnet.
   - **Material**: Position anlegen, bei Fliesen „Menge aus Flächenberechnung übernehmen".
   - **Termine**: Datum wählen, Termin anlegen, abhaken.
   - **Angebot**: PDF hochladen → Status wird automatisch „Gesendet".
6. Abmelden, als **Kunde** anmelden → dieselbe Baustelle erscheint. Der Kunde sieht
   alles (Fotos, Maße, Material, Termine, Angebot), kann aber **nichts ändern**,
   **nichts herunterladen** und beim Angebot nur **Annehmen/Ablehnen**.

---

## 7. Bekannte Grenzen

- **iOS-Screenshots:** Ein einzelner Screenshot lässt sich systembedingt von
  **keiner** iOS-App vollständig verhindern. Die App aktiviert zwar
  `expo-screen-capture`, doch unter iOS wirkt das vor allem gegen
  Bildschirm­aufnahmen (Video). Auf **Android** greift die Sperre auch gegen
  einzelne Screenshots.
- **Wasserzeichen:** Als zusätzliche Absicherung liegt über dem Angebots-PDF für
  den Kunden ein halbtransparentes, diagonales Wasserzeichen mit **Name und
  Datum**. Das schützt nicht technisch, erhöht aber die Hemmschwelle zur
  Weitergabe deutlich.
- **Löschen** einer Baustelle oder eines Fotos entfernt den Eintrag aus der App
  (Firestore). Die eigentliche Bilddatei bei Cloudinary bleibt als
  unreferenzierte Kopie im großzügigen Gratis-Speicher liegen – sie ist in der
  App nicht mehr sichtbar. Ein automatisches Aufräumen bei Cloudinary ließe sich
  später ergänzen (erfordert einen kleinen Server-Schlüssel, der aus
  Sicherheitsgründen nicht in der App liegen darf).

---

## Projektstruktur (Kurz)

```
BerisaBauApp/
  App.js                     Einstieg: Schriften, Auth, Navigation
  app.json / eas.json        Expo- und Build-Konfiguration
  firestore.rules            Firestore-Sicherheitsregeln
  storage.rules              Storage-Sicherheitsregeln
  assets/                    icon.png, splash.png, logo
  src/
    firebase.js              Firebase-Init (HIER Zugangsdaten eintragen)
    theme.js                 Farben, Schriften, Styles
    context/AuthContext.js   Anmeldung/Registrierung/Rolle
    navigation/index.js      Stack-Navigation
    components/              Karte, Knopf, Feld, Pill, Fortschritt, Logo, …
    screens/                 Login, Register, Liste, Detail, Fotos, Maße, …
    util/                    berechnung.js, format.js, fehler.js, baustelle.js
```
