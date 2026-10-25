import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  qrMatrix, qrSvg, rsDivisor, rsRemainder,
} from '../public/js/qr.js';

// Mit einer unabhängigen QR-Bibliothek erzeugt und Modul für Modul verglichen.
const ROLLE_12 = [
  '#######...#.####..###.#######',
  '#.....#......####.....#.....#',
  '#.###.#.#..#.#.#..###.#.###.#',
  '#.###.#.###...##.#.#..#.###.#',
  '#.###.#.##..#..##.##..#.###.#',
  '#.....#.##.#........#.#.....#',
  '#######.#.#.#.#.#.#.#.#######',
  '........##.##.#.#...#........',
  '#.#####..#.......##...#####..',
  '##.###.#.#...###.####.###...#',
  '.##..#######.###.#...#.##....',
  '.#.#.#.#.#####......######.#.',
  '#..######..#..######.#...##..',
  '#.#..#..#..#......#######...#',
  '#..##.#.#.###..####...##.##..',
  '.#........#...##.....####..#.',
  '.....##.##.##..###..#....##..',
  '#....#.##.##.##....######.#.#',
  '#.##.###..#..######.#..##.#..',
  '#.#.#...##.#.#..#.#.#...#..#.',
  '#.########....#..#.######.###',
  '........#.#.#....##.#...#####',
  '#######...###..###.##.#.###..',
  '#.....#.#.....###..##...#..##',
  '#.###.#.#...#..#.#..#####.##.',
  '#.###.#.###..##.####.....####',
  '#.###.#.########......######.',
  '#.....#...#.#..##.#.###.##.#.',
  '#######.##...#...#.#.#.#..#..',
];

test('QR-Code für ein Etikett stimmt Modul für Modul', () => {
  const m = qrMatrix('https://lager.example.de/#rolle/12', { level: 'M' });
  assert.equal(m.version, 3);
  assert.equal(m.mask, 2);
  assert.deepEqual(m.dark.map((r) => r.map((d) => (d ? '#' : '.')).join('')), ROLLE_12);
});

test('QR-Code: Größe wächst mit dem Text, Umlaute als UTF-8', () => {
  assert.equal(qrMatrix('A').version, 1);
  assert.equal(qrMatrix('x'.repeat(14), { level: 'M' }).version, 1);
  assert.equal(qrMatrix('x'.repeat(15), { level: 'M' }).version, 2);
  // Grenzen laut Kapazitätstabelle (Byte-Modus, Stufe M); ab Version 10 hat die Länge 16 Bit
  assert.deepEqual([180, 181, 213, 214].map((n) => qrMatrix('x'.repeat(n), { level: 'M' }).version), [9, 10, 10, 11]);
  assert.equal(qrMatrix('ä'.repeat(7), { level: 'M' }).version, 1); // 14 Bytes
  assert.throws(() => qrMatrix('x'.repeat(3000), { level: 'H' }), /zu lang/);
  // Formatinformation lesen: Stufe Q (Bits 11) und Maske 5
  const m = qrMatrix('Filament', { level: 'Q', mask: 5 });
  const at = (i) => {
    if (i <= 5) return m.dark[i][8];
    if (i === 6) return m.dark[7][8];
    if (i === 7) return m.dark[8][8];
    if (i === 8) return m.dark[8][7];
    return m.dark[8][14 - i];
  };
  let format = 0;
  for (let i = 0; i < 15; i++) if (at(i)) format |= 1 << i;
  assert.equal((format ^ 0x5412) >> 10, (3 << 3) | 5);
  assert.equal(m.dark[m.size - 8][8], true); // das immer dunkle Modul
  // Suchmuster in drei Ecken
  for (const [x, y] of [[0, 0], [m.size - 7, 0], [0, m.size - 7]]) {
    assert.equal(m.dark[y][x], true);
    assert.equal(m.dark[y + 1][x + 1], false);
    assert.equal(m.dark[y + 3][x + 3], true);
  }
});

test('Reed-Solomon: Rest ist der Prüfwert', () => {
  // Beispiel aus der Norm (Version 1-M, "01234567")
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual(rsRemainder(data, rsDivisor(10)), [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
});

test('QR als SVG', () => {
  const svg = qrSvg('https://lager.example.de/#rolle/12', { border: 2, title: 'Rolle <12>' });
  assert.match(svg, /^<svg[^>]+viewBox="0 0 33 33"/);
  assert.match(svg, /aria-label="Rolle 12"/);
  assert.equal((svg.match(/h1v1h-1z/g) || []).length, ROLLE_12.join('').split('#').length - 1);
});
