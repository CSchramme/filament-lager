// Jahresübersicht für die Steuer im Reiter "Auswertung": Einnahmen und
// Ausgaben eines Kalenderjahres, eigene Ausgaben erfassen, Export als CSV und
// zum Drucken. Keine Steuerberatung, nur eine geordnete Aufstellung.
import { EXPENSE_CATEGORIES } from './domain.js';
import { openDocument } from './documents.js';
import {
  computeYear, SMALL_BUSINESS, yearCsv, yearsWithData,
} from './stats.js';
import {
  dateDe, download, esc, fmtEur, icons, localDay, openDialog, parseNum, plural, tile, toast,
} from './ui.js';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

let ctx = null; // { el, app, data: { sales, archive, powerPayments, expenses } }
let year = String(new Date().getFullYear());

export function renderYear(el, app, data) {
  ctx = { el, app, data };
  el.addEventListener('click', onClick);
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'year-select') return;
    year = e.target.value;
    draw();
  });
  draw();
}

function report() {
  const { app, data } = ctx;
  return computeYear({
    year, sales: data.sales, spools: app.spools, archive: data.archive, powerPayments: data.powerPayments, expenses: data.expenses,
  });
}

function draw() {
  const { el, app, data } = ctx;
  const years = yearsWithData({
    sales: data.sales, spools: app.spools, archive: data.archive, powerPayments: data.powerPayments, expenses: data.expenses,
  });
  if (!years.includes(year)) year = years[0];
  const r = report();
  const share = Math.min(1, r.income / SMALL_BUSINESS.current);
  const own = r.entries.filter((e) => e.expenseId);
  el.innerHTML = `<div class="panel-head"><h2>Jahresübersicht für die Steuer</h2><p>Einnahmen und Ausgaben nach Datum, unabhängig vom Zeitraum oben</p></div>
    <div class="toolbar">
      <label class="field year-pick"><span>Jahr</span><select id="year-select">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <span class="toolbar-actions">
        <button class="btn" type="button" data-year="add">${icons.plus}Ausgabe</button>
        <button class="btn" type="button" data-year="csv">${icons.file}CSV für Excel</button>
        <button class="btn" type="button" data-year="print">Drucken oder PDF</button>
      </span>
    </div>
    <div class="stats year-stats">
      ${tile(`Einnahmen ${r.year}`, fmtEur(r.income), plural(r.receipts, 'Beleg', 'Belege'))}
      ${tile(`Ausgaben ${r.year}`, fmtEur(r.spend), `${r.byCategory.length ? r.byCategory.slice(0, 2).map((c) => esc(c.category)).join(', ') : 'noch keine'}`)}
      ${tile('Ergebnis', `<span class="${r.result < 0 ? 'neg' : ''}">${fmtEur(r.result)}</span>`, r.result < 0 ? 'Verlust' : 'Einnahmen minus Ausgaben')}
    </div>
    <div class="grid-2 year-grid">
      <div>
        <h3>Ausgaben nach Art</h3>
        ${r.byCategory.length ? `<table class="year-table"><tbody>${r.byCategory.map((c) => `<tr><td>${esc(c.category)}</td><td class="r num">${fmtEur(c.amount)}</td></tr>`).join('')}
          <tr class="sum"><td>Zusammen</td><td class="r num">${fmtEur(r.spend)}</td></tr></tbody></table>` : '<p class="small muted">Keine Ausgaben in diesem Jahr.</p>'}
        <h3>Eigene Ausgaben</h3>
        ${own.length ? `<div class="expense-list">${own.map((e) => `<div class="expense-row" data-id="${esc(e.expenseId)}">
            <span class="small muted num">${dateDe(e.date)}</span>
            <button type="button" class="sale-title" data-year="edit"><strong>${esc(e.title)}</strong> <span class="small muted">${esc(e.category)}</span></button>
            <span class="num">${fmtEur(e.amount)}</span>
            <button type="button" class="icon-btn" data-year="delete" aria-label="Ausgabe löschen">×</button>
          </div>`).join('')}</div>` : '<p class="small muted">Düsen, Druckplatten, Werkzeug, Verpackung oder Filament außerhalb des Lagers hier mit „Ausgabe“ eintragen.</p>'}
      </div>
      <div>
        <h3>Pro Monat</h3>
        <table class="year-table"><thead><tr><th>Monat</th><th class="r">Einnahmen</th><th class="r">Ausgaben</th><th class="r">Ergebnis</th></tr></thead>
          <tbody>${r.months.map((m, i) => `<tr${m.income || m.spend ? '' : ' class="muted"'}><td>${MONTHS[i]}</td><td class="r num">${fmtEur(m.income)}</td><td class="r num">${fmtEur(m.spend)}</td><td class="r num ${m.result < 0 ? 'neg' : ''}">${fmtEur(m.result)}</td></tr>`).join('')}
          <tr class="sum"><td>${r.year}</td><td class="r num">${fmtEur(r.income)}</td><td class="r num">${fmtEur(r.spend)}</td><td class="r num ${r.result < 0 ? 'neg' : ''}">${fmtEur(r.result)}</td></tr></tbody></table>
      </div>
    </div>
    <div class="note small">
      <strong>Kleinunternehmer (§ 19 UStG):</strong> ${fmtEur(r.income)} Umsatz in ${r.year}${r.prevIncome ? `, ${fmtEur(r.prevIncome)} in ${Number(r.year) - 1}` : ''}.
      Ohne Umsatzsteuer geht es, solange der Umsatz im Vorjahr höchstens ${fmtEur(SMALL_BUSINESS.prev)} war und im laufenden Jahr ${fmtEur(SMALL_BUSINESS.current)} nicht übersteigt (Stand 2025).
      <div class="meter year-meter" data-level="${share > 0.8 ? 'knapp' : ''}" title="${Math.round(share * 100)} % von ${fmtEur(SMALL_BUSINESS.current)}"><span style="width:${Math.max(0.5, share * 100).toFixed(1)}%"></span></div>
    </div>
    <p class="small muted">Filament zählt mit Kaufpreis und Kaufdatum der Rollen (im Lager unter „Bearbeiten“), auch von gelöschten Rollen. Filament aus dem Lager deshalb nicht noch einmal als Ausgabe eintragen.
      ${r.unpriced ? `<strong>${plural(r.unpriced, 'Rolle', 'Rollen')} aus ${r.year} ohne Kaufpreis</strong> fehlen in den Ausgaben. ` : ''}Strom zählt, sobald eine Stromabrechnung gespeichert ist (Reiter „Drucke“), Porto aus den Versandpositionen der Belege.
      Die Aufstellung ersetzt keine Steuerberatung; Belege und Kaufrechnungen aufheben.</p>`;
}

function expenseDialog(expense = null) {
  const x = expense || {
    date: year === localDay().slice(0, 4) ? localDay() : `${year}-12-31`, title: '', amount: 0, category: 'Ersatzteile',
  };
  openDialog({
    title: expense ? 'Ausgabe ändern' : 'Ausgabe eintragen',
    body: `<div class="fields">
        <label class="field full"><span>Wofür</span><input name="title" value="${esc(x.title)}" placeholder="z. B. 0,4-mm-Düse, Druckplatte, Luftpolsterfolie" required></label>
        <label class="field"><span>Betrag (€)</span><input name="amount" inputmode="decimal" value="${expense ? esc(x.amount.toFixed(2).replace('.', ',')) : ''}" required></label>
        <label class="field"><span>Datum</span><input name="date" type="date" value="${esc(x.date)}"></label>
        <label class="field full"><span>Art</span><select name="category">${EXPENSE_CATEGORIES.map((c) => `<option ${c === x.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      </div>`,
    foot: `${expense ? '<button type="button" class="btn danger" data-del>Löschen</button>' : ''}<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Speichern</button>`,
    onReady(dlg) {
      dlg.querySelector('[data-del]')?.addEventListener('click', async () => {
        try {
          ctx.data.expenses = (await ctx.app.backend.deleteExpense(expense.id)).expenses;
          dlg.close();
          draw();
          toast('Ausgabe gelöscht');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
    async onSubmit(form) {
      const f = form.elements;
      const amount = parseNum(f.amount.value);
      if (!f.title.value.trim()) throw new Error('Bitte eintragen, wofür die Ausgabe war.');
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Bitte einen Betrag in Euro eingeben, z. B. 12,99.');
      const body = {
        title: f.title.value.trim(), amount, date: f.date.value || localDay(), category: f.category.value,
      };
      const res = expense ? await ctx.app.backend.updateExpense(expense.id, body) : await ctx.app.backend.addExpense(body);
      ctx.data.expenses = res.expenses;
      year = body.date.slice(0, 4);
      draw();
      toast(expense ? 'Ausgabe gespeichert' : `${body.title} eingetragen`);
    },
  });
}

function printYear(r) {
  const { settings } = ctx.app;
  const rows = r.entries.map((e) => `<tr><td>${dateDe(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.title)}</td>
    <td class="r">${e.kind === 'ein' ? fmtEur(e.amount) : ''}</td><td class="r">${e.kind === 'aus' ? fmtEur(e.amount) : ''}</td></tr>`).join('');
  const body = `
    <div class="head">
      <div>${settings.sellerName ? `<div class="label">Von</div><strong>${esc(settings.sellerName)}</strong><div class="addr">${esc(settings.sellerAddress)}</div>` : ''}</div>
      <div class="meta"><h1>Einnahmen und Ausgaben ${esc(r.year)}</h1><div>3D-Druck, erstellt am ${dateDe(localDay())}</div></div>
    </div>
    <table>
      <thead><tr><th>Art</th><th></th><th></th><th class="r">Einnahmen</th><th class="r">Ausgaben</th></tr></thead>
      <tbody>
        <tr><td colspan="3">Verkäufe (${plural(r.receipts, 'Beleg', 'Belege')})</td><td class="r">${fmtEur(r.income)}</td><td></td></tr>
        ${r.byCategory.map((c) => `<tr><td colspan="3">${esc(c.category)}</td><td></td><td class="r">${fmtEur(c.amount)}</td></tr>`).join('')}
        <tr class="total"><td colspan="3">Ergebnis ${fmtEur(r.result)}</td><td class="r">${fmtEur(r.income)}</td><td class="r">${fmtEur(r.spend)}</td></tr>
      </tbody>
    </table>
    <h2 style="font-size:16px;margin:28px 0 8px">Einzelaufstellung</h2>
    <table>
      <thead><tr><th>Datum</th><th>Art</th><th>Beschreibung</th><th class="r">Einnahme</th><th class="r">Ausgabe</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Keine Einträge.</td></tr>'}</tbody>
    </table>
    <div class="foot">
      ${settings.smallBusiness ? '<div>Kleinunternehmer nach § 19 UStG, keine Umsatzsteuer.</div>' : ''}
      <div>Filament nach Kaufpreis und Kaufdatum der Rollen, Strom nach den Stromabrechnungen, Porto aus den Versandpositionen der Belege.</div>
    </div>`;
  openDocument(`Einnahmen und Ausgaben ${r.year}`, body);
}

function onClick(e) {
  const b = e.target.closest('[data-year]');
  if (!b) return;
  const action = b.dataset.year;
  if (action === 'add') expenseDialog();
  if (action === 'csv') {
    download(`einnahmen-ausgaben-${year}.csv`, yearCsv(report()), 'text/csv;charset=utf-8');
  }
  if (action === 'print') printYear(report());
  const row = b.closest('.expense-row');
  const expense = row && ctx.data.expenses.find((x) => x.id === row.dataset.id);
  if (!expense) return;
  if (action === 'edit') expenseDialog(expense);
  if (action === 'delete') {
    openDialog({
      title: 'Ausgabe löschen?',
      body: `<p>${esc(expense.title)} über ${fmtEur(expense.amount)} vom ${dateDe(expense.date)} wird gelöscht.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn danger solid">Löschen</button>',
      async onSubmit() {
        ctx.data.expenses = (await ctx.app.backend.deleteExpense(expense.id)).expenses;
        draw();
        toast('Ausgabe gelöscht');
      },
    });
  }
}
