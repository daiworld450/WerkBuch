#!/usr/bin/env python3
"""
leistungen-uebernehmen.py — holt den Leistungskatalog aus dem Angebotswerkzeug
in die App.

Warum ein Skript statt Abschreiben: Preise, Kurz- und Langtexte samt der
Verweise auf die einschlägigen DIN-Normen liegen im Betrieb bereits gepflegt
unter angebote-werkzeug/leistungen.json. Zwei getrennt gepflegte Preislisten
waeren schlimmer als eine an der falschen Stelle. Dieses Skript uebernimmt sie
unveraendert; geaendert wird weiterhin nur die eine Quelle.

    python3 BerisaBauApp/tools/leistungen-uebernehmen.py
"""
import json, os

HIER = os.path.dirname(os.path.abspath(__file__))
QUELLE = os.path.join(HIER, "..", "..", "angebote-werkzeug", "leistungen.json")
ZIEL = os.path.join(HIER, "..", "src", "daten", "leistungen.js")

d = json.load(open(QUELLE))
einheiten = d["einheiten_standard"]

leistungen = []
for schluessel, l in sorted(d["leistungen"].items(), key=lambda x: x[1].get("reihenfolge", 999)):
    leistungen.append({
        "schluessel": schluessel,
        "reihenfolge": l.get("reihenfolge", 999),
        "kurztext": l["kurztext"],
        "langtext": l.get("langtext", ""),
        "einheit": einheiten.get(l.get("einheit"), l.get("einheit", "pauschal")),
        # In CENT, wie ueberall dort, wo es um Geld geht.
        "preisCent": int(round(float(l.get("preis", 0)) * 100)),
        "arbeitsanteil": l.get("arbeitsanteil"),
    })

gewerke = []
for schluessel, g in d["gewerke"].items():
    gewerke.append({
        "schluessel": schluessel,
        "bezeichnung": g["bezeichnung"],
        "betreff": g.get("betreff", g["bezeichnung"]),
        "positionen": [{"schluessel": p[0], "formel": p[1]} for p in g["positionen"]],
    })

kopf = '''// ---------------------------------------------------------------------------
// leistungen.js — der Leistungskatalog von Berisa Bau.
//
// AUTOMATISCH ERZEUGT von tools/leistungen-uebernehmen.py aus
// angebote-werkzeug/leistungen.json. Nicht von Hand aendern — Aenderungen
// gehoeren in die Quelle, sonst laufen zwei Preislisten auseinander.
//
// Die Langtexte enthalten die Verweise auf die einschlaegigen DIN-Normen und
// die anerkannten Regeln der Technik. Sie stehen so im Angebot beim Kunden.
//
// Preise sind RICHTPREISE in ganzen Cent, netto.
// ---------------------------------------------------------------------------

'''

with open(ZIEL, "w") as f:
    f.write(kopf)
    f.write("export const LEISTUNGEN = " + json.dumps(leistungen, ensure_ascii=False, indent=2) + ";\n\n")
    f.write("export const GEWERKE = " + json.dumps(gewerke, ensure_ascii=False, indent=2) + ";\n\n")
    f.write("export default { LEISTUNGEN, GEWERKE };\n")

din = sum(1 for l in leistungen if "DIN" in l["langtext"])
print(f"{len(leistungen)} Leistungen, {len(gewerke)} Gewerke, {din} mit DIN-Verweis → src/daten/leistungen.js")
