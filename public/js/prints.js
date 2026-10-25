// Reiter "Drucke": Verkäufe mit Umsatz und Gewinn, darunter der Druckverlauf
// aus der Bambu Cloud mit Kosten je Druck.
import { jobQuote, salesSummary } from './domain.js';
import { openJob } from './calculator.js';
import { saleDialog } from './sales.js';
import {
  esc, fmtDuration, fmtEur, fmtNum, openDialog, timeAgo, toast,
} from './ui.js';

const STATUS = { 2: ['ok', 'fertig'], 3: ['crit', 'abgebrochen'] };

let ctx = null; // { root, app, go }
let history = { connected: false, lastSync: '', tasks: [] };
let sales = { sales: [], summary: salesSummary([]) };

export async function renderPrints(root, app, { go }) {
  ctx = { root, app, go };
  root.innerHTML = `
    <section class="panel" id="sales"><div class="panel-head"><h2>Verkäufe</h2></div><p class="small muted">Lädt …</p></section>
    <section class="panel" id="history"><div class="panel-head"><h2>Druckverlauf von Bambu</h2></div><p class="small muted">Lädt …</p></section>`;
  root.querySelector('#sales').addEventListener('click', onSalesClick);
  root.querySelector('#history').addEventListener('click', onHistoryClick);
  try {
    [history, sales] = await Promise.all([app.backend.tasks(), app.backend.sales()]);
  } catch (err) {
    toast(err.message, 'error');
  }
  updateSales();
  updateHistory();
}

function tile(label, value, hint = '') {
  return `<div class="stat"><span class="label">${label}</span><span class="value">${value}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
}

function updateSales() {
  const el = ctx.root.querySelector('#sales');
  const { summary } = sales;
  const m = summary.month;
  const t = summary.total;
  const monthName = new Date().toLocaleDateString('de-DE', { month: 'long' });
  el.innerHTML = `<div class="panel-head"><h2>Verkäufe</h2><button class="btn small" type="button" data-sales="add">Verkauf eintragen</button></div>
    <div class="stats sales-stats">
      ${tile(`Umsatz im ${esc(monthName)}`, fmtEur(m.revenue), `${m.pieces} Stück`)}
      ${tile(`Gewinn im ${esc(monthName)}`, fmtEur(m.profit), `Kosten ${fmtEur(m.cost)}`)}
      ${tile('Umsatz gesamt', fmtEur(t.revenue), `${t.count} ${t.count === 1 ? 'Verkauf' : 'Verkäufe'}, ${t.pieces} Stück`)}
      ${tile('Gewinn gesamt', fmtEur(t.profit), `Kosten ${fmtEur(t.cost)}`)}
    </div>
    ${sales.sales.length ? `<div class="sale-list">${sales.sales.slice(0, 50).map((s) => `
      <div class="sale-row">
        <span class="num small muted">${new Date(s.date).toLocaleDateString('de-DE')}</span>
        <span class="sale-title"><strong>${esc(s.title)}</strong>${s.qty > 1 ? ` <span class="muted">× ${s.qty}</span>` : ''}${s.customer ? `<span class="small muted"> · ${esc(s.customer)}</span>` : ''}</span>
        <span class="num">${fmtEur(s.price)}</span>
        <span class="num small ${s.price - s.cost >= 0 ? 'muted' : 'neg'}">${s.price - s.cost >= 0 ? '+' : ''}${fmtEur(s.price - s.cost)}</span>
        <button type="button" class="icon-btn" data-sales="delete" data-id="${esc(s.id)}" aria-label="Verkauf löschen">×</button>
      </div>`).join('')}</div>`
    : '<p class="small muted">Noch keine Verkäufe. Im Rechner oder hier im Druckverlauf auf „Verkaufen“ tippen.</p>'}`;
}

function quoteFor(task) {
  return jobQuote(task, ctx.app.spools, ctx.app.settings);
}

function taskCard(t) {
  const [dot, label] = STATUS[t.status] || ['', t.status === 0 ? 'unbekannt' : `Status ${t.status}`];
  const q = quoteFor(t);
  const date = t.startTime ? new Date(t.startTime).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const colors = q.parts.filter((p) => p.color).map((p) => `<span class="fil" title="${esc(p.type)}${p.slot ? ' · ' + esc(p.slot) : ''}">
      <span class="dot-color" style="background:${esc(p.color)}"></span>${fmtNum(p.grams)} g${p.spool ? ` <span class="muted">#${p.spool.nr}</span>` : ''}</span>`).join('');
  return `<article class="task" data-id="${esc(t.id)}">
    ${t.cover ? `<img class="task-cover" src="${esc(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="task-cover"></div>'}
    <div class="task-body">
      <div class="task-title"><strong>${esc(t.title)}</strong>${t.plate > 1 ? `<span class="muted small"> Platte ${t.plate}</span>` : ''}</div>
      <div class="status-line"><span><span class="dot ${dot}"></span>${esc(label)}</span><span>${esc(date)}</span>${t.deviceName ? `<span>${esc(t.deviceName)}</span>` : ''}
        <span class="num">${fmtNum(t.grams)} g</span>${t.seconds ? `<span class="num">${fmtDuration(t.seconds)}</span>` : ''}</div>
      ${colors ? `<div class="fils">${colors}</div>` : ''}
    </div>
    <div class="task-side">
      <span class="small muted">Preis</span><strong class="num">${fmtEur(q.piece)}</strong><span class="small muted">Kosten ${fmtEur(q.cost)}</span>
    </div>
    <div class="actions task-actions">
      <button class="btn small primary" type="button" data-task="sell">Verkaufen</button>
      <button class="btn small" type="button" data-task="calc">Im Rechner</button>
      <button class="btn small" type="button" data-task="reprint">Erneut drucken</button>
    </div>
  </article>`;
}

function updateHistory() {
  const el = ctx.root.querySelector('#history');
  const head = `<div class="panel-head"><h2>Druckverlauf von Bambu</h2>
    ${ctx.app.backend.mode === 'server' && history.connected ? `<span class="actions"><span class="small muted">Stand: ${esc(timeAgo(history.lastSync))}</span><button class="btn small" type="button" data-history="refresh">Aktualisieren</button></span>` : ''}</div>`;
  if (ctx.app.backend.mode !== 'server') {
    el.innerHTML = `${head}<p class="muted">Der Druckverlauf braucht den Lager-Server und eine Bambu-Anmeldung.</p>`;
    return;
  }
  if (!history.connected) {
    el.innerHTML = `${head}<p class="muted">Unter „Bambu“ anmelden, dann erscheinen hier deine Drucke mit Gramm, Druckzeit und Kosten.</p>
      <div class="actions"><button class="btn" type="button" data-history="login">Zur Bambu-Anmeldung</button></div>`;
    return;
  }
  el.innerHTML = `${head}
    <p class="small muted">Preis = Filament (Kaufpreis der passenden Rolle je Farbe) + Strom, dazu ${fmtNum(ctx.app.settings.wearPct, 0)} % Abnutzung und ${fmtNum(ctx.app.settings.profitPct, 0)} % Gewinn. Das Filament zieht der Abgleich mit Bambu im Lager ab, sofern die Rollen dort verknüpft sind.</p>
    ${history.tasks.length ? `<div class="tasks">${history.tasks.map(taskCard).join('')}</div>` : '<p class="muted">Noch keine Drucke gefunden. „Aktualisieren“ holt den Verlauf von Bambu.</p>'}`;
}

async function onSalesClick(e) {
  const b = e.target.closest('[data-sales]');
  if (!b) return;
  if (b.dataset.sales === 'add') {
    saleDialog(ctx.app, { title: '', qty: 1 }, (res) => {
      sales = res;
      updateSales();
    });
  }
  if (b.dataset.sales === 'delete') {
    const sale = sales.sales.find((s) => s.id === b.dataset.id);
    openDialog({
      title: 'Verkauf löschen?',
      body: `<p>${esc(sale.title)} vom ${new Date(sale.date).toLocaleDateString('de-DE')} über ${fmtEur(sale.price)} wird gelöscht.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn danger solid">Löschen</button>',
      async onSubmit() {
        sales = await ctx.app.backend.deleteSale(sale.id);
        updateSales();
        toast('Verkauf gelöscht');
      },
    });
  }
}

async function onHistoryClick(e) {
  const h = e.target.closest('[data-history]');
  if (h && h.dataset.history === 'login') ctx.go('bambu');
  if (h && h.dataset.history === 'refresh') {
    h.disabled = true;
    try {
      history = await ctx.app.backend.refreshTasks();
      updateHistory();
      toast('Druckverlauf aktualisiert');
    } catch (err) {
      toast(err.message, 'error');
      h.disabled = false;
    }
    return;
  }
  const b = e.target.closest('[data-task]');
  if (!b) return;
  const task = history.tasks.find((t) => t.id === b.closest('.task').dataset.id);
  if (b.dataset.task === 'calc') {
    openJob(task, ctx.app.spools);
    ctx.go('rechner');
  }
  if (b.dataset.task === 'sell') {
    const q = quoteFor(task);
    const main = q.parts.filter((p) => p.spool).sort((a, c) => c.grams - a.grams)[0];
    saleDialog(ctx.app, {
      title: task.title, qty: 1, unitPrice: q.piece, unitCost: q.cost, grams: q.grams, spoolNr: main ? main.spool.nr : null, taskId: task.id,
    }, (res) => {
      sales = res;
      updateSales();
    });
  }
  if (b.dataset.task === 'reprint') reprintDialog(task);
}

// Bambu lässt Druckstarts nur aus den eigenen Apps zu, deshalb hier nur der Weg dorthin.
function reprintDialog(task) {
  const link = task.designId ? `https://makerworld.com/de/models/${task.designId}` : '';
  openDialog({
    title: 'Erneut drucken',
    body: `<p>Einen Druck starten dürfen nur die Bambu-Apps selbst, andere Programme sperrt Bambu dafür.</p>
      <ol class="steps">
        <li>In <strong>Bambu Handy</strong> den Druckverlauf öffnen (über dein Profil).</li>
        <li>„${esc(task.title)}“ suchen und erneut drucken.</li>
      </ol>
      ${link ? `<p>Das Modell ist von MakerWorld: <a href="${esc(link)}" target="_blank" rel="noopener">auf MakerWorld öffnen</a></p>` : ''}
      <p class="small muted">Danach hier unter „Verkaufen“ den Verkauf eintragen; der Preis ist schon berechnet.</p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Schließen</button>',
  });
}
