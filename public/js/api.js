// Datenzugriff der Oberfläche. Läuft die Seite über den Node-Server, gehen
// alle Änderungen dorthin. Ohne Server (z. B. als statische Seite) speichert
// das Lager im Browser; die Bambu-Anbindung ist dann nicht verfügbar.
import {
  newId, normalizeSettings, normalizeSpool, placeList, planMove, planPlaces,
} from './domain.js';
import { seedSpools } from './seed.js';

class ServerBackend {
  constructor() {
    this.mode = 'server';
  }

  async req(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new Error((data && data.error) || `Server antwortet mit ${res.status}.`);
    return data;
  }

  getState() { return this.req('GET', 'api/state'); }
  createSpools(spools) { return this.req('POST', 'api/spools', { spools }).then((d) => d.spools); }
  updateSpool(id, patch) { return this.req('PUT', 'api/spools/' + encodeURIComponent(id), patch).then((d) => d.spool); }
  deleteSpool(id) { return this.req('DELETE', 'api/spools/' + encodeURIComponent(id)); }
  saveSettings(settings) { return this.req('PUT', 'api/settings', settings).then((d) => d.settings); }
  importData(mode, spools, settings) { return this.req('POST', 'api/import', { mode, spools, settings }); }
  moveSpools(ids, target) { return this.req('POST', 'api/spools/move', { ids, target }); }
  places(action) { return this.req('POST', 'api/places', action); }

  // Bambu
  bambu() { return this.req('GET', 'api/bambu'); }
  login(account, password, region) { return this.req('POST', 'api/bambu/cloud/login', { account, password, region }); }
  loginCode(code) { return this.req('POST', 'api/bambu/cloud/code', { code }); }
  loginToken(token, region) { return this.req('POST', 'api/bambu/cloud/token', { token, region }); }
  logout() { return this.req('POST', 'api/bambu/cloud/logout', {}); }
  pullPreview() { return this.req('GET', 'api/bambu/cloud/pull'); }
  pull(keys) { return this.req('POST', 'api/bambu/cloud/pull', { keys }); }
  pushPreview() { return this.req('GET', 'api/bambu/cloud/push'); }
  push(keys) { return this.req('POST', 'api/bambu/cloud/push', { keys }); }
  setOptions(options) { return this.req('PUT', 'api/bambu/options', options); }
  addPrinter(p) { return this.req('POST', 'api/bambu/printers', p); }
  updatePrinter(id, p) { return this.req('PUT', 'api/bambu/printers/' + encodeURIComponent(id), p); }
  deletePrinter(id) { return this.req('DELETE', 'api/bambu/printers/' + encodeURIComponent(id)); }
  amsLink(printerId, slot, spoolId) { return this.req('POST', 'api/bambu/ams/link', { printerId, slot, spoolId }); }
  amsCreate(printerId, slot) { return this.req('POST', 'api/bambu/ams/create', { printerId, slot }); }
  amsWeight(printerId, slot, spoolId) { return this.req('POST', 'api/bambu/ams/weight', { printerId, slot, spoolId }); }
}

const STORAGE_KEY = 'filament-lager-v1';

class LocalBackend {
  constructor() {
    this.mode = 'local';
    this.memory = null;
  }

  read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Speicher gesperrt (privates Fenster o. Ä.): im Arbeitsspeicher weiterarbeiten.
    }
    return this.memory;
  }

  write(data) {
    // Pakete dauerhaft merken, damit ein leeres Paket nicht verschwindet.
    data.settings.places = placeList(data.settings, data.spools);
    this.memory = data;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // siehe read()
    }
  }

  load() {
    const raw = this.read();
    if (raw) {
      const data = {
        settings: normalizeSettings(raw.settings),
        spools: (raw.spools || []).map((s) => normalizeSpool(s, { keepTimestamps: true })),
      };
      data.settings.places = placeList(data.settings, data.spools);
      return data;
    }
    const data = { settings: normalizeSettings(), spools: seedSpools() };
    this.write(data);
    return data;
  }

  async getState() {
    return this.load();
  }

  async createSpools(spools) {
    const data = this.load();
    const created = spools.map((s) => normalizeSpool({ ...s, id: newId(), bambu: {} }));
    data.spools.push(...created);
    this.write(data);
    return created;
  }

  async updateSpool(id, patch) {
    const data = this.load();
    const idx = data.spools.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error('Spule nicht gefunden.');
    const { id: _id, createdAt, ...rest } = patch;
    data.spools[idx] = normalizeSpool(rest, { base: data.spools[idx] });
    this.write(data);
    return data.spools[idx];
  }

  async deleteSpool(id) {
    const data = this.load();
    data.spools = data.spools.filter((s) => s.id !== id);
    this.write(data);
  }

  async saveSettings(settings) {
    const data = this.load();
    data.settings = normalizeSettings(settings);
    this.write(data);
    return data.settings;
  }

  applyChanges(data, changes) {
    for (const { id, patch } of changes) {
      const idx = data.spools.findIndex((s) => s.id === id);
      if (idx >= 0) data.spools[idx] = normalizeSpool(patch, { base: data.spools[idx] });
    }
  }

  async moveSpools(ids, target) {
    const data = this.load();
    const changes = planMove(data.spools, ids, target);
    this.applyChanges(data, changes);
    this.write(data);
    return { spools: data.spools, swapped: changes.filter((c) => c.swapped).map((c) => c.id) };
  }

  async places(action) {
    const data = this.load();
    const plan = planPlaces(data.settings, data.spools, action);
    data.settings = normalizeSettings({ ...data.settings, places: plan.places });
    this.applyChanges(data, plan.changes);
    this.write(data);
    return data;
  }

  async importData(mode, spools = [], settings) {
    const data = this.load();
    if (settings) data.settings = normalizeSettings(settings);
    else if (mode !== 'append') data.settings.places = [];
    if (mode === 'seed') {
      data.spools = seedSpools();
    } else {
      const ids = new Set(mode === 'replace' ? [] : data.spools.map((s) => s.id));
      const incoming = spools.map((s) => normalizeSpool(ids.has(s.id) ? { ...s, id: newId() } : s, { keepTimestamps: true }));
      data.spools = mode === 'replace' ? incoming : [...data.spools, ...incoming];
    }
    this.write(data);
    return data;
  }
}

export async function createBackend() {
  try {
    const res = await fetch('api/health', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.mode === 'server') return new ServerBackend();
    }
  } catch {
    // kein Server erreichbar
  }
  return new LocalBackend();
}
