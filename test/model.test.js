import assert from 'node:assert/strict';
import { test } from 'node:test';
import zlib from 'node:zlib';
import {
  defaultSettings, densityOf, energyCost, estimateGrams, normalizeSpool, parseCsv, parseDuration, priceQuote, pricePerGram, roundUp,
  spoolsFromRows, toCsv,
} from '../public/js/domain.js';
import { parse3mf, parseModelFile, parseSliceInfo, parseStl } from '../public/js/model.js';

// Würfel mit Kantenlänge a (mm), 12 Dreiecke, nach außen gerichtet
function cube(a) {
  const v = [[0, 0, 0], [a, 0, 0], [a, a, 0], [0, a, 0], [0, 0, a], [a, 0, a], [a, a, a], [0, a, a]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { v, f };
}

function binaryStl({ v, f }) {
  const buf = Buffer.alloc(84 + f.length * 50);
  buf.writeUInt32LE(f.length, 80);
  f.forEach((tri, i) => tri.forEach((vi, k) => v[vi].forEach((c, j) => buf.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + j * 4))));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

function asciiStl({ v, f }) {
  const facets = f.map((tri) => `facet normal 0 0 0\nouter loop\n${tri.map((i) => `vertex ${v[i].join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n');
  return new TextEncoder().encode(`solid w\n${facets}\nendsolid w\n`).buffer;
}

// Minimales ZIP mit deflate-Einträgen
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = zlib.deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(text.length, 22);
    local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(text.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

function modelXml({ v, f }, unit = 'millimeter') {
  return `<?xml version="1.0"?><model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${
    v.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}" />`).join('')}</vertices><triangles>${
    f.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}" />`).join('')}</triangles></mesh></object></resources></model>`;
}

test('STL binär und als Text: Volumen, Oberfläche, Maße', () => {
  for (const data of [binaryStl(cube(20)), asciiStl(cube(20))]) {
    const m = parseStl(data);
    assert.equal(m.triangles, 12);
    assert.ok(Math.abs(m.volumeMm3 - 8000) < 0.01);
    assert.ok(Math.abs(m.areaMm2 - 2400) < 0.01);
    assert.deepEqual(m.sizeMm, [20, 20, 20]);
  }
  assert.throws(() => parseStl(new TextEncoder().encode('kein modell').buffer), /STL/);
});

test('3MF: Netz aus dem Modell, Einheit wird beachtet', async () => {
  const m = await parse3mf(zip({ '3D/3dmodel.model': modelXml(cube(2), 'centimeter'), '[Content_Types].xml': '<Types/>' }));
  assert.equal(m.format, '3MF');
  assert.ok(Math.abs(m.volumeMm3 - 8000) < 0.01);
  assert.deepEqual(m.sizeMm, [20, 20, 20]);
});

test('Gesliceter 3MF aus Bambu Studio: Gramm und Druckzeit', async () => {
  const info = `<?xml version="1.0"?><config>
    <plate><metadata key="index" value="1"/><metadata key="prediction" value="3720"/><metadata key="weight" value="12.50"/>
      <filament id="1" type="PLA" color="#FFFFFF" used_m="4.1" used_g="12.34" /></plate>
    <plate><metadata key="index" value="2"/><metadata key="prediction" value="600"/><metadata key="weight" value="3.00"/></plate>
  </config>`;
  assert.deepEqual(parseSliceInfo(info), { slicedGrams: 15.34, slicedSeconds: 4320, plates: 2 });
  // 5 gleiche Kürbisse auf einer Platte (einer übersprungen zählt nicht), verschiedene Teile nicht
  const five = `<config><plate><metadata key="prediction" value="21600"/><metadata key="weight" value="60"/>
    ${['Kürbis.stl', 'Kürbis.stl_1', 'Kürbis (2).stl', 'Kürbis_3.stl', 'Kürbis.stl', 'Kürbis.stl'].map((n, i) => `<object identify_id="${i}" name="${n.replace('.stl_1', '_1.stl')}" skipped="${i === 5}" />`).join('')}</plate></config>`;
  assert.equal(parseSliceInfo(five).slicedParts, 5);
  const mixed = `<config><plate><metadata key="weight" value="20"/><object name="Kürbis" skipped="false"/><object name="Deckel" skipped="false"/></plate></config>`;
  assert.equal(parseSliceInfo(mixed).slicedParts, undefined);
  const m = await parseModelFile('teil.gcode.3mf', zip({ 'Metadata/slice_info.config': info, '3D/Objects/object_1.model': modelXml(cube(20)) }));
  assert.equal(m.format, '3MF (gesliced)');
  assert.equal(m.slicedGrams, 15.34);
  assert.equal(m.name, 'teil.gcode.3mf');
  await assert.rejects(parseModelFile('x.obj', new ArrayBuffer(10)), /STL- oder 3MF/);
});

test('Gewicht schätzen und Preis mit allen Posten', () => {
  assert.equal(densityOf('PETG HF'), 1.27);
  assert.equal(densityOf('Unbekannt'), 1.24);
  // 20-mm-Würfel, 15 % Infill, 0,85 mm Wand: ca. 3,6 g PLA
  assert.equal(Math.round(estimateGrams({ volumeMm3: 8000, areaMm2: 2400 }) * 10) / 10, 3.6);
  assert.equal(estimateGrams({ volumeMm3: 8000, areaMm2: 2400 }, { infillPct: 100 }), 8000 / 1000 * 1.24);

  const settings = { ...defaultSettings(), roundTo: 0, discountPct: 0 }; // genaue Rechnung, Rundung und Rabatt unten
  const spool = normalizeSpool({ purchaseWeight: 1000, price: '24,99' });
  assert.equal(pricePerGram(spool, settings), 0.02499);
  // Ohne eigenen Preis: Preisliste (PLA Basic 19,99 € pro kg), sonst Standardpreis 20 € pro kg
  assert.ok(Math.abs(pricePerGram(normalizeSpool({ purchaseWeight: 1000 }), settings) - 0.01999) < 1e-12);
  assert.equal(pricePerGram(normalizeSpool({ material: 'PETG HF', purchaseWeight: 1000 }), settings), 0.02);
  const strom = energyCost(7200, settings);
  assert.ok(Math.abs(strom - 0.072) < 1e-9); // 2 Std. × 120 W × 0,30 €/kWh

  // 100 g zu 2 ct, 2 Std.: Filament 2,00 + Strom 0,07 + Drucker 0,60 + Fehldrucke 10 % von 2,07 = 0,21
  // + Arbeit 5 Min. × 15 €/Std. = 1,25 -> Selbstkosten 4,13; Gewinn 30 % = 1,24; Preis 5,37
  const pick = (q) => [q.filament, q.energy, q.machine, q.failure, q.labor, q.cost, q.profit, q.piece, q.sum, q.total, q.minExtra];
  assert.deepEqual(pick(priceQuote({ grams: 100, perGram: 0.02, seconds: 7200 }, settings)),
    [2, 0.07, 0.6, 0.21, 1.25, 4.13, 1.24, 5.37, 5.37, 5.37, 0]);
  // 3 Stück: die Arbeit verteilt sich, 1,25 / 3 = 0,42 pro Stück
  const three = priceQuote({ grams: 100, perGram: 0.02, seconds: 7200, qty: 3 }, settings);
  assert.deepEqual(pick(three), [2, 0.07, 0.6, 0.21, 0.42, 3.3, 0.99, 4.29, 12.87, 12.87, 0]);
  assert.equal(three.totalGrams, 300);
  // Kleinteil unter dem Mindestpreis von 3 €
  assert.deepEqual(pick(priceQuote({ grams: 5, perGram: 0.02, seconds: 600 }, settings)),
    [0.1, 0.01, 0.05, 0.01, 1.25, 1.42, 0.43, 1.85, 1.85, 3, 1.15]);
  // Kabelhalter: 31,2 g, 1:24 Std. -> Selbstkosten 2,41, Preis 3,13
  const halter = priceQuote({ grams: 31.2, perGram: 0.02, seconds: 5040 }, settings);
  assert.deepEqual([halter.cost, halter.piece], [2.41, 3.13]);
  // Einzelne Werte überschreiben: ohne Arbeit, 50 % Gewinn
  const own = priceQuote({ grams: 100, perGram: 0.02, seconds: 7200 }, { ...settings, laborMinutes: 0, profitPct: 50 });
  assert.deepEqual([own.labor, own.cost, own.profit, own.piece], [0, 2.88, 1.44, 4.32]);
  // Die Posten gehen immer auf
  for (const q of [three, halter, own]) {
    assert.equal(Math.round((q.filament + q.energy + q.machine + q.failure + q.labor) * 100), Math.round(q.cost * 100));
    assert.equal(Math.round((q.cost + q.profit) * 100), Math.round(q.piece * 100));
  }
  assert.deepEqual(['1:24', '1,5', '90 min', '2h', '', 'bald'].map(parseDuration), [5040, 5400, 5400, 7200, null, null]);
});

test('Schöne Preise: aufrunden und Mengenrabatt', () => {
  const settings = defaultSettings(); // aufrunden auf 0,50 €, ab 10 Stück 10 % Rabatt
  assert.deepEqual([settings.roundTo, settings.discountQty, settings.discountPct], [0.5, 10, 10]);
  // Kabelhalter: 3,13 € -> 3,50 €, der Gewinn steigt um die Rundung
  const halter = priceQuote({ grams: 31.2, perGram: 0.02, seconds: 5040 }, settings);
  assert.deepEqual([halter.cost, halter.markup, halter.rounding, halter.profit, halter.piece], [2.41, 0.72, 0.37, 1.09, 3.5]);
  assert.deepEqual([3.13, 3.5, 3.51, 0.01, 0].map((v) => roundUp(v, 0.5)), [3.5, 3.5, 4, 0.5, 0]);
  assert.deepEqual([roundUp(3.13, 0.1), roundUp(3.13, 1), roundUp(3.137, 0)], [3.2, 4, 3.14]);
  // 10 Stück: 10 % Rabatt auf den Preis, dann aufrunden
  const ten = priceQuote({ grams: 31.2, perGram: 0.02, seconds: 5040, qty: 10 }, settings);
  assert.equal(ten.discountPct, 10);
  assert.equal(ten.cost, 1.29); // Arbeit 0,13 pro Stück
  // 1,29 + 0,39 = 1,68, minus 10 % (0,17) = 1,51, aufgerundet 2,00
  assert.deepEqual([ten.markup, ten.discount, ten.piece, ten.profit, ten.sum], [0.39, 0.17, 2, 0.71, 20]);
  // 9 Stück: kein Rabatt
  assert.equal(priceQuote({ grams: 31.2, perGram: 0.02, seconds: 5040, qty: 9 }, settings).discount, 0);
  // Rabatt nie unter die Selbstkosten
  const deep = priceQuote({ grams: 10, perGram: 0.02, qty: 20 }, { ...settings, discountPct: 90, roundTo: 0 });
  assert.equal(deep.piece, deep.cost);
});

test('Rollenpreis in der CSV', () => {
  const settings = defaultSettings();
  const spools = [normalizeSpool({ colorName: 'Rot', price: 19.99 }), normalizeSpool({ colorName: 'Blau' })];
  const back = spoolsFromRows(parseCsv(toCsv(spools, settings)), settings);
  assert.deepEqual(back.map((s) => s.price), [19.99, null]);
});
