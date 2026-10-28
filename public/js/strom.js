// Nur-Lese-Seite strom.html: was der Drucker an Strom verbraucht hat und was
// davon offen ist, für den, der den Strom bezahlt. Der Zugang steht im Link
// (strom.html#t=…) und geht als Header an den Server.
import { openPowerStatement } from './documents.js';
import {
  dateDe, esc, fmtCt, fmtDuration, fmtEur, fmtNum, plural, tile, timeAgo,
} from './ui.js';

const view = document.getElementById('view');
const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';

const STATE = {
  RUNNING: 'druckt gerade', PREPARE: 'bereitet den Druck vor', PAUSE: 'pausiert', FINISH: 'fertig, wartet', FAILED: 'Druck abgebrochen', IDLE: 'bereit',
};

async function load() {
  if (!token) {
    view.innerHTML = '<section class="panel"><h2>Kein Zugang</h2><p>Diese Seite braucht den vollständigen Link mit „#t=…“ am Ende.</p></section>';
    return;
  }
  let d;
  try {
    const res = await fetch('api/strom-ansicht', { headers: { 'X-Zugang': token }, cache: 'no-store' });
    d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Server antwortet mit ${res.status}.`);
  } catch (err) {
    view.innerHTML = `<section class="panel"><h2>Nicht verfügbar</h2><p>${esc(err.message)}</p></section>`;
    return;
  }
  render(d);
}

function render(d) {
  const p = d.power;
  const settings = {
    powerPayee: d.payee, sellerName: d.seller, energyPrice: d.energyPrice, printerWatts: d.printerWatts,
  };
  document.title = `Strom für ${d.payee}`;
  document.getElementById('brand').textContent = `Strom für ${d.payee}`;
  const rows = [...p.rows].reverse();
  view.innerHTML = `<section class="panel">
      <div class="panel-head"><h2>Offen seit ${dateDe(p.from)}</h2><p>${d.seller ? `${esc(d.seller)} druckt, ` : ''}${esc(d.payee)} zahlt den Strom</p></div>
      <div class="stats sales-stats">
        ${tile('Offen', fmtEur(p.amount), `seit ${dateDe(p.from)}`)}
        ${tile('Strom', `${fmtNum(p.kwh, 2)} kWh`, `${fmtCt(d.energyPrice)} ct pro kWh`)}
        ${tile('Druckzeit', `${fmtNum(p.hours, 1)} Std.`, `${fmtNum(d.printerWatts, 0)} W beim Drucken`)}
        ${tile('Drucke', String(p.prints), d.payments.length ? `zuletzt abgerechnet ${dateDe(d.payments[0].date)}` : 'noch nie abgerechnet')}
      </div>
      ${d.printing.length ? `<p>${d.printing.map((x) => `<strong>${esc(x.name)}</strong>: ${esc(STATE[x.gcodeState] || x.gcodeState)}${x.gcodeState === 'RUNNING' && x.job ? ` „${esc(x.job)}“${x.progress !== null ? `, ${x.progress} %` : ''}` : ''}`).join(' · ')}</p>` : ''}
      <p class="small muted">Gerechnet mit ${fmtNum(d.printerWatts, 0)} W beim Drucken und ${fmtCt(d.energyPrice)} ct pro kWh${p.source === 'verlauf' ? ', aus dem Druckverlauf des Druckers, auch abgebrochene Drucke' : ''}.
        ${d.lastSync ? `Druckverlauf ${esc(timeAgo(d.lastSync))} abgerufen.` : ''}</p>
      <div class="actions"><button class="btn" type="button" data-act="statement">Abrechnung ansehen oder drucken</button><button class="btn ghost" type="button" data-act="reload">Aktualisieren</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Drucke seit ${dateDe(p.from)}</h2><p>${plural(p.prints, 'Druck', 'Drucke')}, neueste zuerst</p></div>
      ${rows.length ? `<div class="sale-list">${rows.slice(0, 100).map((r) => `<div class="sale-row power-row">
          <span class="num small muted">${dateDe(r.date)}</span>
          <span class="sale-title">${esc(r.title)}${r.status === 3 ? ' <span class="small muted">abgebrochen</span>' : ''}<span class="small muted"> · ${esc(fmtDuration(r.seconds))}, ${fmtNum(r.kwh, 2)} kWh</span></span>
          <span class="num">${fmtEur(r.amount)}</span>
        </div>`).join('')}</div>` : '<p class="small muted">Seit der letzten Abrechnung wurde nichts gedruckt.</p>'}
    </section>
    ${d.payments.length ? `<section class="panel">
      <div class="panel-head"><h2>Bisher abgerechnet</h2><p>zusammen ${fmtEur(d.payments.reduce((a, x) => a + x.amount, 0))}</p></div>
      <div class="sale-list">${d.payments.map((x, i) => `<div class="sale-row power-row">
          <span class="num small muted">${dateDe(x.date)}</span>
          <button type="button" class="sale-title" data-act="paid" data-i="${i}">${dateDe(x.from)} bis ${dateDe(x.to)}<span class="small muted"> · ${plural(x.prints, 'Druck', 'Drucke')}, ${fmtNum(x.kwh, 2)} kWh</span></button>
          <span class="num">${fmtEur(x.amount)}</span>
        </div>`).join('')}</div>
    </section>` : ''}`;
  view.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'statement') openPowerStatement(p, settings);
    if (b.dataset.act === 'reload') load();
    if (b.dataset.act === 'paid') {
      const x = d.payments[Number(b.dataset.i)];
      if (x) openPowerStatement(x, settings, x);
    }
  };
}

// Anderer Link in derselben Seite: neu laden
window.addEventListener('hashchange', () => location.reload());
load();
