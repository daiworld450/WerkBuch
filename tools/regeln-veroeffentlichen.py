#!/usr/bin/env python3
"""
regeln-veroeffentlichen.py — bringt firestore.rules in Betrieb.

Warum nicht `firebase deploy`: Die Firebase-CLI ist auf diesem Mac nicht
angemeldet, und ihr Umweg scheitert an einer Vorabprüfung (serviceusage → 403),
obwohl das Dienstkonto die eigentliche Aufgabe darf. Die REST-Schnittstelle
funktioniert direkt.

Der erste Schritt (rulesets) prüft die Regeln bereits: Ist etwas syntaktisch
falsch, wird es hier abgelehnt und NICHTS veröffentlicht.

    python3 BerisaBauApp/tools/regeln-veroeffentlichen.py
    python3 BerisaBauApp/tools/regeln-veroeffentlichen.py --nur-pruefen
"""

import json
import os
import sys
import time
import base64
import urllib.request
import urllib.parse
import urllib.error

PROJEKT = "berisa-bau"
HIER = os.path.dirname(os.path.abspath(__file__))
REGELN = os.path.join(HIER, "..", "firestore.rules")
SCHLUESSEL = os.path.join(HIER, "..", ".secrets", "firebase-adminsdk.json")


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
        "scope": "https://www.googleapis.com/auth/firebase",
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
        }).encode())
    return json.load(urllib.request.urlopen(anfrage))["access_token"]


def ruf(token, methode, url, koerper=None):
    daten = json.dumps(koerper).encode() if koerper is not None else None
    anfrage = urllib.request.Request(
        url, data=daten, method=methode,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        return True, json.load(urllib.request.urlopen(anfrage))
    except urllib.error.HTTPError as e:
        return False, e.read().decode()


def hauptlauf():
    nur_pruefen = "--nur-pruefen" in sys.argv
    quelle = open(REGELN).read()
    token = zugang()

    ok, antwort = ruf(token, "POST",
                      f"https://firebaserules.googleapis.com/v1/projects/{PROJEKT}/rulesets",
                      {"source": {"files": [{"name": "firestore.rules", "content": quelle}]}})
    if not ok:
        print("Die Regeln wurden ABGELEHNT — es ist nichts veröffentlicht worden.\n")
        print(antwort[:3000])
        sys.exit(1)

    name = antwort["name"]
    print(f"Regeln geprüft und angenommen: {name.rsplit('/', 1)[-1]}")

    if nur_pruefen:
        print("(--nur-pruefen: nicht veröffentlicht)")
        return

    ok, antwort = ruf(token, "PATCH",
                      f"https://firebaserules.googleapis.com/v1/projects/{PROJEKT}/releases/cloud.firestore",
                      {"release": {
                          "name": f"projects/{PROJEKT}/releases/cloud.firestore",
                          "rulesetName": name}})
    if not ok:
        print("Veröffentlichen fehlgeschlagen:\n" + antwort[:2000])
        sys.exit(1)

    print("Veröffentlicht. Ab sofort gelten die neuen Regeln.")


if __name__ == "__main__":
    hauptlauf()
