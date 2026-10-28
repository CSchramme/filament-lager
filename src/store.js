// Speichert den gesamten Bestand als JSON-Datei. Schreibvorgänge laufen
// nacheinander und über eine temporäre Datei, damit nichts halb geschrieben wird.
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assignNumbers, migratePriceList, normalizeArchivedSpool, normalizeDelivery, normalizeGift, nextReceiptNr, normalizeCustomer, normalizeExpense, normalizeOffer, normalizePowerPayment, normalizeSale,
  normalizeSettings, normalizeSpool, normalizeStockItem, placeList,
} from '../public/js/domain.js';
import { seedSpools } from '../public/js/seed.js';
import { normalizeAutoBook } from './bambu/autobook.js';
import { normalizeDhl } from './dhl.js';
import { normalizeGeo } from './route.js';
import { normalizeNotify } from './notify.js';

function emptyBambu() {
  return {
    cloud: {
      region: 'global', token: '', account: '', connectedAt: '', lastPullAt: '', lastPushAt: '', lastError: '',
      mqttUser: '', devices: [],
    },
    printers: [],
    // autoSync: Filament Manager automatisch holen, cloudAms: AMS über die Bambu Cloud
    // autoBook: Filament bei Druckende abbuchen
    options: {
      autoAms: true, amsWeights: false, autoSync: true, cloudAms: true, autoBook: false,
    },
  };
}

// Bereiche, die beim Zurückholen einer Sicherung nicht ersetzt werden
export const SECRET_KEYS = ['bambu', 'notify', 'dhl', 'apiKey', 'share'];

// Baut den Datenstand aus einer gelesenen Datei oder Sicherung.
export function dataFromRaw(raw) {
  const bambu = emptyBambu();
  const src = raw.bambu || {};
  const data = {
    version: 1,
    settings: normalizeSettings(raw.settings),
    spools: (raw.spools || []).map((s) => normalizeSpool(s, { keepTimestamps: true })),
    bambu: {
      cloud: { ...bambu.cloud, ...(src.cloud || {}) },
      printers: Array.isArray(src.printers) ? src.printers : [],
      options: { ...bambu.options, ...(src.options || {}) },
    },
  };
  delete data.bambu.options.autoPull; // ersetzt durch autoSync
  data.nextNr = raw.nextNr;
  data.apiKey = raw.apiKey || '';
  data.tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  data.sales = (Array.isArray(raw.sales) ? raw.sales : []).map((x) => normalizeSale(x));
  data.receiptSeq = raw.receiptSeq || {};
  // Verkäufe aus der Zeit vor den Belegnummern nachnummerieren, ältester zuerst.
  for (const sale of [...data.sales].reverse()) if (!sale.nr) sale.nr = nextReceiptNr(data, sale.date);
  data.powerPayments = (Array.isArray(raw.powerPayments) ? raw.powerPayments : []).map((x) => normalizePowerPayment(x));
  data.offers = (Array.isArray(raw.offers) ? raw.offers : []).map((x) => normalizeOffer(x));
  data.offerSeq = raw.offerSeq || {};
  data.notify = normalizeNotify(raw.notify);
  data.stock = (Array.isArray(raw.stock) ? raw.stock : []).map((x) => normalizeStockItem(x, { now: x.updatedAt }));
  data.customers = (Array.isArray(raw.customers) ? raw.customers : []).map((x) => normalizeCustomer(x));
  data.expenses = (Array.isArray(raw.expenses) ? raw.expenses : []).map((x) => normalizeExpense(x));
  data.dhl = normalizeDhl(raw.dhl);
  data.spoolArchive = (Array.isArray(raw.spoolArchive) ? raw.spoolArchive : []).map((x) => normalizeArchivedSpool(x));
  data.share = { token: String((raw.share && raw.share.token) || ''), createdAt: String((raw.share && raw.share.createdAt) || '') };
  data.autoBook = normalizeAutoBook(raw.autoBook);
  data.deliveries = (Array.isArray(raw.deliveries) ? raw.deliveries : []).map((x) => normalizeDelivery(x));
  data.geo = normalizeGeo(raw.geo);
  data.gifts = (Array.isArray(raw.gifts) ? raw.gifts : []).map((x) => normalizeGift(x));
  assignNumbers(data);
  data.settings.places = placeList(data.settings, data.spools);
  const migrated = migratePriceList(raw.settings, data);
  return { data, migrated };
}

export class Store {
  constructor(file) {
    this.file = file;
    this.data = null;
    this.queue = Promise.resolve();
    this.beforeSave = null; // z. B. Benachrichtigung bei knappen Rollen
  }

  async load() {
    let raw = null;
    try {
      raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Datei ${this.file} kann nicht gelesen werden: ${err.message}`);
    }
    if (raw) {
      const { data, migrated } = dataFromRaw(raw);
      this.data = data;
      if (migrated) await this.save();
    } else {
      this.data = {
        version: 1, settings: normalizeSettings(), spools: seedSpools(), bambu: emptyBambu(), nextNr: 1, apiKey: '', tasks: [], sales: [], receiptSeq: {}, powerPayments: [],
        offers: [], offerSeq: {}, notify: normalizeNotify(), stock: [], customers: [], expenses: [], dhl: normalizeDhl(), spoolArchive: [], share: { token: '', createdAt: '' }, autoBook: normalizeAutoBook(), deliveries: [], geo: normalizeGeo(), gifts: [],
      };
      await this.save();
    }
    return this.data;
  }

  // Sicherung zurückholen. Zugänge (Bambu, ntfy, DHL, API-Schlüssel, Link für
  // die Strom-Ansicht) bleiben, wie sie jetzt sind: Sicherungen zum
  // Herunterladen enthalten sie nicht, und alte sollen keine neuen überschreiben.
  async replace(raw) {
    const { data } = dataFromRaw(raw);
    for (const k of SECRET_KEYS) data[k] = this.data[k];
    this.data = data;
    await this.save();
    return this.data;
  }

  save() {
    if (this.beforeSave) {
      try {
        this.beforeSave();
      } catch (err) {
        console.error(err);
      }
    }
    // Pakete dauerhaft merken, damit ein leeres Paket nicht verschwindet.
    this.data.settings.places = placeList(this.data.settings, this.data.spools);
    assignNumbers(this.data);
    const json = JSON.stringify(this.data, null, 2);
    this.queue = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      await fs.writeFile(tmp, json, { mode: 0o600 });
      await fs.rename(tmp, this.file);
    });
    return this.queue;
  }

  get spools() {
    return this.data.spools;
  }

  get settings() {
    return this.data.settings;
  }

  get bambu() {
    return this.data.bambu;
  }

  findSpool(id) {
    return this.data.spools.find((s) => s.id === id) || null;
  }
}
