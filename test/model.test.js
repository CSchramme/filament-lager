import assert from 'node:assert/strict';
import { test } from 'node:test';
import zlib from 'node:zlib';
import {
  defaultSettings, densityOf, estimateGrams, normalizeSpool, parseCsv, priceQuote, pricePerGram, spoolsFromRows, toCsv,
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
  const m = await parseModelFile('teil.gcode.3mf', zip({ 'Metadata/slice_info.config': info, '3D/Objects/object_1.model': modelXml(cube(20)) }));
  assert.equal(m.format, '3MF (gesliced)');
  assert.equal(m.slicedGrams, 15.34);
  assert.equal(m.name, 'teil.gcode.3mf');
  await assert.rejects(parseModelFile('x.obj', new ArrayBuffer(10)), /STL- oder 3MF/);
});

test('Gewicht schätzen und Preis mit Abnutzung und Gewinn', () => {
  assert.equal(densityOf('PETG HF'), 1.27);
  assert.equal(densityOf('Unbekannt'), 1.24);
  // 20-mm-Würfel, 15 % Infill, 0,85 mm Wand: ca. 3,6 g PLA
  assert.equal(Math.round(estimateGrams({ volumeMm3: 8000, areaMm2: 2400 }) * 10) / 10, 3.6);
  assert.equal(estimateGrams({ volumeMm3: 8000, areaMm2: 2400 }, { infillPct: 100 }), 8000 / 1000 * 1.24);

  const settings = defaultSettings();
  const spool = normalizeSpool({ purchaseWeight: 1000, price: '24,99' });
  assert.equal(pricePerGram(spool, settings), 0.02499);
  assert.equal(pricePerGram(normalizeSpool({ purchaseWeight: 1000 }), settings), 0.02);
  // 100 g zu 2 ct: Material 2,00 €, Abnutzung 5 % = 0,10 €, Gewinn 10 % auf 2,10 € = 0,21 €
  assert.deepEqual(priceQuote({ grams: 100, perGram: 0.02, wearPct: 5, profitPct: 10, qty: 3 }),
    { grams: 100, material: 2, wear: 0.1, cost: 2.1, profit: 0.21, piece: 2.31, qty: 3, total: 6.93, totalGrams: 300 });
});

test('Rollenpreis in der CSV', () => {
  const settings = defaultSettings();
  const spools = [normalizeSpool({ colorName: 'Rot', price: 19.99 }), normalizeSpool({ colorName: 'Blau' })];
  const back = spoolsFromRows(parseCsv(toCsv(spools, settings)), settings);
  assert.deepEqual(back.map((s) => s.price), [19.99, null]);
});
