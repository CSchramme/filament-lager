// Reiter "Drucke": Stromabrechnung für den, der den Strom zahlt, und der
// Druckverlauf aus der Bambu Cloud mit Kosten je Druck. Von hier gehen Drucke
// in den offenen Beleg oder auf Vorrat (Reiter "Verkauf").
import {
  jobQuote, openPower, priceQuote,
} from './domain.js';
import { openJob } from './calculator.js';
import { openPowerStatement } from './documents.js';
import { addPosition } from './sales.js';
import { addStockDialog } from './stock.js';
import {
  dateDe, esc, fmtCt, fmtDuration, fmtEur, fmtNum, localDay, openDialog, plural, tile, timeAgo, toast,
} from './ui.js';

const STATUS = { 2: ['ok', 'fertig'], 3: ['crit', 'abgebrochen'] };

let ctx = null; // { root, app, go }
let history = { connected: false, lastSync: '', tasks: [] };
let sales = [];
let payments = [];
let powerSince = ''; // abweichender Beginn der offenen Stromabrechnung (yyyy-mm-dd)

const today = () => localDay();

export async function renderPrints(root, app, { go }) {
  ctx = { root, app, go };
  root.innerHTML = `
    <section class="panel" id="power"><div class="panel-head"><h2>Strom</h2></div><p class="small muted">Lädt …</p></section>
    <section class="panel" id="history"><div class="panel-head"><h2>Druckverlauf von Bambu</h2></div><p class="small muted">Lädt …</p></section>`;
  root.querySelector('#power').addEventListener('click', onPowerClick);
  root.querySelector('#power').addEventListener('change', onPowerChange);
  root.querySelector('#history').addEventListener('click', onHistoryClick);
  try {
    let power;
    let s;
    [history, s, power] = await Promise.all([app.backend.tasks(), app.backend.sales(), app.backend.powerPayments()]);
    sales = s.sales;
    payments = power.payments;
  } catch (err) {
    toast(err.message, 'error');
  }
  updatePower();
  updateHistory();
}

// ---------------------------------------------------------------------------
// Strom für den, der ihn bezahlt

function currentPower() {
  return openPower({
    tasks: history.tasks, sales, payments, settings: ctx.app.settings, since: powerSince ? new Date(powerSince + 'T00:00:00').toISOString() : '',
  });
}

function updatePower() {
  const el = ctx.root.querySelector('#power');
  const { settings } = ctx.app;
  const who = settings.powerPayee;
  const p = currentPower();
  const source = p.source === 'verlauf'
    ? 'Gerechnet aus dem Bambu-Druckverlauf, auch abgebrochene Drucke.'
    : 'Ohne Bambu-Druckverlauf gerechnet aus den Belegen (nur verkaufte Teile).';
  el.innerHTML = `<div class="panel-head"><h2>Strom für ${esc(who)}</h2><p>${esc(who)} zahlt den Strom, hier steht, was ihm zusteht</p></div>
    <div class="stats sales-stats">
      ${tile('Offen', fmtEur(p.amount), `seit ${dateDe(p.from)}`)}
      ${tile('Strom in kWh', fmtNum(p.kwh, 2), `${fmtCt(settings.energyPrice)} ct pro kWh`)}
      ${tile('Druckzeit in Std.', fmtNum(p.hours, 1), `${fmtNum(settings.printerWatts, 0)} W beim Drucken`)}
      ${tile('Drucke', String(p.prints), payments.length ? `letzte Abrechnung ${dateDe(payments[0].date)}` : 'noch nie abgerechnet')}
    </div>
    <p class="small muted">${source} Watt und Strompreis stehen unter „Einstellungen“.</p>
    <div class="actions">
      <label class="inline-field"><span>Ab</span><input type="date" data-power="since" value="${esc(localDay(new Date(p.from)))}"></label>
      <button class="btn" type="button" data-power="show">Abrechnung ansehen</button>
      <button class="btn primary" type="button" data-power="pay" ${p.amount > 0 ? '' : 'disabled'}>${esc(fmtEur(p.amount))} an ${esc(who)} gegeben</button>
    </div>
    ${payments.length ? `<h3>Abgerechnet</h3><div class="sale-list">${payments.map((x) => `
      <div class="sale-row">
        <span class="num small muted">${dateDe(x.date)}</span>
        <button type="button" class="sale-title" data-power="view" data-id="${esc(x.id)}">${dateDe(x.from)} bis ${dateDe(x.to)}<span class="small muted"> · ${plural(x.prints, 'Druck', 'Drucke')}, ${fmtNum(x.kwh, 2)} kWh</span></button>
        <span class="num">${fmtEur(x.amount)}</span>
        <span></span>
        <button type="button" class="icon-btn" data-power="delete" data-id="${esc(x.id)}" aria-label="Abrechnung löschen">×</button>
      </div>`).join('')}</div>` : ''}`;
}

function onPowerChange(e) {
  if (e.target.dataset.power !== 'since') return;
  powerSince = e.target.value;
  updatePower();
}

function onPowerClick(e) {
  const b = e.target.closest('[data-power]');
  if (!b || b.dataset.power === 'since') return;
  const { settings } = ctx.app;
  const action = b.dataset.power;
  if (action === 'show') openPowerStatement(currentPower(), settings);
  if (action === 'pay') {
    const p = currentPower();
    openDialog({
      title: 'Strom abrechnen',
      body: `<p>${esc(fmtEur(p.amount))} für ${plural(p.prints, 'Druck', 'Drucke')} vom ${dateDe(p.from)} bis heute als an ${esc(settings.powerPayee)} gegeben speichern?</p>
        <p class="small muted">Die nächste Abrechnung beginnt dann jetzt. Die Abrechnung kannst du vorher mit „Abrechnung ansehen“ drucken.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn primary">Speichern</button>',
      async onSubmit() {
        const res = await ctx.app.backend.addPowerPayment({
          date: today(), from: p.from, to: p.to, prints: p.prints, hours: p.hours, kwh: p.kwh, amount: p.amount,
          energyPrice: p.energyPrice, printerWatts: p.printerWatts, rows: p.rows,
        });
        payments = res.payments;
        powerSince = '';
        updatePower();
        toast(`Abrechnung für ${settings.powerPayee} gespeichert`);
      },
    });
  }
  const paid = payments.find((x) => x.id === b.dataset.id);
  if (!paid) return;
  if (action === 'view') openPowerStatement(paid, settings, paid);
  if (action === 'delete') {
    openDialog({
      title: 'Abrechnung löschen?',
      body: `<p>Die Abrechnung vom ${dateDe(paid.date)} über ${fmtEur(paid.amount)} wird gelöscht. Die Drucke zählen dann wieder als offen.</p>`,
      foot: '<button type="button" class="btn" data-close>Abbrechen</button><span class="spacer"></span><button type="submit" class="btn danger solid">Löschen</button>',
      async onSubmit() {
        payments = (await ctx.app.backend.deletePowerPayment(paid.id)).payments;
        updatePower();
        toast('Abrechnung gelöscht');
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Druckverlauf

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
      <button class="btn small primary" type="button" data-task="add">Zum Beleg</button>
      <button class="btn small" type="button" data-task="stock">Auf Vorrat</button>
      <button class="btn small" type="button" data-task="calc">Im Rechner</button>
      <button class="btn small" type="button" data-task="reprint">Erneut drucken</button>
    </div>
  </article>`;
}

function updateHistory() {
  const el = ctx.root.querySelector('#history');
  const s = ctx.app.settings;
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
    <p class="small muted">Preis = Filament (Kaufpreis der passenden Rolle je Farbe), Strom, Drucker ${fmtEur(s.machineRate)} pro Stunde, ${fmtNum(s.failPct, 0)} % für Fehldrucke, ${fmtNum(s.laborMinutes, 0)} Min. Arbeit, dazu ${fmtNum(s.profitPct, 0)} % Gewinn. Das Filament zieht der Abgleich mit Bambu im Lager ab, sofern die Rollen dort verknüpft sind.</p>
    ${history.tasks.length ? `<div class="tasks">${history.tasks.map(taskCard).join('')}</div>` : '<p class="muted">Noch keine Drucke gefunden. „Aktualisieren“ holt den Verlauf von Bambu.</p>'}`;
}

async function onHistoryClick(e) {
  const h = e.target.closest('[data-history]');
  if (h && h.dataset.history === 'login') ctx.go('bambu');
  if (h && h.dataset.history === 'refresh') {
    h.disabled = true;
    try {
      history = await ctx.app.backend.refreshTasks();
      updateHistory();
      updatePower();
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
  if (b.dataset.task === 'add') addTaskDialog(task);
  if (b.dataset.task === 'stock') {
    // Ein Druck mit n Teilen auf der Platte: Gramm und Zeit pro Teil, Arbeit verteilt
    const q = quoteFor(task);
    const main = q.parts.filter((p) => p.spool).sort((a, c) => c.grams - a.grams)[0];
    addStockDialog(ctx.app, {
      title: task.title,
      qty: 1,
      perPlate: true,
      spool: main ? main.spool : null,
      quoteFor: (n) => priceQuote({
        grams: q.grams / n, perGram: q.perGram, seconds: q.seconds / n, qty: n,
      }, ctx.app.settings),
      onDone() {
        toast('Im Reiter „Verkauf“ unter „Vorrat“ zu finden');
      },
    });
  }
  if (b.dataset.task === 'reprint') reprintDialog(task);
}

// Druck auf den Beleg: Waren mehrere gleiche Teile auf der Platte, werden
// Gramm und Druckzeit auf die Teile verteilt.
function addTaskDialog(task) {
  const q = quoteFor(task);
  const main = q.parts.filter((p) => p.spool).sort((a, c) => c.grams - a.grams)[0];
  const quoteN = (n) => priceQuote({
    grams: q.grams / n, perGram: q.perGram, seconds: q.seconds / n, qty: n,
  }, ctx.app.settings);
  const count = (form) => Math.max(1, Math.round(Number(form.elements.per.value)) || 1);
  openDialog({
    title: 'Zum Beleg',
    body: `<p><strong>${esc(task.title)}</strong> · ${fmtNum(q.grams)} g${q.seconds ? ` · ${fmtDuration(q.seconds)}` : ''}</p>
      <div class="fields"><label class="field"><span>Gleiche Teile auf der Platte</span><input name="per" type="number" min="1" step="1" inputmode="numeric" value="1"></label></div>
      <p data-sum></p>
      <p class="small muted">Alle Teile kommen auf den Beleg. Willst du sie einzeln verkaufen, nimm im Druckverlauf „Auf Vorrat“.</p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Abbrechen</button><button type="submit" class="btn primary">Hinzufügen</button>',
    onReady(dlg, form) {
      const update = () => {
        const n = count(form);
        const r = quoteN(n);
        dlg.querySelector('[data-sum]').textContent = n > 1
          ? `${n} × ${fmtEur(r.piece)} = ${fmtEur(r.sum)} (pro Teil ${fmtNum(r.grams)} g, Selbstkosten ${fmtEur(r.cost)})`
          : `Preis ${fmtEur(r.piece)}, Selbstkosten ${fmtEur(r.cost)}`;
      };
      form.elements.per.addEventListener('input', update);
      update();
      form.elements.per.select();
    },
    onSubmit(form) {
      const n = count(form);
      const draft = addPosition({
        title: task.title, qty: n, grams: q.grams / n, seconds: q.seconds / n, perGram: q.perGram, spool: main ? main.spool : null, taskId: task.id,
      });
      toast(`${n > 1 ? `${n} × ` : ''}„${task.title}“ im offenen Beleg (${plural(draft.positions.length, 'Position', 'Positionen')}), zu finden unter „Verkauf“`);
    },
  });
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
      <p class="small muted">Danach hier „Zum Beleg“ tippen; der Preis ist schon berechnet.</p>`,
    foot: '<span class="spacer"></span><button type="button" class="btn" data-close>Schließen</button>',
  });
}
