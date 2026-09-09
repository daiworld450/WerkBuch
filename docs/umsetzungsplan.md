# Umsetzungsplan WerkBuch

**Stand:** 08.09.2026 · **Grundlage:** `docs/bestandsaufnahme.md`
**Status: Entwurf — noch nichts umgesetzt, kein Code geändert.**

---

## Der Leitgedanke

Das Ziel ist, für einen Kleinbetrieb besser zu sein als plancraft, Craftnote und
ToolTime — nicht durch mehr Funktionen, sondern durch die Auftragsabwicklung.
Der Ist-Zustand spricht dafür:

- **Schritt 5 (Kalender & Mehrbenutzer) ist im Wesentlichen fertig.**
- **Schritt 1 (Zulagen mit Kundenfreigabe) ist zur schwierigeren Hälfte gebaut,
  getestet und live** — es fehlt die Kundenseite, nicht die Beweislogik.
- **Schritt 2 (Angebote) existiert bereits im Betrieb**, in `angebote-werkzeug/`.

Deshalb weicht dieser Plan von der vorgegebenen Reihenfolge ab. Die Begründung
steht bei jeder Stufe.

---

## Stufe 0 — Absichern, bevor irgendetwas gebaut wird

**Warum zuerst:** Ab Schritt 1 stehen in der Datenbank Dokumente, auf die sich
ein Kunde beruft. Was dann verloren geht oder unbemerkt falsch rechnet, ist ein
kaufmännisches Problem, kein technisches. Diese Stufe kostet wenig und ist die
Voraussetzung dafür, dass alles Weitere verantwortbar ist.

| # | Aufgabe | Aufwand |
|---|---|---|
| 0.1 | Firestore-Löschschutz einschalten, täglichen Export einrichten | 0,3 Tage |
| 0.2 | Cloudinary: Region klären; Upload auf signiert umstellen; Auslieferung von Kundenfotos absichern | 0,5 Tage |
| 0.3 | Testgerüst für die App (Node-Testrunner wie im Worker, kein Jest-Umbau), Tests für `kalkulation.js` nachziehen | 0,4 Tage |
| 0.4 | Bau prüft, bevor er veröffentlicht: Tests im GitHub-Actions-Lauf | 0,2 Tage |
| 0.5 | Arbeitsstand und Veröffentlichungs-Repo koppeln, damit nichts mehr von Hand kopiert wird | 0,3 Tage |
| 0.6 | Tote Regeln aufräumen: `istBesitzer()` auf `info@berisabau.de`, `istKundeVon()` entfernen oder neu binden | 0,2 Tage |
| 0.7 | Versionsanzeige in der App, damit „alte Fassung im Cache" sofort erkennbar ist | 0,1 Tage |

**Summe: rund 2 Tage.** Branch `stufe-0-absicherung`.

> 0.2 kann an der Cloudinary-Region hängenbleiben. Liegt das Konto in den USA,
> ist ein Umzug oder ein Wechsel des Ablageorts nötig — das wäre eine eigene
> Entscheidung und ist in den 0,5 Tagen **nicht** enthalten.

---

## Stufe 1 — Zulagen & Nachträge mit Kundenfreigabe *(Priorität 1)*

**Das ist das Alleinstellungsmerkmal.** Und es ist billiger als gedacht, weil der
gesamte Beweisapparat bereits läuft: Magic-Link, Code-Verifikation, Freigabe mit
Zeitstempel und IP, Prüfsumme über den angezeigten Stand, Schutz gegen
Doppelklick, schreibgesperrtes Protokoll, Rechnung in ganzen Cent, 19 grüne
Tests.

Was fehlt, ist die **fachliche Erweiterung** — heute wird ein ganzes Angebot
freigegeben, künftig ein **einzelner Nachtrag** — und die **Kundenseite**.

| # | Aufgabe | Aufwand |
|---|---|---|
| 1.1 | Firestore-Zugriff des Workers reparieren (vermutlich fehlendes Dienstkonto-Geheimnis) | 0,2 Tage |
| 1.2 | Entität `nachtraege` je Baustelle: Titel, Beschreibung, Menge, Einheit, Einzelpreis, netto/brutto, 19 % USt, Fotos, Statusmodell offen → gesendet → freigegeben/abgelehnt → abgerechnet | 0,5 Tage |
| 1.3 | Worker: Endpunkte `nachtrag-ansehen`, `-freigeben`, `-ablehnen`; Wiederverwendung von Magic-Link, Verifikation, Transaktion und Protokoll | 1,0 Tage |
| 1.4 | Revisionssicherheit: **angezeigter Text im Wortlaut** wird mitgespeichert, nicht nur ein Verweis — sonst ist der Nachweis wertlos, sobald sich eine Vorlage ändert | 0,3 Tage |
| 1.5 | Freigabeseite für den Kunden: mobil, ohne Login, mit Fotos, ein klarer Knopf | 0,8 Tage |
| 1.6 | Bildschirm in WerkBuch: Nachtrag anlegen, Fotos anhängen, Link erzeugen, Stand sehen | 0,8 Tage |
| 1.7 | Freigegebene Nachträge fließen in die Auftragssumme und in die Kalkulation | 0,3 Tage |
| 1.8 | **Tests: Freigabelogik und Preisrechnung** — Pflicht laut Vorgabe | 0,6 Tage |

**Summe: rund 4,5 Tage.** Branch `stufe-1-nachtraege`.

**Migration:** rein additiv, eine neue Sammlung. Rückbau = Sammlung und Regeln
entfernen; bestehende Baustellen bleiben unberührt.

---

## Stufe 2 — Kundenportal *(Schritt 3)*

**Warum direkt danach:** Die Freigabeseite aus 1.5 *ist* schon das halbe Portal.
Angebot, Status, Termine, freigegebene Nachträge und Fotoverlauf auf derselben
Seite zu zeigen, kostet vergleichsweise wenig.

| # | Aufgabe | Aufwand |
|---|---|---|
| 2.1 | Dauerlink je Baustelle, Portalseite mit Angebot, Status, Terminen, Nachträgen, Fotoverlauf | 1,0 Tage |
| 2.2 | Steuerung, **welche** Fotos der Kunde sieht — nicht jedes Baustellenfoto gehört ins Portal | 0,4 Tage |
| 2.3 | `noindex`, kein Suchindex, Link zurückziehbar | 0,2 Tage |

**Summe: rund 1,6 Tage.** Branch `stufe-2-portal`.

> **Zu entscheiden:** Am 05.09. wurde der Kundenteil ausdrücklich ausgebaut
> („der Kunde soll mit der App nichts zu tun haben"). Schritt 3 dreht das um.
> Das ist möglich und technisch günstig — aber es sollte eine bewusste
> Kehrtwende sein, keine stillschweigende.

---

## Stufe 3 — Baustellenfotos *(Schritt 4)*

**Warum hier:** Die Fotos sind die Grundlage für den Projektbericht, für das
Portal aus Stufe 2 und für die Social-Media-Pipeline. Und die Offline-Warteschlange
ist die einzige Stelle, an der die App auf der Baustelle heute wirklich versagt.

| # | Aufgabe | Aufwand |
|---|---|---|
| 3.1 | Aufnahmedatum erhalten (heute geht es beim Verkleinern verloren), Standortdaten weiterhin entfernen — beides ausdrücklich statt zufällig | 0,4 Tage |
| 3.2 | Mehrere Fotos auf einmal auswählen | 0,3 Tage |
| 3.3 | **Offline-Warteschlange**: Foto lokal ablegen, bei Netz automatisch nachreichen, Stand sichtbar | 1,0 Tage |
| 3.4 | **Projektbericht als PDF**: Chronologie mit Fotos je Bauphase — das ist die Funktion, mit der Craftnote wirbt | 1,0 Tage |
| 3.5 | Saubere Schnittstelle für die Social-Media-Pipeline (feste Ordnerstruktur, abfragbare Liste) | 0,4 Tage |

**Summe: rund 3,1 Tage.** Branch `stufe-3-fotos`.

---

## Stufe 4 — Angebotsmodul *(Schritt 2)* — **Entscheidung nötig**

Angebote gibt es im Betrieb bereits: `angebote-werkzeug/`, 4.032 Zeilen, mit
37 Leistungen, 5 Gewerken, DIN-Verweisen in den Langtexten, PDF-Schreiber,
Kalkulation und Widerrufsbelehrung. Rechnungen liegen in `zentrale/`.

Schritt 2 wie ausgeschrieben würde ein **drittes** Angebotssystem bauen. Zwei
Systeme mit eigenem Nummernkreis und eigenem Preiskatalog sind schlimmer als
eines, das an der falschen Stelle liegt.

### Weg A — anbinden *(Empfehlung)*

WerkBuch bleibt die Baustellen-App und ruft das vorhandene Werkzeug auf.
Leistungskatalog, Preise, DIN-Texte und Nummernkreis bleiben an **einer** Stelle.

| # | Aufgabe | Aufwand |
|---|---|---|
| A.1 | Das Angebotswerkzeug bekommt eine kleine lokale Schnittstelle | 0,5 Tage |
| A.2 | WerkBuch: Angebot aus einer Baustelle heraus anstoßen, Positionen wählen, PDF zurückbekommen | 1,0 Tage |
| A.3 | Konditionen als Textbausteine (100 € Vor-Ort-Pauschale, bei Auftrag erlassen · 15 % Anzahlung · 2–4 Wochen Vorlauf) an einer Stelle pflegen | 0,3 Tage |

**Summe: rund 1,8 Tage.** *Grenze:* Das Angebot entsteht dann auf dem Mac, nicht
auf dem Handy an der Baustelle.

### Weg B — in WerkBuch neu bauen

Alles wandert in die App, das Python-Werkzeug wird abgelöst.

| # | Aufgabe | Aufwand |
|---|---|---|
| B.1 | Positionsmodell, Leistungskatalog, Gewerkevorlagen übernehmen | 1,5 Tage |
| B.2 | PDF-Erzeugung mit kontrollierten Seitenumbrüchen — ohne bezahlten Dienst der aufwendigste Teil | 2,0 Tage |
| B.3 | Konditionen, Widerrufsbelehrung, Briefkopf, 19 % USt | 0,8 Tage |
| B.4 | Umzug der bestehenden Angebote, Nummernkreis zusammenführen | 0,8 Tage |
| B.5 | Tests der Preisrechnung | 0,5 Tage |

**Summe: rund 5,6 Tage.** *Gewinn:* Angebot direkt beim Kunden auf dem Handy.

---

## Stufe 5 — Kalender & Mehrbenutzer *(Schritt 5)* — Restarbeit

Der größte Teil läuft bereits: Monats-, Wochen- und Tagesansicht, Termine frei
anlegbar, Rollen Inhaber und Monteur, Zuweisung je Baustelle, durchgesetzt in den
Sicherheitsregeln.

| # | Aufgabe | Aufwand |
|---|---|---|
| 5.1 | Eigene Einsatzansicht für den Monteur über alle Baustellen hinweg | 0,4 Tage |
| 5.2 | Feld `sichtbarFuer[]` am Termin, damit Baustellentermine geteilt werden können, private nicht | 0,3 Tage |

**Summe: rund 0,7 Tage.** Branch `stufe-5-einsatzplan`.

---

## Querschnitt — Pflichten aus der Vorgabe

Diese Punkte gehören zu keiner Stufe allein, sondern werden in jeder mitgeführt:

| Pflicht | Wo sie einlöst wird | Zusatzaufwand |
|---|---|---|
| **DSGVO**: Daten und Fotos in der EU | Stufe 0.2 (Cloudinary-Region) — Firestore steht bereits in Europa | im Plan enthalten |
| **DSGVO**: Löschkonzept, Auftragsverarbeitung dokumentiert | eigenes Arbeitspaket | 0,8 Tage |
| **Rechnungsdaten unveränderbar** | Freigaben und Protokoll sind es bereits; Rechnungen liegen in `zentrale/` | siehe Anmerkung unten |
| **E-Rechnung vorbereiten** | betrifft `zentrale/`, nicht WerkBuch | 1,0 Tage, dort |
| **Mobil zuerst** | in jeder Stufe, geprüft auf dem Handy | im Plan enthalten |
| **Offline-Toleranz beim Fotoupload** | Stufe 3.3 | im Plan enthalten |
| **Je Schritt ein Branch, kleine Commits, Up- und Down-Migration** | durchgehend | im Plan enthalten |

> **Zur unveränderlichen Rechnungsablage und zur E-Rechnung:** Beides gehört zur
> Rechnung, und Rechnungen entstehen in `zentrale/`, nicht in WerkBuch. Es hier
> zu bauen hieße, das dritte System zu errichten, vor dem Stufe 4 warnt. Der
> Vorschlag ist deshalb, beides in `zentrale/` zu erledigen — als eigener
> Auftrag, nicht in diesem Plan versteckt.

---

## Reihenfolge und Gesamtaufwand

```
Stufe 0  Absichern                    2,0 Tage   ← zuerst, ohne Ausnahme
Stufe 1  Nachträge mit Freigabe       4,5 Tage   ← das Alleinstellungsmerkmal
Stufe 2  Kundenportal                 1,6 Tage   ← Entscheidung nötig
Stufe 3  Baustellenfotos              3,1 Tage
Stufe 4  Angebot  Weg A               1,8 Tage   ← Empfehlung
                  Weg B               5,6 Tage
Stufe 5  Kalender-Rest                0,7 Tage
         DSGVO-Paket                  0,8 Tage
```

**Mit Weg A: rund 14,5 Tage. Mit Weg B: rund 18,5 Tage.**

Das sind Arbeitstage, keine Kalendertage, und sie enthalten Tests. Erfahrungsgemäß
liegt der wahre Wert bei zwei Dritteln bis dem Anderthalbfachen — die Cloudinary-Frage
in Stufe 0.2 ist der wahrscheinlichste Ausreißer nach oben.

**Nach Stufe 1 kann WerkBuch etwas, das plancraft, Craftnote und ToolTime in
dieser Form nicht bieten:** einen Nachtrag, den der Kunde ohne App und ohne Login
per Klick freigibt, beweissicher protokolliert, und der automatisch in die
Auftragssumme läuft. Das ist nach Stufe 0 + 1 erreicht — rund 6,5 Tage.

---

## Was vor dem Bauen entschieden werden muss

1. **Angebot: Weg A oder Weg B?** Empfehlung: **A** — anbinden statt neu bauen.
   Ein Preiskatalog, ein Nummernkreis.
2. **Kundenportal wirklich zurück?** Das dreht die Entscheidung vom 05.09. um.
3. **Wie kommt der Freigabe-Link zum Kunden?** Per E-Mail über den bereits
   eingebauten Versanddienst — dann muss geklärt werden, ob dessen Zugang noch
   gültig ist — oder als Link zum Selbstversenden per WhatsApp. Letzteres ist
   sofort machbar und kostet nichts.
4. **Nachtrag: nur Bauleistung, oder auch ein Katalog kleiner Zusatzleistungen?**
   Der vorhandene Zulagenkatalog ist für Portal-Kleinbeträge gebaut, nicht für
   Bauleistungen. Für den Anfang genügt der freie Nachtrag.
5. **Cloudinary-Region** — kann die Reihenfolge in Stufe 0 verändern.

---

**Es wurde noch kein Code geändert.** Der nächste Schritt ist deine Entscheidung
zu den fünf Punkten oben, danach Branch `stufe-0-absicherung`.
