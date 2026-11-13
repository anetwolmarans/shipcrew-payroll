/**
 * config.js — Application-wide constants.
 * Plain-English: this file holds the "settings that never change while the
 * app runs" — the app name, version, country rules and default values.
 */

export const APP = {
  name: 'ShipCrew Payroll',
  shortName: 'ShipCrew',
  tagline: 'Fishing fleet payroll — Namibia',
  version: '2.2.0',
  buildPhase: 4,          // Which development phase this build belongs to (see docs/06-roadmap.md)
  totalPhases: 6,
  country: 'Namibia',
  currency: 'NAD',        // Namibian Dollar
  currencySymbol: 'N$',
  timezone: 'Africa/Windhoek', // All timestamps are STORED in UTC, DISPLAYED in this timezone
  storageNote: 'Records are stored on this device in UTC and shown in Namibian time (Africa/Windhoek).'
};

/** Service worker cache version. Bump this whenever app files change (see docs/03-deployment). */
export const SW_VERSION = 'shipcrew-v2.2.0-phase4';

/** Firebase JS SDK version pinned in index.html import map (keep in sync). */
export const FIREBASE_SDK_VERSION = '13.2.0';

/** Default app settings (a company can change these in Settings inside the app). */
export const DEFAULT_SETTINGS = {
  companyName: 'Atlantic Harvest Fisheries (Pty) Ltd',
  companyAddress: '12 Harbour Road, Walvis Bay',
  companyPhone: '+264 64 200 100',
  companyEmail: 'payroll@atlanticharvest.example',
  autoLockMinutes: 15,          // Shared-device protection: lock after this many idle minutes
  maxLoginAttempts: 5,          // Failed logins allowed before a cooldown
  loginCooldownSeconds: 60      // Cooldown length after too many failed logins
};

/**
 * Demo accounts (DEMO MODE ONLY — used before Firebase is connected).
 * Passwords are hashed on this device when the demo data is created.
 * No real employee data must ever be entered in demo mode.
 */
export const DEMO_ACCOUNTS = [
  { email: 'admin@shipcrew.demo',      password: 'Admin@2026',   role: 'system_admin',    label: 'System Administrator' },
  { email: 'payroll@shipcrew.demo',    password: 'Payroll@2026', role: 'payroll_admin',   label: 'Payroll Administrator' },
  { email: 'manager@shipcrew.demo',    password: 'Manager@2026', role: 'vessel_manager',  label: 'Vessel Manager' },
  { email: 'supervisor@shipcrew.demo', password: 'Super@2026',   role: 'supervisor',      label: 'Supervisor' },
  { email: 'crew1@shipcrew.demo',      password: 'Crew@2026',    role: 'crew',            label: 'Crew Member (Frans)' },
  { email: 'crew2@shipcrew.demo',      password: 'Crew@2026',    role: 'crew',            label: 'Crew Member (Selma)' },
  { email: 'auditor@shipcrew.demo',    password: 'Audit@2026',   role: 'auditor',         label: 'Read-only Auditor' }
];

/** Human-readable record sync states (used across the app so wording is consistent). */
export const SYNC_STATUS = {
  LOCAL: 'saved locally',
  PENDING: 'waiting to sync',
  SYNCED: 'synchronised',
  FAILED: 'sync failed — kept'
};

/**
 * The trip status flow (project brief, chapter 6). A trip moves FORWARD one
 * step at a time; every change is recorded in the trip's statusHistory with
 * who changed it and when. Crew may only clock in against trips with status
 * "open" or "at_sea".
 */
export const TRIP_STATUSES = [
  { key: 'planned',         label: 'Planned',         color: 'neutral',  icon: 'calendar', next: 'open',         nextLabel: 'Open for crewing' },
  { key: 'open',            label: 'Open',            color: 'info',     icon: 'users',    next: 'at_sea',       nextLabel: 'Depart — At Sea' },
  { key: 'at_sea',          label: 'At Sea',          color: 'teal',     icon: 'ship',     next: 'returned',     nextLabel: 'Returned to port' },
  { key: 'returned',        label: 'Returned',        color: 'violet',   icon: 'anchor',   next: 'under_review', nextLabel: 'Send for review' },
  { key: 'under_review',    label: 'Under Review',    color: 'warning',  icon: 'eye',      next: 'payroll_pending', nextLabel: 'Send to payroll' },
  { key: 'payroll_pending', label: 'Payroll Pending', color: 'navy',     icon: 'coins',    next: 'approved',     nextLabel: 'Approve trip' },
  { key: 'approved',        label: 'Approved',        color: 'success',  icon: 'check-circle', next: 'closed',   nextLabel: 'Close trip' },
  { key: 'closed',          label: 'Closed',          color: 'neutral',  icon: 'lock',     next: null,           nextLabel: null }
];

export function tripStatus(key) {
  return TRIP_STATUSES.find(s => s.key === key) || TRIP_STATUSES[0];
}

/** Trips with these statuses accept clock-ins. */
export const CLOCKABLE_TRIP_STATUSES = ['open', 'at_sea'];

/** Common fishing-vessel positions offered in the crew register dropdown. */
export const CREW_POSITIONS = [
  'Deckhand', 'Fish Processing Operator', 'Winch Driver', 'Deck Boss',
  'Leading Hand', 'Cook', 'Steward', 'Engineer', 'Mate', 'Skipper',
  'Factory Manager', 'Fisherman (General)', 'Other'
];

/** Identity document types for the crew register. */
export const ID_TYPES = ['Namibian ID', 'Passport', 'Work Permit', 'Seaman\u2019s Book', 'Other'];

/* ==========================================================================
 * PHASE 4 — WORKING HOURS
 * ========================================================================== */

/**
 * Default hour-classification rules (Phase 4). Every value is a company
 * POLICY choice — it can be changed in Settings → Working hours — and is
 * clearly separated from STATUTORY rules (pay RATES, which arrive verified
 * in Phase 5 and are never guessed here).
 */
export const DEFAULT_HOURS_SETTINGS = {
  ordinaryDailyHours: 9,        // hours per day after which time counts as overtime
  nightStartMinute: 22 * 60,    // 22:00 — night work starts
  nightEndMinute: 5 * 60,       // 05:00 — night work ends (spans midnight)
  minRestMinutes: 11 * 60,      // rest warning threshold between shifts (11 h)
  autoBreaks: false,            // break rules: automatic vs manual (decision point)
  autoBreakAfterMinutes: 6 * 60,// manual mode: remind after 6 h without a break
  autoBreakMinutes: 30          // automatic mode: deduct 30 min after 6 h
};

/** The five working-hour categories (labels used everywhere). */
export const HOUR_CATEGORIES = [
  { key: 'ordinary',        label: 'Ordinary',           color: 'info' },
  { key: 'overtime',        label: 'Overtime',           color: 'warning' },
  { key: 'night',           label: 'Night work',         color: 'navy' },
  { key: 'sunday',          label: 'Sunday work',        color: 'violet' },
  { key: 'public_holiday',  label: 'Public holiday',     color: 'teal' }
];

/**
 * Official Namibian public holidays — the RULES of the Public Holidays Act,
 * 1990 (Act 26 of 1990): fixed annual dates, Easter-based days computed with
 * the Anonymous Gregorian algorithm, and the Monday-after-Sunday rule.
 * Verified against the Ministry's 2026 calendar (mict.gov.na) and the
 * Embassy of Namibia (Helsinki) list; see docs/11-working-hours-catch.md.
 */
export const NAMIBIA_PUBLIC_HOLIDAYS = {
  fixed: [
    { month: 1,  day: 1,  name: "New Year's Day" },
    { month: 3,  day: 21, name: 'Independence Day' },
    { month: 5,  day: 4,  name: 'Cassinga Day' },
    { month: 5,  day: 25, name: 'Africa Day' },
    { month: 5,  day: 28, name: 'Genocide Remembrance Day' },
    { month: 8,  day: 26, name: "Heroes' Day" },
    { month: 12, day: 10, name: 'International Human Rights Day' },
    { month: 12, day: 25, name: 'Christmas Day' },
    { month: 12, day: 26, name: 'Day of Goodwill' }
  ],
  /** Easter-based: { offset from Easter Sunday in days } */
  easterBased: [
    { offset: -2,  name: 'Good Friday' },
    { offset: 1,   name: 'Easter Monday' },
    { offset: 39,  name: 'Ascension Day' }
  ],
  /** The Act: when a holiday falls on a Sunday, the following Monday is also a holiday. */
  mondayRule: true,
  source: 'Public Holidays Act, 1990 (Act 26 of 1990) — as listed for 2026 by the Ministry of Information and Communication Technology'
};

/* ==========================================================================
 * PHASE 4 — CATCH & QUOTA
 * ========================================================================== */

/** The six quota-commission allocation methods (project brief, chapter 10). */
export const QUOTA_METHODS = [
  {
    key: 'equal_split', label: 'Equal split',
    description: 'The catch value (or quota payout) is divided equally among all crew members on the trip.'
  },
  {
    key: 'percentage', label: 'Percentage shares',
    description: 'Each crew member receives a fixed percentage per their contract. Shares should total 100%.'
  },
  {
    key: 'fixed_weight', label: 'Fixed weight per role',
    description: 'A fixed tonnage (or amount) per position — e.g. 2 t for a deckhand, 3.5 t for the skipper.'
  },
  {
    key: 'rank_based', label: 'Rank-based points',
    description: 'Points per rank/position (skipper 5, mate 4, deckhand 2…) — each share = points ÷ total points.'
  },
  {
    key: 'contractual', label: 'Contractual formula',
    description: 'A written contractual arrangement captured as a formula note — recorded here, settled in payroll (Phase 5).'
  },
  {
    key: 'custom', label: 'Custom per member',
    description: 'Any custom amount per crew member, entered manually with a reason.'
  }
];

/** Common Namibian fishing species for the catch register dropdown. */
export const CATCH_SPECIES = [
  'Hake (Merluccius capensis)', 'Hake (Merluccius paradoxus)', 'Horse mackerel',
  'Monkfish', 'Kingklip', 'Snoek', 'Cape fur seal bycatch', 'Swordfish',
  'Tuna (Yellowfin)', 'Tuna (Bigeye)', 'Pilchard (Sardine)', 'Other'
];

/** Catch record categories. */
export const CATCH_CATEGORIES = ['Whole round', 'Gutted', 'Headed and gutted', 'Filleted', 'Minced', 'Bycatch', 'Discarded'];
