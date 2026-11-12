/**
 * config.js — Application-wide constants.
 * Plain-English: this file holds the "settings that never change while the
 * app runs" — the app name, version, country rules and default values.
 */

export const APP = {
  name: 'ShipCrew Payroll',
  shortName: 'ShipCrew',
  tagline: 'Fishing fleet payroll — Namibia',
  version: '2.1.0',
  buildPhase: 3,          // Which development phase this build belongs to (see docs/06-roadmap.md)
  totalPhases: 6,
  country: 'Namibia',
  currency: 'NAD',        // Namibian Dollar
  currencySymbol: 'N$',
  timezone: 'Africa/Windhoek', // All timestamps are STORED in UTC, DISPLAYED in this timezone
  storageNote: 'Records are stored on this device in UTC and shown in Namibian time (Africa/Windhoek).'
};

/** Service worker cache version. Bump this whenever app files change (see docs/03-deployment). */
export const SW_VERSION = 'shipcrew-v2.1.0-phase3';

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
