# Datenschutz in WerkBuch

**Stand:** 09.09.2026 · gilt für die App unter <https://daiworld450.github.io/WerkBuch/>

Dieses Dokument hat zwei Aufgaben: Es hält fest, welche Daten WerkBuch
verarbeitet und wo sie liegen — und es benennt ungeschminkt, was noch offen
ist. Alles Geprüfte ist als geprüft gekennzeichnet, alles Ungeprüfte auch.

---

## 1. Welche Daten verarbeitet WerkBuch

| Datenart | Wo | Wer sieht sie |
|---|---|---|
| Konto (Name, E-Mail, Telefon, Rolle) | Firebase Authentication + Firestore `users` | Inhaber; ein Mitarbeiter sieht die Namen der Kollegen |
| Baustelle (Bezeichnung, Adresse, Status, Zeitraum) | Firestore `baustellen` | Inhaber, zugewiesene Mitarbeiter |
| **Kundenkontakt** (Name, Telefonnummer) | Firestore `baustellen` | Inhaber, zugewiesene Mitarbeiter |
| Baustellenfotos | Cloudinary (Datei), Firestore (Adresse, Phase, Notiz, Datum) | Inhaber, zugewiesene Mitarbeiter |
| Maße, Material, Kosten, Stunden | Firestore, je Baustelle | Preise und Kosten: **nur Inhaber** |
| Personen mit internem Stundensatz | Firestore `personen` | jeder Angemeldete (siehe 4.2) |
| Angebote (Positionen, Beträge) | Firestore, je Baustelle | nur Inhaber |
| Nachträge | Firestore, je Baustelle | nur Inhaber |
| **Freigabe durch den Kunden** | Firestore `freigabeLinks`, `freigabeEntscheidungen` | wer den Link hat (siehe 3) |
| Kalendertermine | Firestore `termine` | Inhaber; einzelne Termine auf ausdrückliche Freigabe auch Mitarbeiter |
| Dokumente (beliebige Dateien) | Cloudinary + Firestore | nur Inhaber |

**Nicht verarbeitet:** keine Standortdaten, keine Zahlungsdaten, keine
Gesundheitsdaten, kein Tracking, keine Werbe-Kennungen, keine Analyse-Werkzeuge.

---

## 2. Wo die Daten liegen

| Dienst | Zweck | Ort | Geprüft |
|---|---|---|---|
| **Firestore** (Google) | Datenbank | **eur3 — Europa** (Belgien/Niederlande) | ✅ am 08.09.2026 über die Firestore-Admin-Schnittstelle |
| **Firebase Authentication** (Google) | Anmeldung | Google-Rechenzentren, auch außerhalb der EU | ⚠️ Standardverhalten von Firebase Auth, nicht auf EU begrenzbar |
| **Cloudinary** | Fotos, PDFs, Dokumente | **ungeklärt** | ⚠️ siehe 5.1 |
| **GitHub Pages** | Auslieferung der App | weltweit | Es werden dort keine Kundendaten gespeichert, nur die App selbst |

Google und Cloudinary sind beide nach dem EU-US Data Privacy Framework
zertifiziert; für beide sind Auftragsverarbeitungsverträge über die jeweiligen
Nutzungsbedingungen einbezogen. **Beides ist noch nicht dokumentiert
abgeschlossen** — siehe 5.2.

---

## 3. Der Kundenweg — die einzige Stelle ohne Anmeldung

Ein Kunde bekommt einen Link (`…/?f=<32-stelliger Schlüssel>`) und kann darüber
**genau einen Nachtrag** ansehen und freigeben. Wichtige Eigenschaften, alle am
08.09.2026 gegen die Live-Datenbank geprüft:

- Er sieht **ausschließlich** den eingefrorenen Inhalt des Link-Dokuments —
  keinen Zugriff auf die Baustelle, keine anderen Kunden, keine Preise anderer
  Vorgänge.
- Die Sammlung lässt sich **nicht auflisten**. Ohne Schlüssel findet niemand
  etwas. Der Schlüssel stammt aus einer kryptografischen Zufallsquelle,
  57 Zeichen Alphabet, 32 Stellen.
- Gespeichert wird von seiner Entscheidung: **Ergebnis, Serverzeitpunkt, der
  angezeigte Text im Wortlaut, die Prüfsumme des Standes und — freiwillig —
  ein Name.** Keine IP-Adresse, kein Browser-Kennzeichen, kein Gerät.
- Der Link läuft nach **30 Tagen** ab und lässt sich jederzeit zurückziehen.
- Rechtsgrundlage: Durchführung des Vertrags, Art. 6 Abs. 1 lit. b DSGVO.
  Dieser Hinweis steht auf der Freigabeseite selbst.

Die Entscheidung ist **unveränderlich** — auch für den Betrieb. Das ist der
Zweck: ein Nachweis, den niemand nachträglich anfassen kann.

---

## 4. Löschkonzept

### 4.1 Was wann gelöscht wird

| Daten | Aufbewahrung | Warum |
|---|---|---|
| Freigabe-Links | 30 Tage Gültigkeit; Löschen jederzeit möglich | Zugangsdaten, kein Beleg |
| **Freigabe-Entscheidungen** | **10 Jahre** | Nachweis über eine Vergütungsvereinbarung; § 147 AO / § 257 HGB |
| Angebote, Nachträge, Kalkulation | **10 Jahre** | Buchungsbelege bzw. Grundlage dafür |
| Baustellenfotos | bis zur Löschung der Baustelle, längstens 3 Jahre nach Abschluss | Gewährleistungsnachweis (Mängelansprüche: 5 Jahre bei Bauwerken, hier bewusst kürzer angesetzt, weil die Fotos keine Abnahme ersetzen) |
| Kundenkontakt (Name, Telefon) | mit der Baustelle | reine Kontaktinformation |
| Stunden | **10 Jahre** | Lohnunterlagen |
| Kalendertermine | 2 Jahre | rein organisatorisch |
| Konten ausgeschiedener Mitarbeiter | unverzüglich nach Austritt | kein Zweck mehr |

### 4.2 Wie gelöscht wird

- **Baustelle löschen** entfernt heute das Hauptdokument. Die Unterordner
  (Fotos, Stunden, Material …) und die Cloudinary-Dateien bleiben liegen.
  ⚠️ **Offen** — siehe 5.3.
- **Einzelne Fotos** löscht der Inhaber im Fotobetrachter. Auch hier bleibt die
  Datei bei Cloudinary bestehen. ⚠️ Offen.
- **Konto löschen**: über die Firebase-Konsole, Bereich Authentication.
- **Sicherungen** (`~/WerkBuch-Sicherungen/`) werden nach 30 Ständen
  automatisch ausgedünnt. Eine Löschung wirkt sich damit spätestens nach
  30 Tagen auch auf die Sicherungen aus.

### 4.3 Auskunft an Betroffene

Fragt ein Kunde nach seinen Daten, liefert
`python3 BerisaBauApp/tools/sicherung.py` einen vollständigen, lesbaren
JSON-Auszug der Datenbank; die Baustelle des Kunden lässt sich darin über
`kundeName` finden.

---

## 5. Was offen ist

### 5.1 Cloudinary-Region — die wichtigste offene Frage

**Ungeklärt, wo die Fotos physisch liegen.** Der Gratis-Tarif von Cloudinary
liegt standardmäßig in den USA; das Auslieferungsnetz antwortet zwar aus
Frankfurt (geprüft am 09.09.2026), das sagt aber nichts über den Speicherort.

**Zu tun:** Im Cloudinary-Konto unter *Settings → Account* die Region ablesen.
Steht dort nicht Europa, ist zu entscheiden: Konto in der EU-Region neu anlegen
und die Dateien umziehen, oder die Verarbeitung in den USA auf Grundlage des
EU-US Data Privacy Framework dokumentieren.

### 5.2 Zwei fehlende Unterlagen

- **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30 DSGVO). Dieses
  Dokument enthält den Inhalt, es fehlt die formale Fassung.
- **Auftragsverarbeitung** mit Google und Cloudinary: In beiden Fällen über die
  Nutzungsbedingungen einbezogen, aber nicht abgelegt. Beide bieten die
  Vereinbarung als PDF an.

### 5.3 Löschen greift nicht tief genug

Beim Löschen einer Baustelle bleiben Unterordner und Cloudinary-Dateien
zurück. Das ist kein Datenleck — niemand kommt an die Unterordner einer nicht
mehr existierenden Baustelle heran, weil die Regeln über das Hauptdokument
prüfen und dieses fehlt. Aber es ist auch keine Löschung.

**Zu tun:** Ein Löschlauf, der Unterordner und Cloudinary-Dateien mitnimmt.
Für Cloudinary braucht es dafür den API-Schlüssel des Kontos (Löschen geht
nicht mit dem unsignierten Upload-Preset).

### 5.4 Unsignierter Upload

Cloud-Name und Upload-Preset stehen im ausgelieferten JavaScript. Wer sie
ausliest, kann auf das Konto von Berisa Bau hochladen. Das ist kein
Datenschutz-, sondern ein Missbrauchsproblem — und es lässt sich nur mit einem
signierten Upload lösen, der einen Server voraussetzt.

Der Cloudflare-Worker des Projekts (`worker/`) läuft bereits und könnte das
Signieren übernehmen. Dafür fehlt eine Anmeldung an Cloudflare, die nur der
Inhaber selbst vornehmen kann.

### 5.5 Firebase Authentication außerhalb der EU

Die Anmeldedaten (E-Mail, Passwort-Hash) verarbeitet Google in eigenen
Rechenzentren, ohne Wahlmöglichkeit der Region. Betroffen sind ausschließlich
die **Konten des Betriebs** — kein Kunde legt hier ein Konto an. Das ist
hinnehmbar und gehört ins Verarbeitungsverzeichnis, nicht in die
Problemliste.

---

## 6. Was bereits richtig gelöst ist

- **Standortdaten in Fotos werden entfernt.** Das Verkleinern streift alle
  Metadaten ab; das Aufnahmedatum wird vorher ausgelesen und getrennt
  gespeichert. Ein Kundenfoto trägt damit keine Koordinaten mit sich.
- **Preise und Kosten sind vor Mitarbeitern verborgen** — durchgesetzt in den
  Sicherheitsregeln, nicht nur in der Oberfläche.
- **Der Kunde bekommt keinen Zugriff auf die Baustelle**, nur auf eine
  eingefrorene Kopie des einen Vorgangs.
- **Nachweise sind unveränderlich**, auch für den Betrieb.
- **Die App ist von Suchmaschinen ausgenommen** (`noindex, nofollow`).
- **Tägliche Sicherung** auf den eigenen Mac, 30 Stände.
- Die Datenbank steht in **Europa**.

---

## 7. Reihenfolge der offenen Punkte

1. **Cloudinary-Region ablesen** (5.1) — hängt alles Weitere daran, Aufwand: 2 Minuten
2. **Löschschutz der Datenbank einschalten** — Firebase-Konsole → Firestore →
   Einstellungen. Ein Schalter, verhindert das versehentliche Löschen der
   gesamten Datenbank.
3. **Löschlauf bauen** (5.3)
4. **Verarbeitungsverzeichnis und AV-Verträge ablegen** (5.2)
5. **Signierter Upload** (5.4) — braucht die Cloudflare-Anmeldung
