// Erinnerung an Termine (Abholung, Lieferung) per ntfy: einmal, sobald der
// Termin weniger als 24 Stunden entfernt ist. Ein Termin, der gerade erst
// eingetragen wurde (vor weniger als einer Stunde), meldet sich nicht sofort.
import { appointmentLabel } from '../public/js/domain.js';

const DAY = 24 * 3600 * 1000;

export function checkAppointments({ store, notifier, now = new Date() }) {
  const t = now.getTime();
  let changed = false;
  for (const s of store.data.sales) {
    const a = s.order && s.order.appointment;
    if (!a || a.reminded || s.order.status === 'zugestellt') continue;
    const at = Date.parse(a.at);
    if (at <= t || at - t > DAY) continue;
    if (a.setAt && t - Date.parse(a.setAt) < 3600 * 1000) continue;
    a.reminded = now.toISOString();
    changed = true;
    const when = new Date(at).toLocaleString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
    });
    const who = s.customer ? s.customer.split('\n')[0] : 'ohne Kunde';
    notifier.notify('termin', {
      title: `${appointmentLabel(s.order.delivery)}: ${who}`,
      message: `${when} Uhr, Beleg ${s.nr} (${s.title})${a.note ? `. ${a.note}` : ''}`,
      tags: ['calendar'],
      priority: 3,
      view: 'verkauf',
    });
  }
  return changed;
}
