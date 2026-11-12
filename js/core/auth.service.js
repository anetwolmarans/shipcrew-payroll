/**
 * auth.service.js — Signing in, staying signed in, locking, signing out.
 *
 * TWO MODES:
 *  - DEMO mode  (no Firebase connected): accounts live on this device only.
 *  - LIVE mode  (Firebase connected):    Firebase Authentication checks the
 *    password, and the user's role is read from the Firestore "users"
 *    collection — so permissions are enforced by the SERVER, not the browser.
 *
 * SESSIONS: after a successful sign-in the session is stored on the device,
 * so closing and reopening the app (or losing internet) does not log you out.
 *
 * SHARED DEVICES: after a few idle minutes the app locks itself and asks for
 * the password again, so one crew member cannot clock for another.
 */
import { get, put, del, STORES } from './idb.js';
import { verifyPassword, uuid, makePasswordRecord } from './security.js';
import * as store from './store.js';
import { logAction, AUDIT_ACTIONS } from './audit.service.js';
import { fbEnsure } from './firebase.service.js';
import { isFirebaseConfigured, environmentName } from '../firebase-config.js';
import { DEFAULT_SETTINGS } from '../config.js';
import { roleLabel, ROLES } from './permissions.js';
import { emit } from './events.js';
import { nowISO } from './time.js';
import { queueForSync, registerDeviceLive } from './sync.service.js';

let _session = null;

export function currentSession() { return _session; }
export function isLocked() { return !!_session?.locked; }

async function readSession() { return get(STORES.SESSIONS, 'current'); }

/* ---------- Login guard (brute-force protection) ---------- */
async function getGuard() { return (await get(STORES.META, 'loginGuard')) || { fails: 0, until: 0 }; }
async function setGuard(g) { await put(STORES.META, { id: 'loginGuard', ...g }); }

async function assertNotCoolingDown() {
  const g = await getGuard();
  if (g.until && Date.now() < g.until) {
    const wait = Math.ceil((g.until - Date.now()) / 1000);
    throw new Error(`Too many failed attempts. Please wait ${wait} second${wait === 1 ? '' : 's'} and try again.`);
  }
}
async function noteLoginFailure() {
  const g = await getGuard();
  g.fails = (g.fails || 0) + 1;
  const max = DEFAULT_SETTINGS.maxLoginAttempts;
  if (g.fails >= max) {
    g.until = Date.now() + DEFAULT_SETTINGS.loginCooldownSeconds * 1000;
    g.fails = 0;
    await setGuard(g);
    await logAction(AUDIT_ACTIONS.LOGIN_COOLDOWN, `Too many failed sign-in attempts — ${DEFAULT_SETTINGS.loginCooldownSeconds}s cooldown started.`);
    return;
  }
  await setGuard(g);
}
async function clearGuard() { await setGuard({ fails: 0, until: 0 }); }

/* ---------- Sign in ---------- */
export async function login(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) throw new Error('Please enter your email and password.');
  await assertNotCoolingDown();
  try {
    const session = isFirebaseConfigured()
      ? await loginLive(cleanEmail, password)
      : await loginDemo(cleanEmail, password);
    await clearGuard();

    _session = session;
    await put(STORES.SESSIONS, { ...session, id: 'current' });
    await store.touchDevice(session);

    // Upload the device record when live so administrators can see it.
    const device = await store.getOrCreateLocalDevice();
    await registerDeviceLive({ ...device, userId: session.userId, ownerName: session.fullName });

    await logAction(AUDIT_ACTIONS.LOGIN_SUCCESS,
      `${session.fullName} signed in as ${roleLabel(session.role)} — ${session.mode === 'demo' ? 'demo mode' : environmentName()}.`);

    // Ask the browser to keep our data even under storage pressure.
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}

    emit('session:changed', session);
    return session;
  } catch (err) {
    await noteLoginFailure();
    await logAction(AUDIT_ACTIONS.LOGIN_FAILED, `Failed sign-in attempt for "${cleanEmail}" — ${err?.message || 'error'}.`);
    throw err;
  }
}

async function buildSession(user, mode) {
  const device = await store.getOrCreateLocalDevice();
  return {
    id: 'current',
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    roleLabel: roleLabel(user.role),
    employeeId: user.employeeId || null,
    mode,                       // 'demo' | 'live'
    locked: false,
    startedAt: nowISO(),
    lastSeenAt: nowISO(),
    deviceName: device.name
  };
}

async function loginDemo(email, password) {
  const user = await store.getUserByEmail(email);
  if (!user) {
    throw new Error('No account with this email exists on this device (demo mode). Use one of the demo accounts shown on this screen, or connect Firebase — see docs/01-firebase-setup.md.');
  }
  if (user.status !== 'active') throw new Error('This account has been disabled. Contact your system administrator.');
  const ok = await verifyPassword(password, user.password);
  if (!ok) throw new Error('Incorrect password. Please try again.');
  const session = await buildSession(user, 'demo');
  await store.updateUser({ ...user, lastLoginAt: nowISO() });
  return session;
}

async function loginLive(email, password) {
  const fb = await fbEnsure();
  const { signInWithEmailAndPassword, signOut } = fb.authMod;
  let cred;
  try {
    cred = await signInWithEmailAndPassword(fb.auth, email, password);
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      throw new Error('Incorrect email or password.');
    }
    if (code === 'auth/network-request-failed') {
      throw new Error('No internet connection. First-time sign-in needs internet once; after that this device can work offline.');
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('Firebase has temporarily blocked this account after many failed attempts. Try again later or reset the password.');
    }
    throw new Error(`Sign-in failed: ${err?.message || code || 'unknown error'}`);
  }
  const uid = cred.user.uid;
  const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'users', uid));
  if (!snap.exists()) {
    await signOut(fb.auth);
    throw new Error('Your password works, but your user record is not set up yet. Ask your administrator to complete the "create the first users" steps in docs/01-firebase-setup.md.');
  }
  const data = snap.data();
  if (!ROLES.some(r => r.id === data.role)) {
    await signOut(fb.auth);
    throw new Error(`Your user record has an unknown role ("${data.role}"). Ask your administrator to fix it in the Firebase console.`);
  }
  if (data.status !== 'active') {
    await signOut(fb.auth);
    throw new Error('This account has been disabled. Contact your system administrator.');
  }
  return buildSession({ ...data, id: uid }, 'live');
}

/* ---------- Session restore (app reopened) ---------- */
export async function restoreSession() {
  const session = await readSession();
  if (!session) return null;
  if (session.mode === 'demo') {
    const user = await store.getUserById(session.userId);
    if (!user || user.status !== 'active') {
      await del(STORES.SESSIONS, 'current');
      return null;
    }
  }
  _session = session;
  await logAction(AUDIT_ACTIONS.SESSION_RESTORED, 'App reopened — session restored from this device.');
  emit('session:changed', session);
  return session;
}

/* ---------- Sign out ---------- */
export async function logout() {
  if (_session) {
    await logAction(AUDIT_ACTIONS.LOGOUT, `${_session.fullName} signed out.`);
    if (_session.mode === 'live') {
      try {
        const fb = await fbEnsure();
        await fb.authMod.signOut(fb.auth);
      } catch { /* offline sign-out is fine — local session is cleared below */ }
    }
  }
  await del(STORES.SESSIONS, 'current');
  _session = null;
  emit('session:changed', null);
}

/* ---------- Automatic locking (shared devices) ---------- */
export async function lock(reason = 'Automatic lock after inactivity.') {
  if (!_session || _session.locked) return;
  _session = { ..._session, locked: true, lockedAt: nowISO() };
  await put(STORES.SESSIONS, { ..._session, id: 'current' });
  await logAction(AUDIT_ACTIONS.LOCK_TRIGGERED, reason);
  emit('session:changed', _session);
}

export async function unlock(password) {
  if (!_session) throw new Error('No active session.');
  try {
    if (_session.mode === 'demo') {
      const user = await store.getUserById(_session.userId);
      const ok = await verifyPassword(password, user?.password);
      if (!ok) throw new Error('Incorrect password.');
    } else {
      const fb = await fbEnsure();
      const { EmailAuthProvider, reauthenticateWithCredential } = fb.authMod;
      const cred = EmailAuthProvider.credential(_session.email, password);
      await reauthenticateWithCredential(fb.auth.currentUser, cred);
    }
    _session = { ..._session, locked: false, lockedAt: null };
    await put(STORES.SESSIONS, { ..._session, id: 'current' });
    await logAction(AUDIT_ACTIONS.UNLOCK_SUCCESS, 'Screen unlocked.');
    emit('session:changed', _session);
    return true;
  } catch (err) {
    const msg = err?.code === 'auth/network-request-failed'
      ? 'You are offline. Reconnect to the internet to unlock. (A quick PIN unlock for offline use arrives in Phase 3.)'
      : (err?.message || 'Unlock failed.');
    await logAction(AUDIT_ACTIONS.UNLOCK_FAILED, msg);
    throw new Error(msg);
  }
}

/* ---------- Password reset email (live mode) ---------- */
export async function sendPasswordReset(email) {
  const fb = await fbEnsure();
  await fb.authMod.sendPasswordResetEmail(fb.auth, String(email || '').trim());
}

/* ---------- In-app user management (Phase 2, system administrators) ---------- */
/**
 * Create a user account from inside the app.
 *  - DEMO mode: a device-local account with a PBKDF2-hashed password.
 *  - LIVE mode: uses a SECONDARY Firebase app instance so the administrator's
 *    own session is never replaced by the newly created account. The new
 *    account is created in Firebase Authentication, its profile document is
 *    written to Firestore `users/{uid}`, then the secondary app is discarded.
 */
export async function adminCreateUser({ email, password, fullName, role, employeeId = null }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password || !fullName) throw new Error('Name, email and a starting password are all required.');
  if (password.length < 8) throw new Error('The starting password must be at least 8 characters.');
  if (!ROLES.some(r => r.id === role)) throw new Error('Choose a valid role.');

  if (!isFirebaseConfigured()) {
    const clash = await store.getUserByEmail(cleanEmail);
    if (clash) throw new Error('An account with this email already exists on this device.');
    const user = {
      id: uuid(),
      email: cleanEmail,
      fullName,
      role,
      employeeId: employeeId || null,
      isDemo: true,
      status: 'active',
      lastLoginAt: null,
      password: await makePasswordRecord(password)
    };
    const stamped = { ...user, createdAt: nowISO(), createdBy: currentSession()?.fullName || 'admin', updatedAt: nowISO(), updatedBy: currentSession()?.fullName || 'admin' };
    await store.updateUser(stamped);
    await logAction(AUDIT_ACTIONS.USER_CREATED, `User created (demo): ${fullName} <${cleanEmail}> as ${roleLabel(role)}.`);
    return stamped;
  }

  const fb = await fbEnsure();
  const appMod = await import('firebase/app');
  const secondaryName = `shipcrew-user-creation-${Date.now()}`;
  let secondaryApp = null;
  try {
    secondaryApp = appMod.initializeApp(fb.cfg, secondaryName);
    const secondaryAuth = fb.authMod.getAuth(secondaryApp);
    const cred = await fb.authMod.createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
    await fb.authMod.signOut(secondaryAuth);
    const who = currentSession();
    const profile = {
      id: cred.user.uid,
      email: cleanEmail,
      fullName,
      role,
      employeeId: employeeId || null,
      status: 'active',
      lastLoginAt: null,
      createdAt: nowISO(), createdBy: who?.fullName || 'admin',
      updatedAt: nowISO(), updatedBy: who?.fullName || 'admin'
    };
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'users', cred.user.uid), profile);
    await logAction(AUDIT_ACTIONS.USER_CREATED, `User created: ${fullName} <${cleanEmail}> as ${roleLabel(role)}.`);
    return profile;
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/email-already-in-use') throw new Error('An account with this email already exists.');
    if (code === 'auth/invalid-email') throw new Error('That email address is not valid.');
    if (code === 'auth/weak-password') throw new Error('The password is too weak — use at least 8 characters mixing letters and numbers.');
    throw new Error(`Could not create the account: ${err?.message || code}`);
  } finally {
    if (secondaryApp) { try { await appMod.deleteApp(secondaryApp); } catch { /* already gone */ } }
  }
}

/** Change a user's role (demo: local; live: Firestore — rules re-check the admin's role). */
export async function adminSetRole(userId, role) {
  if (!ROLES.some(r => r.id === role)) throw new Error('Unknown role.');
  if (isFirebaseConfigured()) {
    const fb = await fbEnsure();
    await fb.fs.updateDoc(fb.fs.doc(fb.db, 'users', userId), {
      role, updatedAt: nowISO(), updatedBy: currentSession()?.fullName || 'admin'
    });
  } else {
    const user = await store.getUserById(userId);
    if (!user) throw new Error('User not found.');
    await store.updateUser({ ...user, role });
  }
  await logAction(AUDIT_ACTIONS.USER_ROLE_CHANGED, `Role of ${userId} changed to ${roleLabel(role)}.`);
}

/** Enable or disable a login (disabled accounts cannot sign in). */
export async function adminSetStatus(userId, status) {
  if (userId === currentSession()?.userId) throw new Error('You cannot disable your own account while signed in.');
  if (isFirebaseConfigured()) {
    const fb = await fbEnsure();
    await fb.fs.updateDoc(fb.fs.doc(fb.db, 'users', userId), {
      status, updatedAt: nowISO(), updatedBy: currentSession()?.fullName || 'admin'
    });
  } else {
    const user = await store.getUserById(userId);
    if (!user) throw new Error('User not found.');
    await store.updateUser({ ...user, status });
  }
  await logAction(status === 'active' ? AUDIT_ACTIONS.USER_ENABLED : AUDIT_ACTIONS.USER_DISABLED,
    `Account ${userId} set to ${status}.`);
}

/** Set a new password directly (demo mode) — live mode uses the reset email. */
export async function adminSetPassword(userId, newPassword) {
  if (isFirebaseConfigured()) {
    throw new Error('In live mode passwords are managed by Firebase Authentication. Use "Send reset email" instead — it never exposes passwords.');
  }
  if (!newPassword || newPassword.length < 8) throw new Error('The new password must be at least 8 characters.');
  const user = await store.getUserById(userId);
  if (!user) throw new Error('User not found.');
  await store.updateUser({ ...user, password: await makePasswordRecord(newPassword), updatedAt: nowISO() });
  await logAction(AUDIT_ACTIONS.USER_PASSWORD_RESET, `Password reset on this device for ${user.fullName} <${user.email}>.`);
}
