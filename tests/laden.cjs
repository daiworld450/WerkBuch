// ---------------------------------------------------------------------------
// laden.cjs — macht die App-Quelldateien für den Node-Testrunner lesbar.
//
// Die Bildschirme und Helfer sind in moderner Modulschreibweise geschrieben
// (import/export). Node liest eine .js-Datei ohne weiteres Zutun aber als
// klassisches CommonJS-Modul und bricht bei "export" mit einem Syntaxfehler ab.
//
// Statt die ganze App umzustellen (was den Metro-Bundler und damit den Bau
// gefährden würde), wird hier nur FÜR DEN TESTLAUF übersetzt: ein Haken im
// Ladevorgang schickt jede .js-Datei aus src/ durch Babel, das ohnehin schon
// im Projekt liegt.
//
// Damit bleibt die App unangetastet und die reinen Rechenfunktionen sind
// trotzdem prüfbar — ohne Jest, ohne zusätzliche Pakete.
//
// Verwendung in einer Testdatei:
//     require("./laden.cjs");
//     const { kalkuliere } = require("../src/util/kalkulation.js");
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const wurzel = path.join(__dirname, "..");
const urspruenglich = require.extensions[".js"];

require.extensions[".js"] = function (modul, dateipfad) {
  const inSrc = dateipfad.startsWith(path.join(wurzel, "src"));
  if (!inSrc) return urspruenglich(modul, dateipfad);

  const quelle = fs.readFileSync(dateipfad, "utf8");
  const { code } = babel.transformSync(quelle, {
    filename: dateipfad,
    babelrc: false,
    configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  modul._compile(code, dateipfad);
};
