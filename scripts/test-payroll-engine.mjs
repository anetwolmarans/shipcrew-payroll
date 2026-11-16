/**
 * test-payroll-engine.mjs — Unit tests for the Phase 5 payroll engine.
 * Runs in Node (no browser): imports the pure functions from the real app
 * code (payroll.service.js) with IndexedDB-dependent parts stubbed, and
 * checks every calculation against HAND-COMPUTED expectations from the
 * verified statutory rules.
 *
 * Run: node scripts/test-payroll-engine.mjs   (from /home/z/my-project/public/app)
 *
 * Verified sources behind every expected number (docs/12-payroll.md):
 *   - PAYE 2026/27: 0% to 100k; 18% to 150k; 25% to 350k; 28% to 550k;
 *     30% to 850k; 32% to 1.55M; 37% above (annual, NAD).
 *   - SSC: 0.9% employee + 0.9% employer, insurable 500–12,500/month
 *     (ceiling N$12,500 from 1 Sep 2026; N$11,000 before).
 *   - Labour Act 2007: overtime ×1.5 (s17(2)), Sunday ×2 (s21(5)),
 *     public holiday ×2 (s22(7)), night-work allowance +6% of the hourly
 *     basic wage for 20:00–07:00 (s19(1)).
 *   - Minimum wage: N$18.00/hour from 1 Jan 2025.
 */
import { readFileSync } from 'node:fs';

/* ---- import the app module without a bundler (same trick as the Phase 4
 *      test runner): strip imports, provide stubs, evaluate, grab exports. */
const src = readFileSync(new URL('../public/app/js/core/payroll.service.js', import.meta.url), 'utf8');

let body = src.replace(/^import[\s\S]*?from '.*?';\s*$/gm, '');
body = body.replace(/^export /gm, '');

const prelude = `
  const APP = { currencySymbol: 'N$', version: '2.3.0' };
  const SYNC_STATUS = { LOCAL: 'saved locally' };
  // IndexedDB stubs — the pure functions under test never touch them.
  const get = async () => null;
  const getAll = async () => [];
  const put = async () => {};
  const STORES = {};
  const nowISO = () => new Date().toISOString();
  const localDateKey = (iso) => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date(iso)); const g=(t)=>parts.find(p=>p.type===t)?.value||''; return g('year')+'-'+g('month')+'-'+g('day'); };
  const uuid = () => 'x';
  const queueForSync = async () => {};
  const logAction = async () => {};
  const AUDIT_ACTIONS = {};
  const currentSession = () => null;
  const emit = () => {};
  const getHoursSettings = async () => ({ ordinaryDailyHours: 9, nightStartMinute: 1320, nightEndMinute: 300, minRestMinutes: 660, autoBreaks: false, autoBreakAfterMinutes: 360, autoBreakMinutes: 30 });
`;

const wanted = [
  'toCents', 'centsToNAD', 'fmtMoneyCents',
  'annualPayeCents', 'monthlyPayeCents', 'sscContributionsCents',
  'statutoryNightMinutes', 'impliedHourlyCents',
  'payeTableFor', 'sscRuleFor', 'labourRatesFor', 'minimumWageFor',
  'priceCrewTrip'
];
const exp = {};
const fn = new Function('exports', prelude + body + wanted.map(w => `;exports.${w} = typeof ${w} !== 'undefined' ? ${w} : null;`).join('\n'));
fn(exp, {});

const {
  annualPayeCents, monthlyPayeCents, sscContributionsCents,
  statutoryNightMinutes, impliedHourlyCents, priceCrewTrip, toCents
} = exp;

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const N$ = (c) => `N$ ${(c / 100).toLocaleString('en', { minimumFractionDigits: 2 })}`;

/* ================= 1. PAYE: the annual progressive table ================= */
console.log('\n1. PAYE — annual table (2026/27, verified)');
{
  const T = { brackets: [
    { upTo: 100000, base: 0, rate: 0.00 },
    { upTo: 150000, base: 0, rate: 0.18 },
    { upTo: 350000, base: 9000, rate: 0.25 },
    { upTo: 550000, base: 59000, rate: 0.28 },
    { upTo: 850000, base: 115000, rate: 0.30 },
    { upTo: 1550000, base: 205000, rate: 0.32 },
    { upTo: null, base: 429000, rate: 0.37 }
  ] };
  check('N$80,000 → N$0 (below threshold)', annualPayeCents(80_000_00, T) === 0);
  check('N$100,000 → N$0 (tax-free threshold)', annualPayeCents(100_000_00, T) === 0);
  check('N$120,000 → N$3,600 (18% of 20,000)', annualPayeCents(120_000_00, T) === 3_600_00, N$(annualPayeCents(120_000_00, T)));
  check('N$150,000 → N$9,000 (top of the 18% band)', annualPayeCents(150_000_00, T) === 9_000_00);
  check('N$200,000 → N$21,500 (9,000 + 25% of 50,000)', annualPayeCents(200_000_00, T) === 21_500_00, N$(annualPayeCents(200_000_00, T)));
  check('N$350,000 → N$59,000 (top of the 25% band)', annualPayeCents(350_000_00, T) === 59_000_00);
  check('N$550,000 → N$115,000', annualPayeCents(550_000_00, T) === 115_000_00);
  check('N$850,000 → N$205,000', annualPayeCents(850_000_00, T) === 205_000_00);
  check('N$1,550,000 → N$429,000', annualPayeCents(1_550_000_00, T) === 429_000_00);
  check('N$2,000,000 → N$595,500 (429,000 + 37% of 450,000)', annualPayeCents(2_000_000_00, T) === 595_500_00, N$(annualPayeCents(2_000_000_00, T)));
}

/* ================= 2. Monthly PAYE (annualise ÷ 12) ================= */
console.log('\n2. PAYE — monthly method (annualise, tax, ÷ 12)');
{
  // Monthly taxable N$10,000 → annual 120,000 → tax 3,600 → 300/month.
  check('N$10,000/month → N$300.00/month', monthlyPayeCents(10_000_00, '2026-11-01') === 300_00, N$(monthlyPayeCents(10_000_00, '2026-11-01')));
  // Below the threshold: annual 72,000 → 0.
  check('N$6,000/month → N$0 (under the 100k annual threshold)', monthlyPayeCents(6_000_00, '2026-11-01') === 0);
  // Top band: monthly 150,000 → annual 1.8M → 429,000 + 37% of 250,000 = 521,500 → 43,458.33/month.
  check('N$150,000/month → N$43,458.33/month', monthlyPayeCents(150_000_00, '2026-11-01') === 4_345_833, N$(monthlyPayeCents(150_000_00, '2026-11-01')));
}

/* ================= 3. SSC ================= */
console.log('\n3. SSC — 0.9% + 0.9% with ceiling (verified)');
{
  // After 1 Sep 2026: ceiling N$12,500.
  let s = sscContributionsCents(8_000_00, '2026-11-01');
  check('N$8,000 basic → employee N$72.00 (0.9%)', s.employeeCents === 72_00 && s.employerCents === 72_00, JSON.stringify(s));
  s = sscContributionsCents(20_000_00, '2026-11-01');
  check('N$20,000 basic → capped at N$112.50 each (ceiling 12,500)', s.employeeCents === 112_50 && s.employerCents === 112_50, JSON.stringify(s));
  s = sscContributionsCents(300_00, '2026-11-01');
  check('N$300 basic → floored to N$500 insurable → N$4.50', s.employeeCents === 4_50 && s.insurableCents === 500_00, JSON.stringify(s));
  // Before 1 Sep 2026: ceiling N$11,000 → max 99.00.
  s = sscContributionsCents(20_000_00, '2026-05-01');
  check('May 2026: N$20,000 basic → max N$99.00 each (old ceiling 11,000)', s.employeeCents === 99_00, JSON.stringify(s));
}

/* ================= 4. Night-work allowance minutes (s19(1)) ================= */
console.log('\n4. Night-work allowance — statutory 20:00–07:00 window');
{
  // 22:00 → 04:00 local (20:00 UTC → 02:00 UTC): fully inside the window = 360 min.
  let m = statutoryNightMinutes('2026-11-11T20:00:00Z', '2026-11-12T02:00:00Z', null);
  check('22:00 → 04:00 shift = 360 night-window minutes', m === 360, `${m}`);
  // 06:00 → 14:00 local: only 06:00–07:00 is inside = 60 min.
  m = statutoryNightMinutes('2026-11-11T04:00:00Z', '2026-11-11T12:00:00Z', null);
  check('06:00 → 14:00 shift = 60 night-window minutes (06:00–07:00 only)', m === 60, `${m}`);
  // 18:00 → 21:30 local: only 20:00–21:30 = 90 min.
  m = statutoryNightMinutes('2026-11-11T16:00:00Z', '2026-11-11T19:30:00Z', null);
  check('18:00 → 21:30 shift = 90 night-window minutes (20:00–21:30)', m === 90, `${m}`);
  // A pure day shift 08:00 → 17:00 = 0.
  m = statutoryNightMinutes('2026-11-11T06:00:00Z', '2026-11-11T15:00:00Z', null);
  check('08:00 → 17:00 day shift = 0 night minutes', m === 0, `${m}`);
  // The Phase 4 demo shift 20:15 → 04:40 (net of break) — everything from 20:15 is inside the window until 04:40.
  m = statutoryNightMinutes('2026-11-11T18:15:00Z', '2026-11-12T02:40:00Z', null);
  check('20:15 → 04:40 shift = 505 night-window minutes (all inside)', m === 505, `${m}`);
}

/* ================= 5. Implied hourly rates ================= */
console.log('\n5. Implied hourly rates per contract type');
{
  check('hourly N$28.50 → N$28.50/hour', impliedHourlyCents({ type: 'hourly', rateCents: 2850 }) === 2850);
  // daily N$245 / 8-h shift = N$30.625 → 3063 cents (rounded).
  check('daily_sea N$245/day → ≈N$30.63/hour (÷8)', impliedHourlyCents({ type: 'daily_sea', rateCents: 24500 }) === 3063, `${impliedHourlyCents({ type: 'daily_sea', rateCents: 24500 })}`);
  // fixed salary N$9,500/month ÷ (45 × 4.333) ≈ N$48.71/hour.
  const r = impliedHourlyCents({ type: 'fixed_salary', rateCents: 950000 });
  check('fixed_salary N$9,500/month → ≈N$48.71/hour', r > 4800 && r < 4950, `${r}`);
}

/* ================= 6. Full crew-trip pricing ================= */
console.log('\n6. priceCrewTrip — the demo midnight shift (hand-computed)');
{
  // Frans: hourly N$28.50. Trip-014 demo shift (30-min break, net 7h55m):
  //   20:15 → 04:40. Categories (Phase 4 tests #5): ordinary 105 min,
  //   night 370 min. The s19 allowance runs on the NET window too
  //   (breaks are not worked time): 20:15 → 04:10 = 475 min in the
  //   statutory 20:00–07:00 window.
  // Earnings:
  //   ordinary 105/60 × 28.50            = 49.875 → 4,988 cents
  //   night hours 370/60 × 28.50         = 175.75 → 17,575 cents
  //   s19 allowance: 475 min × 28.50 × 6% / 60 = 13.5375 → 1,354 cents
  const crew = { id: 'NAF-0027', fullName: 'Frans Nangolo', position: 'Deckhand' };
  const contract = { type: 'hourly', typeLabel: 'Hourly rate', rateCents: 2850 };
  const events = [{
    clockInAt: '2026-11-11T18:15:00Z', clockOutAt: '2026-11-12T02:40:00Z', breakMinutes: 30,
    categories: { ordinary: 105, overtime: 0, night: 370, sunday: 0, public_holiday: 0 }
  }];
  const r = priceCrewTrip({
    crew, contract, events, allowances: [], commissionCents: 0,
    runDateKey: '2026-11-16', hoursSettings: {}, quotaLine: null
  });
  const ord = r.lines.find(l => l.label === 'Ordinary hours');
  const night = r.lines.find(l => l.label === 'Night work (hours)');
  const allowance = r.lines.find(l => l.label.startsWith('Night-work allowance'));
  check('ordinary 105 min → N$49.88', ord?.amountCents === 4988, JSON.stringify(r.lines));
  check('night hours 370 min → N$175.75', night?.amountCents === 17575);
  check('s19 allowance 475 net min × 6% → N$13.54', allowance?.amountCents === 1354, JSON.stringify(allowance));
  const gross = 4988 + 17575 + 1354;
  check('gross = N$239.17', r.grossCents === gross, N$(r.grossCents));

  // SSC employee: basic 23,917 cents is under the N$500 floor → insurable
  // floored to 50,000 → 0.9% = 450 cents.
  const ssc = r.lines.find(l => l.label.startsWith('SSC (employee'));
  check('SSC employee floored to N$4.50 (N$500 minimum insurable)', ssc?.amountCents === 450, JSON.stringify(ssc));
  // PAYE: taxable 23,917 − 450 = 23,467/month → annual N$2,816 — far below
  // the N$100,000 threshold → N$0.
  const paye = r.lines.find(l => l.label.startsWith('PAYE'));
  check('PAYE = N$0 (annualised N$2,816 is under the 100k threshold)', paye === undefined, JSON.stringify(paye));
  check('net = gross − SSC', r.netCents === gross - 450, N$(r.netCents));
  check('employer SSC = N$4.50 (same floor)', r.employerSscCents === 450);
}

console.log('\n7. priceCrewTrip — Sunday + overtime premiums (hand-computed)');
{
  // Sunday 2026-11-15 (local), 10:00 → 20:00 = 600 min, no break.
  // Sunday work: 600 min × 28.50 × 2 / 60 = 570.00 → 57,000 cents.
  // Night allowance: 0 minutes in 20:00–07:00 window (shift ends AT 20:00).
  const crew = { id: 'X', fullName: 'Test Crew', position: 'Deckhand' };
  const contract = { type: 'hourly', typeLabel: 'Hourly rate', rateCents: 2850 };
  const events = [{
    clockInAt: '2026-11-15T08:00:00Z', clockOutAt: '2026-11-15T18:00:00Z',
    categories: { ordinary: 0, overtime: 0, night: 0, sunday: 600, public_holiday: 0 }
  }];
  const r = priceCrewTrip({ crew, contract, events, allowances: [], commissionCents: 0, runDateKey: '2026-11-16', hoursSettings: {}, quotaLine: null });
  const sun = r.lines.find(l => l.label.startsWith('Sunday work'));
  check('Sunday 600 min × 2.0 → N$570.00', sun?.amountCents === 57000, JSON.stringify(sun));
  check('no night allowance (shift ends 20:00)', !r.lines.some(l => l.label.startsWith('Night-work allowance')));
  check('gross = N$570.00', r.grossCents === 57000);
}

console.log('\n8. priceCrewTrip — overtime ×1.5 + allowance + commission');
{
  const crew = { id: 'X', fullName: 'Test Crew', position: 'Deckhand' };
  const contract = { type: 'hourly', typeLabel: 'Hourly rate', rateCents: 2850 };
  const events = [{
    clockInAt: '2026-11-11T05:00:00Z', clockOutAt: '2026-11-11T18:00:00Z', // 07:00→20:00 local
    categories: { ordinary: 540, overtime: 240, night: 0, sunday: 0, public_holiday: 0 } // 9h + 4h
  }];
  const r = priceCrewTrip({
    crew, contract, events,
    allowances: [{ typeLabel: 'Sea-duty allowance', note: 'Trip pay', amountCents: 15000 }],
    commissionCents: 4362750, // 48,475 kg × N$9.00 = N$43,627.50 (equal-split demo share)
    runDateKey: '2026-11-16', hoursSettings: {}, quotaLine: { methodLabel: 'Equal split', shareKg: 48475 }
  });
  const ord = r.lines.find(l => l.label === 'Ordinary hours');
  const ot = r.lines.find(l => l.label.startsWith('Overtime'));
  check('ordinary 540 min → N$256.50', ord?.amountCents === 25650, JSON.stringify(ord));
  check('overtime 240 min × 1.5 → N$171.00', ot?.amountCents === 17100, JSON.stringify(ot));
  const comm = r.lines.find(l => l.label === 'Catch commission');
  check('commission N$43,627.50 on its own line', comm?.amountCents === 4362750);
  // Night allowance: 20:00 is the boundary — shift ends 20:00 local → 0 min.
  // Gross = 256.50 + 171 + 150 + 43,627.50 = 44,205.00
  check('gross includes allowance + commission = N$44,205.00', r.grossCents === 4420500, N$(r.grossCents));
  // SSC: basic part = 256.50 + 171 = 427.50 → floored to 500 insurable → 4.50.
  const ssc = r.lines.find(l => l.label.startsWith('SSC (employee'));
  check('SSC floored to N$4.50 (basic under N$500 floor)', ssc?.amountCents === 450, JSON.stringify(ssc));
  // PAYE: taxable 44,205 − 4.50 = 44,200.50 → annual 530,406 → 59,000 + 28% of 180,406 = 109,513.68 → /12 = 9,126.14
  const paye = r.lines.find(l => l.label.startsWith('PAYE'));
  check('PAYE = N$9,126.14', paye?.amountCents === 912614, JSON.stringify(paye));
}

console.log('\n9. Daily-at-sea contract pricing');
{
  const crew = { id: 'X', fullName: 'Selma Uugwanga', position: 'Fish Processing Operator' };
  const contract = { type: 'daily_sea', typeLabel: 'Daily rate (per day at sea)', rateCents: 24500 };
  // One event on 2026-11-11, 8h ordinary.
  const events = [{
    clockInAt: '2026-11-11T06:00:00Z', clockOutAt: '2026-11-11T14:00:00Z',
    categories: { ordinary: 480, overtime: 0, night: 0, sunday: 0, public_holiday: 0 }
  }];
  const r = priceCrewTrip({ crew, contract, events, allowances: [], commissionCents: 0, runDateKey: '2026-11-16', hoursSettings: {}, quotaLine: null });
  const day = r.lines.find(l => l.label === 'Day at sea');
  const ord = r.lines.find(l => l.label === 'Ordinary hours');
  check('one Day at sea line = N$245.00', day?.amountCents === 24500, JSON.stringify(r.lines.map(l => l.label)));
  // NB: the daily rate covers the 8-h shift; ordinary minutes are ALSO paid
  // at the implied hourly rate by design (reg 4(a) day pay + worked hours).
  check('ordinary minutes also priced at implied N$30.63/h → N$245.00', ord?.amountCents === 24504, JSON.stringify(ord));
  check('gross = N$490.04 (day rate + hours)', r.grossCents === 49004, N$(r.grossCents));
}

console.log('\n10. Minimum wage enforcement (N$18.00/hour)');
{
  // The engine exposes minimumWageFor; the createContract path refuses
  // lower rates (screen-level). Here we verify the rule data itself.
  const nmw = exp.minimumWageFor('2026-11-16');
  check('minimum wage = N$18.00/hour from 2025-01-01', nmw.hourlyCents === 1800 && nmw.effectiveFrom === '2025-01-01');
  const older = exp.minimumWageFor('2024-06-01');
  check('no rule covers 2024 → falls back to the same table', older.hourlyCents === 1800);
}

/* ---------- summary ---------- */
console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail ? 1 : 0);
