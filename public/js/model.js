// Liest 3D-Modelle für den Kostenrechner: STL (binär oder Text) und 3MF.
// Ergebnis sind Volumen und Oberfläche in mm³/mm² sowie die Außenmaße.
// Ein in Bambu Studio gesliceter 3MF enthält außerdem die genauen Gramm und
// die Druckzeit; die werden dann bevorzugt. Läuft im Browser und in Node.

function emptyStats() {
  return { volumeMm3: 0, areaMm2: 0, triangles: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

// Ein Dreieck zur Statistik hinzufügen. Das Volumen kommt aus der Summe der
// vorzeichenbehafteten Tetraeder zum Ursprung (geschlossenes Netz vorausgesetzt).
function addTriangle(st, ax, ay, az, bx, by, bz, cx, cy, cz) {
  st.volumeMm3 += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
  st.areaMm2 += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  st.triangles += 1;
  for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
    if (x < st.min[0]) st.min[0] = x;
    if (y < st.min[1]) st.min[1] = y;
    if (z < st.min[2]) st.min[2] = z;
    if (x > st.max[0]) st.max[0] = x;
    if (y > st.max[1]) st.max[1] = y;
    if (z > st.max[2]) st.max[2] = z;
  }
}

function finish(st, extra = {}) {
  const size = st.triangles ? st.max.map((v, i) => Math.round((v - st.min[i]) * 10) / 10) : [0, 0, 0];
  return { volumeMm3: Math.abs(st.volumeMm3), areaMm2: st.areaMm2, triangles: st.triangles, sizeMm: size, ...extra };
}

export function parseStl(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const st = emptyStats();
  const count = bytes.length >= 84 ? view.getUint32(80, true) : 0;
  if (bytes.length >= 84 && bytes.length === 84 + count * 50) {
    for (let i = 0; i < count; i += 1) {
      const o = 84 + i * 50 + 12; // Normale überspringen
      const f = (k) => view.getFloat32(o + k * 4, true);
      addTriangle(st, f(0), f(1), f(2), f(3), f(4), f(5), f(6), f(7), f(8));
    }
    return finish(st, { format: 'STL' });
  }
  const text = new TextDecoder().decode(bytes);
  if (!/facet/i.test(text)) throw new Error('Die Datei sieht nicht wie eine STL aus.');
  const v = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m;
  while ((m = re.exec(text))) {
    v.push(Number(m[1]), Number(m[2]), Number(m[3]));
    if (v.length === 9) {
      addTriangle(st, ...v);
      v.length = 0;
    }
  }
  return finish(st, { format: 'STL' });
}

// -- 3MF (ZIP-Archiv) --------------------------------------------------------

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Einfacher ZIP-Leser über das zentrale Verzeichnis; liefert { name -> lesen() }.
export function readZip(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Die 3MF-Datei ist beschädigt oder kein ZIP-Archiv.');
  const total = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < total; n += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buffer, p + 46, nameLen));
    files.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = new Uint8Array(buffer, start, size);
      if (method === 0) return raw;
      if (method === 8) return inflate(raw);
      throw new Error(`Unbekannte Kompression in ${name}.`);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const UNIT_MM = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

function attr(tag, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : '';
}

// Alle Netze eines 3MF-Modells zählen (jedes Objekt einmal).
function addModelMeshes(st, xml) {
  const unit = UNIT_MM[attr(/<model\b[^>]*>/.exec(xml)?.[0] || '', 'unit')] || 1;
  const meshRe = /<mesh\b[^>]*>([\s\S]*?)<\/mesh>/g;
  let mesh;
  while ((mesh = meshRe.exec(xml))) {
    const verts = [];
    const vRe = /<vertex\b([^>]*)\/?>/g;
    let v;
    while ((v = vRe.exec(mesh[1]))) verts.push([attr(v[1], 'x'), attr(v[1], 'y'), attr(v[1], 'z')].map((n) => Number(n) * unit));
    const tRe = /<triangle\b([^>]*)\/?>/g;
    let t;
    while ((t = tRe.exec(mesh[1]))) {
      const a = verts[Number(attr(t[1], 'v1'))];
      const b = verts[Number(attr(t[1], 'v2'))];
      const c = verts[Number(attr(t[1], 'v3'))];
      if (a && b && c) addTriangle(st, ...a, ...b, ...c);
    }
  }
}

// Bambu Studio schreibt beim Slicen Gramm und Druckzeit je Platte in slice_info.config.
export function parseSliceInfo(xml) {
  let grams = 0;
  let seconds = 0;
  let plates = 0;
  const plateRe = /<plate>([\s\S]*?)<\/plate>/g;
  let p;
  while ((p = plateRe.exec(xml))) {
    const body = p[1];
    const used = [...body.matchAll(/<filament\b[^>]*\sused_g="([\d.]+)"/g)].reduce((a, m) => a + Number(m[1]), 0);
    const weight = Number(/key="weight"\s+value="([\d.]+)"/.exec(body)?.[1] || 0);
    const g = used || weight;
    if (g > 0) {
      grams += g;
      seconds += Number(/key="prediction"\s+value="([\d.]+)"/.exec(body)?.[1] || 0);
      plates += 1;
    }
  }
  return plates ? { slicedGrams: Math.round(grams * 100) / 100, slicedSeconds: seconds, plates } : null;
}

export async function parse3mf(buffer) {
  const files = readZip(buffer);
  const dec = new TextDecoder();
  const st = emptyStats();
  for (const [name, read] of files) {
    if (/\.model$/i.test(name)) addModelMeshes(st, dec.decode(await read()));
  }
  const info = files.get('Metadata/slice_info.config');
  const sliced = info ? parseSliceInfo(dec.decode(await info())) : null;
  if (!st.triangles && !sliced) throw new Error('In der 3MF-Datei wurde kein Modell gefunden.');
  return finish(st, { format: sliced ? '3MF (gesliced)' : '3MF', ...(sliced || {}) });
}

export async function parseModelFile(name, buffer) {
  if (/\.3mf$/i.test(name)) return { name, ...(await parse3mf(buffer)) };
  if (/\.stl$/i.test(name)) return { name, ...parseStl(buffer) };
  throw new Error('Bitte eine STL- oder 3MF-Datei wählen.');
}
