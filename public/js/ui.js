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
};

const nf = new Intl.NumberFormat('de-DE');
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmt = (n) => nf.format(Math.round(n));
export const fmtKg = (grams) => nf1.format(grams / 1000);

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
