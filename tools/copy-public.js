// Kopiert die statischen PWA-Dateien aus public/ nach dist/.
// `expo export --platform web` (klassischer Metro-Web-Export, kein Expo
// Router) kopiert public/ NICHT automatisch — anders als Expo Router.
// Ohne diesen Schritt fehlen manifest.json und die App-Icons im Export.
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(publicDir)) {
  console.log('Kein public/-Ordner vorhanden — nichts zu kopieren.');
  process.exit(0);
}

for (const datei of fs.readdirSync(publicDir)) {
  fs.copyFileSync(path.join(publicDir, datei), path.join(distDir, datei));
  console.log(`public/${datei} → dist/${datei}`);
}
