// ---------------------------------------------------------------------------
// metro.config.js
// Fix für das Firebase JS SDK unter Expo SDK 53+:
// Ohne diese Einstellungen lädt Metro über die "package exports" die
// Web-Variante von firebase/auth und wirft zur Laufzeit
// "Component auth has not been registered yet".
//   - sourceExts um "cjs" ergänzen
//   - unstable_enablePackageExports = false  (nutzt die klassische main-Auflösung)
// ---------------------------------------------------------------------------

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push("cjs");
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
