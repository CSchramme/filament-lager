// Speichert den gesamten Bestand als JSON-Datei. Schreibvorgänge laufen
// nacheinander und über eine temporäre Datei, damit nichts halb geschrieben wird.
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assignNumbers, migratePriceList, normalizeArchivedSpool, nextReceiptNr, normalizeCustomer, normalizeExpense, normalizeOffer, normalizePowerPayment, normalizeSale,
  normalizeSettings, normalizeSpool, normalizeStockItem, placeList,
} from '../public/js/domain.js';
import { seedSpools } from '../public/js/seed.js';
import { normalizeDhl } from './dhl.js';
import { normalizeNotify } from './notify.js';

function emptyBambu() {
  return {
    cloud: {
      region: 'global', token: '', account: '', connectedAt: '', lastPullAt: '', lastPushAt: '', lastError: '',
      mqttUser: '', devices: [],
    },
    printers: [],
    // autoSync: Filament Manager automatisch holen, cloudAms: AMS über die Bambu Cloud
    options: { autoAms: true, amsWeights: false, autoSync: true, cloudAms: true },
  };
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
      const bambu = emptyBambu();
      const src = raw.bambu || {};
      this.data = {
        version: 1,
        settings: normalizeSettings(raw.settings),
        spools: (raw.spools || []).map((s) => normalizeSpool(s, { keepTimestamps: true })),
        bambu: {
          cloud: { ...bambu.cloud, ...(src.cloud || {}) },
          printers: Array.isArray(src.printers) ? src.printers : [],
          options: { ...bambu.options, ...(src.options || {}) },
        },
      };
      delete this.data.bambu.options.autoPull; // ersetzt durch autoSync
      this.data.nextNr = raw.nextNr;
      this.data.apiKey = raw.apiKey || '';
      this.data.tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
      this.data.sales = (Array.isArray(raw.sales) ? raw.sales : []).map((x) => normalizeSale(x));
      this.data.receiptSeq = raw.receiptSeq || {};
      // Verkäufe aus der Zeit vor den Belegnummern nachnummerieren, ältester zuerst.
      for (const sale of [...this.data.sales].reverse()) if (!sale.nr) sale.nr = nextReceiptNr(this.data, sale.date);
      this.data.powerPayments = (Array.isArray(raw.powerPayments) ? raw.powerPayments : []).map((x) => normalizePowerPayment(x));
      this.data.offers = (Array.isArray(raw.offers) ? raw.offers : []).map((x) => normalizeOffer(x));
      this.data.offerSeq = raw.offerSeq || {};
      this.data.notify = normalizeNotify(raw.notify);
      this.data.stock = (Array.isArray(raw.stock) ? raw.stock : []).map((x) => normalizeStockItem(x, { now: x.updatedAt }));
      this.data.customers = (Array.isArray(raw.customers) ? raw.customers : []).map((x) => normalizeCustomer(x));
      this.data.expenses = (Array.isArray(raw.expenses) ? raw.expenses : []).map((x) => normalizeExpense(x));
      this.data.dhl = normalizeDhl(raw.dhl);
      this.data.spoolArchive = (Array.isArray(raw.spoolArchive) ? raw.spoolArchive : []).map((x) => normalizeArchivedSpool(x));
      assignNumbers(this.data);
      this.data.settings.places = placeList(this.data.settings, this.data.spools);
      if (migratePriceList(raw.settings, this.data)) await this.save();
    } else {
      this.data = {
        version: 1, settings: normalizeSettings(), spools: seedSpools(), bambu: emptyBambu(), nextNr: 1, apiKey: '', tasks: [], sales: [], receiptSeq: {}, powerPayments: [],
        offers: [], offerSeq: {}, notify: normalizeNotify(), stock: [], customers: [], expenses: [], dhl: normalizeDhl(), spoolArchive: [],
      };
      await this.save();
    }
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
