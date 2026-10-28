// Startet das Filament-Lager: Weboberfläche, Datenspeicher und Bambu-Anbindung.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { PrinterManager } from './bambu/printer.js';
import { Store } from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.LAGER_DATEI || path.join(root, 'data', 'lager.json');
const PASSWORD = process.env.LAGER_PASSWORT || '';
// Unter Plesk (Phusion Passenger) ist das Lager aus dem Internet erreichbar
// und braucht deshalb ein Passwort.
const ON_WEBSERVER = Boolean(globalThis.PhusionPassenger || process.env.PASSENGER_APP_ENV);
const AUTO_SYNC_MS = 10 * 60 * 1000;

const store = new Store(DATA_FILE);
await store.load();

const printers = new PrinterManager();
const app = createApp({
  store, printers, publicDir: path.join(root, 'public'), password: PASSWORD, requirePassword: ON_WEBSERVER,
});
if (ON_WEBSERVER && !PASSWORD) console.error('LAGER_PASSWORT fehlt: Das Lager bleibt gesperrt, bis ein Passwort gesetzt ist.');
app.locals.startBambu();

setInterval(() => {
  app.locals.autoSync().catch((err) => console.error('Automatischer Bambu-Abgleich fehlgeschlagen:', err.message));
}, AUTO_SYNC_MS).unref();

// Sicherung: beim Start und dann stündlich prüfen, ob es die von heute schon gibt.
// Plesk hält die App im Leerlauf an; dann sichert der nächste Start.
const dailyBackup = () => app.locals.backups.daily().catch((err) => console.error('Sicherung fehlgeschlagen:', err.message));
setTimeout(dailyBackup, 10 * 1000).unref();
setInterval(dailyBackup, 60 * 60 * 1000).unref();

// DHL-Sendungen: alle 30 Minuten nachsehen, welche wieder dran sind
// (jede höchstens alle 3 Stunden), zuerst kurz nach dem Start.
setTimeout(() => app.locals.tracker.checkDue(), 60 * 1000).unref();
setInterval(() => app.locals.tracker.checkDue(), 30 * 60 * 1000).unref();

// Express ruft den Callback auch bei einem Fehler auf (z. B. Port belegt).
const server = app.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE'
      ? `Port ${PORT} ist schon belegt. Läuft das Filament-Lager bereits in einem anderen Fenster?`
      : `Server konnte nicht starten: ${err.message}`);
    printers.stopAll();
    process.exit(1);
  }
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log(`Filament-Lager läuft: http://localhost:${PORT}`);
  if (lan.length) console.log(`Im Heimnetz (z. B. am Handy): ${lan.join(', ')}`);
  console.log(`Daten: ${DATA_FILE}`);
});

function shutdown() {
  printers.stopAll();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
