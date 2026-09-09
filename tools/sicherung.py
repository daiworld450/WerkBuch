#!/usr/bin/env python3
"""
sicherung.py — vollständige Sicherung der WerkBuch-Datenbank auf diesen Mac.

Warum nicht der eingebaute Firestore-Export? Der schreibt nach Google Cloud
Storage und verlangt dafür den kostenpflichtigen Blaze-Tarif. Dieses Skript
liest stattdessen über die REST-Schnittstelle und legt reines JSON in einen
Ordner — kostenlos, lesbar, und ohne Abhängigkeit von einem fremden Dienst.

    python3 BerisaBauApp/tools/sicherung.py

Ergebnis:  ~/WerkBuch-Sicherungen/2026-09-09_1altered/…
           je Sammlung eine .json-Datei, dazu eine uebersicht.json

Wiederherstellen: siehe --zurueck (fragt vor jedem Schreibvorgang nach).
"""

import json
import os
import sys
import time
import base64
import datetime
import urllib.request
import urllib.parse
import urllib.error

PROJEKT = "berisa-bau"
HIER = os.path.dirname(os.path.abspath(__file__))
SCHLUESSEL = os.path.join(HIER, "..", ".secrets", "firebase-adminsdk.json")
ZIEL_BASIS = os.path.expanduser("~/WerkBuch-Sicherungen")

# Sammlungen, die gesichert werden. Unterordner werden je Baustelle
# automatisch mitgenommen (siehe UNTERORDNER).
OBEN = ["users", "personen", "termine", "baustellen", "zulagenKatalog"]
UNTERORDNER = [
    "fotos", "masse", "raum", "material", "kosten", "stunden",
    "dokumente", "angebot", "nachtraege", "freigaben", "protokoll",
    "visualisierungen",
]


def zugang():
    """Selbst signiertes JWT gegen ein Zugriffstoken tauschen."""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        sys.exit("Es fehlt das Paket 'cryptography'.  pip3 install cryptography")

    if not os.path.exists(SCHLUESSEL):
        sys.exit(f"Dienstkonto-Schlüssel nicht gefunden: {SCHLUESSEL}")

    k = json.load(open(SCHLUESSEL))

    def b64(d):
        return base64.urlsafe_b64encode(d).rstrip(b"=")

    now = int(time.time())
    kopf = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    rumpf = b64(json.dumps({
        "iss": k["client_email"],
        "scope": "https://www.googleapis.com/auth/datastore",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now, "exp": now + 3600,
    }).encode())
    key = serialization.load_pem_private_key(k["private_key"].encode(), password=None)
    sig = b64(key.sign(kopf + b"." + rumpf, padding.PKCS1v15(), hashes.SHA256()))
    jwt = (kopf + b"." + rumpf + b"." + sig).decode()

    anfrage = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt,
        }).encode(),
    )
    return json.load(urllib.request.urlopen(anfrage))["access_token"]


def lesen(token, pfad, seitenmarke=None):
    url = (f"https://firestore.googleapis.com/v1/projects/{PROJEKT}"
           f"/databases/(default)/documents/{pfad}?pageSize=300")
    if seitenmarke:
        url += "&pageToken=" + urllib.parse.quote(seitenmarke)
    anfrage = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        return json.load(urllib.request.urlopen(anfrage))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise


def alle(token, pfad):
    """Alle Dokumente einer Sammlung, über alle Seiten hinweg."""
    ergebnis = []
    marke = None
    while True:
        antwort = lesen(token, pfad, marke)
        ergebnis.extend(antwort.get("documents", []))
        marke = antwort.get("nextPageToken")
        if not marke:
            return ergebnis


def hauptlauf():
    token = zugang()
    stempel = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
    ziel = os.path.join(ZIEL_BASIS, stempel)
    os.makedirs(ziel, exist_ok=True)

    uebersicht = {"zeitpunkt": stempel, "projekt": PROJEKT, "sammlungen": {}}
    gesamt = 0

    for sammlung in OBEN:
        dokumente = alle(token, sammlung)
        with open(os.path.join(ziel, f"{sammlung}.json"), "w") as f:
            json.dump(dokumente, f, ensure_ascii=False, indent=1)
        uebersicht["sammlungen"][sammlung] = len(dokumente)
        gesamt += len(dokumente)
        print(f"  {sammlung}: {len(dokumente)}")

        # Unterordner der Baustellen mitnehmen
        if sammlung == "baustellen":
            unter = {}
            for d in dokumente:
                bid = d["name"].rsplit("/", 1)[-1]
                for ordner in UNTERORDNER:
                    eintraege = alle(token, f"baustellen/{bid}/{ordner}")
                    if eintraege:
                        unter.setdefault(bid, {})[ordner] = eintraege
                        gesamt += len(eintraege)
            with open(os.path.join(ziel, "baustellen_unterordner.json"), "w") as f:
                json.dump(unter, f, ensure_ascii=False, indent=1)
            anzahl = sum(len(v) for b in unter.values() for v in b.values())
            uebersicht["sammlungen"]["baustellen_unterordner"] = anzahl
            print(f"  Unterordner der Baustellen: {anzahl}")

    uebersicht["dokumente_gesamt"] = gesamt
    with open(os.path.join(ziel, "uebersicht.json"), "w") as f:
        json.dump(uebersicht, f, ensure_ascii=False, indent=1)

    # Alte Sicherungen ausdünnen: die letzten 30 behalten.
    stände = sorted(d for d in os.listdir(ZIEL_BASIS)
                    if os.path.isdir(os.path.join(ZIEL_BASIS, d)))
    for alt in stände[:-30]:
        import shutil
        shutil.rmtree(os.path.join(ZIEL_BASIS, alt))

    print(f"\n{gesamt} Dokumente gesichert nach {ziel}")
    return ziel


if __name__ == "__main__":
    hauptlauf()
