/**
 * device.service.js — Phase 3: offline device activation, the device-bound
 * PIN, and the revocation workflow.
 *
 * PLAIN ENGLISH:
 *  - A device that has signed in once can be ACTIVATED for offline use by
 *    setting a quick PIN (4–8 digits). The PIN belongs to THIS DEVICE ONLY:
 *    it is stored HASHED in this device's own database and never uploaded
 *    anywhere. Not even the cloud knows it.
 *  - The PIN unlocks a LOCKED session without internet — that is how crew
 *    unlock the app at sea. Signing IN still needs the email + password;
 *    the PIN is only the quick key for the locked screen.
 *  - Brute-force protection: after 5 wrong PIN attempts the device waits
 *    60 seconds (same rule as the password login).
 *  - REVOCATION: an administrator can mark a device as "revoked" (for
 *    example a lost phone). A revoked device cannot sign in, cannot sync,
 *    and is signed out as soon as the revocation is noticed. An
 *    administrator can reinstate it from the Devices screen.
 */
import { get, put, del, getAll, STORES } from './idb.js';
import { makePasswordRecord, verifyPassword, uuid } from './security.js';
import { nowISO } from './time.js';
import { currentSession } from './auth.service.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';
import { fbEnsure } from './firebase.service.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { emit } from './events.js';

const PIN_PATTERN = /^\d{4,8}$/;
const MAX_PIN_ATTEMPTS = 5;

/* ============================ activation ============================== */

export async function getActivation() { return get(STORES.META, 'deviceActivation'); }

export async function pinEnabled() { return !!(await getPinRecord()); }

/** The hashed PIN record lives ONLY in this device's meta store. */
async function getPinRecord() { return get(STORES.META, 'devicePin'); }

export function isValidPin(pin) { return PIN_PATTERN.test(String(pin || '').trim()); }

/* ------------------------- PIN brute-force guard ---------------------- */
async function getGuard() { return (await get(STORES.META, 'pinGuard')) || { fails: 0, until: 0 }; }
async function setGuard(g) { await put(STORES.META, { id: 'pinGuard', ...g }); }
async function clearGuard() { await setGuard({ fails: 0, until: 0 }); }

export async function pinCooldownSecondsLeft() {
  const g = await getGuard();
  return (g.until && Date.now() < g.until) ? Math.ceil((g.until - Date.now()) / 1000) : 0;
}

async function assertNotCoolingDown() {
  const wait = await pinCooldownSecondsLeft();
  if (wait > 0) {
    throw new Error(`Too many incorrect PIN attempts. Wait ${wait} second${wait === 1 ? '' : 's'} and try again — or unlock with your password.`);
  }
}

async function notePinFailure(pin) {
  const g = await getGuard();
  g.fails = (g.fails || 0) + 1;
  if (g.fails >= MAX_PIN_ATTEMPTS) {
    g.until = Date.now() + 60000;
    g.fails = 0;
    await setGuard(g);
    await logAction(AUDIT_ACTIONS.PIN_LOCKOUT, '5 wrong device-PIN attempts — PIN unlock locked for 60 seconds (password still works).');
    throw new Error('Too many incorrect PIN attempts. The PIN is locked for 60 seconds — unlock with your password instead.');
  }
  await setGuard(g);
}

/* --------------------------- set / change / remove -------------------- */

/** Set the device PIN (first time) or change it (current PIN required). */
export async function setPin(newPin, currentPin = null) {
  const pin = String(newPin || '').trim();
  if (!isValidPin(pin)) throw new Error('The PIN must be 4 to 8 digits.');
  const existing = await getPinRecord();
  if (existing) {
    await assertNotCoolingDown();
    if (!currentPin) throw new Error('Enter the current PIN first to change it.');
    const okCurrent = await verifyDevicePinInternal(String(currentPin).trim());
    if (!okCurrent) throw new Error('The current PIN is not correct.');
  }
  const who = currentSession();
  await put(STORES.META, { id: 'devicePin', ...(await makePasswordRecord(pin)), createdAt: existing?.createdAt || nowISO(), changedAt: nowISO() });
  await markDeviceActivation(true);
  await clearGuard();
  await logAction(existing ? AUDIT_ACTIONS.DEVICE_PIN_CHANGED : AUDIT_ACTIONS.DEVICE_PIN_SET,
    existing ? 'Device PIN changed.' : `Device PIN set by ${who?.fullName || 'user'} — this device can now be unlocked offline with the PIN.`);
  return true;
}

/** Remove the device PIN (current PIN required — no one forgets-proof). */
export async function removePin(currentPin) {
  const existing = await getPinRecord();
  if (!existing) throw new Error('No device PIN is set on this device.');
  await assertNotCoolingDown();
  const ok = await verifyDevicePinInternal(String(currentPin || '').trim());
  if (!ok) throw new Error('The current PIN is not correct.');
  await del(STORES.META, 'devicePin');
  await markDeviceActivation(false);
  await clearGuard();
  await logAction(AUDIT_ACTIONS.DEVICE_PIN_REMOVED, 'Device PIN removed — password unlock only.');
  return true;
}

/** Check a typed PIN against the stored record (no guard — used internally). */
async function verifyDevicePinInternal(pin) {
  const rec = await getPinRecord();
  if (!rec) return false;
  return verifyPassword(pin, rec);
}

/**
 * Verify a typed PIN WITH the brute-force guard. Throws a friendly error
 * on failure. Used by the lock screen (auth.unlockWithPin).
 */
export async function verifyDevicePin(pin) {
  await assertNotCoolingDown();
  const ok = await verifyDevicePinInternal(String(pin || '').trim());
  if (!ok) {
    await notePinFailure(pin);
    const left = MAX_PIN_ATTEMPTS - ((await getGuard()).fails || 0);
    throw new Error(`Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left before the PIN locks for 60 seconds.`);
  }
  await clearGuard();
  return true;
}

async function markDeviceActivation(enabled) {
  const device = await getOrCreateDeviceRecord();
  const next = {
    ...device,
    activation: {
      ...(device.activation || {}),
      enabled,
      setAt: enabled ? (device.activation?.setAt || nowISO()) : null,
      changedAt: nowISO(),
      setBy: currentSession()?.fullName || device.ownerName || 'user'
    }
  };
  await put(STORES.DEVICES, next);
  // Best-effort mirror in the central registry (the PIN itself never uploads).
  mirrorDeviceLive(next);
  return next;
}

/* ============================== revocation ============================= */

export async function getOrCreateDeviceRecord() {
  const pointer = await get(STORES.META, 'localDeviceId');
  if (pointer?.value) {
    const existing = await get(STORES.DEVICES, pointer.value);
    if (existing) return existing;
  }
  // Should not happen (store.js seeds it) — self-heal anyway.
  const device = {
    id: uuid(), name: 'This device', platform: 'Unknown device',
    userId: null, ownerName: null, status: 'active',
    registeredAt: nowISO(), lastSeenAt: nowISO()
  };
  await put(STORES.DEVICES, device);
  await put(STORES.META, { id: 'localDeviceId', value: device.id });
  return device;
}

export async function isDeviceRevoked() {
  const device = await getOrCreateDeviceRecord();
  return device.status === 'revoked';
}

/** Mirror status changes to the central registry (live mode, best effort). */
async function mirrorDeviceLive(device) {
  if (!isFirebaseConfigured()) return;
  try {
    const fb = await fbEnsure();
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'devices', device.id), {
      id: device.id,
      deviceName: device.name,
      platform: device.platform,
      userId: device.userId || null,
      ownerName: device.ownerName || null,
      status: device.status || 'active',
      activationEnabled: !!(device.activation?.enabled),
      registeredAt: device.registeredAt || nowISO(),
      lastSeenAt: nowISO()
    }, { merge: true });
  } catch (err) {
    console.warn('Device registry mirror deferred:', err?.message || err);
  }
}

/**
 * Revoke a device. `deviceId === 'local'` revokes THIS device (signs out).
 * Demo mode: local registry only. Live mode: the central registry is
 * updated too, so every other device and the sync engine see it.
 */
export async function revokeDevice(deviceId, reason = '') {
  const who = currentSession();
  const local = await getOrCreateDeviceRecord();
  const isLocal = deviceId === 'local' || deviceId === local.id;
  let device;
  if (isLocal) {
    device = { ...local, status: 'revoked', revokedAt: nowISO(), revokedBy: who?.fullName || 'user', revokedReason: reason || 'Revoked on this device' };
    await put(STORES.DEVICES, device);
  } else {
    device = { id: deviceId, status: 'revoked', revokedAt: nowISO(), revokedBy: who?.fullName || 'user', revokedReason: reason || '' };
  }
  if (isFirebaseConfigured() && navigator.onLine) {
    try {
      const fb = await fbEnsure();
      await fb.fs.setDoc(fb.fs.doc(fb.db, 'devices', device.id), {
        status: 'revoked', revokedAt: nowISO(), revokedBy: who?.fullName || 'user', revokedReason: reason || ''
      }, { merge: true });
    } catch (err) {
      throw new Error(`Could not reach the device registry: ${err?.message || err}. Try again when online.`);
    }
  }
  await logAction(AUDIT_ACTIONS.DEVICE_REVOKED, `Device ${isLocal ? `"${device.name}" (this device)` : deviceId} revoked${reason ? ` — ${reason}` : ''}.`);
  emit('device:revoked', { deviceId: device.id, isLocal });
  return { device, isLocal };
}

/** Bring a revoked device back to active (administrator action). */
export async function reinstateDevice(deviceId) {
  const who = currentSession();
  const local = await getOrCreateDeviceRecord();
  const isLocal = deviceId === 'local' || deviceId === local.id;
  if (isLocal) {
    const device = { ...local, status: 'active', reinstatedAt: nowISO(), reinstatedBy: who?.fullName || 'user' };
    delete device.revokedAt; delete device.revokedBy; delete device.revokedReason;
    await put(STORES.DEVICES, device);
    await mirrorDeviceLive(device);
  } else if (isFirebaseConfigured() && navigator.onLine) {
    try {
      const fb = await fbEnsure();
      await fb.fs.setDoc(fb.fs.doc(fb.db, 'devices', deviceId), {
        status: 'active', reinstatedAt: nowISO(), reinstatedBy: who?.fullName || 'user'
      }, { merge: true });
    } catch (err) {
      throw new Error(`Could not reach the device registry: ${err?.message || err}. Try again when online.`);
    }
  }
  await logAction(AUDIT_ACTIONS.DEVICE_REINSTATED, `Device ${isLocal ? `"${local.name}" (this device)` : deviceId} reinstated by ${who?.fullName || 'user'}.`);
  return true;
}

/**
 * LIVE MODE ONLY: ask the central registry whether this device is still
 * trusted. Called after sign-in and before every sync. If the answer is
 * "revoked", the device marks itself revoked and reports back so the app
 * can sign the session out.
 */
export async function checkServerRevocation() {
  if (!isFirebaseConfigured() || !navigator.onLine) return false;
  const device = await getOrCreateDeviceRecord();
  try {
    const fb = await fbEnsure();
    const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'devices', device.id));
    if (snap.exists() && snap.data().status === 'revoked' && device.status !== 'revoked') {
      const marked = { ...device, status: 'revoked', revokedAt: snap.data().revokedAt || nowISO(), revokedBy: snap.data().revokedBy || 'administrator', revokedReason: snap.data().revokedReason || 'Revoked centrally' };
      await put(STORES.DEVICES, marked);
      await logAction(AUDIT_ACTIONS.DEVICE_REVOKED, `This device was revoked centrally by ${marked.revokedBy} — signing out and stopping sync.`);
      emit('device:revoked', { deviceId: device.id, isLocal: true });
      return true;
    }
  } catch { /* offline or registry unreachable — local status stays authoritative */ }
  return false;
}

/** All devices from the LOCAL registry (demo mode / this device only). */
export async function listLocalDevices() {
  const all = await getAll(STORES.DEVICES);
  return all.sort((a, b) => String(b.registeredAt || '').localeCompare(String(a.registeredAt || '')));
}
