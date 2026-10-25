// Schnittstelle für andere Programme (Home Assistant, Skripte, Waagen,
// Dashboards): Bestand lesen und das Gewicht einer Rolle ändern, sonst nichts.
// Zugriff mit API-Schlüssel, alternativ mit der Anmeldung der Weboberfläche.
// Feldnamen sind deutsch wie die Oberfläche.
import crypto from 'node:crypto';
import express from 'express';
import {
  amsSlots, findSpoolByRef, grossOf, normalizeSpool, remainingShare, spoolPlace, spoolTypeOf, stockLevel, weightPatch,
} from '../public/js/domain.js';

export function newApiKey() {
  return crypto.randomBytes(24).toString('base64url');
}

function givenKey(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-api-key'] || req.query.key || '').trim();
}

function keyMatches(given, key) {
  if (!given || !key) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function spoolOut(s, settings) {
  const place = spoolPlace(s);
  return {
    nr: s.nr,
    id: s.id,
    material: s.material,
    hersteller: s.brand,
    farbe: s.colorName,
    farbcode: s.colorHex,
    rest_g: s.netWeight,
    kauf_g: s.purchaseWeight,
    mit_spule_g: grossOf(s, settings),
    prozent: Math.round(remainingShare(s) * 100),
    status: stockLevel(s, settings),
    geoeffnet: s.opened,
    im_ams: s.inAms,
    ams_slot: s.inAms && s.bambu.slot ? s.bambu.slot : null,
    paket: !s.inAms && s.location ? s.location : null,
    platz: place.label,
    spulenart: spoolTypeOf(s, settings).name,
    notiz: s.note,
    preis_eur: s.price,
    bambu_id: s.bambu.cloudId,
    rfid: s.bambu.rfid || null,
    geaendert: s.updatedAt,
  };
}

function group(spools, keyOf, describe) {
  const map = new Map();
  for (const s of spools) {
    const key = keyOf(s);
    const g = map.get(key) || { ...describe(s), spulen: 0, rest_g: 0, nr: [] };
    g.spulen += 1;
    g.rest_g += s.netWeight;
    g.nr.push(s.nr);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.rest_g - a.rest_g);
}

export function summaryOut(spools, settings) {
  const byColor = group(spools, (s) => (s.colorName || s.colorHex).toLowerCase(), (s) => ({ farbe: s.colorName || s.colorHex, farbcode: s.colorHex }));
  for (const c of byColor) {
    const members = spools.filter((s) => c.nr.includes(s.nr));
    c.materialien = group(members, (s) => s.material, (s) => ({ material: s.material })).map(({ nr, ...m }) => m);
  }
  const level = (s) => stockLevel(s, settings);
  return {
    stand: new Date().toISOString(),
    spulen: spools.length,
    gesamt_g: spools.reduce((a, s) => a + s.netWeight, 0),
    im_ams: spools.filter((s) => s.inAms).map((s) => s.nr),
    knapp: spools.filter((s) => level(s) === 'knapp').map((s) => s.nr),
    leer: spools.filter((s) => level(s) === 'leer').map((s) => s.nr),
    knapp_grenze: `weniger als 1/${settings.lowStockPart} des Kaufgewichts`,
    nach_farbe: byColor,
    nach_material: group(spools, (s) => s.material, (s) => ({ material: s.material })),
    nach_platz: group(spools, (s) => spoolPlace(s).label, (s) => ({ platz: spoolPlace(s).label })),
  };
}

// Filter für /spulen: Teiltreffer ohne Groß-/Kleinschreibung, Wahrheitswerte als true/false.
function matches(s, q, settings) {
  const has = (value, wanted) => String(value || '').toLowerCase().includes(String(wanted).toLowerCase());
  if (q.farbe && !has(s.colorName, q.farbe)) return false;
  if (q.material && !has(s.material, q.material)) return false;
  if (q.hersteller && !has(s.brand, q.hersteller)) return false;
  if (q.paket && (s.inAms || String(s.location).toLowerCase() !== String(q.paket).toLowerCase())) return false;
  if (q.status && stockLevel(s, settings) !== q.status) return false;
  if (q.im_ams !== undefined && String(s.inAms) !== String(q.im_ams)) return false;
  return true;
}

// apiKey(): aktueller Schlüssel; isLoggedIn(req): Anmeldung der Weboberfläche gilt auch.
export function createPublicApi({ store, apiKey, isLoggedIn }) {
  const router = express.Router();

  // Andere Webseiten dürfen lesen; der Schlüssel steckt im Header, nicht im Cookie.
  router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (keyMatches(givenKey(req), apiKey()) || isLoggedIn(req)) return next();
    const msg = apiKey()
      ? 'API-Schlüssel fehlt oder ist falsch. Mitschicken als Header X-API-Key oder als ?key=…'
      : 'Noch kein API-Schlüssel erzeugt. In der Weboberfläche unter Einstellungen → API erzeugen.';
    res.status(401).json({ fehler: msg });
  });

  router.get('/', (req, res) => res.json({
    name: 'Filament-Lager',
    endpunkte: {
      '/api/v1/bestand': 'Summen: gesamt, nach Farbe, Material und Platz, knappe Rollen',
      '/api/v1/spulen': 'Alle Rollen. Filter: farbe, material, hersteller, paket, status (neu|ok|knapp|leer), im_ams (true|false)',
      '/api/v1/spulen/{nr}': 'Eine Rolle über ihre Nummer',
      'POST /api/v1/spulen/{nr}/gewicht': 'Gewicht ändern mit genau einem Feld: rest_g, mit_spule_g oder verbraucht_g',
      '/api/v1/ams': 'Welche Rolle in welchem AMS-Slot liegt',
    },
  }));

  router.get('/bestand', (req, res) => res.json(summaryOut(store.spools, store.settings)));

  router.get('/spulen', (req, res) => {
    const list = store.spools.filter((s) => matches(s, req.query, store.settings));
    res.json({ anzahl: list.length, rest_g: list.reduce((a, s) => a + s.netWeight, 0), spulen: list.map((s) => spoolOut(s, store.settings)) });
  });

  router.get('/spulen/:ref', (req, res) => {
    const s = findSpoolByRef(store.spools, req.params.ref);
    if (!s) return res.status(404).json({ fehler: `Keine Rolle mit der Nummer ${req.params.ref}.` });
    res.json(spoolOut(s, store.settings));
  });

  // Gewicht ändern. Werte im JSON-Körper oder in der Adresse (?rest_g=650).
  async function changeWeight(req, res) {
    const idx = store.spools.indexOf(findSpoolByRef(store.spools, req.params.ref));
    if (idx < 0) return res.status(404).json({ fehler: `Keine Rolle mit der Nummer ${req.params.ref}.` });
    const src = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    const fields = ['rest_g', 'mit_spule_g', 'verbraucht_g'].filter((k) => src[k] !== undefined && String(src[k]).trim() !== '');
    if (fields.length !== 1) return res.status(400).json({ fehler: 'Bitte genau ein Feld angeben: rest_g, mit_spule_g oder verbraucht_g.' });
    const base = store.spools[idx];
    let patch;
    try {
      patch = weightPatch(base, store.settings, { net: src.rest_g, gross: src.mit_spule_g, used: src.verbraucht_g });
    } catch (err) {
      return res.status(400).json({ fehler: err.message });
    }
    store.spools[idx] = normalizeSpool(patch, { base });
    await store.save();
    res.json({ vorher_g: base.netWeight, ...spoolOut(store.spools[idx], store.settings) });
  }
  router.post('/spulen/:ref/gewicht', changeWeight);
  router.patch('/spulen/:ref', changeWeight);

  router.get('/ams', (req, res) => {
    const slots = amsSlots(store.settings, store.spools).map((slot) => {
      const s = store.spools.find((x) => x.inAms && x.bambu.slot === slot);
      return { slot, frei: !s, spule: s ? spoolOut(s, store.settings) : null };
    });
    const ohneSlot = store.spools.filter((s) => s.inAms && !s.bambu.slot).map((s) => spoolOut(s, store.settings));
    res.json({ slots, ohne_slot: ohneSlot });
  });

  router.use((req, res) => res.status(404).json({ fehler: 'Unbekannte Adresse. Übersicht unter /api/v1' }));
  return router;
}
