/**
 * queries.service.js — Payslip queries (questions & disputes), v2.4.0.
 *
 * PLAIN ENGLISH: a crew member who thinks their payslip is wrong can raise
 * a query ("my overtime looks short") from their phone. The payroll team
 * answers it from the Payslip Queries screen. Every query is:
 *
 *   - linked to ONE payslip (never a vague complaint — the payslip is
 *     attached automatically),
 *   - saved on the device first (offline-first, like everything else),
 *   - synced both ways: the query reaches the admin's device, the answer
 *     reaches the crew member's phone,
 *   - audited on both ends,
 *   - IMMUTABLE once answered (an answer is a commitment; a follow-up is a
 *     new query) and never deleted — queries are history, like payslips.
 *
 * States:  open  →  answered        (crew sees the answer on their phone)
 *          open  →  closed          (admin closes without an answer, e.g. a
 *                                     duplicate; a reason is required)
 *
 * A payslip can have at most ONE open query at a time — raise, wait for the
 * answer, then raise a follow-up if needed. This keeps the admin's queue
 * clean and forces one topic per thread.
 */

import { getAll, get, put, STORES } from './idb.js';
import { queueForSync } from './sync.service.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';
import { currentSession } from './auth.service.js';
import { nowISO } from './time.js';
import { uuid } from './security.js';
import { SYNC_STATUS } from '../config.js';

/* ---------------- crew side ---------------- */

/**
 * Raise a query about a payslip. Called from the crew home screen with the
 * payslip already known. `message` must be 3+ characters (a real question).
 * The payslip's key figures are snapshotted onto the query so the admin
 * sees the numbers without looking the payslip up.
 */
export async function raisePayslipQuery(payslip, message, category = 'question') {
  const who = currentSession();
  if (!payslip?.id) throw new Error('Payslip not found.');
  const text = String(message || '').trim();
  if (text.length < 3) throw new Error('Write your question (at least 3 characters).');
  if (!['question', 'dispute', 'missing_pay'].includes(category)) category = 'question';

  // One open query per payslip.
  const open = (await getAll(STORES.PAYSLIP_QUERIES))
    .find(q => q.payslipId === payslip.id && q.status === 'open');
  if (open) throw new Error('This payslip already has an open query. Please wait for the answer first.');

  const record = {
    id: uuid(),
    payslipId: payslip.id,
    crewId: payslip.crewId,
    crewName: payslip.crewName,
    userId: payslip.userId || who?.userId || null,
    tripRef: payslip.tripRef || '',
    periodLabel: payslip.periodLabel || '',
    // Snapshot of the figures being questioned (the payslip never changes,
    // so these always match it — they are copied for convenience).
    grossCents: payslip.grossCents,
    deductionCents: payslip.deductionCents,
    netCents: payslip.netCents,
    category,                    // question | dispute | missing_pay
    message: text,
    status: 'open',              // open | answered | closed
    response: null,
    respondedBy: null, respondedAt: null,
    closedReason: null,
    createdAt: nowISO(), createdBy: who?.fullName || 'Crew member',
    updatedAt: nowISO(), updatedBy: who?.fullName || 'Crew member',
    syncStatus: SYNC_STATUS.LOCAL
  };
  await put(STORES.PAYSLIP_QUERIES, record);
  queueForSync(record, 'payslip_queries', 'payslip_query')
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  await logAction(AUDIT_ACTIONS.PAYSLIP_QUERY_RAISED,
    `Query on payslip ${payslip.tripRef} of ${payslip.crewName} (${category}): ${text}`);
  return record;
}

/** All queries of the signed-in crew member (newest first). */
export async function myPayslipQueries(userId) {
  const rows = await getAll(STORES.PAYSLIP_QUERIES);
  return rows
    .filter(q => q.userId === userId || q.createdBy === (currentSession()?.fullName))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** All queries (admin view). `status` filter optional. */
export async function listPayslipQueries(status = null) {
  const rows = await getAll(STORES.PAYSLIP_QUERIES);
  return rows
    .filter(q => !status || q.status === status)
    .sort((a, b) => {
      // Open queries first, then by newest.
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (b.status === 'open' && a.status !== 'open') return 1;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

/** Count of open queries — for the admin nav badge. */
export async function openQueryCount() {
  const rows = await getAll(STORES.PAYSLIP_QUERIES);
  return rows.filter(q => q.status === 'open').length;
}

/* ---------------- admin side ---------------- */

/**
 * Answer a query. The response is shown verbatim on the crew member's
 * phone. An answered query is immutable; follow-ups are new queries.
 */
export async function respondToQuery(queryId, response) {
  const q = await get(STORES.PAYSLIP_QUERIES, queryId);
  if (!q) throw new Error('Query not found.');
  if (q.status !== 'open') throw new Error('This query is already answered or closed.');
  const text = String(response || '').trim();
  if (text.length < 3) throw new Error('Write an answer (at least 3 characters).');
  const who = currentSession();

  q.response = text;
  q.respondedBy = who?.fullName || 'Payroll';
  q.respondedAt = nowISO();
  q.status = 'answered';
  q.updatedAt = nowISO(); q.updatedBy = q.respondedBy;
  q.syncStatus = SYNC_STATUS.LOCAL;
  await put(STORES.PAYSLIP_QUERIES, q);
  queueForSync(q, 'payslip_queries', 'payslip_query')
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  await logAction(AUDIT_ACTIONS.PAYSLIP_QUERY_ANSWERED,
    `Answer to ${q.crewName} on payslip ${q.tripRef}: ${text}`);
  return q;
}

/** Close a query without an answer (duplicate / resolved in person). */
export async function closeQuery(queryId, reason) {
  const q = await get(STORES.PAYSLIP_QUERIES, queryId);
  if (!q) throw new Error('Query not found.');
  if (q.status !== 'open') throw new Error('This query is already answered or closed.');
  const text = String(reason || '').trim();
  if (text.length < 3) throw new Error('A reason is required to close a query.');
  const who = currentSession();

  q.closedReason = text;
  q.status = 'closed';
  q.updatedAt = nowISO(); q.updatedBy = who?.fullName || 'Payroll';
  q.syncStatus = SYNC_STATUS.LOCAL;
  await put(STORES.PAYSLIP_QUERIES, q);
  queueForSync(q, 'payslip_queries', 'payslip_query')
    .catch(err => console.warn('Sync queue error:', err?.message || err));
  await logAction(AUDIT_ACTIONS.PAYSLIP_QUERY_CLOSED,
    `Query on payslip ${q.tripRef} of ${q.crewName} closed: ${text}`);
  return q;
}

/**
 * Adopt a record pulled from the server (download sync) — newer wins, same
 * duplicate-proof merge as every other collection.
 */
export async function adoptPulledQuery(remote) {
  const local = await get(STORES.PAYSLIP_QUERIES, remote.id);
  // Never adopt an OLDER copy over a newer local one (e.g. a response just
  // written on this device that has not uploaded yet).
  if (local && String(local.updatedAt || '') >= String(remote.updatedAt || '')) return false;
  await put(STORES.PAYSLIP_QUERIES, { ...remote, syncStatus: SYNC_STATUS.SYNCED });
  return true;
}

export const QUERY_CATEGORIES = [
  { key: 'question', label: 'Question', hint: 'Something you want explained' },
  { key: 'dispute', label: 'Dispute', hint: 'You believe a figure is wrong' },
  { key: 'missing_pay', label: 'Missing pay', hint: 'Hours or commission you cannot see' }
];
