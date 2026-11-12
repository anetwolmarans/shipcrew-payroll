/**
 * operations.service.js — The business rules for Phase 2 (Crew & Operations).
 *
 * PLAIN ENGLISH — this is the "referee" of the app. Screens ASK this service
 * to do things; the service CHECKS THE RULES first, saves the record locally
 * (IndexedDB — safe even offline), queues it for the cloud, and writes an
 * audit entry. The screens can never bypass these checks.
 *
 * THE RULES IT ENFORCES:
 *  - A crew member may only CLOCK IN against a trip that is Open or At Sea
 *    AND that they are actually assigned to. No exceptions.
 *  - One open clock event at a time: a second clock-in is blocked until the
 *    first one is clocked out. (Duplicate prevention.)
 *  - Clock-outs without a clock-in are blocked.
 *  - Clocking is done BY the crew member, about the crew member — never on
 *    behalf of someone else.
 *  - Trips move forward one status at a time: Planned → Open → At Sea →
 *    Returned → Under Review → Payroll Pending → Approved → Closed.
 *    Every change is recorded in the trip's statusHistory (who, when).
 *  - A trip with people still clocked in cannot be closed — they must clock
 *    out first, so no working hours are silently lost.
 *  - Assignments are HISTORY: adding one creates a record, ending one stamps
 *    its end time. Nothing is ever overwritten or deleted.
 *  - One ACTIVE assignment per crew member across live (non-closed) trips.
 *  - Banking details live in their own record/collection, visible only to
 *    the payroll and system administrators — never mixed into the crew list.
 */
import { get, getAll, put, del, STORES } from './idb.js';
import { nowISO, minutesToHHMM } from './time.js';
import { uuid } from './security.js';
import { CLOCKABLE_TRIP_STATUSES, tripStatus, TRIP_STATUSES } from '../config.js';
import { queueForSync } from './sync.service.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';
import { currentSession } from './auth.service.js';
import { emit } from './events.js';

/* =============================== helpers =============================== */

function sessionBrief() {
  const s = currentSession();
  return {
    userId: s?.userId || 'unknown',
    name: s?.fullName || 'Unknown user',
    role: s?.role || '-',
    deviceName: s?.deviceName || '-'
  };
}

function stamp(extra = {}) {
  const who = sessionBrief();
  return {
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    status: 'active',
    ...extra
  };
}

function touch(record, extra = {}) {
  const who = sessionBrief();
  return { ...record, ...extra, updatedAt: nowISO(), updatedBy: who.name };
}

/** Save locally + queue an idempotent upload + audit + broadcast. */
async function persist(storeName, record, collection, type, auditAction, auditDetails) {
  await put(storeName, record);
  queueForSync(record, collection, type)
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  if (auditAction) await logAction(auditAction, auditDetails);
  emit('data:changed', { store: storeName, id: record.id });
  return record;
}

/* ============================ crew register ============================ */

/** Validate a crew record before saving. Throws with a friendly message. */
function validateCrew(c) {
  if (!c.employeeId || !String(c.employeeId).trim()) throw new Error('Employee number is required (e.g. NAF-0042).');
  if (!c.fullName || !String(c.fullName).trim()) throw new Error('Full name is required.');
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new Error('The email address does not look valid.');
  return true;
}

export async function listCrew() {
  const all = await getAll(STORES.CREW);
  return all.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
}
export async function getCrew(id) { return get(STORES.CREW, id); }

export async function createCrew(fields) {
  const who = sessionBrief();
  const crew = stamp({
    id: String(fields.employeeId || '').trim().toUpperCase() || uuid(),
    ...fields,
    employeeId: String(fields.employeeId || '').trim().toUpperCase(),
    userId: fields.userId || null,
    employmentStatus: fields.employmentStatus || 'active'
  });
  validateCrew(crew);

  const all = await getAll(STORES.CREW);
  if (all.some(c => String(c.id).toLowerCase() === String(crew.id).toLowerCase())) {
    throw new Error(`Employee number "${crew.id}" is already used by another crew member.`);
  }
  if (crew.userId && all.some(c => c.userId === crew.userId)) {
    throw new Error('That login is already linked to another crew member.');
  }
  return persist(STORES.CREW, crew, 'crew', 'crew',
    AUDIT_ACTIONS.CREW_CREATED, `Crew member created: ${crew.fullName} (${crew.id}), position ${crew.position || '—'}.`);
}

export async function updateCrew(id, fields) {
  const existing = await getCrew(id);
  if (!existing) throw new Error('Crew member not found.');
  const next = touch(existing, fields);
  validateCrew(next);
  const all = await getAll(STORES.CREW);
  if (next.userId && all.some(c => c.userId === next.userId && c.id !== id)) {
    throw new Error('That login is already linked to another crew member.');
  }
  return persist(STORES.CREW, next, 'crew', 'crew',
    AUDIT_ACTIONS.CREW_UPDATED, `Crew record updated: ${next.fullName} (${next.id}).`);
}

export async function setCrewEmploymentStatus(id, employmentStatus) {
  const existing = await getCrew(id);
  if (!existing) throw new Error('Crew member not found.');
  const next = touch(existing, { employmentStatus });
  return persist(STORES.CREW, next, 'crew', 'crew',
    AUDIT_ACTIONS.CREW_STATUS_CHANGED,
    `${next.fullName} (${next.id}) employment status set to ${employmentStatus}.`);
}

/* ------------------------- banking (confidential) ---------------------- */

export async function getBanking(crewId) { return get(STORES.CREW_BANKING, crewId); }

export async function saveBanking(crewId, fields) {
  const crew = await getCrew(crewId);
  if (!crew) throw new Error('Crew member not found.');
  const existing = await getBanking(crewId) || {};
  const record = touch({ ...existing, id: crewId, crewId, employeeId: crew.id, ...fields });
  return persist(STORES.CREW_BANKING, record, 'crew_banking', 'crew_banking',
    AUDIT_ACTIONS.BANKING_SAVED,
    `Banking details saved for ${crew.fullName} (${crew.id}) — account stored in the restricted collection.`);
}

/* ============================ vessel register ========================== */

export async function listVessels() {
  const all = await getAll(STORES.VESSELS);
  return all.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
export async function getVessel(id) { return get(STORES.VESSELS, id); }

function validateVessel(v) {
  if (!v.name || !String(v.name).trim()) throw new Error('Vessel name is required.');
  if (!v.registrationNumber || !String(v.registrationNumber).trim()) throw new Error('Registration number is required (e.g. LWB-200-E).');
  return true;
}

export async function createVessel(fields) {
  const vessel = stamp({
    id: uuid(),
    status: 'active',
    type: 'Wet-fish trawler',
    homePort: 'Walvis Bay',
    ...fields
  });
  validateVessel(vessel);
  const all = await getAll(STORES.VESSELS);
  if (all.some(v => String(v.name).toLowerCase() === String(vessel.name).toLowerCase())) {
    throw new Error('A vessel with this name already exists.');
  }
  return persist(STORES.VESSELS, vessel, 'vessels', 'vessel',
    AUDIT_ACTIONS.VESSEL_CREATED, `Vessel created: ${vessel.name} (${vessel.registrationNumber}).`);
}

export async function updateVessel(id, fields) {
  const existing = await getVessel(id);
  if (!existing) throw new Error('Vessel not found.');
  const next = touch(existing, fields);
  validateVessel(next);
  return persist(STORES.VESSELS, next, 'vessels', 'vessel',
    AUDIT_ACTIONS.VESSEL_UPDATED, `Vessel updated: ${next.name} (${next.registrationNumber}).`);
}

/** Crew currently assigned to a vessel's live trips (or its primary list). */
export async function crewOnVessel(vesselId) {
  const [assignments, trips, crew] = await Promise.all([
    getAll(STORES.ASSIGNMENTS), getAll(STORES.TRIPS), getAll(STORES.CREW)
  ]);
  const liveTripIds = new Set(trips.filter(t => t.vesselId === vesselId && t.status !== 'closed').map(t => t.id));
  const names = new Map(crew.map(c => [c.id, c]));
  return assignments
    .filter(a => a.vesselId === vesselId && a.status === 'active' && liveTripIds.has(a.tripId))
    .map(a => ({ assignment: a, crew: names.get(a.crewId) || { id: a.crewId, fullName: a.crewName } }));
}

/** All trips of a vessel, newest first (the trip history). */
export async function tripHistoryForVessel(vesselId) {
  const trips = await getAll(STORES.TRIPS);
  return trips.filter(t => t.vesselId === vesselId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/* ============================= trip register =========================== */

export async function listTrips() {
  const trips = await getAll(STORES.TRIPS);
  const order = Object.fromEntries(TRIP_STATUSES.map((s, i) => [s.key, i]));
  return trips.sort((a, b) =>
    (order[a.status] ?? 99) - (order[b.status] ?? 99) ||
    String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function getTrip(id) { return get(STORES.TRIPS, id); }

/** TRP-YYYY-NNN, e.g. TRP-2026-014. Counters live in the meta store. */
export async function nextTripReference() {
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Windhoek', year: 'numeric' }).format(new Date()));
  const counter = (await get(STORES.META, 'tripCounter')) || { year: 0, n: 0 };
  if (counter.year !== year) { counter.year = year; counter.n = 0; }
  counter.n += 1;
  await put(STORES.META, { id: 'tripCounter', ...counter });
  return `TRP-${year}-${String(counter.n).padStart(3, '0')}`;
}

export async function createTrip({ vesselId, departurePort, returnPort, plannedDepartAt, plannedReturnAt, notes }) {
  const vessel = await getVessel(vesselId);
  if (!vessel) throw new Error('Choose a vessel for this trip.');
  if (plannedDepartAt && plannedReturnAt && plannedReturnAt < plannedDepartAt) {
    throw new Error('The planned return cannot be before the planned departure.');
  }
  const reference = await nextTripReference();
  const who = sessionBrief();
  const trip = stamp({
    id: uuid(),
    reference,
    vesselId,
    vesselName: vessel.name,
    status: 'planned',
    statusHistory: [{ status: 'planned', at: nowISO(), by: who.name, note: 'Trip created' }],
    departurePort: departurePort || vessel.homePort || 'Walvis Bay',
    returnPort: returnPort || departurePort || vessel.homePort || 'Walvis Bay',
    plannedDepartAt: plannedDepartAt || null,
    plannedReturnAt: plannedReturnAt || null,
    actualDepartAt: null, actualReturnAt: null,
    notes: notes || ''
  });
  return persist(STORES.TRIPS, trip, 'trips', 'trip',
    AUDIT_ACTIONS.TRIP_CREATED, `Trip ${reference} created for ${vessel.name} (Planned).`);
}

export async function updateTrip(id, fields) {
  const existing = await getTrip(id);
  if (!existing) throw new Error('Trip not found.');
  if (['closed', 'approved'].includes(existing.status) && (fields.plannedDepartAt || fields.plannedReturnAt || fields.departurePort || fields.returnPort)) {
    throw new Error(`Trip ${existing.reference} is ${tripStatus(existing.status).label.toLowerCase()} — its dates and ports can no longer change.`);
  }
  const next = touch(existing, fields);
  if (next.plannedDepartAt && next.plannedReturnAt && next.plannedReturnAt < next.plannedDepartAt) {
    throw new Error('The planned return cannot be before the planned departure.');
  }
  return persist(STORES.TRIPS, next, 'trips', 'trip',
    AUDIT_ACTIONS.TRIP_UPDATED, `Trip ${next.reference} details updated.`);
}

/**
 * Move a trip one step forward. Enforces:
 *  - only the defined next status (no skipping);
 *  - actualDepartAt / actualReturnAt are stamped automatically;
 *  - a trip cannot be CLOSED while anyone is still clocked in.
 */
export async function advanceTripStatus(tripId, note = '') {
  const trip = await getTrip(tripId);
  if (!trip) throw new Error('Trip not found.');
  const def = tripStatus(trip.status);
  if (!def.next) throw new Error(`Trip ${trip.reference} is already Closed.`);
  const who = sessionBrief();

  if (def.next === 'closed') {
    const open = await openClockEventsForTrip(tripId);
    if (open.length > 0) {
      const names = [...new Set(open.map(e => e.crewName))].join(', ');
      throw new Error(`Cannot close: ${open.length} crew member${open.length === 1 ? ' is' : 's are'} still clocked in (${names}). They must clock out first.`);
    }
    const unended = (await getAll(STORES.ASSIGNMENTS))
      .find(a => a.tripId === tripId && a.status === 'active');
    if (unended) {
      // Ending assignments is done by the manager on the Trips screen;
      // auto-end them here with a clear audit note so history stays correct.
      await endAssignment(unended.id, 'Trip closed — assignment ended automatically.');
    }
  }

  const now = nowISO();
  const extra = {};
  if (def.next === 'at_sea') extra.actualDepartAt = now;
  if (def.next === 'returned') extra.actualReturnAt = now;
  const next = touch(trip, {
    status: def.next,
    ...extra,
    statusHistory: [...(trip.statusHistory || []), { status: def.next, at: now, by: who.name, note: note || def.nextLabel || '' }]
  });
  return persist(STORES.TRIPS, next, 'trips', 'trip',
    AUDIT_ACTIONS.TRIP_STATUS_CHANGED,
    `Trip ${trip.reference} status: ${def.label} → ${tripStatus(def.next).label}${note ? ` (${note})` : ''}.`);
}

/** Delete is only allowed for a Planned trip with no assignments and no clockings. */
export async function deleteTripIfSafe(tripId) {
  const trip = await getTrip(tripId);
  if (!trip) throw new Error('Trip not found.');
  if (trip.status !== 'planned') {
    throw new Error('Only a Planned trip can be deleted. Move it through the statuses instead — history must be kept.');
  }
  const assignments = (await getAll(STORES.ASSIGNMENTS)).filter(a => a.tripId === tripId);
  if (assignments.length > 0) throw new Error('Remove the crew assignments first (Trips screen), then delete the trip.');
  const events = (await getAll(STORES.CLOCK_EVENTS)).filter(e => e.tripId === tripId);
  if (events.length > 0) throw new Error('This trip already has clock events and can never be deleted.');
  await del(STORES.TRIPS, tripId);
  await logAction(AUDIT_ACTIONS.TRIP_DELETED, `Planned trip ${trip.reference} (${trip.vesselName}) deleted before opening.`);
  emit('data:changed', { store: STORES.TRIPS, id: tripId });
}

/* ============================= assignments ============================= */

export async function listAssignments(filter = {}) {
  let all = await getAll(STORES.ASSIGNMENTS);
  if (filter.tripId) all = all.filter(a => a.tripId === filter.tripId);
  if (filter.crewId) all = all.filter(a => a.crewId === filter.crewId);
  if (filter.vesselId) all = all.filter(a => a.vesselId === filter.vesselId);
  return all.sort((a, b) => String(b.assignedAt).localeCompare(String(a.assignedAt)));
}

/** The crew member's current live assignment (trip Open or At Sea), if any. */
export async function activeAssignmentForCrew(crewId) {
  const [assignments, trips] = await Promise.all([getAll(STORES.ASSIGNMENTS), getAll(STORES.TRIPS)]);
  const tripById = new Map(trips.map(t => [t.id, t]));
  return assignments
    .filter(a => a.crewId === crewId && a.status === 'active')
    .map(a => ({ ...a, trip: tripById.get(a.tripId) }))
    .find(a => a.trip && CLOCKABLE_TRIP_STATUSES.includes(a.trip.status)) || null;
}

export async function addAssignment({ crewId, tripId, isPrimary = false }) {
  const who = sessionBrief();
  const crew = await getCrew(crewId);
  if (!crew) throw new Error('Crew member not found.');
  if (crew.employmentStatus !== 'active') throw new Error(`${crew.fullName} is not an active employee — assignment blocked.`);
  const trip = await getTrip(tripId);
  if (!trip) throw new Error('Trip not found.');
  if (['closed', 'approved'].includes(trip.status)) {
    throw new Error(`Trip ${trip.reference} is ${tripStatus(trip.status).label.toLowerCase()} — no new assignments.`);
  }

  const existing = await listAssignments({ tripId });
  if (existing.some(a => a.crewId === crewId && a.status === 'active')) {
    throw new Error(`${crew.fullName} is already assigned to trip ${trip.reference}.`);
  }
  // One live assignment per crew member across non-closed trips:
  const [allAssignments, allTrips] = await Promise.all([getAll(STORES.ASSIGNMENTS), getAll(STORES.TRIPS)]);
  const liveTripIds = new Set(allTrips.filter(t => !['closed', 'approved'].includes(t.status)).map(t => t.id));
  const clash = allAssignments.find(a => a.crewId === crewId && a.status === 'active' && liveTripIds.has(a.tripId));
  if (clash) {
    throw new Error(`${crew.fullName} is already assigned to trip ${clash.tripRef}. End that assignment first — one live trip per crew member keeps the clocking records honest.`);
  }

  const record = stamp({
    id: uuid(),
    crewId, crewName: crew.fullName, userId: crew.userId || null,
    tripId, tripRef: trip.reference,
    vesselId: trip.vesselId, vesselName: trip.vesselName,
    assignedAt: nowISO(), assignedBy: who.name,
    endedAt: null, endedBy: null, endReason: null,
    isPrimary: !!isPrimary,
    status: 'active'
  });
  return persist(STORES.ASSIGNMENTS, record, 'assignments', 'assignment',
    AUDIT_ACTIONS.ASSIGNMENT_ADDED,
    `${crew.fullName} (${crew.id}) assigned to trip ${trip.reference} on ${trip.vesselName}.`);
}

/** End an assignment (history preserved — the record is stamped, never deleted). */
export async function endAssignment(assignmentId, reason = '') {
  const existing = await get(STORES.ASSIGNMENTS, assignmentId);
  if (!existing) throw new Error('Assignment not found.');
  if (existing.status !== 'active') throw new Error('That assignment has already ended.');
  const who = sessionBrief();
  const next = touch(existing, {
    status: 'ended',
    endedAt: nowISO(), endedBy: who.name, endReason: reason || 'Removed by ' + who.name
  });
  return persist(STORES.ASSIGNMENTS, next, 'assignments', 'assignment',
    AUDIT_ACTIONS.ASSIGNMENT_ENDED,
    `${existing.crewName} removed from trip ${existing.tripRef} (${existing.vesselName}).`);
}

/* ============================== clocking =============================== */

/** All open (still clocked-in) events for a trip. */
export async function openClockEventsForTrip(tripId) {
  return (await getAll(STORES.CLOCK_EVENTS))
    .filter(e => e.tripId === tripId && e.status === 'open');
}

/** The signed-in crew member's own open clock event, if any. */
export async function myOpenClockEvent(userId) {
  return (await getAll(STORES.CLOCK_EVENTS))
    .find(e => e.userId === userId && e.status === 'open') || null;
}

export async function myClockEvents(userId, limit = 10) {
  return (await getAll(STORES.CLOCK_EVENTS))
    .filter(e => e.userId === userId)
    .sort((a, b) => String(b.clockInAt).localeCompare(String(a.clockInAt)))
    .slice(0, limit);
}

/** Minutes an event spans (null while still open). */
export function eventDurationMinutes(event) {
  if (!event?.clockInAt || !event?.clockOutAt) return null;
  return Math.max(0, Math.round((new Date(event.clockOutAt) - new Date(event.clockInAt)) / 60000));
}

/**
 * CLOCK IN — the crew member clocks themselves in.
 * Validation chain (each failure is friendly, specific and audited):
 *   1. you have an active crew record;
 *   2. you are assigned to a trip that is Open or At Sea;
 *   3. you are not already clocked in.
 */
export async function clockIn() {
  const who = sessionBrief();
  const crew = (await getAll(STORES.CREW)).find(c => c.userId === who.userId);
  if (!crew) throw new Error('No crew profile is linked to your login yet. Ask your administrator to link it (Crew register → link login).');
  if (crew.employmentStatus !== 'active') {
    await logAction(AUDIT_ACTIONS.CLOCK_IN_BLOCKED, `${who.name} tried to clock in — employment status is "${crew.employmentStatus}".`);
    throw new Error('Your employment status is not "active", so clocking is blocked. Contact your manager.');
  }

  const assignment = await activeAssignmentForCrew(crew.id);
  if (!assignment) {
    await logAction(AUDIT_ACTIONS.CLOCK_IN_BLOCKED, `${who.name} tried to clock in — not assigned to an Open or At-Sea trip.`);
    throw new Error('You are not assigned to a trip that is open for clocking (Open or At Sea). Ask your manager to assign you.');
  }

  const existing = await myOpenClockEvent(who.userId);
  if (existing) {
    await logAction(AUDIT_ACTIONS.CLOCK_IN_BLOCKED,
      `${who.name} tried to clock in while already clocked in since ${existing.clockInAt} (trip ${existing.tripRef}).`);
    throw new Error(`You are already clocked in on trip ${existing.tripRef}. Clock out first, then clock in again.`);
  }

  const trip = assignment.trip;
  const device = await get(STORES.DEVICES, (await get(STORES.META, 'localDeviceId'))?.value);
  const event = stamp({
    id: uuid(),
    userId: who.userId, employeeId: crew.id, crewName: crew.fullName,
    tripId: trip.id, tripRef: trip.reference,
    vesselId: trip.vesselId, vesselName: trip.vesselName,
    clockInAt: nowISO(), clockOutAt: null, durationMinutes: null,
    status: 'open',
    deviceId: device?.id || null, deviceName: device?.name || who.deviceName,
    syncStatus: 'saved locally'
  });
  const saved = await persist(STORES.CLOCK_EVENTS, event, 'clock_events', 'clock_event',
    AUDIT_ACTIONS.CLOCK_IN,
    `${crew.fullName} clocked IN — trip ${trip.reference} (${trip.vesselName}), Namibian local time ${localTime(event.clockInAt)}.`);
  return saved;
}

/**
 * CLOCK OUT — closes the crew member's own open event.
 * Allowed even if the trip status changed in the meantime (the crew member
 * must always be able to end their shift); the event keeps the trip it
 * started on. The same event id is re-queued, so the cloud always ends up
 * with the complete final record (idempotent, no duplicates).
 */
export async function clockOut() {
  const who = sessionBrief();
  const event = await myOpenClockEvent(who.userId);
  if (!event) {
    await logAction(AUDIT_ACTIONS.CLOCK_OUT_BLOCKED, `${who.name} tried to clock out without an open clock-in.`);
    throw new Error('No open clock-in found. You must clock in before you can clock out.');
  }
  const durationMinutes = eventDurationMinutes({ ...event, clockOutAt: nowISO() });
  const next = touch(event, {
    clockOutAt: nowISO(),
    durationMinutes,
    status: 'closed',
    clockOutDeviceName: who.deviceName
  });
  next.syncStatus = 'saved locally';
  const saved = await persist(STORES.CLOCK_EVENTS, next, 'clock_events', 'clock_event',
    AUDIT_ACTIONS.CLOCK_OUT,
    `${event.crewName} clocked OUT — trip ${event.tripRef}, duration ${minutesToHHMM(durationMinutes)}.`);
  return saved;
}

/** Crew member's total worked minutes for a Namibian local date (YYYY-MM-DD). */
export async function minutesWorkedOn(userId, dateKey) {
  const events = (await getAll(STORES.CLOCK_EVENTS)).filter(e => e.userId === userId);
  let mins = 0;
  for (const e of events) {
    if (localDateKeyOf(e.clockInAt) !== dateKey) continue;
    mins += e.status === 'closed'
      ? (e.durationMinutes ?? eventDurationMinutes(e))
      : Math.max(0, Math.round((Date.now() - new Date(e.clockInAt)) / 60000)); // running clock-in
  }
  return mins;
}

/* Local-date helper kept local to avoid a circular import. */
function localDateKeyOf(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(iso));
  const g = (t) => parts.find(p => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function localTime(iso) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Windhoek', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
