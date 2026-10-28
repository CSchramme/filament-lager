// Reiter "Katalog": Teile, die du immer wieder druckst und verkaufst, mit
// Foto, Preis, Gramm und Druckzeit pro Stück und der Druckdatei. Von hier
// gehen sie mit der gewünschten Farbe in den offenen Beleg; dazu, wie oft
// jedes Teil verkauft wurde.
import {
  filamentTypeOf, filamentTypes, productQuote, productStats,
} from './domain.js';
import { addPosition, draftTotals } from './sales.js';
import {
  dateDe, esc, fmt, fmtDuration, fmtEur, icons, openDialog, parseNum, plural, toast,
} from './ui.js';

let ctx = null; // { root, app, go }
let products = [];
let sales = [];
let query = '';

export async function renderKatalog(root, app, { go }) {
  ctx = { root, app, go };
  root.innerHTML = '<section class="panel" id="catalog"><div class="panel-head"><h2>Katalog</h2></div><p class="small muted">Lädt …</p></section>';
  const el = root.querySelector('#catalog');
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'catalog-q') return;
    query = e.target.value;
    draw();
  });
  try {
    const [p, s] = await Promise.all([app.backend.products(), app.backend.sales()]);
    products = p.products;
    sales = s.sales;
  } catch (err) {
    toast(err.message, 'error');
  }
  draw();
}

const hm = (seconds) => `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, '0')}`;
// "1:30" -> 5400 Sekunden, "45" -> 45 Minuten
function parseTime(v) {
  const t = String(v || '').trim();
  if (!t) return 0;
  const m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  const n = parseNum(t);
  return Number.isFinite(n) ? Math.round(n * 60) : 0;
}

function card(p) {
  const q = productQuote(p, ctx.app.settings);
  const st = productStats(p, sales);
  const meta = [
    p.grams ? `${fmt(p.grams)} g` : '', p.seconds ? fmtDuration(p.seconds) : '', p.perPlate > 1 ? `${p.perPlate} pro Druck` : '', p.material,
  ].filter(Boolean).join(' · ');
  return `<article class="product-card" data-id="${esc(p.id)}">
    <button type="button" class="product-photo" data-cat="edit" aria-label="${esc(p.name)} bearbeiten">${p.photo ? `<img src="${p.photo}" alt="">` : `<span class="product-nophoto">${icons.box}</span>`}</button>
    <div class="product-body">
      <div class="product-head"><strong>${esc(p.name)}</strong><span class="num product-price">${q.fixed ? '' : '<small>ca.</small> '}${fmtEur(q.piece)}</span></div>
      <span class="small muted">${esc(meta)}</span>
      ${p.description ? `<span class="small">${esc(p.description)}</span>` : ''}
      <span class="small ${st.qty ? '' : 'muted'}">${st.qty ? `${st.qty}× verkauft, ${fmtEur(st.revenue)}, zuletzt ${dateDe(st.last)}` : 'noch nicht verkauft'}</span>
      ${p.file ? `<span class="small product-file">${/^https?:\/\//.test(p.file) ? `<a href="${esc(p.file)}" target="_blank" rel="noopener">Druckdatei öffnen</a>` : `Datei: ${esc(p.file)}`}</span>` : ''}
    </div>
    <div class="actions product-actions">
      <button class="btn small primary" type="button" data-cat="draft">In den Beleg</button>
      <button class="btn small" type="button" data-cat="edit">Bearbeiten</button>
    </div>
  </article>`;
}

function draw() {
  const el = ctx.root.querySelector('#catalog');
  if (!el) return;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const list = products.filter((p) => words.every((w) => [p.name, p.description, p.material].join(' ').toLowerCase().includes(w)))
    .sort((a, b) => productStats(b, sales).qty - productStats(a, sales).qty || a.name.localeCompare(b.name, 'de'));
  const focused = document.activeElement && document.activeElement.id === 'catalog-q';
  el.innerHTML = `<div class="panel-head"><h2>Katalog</h2><p>${products.length ? plural(products.length, 'Teil', 'Teile') : 'deine Teile zum Verkaufen'}</p></div>
    <div class="toolbar">
      <label class="search">${icons.search}<input type="search" id="catalog-q" placeholder="Teil suchen" aria-label="Teil suchen" value="${esc(query)}"></label>
      <span class="toolbar-actions"><button class="btn primary" type="button" data-cat="add">${icons.plus}Teil</button></span>
    </div>
    ${list.length ? `<div class="product-grid">${list.map(card).join('')}</div>`
    : `<p class="muted">${products.length ? 'Kein Teil passt zur Suche.' : 'Noch keine Teile. Mit „Teil“ anlegen, oder im Rechner bzw. im Druckverlauf auf „In den Katalog“. Mit Foto, Preis und Druckdatei hast du alles beisammen, und ein Antippen legt das Teil in den Beleg.'}</p>`}`;
  if (focused) {
    const q = el.querySelector('#catalog-q');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }
}

function onClick(e) {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  if (b.dataset.cat === 'add') {
    productDialog(ctx.app, null, { onDone: refresh });
    return;
  }
  const p = products.find((x) => x.id === b.closest('.product-card').dataset.id);
  if (!p) return;
  if (b.dataset.cat === 'edit') productDialog(ctx.app, p, { onDone: refresh });
  if (b.dataset.cat === 'draft') toDraftDialog(ctx.app, p);
}

function refresh(res) {
  products = res.products;
  draw();
}

// Foto verkleinern (längste Seite 640 px, JPEG), damit das Lager klein bleibt
async function photoFromFile(file, max = 640) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Das Bild lässt sich nicht lesen.'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Teil anlegen oder bearbeiten. prefill: Werte aus Rechner oder Druckverlauf;
// plate: Gramm und Sekunden des ganzen Drucks, dann teilt "Stück pro Druck" sie auf.
export function productDialog(app, product = null, { prefill = {}, plate = null, onDone } = {}) {
  const p = product || {
    name: '', description: '', price: 0, grams: 0, seconds: 0, perPlate: 1, material: 'PLA Basic', file: '', photo: '', ...prefill,
  };
  let photo = p.photo || '';
  const types = filamentTypes(app.spools, app.settings);
  openDialog({
    title: product ? `${esc(p.name)} bearbeiten` : 'Teil in den Katalog',
    body: `<div class="product-edit">
        <label class="product-photo-pick" title="Foto aufnehmen oder auswählen">
          <span data-photo>${photo ? `<img src="${photo}" alt="">` : `${icons.plus}<span>Foto</span>`}</span>
          <input type="file" name="photoFile" accept="image/*" class="visually-hidden">
        </label>
        <div class="fields">
          <label class="field full"><span>Name</span><input name="name" value="${esc(p.name)}" required placeholder="z. B. Kürbis klein"></label>
          <label class="field full"><span>Beschreibung (optional)</span><input name="description" value="${esc(p.description)}" placeholder="z. B. 5 cm, mit Gesicht"></label>
        </div>
      </div>
      <div class="fields">
        <label class="field"><span>Gramm pro Stück</span><input name="grams" inputmode="decimal" value="${p.grams ? esc(String(p.grams).replace('.', ',')) : ''}"></label>
        <label class="field"><span>Druckzeit pro Stück (Std:Min)</span><input name="time" value="${p.seconds ? hm(p.seconds) : ''}" placeholder="z. B. 0:25"></label>
        <label class="field"><span>Stück pro Druck</span><input name="perPlate" type="number" min="1" step="1" inputmode="numeric" value="${p.perPlate}"><small class="muted">verteilt die Arbeit, z. B. 25 auf einer Platte</small></label>
        <label class="field"><span>Filamentart</span><input name="material" list="dl-cat-types" value="${esc(p.material)}"></label>
        <label class="field"><span>Verkaufspreis pro Stück (€)</span><input name="price" inputmode="decimal" value="${p.price ? esc(p.price.toFixed(2).replace('.', ',')) : ''}"><small class="muted" data-price-hint></small></label>
        <label class="field"><span>Druckdatei oder Link (optional)</span><input name="file" value="${esc(p.file)}" placeholder="z. B. kuerbis.3mf oder MakerWorld-Link"></label>
      </div>
      <datalist id="dl-cat-types">${types.map((t) => `<option value="${esc(t.material)}"></option>`).join('')}</datalist>`,
    foot: `${product ? '<button type="button" class="btn danger" data-del>Löschen</button>' : ''}<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`,
    onReady(dlg, form) {
      const f = form.elements;
      const hint = () => {
        const q = productQuote({
          ...p, grams: parseNum(f.grams.value) || 0, seconds: parseTime(f.time.value), perPlate: Math.max(1, Number(f.perPlate.value) || 1), material: f.material.value, price: 0,
        }, app.settings);
        dlg.querySelector('[data-price-hint]').textContent = `leer: berechnet ${fmtEur(q.piece)} (Selbstkosten ${fmtEur(q.cost)})`;
      };
      form.addEventListener('input', hint);
      if (plate) {
        f.perPlate.addEventListener('input', () => {
          const n = Math.max(1, Number(f.perPlate.value) || 1);
          f.grams.value = String(Math.round((plate.grams / n) * 10) / 10).replace('.', ',');
          f.time.value = plate.seconds ? hm(plate.seconds / n) : '';
          hint();
        });
      }
      hint();
      f.photoFile.addEventListener('change', async () => {
        const file = f.photoFile.files[0];
        if (!file) return;
        try {
          photo = await photoFromFile(file);
          dlg.querySelector('[data-photo]').innerHTML = `<img src="${photo}" alt="">`;
        } catch (err) {
          toast(err.message, 'error');
        }
      });
      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        try {
          const res = await app.backend.deleteProduct(product.id);
          dlg.close();
          toast(`${product.name} aus dem Katalog gelöscht`);
          if (onDone) onDone(res);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
    async onSubmit(form) {
      const f = form.elements;
      const body = {
        name: f.name.value.trim(),
        description: f.description.value.trim(),
        grams: parseNum(f.grams.value) || 0,
        seconds: parseTime(f.time.value),
        perPlate: Math.max(1, Number(f.perPlate.value) || 1),
        material: f.material.value.trim(),
        price: f.price.value.trim() ? parseNum(f.price.value) : 0,
        file: f.file.value.trim(),
        photo,
      };
      if (!body.name) throw new Error('Bitte einen Namen eingeben.');
      if (!Number.isFinite(body.price) || body.price < 0) throw new Error('Bitte den Preis in Euro eingeben, z. B. 3,50.');
      const res = product ? await app.backend.updateProduct(product.id, body) : await app.backend.addProduct(body);
      toast(product ? 'Gespeichert' : `${body.name} im Katalog (Reiter „Katalog“)`);
      if (onDone) onDone(res);
    },
  });
}

// In den offenen Beleg: Anzahl und Farbe (eine passende Rolle aus dem Lager)
export function toDraftDialog(app, p) {
  const type = filamentTypeOf(p.material);
  const spools = app.spools.filter((s) => filamentTypeOf(s.material) === type && s.netWeight >= Math.max(1, p.grams))
    .sort((a, b) => (a.material === p.material ? 0 : 1) - (b.material === p.material ? 0 : 1) || (a.colorName || '').localeCompare(b.colorName || '', 'de') || b.netWeight - a.netWeight);
  // je Farbe die Rolle mit dem meisten Rest
  const seen = new Set();
  const colors = spools.filter((s) => {
    const k = `${s.material}|${(s.colorName || s.colorHex).toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let chosen = null;
  openDialog({
    title: `${esc(p.name)} in den Beleg`,
    body: `<div class="fields">
        <label class="field"><span>Anzahl</span><input name="qty" type="number" min="1" step="1" inputmode="numeric" value="1"></label>
        <div class="field"><span>Preis</span><strong class="num" data-sum></strong></div>
      </div>
      <h3>Farbe</h3>
      ${colors.length ? `<div class="color-grid">${colors.map((s, i) => `<button type="button" class="color-tile" data-i="${i}" aria-pressed="false">
          <span class="color-dot" style="background:${esc(s.colorHex)}"></span><span class="color-name">${esc(s.colorName || s.colorHex)}<small class="muted"> ${esc(s.material)}, #${s.nr}</small></span></button>`).join('')}</div>`
    : `<p class="small muted">Im Lager ist keine ${esc(type)}-Rolle mit genug Filament.</p>`}
      <p class="small muted" data-color>Farbe noch offen: dann rechnet der Beleg mit dem Preis aus der Preisliste.</p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">In den Beleg</button>',
    onReady(dlg, form) {
      const f = form.elements;
      const update = () => {
        const n = Math.max(1, Math.round(Number(f.qty.value)) || 1);
        const q = productQuote(p, app.settings, chosen);
        dlg.querySelector('[data-sum]').textContent = `${n} × ${fmtEur(q.piece)} = ${fmtEur(q.piece * n)}`;
      };
      f.qty.addEventListener('input', update);
      dlg.querySelector('.color-grid')?.addEventListener('click', (e) => {
        const b = e.target.closest('.color-tile');
        if (!b) return;
        const s = colors[Number(b.dataset.i)];
        chosen = chosen && chosen.id === s.id ? null : s;
        dlg.querySelectorAll('.color-tile').forEach((x) => x.setAttribute('aria-pressed', String(chosen && x === b)));
        dlg.querySelector('[data-color]').textContent = chosen
          ? `Rolle #${chosen.nr}: ${chosen.colorName || chosen.colorHex} ${chosen.material}, noch ${fmt(chosen.netWeight)} g`
          : 'Farbe noch offen: dann rechnet der Beleg mit dem Preis aus der Preisliste.';
        update();
      });
      update();
    },
    onSubmit(form) {
      const n = Math.max(1, Math.round(Number(form.elements.qty.value)) || 1);
      const q = productQuote(p, app.settings, chosen);
      const draft = addPosition({
        title: p.name, qty: n, grams: p.grams, seconds: p.seconds, perGram: q.perGram, spool: chosen, productId: p.id, piecePrice: p.price || null,
      });
      const { total } = draftTotals(draft, app.settings);
      toast(`${n} × ${p.name} im offenen Beleg (${plural(draft.positions.length, 'Position', 'Positionen')}, ${fmtEur(total)}), zu finden unter „Verkauf“`);
    },
  });
}
