// Offener Beleg: Positionen aus dem Rechner und dem Druckverlauf sammeln,
// Anzahl und Preis anpassen, dann als Verkauf speichern und den Beleg öffnen.
// Der offene Beleg liegt im Browser, bis er erstellt wird.
import { newId, priceQuote } from './domain.js';

const DRAFT_KEY = 'filament-lager-beleg';
let memory = null;

export function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && Array.isArray(d.positions)) return d;
  } catch { /* ohne Speicher */ }
  return memory || { positions: [], customer: '', note: '' };
}

export function saveDraft(draft) {
  memory = draft;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* nur im Arbeitsspeicher */ }
}

// position: { title, qty, grams, seconds, perGram, overrides, spool, taskId } oder
// von Hand: { title, qty, manual: true, piecePrice, pieceCost } oder
// aus dem Vorrat: { stockItem, qty }
export function addPosition(position) {
  const draft = loadDraft();
  const item = position.stockItem;
  if (item) {
    // Dasselbe Teil noch einmal: nur die Anzahl erhöhen
    const same = draft.positions.find((p) => p.stockId === item.id);
    if (same) same.qty += Math.max(1, position.qty || 1);
    else {
      draft.positions.push({
        id: newId(),
        title: item.title,
        qty: Math.max(1, position.qty || 1),
        grams: item.grams,
        seconds: item.seconds,
        spoolNr: item.spoolNr,
        material: item.material,
        colorName: item.colorName,
        colorHex: item.colorHex,
        stockId: item.id,
        stockParts: item.parts,
        stockPrice: item.price,
        batchQty: item.batchQty,
        manual: false,
        piecePrice: null,
      });
    }
    saveDraft(draft);
    return draft;
  }
  const s = position.spool;
  draft.positions.push({
    id: newId(),
    title: position.title || 'Druck',
    qty: Math.max(1, position.qty || 1),
    grams: position.grams || 0,
    seconds: position.seconds || 0,
    perGram: position.perGram || 0,
    overrides: position.overrides || {},
    spoolNr: s ? s.nr : null,
    material: s ? s.material : '',
    colorName: s ? s.colorName : '',
    colorHex: s ? s.colorHex : '',
    taskId: position.taskId || '',
    manual: Boolean(position.manual),
    piecePrice: position.piecePrice ?? null,
    pieceCost: position.pieceCost ?? 0,
  });
  saveDraft(draft);
  return draft;
}

// Aufteilung pro Teil mit den aktuellen Einstellungen. Der Mindestpreis gilt
// erst für den ganzen Beleg, deshalb hier ohne.
export function positionBreakdown(pos, settings) {
  const cents = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  if (pos.manual) {
    const piece = cents(pos.piecePrice || 0);
    const cost = cents(pos.pieceCost || 0);
    return { filament: 0, energy: 0, machine: 0, failure: 0, labor: 0, cost, profit: cents(piece - cost), piece };
  }
  if (pos.stockId) {
    // Kosten stehen fest (aus dem Druck auf Vorrat), der Preis ist der Vorratspreis
    const p = pos.stockParts;
    const piece = cents(pos.piecePrice ?? pos.stockPrice);
    return {
      filament: p.filament, energy: p.energy, machine: p.machine, failure: p.failure, labor: p.labor, cost: p.cost, profit: cents(piece - p.cost), piece,
    };
  }
  const q = priceQuote({ grams: pos.grams, perGram: pos.perGram, seconds: pos.seconds, qty: pos.qty }, { ...settings, ...pos.overrides, minPrice: 0 });
  const b = {
    filament: q.filament, energy: q.energy, machine: q.machine, failure: q.failure, labor: q.labor, cost: q.cost, profit: q.profit, piece: q.piece,
  };
  if (pos.piecePrice !== null && pos.piecePrice !== undefined) {
    b.piece = cents(pos.piecePrice);
    b.profit = cents(b.piece - b.cost);
  }
  return b;
}

export function draftTotals(draft, settings) {
  const cents = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const lines = draft.positions.map((p) => ({ ...p, breakdown: positionBreakdown(p, settings) }));
  const sum = cents(lines.reduce((a, p) => a + p.breakdown.piece * p.qty, 0));
  // Der Mindestpreis gilt für Aufträge. Teile aus dem Vorrat haben einen festen Preis.
  const custom = lines.some((p) => !p.stockId && !p.manual);
  const minExtra = custom ? Math.max(0, cents(settings.minPrice - sum)) : 0;
  return { lines, sum, minExtra, total: cents(sum + minExtra) };
}

// Daten für POST /api/verkaeufe
export function saleFromDraft(draft, settings, { date, customer, note }) {
  const { lines, minExtra } = draftTotals(draft, settings);
  return {
    date,
    customer,
    note,
    minExtra,
    rates: {
      energyPrice: settings.energyPrice, printerWatts: settings.printerWatts, machineRate: settings.machineRate, failPct: settings.failPct,
    },
    items: lines.map((p) => ({
      title: p.title,
      qty: p.qty,
      grams: p.grams,
      seconds: p.seconds,
      spoolNr: p.spoolNr,
      material: p.material,
      colorName: p.colorName,
      colorHex: p.colorHex,
      taskId: p.taskId,
      stockId: p.stockId || '',
      batchQty: p.batchQty || p.qty,
      breakdown: p.manual ? null : p.breakdown,
      price: p.breakdown.piece * p.qty,
      cost: p.breakdown.cost * p.qty,
    })),
  };
}
