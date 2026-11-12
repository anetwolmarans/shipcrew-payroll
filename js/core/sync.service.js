/**
 * sync.service.js — The offline-first synchronisation engine.
 *
 * PLAIN ENGLISH:
 *  - Anything the device creates (currently: audit entries; later: clock-ins,
 *    catch records, …) is written to the LOCAL database first. It is safe
 *    immediately, even with no internet.
 *  - A copy waits in the "sync queue" (like an outbox of letters).
 *  - When the internet returns, each item is uploaded to Firestore.
 *  - DUPLICATE PROOF: every item carries a unique ID that becomes the
 *    document ID in Firestore. Sending the same item twice just overwrites
 *    the same document — it can never create a duplicate.
 *  - If an upload fails, the item is KEPT and retried later. Nothing is ever
 *    thrown away. Approved payroll records can never be silently overwritten
 *    because uploads only ever create their own uniquely-named documents.
 */
import { getAll, get, put, STORES } from './idb.js';
import { fbEnsure } from './firebase.service.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { emit } from './events.js';
import { nowISO } from './time.js';

const RETRY_INTERVAL_MS = 30000; // every 30 seconds while online
const MAX_ATTEMPTS_BEFORE_FAILED = 5;

let _online = (typeof navigator !== 'undefined') ? navigator.onLine : true;
let _draining = false;

export function initSync() {
  window.addEventListener('online', () => { _online = true; emit('sync:status'); tryDrain(); });
  window.addEventListener('offline', () => { _online = false; emit('sync:status'); });
  setInterval(() => tryDrain(), RETRY_INTERVAL_MS);
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
    syncedTotal: items.filter(i => i.status === 'synced').length,
    lastSyncAt: lastSync?.at || null
  };
}

/** Add a record to the outbox. Called by audit.service.js (and later modules). */
export async function queueForSync(record, collection = 'audit_logs', type = 'audit_log') {
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

/** Upload everything in the queue. Safe to run at any time. */
export async function syncNow({ silent = false } = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Not connected to Firebase yet. Your records are safe on this device (demo mode). To enable synchronisation, connect Firebase — see docs/01-firebase-setup.md.');
  }
  if (!_online) {
    throw new Error('You are offline. Records are saved on this device and will upload automatically when the connection returns.');
  }
  _draining = true;
  try {
    const fb = await fbEnsure();
    const items = (await getAll(STORES.SYNC_QUEUE)).filter(i => i.status === 'pending' || i.status === 'failed');
    if (!items.length) {
      emit('sync:status');
      return { synced: 0, failed: 0 };
    }
    let ok = 0, failed = 0;
    for (const item of items) {
      try {
        // Idempotent write: same event ID → same document → no duplicates, ever.
        await fb.fs.setDoc(fb.fs.doc(fb.db, item.collection, item.id), {
          ...item.payload,
          syncedAt: nowISO()
        });
        item.status = 'synced';
        item.updatedAt = nowISO();
        await put(STORES.SYNC_QUEUE, item);
        if (item.collection === 'audit_logs') {
          const rec = await get(STORES.AUDIT_LOGS, item.id);
          if (rec) {
            rec.syncStatus = 'synchronised';
            await put(STORES.AUDIT_LOGS, rec);
          }
        }
        ok++;
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = String(err?.message || err);
        item.status = item.attempts >= MAX_ATTEMPTS_BEFORE_FAILED ? 'failed' : 'pending';
        item.updatedAt = nowISO();
        await put(STORES.SYNC_QUEUE, item);
        failed++;
      }
    }
    if (ok > 0) {
      await put(STORES.META, { id: 'lastSync', at: nowISO() });
      emit('sync:completed', { ok });
    }
    emit('sync:status');
    return { synced: ok, failed };
  } finally {
    _draining = false;
  }
}

/** Register/refresh this device in the central device registry (live mode). */
export async function registerDeviceLive(device) {
  if (!isFirebaseConfigured() || !_online) return;
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
        status: device.status || 'active',
        registeredAt: device.registeredAt,
        lastSeenAt: nowISO()
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Device registration deferred to next sync:', err?.message || err);
  }
}
