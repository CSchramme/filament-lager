import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  defaultSettings, nextReceiptNr, normalizePowerPayment, normalizeSale, normalizeSettings, normalizeSpool, openPower,
} from '../public/js/domain.js';
import {
  addPosition, draftTotals, loadDraft, positionBreakdown, saleFromDraft, saveDraft,
} from '../public/js/sales.js';
import { Store } from '../src/store.js';

const settings = defaultSettings();

test('Beleg mit Positionen und Aufteilung pro Teil', () => {
  const sale = normalizeSale({
    date: '2026-10-25',
    customer: 'Oma',
    minExtra: '0,50',
    items: [
      { title: 'Halter', qty: 2, grams: 31.2, seconds: 5040, breakdown: { filament: 0.62, energy: 0.05, machine: 0.42, failure: 0.07, labor: 0.63, cost: 1.79, profit: 0.54, piece: 2.33 } },
      { title: 'Versand', qty: 1, price: 2, cost: 2 },
    ],
  });
  assert.equal(sale.title, 'Halter + 1 weitere');
  assert.equal(sale.qty, 3);
  assert.deepEqual(sale.items.map((i) => [i.price, i.cost, i.energy]), [[4.66, 3.58, 0.1], [2, 2, 0]]);
  assert.equal(sale.price, 7.16); // 4,66 + 2 + 0,50 Mindestpreis-Aufschlag
  assert.equal(sale.cost, 5.58);
  assert.equal(sale.energy, 0.1);
  assert.equal(sale.items[1].breakdown, null);

  // Alte Verkäufe ohne Positionen werden zu einer Position
  const old = normalizeSale({ title: 'Alt', qty: 2, price: 7, cost: 3, grams: 40 });
  assert.equal(old.items.length, 1);
  assert.deepEqual([old.items[0].title, old.items[0].qty, old.items[0].grams, old.price, old.cost], ['Alt', 2, 20, 7, 3]);
});

test('Belegnummern laufen pro Jahr', () => {
  const data = {};
  assert.equal(nextReceiptNr(data, '2026-10-25'), '2026-001');
  assert.equal(nextReceiptNr(data, '2026-12-31'), '2026-002');
  assert.equal(nextReceiptNr(data, '2027-01-02'), '2027-001');
  assert.deepEqual(data.receiptSeq, { 2026: 2, 2027: 1 });
});

test('Offener Beleg: Positionen, eigener Preis und Mindestpreis', () => {
  saveDraft({ positions: [], customer: '', note: '' });
  const spool = normalizeSpool({ colorName: 'Orange', material: 'PLA', purchaseWeight: 1000, price: 20 });
  spool.nr = 4;
  addPosition({ title: 'Clip', qty: 1, grams: 5, seconds: 600, perGram: 0.02, spool });
  let draft = loadDraft();
  assert.equal(draft.positions.length, 1);
  assert.deepEqual([draft.positions[0].spoolNr, draft.positions[0].colorName], [4, 'Orange']);
  // Allein 1,85 €, der Mindestpreis hebt den Beleg auf 3 €
  let t = draftTotals(draft, settings);
  assert.deepEqual([t.sum, t.minExtra, t.total], [1.85, 1.15, 3]);

  addPosition({ title: 'Halter', qty: 1, grams: 31.2, seconds: 5040, perGram: 0.02, overrides: { profitPct: 50 } });
  draft = loadDraft();
  t = draftTotals(draft, settings);
  assert.equal(t.lines[1].breakdown.cost, 2.41);
  assert.equal(t.lines[1].breakdown.profit, 1.21); // 50 % statt 30 %
  assert.deepEqual([t.sum, t.minExtra, t.total], [5.47, 0, 5.47]);

  // Eigener Preis pro Stück ändert nur den Gewinn
  draft.positions[0].piecePrice = 2.5;
  const b = positionBreakdown(draft.positions[0], settings);
  assert.deepEqual([b.cost, b.profit, b.piece], [1.42, 1.08, 2.5]);

  addPosition({ title: 'Versand', manual: true, piecePrice: 1.6, pieceCost: 1.6 });
  draft = loadDraft();
  draft.positions[0].piecePrice = 2.5;
  const body = saleFromDraft(draft, settings, { date: '2026-10-25', customer: 'Max', note: 'bar' });
  assert.equal(body.items.length, 3);
  assert.equal(body.items[2].breakdown, null);
  const sale = normalizeSale(body);
  assert.equal(sale.price, 7.72); // 2,50 + 3,62 + 1,60
  assert.deepEqual(sale.rates, { energyPrice: 0.3, printerWatts: 120, machineRate: 0.3, failPct: 10 });
  assert.equal(sale.cost, 5.43); // 1,42 + 2,41 + 1,60
  assert.deepEqual(sale.items[0].breakdown, {
    filament: 0.1, energy: 0.01, machine: 0.05, failure: 0.01, labor: 1.25, cost: 1.42, profit: 1.08, piece: 2.5,
  });
});

test('Strom seit der letzten Abrechnung', () => {
  const tasks = [
    { title: 'C', startTime: '2026-10-22T08:00:00Z', seconds: 3600, status: 3 },
    { title: 'B', startTime: '2026-10-20T08:00:00Z', seconds: 7200, status: 2 },
    { title: 'A', startTime: '2026-10-02T08:00:00Z', seconds: 36000, status: 2 },
    { title: 'läuft', startTime: '2026-10-24T08:00:00Z', seconds: 0, status: 4 },
  ];
  const now = '2026-10-25T12:00:00.000Z';
  // Ohne Abrechnung ab Monatsanfang: 13 Std. × 120 W = 1,56 kWh × 0,30 € = 0,47 €
  let p = openPower({ tasks, settings, now });
  assert.equal(p.from, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(p.rows.map((r) => r.title), ['A', 'B', 'C']);
  assert.deepEqual(p.rows.map((r) => r.amount), [0.36, 0.07, 0.04]);
  assert.equal(p.amount, 0.47);
  assert.ok(Math.abs(p.kwh - 1.56) < 1e-9);
  assert.equal(p.hours, 13);
  assert.equal(p.source, 'verlauf');

  // Nach einer Abrechnung am 15. zählen nur die Drucke danach
  const paid = normalizePowerPayment({ date: '2026-10-15', from: p.from, to: '2026-10-15T18:00:00.000Z', amount: 0.36, rows: p.rows.slice(0, 1) });
  assert.equal(paid.rows[0].title, 'A');
  p = openPower({ tasks, payments: [paid], settings, now });
  assert.deepEqual(p.rows.map((r) => r.title), ['B', 'C']);
  assert.equal(p.amount, 0.11);
  // Zeitraum mit Ende
  p = openPower({ tasks, settings, since: '2026-10-01T00:00:00Z', until: '2026-10-21T00:00:00Z', now });
  assert.deepEqual(p.rows.map((r) => r.title), ['A', 'B']);

  // Ohne Druckverlauf aus den Belegen
  const sales = [normalizeSale({ createdAt: '2026-10-10T10:00:00Z', items: [{ title: 'Halter', qty: 3, seconds: 3600, price: 9 }] })];
  p = openPower({ sales, settings, now });
  assert.equal(p.source, 'belege');
  assert.deepEqual(p.rows.map((r) => [r.title, r.seconds, r.amount]), [['Halter × 3', 10800, 0.11]]);
});

test('Alte Verkäufe bekommen beim Laden Belegnummern, älteste zuerst', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lager-belege-'));
  const file = path.join(dir, 'lager.json');
  await fs.writeFile(file, JSON.stringify({
    settings: { wearPct: 5, profitPct: 10 },
    spools: [],
    sales: [
      { id: 'b', title: 'Neu', price: 4, cost: 1, date: '2026-10-20' },
      { id: 'a', title: 'Alt', price: 3, cost: 1, date: '2026-10-02' },
    ],
  }));
  const store = new Store(file);
  await store.load();
  assert.deepEqual(store.data.sales.map((x) => [x.id, x.nr]), [['b', '2026-002'], ['a', '2026-001']]);
  assert.deepEqual(store.data.powerPayments, []);
  // Der alte Standardgewinn von 10 % wird zu 30 %, neue Posten kommen dazu
  assert.equal(store.settings.profitPct, 30);
  assert.equal(store.settings.machineRate, 0.3);
  assert.equal('wearPct' in store.settings, false);
  await fs.rm(dir, { recursive: true, force: true });
});

test('Eigener Gewinn aus alten Einstellungen bleibt', () => {
  assert.equal(normalizeSettings({ wearPct: 5, profitPct: 25 }).profitPct, 25);
  assert.equal(normalizeSettings({ machineRate: 0.3, profitPct: 10 }).profitPct, 10);
});
