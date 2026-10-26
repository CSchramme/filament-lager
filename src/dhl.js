// DHL-Sendungsverfolgung über die API "Shipment Tracking - Unified" von DHL.
// Den kostenlosen Schlüssel gibt es auf developer.dhl.com (250 Abfragen am Tag,
// höchstens eine alle 5 Sekunden). Der Schlüssel bleibt auf dem Server.
// Ohne Schlüssel gibt es nur den Link zur Sendungsverfolgung auf dhl.de.
import { advanceOrder, normalizeTracking } from '../public/js/domain.js';

const API = 'https://api-eu.dhl.com/track/shipments';
const STATUS = ['pre-transit', 'transit', 'delivered', 'failure', 'unknown'];
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000; // eine Sendung höchstens alle 3 Stunden abfragen
const GIVE_UP_DAYS = 45; // ältere, nie zugestellte Sendungen nicht mehr abfragen
const GAP_MS = 5500; // Abstand zwischen zwei Abfragen

export function normalizeDhl(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    apiKey: String(src.apiKey || '').trim(),
    lastCheckAt: String(src.lastCheckAt || ''),
    lastError: String(src.lastError || ''),
  };
}

const placeOf = (x) => {
  const a = x && x.location && x.location.address;
  return a ? String(a.addressLocality || a.countryCode || '').trim() : '';
};

// Antwort der DHL-API -> Felder für sale.tracking
export function parseShipment(s) {
  const st = (s && s.status) || {};
  const status = STATUS.includes(st.statusCode) ? st.statusCode : 'unknown';
  const events = (Array.isArray(s && s.events) ? s.events : []).map((e) => ({
    time: String(e.timestamp || ''), text: String(e.description || e.status || '').trim(), place: placeOf(e),
  }));
  return {
    status,
    statusText: String(st.description || st.status || '').trim(),
    place: placeOf(st),
    updatedAt: String(st.timestamp || ''),
    deliveredAt: status === 'delivered' ? String(st.timestamp || '') : '',
    events,
  };
}

export async function fetchShipment(number, apiKey, fetchFn = (...a) => fetch(...a)) {
  let res;
  try {
    res = await fetchFn(`${API}?trackingNumber=${encodeURIComponent(number)}&language=de`, {
      headers: { 'DHL-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'DHL antwortet nicht.' : `DHL nicht erreichbar: ${err.message}`);
  }
  if (res.status === 404) {
    return {
      status: 'unknown', statusText: 'DHL kennt die Sendungsnummer noch nicht. Das dauert oft bis zur Abgabe in der Filiale.', place: '', updatedAt: '', deliveredAt: '', events: [],
    };
  }
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Der DHL-API-Schlüssel wird nicht angenommen.'), { key: true });
  if (res.status === 429) throw new Error('Zu viele Abfragen bei DHL, später geht es wieder.');
  if (!res.ok) throw new Error(`DHL antwortet mit Fehler ${res.status}.`);
  const data = await res.json();
  const s = Array.isArray(data.shipments) ? data.shipments[0] : null;
  if (!s) throw new Error('DHL hat keine Sendung geliefert.');
  return parseShipment(s);
}

export class Tracker {
  constructor({
    store, notifier = null, fetchFn = (...a) => fetch(...a), gapMs = GAP_MS, log = console,
  }) {
    this.store = store;
    this.notifier = notifier;
    this.fetch = fetchFn;
    this.gapMs = gapMs;
    this.log = log;
    this.running = null;
  }

  get config() {
    if (!this.store.data.dhl) this.store.data.dhl = normalizeDhl();
    return this.store.data.dhl;
  }

  view() {
    const c = this.config;
    return { hasKey: Boolean(c.apiKey), lastCheckAt: c.lastCheckAt, lastError: c.lastError };
  }

  // Fragt eine Sendung ab und trägt das Ergebnis am Beleg ein. Gibt den
  // aktuellen Beleg zurück. Der Beleg wird über die ID neu gesucht, weil er
  // während der Abfrage ersetzt worden sein kann.
  async check(saleId, { now = () => new Date().toISOString() } = {}) {
    const c = this.config;
    const before = this.store.data.sales.find((x) => x.id === saleId);
    if (!before || !before.tracking) return before || null;
    if (!c.apiKey) return before;
    const number = before.tracking.number;
    let patch;
    try {
      patch = { ...(await fetchShipment(number, c.apiKey, this.fetch)), error: '' };
      c.lastError = '';
    } catch (err) {
      patch = { error: err.message };
      c.lastError = err.message;
    }
    c.lastCheckAt = now();
    const sale = this.store.data.sales.find((x) => x.id === saleId);
    if (!sale || !sale.tracking || sale.tracking.number !== number) return sale || null;
    const wasDelivered = sale.tracking.status === 'delivered';
    sale.tracking = normalizeTracking({ ...sale.tracking, ...patch, checkedAt: now() });
    // Bestellstatus für den Kunden folgt der Sendung
    if (sale.tracking.status === 'delivered') advanceOrder(sale.order, 'zugestellt', now());
    else if (['transit', 'pre-transit'].includes(sale.tracking.status)) advanceOrder(sale.order, 'versendet', now());
    await this.store.save();
    if (!wasDelivered && sale.tracking.status === 'delivered' && this.notifier) {
      const who = sale.customer ? ` an ${sale.customer.split('\n')[0]}` : '';
      this.notifier.notify('delivered', {
        title: 'Paket zugestellt',
        message: `Beleg ${sale.nr}${who} ist zugestellt${sale.tracking.place ? ` (${sale.tracking.place})` : ''}.`,
        tags: ['package'],
        priority: 3,
        view: 'verkauf',
      });
    }
    return sale;
  }

  // Sendungen, die noch unterwegs sind und länger nicht abgefragt wurden
  due(nowMs = Date.now()) {
    const cutoff = new Date(nowMs - GIVE_UP_DAYS * 86400000).toISOString().slice(0, 10);
    return this.store.data.sales.filter((s) => s.tracking && s.tracking.status !== 'delivered' && s.date >= cutoff
      && (!s.tracking.checkedAt || nowMs - Date.parse(s.tracking.checkedAt) >= CHECK_EVERY_MS));
  }

  // Alle fälligen Sendungen nacheinander abfragen (läuft nie doppelt).
  checkDue() {
    if (!this.config.apiKey) return Promise.resolve(0);
    if (this.running) return this.running;
    this.running = (async () => {
      const list = this.due();
      for (const [i, s] of list.entries()) {
        if (i) await new Promise((r) => { setTimeout(r, this.gapMs).unref(); });
        await this.check(s.id);
        if (this.config.lastError && /Schlüssel|Zu viele/.test(this.config.lastError)) break;
      }
      return list.length;
    })().catch((err) => {
      this.log.error('Sendungsverfolgung:', err.message);
      return 0;
    }).finally(() => {
      this.running = null;
    });
    return this.running;
  }
}
