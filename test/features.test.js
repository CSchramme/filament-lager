import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  applyStockSale, defaultSettings, filamentTypes, listPriceForWeight, mergeStock, migratePriceList, nextOfferNr, normalizeOffer, normalizeSale,
  normalizeSettings, normalizeSpool, normalizeStockItem, offerStatus, priceListChanges, priceQuote, priceSource, saleFromOffer, shoppingList,
  stockFromQuote, stockSaleItem, stockValue, DEFAULT_PRINT_RATE, estimateSeconds, printRate, archiveSpool, normalizeExpense, normalizePowerPayment,
} from '../public/js/domain.js';
import { Store } from '../src/store.js';
import {
  addPosition, draftTotals, loadDraft, saleFromDraft, saveDraft,
} from '../public/js/sales.js';
import {
  computeStats, computeYear, monthsFor, yearCsv, yearsWithData,
} from '../public/js/stats.js';
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
  // ohne Preisliste und ohne Nachkauf-Regel: zuletzt bezahlte Preise
  const list = shoppingList(spools, { ...settings, priceList: [], noRebuyWeights: [] });
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
  assert.deepEqual(list.skip, []);

  // Standard: PLA Basic laut Preisliste 19,99 €, 250-g-Rollen nicht nachkaufen
  const std = shoppingList(spools, settings);
  assert.deepEqual(std.buy.map((i) => [i.colorName, i.priceFrom, i.weight, i.estimate]), [['Grün', '', 1000, null], ['Schwarz', 'liste', 1000, 19.99]]);
  assert.deepEqual(std.skip.map((i) => [i.colorName, i.low.map((x) => x.nr)]), [['Rot', [5]]]);
  assert.equal(std.total, 19.99);
  // Ist eine 250-g-Rolle knapp und eine 1-kg-Rolle der Sorte auch, wird 1 kg vorgeschlagen
  const mixed = shoppingList([spool({ nr: 8, colorName: 'Gelb', netWeight: 20, purchaseWeight: 250 }), spool({ nr: 9, colorName: 'Gelb', netWeight: 50 })], settings);
  assert.deepEqual(mixed.buy.map((i) => [i.colorName, i.weight, i.estimate]), [['Gelb', 1000, 19.99]]);
  // Lagerwert: Rest × Grammpreis (#4 ohne eigenen Preis: Preisliste 19,99 € pro kg)
  assert.equal(stockValue([spools[0], spools[3]], settings), 21.59); // 80 g × 1,999 ct + 1000 g × 1,999 ct
  assert.equal(stockValue([spools[0], spools[3]], { ...settings, priceList: [] }), 21.6); // sonst 20 € pro kg
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
    done: true, failed: true, paused: true, low: false, delivered: true, umsatz: true,
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

test('Preisliste: Standard PLA Basic 19,99 €, Preisquelle je Rolle', () => {
  assert.deepEqual(settings.priceList, [{ material: 'PLA Basic', price: 19.99, weight: 1000 }]);
  assert.deepEqual(settings.noRebuyWeights, [250]);
  const n = normalizeSettings({
    priceList: [{ material: ' PLA Matte ', price: '24,99' }, { material: 'pla matte', price: 1 }, { material: 'PETG HF', price: '' }, { material: '', price: 5 }],
    noRebuyWeights: ['500', 250, 250, 'x'],
  });
  assert.deepEqual(n.priceList, [{ material: 'PLA Matte', price: 24.99, weight: 1000 }]);
  assert.deepEqual(n.noRebuyWeights, [250, 500]);
  assert.equal(settings.defaultInfill, 15);
  assert.deepEqual([normalizeSettings({ defaultInfill: '20,5' }).defaultInfill, normalizeSettings({ defaultInfill: 150 }).defaultInfill], [20.5, 100]);

  const own = spool({ nr: 1, price: 18, purchaseWeight: 1000 });
  const small = spool({ nr: 2, purchaseWeight: 250 });
  const petg = spool({ nr: 3, material: 'PETG HF' });
  assert.deepEqual([priceSource(own, settings).kind, priceSource(small, settings).kind, priceSource(petg, settings).kind], ['rolle', 'liste', 'standard']);
  assert.equal(listPriceForWeight(settings.priceList[0], 250), 5); // 19,99 / 4 = 5,00
  assert.equal(listPriceForWeight(settings.priceList[0], 750), 14.99);

  // Übertragen: ohne Preis immer, anderer Preis nur mit overwrite
  const spools = [own, small, petg, spool({ nr: 4, purchaseWeight: 1000, price: 19.99 })];
  assert.deepEqual(priceListChanges(spools, settings), [{ id: small.id, patch: { price: 5 } }]);
  assert.deepEqual(priceListChanges(spools, settings, { material: 'pla basic', overwrite: true }).map((c) => c.patch.price), [19.99, 5]);
  assert.deepEqual(priceListChanges(spools, settings, { material: 'PETG HF' }), []);

  // Filamentarten: im Lager zuerst, dann Preisliste und bekannte Sorten
  const types = filamentTypes(spools, settings);
  assert.deepEqual(types.slice(0, 2).map((t) => [t.material, t.count, Boolean(t.entry)]), [['PETG HF', 1, false], ['PLA Basic', 3, true]]);
  assert.ok(types.some((t) => t.material === 'PLA Silk+' && t.count === 0));
});

test('Preisliste: vorhandene PLA-Basic-Rollen ohne Preis bekommen ihn einmalig', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lager-preise-'));
  const file = path.join(dir, 'lager.json');
  await fs.writeFile(file, JSON.stringify({
    settings: { pricePerKg: 20, profitPct: 30, machineRate: 0.3 }, // von vor der Preisliste
    spools: [
      { id: 'a', material: 'PLA Basic', purchaseWeight: 1000, netWeight: 500 },
      { id: 'b', material: 'PLA Basic', purchaseWeight: 250, netWeight: 80 },
      { id: 'c', material: 'PLA Basic', purchaseWeight: 1000, netWeight: 900, price: 15 },
      { id: 'd', material: 'PLA Translucent', purchaseWeight: 1000, netWeight: 900 },
    ],
  }));
  const store = new Store(file);
  await store.load();
  assert.deepEqual(store.spools.map((x) => [x.id, x.price]), [['a', 19.99], ['b', 5], ['c', 15], ['d', null]]);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.spools[1].price, 5);
  assert.deepEqual(saved.settings.priceList, [{ material: 'PLA Basic', price: 19.99, weight: 1000 }]);
  // Mit Preisliste gespeichert: keine zweite Übernahme
  const data = { spools: [normalizeSpool({ material: 'PLA Basic' })], settings };
  assert.equal(migratePriceList(saved.settings, data), 0);
  assert.equal(data.spools[0].price, null);
  await fs.rm(dir, { recursive: true, force: true });
});

test('Druckzeit aus dem Gewicht schätzen, gelernt aus dem Druckverlauf', () => {
  // Ohne Verlauf: 5 Min. Vorlauf + 2,4 Min. pro Gramm
  assert.deepEqual(printRate([]), DEFAULT_PRINT_RATE);
  assert.equal(estimateSeconds(31.2), 4793); // 300 s + 31,2 g × 144 s, gerundet = ca. 80 Min.
  assert.equal(estimateSeconds(0), 0);
  // Drucker braucht 6 Min. Vorlauf und 110 s pro Gramm; ein über Nacht pausierter Druck stört nicht
  const tasks = Array.from({ length: 12 }, (_, i) => ({ status: 2, grams: 10 + i * 8, seconds: 360 + (10 + i * 8) * 110 }));
  tasks.push({ status: 2, grams: 10, seconds: 60000 }, { status: 3, grams: 50, seconds: 300 }, { status: 2, grams: 0.5, seconds: 400 });
  const r = printRate(tasks);
  assert.deepEqual([r.setup, Math.round(r.perGram), r.prints], [360, 110, 12]);
  assert.equal(estimateSeconds(100, r), 360 + 11000);
  // Zu wenige Drucke: Richtwerte; unplausibler Vorlauf wird begrenzt
  assert.equal(printRate(tasks.slice(0, 2)).prints, 0);
  const odd = printRate([{ status: 2, grams: 10, seconds: 100 }, { status: 2, grams: 20, seconds: 4000 }, { status: 2, grams: 30, seconds: 7000 }].map((t) => ({ ...t, seconds: Math.max(t.seconds, 120) })));
  assert.ok(odd.setup >= 0 && odd.perGram > 0);
});

test('Jahresübersicht: Einnahmen, Filament, Strom, Porto und eigene Ausgaben', () => {
  const sales = [
    normalizeSale({ nr: '2026-001', date: '2026-03-02', customer: 'Lisa Müller\nHauptstr. 1', items: [{ title: 'Halter', qty: 2, price: 10, cost: 3 }, { title: 'Versand', kind: 'versand', qty: 1, price: 4.5, cost: 4.19 }] }),
    normalizeSale({ nr: '2026-002', date: '2026-11-20', items: [{ title: 'Kürbis', qty: 5, price: 7.5, cost: 1.6 }] }),
    normalizeSale({ nr: '2025-009', date: '2025-12-30', items: [{ title: 'Alt', qty: 1, price: 30, cost: 5 }] }),
  ];
  const a = spool({ colorName: 'Schwarz', price: 19.99, boughtAt: '2026-02-10' });
  a.nr = 6;
  const b = spool({ colorName: 'Weiß', price: null, boughtAt: '2026-05-01' }); // ohne Preis
  const old = spool({ colorName: 'Rot', price: 18, boughtAt: '2025-08-01' });
  // gelöschte Rolle bleibt im Archiv, eine Rolle ohne Preis nicht
  const gone = spool({ colorName: 'Orange', price: 21.5, boughtAt: '2026-04-04' });
  gone.nr = 9;
  let archive = archiveSpool([], gone, '2026-09-01T10:00:00.000Z');
  archive = archiveSpool(archive, b, '2026-09-01T10:00:00.000Z');
  assert.equal(archive.length, 1);
  const powerPayments = [normalizePowerPayment({ date: '2026-06-30', amount: 3.21, prints: 14 })];
  const expenses = [
    normalizeExpense({ date: '2026-07-07', title: 'Düse 0,4 mm', amount: 9.99, category: 'Ersatzteile' }),
    normalizeExpense({ date: '2025-07-07', title: 'Platte', amount: 30, category: 'Ersatzteile' }),
  ];
  const r = computeYear({
    year: 2026, sales, spools: [a, b, old], archive, powerPayments, expenses,
  });
  assert.equal(r.income, 22); // 10 + 4,50 Versand + 7,50
  assert.equal(r.receipts, 2);
  assert.deepEqual(r.byCategory, [
    { category: 'Filament', amount: 41.49 }, { category: 'Ersatzteile', amount: 9.99 }, { category: 'Porto', amount: 4.19 }, { category: 'Strom', amount: 3.21 },
  ]);
  assert.equal(r.spend, 58.88);
  assert.equal(r.result, -36.88);
  assert.equal(r.unpriced, 1);
  // Mit Preisliste: die weiße PLA-Basic-Rolle ohne Preis zählt mit 19,99 €
  const withList = computeYear({
    year: 2026, sales, spools: [a, b, old], archive, powerPayments, expenses, settings,
  });
  assert.deepEqual([withList.listed, withList.unpriced, withList.byCategory[0].amount], [1, 0, 61.48]);
  assert.match(withList.entries.find((e) => e.date === '2026-05-01').title, /Weiß \(Preis laut Preisliste\)$/);
  assert.equal(r.prevIncome, 30);
  assert.deepEqual([r.months[2].income, r.months[2].spend, r.months[1].spend], [14.5, 4.19, 19.99]);
  assert.match(r.entries.find((e) => e.category === 'Filament' && e.amount === 21.5).title, /^#9 .*Orange.*\(gelöscht\)$/);
  assert.equal(r.entries[0].title, '#6 PLA Basic Schwarz');
  assert.deepEqual(yearsWithData({ sales, spools: [a, old], expenses, now: '2026-10-26T00:00:00Z' }), ['2026', '2025']);

  const csv = yearCsv(r);
  assert.ok(csv.startsWith('\ufeffDatum;Art;Kategorie;Beschreibung;Einnahme;Ausgabe\r\n'));
  assert.match(csv, /02\.03\.2026;Einnahme;Verkauf;Beleg 2026-001, Lisa Müller;14,50;\r\n/);
  assert.match(csv, /;Ergebnis;-36,88;\r\n$/);
});

test('Abbuchen bei Druckende: Rolle im Slot, einmal je Druck, rückgängig', async () => {
  const {
    bookTask, dueTasks, normalizeAutoBook, planBooking, undoBooking,
  } = await import('../src/bambu/autobook.js');
  const black = spool({ colorName: 'Schwarz', colorHex: '#000000', netWeight: 800, inAms: true, bambu: { slot: 'A1' } });
  const green = spool({ colorName: 'Grün', colorHex: '#3F8E43', netWeight: 20, inAms: true, bambu: { slot: 'A2' } });
  const white = spool({ colorName: 'Weiß', colorHex: '#FFFFFF', netWeight: 900, inAms: true, bambu: { slot: 'A3', cloudId: 502 } });
  const lager = spool({ colorName: 'Rot', colorHex: '#C12E1F', netWeight: 1000 }); // nicht im AMS
  black.nr = 1; green.nr = 2; white.nr = 3; lager.nr = 4;
  const spools = [black, green, white, lager];
  const task = {
    id: '901', title: 'Schild', status: 2, startTime: '2026-10-26T09:00:00Z',
    filaments: [
      { slot: 'A1', color: '#000000', type: 'PLA', grams: 31.2 },
      { slot: 'A2', color: '#3F8E43', type: 'PLA', grams: 25 }, // mehr als übrig: 0 statt negativ
      { slot: 'A3', color: '#FFFFFF', type: 'PLA', grams: 8.4 }, // zählt Bambu selbst
      { slot: 'A4', color: '#C12E1F', type: 'PLA', grams: 3 }, // rote Rolle liegt nicht im AMS
    ],
  };
  const plan = planBooking(task, spools, { autoSync: true });
  assert.deepEqual(plan.items.map((i) => [i.spoolId, i.grams]), [[black.id, 31.2], [green.id, 25]]);
  assert.deepEqual(plan.skipped.map((x) => x.reason), ['zählt der Bambu Filament Manager', 'keine passende Rolle im AMS']);
  // Ohne Abgleich mit dem Filament Manager wird auch die weiße Rolle gebucht
  assert.equal(planBooking(task, spools, { autoSync: false }).items.length, 3);

  const state = normalizeAutoBook({ since: '2026-10-26T08:00:00Z' });
  const old = { ...task, id: '900', startTime: '2026-10-25T09:00:00Z' };
  const failed = { ...task, id: '902', status: 3 };
  assert.deepEqual(dueTasks(state, [old, task, failed]).map((t) => t.id), ['901']);

  const entry = bookTask(state, task, spools, { autoSync: true }, '2026-10-26T12:00:00Z');
  assert.deepEqual(entry.items.map((i) => [i.nr, i.grams, i.before, i.after]), [[1, 31.2, 800, 769], [2, 25, 20, 0]]);
  assert.deepEqual([spools[0].netWeight, spools[1].netWeight, spools[2].netWeight, spools[0].opened], [769, 0, 900, true]);
  assert.equal(bookTask(state, task, spools, { autoSync: true }), null); // nie doppelt
  assert.deepEqual(dueTasks(state, [task]), []);

  // Slot getauscht: die schwarze Rolle steckt jetzt in A4, gebucht wird nach Farbe
  spools[0] = normalizeSpool({ bambu: { slot: 'A4' } }, { base: spools[0] });
  const moved = bookTask(state, { ...task, id: '903', filaments: [{ slot: 'A1', color: '#000000', type: 'PLA', grams: 10 }] }, spools, {});
  assert.deepEqual(moved.items.map((i) => [i.nr, i.after]), [[1, 759]]);

  const undone = undoBooking(state, '901', spools);
  assert.equal(undone.undone, true);
  assert.deepEqual([spools[0].netWeight, spools[1].netWeight], [790, 20]); // grün: nur die 20 g, die da waren
  assert.equal(undoBooking(state, '901', spools), null);
  assert.deepEqual(dueTasks(state, [task]), []); // bleibt gebucht
});

test('Bestellstatus: Schritte, vorwärts und zurück, Abholung', async () => {
  const {
    advanceOrder, normalizeOrder, orderLabel, orderSteps, setOrderStatus,
  } = await import('../public/js/domain.js');
  const o = normalizeOrder({}, { shipping: true });
  assert.deepEqual([o.status, o.delivery, o.token], ['', 'versand', '']);
  assert.equal(advanceOrder(o, 'versendet'), false); // ohne Verfolgung passiert nichts
  setOrderStatus(o, 'bestellt', 't1');
  setOrderStatus(o, 'druck', 't2');
  assert.equal(advanceOrder(o, 'bearbeitung'), false); // nie rückwärts
  assert.equal(advanceOrder(o, 'versendet', 't3'), true);
  setOrderStatus(o, 'bearbeitung', 't4'); // von Hand zurück
  assert.deepEqual(o.history, [{ status: 'bestellt', at: 't1' }, { status: 'bearbeitung', at: 't4' }]);
  assert.deepEqual(orderSteps('abholung'), ['bestellt', 'bearbeitung', 'druck', 'fertig', 'zugestellt']);
  assert.deepEqual([orderLabel('fertig', 'abholung'), orderLabel('fertig', 'versand'), orderLabel('zugestellt', 'abholung')], ['Bereit zur Abholung', 'Verpackt', 'Abgeholt']);
  assert.equal(normalizeOrder({ token: '<script>' }).token, '');
  const sale = normalizeSale({ items: [{ title: 'A', qty: 1, price: 1 }] });
  assert.deepEqual([sale.order.status, sale.order.delivery], ['', 'abholung']);
});

test('Lieferarten: Versand, Lieferung ohne Post, Abholung', async () => {
  const { orderLabel, orderSteps, orderText } = await import('../public/js/domain.js');
  assert.deepEqual(orderSteps('lieferung'), ['bestellt', 'bearbeitung', 'druck', 'fertig', 'versendet', 'zugestellt']);
  assert.deepEqual(['fertig', 'versendet', 'zugestellt'].map((s) => orderLabel(s, 'lieferung')), ['Bereit zur Lieferung', 'Wird gebracht', 'Geliefert']);
  assert.match(orderText('versendet', 'lieferung'), /persönlich/);
  assert.equal(orderLabel('versendet', 'versand'), 'Versendet');
  // Aus dem offenen Beleg: Lieferung ohne Post mit Anfahrt, zählt nicht zum Mindestpreis
  saveDraft({ positions: [], customer: '', note: '' });
  addPosition({ title: 'Clip', qty: 1, grams: 5, seconds: 600, perGram: 0.02 });
  addPosition({ title: 'Lieferung (ohne Post)', qty: 1, manual: true, kind: 'versand', piecePrice: 2, pieceCost: 0.8 });
  const draft = { ...loadDraft(), delivery: 'lieferung' };
  const sale = normalizeSale(saleFromDraft(draft, { ...settings, roundTo: 0, discountPct: 0 }, { date: '2026-10-26', customer: '', note: '' }));
  assert.deepEqual([sale.order.delivery, sale.order.status, sale.qty], ['lieferung', '', 1]);
  assert.equal(sale.minExtra, 1.15); // Clip 1,85 € bis 3 €, die Lieferung zählt nicht mit
  assert.equal(normalizeSettings({ deliveryPrice: '2,50' }).deliveryPrice, 2.5);
});

test('Filament-Pakete: aus der Einkaufsliste, beim Ankommen Rollen mit Preis und Datum', async () => {
  const {
    deliveryItemsFromShopping, normalizeDelivery, spoolsFromDelivery,
  } = await import('../public/js/domain.js');
  const low = spool({ colorName: 'Schwarz', colorHex: '#000000', netWeight: 60 });
  const items = deliveryItemsFromShopping(shoppingList([low], settings));
  assert.deepEqual(items.map((i) => [i.material, i.colorName, i.purchaseWeight, i.price, i.qty]), [['PLA Basic', 'Schwarz', 1000, 19.99, 1]]);
  const d = normalizeDelivery({
    shop: 'Bambu Lab Store', orderedAt: '2026-10-20', tracking: { number: '0034 0434 1612 3456 7890' },
    items: [...items, { material: 'PETG HF', colorName: 'Weiß', colorHex: '#FFFFFF', purchaseWeight: 1000, price: '17,99', qty: 2 }],
  });
  assert.equal(d.tracking.number, '00340434161234567890');
  const made = spoolsFromDelivery(d, { location: '3' }).map((s) => normalizeSpool(s));
  assert.equal(made.length, 3);
  assert.deepEqual(made.map((s) => [s.material, s.colorName, s.netWeight, s.price, s.boughtAt, s.location, s.opened]), [
    ['PLA Basic', 'Schwarz', 1000, 19.99, '2026-10-20', '3', false],
    ['PETG HF', 'Weiß', 1000, 17.99, '2026-10-20', '3', false],
    ['PETG HF', 'Weiß', 1000, 17.99, '2026-10-20', '3', false],
  ]);
});

test('Fahrtkosten und Bambu-Farben', async () => {
  const { deliveryQuote } = await import('../public/js/domain.js');
  const { bambuColors, bambuMaterials } = await import('../public/js/bambu-colors.js');
  const s = normalizeSettings({ kmRate: '0,30', kmCost: '0,20', deliveryPrice: '1', roundTo: 0.5 });
  // 12,3 km einfach, hin und zurück 24,6 km × 0,30 € + 1 € Grundpreis = 8,38 €, aufgerundet 8,50 €
  assert.deepEqual(deliveryQuote(12.3, s), { km: 12.3, trip: 24.6, raw: 8.38, price: 8.5, cost: 4.92 });
  assert.deepEqual(deliveryQuote(10, { ...s, roundTrip: false, roundTo: 0 }), { km: 10, trip: 10, raw: 4, price: 4, cost: 2 });
  assert.equal(normalizeSettings({}).roundTrip, true);
  // Bambu-Sortiment
  assert.ok(bambuMaterials().includes('PLA Basic') && bambuMaterials().includes('PETG HF'));
  const basic = bambuColors('pla basic');
  assert.ok(basic.length > 20);
  assert.deepEqual(basic.find((c) => c.name === 'Kürbis-Orange'), { name: 'Kürbis-Orange', hex: '#FF9016', hexes: ['#FF9016'] });
  assert.deepEqual(bambuColors('Unbekannt XY'), []);
  assert.ok(filamentTypes([], settings).some((t) => t.material === 'PLA Silk')); // ganzes Sortiment zur Auswahl
});

test('Verschenkt: Selbstkosten, Vorrat, wer danach bestellt hat', async () => {
  const {
    giftFollowUp, giftSummary, normalizeGift,
  } = await import('../public/js/domain.js');
  const kuerbis = normalizeStockItem({ title: 'Kürbis', made: 25, price: 1.5, parts: { filament: 0.24, labor: 0.05 } });
  const g = normalizeGift({
    date: '2026-10-10', customer: 'Lisa Müller\nGartenweg 5', customerId: 'c1', reason: 'Probe',
    items: [stockSaleItem(kuerbis, 2, 0), { title: 'Versand', kind: 'versand', qty: 1, cost: 4.19 }],
  });
  assert.deepEqual([g.title, g.qty, g.cost, g.items[0].price, g.items.length], ['Kürbis', 2, 0.58, 0, 1]); // ohne Versand
  applyStockSale([kuerbis], g, -1, 'given');
  assert.deepEqual([kuerbis.onHand, kuerbis.sold, kuerbis.given], [23, 0, 2]);
  assert.throws(() => applyStockSale([kuerbis], normalizeGift({ customer: 'X', items: [stockSaleItem(kuerbis, 30, 0)] }), -1, 'given'), /nur noch 23/);

  const sales = [
    normalizeSale({ nr: '2026-003', date: '2026-10-01', customerId: 'c1', customer: 'Lisa Müller', items: [{ title: 'A', qty: 1, price: 5 }] }), // vorher
    normalizeSale({ nr: '2026-007', date: '2026-10-20', customerId: 'c1', customer: 'Lisa Müller', items: [{ title: 'Kürbis', qty: 6, price: 9 }] }),
    normalizeSale({ nr: '2026-008', date: '2026-10-21', customer: 'Tom', items: [{ title: 'B', qty: 1, price: 3 }] }),
  ];
  assert.equal(giftFollowUp(g, sales).nr, '2026-007');
  const tom = normalizeGift({ date: '2026-10-22', customer: 'Tom', items: [{ title: 'Clip', qty: 1, cost: 0.3 }] });
  assert.equal(giftFollowUp(tom, sales), null); // Tom hat vor der Probe gekauft
  assert.deepEqual(giftSummary([g, tom], sales), {
    count: 2, pieces: 3, people: 2, cost: 0.88, ordered: 1,
  });
});

test('Kleinunternehmer: Warnung bei 20.000, 25.000, 80.000 und 100.000 € Umsatz', async () => {
  const { taxStatus } = await import('../public/js/stats.js');
  const sale = (date, price) => normalizeSale({ date, items: [{ title: 'A', qty: 1, price }] });
  const sales = [sale('2026-03-01', 15000), sale('2025-12-30', 30000)];
  assert.equal(taxStatus(sales, 2026).step, null);
  assert.equal(taxStatus(sales, 2026).next.at, 20000);
  sales.push(sale('2026-09-01', 6000));
  assert.deepEqual([taxStatus(sales, 2026).revenue, taxStatus(sales, 2026).step.at], [21000, 20000]);
  // Benachrichtigung: jede Stufe einmal, nur mit Kleinunternehmer
  const sent = [];
  const store = { data: { sales, settings: normalizeSettings({ smallBusiness: true }), spools: [], notify: normalizeNotify({ enabled: true, topic: 'filament-lager-test' }) } };
  const n = new Notifier({ store, fetchFn: async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true }; } });
  n.checkTax(new Date('2026-10-28T12:00:00'));
  n.checkTax(new Date('2026-10-28T12:00:00'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, 'Umsatz bei 20.000 €');
  assert.match(sent[0].message, /21\.000,00/);
  sales.push(sale('2026-10-01', 5000));
  n.checkTax(new Date('2026-10-28T12:00:00'));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent.map((x) => x.title), ['Umsatz bei 20.000 €', 'Umsatz über 25.000 €']);
  store.data.settings.smallBusiness = false;
  sales.push(sale('2026-10-02', 60000));
  n.checkTax(new Date('2026-10-28T12:00:00'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, 2);
});
