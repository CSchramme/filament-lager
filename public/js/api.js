// Datenzugriff der Oberfläche. Läuft die Seite über den Node-Server, gehen
// alle Änderungen dorthin. Ohne Server (z. B. als statische Seite) speichert
// das Lager im Browser; die Bambu-Anbindung ist dann nicht verfügbar.
import {
  assignNumbers, newId, nextOfferNr, nextReceiptNr, normalizeOffer, normalizePowerPayment, normalizeSale, normalizeSettings,
  normalizeSpool, placeList, planMove, planPlaces, saleFromOffer, salesSummary,
} from './domain.js';
import { seedSpools } from './seed.js';

class ServerBackend {
  // auth: 'none' (kein Passwort), 'ok' (angemeldet), 'required' (Anmeldung nötig),
  // 'missing' (Webserver ohne Passwort, gesperrt)
  constructor(auth) {
    this.mode = 'server';
    this.auth = auth || 'none';
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
    // Sitzung abgelaufen: neu laden zeigt die Anmeldung.
    if (res.status === 401 && data && data.login) location.reload();
    if (!res.ok) throw new Error((data && data.error) || `Server antwortet mit ${res.status}.`);
    return data;
  }

  appLogin(password) { return this.req('POST', 'api/login', { password }); }
  appLogout() { return this.req('POST', 'api/logout', {}); }
  getApiKey() { return this.req('GET', 'api/schluessel').then((d) => d.key); }
  tasks() { return this.req('GET', 'api/drucke'); }
  refreshTasks() { return this.req('POST', 'api/drucke/aktualisieren', {}); }
  sales() { return this.req('GET', 'api/verkaeufe'); }
  addSale(sale) { return this.req('POST', 'api/verkaeufe', sale); }
  updateSale(id, patch) { return this.req('PUT', 'api/verkaeufe/' + encodeURIComponent(id), patch); }
  deleteSale(id) { return this.req('DELETE', 'api/verkaeufe/' + encodeURIComponent(id)); }
  notifySettings() { return this.req('GET', 'api/benachrichtigungen'); }
  saveNotify(body) { return this.req('PUT', 'api/benachrichtigungen', body); }
  testNotify() { return this.req('POST', 'api/benachrichtigungen/test', {}); }
  offers() { return this.req('GET', 'api/angebote'); }
  addOffer(offer) { return this.req('POST', 'api/angebote', offer); }
  acceptOffer(id) { return this.req('POST', 'api/angebote/' + encodeURIComponent(id) + '/beleg', {}); }
  deleteOffer(id) { return this.req('DELETE', 'api/angebote/' + encodeURIComponent(id)); }
  powerPayments() { return this.req('GET', 'api/strom'); }
  addPowerPayment(p) { return this.req('POST', 'api/strom', p); }
  deletePowerPayment(id) { return this.req('DELETE', 'api/strom/' + encodeURIComponent(id)); }
  newApiKey() { return this.req('POST', 'api/schluessel', {}).then((d) => d.key); }

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
    assignNumbers(data);
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
        nextNr: raw.nextNr,
        sales: (Array.isArray(raw.sales) ? raw.sales : []).map((x) => normalizeSale(x)),
        receiptSeq: raw.receiptSeq || {},
        powerPayments: (Array.isArray(raw.powerPayments) ? raw.powerPayments : []).map((x) => normalizePowerPayment(x)),
        offers: (Array.isArray(raw.offers) ? raw.offers : []).map((x) => normalizeOffer(x)),
        offerSeq: raw.offerSeq || {},
      };
      // Verkäufe aus der Zeit vor den Belegnummern nachnummerieren, ältester zuerst.
      for (const sale of [...data.sales].reverse()) if (!sale.nr) sale.nr = nextReceiptNr(data, sale.date);
      data.settings.places = placeList(data.settings, data.spools);
      return assignNumbers(data);
    }
    const data = {
      settings: normalizeSettings(), spools: seedSpools(), nextNr: 1, sales: [], receiptSeq: {}, powerPayments: [], offers: [], offerSeq: {},
    };
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
    const { id: _id, nr, createdAt, ...rest } = patch;
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

  // Ohne Server gibt es keinen Druckverlauf von Bambu; Verkäufe liegen im Browser.
  async tasks() {
    return { connected: false, lastSync: '', tasks: [] };
  }

  async refreshTasks() {
    throw new Error('Der Druckverlauf braucht den Lager-Server und eine Bambu-Anmeldung.');
  }

  salesView(data) {
    return { sales: data.sales, summary: salesSummary(data.sales) };
  }

  async sales() {
    return this.salesView(this.load());
  }

  async addSale(sale) {
    const data = this.load();
    const created = normalizeSale({ ...sale, id: undefined, createdAt: undefined });
    created.nr = nextReceiptNr(data, created.date);
    data.sales.unshift(created);
    this.write(data);
    return { sale: created, ...this.salesView(data) };
  }

  async updateSale(id, patch) {
    const data = this.load();
    data.sales = data.sales.map((x) => (x.id === id ? normalizeSale({ ...x, ...patch, id: x.id, nr: x.nr, createdAt: x.createdAt }) : x));
    this.write(data);
    return this.salesView(data);
  }

  async offers() {
    return { offers: this.load().offers };
  }

  async addOffer(input) {
    const data = this.load();
    const offer = normalizeOffer({ ...input, id: undefined, createdAt: undefined, saleId: '', saleNr: '', acceptedAt: '' }, { days: data.settings.offerDays });
    offer.nr = nextOfferNr(data, offer.date);
    data.offers.unshift(offer);
    this.write(data);
    return { offer, offers: data.offers };
  }

  async acceptOffer(id) {
    const data = this.load();
    const offer = data.offers.find((x) => x.id === id);
    if (!offer) throw new Error('Angebot nicht gefunden.');
    if (offer.saleNr) throw new Error(`Aus diesem Angebot wurde schon Beleg ${offer.saleNr}.`);
    const sale = normalizeSale(saleFromOffer(offer));
    sale.nr = nextReceiptNr(data, sale.date);
    data.sales.unshift(sale);
    Object.assign(offer, { saleId: sale.id, saleNr: sale.nr, acceptedAt: new Date().toISOString() });
    this.write(data);
    return {
      sale, offer, offers: data.offers, ...this.salesView(data),
    };
  }

  async deleteOffer(id) {
    const data = this.load();
    data.offers = data.offers.filter((x) => x.id !== id);
    this.write(data);
    return { offers: data.offers };
  }

  async powerPayments() {
    return { payments: this.load().powerPayments };
  }

  async addPowerPayment(p) {
    const data = this.load();
    const payment = normalizePowerPayment({ ...p, id: undefined });
    data.powerPayments.unshift(payment);
    this.write(data);
    return { payment, payments: data.powerPayments };
  }

  async deletePowerPayment(id) {
    const data = this.load();
    data.powerPayments = data.powerPayments.filter((x) => x.id !== id);
    this.write(data);
    return { payments: data.powerPayments };
  }

  async deleteSale(id) {
    const data = this.load();
    data.sales = data.sales.filter((x) => x.id !== id);
    this.write(data);
    return this.salesView(data);
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
    if (mode !== 'append') data.nextNr = 1; // Nummerierung beginnt neu
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
      if (data && data.mode === 'server') return new ServerBackend(data.auth);
    }
  } catch {
    // kein Server erreichbar
  }
  return new LocalBackend();
}
