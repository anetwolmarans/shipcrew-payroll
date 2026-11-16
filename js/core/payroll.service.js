/**
 * payroll.service.js — The payroll engine (Phase 5: Payroll).
 *
 * PLAIN ENGLISH: this module turns contracts + approved attendance + catch
 * shares into PAYSLIPS — money, calculated from verified statutory rules
 * only:
 *
 *   1. CONTRACTS (hourly / fixed salary / daily rate at sea) — effective-
 *      dated and audited. The contract valid on a shift's clock-in date
 *      prices that shift. Every change keeps its history.
 *   2. STATUTORY RATES — PAYE, SSC, overtime, night, Sunday, public holiday
 *      and minimum wage are READ-ONLY, versioned and source-cited. They are
 *      implemented in this file ONLY because each has been verified against
 *      its official source (see docs/12-payroll.md):
 *        - PAYE (Income Tax Act 1981 as amended; 2026/27 tables, NamRA/PwC)
 *        - SSC  (Social Security Act 1994: 0.9% employee + 0.9% employer,
 *                monthly ceiling N$12,500 from 1 Sep 2026 — N$11,000 before)
 *        - Overtime 1.5×, Sunday 2×, public holiday 2× (Labour Act, 2007,
 *          s17(2), s21(5), s22(7))
 *        - Night work +6% of the hourly basic wage for 20:00–07:00 (s19(1))
 *        - National minimum wage N$18.00/hour (GN, effective 1 Jan 2025)
 *        - Fishers' rules (GN 308 of 2025) set HOURS/REST limits; pay rates
 *          fall back to the Labour Act per its regulation 21.
 *   3. PER-TRIP PAYROLL — a run prices one trip: it reads each crew
 *      member's classified hours (from the Phase 4 engine), prices them by
 *      contract, adds allowances, commissions (catch shares × price) and
 *      bonuses, deducts statutory PAYE + SSC and any other deductions, and
 *      produces a DRAFT payslip per crew member with a full breakdown.
 *   4. APPROVAL & LOCKING — a draft run is reviewed, then APPROVED and
 *      LOCKED. A locked run never changes; corrections happen through
 *      visible ADJUSTMENT ENTRIES on a LATER run (never by editing history).
 *   5. DUPLICATE PREVENTION — one payslip per (crew member, trip): the
 *      engine refuses to create a second for the same pair.
 *
 * ALL MONEY IS COMPUTED IN CENTS (integers) so totals never drift by
 * rounding; it is displayed as N$ only at the last moment.
 */
import { get, getAll, put, STORES } from './idb.js';
import { nowISO, localDateKey } from './time.js';
import { uuid } from './security.js';
import { SYNC_STATUS, APP } from '../config.js';
import { queueForSync } from './sync.service.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';
import { currentSession } from './auth.service.js';
import { emit } from './events.js';
import { getHoursSettings } from './hours.service.js';

/* ======================= statutory rules (verified) ======================= */

/**
 * PAYE: annual individual income tax tables, progressive. The monthly
 * deduction = annualTax(12 × taxable month) ÷ 12 — the standard employer
 * method for monthly-paid workers. Years of assessment ending 2026/27
 * (= tax years starting 1 March 2025 and 1 March 2026 — the tables are
 * unchanged between them; source: PwC Namibia Tax Reference & Rate Card
 * 2026, NamRA individual tax tables).
 */
export const PAYE_TABLES = [
  {
    id: 'paye_2026_27',
    label: 'PAYE 2026/27 (1 Mar 2025 – 28 Feb 2027)',
    effectiveFrom: '2025-03-01',
    effectiveTo: '2027-02-28',
    source: 'Income Tax Act, 1981 (Act 24 of 1981) as amended — tables for years of assessment ending 2026/27 (NamRA; PwC Namibia Tax Reference and Rate Card 2026)',
    brackets: [
      { upTo: 100000, base: 0, rate: 0.00 },       // first N$100,000: no tax
      { upTo: 150000, base: 0, rate: 0.18 },       // + 18% above 100,000
      { upTo: 350000, base: 9000, rate: 0.25 },    // + 25% above 150,000
      { upTo: 550000, base: 59000, rate: 0.28 },   // + 28% above 350,000
      { upTo: 850000, base: 115000, rate: 0.30 },  // + 30% above 550,000
      { upTo: 1550000, base: 205000, rate: 0.32 }, // + 32% above 850,000
      { upTo: null, base: 429000, rate: 0.37 }     // + 37% above 1,550,000
    ]
  }
];

/**
 * SSC (Maternity, Sick Leave & Death Benefit Fund): 0.9% of insurable
 * earnings from BOTH employee and employer, on monthly basic earnings
 * between the floor and the ceiling. Sources: Social Security Act, 1994;
 * SSC notice — ceiling N$11,000 → N$12,500 from 1 September 2026
 * (max employee contribution N$99.00 → N$112.50 per month).
 */
export const SSC_RULES = [
  {
    id: 'ssc_2026',
    label: 'SSC MSD fund — from 1 Sep 2026',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
    source: 'Social Security Act, 1994 (Act 34 of 1994); SSC contribution ceiling increase announced Aug 2026, effective 1 September 2026 (payspace.com; crvanwyk.com; Informanté)',
    employeeRate: 0.009,
    employerRate: 0.009,
    monthlyFloorCents: 50000,       // N$500 minimum insurable earnings
    monthlyCeilingCents: 1250000    // N$12,500 maximum insurable earnings
  },
  {
    id: 'ssc_2025',
    label: 'SSC MSD fund — 1 Mar 2025 to 31 Aug 2026',
    effectiveFrom: '2025-03-01',
    effectiveTo: '2026-08-31',
    source: 'Social Security Act, 1994 (Act 34 of 1994); SSC notices (ceiling N$11,000, max N$99.00/month)',
    employeeRate: 0.009,
    employerRate: 0.009,
    monthlyFloorCents: 50000,
    monthlyCeilingCents: 1100000
  }
];

/**
 * Labour Act, 2007 pay multipliers and the night-work allowance, plus the
 * national minimum wage. Company policy may be MORE generous, never less.
 */
export const LABOUR_RATES = [
  {
    id: 'labour_2007',
    label: 'Labour Act, 2007 — pay rates (verified)',
    effectiveFrom: '2007-04-01',
    effectiveTo: null,
    source: 'Labour Act, 2007 (Act 11 of 2007): s17(2) overtime ×1.5; s21(5) Sunday ×2; s22(7) public holiday ×2; s19(1) night work +6% of hourly basic wage (20:00–07:00)',
    overtimeMultiplier: 1.5,
    sundayMultiplier: 2.0,
    publicHolidayMultiplier: 2.0,
    nightAllowancePct: 0.06,      // 6% of the hourly basic wage per night hour
    // NOTE: the Act's night window is 20:00–07:00 for the ALLOWANCE. The
    // Phase 4 classification window (22:00–05:00 default) groups minutes
    // for CATEGORISATION. Where a shift has night-category minutes, the
    // allowance is paid on the statutory 20:00–07:00 minutes of that shift,
    // computed here, so the letter of s19(1) is honoured.
    nightWindowStartMinute: 20 * 60,
    nightWindowEndMinute: 7 * 60
  }
];

/** National minimum wage (GN under the Labour Act; effective 1 Jan 2025). */
export const MINIMUM_WAGE = [
  {
    id: 'nmw_2025',
    label: 'National minimum wage — N$18.00/hour',
    effectiveFrom: '2025-01-01',
    effectiveTo: null,
    source: 'National Minimum Wage Order under the Labour Act, 2007 — N$18.00 per hour with effect from 1 January 2025 (Government Gazette; Wages Commission; ILO)',
    hourlyCents: 1800
  }
];

/** Rule pickers (effective-dated). */
export function payeTableFor(dateKey) {
  return PAYE_TABLES.find(r => ruleCovers(r, dateKey)) || PAYE_TABLES[PAYE_TABLES.length - 1];
}
export function sscRuleFor(dateKey) {
  return SSC_RULES.find(r => ruleCovers(r, dateKey)) || SSC_RULES[0];
}
export function labourRatesFor(dateKey) {
  return LABOUR_RATES.find(r => ruleCovers(r, dateKey)) || LABOUR_RATES[0];
}
export function minimumWageFor(dateKey) {
  return MINIMUM_WAGE.find(r => ruleCovers(r, dateKey)) || MINIMUM_WAGE[0];
}
function ruleCovers(rule, dateKey) {
  if (!dateKey) return false;
  return (!rule.effectiveFrom || rule.effectiveFrom <= dateKey) &&
         (!rule.effectiveTo || dateKey <= rule.effectiveTo);
}

/* ============================ money helpers ============================ */

export const toCents = (nad) => Math.round((Number(nad) || 0) * 100);
export const centsToNAD = (c) => (Math.round(c) / 100);
export function fmtMoneyCents(c) {
  const v = centsToNAD(c);
  return `${APP.currencySymbol} ${v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Annual PAYE from the progressive table (input in cents). */
export function annualPayeCents(annualTaxableCents, table) {
  const t = table || PAYE_TABLES[0];
  let prev = 0;
  for (const b of t.brackets) {
    const cap = b.upTo === null ? Infinity : b.upTo * 100;
    if (annualTaxableCents <= cap) {
      return Math.round(b.base * 100 + (annualTaxableCents - prev * 100) * b.rate);
    }
    prev = b.upTo;
  }
  return 0;
}

/**
 * Monthly PAYE: annualise the month's taxable pay, tax it, divide by 12.
 * This is the standard employer method (NamRA employer guide): it keeps
 * seasonal/variable months fair — high months pay more, low months less,
 * and the year evens out.
 */
export function monthlyPayeCents(monthlyTaxableCents, dateKey) {
  const table = payeTableFor(dateKey || localDateKey(nowISO()));
  const annual = Math.max(0, monthlyTaxableCents) * 12;
  return Math.round(annualPayeCents(annual, table) / 12);
}

/** SSC on one month's insurable earnings (both sides). */
export function sscContributionsCents(monthlyBasicCents, dateKey) {
  const rule = sscRuleFor(dateKey || localDateKey(nowISO()));
  const insurable = Math.min(Math.max(monthlyBasicCents, rule.monthlyFloorCents), rule.monthlyCeilingCents);
  return {
    ruleId: rule.id,
    insurableCents: insurable,
    employeeCents: Math.round(insurable * rule.employeeRate),
    employerCents: Math.round(insurable * rule.employerRate)
  };
}

/**
 * Night-work allowance minutes for one shift: the overlap of the shift with
 * the STATUTORY 20:00–07:00 window (Labour Act s19(1)) — independent of the
 * Phase 4 categorisation window. Walks boundary-to-boundary in local time.
 */
export function statutoryNightMinutes(clockInAt, clockOutAt, rates) {
  const r = rates || LABOUR_RATES[0];
  const start = new Date(clockInAt).getTime();
  const end = new Date(clockOutAt).getTime();
  if (!(end > start)) return 0;
  const ns = r.nightWindowStartMinute, ne = r.nightWindowEndMinute; // 20:00–07:00 (spans midnight)
  const DATE_OPTS = { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' };
  const TIME_OPTS = { timeZone: 'Africa/Windhoek', hour: '2-digit', minute: '2-digit', hour12: false };
  const parts = (ms) => {
    const d = new Date(ms);
    const dp = new Intl.DateTimeFormat('en-CA', DATE_OPTS).formatToParts(d);
    const tp = new Intl.DateTimeFormat('en-GB', TIME_OPTS).formatToParts(d);
    const g = (ps, t) => ps.find(p => p.type === t)?.value || '0';
    return {
      dateKey: `${g(dp, 'year')}-${g(dp, 'month')}-${g(dp, 'day')}`,
      minuteOfDay: Number(g(tp, 'hour')) * 60 + Number(g(tp, 'minute'))
    };
  };
  const toUTC = (dateKey, minuteOfDay) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    let guess = Date.UTC(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60) - 2 * 3600000;
    for (let i = 0; i < 2; i++) {
      const p = parts(guess);
      if (p.dateKey === dateKey && p.minuteOfDay === minuteOfDay) break;
      guess += 3600000; // CAT has no DST since 2017 — this converges immediately
    }
    return guess;
  };
  let night = 0;
  let t = start;
  while (t < end) {
    const p = parts(t);
    // Day boundaries of this local day's night window: 20:00 today → 07:00 tomorrow.
    const eveningStart = toUTC(p.dateKey, ns);
    const morningEnd = toUTC(p.dateKey, ne) < eveningStart
      ? toUTC(nextKey(p.dateKey), ne)   // 07:00 is "tomorrow morning" relative to 20:00
      : toUTC(p.dateKey, ne);
    // Night windows touching this instant's day: [today 00:00→07:00] and [today 20:00→tomorrow 07:00]
    const wins = [
      [toUTC(p.dateKey, 0), toUTC(p.dateKey, ne)],
      [eveningStart, toUTC(nextKey(p.dateKey), ne)]
    ];
    let advanced = false;
    for (const [ws, we] of wins) {
      const s = Math.max(t, ws), e = Math.min(end, we);
      if (e > s) {
        night += (e - s) / 60000;
        t = e;
        advanced = true;
      }
    }
    if (!advanced) {
      // Jump to the next night-window start after t.
      let next = Infinity;
      for (const [ws] of wins) if (ws > t) next = Math.min(next, ws);
      if (!Number.isFinite(next)) next = end;
      t = Math.min(Math.max(next, t + 60000), end);
    }
  }
  return Math.round(night);
}
function nextKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/* ============================= contracts ============================= */

export const CONTRACT_TYPES = [
  { key: 'hourly', label: 'Hourly rate', description: 'Paid per hour worked, with statutory overtime/night/Sunday/holiday premiums.' },
  { key: 'daily_sea', label: 'Daily rate (per day at sea)', description: 'A fixed amount for each day spent at sea (Regulations Relating to Fishers, reg 4(a)). Hours beyond the shift structure still earn statutory premiums.' },
  { key: 'fixed_salary', label: 'Fixed monthly salary', description: 'A fixed monthly amount; statutory premiums apply on the implied hourly rate beyond ordinary hours.' }
];

export async function listContracts(crewId) {
  const all = await getAll(STORES.CONTRACTS);
  const rows = crewId ? all.filter(c => c.crewId === crewId) : all;
  return rows.sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
}

/** The contract in force for a crew member on a date (latest effectiveFrom ≤ date). */
export async function contractFor(crewId, dateKey) {
  const rows = await listContracts(crewId);
  return rows.find(c => c.status !== 'superseded' && c.effectiveFrom <= dateKey) || null;
}

/**
 * Create a contract version (hourly / daily at sea / fixed salary). The
 * previous version is marked superseded — kept forever for history. Every
 * version records who set it, when, and why.
 */
export async function createContract(fields) {
  const who = sessionBrief();
  if (!fields.crewId) throw new Error('Choose the crew member.');
  const type = CONTRACT_TYPES.find(t => t.key === fields.type);
  if (!type) throw new Error('Choose a valid contract type.');
  if (!fields.effectiveFrom) throw new Error('An effective date is required.');
  const rateCents = toCents(fields.rate);
  if (!Number.isFinite(rateCents) || rateCents <= 0) throw new Error('Enter a positive rate.');

  // Statutory floor: an hourly contract may never price below the minimum wage.
  if (fields.type === 'hourly') {
    const nmw = minimumWageFor(fields.effectiveFrom);
    if (rateCents < nmw.hourlyCents) {
      throw new Error(`The hourly rate is below the national minimum wage (${fmtMoneyCents(nmw.hourlyCents)}/hour since ${nmw.effectiveFrom}). The system will not record an illegal rate.`);
    }
  }

  const crew = await get(STORES.CREW, fields.crewId);
  const existing = await listContracts(fields.crewId);
  const overlaps = existing.find(c => c.effectiveFrom >= fields.effectiveFrom && c.status === 'active');
  if (overlaps) throw new Error(`A contract effective ${overlaps.effectiveFrom} already exists. New versions must start after it.`);

  const record = {
    id: uuid(),
    crewId: fields.crewId,
    crewName: crew?.fullName || 'Unknown',
    position: crew?.position || '',
    type: fields.type,
    typeLabel: type.label,
    rateCents,
    effectiveFrom: fields.effectiveFrom,
    effectiveTo: null,
    currency: 'NAD',
    // The signed PAPER contract stays in the HR file; these two fields link
    // each pay version to that signed original (see docs/12-payroll.md §2).
    signedOn: fields.signedOn || null,                  // date the crew member signed
    signedContractRef: fields.signedContractRef || '',  // e.g. "HR/CONTRACTS/2026/041"
    notes: fields.notes || '',
    changeReason: fields.changeReason || 'Initial contract',
    status: 'active',
    history: [],
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  // Close the previous version on the day before (effective-dated history).
  const previous = existing.find(c => c.status === 'active');
  if (previous) {
    const closed = addDays(fields.effectiveFrom, -1);
    if (closed >= previous.effectiveFrom) {
      previous.effectiveTo = closed;
    } else {
      previous.effectiveTo = previous.effectiveFrom; // same-day replacement
    }
    previous.status = 'superseded';
    previous.history.push({ at: nowISO(), by: who.name, what: `Superseded by contract ${record.id}`, reason: fields.changeReason || '' });
    await persistContract(previous);
  }
  await persistContract(record, AUDIT_ACTIONS.CONTRACT_CREATED,
    `Contract for ${record.crewName}: ${type.label} at ${fmtMoneyCents(rateCents)} effective ${record.effectiveFrom}. Reason: ${record.changeReason}`);
  return record;
}

/** Editable fields of the CURRENT version (rate/notes) — audited, history kept. */
export async function updateContract(contractId, patch) {
  const c = await get(STORES.CONTRACTS, contractId);
  if (!c) throw new Error('Contract not found.');
  if (c.status === 'superseded') throw new Error('Superseded contract versions are read-only history.');
  if (!String(patch.changeReason || '').trim()) throw new Error('A reason is required for every contract change.');
  const who = sessionBrief();
  const before = { rateCents: c.rateCents, notes: c.notes, signedOn: c.signedOn, signedContractRef: c.signedContractRef };
  if (patch.rate !== undefined) {
    const rateCents = toCents(patch.rate);
    if (!Number.isFinite(rateCents) || rateCents <= 0) throw new Error('Enter a positive rate.');
    if (c.type === 'hourly') {
      const nmw = minimumWageFor(c.effectiveFrom);
      if (rateCents < nmw.hourlyCents) throw new Error(`Below the national minimum wage (${fmtMoneyCents(nmw.hourlyCents)}/hour).`);
    }
    c.rateCents = rateCents;
  }
  if (patch.notes !== undefined) c.notes = patch.notes;
  if (patch.signedOn !== undefined) c.signedOn = patch.signedOn || null;
  if (patch.signedContractRef !== undefined) c.signedContractRef = String(patch.signedContractRef || '').trim();
  c.history.push({ at: nowISO(), by: who.name, what: 'Edited', reason: patch.changeReason, before });
  c.updatedAt = nowISO(); c.updatedBy = who.name;
  return persistContract(c, AUDIT_ACTIONS.CONTRACT_UPDATED,
    `Contract of ${c.crewName} edited by ${who.name}. Reason: ${patch.changeReason}`);
}
function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
async function persistContract(record, auditAction, auditDetails) {
  await put(STORES.CONTRACTS, record);
  queueForSync(record, 'contracts', 'contract')
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  if (auditAction) await logAction(auditAction, auditDetails);
  emit('data:changed', { store: STORES.CONTRACTS, id: record.id });
  return record;
}

/** Implied hourly rate of a contract (cents/hour). */
export function impliedHourlyCents(contract) {
  if (!contract) return 0;
  if (contract.type === 'hourly') return contract.rateCents;
  if (contract.type === 'fixed_salary') return Math.round(contract.rateCents / (45 * 4.333)); // 45-h week
  if (contract.type === 'daily_sea') return Math.round(contract.rateCents / 8);              // 8-h shift (GN 308 reg 9)
  return 0;
}

/* ============================ allowances ============================ */

export const ALLOWANCE_TYPES = [
  { key: 'transport', label: 'Transport allowance' },
  { key: 'housing', label: 'Housing / accommodation' },
  { key: 'food', label: 'Food / victualling' },
  { key: 'sea_duty', label: 'Sea-duty allowance' },
  { key: 'tools', label: 'Tools / protective clothing' },
  { key: 'other', label: 'Other (describe in the note)' }
];

/** Add an allowance to a trip payroll line (recorded per crew + trip). */
export async function addAllowance({ crewId, tripId, type, amount, note }) {
  const who = sessionBrief();
  const cents = toCents(amount);
  if (!crewId || !tripId) throw new Error('Choose the crew member and the trip.');
  if (!Number.isFinite(cents) || cents <= 0) throw new Error('Enter a positive amount.');
  const t = ALLOWANCE_TYPES.find(x => x.key === type);
  const crew = await get(STORES.CREW, crewId);
  const trip = await get(STORES.TRIPS, tripId);
  const record = {
    id: uuid(), crewId, crewName: crew?.fullName || 'Unknown',
    tripId, tripRef: trip?.reference || '',
    type, typeLabel: t?.label || type,
    amountCents: cents, note: note || '',
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  await put(STORES.ALLOWANCES, record);
  queueForSync(record, 'allowances', 'allowance').catch(() => {});
  await logAction(AUDIT_ACTIONS.ALLOWANCE_ADDED, `${record.typeLabel} of ${fmtMoneyCents(cents)} for ${record.crewName} — trip ${record.tripRef}. ${record.note}`);
  emit('data:changed', { store: STORES.ALLOWANCES, id: record.id });
  return record;
}

/* ====================== the payroll calculation ====================== */

function sessionBrief() {
  const s = currentSession();
  return { userId: s?.userId || 'unknown', name: s?.fullName || 'Unknown user', role: s?.role || '-' };
}

/**
 * Price ONE crew member's trip into a payslip line set.
 * Inputs: classified closed events of the trip for this person, the
 * contract in force on each shift's clock-in date, allowances, catch-share
 * commission (price × share kg), and statutory rules as of the run date.
 * Output: a full breakdown — every earning and deduction on its own line,
 * in cents, plus the totals and the inputs used (auditability).
 */
export function priceCrewTrip({ crew, contract, events, allowances, commissionCents, runDateKey, hoursSettings, quotaLine }) {
  const labour = labourRatesFor(runDateKey);
  const lines = [];
  let grossCents = 0;

  /* ---- 1. Time-based earnings (per event, priced by its own contract) ---- */
  const hourlyByShift = new Map(); // shift start dateKey → contract that prices it
  const catTotals = { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0 };
  const shiftDays = new Set();
  let nightAllowanceCents = 0;

  for (const ev of events) {
    const shiftKey = localDateKey(ev.clockInAt);
    shiftDays.add(shiftKey);
    // Price with the contract in force on the clock-in date (effective-dated).
    const contractForShift = ev._contract || contract;
    const base = impliedHourlyCents(contractForShift);
    const cats = ev.categories || { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0 };
    for (const k of Object.keys(catTotals)) catTotals[k] += cats[k] || 0;

    /* Ordinary minutes at 1× — but a fixed salary already covers ordinary time. */
    if (contractForShift.type === 'hourly' || contractForShift.type === 'daily_sea') {
      if (cats.ordinary > 0) {
        const amount = Math.round(cats.ordinary * base / 60);
        lines.push({ kind: 'earning', label: 'Ordinary hours', detail: `${fmtHrs(cats.ordinary)} × ${fmtMoneyCents(base)}/h`, amountCents: amount });
        grossCents += amount;
      }
      if (contractForShift.type === 'daily_sea') {
        // Daily-rate fishers: the day at sea pays the daily rate (reg 4(a));
        // ordinary minutes inside the 8-h shift structure are covered by it.
        const dayAmount = contractForShift.rateCents;
        lines.push({ kind: 'earning', label: 'Day at sea', detail: `${shiftKey} — daily rate`, amountCents: dayAmount });
        grossCents += dayAmount;
      }
    } else if (contractForShift.type === 'fixed_salary') {
      // Salary covers ordinary time; nothing extra per ordinary minute.
    }

    /* Overtime at ≥1.5× (Labour Act s17(2)). */
    if (cats.overtime > 0) {
      const amount = Math.round(cats.overtime * base * labour.overtimeMultiplier / 60);
      lines.push({ kind: 'earning', label: `Overtime (×${labour.overtimeMultiplier})`, detail: `${fmtHrs(cats.overtime)} × ${fmtMoneyCents(base)}/h × ${labour.overtimeMultiplier}`, amountCents: amount });
      grossCents += amount;
    }
    /* Night-category minutes at 1× (they are worked hours outside the daily allowance… but the
       classification already guarantees night minutes are within/rest outside ordinary allowance);
       plus the s19(1) 6% allowance on statutory 20:00–07:00 minutes of the shift. */
    if (cats.night > 0) {
      const amount = Math.round(cats.night * base / 60);
      lines.push({ kind: 'earning', label: 'Night work (hours)', detail: `${fmtHrs(cats.night)} × ${fmtMoneyCents(base)}/h`, amountCents: amount });
      grossCents += amount;
    }
    /* s19(1) 6% allowance on the statutory 20:00–07:00 minutes of the
       shift. Computed on the NET worked window (breaks are not worked
       time): shrink the clock-out by the event's break minutes, exactly
       like the Phase 4 classification does. */
    const evBreak = Math.max(0, Number(ev.breakMinutes) || 0);
    const netOut = new Date(new Date(ev.clockInAt).getTime() + Math.max(0, (new Date(ev.clockOutAt) - new Date(ev.clockInAt)) / 60000 - evBreak) * 60000).toISOString();
    const s19mins = evBreak > 0
      ? statutoryNightMinutes(ev.clockInAt, netOut, labour)
      : statutoryNightMinutes(ev.clockInAt, ev.clockOutAt, labour);
    if (s19mins > 0) {
      const amount = Math.round(s19mins * base * labour.nightAllowancePct / 60);
      nightAllowanceCents += amount;
      lines.push({ kind: 'earning', label: 'Night-work allowance (6%)', detail: `${fmtHrs(s19mins)} in 20:00–07:00 × ${fmtMoneyCents(base)}/h × 6% (s19(1))`, amountCents: amount });
      grossCents += amount;
    }
    /* Sunday at ≥2× (s21(5)) — on top of nothing: Sunday minutes are outside the
       ordinary allowance by classification, so ×2 of base is the full pay. */
    if (cats.sunday > 0) {
      const amount = Math.round(cats.sunday * base * labour.sundayMultiplier / 60);
      lines.push({ kind: 'earning', label: `Sunday work (×${labour.sundayMultiplier})`, detail: `${fmtHrs(cats.sunday)} × ${fmtMoneyCents(base)}/h × ${labour.sundayMultiplier}`, amountCents: amount });
      grossCents += amount;
    }
    /* Public holiday at ≥2× (s22(7)). */
    if (cats.public_holiday > 0) {
      const amount = Math.round(cats.public_holiday * base * labour.publicHolidayMultiplier / 60);
      lines.push({ kind: 'earning', label: `Public-holiday work (×${labour.publicHolidayMultiplier})`, detail: `${fmtHrs(cats.public_holiday)} × ${fmtMoneyCents(base)}/h × ${labour.publicHolidayMultiplier}`, amountCents: amount });
      grossCents += amount;
    }
    void hourlyByShift;
  }

  /* Fixed salary: the monthly salary is paid outside per-trip pricing; a
     per-trip run shows only the premiums + variable parts. A note explains. */
  if (contract?.type === 'fixed_salary' && events.length) {
    lines.push({
      kind: 'info',
      label: 'Fixed salary note',
      detail: 'Monthly salary is paid on the monthly run; this trip sheet lists premiums and variable pay only.'
    });
  }

  /* ---- 2. Allowances ---- */
  for (const a of allowances) {
    lines.push({ kind: 'earning', label: a.typeLabel, detail: a.note || 'Allowance', amountCents: a.amountCents });
    grossCents += a.amountCents;
  }

  /* ---- 3. Commission (catch share × agreed price) ---- */
  if (commissionCents > 0) {
    const detail = quotaLine
      ? `${quotaLine.methodLabel || 'Quota share'}${quotaLine.shareKg != null ? ` — ${(Number(quotaLine.shareKg) / 1000).toFixed(3)} t` : ''}`
      : 'Catch-share commission';
    lines.push({ kind: 'earning', label: 'Catch commission', detail, amountCents: commissionCents });
    grossCents += commissionCents;
  }

  /* ---- 4. Statutory deductions ---- */
  // SSC: insurable = basic earnings of the month. For a per-trip run we take
  // the time-based part (ordinary + premiums) capped by the monthly rule.
  const basicCents = lines.filter(l => l.kind === 'earning' && /hours|Overtime|Night work \(hours\)|Day at sea/.test(l.label))
    .reduce((s, l) => s + l.amountCents, 0);
  const ssc = sscContributionsCents(basicCents, runDateKey);
  const deductions = [];
  if (ssc.employeeCents > 0) {
    deductions.push({ key: 'ssc_employee', label: 'SSC (employee 0.9%)', amountCents: ssc.employeeCents, statutory: true });
  }

  // PAYE on taxable = gross − SSC employee (SSC contributions are deductible).
  const taxableCents = Math.max(0, grossCents - ssc.employeeCents);
  const paye = monthlyPayeCents(taxableCents, runDateKey);
  if (paye > 0) {
    deductions.push({ key: 'paye', label: 'PAYE (income tax)', amountCents: paye, statutory: true });
  }
  for (const d of deductions) lines.push({ kind: 'deduction', label: d.label, detail: d.statutory ? 'Statutory' : '', amountCents: d.amountCents });

  const deductionCents = deductions.reduce((s, d) => s + d.amountCents, 0);
  const netCents = grossCents - deductionCents;

  return {
    crewId: crew.id, crewName: crew.fullName, position: crew.position || '',
    contractType: contract?.typeLabel || 'No contract',
    signedContractRef: contract?.signedContractRef || '',
    signedOn: contract?.signedOn || null,
    hourCategories: catTotals,
    shiftDays: [...shiftDays],
    lines,
    grossCents, deductionCents, netCents,
    employerSscCents: ssc.employerCents,
    sscRuleId: ssc.ruleId,
    payeCents: paye,
    taxableCents
  };
}
function fmtHrs(mins) {
  const m = Math.round(mins);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

/* ========================== payroll runs ========================== */

export const RUN_STATUSES = ['draft', 'approved', 'locked'];

/** Trips ready for payroll: returned/at-sea trips with classified hours. */
export async function payrollReadyTrips() {
  const trips = (await getAll(STORES.TRIPS))
    .filter(t => ['payroll_pending', 'approved', 'closed'].includes(t.status));
  return trips.sort((a, b) => String(b.actualReturnAt || b.plannedReturnAt || '').localeCompare(String(a.actualReturnAt || a.plannedReturnAt || '')));
}

/**
 * Build a DRAFT per-trip payroll run: one payslip line-set per crew member
 * with classified hours on the trip. Deterministic; re-running replaces the
 * draft (never an approved/locked one — see duplicate prevention).
 */
export async function buildTripRun(tripId, { commissionPricePerKg } = {}) {
  const who = sessionBrief();
  const trip = await get(STORES.TRIPS, tripId);
  if (!trip) throw new Error('Trip not found.');
  const existing = (await getAll(STORES.PAYROLL_CALCULATIONS)).find(r => r.tripId === tripId && r.status !== 'draft');
  if (existing) throw new Error(`A payroll for trip ${trip.reference} already exists in status "${existing.status}". Locked payrolls are never recalculated — use an adjustment entry on a later run instead.`);

  const runDateKey = localDateKey(nowISO());
  const hoursSettings = await getHoursSettings();

  // Classified events per crew member on this trip (Phase 4 engine output).
  const events = (await getAll(STORES.CLOCK_EVENTS))
    .filter(e => e.tripId === tripId && e.status === 'closed')
    .sort((a, b) => String(a.clockInAt).localeCompare(String(b.clockInAt)));
  const byCrew = new Map();
  for (const ev of events) {
    if (!byCrew.has(ev.employeeId)) byCrew.set(ev.employeeId, []);
    byCrew.get(ev.employeeId).push(ev);
  }
  // Crew members who worked the trip (from events), plus assignments.
  const assignments = (await getAll(STORES.ASSIGNMENTS)).filter(a => a.tripId === tripId);
  for (const a of assignments) if (!byCrew.has(a.crewId)) byCrew.set(a.crewId, []);
  const crewIds = [...byCrew.keys()].filter(Boolean);

  // Commission inputs: active quota allocation × price per kg (optional).
  const price = Number(commissionPricePerKg) > 0 ? Number(commissionPricePerKg) : null;
  let quota = null, quotaLines = [];
  if (price) {
    const allocs = (await getAll(STORES.QUOTA_ALLOCATIONS))
      .filter(q => q.tripId === tripId && q.status === 'active');
    if (!allocs.length) {
      quota = { none: true };
    } else {
      quota = allocs[allocs.length - 1];
      quotaLines = quota.lines || [];
    }
  }

  const payslips = [];
  const warnings = [];
  for (const crewId of crewIds) {
    const crew = await get(STORES.CREW, crewId);
    if (!crew) { warnings.push(`Crew record ${crewId} not found — skipped.`); continue; }
    const crewEvents = byCrew.get(crewId) || [];
    // Attach the contract in force on each event's clock-in date.
    for (const ev of crewEvents) {
      ev._contract = await contractFor(crewId, localDateKey(ev.clockInAt));
    }
    const contract = crewEvents[0]?._contract || await contractFor(crewId, runDateKey);
    if (!contract) warnings.push(`${crew.fullName} has no contract — time earnings cannot be priced. Add a contract first.`);
    const allowances = (await getAll(STORES.ALLOWANCES)).filter(a => a.crewId === crewId && a.tripId === tripId);
    let commissionCents = 0, quotaLine = null;
    if (price && quota && !quota.none) {
      quotaLine = quotaLines.find(l => l.crewId === crewId) || null;
      const kg = Number(quotaLine?.shareKg) || 0;
      commissionCents = Math.round(kg * price * 100);
    }
    const slip = priceCrewTrip({
      crew, contract, events: crewEvents, allowances,
      commissionCents, runDateKey, hoursSettings, quotaLine
    });
    if (quotaLine) slip.quotaLine = quotaLine;
    payslips.push(slip);
  }
  if (price && quota?.none) warnings.push('No active quota allocation for this trip — commission not calculated. Create one on the Catch & Quota screen.');

  const record = {
    id: uuid(),
    tripId, tripRef: trip.reference, vesselId: trip.vesselId, vesselName: trip.vesselName,
    status: 'draft',
    runDateKey,
    commissionPricePerKg: price,
    payslips,
    totals: {
      grossCents: payslips.reduce((s, p) => s + p.grossCents, 0),
      deductionCents: payslips.reduce((s, p) => s + p.deductionCents, 0),
      netCents: payslips.reduce((s, p) => s + p.netCents, 0),
      employerSscCents: payslips.reduce((s, p) => s + p.employerSscCents, 0)
    },
    warnings,
    approvalHistory: [],
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  await persistRun(record, AUDIT_ACTIONS.PAYROLL_DRAFTED,
    `Draft payroll built for trip ${trip.reference}: ${payslips.length} payslip(s), net ${fmtMoneyCents(record.totals.netCents)}.`);
  return record;
}

/** Approve + LOCK a draft run (payroll_admin / system_admin). */
export async function approveRun(runId, { note } = {}) {
  const who = sessionBrief();
  const run = await get(STORES.PAYROLL_CALCULATIONS, runId);
  if (!run) throw new Error('Payroll run not found.');
  if (run.status !== 'draft') throw new Error('Only draft payrolls can be approved.');
  if (!note || !String(note).trim()) throw new Error('An approval note is required.');

  // Materialise one payslip record per crew member (duplicate-proof).
  // Each payslip is stamped with the crew member's userId so the server
  // rules can enforce "crew read only their own" (payslips/{id}.userId).
  const slips = [];
  for (const p of run.payslips) {
    const dupe = (await getAll(STORES.PAYSLIPS)).find(s => s.crewId === p.crewId && s.tripId === run.tripId);
    if (dupe) { slips.push(dupe); continue; }
    const crew = await get(STORES.CREW, p.crewId);
    const slip = {
      id: uuid(),
      runId, tripId: run.tripId, tripRef: run.tripRef, vesselName: run.vesselName,
      crewId: p.crewId, crewName: p.crewName, position: p.position,
      userId: crew?.userId || null,
      contractType: p.contractType,
      signedContractRef: p.signedContractRef || '',
      signedOn: p.signedOn || null,
      periodLabel: `Trip ${run.tripRef}`,
      payDate: localDateKey(nowISO()),
      lines: p.lines, hourCategories: p.hourCategories,
      grossCents: p.grossCents, deductionCents: p.deductionCents, netCents: p.netCents,
      employerSscCents: p.employerSscCents,
      status: 'issued',
      createdAt: nowISO(), createdBy: who.name,
      updatedAt: nowISO(), updatedBy: who.name,
      syncStatus: SYNC_STATUS.LOCAL
    };
    await put(STORES.PAYSLIPS, slip);
    queueForSync(slip, 'payslips', 'payslip').catch(() => {});
    slips.push(slip);
  }

  run.status = 'locked';
  run.approvalHistory.push({ at: nowISO(), by: who.name, role: who.role, note: String(note).trim(), action: 'approved+locked' });
  run.updatedAt = nowISO(); run.updatedBy = who.name;
  await persistRun(run, AUDIT_ACTIONS.PAYROLL_APPROVED,
    `Payroll for trip ${run.tripRef} approved and locked by ${who.name}. ${slips.length} payslip(s) issued. Note: ${note}`);
  return { run, slips };
}

/** Adjustment entry: a visible correction on a LATER run — never edits history. */
export async function addAdjustment({ crewId, tripId, label, amount, reason, kind = 'deduction' }) {
  const who = sessionBrief();
  if (!crewId || !tripId) throw new Error('Choose the crew member and the trip.');
  if (!label || !String(label).trim()) throw new Error('Describe the adjustment.');
  if (!reason || !String(reason).trim()) throw new Error('A reason is required for every adjustment.');
  const cents = toCents(amount);
  if (!Number.isFinite(cents) || cents === 0) throw new Error('Enter a non-zero amount.');
  const crew = await get(STORES.CREW, crewId);
  const trip = await get(STORES.TRIPS, tripId);
  const record = {
    id: uuid(), crewId, crewName: crew?.fullName || 'Unknown',
    tripId, tripRef: trip?.reference || '',
    label: String(label).trim(), reason: String(reason).trim(),
    kind, // 'earning' | 'deduction'
    amountCents: Math.abs(cents),
    status: 'pending',        // pending → included in the next approved run
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  await put(STORES.DEDUCTIONS, record);
  queueForSync(record, 'deductions', 'adjustment').catch(() => {});
  await logAction(AUDIT_ACTIONS.ADJUSTMENT_ADDED,
    `${kind === 'earning' ? 'Earning' : 'Deduction'} adjustment "${record.label}" of ${fmtMoneyCents(record.amountCents)} for ${record.crewName} — trip ${record.tripRef}. Reason: ${record.reason}`);
  emit('data:changed', { store: STORES.DEDUCTIONS, id: record.id });
  return record;
}

/* ---------------------- queries used by screens ---------------------- */

export async function listRuns() {
  const rows = await getAll(STORES.PAYROLL_CALCULATIONS);
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function getRun(id) { return get(STORES.PAYROLL_CALCULATIONS, id); }

export async function listPayslips(crewId) {
  const rows = await getAll(STORES.PAYSLIPS);
  return (crewId ? rows.filter(s => s.crewId === crewId) : rows)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function myPayslips(userId) {
  const crew = (await getAll(STORES.CREW)).find(c => c.userId === userId);
  if (!crew) return [];
  return listPayslips(crew.id);
}

/** Pending adjustments for a trip (shown on the run review + payslip views). */
export async function adjustmentsFor(crewId, tripId) {
  return (await getAll(STORES.DEDUCTIONS))
    .filter(a => (!crewId || a.crewId === crewId) && (!tripId || a.tripId === tripId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function persistRun(record, auditAction, auditDetails) {
  await put(STORES.PAYROLL_CALCULATIONS, record);
  queueForSync(record, 'payroll_calculations', 'payroll_run')
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  if (auditAction) await logAction(auditAction, auditDetails);
  emit('data:changed', { store: STORES.PAYROLL_CALCULATIONS, id: record.id });
  return record;
}
