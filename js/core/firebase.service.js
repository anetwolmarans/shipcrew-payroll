/**
 * firebase.service.js — Loads the Firebase SDK only when it is actually needed.
 * PLAIN ENGLISH: Firebase is only loaded once you connect a real project
 * (js/firebase-config.js). In demo mode none of these files are downloaded,
 * so the app stays small and fully offline.
 */
import { getFirebaseConfig } from '../firebase-config.js';

let _fb = null;

export async function fbEnsure() {
  if (_fb) return _fb;
  const cfg = getFirebaseConfig();
  if (!cfg) {
    throw new Error('Firebase is not configured yet. Open js/firebase-config.js and follow docs/01-firebase-setup.md.');
  }
  try {
    const appMod = await import('firebase/app');
    const authMod = await import('firebase/auth');
    const fsMod = await import('firebase/firestore');
    const app = appMod.initializeApp(cfg);
    _fb = {
      app,
      cfg,
      auth: authMod.getAuth(app),
      db: fsMod.getFirestore(app),
      fs: fsMod,          // firestore functions (doc, setDoc, getDoc, …)
      authMod             // auth functions (signInWithEmailAndPassword, …)
    };
    return _fb;
  } catch (err) {
    throw new Error(`Could not connect to Firebase: ${err?.message || err}. Check your internet connection and the values in js/firebase-config.js.`);
  }
}

/** Returns the initialised Firebase bundle, or null if not started yet. */
export function fbCached() { return _fb; }
