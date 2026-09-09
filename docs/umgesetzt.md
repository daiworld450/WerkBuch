# Was gebaut wurde

**09.09.2026** · Live unter <https://daiworld450.github.io/WerkBuch/>
Grundlage: `bestandsaufnahme.md` und `umsetzungsplan.md`.

Alles hier ist gebaut, geprüft und veröffentlicht. Was nicht funktioniert oder
offen blieb, steht in Abschnitt 8 — nicht versteckt zwischen den Zeilen.

---

## 1. Nachträge mit Kundenfreigabe — das Alleinstellungsmerkmal

Der Ablauf: Auf der Baustelle kommt etwas dazu. Der Inhaber schreibt es auf,
hängt ein Foto an und erzeugt einen Link. Der Kunde öffnet ihn — ohne App, ohne
Anmeldung, ohne Passwort — sieht Beschreibung, Foto und Betrag und entscheidet.

**Was den Nachweis trägt** (nicht die Oberfläche, sondern die
Firestore-Sicherheitsregeln):

| Schutz | Wie |
|---|---|
| Der gezeigte Stand ist eingefroren | Beim Erzeugen des Links wird eine Kopie abgelegt und mit einer SHA-256-Prüfsumme versehen. Danach ist sie unveränderlich — auch für den Betrieb. |
| Freigegeben wird genau das Gezeigte | Die Regel vergleicht die mitgeschickte Prüfsumme mit der gespeicherten. Weicht ein Cent ab, wird abgewiesen. |
| Der Zeitpunkt ist echt | `request.time` vom Server. Eine zurückgestellte Uhr auf dem Handy ändert nichts. |
| Der Wortlaut ist mitgespeichert | Nicht ein Verweis auf eine Vorlage, sondern der Text selbst. Ändert sich die Vorlage später, bleibt der Beleg wie er war. |
| Genau eine Entscheidung | Das Dokument trägt den Schlüssel als Kennung; ein zweiter Klick trifft auf ein vorhandenes Dokument und wird abgewiesen. |
| Unveränderlich | `allow update, delete: if false` — für beide Seiten, ohne Ausnahme. |
| Kein Stöbern | Auflisten ist gesperrt. Ohne den 32-stelligen Schlüssel findet niemand etwas. |

**Zehn Proben gegen die Live-Datenbank**, alle bestanden: Sammlung auflisten,
fremder Schlüssel, falsche Prüfsumme, selbst gesetzte Uhrzeit, fehlender
Wortlaut, echte Freigabe, Doppelklick, nachträgliches Ändern, nachträgliches
Löschen, Ablauf des Links.

Der ganze Weg wurde einmal von Hand durchgespielt — von der Seite bis in die
Datenbank. Statusmodell: offen → gesendet → freigegeben/abgelehnt → abgerechnet.
Freigegebene Nachträge fließen in die Kalkulation, offene nicht.

---

## 2. Angebote — nicht mehr Teil der App (09.09.)

Kurzzeitig gab es hier eine Angebotserstellung mit Positionen, Vorlagen und
DIN-Texten. Der Inhaber hat sie noch am selben Tag gestrichen, danach auch die
reine Ablage: **Angebote gehören ins Angebotswerkzeug auf dem Mac**
(`angebote-werkzeug/`). Dort liegen Leistungskatalog, Preise, DIN-Texte und der
Nummernkreis — an einer Stelle.

WerkBuch ist damit wieder das, was es sein soll: die Baustellen-App.

## 3. Baustellenfotos

- **Aufnahmedatum bleibt erhalten.** Bisher entfernte das Verkleinern alle
  Metadaten und angezeigt wurde der Uploadzeitpunkt — wer abends übertrug,
  hatte den falschen Tag an der Bauphase stehen. Jetzt wird das EXIF-Datum
  vorher ausgelesen und getrennt gespeichert. **Der Standort bleibt draußen**,
  jetzt absichtlich statt zufällig.
- **Mehrere Fotos auf einmal** (bis 20).
- **Offline-Warteschlange.** Fotos gehen erst in eine Schlange auf dem Gerät
  und von dort ins Netz, sobald wieder Empfang ist — auch nach einem Neustart
  der App. Harte Grenze mit ehrlicher Meldung statt stillem Verlust. Ein
  hakendes Foto blockiert die anderen nicht; nach fünf Versuchen ruht es.

---

## 4. Projektbericht

Die ganze Sanierung in einem Dokument: Fotos nach Bauabschnitt mit Datum,
Eckdaten, freigegebene Nachträge. Der Browser druckt es nach PDF.

Stunden, Einkaufspreise und Kalkulation bleiben draußen — der Bericht ist zum
Weitergeben gedacht. Kundentexte werden maskiert: Ein Baustellenname mit
spitzen Klammern kann das Dokument nicht zerlegen.

---

## 5. Kalender

Termine lassen sich einzeln für die Mitarbeiter einer Baustelle freigeben.
Standard ist aus — im selben Kalender stehen auch Büro- und Privattermine.

---

## 6. Absicherung

| Was | Zustand |
|---|---|
| **Tägliche Sicherung** der Datenbank auf den Mac | läuft, 20:15 Uhr, 30 Stände (`~/WerkBuch-Sicherungen/`) |
| **Tests** | 107 Prüfungen, alle grün — Preisrechnung, Freigabelogik, Warteschlange, Bericht, Angebot, Nachkalkulation |
| **Der Bau prüft vor dem Veröffentlichen** | `npm test` läuft in GitHub Actions; schlägt ein Test fehl, bleibt der alte Stand live |
| **Syntaxprüfung aller Quelldateien** | fängt ein falsches Anführungszeichen in einer Sekunde statt nach zwei Minuten Bauzeit |
| **Veröffentlichen in einem Schritt** | `tools/veroeffentlichen.sh` — Schluss mit dem Kopieren von Hand |
| **Versionsanzeige** | unten in der Baustellenliste; Tippen lädt neu (gegen den Zwischenspeicher-Ärger vom 05.09.) |
| **noindex** | die ganze App ist von Suchmaschinen ausgenommen |

**Zwei tote Regeln repariert**, die still gewirkt hätten:
`istKundeVon()` prüfte ein Feld, das niemand mehr schreibt — entfernt.
`istBesitzer()` prüfte `berisabau@gmail.com`, ein am 05.09. gelöschtes Konto;
der Zulagenkatalog war damit für **alle** schreibgesperrt, ohne dass es auffiel.

---

## 7. Datenschutz

`docs/datenschutz.md` hält fest, was verarbeitet wird, wo es liegt und wie lange
es bleibt — mit Fristen je Datenart. Geprüft: Die Datenbank steht in **Europa**
(eur3). Die Freigabeseite speichert Ergebnis, Serverzeitpunkt, Wortlaut und
Prüfsumme — **keine IP-Adresse, kein Browser-Kennzeichen**.

---

## 8. Was offen bleibt

Ehrlich und vollständig:

| Punkt | Warum offen | Wer kann es |
|---|---|---|
| **Löschschutz der Datenbank** | Das Dienstkonto darf diese Einstellung nicht ändern (403). IAM-Rechte dafür zu erweitern wäre ein größerer Eingriff, als der Nutzen rechtfertigt. | Firebase-Konsole → Firestore → Einstellungen. Ein Schalter. |
| **Cloudinary-Region** | Steht nur in den Kontoeinstellungen. Das Auslieferungsnetz antwortet aus Frankfurt, das sagt nichts über den Speicherort. | Cloudinary → Settings → Account, ablesen. 2 Minuten. |
| **Signierter Upload** | Cloud-Name und Preset stehen im ausgelieferten JavaScript; wer sie ausliest, kann auf das Konto hochladen. Zum Signieren braucht es den Worker — und dafür eine Cloudflare-Anmeldung. | `npx wrangler login` im Ordner `worker/`. |
| **Löschen greift nicht tief** | Beim Löschen einer Baustelle bleiben Unterordner und Cloudinary-Dateien liegen. Kein Datenleck (ohne Hauptdokument kommt niemand an die Unterordner), aber auch keine Löschung. | Ein Löschlauf; für Cloudinary braucht er den API-Schlüssel des Kontos. |
| **E-Rechnung** | Rechnungen entstehen in `zentrale/`, nicht in WerkBuch. Sie hier zu bauen hieße, ein drittes System zu errichten. | Eigener Auftrag in `zentrale/`. |
| **Der Cloudflare-Worker** | Läuft, aber sein Firestore-Zugriff scheitert — vermutlich fehlt das Dienstkonto-Geheimnis. Für die Kundenfreigabe wird er nicht gebraucht; sie läuft ohne ihn. | `npx wrangler tail` zur Diagnose. |

---

## 9. Was die App jetzt von dir braucht

1. **Personen anlegen** — dich und Seba mit dem Stundensatz, den euch die
   Stunde *kostet*. Ohne das kann die Kalkulation nicht rechnen. (Derzeit sind
   0 Personen angelegt.)
2. **Bei einer abgeschlossenen Baustelle den Umsatz eintragen** — nimm eine,
   deren Zahlen du im Kopf hast. Dann siehst du sofort, ob die Rechnung zu
   deinem Bauchgefühl passt.
3. **Einen Nachtrag ausprobieren**, am besten an einer echten Baustelle: Link
   erzeugen, an dich selbst per WhatsApp schicken, freigeben. Danach steht der
   Nachweis in der App.
