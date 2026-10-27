// Entfernung für die Lieferung ohne Post: Adressen über OpenStreetMap finden
// (Nominatim) und die Fahrstrecke berechnen (OSRM). Beides ist kostenlos und
// ohne Schlüssel, aber für wenige Abfragen gedacht; deshalb merkt sich das
// Lager Orte und Strecken.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const AGENT = 'Filament-Lager/1.0 (privates 3D-Druck-Lager)';
const MAX_CACHE = 300;

const key = (address) => String(address || '').toLowerCase().replace(/[\s,]+/g, ' ').trim();

export function normalizeGeo(input) {
  const src = input && typeof input === 'object' ? input : {};
  const keep = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).slice(-MAX_CACHE));
  return { places: keep(src.places), routes: keep(src.routes) };
}

export class Router {
  constructor({ store, fetchFn = (...a) => fetch(...a) }) {
    this.store = store;
    this.fetch = fetchFn;
    this.last = 0; // Nominatim: höchstens eine Abfrage pro Sekunde
  }

  get cache() {
    if (!this.store.data.geo) this.store.data.geo = normalizeGeo();
    return this.store.data.geo;
  }

  async get(url) {
    let res;
    try {
      res = await this.fetch(url, { headers: { 'User-Agent': AGENT, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(10000) });
    } catch (err) {
      throw new Error(err.name === 'TimeoutError' ? 'Der Kartendienst antwortet nicht.' : `Kartendienst nicht erreichbar: ${err.message}`);
    }
    if (!res.ok) throw new Error(`Der Kartendienst antwortet mit Fehler ${res.status}.`);
    return res.json();
  }

  // Adresse -> { lat, lon, label }
  async place(address) {
    const k = key(address);
    if (!k) throw new Error('Die Adresse fehlt.');
    if (this.cache.places[k]) return this.cache.places[k];
    const wait = this.last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => { setTimeout(r, wait).unref(); });
    this.last = Date.now();
    const q = String(address).replace(/\s*\n\s*/g, ', ');
    const list = await this.get(`${NOMINATIM}?format=jsonv2&limit=1&addressdetails=0&countrycodes=de,at,ch&q=${encodeURIComponent(q)}`);
    const hit = Array.isArray(list) ? list[0] : null;
    if (!hit) throw new Error(`Die Adresse „${q}“ wurde nicht gefunden. Straße, Hausnummer, PLZ und Ort prüfen.`);
    const p = { lat: Number(hit.lat), lon: Number(hit.lon), label: String(hit.display_name || q).split(', ').slice(0, 4).join(', ') };
    this.cache.places[k] = p;
    return p;
  }

  // Fahrstrecke von -> nach: { km, minutes, from, to } (eine Richtung)
  async distance(fromAddress, toAddress) {
    const from = await this.place(fromAddress);
    const to = await this.place(toAddress);
    const rk = `${from.lat.toFixed(5)},${from.lon.toFixed(5)}>${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
    let r = this.cache.routes[rk];
    if (!r) {
      const data = await this.get(`${OSRM}${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`);
      const route = data && data.code === 'Ok' && Array.isArray(data.routes) ? data.routes[0] : null;
      if (!route) throw new Error('Für diese Adressen wurde keine Strecke gefunden.');
      r = { km: Math.round(route.distance / 100) / 10, minutes: Math.round(route.duration / 60) };
      this.cache.routes[rk] = r;
    }
    await this.store.save();
    return {
      ...r, from: from.label, to: to.label,
    };
  }
}
