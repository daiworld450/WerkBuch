// Nachbearbeitung von `expo export --platform web` für den Einsatz auf
// GitHub Pages.
//
// Zwei Dinge fehlen Expos Standard-Export für diesen Zweck:
//
// 1. iPhone-/PWA-Tags (Homescreen-Icon, App-Name, Vollbildstart, dunkler
//    Hintergrund) — Expo kennt sie nicht, sie müssen bei jedem Export neu
//    in dist/index.html eingefügt werden.
// 2. Ein Basis-Pfad-Präfix — GitHub Pages liefert ein Projekt-Repo unter
//    https://<user>.github.io/<repo>/ aus, während Expo alle Pfade absolut
//    ab "/" erzeugt (index.html, manifest.json, der JS-Bundle selbst über
//    "/assets/…"-Schriftarten). Ohne Umschreiben lädt auf GitHub Pages
//    weder eine Schriftart noch das Icon.
//
// Aufruf: node tools/patch-index.js [--base=/RepoName]
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

const baseArg = process.argv.find((a) => a.startsWith('--base='));
let base = baseArg ? baseArg.slice('--base='.length) : '';
if (base && !base.startsWith('/')) base = '/' + base;
if (base.endsWith('/')) base = base.slice(0, -1);

// --- 1) index.html: PWA-Tags einfügen + Pfade mit Basis versehen ---------
const indexPfad = path.join(distDir, 'index.html');
let html = fs.readFileSync(indexPfad, 'utf8');

if (!html.includes('apple-mobile-web-app-title')) {
  // Expo setzt "theme-color" bereits selbst (aus app.json web.themeColor) —
  // hier nicht doppeln, nur die iPhone-/PWA-spezifischen Tags ergänzen.
  const tags = `\n<link rel="manifest" href="${base}/manifest.json">
<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="WerkBuch">
<style>html,body{background:#0b0b0f}</style>
`;
  html = html.replace('</head>', tags + '</head>');
} else {
  // Erneuter Lauf (z.B. lokaler Test nach GitHub-Export) — Basis in
  // vorhandenen Tags aktualisieren statt zu duplizieren.
  html = html
    .replace(/href="[^"]*\/manifest\.json"/, `href="${base}/manifest.json"`)
    .replace(/href="[^"]*\/apple-touch-icon\.png"/, `href="${base}/apple-touch-icon.png"`);
}

html = html
  .replace('href="/favicon.ico" />', `href="${base}/favicon.ico" />\n`)
  .replace(/src="\/_expo\//, `src="${base}/_expo/`);

fs.writeFileSync(indexPfad, html);

// --- 2) manifest.json: Start-URL und Icon-Pfade -----------------------
const manifestPfad = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestPfad)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPfad, 'utf8'));
  manifest.start_url = `${base}/`;
  if (Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map((icon) => ({
      ...icon,
      src: icon.src.startsWith('/') ? `${base}${icon.src}` : icon.src,
    }));
  }
  fs.writeFileSync(manifestPfad, JSON.stringify(manifest, null, 2));
}

// --- 3) JS-Bundle: eingebettete "/assets/…"-Pfade (Schriftarten, Icons) -
if (base) {
  const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');
  if (fs.existsSync(jsDir)) {
    for (const datei of fs.readdirSync(jsDir)) {
      if (!datei.endsWith('.js')) continue;
      const p = path.join(jsDir, datei);
      let js = fs.readFileSync(p, 'utf8');
      const vorher = (js.match(/"\/assets\//g) || []).length;
      js = js.split('"/assets/').join(`"${base}/assets/`);
      fs.writeFileSync(p, js);
      console.log(`${datei}: ${vorher} Asset-Pfade auf "${base}/assets/" umgeschrieben.`);
    }
  }
}

// --- 4) 404.html für GitHub Pages (SPA hat keine URL-Routen, aber ein
//        direkter Aufruf einer Unterseite soll trotzdem die App laden) ---
fs.copyFileSync(indexPfad, path.join(distDir, '404.html'));

console.log(`dist/ für GitHub Pages vorbereitet (Basis-Pfad: "${base || '/'}").`);
