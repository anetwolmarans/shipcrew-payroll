/**
 * time.js — Time helpers.
 * RULE OF THE SYSTEM: every timestamp is STORED in UTC (world clock), and
 * DISPLAYED in Namibian time (Africa/Windhoek). This keeps records from
 * different devices consistent, even at sea across time zones.
 */
import { APP } from '../config.js';

export function nowISO() { return new Date().toISOString(); }

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP.timezone, day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP.timezone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function fmtDate(iso) { return iso ? dateFmt.format(new Date(iso)) : '—'; }
export function fmtTime(iso) { return iso ? timeFmt.format(new Date(iso)) : '—'; }
export function fmtDateTime(iso) { return iso ? dateTimeFmt.format(new Date(iso)) : '—'; }

/** "GMT+2"-style label for the display timezone, computed from the browser itself. */
export function tzOffsetLabel() {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: APP.timezone, timeZoneName: 'shortOffset' })
      .formatToParts().find(p => p.type === 'timeZoneName');
    return parts ? parts.value : 'Africa/Windhoek';
  } catch { return 'Africa/Windhoek'; }
}

/** Minutes → "8h 45m" (used for working-hour totals). */
export function minutesToHHMM(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return `${h}h ${String(r).padStart(2, '0')}m`;
}

/**
 * The calendar date (YYYY-MM-DD) an instant falls on, in Namibian local time.
 * Used to group clock events per day — a shift crossing midnight belongs to
 * the day its CLOCK-IN happened, and day boundaries follow Namibian time,
 * not the device's timezone.
 */
export function localDateKey(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP.timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(iso));
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Today's date key in Namibian local time. */
export function todayKey() { return localDateKey(nowISO()); }

/** Friendly relative time for lists ("3 min ago"). */
export function relativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDateTime(iso);
}
