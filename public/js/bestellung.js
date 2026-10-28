// Kundenseite bestellung.html: Stand einer Bestellung wie bei einem
// Versandhändler (eingegangen, in Bearbeitung, wird gedruckt, verpackt,
// versendet, zugestellt), mit Druckfortschritt und DHL-Sendung. Der Zugang
// steht im Link (bestellung.html#t=…) und geht als Header an den Server.
import { orderLabel, orderSteps, orderText } from './domain.js';
import {
  esc, fmtDuration, fmtEur,
} from './ui.js';

const view = document.getElementById('view');
const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
let timer = null;

const TRACK = {
  'pre-transit': 'angekündigt', transit: 'unterwegs', delivered: 'zugestellt', failure: 'Problem bei der Zustellung', unknown: 'noch keine Daten',
};
const dayLong = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '');

async function load() {
  if (!token) {
    view.innerHTML = '<section class="panel"><h2>Kein Zugang</h2><p>Diese Seite braucht den vollständigen Link mit „#t=…“ am Ende.</p></section>';
    return;
  }
  let d;
  try {
    const res = await fetch('api/bestellung', { headers: { 'X-Zugang': token }, cache: 'no-store' });
    d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Server antwortet mit ${res.status}.`);
  } catch (err) {
    view.innerHTML = `<section class="panel"><h2>Bestellung nicht gefunden</h2><p>${esc(err.message)}</p></section>`;
    return;
  }
  render(d);
  // Von selbst aktualisieren, beim Drucken öfter
  clearTimeout(timer);
  if (d.order.status !== 'zugestellt') timer = setTimeout(() => { if (!document.hidden) load(); else document.addEventListener('visibilitychange', load, { once: true }); }, d.live ? 20000 : 60000);
}

function liveHtml(live) {
  if (!live) return '';
  const pct = Number.isFinite(live.progress) ? Math.max(0, Math.min(100, live.progress)) : null;
  const bits = [
    live.layer && live.layers ? `Schicht ${live.layer} von ${live.layers}` : '',
    live.remaining > 0 ? `noch etwa ${fmtDuration(live.remaining * 60)}` : '',
    live.state === 'PAUSE' ? 'gerade pausiert' : '',
  ].filter(Boolean).join(' · ');
  return `<div class="order-live">
      <div class="order-live-head"><strong>${live.state === 'PREPARE' ? 'Drucker bereitet sich vor' : 'Druckt gerade'}</strong>${pct !== null ? `<span class="num">${pct} %</span>` : ''}</div>
      ${pct !== null ? `<div class="meter order-meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>` : ''}
      ${bits ? `<span class="small muted">${esc(bits)}</span>` : ''}
    </div>`;
}

function stepsHtml(o) {
  const steps = orderSteps(o.delivery);
  const cur = steps.indexOf(o.status);
  const at = (s) => {
    const h = [...o.history].reverse().find((x) => x.status === s);
    return h ? h.at : '';
  };
  return `<ol class="order-steps">${steps.map((s, i) => {
    const state = i < cur ? 'done' : i === cur ? (s === 'zugestellt' ? 'done' : 'current') : 'todo';
    const when = i <= cur ? at(s) : '';
    return `<li class="order-step" data-state="${state}"${i === cur ? ' aria-current="step"' : ''}>
      <span class="order-dot" aria-hidden="true">${state === 'done' ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</span>
      <span class="order-step-text"><strong>${esc(orderLabel(s, o.delivery))}</strong>${when ? `<span class="small muted">${esc(stamp(when))}</span>` : ''}</span>
    </li>`;
  }).join('')}</ol>`;
}

function trackingHtml(t) {
  if (!t) return '';
  return `<section class="panel">
      <div class="panel-head"><h2>Sendung</h2><p>DHL ${esc(t.number)}</p></div>
      ${t.status ? `<p><span class="pill track ${esc(t.status)}">${esc(TRACK[t.status] || t.status)}</span> ${esc(t.statusText)}${t.place ? ` <span class="muted">(${esc(t.place)})</span>` : ''}</p>
        ${t.updatedAt ? `<p class="small muted">Stand ${esc(stamp(t.updatedAt))}</p>` : ''}` : '<p class="small muted">Den genauen Stand zeigt DHL, sobald das Paket abgegeben ist.</p>'}
      ${t.events.length ? `<ol class="track-events">${t.events.map((e) => `<li><span class="small muted num">${esc(stamp(e.time))}</span> ${esc(e.text)}${e.place ? ` <span class="muted">· ${esc(e.place)}</span>` : ''}</li>`).join('')}</ol>` : ''}
      <div class="actions"><a class="btn" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Bei DHL verfolgen</a></div>
    </section>`;
}

function render(d) {
  const o = d.order;
  const seller = d.seller || '3D-Druck';
  document.title = `Bestellung ${d.nr} · ${seller}`;
  document.getElementById('brand').textContent = seller;
  // Voraussichtliches Datum, solange es noch etwas zu warten gibt
  const waiting = o.status !== 'zugestellt' && !(o.delivery === 'abholung' && o.status === 'fertig');
  const expect = o.expectedAt && waiting
    ? `<p class="order-expect">${o.delivery === 'abholung' ? 'Voraussichtlich abholbereit' : 'Voraussichtlich da'}: <strong>${esc(dayLong(o.expectedAt))}</strong></p>` : '';
  view.innerHTML = `<section class="panel order-hero">
      <p class="small muted">Bestellung ${esc(d.nr)} vom ${esc(new Date(d.date + 'T12:00:00').toLocaleDateString('de-DE'))}${d.customer ? ` · für ${esc(d.customer)}` : ''}</p>
      <h1>${esc(orderLabel(o.status, o.delivery))}</h1>
      <p>${esc(orderText(o.status, o.delivery))}</p>
      ${expect}
      ${liveHtml(d.live)}
      ${stepsHtml(o)}
    </section>
    ${o.note ? `<section class="panel"><div class="panel-head"><h2>Nachricht von ${esc(seller)}</h2></div><p class="order-note">${esc(o.note)}</p></section>` : ''}
    ${trackingHtml(d.tracking)}
    <section class="panel">
      <div class="panel-head"><h2>Inhalt</h2><p>${d.items.reduce((a, i) => a + i.qty, 0)} Teil${d.items.reduce((a, i) => a + i.qty, 0) === 1 ? '' : 'e'}</p></div>
      <ul class="order-items">${d.items.map((i) => `<li>
          <span class="order-swatch" style="background:${esc(i.colorHex || 'var(--surface-2)')}"></span>
          <span><strong>${i.qty} × ${esc(i.title)}</strong>${i.material || i.colorName ? `<span class="small muted"> ${esc([i.material, i.colorName].filter(Boolean).join(', '))}</span>` : ''}</span>
        </li>`).join('')}</ul>
      <div class="calc-total"><span>Summe</span><strong class="num">${fmtEur(d.price)}</strong></div>
    </section>
    <p class="small muted order-foot">${d.contact ? `Fragen? ${esc(seller)}, ${esc(d.contact.replace(/\n+/g, ', '))}. ` : ''}Diese Seite aktualisiert sich von selbst.</p>`;
}

window.addEventListener('hashchange', () => location.reload());
load();
