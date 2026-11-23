/**
 * report-data.js — Phase 6 report library: the DATA side of every report.
 *
 * PLAIN ENGLISH: each exported builder takes plain record arrays (as read
 * from the on-device database) plus the filters the user chose, and returns
 * one table: { columns, rows, totals, meta }.
 *   - columns: [{ key, label, type, align }] — type is 'text' | 'number' |
 *     'money' | 'hours' | 'date' | 'datetime'
 *   - rows:    one object per line; money columns carry NAD numbers (not
 *     cents), hours columns carry minutes as numbers
 *   - totals:  same keys as rows (or null) + a `label` for the totals row
 *   - meta:    title, subtitle, filter descriptions (printed on the PDF)
 *
 * The builders are PURE (no IndexedDB, no window) so the automated test
 * suite can verify them in Node (scripts/test-reports-engine.mjs).
 * Display formatting happens only in the export layer (report-pdf.js);
 * CSV and Excel receive numbers so spreadsheets can sum them.
 */

import { CAPABILITIES } from './permissions.js';
import { classifyEvent } from './hours.service.js';
import { DEFAULT_HOURS_SETTINGS } from '../config.js';

/* ---------------- Namibian time helpers (UTC stored, Windhoek shown) ---- */

const TZ = 'Africa/Windhoek';

function partsIn(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  return p;
}

/** Local (Windhoek) date key, e.g. '2026-11-17'. */
export function dateKey(iso) {
  const p = partsIn(iso);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}

/** '17 Nov 2026' for reports. */
export function fmtDate(iso) {
  const p = partsIn(iso);
  if (!p) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(p.day)} ${months[Number(p.month) - 1]} ${p.year}`;
}

/** '17 Nov 2026, 14:05'. */
export function fmtDateTime(iso) {
  const p = partsIn(iso);
  if (!p) return '—';
  return `${fmtDate(iso)}, ${p.hour}:${p.minute}`;
}

/** Minutes → '12h 30m'. */
export function fmtHours(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** '12,500.00' with grouping — for the PDF layer. */
export function fmtNumber(n, decimals = 2) {
  return (Number(n) || 0).toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const C = {
  text: (key, label, extra = {}) => ({ key, label, type: 'text', ...extra }),
  number: (key, label, extra = {}) => ({ key, label, type: 'number', align: 'right', ...extra }),
  money: (key, label, extra = {}) => ({ key, label, type: 'money', align: 'right', ...extra }),
  hours: (key, label, extra = {}) => ({ key, label, type: 'hours', align: 'right', ...extra }),
  date: (key, label, extra = {}) => ({ key, label, type: 'date', ...extra }),
  datetime: (key, label, extra = {}) => ({ key, label, type: 'datetime', ...extra })
};

/* ---------------- shared filter helpers -------------------------------- */

export function emptyFilters() {
  return { dateFrom: '', dateTo: '', tripId: '', vesselId: '', crewId: '', status: '', search: '' };
}

/** True when the record's ISO instant falls inside the Windhoek date range. */
export function inDateRange(iso, dateFrom, dateTo) {
  if (!iso) return false;
  const key = dateKey(iso);
  if (dateFrom && key < dateFrom) return false;
  if (dateTo && key > dateTo) return false;
  return true;
}

function filterDesc(f, label, value) {
  if (value) f.push(`${label}: ${value}`);
}

function baseMeta(title, subtitle, filters) {
  return { title, subtitle, filters, generatedAt: null, generatedBy: null }; // stamped by the screen
}

const s = (v) => String(v ?? '').trim();
const kgFmt = (n) => (Number(n) || 0).toLocaleString('en', { maximumFractionDigits: 1 });

/* ================= 1. Crew register ==================================== */

export function crewRegisterReport({ crew = [], users = [] }, f = emptyFilters()) {
  const userById = new Map(users.map(u => [u.id, u]));
  let list = [...crew];
  if (f.crewId) list = list.filter(c => c.id === f.crewId);
  if (f.status) list = list.filter(c => c.employmentStatus === f.status);
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(c => s(c.fullName).toLowerCase().includes(q) || s(c.employeeId || c.id).toLowerCase().includes(q) || s(c.position).toLowerCase().includes(q));
  }
  list.sort((a, b) => s(a.fullName).localeCompare(s(b.fullName)));
  const columns = [
    C.text('employeeId', 'Employee no'),
    C.text('fullName', 'Full name'),
    C.text('position', 'Position'),
    C.text('employmentStatus', 'Status'),
    C.text('phone', 'Phone'),
    C.text('email', 'Email'),
    C.text('login', 'Linked login')
  ];
  const rows = list.map(c => ({
    employeeId: s(c.employeeId) || c.id,
    fullName: s(c.fullName),
    position: s(c.position) || '—',
    employmentStatus: s(c.employmentStatus),
    phone: s(c.phone) || '—',
    email: s(c.email) || '—',
    login: c.userId ? (userById.get(c.userId)?.email || 'linked') : '—'
  }));
  const totals = null;
  const filters = [];
  filterDesc(filters, 'Status', f.status);
  filterDesc(filters, 'Search', f.search);
  return { columns, rows, totals, meta: baseMeta('Crew register', `${rows.length} crew member${rows.length === 1 ? '' : 's'} on file`, filters) };
}

/* ================= 2. Vessel register ================================== */

export function vesselRegisterReport({ vessels = [], trips = [], assignments = [] }, f = emptyFilters()) {
  let list = [...vessels];
  if (f.status) list = list.filter(v => v.status === f.status);
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(v => s(v.name).toLowerCase().includes(q) || s(v.registrationNumber).toLowerCase().includes(q));
  }
  list.sort((a, b) => s(a.name).localeCompare(s(b.name)));
  const liveTrips = new Map();   // vesselId → count of trips not yet closed
  const totalTrips = new Map();  // vesselId → all trips
  for (const t of trips) {
    if (!t.vesselId) continue;
    totalTrips.set(t.vesselId, (totalTrips.get(t.vesselId) || 0) + 1);
    if (t.status !== 'closed') liveTrips.set(t.vesselId, (liveTrips.get(t.vesselId) || 0) + 1);
  }
  const columns = [
    C.text('name', 'Vessel'),
    C.text('registrationNumber', 'Registration'),
    C.text('type', 'Type'),
    C.text('homePort', 'Home port'),
    C.text('status', 'Status'),
    C.number('activeTrips', 'Live trips'),
    C.number('totalTrips', 'Trips on record')
  ];
  const rows = list.map(v => ({
    name: s(v.name),
    registrationNumber: s(v.registrationNumber) || '—',
    type: s(v.type) || '—',
    homePort: s(v.homePort) || '—',
    status: s(v.status),
    activeTrips: liveTrips.get(v.id) || 0,
    totalTrips: totalTrips.get(v.id) || 0
  }));
  const filters = [];
  filterDesc(filters, 'Status', f.status);
  filterDesc(filters, 'Search', f.search);
  return { columns, rows, totals: null, meta: baseMeta('Vessel register', `${rows.length} vessel${rows.length === 1 ? '' : 's'} on file`, filters) };
}

/* ================= 3. Trip register ==================================== */

const TRIP_STATUS_LABELS = {
  planned: 'Planned', open: 'Open', at_sea: 'At Sea', returned: 'Returned',
  under_review: 'Under Review', payroll_pending: 'Payroll Pending', approved: 'Approved', closed: 'Closed'
};

export function tripRegisterReport({ trips = [], vessels = [], assignments = [], catchRecords = [] }, f = emptyFilters()) {
  const vesselById = new Map(vessels.map(v => [v.id, v]));
  let list = [...trips];
  if (f.vesselId) list = list.filter(t => t.vesselId === f.vesselId);
  if (f.status) list = list.filter(t => t.status === f.status);
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(t => s(t.reference).toLowerCase().includes(q) || s(t.vesselName).toLowerCase().includes(q));
  }
  const crewCount = new Map(), kgByTrip = new Map();
  for (const a of assignments) if (a.tripId) crewCount.set(a.tripId, (crewCount.get(a.tripId) || 0) + 1);
  for (const c of catchRecords) if (c.tripId) kgByTrip.set(c.tripId, (kgByTrip.get(c.tripId) || 0) + (Number(c.weightKg) || 0));
  list.sort((a, b) => s(b.reference).localeCompare(s(a.reference)));
  const columns = [
    C.text('reference', 'Trip'),
    C.text('vessel', 'Vessel'),
    C.text('status', 'Status'),
    C.text('route', 'Route'),
    C.date('plannedDepart', 'Planned depart'),
    C.date('plannedReturn', 'Planned return'),
    C.date('actualDepart', 'Actual depart'),
    C.date('actualReturn', 'Actual return'),
    C.number('crew', 'Crew assigned'),
    C.number('catchKg', 'Catch (kg)', { decimals: 0 })
  ];
  const rows = list.map(t => ({
    reference: s(t.reference),
    vessel: s(t.vesselName) || s(vesselById.get(t.vesselId)?.name) || '—',
    status: TRIP_STATUS_LABELS[t.status] || s(t.status),
    route: `${s(t.departurePort) || '?'} → ${s(t.returnPort) || '?'}`,
    plannedDepart: t.plannedDepartAt ? fmtDate(t.plannedDepartAt) : '—',
    plannedReturn: t.plannedReturnAt ? fmtDate(t.plannedReturnAt) : '—',
    actualDepart: t.actualDepartAt ? fmtDate(t.actualDepartAt) : '—',
    actualReturn: t.actualReturnAt ? fmtDate(t.actualReturnAt) : '—',
    crew: crewCount.get(t.id) || 0,
    catchKg: Math.round(kgByTrip.get(t.id) || 0)
  }));
  const filters = [];
  filterDesc(filters, 'Vessel', f.vesselId ? s(vesselById.get(f.vesselId)?.name) || f.vesselId : '');
  filterDesc(filters, 'Status', f.status ? TRIP_STATUS_LABELS[f.status] || f.status : '');
  filterDesc(filters, 'Search', f.search);
  return {
    columns, rows,
    totals: { label: 'All listed trips', crew: rows.reduce((x, r) => x + r.crew, 0), catchKg: rows.reduce((x, r) => x + r.catchKg, 0) },
    meta: baseMeta('Trip register', `${rows.length} trip${rows.length === 1 ? '' : 's'} listed`, filters)
  };
}

/* ================= 4. Attendance & hours =============================== */

export function attendanceHoursReport({ crew = [], clockEvents = [], hoursSettings = null }, f = emptyFilters()) {
  const settings = hoursSettings || DEFAULT_HOURS_SETTINGS;
  const crewById = new Map(crew.map(c => [c.id, c]));
  const range = (f.dateFrom || f.dateTo) ? (e) => inDateRange(e.clockInAt, f.dateFrom, f.dateTo) : (e) => !!e.clockOutAt;
  let events = clockEvents.filter(e => e.status === 'closed' && range(e))
    .sort((a, b) => String(a.clockInAt).localeCompare(String(b.clockInAt)));
  if (f.crewId) events = events.filter(e => e.employeeId === f.crewId);
  if (f.vesselId) events = events.filter(e => e.vesselId === f.vesselId);
  if (f.tripId) events = events.filter(e => e.tripId === f.tripId);
  if (f.search) {
    const q = f.search.toLowerCase();
    events = events.filter(e => s(e.crewName).toLowerCase().includes(q) || s(e.employeeId).toLowerCase().includes(q));
  }

  /* Events not yet stamped by the hours engine (no stored categories — e.g.
     records created before the engine ran) are classified here with the SAME
     engine logic as reclassifyEvent: shrink the shift by its break minutes,
     then classify, sharing each local day's ordinary allowance across the
     day's events in clock order. Deterministic and identical to payroll. */
  const ordinaryUsedByDate = {};
  const catsOf = (e) => {
    if (e.categories && typeof e.categories === 'object') return e.categories;
    const net = e.netWorkedMinutes ?? Math.max(0, (e.durationMinutes || 0) - (e.breakMinutes || 0));
    const shrunk = {
      clockInAt: e.clockInAt,
      clockOutAt: new Date(new Date(e.clockInAt).getTime() + net * 60000).toISOString()
    };
    return classifyEvent(shrunk, settings, ordinaryUsedByDate).cats;
  };

  const per = new Map();   // employeeId → aggregates
  for (const e of events) {
    const id = e.employeeId || '?';
    if (!per.has(id)) per.set(id, {
      employeeId: s(e.employeeId) || '?',
      fullName: s(e.crewName) || s(crewById.get(id)?.fullName) || '—',
      position: s(crewById.get(id)?.position) || '—',
      shifts: 0, netMinutes: 0, breakMinutes: 0,
      ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0
    });
    const a = per.get(id);
    a.shifts += 1;
    a.netMinutes += Number(e.netWorkedMinutes) || 0;
    a.breakMinutes += Number(e.breakMinutes) || 0;
    const cats = catsOf(e);
    for (const k of ['ordinary', 'overtime', 'night', 'sunday', 'public_holiday']) a[k] += Number(cats[k]) || 0;
  }
  const rows = [...per.values()].sort((x, y) => y.netMinutes - x.netMinutes);
  const columns = [
    C.text('employeeId', 'Employee no'),
    C.text('fullName', 'Crew member'),
    C.text('position', 'Position'),
    C.number('shifts', 'Shifts', { decimals: 0 }),
    C.hours('netTime', 'Worked'),
    C.hours('ordinary', 'Ordinary'),
    C.hours('overtime', 'Overtime'),
    C.hours('night', 'Night'),
    C.hours('sunday', 'Sunday'),
    C.hours('public_holiday', 'Holiday'),
    C.hours('breaks', 'Breaks')
  ];
  const shown = rows.map(r => ({ ...r, netTime: r.netMinutes, breaks: r.breakMinutes }));
  const sum = (k) => rows.reduce((x, r) => x + (r[k] || 0), 0);
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`Dates: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  else filters.push('Dates: all recorded shifts');
  filterDesc(filters, 'Crew', f.crewId ? s(crewById.get(f.crewId)?.fullName) || f.crewId : '');
  filterDesc(filters, 'Trip', f.tripId);
  return {
    columns, rows: shown,
    totals: {
      label: `Totals — ${rows.length} crew member${rows.length === 1 ? '' : 's'}`,
      shifts: sum('shifts'), netTime: sum('netMinutes'), ordinary: sum('ordinary'),
      overtime: sum('overtime'), night: sum('night'), sunday: sum('sunday'),
      public_holiday: sum('public_holiday'), breaks: sum('breakMinutes')
    },
    meta: baseMeta('Attendance & hours summary', 'Closed shifts with automatically classified hour categories (minutes land in exactly one category)', filters)
  };
}

/* ================= 5. Catch register =================================== */

export function catchRegisterReport({ trips = [], catchRecords = [] }, f = emptyFilters()) {
  const tripById = new Map(trips.map(t => [t.id, t]));
  let list = [...catchRecords];
  if (f.tripId) list = list.filter(c => c.tripId === f.tripId);
  if (f.vesselId) list = list.filter(c => tripById.get(c.tripId)?.vesselId === f.vesselId);
  if (f.dateFrom || f.dateTo) list = list.filter(c => inDateRange(c.landedAt || c.createdAt, f.dateFrom, f.dateTo));
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(c => s(c.species).toLowerCase().includes(q) || s(c.landingNoteRef).toLowerCase().includes(q) || s(c.landingSite).toLowerCase().includes(q));
  }
  list.sort((a, b) => String(b.landedAt || b.createdAt || '').localeCompare(String(a.landedAt || a.createdAt || '')));
  const columns = [
    C.text('tripRef', 'Trip'),
    C.text('vessel', 'Vessel'),
    C.date('landedAt', 'Landed'),
    C.text('species', 'Species'),
    C.text('category', 'Category'),
    C.number('weightKg', 'Weight (kg)', { decimals: 1 }),
    C.text('landingSite', 'Landing site'),
    C.text('landingNoteRef', 'Landing note ref'),
    C.text('monitoringRef', 'Monitoring ref')
  ];
  const rows = list.map(c => {
    const t = tripById.get(c.tripId) || {};
    return {
      tripRef: s(t.reference) || s(c.tripRef) || '—',
      vessel: s(t.vesselName) || '—',
      landedAt: c.landedAt || c.createdAt || null,
      species: s(c.species),
      category: s(c.category),
      weightKg: Number(c.weightKg) || 0,
      landingSite: s(c.landingSite) || '—',
      landingNoteRef: s(c.landingNoteRef) || '—',
      monitoringRef: s(c.monitoringRef) || '—'
    };
  });
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`Landed: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  filterDesc(filters, 'Trip', f.tripId);
  filterDesc(filters, 'Search', f.search);
  return {
    columns, rows,
    totals: { label: `Total landed — ${rows.length} record${rows.length === 1 ? '' : 's'}`, weightKg: rows.reduce((x, r) => x + r.weightKg, 0) },
    meta: baseMeta('Catch register', 'Amend-only history — the weight on a slip is corrected with a visible amendment, never overwritten', filters)
  };
}

/* ================= 6. Quota allocations ================================ */

export function quotaAllocationsReport({ trips = [], quotaAllocations = [] }, f = emptyFilters()) {
  const tripById = new Map(trips.map(t => [t.id, t]));
  let list = [...quotaAllocations];
  if (f.tripId) list = list.filter(q => q.tripId === f.tripId);
  if (f.vesselId) list = list.filter(q => tripById.get(q.tripId)?.vesselId === f.vesselId);
  if (f.dateFrom || f.dateTo) list = list.filter(q => inDateRange(q.createdAt, f.dateFrom, f.dateTo));
  if (f.status) list = list.filter(q => q.status === f.status);
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(a => s(a.methodLabel).toLowerCase().includes(q) || (a.lines || []).some(l => s(l.crewName).toLowerCase().includes(q)));
  }
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const columns = [
    C.text('tripRef', 'Trip'),
    C.date('createdAt', 'Created'),
    C.text('methodLabel', 'Method'),
    C.text('crewName', 'Crew member'),
    C.text('position', 'Position'),
    C.number('shareKg', 'Share (kg)', { decimals: 1 }),
    C.text('status', 'Status')
  ];
  const rows = [];
  for (const a of list) {
    const t = tripById.get(a.tripId) || {};
    const lines = (a.lines && a.lines.length) ? a.lines : [{ crewName: '—', position: '—', shareKg: null }];
    for (const l of lines) {
      rows.push({
        tripRef: s(t.reference) || '—',
        createdAt: a.createdAt || null,
        methodLabel: s(a.methodLabel) || s(a.method) || '—',
        crewName: s(l.crewName) || '—',
        position: s(l.position) || '—',
        shareKg: (l.shareKg !== null && l.shareKg !== undefined) ? Number(l.shareKg) : null,
        status: s(a.status) || '—'
      });
    }
  }
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`Created: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  filterDesc(filters, 'Trip', f.tripId);
  filterDesc(filters, 'Status', f.status);
  const sumKg = rows.reduce((x, r) => x + (r.shareKg || 0), 0);
  return {
    columns, rows,
    totals: { label: `Total shared — ${rows.length} allocation line${rows.length === 1 ? '' : 's'}`, shareKg: sumKg },
    meta: baseMeta('Quota & commission allocations', 'How each trip\u2019s catch was split among the crew (superseded allocations stay visible)', filters)
  };
}

/* ================= 7. Payroll summary ================================== */

export function payrollSummaryReport({ runs = [] }, f = emptyFilters()) {
  let list = [...runs];
  if (f.status) list = list.filter(r => r.status === f.status);
  if (f.tripId) list = list.filter(r => r.tripId === f.tripId);
  if (f.vesselId) list = list.filter(r => r.vesselId === f.vesselId);
  if (f.dateFrom || f.dateTo) list = list.filter(r => inDateRange(r.createdAt, f.dateFrom, f.dateTo));
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(r => s(r.tripRef).toLowerCase().includes(q) || (r.payslips || []).some(p => s(p.crewName).toLowerCase().includes(q)));
  }
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const columns = [
    C.text('tripRef', 'Trip'),
    C.text('status', 'Run status'),
    C.text('crewName', 'Crew member'),
    C.text('contractType', 'Contract'),
    C.money('gross', 'Gross (N$)'),
    C.money('paye', 'PAYE (N$)'),
    C.money('sscEmployee', 'SSC employee (N$)'),
    C.money('net', 'Net (N$)'),
    C.money('employerSsc', 'SSC employer (N$)')
  ];
  const rows = [];
  for (const r of list) {
    for (const p of (r.payslips || [])) {
      rows.push({
        tripRef: s(r.tripRef),
        status: s(r.status),
        crewName: s(p.crewName),
        contractType: s(p.contractType) || '—',
        gross: (Number(p.grossCents) || 0) / 100,
        paye: (Number(p.payeCents) || 0) / 100,
        sscEmployee: ((p.lines || []).find(l => l.label?.startsWith('SSC'))?.amountCents || 0) / 100,
        net: (Number(p.netCents) || 0) / 100,
        employerSsc: (Number(p.employerSscCents) || 0) / 100
      });
    }
  }
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`Built: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  filterDesc(filters, 'Run status', f.status);
  filterDesc(filters, 'Trip', f.tripId);
  const sum = (k) => rows.reduce((x, r) => x + r[k], 0);
  return {
    columns, rows,
    totals: {
      label: `Totals — ${rows.length} payslip line${rows.length === 1 ? '' : 's'} across ${list.length} run${list.length === 1 ? '' : 's'}`,
      gross: sum('gross'), paye: sum('paye'), sscEmployee: sum('sscEmployee'), net: sum('net'), employerSsc: sum('employerSsc')
    },
    meta: baseMeta('Payroll summary', 'Every payslip line of every run — draft runs included and marked, locked runs are final', filters)
  };
}

/* ================= 8. Statutory contributions ========================== */

export function statutoryContributionsReport({ payslips = [] }, f = emptyFilters()) {
  let list = [...payslips];
  if (f.tripId) list = list.filter(p => p.tripId === f.tripId);
  if (f.crewId) list = list.filter(p => p.crewId === f.crewId);
  if (f.dateFrom || f.dateTo) list = list.filter(p => inDateRange(p.payDate ? `${p.payDate}T12:00:00+02:00` : p.createdAt, f.dateFrom, f.dateTo));
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(p => s(p.crewName).toLowerCase().includes(q) || s(p.tripRef).toLowerCase().includes(q));
  }
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const columns = [
    C.text('tripRef', 'Trip'),
    C.text('crewName', 'Crew member'),
    C.date('payDate', 'Pay date'),
    C.money('taxable', 'Taxable (N$)'),
    C.money('paye', 'PAYE (N$)'),
    C.money('sscEmployee', 'SSC employee 0.9% (N$)'),
    C.money('sscEmployer', 'SSC employer 0.9% (N$)'),
    C.money('sscInsurable', 'SSC basic-pay basis (N$)')
  ];
  const rows = list.map(p => ({
    tripRef: s(p.tripRef),
    crewName: s(p.crewName),
    payDate: p.payDate || null,
    taxable: null,           // filled below from run lines (payslip carries taxable via lines snapshot? falls back to gross − SSC)
    paye: null, sscEmployee: null, sscEmployer: null, sscInsurable: null,
    _p: p
  }));
  // Statutory figures live on the run's payslip lines; PAYSLIPS records keep
  // the same lines, so read them from the line labels (same as the payslip UI).
  for (const r of rows) {
    const p = r._p;
    const lines = p.lines || [];
    const sscEe = (lines.find(l => l.kind === 'deduction' && s(l.label).startsWith('SSC'))?.amountCents) || 0;
    const paye = (lines.find(l => l.kind === 'deduction' && s(l.label).startsWith('PAYE'))?.amountCents) || 0;
    const taxable = Math.max(0, (Number(p.grossCents) || 0) - sscEe);
    r.taxable = taxable / 100;
    r.paye = paye / 100;
    r.sscEmployee = sscEe / 100;
    r.sscEmployer = (Number(p.employerSscCents) || 0) / 100;
    // The month's basic-pay basis this payslip was charged on. Payslips from
    // v2.7.0 on store it; older ones are reconstructed from the employer
    // share (basis = employer ÷ 0.9%), which is exact after clamping.
    const basis = p.sscInsurableCents != null ? Number(p.sscInsurableCents) || 0
      : Math.round(((Number(p.employerSscCents) || 0)) / 0.009);
    r.sscInsurable = basis / 100;
    delete r._p;
  }
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`Pay dates: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  filterDesc(filters, 'Trip', f.tripId);
  const sum = (k) => rows.reduce((x, r) => x + (r[k] || 0), 0);
  return {
    columns, rows,
    totals: {
      label: `Totals — ${rows.length} payslip${rows.length === 1 ? '' : 's'}`,
      taxable: sum('taxable'), paye: sum('paye'), sscEmployee: sum('sscEmployee'), sscEmployer: sum('sscEmployer'), sscInsurable: sum('sscInsurable')
    },
    meta: baseMeta('Statutory contributions — PAYE & SSC', 'Per payslip: PAYE, SSC employee (deducted) and SSC employer (paid on top), with the basic-pay basis SSC was charged on — 0.9% each side of the month\u2019s basic salary, N$500 floor, monthly ceiling per SSC notice', filters)
  };
}

/* ================= 9. Payslip register ================================= */

export function payslipRegisterReport({ payslips = [], trips = [] }, f = emptyFilters()) {
  let list = [...payslips];
  if (f.tripId) list = list.filter(p => p.tripId === f.tripId);
  if (f.crewId) list = list.filter(p => p.crewId === f.crewId);
  if (f.vesselId) {
    const vesselTripIds = new Set(trips.filter(t => t.vesselId === f.vesselId).map(t => t.id));
    list = list.filter(p => vesselTripIds.has(p.tripId));
  }
  if (f.dateFrom || f.dateTo) list = list.filter(p => inDateRange(p.createdAt, f.dateFrom, f.dateTo));
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(p => s(p.crewName).toLowerCase().includes(q) || s(p.tripRef).toLowerCase().includes(q) || s(p.position).toLowerCase().includes(q));
  }
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const columns = [
    C.text('tripRef', 'Trip'),
    C.text('vessel', 'Vessel'),
    C.text('crewName', 'Crew member'),
    C.text('position', 'Position'),
    C.text('periodLabel', 'Period'),
    C.money('gross', 'Gross (N$)'),
    C.money('deductions', 'Deductions (N$)'),
    C.money('net', 'Net (N$)'),
    C.date('payDate', 'Pay date'),
    C.text('issuedBy', 'Issued by')
  ];
  const rows = list.map(p => ({
    tripRef: s(p.tripRef),
    vessel: s(p.vesselName) || '—',
    crewName: s(p.crewName),
    position: s(p.position) || '—',
    periodLabel: s(p.periodLabel) || '—',
    gross: (Number(p.grossCents) || 0) / 100,
    deductions: (Number(p.deductionCents) || 0) / 100,
    net: (Number(p.netCents) || 0) / 100,
    payDate: p.payDate || null,
    issuedBy: s(p.createdBy) || '—'
  }));
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`Issued: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  filterDesc(filters, 'Trip', f.tripId);
  filterDesc(filters, 'Search', f.search);
  const sum = (k) => rows.reduce((x, r) => x + r[k], 0);
  return {
    columns, rows,
    totals: { label: `Totals — ${rows.length} payslip${rows.length === 1 ? '' : 's'}`, gross: sum('gross'), deductions: sum('deductions'), net: sum('net') },
    meta: baseMeta('Payslip register', 'Every payslip ever issued (duplicate-proof: one per crew member per trip)', filters)
  };
}

/* ================= 10. Payslip queries ================================= */

const QUERY_STATUS_LABELS = { open: 'Open', answered: 'Answered', closed: 'Closed' };
const QUERY_CATEGORY_LABELS = { question: 'Question', dispute: 'Dispute', missing_pay: 'Missing pay' };

export function queriesReport({ queries = [] }, f = emptyFilters()) {
  let list = [...queries];
  if (f.status) list = list.filter(q => q.status === f.status);
  if (f.crewId) list = list.filter(q => q.crewId === f.crewId);
  if (f.dateFrom || f.dateTo) list = list.filter(q => inDateRange(q.createdAt, f.dateFrom, f.dateTo));
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(x => s(x.crewName).toLowerCase().includes(q) || s(x.message).toLowerCase().includes(q) || s(x.tripRef).toLowerCase().includes(q));
  }
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const columns = [
    C.text('tripRef', 'Trip'),
    C.text('crewName', 'Crew member'),
    C.text('category', 'Category'),
    C.datetime('createdAt', 'Raised'),
    C.text('status', 'Status'),
    C.money('net', 'Payslip net (N$)'),
    C.text('message', 'Message'),
    C.text('response', 'Response'),
    C.datetime('respondedAt', 'Answered')
  ];
  const rows = list.map(q => ({
    tripRef: s(q.tripRef) || s(q.periodLabel) || '—',
    crewName: s(q.crewName),
    category: QUERY_CATEGORY_LABELS[q.category] || s(q.category),
    createdAt: q.createdAt || null,
    status: QUERY_STATUS_LABELS[q.status] || s(q.status),
    net: (Number(q.netCents) || 0) / 100,
    message: s(q.message),
    response: s(q.response) || (q.status === 'open' ? '— awaiting response —' : '—'),
    respondedAt: q.respondedAt || null
  }));
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`Raised: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  filterDesc(filters, 'Status', f.status ? QUERY_STATUS_LABELS[f.status] || f.status : '');
  filterDesc(filters, 'Search', f.search);
  const counts = { open: 0, answered: 0, closed: 0 };
  for (const q of list) counts[q.status] = (counts[q.status] || 0) + 1;
  return {
    columns, rows,
    totals: {
      label: `${counts.open} open · ${counts.answered} answered · ${counts.closed} closed`,
      net: rows.reduce((x, r) => x + r.net, 0)
    },
    meta: baseMeta('Payslip queries & disputes', 'The full dispute loop — every question a crew member raised and the answer given', filters)
  };
}

/* ================= 11. Audit trail ===================================== */

export function auditTrailReport({ audit = [] }, f = emptyFilters()) {
  let list = [...audit];
  if (f.dateFrom || f.dateTo) list = list.filter(a => inDateRange(a.at, f.dateFrom, f.dateTo));
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(a => s(a.action).toLowerCase().includes(q) || s(a.actorName).toLowerCase().includes(q) || s(a.details).toLowerCase().includes(q));
  }
  if (f.status) list = list.filter(a => a.action === f.status); // status box doubles as action filter here
  list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const columns = [
    C.datetime('at', 'When (Namibian)'),
    C.text('actorName', 'Who'),
    C.text('actorRole', 'Role'),
    C.text('action', 'Action'),
    C.text('details', 'Details'),
    C.text('syncStatus', 'Sync')
  ];
  const rows = list.map(a => ({
    at: a.at || null,
    actorName: s(a.actorName),
    actorRole: s(a.actorRole) || '—',
    action: s(a.action),
    details: s(a.details),
    syncStatus: s(a.syncStatus) || '—'
  }));
  const filters = [];
  if (f.dateFrom || f.dateTo) filters.push(`When: ${f.dateFrom || 'start'} to ${f.dateTo || 'today'} (Namibian)`);
  filterDesc(filters, 'Action contains', f.status);
  filterDesc(filters, 'Search', f.search);
  return {
    columns, rows, totals: null,
    meta: baseMeta('Audit trail report', `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} — append-only: entries can never be edited or deleted`, filters)
  };
}

/* ---------------- registry used by the screen & tests ------------------ */

export const REPORT_DEFS = [
  { key: 'crew_register', title: 'Crew register', icon: 'users', group: 'Operations', cap: CAPABILITIES.VIEW_CREW_ALL, builder: crewRegisterReport, filters: ['crew', 'status_employment', 'search'] },
  { key: 'vessel_register', title: 'Vessel register', icon: 'ship', group: 'Operations', cap: null, builder: vesselRegisterReport, filters: ['status_vessel', 'search'] },
  { key: 'trip_register', title: 'Trip register', icon: 'map', group: 'Operations', cap: null, builder: tripRegisterReport, filters: ['vessel', 'status_trip', 'search'] },
  { key: 'attendance_hours', title: 'Attendance & hours summary', icon: 'clock', group: 'Operations', cap: CAPABILITIES.VIEW_CREW_ALL, builder: attendanceHoursReport, filters: ['dates', 'crew', 'trip', 'search'] },
  { key: 'catch_register', title: 'Catch register', icon: 'fish', group: 'Operations', cap: null, builder: catchRegisterReport, filters: ['dates', 'trip', 'search'] },
  { key: 'quota_allocations', title: 'Quota & commission allocations', icon: 'coins', group: 'Operations', cap: null, builder: quotaAllocationsReport, filters: ['dates', 'trip', 'status_allocation', 'search'] },
  { key: 'payroll_summary', title: 'Payroll summary', icon: 'file-text', group: 'Payroll', cap: CAPABILITIES.VIEW_PAYROLL_ALL, builder: payrollSummaryReport, filters: ['dates', 'status_run', 'trip', 'search'] },
  { key: 'statutory', title: 'Statutory contributions (PAYE & SSC)', icon: 'book', group: 'Payroll', cap: CAPABILITIES.VIEW_PAYROLL_ALL, builder: statutoryContributionsReport, filters: ['dates', 'trip', 'search'] },
  { key: 'payslip_register', title: 'Payslip register', icon: 'download', group: 'Payroll', cap: CAPABILITIES.VIEW_PAYROLL_ALL, builder: payslipRegisterReport, filters: ['dates', 'trip', 'search'] },
  { key: 'queries', title: 'Payslip queries & disputes', icon: 'help', group: 'Payroll', cap: CAPABILITIES.VIEW_PAYROLL_ALL, builder: queriesReport, filters: ['dates', 'status_query', 'search'] },
  { key: 'audit_trail', title: 'Audit trail report', icon: 'activity', group: 'System', cap: CAPABILITIES.VIEW_AUDIT, builder: auditTrailReport, filters: ['dates', 'search'] }
];

/** Human label for a Windhoek date-range filter, for file names and PDFs. */
export function rangeLabel(f) {
  if (!f.dateFrom && !f.dateTo) return '';
  return `${f.dateFrom || 'start'}_to_${f.dateTo || 'today'}`;
}

/* ---------------- CSV (tested in Node, used by the screen) ------------- */

function csvCell(v, col) {
  let out;
  if (v === null || v === undefined || v === '') out = '';
  else if (col.type === 'money') out = Number(v).toFixed(2);
  else if (col.type === 'number') out = Number(v).toFixed(col.decimals ?? 0);
  else if (col.type === 'hours') out = (Number(v) / 60).toFixed(2);   // decimal hours: spreadsheets can sum
  else out = String(v);
  if (/[",\n\r]/.test(out)) out = `"${out.replaceAll('"', '""')}"`;
  return out;
}

/**
 * RFC-4180 CSV for one report table: title block, header, rows, totals.
 * Money/numbers keep plain decimal form so Excel can sum them.
 * Returns a string WITH a BOM so Excel opens UTF-8 characters correctly.
 */
export function csvForReport(r) {
  const cell = (v, col) => csvCell(v, col || { type: 'text' });
  const lines = [];
  lines.push(cell(r.title));
  const sub = [r.subtitle, ...(r.filters || [])].filter(Boolean).join(' — ');
  if (sub) lines.push(cell(sub));
  if (r.generatedAt) lines.push(cell(`Generated ${r.generatedAt}${r.generatedBy ? ' by ' + r.generatedBy : ''} — ShipCrew Payroll`));
  lines.push('');
  lines.push(r.columns.map(c => cell(c.label)).join(','));
  for (const row of r.rows) lines.push(r.columns.map(c => cell(row[c.key], c)).join(','));
  if (r.totals) {
    lines.push(r.columns.map((c, i) => {
      if (i === 0) return cell(r.totals.label || 'Totals');
      const v = r.totals[c.key];
      return (v === undefined || v === null) ? '' : cell(v, c);
    }).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}
