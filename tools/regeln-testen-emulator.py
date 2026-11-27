#!/usr/bin/env python3
"""Testet BerisaBauApp/firestore.rules gegen den lokalen Firestore-Emulator mit echten
Abfragen (Inhaber und Mitarbeiter). 42 Fälle, angelegt 27.11.2026.

Emulator starten (Ordner mit firebase.json {"firestore":{"rules":"firestore.rules"},
"emulators":{"firestore":{"port":8081,"host":"127.0.0.1"},"ui":{"enabled":false}}} und
einer Kopie der Regeln):
    firebase emulators:start --only firestore --project demo-werkbuch
Dann:  python3 BerisaBauApp/tools/regeln-testen-emulator.py
Vor Änderungen den Emulator-Speicher leeren:
    curl -X DELETE "http://127.0.0.1:8081/emulator/v1/projects/demo-werkbuch/databases/(default)/documents"
Die Regel-Test-API von Google steht dem Dienstkonto nicht zur Verfügung (403), daher dieser Weg.
"""
import base64, json, sys, urllib.request, urllib.error

BASE = "http://127.0.0.1:8081/v1/projects/demo-werkbuch/databases/(default)/documents"
OWN, EMP, EMP2 = "OWN", "EMP", "EMP2"
MAIL = {OWN: "info@berisabau.de", EMP: "seba@test.de", EMP2: "boba@test.de"}


def b64(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()


def token(uid):
    if uid == "ADMIN":
        return "owner"
    return b64({"alg": "none", "typ": "JWT"}) + "." + b64({
        "user_id": uid, "sub": uid, "email": MAIL[uid], "email_verified": True,
        "firebase": {"sign_in_provider": "password", "identities": {}}}) + "."


def wert(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, (int, float)): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [wert(x) for x in v]}}
    raise ValueError(v)


def felder(d):
    return {"fields": {k: wert(v) for k, v in d.items()}}


def ruf(uid, methode, pfad, body=None, frage=""):
    url = f"{BASE}/{pfad}{frage}" if not pfad.startswith(":") else f"{BASE}{pfad}"
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=methode,
                                 headers={"Authorization": "Bearer " + token(uid), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


def setze(pfad, d):
    s, a = ruf("ADMIN", "PATCH", pfad, felder(d))
    assert s == 200, (pfad, s, a)


# ----------------------------------------------------------- Testdaten (Admin umgeht Regeln)
setze("users/OWN", {"rolle": "handwerker", "stundensatzKostenStandard": 85})
setze("users/EMP", {"rolle": "mitarbeiter", "gehoertZu": OWN, "personId": "pSeba"})
setze("baustellen/b1", {"handwerkerId": OWN, "name": "Scheuvens", "kundeTelefon": "0123", "zugewieseneNutzer": [EMP]})
setze("baustellen/b2", {"handwerkerId": OWN, "name": "Andere", "zugewieseneNutzer": [EMP2]})
setze("baustellen/b1/zahlen/aktuell", {"umsatz": 20000, "budget": 17343})
setze("baustellen/b1/stunden/sEmp", {"erstelltVon": EMP, "stunden": 8, "stundensatzKosten": 30})
setze("baustellen/b1/stunden/sOwn", {"erstelltVon": OWN, "stunden": 8, "stundensatzKosten": 85})
setze("baustellen/b1/fotos/f1", {"url": "x"})
setze("baustellen/b1/material/m1", {"preis": 5})
setze("personen/pSeba", {"handwerkerId": OWN, "name": "Seba", "email": "seba@test.de", "stundensatzKosten": 30})
setze("personen/pBoba", {"handwerkerId": OWN, "name": "Boba", "email": "boba@test.de", "uid": EMP2, "stundensatzKosten": 25})
setze("personen/pDamir", {"handwerkerId": OWN, "name": "Damir", "email": "info@berisabau.de", "stundensatzKosten": 85})


def abfrage(eltern, sammlung, feld, op, wertd):
    return ":runQuery" if False else (eltern, {"structuredQuery": {"from": [{"collectionId": sammlung}],
            "where": {"fieldFilter": {"field": {"fieldPath": feld}, "op": op, "value": wert(wertd)}}}})


def liste(uid, eltern, sammlung, feld=None, op="EQUAL", wertd=None):
    q = {"from": [{"collectionId": sammlung}]}
    if feld:
        q["where"] = {"fieldFilter": {"field": {"fieldPath": feld}, "op": op, "value": wert(wertd)}}
    url = f"{BASE}/{eltern}:runQuery" if eltern else f"{BASE}:runQuery"
    req = urllib.request.Request(url, data=json.dumps({"structuredQuery": q}).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + token(uid), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            antwort = json.load(r)
            return 200, [x for x in antwort if "document" in x]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:160]


ergebnisse = []


def pruefe(text, erwartet_ok, status, extra=""):
    gut = (status == 200) == erwartet_ok
    ergebnisse.append(gut)
    print(("OK   " if gut else "FEHL ") + ("ERLAUBT " if erwartet_ok else "VERBOTEN") + "  " + text + (f"  [{status}] {extra}" if not gut else ""))


def get_(uid, pfad, text, ok):
    s, a = ruf(uid, "GET", pfad)
    pruefe(text, ok, s, str(a)[:120])


def lst(uid, eltern, sammlung, text, ok, feld=None, wertd=None, op="EQUAL", anzahl=None):
    s, a = liste(uid, eltern, sammlung, feld, op, wertd)
    if s == 200 and anzahl is not None and len(a) != anzahl:
        pruefe(text + f" (erwartet {anzahl} Treffer, bekam {len(a)})", True, 500)
    else:
        pruefe(text, ok, s, str(a)[:120])


print("== Mitarbeiter Seba (EMP), Scheuvens zugewiesen")
lst(EMP, "", "baustellen", "Baustellenliste: zugewieseneNutzer array-contains uid", True, "zugewieseneNutzer", EMP, "ARRAY_CONTAINS", anzahl=1)
lst(EMP, "", "baustellen", "ALLE Baustellen auflisten (Gesamtliste)", False)
lst(EMP, "", "baustellen", "Baustellen nach handwerkerId = Inhaber abfragen", False, "handwerkerId", OWN)
get_(EMP, "baustellen/b1", "Zugewiesene Baustelle lesen", True)
get_(EMP, "baustellen/b2", "Fremde Baustelle lesen", False)
get_(EMP, "baustellen/b1/zahlen/aktuell", "Umsatz/Budget lesen", False)
lst(EMP, "baustellen/b1", "stunden", "Stunden: nur eigene (erstelltVon == uid)", True, "erstelltVon", EMP, anzahl=1)
lst(EMP, "baustellen/b1", "stunden", "Stunden: ALLE auflisten", False)
lst(EMP, "baustellen/b1", "stunden", "Stunden des Inhabers abfragen", False, "erstelltVon", OWN)
get_(EMP, "baustellen/b1/stunden/sEmp", "Eigene Stunden-Zeile lesen", True)
get_(EMP, "baustellen/b1/stunden/sOwn", "Fremde Stunden-Zeile lesen", False)
lst(EMP, "baustellen/b1", "fotos", "Fotos auflisten", False)
lst(EMP, "baustellen/b1", "material", "Material auflisten", False)
s, a = ruf(EMP, "PATCH", "baustellen/b1/stunden/neu1", felder({"erstelltVon": EMP, "stunden": 7.5, "stundensatzKosten": 30}))
pruefe("Eigene Stunden eintragen", True, s, str(a)[:120])
s, a = ruf(EMP, "PATCH", "baustellen/b1/stunden/neu2", felder({"erstelltVon": OWN, "stunden": 7.5}))
pruefe("Stunden auf fremden Namen eintragen", False, s)
s, a = ruf(EMP, "PATCH", "baustellen/b2/stunden/neu3", felder({"erstelltVon": EMP, "stunden": 7.5}))
pruefe("Stunden auf NICHT zugewiesener Baustelle eintragen", False, s)
s, a = ruf(EMP, "PATCH", "baustellen/b1/stunden/sOwn", felder({"erstelltVon": EMP, "stunden": 1}))
pruefe("Fremden Eintrag an sich ziehen/ändern", False, s)
s, a = ruf(EMP, "PATCH", "baustellen/b1/fotos/neu", felder({"url": "y"}))
pruefe("Foto hochladen", False, s)
s, a = ruf(EMP, "PATCH", "baustellen/b1", felder({"status": "Fertig"}), "?updateMask.fieldPaths=status")
pruefe("Baustelle ändern", False, s)
get_(EMP, "personen/pSeba", "Registrierung/eigene Person lesen (E-Mail passt)", True)
lst(EMP, "", "personen", "Registrierung: Person per E-Mail suchen (where email == eigene)", True, "email", "seba@test.de", anzahl=1)
lst(EMP, "", "personen", "Alle Personen auflisten (Stundensätze der Kollegen)", False)
lst(EMP, "", "personen", "Personen des Betriebs per handwerkerId abfragen", False, "handwerkerId", OWN)
lst(EMP, "", "personen", "Fremde E-Mail suchen", False, "email", "boba@test.de")
get_(EMP, "personen/pBoba", "Person des Kollegen lesen", False)
get_(EMP, "personen/pDamir", "Person des Inhabers lesen", False)
s, a = ruf(EMP, "PATCH", "personen/pSeba", felder({"uid": EMP}), "?updateMask.fieldPaths=uid")
pruefe("Registrierung: uid in eigene Person eintragen", True, s, str(a)[:120])
s, a = ruf(EMP, "PATCH", "personen/pSeba", felder({"stundensatzKosten": 99}), "?updateMask.fieldPaths=stundensatzKosten")
pruefe("Eigenen Stundensatz ändern", False, s)
get_(EMP, "users/EMP", "Eigenes Profil lesen", True)
get_(EMP, "users/OWN", "Profil des Inhabers lesen", False)

print("== Inhaber")
lst(OWN, "", "baustellen", "Baustellenliste (handwerkerId == uid)", True, "handwerkerId", OWN, anzahl=2)
get_(OWN, "baustellen/b1/zahlen/aktuell", "Umsatz/Budget lesen", True)
s, a = ruf(OWN, "PATCH", "baustellen/b1/zahlen/aktuell", felder({"umsatz": 1, "budget": 2}))
pruefe("Umsatz/Budget schreiben", True, s, str(a)[:120])
lst(OWN, "baustellen/b1", "stunden", "Alle Stunden lesen", True, anzahl=3)
lst(OWN, "baustellen/b1", "fotos", "Fotos lesen", True)
s, a = ruf(OWN, "PATCH", "baustellen/b1/fotos/neu", felder({"url": "y"}))
pruefe("Foto hochladen", True, s, str(a)[:120])
lst(OWN, "baustellen/b1", "material", "Material lesen", True)
lst(OWN, "", "personen", "Personen des Betriebs (handwerkerId == uid)", True, "handwerkerId", OWN, anzahl=3)
get_(OWN, "users/OWN", "Eigenes Profil lesen", True)
s, a = ruf(OWN, "PATCH", "users/OWN", felder({"rolle": "handwerker", "stundensatzKostenStandard": 90}), "?updateMask.fieldPaths=stundensatzKostenStandard")
pruefe("Standard-Stundensatz im Profil ändern", True, s, str(a)[:120])
s, a = ruf(OWN, "PATCH", "personen/pNeu", felder({"handwerkerId": OWN, "name": "Neu", "stundensatzKosten": 30, "email": "neu@test.de"}))
pruefe("Person anlegen", True, s, str(a)[:120])
s, a = ruf(OWN, "PATCH", "baustellen/b1", felder({"zugewieseneNutzer": [EMP, EMP2]}), "?updateMask.fieldPaths=zugewieseneNutzer")
pruefe("Baustelle zuweisen (zugewieseneNutzer ändern)", True, s, str(a)[:120])

print(f"\n{sum(ergebnisse)}/{len(ergebnisse)} wie erwartet")
sys.exit(0 if all(ergebnisse) else 1)
