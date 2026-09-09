# Bestandsaufnahme WerkBuch

**Stand:** 08.09.2026 · **Grundlage:** vollständige Durchsicht von `BerisaBauApp/`
inkl. `worker/`, dazu Live-Prüfungen gegen GitHub Pages, Cloudflare und Firestore.

Alles hier ist geprüft, nicht vermutet. Wo etwas unklar geblieben ist, steht das
ausdrücklich dabei.

---

## 1. Was WerkBuch heute ist

Eine Baustellen-App für **den Betrieb**, nicht für den Kunden. Der Kundenteil
wurde am 05.09. bewusst ausgebaut. Live unter
<https://daiworld450.github.io/WerkBuch/> — HTTP 200, aktueller Stand vom
05.09.2026, 19:03 Uhr.

Rund **9.400 Zeilen** App-Code in 22 Bildschirmen, dazu **4.300 Zeilen** in einem
separaten Cloudflare-Worker, der aus der Kundenportal-Zeit stammt.

---

## 2. Tech-Stack

| Schicht | Was | Anmerkung |
|---|---|---|
| Oberfläche | React Native 0.81.5 / React 19.1 / Expo SDK 54 | eine Codebasis für Web, iOS, Android |
| Web-Ausgabe | `expo export --platform web`, Metro-Bundler, `output: single` | reine Single-Page-App, kein Server-Rendering |
| Navigation | React Navigation 6 (native-stack) | 22 Bildschirme in einem flachen Stack |
| Datenbank | Firebase Firestore, Region **eur3** (Europa) | Spark-Tarif, kostenlos |
| Anmeldung | Firebase Auth, E-Mail + Passwort | |
| Dateien | **Cloudinary**, unsigniertes Upload-Preset | Firebase Storage verlangt den kostenpflichtigen Blaze-Tarif |
| Backend | Cloudflare Worker (`worker/`), kein Framework | läuft, siehe Abschnitt 6 |
| Schriften | Rajdhani + Rubik über `@expo-google-fonts` | mitgebündelt, kein CDN |
| Hosting | GitHub Pages, Repo `daiworld450/WerkBuch` | eigenes Repo, **nicht** dieses hier |

**Keine** Zusatzbibliotheken für Formulare, Zustand, Datumsrechnung, Tabellen
oder PDF. Alles handgeschrieben. Das hält die App klein und schnell und ist der
Grund, warum sie ohne Baukastenlogik gut lesbar ist.

---

## 3. Ordnerstruktur

```
BerisaBauApp/
├── App.js                     Einstieg, Schriften laden
├── app.json                   Expo-Konfiguration (Name, Icons, Rechte)
├── firestore.rules            318 Zeilen Sicherheitsregeln — das eigentliche Rechtemodell
├── src/
│   ├── firebase.js            Firebase-Initialisierung (Schlüssel im Klartext, siehe 8.2)
│   ├── cloudinary.js          Datei-Upload, zwei Wege (image / raw)
│   ├── bauvision.js           Anbindung an den BauVision-Dienst
│   ├── theme.js               Farben, Schriften, Größen — eine einzige Quelle
│   ├── context/AuthContext.js Anmeldung, Registrierung, Rollenermittlung
│   ├── navigation/index.js    Stack + Web-Adressen mit /WerkBuch-Präfix
│   ├── components/            11 Bausteine (Karte, Knopf, Feld, Pill …)
│   ├── util/                  baustelle, berechnung, kalkulation, termine, format, fehler, dialog
│   └── screens/               22 Bildschirme
├── worker/                    Cloudflare Worker: Kundenportal, Zulagen, Freigaben (siehe 6)
├── tools/                     copy-public.js, patch-index.js — Nachbau des Web-Exports
├── public/                    manifest.json, Icons
├── docs/spezifikation-angebote.md   448 Zeilen Spezifikation Angebot + Zulagen
└── .github/workflows/deploy.yml     Bauen und Veröffentlichen
```

---

## 4. Datenmodell

Alles unterhalb von `baustellen/{id}` ist Unterordner der Baustelle. Zwei
Sammlungen liegen bewusst oben (`termine`, `personen`).

### 4.1 Entitäten

```
users/{uid}
    name, email, rolle ("handwerker" | "mitarbeiter"), telefon,
    gehoertZu (uid des Inhabers, nur bei mitarbeiter),
    personId (Verweis auf personen/{id}), erstelltAm

personen/{id}                              ← top-level
    name, email, stundensatzKosten, handwerkerId, uid, erstelltAm

termine/{id}                               ← top-level
    titel, notiz, start, ende, ganztags, art
    ("baustelle" | "besichtigung" | "material" | "buero" | "privat"),
    baustelleId, baustelleName, kundeName, kundeTelefon,
    handwerkerId, erledigt, erstelltAm

baustellen/{bid}
    name, adresse, handwerkerId,
    kundeName, kundeTelefon,               ← reine Kontaktinfo, kein Konto
    status ("In Planung" | "In Ausführung" | "Abgeschlossen"),
    fortschritt (0–100, aus den Fotophasen abgeleitet), fotoAnzahl,
    geplantStart, geplantEnde,
    umsatz, budget,                        ← Grundlage der Nachkalkulation
    zugewieseneNutzer: [uid],              ← wer die Baustelle sehen darf
    erstelltAm

  ├── fotos/{id}          url, publicId, phase, notiz, hochgeladenVon, erstelltAm
  ├── masse/{id}          + raum/haupt (Kopfdaten)
  ├── material/{id}       bezeichnung, menge, einheit, einzelpreis, bemerkung
  ├── kosten/{id}         bezeichnung, betrag, datum
  ├── stunden/{id}        datum, personId, personName, stunden, von, bis,
  │                       stundensatzKosten (EINGEFROREN), notiz, erstelltVon
  ├── dokumente/{id}      name, url, publicId, typ, groesse, hochgeladenAm
  ├── angebot/aktuell     pdfUrl, pdfPfad, seiten, dateiname, betrag,
  │                       status ("Entwurf"|"Gesendet"|"Angenommen"|"Abgelehnt")
  ├── visualisierungen/   BauVision-Entwürfe
  │
  └── verwaist (Regeln vorhanden, kein Client mehr):
      freigaben/  protokoll/  guthaben/  zulagenBestellungen/  nachrichten/

zulagenKatalog/{sku}       ← top-level, verwaist
magicLinks/{hash}          ← top-level, nur der Worker
```

### 4.2 Beziehungen

```
users ──(personId)──▶ personen ──(handwerkerId)──▶ users
baustellen ──(handwerkerId)──▶ users
baustellen ──(zugewieseneNutzer[])──▶ users
termine ──(handwerkerId)──▶ users
termine ──(baustelleId, optional)──▶ baustellen
stunden ──(personId)──▶ personen,  ──(erstelltVon)──▶ users
```

**Zwei Entwurfsentscheidungen, die man kennen muss:**

1. `stundensatzKosten` wird beim Erfassen in den Stundeneintrag **kopiert**.
   Ändert sich der Satz später, verändern sich abgeschlossene Kalkulationen
   nicht rückwirkend. Richtig so.
2. `umsatz` nicht gesetzt heißt **„nicht kalkuliert"**, nicht „0 €". Gewinn ist
   dann `null` und die Baustelle bleibt aus jedem Durchschnitt heraus
   (`src/util/kalkulation.js`).

### 4.3 Was im Datenmodell fehlt

Für das, was gebaut werden soll, fehlen: **Kunde als eigene Entität** (heute nur
zwei Textfelder auf der Baustelle), **Angebotspositionen** (heute nur ein
hochgeladenes PDF plus Betrag), **Nachtrag/Zulage**, **Rechnung**, **Zahlung**,
**Einwilligungstext**. Alle Geldbeträge liegen als Fließkommazahl, nicht in Cent.

---

## 5. Module: was läuft, was nicht

| Modul | Zustand | Bemerkung |
|---|---|---|
| Anmelden / Registrieren | **läuft** | zwei Blockaden am 05.09. behoben (Domain, API-Schlüssel-Beschränkung) |
| Baustellenliste + anlegen | **läuft** | 20 Baustellen importiert |
| Baustellen-Detail | **läuft** | Status, Zeitraum, Kunde, Zuweisung |
| Fotos nach Bauphase | **läuft, mit Lücken** | siehe unten |
| Fotobetrachter | **läuft** | Vollbild, Wischen, Löschen |
| Maße & Flächen | **läuft** | |
| Material | **läuft** | mit Einkaufspreisen, vor Mitarbeitern verborgen |
| Sonstige Kosten | **läuft** | |
| Stunden | **läuft** | eingefrorener Kostensatz, Mitarbeiter nur eigene |
| Kalkulation je Baustelle | **läuft** | 36 Prüfungen der Rechenlogik von Hand bestätigt |
| Auswertung über alle | **läuft** | gewichtete Marge, nicht kalkulierte separat |
| Personen | **läuft** | Verknüpfung über E-Mail bei der Registrierung |
| Kalender | **läuft** | Monat/Woche/Tag, Termine frei anlegbar |
| Dokumente je Baustelle | **läuft** | 34 Dateien importiert |
| Angebot | **Platzhalter** | nur PDF hochladen + Betrag + Status von Hand |
| BauVision-Entwurf | **abhängig** | ruft einen externen Worker, dessen Vorschau seit 04.09. abgeschaltet ist |
| Zulagen / Kundenfreigabe | **verwaist** | Backend live, Oberfläche gelöscht (Abschnitt 6) |
| Rechnung | **fehlt** | existiert stattdessen in `zentrale/` |
| Projektbericht als PDF | **fehlt** | |
| Offline-Betrieb | **fehlt** | kein Service Worker, keine Warteschlange |

**Lücken beim Fotomodul** — relevant, weil Schritt 4 genau darauf zielt:

- `ImageManipulator.manipulateAsync` verkleinert auf 1600 px und entfernt dabei
  **alle** Metadaten. Das Aufnahmedatum ist damit weg; angezeigt wird der
  Zeitpunkt des Hochladens. Bei einem Foto, das man abends überträgt, steht das
  falsche Datum an der Bauphase. Der Standort ist ebenfalls weg — das ist
  richtig so, aber es ist Zufall, nicht Absicht.
- Nur **ein Foto pro Vorgang**, kein Mehrfachauswählen, keine Warteschlange,
  kein erneuter Versuch. Bricht das Netz ab, ist das Foto weg.
- Keine Sortierung innerhalb einer Phase außer nach Uploadzeit.

---

## 6. Der Worker: gebaut, getestet, live — und ohne Oberfläche

`worker/` ist **kein toter Code**. Geprüft am 08.09.:

```
https://werkbuch.werkbuch-berisabau.workers.dev/gesundheit
→ 200 {"ok":true,"dienst":"werkbuch-worker"}
```

Was dort bereits fertig ist (4.298 Zeilen, davon 1.735 Zeilen Tests):

- **Magic-Link ohne Login**: Token 32 Byte, in der Datenbank nur als SHA-256-Hash,
  30 Tage gültig, an genau ein Projekt und eine Adresse gebunden.
- **Zweite Stufe vor der Freigabe**: 6-stelliger Code per E-Mail, 15 Minuten,
  max. 5 Versuche. Ansehen ohne Code, freigeben nicht.
- **Freigabe beweissicher**: Zeitstempel, IP, Prüfsumme über den angezeigten
  Dokumentstand, Idempotenzschlüssel gegen Doppelklick. Ändert sich das Angebot
  zwischen Ansehen und Freigeben, wird die Freigabe mit `409` abgelehnt statt
  stillschweigend übernommen.
- **Alles in einer Firestore-Transaktion**, Katalog und Summe werden erst
  innerhalb der Transaktion gelesen.
- **Protokoll** als eigene Sammlung, für jeden Client schreibgesperrt
  (`allow write: if false`) — auch für den Inhaber.
- **Preisrechnung in ganzen Cent**, Umsatzsteuer je Satz getrennt gerundet.
- **19 Tests laufen durch** (`node --test`, gerade ausgeführt).

**Was fehlt:** die Oberfläche. `PortalScreen.js` (877 Zeilen) und `src/portal.js`
wurden am 05.09. gelöscht. Und: jeder Endpunkt, der die Datenbank berührt,
antwortet derzeit mit einem internen Fehler —

```
POST /portal/ansehen  → {"fehler":{"code":"UNBEKANNT"}}
POST /handwerker/…    → {"fehler":{"code":"NICHT_ANGEMELDET"}}   (korrekt)
```

Die Anmeldeprüfung funktioniert also, der Firestore-Zugriff nicht. Wahrscheinlichste
Ursache: das Geheimnis `FIRESTORE_DIENSTKONTO_JSON` ist im Cloudflare-Konto nicht
gesetzt. **Nicht abschließend geprüft** — dafür bräuchte es `npx wrangler tail`
mit angemeldetem Cloudflare-Konto.

Für Schritt 1 heißt das: Die schwierige Hälfte ist gebaut und getestet. Was
fehlt, ist die Kundenseite und die fachliche Erweiterung von „Angebot freigeben"
auf „einzelnen Nachtrag freigeben".

---

## 7. Auth, Rollen, Mandantenfähigkeit

### 7.1 Rollen

Zwei Rollen, beide in `users/{uid}.rolle`:

- **handwerker** — der Inhaber. Sieht und ändert alles.
- **mitarbeiter** — trägt eigene Stunden und Fotos ein. Keine Preise, keine
  Kosten, kein Umsatz, kein Angebot.

Ein Mitarbeiter entsteht **ohne Mailserver**: Der Inhaber legt unter „Personen"
einen Eintrag mit E-Mail an; wer sich mit genau dieser Adresse registriert, wird
automatisch Mitarbeiter. Die Reihenfolge in `AuthContext.registrieren()` ist
dabei entscheidend und im Code ausdrücklich kommentiert — der Abgleich muss
**nach** `createUserWithEmailAndPassword` laufen, sonst würde jeder Mitarbeiter
still als Inhaber angelegt.

`rolle` ist nach dem Anlegen unveränderlich (Firestore-Regel), niemand kann sich
selbst befördern.

### 7.2 Durchsetzung

Die Rechte hängen **nicht** an der Oberfläche, sondern an `firestore.rules`. Die
Bildschirme blenden nur aus, was ohnehin abgewiesen würde. Das ist die richtige
Reihenfolge.

Zwei Stellen verdienen Aufmerksamkeit:

- Die Sammelregel `match /{unterordner}/{docId}` am Ende verknüpft mit **ODER**.
  Jede Sammlung mit eigener, engerer Regel **muss** in `eigeneRegeln()` stehen,
  sonst hebt die Sammelregel sie wieder auf. Steht so im Code kommentiert. Wer
  künftig eine geschützte Sammlung ergänzt und diesen Eintrag vergisst, öffnet
  sie unbemerkt.
- Jede Regelprüfung über `istHandwerkerVon()` / `istZugewiesen()` kostet einen
  eigenen Dokumentabruf. Beim Lesen eines Unterordner-Dokuments können das drei
  sein. Bei der Datenmenge eines Solobetriebs unkritisch, aber es ist der Grund,
  warum die Leseabrechnung höher liegt, als die Bildschirme vermuten lassen.

### 7.3 Mandantenfähigkeit

**Nicht vorhanden — und das ist eine bewusste Grenze.** Es gibt keinen
Betriebs-Datensatz. Die Zugehörigkeit hängt an `handwerkerId == uid` des
Inhabers. Solange WerkBuch nur für Berisa Bau läuft, trägt das. Sollte die App je
an andere Betriebe gehen, ist das der erste große Umbau: eine `betriebe`-Ebene
über allem, und `handwerkerId` wird zu `betriebId`.

### 7.4 Tote Regeln

- `istKundeVon(bid)` prüft `baustellen/{bid}.kundeId` — dieses Feld wird von der
  App **nirgends mehr gesetzt**. Die Regel läuft ins Leere.
- `istBesitzer()` verlangt fest verdrahtet `berisabau@gmail.com`. Das aktive
  Konto ist `info@berisabau.de`. **Damit kann derzeit niemand den
  `zulagenKatalog` beschreiben** — Schritt 1 läuft ohne Korrektur sofort in
  diese Wand.

---

## 8. Tests, CI, Deployment

### 8.1 Tests

| | Zustand |
|---|---|
| App (`src/`) | **0 Tests.** Kein Jest, kein Testrunner, keine Prüfung im Bau. |
| Worker (`worker/`) | 9 Testdateien, 1.735 Zeilen. Ausgeführt am 08.09.: **19 von 19 grün**. |
| Regeltest (`test/regeln.test.js`) | 258 Zeilen, verlangt den Firebase-Emulator. **Nicht ausgeführt** — `worker/node_modules` fehlt. |

Die Kalkulationslogik in `src/util/kalkulation.js` ist bewusst frei von Firestore
und React und damit **direkt testbar** — die Tests fehlen bloß. Das ist die
billigste offene Baustelle im ganzen Projekt.

### 8.2 Deployment

- **Ein Push nach `daiworld450/WerkBuch` → GitHub Actions → GitHub Pages.**
  Letzte fünf Läufe alle erfolgreich, je rund 2¼ Minuten.
- Der Arbeitsstand liegt hier in `mein-assistent/BerisaBauApp/`, das
  Veröffentlichungs-Repo ist ein **anderes**. Zwischen beiden wird **von Hand**
  kopiert. Das ist die wahrscheinlichste Ursache für „ich habe es geändert und
  live ist es nicht".
- Der Bau prüft **nichts** — kein Test, kein Linter, kein Typcheck. Was gebaut
  wird, geht live.
- Tiefe Adressen (`/WerkBuch/baustellen`) liefern **HTTP 404** mit dem Inhalt der
  App: `patch-index.js` kopiert `index.html` nach `404.html`. Die App lädt also
  korrekt, aber jede Unterseite meldet dem Browser und jeder Suchmaschine einen
  Fehler.
- `public/_redirects` ist eine **Netlify**-Datei. Auf GitHub Pages wirkungslos.
- Die Firebase-Web-Schlüssel stehen im Klartext in `src/firebase.js`. Das ist bei
  Firebase **richtig so** — sie sind öffentlich gedacht, der Schutz liegt in den
  Regeln und in der Beschränkung des Schlüssels auf erlaubte Domains.

### 8.3 Sicherung

```
Firestore eur3 · Point-in-Time-Recovery: AUS · Löschschutz: AUS
```

**Es gibt keine Sicherung.** Kein Export, kein Zeitfenster zum Zurückholen.

---

## 9. Die fünf größten technischen Baustellen, nach Risiko

### 1. Kein Backup, kein Löschschutz — höchstes Risiko

Die Datenbank hat Point-in-Time-Recovery **aus** und Löschschutz **aus**. Ein
falscher Löschbefehl, ein fehlerhaftes Skript, ein versehentlich gelöschtes
Projekt — und 20 Baustellen samt Stunden, Kosten und Kalkulation sind
unwiederbringlich weg. Alles andere in dieser Liste ist reparierbar, das nicht.

*Aufwand für die Absicherung: gering.* Löschschutz ist ein Schalter. Ein
täglicher Export nach Cloud Storage kostet auf dem Spark-Tarif nichts, verlangt
aber einen Ablauf, der ihn anstößt.

### 2. Cloudinary: offenes Upload-Tor und öffentliche Kundenfotos

Zwei getrennte Probleme in einer Zeile Code:

- Das Upload-Preset ist **unsigniert**. Cloud-Name und Preset stehen im
  ausgelieferten JavaScript und sind damit für jeden lesbar, der die Seite
  öffnet. Wer sie ausliest, kann auf das Konto von Berisa Bau hochladen, was er
  will — bis das Freikontingent erschöpft ist oder etwas dort liegt, das dort
  nicht liegen soll.
- Die Auslieferungs-Adressen sind **öffentlich und ohne Anmeldung abrufbar**.
  Jedes Kundenfoto, jedes hochgeladene Dokument, jedes Angebots-PDF ist für
  jeden erreichbar, der die Adresse kennt. Die Adresse ist schwer zu erraten —
  aber „schwer zu erraten" ist kein Zugriffsschutz, und für Kundenfotos aus
  fremden Wohnungen ist es datenschutzrechtlich zu wenig.

Dazu offen und **nicht geprüft**: in welcher Region das Cloudinary-Konto liegt.
Der Gratis-Tarif steht standardmäßig in den USA. Für Schritt „DSGVO: Fotos in der
EU" muss das geklärt werden, bevor irgendetwas anderes gebaut wird.

### 3. Kein Test und keine Prüfung vor der Veröffentlichung

Null Tests in der App, kein Prüfschritt im Bau. Solange die App Fotos sortiert,
ist das lästig. Sobald sie **Preise rechnet und Freigaben protokolliert**, ist es
nicht mehr tragbar: Ein Rechenfehler in einem Nachtrag ist ein Fehler in einem
Dokument, auf das sich ein Kunde beruft. Der Worker zeigt, wie es geht — dort
liegen für dieselbe Art Logik 1.735 Zeilen Tests.

### 4. Angebot und Rechnung gibt es im Betrieb schon zweimal

Das ist kein Fehler im Code, sondern das größte Risiko für die geplante Arbeit.

| Was | Wo | Umfang |
|---|---|---|
| Angebote mit Positionen, DIN-Verweisen, PDF, Kalkulation, Widerrufsbelehrung | `angebote-werkzeug/` | 4.032 Zeilen Python, 37 Leistungen, 5 Gewerke, 7 DIN-Verweise in den Langtexten |
| Rechnungen, Mahnwesen, Belege, Umsatzsteuer, Kundenkartei | `zentrale/` | 3.022 Zeilen Python, Weboberfläche |
| Angebot in WerkBuch | `AngebotScreen.js` | PDF hochladen, Betrag tippen, Status klicken |

Schritt 2 wie ausgeschrieben würde ein **drittes** Angebotssystem bauen — mit
eigenem Nummernkreis, eigenem Leistungskatalog und eigenen Preisen. Sobald zwei
Systeme dieselbe Angebotsnummer vergeben oder unterschiedliche Preise für
dieselbe Leistung kennen, ist der Schaden größer als der Nutzen.

Das ist die Entscheidung, die vor dem Bauen fallen muss. Siehe Abschnitt 11.

### 5. Verwaiste Freigabe-Infrastruktur und tote Regeln

Der Worker ist live, aber sein Firestore-Zugriff scheitert (Abschnitt 6). Die
Sammlungen `freigaben`, `protokoll`, `guthaben`, `zulagenBestellungen`,
`nachrichten` haben Regeln, aber keinen Client. `istKundeVon()` prüft ein Feld,
das niemand mehr schreibt. `istBesitzer()` prüft eine E-Mail-Adresse, die es
nicht mehr gibt.

Das ist heute harmlos — beim Wiederanschalten des Kundenwegs aber genau die Art
Altlast, die einen halben Tag Fehlersuche kostet, weil scheinbar alles richtig
aussieht.

---

## 10. Weitere Befunde, geordnet

**Datenschutz und Recht**

- Keine Datenschutzerklärung, kein Löschkonzept, keine Auftragsverarbeitung mit
  Cloudinary oder Google dokumentiert.
- Firestore in **eur3 (Europa)** — gut. Cloudinary-Region **ungeklärt**.
- Keine unveränderliche Ablage für Rechnungsdaten. Kein E-Rechnungs-Format
  (XRechnung / ZUGFeRD) an irgendeiner Stelle.
- Die Fotos entstehen in fremden Wohnungen. Es gibt keinen Ablauf, der eine
  Einwilligung erfasst — bei `bauvision.js` ist `referenz: false` fest gesetzt,
  ausdrücklich weil die App die Einwilligung nicht für den Kunden erteilen kann.
  Für die Baustellenfotos in WerkBuch fehlt eine solche Überlegung ganz.

**Mobil**

- Als Expo-App grundsätzlich mobil gedacht, Bedienflächen großzügig.
- Aber: **kein Offline-Betrieb.** Kein Service Worker, keine Warteschlange, kein
  lokaler Zwischenspeicher. Im Keller ohne Netz ist die App leer.
- Die installierte Web-App speichert aggressiv zwischen — am 05.09. hat das zu
  „der Kalender hat keine Funktion" geführt, weil eine alte Fassung im Cache lag.
  Ohne Versionsanzeige in der Oberfläche ist so etwas schwer zu erkennen.

**Kleinere Auffälligkeiten**

- `aktualisiereZaehler()` scheitert für Mitarbeiter still — nur der Inhaber darf
  das Baustellendokument schreiben. Der Zähler bleibt dann stehen. Bekannt und
  hingenommen, aber nirgends sichtbar.
- Alle Geldbeträge sind Fließkommazahlen. Der Worker rechnet dagegen konsequent
  in Cent. Beim Zusammenführen wird das ein Thema.
- Die importierten Baustellen haben keine Adresse und keinen Kundennamen. Für die
  Auswertung nach Ort behilft sich `ortAus()` mit dem Baustellennamen.
- Mitarbeiter sehen die Termine des Inhabers nicht — dort stehen auch private.
  Bewusst so; wer das ändern will, braucht ein Feld `sichtbarFuer[]` am Termin,
  keine Aufweichung der Regel.

---

## 11. Abgleich: die fünf gewünschten Schritte gegen den Ist-Zustand

| Schritt | Was schon da ist | Was wirklich fehlt |
|---|---|---|
| **1 Zulagen & Nachträge mit Kundenfreigabe** | Magic-Link, Code-Verifikation, Freigabe mit IP/Zeitstempel/Prüfsumme, Protokoll schreibgesperrt, Transaktion, Cent-Rechnung, 19 Tests — **alles live** | Kundenseite (gelöscht), Nachtrag als eigene Entität mit eigenem Statusmodell, Firestore-Zugriff des Workers reparieren, `istBesitzer()` korrigieren, Verknüpfung mit der Auftragssumme |
| **2 Angebotsmodul** | **In `angebote-werkzeug/` weitgehend fertig**: Positionen, Kurz-/Langtext, DIN-Verweise, Mengen, Einheitspreise, PDF, Gewerkevorlagen, Widerrufsbelehrung | In WerkBuch: alles. Aber die Frage ist nicht „wie bauen", sondern „neu bauen oder anbinden" |
| **3 Kundenportal** | Der Worker liefert genau das (Angebot, Zulagen, Verlauf, Dauerlink) | Oberfläche. Und: der Kundenteil wurde am 05.09. ausdrücklich ausgebaut — das ist jetzt eine Kehrtwende, die bewusst getroffen werden sollte |
| **4 Baustellenfotos** | Fotos nach 6 Bauphasen, Komprimierung, Vollbild, Fortschritt aus den Phasen | Aufnahmedatum bleibt nicht erhalten (wird mitentfernt), keine Mehrfachauswahl, keine Offline-Warteschlange, **kein Projektbericht als PDF**, keine saubere Schnittstelle für die Social-Media-Pipeline |
| **5 Kalender & Mehrbenutzer** | **Im Wesentlichen fertig.** Monat/Woche/Tag, Termine frei anlegbar, Rollen Inhaber/Mitarbeiter, Zuweisung je Baustelle, Regeln setzen es durch | Mitarbeiter sehen keine eigene Einsatzansicht über alle Baustellen hinweg; Rolle „Kunde" gibt es nicht mehr (hängt an Schritt 3) |

**Die Reihenfolge in der Vorgabe passt nicht zum Ist-Zustand.** Schritt 5 ist
weitgehend erledigt. Schritt 1 ist zur Hälfte gebaut und scheitert an einem
Konfigurationsfehler. Schritt 2 existiert bereits an anderer Stelle. Der
Umsetzungsplan trägt dem Rechnung.

---

## 12. Anhang: geprüfte Fakten mit Beleg

| Behauptung | Beleg |
|---|---|
| App live, Stand 05.09. 19:03 | `curl` → 200; `gh run list` letzter Lauf 33985956460 |
| Tiefe Adressen liefern 404 mit App-Inhalt | `curl /WerkBuch/baustellen` → 404, Inhalt = `index.html` |
| Worker läuft | `GET /gesundheit` → `{"ok":true,"dienst":"werkbuch-worker"}` |
| Worker-Datenbankzugriff scheitert | `POST /portal/ansehen` → `UNBEKANNT` statt `ZUGANG_UNGUELTIG` |
| Worker-Anmeldeprüfung funktioniert | `POST /handwerker/link-versenden` ohne Token → `NICHT_ANGEMELDET` |
| 19 Worker-Tests grün | `node --test test/zulagen.test.js test/abdruck.test.js` |
| Firestore eur3, kein PITR, kein Löschschutz | Firestore Admin API, `databases.list` |
| Dienstkonto-Schlüssel nie eingecheckt | `git log --all -- 'BerisaBauApp/.secrets/*'` leer |
| 37 Leistungen, 7 DIN-Verweise im Angebotswerkzeug | `leistungen.json` ausgewertet |
| App hat 0 Tests | kein Testrunner in `package.json`, keine `*.test.js` unter `src/` |
