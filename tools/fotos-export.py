#!/usr/bin/env python3
"""
fotos-export.py — Baustellenfotos für die Social-Media-Pipeline bereitstellen.

Die Pipeline unter berisabau-social/ braucht echte Baustellenfotos. Bisher
hätte sie dafür Firestore und Cloudinary selbst ansprechen müssen. Dieses
Skript legt stattdessen eine feste, einfache Ordnerstruktur an:

    ~/WerkBuch-Fotos/
        index.json                     alle Baustellen und Fotos mit Metadaten
        <Baustelle>/<Phase>/<Datum>_<lfd>.jpg

    python3 BerisaBauApp/tools/fotos-export.py
    python3 BerisaBauApp/tools/fotos-export.py --nur "Bad Familie"
    python3 BerisaBauApp/tools/fotos-export.py --ohne-bilder    (nur index.json)

index.json je Foto: baustelle, phase, notiz, aufgenommenAm, url, datei.
Sortiert ist alles chronologisch nach Aufnahmedatum — das ist die Reihenfolge,
in der eine Vorher-Nachher-Geschichte erzählt wird.
"""

import json
import os
import re
import sys
import time
import base64
import urllib.request
import urllib.parse
import urllib.error

PROJEKT = "berisa-bau"
HIER = os.path.dirname(os.path.abspath(__file__))
SCHLUESSEL = os.path.join(HIER, "..", ".secrets", "firebase-adminsdk.json")
ZIEL = os.path.expanduser("~/WerkBuch-Fotos")

PHASEN_REIHENFOLGE = ["Vorher", "Abriss", "Rohinstallation", "Fliesen", "Montage", "Fertig"]


def zugang():
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

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
            "assertion": jwt}).encode())
    return json.load(urllib.request.urlopen(anfrage))["access_token"]


def wert(feld):
    """Firestore-Feld → einfacher Python-Wert."""
    if feld is None:
        return None
    for art in ("stringValue", "booleanValue", "timestampValue"):
        if art in feld:
            return feld[art]
    if "integerValue" in feld:
        return int(feld["integerValue"])
    if "doubleValue" in feld:
        return float(feld["doubleValue"])
    if "nullValue" in feld:
        return None
    return None


def sammlung(token, pfad):
    ergebnis, marke = [], None
    while True:
        url = (f"https://firestore.googleapis.com/v1/projects/{PROJEKT}"
               f"/databases/(default)/documents/{pfad}?pageSize=300")
        if marke:
            url += "&pageToken=" + urllib.parse.quote(marke)
        anfrage = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        try:
            antwort = json.load(urllib.request.urlopen(anfrage))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ergebnis
            raise
        for d in antwort.get("documents", []):
            eintrag = {k: wert(v) for k, v in d.get("fields", {}).items()}
            eintrag["_id"] = d["name"].rsplit("/", 1)[-1]
            ergebnis.append(eintrag)
        marke = antwort.get("nextPageToken")
        if not marke:
            return ergebnis


def sauber(name):
    """Dateinamensicher, aber noch lesbar."""
    n = re.sub(r"[^\w\s.-]", "", str(name or "ohne-namen"), flags=re.UNICODE)
    return re.sub(r"\s+", "-", n.strip())[:60] or "ohne-namen"


def hauptlauf():
    nur = None
    if "--nur" in sys.argv:
        nur = sys.argv[sys.argv.index("--nur") + 1].lower()
    ohne_bilder = "--ohne-bilder" in sys.argv

    token = zugang()
    os.makedirs(ZIEL, exist_ok=True)

    index = {"erzeugtAm": time.strftime("%Y-%m-%dT%H:%M:%S"), "baustellen": []}
    geladen = 0

    for b in sammlung(token, "baustellen"):
        name = b.get("name") or b["_id"]
        if nur and nur not in name.lower():
            continue

        fotos = sammlung(token, f"baustellen/{b['_id']}/fotos")
        if not fotos:
            continue

        def wann(f):
            return f.get("aufgenommenAm") or f.get("erstelltAm") or ""

        fotos.sort(key=lambda f: (PHASEN_REIHENFOLGE.index(f.get("phase"))
                                  if f.get("phase") in PHASEN_REIHENFOLGE else 99,
                                  wann(f)))

        eintrag = {
            "id": b["_id"],
            "name": name,
            "adresse": b.get("adresse"),
            "status": b.get("status"),
            "fotos": [],
        }

        for nr, f in enumerate(fotos, 1):
            phase = f.get("phase") or "Ohne-Phase"
            tag = (wann(f) or "")[:10] or "ohne-datum"
            unterordner = os.path.join(ZIEL, sauber(name), sauber(phase))
            dateiname = f"{tag}_{nr:03d}.jpg"
            relativ = os.path.join(sauber(name), sauber(phase), dateiname)

            if not ohne_bilder and f.get("url"):
                ziel = os.path.join(unterordner, dateiname)
                if not os.path.exists(ziel):
                    os.makedirs(unterordner, exist_ok=True)
                    try:
                        urllib.request.urlretrieve(f["url"], ziel)
                        geladen += 1
                    except Exception as e:
                        print(f"  ! {relativ}: {e}")
                        continue

            eintrag["fotos"].append({
                "phase": phase,
                "notiz": f.get("notiz") or "",
                "aufgenommenAm": f.get("aufgenommenAm"),
                "hochgeladenAm": f.get("erstelltAm"),
                "url": f.get("url"),
                "datei": relativ,
            })

        index["baustellen"].append(eintrag)
        print(f"  {name}: {len(eintrag['fotos'])} Fotos")

    with open(os.path.join(ZIEL, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    gesamt = sum(len(b["fotos"]) for b in index["baustellen"])
    print(f"\n{gesamt} Fotos aus {len(index['baustellen'])} Baustellen in {ZIEL}")
    if not ohne_bilder:
        print(f"{geladen} Bilddateien neu heruntergeladen.")


if __name__ == "__main__":
    hauptlauf()
