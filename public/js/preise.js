// Reiter "Preisliste": Einkaufspreis je Filamentart. Gilt für neue Rollen und
// für Rollen ohne eigenen Kaufpreis; Rechner, Lagerwert und Einkaufsliste
// rechnen damit. Dazu die Regel, welche Rollengrößen nicht nachgekauft werden.
import {
  PURCHASE_WEIGHTS, filamentTypes, listPriceForWeight,
} from './domain.js';
import { openShoppingList } from './shopping.js';
import {
  esc, fmt, fmtEur, icons, openDialog, toast,
} from './ui.js';

let ctx = null; // { root, app }
let query = '';

const num = (v) => Number(String(v).replace(/\s|€/g, '').replace(',', '.'));
const dec = (v) => (v === null || v === undefined ? '' : esc(v.toFixed(2).replace('.', ',')));

export function renderPreise(root, app) {
  ctx = { root, app };
  root.innerHTML = `<div class="price-view">
    <section class="panel">
      <div class="panel-head"><h2>Preisliste</h2><p>Einkaufspreis je Filamentart</p></div>
      <p class="small muted">Gilt für neue Rollen und für Rollen ohne eigenen Kaufpreis; damit rechnen Rechner, Lagerwert und Einkaufsliste.
        Kleinere Rollen anteilig: 250 g kosten ein Viertel der 1-kg-Rolle. Änderungen werden sofort gespeichert.</p>
      <div class="toolbar">
        <label class="search">${icons.search}<input type="search" id="price-q" placeholder="Filamentart suchen" aria-label="Filamentart suchen" value="${esc(query)}"></label>
        <span class="toolbar-actions"><button class="btn" type="button" data-price="add">${icons.plus}Filamentart</button></span>
      </div>
      <div id="price-table"></div>
      <label class="inline-field default-price"><span>Ohne Eintrag gilt der Standardpreis</span>
        <input id="price-default" inputmode="decimal" value="${dec(app.settings.pricePerKg)}" aria-label="Standardpreis pro kg in Euro"> € pro kg</label>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Einkaufsliste</h2><p>Welche Rollengrößen nachgekauft werden</p></div>
      <p class="small muted">Rollen mit diesen Kaufgewichten kommen nicht auf die Einkaufsliste, wenn sie knapp werden. Ist dieselbe Farbe auch als größere Rolle knapp, schlägt die Liste die größere vor.</p>
      <div class="actions" id="no-rebuy"></div>
      <div class="actions"><button class="btn" type="button" data-price="shopping">${icons.cart}Einkaufsliste öffnen</button></div>
    </section>
  </div>`;
  const view = root.querySelector('.price-view');
  view.addEventListener('change', onChange);
  view.addEventListener('click', onClick);
  root.querySelector('#price-q').addEventListener('input', (e) => {
    query = e.target.value;
    filterRows();
  });
  updateTable();
  updateNoRebuy();
}

function rowHtml(t, i) {
  const { app } = ctx;
  const e = t.entry;
  const spools = app.spools.filter((s) => s.material.toLowerCase() === t.material.toLowerCase());
  const missing = spools.filter((s) => s.price === null).length;
  const other = e ? spools.filter((s) => s.price !== null && s.price !== listPriceForWeight(e, s.purchaseWeight)).length : 0;
  const status = t.count
    ? [`${t.count} ${t.count === 1 ? 'Rolle' : 'Rollen'} im Lager`, missing ? `${missing} ohne eigenen Preis` : '', other ? `${other} mit anderem Preis` : ''].filter(Boolean).join(' · ')
    : 'nicht im Lager';
  return `<div class="price-row${e ? ' has-price' : ''}" data-material="${esc(t.material)}">
    <div class="price-name"><strong>${esc(t.material)}</strong><span class="small muted">${status}</span></div>
    <label class="price-field"><span>Preis pro Rolle</span><input id="pl-price-${i}" data-field="price" inputmode="decimal" value="${e ? dec(e.price) : ''}" placeholder="–" aria-label="Preis pro Rolle ${esc(t.material)} in Euro"></label>
    <label class="price-field"><span>Rolle (g)</span><input id="pl-weight-${i}" data-field="weight" type="number" min="1" step="1" inputmode="numeric" list="pl-weights" value="${e ? e.weight : 1000}" aria-label="Rollengewicht ${esc(t.material)} in Gramm"></label>
    <span class="price-kg num">${e ? `${fmtEur((e.price / e.weight) * 1000)}<small> /kg</small>` : ''}</span>
    <span class="price-actions">${e && (missing || other) ? '<button type="button" class="btn small" data-price="apply">Auf Rollen übertragen</button>' : ''}${e ? `<button type="button" class="icon-btn" data-price="remove" aria-label="Preis für ${esc(t.material)} entfernen">×</button>` : ''}</span>
  </div>`;
}

function updateTable() {
  const { root, app } = ctx;
  const focused = document.activeElement && document.activeElement.id;
  const types = filamentTypes(app.spools, app.settings);
  const inStock = types.filter((t) => t.count);
  const rest = types.filter((t) => !t.count);
  root.querySelector('#price-table').innerHTML = `
    <datalist id="pl-weights">${PURCHASE_WEIGHTS.map((w) => `<option value="${w}"></option>`).join('')}</datalist>
    ${inStock.length ? `<h3>Im Lager</h3><div class="price-list">${inStock.map(rowHtml).join('')}</div>` : ''}
    <h3>Weitere Filamentarten</h3><div class="price-list">${rest.map((t, i) => rowHtml(t, inStock.length + i)).join('')}</div>`;
  filterRows();
  if (focused) document.getElementById(focused)?.focus();
}

function filterRows() {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  ctx.root.querySelectorAll('.price-row').forEach((row) => {
    row.hidden = !words.every((w) => row.dataset.material.toLowerCase().includes(w));
  });
}

function updateNoRebuy() {
  const { root, app } = ctx;
  const weights = [...new Set([...PURCHASE_WEIGHTS.filter((w) => w < 1000), ...app.spools.map((s) => s.purchaseWeight)])].filter(Boolean).sort((a, b) => a - b);
  root.querySelector('#no-rebuy').innerHTML = weights.map((w) => {
    const n = app.spools.filter((s) => s.purchaseWeight === w).length;
    return `<label class="switch"><input type="checkbox" data-rebuy="${w}" ${app.settings.noRebuyWeights.includes(w) ? 'checked' : ''}>
      <span>${w >= 1000 ? `${String(w / 1000).replace('.', ',')} kg` : `${fmt(w)} g`}-Rollen nicht nachkaufen${n ? `<small>${n} im Lager</small>` : ''}</span></label>`;
  }).join('');
}

async function saveSettings(patch, message) {
  const { app } = ctx;
  app.settings = await app.backend.saveSettings({ ...app.settings, ...patch });
  if (message) toast(message);
}

async function onChange(e) {
  const { app } = ctx;
  try {
    if (e.target.id === 'price-default') {
      const v = num(e.target.value);
      if (!Number.isFinite(v) || v < 0) throw new Error('Bitte einen Preis pro kg eingeben, z. B. 20,00.');
      await saveSettings({ pricePerKg: v }, `Standardpreis ${fmtEur(v)} pro kg gespeichert`);
      return;
    }
    if (e.target.dataset.rebuy) {
      const w = Number(e.target.dataset.rebuy);
      const set = new Set(app.settings.noRebuyWeights);
      if (e.target.checked) set.add(w);
      else set.delete(w);
      await saveSettings({ noRebuyWeights: [...set] }, e.target.checked ? `${fmt(w)}-g-Rollen kommen nicht mehr auf die Einkaufsliste` : `${fmt(w)}-g-Rollen werden wieder nachgekauft`);
      return;
    }
    const row = e.target.closest('.price-row');
    if (!row || !e.target.dataset.field) return;
    const material = row.dataset.material;
    const priceText = row.querySelector('[data-field="price"]').value.trim();
    const price = num(priceText);
    const weight = Math.max(1, Math.round(num(row.querySelector('[data-field="weight"]').value)) || 1000);
    const others = app.settings.priceList.filter((x) => x.material.toLowerCase() !== material.toLowerCase());
    if (!priceText) {
      if (others.length !== app.settings.priceList.length) await saveSettings({ priceList: others }, `Preis für ${material} entfernt`);
      updateTable();
      return;
    }
    if (!Number.isFinite(price) || price < 0) throw new Error('Bitte einen Preis in Euro eingeben, z. B. 19,99.');
    await saveSettings({ priceList: [...others, { material, price, weight }] }, `${material}: ${fmtEur(price)} pro ${fmt(weight)} g gespeichert`);
    updateTable();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function onClick(e) {
  const b = e.target.closest('[data-price]');
  if (!b) return;
  const { app } = ctx;
  const action = b.dataset.price;
  if (action === 'shopping') openShoppingList(app);
  if (action === 'add') addDialog();
  const row = b.closest('.price-row');
  if (!row) return;
  const material = row.dataset.material;
  if (action === 'remove') {
    saveSettings({ priceList: app.settings.priceList.filter((x) => x.material.toLowerCase() !== material.toLowerCase()) }, `Preis für ${material} entfernt`)
      .then(updateTable).catch((err) => toast(err.message, 'error'));
  }
  if (action === 'apply') applyDialog(material);
}

function addDialog() {
  const { app } = ctx;
  openDialog({
    title: 'Filamentart hinzufügen',
    body: `<div class="fields">
      <label class="field full"><span>Filamentart</span><input name="material" required placeholder="z. B. eSUN PLA+"></label>
      <label class="field"><span>Preis pro Rolle (€)</span><input name="price" inputmode="decimal" required></label>
      <label class="field"><span>Rollengewicht (g)</span><input name="weight" type="number" min="1" step="1" value="1000"></label>
    </div>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Hinzufügen</button>',
    async onSubmit(form) {
      const f = form.elements;
      const material = f.material.value.trim();
      const price = num(f.price.value);
      if (!material) throw new Error('Bitte die Filamentart eingeben.');
      if (!f.price.value.trim() || !Number.isFinite(price) || price < 0) throw new Error('Bitte einen Preis in Euro eingeben, z. B. 24,99.');
      const others = app.settings.priceList.filter((x) => x.material.toLowerCase() !== material.toLowerCase());
      await saveSettings({ priceList: [...others, { material, price, weight: Math.max(1, Math.round(num(f.weight.value)) || 1000) }] }, `${material} in der Preisliste`);
      query = '';
      renderPreise(ctx.root, app);
    },
  });
}

// Listenpreis bei den Rollen dieser Art eintragen, auf Wunsch auch überschreiben.
function applyDialog(material) {
  const { app } = ctx;
  const entry = app.settings.priceList.find((x) => x.material.toLowerCase() === material.toLowerCase());
  const spools = app.spools.filter((s) => s.material.toLowerCase() === material.toLowerCase());
  const missing = spools.filter((s) => s.price === null);
  const other = spools.filter((s) => s.price !== null && s.price !== listPriceForWeight(entry, s.purchaseWeight));
  const weights = [...new Set(spools.map((s) => s.purchaseWeight))].sort((a, b) => b - a);
  openDialog({
    title: `${esc(material)}: Preis übertragen`,
    body: `<p>${fmtEur(entry.price)} pro ${fmt(entry.weight)} g, also ${weights.map((w) => `${fmt(w)} g: ${fmtEur(listPriceForWeight(entry, w))}`).join(', ')}.</p>
      ${missing.length ? `<p>Wird bei ${missing.length} ${missing.length === 1 ? 'Rolle' : 'Rollen'} ohne Preis eingetragen.</p>` : ''}
      ${other.length ? `<label class="switch"><input type="checkbox" name="overwrite" ${missing.length ? '' : 'checked'}><span>Auch bei ${other.length} ${other.length === 1 ? 'Rolle' : 'Rollen'} mit anderem Preis ersetzen
        <small>${other.map((s) => `#${s.nr} ${fmtEur(s.price)}`).join(', ')}</small></span></label>` : ''}`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Übertragen</button>',
    async onSubmit(form) {
      const overwrite = Boolean(form.elements.overwrite && form.elements.overwrite.checked);
      const res = await app.backend.applyPriceList(material, overwrite);
      app.spools = res.spools;
      toast(`${material}: Preis bei ${res.changed} ${res.changed === 1 ? 'Rolle' : 'Rollen'} eingetragen`);
      updateTable();
    },
  });
}
