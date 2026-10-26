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
    energyPrice: 0.3, // € pro kWh
    printerWatts: 120, // mittlere Leistung beim Drucken
    machineRate: 0.3, // € pro Druckstunde für Abnutzung, Düsen, Platten, Ersatzteile
    failPct: 10, // Zuschlag für Fehldrucke auf Filament und Strom
    laborRate: 15, // € pro Arbeitsstunde
    laborMinutes: 5, // Arbeitszeit pro Auftrag: slicen, abnehmen, nacharbeiten, verpacken
    profitPct: 30,
    minPrice: 3, // Mindestpreis pro Beleg
    powerPayee: 'Papa', // wer den Strom bezahlt
    sellerName: '',
    sellerAddress: '',
    smallBusiness: false, // Hinweis § 19 UStG auf dem Beleg
    offerDays: 14, // so lange gilt ein Angebot
    defaultInfill: 15, // Infill in % für die Schätzung aus STL-Dateien
    roundTo: 0.5, // Preis pro Teil aufrunden auf (0 = nicht runden)
    discountQty: 10, // Mengenrabatt ab so vielen Teilen
    discountPct: 10, // … in Prozent (0 = kein Rabatt)
    // Versandarten als feste Position: Preis für den Kunden, eigene Kosten (Porto)
    shipping: [{ name: 'DHL Päckchen', price: 4.5, cost: 4.19 }, { name: 'DHL Paket', price: 6.5, cost: 6.19 }],
    // Einkaufspreis je Filamentart, pro Rolle mit diesem Gewicht
    priceList: [{ material: 'PLA Basic', price: 19.99, weight: 1000 }],
    noRebuyWeights: [250], // Rollen mit diesem Kaufgewicht nicht nachkaufen
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

// Wie toMoney, aber mit mehr Stellen (Strompreise wie 0,3187 € pro kWh)
function toRate(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
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
  // Einstellungen aus der Zeit vor der neuen Preisrechnung (mit Abnutzung in %):
  // der alte Standardgewinn von 10 % wird zu 30 %, eigene Werte bleiben.
  const legacy = 'wearPct' in src && !('machineRate' in src);
  const profitPct = legacy && toMoney(src.profitPct) === 10 ? 30 : toMoney(src.profitPct);
  return {
    spoolTypes: spoolTypes.length ? spoolTypes : base.spoolTypes,
    lowStockPart: Math.min(20, Math.max(2, toInt(src.lowStockPart, base.lowStockPart))),
    amsUnits: Math.min(4, Math.max(1, toInt(src.amsUnits, base.amsUnits))),
    pricePerKg: Math.max(0, toMoney(src.pricePerKg) ?? base.pricePerKg),
    energyPrice: Math.max(0, toRate(src.energyPrice) ?? base.energyPrice),
    printerWatts: Math.max(0, toInt(src.printerWatts, base.printerWatts)),
    machineRate: Math.max(0, toMoney(src.machineRate) ?? base.machineRate),
    failPct: Math.max(0, toMoney(src.failPct) ?? base.failPct),
    laborRate: Math.max(0, toMoney(src.laborRate) ?? base.laborRate),
    laborMinutes: Math.max(0, toMoney(src.laborMinutes) ?? base.laborMinutes),
    profitPct: Math.max(0, profitPct ?? base.profitPct),
    minPrice: Math.max(0, toMoney(src.minPrice) ?? base.minPrice),
    powerPayee: str(src.powerPayee) || base.powerPayee,
    sellerName: str(src.sellerName),
    sellerAddress: String(src.sellerAddress ?? '').trim(),
    smallBusiness: toBool(src.smallBusiness, base.smallBusiness),
    offerDays: Math.min(365, Math.max(1, toInt(src.offerDays, base.offerDays))),
    defaultInfill: Math.min(100, Math.max(0, toMoney(src.defaultInfill) ?? base.defaultInfill)),
    roundTo: [0, 0.1, 0.5, 1].includes(toMoney(src.roundTo)) ? toMoney(src.roundTo) : base.roundTo,
    discountQty: Math.max(0, toInt(src.discountQty, base.discountQty)),
    discountPct: Math.min(90, Math.max(0, toMoney(src.discountPct) ?? base.discountPct)),
    shipping: (Array.isArray(src.shipping) ? src.shipping : base.shipping)
      .map((x) => ({ name: str(x && x.name), price: Math.max(0, toMoney(x && x.price) ?? 0), cost: Math.max(0, toMoney(x && x.cost) ?? 0) }))
      .filter((x) => x.name),
    priceList: normalizePriceList(Array.isArray(src.priceList) ? src.priceList : base.priceList),
    noRebuyWeights: [...new Set((Array.isArray(src.noRebuyWeights) ? src.noRebuyWeights : base.noRebuyWeights)
      .map((w) => toInt(w, 0)).filter((w) => w > 0))].sort((a, b) => a - b),
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

// Druckzeit aus dem Gewicht schätzen, wenn kein Slicer-Ergebnis da ist:
// Zeit = Vorlauf (Aufheizen, Kalibrieren) + Sekunden pro Gramm. Gelernt aus den
// fertigen Drucken im Bambu-Verlauf, sonst Richtwerte für einen Bambu-Drucker
// mit 0,2-mm-Standardprofil (5 Min. Vorlauf, 2,4 Min. pro Gramm).
export const DEFAULT_PRINT_RATE = { setup: 300, perGram: 144, prints: 0 };

export function printRate(tasks) {
  let pts = (tasks || []).filter((t) => t.status === 2 && t.grams >= 1 && t.seconds >= 120).map((t) => [t.grams, t.seconds]);
  if (pts.length >= 5) {
    // Ausreißer weg (z. B. über Nacht pausiert): weit weg vom mittleren Sekunden-pro-Gramm
    const ratios = pts.map(([g, sec]) => sec / g).sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    pts = pts.filter(([g, sec]) => sec / g < median * 4 && sec / g > median / 4);
  }
  if (pts.length < 3) return { ...DEFAULT_PRINT_RATE };
  const n = pts.length;
  const mx = pts.reduce((a, [g]) => a + g, 0) / n;
  const my = pts.reduce((a, [, sec]) => a + sec, 0) / n;
  const vx = pts.reduce((a, [g]) => a + (g - mx) ** 2, 0);
  let perGram = vx > 1e-9 ? pts.reduce((a, [g, sec]) => a + (g - mx) * (sec - my), 0) / vx : my / mx;
  let setup = my - perGram * mx;
  // Unplausible Werte begrenzen, dann die Steigung neu durch den Mittelpunkt legen
  if (setup < 0 || setup > 1800 || perGram <= 0) {
    setup = Math.min(1800, Math.max(0, setup));
    perGram = (my - setup) / mx;
  }
  perGram = Math.min(900, Math.max(20, perGram));
  return { setup: Math.round(setup), perGram, prints: n };
}

export function estimateSeconds(grams, rate = DEFAULT_PRINT_RATE) {
  return grams > 0 ? Math.round(rate.setup + grams * rate.perGram) : 0;
}

// Preisliste: eine Zeile je Filamentart (gleicher Name ohne Groß/klein zählt einmal).
export function normalizePriceList(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((e) => ({
    material: str(e && e.material),
    price: toMoney(e && e.price),
    weight: Math.max(1, toInt(e && e.weight, 1000)),
  })).filter((e) => e.material && e.price !== null && e.price >= 0 && !seen.has(e.material.toLowerCase()) && seen.add(e.material.toLowerCase()));
}

export function listPrice(material, settings) {
  const m = str(material).toLowerCase();
  return (settings.priceList || []).find((e) => e.material.toLowerCase() === m) || null;
}

// Listenpreis für eine Rolle mit diesem Kaufgewicht, anteilig (250 g = 1/4 der 1-kg-Rolle).
export function listPriceForWeight(entry, purchaseWeight) {
  return cents((entry.price * purchaseWeight) / entry.weight);
}

// Woher der Preis einer Rolle kommt: eigener Kaufpreis, Preisliste oder Standardpreis.
export function priceSource(spool, settings) {
  if (spool && spool.price !== null && spool.price !== undefined && spool.purchaseWeight > 0) {
    return { kind: 'rolle', perGram: spool.price / spool.purchaseWeight };
  }
  const entry = spool ? listPrice(spool.material, settings) : null;
  if (entry) return { kind: 'liste', perGram: entry.price / entry.weight, entry };
  return { kind: 'standard', perGram: settings.pricePerKg / 1000 };
}

// Preis pro Gramm: eigener Rollenpreis, sonst die Preisliste, sonst der Standardpreis pro kg.
export function pricePerGram(spool, settings) {
  return priceSource(spool, settings).perGram;
}

// Alle Filamentarten: aus der Preisliste, die bekannten Bambu-Sorten und alles,
// was im Lager vorkommt. Arten mit Rollen im Lager zuerst.
export function filamentTypes(spools, settings) {
  const byKey = new Map();
  const add = (material) => {
    const m = str(material);
    if (m && !byKey.has(m.toLowerCase())) byKey.set(m.toLowerCase(), { material: m, count: 0, entry: listPrice(m, settings) });
  };
  for (const s of spools) add(s.material);
  for (const e of settings.priceList || []) add(e.material);
  for (const m of MATERIALS) add(m);
  for (const s of spools) byKey.get(s.material.toLowerCase()).count += 1;
  return [...byKey.values()].sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || a.material.localeCompare(b.material, 'de'));
}

// Änderungen aus priceListChanges übernehmen; gibt die Zahl der geänderten Rollen zurück.
export function applyPriceChanges(spools, changes) {
  for (const { id, patch } of changes) {
    const idx = spools.findIndex((s) => s.id === id);
    if (idx >= 0) spools[idx] = normalizeSpool(patch, { base: spools[idx] });
  }
  return changes.length;
}

// Daten von vor der Preisliste: Rollen ohne Preis bekommen einmalig den Listenpreis.
export function migratePriceList(rawSettings, data) {
  if (!rawSettings || typeof rawSettings !== 'object' || 'priceList' in rawSettings) return 0;
  return applyPriceChanges(data.spools, priceListChanges(data.spools, data.settings));
}

// Preis aus der Preisliste bei Rollen eintragen: ohne Preis immer, mit anderem
// Preis nur mit overwrite. Ergebnis: Änderungen für normalizeSpool.
export function priceListChanges(spools, settings, { material = null, overwrite = false } = {}) {
  const changes = [];
  for (const s of spools) {
    if (material && s.material.toLowerCase() !== str(material).toLowerCase()) continue;
    const entry = listPrice(s.material, settings);
    if (!entry || !s.purchaseWeight) continue;
    const price = listPriceForWeight(entry, s.purchaseWeight);
    if (s.price === null ? true : overwrite && s.price !== price) changes.push({ id: s.id, patch: { price } });
  }
  return changes;
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
// Jede Farbe kostet den Grammpreis ihrer passenden Lagerrolle.
export function jobQuote(job, spools, settings, { qty = 1, overrides = {} } = {}) {
  const list = job.filaments && job.filaments.length ? job.filaments : [{ grams: job.grams }];
  const parts = list.map((f) => {
    const spool = f.color ? matchSpool(spools, f) : null;
    return { ...f, spool, perGram: pricePerGram(spool, settings) };
  });
  const grams = parts.reduce((a, p) => a + p.grams, 0) || job.grams || 0;
  const material = parts.reduce((a, p) => a + p.grams * p.perGram, 0);
  const perGram = grams ? material / grams : settings.pricePerKg / 1000;
  return {
    ...priceQuote({ grams, perGram, seconds: job.seconds || 0, qty }, { ...settings, ...overrides }),
    perGram,
    parts,
  };
}

// Stromverbrauch und -kosten für eine Druckzeit in Sekunden.
export function energyKwh(seconds, settings) {
  return (seconds / 3600) * (settings.printerWatts / 1000);
}

export function energyCost(seconds, settings) {
  return energyKwh(seconds, settings) * settings.energyPrice;
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

const cents = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Preis pro Teil. rates kommt aus den Einstellungen (einzelne Werte lassen
// sich im Rechner überschreiben):
//   Filament   = Gramm × Grammpreis der Rolle
//   Strom      = Druckzeit × Leistung × Strompreis
//   Drucker    = Druckzeit × Stundensatz (Abnutzung, Düsen, Platten, Ersatzteile)
//   Fehldrucke = Zuschlag in % auf Filament + Strom
//   Arbeit     = Arbeitszeit pro Auftrag × Stundenlohn, verteilt auf die Stückzahl
//   Gewinn     = % auf die Selbstkosten
//   Mengenrabatt ab discountQty Stück: discountPct % vom Preis, nie unter die Selbstkosten
//   Aufrunden auf roundTo € (z. B. 0,50 €: 3,13 € -> 3,50 €)
// Jeder Posten wird auf Cent gerundet, damit die Beträge aufgehen. Der
// Mindestpreis gilt für den ganzen Auftrag (minTotal). "profit" ist der Gewinn
// nach Rabatt und Rundung, "markup" der Aufschlag davor.
export function priceQuote({ grams, perGram, seconds = 0, qty = 1 }, rates) {
  const hours = seconds / 3600;
  const filament = cents(grams * perGram);
  const energy = cents(hours * (rates.printerWatts / 1000) * rates.energyPrice);
  const machine = cents(hours * rates.machineRate);
  const failure = cents((filament + energy) * (rates.failPct / 100));
  const laborOrder = cents((rates.laborMinutes / 60) * rates.laborRate);
  const labor = cents(laborOrder / qty);
  const cost = cents(filament + energy + machine + failure + labor);
  const markup = cents(cost * (rates.profitPct / 100));
  const base = cents(cost + markup);
  const discountPct = rates.discountPct > 0 && rates.discountQty > 0 && qty >= rates.discountQty ? rates.discountPct : 0;
  const discount = discountPct ? Math.min(cents(base * (discountPct / 100)), Math.max(0, cents(base - cost))) : 0;
  const reduced = cents(base - discount);
  const piece = roundUp(reduced, rates.roundTo);
  const rounding = cents(piece - reduced);
  const profit = cents(piece - cost);
  const sum = cents(piece * qty);
  const total = Math.max(sum, cents(rates.minPrice || 0));
  return {
    grams, seconds, qty, hours, kwh: energyKwh(seconds, rates),
    filament, energy, machine, failure, labor, laborOrder, cost, markup, discountPct, discount, rounding, profit, piece,
    sum, total, minExtra: cents(total - sum), totalGrams: grams * qty,
  };
}

// Auf ein Vielfaches von step aufrunden (0 = nicht runden).
export function roundUp(value, step) {
  if (!(step > 0)) return cents(value);
  return cents(Math.ceil(cents(value) / step - 1e-9) * step);
}

// ---------------------------------------------------------------------------
// Belege (Verkäufe). Ein Beleg hat eine oder mehrere Positionen; jede Position
// trägt die Aufteilung ihres Preises pro Teil.

const BREAKDOWN_KEYS = ['filament', 'energy', 'machine', 'failure', 'labor', 'cost', 'profit', 'piece'];

export function normalizeSaleItem(input) {
  const src = input && typeof input === 'object' ? input : {};
  const qty = Math.max(1, toInt(src.qty, 1));
  let breakdown = null;
  if (src.breakdown && typeof src.breakdown === 'object') {
    // Der Gewinn darf negativ sein (unter Selbstkosten verkauft), alles andere nicht.
    breakdown = Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, k === 'profit' ? toMoney(src.breakdown[k]) ?? 0 : Math.max(0, toMoney(src.breakdown[k]) ?? 0)]));
  }
  const piece = breakdown ? breakdown.piece : null;
  return {
    title: str(src.title) || 'Druck',
    qty,
    grams: Math.max(0, Math.round((Number(src.grams) || 0) * 10) / 10), // pro Stück
    seconds: Math.max(0, Math.round(Number(src.seconds) || 0)), // pro Stück
    spoolNr: toInt(src.spoolNr, null),
    material: str(src.material),
    colorName: str(src.colorName),
    colorHex: normHex(src.colorHex),
    taskId: str(src.taskId),
    kind: ['versand', 'hand'].includes(src.kind) ? src.kind : '', // Versand oder Position von Hand
    discountPct: Math.max(0, toMoney(src.discountPct) ?? 0), // Mengenrabatt in %
    stockId: str(src.stockId), // aus dem Vorrat verkauft
    batchQty: Math.max(1, toInt(src.batchQty, qty)), // auf so viele Teile ist die Arbeit verteilt
    breakdown,
    // Beträge für alle Stück dieser Position
    price: piece !== null ? cents(piece * qty) : Math.max(0, toMoney(src.price) ?? 0),
    cost: breakdown ? cents(breakdown.cost * qty) : Math.max(0, toMoney(src.cost) ?? 0),
    energy: breakdown ? cents(breakdown.energy * qty) : Math.max(0, toMoney(src.energy) ?? 0),
  };
}

export function normalizeSale(input, { now = new Date().toISOString() } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  // Ältere Verkäufe ohne Positionen werden zu einem Beleg mit einer Position.
  const items = (Array.isArray(src.items) && src.items.length ? src.items : [{
    title: src.title, qty: src.qty, price: src.price, cost: src.cost, grams: (Number(src.grams) || 0) / Math.max(1, toInt(src.qty, 1)),
    spoolNr: src.spoolNr, taskId: src.taskId,
  }]).map(normalizeSaleItem);
  const sumItems = cents(items.reduce((a, i) => a + i.price, 0));
  const minExtra = Math.max(0, toMoney(src.minExtra) ?? 0);
  return {
    id: str(src.id) || newId(),
    nr: str(src.nr), // Belegnummer, z. B. 2026-007
    date: str(src.date) || now.slice(0, 10),
    customer: String(src.customer ?? '').trim(), // Name und Adresse für den Beleg
    customerId: str(src.customerId), // aus der Kundenliste
    note: str(src.note),
    items,
    tracking: normalizeTracking(src.tracking), // Sendungsverfolgung
    minExtra, // Aufschlag auf den Mindestpreis
    fromOffer: str(src.fromOffer), // Nummer des Angebots, aus dem der Beleg entstand
    // Sätze beim Erstellen, damit der Beleg später gleich aussieht
    rates: src.rates && typeof src.rates === 'object' ? {
      energyPrice: Math.max(0, toRate(src.rates.energyPrice) ?? 0),
      printerWatts: Math.max(0, toInt(src.rates.printerWatts, 0)),
      machineRate: Math.max(0, toMoney(src.rates.machineRate) ?? 0),
      failPct: Math.max(0, toMoney(src.rates.failPct) ?? 0),
    } : null,
    title: items.length > 1 ? `${items[0].title} + ${items.length - 1} weitere` : items[0].title,
    qty: items.filter((i) => i.kind !== 'versand').reduce((a, i) => a + i.qty, 0), // Teile, ohne Versand
    price: cents(sumItems + minExtra),
    cost: cents(items.reduce((a, i) => a + i.cost, 0)),
    energy: cents(items.reduce((a, i) => a + i.energy, 0)),
    createdAt: str(src.createdAt) || now,
  };
}

// ---------------------------------------------------------------------------
// Kunden

export function normalizeCustomer(input, { now = new Date().toISOString() } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    id: str(src.id) || newId(),
    name: str(src.name),
    address: String(src.address ?? '').trim(), // mehrzeilig: Straße, PLZ Ort
    email: str(src.email),
    phone: str(src.phone),
    note: str(src.note),
    createdAt: str(src.createdAt) || now,
  };
}

// Name und Adresse, wie sie auf dem Beleg unter "An" stehen.
export function customerText(c) {
  return [c.name, c.address].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Sendungsverfolgung (DHL). Status von der DHL-Schnittstelle, sonst nur der Link.

const TRACK_STATUS = {
  'pre-transit': 'angekündigt', transit: 'unterwegs', delivered: 'zugestellt', failure: 'Problem', unknown: 'unbekannt',
};

export function normalizeTracking(input) {
  const src = input && typeof input === 'object' ? input : null;
  const number = src ? str(src.number).replace(/\s+/g, '').toUpperCase() : '';
  if (!number) return null;
  return {
    carrier: 'dhl',
    number,
    status: Object.keys(TRACK_STATUS).includes(src.status) ? src.status : '',
    statusText: str(src.statusText),
    place: str(src.place),
    updatedAt: str(src.updatedAt), // letzte Änderung laut DHL
    checkedAt: str(src.checkedAt), // zuletzt bei DHL nachgefragt
    deliveredAt: str(src.deliveredAt),
    error: str(src.error),
    events: (Array.isArray(src.events) ? src.events : []).slice(0, 20).map((e) => ({ time: str(e && e.time), text: str(e && e.text), place: str(e && e.place) })),
  };
}

export const trackingLabel = (t) => (t && t.status ? TRACK_STATUS[t.status] : 'Sendungsnummer');

export function trackingUrl(t) {
  return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(t.number)}`;
}

// Gültige Sendungsnummer: Buchstaben und Ziffern, 8 bis 35 Zeichen
export const validTrackingNumber = (n) => /^[A-Z0-9]{8,35}$/.test(str(n).replace(/\s+/g, '').toUpperCase());

// ---------------------------------------------------------------------------
// Eigene Ausgaben (Düsen, Platten, Versandmaterial …) für die Jahresübersicht

export const EXPENSE_CATEGORIES = ['Filament', 'Ersatzteile', 'Werkzeug', 'Versandmaterial', 'Porto', 'Strom', 'Sonstiges'];

export function normalizeExpense(input, { now = new Date().toISOString() } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    id: str(src.id) || newId(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(src.date)) ? str(src.date) : now.slice(0, 10),
    title: str(src.title) || 'Ausgabe',
    amount: Math.max(0, toMoney(src.amount) ?? 0),
    category: EXPENSE_CATEGORIES.includes(src.category) ? src.category : 'Sonstiges',
    createdAt: str(src.createdAt) || now,
  };
}

// ---------------------------------------------------------------------------
// Vorrat: auf Vorrat gedruckte Teile (z. B. 25 Kürbisse auf einer Platte), die
// einzeln verkauft werden. Die Kosten pro Teil stammen aus dem Druck, die
// Arbeit ist auf alle Teile des Drucks verteilt. Der Verkaufspreis ist fest.

const COST_KEYS = ['filament', 'energy', 'machine', 'failure', 'labor'];

function costParts(src) {
  const b = src && typeof src === 'object' ? src : {};
  const parts = Object.fromEntries(COST_KEYS.map((k) => [k, Math.max(0, toMoney(b[k]) ?? 0)]));
  parts.cost = cents(COST_KEYS.reduce((a, k) => a + parts[k], 0));
  return parts;
}

export function normalizeStockItem(input, { now = new Date().toISOString() } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const made = Math.max(0, toInt(src.made, 0));
  return {
    id: str(src.id) || newId(),
    title: str(src.title) || 'Teil',
    onHand: Math.max(0, toInt(src.onHand, made)), // noch da
    made, // insgesamt gedruckt
    sold: Math.max(0, toInt(src.sold, 0)),
    batchQty: Math.max(1, toInt(src.batchQty, made || 1)), // Teile pro Druck, für den Beleg
    price: Math.max(0, toMoney(src.price) ?? 0), // Verkaufspreis pro Stück
    parts: costParts(src.parts), // Selbstkosten pro Stück
    grams: Math.max(0, Math.round((Number(src.grams) || 0) * 10) / 10), // pro Stück
    seconds: Math.max(0, Math.round(Number(src.seconds) || 0)), // pro Stück
    spoolNr: toInt(src.spoolNr, null),
    material: str(src.material),
    colorName: str(src.colorName),
    colorHex: normHex(src.colorHex),
    createdAt: str(src.createdAt) || now,
    updatedAt: now,
  };
}

// Neuer Druck auf Vorrat aus einer Preisrechnung mit qty Teilen.
export function stockFromQuote({
  title, quote, spool = null, price,
}) {
  return {
    title,
    made: quote.qty,
    onHand: quote.qty,
    batchQty: quote.qty,
    price: price ?? quote.piece,
    parts: Object.fromEntries(COST_KEYS.map((k) => [k, quote[k]])),
    grams: quote.grams,
    seconds: quote.seconds,
    spoolNr: spool ? spool.nr : null,
    material: spool ? spool.material : '',
    colorName: spool ? spool.colorName : '',
    colorHex: spool ? spool.colorHex : '',
  };
}

// Gleiches Teil noch einmal gedruckt: Stückzahl dazu, Kosten gewichtet gemittelt.
export function mergeStock(item, batch) {
  const add = normalizeStockItem(batch);
  const n = item.onHand + add.onHand;
  const avg = (a, b) => (n ? (a * item.onHand + b * add.onHand) / n : b);
  return normalizeStockItem({
    ...item,
    onHand: n,
    made: item.made + add.made,
    batchQty: Math.round(avg(item.batchQty, add.batchQty)),
    parts: Object.fromEntries(COST_KEYS.map((k) => [k, cents(avg(item.parts[k], add.parts[k]))])),
    grams: avg(item.grams, add.grams),
    seconds: avg(item.seconds, add.seconds),
    price: item.price || add.price,
  });
}

// Position für einen Beleg: Kosten aus dem Vorrat, Preis fest (oder abweichend).
export function stockSaleItem(item, qty = 1, price = item.price) {
  const p = item.parts;
  return {
    title: item.title,
    qty,
    grams: item.grams,
    seconds: item.seconds,
    spoolNr: item.spoolNr,
    material: item.material,
    colorName: item.colorName,
    colorHex: item.colorHex,
    stockId: item.id,
    batchQty: item.batchQty,
    breakdown: {
      ...Object.fromEntries(COST_KEYS.map((k) => [k, p[k]])), cost: p.cost, profit: cents(price - p.cost), piece: cents(price),
    },
  };
}

// Vorrat beim Verkauf abbuchen (sign -1) oder beim Löschen zurückbuchen (+1).
// Wirft, wenn nicht genug da ist; dann bleibt alles unverändert.
export function applyStockSale(stock, sale, sign = -1) {
  const wanted = new Map();
  for (const i of sale.items) if (i.stockId) wanted.set(i.stockId, (wanted.get(i.stockId) || 0) + i.qty);
  for (const [id, qty] of wanted) {
    const item = stock.find((x) => x.id === id);
    if (item && sign < 0 && item.onHand < qty) {
      throw new Error(`Von „${item.title}“ sind nur noch ${item.onHand} Stück im Vorrat.`);
    }
  }
  for (const [id, qty] of wanted) {
    const item = stock.find((x) => x.id === id);
    if (!item) continue; // Vorrat inzwischen gelöscht
    item.onHand = Math.max(0, item.onHand + sign * qty);
    item.sold = Math.max(0, item.sold - sign * qty);
  }
}

// Angebot: aufgebaut wie ein Beleg, dazu gültig bis und ob daraus ein Beleg wurde.
export function normalizeOffer(input, { now = new Date().toISOString(), days = 14 } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const base = normalizeSale(src, { now });
  const until = new Date(`${base.date}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() + days);
  return {
    ...base,
    validUntil: /^\d{4}-\d{2}-\d{2}$/.test(str(src.validUntil)) ? str(src.validUntil) : until.toISOString().slice(0, 10),
    saleId: str(src.saleId),
    saleNr: str(src.saleNr),
    acceptedAt: str(src.acceptedAt),
  };
}

// "offen", "abgelaufen" oder "angenommen"
export function offerStatus(offer, today = new Date().toISOString().slice(0, 10)) {
  if (offer.saleNr) return 'angenommen';
  return offer.validUntil < today ? 'abgelaufen' : 'offen';
}

// Daten für einen Beleg aus einem Angebot: gleiche Positionen und Preise.
export function saleFromOffer(offer, { date } = {}) {
  return {
    date: date || new Date().toISOString().slice(0, 10),
    customer: offer.customer,
    note: offer.note,
    items: offer.items,
    minExtra: offer.minExtra,
    rates: offer.rates,
    fromOffer: offer.nr,
  };
}

// Nächste Angebotsnummer im Jahr: A-2026-001, …
export function nextOfferNr(data, date) {
  const year = str(date).slice(0, 4) || new Date().toISOString().slice(0, 4);
  data.offerSeq = data.offerSeq && typeof data.offerSeq === 'object' ? data.offerSeq : {};
  data.offerSeq[year] = (toInt(data.offerSeq[year], 0) || 0) + 1;
  return `A-${year}-${String(data.offerSeq[year]).padStart(3, '0')}`;
}

// Nächste Belegnummer im Jahr des Belegs: 2026-001, 2026-002, …
export function nextReceiptNr(data, date) {
  const year = str(date).slice(0, 4) || new Date().toISOString().slice(0, 4);
  data.receiptSeq = data.receiptSeq && typeof data.receiptSeq === 'object' ? data.receiptSeq : {};
  data.receiptSeq[year] = (toInt(data.receiptSeq[year], 0) || 0) + 1;
  return `${year}-${String(data.receiptSeq[year]).padStart(3, '0')}`;
}

export function salesSummary(sales, { month = new Date().toISOString().slice(0, 7) } = {}) {
  const sum = (list) => {
    const revenue = cents(list.reduce((a, s) => a + s.price, 0));
    const cost = cents(list.reduce((a, s) => a + s.cost, 0));
    return { count: list.length, pieces: list.reduce((a, s) => a + s.qty, 0), revenue, cost, profit: cents(revenue - cost) };
  };
  return { total: sum(sales), month: sum(sales.filter((s) => s.date.startsWith(month))) };
}

// ---------------------------------------------------------------------------
// Stromabrechnung: Strom aller Drucke seit der letzten Abrechnung.

export function normalizePowerPayment(input, { now = new Date().toISOString() } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    id: str(src.id) || newId(),
    date: str(src.date) || now.slice(0, 10),
    from: str(src.from),
    to: str(src.to) || now,
    prints: Math.max(0, toInt(src.prints, 0)),
    hours: Math.max(0, Number(src.hours) || 0),
    kwh: Math.max(0, Number(src.kwh) || 0),
    amount: Math.max(0, toMoney(src.amount) ?? 0),
    // Gerechnet mit diesen Werten; die Zeilen bleiben für die Abrechnung erhalten.
    energyPrice: Math.max(0, toRate(src.energyPrice) ?? 0),
    printerWatts: Math.max(0, toInt(src.printerWatts, 0)),
    rows: (Array.isArray(src.rows) ? src.rows : []).slice(0, 1000).map((r) => ({
      date: str(r && r.date),
      title: str(r && r.title),
      seconds: Math.max(0, Math.round(Number(r && r.seconds) || 0)),
      status: toInt(r && r.status, 0),
      kwh: Math.max(0, Number(r && r.kwh) || 0),
      amount: Math.max(0, toMoney(r && r.amount) ?? 0),
    })),
    note: str(src.note),
  };
}

// Stromkosten der Drucke zwischen "since" und "until" (Standard: seit der
// letzten Abrechnung bis jetzt). Quelle ist der Druckverlauf, ohne ihn die Belege.
export function openPower({
  tasks = [], sales = [], payments = [], settings, since, until, now = new Date().toISOString(),
}) {
  const last = [...payments].sort((a, b) => b.to.localeCompare(a.to))[0];
  const from = since || (last ? last.to : `${now.slice(0, 7)}-01T00:00:00.000Z`);
  const to = until || now;
  const t0 = Date.parse(from) || 0;
  const t1 = Date.parse(to) || Infinity;
  const inRange = (iso) => {
    const t = Date.parse(iso) || 0;
    return t >= t0 && t < t1;
  };
  const rows = tasks.length
    ? tasks.filter((t) => t.seconds > 0 && inRange(t.startTime))
      .map((t) => ({ date: t.startTime, title: t.title, seconds: t.seconds, status: t.status }))
    : sales.filter((s) => inRange(s.createdAt))
      .flatMap((s) => s.items.filter((i) => i.seconds).map((i) => ({
        date: s.createdAt, title: i.qty > 1 ? `${i.title} × ${i.qty}` : i.title, seconds: i.seconds * i.qty, status: 2,
      })));
  const list = rows.map((r) => ({ ...r, kwh: energyKwh(r.seconds, settings), amount: cents(energyCost(r.seconds, settings)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const seconds = list.reduce((a, r) => a + r.seconds, 0);
  return {
    from,
    to,
    rows: list,
    prints: list.length,
    hours: seconds / 3600,
    kwh: list.reduce((a, r) => a + r.kwh, 0),
    // Summe der gerundeten Zeilen, damit die Abrechnung aufgeht
    amount: cents(list.reduce((a, r) => a + r.amount, 0)),
    energyPrice: settings.energyPrice,
    printerWatts: settings.printerWatts,
    source: tasks.length ? 'verlauf' : 'belege',
  };
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
    boughtAt: /^\d{4}-\d{2}-\d{2}$/.test(str(src.boughtAt)) ? str(src.boughtAt) : (str(src.createdAt) || now).slice(0, 10), // Kaufdatum
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
// Einkaufsliste: knappe und leere Rollen, zusammengefasst nach Sorte
// (Material, Marke, Farbe). Liegt von der Sorte noch eine Rolle mit genug
// Filament im Lager, steht sie unter "Ersatz da". Der Preis ist der zuletzt
// bezahlte für diese Sorte, sonst für das Material derselben Marke.

const sortKey = (s) => [s.material, s.brand, (s.colorName || s.colorHex).toLowerCase()].join('|');

function lastPaid(list) {
  const paid = list.filter((s) => s.price !== null && s.purchaseWeight > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.nr || 0) - (a.nr || 0))[0];
  if (!paid) return null;
  return {
    nr: paid.nr, price: paid.price, weight: paid.purchaseWeight, perKg: cents((paid.price / paid.purchaseWeight) * 1000),
  };
}

export function shoppingList(spools, settings) {
  const groups = new Map();
  for (const s of spools) {
    const k = sortKey(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const items = [];
  const noRebuy = settings.noRebuyWeights || [];
  for (const list of groups.values()) {
    const low = list.filter((s) => ['knapp', 'leer'].includes(stockLevel(s, settings)));
    if (!low.length) continue;
    const spare = list.filter((s) => !low.includes(s)).sort((a, b) => b.netWeight - a.netWeight);
    const first = low[0];
    // Preis: Preisliste, sonst zuletzt bezahlt für die Sorte, sonst für das Material der Marke
    const entry = listPrice(first.material, settings);
    const ownPrice = entry ? null : lastPaid(list);
    const paid = ownPrice || (entry ? null : lastPaid(spools.filter((s) => s.material === first.material && s.brand === first.brand)));
    const price = entry ? {
      nr: null, price: entry.price, weight: entry.weight, perKg: cents((entry.price / entry.weight) * 1000),
    } : paid;
    // Kaufgewicht der nächsten Rolle; Gewichte, die nicht nachgekauft werden, nie vorschlagen
    const weight = [price && price.weight, ...list.map((s) => s.purchaseWeight), 1000].find((w) => w && !noRebuy.includes(w));
    const skip = !spare.length && low.every((s) => noRebuy.includes(s.purchaseWeight));
    items.push({
      key: sortKey(first),
      material: first.material,
      brand: first.brand,
      colorName: first.colorName,
      colorHex: first.colorHex,
      low: low.map((s) => ({ id: s.id, nr: s.nr, netWeight: s.netWeight, level: stockLevel(s, settings) })),
      spare: spare.map((s) => ({ id: s.id, nr: s.nr, netWeight: s.netWeight, level: stockLevel(s, settings) })),
      rest: list.reduce((a, s) => a + s.netWeight, 0),
      buy: !spare.length && !skip, // nachkaufen, kein Ersatz im Lager
      skip, // z. B. 250-g-Rollen: nicht nachkaufen
      weight, // Kaufgewicht der nächsten Rolle
      price, // Preisliste, zuletzt bezahlt oder null
      priceFrom: entry ? 'liste' : ownPrice ? 'sorte' : price ? 'material' : '',
      estimate: price ? cents((price.perKg * weight) / 1000) : null,
    });
  }
  items.sort((a, b) => Number(b.buy) - Number(a.buy) || Number(a.skip) - Number(b.skip) || a.material.localeCompare(b.material, 'de')
    || (a.colorName || '').localeCompare(b.colorName || '', 'de'));
  const buy = items.filter((i) => i.buy);
  return {
    items,
    buy,
    spare: items.filter((i) => !i.buy && !i.skip),
    skip: items.filter((i) => i.skip),
    total: cents(buy.reduce((a, i) => a + (i.estimate || 0), 0)),
    unknown: buy.filter((i) => i.estimate === null).length, // ohne bekannten Preis
  };
}

// Wert des Filaments im Lager (Restgewicht × Grammpreis der Rolle).
export function stockValue(spools, settings) {
  return cents(spools.reduce((a, s) => a + s.netWeight * pricePerGram(s, settings), 0));
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
