/**
 * catch.service.js — The catch register and quota-commission allocations
 * (Phase 4: Working Hours & Catch).
 *
 * PLAIN ENGLISH:
 *  - The CATCH REGISTER records what the vessel landed per trip: species,
 *    category (whole round, gutted…), weight, where and when, plus the
 *    paperwork that follows catch in Namibia (landing/monitoring refs).
 *    Records are created by the vessel manager and are immutable history:
 *    corrections happen as visible amendments, never silent edits.
 *  - QUOTA ALLOCATIONS split a catch (or its value) among the crew per
 *    contract, using ONE OF SIX methods (project brief, chapter 10):
 *      1. equal_split   — everyone gets an equal share
 *      2. percentage    — fixed percentages per crew member (must total 100%)
 *      3. fixed_weight  — a fixed tonnage/amount per role
 *      4. rank_based    — points per rank, share = points ÷ total
 *      5. contractual   — a written contractual formula, recorded as a note
 *      6. custom        — manual amounts per crew member, with a reason
 *    Different crew members may sit under different arrangements; the
 *    allocation keeps a full breakdown and is never silently rewritten.
 *  - NOTHING HERE PRICES THE CATCH. Money is a Phase 5 matter (contracts,
 *    commissions, payroll). Phase 4 records the tonnes and the shares.
 */
import { get, getAll, put, STORES } from './idb.js';
import { nowISO } from './time.js';
import { uuid } from './security.js';
import { QUOTA_METHODS, SYNC_STATUS } from '../config.js';
import { queueForSync } from './sync.service.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';
import { currentSession } from './auth.service.js';
import { emit } from './events.js';

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
    role: s?.role || '-'
  };
}

function touch(record, extra = {}) {
  const who = sessionBrief();
  return { ...record, ...extra, updatedAt: nowISO(), updatedBy: who.name };
}

/* ============================ catch register ============================ */

export async function listCatchRecords(filter = {}) {
  let all = await getAll(STORES.CATCH_RECORDS);
  if (filter.tripId) all = all.filter(c => c.tripId === filter.tripId);
  if (filter.vesselId) all = all.filter(c => c.vesselId === filter.vesselId);
  if (filter.species) all = all.filter(c => c.species === filter.species);
  return all.sort((a, b) => String(b.landedAt || b.createdAt).localeCompare(String(a.landedAt || a.createdAt)));
}

export async function getCatchRecord(id) { return get(STORES.CATCH_RECORDS, id); }

export async function listCatchForTrip(tripId) {
  return (await getAll(STORES.CATCH_RECORDS))
    .filter(c => c.tripId === tripId)
    .sort((a, b) => String(a.landedAt).localeCompare(String(b.landedAt)));
}

/** Total tonnage per trip (sum of retained catch, kg → t). */
export async function tripCatchTotals(tripId) {
  const records = await listCatchForTrip(tripId);
  const totalKg = records.reduce((s, c) => s + (Number(c.weightKg) || 0), 0);
  const bySpecies = new Map();
  for (const c of records) {
    const cur = bySpecies.get(c.species) || { species: c.species, weightKg: 0, records: 0 };
    cur.weightKg += Number(c.weightKg) || 0;
    cur.records += 1;
    bySpecies.set(c.species, cur);
  }
  return {
    records: records.length,
    totalKg,
    totalTonnes: totalKg / 1000,
    bySpecies: [...bySpecies.values()].sort((a, b) => b.weightKg - a.weightKg)
  };
}

export async function createCatchRecord(fields) {
  const who = sessionBrief();
  if (!fields.tripId) throw new Error('Choose the trip this catch belongs to.');
  if (!fields.species || !String(fields.species).trim()) throw new Error('Species is required.');
  const kg = Number(fields.weightKg);
  if (!Number.isFinite(kg) || kg <= 0) throw new Error('Weight must be a positive number in kilograms.');

  const record = {
    id: uuid(),
    tripId: fields.tripId,
    species: String(fields.species).trim(),
    category: fields.category || 'Whole round',
    weightKg: kg,
    landingSite: fields.landingSite || 'Walvis Bay',
    landedAt: fields.landedAt || nowISO(),
    // Namibian catch documentation (recorded, not generated, by the app):
    landingNoteRef: fields.landingNoteRef || '',
    monitoringRef: fields.monitoringRef || '',
    notes: fields.notes || '',
    amendments: [],
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  const trip = await get(STORES.TRIPS, fields.tripId);
  if (trip) { record.tripRef = trip.reference; record.vesselId = trip.vesselId; record.vesselName = trip.vesselName; }

  await persist(STORES.CATCH_RECORDS, record, 'catch_records', 'catch_record',
    AUDIT_ACTIONS.CATCH_RECORDED,
    `Catch recorded for trip ${record.tripRef || record.tripId}: ${record.species}, ${kg.toLocaleString('en')} kg (${record.category}) at ${record.landingSite}.`);
  return record;
}

/**
 * AMEND a catch record (visible amendment, never a silent edit).
 * The original value stays in the amendments list.
 */
export async function amendCatchRecord(id, { weightKg, notes, reason }) {
  if (!reason || !String(reason).trim()) throw new Error('A reason is required for every catch amendment.');
  const existing = await getCatchRecord(id);
  if (!existing) throw new Error('Catch record not found.');
  const who = sessionBrief();
  const entry = {
    id: uuid(), at: nowISO(), by: who.name,
    reason: String(reason).trim(),
    changes: {
      weightKg: (weightKg !== undefined && Number(weightKg) !== existing.weightKg)
        ? { from: existing.weightKg, to: Number(weightKg) } : null
    }
  };
  const next = touch(existing, {
    weightKg: weightKg !== undefined ? Number(weightKg) : existing.weightKg,
    notes: notes !== undefined ? notes : existing.notes,
    amendments: [...(existing.amendments || []), entry],
    syncStatus: SYNC_STATUS.LOCAL
  });
  await persist(STORES.CATCH_RECORDS, next, 'catch_records', 'catch_record',
    AUDIT_ACTIONS.CATCH_AMENDED,
    `Catch record (${existing.species}, trip ${existing.tripRef}) amended: ${entry.changes.weightKg ? `${entry.changes.weightKg.from.toLocaleString('en')} kg → ${entry.changes.weightKg.to.toLocaleString('en')} kg. ` : ''}Reason: ${entry.reason}`);
  return next;
}

/* ========================= quota allocations ========================= */

export function quotaMethod(key) {
  return QUOTA_METHODS.find(m => m.key === key) || QUOTA_METHODS[0];
}

export async function listQuotaAllocations(filter = {}) {
  let all = await getAll(STORES.QUOTA_ALLOCATIONS);
  if (filter.tripId) all = all.filter(q => q.tripId === filter.tripId);
  return all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getQuotaAllocation(id) { return get(STORES.QUOTA_ALLOCATIONS, id); }

/**
 * Compute the crew shares for one allocation request — pure function, no
 * saving. Returns { lines, warnings } where each line is
 * { crewId, crewName, position, share, shareKg, note }.
 * methodInput carries the method-specific numbers (see each branch).
 */
export function computeQuotaShares({ method, crew, totalKg, methodInput }) {
  const lines = [];
  const warnings = [];
  const members = crew.filter(c => c && c.crewId);
  if (!members.length) return { lines: [], warnings: ['No crew members selected.'] };

  switch (method) {
    case 'equal_split': {
      const share = 100 / members.length;
      for (const m of members) lines.push({
        crewId: m.crewId, crewName: m.crewName, position: m.position || '',
        share: share, shareKg: (totalKg * share) / 100,
        note: `Equal share: 1 of ${members.length}`
      });
      break;
    }
    case 'percentage': {
      const pct = methodInput?.percentages || {};
      const sum = members.reduce((s, m) => s + (Number(pct[m.crewId]) || 0), 0);
      if (Math.abs(sum - 100) > 0.01) warnings.push(`Percentages total ${sum.toFixed(2)}% — they should total 100%.`);
      for (const m of members) {
        const p = Number(pct[m.crewId]) || 0;
        lines.push({
          crewId: m.crewId, crewName: m.crewName, position: m.position || '',
          share: p, shareKg: (totalKg * p) / 100,
          note: `${p}% per contract`
        });
      }
      break;
    }
    case 'fixed_weight': {
      const fixed = methodInput?.fixedWeights || {};
      for (const m of members) {
        const t = Number(fixed[m.crewId]) || 0;
        lines.push({
          crewId: m.crewId, crewName: m.crewName, position: m.position || '',
          share: null, shareKg: t,
          note: `Fixed ${t.toLocaleString('en')} kg for ${m.position || 'this role'}`
        });
      }
      const allocated = lines.reduce((s, l) => s + l.shareKg, 0);
      if (allocated > totalKg) warnings.push(`Fixed weights total ${(allocated / 1000).toFixed(3)} t, more than the trip catch (${(totalKg / 1000).toFixed(3)} t).`);
      break;
    }
    case 'rank_based': {
      const points = methodInput?.rankPoints || {};
      const total = members.reduce((s, m) => s + (Number(points[m.crewId]) || 0), 0);
      if (total <= 0) warnings.push('Every selected crew member needs at least one rank point.');
      for (const m of members) {
        const p = Number(points[m.crewId]) || 0;
        const share = total > 0 ? (p / total) * 100 : 0;
        lines.push({
          crewId: m.crewId, crewName: m.crewName, position: m.position || '',
          share, shareKg: (totalKg * share) / 100,
          note: `${p} point${p === 1 ? '' : 's'} (${m.position || 'role'})`
        });
      }
      break;
    }
    case 'contractual': {
      for (const m of members) lines.push({
        crewId: m.crewId, crewName: m.crewName, position: m.position || '',
        share: null, shareKg: null,
        note: 'Per written contract — settled in payroll (Phase 5)'
      });
      if (!methodInput?.contractNote) warnings.push('Record the contractual formula in the notes (e.g. "30% of net proceeds after costs, split per clause 4.2").');
      break;
    }
    case 'custom': {
      const amounts = methodInput?.customAmounts || {};
      for (const m of members) {
        const a = Number(amounts[m.crewId]) || 0;
        lines.push({
          crewId: m.crewId, crewName: m.crewName, position: m.position || '',
          share: null, shareKg: a,
          note: a > 0 ? 'Custom amount' : '—'
        });
      }
      if (!methodInput?.customReason) warnings.push('A reason is required for custom allocations.');
      break;
    }
    default:
      warnings.push(`Unknown method "${method}".`);
  }
  return { lines, warnings };
}

/**
 * Save a quota allocation for a trip. One allocation per trip per method;
 * re-running the same method REPLACES the previous allocation's "active"
 * flag but the old one is kept in history (status: 'superseded').
 */
export async function saveQuotaAllocation({ tripId, method, methodInput, crew, reason }) {
  if (!tripId) throw new Error('Choose the trip.');
  const def = quotaMethod(method);
  const trip = await get(STORES.TRIPS, tripId);
  if (!trip) throw new Error('Trip not found.');
  if (method === 'custom' && !(reason || '').trim()) throw new Error('A reason is required for custom allocations.');

  const totals = await tripCatchTotals(tripId);
  if (['equal_split', 'percentage', 'rank_based'].includes(method) && totals.totalKg <= 0) {
    throw new Error('This trip has no catch recorded yet — record the catch first (or use fixed/contract/custom shares).');
  }

  const { lines, warnings } = computeQuotaShares({ method, crew, totalKg: totals.totalKg, methodInput });
  if (warnings.length && (method === 'percentage' || method === 'rank_based')) {
    const bad = warnings.find(w => /total|point/i.test(w));
    if (bad && method === 'rank_based' && warnings.length === 1 && !/at least one/.test(bad)) throw new Error(bad);
    if (method === 'percentage' && warnings.length) throw new Error(warnings[0]);
  }

  // Supersede previous active allocations of the same method for this trip.
  const previous = (await getAll(STORES.QUOTA_ALLOCATIONS))
    .filter(q => q.tripId === tripId && q.method === method && q.status === 'active');
  for (const p of previous) {
    await persist(STORES.QUOTA_ALLOCATIONS, touch(p, { status: 'superseded', syncStatus: SYNC_STATUS.LOCAL }),
      'quota_allocations', 'quota_allocation', null, null);
  }

  const who = sessionBrief();
  const record = {
    id: uuid(),
    tripId, tripRef: trip.reference, vesselId: trip.vesselId, vesselName: trip.vesselName,
    method, methodLabel: def.label,
    methodInput: methodInput || {},
    lines,
    totalCatchKg: totals.totalKg,
    reason: reason || '',
    status: 'active',
    createdAt: nowISO(), createdBy: who.name,
    updatedAt: nowISO(), updatedBy: who.name,
    syncStatus: SYNC_STATUS.LOCAL
  };
  await persist(STORES.QUOTA_ALLOCATIONS, record, 'quota_allocations', 'quota_allocation',
    AUDIT_ACTIONS.QUOTA_ALLOCATED,
    `Quota allocation saved for trip ${trip.reference} (${def.label}, ${lines.length} crew member${lines.length === 1 ? '' : 's'}${previous.length ? `, superseded ${previous.length} earlier allocation${previous.length === 1 ? '' : 's'}` : ''}).`);
  return { record, warnings };
}

/** The crew who worked a trip (from its assignments, history included). */
export async function crewForTrip(tripId) {
  const assignments = (await getAll(STORES.ASSIGNMENTS)).filter(a => a.tripId === tripId);
  const crew = await getAll(STORES.CREW);
  const byId = new Map(crew.map(c => [c.id, c]));
  return assignments.map(a => ({
    crewId: a.crewId,
    crewName: a.crewName,
    position: byId.get(a.crewId)?.position || '',
    assignmentStatus: a.status
  }));
}
