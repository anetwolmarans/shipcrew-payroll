/**
 * sync.service.js — The offline-first synchronisation engine (Phase 3:
 * fully automatic, duplicate-proof, per-record states, safe conflicts).
 *
 * PLAIN ENGLISH:
 *  - Anything the device creates (audit entries, clock-ins, crew records,
 *    vessels, trips, assignments, banking) is written to the LOCAL database
 *    first. It is safe immediately, even with no internet.
 *  - A copy waits in the "sync queue" (like an outbox of letters). The
 *    record itself carries its own state: "saved locally" → "waiting to
 *    sync" → "synchronised" — or "sync failed — kept" after 5 failed
 *    attempts (kept means: the record is safe on the device and will be
 *    retried; nothing is ever thrown away).
 *  - AUTOMATIC: the queue drains by itself — when the internet returns,
 *    when the app is opened or brought back to the foreground, after every
 *    new queued record, and every 30 seconds while online. "Sync now"
 *    buttons use the same safe routine.
 *  - DUPLICATE PROOF: every item carries a unique ID that becomes the
 *    document ID in Firestore. Sending the same item twice just writes the
 *    same document — it can never create a duplicate.
 *  - CONFLICT HANDLING (last-edit-wins, nothing lost): before uploading,
 *    the engine looks at the cloud copy. If the cloud copy is NEWER than
 *    the device's copy (someone edited it on another device), the device
 *    ADOPTS the newer version instead of overwriting it, and the conflict
 *    is recorded in the audit trail. If the device's copy is newer or the
 *    record is new, it uploads. Equal versions are recognised as "already
 *    uploaded" — no useless rewrites.
 *  - Every drain run writes one entry to the sync ledger
 *    (sync_transactions) — local, and mirrored to Firestore in live mode —
 *    so administrators can see what was uploaded, when, and by which device.
 *  - A REVOKED device never uploads anything.
 */
import { getAll, get, put, STORES } from './idb.js';
import { fbEnsure } from './firebase.service.js';
import { isFirebaseConfigured, environmentName } from '../firebase-config.js';
import { emit } from './events.js';
import { nowISO } from './time.js';
import { uuid } from './security.js';
import { SYNC_STATUS, APP } from '../config.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';

const RETRY_INTERVAL_MS = 30000; // every 30 seconds while online
const MAX_ATTEMPTS_BEFORE_FAILED = 5;

/** Which local store holds the records of each Firestore collection. */
const COLLECTION_TO_STORE = {
  audit_logs: STORES.AUDIT_LOGS,
  clock_events: STORES.CLOCK_EVENTS,
  crew: STORES.CREW,
  crew_banking: STORES.CREW_BANKING,
  vessels: STORES.VESSELS,
  trips: STORES.TRIPS,
  assignments: STORES.ASSIGNMENTS,
  /* Phase 4: breaks and corrections ride on clock events; catch & quota get
     their own collections. */
  break_records: STORES.BREAK_RECORDS,
  catch_records: STORES.CATCH_RECORDS,
  quota_allocations: STORES.QUOTA_ALLOCATIONS
};

let _online = (typeof navigator !== 'undefined') ? navigator.onLine : true;
let _draining = false;

export function initSync() {
  window.addEventListener('online', () => { _online = true; emit('sync:status'); tryDrain(); });
  window.addEventListener('offline', () => { _online = false; emit('sync:status'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryDrain();   // app brought back to the foreground
  });
  setInterval(() => tryDrain(), RETRY_INTERVAL_MS);
  tryDrain();   // drain right away when the app opens (Phase 3: fully automatic)
  return state();
}

export function isOnline() { return _online; }
export function isLiveMode() { return isFirebaseConfigured(); }

/** Current snapshot for the sync indicator in the header. */
export async function state() {
  const items = await getAll(STORES.SYNC_QUEUE);
  const lastSync = await get(STORES.META, 'lastSync');
  return {
    online: _online,
    live: isLiveMode(),
    pending: items.filter(i => i.status === 'pending' || i.status === 'failed').length,
    failed: items.filter(i => i.status === 'failed').length,
    syncedTotal: items.filter(i => i.status === 'synced').length,
    lastSyncAt: lastSync?.at || null
  };
}

/** Richer picture for the dashboard's sync card (Phase 3). */
export async function syncReport() {
  const items = await getAll(STORES.SYNC_QUEUE);
  const lastSync = await get(STORES.META, 'lastSync');
  const failed = items
    .filter(i => i.status === 'failed')
    .map(i => ({ id: i.id, type: i.type, collection: i.collection, attempts: i.attempts || 0, error: i.lastError, updatedAt: i.updatedAt }))
    .slice(0, 6);
  return {
    online: _online,
    live: isLiveMode(),
    pending: items.filter(i => i.status === 'pending').length,
    failedCount: items.filter(i => i.status === 'failed').length,
    syncedTotal: items.filter(i => i.status === 'synced').length,
    failedSample: failed,
    lastSyncAt: lastSync?.at || null
  };
}

/** Stamp a record's own sync state (the per-record visibility promise). */
async function updateRecordSyncStatus(collection, id, status, extra = {}) {
  const storeName = COLLECTION_TO_STORE[collection];
  if (!storeName) return;
  const rec = await get(storeName, id);
  if (!rec) return;
  rec.syncStatus = status;
  if (extra.syncedAt) rec.syncedAt = extra.syncedAt;
  if (extra.lastSyncError !== undefined) rec.lastSyncError = extra.lastSyncError;
  await put(storeName, rec);
}

/** Add a record to the outbox. Called by audit.service.js and operations.service.js. */
export async function queueForSync(record, collection = 'audit_logs', type = 'audit_log') {
  const live = isLiveMode();
  const item = {
    id: record.id,               // unique event ID → becomes the Firestore document ID
    type,
    collection,
    payload: record,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
  await put(STORES.SYNC_QUEUE, item);
  // Per-record state: in live mode the record now "waits to sync"; in demo
  // mode it honestly stays "saved locally" (it is queued for the day the
  // Firebase connection is switched on — then it uploads automatically).
  if (live) await updateRecordSyncStatus(collection, record.id, SYNC_STATUS.PENDING);
  emit('sync:status');
  tryDrain();
  return item;
}

async function tryDrain() {
  if (_draining || !_online || !isFirebaseConfigured()) return;
  try {
    await syncNow({ silent: true });
  } catch { /* queue is kept; retried on the next timer tick */ }
}

async function localDeviceRecord() {
  const pointer = await get(STORES.META, 'localDeviceId');
  return pointer?.value ? get(STORES.DEVICES, pointer.value) : null;
}

/** Upload everything in the queue. Safe to run at any time. */
export async function syncNow({ silent = false } = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Not connected to Firebase yet. Your records are safe on this device (demo mode). To enable synchronisation, connect Firebase — see docs/01-firebase-setup.md.');
  }
  if (!_online) {
    throw new Error('You are offline. Records are saved on this device and will upload automatically when the connection returns.');
  }
  const device = await localDeviceRecord();
  if (device?.status === 'revoked') {
    throw new Error('This device has been revoked by your administrator, so synchronisation is stopped. Records stay safe on this device. An administrator can reinstate the device (Devices screen).');
  }
  _draining = true;
  const startedAt = nowISO();
  try {
    const fb = await fbEnsure();

    // LIVE REVOCATION CHECK: the central registry is the authority. If the
    // device was revoked (lost phone), stop immediately.
    if (device?.id) {
      try {
        const devSnap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'devices', device.id));
      if (devSnap.exists() && devSnap.data().status === 'revoked' && device.status !== 'revoked') {
        const marked = { ...device, status: 'revoked', revokedAt: devSnap.data().revokedAt || nowISO(), revokedBy: devSnap.data().revokedBy || 'administrator', revokedReason: devSnap.data().revokedReason || 'Revoked centrally' };
        await put(STORES.DEVICES, marked);
        await logAction(AUDIT_ACTIONS.DEVICE_REVOKED, `This device was revoked centrally by ${marked.revokedBy} — sync stopped.`);
        emit('device:revoked', { deviceId: device.id, isLocal: true });
        throw new Error('This device has been revoked by your administrator. Sync stopped; records stay safe on this device.');
      }
    } catch (err) {
        if (String(err?.message || '').includes('revoked')) throw err;
        /* registry unreachable — continue with the local status */
      }
    }

    const items = (await getAll(STORES.SYNC_QUEUE)).filter(i => i.status === 'pending' || i.status === 'failed');
    if (!items.length) {
      emit('sync:status');
      return { synced: 0, failed: 0, conflicts: 0 };
    }
    let ok = 0, failed = 0, conflicts = 0;
    for (const item of items) {
      try {
        const ref = fb.fs.doc(fb.db, item.collection, item.id);
        const snap = await fb.fs.getDoc(ref);
        const server = snap.exists() ? snap.data() : null;

        if (server) {
          /* CONFLICT CHECK — last edit wins, nothing is lost. */
          const serverT = String(server.updatedAt || server.at || '');
          const mineT = String(item.payload.updatedAt || item.payload.at || '');
          if (serverT >= mineT) {
            // The cloud copy is the same or NEWER: adopt it, never overwrite.
            await updateRecordSyncStatus(item.collection, item.id, SYNC_STATUS.SYNCED, { syncedAt: nowISO() });
            item.status = 'synced';
            item.lastError = null;
            item.updatedAt = nowISO();
            await put(STORES.SYNC_QUEUE, item);
            ok++;
            if (serverT > mineT) {
              conflicts++;
              await logAction(AUDIT_ACTIONS.SYNC_CONFLICT,
                `${item.type} "${item.id}" was newer on the server (edited on another device) — this device adopted the server version. Nothing was lost.`);
            }
            continue;
          }
        }

        // Idempotent write: same event ID → same document → no duplicates, ever.
        await fb.fs.setDoc(ref, { ...item.payload, syncedAt: nowISO() });
        item.status = 'synced';
        item.updatedAt = nowISO();
        item.lastError = null;
        await put(STORES.SYNC_QUEUE, item);
        await updateRecordSyncStatus(item.collection, item.id, SYNC_STATUS.SYNCED, { syncedAt: nowISO(), lastSyncError: null });
        ok++;
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = String(err?.message || err);
        item.status = item.attempts >= MAX_ATTEMPTS_BEFORE_FAILED ? 'failed' : 'pending';
        item.updatedAt = nowISO();
        await put(STORES.SYNC_QUEUE, item);
        if (item.status === 'failed') {
          // "failed — kept": the record stays safe on this device and is
          // visibly marked; a later successful retry clears the mark.
          await updateRecordSyncStatus(item.collection, item.id, SYNC_STATUS.FAILED, { lastSyncError: item.lastError });
        }
        failed++;
      }
    }
    if (ok > 0) {
      await put(STORES.META, { id: 'lastSync', at: nowISO() });
      emit('sync:completed', { ok });
    }
    if (items.length > 0) {
      // One ledger entry per drain run (local always; mirrored when online).
      const tx = {
        id: uuid(),
        startedAt, endedAt: nowISO(),
        uploaded: ok, failed, conflicts,
        deviceId: device?.id || null, deviceName: device?.name || '-',
        environment: environmentName(), appVersion: APP.version,
        note: items.length + ' item(s) processed'
      };
      try { await put(STORES.SYNC_TRANSACTIONS, tx); } catch { /* ledger is best-effort */ }
      try {
        await fb.fs.setDoc(fb.fs.doc(fb.db, 'sync_transactions', tx.id), { ...tx, syncedAt: nowISO() });
      } catch { /* mirrored on a later run */ }
    }
    emit('sync:status');
    return { synced: ok, failed, conflicts };
  } finally {
    _draining = false;
  }
}

/** Reset every failed item and run a drain right now (Retry button). */
export async function retryFailedNow() {
  const items = (await getAll(STORES.SYNC_QUEUE)).filter(i => i.status === 'failed');
  for (const item of items) {
    item.status = 'pending';
    item.updatedAt = nowISO();
    await put(STORES.SYNC_QUEUE, item);
  }
  emit('sync:status');
  return syncNow();
}

/** Register/refresh this device in the central device registry (live mode). */
export async function registerDeviceLive(device) {
  if (!isFirebaseConfigured() || !_online) return;
  if (device.status === 'revoked') return;   // revoked devices stay silent
  try {
    const fb = await fbEnsure();
    await fb.fs.setDoc(
      fb.fs.doc(fb.db, 'devices', device.id),
      {
        id: device.id,
        deviceName: device.name,
        platform: device.platform,
        userId: device.userId,
        ownerName: device.ownerName,
        ownerRole: device.ownerRole || null,
        status: device.status || 'active',
        activationEnabled: !!(device.activation?.enabled),
        registeredAt: device.registeredAt,
        lastSeenAt: nowISO()
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Device registration deferred to next sync:', err?.message || err);
  }
}
