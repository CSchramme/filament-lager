// Reste verwerten: Rollen mit wenig Filament und Teile, die noch reinpassen
// (aus dem Katalog und einfarbige Drucke aus dem Druckverlauf).
import { leftoverIdeas, spoolLabel } from './domain.js';
import {
  esc, fmt, openDialog, toast,
} from './ui.js';

export async function openLeftovers(app, { go } = {}) {
  let products = [];
  let tasks = [];
  try {
    products = (await app.backend.products()).products;
    if (app.backend.mode === 'server') tasks = (await app.backend.tasks()).tasks || [];
  } catch (err) {
    toast(err.message, 'error');
  }
  const list = leftoverIdeas({ spools: app.spools, products, tasks, settings: app.settings });
  const withIdeas = list.filter((r) => r.ideas.length);
  const without = list.filter((r) => !r.ideas.length);
  const dlg = openDialog({
    title: 'Reste verwerten',
    body: !list.length ? '<p>Keine Rolle mit wenig Rest. Alles gut gefüllt.</p>'
      : `<p class="small muted">Rollen mit höchstens 150 g oder „knapp“, dazu Teile, die noch reinpassen: zuerst die, bei denen am wenigsten übrig bleibt.
          Aus dem Katalog und aus einfarbigen Drucken im Druckverlauf.</p>
        <div class="rest-list">${withIdeas.map(({ spool: s, ideas }) => `<div class="rest-item">
          <div class="rest-spool"><span class="dot-color" style="background:${esc(s.colorHex)}"></span><strong>${esc(spoolLabel(s))}</strong><span class="num muted">${fmt(s.netWeight)} g</span></div>
          <ul>${ideas.map((i) => `<li><strong>${i.count} × ${esc(i.title)}</strong> <span class="small muted">je ${fmt(i.grams)} g, bleiben ${fmt(i.left)} g · ${i.source === 'katalog' ? 'Katalog' : 'Druckverlauf'}</span></li>`).join('')}</ul>
        </div>`).join('')}</div>
        ${without.length ? `<details><summary>Ohne passenden Vorschlag (${without.length})</summary><p class="small">${without.map(({ spool: s }) => `${esc(spoolLabel(s))} (${fmt(s.netWeight)} g)`).join(', ')}</p>
          <p class="small muted">Kleine Teile in den Katalog aufnehmen (mit Gramm), dann gibt es auch hier Vorschläge.</p></details>` : ''}`,
    foot: `${go ? '<button type="button" class="btn" data-go>Zum Katalog</button>' : ''}<span class="spacer"></span><button type="button" class="btn primary" data-close>Schließen</button>`,
  });
  dlg.querySelector('[data-go]')?.addEventListener('click', () => {
    dlg.close();
    go('katalog');
  });
}
