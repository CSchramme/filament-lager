import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  colorNameFor, defaultSettings, grossOf, materialForFilamentId, netFromGross, normHex, normalizeSettings,
  normalizeSpool, parseCsv, spoolsFromRows, stockLevel, summarize, toCsv,
} from '../public/js/domain.js';
import { seedSpools } from '../public/js/seed.js';

const settings = defaultSettings();

test('Restgewicht aus Bruttogewicht wie in der Excel-Tabelle', () => {
  assert.equal(netFromGross(511, 274), 237);
  assert.equal(netFromGross(1232, 274), 958);
  assert.equal(netFromGross(200, 274), 0);
});

test('Startdaten entsprechen der Excel-Tabelle', () => {
  const spools = seedSpools();
  assert.equal(spools.length, 18);
  const orange = spools[0];
  assert.equal(orange.colorName, 'Orange');
  assert.equal(grossOf(orange, settings), 511);
  const weiss = spools.find((s) => s.colorName === 'Weiß');
  assert.equal(grossOf(weiss, settings), 1204);
  assert.equal(weiss.inAms, true);
  const gelb = spools.find((s) => s.colorName === 'Gelb');
  assert.equal(grossOf(gelb, settings), 80); // Pappe hat in der Tabelle keine Tara
  const sum = summarize(spools, settings);
  assert.equal(sum.inAms, 4);
  assert.equal(sum.totalNet, 237 + 958 + 828 + 611 + 1000 + 1000 + 580 + 1000 + 930 + 1000 + 80 + 93 + 103 + 35 + 25 + 42 + 85 + 75);
  assert.equal(sum.sealed, 2);
});

test('normalizeSpool füllt Standardwerte und behält Bambu-Verknüpfung beim Bearbeiten', () => {
  const s = normalizeSpool({ material: 'PETG HF', colorName: 'Schwarz', purchaseWeight: '1000', netWeight: '640' });
  assert.equal(s.colorHex, '#000000');
  assert.equal(s.opened, true);
  assert.equal(s.bambu.cloudId, null);
  const linked = normalizeSpool({ bambu: { cloudId: 42, rfid: 'abc' } }, { base: s });
  const edited = normalizeSpool({ netWeight: 500, bambu: { slot: 'A2' } }, { base: linked });
  assert.equal(edited.bambu.cloudId, 42);
  assert.equal(edited.bambu.rfid, 'ABC');
  assert.equal(edited.bambu.slot, 'A2');
  assert.equal(edited.id, s.id);
});

test('Füllstand-Stufen', () => {
  const base = { purchaseWeight: 1000, opened: true };
  assert.equal(stockLevel({ ...base, netWeight: 0 }, settings), 'leer');
  assert.equal(stockLevel({ ...base, netWeight: 120 }, settings), 'knapp');
  assert.equal(stockLevel({ ...base, netWeight: 600 }, settings), 'ok');
  assert.equal(stockLevel({ ...base, opened: false, netWeight: 1000 }, settings), 'neu');
});

test('Farben und Bambu-IDs', () => {
  assert.equal(normHex('ff6a13ff'), '#FF6A13');
  assert.equal(normHex('nope'), '');
  assert.equal(colorNameFor('#FF6A13FF'), 'Orange');
  assert.equal(colorNameFor('#FE6B14'), 'Orange');
  assert.equal(materialForFilamentId('GFA00'), 'PLA Basic');
  assert.equal(materialForFilamentId('GFG02'), 'PETG HF');
});

test('Excel-CSV mit den Spalten der bisherigen Tabelle wird erkannt', () => {
  const csv = [
    'Art;Hersteller;Farbe;Kaufgewicht;Gewicht mit Spule;Gewicht;Paketnummer;geöffnet?;im AMS;Spulenart',
    'PLA Basic;Bambu Lab;Orange;1000;511;237;1;ja;nein;Plastik',
    'PLA Basic;Bambu Lab;Gelb;250;80;80;kiste;ja;nein;Pappe',
    'PLA Basic;Bambu Lab;Weiß;1000;1204;;;"ja";ja;Plastik',
    ';;;;;0;;;;',
  ].join('\r\n');
  const spools = spoolsFromRows(parseCsv(csv), settings);
  assert.equal(spools.length, 3);
  assert.equal(spools[0].netWeight, 237);
  assert.equal(spools[0].location, '1');
  assert.equal(spools[0].spoolTypeId, 'plastik');
  assert.equal(spools[1].spoolTypeId, 'pappe');
  assert.equal(spools[2].netWeight, 930); // aus Gewicht mit Spule minus Tara
  assert.equal(spools[2].inAms, true);
});

test('CSV-Export lässt sich wieder einlesen', () => {
  const spools = seedSpools();
  spools[0].note = 'Notiz; mit "Anführungszeichen"';
  const back = spoolsFromRows(parseCsv(toCsv(spools, settings)), settings);
  assert.equal(back.length, spools.length);
  assert.deepEqual(back.map((s) => [s.colorName, s.netWeight, s.location, s.spoolTypeId, s.inAms]),
    spools.map((s) => [s.colorName, s.netWeight, s.location, s.spoolTypeId, s.inAms]));
  assert.equal(back[0].note, spools[0].note);
  assert.equal(back[0].colorHex, spools[0].colorHex);
});

test('CSV ohne passende Kopfzeile wird abgelehnt', () => {
  assert.throws(() => spoolsFromRows(parseCsv('a,b\n1,2'), settings), /Art/);
});

test('Einstellungen werden bereinigt', () => {
  const s = normalizeSettings({ spoolTypes: [{ id: 'x', name: 'Test', tare: '-5' }, { name: '' }], lowStock: '200' });
  assert.deepEqual(s.spoolTypes, [{ id: 'x', name: 'Test', tare: 0 }]);
  assert.equal(s.lowStock, 200);
  assert.equal(normalizeSettings({ spoolTypes: [] }).spoolTypes.length, 2);
});
