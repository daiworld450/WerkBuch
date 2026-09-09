// Schreibt src/version.js mit dem aktuellen Stand, BEVOR gebündelt wird.
// Muss vor `expo export` laufen — danach steckt der Wert fest im Bundle.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function kurzeKennung() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return 'ohne-git';
  }
}

const jetzt = new Date();
const zweistellig = (n) => String(n).padStart(2, '0');
const stand =
  `${zweistellig(jetzt.getDate())}.${zweistellig(jetzt.getMonth() + 1)}.${jetzt.getFullYear()}` +
  ` ${zweistellig(jetzt.getHours())}:${zweistellig(jetzt.getMinutes())}`;

const inhalt = `// Automatisch erzeugt von tools/version-schreiben.js — nicht von Hand ändern.
export const VERSION = {
  stand: ${JSON.stringify(stand)},
  kennung: ${JSON.stringify(kurzeKennung())},
  gebautAm: ${JSON.stringify(jetzt.toISOString())},
};

export default VERSION;
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'version.js'), inhalt);
console.log(`src/version.js: Stand ${stand} (${kurzeKennung()})`);
