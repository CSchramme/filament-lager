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
const AUTO_PULL_MS = 15 * 60 * 1000;

const store = new Store(DATA_FILE);
await store.load();

const printers = new PrinterManager();
const app = createApp({ store, printers, publicDir: path.join(root, 'public'), password: PASSWORD });
printers.sync(store.bambu.printers);

setInterval(() => {
  app.locals.autoPull().catch((err) => console.error('Automatischer Bambu-Abgleich fehlgeschlagen:', err.message));
}, AUTO_PULL_MS).unref();

const server = app.listen(PORT, '0.0.0.0', () => {
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
