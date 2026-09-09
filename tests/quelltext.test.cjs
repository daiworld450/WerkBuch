// ---------------------------------------------------------------------------
// Prüft, dass sich JEDE Quelldatei überhaupt übersetzen lässt.
//
// Klingt banal, ist es nicht: Ein einzelnes falsches Anführungszeichen in einem
// deutschen Text — „so“ statt "so" — beendet die Zeichenkette mittendrin und
// legt die ganze App lahm. Aufgefallen wäre das bisher erst im Browser, nach
// zwei Minuten Bauzeit. Hier fällt es in einer Sekunde auf.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const wurzel = path.join(__dirname, "..", "src");

function alleDateien(ordner) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...alleDateien(p));
    else if (eintrag.name.endsWith(".js")) gefunden.push(p);
  }
  return gefunden;
}

const dateien = alleDateien(wurzel);

test(`Alle ${dateien.length} Quelldateien lassen sich übersetzen`, () => {
  const kaputt = [];
  for (const datei of dateien) {
    try {
      babel.transformSync(fs.readFileSync(datei, "utf8"), {
        filename: datei,
        babelrc: false,
        configFile: false,
        presets: [[require.resolve("babel-preset-expo"), { jsxRuntime: "automatic" }]],
      });
    } catch (e) {
      kaputt.push(`${path.relative(wurzel, datei)}: ${String(e.message).split("\n")[0]}`);
    }
  }
  assert.deepEqual(kaputt, [], "diese Dateien haben einen Syntaxfehler");
});
