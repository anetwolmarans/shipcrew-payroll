/**
 * firebase-config.js — Connection details for YOUR Firebase project.
 * ---------------------------------------------------------------------------
 * PLAIN-ENGLISH GUIDE
 *
 * Firebase is Google's online service that stores your shared data (logins,
 * crew records, payroll) in one central place in the cloud.
 *
 * Until you fill this in, the app runs in DEMO MODE: everything works on the
 * device only, with clearly-marked demo accounts. Demo mode is for trying the
 * app — never put real employee data in demo mode.
 *
 * HOW TO CONNECT FIREBASE (full click-by-click guide: docs/01-firebase-setup.md)
 *   1. Create a free project at https://console.firebase.google.com
 *   2. Turn on Authentication (Email/Password) and Cloud Firestore
 *   3. In Project Settings → Your apps → Web app, copy the config values
 *   4. Paste them under "test" (and later "prod") below
 *   5. Change ACTIVE_ENV from 'demo' to 'test'
 *   6. Reload the app — the DEMO banner disappears and real logins work
 *
 * CURRENT STATE (updated when the Firebase project was connected):
 *   - The "test" block holds YOUR project (shipcrew-payroll-test) — already pasted.
 *   - ACTIVE_ENV is already set to 'test', so the app connects to it automatically.
 *   - Training tip: add "?env=demo" to the address bar to force demo mode any time.
 *
 * KEEP TEST AND PRODUCTION SEPARATE (required):
 *   - "test"  = your testing Firebase project + your testing website
 *   - "prod"  = your live Firebase project + your live website
 *   Never point a production website at the test database, or the other way round.
 * ---------------------------------------------------------------------------
 */

export const ACTIVE_ENV = 'test'; // 'demo' | 'test' | 'prod'

export const FIREBASE_ENVS = {
  /** demo = no Firebase connection. The app runs locally with demo accounts. */
  demo: null,

  /** TESTING environment — everyday testing with fake data. */
  test: {
    apiKey: 'AIzaSyBHMMxjzG4jIe7d41AG-n2crY8ZL3YcRJs',
    authDomain: 'shipcrew-payroll-test.firebaseapp.com',
    projectId: 'shipcrew-payroll-test',
    storageBucket: 'shipcrew-payroll-test.firebasestorage.app',
    messagingSenderId: '66582565213',
    appId: '1:66582565213:web:287e7348824e96a2a698b4'
  },

  /** PRODUCTION environment — real company data. Configure only when ready. */
  prod: {
    apiKey: 'YOUR_PROD_API_KEY',
    authDomain: 'YOUR_PROD_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROD_PROJECT',
    storageBucket: 'YOUR_PROD_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_PROD_SENDER_ID',
    appId: 'YOUR_PROD_APP_ID'
  }
};

/** True if the chosen config still contains placeholder values. */
function isPlaceholder(cfg) {
  return !cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('YOUR_');
}

/**
 * Training/testing trick: opening the app with "?env=demo" in the address bar
 * forces demo mode EVEN when Firebase is connected (e.g. ?env=demo at the end
 * of the URL). Nothing real can be touched in demo mode — handy for showing
 * the system to colleagues without touching any real records.
 */
function urlForcesDemo() {
  try {
    return typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('env') === 'demo';
  } catch { return false; }
}

/**
 * Returns the Firebase config object for the active environment,
 * or null when the app should run in demo mode.
 */
export function getFirebaseConfig() {
  if (typeof window === 'undefined') return null;
  if (urlForcesDemo()) return null;   // ?env=demo always wins — safe, demo only
  const cfg = FIREBASE_ENVS[ACTIVE_ENV];
  if (ACTIVE_ENV === 'demo' || isPlaceholder(cfg)) return null;
  return cfg;
}

/** True when a real Firebase project is connected (test or prod). */
export function isFirebaseConfigured() {
  return getFirebaseConfig() !== null;
}

/** Human-readable name of the current environment. */
export function environmentName() {
  if (!isFirebaseConfigured()) {
    return urlForcesDemo()
      ? 'Demo mode (forced by "?env=demo" in the address bar)'
      : 'Demo mode (no Firebase connected)';
  }
  return ACTIVE_ENV === 'prod' ? 'Production' : 'Test';
}
