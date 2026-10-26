// Kleine Helfer für die Oberfläche: Escaping, Symbole, Formate, Dialoge.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  scale: svg('<path d="M12 3v3M5 6h14M7 6l-3 7a3 3 0 0 0 6 0L7 6zM17 6l-3 7a3 3 0 0 0 6 0l-3-7zM8 21h8M12 6v15"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  down: svg('<path d="M12 4v12M6 11l6 6 6-6M5 20h14"/>'),
  up: svg('<path d="M12 20V8M6 13l6-6 6 6M5 4h14"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  file: svg('<path d="M14 3H6v18h12V7l-4-4z"/><path d="M14 3v4h4"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>'),
  qr: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>'),
  cart: svg('<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>'),
};

const nf = new Intl.NumberFormat('de-DE');
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmt = (n) => nf.format(Math.round(n));
export const fmtKg = (grams) => nf1.format(grams / 1000);
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const fmtEur = (v) => eur.format(v);
export const fmtNum = (v, digits = 1) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

export function fmtDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} Min.`;
  return `${Math.floor(m / 60)} Std. ${m % 60} Min.`;
}

export function timeAgo(iso) {
  if (!iso) return 'nie';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Spulen-Symbol: der Ring zeigt den Füllstand in der Filamentfarbe.
const RING_C = 2 * Math.PI * 15;
export function ring(hex, share) {
  const len = Math.max(0, Math.min(1, share || 0)) * RING_C;
  return `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true">`
    + `<circle class="track" cx="20" cy="20" r="15"/>`
    + `<circle class="fill" cx="20" cy="20" r="15" stroke="${esc(hex)}" stroke-dasharray="${len.toFixed(2)} ${RING_C.toFixed(2)}" transform="rotate(-90 20 20)"/>`
    + `<circle class="edge" cx="20" cy="20" r="18"/><circle class="edge" cx="20" cy="20" r="12"/>`
    + `<circle class="hub" cx="20" cy="20" r="6" fill="${esc(hex)}"/></svg>`;
}

export function toast(message, type = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 2800);
}

// Öffnet einen modalen Dialog. "onSubmit" darf asynchron sein; wirft er,
// bleibt der Dialog offen und die Meldung erscheint.
export function openDialog({ title, body, foot, onSubmit, onReady }) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form novalidate>
    <div class="dlg-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Schließen">${icons.x}</button></div>
    <div class="dlg-body">${body}</div>
    <div class="dlg-foot">${foot}</div>
  </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) dlg.close();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return dlg.close();
    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const keepOpen = await onSubmit(form, e.submitter);
      if (!keepOpen) dlg.close();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  dlg.showModal();
  if (onReady) onReady(dlg, form);
  return dlg;
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Excel speichert CSV je nach Auswahl als UTF-8 oder Windows-1252.
export async function readFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

// Nur Beträge austauschen, damit ein Eingabefeld beim Tippen den Fokus behält:
// Elemente mit data-k bekommen den Text, Elemente mit data-row das hidden.
export function patchText(el, html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  for (const fresh of tmp.querySelectorAll('[data-k]')) {
    const old = el.querySelector(`[data-k="${fresh.dataset.k}"]`);
    if (old) old.textContent = fresh.textContent;
  }
  for (const fresh of tmp.querySelectorAll('[data-row]')) {
    const old = el.querySelector(`[data-row="${fresh.dataset.row}"]`);
    if (old) old.hidden = fresh.hidden;
  }
}

// € pro kWh als Cent-Angabe: 0,3 -> "30", 0,3187 -> "31,87"
export const fmtCt = (eurPerKwh) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(eurPerKwh * 100);

// Auswahlfeld mit Suche: Tippen filtert die Liste, Pfeiltasten wählen, Enter
// übernimmt, Escape schließt. Eigene Werte sind erlaubt. options() liefert
// [{ value, hint }]; onPick(value) wird nach der Auswahl aufgerufen.
let comboSeq = 0;
export function combobox(input, { options, onPick = () => {}, newLabel = (v) => `„${v}“ neu anlegen` }) {
  const id = `combo-${++comboSeq}`;
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  input.replaceWith(wrap);
  wrap.append(input);
  const list = document.createElement('ul');
  list.className = 'combo-list';
  list.id = id;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.append(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', id);
  input.autocomplete = 'off';
  let items = [];
  let active = -1;
  let filtering = false; // erst nach dem Tippen filtern, beim Öffnen alles zeigen

  const words = (v) => v.toLowerCase().split(/\s+/).filter(Boolean);
  const render = () => {
    const q = filtering ? input.value.trim() : '';
    const all = options();
    items = all.filter((o) => words(q).every((w) => o.value.toLowerCase().includes(w)));
    if (q && !all.some((o) => o.value.toLowerCase() === q.toLowerCase())) items.push({ value: q, hint: '', isNew: true });
    // Markiert ist der aktuelle Wert, beim Tippen der beste Treffer, "neu anlegen" nur ohne Treffer
    active = items.length ? Math.max(0, items.findIndex((o) => !o.isNew && o.value === input.value)) : -1;
    list.replaceChildren(...items.map((o, i) => {
      const li = document.createElement('li');
      li.id = `${id}-${i}`;
      li.setAttribute('role', 'option');
      li.dataset.index = String(i);
      const name = document.createElement('span');
      name.textContent = o.isNew ? newLabel(o.value) : o.value;
      li.append(name);
      if (o.hint) {
        const hint = document.createElement('small');
        hint.textContent = o.hint;
        li.append(hint);
      }
      return li;
    }));
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'combo-empty';
      li.textContent = 'Nichts gefunden';
      list.append(li);
    }
    mark();
  };
  const mark = () => {
    list.querySelectorAll('[role="option"]').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    const cur = list.querySelector(`[data-index="${active}"]`);
    if (cur) {
      input.setAttribute('aria-activedescendant', cur.id);
      cur.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const open = () => {
    render();
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    list.hidden = true;
    filtering = false;
    input.setAttribute('aria-expanded', 'false');
  };
  const pick = (i) => {
    const o = items[i];
    if (!o) return;
    input.value = o.value;
    close();
    onPick(o.value);
  };
  input.addEventListener('focus', open);
  input.addEventListener('click', () => { if (list.hidden) open(); });
  input.addEventListener('input', () => {
    filtering = true;
    open();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open();
      else if (items.length) {
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        mark();
      }
    } else if (e.key === 'Enter' && !list.hidden && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      e.stopPropagation(); // nicht den Dialog schließen
      close();
    }
  });
  // mousedown statt click, damit das Feld den Fokus nicht vorher verliert
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[role="option"]');
    if (!li) return;
    e.preventDefault();
    pick(Number(li.dataset.index));
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!list.hidden) {
        close();
        onPick(input.value.trim());
      }
    }, 120);
  });
  return { open, close };
}
