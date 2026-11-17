/**
 * hours.service.js — Working hours engine (Phase 4: Working Hours & Catch).
 *
 * PLAIN ENGLISH: this module turns raw clock-in/clock-out records into
 * PAYROLL-READY hour categories — automatically, from rules, never by hand:
 *
 *   1. HOUR CATEGORIES — every closed clock event is split, minute by
 *      minute, into the five categories:
 *        ordinary        — the first N hours of a local day (default 9 h)
 *        overtime        — time beyond the daily ordinary allowance
 *        night           — minutes between 22:00 and 05:00 Namibian time
 *        sunday          — minutes on a Sunday beyond the daily allowance
 *        public_holiday  — minutes on an official Namibian public holiday
 *        beyond the daily allowance
 *      A minute lands in AT MOST ONE category. Splits happen automatically
 *      at midnight (a shift belongs to the day of its CLOCK-IN, but its
 *      minutes after midnight count on the new day), at the night window,
 *      at Sundays and at public holidays.
 *
 *   2. BREAKS & REST — the crew member can pause a running shift (break
 *      records); break minutes do not count as worked time. Gaps between
 *      two shifts shorter than the rest threshold (default 11 h) raise a
 *      rest-period WARNING — visible, never silently ignored.
 *
 *   3. SUPERVISOR CORRECTIONS — a supervisor may CORRECT a clock event with
 *      a reason. The original clock-in/out is PRESERVED inside the record
 *      (originalClockInAt / originalClockOutAt) and every correction is
 *      appended to its correctionHistory — nothing is overwritten, ever.
 *
 *   4. The calculation is DETERMINISTIC: the same closed event + the same
 *      holiday calendar + the same settings always give the same answer.
 *      Category MINUTES are recorded on the event itself, so payroll
 *      (Phase 5) can price them from the statutory rules.
 *
 * PAY RATES ARE NOT CALCULATED HERE. Categories are recorded in minutes;
 * what an hour of night work pays is a statutory/contract matter for
 * Phase 5, from verified rules only.
 */
import { get, getAll, put, STORES } from './idb.js';
import { nowISO, minutesToHHMM, localDateKey } from './time.js';
import { uuid } from './security.js';
import {
  DEFAULT_HOURS_SETTINGS, NAMIBIA_PUBLIC_HOLIDAYS,
  SYNC_STATUS
} from '../config.js';
import { queueForSync } from './sync.service.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';
import { currentSession } from './auth.service.js';
import { emit } from './events.js';

/* ============================ settings ============================ */

/** Working-hours rules (company policy, editable in Settings). */
export async function getHoursSettings() {
  const rec = await get(STORES.META, 'hoursSettings');
  return { ...DEFAULT_HOURS_SETTINGS, ...(rec?.value || {}) };
}

export async function saveHoursSettings(patch) {
  const current = await getHoursSettings();
  const value = { ...current, ...patch };
  await put(STORES.META, { id: 'hoursSettings', value });
  await logAction(AUDIT_ACTIONS.SETTINGS_CHANGED,
    `Working-hours rules updated: ${Object.keys(patch).join(', ')}. All hour categories are recalculated from the new rules.`);
  emit('data:changed', { store: 'meta', id: 'hoursSettings' });
  return value;
}

/* ======================= public-holiday calendar ======================= */

/** Easter Sunday for a year (Anonymous Gregorian algorithm). */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * The Namibian public holidays of a year as local date keys.
 * Map<YYYY-MM-DD, holiday name> — includes the Monday-after-Sunday rule.
 * (Rule-based, not a hard-coded list: works for every year.)
 */
export function namibianHolidays(year) {
  const cal = {};
  for (const f of NAMIBIA_PUBLIC_HOLIDAYS.fixed) {
    cal[`${year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`] = f.name;
  }
  const { month, day } = easterSunday(year);
  const easter = new Date(Date.UTC(year, month - 1, day));
  for (const v of NAMIBIA_PUBLIC_HOLIDAYS.easterBased) {
    const d = new Date(easter.getTime() + v.offset * 86400000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    cal[key] = v.name;
  }
  if (NAMIBIA_PUBLIC_HOLIDAYS.mondayRule) {
    for (const key of Object.keys(cal)) {
      const [y, m, d] = key.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (dow === 0) {
        const monday = new Date(Date.UTC(y, m - 1, d + 1));
        const mk = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
        if (!cal[mk]) cal[mk] = `${cal[key]} (Monday)`;
      }
    }
  }
  return cal;
}

/* The holiday calendars the engine needs, cached per year. */
const _holidayCache = new Map();
function holidaysFor(year) {
  if (!_holidayCache.has(year)) _holidayCache.set(year, namibianHolidays(year));
  return _holidayCache.get(year);
}

/* ====================== local-time helpers ====================== */

const DATE_OPTS = { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' };
const TIME_OPTS = { timeZone: 'Africa/Windhoek', hour: '2-digit', minute: '2-digit', hour12: false };

function localParts(ms) {
  const d = new Date(ms);
  const dp = new Intl.DateTimeFormat('en-CA', DATE_OPTS).formatToParts(d);
  const tp = new Intl.DateTimeFormat('en-GB', TIME_OPTS).formatToParts(d);
  const g = (parts, t) => parts.find(p => p.type === t)?.value || '0';
  return {
    dateKey: `${g(dp, 'year')}-${g(dp, 'month')}-${g(dp, 'day')}`,
    weekday: new Date(Date.UTC(Number(g(dp, 'year')), Number(g(dp, 'month')) - 1, Number(g(dp, 'day')))).getUTCDay(),
    minuteOfDay: Number(g(tp, 'hour')) * 60 + Number(g(tp, 'minute'))
  };
}

/** UTC milliseconds of a local wall-clock moment (dateKey + minute of day).
 *  Starts from the UTC+2 assumption, then refines — so historical DST
 *  offsets (before Namibia abolished DST in 2017) still resolve correctly. */
function localToUTC(dateKey, minuteOfDay) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const hh = Math.floor(minuteOfDay / 60), mm = minuteOfDay % 60;
  let guess = Date.UTC(y, m - 1, d, hh, mm) - 2 * 3600000;
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess);
    if (p.dateKey === dateKey && p.minuteOfDay === minuteOfDay) break;
    const [py, pm, pd] = p.dateKey.split('-').map(Number);
    const drift = Date.UTC(y, m - 1, d, hh, mm)
      - Date.UTC(py, pm - 1, pd, Math.floor(p.minuteOfDay / 60), p.minuteOfDay % 60);
    if (!drift) break;
    guess += drift;
  }
  return guess;
}

/** The local date key after dateKey. */
function nextDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/* ===================== the classification engine ===================== */

/**
 * Split one closed event into category minutes.
 * Walks the event in NAMIBIAN LOCAL TIME, jumping from boundary to boundary
 * (midnight, night-window edges, ordinary-allowance exhaustion, event end)
 * — never minute by minute, so long sea shifts classify instantly.
 * A minute lands in AT MOST ONE category, priority:
 *   public_holiday > sunday > night > overtime > ordinary
 * Ordinary allowance is per local day. `ordinaryUsedByDate` (optional map
 * of dateKey → minutes already worked as ordinary on that day by earlier
 * events) lets overlapping events share the day's allowance correctly —
 * including the tail of a shift that crossed midnight.
 */
export function classifyEvent(event, settings, ordinaryUsedByDate = null) {
  const cats = { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0 };
  if (!event?.clockInAt || !event?.clockOutAt) return { cats, splitDays: {} };

  const start = new Date(event.clockInAt).getTime();
  const end = new Date(event.clockOutAt).getTime();
  if (end <= start) return { cats, splitDays: {} };

  const dailyAllowance = settings.ordinaryDailyHours * 60;
  const ns = Number(settings.nightStartMinute), ne = Number(settings.nightEndMinute);
  const spansMidnight = ns > ne;   // e.g. 22:00 → 05:00

  const dayTotals = {};
  const ensureDay = (dateKey) => {
    if (!dayTotals[dateKey]) {
      dayTotals[dateKey] = { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0, holidayName: null };
    }
    return dayTotals[dateKey];
  };

  let t = start;
  let cur = localParts(t);
  let ordinaryLeft = Math.max(0, dailyAllowance - (ordinaryUsedByDate?.[cur.dateKey] || 0));
  ensureDay(cur.dateKey);

  while (t < end) {
    const p = localParts(t);
    if (p.dateKey !== cur.dateKey) {
      cur = p;
      ordinaryLeft = Math.max(0, dailyAllowance - (ordinaryUsedByDate?.[cur.dateKey] || 0));
      ensureDay(cur.dateKey);
    } else {
      cur = p;   // same day — still refresh minute-of-day (it advances with t)
    }
    const holidays = holidaysFor(Number(cur.dateKey.slice(0, 4)));
    const isHoliday = !!holidays[cur.dateKey];
    const isSunday = cur.weekday === 0;
    const mod = cur.minuteOfDay;
    const inNight = spansMidnight ? (mod >= ns || mod < ne) : (mod >= ns && mod < ne);

    let cat;
    if (isHoliday) cat = 'public_holiday';
    else if (isSunday) cat = 'sunday';
    else if (inNight) cat = 'night';
    else if (ordinaryLeft > 0) cat = 'ordinary';
    else cat = 'overtime';

    /* Next boundary: local midnight, night-window edge, allowance end, or
       the event's own end — whichever comes first. */
    let boundary = end;
    const midnightTonight = localToUTC(nextDateKey(cur.dateKey), 0);
    if (midnightTonight > t) boundary = Math.min(boundary, midnightTonight);
    if (inNight) {
      if (!spansMidnight) {
        boundary = Math.min(boundary, localToUTC(cur.dateKey, ne));
      } else if (mod < ne) {
        const dawn = localToUTC(cur.dateKey, ne);
        if (dawn > t) boundary = Math.min(boundary, dawn);
      }
      /* evening part of a midnight-spanning window (mod ≥ ns): night runs
         into the next local day — the midnight rollover handles the rest */
    } else if (spansMidnight) {
      const dusk = localToUTC(cur.dateKey, ns);
      if (dusk > t) boundary = Math.min(boundary, dusk);
    } else if (mod < ns) {
      const dusk = localToUTC(cur.dateKey, ns);
      if (dusk > t) boundary = Math.min(boundary, dusk);
    }
    if (cat === 'ordinary') boundary = Math.min(boundary, t + ordinaryLeft * 60000);

    const chunkEnd = Math.min(boundary, end);
    /* Guarantee progress: even if a boundary mis-computes to ≤ t, advance
       one minute so the loop can never spin. */
    const safeEnd = Math.max(chunkEnd, t + 60000);
    const minutes = Math.max(0, Math.round((Math.min(safeEnd, end) - t) / 60000));
    if (minutes > 0) {
      dayTotals[cur.dateKey][cat] += minutes;
      cats[cat] += minutes;
      if (cat === 'ordinary') ordinaryLeft -= minutes;
      if (isHoliday) dayTotals[cur.dateKey].holidayName = holidays[cur.dateKey];
    }
    t = Math.min(safeEnd, end);
  }
  return { cats, splitDays: dayTotals };
}

/** Sum of two category objects. */
export function sumCats(a, b) {
  const out = { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0 };
  for (const k of Object.keys(out)) out[k] = (a?.[k] || 0) + (b?.[k] || 0);
  return out;
}

/**
 * All closed clock events of one crew member on/starting on a local date,
 * classified. Returns per-event categories and the day total. Used by the
 * attendance screen and (later) payroll.
 */
export async function dayCategoriesFor(employeeId, dateKey, settings) {
  const cfg = settings || await getHoursSettings();
  const events = (await getAll(STORES.CLOCK_EVENTS))
    .filter(e => e.employeeId === employeeId && e.status === 'closed' && localDateKey(e.clockInAt) === dateKey)
    .sort((a, b) => String(a.clockInAt).localeCompare(String(b.clockInAt)));

  // Breaks on the same date reduce worked minutes.
  const breaks = (await getAll(STORES.BREAK_RECORDS))
    .filter(b => b.employeeId === employeeId && localDateKey(b.startedAt) === dateKey && b.status === 'closed');

  // Ordinary allowance is shared per local DAY across events, including the
  // tail of midnight-crossing shifts: track consumption per date key.
  const usedByDate = {};
  const rows = [];
  for (const e of events) {
    const gross = e.durationMinutes || 0;
    const brk = breaks
      .filter(b => b.clockEventId === e.id)
      .reduce((s, b) => s + (b.durationMinutes || 0), 0);
    const net = Math.max(0, gross - brk);
    // Classify the event with its break minutes subtracted proportionally
    // (simple, deterministic: shrink the event to its net minutes).
    const shrunk = { ...e, clockOutAt: new Date(new Date(e.clockInAt).getTime() + net * 60000).toISOString() };
    const { cats, splitDays } = classifyEvent(shrunk, cfg, usedByDate);
    for (const [dk, tot] of Object.entries(splitDays)) usedByDate[dk] = (usedByDate[dk] || 0) + tot.ordinary;
    rows.push({ event: e, grossMinutes: gross, breakMinutes: brk, netMinutes: net, cats });
  }
  const total = rows.reduce((acc, r) => sumCats(acc, r.cats), { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0 });
  return { rows, total, breaksTotal: breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0) };
}

/**
 * REST-PERIOD CHECK: minutes of rest between two consecutive closed events
 * of the same person. Below the threshold → warning (never blocks: at sea
 * reality wins; the warning is recorded and visible).
 */
export function restMinutesBetween(eventA, eventB) {
  if (!eventA?.clockOutAt || !eventB?.clockInAt) return null;
  return Math.max(0, Math.round((new Date(eventB.clockInAt) - new Date(eventA.clockOutAt)) / 60000));
}

/* ============================ breaks ============================ */

/** Persist + queue + audit (same pattern as operations.service.js). */
async function persist(storeName, record, collection, type, auditAction, auditDetails) {
  await put(storeName, record);
  queueForSync(record, collection, type)
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  if (auditAction) await logAction(auditAction, auditDetails);
  emit('data:changed', { store: storeName, id: record.id });
  return record;
}

function sessionBrief() {
  const s = currentSession();
  return {
    userId: s?.userId || 'unknown',
    name: s?.fullName || 'Unknown user',
    deviceName: s?.deviceName || '-'
  };
}

/** My open break for a clock event (null if not on break). */
export async function myOpenBreak(clockEventId) {
  return (await getAll(STORES.BREAK_RECORDS))
    .find(b => b.clockEventId === clockEventId && b.status === 'open') || null;
}

export async function myBreaks(userId, limit = 20) {
  return (await getAll(STORES.BREAK_RECORDS))
    .filter(b => b.userId === userId)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, limit);
}

/** START BREAK — only while clocked in, not already on a break. */
export async function startBreak() {
  const who = sessionBrief();
  const openEvents = (await getAll(STORES.CLOCK_EVENTS))
    .filter(e => e.userId === who.userId && e.status === 'open');
  const event = openEvents[0];
  if (!event) throw new Error('You must be clocked in before you can start a break.');
  const existing = await myOpenBreak(event.id);
  if (existing) throw new Error('You are already on a break. End it first.');

  const record = {
    id: uuid(),
    userId: who.userId, employeeId: event.employeeId, crewName: event.crewName,
    clockEventId: event.id, tripId: event.tripId, tripRef: event.tripRef,
    vesselName: event.vesselName,
    startedAt: nowISO(), endedAt: null, durationMinutes: null,
    status: 'open',
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  await persist(STORES.BREAK_RECORDS, record, 'break_records', 'break_record',
    AUDIT_ACTIONS.BREAK_STARTED,
    `${event.crewName} started a break — trip ${event.tripRef}, ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Windhoek', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())} Namibian time.`);
  return record;
}

/** END BREAK — closes the open break. */
export async function endBreak() {
  const who = sessionBrief();
  const open = (await getAll(STORES.BREAK_RECORDS))
    .find(b => b.userId === who.userId && b.status === 'open');
  if (!open) throw new Error('No open break found.');
  const durationMinutes = Math.max(0, Math.round((Date.now() - new Date(open.startedAt)) / 60000));
  const next = {
    ...open,
    endedAt: nowISO(), durationMinutes, status: 'closed',
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  await persist(STORES.BREAK_RECORDS, next, 'break_records', 'break_record',
    AUDIT_ACTIONS.BREAK_ENDED,
    `${open.crewName} ended a break — ${minutesToHHMM(durationMinutes)}.`);
  return next;
}

/* ===================== supervisor corrections ===================== */

/**
 * CORRECT a closed clock event (supervisor+, with a mandatory reason).
 * The original times are preserved on the record; every correction is
 * appended to correctionHistory and audited. Never deletes anything.
 */
export async function correctClockEvent(eventId, { clockInAt, clockOutAt, reason }) {
  if (!reason || !String(reason).trim()) throw new Error('A reason is required for every correction.');
  const event = await get(STORES.CLOCK_EVENTS, eventId);
  if (!event) throw new Error('Clock event not found.');
  if (event.status !== 'closed') throw new Error('Only completed (clocked-out) events can be corrected. Ask the crew member to clock out first.');

  const inAt = clockInAt || event.clockInAt;
  const outAt = clockOutAt || event.clockOutAt;
  if (new Date(outAt) - new Date(inAt) <= 0) throw new Error('The corrected clock-out must be after the corrected clock-in.');

  const who = sessionBrief();
  const before = {
    clockInAt: event.clockInAt, clockOutAt: event.clockOutAt,
    durationMinutes: event.durationMinutes, categories: event.categories || null
  };

  // Recalculate the whole event from the corrected times + breaks + settings.
  const settings = await getHoursSettings();
  const breaks = (await getAll(STORES.BREAK_RECORDS))
    .filter(b => b.clockEventId === eventId && b.status === 'closed');
  const brk = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
  const net = Math.max(0, (new Date(outAt) - new Date(inAt)) / 60000 - brk);
  const shrunk = { clockInAt: inAt, clockOutAt: new Date(new Date(inAt).getTime() + Math.round(net) * 60000).toISOString() };
  const { cats } = classifyEvent(shrunk, settings, null);

  const entry = {
    id: uuid(),
    at: nowISO(), by: who.name, byRole: currentSession()?.role || '-',
    reason: String(reason).trim(),
    changes: {
      clockInAt: inAt !== event.clockInAt ? { from: event.clockInAt, to: inAt } : null,
      clockOutAt: outAt !== event.clockOutAt ? { from: event.clockOutAt, to: outAt } : null
    }
  };

  const next = {
    ...event,
    clockInAt: inAt, clockOutAt: outAt,
    durationMinutes: Math.max(0, Math.round((new Date(outAt) - new Date(inAt)) / 60000)),
    netWorkedMinutes: Math.round(net),
    breakMinutes: brk,
    categories: cats,
    originalClockInAt: event.originalClockInAt || (inAt !== event.clockInAt ? event.clockInAt : null),
    originalClockOutAt: event.originalClockOutAt || (outAt !== event.clockOutAt ? event.clockOutAt : null),
    correctionHistory: [...(event.correctionHistory || []), entry],
    corrected: true,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  await persist(STORES.CLOCK_EVENTS, next, 'clock_events', 'clock_event',
    AUDIT_ACTIONS.ATTENDANCE_CORRECTED,
    `Clock event of ${event.crewName} (${event.tripRef}) corrected by ${who.name}: ${minutesToHHMM(before.durationMinutes)} → ${minutesToHHMM(next.durationMinutes)}. Reason: ${entry.reason}`);
  return next;
}

/**
 * Recalculate and stamp categories on one closed event (no time change).
 * Breaks are subtracted; categories are stored on the event for payroll.
 */
export async function reclassifyEvent(eventId) {
  const event = await get(STORES.CLOCK_EVENTS, eventId);
  if (!event) throw new Error('Clock event not found.');
  if (event.status !== 'closed') return event;
  const settings = await getHoursSettings();
  const breaks = (await getAll(STORES.BREAK_RECORDS))
    .filter(b => b.clockEventId === eventId && b.status === 'closed');
  const brk = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
  const net = Math.max(0, (event.durationMinutes || 0) - brk);
  const shrunk = { clockInAt: event.clockInAt, clockOutAt: new Date(new Date(event.clockInAt).getTime() + net * 60000).toISOString() };
  const { cats } = classifyEvent(shrunk, settings, null);
  const next = {
    ...event,
    breakMinutes: brk, netWorkedMinutes: Math.round(net), categories: cats,
    updatedAt: nowISO(), updatedBy: 'hours engine',
    syncStatus: SYNC_STATUS.LOCAL
  };
  await put(STORES.CLOCK_EVENTS, next);
  queueForSync(next, 'clock_events', 'clock_event')
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  return next;
}

/**
 * Recalculate every closed event of a trip (call when settings change or a
 * trip goes to review). Deterministic: same inputs → same categories.
 * Ordinary allowance is shared per local day across all events of the day.
 */
export async function reclassifyTrip(tripId) {
  const settings = await getHoursSettings();
  const events = (await getAll(STORES.CLOCK_EVENTS))
    .filter(e => e.tripId === tripId && e.status === 'closed')
    .sort((a, b) => String(a.clockInAt).localeCompare(String(b.clockInAt)));

  // Pre-compute per-day ordinary consumption per crew member: earlier events
  // (and midnight-crossing tails from the previous day) consume the day's
  // allowance first, in clock-in order.
  const usedBy = new Map();   // employeeId → Map(dateKey → ordinary minutes)
  const updated = [];
  for (const e of events) {
    const breaks = (await getAll(STORES.BREAK_RECORDS))
      .filter(b => b.clockEventId === e.id && b.status === 'closed');
    const brk = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
    const net = Math.max(0, (e.durationMinutes || 0) - brk);
    const shrunk = { clockInAt: e.clockInAt, clockOutAt: new Date(new Date(e.clockInAt).getTime() + net * 60000).toISOString() };
    const perEmp = usedBy.get(e.employeeId) || new Map();
    const usedByDate = Object.fromEntries(perEmp.entries());
    const { cats, splitDays } = classifyEvent(shrunk, settings, usedByDate);
    for (const [dk, tot] of Object.entries(splitDays)) {
      perEmp.set(dk, (perEmp.get(dk) || 0) + tot.ordinary);
    }
    usedBy.set(e.employeeId, perEmp);

    const next = {
      ...e,
      breakMinutes: brk, netWorkedMinutes: Math.round(net), categories: cats,
      updatedAt: nowISO(), updatedBy: 'hours engine',
      syncStatus: SYNC_STATUS.LOCAL
    };
    await put(STORES.CLOCK_EVENTS, next);
    queueForSync(next, 'clock_events', 'clock_event')
      .catch(err => console.warn('Sync queue error:', err?.message || err));
    updated.push(next);
  }
  await logAction(AUDIT_ACTIONS.HOURS_RECLASSIFIED,
    `Hour categories recalculated for ${events.length} clock event${events.length === 1 ? '' : 's'} of trip ${events[0]?.tripRef || tripId}.`);
  return updated.length;
}

/**
 * Rest-period audit for a crew member: consecutive closed events with the
 * gap between them. Below the threshold → flagged (visible warning).
 */
export async function restAuditFor(employeeId, settings) {
  const cfg = settings || await getHoursSettings();
  const events = (await getAll(STORES.CLOCK_EVENTS))
    .filter(e => e.employeeId === employeeId && e.status === 'closed')
    .sort((a, b) => String(a.clockInAt).localeCompare(String(b.clockInAt)));
  const flags = [];
  for (let i = 1; i < events.length; i++) {
    const gap = restMinutesBetween(events[i - 1], events[i]);
    if (gap !== null && gap < cfg.minRestMinutes) {
      flags.push({
        between: { from: events[i - 1].clockOutAt, to: events[i].clockInAt },
        restMinutes: gap, requiredMinutes: cfg.minRestMinutes,
        tripRef: events[i].tripRef
      });
    }
  }
  return flags;
}
