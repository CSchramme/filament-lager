// Fachlogik des Filament-Lagers. Wird im Browser und im Node-Server genutzt,
// deshalb ohne Abhängigkeiten und ohne DOM-Zugriffe.

export const MATERIALS = [
  'PLA Basic', 'PLA Matte', 'PLA Translucent', 'PLA Silk+', 'PLA Tough+', 'PLA Metal', 'PLA Sparkle',
  'PLA Marble', 'PLA Galaxy', 'PLA Glow', 'PLA Wood', 'PLA-CF', 'PETG HF', 'PETG Basic',
  'PETG Translucent', 'PETG-CF', 'ABS', 'ASA', 'PC', 'TPU 95A HF', 'TPU for AMS', 'PVA', 'Support for PLA',
];

export const BRANDS = ['Bambu Lab', 'Elegoo', 'eSUN', 'Sunlu', 'Polymaker', 'Prusament', 'Geeetech', 'Jayo', 'Overture'];

export const PURCHASE_WEIGHTS = [250, 500, 750, 1000, 2000, 3000];

// Farben der Bambu-Lab-Sortimente mit den deutschen Namen aus der Tabelle.
export const COLOR_PRESETS = [
  { name: 'Weiß', hex: '#FFFFFF' },
  { name: 'Hell Grau', hex: '#D1D3D5' },
  { name: 'Silber', hex: '#A6A9AA' },
  { name: 'Grau', hex: '#8E9089' },
  { name: 'Dunkelgrau', hex: '#545454' },
  { name: 'Blaugrau', hex: '#5B6579' },
  { name: 'Schwarz', hex: '#000000' },
  { name: 'Beige', hex: '#F7E6DE' },
  { name: 'Gelb', hex: '#F4EE2A' },
  { name: 'Sonnenblumengelb', hex: '#FEC600' },
  { name: 'Gold', hex: '#E4BD68' },
  { name: 'Kürbis Orange', hex: '#FF9016' },
  { name: 'Orange', hex: '#FF6A13' },
  { name: 'Rot', hex: '#C12E1F' },
  { name: 'Kastanienrot', hex: '#9D2235' },
  { name: 'Pink', hex: '#F55A74' },
  { name: 'Magenta', hex: '#EC008C' },
  { name: 'Lila', hex: '#5E43B7' },
  { name: 'Indigo Violett', hex: '#482960' },
  { name: 'Blau', hex: '#0A2989' },
  { name: 'Kobaltblau', hex: '#0056B8' },
  { name: 'Cyan', hex: '#0086D6' },
  { name: 'Türkis', hex: '#00B1B7' },
  { name: 'Bambus Grün', hex: '#00AE42' },
  { name: 'Mistelzweig Grün', hex: '#3F8E43' },
  { name: 'Hell Grün', hex: '#BECF00' },
  { name: 'Bronze', hex: '#847D48' },
  { name: 'Braun', hex: '#9D432C' },
  { name: 'Kakaobraun', hex: '#6F5034' },
];

// Bambu-Filament-IDs (tray_info_idx), damit Bambu Studio die Spule dem
// richtigen Profil zuordnet. Nur für Hersteller "Bambu Lab".
const BAMBU_FILAMENT_IDS = {
  'pla basic': 'GFA00', 'pla matte': 'GFA01', 'pla metal': 'GFA02', 'pla silk': 'GFA05', 'pla silk+': 'GFA06',
  'pla marble': 'GFA07', 'pla sparkle': 'GFA08', 'pla tough': 'GFA09', 'pla aero': 'GFA11', 'pla glow': 'GFA12',
  'pla dynamic': 'GFA13', 'pla galaxy': 'GFA15', 'pla wood': 'GFA16', 'pla-cf': 'GFA50',
  'abs': 'GFB00', 'asa': 'GFB01', 'pc': 'GFC00', 'petg basic': 'GFG00', 'petg translucent': 'GFG01',
  'petg hf': 'GFG02', 'petg-cf': 'GFG50', 'tpu 95a hf': 'GFU00', 'tpu 95a': 'GFU01', 'tpu for ams': 'GFU02',
  'pva': 'GFS04', 'support for pla': 'GFS02',
};

const BASE_TYPES = ['PLA-CF', 'PETG-CF', 'PET-CF', 'PA6-CF', 'PAHT-CF', 'PA-CF', 'ABS-GF', 'PLA', 'PETG', 'PCTG',
  'ABS', 'ASA', 'TPU', 'PC', 'PA', 'PVA', 'HIPS', 'BVOH', 'PPS'];

export function defaultSettings() {
  return {
    spoolTypes: [
      { id: 'plastik', name: 'Bambu Plastik', tare: 274 },
      { id: 'pappe', name: 'Pappe', tare: 0 },
    ],
    lowStockPart: 6, // knapp, wenn weniger als 1/6 des Kaufgewichts übrig ist
    amsUnits: 1,
    // Kostenrechner: Preis ohne eigenen Rollenpreis, Zuschläge in Prozent
    pricePerKg: 20,
    wearPct: 5,
    profitPct: 10,
    energyPrice: 0.3, // € pro kWh
    printerWatts: 120, // mittlere Leistung beim Drucken
    places: [],
  };
}

export function newId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function str(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function toInt(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Math.round(Number(String(v).replace(',', '.')));
  return Number.isFinite(n) ? n : fallback;
}

// Betrag mit Komma oder Punkt, auf Cent gerundet; leer -> null
function toMoney(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function toBool(v, fallback) {
  if (typeof v === 'boolean') return v;
  const s = str(v).toLowerCase();
  if (['ja', 'j', 'yes', 'y', 'true', '1', 'x', 'wahr'].includes(s)) return true;
  if (['nein', 'n', 'no', 'false', '0', 'falsch'].includes(s)) return false;
  return fallback;
}

// Nimmt "FF6A13", "#ff6a13" oder Bambus "FF6A13FF" an und liefert "#FF6A13".
export function normHex(v) {
  const s = str(v).replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) return '';
  return '#' + s.slice(0, 6).toUpperCase();
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorHexFor(name) {
  const key = str(name).toLowerCase().replace(/[\s-]+/g, ' ');
  const hit = COLOR_PRESETS.find((c) => c.name.toLowerCase() === key);
  return hit ? hit.hex : '';
}

// Farbname zu einem Hexwert: exakter Treffer oder die nächstgelegene Bambu-Farbe.
export function colorNameFor(hex) {
  const h = normHex(hex);
  if (!h) return '';
  let best = null;
  let bestDist = Infinity;
  const [r, g, b] = rgb(h);
  for (const c of COLOR_PRESETS) {
    const [r2, g2, b2] = rgb(c.hex);
    const d = Math.sqrt((r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best && bestDist <= 48 ? best.name : '';
}

// Abstand zweier Farben im RGB-Raum (0 = gleich, ca. 441 = Schwarz/Weiß).
export function colorDistance(a, b) {
  const x = normHex(a);
  const y = normHex(b);
  if (!x || !y) return Infinity;
  const [r, g, bl] = rgb(x);
  const [r2, g2, b2] = rgb(y);
  return Math.sqrt((r - r2) ** 2 + (g - g2) ** 2 + (bl - b2) ** 2);
}

// Helle Farben brauchen dunkle Schrift und einen Rand, damit man sie sieht.
export function isLightColor(hex) {
  const h = normHex(hex);
  if (!h) return false;
  const [r, g, b] = rgb(h);
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

export function filamentTypeOf(material) {
  const m = str(material).toUpperCase();
  const hit = BASE_TYPES.find((t) => m === t || m.startsWith(t + ' ') || m.startsWith(t + '-'));
  return hit || m.split(/\s+/)[0] || 'PLA';
}

export function bambuFilamentId(material, brand) {
  if (!/bambu/i.test(str(brand))) return '';
  return BAMBU_FILAMENT_IDS[str(material).toLowerCase()] || '';
}

// Umkehrung für AMS-Daten: "GFA00" -> "PLA Basic"
export function materialForFilamentId(id) {
  const key = Object.keys(BAMBU_FILAMENT_IDS).find((k) => BAMBU_FILAMENT_IDS[k] === str(id).toUpperCase());
  if (!key) return '';
  return MATERIALS.find((m) => m.toLowerCase() === key)
    || key.split(' ').map((w, i) => (i === 0 || w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

export function normalizeSettings(input) {
  const base = defaultSettings();
  const src = input && typeof input === 'object' ? input : {};
  const seen = new Set();
  const spoolTypes = (Array.isArray(src.spoolTypes) ? src.spoolTypes : base.spoolTypes)
    .map((t) => ({ id: str(t && t.id) || newId(), name: str(t && t.name), tare: Math.max(0, toInt(t && t.tare, 0)) }))
    .filter((t) => t.name && !seen.has(t.id) && seen.add(t.id));
  const places = [...new Set((Array.isArray(src.places) ? src.places : []).map(str).filter(Boolean))];
  return {
    spoolTypes: spoolTypes.length ? spoolTypes : base.spoolTypes,
    lowStockPart: Math.min(20, Math.max(2, toInt(src.lowStockPart, base.lowStockPart))),
    amsUnits: Math.min(4, Math.max(1, toInt(src.amsUnits, base.amsUnits))),
    pricePerKg: Math.max(0, toMoney(src.pricePerKg) ?? base.pricePerKg),
    wearPct: Math.max(0, toMoney(src.wearPct) ?? base.wearPct),
    profitPct: Math.max(0, toMoney(src.profitPct) ?? base.profitPct),
    energyPrice: Math.max(0, toMoney(src.energyPrice) ?? base.energyPrice),
    printerWatts: Math.max(0, toInt(src.printerWatts, base.printerWatts)),
    places,
  };
}

export function spoolTypeOf(spool, settings) {
  const types = settings.spoolTypes;
  return types.find((t) => t.id === spool.spoolTypeId) || types[0];
}

// Sucht eine Spulenart über Namen wie "Plastik" oder "pappe".
export function findSpoolType(value, settings) {
  const v = str(value).toLowerCase();
  if (!v) return null;
  return settings.spoolTypes.find((t) => t.id === v || t.name.toLowerCase() === v)
    || settings.spoolTypes.find((t) => t.name.toLowerCase().includes(v) || v.includes(t.name.toLowerCase()))
    || null;
}

export function tareOf(spool, settings) {
  const t = spoolTypeOf(spool, settings);
  return t ? t.tare : 0;
}

export function grossOf(spool, settings) {
  return spool.netWeight + tareOf(spool, settings);
}

export function netFromGross(gross, tare) {
  return Math.max(0, Math.round(Number(gross) - Number(tare)));
}

// ---------------------------------------------------------------------------
// Kostenrechner

// Typische Dichten in g/cm³ nach Filamenttyp.
const DENSITY = {
  PLA: 1.24, 'PLA-CF': 1.22, PETG: 1.27, 'PETG-CF': 1.25, PCTG: 1.23, 'PET-CF': 1.29, ABS: 1.04, 'ABS-GF': 1.08,
  ASA: 1.07, TPU: 1.21, PC: 1.2, PA: 1.06, 'PA-CF': 1.09, 'PA6-CF': 1.13, 'PAHT-CF': 1.06, PVA: 1.23, HIPS: 1.04,
  BVOH: 1.14, PPS: 1.36,
};

export function densityOf(material) {
  return DENSITY[filamentTypeOf(material)] || 1.24;
}

// Grobe Schätzung ohne Slicer: Außenhaut (Wände, Boden, Deckel) voll, Inneres
// mit Infill. Wandstärke in mm, Infill in Prozent; Ergebnis in Gramm.
export function estimateGrams({ volumeMm3, areaMm2 }, { infillPct = 15, wallMm = 0.85, density = 1.24 } = {}) {
  const shell = Math.min(volumeMm3, areaMm2 * wallMm);
  const inner = Math.max(0, volumeMm3 - shell) * (infillPct / 100);
  return ((shell + inner) / 1000) * density;
}

// Preis pro Gramm: eigener Rollenpreis, sonst der Standardpreis pro kg.
export function pricePerGram(spool, settings) {
  if (spool && spool.price !== null && spool.price !== undefined && spool.purchaseWeight > 0) return spool.price / spool.purchaseWeight;
  return settings.pricePerKg / 1000;
}

// Passende Lagerrolle für ein Filament aus dem Druckverlauf: gleicher Typ,
// ähnlichste Farbe; eine Rolle, die gerade in diesem AMS-Slot steckt, zuerst.
export function matchSpool(spools, { color, type, slot } = {}) {
  let best = null;
  for (const s of spools) {
    if (type && filamentTypeOf(s.material) !== filamentTypeOf(type)) continue;
    const d = colorDistance(s.colorHex, color);
    if (d > 60) continue;
    const score = d - (slot && s.inAms && s.bambu.slot === slot ? 1000 : 0) + (s.netWeight > 0 ? 0 : 500);
    if (!best || score < best.score) best = { s, score };
  }
  return best ? best.s : null;
}

// Kosten eines Drucks mit einem oder mehreren Filamenten (z. B. aus dem Druckverlauf).
export function jobQuote(job, spools, settings, { wearPct = settings.wearPct, profitPct = settings.profitPct, qty = 1 } = {}) {
  const list = job.filaments && job.filaments.length ? job.filaments : [{ grams: job.grams }];
  const parts = list.map((f) => {
    const spool = f.color ? matchSpool(spools, f) : null;
    return { ...f, spool, perGram: pricePerGram(spool, settings) };
  });
  const grams = parts.reduce((a, p) => a + p.grams, 0) || job.grams || 0;
  const material = parts.reduce((a, p) => a + p.grams * p.perGram, 0);
  const perGram = grams ? material / grams : settings.pricePerKg / 1000;
  return {
    ...priceQuote({ grams, perGram, energy: energyCost(job.seconds || 0, settings), wearPct, profitPct, qty }),
    perGram,
    parts,
  };
}

// Stromkosten für eine Druckzeit in Sekunden.
export function energyCost(seconds, settings) {
  return (seconds / 3600) * (settings.printerWatts / 1000) * settings.energyPrice;
}

// "1:24" (Std:Min), "1,5" (Stunden) oder "90m" -> Sekunden; leer/ungültig -> null
export function parseDuration(text) {
  const t = str(text).toLowerCase().replace(/\s/g, '');
  if (!t) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  m = /^(\d+(?:[.,]\d+)?)(h|std)?$/.exec(t);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 3600);
  m = /^(\d+)(m|min)$/.exec(t);
  if (m) return Number(m[1]) * 60;
  return null;
}

// Filament und Strom sind die Grundkosten. Abnutzung auf die Grundkosten,
// Gewinn auf die Selbstkosten. Jeder Posten wird auf Cent gerundet, damit die
// angezeigten Beträge aufgehen.
export function priceQuote({ grams, perGram, energy = 0, wearPct, profitPct, qty = 1 }) {
  const cents = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const material = cents(grams * perGram);
  const power = cents(energy);
  const base = cents(material + power);
  const wear = cents(base * (wearPct / 100));
  const cost = cents(base + wear);
  const profit = cents(cost * (profitPct / 100));
  const piece = cents(cost + profit);
  return {
    grams, material, energy: power, base, wear, cost, profit, piece, qty, total: cents(piece * qty), totalGrams: grams * qty,
  };
}

// ---------------------------------------------------------------------------
// Verkäufe

export function normalizeSale(input, { now = new Date().toISOString() } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const qty = Math.max(1, toInt(src.qty, 1));
  return {
    id: str(src.id) || newId(),
    date: str(src.date) || now.slice(0, 10),
    title: str(src.title) || 'Druck',
    qty,
    price: Math.max(0, toMoney(src.price) ?? 0), // erhaltener Betrag für alle Stück
    cost: Math.max(0, toMoney(src.cost) ?? 0), // Selbstkosten für alle Stück
    grams: Math.max(0, Math.round(Number(src.grams) || 0)),
    spoolNr: toInt(src.spoolNr, null),
    taskId: str(src.taskId),
    customer: str(src.customer),
    note: str(src.note),
    createdAt: str(src.createdAt) || now,
  };
}

export function salesSummary(sales, { month = new Date().toISOString().slice(0, 7) } = {}) {
  const sum = (list) => {
    const revenue = list.reduce((a, s) => a + s.price, 0);
    const cost = list.reduce((a, s) => a + s.cost, 0);
    return { count: list.length, pieces: list.reduce((a, s) => a + s.qty, 0), revenue, cost, profit: revenue - cost };
  };
  return { total: sum(sales), month: sum(sales.filter((s) => s.date.startsWith(month))) };
}

// Neues Restgewicht aus genau einer Angabe: net (Restgewicht), gross (mit
// Spule, Tara der Spulenart wird abgezogen) oder used (verbraucht, wird
// abgezogen). Ergebnis ist ein Patch für normalizeSpool.
export function weightPatch(spool, settings, { net, gross, used, spoolTypeId } = {}) {
  const given = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const num = (v, name) => {
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) throw new Error(`${name} muss eine Zahl sein.`);
    return n;
  };
  const typeId = spoolTypeId || spool.spoolTypeId;
  let netWeight;
  if (given(net)) netWeight = num(net, 'Restgewicht');
  else if (given(gross)) netWeight = num(gross, 'Gewicht mit Spule') - tareOf({ spoolTypeId: typeId }, settings);
  else if (given(used)) netWeight = spool.netWeight - num(used, 'Verbrauch');
  else throw new Error('Bitte ein Gewicht angeben: Restgewicht, Gewicht mit Spule oder Verbrauch.');
  netWeight = Math.max(0, Math.round(netWeight));
  const patch = { netWeight, opened: netWeight < spool.purchaseWeight ? true : spool.opened };
  if (spoolTypeId) patch.spoolTypeId = spoolTypeId;
  return patch;
}

export function remainingShare(spool) {
  if (!spool.purchaseWeight) return 0;
  return Math.max(0, Math.min(1, spool.netWeight / spool.purchaseWeight));
}

// Unter dieser Grammzahl gilt die Spule als knapp (Anteil am Kaufgewicht).
export function lowStockLimit(spool, settings) {
  return spool.purchaseWeight / settings.lowStockPart;
}

// "leer", "knapp", "neu" oder "ok"
export function stockLevel(spool, settings) {
  if (spool.netWeight <= 0) return 'leer';
  if (spool.netWeight < lowStockLimit(spool, settings)) return 'knapp';
  if (!spool.opened && spool.netWeight >= spool.purchaseWeight) return 'neu';
  return 'ok';
}

function normalizeBambu(src) {
  const b = src && typeof src === 'object' ? src : {};
  const cloudId = toInt(b.cloudId, null);
  return {
    cloudId: cloudId && cloudId > 0 ? cloudId : null,
    rfid: str(b.rfid).toUpperCase(),
    printerId: str(b.printerId),
    slot: str(b.slot),
    slotColor: normHex(b.slotColor),
    syncedNet: toInt(b.syncedNet, null),
    syncedAt: str(b.syncedAt),
  };
}

// Bringt eine Spule in die gespeicherte Form. "base" ist der bisherige Stand
// beim Bearbeiten; Felder aus "input" überschreiben ihn.
export function normalizeSpool(input, { base = null, now = new Date().toISOString(), keepTimestamps = false } = {}) {
  const src = { ...(base || {}), ...(input || {}) };
  if (input && input.bambu && base && base.bambu) src.bambu = { ...base.bambu, ...input.bambu };
  const purchaseWeight = Math.max(0, toInt(src.purchaseWeight, 1000));
  const netWeight = Math.max(0, toInt(src.netWeight, purchaseWeight));
  const colorName = str(src.colorName);
  const nr = toInt(src.nr, null);
  return {
    id: str(src.id) || newId(),
    nr: nr && nr > 0 ? nr : null, // feste Rollennummer, vergibt assignNumbers()
    material: str(src.material) || 'PLA Basic',
    brand: str(src.brand),
    colorName,
    colorHex: normHex(src.colorHex) || colorHexFor(colorName) || '#9AA0A6',
    purchaseWeight,
    netWeight,
    spoolTypeId: str(src.spoolTypeId) || 'plastik',
    location: str(src.location),
    opened: toBool(src.opened, netWeight < purchaseWeight),
    inAms: toBool(src.inAms, false),
    note: str(src.note),
    price: (() => { const p = toMoney(src.price); return p !== null && p >= 0 ? p : null; })(), // Kaufpreis der Rolle in €
    bambu: normalizeBambu(src.bambu),
    createdAt: str(src.createdAt) || now,
    updatedAt: keepTimestamps && src.updatedAt ? str(src.updatedAt) : now,
  };
}

// ---------------------------------------------------------------------------
// Plätze: Pakete/Kisten im Lager und Slots im AMS

// "3" -> "Paket 3", alles andere bleibt wie eingegeben.
export function placeName(place) {
  const s = str(place);
  return /^\d+$/.test(s) ? 'Paket ' + s : s;
}

// Wo liegt die Spule? { kind: 'slot' | 'ams' | 'place' | 'none', label }
export function spoolPlace(spool) {
  if (spool.inAms && spool.bambu.slot) return { kind: 'slot', slot: spool.bambu.slot, label: 'AMS ' + spool.bambu.slot };
  if (spool.inAms) return { kind: 'ams', label: 'AMS' };
  if (spool.location) return { kind: 'place', place: spool.location, label: placeName(spool.location) };
  return { kind: 'none', label: 'Ohne Platz' };
}

function placeOrder(a, b) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na !== nb) return na ? -1 : 1;
  return na ? Number(a) - Number(b) : a.localeCompare(b, 'de', { numeric: true });
}

// Alle Pakete: die gespeicherte Reihenfolge, dann weitere aus dem Bestand.
export function placeList(settings, spools) {
  const known = settings.places || [];
  const extra = [...new Set(spools.map((s) => s.location).filter((l) => l && !known.includes(l)))].sort(placeOrder);
  return [...known, ...extra];
}

// Slots A1–A4 je AMS-Einheit, dazu Slots, die Spulen schon belegen (z. B. vom Drucker).
export function amsSlots(settings, spools = []) {
  const slots = [];
  for (let u = 0; u < (settings.amsUnits || 1); u += 1) {
    for (let t = 1; t <= 4; t += 1) slots.push(String.fromCharCode(65 + u) + t);
  }
  for (const s of spools) if (s.inAms && s.bambu.slot && !slots.includes(s.bambu.slot)) slots.push(s.bambu.slot);
  return slots;
}

const OUT_OF_AMS = { inAms: false, bambu: { slot: '', printerId: '', slotColor: '' } };

function patchFor(target) {
  if (target.kind === 'slot') return { inAms: true, opened: true, location: '', bambu: { slot: str(target.slot), printerId: '', slotColor: '' } };
  if (target.kind === 'ams') return { inAms: true, opened: true, location: '', bambu: { slot: '', printerId: '', slotColor: '' } };
  if (target.kind === 'place') return { ...OUT_OF_AMS, location: str(target.place) };
  return { ...OUT_OF_AMS, location: '' };
}

function targetOf(spool) {
  const p = spoolPlace(spool);
  return p.kind === 'place' ? { kind: 'place', place: p.place } : p.kind === 'slot' ? { kind: 'slot', slot: p.slot } : { kind: p.kind };
}

// Legt Spulen an einen neuen Platz. Liegt in einem AMS-Slot schon eine
// andere Spule, tauscht sie den Platz mit der neuen (wie beim echten Wechsel).
// Ergebnis: [{ id, patch }] für normalizeSpool(patch, { base }).
export function planMove(spools, ids, target) {
  if (!target || !['slot', 'ams', 'place', 'none'].includes(target.kind)) throw new Error('Unbekanntes Ziel.');
  if (target.kind === 'place' && !str(target.place)) throw new Error('Bitte ein Paket angeben.');
  if (target.kind === 'slot' && !str(target.slot)) throw new Error('Bitte einen AMS-Slot angeben.');
  const moving = ids.map((id) => spools.find((s) => s.id === id)).filter(Boolean);
  if (!moving.length) throw new Error('Spule nicht gefunden.');
  if (target.kind === 'slot' && moving.length > 1) throw new Error('In einen AMS-Slot passt nur eine Spule.');
  const changes = moving.map((s) => ({ id: s.id, patch: patchFor(target) }));
  if (target.kind === 'slot') {
    const occupant = spools.find((s) => s.inAms && s.bambu.slot === target.slot && s.id !== moving[0].id);
    if (occupant) changes.push({ id: occupant.id, patch: patchFor(targetOf(moving[0])), swapped: true });
  }
  return changes;
}

// Pakete anlegen, umbenennen, entfernen. Ergebnis: neue Paketliste und
// Änderungen an Spulen. Umbenennen auf ein vorhandenes Paket legt beide zusammen.
export function planPlaces(settings, spools, { action, name, to }) {
  const list = placeList(settings, spools);
  const n = str(name);
  if (action === 'add') {
    if (!n) throw new Error('Bitte einen Namen für das Paket angeben.');
    return { places: list.includes(n) ? list : [...list, n], changes: [] };
  }
  if (action === 'rename') {
    const t = str(to);
    if (!t) throw new Error('Bitte einen Namen für das Paket angeben.');
    return {
      places: list.includes(t) ? list.filter((p) => p !== n) : list.map((p) => (p === n ? t : p)),
      changes: spools.filter((s) => s.location === n).map((s) => ({ id: s.id, patch: { location: t } })),
    };
  }
  if (action === 'remove') {
    if (spools.some((s) => s.location === n && !s.inAms)) throw new Error('Das Paket ist nicht leer.');
    return {
      places: list.filter((p) => p !== n),
      changes: spools.filter((s) => s.location === n).map((s) => ({ id: s.id, patch: { location: '' } })),
    };
  }
  throw new Error('Unbekannte Aktion.');
}

export function spoolLabel(spool) {
  const name = [spool.material, spool.colorName || spool.colorHex].filter(Boolean).join(' · ');
  return spool.nr ? `#${spool.nr} ${name}` : name;
}

// Gibt jeder Rolle eine feste Nummer. Nummern werden nie neu vergeben, auch
// nicht nach dem Löschen; doppelte (z. B. nach einem Import) bekommen eine neue.
export function assignNumbers(data) {
  let next = Math.max(toInt(data.nextNr, 1) || 1, ...data.spools.map((s) => (s.nr || 0) + 1));
  const seen = new Set();
  for (const s of data.spools) {
    if (!s.nr || seen.has(s.nr)) s.nr = next++;
    seen.add(s.nr);
  }
  data.nextNr = next;
  return data;
}

export function findSpoolByRef(spools, ref) {
  const r = str(ref).replace(/^#/, '');
  return (/^\d+$/.test(r) && spools.find((s) => s.nr === Number(r))) || spools.find((s) => s.id === r) || null;
}

export function summarize(spools, settings) {
  const byMaterial = new Map();
  let totalNet = 0;
  let inAms = 0;
  let low = 0;
  let empty = 0;
  let sealed = 0;
  for (const s of spools) {
    totalNet += s.netWeight;
    if (s.inAms) inAms += 1;
    const level = stockLevel(s, settings);
    if (level === 'knapp') low += 1;
    if (level === 'leer') empty += 1;
    if (level === 'neu') sealed += 1;
    const m = byMaterial.get(s.material) || { material: s.material, count: 0, net: 0 };
    m.count += 1;
    m.net += s.netWeight;
    byMaterial.set(s.material, m);
  }
  return {
    count: spools.length,
    totalNet,
    inAms,
    low,
    empty,
    sealed,
    byMaterial: [...byMaterial.values()].sort((a, b) => b.net - a.net),
  };
}

// ---------------------------------------------------------------------------
// CSV im Excel-Format (Semikolon, deutsche Spaltennamen)

export const CSV_COLUMNS = ['Nr', 'Art', 'Hersteller', 'Farbe', 'Farbcode', 'Kaufgewicht', 'Gewicht mit Spule', 'Gewicht',
  'Lagerort', 'geöffnet?', 'im AMS', 'Spulenart', 'Notiz', 'Preis'];

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(spools, settings) {
  const lines = [CSV_COLUMNS.join(';')];
  for (const s of spools) {
    lines.push([
      s.nr ?? '', s.material, s.brand, s.colorName, s.colorHex, s.purchaseWeight, grossOf(s, settings), s.netWeight,
      s.location, s.opened ? 'ja' : 'nein', s.inAms ? 'ja' : 'nein', spoolTypeOf(s, settings).name, s.note,
      s.price === null ? '' : String(s.price).replace('.', ','),
    ].map(csvCell).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delimiter = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best, ';');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER_ALIASES = {
  nr: ['nr', 'nummer', 'rollennummer', 'spulennummer'],
  material: ['art', 'material', 'typ', 'sorte', 'filament'],
  brand: ['hersteller', 'marke', 'brand', 'vendor'],
  colorName: ['farbe', 'farbname', 'color', 'colour'],
  colorHex: ['farbcode', 'hex', 'hexcode', 'colorhex'],
  purchaseWeight: ['kaufgewicht', 'nenngewicht', 'sollgewicht', 'gesamtgewicht'],
  gross: ['gewichtmitspule', 'brutto', 'bruttogewicht', 'gewogen'],
  netWeight: ['gewicht', 'restgewicht', 'netto', 'nettogewicht', 'rest'],
  location: ['paketnummer', 'lagerort', 'ort', 'paket', 'kiste', 'box'],
  opened: ['geoffnet', 'geöffnet', 'offen', 'opened'],
  inAms: ['imams', 'ams'],
  spoolType: ['spulenart', 'spule', 'spooltype'],
  note: ['notiz', 'bemerkung', 'note', 'notizen', 'kommentar'],
  price: ['preis', 'kaufpreis', 'price', 'kosten'],
};

function headerKey(h) {
  const k = String(h).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/[^a-z]/g, '');
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => a.replace(/ö/g, 'o') === k)) return field;
  }
  return null;
}

// Wandelt CSV-Zeilen (erste Zeile = Überschriften) in Spulen um.
export function spoolsFromRows(rows, settings) {
  if (!rows.length) return [];
  const keys = rows[0].map(headerKey);
  if (!keys.includes('material') && !keys.includes('colorName')) {
    throw new Error('Keine Spalte "Art" oder "Farbe" gefunden. Bitte die Kopfzeile der Tabelle mitexportieren.');
  }
  const spools = [];
  for (const row of rows.slice(1)) {
    const rec = {};
    keys.forEach((k, i) => {
      if (k && rec[k] === undefined) rec[k] = (row[i] ?? '').trim();
    });
    if (!rec.material && !rec.colorName) continue;
    const type = findSpoolType(rec.spoolType, settings) || settings.spoolTypes[0];
    const purchaseWeight = toInt(rec.purchaseWeight, 1000);
    let netWeight = toInt(rec.netWeight, null);
    const gross = toInt(rec.gross, null);
    if (netWeight === null && gross !== null) netWeight = netFromGross(gross, type.tare);
    if (netWeight === null) netWeight = purchaseWeight;
    spools.push(normalizeSpool({
      nr: rec.nr,
      material: rec.material,
      brand: rec.brand,
      colorName: rec.colorName,
      colorHex: rec.colorHex,
      purchaseWeight,
      netWeight,
      spoolTypeId: type.id,
      location: rec.location,
      opened: rec.opened,
      inAms: rec.inAms,
      note: rec.note,
      price: rec.price,
    }));
  }
  return spools;
}
