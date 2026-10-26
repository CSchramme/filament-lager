// Zahlen für die Auswertung: Umsatz und Gewinn pro Monat aus den Belegen,
// Filamentverbrauch pro Monat und nach Farbe aus dem Bambu-Druckverlauf
// (ohne Verlauf aus den Belegen), Bestseller und Strom.
import {
  colorNameFor, energyCost, energyKwh, listPrice, listPriceForWeight, matchSpool, priceSource, stockValue,
} from './domain.js';

const cents = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const monthOf = (iso) => String(iso || '').slice(0, 7);

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const RANGES = {
  '6m': 'Letzte 6 Monate',
  '12m': 'Letzte 12 Monate',
  jahr: 'Dieses Jahr',
  alles: 'Alles',
};

// Monate im Zeitraum, ältester zuerst. "alles" beginnt beim ältesten Eintrag.
export function monthsFor(range, now, earliest = '') {
  const to = monthOf(now);
  let from;
  if (range === '12m') from = addMonths(to, -11);
  else if (range === 'jahr') from = `${to.slice(0, 4)}-01`;
  else if (range === 'alles') from = earliest && earliest < to ? earliest : addMonths(to, -5);
  else from = addMonths(to, -5);
  const months = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) months.push(k);
  return months;
}

// Wie "Schwarz · PLA Basic": Name der passenden Lagerrolle, sonst Farbname.
function colorLabel(f, spools) {
  const spool = f.color ? matchSpool(spools, f) : null;
  if (spool) return { name: spool.colorName || colorNameFor(spool.colorHex), material: spool.material, hex: spool.colorHex };
  return { name: f.color ? colorNameFor(f.color) || f.color : 'ohne Angabe', material: f.type || '', hex: f.color || '' };
}

export function computeStats({
  tasks = [], sales = [], spools = [], settings, range = '6m', now = new Date().toISOString(),
}) {
  const earliest = [...tasks.map((t) => monthOf(t.startTime)), ...sales.map((s) => monthOf(s.date))].filter(Boolean).sort()[0] || '';
  const months = monthsFor(range, now, earliest);
  const inRange = (key) => key >= months[0] && key <= months[months.length - 1];
  const rows = new Map(months.map((k) => [k, {
    key: k, revenue: 0, cost: 0, profit: 0, grams: 0, prints: 0, seconds: 0, kwh: 0, energy: 0,
  }]));

  const salesIn = sales.filter((s) => inRange(monthOf(s.date)));
  for (const s of salesIn) {
    const r = rows.get(monthOf(s.date));
    r.revenue += s.price;
    r.cost += s.cost;
  }

  // Verbrauch: fertige Drucke aus dem Verlauf; Strom zählt jeder Druck mit Druckzeit.
  const source = tasks.length ? 'verlauf' : 'belege';
  const colors = new Map();
  const addColor = (label, grams) => {
    const key = `${label.name.toLowerCase()}|${label.material}`;
    const c = colors.get(key) || { ...label, grams: 0 };
    c.grams += grams;
    if (!c.hex && label.hex) c.hex = label.hex;
    colors.set(key, c);
  };
  if (tasks.length) {
    for (const t of tasks) {
      const key = monthOf(t.startTime);
      if (!inRange(key)) continue;
      const r = rows.get(key);
      if (t.seconds > 0) r.seconds += t.seconds;
      if (t.status !== 2) continue;
      r.grams += t.grams;
      r.prints += 1;
      const fils = t.filaments && t.filaments.length ? t.filaments : [{ grams: t.grams }];
      for (const f of fils) addColor(colorLabel(f, spools), f.grams);
    }
  } else {
    for (const s of salesIn) {
      const r = rows.get(monthOf(s.date));
      for (const i of s.items) {
        if (!i.grams) continue;
        r.grams += i.grams * i.qty;
        r.prints += i.qty;
        r.seconds += i.seconds * i.qty;
        addColor({ name: i.colorName || 'ohne Angabe', material: i.material, hex: i.colorHex }, i.grams * i.qty);
      }
    }
  }

  const list = months.map((k) => {
    const r = rows.get(k);
    return {
      ...r,
      revenue: cents(r.revenue),
      cost: cents(r.cost),
      profit: cents(r.revenue - r.cost),
      grams: Math.round(r.grams * 10) / 10,
      kwh: energyKwh(r.seconds, settings),
      energy: cents(energyCost(r.seconds, settings)),
    };
  });

  // Farben: die 8 größten, der Rest als "Übrige"
  const byColor = [...colors.values()].map((c) => ({ ...c, grams: Math.round(c.grams * 10) / 10 })).sort((a, b) => b.grams - a.grams);
  const top = byColor.slice(0, 8);
  const rest = byColor.slice(8);
  if (rest.length) top.push({ name: `Übrige (${rest.length})`, material: '', hex: '', grams: Math.round(rest.reduce((a, c) => a + c.grams, 0) * 10) / 10 });

  // Bestseller: Positionen gleichen Namens zusammen, ohne Positionen von Hand (Versand o. Ä.)
  const items = new Map();
  for (const s of salesIn) {
    for (const i of s.items) {
      if (!i.breakdown && !i.grams && !i.seconds) continue;
      const key = i.title.trim().toLowerCase();
      const b = items.get(key) || {
        title: i.title, qty: 0, revenue: 0, profit: 0, sales: 0,
      };
      b.qty += i.qty;
      b.revenue += i.price;
      b.profit += i.price - i.cost;
      b.sales += 1;
      items.set(key, b);
    }
  }
  const bestsellers = [...items.values()].map((b) => ({ ...b, revenue: cents(b.revenue), profit: cents(b.profit) }))
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, 8);

  const sum = (k) => list.reduce((a, r) => a + r[k], 0);
  const revenue = cents(sum('revenue'));
  const cost = cents(sum('cost'));
  return {
    range,
    months: list,
    source,
    totals: {
      revenue,
      cost,
      profit: cents(revenue - cost),
      sales: salesIn.length,
      pieces: salesIn.reduce((a, s) => a + s.qty, 0),
      grams: Math.round(sum('grams')),
      prints: sum('prints'),
      kwh: sum('kwh'),
      energy: cents(sum('energy')),
    },
    byColor: top,
    bestsellers,
    stock: {
      value: stockValue(spools, settings),
      grams: spools.reduce((a, s) => a + s.netWeight, 0),
      unpriced: spools.filter((s) => s.netWeight > 0 && priceSource(s, settings).kind === 'standard').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Jahresübersicht für die Steuer (vereinfachte Einnahmen-Überschuss-Rechnung).
// Einnahmen: die Belege. Ausgaben: Filamentkäufe (Kaufpreis und Kaufdatum der
// Rollen, auch gelöschter), Stromabrechnungen, Porto der Versandpositionen
// und eigene Ausgaben (Düsen, Platten, Verpackung …).

// Grenzen für Kleinunternehmer nach § 19 UStG (Stand 2025): Umsatz im Vorjahr
// höchstens 25.000 €, im laufenden Jahr höchstens 100.000 €.
export const SMALL_BUSINESS = { prev: 25000, current: 100000 };

export function yearsWithData({
  sales = [], spools = [], archive = [], powerPayments = [], expenses = [], now = new Date().toISOString(),
}) {
  const years = new Set([now.slice(0, 4)]);
  for (const d of [...sales.map((s) => s.date), ...spools.filter((s) => s.price > 0).map((s) => s.boughtAt), ...archive.map((s) => s.boughtAt),
    ...powerPayments.map((p) => p.date), ...expenses.map((e) => e.date)]) {
    if (/^\d{4}/.test(d || '')) years.add(d.slice(0, 4));
  }
  return [...years].sort().reverse();
}

// settings: für Rollen ohne eigenen Kaufpreis gilt der Preis aus der Preisliste.
export function computeYear({
  year, sales = [], spools = [], archive = [], powerPayments = [], expenses = [], settings = null,
}) {
  const y = String(year);
  const inYear = (d) => String(d || '').startsWith(y + '-');
  const entries = []; // { date, kind: 'ein'|'aus', category, title, amount, expenseId? }
  for (const s of sales) {
    if (!inYear(s.date)) continue;
    const who = s.customer ? s.customer.split('\n')[0].trim() : '';
    entries.push({ date: s.date, kind: 'ein', category: 'Verkauf', title: `Beleg ${s.nr}${who ? `, ${who}` : ''}`, amount: s.price });
    const porto = cents(s.items.filter((i) => i.kind === 'versand').reduce((a, i) => a + i.cost, 0));
    if (porto > 0) entries.push({ date: s.date, kind: 'aus', category: 'Porto', title: `Porto zu Beleg ${s.nr}`, amount: porto });
  }
  const seen = new Set();
  let unpriced = 0;
  let listed = 0;
  for (const sp of [...spools, ...archive]) {
    if (seen.has(sp.id)) continue;
    seen.add(sp.id);
    if (!inYear(sp.boughtAt)) continue;
    let amount = sp.price > 0 ? sp.price : 0;
    const entry = !amount && settings && sp.material && sp.purchaseWeight > 0 ? listPrice(sp.material, settings) : null;
    if (entry) {
      amount = listPriceForWeight(entry, sp.purchaseWeight);
      listed += 1;
    }
    if (!amount) {
      unpriced += 1;
      continue;
    }
    const label = sp.label || [sp.material, sp.colorName].filter(Boolean).join(' ');
    entries.push({
      date: sp.boughtAt, kind: 'aus', category: 'Filament', amount,
      title: `${sp.nr && !label.startsWith('#') ? `#${sp.nr} ` : ''}${label}${sp.deletedAt ? ' (gelöscht)' : ''}${entry ? ' (Preis laut Preisliste)' : ''}`,
    });
  }
  for (const p of powerPayments) {
    if (inYear(p.date) && p.amount > 0) entries.push({ date: p.date, kind: 'aus', category: 'Strom', title: `Strom${p.prints ? ` für ${p.prints} Drucke` : ''}`, amount: p.amount });
  }
  for (const e of expenses) {
    if (inYear(e.date)) entries.push({ date: e.date, kind: 'aus', category: e.category, title: e.title, amount: e.amount, expenseId: e.id });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'ein' ? -1 : 1));

  const months = Array.from({ length: 12 }, (_, i) => ({ key: `${y}-${String(i + 1).padStart(2, '0')}`, income: 0, spend: 0 }));
  const byCategory = new Map();
  for (const e of entries) {
    const m = months[Number(e.date.slice(5, 7)) - 1];
    if (!m) continue;
    if (e.kind === 'ein') m.income += e.amount;
    else {
      m.spend += e.amount;
      byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amount);
    }
  }
  for (const m of months) {
    m.income = cents(m.income);
    m.spend = cents(m.spend);
    m.result = cents(m.income - m.spend);
  }
  const income = cents(months.reduce((a, m) => a + m.income, 0));
  const spend = cents(months.reduce((a, m) => a + m.spend, 0));
  const prevIncome = cents(sales.filter((s) => String(s.date || '').startsWith(`${Number(y) - 1}-`)).reduce((a, s) => a + s.price, 0));
  return {
    year: y,
    entries,
    months,
    income,
    spend,
    result: cents(income - spend),
    receipts: sales.filter((s) => inYear(s.date)).length,
    byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount: cents(amount) })).sort((a, b) => b.amount - a.amount),
    unpriced,
    listed,
    prevIncome,
  };
}

// CSV für Excel oder den Steuerberater: Semikolon, Komma als Dezimalzeichen
export function yearCsv(r) {
  const q = (v) => (/[;"\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const money = (v) => v.toFixed(2).replace('.', ',');
  const lines = [['Datum', 'Art', 'Kategorie', 'Beschreibung', 'Einnahme', 'Ausgabe'].join(';')];
  for (const e of r.entries) {
    const d = `${e.date.slice(8, 10)}.${e.date.slice(5, 7)}.${e.date.slice(0, 4)}`;
    lines.push([d, e.kind === 'ein' ? 'Einnahme' : 'Ausgabe', e.category, e.title, e.kind === 'ein' ? money(e.amount) : '', e.kind === 'aus' ? money(e.amount) : ''].map(q).join(';'));
  }
  lines.push(['', '', '', `Summe ${r.year}`, money(r.income), money(r.spend)].map(q).join(';'));
  lines.push(['', '', '', 'Ergebnis', money(r.result), ''].map(q).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
