/**
 * idb.js — IndexedDB wrapper: the app's own on-device database.
 * PLAIN ENGLISH: IndexedDB is storage inside the browser that SURVIVES
 * closing the app and restarting the device (unlike normal variables).
 * This module opens the database and offers simple helpers
 * (put/get/getAll/delete) used by the rest of the app.
 */

const DB_NAME = 'shipcrew_payroll';
const DB_VERSION = 2;   // v2: adds crew_banking store + clock/assignment indexes (Phase 2)

/** Every "table" (object store) in the local database. Created once at first run. */
export const STORES = {
  META: 'meta',                    // app settings & pointers (id = 'settings', 'device', …)
  COMPANIES: 'companies',
  USERS: 'users',
  ROLES: 'roles',
  CREW: 'crew',
  CREW_BANKING: 'crew_banking',    // Phase 2 — bank details, restricted collection
  CONTRACTS: 'contracts',
  VESSELS: 'vessels',
  TRIPS: 'trips',
  ASSIGNMENTS: 'assignments',
  CLOCK_EVENTS: 'clock_events',
  WORK_RECORDS: 'work_records',
  BREAK_RECORDS: 'break_records',
  REST_RECORDS: 'rest_records',
  CATCH_RECORDS: 'catch_records',
  QUOTA_ALLOCATIONS: 'quota_allocations',
  REMUNERATION_RULES: 'remuneration_rules',
  STATUTORY_RULES: 'statutory_rules',
  PAYROLL_PERIODS: 'payroll_periods',
  PAYROLL_CALCULATIONS: 'payroll_calculations',
  PAYROLL_APPROVALS: 'payroll_approvals',
  PAYSLIPS: 'payslips',
  DEDUCTIONS: 'deductions',
  ALLOWANCES: 'allowances',
  AUDIT_LOGS: 'audit_logs',
  SYNC_QUEUE: 'sync_queue',
  DEVICES: 'devices',
  SESSIONS: 'sessions',
  SYNC_TRANSACTIONS: 'sync_transactions'
};

/** Extra search indexes (like the index at the back of a book). */
const INDEXES = {
  [STORES.SYNC_QUEUE]: [['status', 'status'], ['type', 'type']],
  [STORES.AUDIT_LOGS]: [['action', 'action']],
  [STORES.USERS]: [['email', 'email']],
  [STORES.DEVICES]: [['userId', 'userId']],
  [STORES.CLOCK_EVENTS]: [['userId', 'userId'], ['tripId', 'tripId']],
  [STORES.ASSIGNMENTS]: [['crewId', 'crewId'], ['tripId', 'tripId']],
  [STORES.TRIPS]: [['status', 'status']],
  [STORES.VESSELS]: [['status', 'status']]
};

let _dbPromise = null;

export function openDatabase() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support IndexedDB (offline storage). Please use a modern Chrome, Edge or Firefox.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        let store;
        if (!db.objectStoreNames.contains(name)) {
          store = db.createObjectStore(name, { keyPath: 'id' });
        } else {
          store = req.transaction.objectStore(name);
        }
        for (const [idxName, keyPath] of (INDEXES[name] || [])) {
          if (!store.indexNames.contains(idxName)) {
            store.createIndex(idxName, keyPath, { unique: idxName === 'email' });
          }
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Could not open the local database.'));
    req.onblocked = () => reject(new Error('The local database is blocked by another open tab. Close other ShipCrew Payroll tabs, then reload.'));
  });
  return _dbPromise;
}

async function store(name, mode) {
  const db = await openDatabase();
  return db.transaction(name, mode).objectStore(name);
}
function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save (insert or overwrite) one record. Every record must have an `id`. */
export async function put(name, value) {
  if (!value || !value.id) throw new Error('put(): record is missing an id');
  const s = await store(name, 'readwrite');
  return asPromise(s.put(value));
}
export async function get(name, id) {
  const s = await store(name, 'readonly');
  return asPromise(s.get(id));
}
export async function getAll(name) {
  const s = await store(name, 'readonly');
  return asPromise(s.getAll());
}
export async function del(name, id) {
  const s = await store(name, 'readwrite');
  return asPromise(s.delete(id));
}
export async function clear(name) {
  const s = await store(name, 'readwrite');
  return asPromise(s.clear());
}
export async function count(name) {
  const s = await store(name, 'readonly');
  return asPromise(s.count());
}
export async function getAllByIndex(name, indexName, value) {
  const s = await store(name, 'readonly');
  return asPromise(s.index(indexName).getAll(value));
}
