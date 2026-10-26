// Anzeige einer DHL-Sendung (Belege an Kunden und Filament-Lieferungen).
import { trackingLabel } from './domain.js';
import { esc } from './ui.js';

export const timeDe = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Kurz für Listen: "unterwegs · Bonn", ohne Abfrage nur das Ende der Nummer
export function trackShort(t) {
  if (!t.status) return `…${t.number.slice(-6)}`;
  return [trackingLabel(t), t.place].filter(Boolean).join(' · ');
}

export function trackingHtml(t) {
  if (!t) return '';
  const head = t.status
    ? `<p><span class="pill track ${esc(t.status)}">${esc(trackingLabel(t))}</span> ${esc(t.statusText)}${t.place ? ` <span class="muted">(${esc(t.place)})</span>` : ''}</p>
      <p class="small muted">${t.updatedAt ? `Stand ${esc(timeDe(t.updatedAt))}. ` : ''}${t.checkedAt ? `Bei DHL nachgesehen ${esc(timeDe(t.checkedAt))}.` : ''}</p>`
    : '';
  const events = t.events.length > 1 ? `<details><summary>Verlauf (${t.events.length})</summary><ol class="track-events">${t.events.map((e) => `<li><span class="small muted num">${esc(timeDe(e.time))}</span> ${esc(e.text)}${e.place ? ` <span class="muted">· ${esc(e.place)}</span>` : ''}</li>`).join('')}</ol></details>` : '';
  return `${head}${t.error ? `<p class="small neg">${esc(t.error)}</p>` : ''}${events}`;
}
