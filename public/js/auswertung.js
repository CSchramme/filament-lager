// Reiter "Auswertung": Kennzahlen und Diagramme für einen Zeitraum.
// Umsatz und Gewinn pro Monat, Filamentverbrauch pro Monat und nach Farbe,
// Bestseller. Der Zeitraum oben gilt für die Diagramme; darunter die
// Jahresübersicht für die Steuer (jahr.js).
import {
  attachTooltip, barList, columnChart, legend, tableView,
} from './charts.js';
import { renderYear } from './jahr.js';
import { computeStats, RANGES } from './stats.js';
import {
  fmt, fmtEur, fmtKg, fmtNum, toast,
} from './ui.js';

const RANGE_KEY = 'filament-lager-auswertung';
let range = '6m';
try {
  range = localStorage.getItem(RANGE_KEY) || range;
} catch { /* Standard */ }
if (!RANGES[range]) range = '6m';

let ctx = null; // { root, app, data: { tasks, sales } }
let observer = null;

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthLabel = (key, withYear = false) => `${MONTHS[Number(key.slice(5, 7)) - 1]}${withYear ? ` ${key.slice(0, 4)}` : ''}`;
const eurTick = (v) => (Math.abs(v) >= 1000 ? `${fmtNum(v / 1000, 1)} Tsd. €` : `${fmt(v)} €`);
const gramsText = (g) => (g >= 1000 ? `${fmtKg(g)} kg` : `${fmt(g)} g`);

export async function renderAuswertung(root, app) {
  root.innerHTML = '<section class="panel"><p class="small muted">Lädt …</p></section>';
  const data = {
    tasks: [], sales: [], powerPayments: [], expenses: [], archive: [],
  };
  try {
    const [history, sales, power, expenses, archive] = await Promise.all([
      app.backend.tasks(), app.backend.sales(), app.backend.powerPayments(), app.backend.expenses(), app.backend.spoolArchive(),
    ]);
    data.tasks = history.tasks || [];
    data.sales = sales.sales || [];
    data.powerPayments = power.payments || [];
    data.expenses = expenses.expenses || [];
    data.archive = archive.archive || [];
  } catch (err) {
    toast(err.message, 'error');
  }
  ctx = { root, app, data };
  draw();
  if (observer) observer.disconnect();
  // Diagramme an die Breite anpassen (Handy drehen, Fenster ändern)
  let lastWidth = 0;
  observer = new ResizeObserver(() => {
    const el = root.querySelector('.stats-view');
    if (!el || !el.isConnected) {
      observer.disconnect();
      return;
    }
    if (Math.abs(el.clientWidth - lastWidth) > 8) {
      lastWidth = el.clientWidth;
      drawCharts();
    }
  });
  observer.observe(root);
}

function tile(label, value, hint = '') {
  return `<div class="stat"><span class="label">${label}</span><span class="value">${value}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
}

let stats = null;

function draw() {
  const { root, app, data } = ctx;
  stats = computeStats({
    tasks: data.tasks, sales: data.sales, spools: app.spools, settings: app.settings, range,
  });
  const t = stats.totals;
  const margin = t.revenue ? Math.round((t.profit / t.revenue) * 100) : 0;
  const first = stats.months[0].key;
  const last = stats.months[stats.months.length - 1].key;
  root.innerHTML = `<div class="stats-view">
    <div class="filter-row" role="radiogroup" aria-label="Zeitraum">
      ${Object.entries(RANGES).map(([k, label]) => `<button type="button" class="chip" data-range="${k}" aria-pressed="${k === range}">${label}</button>`).join('')}
      <span class="small muted">${monthLabel(first, true)} bis ${monthLabel(last, true)}</span>
    </div>
    <section class="stats">
      ${tile('Umsatz', fmtEur(t.revenue), `${t.sales} ${t.sales === 1 ? 'Beleg' : 'Belege'}, ${t.pieces} Stück`)}
      ${tile('Gewinn', fmtEur(t.profit), t.revenue ? `${margin} % vom Umsatz` : 'noch kein Umsatz')}
      ${tile('Filament verdruckt', gramsText(t.grams), `${t.prints} ${stats.source === 'verlauf' ? (t.prints === 1 ? 'Druck' : 'Drucke') : 'Teile laut Belegen'}`)}
      ${tile('Strom', fmtEur(t.energy), `${fmtNum(t.kwh, 1)} kWh`)}
      ${tile('Lagerwert jetzt', fmtEur(stats.stock.value), `${fmtKg(stats.stock.grams)} kg${stats.stock.unpriced ? `, ${stats.stock.unpriced} Rollen mit Standardpreis` : ''}`)}
    </section>
    <div class="grid-2 charts">
      <figure class="panel chart-card" id="ch-money"></figure>
      <figure class="panel chart-card" id="ch-grams"></figure>
      <figure class="panel chart-card" id="ch-colors"></figure>
      <figure class="panel chart-card" id="ch-best"></figure>
    </div>
    <section class="panel" id="year"></section>
  </div>`;
  root.querySelector('.filter-row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    range = b.dataset.range;
    try {
      localStorage.setItem(RANGE_KEY, range);
    } catch { /* egal */ }
    draw();
  });
  attachTooltip(root.querySelector('.stats-view'));
  drawCharts();
  renderYear(root.querySelector('#year'), app, data);
}

function head(title, sub) {
  return `<figcaption class="panel-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</figcaption>`;
}

function drawCharts() {
  const { root } = ctx;
  const s = stats;
  const card = root.querySelector('#ch-money');
  if (!card) return;
  const width = Math.max(240, card.clientWidth - 32);
  const many = s.months.length > 12;
  const cats = s.months.map((m, i) => ({
    key: m.key, label: monthLabel(m.key, many && (i === 0 || m.key.endsWith('-01'))), title: monthLabel(m.key, true),
  }));
  const hasSales = s.months.some((m) => m.revenue || m.cost);
  const money = [
    { name: 'Umsatz', color: 'var(--series-1)', values: s.months.map((m) => m.revenue) },
    { name: 'Gewinn', color: 'var(--series-2)', values: s.months.map((m) => m.profit) },
  ];
  card.innerHTML = `${head('Umsatz und Gewinn', 'pro Monat, aus den Belegen')}
    ${hasSales ? `${legend(money)}${columnChart({
    width, categories: cats, series: money, format: fmtEur, tick: eurTick,
  })}${tableView(['Monat', 'Umsatz', 'Kosten', 'Gewinn'], s.months.map((m) => [monthLabel(m.key, true), fmtEur(m.revenue), fmtEur(m.cost), fmtEur(m.profit)]))}`
    : '<p class="muted empty-chart">Im Zeitraum gibt es noch keine Belege.</p>'}`;

  const gramsCard = root.querySelector('#ch-grams');
  const hasGrams = s.months.some((m) => m.grams);
  gramsCard.innerHTML = `${head('Filament verdruckt', s.source === 'verlauf' ? 'pro Monat, fertige Drucke aus dem Bambu-Verlauf' : 'pro Monat, aus den Belegen (ohne Bambu-Verlauf)')}
    ${hasGrams ? `${columnChart({
    width,
    categories: cats,
    series: [{ name: 'Filament', color: 'var(--series-1)', values: s.months.map((m) => m.grams) }],
    format: gramsText,
    tick: (v) => (v >= 1000 ? `${fmtNum(v / 1000, 1)} kg` : `${fmt(v)} g`),
    labelMax: true,
  })}${tableView(['Monat', 'Filament', 'Drucke', 'Strom'], s.months.map((m) => [monthLabel(m.key, true), gramsText(m.grams), String(m.prints), `${fmtNum(m.kwh, 2)} kWh · ${fmtEur(m.energy)}`]))}`
    : '<p class="muted empty-chart">Im Zeitraum wurde noch nichts verdruckt.</p>'}`;

  const colorsCard = root.querySelector('#ch-colors');
  colorsCard.innerHTML = `${head('Verbrauch nach Farbe', 'Gramm im Zeitraum')}
    ${s.byColor.length ? `${barList(s.byColor.map((c) => ({
    label: [c.name, c.material].filter(Boolean).join(' · '), hex: c.hex, value: c.grams, text: gramsText(c.grams),
    tip: [['Filament', gramsText(c.grams)], ['Anteil', `${Math.round((c.grams / (s.totals.grams || 1)) * 100)} %`]],
  })))}${tableView(['Farbe', 'Filament'], s.byColor.map((c) => [[c.name, c.material].filter(Boolean).join(' · '), gramsText(c.grams)]))}`
    : '<p class="muted empty-chart">Noch keine Daten.</p>'}`;

  const bestCard = root.querySelector('#ch-best');
  bestCard.innerHTML = `${head('Bestseller', 'nach Umsatz im Zeitraum')}
    ${s.bestsellers.length ? `${barList(s.bestsellers.map((b) => ({
    label: b.title, value: b.revenue, text: `${fmtEur(b.revenue)} · ${b.qty} Stk.`,
    tip: [['Umsatz', fmtEur(b.revenue)], ['Gewinn', fmtEur(b.profit)], ['Stück', String(b.qty)], ['Belege', String(b.sales)]],
  })))}${tableView(['Teil', 'Stück', 'Umsatz', 'Gewinn'], s.bestsellers.map((b) => [b.title, String(b.qty), fmtEur(b.revenue), fmtEur(b.profit)]))}`
    : '<p class="muted empty-chart">Noch keine verkauften Teile im Zeitraum.</p>'}`;
}
