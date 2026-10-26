// Automatische Sicherungen: einmal am Tag eine Kopie des ganzen Lagers in
// data/backups/ (die letzten 14 Tage bleiben), dazu Sicherungen von Hand und
// vor jedem Zurückholen. Zum Herunterladen ohne Zugangsdaten.
import fs from 'node:fs/promises';
import path from 'node:path';

const KEEP_DAILY = 14;
const KEEP_OTHER = 10;
const NAME = /^lager-(\d{4}-\d{2}-\d{2})(?:-(\d{4,6}))?(?:-([a-z-]+))?\.json$/;

const pad = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export const KINDS = { taeglich: 'täglich', manuell: 'von Hand', 'vor-wiederherstellen': 'vor dem Zurückholen' };

// Kopie ohne Passwörter und Schlüssel (Bambu, Drucker, ntfy, DHL, API, Link)
export function withoutSecrets(data) {
  const copy = structuredClone(data);
  if (copy.bambu) {
    if (copy.bambu.cloud) copy.bambu.cloud = { ...copy.bambu.cloud, token: '', mqttUser: '' };
    copy.bambu.printers = (copy.bambu.printers || []).map((p) => ({ ...p, accessCode: '' }));
  }
  if (copy.notify) copy.notify = { ...copy.notify, token: '' };
  if (copy.dhl) copy.dhl = { ...copy.dhl, apiKey: '' };
  if (copy.share) copy.share = { token: '', createdAt: '' };
  copy.apiKey = '';
  return copy;
}

// Prüft, ob eine Datei eine vollständige Sicherung ist (nicht nur eine Spulenliste).
export function checkBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Die Datei ist keine Sicherung des Lagers.');
  if (raw.version !== 1 || !Array.isArray(raw.spools) || !raw.settings) {
    throw new Error(Array.isArray(raw.spools) && !raw.version
      ? 'Die Datei enthält nur Spulen und Einstellungen. Dafür „Import“ verwenden; „Zurückholen“ braucht eine vollständige Sicherung.'
      : 'Die Datei ist keine vollständige Sicherung des Lagers.');
  }
}

export class Backups {
  constructor({ store, dir, now = () => new Date() }) {
    this.store = store;
    this.dir = dir;
    this.now = now;
  }

  async list() {
    const names = await fs.readdir(this.dir).catch(() => []);
    const out = [];
    for (const name of names) {
      const m = NAME.exec(name);
      if (!m) continue;
      const st = await fs.stat(path.join(this.dir, name)).catch(() => null);
      if (!st) continue;
      out.push({
        name, date: m[1], kind: m[3] || 'taeglich', size: st.size, createdAt: st.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
  }

  file(name) {
    if (!NAME.test(name)) throw Object.assign(new Error('Unbekannte Sicherung.'), { status: 404 });
    return path.join(this.dir, name);
  }

  async create(kind = 'manuell') {
    const d = this.now();
    const name = kind === 'taeglich' ? `lager-${day(d)}.json` : `lager-${day(d)}-${clock(d)}-${kind}.json`;
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    await this.store.queue.catch(() => {}); // laufendes Speichern abwarten
    const tmp = path.join(this.dir, `.${name}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(this.store.data), { mode: 0o600 });
    await fs.rename(tmp, path.join(this.dir, name));
    await this.prune();
    return name;
  }

  // Tägliche Sicherung, wenn es für heute noch keine gibt
  async daily() {
    const name = `lager-${day(this.now())}.json`;
    try {
      await fs.access(path.join(this.dir, name));
      return null;
    } catch {
      return this.create('taeglich');
    }
  }

  async prune() {
    const all = await this.list();
    const daily = all.filter((b) => b.kind === 'taeglich').slice(KEEP_DAILY);
    const other = all.filter((b) => b.kind !== 'taeglich').slice(KEEP_OTHER);
    for (const b of [...daily, ...other]) await fs.rm(path.join(this.dir, b.name), { force: true });
  }

  async read(name) {
    let text;
    try {
      text = await fs.readFile(this.file(name), 'utf8');
    } catch (err) {
      if (err.status) throw err;
      throw Object.assign(new Error('Sicherung nicht gefunden.'), { status: 404 });
    }
    return JSON.parse(text);
  }

  // Sicherung zurückholen; vorher wird der jetzige Stand gesichert.
  async restore(raw) {
    checkBackup(raw);
    const before = await this.create('vor-wiederherstellen');
    await this.store.replace(raw);
    return before;
  }
}
