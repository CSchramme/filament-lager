// Kundenseite farben.html: welche Filamentfarben gerade da sind, nach
// Material, und was bald kommt. Der Zugang steht im Link (farben.html#t=…)
// und geht als Header an den Server.
import { dateDe, esc } from './ui.js';

const view = document.getElementById('view');
const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';

function tileHtml(c, extra = '') {
  return `<li class="chart-color">
      <span class="color-dot" style="background:${esc(c.hex || '#9AA0A6')}"></span>
      <span class="color-name">${esc(c.name)}${extra}</span>
    </li>`;
}

async function load() {
  if (!token) {
    view.innerHTML = '<section class="panel"><h2>Kein Zugang</h2><p>Diese Seite braucht den vollständigen Link mit „#t=…“ am Ende.</p></section>';
    return;
  }
  let d;
  try {
    const res = await fetch('api/farbkarte', { headers: { 'X-Zugang': token }, cache: 'no-store' });
    d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || `Server antwortet mit ${res.status}.`);
  } catch (err) {
    view.innerHTML = `<section class="panel"><h2>Nicht verfügbar</h2><p>${esc(err.message)}</p></section>`;
    return;
  }
  const seller = d.seller || '3D-Druck';
  document.title = `Filamentfarben · ${seller}`;
  document.getElementById('brand').textContent = `Filamentfarben · ${seller}`;
  const count = d.materials.reduce((a, m) => a + m.colors.length, 0);
  view.innerHTML = `<section class="panel">
      <div class="panel-head"><h2>Diese Farben sind gerade da</h2><p>${count} Farben, Stand ${new Date(d.updatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</p></div>
      <p class="small muted">Einfach die Farbe beim Bestellen nennen. „Nur noch wenig“ reicht für kleine Teile; für Größeres lieber kurz nachfragen.</p>
    </section>
    ${d.materials.map((m) => `<section class="panel">
      <div class="panel-head"><h2>${esc(m.material)}</h2><p>${m.colors.length} ${m.colors.length === 1 ? 'Farbe' : 'Farben'}</p></div>
      <ul class="chart-colors">${m.colors.map((c) => tileHtml(c, c.level === 'wenig' ? '<small>nur noch wenig</small>' : '')).join('')}</ul>
    </section>`).join('') || '<section class="panel"><p>Gerade ist keine Farbe auf Lager.</p></section>'}
    ${d.coming.length ? `<section class="panel">
      <div class="panel-head"><h2>Kommt bald</h2><p>bestellt, noch unterwegs</p></div>
      <ul class="chart-colors">${d.coming.map((c) => tileHtml(c, `<small>${esc(c.material)}${c.expectedAt ? `, ab ${dateDe(c.expectedAt)}` : ''}</small>`)).join('')}</ul>
    </section>` : ''}`;
}

window.addEventListener('hashchange', () => location.reload());
load();
