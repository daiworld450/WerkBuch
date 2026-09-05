# WerkBuch – Projekt-Zusammenfassung

**App:** WerkBuch · **Inhaber:** Berisa Bau (Mülheim an der Ruhr) · **Stand:** 28.07.2026

---

## 1. Was WerkBuch ist

Eine Baustellen-Dokumentations-App für Badsanierungen. Der **Handwerker** legt
Baustellen an und dokumentiert alles (Fotos nach Bauphase, Maße, Material,
Termine, Angebots-PDF). Der **Kunde** meldet sich mit eigenem Konto an und sieht
ausschließlich **seine eigene** Baustelle – ansehen ja, herunterladen/ändern nein.
Kernnutzen: kein Suchen mehr in der Handygalerie – jedes Foto hängt an der
richtigen Baustelle und Bauphase; der Kunde sieht jederzeit den Stand.

---

## 2. Funktionen im Überblick

### Handwerker
- Baustellen anlegen, Status setzen (In Planung / In Ausführung / Abgeschlossen), löschen (mit Sicherheitsabfrage)
- Kunde per E-Mail-Adresse mit der Baustelle verknüpfen
- **Fotos** je Bauphase (Vorher · Abriss · Rohinstallation · Fliesen · Montage · Fertig) mit Notiz, aus Kamera oder Galerie; Bilder werden automatisch verkleinert (max. 1600 px, komprimiert)
- **Maße & Flächen**: Länge/Breite/Höhe/Abzug eingeben → live berechnet: Bodenfläche, Wandfläche, Fliesenbedarf Boden/Wand (+10 % Verschnitt), Umfang; dazu freie Einzelmaße
- **Material** nach Kategorie (Fliesen Boden/Wand, Bodenbelag, Sanitär, Sonstiges) mit Menge, Einzelpreis, Zeilensumme und Gesamtsumme (nur für Handwerker sichtbar); Fliesen-Menge per Knopf aus der Flächenberechnung übernehmbar
- **Termine** mit Datumswahl, Abhaken, Löschen; erledigte/vergangene abgedunkelt
- **Kalender** (Menüpunkt „📅 Kalender" über der Baustellenliste, nur für den Handwerker): drei umschaltbare Ansichten (Monat als 7-Spalten-Raster, Woche mit Balken je Baustelle, Tag als chronologische Liste), Pfeile für den Zeitraum davor/danach, „Heute"-Sprung und die Zähler „aktiv heute", „diesen Monat/diese Woche/an diesem Tag", „ohne Termin". Gezeigt werden zwei Quellen: frei angelegte **Termine** (top-level Sammlung `termine`, farbige Streifen nach Art – Baustelle/Besichtigung/Material/Büro/Privat) und die geplanten Zeiträume der Baustellen (`geplantStart`/`geplantEnde`, umrandete Balken „Baustelle läuft"). In der Tagesansicht steht bei einem mit einer Baustelle verknüpften Termin der Kundenname mit antippbarer Telefonnummer
- **Angebot**: PDF hochladen (max. 10 MB) → Status automatisch „Gesendet"; Betrag optional; Vorschau seitenweise im echten Seitenformat

### Kunde
- Sieht alles Obige **nur lesend** – Fotos, Maße, Material, Termine
- **Angebot** bildschirmfüllend ansehen (als Seitenbilder, ohne Download-/Teilen-Knopf), mit diagonalem **Wasserzeichen** (Name + Datum)
- Bei Status „Gesendet": **Annehmen** oder **Ablehnen** (mit Bestätigung) – mehr kann der Kunde am Angebot nicht ändern (auch technisch per Sicherheitsregel erzwungen)

### Smarte Status-Logik (Angebot)
- Handwerker schaltet nur **Entwurf ↔ Gesendet**
- **Angenommen/Abgelehnt** ist allein die Kundenentscheidung – beim Handwerker als grünes/rotes Abzeichen sichtbar, mit „Auf Gesendet zurücksetzen" (Sicherheitsabfrage) statt versehentlichem Überschreiben

### Design
- Durchgehend dunkel, exakt die Landingpage-Optik: Schwarz `#0b0b0f`, Rot `#D00000`, Blau `#1032CF`, Grün `#38d17a`
- Schriften **Rajdhani** (Überschriften/Buttons, GROSSBUCHSTABEN) + **Rubik** (Fließtext)
- Vollrunde rote Buttons, Glas-Karten, Pills/Chips, Fortschrittsbalken mit Rot-Verlauf
- **Roter Zurück-Pfeil** in der Kopfzeile

---

## 3. Technik & Konten (alles kostenlos, keine Kreditkarte)

| Baustein | Dienst | Details |
|---|---|---|
| Anmeldung + Datenbank | **Firebase** (Spark, 0 €) | Projekt `berisa-bau`, E-Mail/Passwort-Login, Firestore mit veröffentlichten Sicherheitsregeln |
| Fotos + PDFs | **Cloudinary** (0 €) | Cloud `iqigqezt`, unsigniertes Preset `WerkBauBuch`, PDF-Auslieferung aktiviert; Upload per Base64 (zuverlässig auf allen Geräten); PDF-Anzeige als Seitenbilder |
| App-Builds | **Expo/EAS** | Konto `daiworld`, Projekt `werkbaubuch` (Owner `daiworl450`) |
| Quellcode + Hosting | **GitHub Pages** (0 €) | Repo `daiworld450/WerkBuch`, automatischer Deploy per GitHub Actions bei jedem Push |
| Technik | Expo **SDK 54**, React Native, JavaScript | Läuft identisch auf iPhone, Android und im Browser |

**Warum kein Firebase Storage?** Der verlangt inzwischen den Blaze-Tarif mit
Kreditkarte – deshalb Cloudinary. **Warum kein TestFlight?** Apple verlangt
99 €/Jahr (Developer Program) – wurde bewusst nicht bezahlt.

---

## 4. Wo liegt was

| Ort | Inhalt |
|---|---|
| `Desktop\mein-assistent\BerisaBauApp\` | Kompletter Quellcode (Git-Repository, 4 Commits) |
| `BerisaBauApp\dist\` | Fertiger Web-Build (PWA) |
| `Desktop\WerkBuch-Web\` | **Kopie des Web-Builds zum Hochladen bei Netlify** |
| `Desktop\WerkBuch.apk` | Android-Installationsdatei (82 MB) – ⚠️ ältere Version, siehe Grenzen |
| `BerisaBauApp\firestore.rules` | Sicherheitsregeln (bereits in Firebase veröffentlicht) |
| `BerisaBauApp\README.md` | Technische Anleitung (Firebase/Cloudinary/Builds) |

---

## 5. So nutzen Sie die App

### Empfohlener Weg: Web-App auf dem iPhone (ohne PC, ohne Kosten)

**Live-Adresse:** https://daiworld450.github.io/WerkBuch/

1. Adresse auf dem iPhone in **Safari** öffnen
2. **Teilen-Symbol → „Zum Home-Bildschirm"** → es entsteht ein echtes App-Symbol (WB-Icon), Start bildschirmfüllend wie eine native App
3. Anmelden/registrieren und loslegen – Kamera, Fotos, PDFs funktionieren; der PC muss **nicht** laufen

⚠️ **Voraussetzung für die Anmeldung:** In der Firebase-Konsole muss
`daiworld450.github.io` unter **Authentication → Einstellungen → Autorisierte
Domains** eingetragen sein. Fehlt der Eintrag, blockiert Firebase das Anmelden.

### Alternative: Android-APK
`WerkBuch.apk` auf ein Android-Gerät kopieren/herunterladen und installieren
(Build-Link: expo.dev → Konto daiworl450 → Projekt werkbaubuch). ⚠️ Diese APK
ist ein älterer Stand (vor den letzten Design-/Upload-Verbesserungen) – für den
aktuellen Stand müsste einmal neu gebaut werden (`eas build`, ~15 Min).

### Alternative: Expo Go (nur zum Entwickeln/Testen)
Nur wenn der PC läuft und im selben WLAN ist: Entwicklungs-Server starten,
QR-Code mit Expo Go scannen. Für den Alltag nicht nötig.

### Typischer Testablauf
1. Als **Handwerker** registrieren → Baustelle anlegen (Kunden-E-Mail eintragen)
2. Fotos je Phase hochladen, Maße eingeben, Material erfassen, Termine planen, Angebots-PDF hochladen
3. Abmelden, als **Kunde** (mit der verknüpften E-Mail) registrieren/anmelden → dieselbe Baustelle erscheint, alles nur lesend, Angebot annehmen/ablehnen

---

## 6. Sicherheit & Schutz

- **Zugriffsschutz serverseitig** (Firestore-Regeln): Handwerker sieht nur eigene Baustellen; Kunde nur seine; Kunde darf am Angebot ausschließlich den Status auf Angenommen/Abgelehnt setzen
- **Kein Download/Teilen** für den Kunden: Fotos nur in der App-Ansicht, PDF als Seitenbilder ohne Viewer-Leiste
- **Wasserzeichen** (Kundenname + Datum, diagonal, halbtransparent) über dem Angebot
- Screenshot-Sperre: auf iOS systembedingt von keiner App vollständig verhinderbar, im Web ebenso – das Wasserzeichen ist die wirksame Absicherung; die `.env`-/Schlüssel-Hygiene ist eingehalten (keine geheimen Schlüssel in der App)

---

## 7. Kosten

**0 € laufend.** Firebase Spark, Cloudinary Free (≈25 GB, max. 10 MB/Datei),
Netlify Free, Expo-Konto frei. Einzige je anfallende Option: Apple Developer
(99 €/Jahr), **nur falls** die App später nativ per TestFlight/App Store aufs
iPhone soll.

---

## 8. Bekannte Grenzen (ehrlich)

1. **Android-APK ist veraltet** – enthält noch die alte Upload-Technik und das alte Design; Neubau bei Bedarf einfach möglich
2. **Gelöschte Fotos/Baustellen**: Einträge verschwinden aus der App, die Dateien bleiben unreferenziert im (großzügigen) Cloudinary-Speicher liegen
3. **PDF max. 10 MB** (Cloudinary-Gratis-Limit) – die App fängt größere Dateien mit verständlicher Meldung ab
4. **Web-Version**: einzelne Screenshots technisch nicht verhinderbar (gilt für iOS generell); Schutz = Wasserzeichen + fehlende Download-Knöpfe
5. **iPhone nativ** (echtes Installieren ohne Browser) geht nur mit Apple-Developer-Konto – bewusst nicht gewählt

---

## 9. Offene Schritte

| # | Schritt | Wer |
|---|---|---|
| 1 | In Firebase `daiworld450.github.io` als autorisierte Domain eintragen (falls noch nicht) | Sie (1 Min) |
| 2 | Adresse auf dem iPhone öffnen → „Zum Home-Bildschirm" | Sie (1 Min) |
| 3 | Einmal komplett durchtesten (Handwerker + Kunde, Foto + PDF) | Sie + ich |
| 4 | Optional: Android-APK auf aktuellen Stand neu bauen | ich (~15 Min) |
| 5 | Optional (später): Apple Developer + TestFlight für native iPhone-App | Sie zahlen, ich baue |

---

## 10. Wie Updates künftig laufen

Änderungswunsch beschreiben → ich passe den Code an, prüfe ihn und **pushe zu
GitHub** → GitHub Actions baut und veröffentlicht automatisch (~2–3 Min) →
**gleiche Adresse, neue Version**. Auf dem iPhone reicht danach ein Neuladen.

**Sie müssen dabei gar nichts mehr tun** – kein Ordner hochladen, kein Klicken.
