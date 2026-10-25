import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultSettings, jobQuote, matchSpool, normalizeSale, normalizeSpool, salesSummary,
} from '../public/js/domain.js';
import { mergeTasks, slotFromAmsIndex, taskSummary } from '../src/bambu/tasks.js';

const raw = {
  id: 35237965, designId: 123456, title: 'Kabelhalter', cover: 'https://example.org/c.png', status: 2,
  startTime: '2026-10-20T10:00:00Z', endTime: '2026-10-20T11:30:00Z', weight: 34.62, costTime: 5000, plateIndex: 1,
  deviceId: 'SN1', deviceName: 'P1S Werkstatt',
  amsDetailMapping: [
    { ams: 0, sourceColor: 'FF6A13FF', targetColor: 'FF6A13FF', filamentId: 'GFA00', filamentType: 'PLA', weight: 30.1 },
    { ams: 5, sourceColor: '000000FF', targetColor: '000000FF', filamentId: 'GFA00', filamentType: 'PLA', weight: 4.52 },
  ],
};

test('Druck aus dem Bambu-Verlauf wird übersetzt', () => {
  const t = taskSummary(raw);
  assert.equal(t.id, '35237965');
  assert.equal(t.seconds, 5400); // echte Dauer, nicht die Schätzung
  assert.equal(t.grams, 34.62);
  assert.deepEqual(t.filaments.map((f) => [f.slot, f.color, f.grams]), [['A1', '#FF6A13', 30.1], ['B2', '#000000', 4.52]]);
  // abgebrochen: echte Laufzeit bis zum Abbruch; ohne Ende (läuft noch) keine Zeit
  assert.equal(taskSummary({ ...raw, status: 3, endTime: '2026-10-20T10:20:00Z' }).seconds, 1200);
  assert.equal(taskSummary({ ...raw, status: 3, endTime: raw.startTime }).seconds, 0);
  assert.equal(taskSummary({ ...raw, endTime: raw.startTime }).seconds, 5000);
  assert.deepEqual([0, 15, 16, 254, 99].map(slotFromAmsIndex), ['A1', 'D4', 'HT1', 'Ext', '']);
  const merged = mergeTasks([taskSummary({ ...raw, id: 1, startTime: '2026-10-01T00:00:00Z' })], [t]);
  assert.deepEqual(merged.map((x) => x.id), ['35237965', '1']);
});

test('Kosten eines mehrfarbigen Drucks je Farbe', () => {
  const settings = defaultSettings();
  const orange = normalizeSpool({ colorName: 'Orange', purchaseWeight: 1000, netWeight: 500, price: 25, inAms: true, bambu: { slot: 'A1' } });
  const orange2 = normalizeSpool({ colorName: 'Orange', purchaseWeight: 1000, netWeight: 900, price: 30 });
  const t = taskSummary(raw);
  assert.equal(matchSpool([orange2, orange], t.filaments[0]).id, orange.id); // steckt in A1
  const q = jobQuote(t, [orange, orange2], settings);
  // Orange 30,1 g × 2,5 ct + Schwarz 4,52 g × 2 ct (Standard) = 0,84 €; Strom 1,5 Std. × 120 W × 0,30 € = 0,05 €
  // Drucker 1,5 Std. × 0,30 € = 0,45; Fehldrucke 10 % von 0,89 = 0,09; Arbeit 1,25
  assert.deepEqual([q.filament, q.energy, q.machine, q.failure, q.labor], [0.84, 0.05, 0.45, 0.09, 1.25]);
  assert.deepEqual([q.cost, q.profit, q.piece], [2.68, 0.8, 3.48]);
  assert.equal(q.parts[1].spool, null);
  // 4 Stück auf einmal: Arbeit 0,31 pro Stück, Selbstkosten 1,74, Preis 2,26
  const four = jobQuote(t, [orange, orange2], settings, { qty: 4 });
  assert.deepEqual([four.labor, four.cost, four.piece, four.sum], [0.31, 1.74, 2.26, 9.04]);
});

test('Verkäufe: Summen gesamt und im Monat', () => {
  const sales = [
    normalizeSale({ title: 'A', price: '10,00', cost: 4, date: '2026-10-03', qty: 2 }),
    normalizeSale({ title: 'B', price: 5, cost: 6, date: '2026-09-28' }),
  ];
  const s = salesSummary(sales, { month: '2026-10' });
  assert.deepEqual(s.month, { count: 1, pieces: 2, revenue: 10, cost: 4, profit: 6 });
  assert.deepEqual(s.total, { count: 2, pieces: 3, revenue: 15, cost: 10, profit: 5 });
  assert.equal(normalizeSale({}).title, 'Druck');
});
