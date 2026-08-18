# Modul-Spezifikation: Digitales Angebot & Zulagen-Freigabe
**Projekt:** BerisaBauApp / BauVision
**Modulname (Arbeitstitel):** `offers` + `addons`
**Version:** 1.0 — Entwurf
**Zweck des Dokuments:** vollständige Build-Grundlage für Claude Code. Alles, was hier steht, ist umsetzbar ohne Rückfrage. Alles, was noch entschieden werden muss, steht gesammelt in Kapitel 19.
---
## 1. Ziel & Abgrenzung
### 1.1 Was das Modul leistet
1. Der Handwerker erstellt ein Angebot digital (Positionen, Mengen, Preise, Bilder aus BauVision).
2. Der Kunde bekommt einen Link, sieht das Angebot mobil, ohne Login, ohne App-Installation.
3. Der Kunde kann **optionale Zulagen** dazuwählen (z. B. weitere Visualisierungen, weitere Räume, Express).
4. Jede Kostenerhöhung — egal ob vom Handwerker angestoßen (Nachtrag) oder vom Kunden gewünscht (Zulage) — wird **einzeln, sichtbar und per Klick freigegeben**.
5. Jede Freigabe wird beweissicher protokolliert (wer, wann, welcher Dokumentstand, welcher Betrag).
6. Erst nach Freigabe (und ggf. Zahlung) wird die Leistung ausgelöst — bei Visualisierungen automatisch, bei Bauleistungen als Auftrag.
### 1.2 Was das Modul **nicht** leistet
- Keine Zeiterfassung, keine Rechnungsstellung, keine Buchhaltung (→ separates Modul / SteuerFlow-Schnittstelle).
- Keine Bildgenerierung selbst — das Modul ruft BauVision auf und wartet auf das Ergebnis.
- Keine qualifizierte elektronische Signatur (nicht nötig, siehe Kapitel 13).
---
## 2. Grundprinzip: zwei getrennte Spuren
Das ist die wichtigste Entwurfsentscheidung des ganzen Moduls. Sie sauber zu halten, verhindert später Chaos in Recht, Buchhaltung und Support.
| | **Spur A — Bauleistung** | **Spur B — Portal-Zusatzleistung** |
|---|---|---|
| Beispiel | Bad sanieren, Fliesen, Rohbau, Nachtrag „Estrich zusätzlich" | 4. Visualisierung, weiterer Raum, Express-Rendering |
| Rechtsnatur | Werkvertrag / Verbraucherbauvertrag | digitale Dienstleistung, Kleinbetrag |
| Auslöser | Handwerker kalkuliert | Kunde klickt selbst |
| Betrag | vierstellig+ | ein- bis zweistellig |
| Freigabe | Klick + Textform-Bestätigung per E-Mail, ggf. Widerrufsfrist | Klick + Sofortzahlung, Leistung startet sofort |
| Preisfindung | individuell kalkuliert | Festpreis aus Katalog |
| Technischer Typ | `change_order` (Nachtrag) | `addon_order` (Zulage) |
**Regel:** Spur B darf niemals in dasselbe PDF wie Spur A. Sonst vermischen sich Widerrufsfristen, Steuersätze und Zahlungsziele in einem Dokument — genau der Fehler, der später Streit erzeugt.
---
## 3. Rollen & Zugriff
| Rolle | Zugang | Rechte |
|---|---|---|
| `owner` (Inhaber) | Login | alles, inkl. Preiskatalog, Margen, Löschung |
| `staff` (Mitarbeiter) | Login | Angebote erstellen/senden, Nachträge anlegen, keine Preiskatalog-Änderung |
| `customer` (Kunde) | Magic-Link, kein Passwort | eigenes Angebot ansehen, Zulagen wählen, freigeben, ablehnen, Kommentar schreiben |
| `system` | — | Jobs, Webhooks, Mails |
**Magic-Link-Regeln:**
- Token: 32 Byte zufällig, URL-sicher, in DB nur als SHA-256-Hash gespeichert.
- Gültigkeit: 30 Tage ab Versand, verlängerbar durch erneuten Versand (alter Token wird ungültig).
- Ein Token gehört zu **genau einem** Angebot und **einer** E-Mail-Adresse.
- Vor der ersten Freigabe: zusätzliche Verifikation über 6-stelligen Code per E-Mail oder SMS (gültig 15 Min., max. 5 Versuche). Ansehen darf man ohne Code, **freigeben nicht**.
- Kein Suchindex: `X-Robots-Tag: noindex`, `robots.txt` sperrt `/angebot/*`.
---
## 4. Datenmodell
PostgreSQL, Prisma. Alle Geldbeträge als **Integer in Cent**, niemals Float. Alle Zeitstempel `timestamptz` in UTC.
### 4.1 Kernentitäten
```
customer          id, name, email, phone, address, created_at
project           id, customer_id, title, type (bad|kueche|wohnraum|boden|sonstiges),
                  status, created_at
quote             id, project_id, number (BB-2026-0042), current_version_id,
                  status, valid_until, created_by, created_at
quote_version     id, quote_id, version_no, snapshot (jsonb), pdf_document_id,
                  content_hash (sha256), published_at, published_by
quote_item        id, quote_version_id, position_no, kind (leistung|zulage_optional),
                  title, description, qty (numeric 12,3), unit, unit_price_cents,
                  vat_rate (19|7|0), total_net_cents, is_optional (bool),
                  preselected (bool), addon_sku (nullable)
change_order      id, quote_id, number (BB-2026-0042-N1), reason, items (jsonb),
                  total_net_cents, total_gross_cents, status, requested_by,
                  pdf_document_id, content_hash, created_at
```
### 4.2 Zulagen (Spur B)
```
addon_catalog     sku (PK, z.B. VIS_EXTRA), name, description, unit_label,
                  price_cents, vat_rate, type (per_unit|per_room|flat|manual),
                  grants_credits (int, 0 = keine), max_qty_per_order,
                  requires_manual_approval (bool), active (bool), sort_order
addon_price_tier  id, sku, min_qty, max_qty, unit_price_cents      -- Staffelpreise
addon_order       id, project_id, sku, qty, unit_price_cents, total_gross_cents,
                  status, approval_id, payment_id, created_at
credit_ledger     id, project_id, delta (int), reason (paket|zulage|generierung|
                  storno|kulanz), ref_type, ref_id, balance_after, created_at
```
`credit_ledger` ist **append-only**. Der Kontostand wird nie in einem Feld gespeichert, sondern immer aus dem Ledger summiert (und in `balance_after` nur als Prüfwert mitgeführt). Das ist die einzige Bauweise, bei der man Monate später noch nachvollziehen kann, wohin ein Guthaben verschwunden ist.
### 4.3 Freigabe & Nachweis
```
approval          id, subject_type (quote_version|change_order|addon_order),
                  subject_id, document_hash, amount_gross_cents,
                  decision (accepted|declined),
                  actor_name, actor_email, verification_method (email_code|sms_code),
                  ip_address, user_agent, consent_texts (jsonb),
                  idempotency_key (unique), created_at
audit_event       id, actor_type, actor_id, action, subject_type, subject_id,
                  payload (jsonb), ip, created_at
document          id, kind (angebot|nachtrag|zulagenbeleg|widerrufsbelehrung),
                  storage_key, sha256, bytes, created_at
```
`approval` und `audit_event` sind **unveränderlich**: kein UPDATE, kein DELETE. Auf DB-Ebene per Trigger absichern, nicht nur im Code.
### 4.4 Bildgenerierung
```
generation_job    id, project_id, room_type, source_image_id, prompt_profile,
                  provider (kie|fal), model, status, attempts,
                  cost_micro_usd (int), credit_charged (bool),
                  result_image_ids (jsonb), error_code, created_at, finished_at
```
`cost_micro_usd` mitzuschreiben ist billig und beantwortet später die einzige Frage, die zählt: Was kostet ein Auftrag wirklich? Bei ~0,08 $ pro Vorgang ist die API nicht der Kostentreiber — der echte Aufwand ist Nacharbeit und Kundenkommunikation. Das Feld zeigt genau, wann sich das verschiebt.
---
## 5. Statusmaschinen
### 5.1 Angebot (`quote.status`)
```
draft ──sende──▶ sent ──öffnet──▶ viewed ──┬──akzeptiert──▶ accepted
  ▲                 │                       ├──abgelehnt───▶ declined
  │                 │                       └──Frist───────▶ expired
  └──neue Version───┴──ersetzt─────────────────────────────▶ superseded
```
Regeln:
- Ab `sent` ist `quote_version` **eingefroren**. Änderung = neue Version, alte wird `superseded`.
- `accepted` ist final. Spätere Änderungen laufen ausschließlich über `change_order`.
- `expired` blockiert die Freigabe, aber der Kunde sieht weiterhin das Dokument mit dem Hinweis „Frist abgelaufen — bitte neues Angebot anfordern" und einem Button, der genau das auslöst.
### 5.2 Nachtrag (`change_order.status`)
```
draft ─▶ sent ─▶ viewed ─┬─▶ accepted ─▶ invoiced
                         ├─▶ declined
                         └─▶ withdrawn (vom Handwerker zurückgezogen)
```
### 5.3 Zulage (`addon_order.status`)
```
selected ─▶ awaiting_payment ─▶ paid ─▶ fulfilling ─▶ fulfilled
    │              │                        │
    │              └─▶ payment_failed       └─▶ failed ─▶ refunded
    └─▶ awaiting_manual_approval ─▶ approved / rejected
```
- `requires_manual_approval = true` (Sonderwünsche) → Kunde zahlt **nicht** sofort, sondern der Handwerker prüft, setzt einen Preis, und daraus wird ein normaler Nachtrag oder eine Zulage mit Festpreis.
- Bei `failed` (Generierung kaputt): Credit wird automatisch zurückgebucht, Kunde bekommt Mail, keine Rückfrage nötig.
---
## 6. Preis- & Kontingentlogik
### 6.1 Grundpaket
Jedes Projekt startet mit einem Kontingent, das im Angebot enthalten ist:
| Enthalten | Menge «Platzhalter» |
|---|---|
| Visualisierungen (Vorher/Nachher-Paare) | 3 |
| Räume | 1 |
| Überarbeitungsrunden je Bild | 1 |
Buchung: bei `quote.status = accepted` → `credit_ledger += 3` mit `reason = paket`.
### 6.2 Zulagen-Katalog (Startbestückung)
| SKU | Name | Typ | Preis brutto «Platzhalter» | Credits |
|---|---|---|---|---|
| `VIS_EXTRA` | Weitere Visualisierung | per_unit | 19 € | +1 |
| `VIS_PAKET_5` | Paket: 5 weitere Visualisierungen | flat | 79 € | +5 |
| `ROOM_EXTRA` | Weiterer Raum (inkl. 2 Visualisierungen) | per_room | 49 € | +2 |
| `EXPRESS_24H` | Express-Bearbeitung < 24 h | flat | 39 € | 0 |
| `STYLE_INDIV` | Individueller Stilwunsch nach Vorlage | manual | auf Anfrage | 0 |
| `PRINT_SET` | Ausdruck A3 + Versand | flat | 24 € | 0 |
Staffelpreise über `addon_price_tier`, Beispiel `VIS_EXTRA`: 1–3 = 19 €, 4–10 = 15 €, ab 11 = 12 €.
**Hinweis zur Preisfindung:** Bei ~0,08 $ Modellkosten je Vorgang ist praktisch jeder dieser Preise deckend. Die Frage ist also nicht „reicht die Marge", sondern „bei welchem Preis klickt der Kunde ohne nachzudenken". Ein niedriger Preis mit hoher Klickrate schlägt hier fast immer einen hohen Preis mit Rückfrage — und jede Rückfrage kostet echte Arbeitszeit. Die Zahlen oben sind bewusst als Platzhalter markiert; sie gehören in Kapitel 19.
### 6.3 Berechnung
```
zwischensumme_netto = Σ (qty × unit_price_cents), gerundet je Position
rabatt              = optional, als eigene Position mit negativem Betrag
netto               = zwischensumme_netto − rabatt
ust_je_satz         = round(netto_je_satz × satz)      -- kaufmännisch, je Steuersatz getrennt
brutto              = netto + Σ ust_je_satz
```
- Rundung: **immer je Steuersatz getrennt**, nie auf der Gesamtsumme. Sonst weicht das PDF um Cents von der Buchhaltung ab.
- Anzeige für Verbraucher: **Bruttopreise führend**, netto klein darunter. Für gewerbliche Kunden umgekehrt (Flag `customer.is_business`).
### 6.4 Harte Grenzen (Missbrauchs- und Kostenschutz)
| Grenze | Wert «Platzhalter» | Verhalten bei Überschreitung |
|---|---|---|
| Zulagen je Projekt ohne manuelle Prüfung | 10 | weitere → `awaiting_manual_approval` |
| Zulagensumme je Projekt ohne manuelle Prüfung | 300 € | dito |
| Generierungen je Projekt gesamt | 40 | harte Sperre, Hinweis „bitte Kontakt aufnehmen" |
| Generierungen je Token pro Stunde | 6 | HTTP 429 mit freundlichem Text |
| Uploads je Projekt | 30 Bilder, je max. 12 MB | Ablehnung mit Klartextmeldung |
---
## 7. Kundenflow im Portal — Screen für Screen
### Screen 1 — Angebotsübersicht
- Kopf: Firmenlogo, Angebotsnummer, Datum, „gültig bis TT.MM.JJJJ" (Countdown ab 7 Tagen Restlaufzeit).
- Vorher/Nachher-Slider mit den BauVision-Bildern, direkt oben. Das ist das Verkaufsargument — nicht die Tabelle.
- Leistungspositionen als aufklappbare Liste, nicht als Wall aus Text.
- Summenblock **sticky am unteren Rand**, immer sichtbar: „Gesamt inkl. MwSt.: 12.480,00 €".
- Zwei Buttons: **Angebot annehmen** (primär) und **Rückfrage stellen** (sekundär). „Ablehnen" ist bewusst nicht prominent, aber im Fußbereich vorhanden.
### Screen 2 — Zulagen wählen
- Karten statt Tabelle. Jede Karte: Bild/Icon, Name, ein Satz Nutzen, Preis brutto, Stepper (−/+).
- Live-Summenzeile aktualisiert sich sofort. Änderung wird optisch kurz hervorgehoben (300 ms), damit der Kunde die Erhöhung wirklich wahrnimmt.
- Sonderwunsch (`manual`): Freitextfeld + optionaler Bildupload, Hinweis „Wir melden uns mit einem Festpreis — noch keine Kosten."
- Kein Vorankreuzen. Kostenpflichtige Optionen sind **niemals** vorausgewählt (`preselected` gilt nur für kostenlose Varianten).
### Screen 3 — Zusammenfassung vor Freigabe
Diese Seite ist rechtlich und vertrauensmäßig die wichtigste. Sie enthält, unmittelbar über dem Button:
1. Vollständige Liste: Leistung, Menge, Einzelpreis, Gesamtpreis.
2. Getrennter Block „Zusätzlich gewählt" mit den Zulagen.
3. Gesamtbetrag **brutto**, groß, mit expliziter MwSt.-Zeile.
4. Zahlungsziel / Zahlungsart.
5. Checkbox: „Ich habe die Widerrufsbelehrung gelesen." (nicht vorausgewählt)
6. Bei Sofortleistung zusätzlich Checkbox: „Ich verlange ausdrücklich, dass Sie vor Ablauf der Widerrufsfrist beginnen." + Hinweis auf Verlust bzw. Wertersatz.
7. Button mit exakter Beschriftung: **„Zahlungspflichtig beauftragen"**.
### Screen 4 — Bestätigung
- Grüner Haken, Betrag, Nummer, Zeitpunkt.
- „Bestätigung wurde an max@example.de gesendet" + PDF-Download direkt.
- Bei Zulagen mit Generierung: Fortschrittsanzeige mit realistischer Zeitangabe („in der Regel 2–4 Minuten") und Hinweis, dass eine Mail kommt.
### Screen 5 — Projektverlauf (Dauerlink)
Nach der Annahme wird derselbe Link zur Projektseite: Status, alle Dokumente, alle Bilder, alle Nachträge, Chatverlauf. Der Kunde muss sich nie einen zweiten Link merken.
---
## 8. Freigabe & Nachweis (Consent-Record)
### 8.1 Ablauf technisch
```
1. Client sendet POST /portal/{token}/approve
   Header: Idempotency-Key: <uuid vom Client erzeugt>
   Body:   { subject_type, subject_id, expected_hash, expected_amount_cents,
             consents: { widerruf: true, sofortbeginn: true } }
2. Server prüft:
   a) Token gültig, verifiziert?              sonst 401
   b) expected_hash == aktueller Hash?        sonst 409 CONFLICT_DOCUMENT_CHANGED
   c) expected_amount == berechneter Betrag?  sonst 409 CONFLICT_AMOUNT_CHANGED
   d) Idempotency-Key schon vorhanden?        dann alte Antwort zurückgeben, nichts tun
   e) alle Pflicht-Consents true?             sonst 422
3. In EINER Transaktion:
   - approval anlegen (mit ip, user_agent, consent_texts als Volltext-Snapshot)
   - Status des Subjects setzen
   - audit_event schreiben
   - bei Zulage: Zahlung anstoßen oder Credits buchen
4. Nach Commit (asynchron): PDF erzeugen, Mail an Kunde, Mail/Push an Handwerker.
```
**Punkt 2b und 2c sind nicht optional.** Sie sind der Grund, warum der Kunde später nicht sagen kann „da stand ein anderer Betrag". Der Hash wird beim Ausliefern der Seite mitgegeben und beim Klick zurückgeschickt.
### 8.2 `consent_texts` — Volltext statt Verweis
Im `approval` wird der **Wortlaut** jeder angehakten Erklärung gespeichert, nicht deren ID:
```json
{
  "button_label": "Zahlungspflichtig beauftragen",
  "widerruf": "Ich habe die Widerrufsbelehrung zur Kenntnis genommen.",
  "sofortbeginn": "Ich verlange ausdrücklich, dass Berisa Bau vor Ablauf der Widerrufsfrist mit der Leistung beginnt.",
  "agb_version": "2026-03-01",
  "widerrufsbelehrung_hash": "sha256:..."
}
```
Grund: Texte ändern sich. Zwei Jahre später muss rekonstruierbar sein, was **damals** auf dem Bildschirm stand — nicht, was heute in der Datenbank steht.
---
## 9. Zahlung
### 9.1 Anbieter
Stripe (SEPA-Lastschrift + Karte + Apple/Google Pay). Alternativen: Mollie, Adyen. Für Kleinbeträge unter 50 € ist die reine Klick-Strecke entscheidend — jeder zusätzliche Schritt kostet Umsatz.
### 9.2 Regeln
- **Spur A (Bauleistung):** keine Onlinezahlung. Freigabe erzeugt Auftrag, Abrechnung läuft klassisch über Rechnung. Optional später: Anzahlung.
- **Spur B (Zulagen):** Stripe Checkout, Betrag wird **serverseitig** neu berechnet — niemals der vom Client gesendete Betrag.
- Webhook `checkout.session.completed` ist die **einzige** Quelle für „bezahlt". Die Rückkehr-URL im Browser ist kein Zahlungsnachweis.
- Webhook-Verarbeitung idempotent über Stripe-Event-ID.
- Bei Fehlschlag der Leistung: automatische Rückerstattung über `refunds.create`, Beleg an Kunde.
### 9.3 Belege
Für jede bezahlte Zulage entsteht sofort ein Beleg als PDF (`document.kind = zulagenbeleg`) mit fortlaufender Nummer aus einem eigenen Kreis (`ZL-2026-0001`). Getrennter Nummernkreis von den Bau-Rechnungen — spart später Sortierarbeit beim Steuerberater.
---
## 10. Bildgenerierung: Auslösung, Kosten, Schutz
### 10.1 Auslösekette
```
addon_order.status = paid
        │
        ├─▶ credit_ledger += grants_credits   (reason = zulage)
        │
        ▼
Queue-Job "generate"  (BullMQ / pg-boss)
        │
        ├─ prüft Credit-Guthaben > 0        → sonst Abbruch
        ├─ bucht Credit ab (reason = generierung)
        ├─ ruft BauVision-Adapter (kie.ai → Fallback fal.ai)
        ├─ Timeout 180 s, max. 2 Retries mit Backoff
        │
        ├─ Erfolg  ─▶ Bilder ablegen, Job fulfilled, Mail an Kunde
        └─ Fehler  ─▶ Credit-Rückbuchung (reason = storno), Job failed,
                      Mail „wir kümmern uns", Ticket für Handwerker
```
**Wichtig:** Credit wird beim Start abgebucht und bei Fehler zurückgebucht — nicht umgekehrt. Sonst kann derselbe Credit durch schnelles Doppelklicken mehrfach verwendet werden.
### 10.2 Anbieterunabhängigkeit
Der Adapter ist ein Interface, kein direkter API-Aufruf:
```ts
interface ImageProvider {
  name: string;
  generate(input: GenerationInput): Promise<GenerationResult>;
  estimateCostMicroUsd(input: GenerationInput): number;
  healthy(): Promise<boolean>;
}
```
Registry mit Prioritätenliste, Health-Check alle 60 s, automatischer Fallback. Ein späterer eigener Dienst wird dann nur ein weiterer Eintrag in der Liste — kein Umbau am Modul. Das ist der einzige Punkt, an dem das Ziel „unabhängig von Drittanbietern" jetzt schon Architektur-Konsequenzen hat.
### 10.3 Uploadschutz
- MIME-Prüfung serverseitig über Magic Bytes, nicht über Dateiendung.
- EXIF strippen (enthält GPS-Koordinaten der Kundenwohnung).
- Bildgröße normalisieren auf max. 2048 px lange Kante vor Weitergabe an den Anbieter.
- Inhaltsprüfung: nur Innen-/Außenaufnahmen. Bei Personen im Bild → Hinweis an den Kunden, Bild wird nicht verarbeitet.
---
## 11. Benachrichtigungen
| Ereignis | An Kunde | An Handwerker |
|---|---|---|
| Angebot versendet | Mail + optional WhatsApp/SMS mit Link | — |
| Angebot geöffnet | — | Push „Kunde X hat Angebot angesehen" |
| 3 Tage keine Reaktion | freundliche Erinnerung | — |
| 2 Tage vor Ablauf | Erinnerung mit Countdown | Hinweis |
| Angebot angenommen | Bestätigung + PDF | Push, hoch priorisiert |
| Zulage bestellt | Beleg + PDF | Push mit Betrag |
| Generierung fertig | Mail mit Vorschaubild + Link | — |
| Generierung fehlgeschlagen | Mail „wir melden uns" | Ticket |
| Nachtrag gesendet | Mail mit Link | — |
Alle Mails: Klartext-Betreff mit Nummer und Betrag, damit sie im Postfach auffindbar bleiben. Kein reines Bild-HTML.
---
## 12. Handwerker-Seite (Admin)
### 12.1 Angebotserstellung
- Vorlagen je Gewerk (Bad, Küche, Boden, Wohnraum) mit vorbelegten Positionen.
- Positionen per Textbaustein-Bibliothek, Mengen eintippbar auf dem Handy.
- Direkter Zugriff auf BauVision-Bilder des Projekts, Auswahl per Klick.
- Live-Vorschau exakt so, wie der Kunde es sieht („Kundenansicht"-Toggle).
- Kalkulationsansicht **nur intern**: Einkaufspreis, Stundenansatz, Deckungsbeitrag je Position, Gesamtgewinn. Erscheint nie im Kunden-PDF.
### 12.2 Nachtrag anlegen
Drei Klicks: Projekt → „Nachtrag" → Grund + Positionen → senden. Grund ist Pflichtfeld, weil er im PDF erscheint und die häufigste Rückfrage („warum kostet das jetzt mehr?") vorab beantwortet.
### 12.3 Übersicht
Eine einzige Liste, sortiert nach „braucht Aufmerksamkeit": abgelaufen ohne Reaktion → offene Sonderwünsche → fehlgeschlagene Generierungen → gesendet ohne Öffnung → alles andere.
---
## 13. Rechtliche Pflichtbausteine (Deutschland)
> Ich bin kein Anwalt, und das hier ersetzt keine Rechtsberatung. Die folgenden Punkte sind die, an denen digitale Angebots- und Freigabestrecken erfahrungsgemäß angreifbar werden — sie gehören vor dem Livegang einmal von einem Anwalt für Bau- und IT-Recht geprüft.
### 13.1 Button-Beschriftung
Bei Verbrauchern muss der Bestellbutton eindeutig auf die Zahlungspflicht hinweisen (§ 312j Abs. 3 BGB). Zulässig ist „zahlungspflichtig bestellen" oder eine entsprechend eindeutige Formulierung. **Nicht** zulässig: „Weiter", „Absenden", „Bestätigen". Deshalb ist die Beschriftung in Kapitel 7 fest vorgegeben und darf nicht konfigurierbar sein.
### 13.2 Textform
Für die meisten dieser Erklärungen genügt Textform (§ 126b BGB) — eine E-Mail mit PDF reicht, eine qualifizierte Signatur ist nicht nötig. Der Beweiswert entsteht über das Protokoll aus Kapitel 8, nicht über eine Signaturtechnik.
### 13.3 Widerrufsrecht
- Bei Verträgen, die im Fernabsatz oder außerhalb von Geschäftsräumen geschlossen werden, hat der Verbraucher grundsätzlich 14 Tage Widerrufsrecht (§ 312g BGB).
- Soll vor Fristablauf begonnen werden, braucht es das **ausdrückliche Verlangen** des Kunden (§ 356 Abs. 4 BGB) — genau dafür die zweite Checkbox in Screen 3.
- Ohne korrekte Belehrung verlängert sich die Frist erheblich. Die Belehrung wird deshalb versioniert und ihr Hash im `approval` mitgespeichert.
- Für den Verbraucherbauvertrag gilt § 650l BGB gesondert.
### 13.4 Bauvertragsrecht
- Änderungswünsche und Vergütungsanpassung: §§ 650b, 650c BGB. Der Nachtragsprozess in Kapitel 5.2 bildet genau das ab — Änderungsbegehren, Angebot über Mehrvergütung, Zustimmung.
- Beim Verbraucherbauvertrag (§ 650i ff. BGB): Baubeschreibung, verbindliche Angabe zur Bauzeit.
### 13.5 Preisangaben
Gegenüber Verbrauchern sind Gesamtpreise inklusive Umsatzsteuer anzugeben (PAngV). Deshalb die Brutto-Führung in Kapitel 6.3.
### 13.6 Aufbewahrung
Angebote, Belege und Auftragsbestätigungen unterliegen den handels- und steuerrechtlichen Aufbewahrungspflichten. PDFs deshalb unveränderlich ablegen (Object Storage mit Versionierung, WORM-fähig), nicht bei Bedarf neu rendern. Ein neu gerendertes PDF ist ein anderes Dokument.
---
## 14. Datenschutz
- **Rechtsgrundlage:** Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für Angebot und Abwicklung. Nutzung der Bilder als Referenz auf Website/Instagram braucht eine **separate, freiwillige Einwilligung** — eigene Checkbox, niemals gebündelt mit der Beauftragung, jederzeit widerrufbar.
- **Auftragsverarbeitung:** mit jedem Bildanbieter (kie.ai, fal.ai, Cloudinary) AV-Vertrag nach Art. 28. Bei Servern außerhalb der EU zusätzlich Transfergrundlage prüfen. Das ist ein zweiter, konkreter Grund für die Anbieterunabhängigkeit aus Kapitel 10.2.
- **Löschkonzept:** Rohuploads nach «Platzhalter: 90» Tagen nach Projektabschluss löschen; Ergebnisbilder nach «Platzhalter: 2» Jahren; kaufmännische Dokumente entsprechend Aufbewahrungsfrist.
- **Betroffenenrechte:** Export als ZIP (JSON + alle Bilder + alle PDFs) per Knopfdruck im Admin.
- Hosting EU, Frankfurt — konsistent zur SteuerFlow-Entscheidung.
---
## 15. API-Vertrag
```
# Öffentlich (Kundenportal, Token-basiert)
GET    /api/portal/:token                    → Angebot + Zulagenkatalog + Hash
POST   /api/portal/:token/verify             → Code anfordern / prüfen
POST   /api/portal/:token/selection          → Zulagenauswahl zwischenspeichern
POST   /api/portal/:token/approve            → Freigabe        [Idempotency-Key]
POST   /api/portal/:token/decline            → Ablehnung + Grund
POST   /api/portal/:token/checkout           → Stripe-Session   [Idempotency-Key]
POST   /api/portal/:token/message            → Rückfrage stellen
POST   /api/portal/:token/uploads            → Bildupload (signed URL)
GET    /api/portal/:token/documents/:id      → PDF (signed, 15 Min. gültig)
# Intern (Login)
POST   /api/quotes                           → anlegen
PUT    /api/quotes/:id                       → nur solange draft
POST   /api/quotes/:id/publish               → friert Version ein, erzeugt PDF
POST   /api/quotes/:id/send                  → Token + Mail
POST   /api/quotes/:id/change-orders         → Nachtrag
GET    /api/projects/:id/ledger              → Credit-Historie
POST   /api/addons/:id/manual-approve        → Sonderwunsch bepreisen
GET    /api/admin/catalog  |  PUT ...        → Zulagenkatalog
# System
POST   /api/webhooks/stripe                  → Signaturprüfung Pflicht
POST   /api/webhooks/generation/:provider    → Ergebnis-Callback
```
Fehlerformat einheitlich:
```json
{ "error": { "code": "CONFLICT_AMOUNT_CHANGED",
             "message": "Der Betrag hat sich geändert. Bitte prüfen Sie die aktualisierte Übersicht.",
             "details": { "expected": 1248000, "actual": 1252000 } } }
```
`message` ist immer deutscher Klartext für Endkunden — nie ein technischer Text durchgereicht.
---
## 16. Fehlerfälle & Idempotenz
| Fall | Verhalten |
|---|---|
| Kunde klickt zweimal auf „beauftragen" | Idempotency-Key greift, eine Freigabe, zweite Antwort identisch |
| Handwerker ändert Angebot, während Kunde die Seite offen hat | Hash-Vergleich schlägt an → 409, Seite lädt neu mit sichtbarer Änderungsmarkierung |
| Stripe-Webhook kommt doppelt | Event-ID-Sperre, zweiter Aufruf ohne Wirkung |
| Zahlung erfolgreich, Generierung fällt aus | Credit bleibt gutgeschrieben, Kunde behält Anspruch, Ticket beim Handwerker |
| Token wurde weitergeleitet | Freigabe erfordert Code an hinterlegte Adresse → Fremder kann ansehen, nicht beauftragen |
| Netzabbruch mitten in der Freigabe | Client wiederholt mit demselben Key, kein Doppelauftrag |
| Anbieter kie.ai down | Fallback fal.ai, bei beiderseitigem Ausfall Job bleibt `queued`, Kunde sieht „in Bearbeitung" statt Fehler |
---
## 17. Akzeptanzkriterien
```gherkin
Szenario: Zulage wird erst nach ausdrücklicher Freigabe berechnet
  Angenommen ein versendetes Angebot mit der optionalen Zulage "Weitere Visualisierung"
  Wenn der Kunde die Zulage auswählt
  Dann ändert sich die angezeigte Gesamtsumme sofort
  Und es wird noch keine Bestellung angelegt
  Wenn der Kunde auf "Zahlungspflichtig beauftragen" klickt und bestätigt
  Dann existiert genau ein approval mit dem exakten Bruttobetrag
  Und genau eine addon_order im Status awaiting_payment
Szenario: Betragsänderung während offener Sitzung
  Angenommen der Kunde hat die Zusammenfassung geöffnet
  Wenn der Handwerker eine neue Angebotsversion veröffentlicht
  Und der Kunde auf Freigeben klickt
  Dann antwortet der Server mit CONFLICT_DOCUMENT_CHANGED
  Und es wird kein approval erzeugt
  Und dem Kunden werden die Änderungen hervorgehoben angezeigt
Szenario: Doppelklick erzeugt keinen Doppelauftrag
  Wenn zwei identische Freigaben mit demselben Idempotency-Key eintreffen
  Dann existiert genau ein approval
  Und beide Antworten sind inhaltlich identisch
Szenario: Fehlgeschlagene Generierung erstattet den Credit
  Angenommen ein bezahlter Zulagenauftrag mit einem abgebuchten Credit
  Wenn der Generierungsjob nach allen Wiederholungen fehlschlägt
  Dann enthält credit_ledger eine Rückbuchung mit reason = storno
  Und der Saldo entspricht dem Stand vor dem Job
  Und der Kunde erhält eine Benachrichtigung
Szenario: Freigabe ohne Verifikation ist nicht möglich
  Angenommen ein gültiger, aber nicht verifizierter Token
  Wenn eine Freigabe gesendet wird
  Dann antwortet der Server mit 401
  Und es wird kein approval erzeugt
Szenario: Kostenpflichtige Optionen sind nie vorausgewählt
  Wenn das Portal geladen wird
  Dann ist keine Zulage mit price_cents > 0 ausgewählt
Szenario: Limit erzwingt manuelle Prüfung
  Angenommen ein Projekt mit bereits 300 € freigegebenen Zulagen
  Wenn der Kunde eine weitere Zulage beauftragt
  Dann erhält die Bestellung den Status awaiting_manual_approval
  Und es wird keine Zahlung ausgelöst
```
---
## 18. Meilensteine für Claude Code
Reihenfolge bewusst so, dass nach jedem Schritt etwas Vorzeigbares existiert.
| M | Inhalt | Fertig, wenn |
|---|---|---|
| **M0** | Schema, Migrationen, Seed-Daten, Trigger für Unveränderlichkeit | `prisma migrate` läuft durch, Seed erzeugt Demo-Projekt |
| **M1** | Angebot anlegen/veröffentlichen/versenden, PDF, Magic-Link | Ein Angebot ist per Link auf dem Handy lesbar |
| **M2** | Portal-Ansicht komplett + Verifikation + Freigabe + Consent-Record | Kunde kann annehmen, Protokoll ist vollständig |
| **M3** | Zulagenkatalog, Auswahl, Preislogik, Staffeln, Limits | Summen stimmen, Limits greifen, Tests aus Kap. 17 grün |
| **M4** | Stripe, Belege, Rückerstattung | Bezahlung end-to-end im Testmodus |
| **M5** | Generierungs-Queue, Provider-Adapter, Credits, Fehlerpfad | Bezahlte Zulage erzeugt automatisch Bilder |
| **M6** | Nachträge (Spur A), Benachrichtigungen, Admin-Übersicht | Kompletter Ablauf ohne Handgriffe außerhalb der App |
| **M7** | Härtung: Rate-Limits, Uploadschutz, Löschkonzept, Export | Sicherheitscheckliste abgehakt |
**Übergabehinweis für Claude Code:** Dieses Dokument als Ganzes in den Projektordner legen (`docs/spezifikation-angebote.md`), dann Meilenstein für Meilenstein beauftragen — nicht alles auf einmal. Bei jedem Meilenstein die Akzeptanzkriterien aus Kapitel 17 als Testauftrag mitgeben. Was hier als «Platzhalter» markiert ist, vorher durch echte Werte ersetzen; sonst rät das Modell, und geratene Preise landen im Produktivsystem.
---
## 19. Offene Entscheidungen
Diese Punkte kann ich nicht für dich festlegen — sie hängen an deiner Kalkulation und deiner Kundschaft.
1. **Grundkontingent:** Wie viele Visualisierungen sind im Angebot enthalten?
2. **Zulagenpreise:** Die Tabelle in 6.2 ist Platzhalter. Was soll eine weitere Visualisierung kosten?
3. **Kostenlose Korrekturrunden:** Wie viele Überarbeitungen je Bild ohne Aufpreis?
4. **Limits:** Ab welcher Summe je Projekt willst du persönlich draufschauen?
5. **Zahlung bei Zulagen:** sofort per Stripe oder gesammelt auf der Schlussrechnung? (Sofort ist sauberer, gesammelt ist bequemer für Stammkunden.)
6. **Angebotsgültigkeit:** 14, 21 oder 30 Tage?
7. **Kanal:** Nur E-Mail oder auch WhatsApp/SMS für den Link?
8. **Gewerbekunden:** eigener Modus mit Nettopreisen und ohne Widerrufsstrecke?
9. **Referenznutzung:** Willst du die Einwilligung zur Veröffentlichung direkt im Portal einholen?
10. **Löschfristen:** 90 Tage / 2 Jahre wie in Kapitel 14 vorgeschlagen, oder anders?
---
## Änderungshistorie
| Version | Datum | Änderung |
|---|---|---|
| 1.0 | 2026-08-17 | Erstfassung |
