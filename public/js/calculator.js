// Kostenrechner: Modell (STL/3MF) hochladen, Rolle wählen, Preis mit
// Abnutzung und Gewinn ablesen. Die Datei bleibt im Browser.
import {
  densityOf, estimateGrams, priceQuote, pricePerGram, spoolLabel, weightPatch,
} from './domain.js';
import { parseModelFile } from './model.js';
import {
  esc, fmt, fmtDuration, fmtEur, fmtNum, ring, toast,
} from './ui.js';

const PREFS_KEY = 'filament-lager-rechner';
const calc = { model: null, spoolId: '', qty: 1, grams: '', infill: 15, wall: 0.85, wear: null, profit: null, material: '' };
try {
  const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  for (const k of ['spoolId', 'infill', 'wall', 'material']) if (saved[k] !== undefined) calc[k] = saved[k];
} catch { /* ohne gespeicherte Werte */ }

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ spoolId: calc.spoolId, infill: calc.infill, wall: calc.wall, material: calc.material }));
  } catch { /* egal */ }
}

const num = (v) => Number(String(v).replace(',', '.'));
const pct = (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1);

let ctx = null; // { root, app, spoolUpdated }

export function renderCalculator(root, app, { spoolUpdated }) {
  ctx = { root, app, spoolUpdated };
  if (calc.wear === null) calc.wear = app.settings.wearPct;
  if (calc.profit === null) calc.profit = app.settings.profitPct;
  if (calc.spoolId && !app.spools.some((s) => s.id === calc.spoolId)) calc.spoolId = '';
  root.innerHTML = `
    <section class="calc">
      <div class="calc-main">
        <section class="panel">
          <div class="panel-head"><h2>1. Modell</h2><p>STL oder 3MF, die Datei bleibt auf deinem Gerät</p></div>
          <label class="drop" id="calc-drop">
            <input type="file" id="calc-file" accept=".stl,.3mf" class="visually-hidden">
            <strong>STL oder 3MF hier ablegen</strong><span>oder antippen zum Auswählen</span>
          </label>
          <div id="calc-model"></div>
          <div class="fields">
            <label class="field"><span>Anzahl</span><input id="calc-qty" type="number" inputmode="numeric" min="1" step="1" value="${calc.qty}"></label>
            <label class="field"><span>Gramm von Hand (optional)</span><input id="calc-grams" inputmode="decimal" placeholder="aus Bambu Studio" value="${esc(calc.grams)}"></label>
          </div>
          <details><summary>Annahmen für die Schätzung</summary>
            <div class="fields">
              <label class="field"><span>Infill (%)</span><input id="calc-infill" inputmode="decimal" value="${esc(String(calc.infill))}"></label>
              <label class="field"><span>Wände, Boden, Deckel (mm)</span><input id="calc-wall" inputmode="decimal" value="${esc(String(calc.wall).replace('.', ','))}"></label>
            </div>
            <p class="small muted">Ohne Slicer schätzt der Rechner: die Außenhaut voll, das Innere mit Infill. Stützstrukturen und Abfall beim Farbwechsel sind nicht dabei. Genauer wird es mit den Gramm aus Bambu Studio oder einer dort geslicten 3MF.</p>
          </details>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>2. Farbe</h2><p>Rolle aus dem Lager</p></div>
          <select id="calc-material" aria-label="Material" style="width:auto"></select>
          <div class="chips-wrap" id="calc-spools"></div>
        </section>
      </div>
      <aside class="panel calc-result" id="calc-result" aria-live="polite"></aside>
    </section>
    <button type="button" class="calc-bar" id="calc-bar" hidden></button>`;
  bind();
  updateModel();
  updateSpools();
  updateResult();
}

function bind() {
  const { root } = ctx;
  const drop = root.querySelector('#calc-drop');
  root.querySelector('#calc-file').addEventListener('change', (e) => loadFile(e.target.files[0]));
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    loadFile(e.dataTransfer.files[0]);
  });
  const field = (id, key, parse = num) => root.querySelector(id).addEventListener('input', (e) => {
    calc[key] = key === 'grams' ? e.target.value : parse(e.target.value);
    savePrefs();
    updateModel();
    updateResult();
  });
  field('#calc-qty', 'qty', (v) => Math.max(1, Math.round(num(v)) || 1));
  field('#calc-grams', 'grams');
  field('#calc-infill', 'infill');
  field('#calc-wall', 'wall');
  root.querySelector('#calc-material').addEventListener('change', (e) => {
    calc.material = e.target.value;
    savePrefs();
    updateSpools();
  });
  root.querySelector('#calc-spools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    calc.spoolId = b.dataset.pick;
    savePrefs();
    updateSpools();
    updateModel();
    updateResult();
  });
  root.querySelector('#calc-bar').addEventListener('click', () => {
    root.querySelector('#calc-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.querySelector('#calc-result').addEventListener('click', (e) => {
    const b = e.target.closest('[data-calc]');
    if (!b) return;
    if (b.dataset.calc === 'copy') copyOffer();
    if (b.dataset.calc === 'book') bookPrint();
  });
  root.querySelector('#calc-result').addEventListener('input', (e) => {
    if (e.target.id === 'calc-wear') calc.wear = num(e.target.value) || 0;
    if (e.target.id === 'calc-profit') calc.profit = num(e.target.value) || 0;
    updateResult(false);
  });
}

async function loadFile(file) {
  if (!file) return;
  const box = ctx.root.querySelector('#calc-model');
  box.innerHTML = `<p class="small muted">${esc(file.name)} wird gelesen …</p>`;
  try {
    calc.model = await parseModelFile(file.name, await file.arrayBuffer());
  } catch (err) {
    calc.model = null;
    box.innerHTML = `<div class="note crit">${esc(err.message)}</div>`;
    updateResult();
    return;
  }
  updateModel();
  updateResult();
}

const selectedSpool = () => ctx.app.spools.find((s) => s.id === calc.spoolId) || null;

// Gramm pro Stück und woher sie kommen.
function gramsPerPiece() {
  const handGrams = num(calc.grams);
  if (calc.grams !== '' && Number.isFinite(handGrams) && handGrams > 0) return { grams: handGrams, source: 'von Hand' };
  const m = calc.model;
  if (!m) return null;
  if (m.slicedGrams) return { grams: m.slicedGrams, source: 'laut Bambu Studio' };
  const spool = selectedSpool();
  const density = densityOf(spool ? spool.material : 'PLA');
  const grams = estimateGrams(m, { infillPct: calc.infill, wallMm: calc.wall, density });
  return { grams, source: `geschätzt, ${pct(calc.infill)} % Infill`, density };
}

function updateModel() {
  const box = ctx.root.querySelector('#calc-model');
  const m = calc.model;
  if (!m) {
    if (!box.querySelector('.note')) box.innerHTML = '';
    return;
  }
  const g = gramsPerPiece();
  const open = m.triangles && m.volumeMm3 < 1;
  box.innerHTML = `<div class="model-card">
    <div class="model-name"><strong>${esc(m.name)}</strong><span class="pill">${esc(m.format)}</span></div>
    <dl class="model-facts">
      ${m.triangles ? `<div><dt>Maße</dt><dd class="num">${m.sizeMm.map((v) => fmtNum(v)).join(' × ')} mm</dd></div>
      <div><dt>Volumen</dt><dd class="num">${fmtNum(m.volumeMm3 / 1000)} cm³</dd></div>` : ''}
      ${m.slicedSeconds ? `<div><dt>Druckzeit</dt><dd class="num">${fmtDuration(m.slicedSeconds)}${m.plates > 1 ? ` (${m.plates} Platten)` : ''}</dd></div>` : ''}
      ${g ? `<div><dt>Filament pro Stück</dt><dd class="num">${fmtNum(g.grams)} g <small class="muted">${esc(g.source)}</small></dd></div>` : ''}
    </dl>
    ${open ? '<div class="note warn">Das Modell scheint nicht geschlossen zu sein, das Volumen ist unsicher. Gramm am besten von Hand eintragen.</div>' : ''}
  </div>`;
}

function updateSpools() {
  const { app, root } = ctx;
  const materials = [...new Set(app.spools.map((s) => s.material))].sort();
  if (calc.material && !materials.includes(calc.material)) calc.material = '';
  root.querySelector('#calc-material').innerHTML = `<option value="">Alle Materialien</option>${materials.map((m) => `<option ${m === calc.material ? 'selected' : ''}>${esc(m)}</option>`).join('')}`;
  const list = app.spools
    .filter((s) => !calc.material || s.material === calc.material)
    .filter((s) => s.netWeight > 0 || s.id === calc.spoolId)
    .sort((a, b) => (a.colorName || '').localeCompare(b.colorName || '', 'de') || a.netWeight - b.netWeight);
  root.querySelector('#calc-spools').innerHTML = list.map((s) => `<button type="button" class="spool-chip" data-pick="${esc(s.id)}" aria-pressed="${s.id === calc.spoolId}">
      ${ring(s.colorHex, s.purchaseWeight ? s.netWeight / s.purchaseWeight : 0)}<span class="txt"><span class="name"><span class="nr">#${s.nr ?? '–'}</span>${esc(s.colorName || s.colorHex)}</span>
      <span class="meta">${esc(s.material)} · ${fmt(s.netWeight)} g</span></span></button>`).join('') || '<p class="small muted">Keine Rollen im Lager.</p>';
}

function quote() {
  const g = gramsPerPiece();
  if (!g) return null;
  const spool = selectedSpool();
  const perGram = pricePerGram(spool, ctx.app.settings);
  return { ...priceQuote({ grams: g.grams, perGram, wearPct: calc.wear, profitPct: calc.profit, qty: calc.qty }), perGram, spool, source: g.source };
}

// full: auch die Eingabefelder neu zeichnen (nicht beim Tippen darin).
function updateResult(full = true) {
  const el = ctx.root.querySelector('#calc-result');
  const q = quote();
  // Am Handy steht der Preis unten in einer festen Leiste.
  const bar = ctx.root.querySelector('#calc-bar');
  bar.hidden = !q;
  if (q) bar.innerHTML = `<span>${q.qty > 1 ? `${q.qty} Stück` : 'Preis pro Stück'}${q.spool ? ` · #${q.spool.nr} ${esc(q.spool.colorName || '')}` : ''}</span><strong>${fmtEur(q.qty > 1 ? q.total : q.piece)}</strong>`;
  if (!q) {
    el.innerHTML = `<div class="panel-head"><h2>3. Preis</h2></div>
      <p class="muted">Lade ein Modell hoch oder trage die Gramm von Hand ein, dann steht hier der Preis.</p>`;
    return;
  }
  const s = q.spool;
  const priceNote = s && s.price !== null ? `Rollenpreis ${fmtEur(s.price)} für ${fmt(s.purchaseWeight)} g` : `Standardpreis ${fmtEur(ctx.app.settings.pricePerKg)} pro kg`;
  const rows = `
    <div class="calc-line"><span>Filament ${fmtNum(q.grams)} g × ${fmtNum(q.perGram * 100, 2)} ct/g</span><span class="num" data-k="material">${fmtEur(q.material)}</span></div>
    <div class="calc-line"><span>+ Abnutzung <input id="calc-wear" class="pct" inputmode="decimal" value="${esc(String(calc.wear).replace('.', ','))}" aria-label="Abnutzung in Prozent"> %</span><span class="num" data-k="wear">${fmtEur(q.wear)}</span></div>
    <div class="calc-line sum"><span>Selbstkosten</span><span class="num" data-k="cost">${fmtEur(q.cost)}</span></div>
    <div class="calc-line"><span>+ Gewinn <input id="calc-profit" class="pct" inputmode="decimal" value="${esc(String(calc.profit).replace('.', ','))}" aria-label="Gewinn in Prozent"> %</span><span class="num" data-k="profit">${fmtEur(q.profit)}</span></div>`;
  const need = q.totalGrams;
  let stock = '';
  if (s) {
    const rest = s.netWeight - need;
    const others = ctx.app.spools.filter((x) => x.id !== s.id && x.material === s.material && (x.colorName || '').toLowerCase() === (s.colorName || '').toLowerCase() && x.netWeight > 0);
    stock = rest >= 0
      ? `<div class="note">Rolle #${s.nr} hat ${fmt(s.netWeight)} g, danach bleiben ${fmt(rest)} g.</div>`
      : `<div class="note warn">Rolle #${s.nr} reicht nicht, es fehlen ${fmt(-rest)} g.${others.length ? ` Gleiche Farbe: ${others.map((x) => `#${x.nr} (${fmt(x.netWeight)} g)`).join(', ')}.` : ''}</div>`;
  }
  const html = `<div class="panel-head"><h2>3. Preis</h2><p>${esc(q.source)}</p></div>
    ${s ? `<div class="spool">${ring(s.colorHex, s.purchaseWeight ? s.netWeight / s.purchaseWeight : 0)}<div class="txt"><div class="title">${esc(spoolLabel(s))}</div><div class="sub">${esc(priceNote)}</div></div></div>`
    : `<p class="small muted">Noch keine Rolle gewählt, gerechnet wird mit dem ${esc(priceNote)}.</p>`}
    <div class="calc-lines">${rows}</div>
    <div class="calc-total"><span>Preis pro Stück</span><strong class="num" data-k="piece">${fmtEur(q.piece)}</strong></div>
    ${q.qty > 1 ? `<div class="calc-line sum"><span>${q.qty} Stück, ${fmtNum(need)} g</span><span class="num" data-k="total">${fmtEur(q.total)}</span></div>` : ''}
    ${stock}
    <div class="actions">
      <button class="btn" type="button" data-calc="copy">Angebot kopieren</button>
      ${s ? `<button class="btn" type="button" data-calc="book">${fmtNum(need)} g von #${s.nr} abziehen</button>` : ''}
    </div>`;
  if (full) {
    el.innerHTML = html;
    return;
  }
  // Beim Tippen in die Prozentfelder nur die Beträge tauschen, damit der Fokus bleibt.
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  for (const fresh of tmp.querySelectorAll('[data-k]')) {
    const old = el.querySelector(`[data-k="${fresh.dataset.k}"]`);
    if (old) old.textContent = fresh.textContent;
  }
}

function offerText() {
  const q = quote();
  const s = q.spool;
  const lines = [
    calc.model ? `Modell: ${calc.model.name}` : '',
    s ? `Farbe: ${s.colorName || s.colorHex} (${s.material})` : '',
    `Filament: ${fmtNum(q.grams)} g pro Stück`,
    `Preis pro Stück: ${fmtEur(q.piece)}`,
    q.qty > 1 ? `${q.qty} Stück: ${fmtEur(q.total)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

async function copyOffer() {
  const text = offerText();
  try {
    await navigator.clipboard.writeText(text);
    toast('Angebot kopiert');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ctx.root.querySelector('#calc-result').append(ta);
    ta.select();
    toast('Markiert. Mit ⌘+C bzw. Strg+C kopieren.');
  }
}

async function bookPrint() {
  const q = quote();
  const s = q.spool;
  try {
    const updated = await ctx.app.backend.updateSpool(s.id, weightPatch(s, ctx.app.settings, { used: q.totalGrams }));
    ctx.spoolUpdated(updated);
    toast(`${fmtNum(q.totalGrams)} g von #${s.nr} abgezogen, ${fmt(updated.netWeight)} g übrig`);
    updateSpools();
    updateResult();
  } catch (err) {
    toast(err.message, 'error');
  }
}
