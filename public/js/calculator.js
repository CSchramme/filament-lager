// Kostenrechner: Modell (STL/3MF) hochladen oder einen Druck aus dem Verlauf
// übernehmen, Rolle wählen, Preis mit allen Posten ablesen und zum Beleg
// hinzufügen. Die Datei bleibt im Browser.
import {
  densityOf, estimateGrams, matchSpool, parseDuration, priceQuote, pricePerGram, spoolLabel, weightPatch,
} from './domain.js';
import { parseModelFile } from './model.js';
import { addPosition, draftTotals, loadDraft } from './sales.js';
import {
  esc, fmt, fmtCt, fmtDuration, fmtEur, fmtNum, patchText, ring, toast,
} from './ui.js';

const PREFS_KEY = 'filament-lager-rechner';
const calc = {
  model: null, job: null, spoolId: '', qty: 1, grams: '', time: '', infill: 15, wall: 0.85, material: '',
  // Abweichend von den Einstellungen nur für diese Rechnung; null = Einstellung
  labor: null, profit: null,
};
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
const hm = (seconds) => `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, '0')}`;

let ctx = null; // { root, app, spoolUpdated, go }

// Einen Druck aus dem Verlauf in den Rechner übernehmen (vor dem Wechsel zum Reiter).
export function openJob(job, spools) {
  const main = [...(job.filaments || [])].sort((a, b) => b.grams - a.grams)[0];
  const spool = main && main.color ? matchSpool(spools, main) : null;
  Object.assign(calc, {
    job, model: null, grams: '', qty: 1, time: job.seconds ? hm(job.seconds) : '', spoolId: spool ? spool.id : calc.spoolId, material: '',
  });
}

export function renderCalculator(root, app, { spoolUpdated, go }) {
  ctx = {
    root, app, spoolUpdated, go,
  };
  if (calc.spoolId && !app.spools.some((s) => s.id === calc.spoolId)) calc.spoolId = '';
  root.innerHTML = `
    <section class="calc">
      <div class="calc-main">
        <section class="panel">
          <div class="panel-head"><h2>1. Modell</h2><p>STL oder 3MF, die Datei bleibt auf deinem Gerät</p></div>
          <label class="drop" id="calc-drop">
            <input type="file" id="calc-file" accept=".stl,.3mf" class="visually-hidden">
            <strong>STL oder 3MF hier ablegen</strong><span>oder antippen zum Auswählen. Drucke aus dem Bambu-Verlauf übernimmst du unter „Drucke“.</span>
          </label>
          <div id="calc-model"></div>
          <div class="fields">
            <label class="field"><span>Anzahl</span><input id="calc-qty" type="number" inputmode="numeric" min="1" step="1" value="${calc.qty}"></label>
            <label class="field"><span>Druckzeit pro Stück (Std:Min)</span><input id="calc-time" inputmode="numeric" placeholder="z. B. 1:30" value="${esc(calc.time)}"></label>
            <label class="field full"><span>Gramm von Hand (optional)</span><input id="calc-grams" inputmode="decimal" placeholder="aus Bambu Studio" value="${esc(calc.grams)}"></label>
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
    calc[key] = ['grams', 'time'].includes(key) ? e.target.value : parse(e.target.value);
    savePrefs();
    updateModel();
    updateResult();
  });
  field('#calc-qty', 'qty', (v) => Math.max(1, Math.round(num(v)) || 1));
  field('#calc-grams', 'grams');
  field('#calc-time', 'time');
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
  root.querySelector('#calc-model').addEventListener('click', (e) => {
    if (!e.target.closest('[data-calc="clear-job"]')) return;
    calc.job = null;
    calc.time = '';
    root.querySelector('#calc-time').value = '';
    updateModel();
    updateResult();
  });
  const result = root.querySelector('#calc-result');
  result.addEventListener('click', (e) => {
    const b = e.target.closest('[data-calc]');
    if (!b) return;
    if (b.dataset.calc === 'copy') copyOffer();
    if (b.dataset.calc === 'book') bookPrint();
    if (b.dataset.calc === 'add') addToReceipt();
    if (b.dataset.calc === 'receipt') ctx.go('drucke');
    if (b.dataset.calc === 'save-price') savePrice();
  });
  result.addEventListener('input', (e) => {
    const key = { 'calc-labor': 'labor', 'calc-profit': 'profit' }[e.target.id];
    if (!key) return;
    const v = num(e.target.value);
    calc[key] = e.target.value.trim() === '' || !Number.isFinite(v) ? null : Math.max(0, v);
    updateResult(false);
  });
}

async function loadFile(file) {
  if (!file) return;
  const box = ctx.root.querySelector('#calc-model');
  box.innerHTML = `<p class="small muted">${esc(file.name)} wird gelesen …</p>`;
  try {
    calc.model = await parseModelFile(file.name, await file.arrayBuffer());
    calc.job = null;
    if (calc.model.slicedSeconds) {
      calc.time = hm(calc.model.slicedSeconds);
      ctx.root.querySelector('#calc-time').value = calc.time;
    }
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
  if (calc.job) return { grams: calc.job.grams, source: 'aus dem Druckverlauf' };
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
  const g = gramsPerPiece();
  if (calc.job) {
    const j = calc.job;
    const multi = (j.filaments || []).length > 1;
    box.innerHTML = `<div class="model-card">
      <div class="model-name"><strong>${esc(j.title)}</strong><span class="pill">aus dem Druckverlauf</span>
        <button type="button" class="btn small ghost" data-calc="clear-job">Entfernen</button></div>
      <dl class="model-facts">
        <div><dt>Filament pro Stück</dt><dd class="num">${fmtNum(j.grams)} g</dd></div>
        ${j.seconds ? `<div><dt>Druckzeit</dt><dd class="num">${fmtDuration(j.seconds)}</dd></div>` : ''}
        ${multi ? `<div><dt>Farben</dt><dd>${j.filaments.map((f) => `<span class="dot-color" style="background:${esc(f.color)}" title="${esc(f.type)} ${fmtNum(f.grams)} g"></span>`).join('')}</dd></div>` : ''}
      </dl>
      ${multi ? '<p class="small muted">Mehrfarbig: Der Rechner nimmt den Preis der gewählten Rolle für alle Gramm. Die Liste unter „Drucke“ rechnet jede Farbe einzeln.</p>' : ''}
    </div>`;
    return;
  }
  const m = calc.model;
  if (!m) {
    if (!box.querySelector('.note')) box.innerHTML = '';
    return;
  }
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
      <span class="meta">${esc(s.material)} · ${fmt(s.netWeight)} g${s.price === null ? ' · ohne Kaufpreis' : ''}</span></span></button>`).join('') || '<p class="small muted">Keine Rollen im Lager.</p>';
}

function printSeconds() {
  const typed = parseDuration(calc.time);
  if (typed !== null) return typed;
  if (calc.job && calc.job.seconds) return calc.job.seconds;
  if (calc.model && calc.model.slicedSeconds) return calc.model.slicedSeconds;
  return 0;
}

// Abweichungen von den Einstellungen, die mit in den Beleg gehen.
function overrides() {
  const o = {};
  if (calc.labor !== null) o.laborMinutes = calc.labor;
  if (calc.profit !== null) o.profitPct = calc.profit;
  return o;
}

function quote() {
  const g = gramsPerPiece();
  if (!g) return null;
  const spool = selectedSpool();
  const rates = { ...ctx.app.settings, ...overrides() };
  const perGram = pricePerGram(spool, rates);
  const seconds = printSeconds();
  return {
    ...priceQuote({
      grams: g.grams, perGram, seconds, qty: calc.qty,
    }, rates),
    perGram, spool, source: g.source, rates,
  };
}

const decimal = (v) => esc(String(v).replace('.', ','));

// full: auch die Eingabefelder neu zeichnen (nicht beim Tippen darin).
function updateResult(full = true) {
  const el = ctx.root.querySelector('#calc-result');
  const q = quote();
  // Am Handy steht der Preis unten in einer festen Leiste.
  const bar = ctx.root.querySelector('#calc-bar');
  bar.hidden = !q;
  if (q) bar.innerHTML = `<span>${q.qty > 1 ? `${q.qty} Stück` : 'Preis pro Stück'}${q.spool ? ` · #${q.spool.nr} ${esc(q.spool.colorName || '')}` : ''}</span><strong>${fmtEur(q.qty > 1 ? q.sum : q.piece)}</strong>`;
  if (!q) {
    el.innerHTML = `<div class="panel-head"><h2>3. Preis</h2></div>
      <p class="muted">Lade ein Modell hoch, übernimm einen Druck aus dem Verlauf oder trage die Gramm von Hand ein, dann steht hier der Preis.</p>`;
    return;
  }
  const { rates } = q;
  const s = q.spool;
  const missingPrice = s && s.price === null;
  const priceNote = s && s.price !== null ? `Kaufpreis ${fmtEur(s.price)} für ${fmt(s.purchaseWeight)} g` : `Standardpreis ${fmtEur(rates.pricePerKg)} pro kg`;
  const h = fmtNum(q.hours, 2);
  const noTime = '<small class="muted">Druckzeit fehlt</small>';
  const line = (k, label, value, cls = '') => `<div class="calc-line ${cls}"><span>${label}</span><span class="num" data-k="${k}">${fmtEur(value)}</span></div>`;
  const rows = [
    line('filament', `Filament <small class="muted">${fmtNum(q.grams)} g × ${fmtNum(q.perGram * 100, 2)} ct/g</small>`, q.filament),
    line('energy', `Strom <small class="muted">${q.seconds ? `${h} Std. × ${fmt(rates.printerWatts)} W × ${fmtCt(rates.energyPrice)} ct/kWh` : ''}</small>${q.seconds ? '' : ' ' + noTime}`, q.energy),
    line('machine', `Drucker <small class="muted">${q.seconds ? `${h} Std. × ${fmtEur(rates.machineRate)} Abnutzung` : ''}</small>${q.seconds ? '' : ' ' + noTime}`, q.machine),
    line('failure', `Fehldrucke <small class="muted">${fmtNum(rates.failPct, 0)} % auf Filament und Strom</small>`, q.failure),
    `<div class="calc-line"><span>Arbeit <input id="calc-labor" class="pct" inputmode="decimal" value="${decimal(rates.laborMinutes)}" aria-label="Arbeitszeit in Minuten"> Min. × ${fmtEur(rates.laborRate)}/Std.<small class="muted" data-row="labor-split" ${q.qty > 1 ? '' : 'hidden'}>, geteilt durch ${q.qty}</small></span><span class="num" data-k="labor">${fmtEur(q.labor)}</span></div>`,
    line('cost', 'Selbstkosten', q.cost, 'sum'),
    `<div class="calc-line"><span>Gewinn <input id="calc-profit" class="pct" inputmode="decimal" value="${decimal(rates.profitPct)}" aria-label="Gewinn in Prozent"> %</span><span class="num" data-k="profit">${fmtEur(q.profit)}</span></div>`,
  ].join('');
  const need = q.totalGrams;
  let stock = '';
  if (s) {
    const rest = s.netWeight - need;
    const others = ctx.app.spools.filter((x) => x.id !== s.id && x.material === s.material && (x.colorName || '').toLowerCase() === (s.colorName || '').toLowerCase() && x.netWeight > 0);
    stock = rest >= 0
      ? `<div class="note">Rolle #${s.nr} hat ${fmt(s.netWeight)} g, danach bleiben ${fmt(rest)} g.</div>`
      : `<div class="note warn">Rolle #${s.nr} reicht nicht, es fehlen ${fmt(-rest)} g.${others.length ? ` Gleiche Farbe: ${others.map((x) => `#${x.nr} (${fmt(x.netWeight)} g)`).join(', ')}.` : ''}</div>`;
  }
  const draft = loadDraft();
  const open = draft.positions.length ? draftTotals(draft, ctx.app.settings) : null;
  const html = `<div class="panel-head"><h2>3. Preis</h2><p>${esc(q.source)}</p></div>
    ${s ? `<div class="spool">${ring(s.colorHex, s.purchaseWeight ? s.netWeight / s.purchaseWeight : 0)}<div class="txt"><div class="title">${esc(spoolLabel(s))}</div><div class="sub">${esc(priceNote)}</div></div></div>`
    : `<p class="small muted">Noch keine Rolle gewählt, gerechnet wird mit dem ${esc(priceNote)}.</p>`}
    ${missingPrice ? `<div class="note warn price-ask"><span>Für Rolle #${s.nr} fehlt der Kaufpreis, gerechnet wird mit ${fmtEur(rates.pricePerKg)} pro kg. Was hast du für die Rolle bezahlt?</span>
      <span class="copy-row"><input id="calc-spool-price" inputmode="decimal" placeholder="Kaufpreis in €" aria-label="Kaufpreis der Rolle in Euro"><button class="btn small" type="button" data-calc="save-price">Speichern</button></span></div>` : ''}
    <div class="calc-lines">${rows}</div>
    <div class="calc-total"><span>Preis pro Stück</span><strong class="num" data-k="piece">${fmtEur(q.piece)}</strong></div>
    <div class="calc-line sum" data-row="sum" ${q.qty > 1 ? '' : 'hidden'}><span>${q.qty} Stück, ${fmtNum(need)} g</span><span class="num" data-k="sum">${fmtEur(q.sum)}</span></div>
    <div class="note" data-row="min" ${q.minExtra > 0 ? '' : 'hidden'}>Mindestpreis ${fmtEur(rates.minPrice)} pro Beleg: Allein auf einem Beleg kostet das <strong data-k="min-total">${fmtEur(q.total)}</strong>. Mit weiteren Teilen auf dem Beleg entfällt der Aufschlag.</div>
    ${stock}
    <div class="actions">
      <button class="btn primary" type="button" data-calc="add">Zum Beleg hinzufügen</button>
      <button class="btn" type="button" data-calc="copy">Angebot kopieren</button>
      ${s ? `<button class="btn" type="button" data-calc="book">${fmtNum(need)} g von #${s.nr} abziehen</button>` : ''}
    </div>
    ${open ? `<p class="small muted">Offener Beleg: ${draft.positions.length} ${draft.positions.length === 1 ? 'Position' : 'Positionen'}, ${fmtEur(open.total)}. <button type="button" class="link" data-calc="receipt">Zum Beleg</button></p>` : ''}`;
  if (full) el.innerHTML = html;
  else patchText(el, html);
}

function offerText() {
  const q = quote();
  const s = q.spool;
  const lines = [
    calc.job ? `Modell: ${calc.job.title}` : calc.model ? `Modell: ${calc.model.name}` : '',
    s ? `Farbe: ${s.colorName || s.colorHex} (${s.material})` : '',
    `Filament: ${fmtNum(q.grams)} g pro Stück`,
    q.seconds ? `Druckzeit: ${fmtDuration(q.seconds)} pro Stück` : '',
    `Preis pro Stück: ${fmtEur(q.piece)}`,
    q.qty > 1 ? `${q.qty} Stück: ${fmtEur(q.sum)}` : '',
    q.minExtra > 0 ? `Mindestpreis pro Auftrag: ${fmtEur(q.total)}` : '',
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

function addToReceipt() {
  const q = quote();
  const title = calc.job ? calc.job.title : calc.model ? calc.model.name.replace(/\.(gcode\.)?(stl|3mf)$/i, '') : 'Druck';
  const draft = addPosition({
    title, qty: q.qty, grams: q.grams, seconds: q.seconds, perGram: q.perGram, overrides: overrides(), spool: q.spool,
    taskId: calc.job ? calc.job.id : '',
  });
  const { total } = draftTotals(draft, ctx.app.settings);
  toast(`Zum Beleg hinzugefügt: ${draft.positions.length} ${draft.positions.length === 1 ? 'Position' : 'Positionen'}, ${fmtEur(total)}. Erstellen unter „Drucke“.`);
  updateResult();
}

async function savePrice() {
  const s = selectedSpool();
  const input = ctx.root.querySelector('#calc-spool-price');
  const value = num(String(input.value).replace(/\s|€/g, ''));
  if (!input.value.trim() || !Number.isFinite(value) || value < 0) {
    toast('Bitte den Kaufpreis der Rolle in Euro eingeben, z. B. 19,99.', 'error');
    return;
  }
  try {
    const updated = await ctx.app.backend.updateSpool(s.id, { price: value });
    ctx.spoolUpdated(updated);
    toast(`Kaufpreis für #${updated.nr} gespeichert`);
    updateSpools();
    updateResult();
  } catch (err) {
    toast(err.message, 'error');
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
