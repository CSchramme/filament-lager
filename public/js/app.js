import { createBackend } from './api.js';
import {
  BRANDS, COLOR_PRESETS, PURCHASE_WEIGHTS, amsSlots, colorDistance, colorHexFor, colorNameFor, filamentTypeOf, filamentTypes, grossOf,
  listPrice, listPriceForWeight, lowStockLimit, netFromGross, normHex, parseCsv, placeList, placeName, remainingShare, spoolLabel,
  spoolPlace, spoolTypeOf, spoolsFromRows, stockLevel, summarize, toCsv, weightPatch,
} from './domain.js';
import {
  combobox, download, esc, fmt, fmtEur, fmtKg, icons, localDay, openDialog, parseNum, readFile, ring, timeAgo, toast,
} from './ui.js';
import { renderAuswertung } from './auswertung.js';
import { renderCalculator } from './calculator.js';
import { pickColor, swatchesHtml } from './farben.js';
import { openLabels } from './labels.js';
import { deliveriesHtml, deliveryDialog, receiveDialog } from './lieferungen.js';
import { renderPreise } from './preise.js';
import { renderPrints } from './prints.js';
import { qrSvg } from './qr.js';
import { openShoppingList } from './shopping.js';
import { renderVerkauf } from './verkauf.js';

// Bereiche der App, in dieser Reihenfolge als Reiter bzw. im Menü
const VIEWS = [
  ['lager', 'Lager'], ['plaetze', 'Plätze'], ['preise', 'Preisliste'], ['rechner', 'Rechner'], ['verkauf', 'Verkauf'], ['drucke', 'Drucke'],
  ['auswertung', 'Auswertung'], ['bambu', 'Bambu'], ['einstellungen', 'Einstellungen'],
];

const app = {
  backend: null, spools: [], settings: null, bambu: null, view: 'lager', poll: null, printersSig: '', selected: new Set(),
};
const $view = document.getElementById('view');

// Ansicht merken (Filter, Sortierung). Nur Komfort, darf fehlen.
const PREFS_KEY = 'filament-lager-ansicht';
const prefs = { q: '', chip: 'alle', material: '', sort: '', dir: 1 };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'), { q: '' });
} catch { /* ohne gespeicherte Ansicht */ }
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ chip: prefs.chip, material: prefs.material, sort: prefs.sort, dir: prefs.dir }));
  } catch { /* egal */ }
}

// ---------------------------------------------------------------------------
// Start und Navigation

async function init() {
  document.getElementById('tabs').innerHTML = VIEWS.map(([key, label]) => `<button class="tab" type="button" data-view="${key}">${label}</button>`).join('');
  app.backend = await createBackend();
  const mode = document.getElementById('mode');
  const server = app.backend.mode === 'server';
  mode.dataset.mode = app.backend.mode;
  mode.textContent = server ? 'Server' : 'Nur Browser';
  mode.title = server ? 'Daten liegen auf dem Server (data/lager.json).' : 'Kein Server gefunden. Die Daten liegen nur in diesem Browser.';
  if (app.backend.auth === 'required') return renderLogin();
  if (app.backend.auth === 'missing') return renderLocked();
  try {
    await reload();
  } catch (err) {
    $view.innerHTML = `<div class="note crit">Lager konnte nicht geladen werden: ${esc(err.message)}</div>`;
    return;
  }
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    setMenu(false);
    go(b.dataset.view);
  });
  // Hamburger-Menü am Handy
  const menuBtn = document.getElementById('menu-btn');
  menuBtn.addEventListener('click', () => setMenu(!document.querySelector('.tabs').classList.contains('open')));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.tabs').classList.contains('open')) {
      setMenu(false);
      menuBtn.focus();
    }
  });
  $view.addEventListener('click', onClick);
  $view.addEventListener('input', onInput);
  $view.addEventListener('change', onChange);
  $view.addEventListener('submit', onSubmit);
  $view.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.row.item')) spoolDialog(findSpool(e.target.dataset.id));
  });
  initDragAndDrop();
  window.addEventListener('hashchange', route);
  route();
}

// Ziehen und Ablegen in der Ansicht "Plätze" (Maus). Am Handy gilt Antippen.
function initDragAndDrop() {
  $view.addEventListener('dragstart', (e) => {
    const chipEl = e.target.closest('[data-chip-id]');
    if (!chipEl) return;
    const id = chipEl.dataset.chipId;
    const ids = app.selected.has(id) ? [...app.selected] : [id];
    e.dataTransfer.setData('text/plain', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  });
  $view.addEventListener('dragover', (e) => {
    const zone = e.target.closest('[data-drop-zone]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.add('over');
  });
  $view.addEventListener('dragleave', (e) => {
    const zone = e.target.closest('[data-drop-zone]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('over');
  });
  $view.addEventListener('drop', (e) => {
    const zone = e.target.closest('[data-drop-zone]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('over');
    let ids;
    try {
      ids = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }
    run(() => dropOn(ids, JSON.parse(zone.dataset.dropZone)));
  });
}

function renderLogin() {
  document.querySelector('.tabs').hidden = true;
  document.getElementById('menu-btn').hidden = true;
  $view.innerHTML = `<section class="panel login">
    <div class="panel-head"><h2>Anmelden</h2></div>
    <form class="fields" id="login-form">
      <input type="text" name="username" value="Filament-Lager" autocomplete="username" hidden>
      <label class="field full"><span>Passwort</span><input name="password" type="password" autocomplete="current-password" required></label>
      <div class="actions full"><button class="btn primary" type="submit">Anmelden</button></div>
    </form>
    <p class="small muted">Das Passwort ist der Wert von <code>LAGER_PASSWORT</code>, der beim Einrichten festgelegt wurde.</p>
  </section>`;
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await app.backend.appLogin(form.elements.password.value);
      location.reload();
    } catch (err) {
      toast(err.message, 'error');
      form.elements.password.select();
    }
  });
  form.elements.password.focus();
}

function renderLocked() {
  document.querySelector('.tabs').hidden = true;
  document.getElementById('menu-btn').hidden = true;
  $view.innerHTML = `<section class="panel login">
    <div class="panel-head"><h2>Passwort fehlt</h2></div>
    <p>Das Lager läuft auf einem Webserver und bleibt ohne Passwort gesperrt, damit niemand aus dem Internet deinen Bestand ändern kann.</p>
    <ol class="steps">
      <li>In Plesk bei der Domain „Node.js“ öffnen.</li>
      <li>Unter „Benutzerdefinierte Umgebungsvariablen“ <code>LAGER_PASSWORT</code> mit einem langen Passwort eintragen.</li>
      <li>„App neu starten“ klicken und diese Seite neu laden.</li>
    </ol>
  </section>`;
}

async function reload() {
  const s = await app.backend.getState();
  app.spools = s.spools;
  app.settings = s.settings;
}

const findSpool = (id) => app.spools.find((s) => s.id === id);

function setMenu(open) {
  const btn = document.getElementById('menu-btn');
  document.querySelector('.tabs').classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
}

function go(view) {
  if (location.hash !== '#' + view) location.hash = view;
  else route();
}

function route() {
  // QR-Code auf dem Etikett: #rolle/12 öffnet die Rolle zum Wiegen.
  const scanned = /^#rolle\/(\d+)$/.exec(location.hash);
  if (scanned) {
    history.replaceState(null, '', '#lager');
    route();
    const spool = app.spools.find((s) => s.nr === Number(scanned[1]));
    if (spool) weighDialog(spool);
    else toast(`Rolle #${scanned[1]} gibt es nicht (mehr).`, 'error');
    return;
  }
  const v = location.hash.slice(1);
  app.view = VIEWS.some(([key]) => key === v) ? v : 'lager';
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.view === app.view) {
      t.setAttribute('aria-current', 'page');
      document.getElementById('menu-label').textContent = t.textContent;
    } else t.removeAttribute('aria-current');
  });
  clearInterval(app.poll);
  app.selected.clear();
  document.body.classList.remove('has-movebar');
  if (app.view === 'lager') renderLager();
  else if (app.view === 'plaetze') renderPlaces();
  else if (app.view === 'preise') renderPreise($view, app);
  else if (app.view === 'rechner') renderCalculator($view, app, { spoolUpdated, go });
  else if (app.view === 'verkauf') renderVerkauf($view, app, { go });
  else if (app.view === 'drucke') renderPrints($view, app, { go });
  else if (app.view === 'auswertung') renderAuswertung($view, app);
  else if (app.view === 'bambu') renderBambu();
  else renderSettings();
  if (app.backend.mode === 'server') {
    app.poll = setInterval(poll, app.view === 'bambu' ? 4000 : 20000);
  }
}

// Holt Änderungen vom Server (z. B. vom AMS gesetzte Status).
async function poll() {
  if (document.hidden || document.querySelector('dialog[open]')) return;
  try {
    await reload();
    if (app.view === 'lager') updateLager();
    if (app.view === 'plaetze' && !app.selected.size) updatePlaces();
    if (app.view === 'bambu') {
      app.bambu = await app.backend.bambu();
      updatePrinters();
    }
  } catch { /* nächster Versuch beim nächsten Takt */ }
}

// ---------------------------------------------------------------------------
// Lager

const CHIPS = [
  ['alle', 'Alle', () => true],
  ['ams', 'Im AMS', (s) => s.inAms],
  ['offen', 'Geöffnet', (s) => s.opened],
  ['neu', 'Ungeöffnet', (s) => !s.opened],
  ['knapp', 'Knapp', (s) => ['knapp', 'leer'].includes(stockLevel(s, app.settings))],
];

const SORTS = {
  farbe: (s) => (s.colorName || s.colorHex).toLowerCase(),
  rest: (s) => s.netWeight,
  brutto: (s) => grossOf(s, app.settings),
  kauf: (s) => s.purchaseWeight,
  // AMS zuerst, dann Pakete in natürlicher Reihenfolge, "ohne Platz" zuletzt.
  ort: (s) => {
    const p = spoolPlace(s);
    return { slot: '0 ' + p.slot, ams: '1', place: '2 ' + p.place.toLowerCase(), none: '3' }[p.kind];
  },
};

function compare(a, b) {
  if (typeof a === 'number') return a - b;
  return String(a).localeCompare(String(b), 'de', { numeric: true });
}

function filteredSpools() {
  const words = prefs.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const chip = (CHIPS.find((c) => c[0] === prefs.chip) || CHIPS[0])[2];
  let list = app.spools.filter((s) => {
    if (prefs.material && s.material !== prefs.material) return false;
    if (!chip(s)) return false;
    if (!words.length) return true;
    const hay = [s.colorName, s.material, s.brand, s.location, s.note, s.colorHex, s.bambu.slot].join(' ').toLowerCase();
    // "#12" sucht genau die Rolle Nummer 12
    return words.every((w) => (/^#\d+$/.test(w) ? s.nr === Number(w.slice(1)) : hay.includes(w)));
  });
  if (prefs.sort && SORTS[prefs.sort]) {
    const key = SORTS[prefs.sort];
    list = [...list].sort((a, b) => compare(key(a), key(b)) * prefs.dir);
  }
  return list;
}

function renderLager() {
  const materials = [...new Set(app.spools.map((s) => s.material))].sort(compare);
  if (prefs.material && !materials.includes(prefs.material)) prefs.material = '';
  $view.innerHTML = `
    <section class="stats" id="stats"></section>
    <section class="panel" id="deliveries" hidden></section>
    <section class="toolbar">
      <label class="search">${icons.search}<input type="search" id="q" placeholder="Farbe, Material, Ort oder #Nummer suchen" aria-label="Suchen" value="${esc(prefs.q)}"></label>
      <div class="chips" id="chips"></div>
      <select id="material" aria-label="Material filtern" style="width:auto">
        <option value="">Alle Materialien</option>
        ${materials.map((m) => `<option ${m === prefs.material ? 'selected' : ''}>${esc(m)}</option>`).join('')}
      </select>
      <span class="toolbar-actions">
        <button class="btn" type="button" data-action="shopping">${icons.cart}Einkaufsliste</button>
        <button class="btn" type="button" data-action="delivery-add">${icons.truck}Paket</button>
        <button class="btn" type="button" data-action="labels">${icons.qr}Etiketten</button>
        <button class="btn primary" type="button" data-action="add">${icons.plus} Spule</button>
      </span>
    </section>
    <section class="list" id="list"></section>`;
  document.getElementById('deliveries').addEventListener('click', onDeliveriesClick);
  updateLager();
  updateDeliveries();
  app.backend.deliveries().then((res) => {
    app.deliveries = res.deliveries;
    updateDeliveries();
    updateLager();
  }).catch(() => {});
}

// Filament unterwegs (lieferungen.js)
function updateDeliveries() {
  const el = document.getElementById('deliveries');
  if (!el) return;
  const html = deliveriesHtml(app.deliveries || []);
  el.innerHTML = html;
  el.hidden = !html;
}

function onDeliveriesClick(e) {
  const b = e.target.closest('[data-dl]');
  const row = b && b.closest('.delivery-row');
  const d = row && (app.deliveries || []).find((x) => x.id === row.dataset.id);
  if (!d) return;
  if (b.dataset.dl === 'edit') deliveryDialog(app, d, { onDone: deliveriesChanged });
  if (b.dataset.dl === 'receive') receiveDialog(app, d, { onDone: deliveriesChanged });
}

function deliveriesChanged() {
  updateDeliveries();
  if (app.view === 'lager') updateLager();
}

function updateLager() {
  const stats = document.getElementById('stats');
  if (!stats) return;
  stats.innerHTML = statsHtml();
  document.getElementById('chips').innerHTML = CHIPS.map(([key, label, fn]) =>
    `<button class="chip" type="button" data-chip="${key}" aria-pressed="${prefs.chip === key}">${label}<span class="count">${app.spools.filter(fn).length}</span></button>`).join('');
  document.getElementById('list').innerHTML = listHtml(filteredSpools());
}

function statsHtml() {
  const sum = summarize(app.spools, app.settings);
  const max = Math.max(1, ...sum.byMaterial.map((m) => m.net));
  const short = sum.low + sum.empty;
  const coming = (app.deliveries || []).filter((d) => !d.receivedAt).reduce((a, d) => a + d.items.reduce((x, i) => x + i.qty, 0), 0);
  const amsSlots = app.spools.filter((s) => s.inAms && s.bambu.slot).map((s) => s.bambu.slot).sort();
  return `
    <div class="stat"><span class="label">Filament auf Lager</span><span class="value">${fmtKg(sum.totalNet)}<small>kg</small></span><span class="hint">${sum.count} Spulen${coming ? `, ${coming} unterwegs` : ''}</span></div>
    <div class="stat"><span class="label">Im AMS</span><span class="value">${sum.inAms}</span><span class="hint">${amsSlots.length ? esc(amsSlots.join(' · ')) : 'Spulen eingelegt'}</span></div>
    <div class="stat ${short ? 'warn' : ''}"><span class="label">Knapp, unter 1/${app.settings.lowStockPart} der Spule</span><span class="value">${short}</span><span class="hint">${sum.empty ? `davon ${sum.empty} leer · ` : ''}${short ? '<button type="button" class="link" data-action="shopping">Einkaufsliste</button>' : 'bald nachkaufen'}</span></div>
    <div class="stat"><span class="label">Ungeöffnet</span><span class="value">${sum.sealed}</span><span class="hint">volle Reserve</span></div>
    <div class="stat materials"><span class="label">Nach Material</span>
      ${sum.byMaterial.slice(0, 5).map((m) => `<div class="mat-row"><span class="name" title="${esc(m.material)}">${esc(m.material)}</span><span class="bar"><span style="width:${((m.net / max) * 100).toFixed(1)}%"></span></span><span class="num small">${fmtKg(m.net)} kg</span></div>`).join('')
      || '<span class="hint">noch leer</span>'}
    </div>`;
}

function sortHead(key, label, cls = '') {
  const active = prefs.sort === key;
  const arrow = active ? (prefs.dir > 0 ? ' ↑' : ' ↓') : '';
  return `<span class="${cls}"><button type="button" data-sort="${key}" ${active ? `aria-sort="${prefs.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${label}${arrow}</button></span>`;
}

function listHtml(list) {
  if (!app.spools.length) {
    return `<div class="empty-state"><strong>Noch keine Spulen im Lager.</strong>
      <span>Lege die erste Spule an oder importiere deine Excel-Tabelle unter Einstellungen.</span>
      <button class="btn primary" type="button" data-action="add">${icons.plus} Spule anlegen</button></div>`;
  }
  if (!list.length) {
    return `<div class="empty-state">Keine Spule passt zu Suche und Filter.
      <button class="btn small" type="button" data-action="reset-filter">Filter zurücksetzen</button></div>`;
  }
  return `<div class="row head">${sortHead('farbe', 'Spule')}${sortHead('rest', 'Rest')}${sortHead('brutto', 'Mit Spule', 'r')}${sortHead('kauf', 'Kauf', 'r')}${sortHead('ort', 'Platz')}<span>Status</span><span></span></div>`
    + list.map(rowHtml).join('');
}

function statusPills(s) {
  const level = stockLevel(s, app.settings);
  return [
    level === 'neu' ? '<span class="pill new">Ungeöffnet</span>' : '',
    level === 'knapp' ? `<span class="pill knapp" title="Weniger als 1/${app.settings.lowStockPart} der Spule (${fmt(lowStockLimit(s, app.settings))} g)">Knapp</span>` : '',
    level === 'leer' ? '<span class="pill leer">Leer</span>' : '',
    s.bambu.cloudId ? '<span class="pill cloud" title="Mit dem Bambu Filament Manager verknüpft">Bambu</span>' : '',
  ].join('');
}

// Antippen öffnet die Platzwahl (Paket oder AMS-Slot).
function placeButton(s) {
  const p = spoolPlace(s);
  return `<button type="button" class="place-btn ${p.kind}" data-action="place" data-id="${esc(s.id)}" title="Platz ändern">${esc(p.kind === 'none' ? 'Platz wählen' : p.label)}</button>`;
}

function rowHtml(s) {
  const level = stockLevel(s, app.settings);
  const share = remainingShare(s);
  const type = spoolTypeOf(s, app.settings);
  return `<article class="row item" data-id="${esc(s.id)}" tabindex="0" aria-label="${esc(spoolLabel(s))}">
    <div class="c-spool spool">${ring(s.colorHex, share)}<div class="txt"><div class="title"><span class="nr">#${s.nr ?? '–'}</span>${esc(s.colorName || s.colorHex)}</div><div class="sub">${esc(s.material)}${s.brand ? ' · ' + esc(s.brand) : ''}</div></div></div>
    <div class="c-rest rest"><span class="g num">${fmt(s.netWeight)} <small>g</small></span><div class="meter" data-level="${level}"><span style="width:${(share * 100).toFixed(1)}%"></span></div></div>
    <div class="c-gross r num" title="${esc(type.name)}, Tara ${fmt(type.tare)} g">${fmt(grossOf(s, app.settings))}</div>
    <div class="c-buy r num">${fmt(s.purchaseWeight)}</div>
    <div class="c-loc">${placeButton(s)}</div>
    <div class="c-meta pills"><span class="loc-m">${placeButton(s)}</span>${statusPills(s)}</div>
    <div class="c-actions"><button class="btn small" type="button" data-action="weigh" data-id="${esc(s.id)}">${icons.scale}Gramm</button></div>
  </article>`;
}

// Etiketten: vorausgewählt sind die Spulen, die gerade in der Liste stehen.
function labelsDialog() {
  const shown = new Set(filteredSpools().map((s) => s.id));
  const list = [...app.spools].filter((s) => s.nr).sort((a, b) => a.nr - b.nr);
  openDialog({
    title: 'Etiketten drucken',
    body: `<p class="small muted">Jedes Etikett trägt einen QR-Code. Mit der Handykamera scannen, dann öffnet sich die Rolle hier zum Wiegen.</p>
      <div class="actions"><button type="button" class="btn small" data-all>Alle</button><button type="button" class="btn small" data-none>Keine</button></div>
      <div class="sync-list">${list.map((s) => `<label class="sync-item"><input type="checkbox" name="spool" value="${esc(s.id)}" ${shown.has(s.id) ? 'checked' : ''}>
        ${ring(s.colorHex, remainingShare(s))}<span><strong><span class="nr">#${s.nr}</span>${esc(s.colorName || s.colorHex)}</strong> <span class="chg">${esc(s.material)}${s.brand ? ` · ${esc(s.brand)}` : ''}</span></span></label>`).join('')}</div>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Etiketten öffnen</button>',
    onReady(dlg) {
      const boxes = () => dlg.querySelectorAll('[name="spool"]');
      dlg.querySelector('[data-all]').addEventListener('click', () => boxes().forEach((i) => { i.checked = true; }));
      dlg.querySelector('[data-none]').addEventListener('click', () => boxes().forEach((i) => { i.checked = false; }));
    },
    onSubmit(form) {
      const ids = new Set([...form.querySelectorAll('[name="spool"]:checked')].map((i) => i.value));
      if (!ids.size) throw new Error('Bitte mindestens eine Spule auswählen.');
      openLabels(list.filter((s) => ids.has(s.id)), app.settings);
    },
  });
}

// ---------------------------------------------------------------------------
// Dialog: Spule anlegen / bearbeiten

function datalist(id, values) {
  return `<datalist id="${id}">${values.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
}

function spoolDialog(spool, { copy = false } = {}) {
  const isNew = !spool || copy;
  const types = app.settings.spoolTypes;
  const s = spool || {
    material: 'PLA Basic', brand: 'Bambu Lab', colorName: '', colorHex: '#9AA0A6', purchaseWeight: 1000, netWeight: 1000,
    spoolTypeId: types[0].id, location: '', opened: false, inAms: false, note: '', bambu: {},
  };
  const tareFor = (id) => (types.find((t) => t.id === id) || types[0]).tare;
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort(compare);
  const linked = !isNew && (s.bambu.cloudId || s.bambu.rfid || s.bambu.slot);
  const title = copy ? 'Spule duplizieren' : isNew ? 'Neue Spule' : esc(spoolLabel(s));

  const body = `
    <div class="fields">
      <label class="field"><span>Filamentart</span><input name="material" value="${esc(s.material)}" required placeholder="suchen, z. B. PLA Matte"></label>
      <label class="field"><span>Hersteller</span><input name="brand" list="dl-brand" value="${esc(s.brand)}"></label>
      <div class="field full"><span>Farbe</span>
        <div class="color-row"><input name="colorName" list="dl-color" value="${esc(s.colorName)}" placeholder="z. B. Kürbis Orange" aria-label="Farbname"><input type="color" name="colorHex" value="${esc(s.colorHex)}" aria-label="Farbton"></div>
      </div>
      <div class="swatches full">${swatchesHtml(s.material, s.colorHex, s.colorName)}</div>
      <div class="full"><button type="button" class="btn small" data-pick-color>Farbe mit Namen wählen …</button></div>
      <label class="field"><span>Kaufgewicht in g</span><input name="purchaseWeight" type="number" inputmode="numeric" min="0" step="1" list="dl-weights" value="${s.purchaseWeight}"></label>
      <label class="field"><span>Kaufpreis der Rolle in €</span><input name="price" inputmode="decimal" value="${s.price === null || s.price === undefined ? '' : esc(String(s.price).replace('.', ','))}"><small class="muted" data-price-hint></small></label>
      <label class="field"><span>Kaufdatum</span><input name="boughtAt" type="date" value="${esc(isNew ? localDay() : s.boughtAt || '')}"><small class="muted">für die Jahresübersicht</small></label>
      <label class="field"><span>Spulenart</span><select name="spoolTypeId">${types.map((t) => `<option value="${esc(t.id)}" ${t.id === s.spoolTypeId ? 'selected' : ''}>${esc(t.name)} (Tara ${fmt(t.tare)} g)</option>`).join('')}</select></label>
      <label class="field"><span>Gewicht mit Spule in g</span><input name="gross" type="number" inputmode="numeric" min="0" step="1" value="${s.netWeight + tareFor(s.spoolTypeId)}"></label>
      <label class="field"><span>Restgewicht Filament in g</span><input name="netWeight" type="number" inputmode="numeric" min="0" step="1" value="${s.netWeight}"></label>
      <label class="field"><span>Lagerort / Paket</span><input name="location" list="dl-loc" value="${esc(s.location)}" placeholder="z. B. 3 oder Kiste"></label>
      ${isNew ? '<label class="field"><span>Anzahl gleicher Spulen</span><input name="count" type="number" inputmode="numeric" min="1" max="50" value="1"></label>' : '<span></span>'}
      <label class="switch"><input type="checkbox" name="opened" ${s.opened ? 'checked' : ''}><span>Geöffnet</span></label>
      <label class="switch"><input type="checkbox" name="inAms" ${s.inAms ? 'checked' : ''}><span>Im AMS</span></label>
      <label class="field full"><span>Notiz</span><textarea name="note" rows="2">${esc(s.note)}</textarea></label>
    </div>
    ${linked ? `<div class="note">Bambu: ${[
    s.bambu.cloudId ? 'verknüpft mit dem Filament Manager' : '',
    s.bambu.rfid ? 'RFID ' + esc(s.bambu.rfid.slice(0, 4) + '…' + s.bambu.rfid.slice(-4)) : '',
    s.bambu.slot ? 'Slot ' + esc(s.bambu.slot) : '',
  ].filter(Boolean).join(' · ')}</div>` : ''}
    ${datalist('dl-brand', uniq([...BRANDS, ...app.spools.map((x) => x.brand)]))}
    ${datalist('dl-color', COLOR_PRESETS.map((c) => c.name))}
    ${datalist('dl-weights', PURCHASE_WEIGHTS.map(String))}
    ${datalist('dl-loc', uniq(app.spools.map((x) => x.location)))}`;

  const foot = isNew
    ? '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Anlegen</button>'
    : `<button type="button" class="btn danger" data-del>${icons.trash}Löschen</button><button type="button" class="btn" data-dup>${icons.copy}Duplizieren</button><button type="button" class="btn" data-label>${icons.qr}Etikett</button><span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`;

  openDialog({
    title,
    body,
    foot,
    onReady(dlg, form) {
      const f = form.elements;
      const tare = () => tareFor(f.spoolTypeId.value);
      // Preis aus der Preisliste als Vorschlag, passend zum Kaufgewicht
      const priceHint = () => {
        const entry = listPrice(f.material.value, app.settings);
        const w = Number(f.purchaseWeight.value) || 0;
        const hint = dlg.querySelector('[data-price-hint]');
        if (entry && w) {
          const p = listPriceForWeight(entry, w);
          f.price.placeholder = p.toFixed(2).replace('.', ',');
          hint.textContent = `${isNew ? 'leer lassen' : 'leer'}: ${fmtEur(p)} laut Preisliste${w !== entry.weight ? ` (${fmtEur(entry.price)} pro ${fmt(entry.weight)} g)` : ''}`;
        } else {
          f.price.placeholder = '';
          hint.textContent = `leer: Standardpreis ${fmtEur(app.settings.pricePerKg)} pro kg`;
        }
      };
      combobox(f.material, {
        options: () => filamentTypes(app.spools, app.settings).map((t) => ({
          value: t.material,
          hint: [t.entry ? `${fmtEur(t.entry.price)} / ${fmt(t.entry.weight)} g` : '', t.count ? `${t.count} im Lager` : ''].filter(Boolean).join(' · '),
        })),
        onPick: () => {
          priceHint();
          refreshSwatches();
        },
        newLabel: (v) => `„${v}“ als neue Filamentart`,
      });
      // Farbflächen passend zur Filamentart (Bambu-Sortiment)
      // Nur bei anderer Filamentart neu zeichnen: Das Feld meldet "change" auch
      // beim Verlassen, genau wenn eine Farbfläche angetippt wird.
      let swatchFor = s.material;
      const refreshSwatches = (force = false) => {
        if (!force && f.material.value.trim().toLowerCase() === String(swatchFor).trim().toLowerCase()) return;
        swatchFor = f.material.value;
        form.querySelector('.swatches').innerHTML = swatchesHtml(f.material.value, f.colorHex.value, f.colorName.value);
      };
      f.material.addEventListener('change', () => refreshSwatches());
      dlg.querySelector('[data-pick-color]').addEventListener('click', async () => {
        const c = await pickColor({ material: f.material.value, name: f.colorName.value, hex: f.colorHex.value });
        if (!c) return;
        f.colorName.value = c.name;
        f.colorHex.value = c.hex.toLowerCase();
        nameAuto = true;
        refreshSwatches(true);
      });
      f.purchaseWeight.addEventListener('input', priceHint);
      priceHint();
      let nameAuto = !s.colorName;
      const markSwatch = () => form.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hex === normHex(f.colorHex.value))));
      f.colorName.addEventListener('input', () => {
        nameAuto = false;
        const hex = colorHexFor(f.colorName.value);
        if (hex) {
          f.colorHex.value = hex;
          markSwatch();
        }
      });
      f.colorHex.addEventListener('input', () => {
        if (nameAuto || !f.colorName.value) {
          f.colorName.value = colorNameFor(f.colorHex.value);
          nameAuto = true;
        }
        markSwatch();
      });
      form.querySelector('.swatches').addEventListener('click', (e) => {
        const b = e.target.closest('.swatch');
        if (!b) return;
        f.colorHex.value = b.dataset.hex.toLowerCase();
        f.colorName.value = b.dataset.name;
        nameAuto = true;
        markSwatch();
      });
      f.gross.addEventListener('input', () => {
        if (f.gross.value !== '') f.netWeight.value = netFromGross(f.gross.value, tare());
      });
      f.netWeight.addEventListener('input', () => {
        if (f.netWeight.value !== '') f.gross.value = Number(f.netWeight.value) + tare();
      });
      f.spoolTypeId.addEventListener('change', () => {
        f.gross.value = Number(f.netWeight.value || 0) + tare();
      });
      f.purchaseWeight.addEventListener('input', () => {
        if (isNew && !f.opened.checked) {
          f.netWeight.value = f.purchaseWeight.value;
          f.gross.value = Number(f.purchaseWeight.value || 0) + tare();
        }
      });
      dlg.querySelector('[data-label]')?.addEventListener('click', () => openLabels([spool], app.settings));
      dlg.querySelector('[data-dup]')?.addEventListener('click', () => {
        dlg.close();
        spoolDialog(spool, { copy: true });
      });
      dlg.querySelector('[data-del]')?.addEventListener('click', () => {
        dlg.querySelector('.dlg-foot').innerHTML = `<span>Diese Spule wirklich löschen?</span><span class="spacer"></span>
          <button type="button" class="btn" data-close>Nein</button><button type="button" class="btn danger solid" data-confirm-del>Ja, löschen</button>`;
        dlg.querySelector('[data-confirm-del]').addEventListener('click', async () => {
          try {
            await app.backend.deleteSpool(spool.id);
            app.spools = app.spools.filter((x) => x.id !== spool.id);
            dlg.close();
            refreshView();
            toast(`${spoolLabel(spool)} gelöscht`);
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
      if (isNew) f.colorName.focus();
    },
    async onSubmit(form) {
      const f = form.elements;
      if (!f.material.value.trim()) throw new Error('Bitte eine Filamentart angeben.');
      // Neue Rollen ohne Preis bekommen den Preis aus der Preisliste
      const entry = listPrice(f.material.value, app.settings);
      const listed = isNew && !f.price.value.trim() && entry && Number(f.purchaseWeight.value) > 0
        ? listPriceForWeight(entry, Number(f.purchaseWeight.value)) : null;
      const data = {
        material: f.material.value.trim(),
        brand: f.brand.value,
        colorName: f.colorName.value,
        colorHex: f.colorHex.value,
        purchaseWeight: f.purchaseWeight.value,
        price: listed ?? f.price.value,
        boughtAt: f.boughtAt.value || undefined,
        netWeight: f.netWeight.value === '' ? f.purchaseWeight.value : f.netWeight.value,
        spoolTypeId: f.spoolTypeId.value,
        location: f.location.value,
        opened: f.opened.checked,
        inAms: f.inAms.checked,
        note: f.note.value,
      };
      if (isNew) {
        const count = Math.max(1, Math.min(50, Number(f.count.value) || 1));
        const created = await app.backend.createSpools(Array.from({ length: count }, () => data));
        app.spools.push(...created);
        toast(count > 1 ? `${count} Spulen angelegt` : `${spoolLabel(created[0])} angelegt`);
      } else {
        const updated = await app.backend.updateSpool(spool.id, data);
        app.spools = app.spools.map((x) => (x.id === updated.id ? updated : x));
        toast('Gespeichert');
      }
      refreshView();
    },
  });
}

// ---------------------------------------------------------------------------
// Dialog: Spule wiegen

// Gramm ändern: wiegen (mit Spule), Restgewicht direkt eintragen oder Verbrauch abziehen.
const WEIGH_MODES = {
  gross: { tab: 'Waage', label: 'Gewicht mit Spule laut Waage, in g', hint: 'Die Tara der Spulenart wird abgezogen.' },
  net: { tab: 'Restgewicht', label: 'Filament auf der Spule, in g', hint: 'Das Restgewicht wird direkt übernommen.' },
  used: { tab: 'Verbraucht', label: 'Verbraucht, in g', hint: 'Wird vom bisherigen Stand abgezogen.' },
};
let weighMode = 'gross';

function weighDialog(s) {
  const types = app.settings.spoolTypes;
  openDialog({
    title: 'Gramm ändern',
    body: `
      <div class="spool">${ring(s.colorHex, remainingShare(s))}<div class="txt"><div class="title">${esc(spoolLabel(s))}</div>
        <div class="sub">Kauf ${fmt(s.purchaseWeight)} g · bisher ${fmt(s.netWeight)} g · mit Spule ${fmt(grossOf(s, app.settings))} g</div></div></div>
      <div class="segmented" role="radiogroup" aria-label="Eingabe">
        ${Object.entries(WEIGH_MODES).map(([k, m]) => `<label><input type="radio" name="mode" value="${k}" ${k === weighMode ? 'checked' : ''}><span>${m.tab}</span></label>`).join('')}
      </div>
      <div class="fields">
        <label class="field scale-in full"><span data-label></span><input name="value" type="number" inputmode="numeric" min="0" step="1"></label>
        <label class="field full" data-type><span>Spulenart</span><select name="spoolTypeId">${types.map((t) => `<option value="${esc(t.id)}" ${t.id === s.spoolTypeId ? 'selected' : ''}>${esc(t.name)} (Tara ${fmt(t.tare)} g)</option>`).join('')}</select></label>
      </div>
      <div class="scale-out"><span class="small muted">Filament auf der Spule</span><span class="big" data-net>–</span><span class="small" data-diff></span></div>`,
    foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Speichern</button>',
    onReady(dlg, form) {
      const f = form.elements;
      const out = dlg.querySelector('[data-net]');
      const diff = dlg.querySelector('[data-diff]');
      const input = () => ({ [f.mode.value]: f.value.value, spoolTypeId: f.spoolTypeId.value });
      const update = () => {
        const m = WEIGH_MODES[f.mode.value];
        dlg.querySelector('[data-label]').textContent = m.label;
        dlg.querySelector('[data-type]').hidden = f.mode.value !== 'gross';
        f.value.placeholder = f.mode.value === 'gross' ? grossOf(s, app.settings) : f.mode.value === 'net' ? s.netWeight : '';
        if (f.value.value === '') {
          out.textContent = '–';
          diff.textContent = m.hint;
          return;
        }
        const { netWeight } = weightPatch(s, app.settings, input());
        const used = s.netWeight - netWeight;
        out.textContent = `${fmt(netWeight)} g`;
        if (netWeight > s.purchaseWeight) diff.textContent = `Mehr als das Kaufgewicht (${fmt(s.purchaseWeight)} g).${f.mode.value === 'gross' ? ' Stimmt die Spulenart?' : ''}`;
        else if (used > 0) diff.textContent = `${fmt(used)} g weniger als bisher.`;
        else if (used < 0) diff.textContent = `${fmt(-used)} g mehr als bisher.`;
        else diff.textContent = 'Unverändert.';
      };
      form.querySelector('.segmented').addEventListener('change', () => {
        weighMode = f.mode.value;
        f.value.value = '';
        update();
        f.value.focus();
      });
      f.value.addEventListener('input', update);
      f.spoolTypeId.addEventListener('change', update);
      update();
      f.value.focus();
    },
    async onSubmit(form) {
      const f = form.elements;
      if (f.value.value === '') throw new Error('Bitte eine Grammzahl eingeben.');
      const patch = weightPatch(s, app.settings, { [f.mode.value]: f.value.value, spoolTypeId: f.mode.value === 'gross' ? f.spoolTypeId.value : undefined });
      const updated = await app.backend.updateSpool(s.id, patch);
      app.spools = app.spools.map((x) => (x.id === updated.id ? updated : x));
      refreshView();
      toast(`${spoolLabel(updated)}: ${fmt(updated.netWeight)} g`);
    },
  });
}

function confirmDialog(text, okLabel, danger = false) {
  return new Promise((resolve) => {
    let ok = false;
    const dlg = openDialog({
      title: 'Bitte bestätigen',
      body: `<p>${text}</p>`,
      foot: `<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn ${danger ? 'danger solid' : 'primary'}">${okLabel}</button>`,
      onSubmit() {
        ok = true;
      },
    });
    dlg.addEventListener('close', () => resolve(ok));
  });
}

// ---------------------------------------------------------------------------
// Plätze: Pakete und AMS-Slots

function targetLabel(t) {
  if (t.kind === 'slot') return 'AMS ' + t.slot;
  if (t.kind === 'ams') return 'AMS';
  if (t.kind === 'place') return placeName(t.place);
  return 'ohne Platz';
}

const slotOccupant = (slot) => app.spools.find((s) => s.inAms && s.bambu.slot === slot);
const shortName = (s) => `${s.nr ? '#' + s.nr + ' ' : ''}${s.colorName || s.colorHex}`;

function nextPlaceName() {
  const nums = placeList(app.settings, app.spools).filter((p) => /^\d+$/.test(p)).map(Number);
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

// Verschiebt Spulen und meldet, wohin eine verdrängte Spule gewandert ist.
async function moveSpools(ids, target) {
  const moved = ids.map(findSpool).filter(Boolean);
  const res = await app.backend.moveSpools(ids, target);
  app.spools = res.spools;
  let msg = moved.length === 1 ? `${shortName(moved[0])} liegt jetzt in ${targetLabel(target)}` : `${moved.length} Spulen liegen jetzt in ${targetLabel(target)}`;
  if (res.swapped.length) {
    const other = findSpool(res.swapped[0]);
    msg += `, ${shortName(other)} dafür in ${spoolPlace(other).label}`;
  }
  toast(msg);
}

// Schnelle Platzwahl für eine Spule aus der Lagerliste.
function placeDialog(spool) {
  const cur = spoolPlace(spool);
  const same = (t) => t.kind === cur.kind && (t.kind !== 'slot' || t.slot === cur.slot) && (t.kind !== 'place' || t.place === cur.place);
  const pick = (t, label, sub) => `<button type="button" class="pick ${same(t) ? 'current' : ''}" data-target="${esc(JSON.stringify(t))}"><strong>${esc(label)}</strong><span>${sub}</span></button>`;
  const slots = amsSlots(app.settings, app.spools).map((slot) => {
    const occ = slotOccupant(slot);
    let sub = 'frei';
    if (occ && occ.id === spool.id) sub = 'hier';
    else if (occ) sub = `${ring(occ.colorHex, remainingShare(occ))}${esc(shortName(occ))}`;
    return pick({ kind: 'slot', slot }, slot, sub);
  }).join('');
  const places = placeList(app.settings, app.spools).map((p) => {
    const n = app.spools.filter((s) => !s.inAms && s.location === p).length;
    return pick({ kind: 'place', place: p }, placeName(p), `${n} ${n === 1 ? 'Spule' : 'Spulen'}`);
  }).join('');
  openDialog({
    title: 'Platz wählen',
    body: `
      <div class="spool">${ring(spool.colorHex, remainingShare(spool))}<div class="txt"><div class="title">${esc(spoolLabel(spool))}</div><div class="sub">Jetzt: ${esc(cur.label)}</div></div></div>
      <div class="pick-group"><h3>AMS</h3><div class="picks">${slots}${pick({ kind: 'ams' }, 'Im AMS', 'ohne Slot')}</div>
        <p class="small muted">Ist der Slot belegt, tauschen die beiden Spulen den Platz.</p></div>
      <div class="pick-group"><h3>Lager</h3><div class="picks">${places}${pick({ kind: 'none' }, 'Ohne Platz', 'nicht einsortiert')}</div></div>
      <div class="pick-group"><h3>Neues Paket</h3><div class="new-place">
        <input name="newPlace" value="${esc(nextPlaceName())}" aria-label="Name des neuen Pakets">
        <button type="submit" class="btn">${icons.plus}Anlegen und hineinlegen</button></div></div>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Schließen</button>',
    onReady(dlg) {
      dlg.querySelector('.dlg-body').addEventListener('click', (e) => {
        const b = e.target.closest('[data-target]');
        if (!b) return;
        run(async () => {
          await moveSpools([spool.id], JSON.parse(b.dataset.target));
          dlg.close();
          refreshView();
        });
      });
    },
    async onSubmit(form) {
      const name = form.elements.newPlace.value.trim();
      if (!name) throw new Error('Bitte einen Namen für das Paket angeben.');
      app.settings = (await app.backend.places({ action: 'add', name })).settings;
      await moveSpools([spool.id], { kind: 'place', place: name });
      refreshView();
    },
  });
}

function renderPlaces() {
  $view.innerHTML = `
    <section class="places-intro">
      <div><h2>Plätze</h2><p class="small muted">Spulen antippen, dann beim Paket oder AMS-Slot auf „Hierher“ tippen. Am Rechner geht auch Ziehen und Ablegen.</p></div>
      <button class="btn" type="button" data-action="place-add">${icons.plus}Paket</button>
    </section>
    <div id="board"></div>
    <div class="movebar" id="movebar" hidden></div>`;
  updatePlaces();
}

function chipHtml(s) {
  return `<button type="button" class="spool-chip" draggable="true" data-chip-id="${esc(s.id)}" aria-pressed="${app.selected.has(s.id)}">`
    + `${ring(s.colorHex, remainingShare(s))}<span class="txt"><span class="name"><span class="nr">#${s.nr ?? '–'}</span>${esc(s.colorName || s.colorHex)}</span>`
    + `<span class="meta">${esc(s.material)} · ${fmt(s.netWeight)} g</span></span></button>`;
}

function dropButton(target) {
  if (!app.selected.size) return '';
  return `<button type="button" class="btn small primary" data-drop="${esc(JSON.stringify(target))}">Hierher</button>`;
}

function updatePlaces() {
  const board = document.getElementById('board');
  if (!board) return;
  for (const id of app.selected) if (!findSpool(id)) app.selected.delete(id);
  const selecting = app.selected.size > 0;
  const slotTiles = amsSlots(app.settings, app.spools).map((slot) => {
    const occ = slotOccupant(slot);
    const t = { kind: 'slot', slot };
    return `<div class="slot-box ${occ ? '' : 'free'}" data-drop-zone="${esc(JSON.stringify(t))}">
      <div class="box-head"><span class="slot-id">${esc(slot)}</span><span class="spacer"></span>${dropButton(t)}</div>
      ${occ ? chipHtml(occ) : '<span class="small muted">frei</span>'}</div>`;
  }).join('');
  const loose = app.spools.filter((s) => s.inAms && !s.bambu.slot);
  const inAms = app.spools.filter((s) => s.inAms).length;
  const amsBox = `<section class="box">
    <div class="box-head"><h3>AMS</h3><span class="small muted">${inAms} ${inAms === 1 ? 'Spule' : 'Spulen'}</span></div>
    <div class="slot-grid">${slotTiles}</div>
    <div class="sub-zone" data-drop-zone="${esc(JSON.stringify({ kind: 'ams' }))}">
      <div class="box-head"><span class="small">Im AMS, Slot unbekannt</span><span class="spacer"></span>${dropButton({ kind: 'ams' })}</div>
      <div class="chips-wrap">${loose.map(chipHtml).join('') || '<span class="small muted">keine</span>'}</div>
    </div></section>`;
  const placeBoxes = placeList(app.settings, app.spools).map((p) => {
    const list = app.spools.filter((s) => !s.inAms && s.location === p);
    const t = { kind: 'place', place: p };
    return `<section class="box" data-drop-zone="${esc(JSON.stringify(t))}">
      <div class="box-head"><h3>${esc(placeName(p))}</h3><span class="small muted">${list.length} · ${fmtKg(list.reduce((a, s) => a + s.netWeight, 0))} kg</span>
        <span class="spacer"></span>${dropButton(t)}
        <button type="button" class="icon-btn" data-action="place-edit" data-place="${esc(p)}" aria-label="${esc(placeName(p))} umbenennen">${icons.edit}</button></div>
      <div class="chips-wrap">${list.map(chipHtml).join('') || '<span class="small muted">leer</span>'}</div></section>`;
  }).join('');
  const none = app.spools.filter((s) => !s.inAms && !s.location);
  const noneBox = none.length || selecting ? `<section class="box" data-drop-zone="${esc(JSON.stringify({ kind: 'none' }))}">
      <div class="box-head"><h3>Ohne Platz</h3><span class="small muted">${none.length}</span><span class="spacer"></span>${dropButton({ kind: 'none' })}</div>
      <div class="chips-wrap">${none.map(chipHtml).join('') || '<span class="small muted">leer</span>'}</div></section>` : '';
  board.innerHTML = `${amsBox}<div class="boxes">${placeBoxes}${noneBox}</div>`;
  board.classList.toggle('selecting', selecting);
  const bar = document.getElementById('movebar');
  bar.hidden = !selecting;
  document.body.classList.toggle('has-movebar', selecting);
  bar.innerHTML = selecting ? `<div class="wrap movebar-in"><span><strong>${app.selected.size}</strong> ${app.selected.size === 1 ? 'Spule' : 'Spulen'} ausgewählt. Jetzt beim Ziel auf „Hierher“ tippen.</span>
    <button class="btn small" type="button" data-action="select-clear">Auswahl aufheben</button></div>` : '';
}

async function dropOn(ids, target) {
  await moveSpools(ids, target);
  app.selected.clear();
  updatePlaces();
}

function placeAddDialog() {
  const n = app.selected.size;
  openDialog({
    title: 'Neues Paket',
    body: `<label class="field"><span>Name oder Nummer</span><input name="name" value="${esc(nextPlaceName())}" required></label>
      <p class="small muted">Eine reine Zahl wird als „Paket 7“ angezeigt.${n ? ` Die ${n} ausgewählten Spulen kommen direkt hinein.` : ''}</p>`,
    foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Anlegen</button>',
    async onSubmit(form) {
      const name = form.elements.name.value.trim();
      app.settings = (await app.backend.places({ action: 'add', name })).settings;
      if (app.selected.size) await dropOn([...app.selected], { kind: 'place', place: name });
      else {
        updatePlaces();
        toast(`${placeName(name)} angelegt`);
      }
    },
  });
}

function placeEditDialog(place) {
  const count = app.spools.filter((s) => !s.inAms && s.location === place).length;
  openDialog({
    title: esc(placeName(place)),
    body: `<label class="field"><span>Name oder Nummer</span><input name="name" value="${esc(place)}" required></label>
      <p class="small muted">Heißt schon ein anderes Paket so, werden beide zusammengelegt.${count ? '' : ' Das Paket ist leer und kann entfernt werden.'}</p>`,
    foot: `${count ? '' : `<button type="button" class="btn danger" data-remove>${icons.trash}Entfernen</button>`}<span class="spacer"></span>
      <button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`,
    onReady(dlg) {
      dlg.querySelector('[data-remove]')?.addEventListener('click', () => run(async () => {
        const res = await app.backend.places({ action: 'remove', name: place });
        Object.assign(app, { settings: res.settings, spools: res.spools });
        dlg.close();
        updatePlaces();
        toast(`${placeName(place)} entfernt`);
      }));
    },
    async onSubmit(form) {
      const to = form.elements.name.value.trim();
      if (to === place) return;
      const res = await app.backend.places({ action: 'rename', name: place, to });
      Object.assign(app, { settings: res.settings, spools: res.spools });
      updatePlaces();
      toast(`Umbenannt in ${placeName(to)}`);
    },
  });
}

// ---------------------------------------------------------------------------
// AMS & Bambu

function renderBambu() {
  if (app.backend.mode !== 'server') {
    $view.innerHTML = `<section class="panel">
      <div class="panel-head"><h2>Bambu-Anbindung braucht den Lager-Server</h2></div>
      <p>Diese Seite läuft gerade ohne Server, deshalb liegen die Daten nur in diesem Browser. Für die Verbindung mit dem Bambu Filament Manager und die AMS-Live-Anzeige muss das Filament-Lager auf einem Rechner im Heimnetz laufen (Mac, Raspberry Pi oder NAS):</p>
      <ol class="steps">
        <li>Node.js 20 oder neuer installieren (nodejs.org).</li>
        <li>Im Projektordner <code>npm install</code> und dann <code>npm start</code> ausführen.</li>
        <li><code>http://localhost:3000</code> öffnen. Am Handy die Adresse verwenden, die beim Start angezeigt wird.</li>
        <li>Den aktuellen Bestand vorher unter Einstellungen als Sicherung (JSON) exportieren und dort wieder importieren.</li>
      </ol></section>`;
    return;
  }
  $view.innerHTML = '<div class="empty-state">Bambu-Status wird geladen …</div>';
  app.backend.bambu().then((b) => {
    app.bambu = b;
    if (app.view !== 'bambu') return;
    $view.innerHTML = `<section class="panel" id="printers"></section>
      <section class="grid-2"><div class="panel" id="cloud"></div><div class="panel" id="setup"></div></section>`;
    updateCloud();
    updatePrinters(true);
    updateSetup();
  }).catch((err) => {
    $view.innerHTML = `<div class="note crit">Bambu-Status nicht verfügbar: ${esc(err.message)}</div>`;
  });
}

function regionSelect(value = 'global') {
  return `<select name="region"><option value="global" ${value === 'global' ? 'selected' : ''}>Global / Europa</option><option value="china" ${value === 'china' ? 'selected' : ''}>China</option></select>`;
}

function updateCloud() {
  const el = document.getElementById('cloud');
  if (!el) return;
  const c = app.bambu.cloud;
  const head = '<div class="panel-head"><h2>Bambu Filament Manager</h2><p>Spulenliste aus Bambu Studio und Bambu Handy</p></div>';
  if (c.connected) {
    el.innerHTML = `${head}
      <div class="status-line"><span><span class="dot ok"></span>Verbunden${c.account ? ' als ' + esc(c.account) : ''}</span><span>Region ${c.region === 'china' ? 'China' : 'Global'}</span></div>
      <div class="status-line"><span>Zuletzt geholt: ${esc(timeAgo(c.lastPullAt))}</span><span>Zuletzt gesendet: ${esc(timeAgo(c.lastPushAt))}</span></div>
      ${c.lastError ? `<div class="note crit">${esc(c.lastError)}</div>` : ''}
      <label class="switch"><input type="checkbox" data-option="autoSync" ${app.bambu.options.autoSync ? 'checked' : ''}><span>Automatisch von Bambu holen<small>Alle 10 Minuten und beim Öffnen der Seite: neue Spulen aus dem Filament Manager, Zuordnungen und Restgewichte nach dem Drucken. Gewogene Werte bleiben erhalten, gelöscht wird nichts.</small></span></label>
      <label class="switch"><input type="checkbox" data-option="cloudAms" ${app.bambu.options.cloudAms ? 'checked' : ''}><span>AMS live über das Bambu-Konto<small>Zeigt die AMS-Slots deiner Drucker ohne IP-Adresse an, auch wenn das Lager auf einem Webserver läuft.${c.devices ? ` ${c.devices} Drucker im Konto gefunden.` : ''}</small></span></label>
      <div class="actions">
        <button class="btn" type="button" data-action="pull">${icons.down}Jetzt holen (mit Vorschau)</button>
        <button class="btn" type="button" data-action="push">${icons.up}Nach Bambu senden</button>
      </div>
      <div class="actions"><button class="btn small ghost" type="button" data-action="logout">Abmelden</button></div>`;
    return;
  }
  if (c.pending) {
    el.innerHTML = `${head}
      <form class="fields" data-form="code">
        <p class="full">${c.pending.status === 'tfa'
    ? 'Bitte den Code aus der Authenticator-App eingeben.'
    : `Bambu hat einen Bestätigungscode an <strong>${esc(c.pending.account)}</strong> geschickt.`}</p>
        <label class="field"><span>Code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>
        <div class="actions full"><button class="btn primary" type="submit">Anmelden</button><button class="btn ghost" type="button" data-action="logout">Abbrechen</button></div>
      </form>`;
    el.querySelector('[name="code"]').focus();
    return;
  }
  el.innerHTML = `${head}
    ${c.lastError ? `<div class="note crit">${esc(c.lastError)}</div>` : ''}
    <form class="fields" data-form="login">
      <label class="field full"><span>E-Mail des Bambu-Kontos</span><input name="account" type="email" autocomplete="username" required></label>
      <label class="field full"><span>Passwort (optional)</span><input name="password" type="password" autocomplete="current-password">
        <small class="muted">Leer lassen, wenn du dich bei Bambu mit Google oder Apple anmeldest. Dann schickt Bambu einen Code an diese E-Mail-Adresse.</small></label>
      <label class="field"><span>Region</span>${regionSelect(c.region)}</label>
      <div class="actions full"><button class="btn primary" type="submit">Mit Bambu verbinden</button></div>
    </form>
    <p class="small muted">Gespeichert wird nur der Anmelde-Token von Bambu (in <code>data/lager.json</code> auf diesem Rechner), nie das Passwort.</p>
    <details><summary>Token von Hand eintragen</summary>
      <form class="fields" data-form="token">
        <ol class="steps full small">
          <li>In Chrome <code>bambulab.com</code> öffnen und wie gewohnt anmelden, auch mit Google.</li>
          <li>Entwicklertools öffnen (Mac: <kbd>⌥ ⌘ I</kbd>), Reiter „Application“, links „Cookies“ und dann <code>https://bambulab.com</code>.</li>
          <li>Den Wert in der Zeile <code>token</code> kopieren und hier einfügen.</li>
        </ol>
        <label class="field full"><span>Token</span><input name="token" autocomplete="off" required></label>
        <label class="field"><span>Region</span>${regionSelect(c.region)}</label>
        <div class="actions full"><button class="btn" type="submit">Token speichern</button></div>
      </form>
    </details>`;
}

const GCODE_TEXT = { IDLE: 'Bereit', RUNNING: 'Druckt', PREPARE: 'Bereitet vor', PAUSE: 'Pausiert', FINISH: 'Druck fertig', FAILED: 'Druck abgebrochen', SLICING: 'Slict' };
const STATUS = {
  verbunden: ['ok', 'Verbunden'], verbinde: ['warn', 'Verbinde …'], getrennt: ['warn', 'Getrennt, neuer Versuch läuft'],
  fehler: ['crit', 'Fehler'], aus: ['', 'Aus'],
};

function linkedSpool(printer, tray) {
  return app.spools.find((s) => (tray.rfid && s.bambu.rfid === tray.rfid) || (s.bambu.printerId === printer.id && s.bambu.slot === tray.slot));
}

function slotHtml(printer, t) {
  if (t.empty) return `<div class="slot empty"><span class="slot-id">${esc(t.slot)}</span><span class="small">leer</span></div>`;
  const linked = linkedSpool(printer, t);
  const share = t.remainPct !== null ? t.remainPct / 100 : linked ? remainingShare(linked) : 1;
  // Passende Spulen zuerst: gleicher Filamenttyp, dann ähnlichste Farbe.
  const candidates = app.spools.filter((s) => s !== linked).sort((a, b) =>
    (filamentTypeOf(b.material) === t.type) - (filamentTypeOf(a.material) === t.type)
    || colorDistance(a.colorHex, t.colorHex) - colorDistance(b.colorHex, t.colorHex));
  const options = [...(linked ? [linked] : []), ...candidates.slice(0, 40)].map((s) => `<option value="${esc(s.id)}" ${linked && linked.id === s.id ? 'selected' : ''}>#${s.nr ?? '–'} ${esc(s.colorName || s.colorHex)} · ${esc(s.material)} · ${fmt(s.netWeight)} g${s.location ? ' · Ort ' + esc(s.location) : ''}</option>`).join('');
  return `<div class="slot ${t.active ? 'active' : ''}" data-printer="${esc(printer.id)}" data-slot="${esc(t.slot)}">
    <div class="slot-top">${ring(t.colorHex || '#9AA0A6', share)}<div class="txt">
      <div class="slot-id">${esc(t.slot)}${t.active ? ' · druckt' : ''}</div>
      <div class="title">${esc(t.colorName || t.colorHex)}</div>
      <div class="small muted">${esc(t.name)}</div></div></div>
    <div class="pills">${t.rfid ? '<span class="pill">RFID</span>' : ''}${t.remainPct !== null ? `<span class="pill">${t.remainPct} %${t.estimatedNet !== null ? ' · ca. ' + fmt(t.estimatedNet) + ' g' : ''}</span>` : ''}</div>
    ${linked ? `<div class="linked">Im Lager: <strong>${esc(linked.colorName || linked.colorHex)}</strong>, ${fmt(linked.netWeight)} g</div>` : ''}
    <select data-link aria-label="Lagerspule für Slot ${esc(t.slot)}"><option value="">${linked ? 'Zuordnung lösen' : 'Lagerspule zuordnen …'}</option>${options}</select>
    <div class="actions">
      ${linked ? '' : `<button class="btn small" type="button" data-action="ams-create">${icons.plus}Als neue Spule anlegen</button>`}
      ${linked && t.remainPct !== null ? `<button class="btn small" type="button" data-action="ams-weight" data-spool="${esc(linked.id)}">Füllstand übernehmen</button>` : ''}
    </div>
  </div>`;
}

function printerHtml(p) {
  const [dot, label] = STATUS[p.status] || STATUS.aus;
  const g = p.gcodeState ? (GCODE_TEXT[p.gcodeState] || p.gcodeState) : '';
  const job = p.gcodeState === 'RUNNING' || p.gcodeState === 'PAUSE'
    ? `${g}: ${esc(p.job || 'Druckauftrag')}${p.progress !== null ? ` (${p.progress} %)` : ''}` : esc(g);
  return `<div class="printer">
    <div class="status-line"><strong>${esc(p.name)}</strong><span><span class="dot ${dot}"></span>${label}</span><span class="muted">${p.kind === 'cloud' ? 'über Bambu-Konto' : 'im Heimnetz'}</span>${job ? `<span>${job}</span>` : ''}</div>
    ${p.error ? `<div class="note crit">${esc(p.error)}</div>` : ''}
    ${p.units.map((u) => `<div class="ams-unit"><div class="unit-head"><strong>${esc(u.label)}</strong>${u.humidity !== null ? `<span>Luftfeuchte ${u.humidity} %</span>` : ''}${u.temp !== null ? `<span>${u.temp} °C</span>` : ''}</div>
      <div class="slots">${u.slots.map((t) => slotHtml(p, t)).join('')}</div></div>`).join('')}
    ${p.external.length ? `<div class="ams-unit"><div class="unit-head"><strong>Externe Spule</strong></div><div class="slots">${p.external.map((t) => slotHtml(p, t)).join('')}</div></div>` : ''}
    ${p.status === 'verbunden' && !p.units.length && !p.external.length ? '<p class="small muted">Verbunden, warte auf AMS-Daten …</p>' : ''}
  </div>`;
}

function updatePrinters(force = false) {
  const el = document.getElementById('printers');
  if (!el) return;
  // Nicht neu zeichnen, während eine Auswahl offen ist.
  if (!force && el.contains(document.activeElement) && document.activeElement.matches('select')) return;
  const sig = JSON.stringify([app.bambu.printers, app.bambu.options, app.spools.map((s) => [s.id, s.netWeight, s.colorName, s.bambu.slot, s.bambu.rfid])],
    (k, v) => (k === 'lastSeen' ? undefined : v));
  if (!force && sig === app.printersSig) return;
  app.printersSig = sig;
  const o = app.bambu.options;
  const ps = app.bambu.printers;
  el.innerHTML = `<div class="panel-head"><h2>AMS live</h2><p>${ps.length ? 'Aktualisiert sich automatisch' : ''}</p></div>
    ${ps.length ? ps.map(printerHtml).join('') : `<p class="muted">${app.bambu.cloud.connected ? 'Im Bambu-Konto wurde noch kein Drucker gefunden oder „AMS live über das Bambu-Konto“ ist aus.' : 'Melde dich unten bei Bambu an, dann erscheinen deine Drucker hier automatisch mit Farbe und Füllstand jedes AMS-Slots.'}</p>`}
    <div class="grid-2">
      <label class="switch"><input type="checkbox" data-option="autoAms" ${o.autoAms ? 'checked' : ''}><span>„Im AMS“ automatisch setzen<small>Erkennt Bambu-Spulen per RFID und Spulen, die du einem Slot zugeordnet hast. Wird der Slot leer, gilt die Spule wieder als im Lager.</small></span></label>
      <label class="switch"><input type="checkbox" data-option="amsWeights" ${o.amsWeights ? 'checked' : ''}><span>Restgewicht aus dem AMS übernehmen<small>Nur Bambu-Spulen mit RFID. Das AMS meldet grobe Prozentwerte und überschreibt gewogene Werte.</small></span></label>
      <label class="switch"><input type="checkbox" data-option="autoBook" ${o.autoBook ? 'checked' : ''}><span>Filament bei Druckende abbuchen<small>Zieht nach jedem fertigen Druck die Gramm je Slot von der Rolle im AMS ab, für Drucke ab dem Einschalten. Rollen, die der Bambu Filament Manager oder das AMS schon zählt, bleiben unberührt. Unter „Drucke“ steht, was abgebucht wurde, mit „Rückgängig“.</small></span></label>
    </div>`;
}

function updateSetup() {
  const el = document.getElementById('setup');
  if (!el) return;
  const ps = app.bambu.printers.filter((p) => p.kind !== 'cloud');
  el.innerHTML = `<div class="panel-head"><h2>Drucker im Heimnetz</h2><p>Optional</p></div>
    <p class="small muted">Nur nötig, wenn das Lager im selben Netz wie der Drucker läuft (Mac, Raspberry Pi) und ohne Bambu-Konto verbunden werden soll. Mit Bambu-Anmeldung erscheinen die Drucker automatisch.</p>
    ${ps.map((p) => `<div class="status-line"><strong>${esc(p.name)}</strong><span class="num">${esc(p.host)}</span><span class="num">${esc(p.serial)}</span>
      <button class="btn small ghost danger" type="button" data-action="printer-delete" data-id="${esc(p.id)}">Entfernen</button></div>`).join('')}
    <details><summary>Drucker im Heimnetz eintragen</summary>
    <form class="fields" data-form="printer">
      <label class="field"><span>Name</span><input name="name" placeholder="z. B. P1S Werkstatt"></label>
      <label class="field"><span>IP-Adresse</span><input name="host" inputmode="decimal" placeholder="192.168.178.50" required></label>
      <label class="field"><span>Seriennummer</span><input name="serial" autocapitalize="characters" placeholder="01P00A…" required></label>
      <label class="field"><span>Zugangscode (LAN)</span><input name="accessCode" autocomplete="off" placeholder="8 Zeichen" required></label>
      <div class="actions full"><button class="btn primary" type="submit">Drucker verbinden</button></div>
    </form>
    <details><summary>Wo finde ich diese Angaben?</summary>
      <ol class="steps">
        <li>IP-Adresse und Zugangscode: am Drucker unter Einstellungen bei WLAN bzw. Netzwerk.</li>
        <li>Seriennummer: in Bambu Studio unter Gerät, oder auf dem Aufkleber am Drucker.</li>
        <li>Der Drucker muss im selben Netz sein wie der Rechner, auf dem das Filament-Lager läuft.</li>
        <li>Je nach Firmware muss am Drucker der LAN-Modus bzw. Entwicklermodus aktiv sein, damit andere Programme den Status lesen dürfen.</li>
      </ol>
    </details>
    </details>`;
}

const PULL_KINDS = { new: 'Neu im Lager', link: 'Verknüpfen', update: 'Aktualisieren' };
const PUSH_KINDS = { create: 'Neu in Bambu', link: 'Verknüpfen', update: 'Aktualisieren' };

function changeText(ch) {
  const v = (x) => {
    if (typeof x === 'boolean') return x ? 'ja' : 'nein';
    if (typeof x === 'number') return fmt(x) + ' g';
    return x === '' || x === null || x === undefined ? '–' : esc(x);
  };
  return `${esc(ch.label)}: ${v(ch.from)} → ${v(ch.to)}`;
}

async function syncDialog(direction) {
  const pull = direction === 'pull';
  const preview = pull ? await app.backend.pullPreview() : await app.backend.pushPreview();
  if (!preview.items.length) {
    toast(pull ? 'Alles aktuell. Bambu hat keine Änderungen.' : 'Alles aktuell. Es gibt nichts zu senden.');
    return;
  }
  const kinds = pull ? PULL_KINDS : PUSH_KINDS;
  const items = preview.items.map((it) => {
    const ref = it.local || it.cloud;
    const how = it.how === 'rfid' ? 'per RFID erkannt' : it.how === 'soft' ? 'gleiche Spule gefunden' : '';
    let detail = it.changes.map(changeText).join(' · ');
    if (!detail && it.kind === 'new') detail = `${esc(it.cloud.material)}${it.cloud.brand ? ' · ' + esc(it.cloud.brand) : ''} · ${fmt(it.cloud.netWeight)} g`;
    if (!detail && it.kind === 'create') detail = `${esc(it.local.material)} · ${fmt(it.local.netWeight)} g${it.local.location ? ' · Ort ' + esc(it.local.location) : ''}`;
    if (!detail) detail = 'Nur verknüpfen, keine Änderungen';
    return `<label class="sync-item"><input type="checkbox" name="key" value="${esc(it.key)}" checked>${ring(ref.colorHex || '#9AA0A6', 1)}
      <div><div><span class="kind">${kinds[it.kind]}</span><strong>${esc(ref.colorName || ref.colorHex)}</strong> <span class="small muted">${esc(ref.material)}${how ? ' · ' + how : ''}</span></div>
      <div class="chg">${detail}</div></div></label>`;
  }).join('');
  openDialog({
    title: pull ? 'Von Bambu holen' : 'Nach Bambu senden',
    body: `<p class="small muted">${preview.cloudCount} Spulen im Bambu Filament Manager. ${pull
      ? 'Ausgewählte Punkte werden ins Lager übernommen.' : 'Ausgewählte Punkte werden im Filament Manager angelegt oder geändert.'}</p>
      <div class="actions"><button type="button" class="btn small" data-all>Alle auswählen</button><button type="button" class="btn small" data-none>Keine</button></div>
      <div class="sync-list">${items}</div>`,
    foot: `<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">${pull ? 'Ins Lager übernehmen' : 'An Bambu senden'}</button>`,
    onReady(dlg) {
      dlg.querySelector('[data-all]').addEventListener('click', () => dlg.querySelectorAll('[name="key"]').forEach((i) => { i.checked = true; }));
      dlg.querySelector('[data-none]').addEventListener('click', () => dlg.querySelectorAll('[name="key"]').forEach((i) => { i.checked = false; }));
    },
    async onSubmit(form) {
      const keys = [...form.querySelectorAll('[name="key"]:checked')].map((i) => i.value);
      if (!keys.length) throw new Error('Nichts ausgewählt.');
      const res = pull ? await app.backend.pull(keys) : await app.backend.push(keys);
      app.spools = res.spools;
      app.bambu = await app.backend.bambu();
      updateCloud();
      updatePrinters(true);
      const r = res.result;
      toast(pull ? `${r.created} neu im Lager, ${r.updated} aktualisiert` : `${r.created} in Bambu angelegt, ${r.updated} aktualisiert`);
      if (r.errors && r.errors.length) toast(`${r.errors.length} Fehler: ${r.errors[0]}`, 'error');
    },
  });
}

// ---------------------------------------------------------------------------
// Einstellungen

function typeRow(t) {
  return `<div class="type-row">
    <input name="typeName" value="${esc(t.name)}" aria-label="Name der Spulenart" required>
    <input name="typeTare" type="number" inputmode="numeric" min="0" step="1" value="${t.tare}" aria-label="Tara in g">
    <button type="button" class="icon-btn" data-action="type-remove" aria-label="Spulenart entfernen">${icons.trash}</button>
    <input type="hidden" name="typeId" value="${esc(t.id)}">
  </div>`;
}

const dec = (v) => esc(String(v).replace('.', ','));

function shipRow(x) {
  return `<div class="ship-row">
    <input name="shipName" value="${esc(x.name)}" aria-label="Versandart" placeholder="z. B. DHL Päckchen">
    <input name="shipPrice" inputmode="decimal" value="${x.name ? x.price.toFixed(2).replace('.', ',') : ''}" aria-label="Preis für den Kunden in €" placeholder="Preis">
    <input name="shipCost" inputmode="decimal" value="${x.name ? x.cost.toFixed(2).replace('.', ',') : ''}" aria-label="Porto, das du zahlst, in €" placeholder="Porto">
    <button type="button" class="icon-btn" data-action="ship-remove" aria-label="Versandart entfernen">${icons.trash}</button>
  </div>`;
}

function renderSettings() {
  const server = app.backend.mode === 'server';
  $view.innerHTML = `<section class="grid-2">
    <div class="panel">
      <div class="panel-head"><h2>Spulen, Preise und AMS</h2><p>Tara ist das Leergewicht der Spule und wird beim Wiegen abgezogen</p></div>
      <form data-form="settings" class="types">
        <div class="type-row small muted"><span>Name</span><span>Tara in g</span><span></span></div>
        <div class="types" data-types>${app.settings.spoolTypes.map(typeRow).join('')}</div>
        <div class="actions"><button type="button" class="btn small" data-action="type-add">${icons.plus}Spulenart</button></div>
        <label class="field"><span>Als knapp markieren, wenn weniger übrig ist als</span><select name="lowStockPart">${[3, 4, 5, 6, 8, 10].map((n) => `<option value="${n}" ${n === app.settings.lowStockPart ? 'selected' : ''}>1/${n} des Kaufgewichts (bei 1.000 g: ${fmt(1000 / n)} g, bei 250 g: ${fmt(250 / n)} g)</option>`).join('')}</select></label>
        <h3>Preisrechnung</h3>
        <label class="field"><span>Standardpreis pro kg, wenn weder die Rolle noch die Preisliste einen Preis hat (€)</span><input name="pricePerKg" inputmode="decimal" value="${dec(app.settings.pricePerKg)}"><small class="muted">Preise je Filamentart stehen im Reiter „Preisliste“.</small></label>
        <div class="fields">
          <label class="field"><span>Strompreis (€ pro kWh)</span><input name="energyPrice" inputmode="decimal" value="${dec(app.settings.energyPrice)}"></label>
          <label class="field"><span>Drucker-Leistung beim Drucken (W)</span><input name="printerWatts" inputmode="numeric" value="${app.settings.printerWatts}"></label>
          <label class="field"><span>Drucker pro Druckstunde (€)</span><input name="machineRate" inputmode="decimal" value="${dec(app.settings.machineRate)}"><small class="muted">Abnutzung, Düsen, Platten, Ersatzteile</small></label>
          <label class="field"><span>Fehldrucke (% auf Filament und Strom)</span><input name="failPct" inputmode="decimal" value="${dec(app.settings.failPct)}"></label>
          <label class="field"><span>Arbeitszeit pro Auftrag (Min.)</span><input name="laborMinutes" inputmode="decimal" value="${dec(app.settings.laborMinutes)}"><small class="muted">slicen, abnehmen, nacharbeiten, verpacken</small></label>
          <label class="field"><span>Stundenlohn (€)</span><input name="laborRate" inputmode="decimal" value="${dec(app.settings.laborRate)}"></label>
          <label class="field"><span>Gewinn (% auf die Selbstkosten)</span><input name="profitPct" inputmode="decimal" value="${dec(app.settings.profitPct)}"></label>
          <label class="field"><span>Mindestpreis pro Beleg (€)</span><input name="minPrice" inputmode="decimal" value="${dec(app.settings.minPrice)}"></label>
          <label class="field"><span>Standard-Infill für die Schätzung (%)</span><input name="defaultInfill" inputmode="decimal" value="${dec(app.settings.defaultInfill)}"><small class="muted">für STL-Dateien ohne Gramm aus Bambu Studio, im Rechner änderbar</small></label>
          <label class="field"><span>Preis pro Teil aufrunden auf</span><select name="roundTo">${[[0, 'nicht runden'], [0.1, '0,10 € (3,13 € → 3,20 €)'], [0.5, '0,50 € (3,13 € → 3,50 €)'], [1, '1,00 € (3,13 € → 4,00 €)']].map(([v, l]) => `<option value="${v}" ${v === app.settings.roundTo ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Mengenrabatt ab (Stück)</span><input name="discountQty" inputmode="numeric" value="${app.settings.discountQty}"><small class="muted">gleiche Teile in einer Position</small></label>
          <label class="field"><span>Mengenrabatt (%)</span><input name="discountPct" inputmode="decimal" value="${dec(app.settings.discountPct)}"><small class="muted">0 = kein Rabatt, nie unter die Selbstkosten</small></label>
        </div>
        <h3>Versandarten</h3>
        <p class="small muted">Im Verkauf über „Versand“ als feste Position in den Beleg. Preis = was der Kunde zahlt, Porto = was du bezahlst. Versand zählt nicht zum Mindestpreis.</p>
        <div class="ship-row small muted"><span>Name</span><span>Preis €</span><span>Porto €</span><span></span></div>
        <div data-ship>${app.settings.shipping.map(shipRow).join('')}</div>
        <div class="actions"><button type="button" class="btn small" data-action="ship-add">${icons.plus}Versandart</button></div>
        <h3>Lieferung ohne Post</h3>
        <p class="small muted">Wenn du selbst vorbeibringst: Grundpreis + gefahrene km × Preis pro km, aufgerundet wie die Teilepreise. Die Entfernung berechnet das Lager von deiner Adresse zum Kunden über OpenStreetMap. Abholung ist immer kostenlos.</p>
        <div class="fields">
          <label class="field full"><span>Deine Adresse (Start der Fahrt)</span><textarea name="homeAddress" rows="2" placeholder="Straße Nr., PLZ Ort">${esc(app.settings.homeAddress)}</textarea><small class="muted">geht nur an OpenStreetMap, um die Strecke zu berechnen</small></label>
          <label class="field"><span>Preis pro km für den Kunden (€)</span><input name="kmRate" inputmode="decimal" value="${app.settings.kmRate.toFixed(2).replace('.', ',')}"></label>
          <label class="field"><span>Deine Kosten pro km (€)</span><input name="kmCost" inputmode="decimal" value="${app.settings.kmCost.toFixed(2).replace('.', ',')}"><small class="muted">Sprit und Auto; 0,30 € ist die steuerliche Pauschale</small></label>
          <label class="field"><span>Grundpreis pro Lieferung (€)</span><input name="deliveryPrice" inputmode="decimal" value="${app.settings.deliveryPrice.toFixed(2).replace('.', ',')}"><small class="muted">0 = nur die km</small></label>
          <label class="switch"><input type="checkbox" name="roundTrip" ${app.settings.roundTrip ? 'checked' : ''}><span>Hin- und Rückfahrt berechnen</span></label>
        </div>
        <h3>Beleg, Angebot und Strom</h3>
        <div class="fields">
          <label class="field"><span>Dein Name auf dem Beleg</span><input name="sellerName" value="${esc(app.settings.sellerName)}" autocomplete="name"></label>
          <label class="field"><span>Wer zahlt den Strom?</span><input name="powerPayee" value="${esc(app.settings.powerPayee)}"></label>
          <label class="field full"><span>Adresse oder Kontakt auf dem Beleg (optional)</span><textarea name="sellerAddress" rows="3">${esc(app.settings.sellerAddress)}</textarea></label>
          <label class="field"><span>Angebote gelten (Tage)</span><input name="offerDays" inputmode="numeric" value="${app.settings.offerDays}"></label>
        </div>
        <label class="switch"><input type="checkbox" name="smallBusiness" ${app.settings.smallBusiness ? 'checked' : ''}><span>Kleinunternehmer<small>Druckt „Gemäß § 19 UStG wird keine Umsatzsteuer berechnet“ auf den Beleg.</small></span></label>
        <h3>AMS</h3>
        <label class="field"><span>Anzahl AMS-Einheiten (je 4 Slots)</span><select name="amsUnits">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === app.settings.amsUnits ? 'selected' : ''}>${n} (${n === 1 ? 'A1–A4' : 'A1–' + String.fromCharCode(64 + n) + '4'})</option>`).join('')}</select></label>
        <div class="actions"><button class="btn primary" type="submit">Speichern</button></div>
      </form>
      <p class="small muted">Tara bestimmen: eine leere Spule wiegen und den Wert eintragen. In der Excel-Tabelle stand für die Bambu-Plastikspule 274 g.</p>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Daten</h2><p>${server ? 'Gespeichert auf dem Server in data/lager.json' : 'Gespeichert nur in diesem Browser'}</p></div>
      <div class="actions">
        <button class="btn" type="button" data-action="export-csv">${icons.file}Für Excel exportieren (CSV)</button>
        ${server ? `<a class="btn" href="api/sicherungen/aktuell" download>${icons.down}Ganzes Lager sichern (JSON)</a>`
    : `<button class="btn" type="button" data-action="export-json">${icons.down}Sicherung (JSON)</button>`}
      </div>
      ${server ? '<div id="backup-body" class="small muted">Sicherungen laden …</div>' : ''}
      <form data-form="import" class="fields">
        <label class="field full"><span>Import aus Excel (CSV) oder einer Sicherung (JSON)</span><input type="file" name="file" accept=".csv,.txt,.json,text/csv,application/json" required></label>
        <label class="switch"><input type="radio" name="mode" value="append" checked><span>Zum Bestand hinzufügen</span></label>
        <label class="switch"><input type="radio" name="mode" value="replace"><span>Bestand ersetzen</span></label>
        <div class="actions full"><button class="btn primary" type="submit">Importieren</button></div>
      </form>
      <details><summary>Excel-Tabelle exportieren</summary>
        <ol class="steps">
          <li>In Excel: Datei, Speichern unter, Dateiformat „CSV UTF-8 (durch Trennzeichen getrennt)“.</li>
          <li>Die Datei hier auswählen. Erkannt werden Spalten wie Art, Hersteller, Farbe, Kaufgewicht, Gewicht mit Spule, Gewicht, Paketnummer, geöffnet?, im AMS und Spulenart.</li>
        </ol>
      </details>
      <div class="actions"><button class="btn small" type="button" data-action="seed">Startdaten aus der Excel-Tabelle neu laden</button>
        ${app.backend.auth === 'ok' ? '<button class="btn small" type="button" data-action="app-logout">Abmelden</button>' : ''}</div>
    </div>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Benachrichtigungen aufs Handy</h2><p>Druck fertig, abgebrochen oder pausiert, Rolle knapp</p></div>
    <div id="notify-body" class="small muted">${server ? 'Lädt …' : 'Benachrichtigungen verschickt der Lager-Server. In dieser Browser-Version gibt es sie nicht.'}</div>
  </section>
  ${server ? `<section class="panel">
    <div class="panel-head"><h2>Sendungsverfolgung (DHL)</h2><p>Stand der Pakete am Beleg, Meldung bei Zustellung</p></div>
    <div id="dhl-body" class="small muted">Lädt …</div>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>API</h2><p>Bestand für andere Programme abrufen, z. B. Home Assistant</p></div>
    <div id="api-body" class="small muted">Lädt …</div>
  </section>` : ''}`;
  if (server) {
    updateBackupPanel();
    updateNotifyPanel();
    updateDhlPanel();
    updateApiPanel();
  }
}

const NOTIFY_EVENTS = [
  ['done', 'Druck fertig'],
  ['failed', 'Druck abgebrochen'],
  ['paused', 'Druck pausiert (z. B. Filament leer)'],
  ['low', 'Rolle wird knapp oder leer'],
  ['delivered', 'Paket zugestellt (mit DHL-Schlüssel)'],
  ['umsatz', 'Umsatz nähert sich der Kleinunternehmer-Grenze'],
];

const BACKUP_KINDS = { taeglich: 'täglich', manuell: 'von Hand', 'vor-wiederherstellen': 'vor dem Zurückholen' };

async function updateBackupPanel() {
  const el = document.getElementById('backup-body');
  if (!el) return;
  let list;
  try {
    list = (await app.backend.backups()).backups;
  } catch (err) {
    el.textContent = err.message;
    return;
  }
  el.classList.remove('small', 'muted');
  const kb = (n) => `${fmt(Math.max(1, n / 1024))} KB`;
  el.innerHTML = `<h3>Automatische Sicherungen</h3>
    <p class="small muted">Jeden Tag sichert der Server das ganze Lager (Rollen, Belege, Kunden, Verlauf) in <code>data/backups/</code>; die letzten 14 Tage bleiben.
      Plesk sichert den Ordner mit. Zum Herunterladen ohne Passwörter und Zugangsschlüssel.</p>
    ${list.length ? `<div class="backup-list">${list.slice(0, 30).map((b) => `<div class="backup-row">
        <span><strong>${esc(new Date(b.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }))}</strong> <span class="small muted">${esc(BACKUP_KINDS[b.kind] || b.kind)} · ${kb(b.size)}</span></span>
        <a class="btn small" href="api/sicherungen/${encodeURIComponent(b.name)}" download>Herunterladen</a>
        <button class="btn small" type="button" data-action="backup-restore" data-name="${esc(b.name)}">Zurückholen</button>
      </div>`).join('')}</div>` : '<p class="small muted">Noch keine Sicherung. Die erste entsteht kurz nach dem Start der App oder mit „Jetzt sichern“.</p>'}
    <div class="actions"><button class="btn" type="button" data-action="backup-now">Jetzt sichern</button></div>
    <form data-form="restore" class="fields">
      <label class="field full"><span>Sicherung aus einer Datei zurückholen</span><input type="file" name="file" accept=".json,application/json" required></label>
      <div class="actions full"><button class="btn" type="submit">Datei zurückholen</button></div>
    </form>`;
}

async function restoreBackup(label, body) {
  if (!(await confirmDialog(`Das Lager auf den Stand ${esc(label)} zurücksetzen? Alles, was danach geändert wurde, ist dann weg. Der jetzige Stand wird vorher gesichert. Bambu-, ntfy- und DHL-Zugang bleiben, wie sie sind.`, 'Zurückholen', true))) return;
  await app.backend.restoreBackup(body);
  toast('Sicherung zurückgeholt, das Lager lädt neu');
  setTimeout(() => location.reload(), 800);
}

async function updateDhlPanel() {
  const el = document.getElementById('dhl-body');
  if (!el) return;
  let d;
  try {
    d = await app.backend.dhlSettings();
  } catch (err) {
    el.textContent = err.message;
    return;
  }
  el.classList.remove('small', 'muted');
  el.innerHTML = `<p class="small">Sendungsnummern trägst du im Reiter „Verkauf“ am Beleg ein (Lkw-Knopf) oder beim Versand im offenen Beleg.
      Ohne Schlüssel gibt es den Link zur Sendungsverfolgung auf dhl.de. Mit einem kostenlosen Schlüssel von DHL fragt das Lager den Stand selbst ab,
      etwa alle 3 Stunden, solange die App läuft, und meldet die Zustellung aufs Handy.</p>
    <details><summary>So bekommst du den Schlüssel</summary>
      <ol class="steps">
        <li>Auf <a href="https://developer.dhl.com" target="_blank" rel="noopener">developer.dhl.com</a> kostenlos registrieren.</li>
        <li>Unter „My Apps“ eine App anlegen und die API <strong>„Shipment Tracking - Unified“</strong> auswählen.</li>
        <li>Nach der Freigabe (meist sofort) den <strong>API Key</strong> der App kopieren und hier eintragen. Das API Secret wird nicht gebraucht.</li>
      </ol>
      <p class="small muted">Kostenlos sind 250 Abfragen am Tag; das reicht für viele Pakete.</p>
    </details>
    <form data-form="dhl" class="fields">
      <label class="field full"><span>DHL-API-Schlüssel</span><input name="apiKey" type="password" autocomplete="off" placeholder="${d.hasKey ? 'gespeichert, leer lassen zum Behalten' : 'API Key von developer.dhl.com'}"></label>
      <div class="actions full"><button class="btn primary" type="submit">Speichern</button>${d.hasKey ? '<button class="btn" type="button" data-action="dhl-remove">Schlüssel entfernen</button>' : ''}</div>
    </form>
    <p class="small muted">${d.hasKey ? 'Schlüssel gespeichert. ' : 'Kein Schlüssel gespeichert. '}${d.lastError ? `<span class="neg">Letzter Fehler: ${esc(d.lastError)}</span> ` : ''}${d.lastCheckAt ? `Zuletzt abgefragt ${esc(timeAgo(d.lastCheckAt))}.` : ''}</p>`;
}

async function updateNotifyPanel() {
  const el = document.getElementById('notify-body');
  if (!el) return;
  let n;
  try {
    n = await app.backend.notifySettings();
  } catch (err) {
    el.textContent = err.message;
    return;
  }
  const subscribe = `${n.server}/${n.topic}`;
  el.classList.remove('small', 'muted');
  el.innerHTML = `<div class="notify-setup">
      <ol class="steps">
        <li>Die kostenlose App <strong>ntfy</strong> installieren (App Store oder Google Play).</li>
        <li>In der App auf „+“ tippen und dieses Thema abonnieren:
          <span class="copy-row"><input id="notify-topic" readonly value="${esc(n.topic)}" aria-label="Thema"><button class="btn" type="button" data-action="copy" data-target="notify-topic">Kopieren</button></span>
          ${n.server !== 'https://ntfy.sh' ? `<span class="small muted">Server in der App: ${esc(n.server)}</span>` : ''}</li>
        <li>Hier einschalten, speichern und eine Testnachricht schicken.</li>
      </ol>
      <div class="notify-qr" title="Mit dem Handy scannen öffnet das Thema">${qrSvg(subscribe, { border: 2, title: 'Thema abonnieren' })}<span class="small muted">scannen zum Abonnieren</span></div>
    </div>
    <form data-form="notify" class="fields">
      <label class="switch full"><input type="checkbox" name="enabled" ${n.enabled ? 'checked' : ''}><span>Benachrichtigungen einschalten</span></label>
      ${NOTIFY_EVENTS.map(([k, label]) => `<label class="switch"><input type="checkbox" name="ev-${k}" ${n.events[k] ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      <details class="full"><summary>Eigener ntfy-Server</summary>
        <div class="fields">
          <label class="field"><span>Server</span><input name="server" value="${esc(n.server)}" inputmode="url"></label>
          <label class="field"><span>Thema</span><input name="topic" value="${esc(n.topic)}"></label>
          <label class="field full"><span>Zugangstoken (nur bei geschütztem Server)</span><input name="token" type="password" autocomplete="off" placeholder="${n.hasToken ? 'gespeichert, leer lassen zum Behalten' : 'leer'}"></label>
        </div>
      </details>
      <div class="actions full"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-action="notify-test">Testnachricht senden</button></div>
    </form>
    <p class="small muted">${n.lastError ? `<span class="neg">Letzter Fehler: ${esc(n.lastError)}</span> ` : ''}${n.lastSentAt ? `Zuletzt gesendet ${esc(timeAgo(n.lastSentAt))}. ` : ''}
      Meldungen zum Druck brauchen eine Verbindung zum Drucker (Bambu-Konto oder Heimnetz unter „Bambu“). Wer das Thema kennt, kann mitlesen, deshalb ist es zufällig.</p>`;
}

async function updateApiPanel() {
  const el = document.getElementById('api-body');
  if (!el) return;
  let key = '';
  try {
    key = await app.backend.getApiKey();
  } catch (err) {
    el.textContent = err.message;
    return;
  }
  if (!key) {
    el.innerHTML = `<p>Jede Rolle hat eine feste Nummer (#1, #2, …). Über die API lässt sich abrufen, wie viel Filament es je Farbe und Material gibt, wo jede Rolle liegt und was im AMS steckt. Dafür braucht es einen Schlüssel.</p>
      <div class="actions"><button class="btn primary" type="button" data-action="api-key">API-Schlüssel erzeugen</button></div>`;
    el.classList.remove('small', 'muted');
    return;
  }
  const apiBase = new URL('api/v1/', location.href).href;
  const examples = [
    ['Bestand nach Farbe, Material und Platz', 'bestand'],
    ['Alle Rollen', 'spulen'],
    ['Rolle #1', 'spulen/1'],
    ['Nur schwarze Rollen', 'spulen?farbe=schwarz'],
    ['Knappe Rollen', 'spulen?status=knapp'],
    ['AMS-Belegung', 'ams'],
  ];
  const withKey = (p) => `${apiBase}${p}${p.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  el.classList.remove('small', 'muted');
  el.innerHTML = `
    <div class="fields">
      <label class="field full"><span>API-Schlüssel</span><span class="copy-row"><input id="api-key" readonly value="${esc(key)}"><button class="btn" type="button" data-action="copy" data-target="api-key">Kopieren</button></span></label>
    </div>
    <p class="small muted">Mitschicken als Header <code>X-API-Key</code> oder in der Adresse als <code>?key=…</code>. Mit dem Schlüssel lässt sich der Bestand lesen und das Gewicht einer Rolle ändern, sonst nichts.</p>
    <div class="api-links">${examples.map(([label, p], i) => `<div class="api-link"><span>${esc(label)}</span>
      <span class="copy-row"><input id="api-ex-${i}" readonly value="${esc(withKey(p))}"><a class="btn small" href="${esc(withKey(p))}" target="_blank" rel="noopener">Öffnen</a><button class="btn small" type="button" data-action="copy" data-target="api-ex-${i}">Kopieren</button></span></div>`).join('')}</div>
    <details><summary>Gramm über die API ändern</summary>
      <p class="small">Mit <code>POST</code> an <code>${esc(apiBase)}spulen/NR/gewicht</code> und genau einem Feld: <code>rest_g</code> (Restgewicht), <code>mit_spule_g</code> (von der Waage, Tara wird abgezogen) oder <code>verbraucht_g</code> (wird abgezogen).</p>
      <pre class="code">curl -X POST -H "X-API-Key: ${esc(key)}" \\
  -H "Content-Type: application/json" \\
  -d '{"verbraucht_g": 35}' \\
  ${esc(apiBase)}spulen/1/gewicht</pre>
    </details>
    <div class="actions"><button class="btn small ghost danger" type="button" data-action="api-key">Neuen Schlüssel erzeugen</button></div>`;
}

// ---------------------------------------------------------------------------
// Ereignisse

function spoolUpdated(updated) {
  app.spools = app.spools.map((x) => (x.id === updated.id ? updated : x));
}

function refreshView() {
  if (app.view === 'lager') updateLager();
  else if (app.view === 'plaetze') updatePlaces();
  else if (app.view === 'bambu' && app.bambu) updatePrinters(true);
}

async function run(fn) {
  try {
    await fn();
  } catch (err) {
    toast(err.message, 'error');
  }
}

const actions = {
  add: () => spoolDialog(null),
  place: (el) => placeDialog(findSpool(el.dataset.id)),
  'place-add': () => placeAddDialog(),
  'place-edit': (el) => placeEditDialog(el.dataset.place),
  'api-key': () => run(async () => {
    const hasKey = Boolean(document.getElementById('api-key'));
    if (hasKey && !(await confirmDialog('Einen neuen Schlüssel erzeugen? Programme, die den alten nutzen, bekommen dann keinen Zugriff mehr.', 'Neu erzeugen', true))) return;
    await app.backend.newApiKey();
    await updateApiPanel();
    toast('API-Schlüssel erzeugt');
  }),
  copy: async (el) => {
    const input = document.getElementById(el.dataset.target);
    try {
      await navigator.clipboard.writeText(input.value);
      toast('Kopiert');
    } catch {
      input.focus();
      input.select();
      toast('Markiert. Mit ⌘+C bzw. Strg+C kopieren.');
    }
  },
  'app-logout': () => run(async () => {
    await app.backend.appLogout();
    location.reload();
  }),
  'select-clear': () => {
    app.selected.clear();
    updatePlaces();
  },
  weigh: (el) => weighDialog(findSpool(el.dataset.id)),
  'notify-test': (el) => run(async () => {
    el.disabled = true;
    try {
      await app.backend.testNotify();
      toast('Testnachricht gesendet. Sie sollte gleich auf dem Handy ankommen.');
    } finally {
      updateNotifyPanel();
    }
  }),
  shopping: () => openShoppingList(app, { onDelivery: deliveriesChanged }),
  'delivery-add': () => deliveryDialog(app, null, { onDone: deliveriesChanged }),
  labels: () => labelsDialog(),
  'reset-filter': () => {
    Object.assign(prefs, { q: '', chip: 'alle', material: '' });
    savePrefs();
    renderLager();
  },
  pull: () => run(() => syncDialog('pull')),
  push: () => run(() => syncDialog('push')),
  logout: () => run(async () => {
    app.bambu = await app.backend.logout();
    updateCloud();
  }),
  'printer-delete': (el) => run(async () => {
    if (!(await confirmDialog('Drucker entfernen? Die Lagerdaten bleiben erhalten.', 'Entfernen', true))) return;
    app.bambu = await app.backend.deletePrinter(el.dataset.id);
    updatePrinters(true);
    updateSetup();
  }),
  'ams-create': (el) => run(async () => {
    const slot = el.closest('.slot');
    const res = await app.backend.amsCreate(slot.dataset.printer, slot.dataset.slot);
    app.spools = res.spools;
    updatePrinters(true);
    toast(`${spoolLabel(res.spool)} angelegt`);
    spoolDialog(res.spool);
  }),
  'ams-weight': (el) => run(async () => {
    const slot = el.closest('.slot');
    const res = await app.backend.amsWeight(slot.dataset.printer, slot.dataset.slot, el.dataset.spool);
    app.spools = app.spools.map((s) => (s.id === res.spool.id ? res.spool : s));
    updatePrinters(true);
    toast(`${spoolLabel(res.spool)}: ${fmt(res.spool.netWeight)} g`);
  }),
  'type-add': () => {
    document.querySelector('[data-types]').insertAdjacentHTML('beforeend', typeRow({ id: '', name: '', tare: 0 }));
    const inputs = document.querySelectorAll('[data-types] [name="typeName"]');
    inputs[inputs.length - 1].focus();
  },
  'backup-now': () => run(async () => {
    const res = await app.backend.createBackup();
    await updateBackupPanel();
    toast(`Gesichert: ${res.name}`);
  }),
  'backup-restore': (el) => run(async () => {
    const name = el.dataset.name;
    const row = el.closest('.backup-row');
    await restoreBackup(`vom ${row ? row.querySelector('strong').textContent : name}`, { name });
  }),
  'dhl-remove': () => run(async () => {
    await app.backend.saveDhl({ remove: true });
    await updateDhlPanel();
    toast('DHL-Schlüssel entfernt');
  }),
  'ship-add': () => {
    document.querySelector('[data-ship]').insertAdjacentHTML('beforeend', shipRow({ name: '', price: 0, cost: 0 }));
    const inputs = document.querySelectorAll('[data-ship] [name="shipName"]');
    inputs[inputs.length - 1].focus();
  },
  'ship-remove': (el) => el.closest('.ship-row').remove(),
  'type-remove': (el) => {
    if (document.querySelectorAll('[data-types] .type-row').length <= 1) return toast('Mindestens eine Spulenart wird gebraucht.', 'error');
    el.closest('.type-row').remove();
  },
  'export-csv': () => download('filament-lager.csv', toCsv(app.spools, app.settings), 'text/csv;charset=utf-8'),
  'export-json': () => download(`filament-lager-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ exportedAt: new Date().toISOString(), settings: app.settings, spools: app.spools }, null, 2), 'application/json'),
  seed: () => run(async () => {
    if (!(await confirmDialog('Den aktuellen Bestand durch die 18 Spulen aus der Excel-Tabelle ersetzen?', 'Ersetzen', true))) return;
    const res = await app.backend.importData('seed');
    app.spools = res.spools;
    toast('Startdaten geladen');
  }),
};

function onClick(e) {
  const a = e.target.closest('[data-action]');
  if (a && actions[a.dataset.action]) {
    actions[a.dataset.action](a, e);
    return;
  }
  const chipEl = e.target.closest('[data-chip-id]');
  if (chipEl) {
    const id = chipEl.dataset.chipId;
    if (app.selected.has(id)) app.selected.delete(id);
    else app.selected.add(id);
    updatePlaces();
    return;
  }
  const drop = e.target.closest('[data-drop]');
  if (drop) {
    run(() => dropOn([...app.selected], JSON.parse(drop.dataset.drop)));
    return;
  }
  const sort = e.target.closest('[data-sort]');
  if (sort) {
    const key = sort.dataset.sort;
    if (prefs.sort !== key) Object.assign(prefs, { sort: key, dir: 1 });
    else if (prefs.dir > 0) prefs.dir = -1;
    else Object.assign(prefs, { sort: '', dir: 1 });
    savePrefs();
    updateLager();
    return;
  }
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    prefs.chip = chip.dataset.chip;
    savePrefs();
    updateLager();
    return;
  }
  const row = e.target.closest('.row.item');
  if (row) spoolDialog(findSpool(row.dataset.id));
}

function onInput(e) {
  if (e.target.id === 'q') {
    prefs.q = e.target.value;
    document.getElementById('list').innerHTML = listHtml(filteredSpools());
  }
}

function onChange(e) {
  const t = e.target;
  if (t.id === 'material') {
    prefs.material = t.value;
    savePrefs();
    updateLager();
  } else if (t.dataset.option) {
    run(async () => {
      app.bambu = await app.backend.setOptions({ [t.dataset.option]: t.checked });
      await reload();
      toast('Gespeichert');
    });
  } else if (t.matches('[data-link]')) {
    const slot = t.closest('.slot');
    run(async () => {
      const res = await app.backend.amsLink(slot.dataset.printer, slot.dataset.slot, t.value || null);
      app.spools = res.spools;
      t.blur();
      updatePrinters(true);
      toast(t.value ? `Slot ${slot.dataset.slot} zugeordnet` : `Zuordnung für ${slot.dataset.slot} gelöst`);
    });
  }
}

const forms = {
  async login(f) {
    app.bambu = await app.backend.login(f.account.value, f.password.value, f.region.value);
    updateCloud();
    if (app.bambu.cloud.connected) toast('Mit Bambu verbunden');
  },
  async code(f) {
    app.bambu = await app.backend.loginCode(f.code.value);
    updateCloud();
    toast('Mit Bambu verbunden');
  },
  async token(f) {
    app.bambu = await app.backend.loginToken(f.token.value, f.region.value);
    updateCloud();
    toast('Mit Bambu verbunden');
  },
  async printer(f, form) {
    app.bambu = await app.backend.addPrinter({
      name: f.name.value, host: f.host.value, serial: f.serial.value, accessCode: f.accessCode.value,
    });
    form.reset();
    updatePrinters(true);
    updateSetup();
    toast('Drucker gespeichert, Verbindung wird aufgebaut');
  },
  async settings(f, form) {
    const rows = [...form.querySelectorAll('[data-types] .type-row')];
    const spoolTypes = rows.map((r) => ({
      id: r.querySelector('[name="typeId"]').value || undefined,
      name: r.querySelector('[name="typeName"]').value,
      tare: r.querySelector('[name="typeTare"]').value,
    }));
    const shipping = [...form.querySelectorAll('[data-ship] .ship-row')].map((r) => ({
      name: r.querySelector('[name="shipName"]').value.trim(),
      price: parseNum(r.querySelector('[name="shipPrice"]').value) || 0,
      cost: parseNum(r.querySelector('[name="shipCost"]').value) || 0,
    })).filter((x) => x.name);
    app.settings = await app.backend.saveSettings({
      ...app.settings, spoolTypes, shipping, lowStockPart: f.lowStockPart.value, amsUnits: f.amsUnits.value, roundTo: Number(f.roundTo.value),
      ...Object.fromEntries(['pricePerKg', 'energyPrice', 'printerWatts', 'machineRate', 'failPct', 'laborMinutes', 'laborRate', 'profitPct', 'minPrice',
        'sellerName', 'powerPayee', 'sellerAddress', 'offerDays', 'defaultInfill', 'discountQty', 'discountPct', 'deliveryPrice', 'homeAddress', 'kmRate', 'kmCost'].map((k) => [k, f[k].value])),
      roundTrip: f.roundTrip.checked,
      smallBusiness: f.smallBusiness.checked,
    });
    renderSettings();
    toast('Einstellungen gespeichert');
  },
  async notify(f) {
    await app.backend.saveNotify({
      enabled: f.enabled.checked,
      events: Object.fromEntries(NOTIFY_EVENTS.map(([k]) => [k, f['ev-' + k].checked])),
      server: f.server.value.trim(),
      topic: f.topic.value.trim(),
      token: f.token.value,
      appUrl: location.origin + location.pathname,
    });
    await updateNotifyPanel();
    toast(f.enabled.checked ? 'Benachrichtigungen eingeschaltet' : 'Benachrichtigungen gespeichert (aus)');
  },
  async restore(f) {
    const file = f.file.files[0];
    if (!file) throw new Error('Bitte eine Sicherungsdatei auswählen.');
    let data;
    try {
      data = JSON.parse(await readFile(file));
    } catch {
      throw new Error('Die Datei ist keine gültige JSON-Sicherung.');
    }
    await restoreBackup(`aus „${file.name}“`, { data });
  },
  async dhl(f) {
    if (!f.apiKey.value.trim()) throw new Error('Bitte den API-Schlüssel eintragen.');
    await app.backend.saveDhl({ apiKey: f.apiKey.value.trim() });
    await updateDhlPanel();
    toast('DHL-Schlüssel gespeichert, offene Sendungen werden abgefragt');
  },
  async import(f) {
    const file = f.file.files[0];
    if (!file) throw new Error('Bitte eine Datei auswählen.');
    const text = await readFile(file);
    let spools;
    let settings;
    if (/\.json$/i.test(file.name) || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const data = JSON.parse(text);
      spools = Array.isArray(data) ? data : data.spools;
      settings = Array.isArray(data) ? undefined : data.settings;
      if (!Array.isArray(spools)) throw new Error('In der Datei wurden keine Spulen gefunden.');
    } else {
      spools = spoolsFromRows(parseCsv(text), app.settings);
    }
    const mode = f.mode.value;
    if (mode === 'replace' && !(await confirmDialog(`Den Bestand (${app.spools.length} Spulen) durch ${spools.length} importierte Spulen ersetzen?`, 'Ersetzen', true))) return;
    const res = await app.backend.importData(mode, spools, settings);
    app.spools = res.spools;
    app.settings = res.settings;
    renderSettings();
    toast(`${spools.length} Spulen importiert`);
  },
};

function onSubmit(e) {
  const form = e.target.closest('[data-form]');
  if (!form || !forms[form.dataset.form]) return;
  e.preventDefault();
  const btn = form.querySelector('[type="submit"]');
  if (btn) btn.disabled = true;
  run(() => forms[form.dataset.form](form.elements, form)).finally(() => {
    if (btn) btn.disabled = false;
  });
}

init();
