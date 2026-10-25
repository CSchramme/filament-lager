import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyStockSale, defaultSettings, mergeStock, nextOfferNr, normalizeOffer, normalizeSale, normalizeSpool, normalizeStockItem, offerStatus,
  priceQuote, saleFromOffer, shoppingList, stockFromQuote, stockSaleItem, stockValue,
} from '../public/js/domain.js';
import {
  addPosition, draftTotals, loadDraft, saleFromDraft, saveDraft,
} from '../public/js/sales.js';
import { computeStats, monthsFor } from '../public/js/stats.js';
import { normalizeNotify, Notifier, validateNotify } from '../src/notify.js';

const settings = defaultSettings();
const spool = (o) => {
  const s = normalizeSpool({ material: 'PLA Basic', brand: 'Bambu Lab', purchaseWeight: 1000, ...o });
  s.nr = o.nr;
  return s;
};

test('Einkaufsliste: knappe Sorten, Ersatz im Lager, zuletzt bezahlter Preis', () => {
  const spools = [
    spool({ nr: 1, colorName: 'Schwarz', netWeight: 80, price: 19.99, createdAt: '2026-01-01T00:00:00Z' }),
    spool({ nr: 2, colorName: 'Schwarz', netWeight: 0, price: 22.99, createdAt: '2026-05-01T00:00:00Z' }),
    spool({ nr: 3, colorName: 'Weiß', netWeight: 100 }),
    spool({ nr: 4, colorName: 'Weiß', netWeight: 1000 }),
    spool({ nr: 5, colorName: 'Rot', netWeight: 30, purchaseWeight: 250 }),
    spool({ nr: 6, colorName: 'Blau', netWeight: 500, price: 25, createdAt: '2026-08-01T00:00:00Z' }),
    spool({ nr: 7, colorName: 'Grün', material: 'PETG HF', netWeight: 10 }),
  ];
  const list = shoppingList(spools, settings);
  assert.deepEqual(list.buy.map((i) => i.colorName), ['Grün', 'Rot', 'Schwarz']); // nach Material, dann Farbe
  const schwarz = list.buy.find((i) => i.colorName === 'Schwarz');
  assert.deepEqual(schwarz.low.map((s) => [s.nr, s.level]), [[1, 'knapp'], [2, 'leer']]);
  assert.deepEqual([schwarz.price.nr, schwarz.price.perKg, schwarz.priceFrom, schwarz.estimate], [2, 22.99, 'sorte', 22.99]);
  // Rot hat keinen eigenen Preis: zuletzt gekaufte PLA Basic von Bambu Lab ist #6 (Blau, 25 €)
  const rot = list.buy.find((i) => i.colorName === 'Rot');
  assert.deepEqual([rot.priceFrom, rot.price.nr, rot.weight, rot.estimate], ['material', 6, 1000, 25]);
  assert.equal(list.buy.find((i) => i.colorName === 'Grün').estimate, null);
  assert.deepEqual(list.spare.map((i) => [i.colorName, i.spare.map((s) => s.nr)]), [['Weiß', [4]]]);
  assert.equal(list.total, 47.99);
  assert.equal(list.unknown, 1);
  // Lagerwert: Rest × Grammpreis (ohne Preis 20 € pro kg)
  assert.equal(stockValue([spools[0], spools[3]], settings), 21.6); // 80 g × 1,999 ct + 1000 g × 2 ct
});

test('Angebote: Nummer, gültig bis, Status und Beleg daraus', () => {
  const data = {};
  assert.equal(nextOfferNr(data, '2026-10-25'), 'A-2026-001');
  assert.equal(nextOfferNr(data, '2026-11-02'), 'A-2026-002');
  const offer = normalizeOffer({
    date: '2026-10-25', customer: 'Oma', minExtra: 0.5, items: [{ title: 'Clip', qty: 2, price: 3 }], rates: { energyPrice: 0.3 },
  }, { days: 14 });
  offer.nr = 'A-2026-001';
  assert.equal(offer.validUntil, '2026-11-08');
  assert.equal(offer.price, 3.5);
  assert.equal(offerStatus(offer, '2026-11-08'), 'offen');
  assert.equal(offerStatus(offer, '2026-11-09'), 'abgelaufen');
  const sale = normalizeSale(saleFromOffer(offer, { date: '2026-11-01' }));
  assert.deepEqual([sale.date, sale.customer, sale.price, sale.fromOffer, sale.items[0].qty], ['2026-11-01', 'Oma', 3.5, 'A-2026-001', 2]);
  assert.equal(offerStatus({ ...offer, saleNr: '2026-004' }, '2027-01-01'), 'angenommen');
  assert.equal(normalizeOffer({ date: '2026-12-25' }, { days: 14 }).validUntil, '2027-01-08');
});

test('Auswertung: Monate, Umsatz, Verbrauch nach Farbe und Bestseller', () => {
  assert.deepEqual(monthsFor('6m', '2026-10-25T10:00:00Z'), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(monthsFor('12m', '2026-02-03T10:00:00Z')[0], '2025-03');
  assert.deepEqual(monthsFor('jahr', '2026-03-03T10:00:00Z'), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(monthsFor('alles', '2026-03-03T10:00:00Z', '2025-12'), ['2025-12', '2026-01', '2026-02', '2026-03']);

  const schwarz = spool({ nr: 1, colorName: 'Schwarz', colorHex: '#000000', netWeight: 500, inAms: true, bambu: { slot: 'A1' } });
  const tasks = [
    { status: 2, startTime: '2026-10-02T10:00:00Z', seconds: 3600, grams: 30, filaments: [{ color: '#000000', type: 'PLA', slot: 'A1', grams: 30 }] },
    { status: 2, startTime: '2026-09-02T10:00:00Z', seconds: 7200, grams: 50, filaments: [{ color: '#000000', type: 'PLA', grams: 40 }, { color: '#FFFFFF', type: 'PLA', grams: 10 }] },
    { status: 3, startTime: '2026-09-05T10:00:00Z', seconds: 600, grams: 20, filaments: [{ color: '#000000', type: 'PLA', grams: 20 }] },
    { status: 2, startTime: '2025-01-05T10:00:00Z', seconds: 600, grams: 99, filaments: [] },
  ];
  const sales = [
    normalizeSale({ date: '2026-10-03', items: [{ title: 'Halter', qty: 2, grams: 30, breakdown: { cost: 2, piece: 3 } }, { title: 'Versand', price: 2, cost: 2 }] }),
    normalizeSale({ date: '2026-09-10', items: [{ title: 'halter ', qty: 1, grams: 30, breakdown: { cost: 2, piece: 3.5 } }] }),
    normalizeSale({ date: '2026-08-10', items: [{ title: 'Vase', qty: 1, grams: 90, breakdown: { cost: 4, piece: 12 } }] }),
  ];
  const s = computeStats({
    tasks, sales, spools: [schwarz], settings, range: '6m', now: '2026-10-25T10:00:00Z',
  });
  assert.equal(s.source, 'verlauf');
  const okt = s.months.find((m) => m.key === '2026-10');
  const sep = s.months.find((m) => m.key === '2026-09');
  assert.deepEqual([okt.revenue, okt.cost, okt.profit, okt.grams, okt.prints], [8, 6, 2, 30, 1]);
  // Strom zählt auch den abgebrochenen Druck (2 Std. + 10 Min. bei 120 W)
  assert.deepEqual([sep.grams, sep.prints, Math.round(sep.kwh * 1000)], [50, 1, 260]);
  assert.deepEqual(s.totals, {
    revenue: 23.5, cost: 12, profit: 11.5, sales: 3, pieces: 5, grams: 80, prints: 2, kwh: s.totals.kwh, energy: 0.12,
  }); // Strom: Summe der Monate (0,04 + 0,08), damit die Tabelle aufgeht
  assert.deepEqual(s.byColor.map((c) => [c.name, c.material, c.grams]), [['Schwarz', 'PLA Basic', 70], ['Weiß', 'PLA', 10]]);
  // "Versand" (von Hand) zählt nicht, gleiche Titel zusammen
  assert.deepEqual(s.bestsellers.map((b) => [b.title, b.qty, b.revenue, b.profit]), [['Vase', 1, 12, 8], ['Halter', 3, 9.5, 3.5]]);
  // Ohne Druckverlauf aus den Belegen
  const fromSales = computeStats({
    sales, spools: [], settings, range: '6m', now: '2026-10-25T10:00:00Z',
  });
  assert.equal(fromSales.source, 'belege');
  assert.equal(fromSales.totals.grams, 180); // 2 × 30 + 30 + 90
});

function fakeFetch() {
  const sent = [];
  const fn = async (url, opts) => {
    sent.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, text: async () => '' };
  };
  return { sent, fn };
}

test('Benachrichtigung: Druck fertig, abgebrochen, pausiert', async () => {
  const store = { data: { spools: [], settings, notify: normalizeNotify({ enabled: true, topic: 'filament-lager-test', appUrl: 'https://lager.example.de/' }) } };
  const { sent, fn } = fakeFetch();
  const n = new Notifier({ store, fetchFn: fn, log: { error() {} } });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'FINISH', job: 'Alt' }); // erster Stand nach dem Start
  n.printerUpdate('p1', 'P1S', { gcodeState: 'RUNNING', job: 'Halter', progress: 10 });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'RUNNING', job: 'Halter', progress: 50 });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'PAUSE', job: 'Halter', progress: 62 });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'RUNNING', job: 'Halter', progress: 63 });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'FINISH', job: 'Halter', progress: 100 });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'IDLE' });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'PREPARE', job: 'Vase' });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'FAILED', job: 'Vase', progress: 3 });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent.map((x) => x.body.title), ['Druck pausiert', 'Druck fertig', 'Druck abgebrochen']);
  assert.equal(sent[1].body.message, '„Halter“ ist auf P1S fertig.');
  assert.equal(sent[2].body.message, '„Vase“ wurde auf P1S abgebrochen (bei 3 %).');
  assert.equal(sent[1].url, 'https://ntfy.sh/');
  assert.equal(sent[1].body.topic, 'filament-lager-test');
  assert.equal(sent[1].body.click, 'https://lager.example.de/#drucke');
  // Ereignis abgeschaltet
  store.data.notify.events.done = false;
  n.printerUpdate('p1', 'P1S', { gcodeState: 'RUNNING', job: 'X' });
  n.printerUpdate('p1', 'P1S', { gcodeState: 'FINISH', job: 'X' });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, 3);
});

test('Benachrichtigung: Rolle knapp nur einmal, nach dem Auffüllen wieder', async () => {
  const s1 = spool({ nr: 1, colorName: 'Rot', netWeight: 500 });
  const s2 = spool({ nr: 2, colorName: 'Blau', netWeight: 50 });
  const store = { data: { spools: [s1, s2], settings, notify: normalizeNotify({ enabled: false, topic: 'filament-lager-test', token: 'tok' }) } };
  const { sent, fn } = fakeFetch();
  const n = new Notifier({ store, fetchFn: fn, log: { error() {} } });
  n.markCurrentStock(); // beim Einschalten ist #2 schon knapp
  store.data.notify.enabled = true;
  n.checkStock();
  assert.equal(sent.length, 0);
  s1.netWeight = 100;
  n.checkStock();
  n.checkStock();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent.map((x) => [x.body.title, x.body.message]), [['Rolle wird knapp', '#1 Rot (PLA Basic) hat nur noch 100 g. Zeit zum Nachkaufen?']]);
  assert.equal(sent[0].headers.Authorization, 'Bearer tok');
  s1.netWeight = 1000; // neue Rolle eingetragen
  n.checkStock();
  s1.netWeight = 0;
  n.checkStock();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent.map((x) => x.body.title), ['Rolle wird knapp', 'Rolle leer']);
});

test('Benachrichtigung: Fehler und Prüfung der Einstellungen', async () => {
  const store = { data: { spools: [], settings, notify: normalizeNotify({ enabled: true, topic: 'filament-lager-test' }) } };
  const n = new Notifier({ store, fetchFn: async () => ({ ok: false, status: 403, text: async () => 'forbidden' }), log: { error() {} } });
  await assert.rejects(n.send({ title: 'x', message: 'y' }), /Zugangstoken/);
  assert.match(store.data.notify.lastError, /Zugangstoken/);
  assert.throws(() => validateNotify({ server: 'ftp://x', topic: 'filament-lager-1' }), /https/);
  assert.throws(() => validateNotify({ server: 'https://ntfy.sh', topic: 'a b' }), /Thema/);
  assert.doesNotThrow(() => validateNotify({ server: 'https://ntfy.example.de', topic: 'mein_thema-1' }));
  assert.deepEqual(normalizeNotify({ server: 'https://ntfy.sh///', events: { low: false } }).events, {
    done: true, failed: true, paused: true, low: false,
  });
});

test('Vorrat: 25 Kürbisse auf einer Platte, einzeln verkauft', () => {
  // 12 g pro Kürbis, 6 Std. für die ganze Platte: Arbeit 1,25 € verteilt auf 25 Teile
  const q = priceQuote({ grams: 12, perGram: 0.02, seconds: (6 * 3600) / 25, qty: 25 }, settings);
  const item = normalizeStockItem(stockFromQuote({ title: 'Kürbis', quote: q, price: 2.5 }));
  assert.deepEqual(item.parts, {
    filament: 0.24, energy: 0.01, machine: 0.07, failure: 0.03, labor: 0.05, cost: 0.4,
  });
  assert.deepEqual([item.onHand, item.made, item.sold, item.batchQty, item.price], [25, 25, 0, 25, 2.5]);
  // Einzeln als Auftrag gerechnet wäre die Arbeit voll drin und der Mindestpreis griffe
  const single = priceQuote({ grams: 12, perGram: 0.02, seconds: (6 * 3600) / 25, qty: 1 }, settings);
  assert.deepEqual([single.cost, single.total], [1.6, 3]);

  // Verkauf eines Kürbis: Kosten aus dem Vorrat, Preis fest
  const sale = normalizeSale({ items: [stockSaleItem(item, 1, 2.5)] });
  assert.deepEqual([sale.price, sale.cost, sale.items[0].breakdown.profit, sale.items[0].batchQty, sale.items[0].stockId], [2.5, 0.4, 2.1, 25, item.id]);
  // Unter Selbstkosten verkauft: Gewinn negativ, der Beleg geht trotzdem auf
  const cheap = normalizeSale({ items: [stockSaleItem(item, 2, 0.3)] });
  assert.deepEqual([cheap.price, cheap.cost, cheap.items[0].breakdown.profit], [0.6, 0.8, -0.1]);

  const stock = [item];
  applyStockSale(stock, sale, -1);
  assert.deepEqual([item.onHand, item.sold], [24, 1]);
  assert.throws(() => applyStockSale(stock, normalizeSale({ items: [stockSaleItem(item, 30)] }), -1), /nur noch 24 Stück/);
  assert.deepEqual([item.onHand, item.sold], [24, 1]); // unverändert
  applyStockSale(stock, sale, +1); // Beleg gelöscht
  assert.deepEqual([item.onHand, item.sold], [25, 0]);
  applyStockSale([], sale, -1); // Vorrat gelöscht: nichts zu tun

  // Noch 10 nachgedruckt, teurer: Kosten gewichtet gemittelt über den Bestand
  const more = stockFromQuote({ title: 'kürbis', quote: { ...q, qty: 10, filament: 0.31 }, price: 3 });
  const merged = mergeStock(item, more);
  assert.deepEqual([merged.onHand, merged.made, merged.price, merged.parts.filament, merged.parts.cost], [35, 35, 2.5, 0.26, 0.42]);
});

test('Offener Beleg: Vorrat ohne Mindestpreis, gleiche Teile zusammen', () => {
  saveDraft({ positions: [], customer: '', note: '' });
  const q = priceQuote({ grams: 12, perGram: 0.02, seconds: 864, qty: 25 }, settings);
  const item = normalizeStockItem(stockFromQuote({ title: 'Kürbis', quote: q, price: 2 }));
  addPosition({ stockItem: item });
  addPosition({ stockItem: item, qty: 2 });
  let draft = loadDraft();
  assert.equal(draft.positions.length, 1);
  assert.equal(draft.positions[0].qty, 3);
  let t = draftTotals(draft, settings);
  assert.deepEqual([t.sum, t.minExtra, t.total], [6, 0, 6]);
  draft.positions[0].qty = 1;
  t = draftTotals(draft, settings);
  assert.deepEqual([t.sum, t.minExtra], [2, 0]); // ein Kürbis für 2 €, kein Aufschlag
  // Mit einem Auftragsteil zusammen gilt der Mindestpreis für den ganzen Beleg
  draft.positions[0].piecePrice = 0.5;
  saveDraft(draft);
  addPosition({ title: 'Clip', qty: 1, grams: 1, seconds: 60, perGram: 0.02 });
  draft = loadDraft();
  t = draftTotals(draft, settings);
  assert.ok(t.sum < 3);
  assert.equal(t.total, 3);
  const body = saleFromDraft(draft, settings, { date: '2026-10-25' });
  assert.deepEqual([body.items[0].stockId, body.items[0].batchQty, body.items[0].breakdown.piece, body.items[0].breakdown.profit], [item.id, 25, 0.5, 0.1]);
  assert.deepEqual([body.items[1].stockId, body.items[1].batchQty], ['', 1]);
});
