/**
 * store.js — The data layer: app settings, company profile, users, crew
 * records, devices — plus the DEMO data that is created on first run.
 *
 * PLAIN ENGLISH: every piece of data lives in the device's own database
 * (IndexedDB) first. When Firebase is connected, important records are also
 * uploaded to the central cloud database by sync.service.js.
 *
 * DEMO MODE: the first time the app opens it creates clearly-marked demo
 * accounts (see config.js) so a beginner can try everything immediately.
 * Demo mode is ONLY for trying the app — never enter real employee data
 * before Firebase is connected (see docs/01-firebase-setup.md).
 */
import { get, put, getAll, clear, STORES } from './idb.js';
import { DEFAULT_SETTINGS, DEMO_ACCOUNTS } from '../config.js';
import { uuid, makePasswordRecord } from './security.js';
import { ROLES, ROLE_MATRIX } from './permissions.js';
import { nowISO } from './time.js';

/* ---------- Demo person details (all fictional) ---------- */
const DEMO_PEOPLE = {
  'admin@shipcrew.demo':      { fullName: 'Anna Shipanga' },
  'payroll@shipcrew.demo':    { fullName: 'Petrus Nakanyala' },
  'manager@shipcrew.demo':    { fullName: 'Lena Iipinge' },
  'supervisor@shipcrew.demo': { fullName: 'Jacob Amukoto' },
  'crew1@shipcrew.demo':      { fullName: 'Frans Nangolo', employeeId: 'NAF-0027' },
  'crew2@shipcrew.demo':      { fullName: 'Selma Uugwanga', employeeId: 'NAF-0031' },
  'auditor@shipcrew.demo':    { fullName: 'Carel Tjipuka' }
};

function stamp(extra = {}) {
  return {
    createdAt: nowISO(), createdBy: 'system',
    updatedAt: nowISO(), updatedBy: 'system',
    status: 'active',
    ...extra
  };
}

/* ---------- First-run seeding (and Phase-2 upgrade of existing installs) ---------- */
export async function ensureSeed() {
  const seeded = await get(STORES.META, 'seeded');
  const seedVersion = (await get(STORES.META, 'seedVersion'))?.value || 0;

  if (!seeded) {
    await seedFull();
    await put(STORES.META, { id: 'seedVersion', value: 2 });
    return true;
  }
  if (seedVersion < 2) {
    // An existing Phase 1 device: ADD the Phase 2 demo operations data,
    // never touching the user's existing records.
    await seedPhase2DemoData();
    await put(STORES.META, { id: 'seedVersion', value: 2 });
    return true;
  }
  return false;
}

async function seedBase() {
  // 1) App settings
  await put(STORES.META, { id: 'settings', ...DEFAULT_SETTINGS });

  // 2) Company profile (demo values — edit in Settings)
  await put(STORES.COMPANIES, stamp({
    id: 'main',
    name: DEFAULT_SETTINGS.companyName,
    address: DEFAULT_SETTINGS.companyAddress,
    phone: DEFAULT_SETTINGS.companyPhone,
    email: DEFAULT_SETTINGS.companyEmail,
    country: 'Namibia',
    currency: 'NAD'
  }));

  // 3) Role reference documents (mirror of permissions.js)
  for (const role of ROLES) {
    await put(STORES.ROLES, stamp({
      id: role.id, label: role.label, description: role.description,
      color: role.color, capabilities: ROLE_MATRIX[role.id] || [], builtin: true
    }));
  }

  // 4) Demo user accounts (passwords are HASHED on this device)
  const userIds = {};
  for (const acc of DEMO_ACCOUNTS) {
    const person = DEMO_PEOPLE[acc.email] || { fullName: acc.label };
    const id = uuid();
    userIds[acc.email] = id;
    await put(STORES.USERS, stamp({
      id,
      email: acc.email,
      fullName: person.fullName,
      role: acc.role,
      employeeId: person.employeeId || null,
      isDemo: true,
      lastLoginAt: null,
      password: await makePasswordRecord(acc.password)
    }));
  }

  // 5) Demo crew profiles (shown on the crew home screen)
  await put(STORES.CREW, stamp({
    id: 'NAF-0027',
    userId: userIds['crew1@shipcrew.demo'],
    fullName: 'Frans Nangolo',
    position: 'Deckhand',
    vessel: 'MFV Etosha Bay',
    trip: null,
    phone: '+264 81 234 5678',
    emergencyContact: 'Maria Nangolo — +264 81 234 5679',
    employmentStatus: 'active',
    startDate: '2023-03-01',
    remunerationType: 'hourly',
    remunerationNote: 'Rates are configured with contracts in Phase 5.',
    isDemo: true
  }));
  await put(STORES.CREW, stamp({
    id: 'NAF-0031',
    userId: userIds['crew2@shipcrew.demo'],
    fullName: 'Selma Uugwanga',
    position: 'Fish Processing Operator',
    vessel: 'MFV Etosha Bay',
    trip: null,
    phone: '+264 81 345 6789',
    emergencyContact: 'Paulus Uugwanga — +264 81 345 6780',
    employmentStatus: 'active',
    startDate: '2024-06-15',
    remunerationType: 'hourly',
    remunerationNote: 'Rates are configured with contracts in Phase 5.',
    isDemo: true
  }));

  // 6) Statutory rule PLACEHOLDERS — deliberately WITHOUT any rates.
  //    Nothing is calculated until each rule is researched and verified
  //    against the official source (planned for Phase 5 — see
  //    docs/06-roadmap.md and the Statutory Rules screen in the app).
  const STATUTORY = [
    ['stat_fisher_minimum_wage', 'minimum_wage', 'Fishing-sector minimum wage', 'Labour Act, 2007 (Act 11 of 2007) — Regulations Relating to Fishers, 2025 (GN 308 of 2025)'],
    ['stat_fisher_hours_rest', 'working_hours', 'Ordinary hours, rest periods and time off for fishers', 'Labour Act, 2007 (Act 11 of 2007) — Regulations Relating to Fishers, 2025 (GN 308 of 2025)'],
    ['stat_fisher_payment_terms', 'payment_terms', 'Payment intervals for fishers', 'Labour Act, 2007 (Act 11 of 2007) — Regulations Relating to Fishers, 2025 (GN 308 of 2025)'],
    ['stat_overtime', 'overtime', 'Overtime', 'Labour Act, 2007 (Act 11 of 2007)'],
    ['stat_night_work', 'night_work', 'Night-work allowance', 'Labour Act, 2007 (Act 11 of 2007)'],
    ['stat_sunday_holiday', 'sunday_holiday', 'Sunday and public-holiday work', 'Labour Act, 2007 (Act 11 of 2007); Public Holidays Act, 1990 (Act 26 of 1990)'],
    ['stat_public_holidays', 'public_holidays', 'Official Namibian public-holiday calendar', 'Public Holidays Act, 1990 (Act 26 of 1990)'],
    ['stat_paye', 'paye', 'PAYE — income tax deducted from salaries', 'Income Tax Act, 1981 (Act 24 of 1981) as amended; administered by NamRA'],
    ['stat_ssc', 'ssc', 'Social Security contributions (employee and employer)', 'Social Security Act, 1994 (Act 34 of 1994); rates per SSC notices']
  ];
  for (const [id, category, title, source] of STATUTORY) {
    await put(STORES.STATUTORY_RULES, stamp({
      id, category, title, source,
      jurisdiction: 'Namibia',
      effectiveFrom: null, effectiveTo: null,
      version: null, verifiedBy: null, verifiedDate: null, approvedBy: null,
      values: {},
      verificationStatus: 'awaiting_verification',
      note: 'No rate or formula is implemented until this rule has been verified against the official source. Verification is planned in Phase 5 — the app will never guess a legal rate.'
    }));
  }

  // 7) Local device record (used for the device registry & offline activation later)
  await put(STORES.DEVICES, stamp({
    id: uuid(),
    name: defaultDeviceName(),
    platform: platformSummary(),
    userId: null, ownerName: null,
    registeredAt: nowISO(), lastSeenAt: nowISO(),
    isDemo: true
  }));
  await put(STORES.META, { id: 'localDeviceId', value: (await getAll(STORES.DEVICES))[0].id });

  await put(STORES.META, { id: 'seeded', at: nowISO(), appVersion: '2.0.2' });
  return true;
}

/* ---------- Relative-time helpers for demo data ---------- */
function hoursAgoISO(h) { return new Date(Date.now() - h * 3600000).toISOString(); }
function hoursAheadISO(h) { return new Date(Date.now() + h * 3600000).toISOString(); }

/**
 * Phase 2 demo operations data: the fleet, three trips in different
 * statuses, assignments (one live, one historical) and one historical
 * clock event. All clearly fictional. Called on first run AND when a
 * Phase 1 device upgrades — it only ADDS records.
 */
export async function seedPhase2DemoData() {
  const manager = await getUserByEmail('manager@shipcrew.demo');
  const managerId = manager?.id || null;

  // 1) The fleet (2 vessels)
  await put(STORES.VESSELS, stamp({
    id: 'vessel-etosha', name: 'MFV Etosha Bay', registrationNumber: 'LWB-200-E',
    callSign: 'V5ET2', type: 'Wet-fish trawler', capacity: 42, homePort: 'Walvis Bay',
    managerUserId: managerId, isDemo: true
  }));
  await put(STORES.VESSELS, stamp({
    id: 'vessel-kunene', name: 'MFV Kunene Runner', registrationNumber: 'LWB-115-K',
    callSign: 'V5KU7', type: 'Longliner', capacity: 24, homePort: 'Lüderitz',
    managerUserId: null, isDemo: true
  }));

  // 2) Trips in three different statuses (of the 8-status flow)
  const t013 = hoursAgoISO(21 * 24);
  await put(STORES.TRIPS, stamp({
    id: 'trip-013', reference: 'TRP-2026-013', vesselId: 'vessel-etosha', vesselName: 'MFV Etosha Bay',
    status: 'closed',
    statusHistory: [
      { status: 'planned', at: t013, by: 'Lena Iipinge', note: 'Trip created' },
      { status: 'open', at: hoursAgoISO(20 * 24), by: 'Lena Iipinge', note: 'Open for crewing' },
      { status: 'at_sea', at: hoursAgoISO(20 * 24 - 2), by: 'Lena Iipinge', note: 'Depart — At Sea' },
      { status: 'returned', at: hoursAgoISO(8 * 24), by: 'Lena Iipinge', note: 'Returned to port' },
      { status: 'under_review', at: hoursAgoISO(7 * 24), by: 'Jacob Amukoto', note: 'Send for review' },
      { status: 'payroll_pending', at: hoursAgoISO(6 * 24), by: 'Lena Iipinge', note: 'Send to payroll' },
      { status: 'approved', at: hoursAgoISO(5 * 24), by: 'Petrus Nakanyala', note: 'Approve trip' },
      { status: 'closed', at: hoursAgoISO(5 * 24 - 1), by: 'Anna Shipanga', note: 'Close trip' }
    ],
    departurePort: 'Walvis Bay', returnPort: 'Walvis Bay',
    plannedDepartAt: hoursAgoISO(20 * 24), plannedReturnAt: hoursAgoISO(8 * 24),
    actualDepartAt: hoursAgoISO(20 * 24 - 2), actualReturnAt: hoursAgoISO(8 * 24),
    notes: 'Demo trip — already completed and closed.', isDemo: true
  }));
  await put(STORES.TRIPS, stamp({
    id: 'trip-014', reference: 'TRP-2026-014', vesselId: 'vessel-etosha', vesselName: 'MFV Etosha Bay',
    status: 'at_sea',
    statusHistory: [
      { status: 'planned', at: hoursAgoISO(6 * 24), by: 'Lena Iipinge', note: 'Trip created' },
      { status: 'open', at: hoursAgoISO(3 * 24), by: 'Lena Iipinge', note: 'Open for crewing' },
      { status: 'at_sea', at: hoursAgoISO(2 * 24), by: 'Lena Iipinge', note: 'Depart — At Sea' }
    ],
    departurePort: 'Walvis Bay', returnPort: 'Walvis Bay',
    plannedDepartAt: hoursAgoISO(2 * 24), plannedReturnAt: hoursAheadISO(24 * 5),
    actualDepartAt: hoursAgoISO(2 * 24), actualReturnAt: null,
    notes: 'Demo trip — currently at sea. Frans Nangolo can clock in against this trip.', isDemo: true
  }));
  await put(STORES.TRIPS, stamp({
    id: 'trip-015', reference: 'TRP-2026-015', vesselId: 'vessel-kunene', vesselName: 'MFV Kunene Runner',
    status: 'planned',
    statusHistory: [
      { status: 'planned', at: hoursAgoISO(4), by: 'Lena Iipinge', note: 'Trip created' }
    ],
    departurePort: 'Lüderitz', returnPort: 'Lüderitz',
    plannedDepartAt: hoursAheadISO(24 * 3), plannedReturnAt: hoursAheadISO(24 * 10),
    actualDepartAt: null, actualReturnAt: null,
    notes: 'Demo trip — planned, not yet open for crewing.', isDemo: true
  }));
  await put(STORES.META, { id: 'tripCounter', year: 2026, n: 15 });

  // 3) Assignments — one LIVE (Frans can clock in) and one HISTORICAL.
  //    Selma is deliberately NOT assigned (so the "no trip assigned" block
  //    can be tested with a real demo account).
  await put(STORES.ASSIGNMENTS, stamp({
    id: 'assign-frans-013', crewId: 'NAF-0027', crewName: 'Frans Nangolo', userId: (await getCrewById('NAF-0027'))?.userId || null,
    tripId: 'trip-013', tripRef: 'TRP-2026-013', vesselId: 'vessel-etosha', vesselName: 'MFV Etosha Bay',
    assignedAt: hoursAgoISO(20 * 24), assignedBy: 'Lena Iipinge',
    endedAt: hoursAgoISO(8 * 24), endedBy: 'Lena Iipinge', endReason: 'Trip completed',
    isPrimary: true, status: 'ended', isDemo: true
  }));
  await put(STORES.ASSIGNMENTS, stamp({
    id: 'assign-frans-014', crewId: 'NAF-0027', crewName: 'Frans Nangolo', userId: (await getCrewById('NAF-0027'))?.userId || null,
    tripId: 'trip-014', tripRef: 'TRP-2026-014', vesselId: 'vessel-etosha', vesselName: 'MFV Etosha Bay',
    assignedAt: hoursAgoISO(3 * 24), assignedBy: 'Lena Iipinge',
    endedAt: null, endedBy: null, endReason: null,
    isPrimary: true, status: 'active', isDemo: true
  }));

  // 4) One historical (closed) clock event so Attendance shows history.
  const inAt = hoursAgoISO(19 * 24);
  const outAt = hoursAgoISO(19 * 24 - 9.5);
  await put(STORES.CLOCK_EVENTS, stamp({
    id: 'clock-demo-0001', userId: (await getCrewById('NAF-0027'))?.userId || null, employeeId: 'NAF-0027', crewName: 'Frans Nangolo',
    tripId: 'trip-013', tripRef: 'TRP-2026-013', vesselId: 'vessel-etosha', vesselName: 'MFV Etosha Bay',
    clockInAt: inAt, clockOutAt: outAt,
    durationMinutes: Math.max(0, Math.round((new Date(outAt) - new Date(inAt)) / 60000)),
    status: 'closed', deviceId: null, deviceName: 'Demo record',
    syncStatus: 'saved locally', isDemo: true
  }));
}

async function seedFull() {
  await seedBase();
  await seedPhase2DemoData();
  await put(STORES.META, { id: 'seeded', at: nowISO(), appVersion: '2.0.2' });
}

/* ---------- Settings ---------- */
export async function getSettings() {
  const s = await get(STORES.META, 'settings');
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, updatedAt: nowISO() };
  await put(STORES.META, { id: 'settings', ...next });
  return next;
}

/* ---------- Company ---------- */
export async function getCompany() { return get(STORES.COMPANIES, 'main'); }
export async function saveCompany(patch) {
  const current = (await getCompany()) || { id: 'main' };
  const next = { ...current, ...patch, id: 'main', updatedAt: nowISO(), updatedBy: 'user' };
  await put(STORES.COMPANIES, next);
  return next;
}

/* ---------- Users ---------- */
export async function getUserByEmail(email) {
  const all = await getAll(STORES.USERS);
  return all.find(u => String(u.email).toLowerCase() === String(email).toLowerCase()) || null;
}
export async function getUserById(id) { return get(STORES.USERS, id); }
export async function listUsers() {
  const all = await getAll(STORES.USERS);
  return all.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
}
export async function updateUser(user) {
  return put(STORES.USERS, { ...user, updatedAt: nowISO(), updatedBy: 'user' });
}

/* ---------- Crew ---------- */
export async function getCrewByUserId(userId) {
  const all = await getAll(STORES.CREW);
  return all.find(c => c.userId === userId) || null;
}
export async function getCrewById(id) { return get(STORES.CREW, id); }
export async function listCrew() {
  const all = await getAll(STORES.CREW);
  return all.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
}

/* ---------- Devices ---------- */
export function platformSummary() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android device';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'Apple device';
  if (/Windows/i.test(ua)) return 'Windows computer';
  if (/Macintosh/i.test(ua)) return 'Mac computer';
  if (/Linux/i.test(ua)) return 'Linux computer';
  return 'Unknown device';
}
function defaultDeviceName() { return platformSummary(); }

export async function getOrCreateLocalDevice() {
  const pointer = await get(STORES.META, 'localDeviceId');
  if (pointer?.value) {
    const existing = await get(STORES.DEVICES, pointer.value);
    if (existing) return existing;
  }
  const device = stamp({
    id: uuid(),
    name: defaultDeviceName(),
    platform: platformSummary(),
    userId: null, ownerName: null,
    registeredAt: nowISO(), lastSeenAt: nowISO()
  });
  await put(STORES.DEVICES, device);
  await put(STORES.META, { id: 'localDeviceId', value: device.id });
  return device;
}
export async function listDevices() {
  const all = await getAll(STORES.DEVICES);
  return all.sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)));
}
export async function updateDevice(device) {
  return put(STORES.DEVICES, { ...device, lastSeenAt: nowISO() });
}

/** Called right after login: links the device to the signed-in person. */
export async function touchDevice(session) {
  const device = await getOrCreateLocalDevice();
  const updated = {
    ...device,
    userId: session.userId,
    ownerName: session.fullName,
    ownerRole: session.role,
    lastSeenAt: nowISO()
  };
  await put(STORES.DEVICES, updated);
  return updated;
}

/* ---------- Demo reset (Settings screen) ---------- */
export async function resetDemoData() {
  for (const name of Object.values(STORES)) {
    await clear(name);
  }
  await ensureSeed();
}
