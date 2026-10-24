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

test('Pakete und AMS-Slots: Liste und Reihenfolge', async () => {
  const { amsSlots, placeList, placeName, spoolPlace } = await import('../public/js/domain.js');
  const spools = seedSpools();
  assert.deepEqual(placeList(settings, spools), ['1', '2', '3', '4', '5', '6', '1k', '2k', 'Kiste']);
  assert.deepEqual(placeList({ ...settings, places: ['Regal'] }, spools).slice(0, 2), ['Regal', '1']);
  assert.equal(placeName('3'), 'Paket 3');
  assert.equal(placeName('Kiste'), 'Kiste');
  assert.deepEqual(amsSlots({ ...settings, amsUnits: 2 }).slice(-2), ['B3', 'B4']);
  assert.deepEqual(spoolPlace(spools[0]), { kind: 'place', place: '1', label: 'Paket 1' });
  assert.equal(spoolPlace(spools.find((s) => s.inAms)).kind, 'ams');
});

test('Spule in Paket oder AMS-Slot legen, belegter Slot wird getauscht', async () => {
  const { planMove } = await import('../public/js/domain.js');
  const apply = (spools, changes) => spools.map((s) => {
    const c = changes.find((x) => x.id === s.id);
    return c ? normalizeSpool(c.patch, { base: s }) : s;
  });
  let spools = seedSpools();
  const orange = spools[0]; // Paket 1
  const kuerbis = spools[4]; // Paket 5, ungeöffnet
  spools = apply(spools, planMove(spools, [orange.id], { kind: 'slot', slot: 'A1' }));
  let o = spools.find((s) => s.id === orange.id);
  assert.deepEqual([o.inAms, o.bambu.slot, o.location], [true, 'A1', '']);
  // Kürbis Orange in A1: Orange wandert zurück nach Paket 5
  const changes = planMove(spools, [kuerbis.id], { kind: 'slot', slot: 'A1' });
  assert.equal(changes.filter((c) => c.swapped).length, 1);
  spools = apply(spools, changes);
  o = spools.find((s) => s.id === orange.id);
  const k = spools.find((s) => s.id === kuerbis.id);
  assert.deepEqual([k.inAms, k.bambu.slot, k.opened], [true, 'A1', true]);
  assert.deepEqual([o.inAms, o.bambu.slot, o.location], [false, '', '5']);
  // Mehrere Spulen in ein Paket
  spools = apply(spools, planMove(spools, [k.id, spools[1].id], { kind: 'place', place: 'Kiste' }));
  assert.deepEqual(spools.filter((s) => [k.id, spools[1].id].includes(s.id)).map((s) => [s.inAms, s.location]), [[false, 'Kiste'], [false, 'Kiste']]);
  assert.throws(() => planMove(spools, [k.id, o.id], { kind: 'slot', slot: 'A2' }), /nur eine Spule/);
  assert.throws(() => planMove(spools, ['gibtsnicht'], { kind: 'none' }), /nicht gefunden/);
});

test('Pakete anlegen, umbenennen, zusammenlegen, entfernen', async () => {
  const { planPlaces } = await import('../public/js/domain.js');
  const spools = seedSpools();
  assert.deepEqual(planPlaces(settings, spools, { action: 'add', name: '7' }).places.slice(-1), ['7']);
  const ren = planPlaces(settings, spools, { action: 'rename', name: '1k', to: 'Kiste 1' });
  assert.ok(ren.places.includes('Kiste 1') && !ren.places.includes('1k'));
  assert.equal(ren.changes.length, 1);
  const merge = planPlaces(settings, spools, { action: 'rename', name: '2k', to: 'Kiste' });
  assert.ok(!merge.places.includes('2k'));
  assert.throws(() => planPlaces(settings, spools, { action: 'remove', name: 'Kiste' }), /nicht leer/);
  assert.ok(!planPlaces({ ...settings, places: ['9'] }, spools, { action: 'remove', name: '9' }).places.includes('9'));
});
