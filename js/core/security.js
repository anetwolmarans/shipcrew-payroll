/**
 * security.js — Password hashing helpers.
 * PLAIN ENGLISH: we never store passwords as readable text. Instead we store
 * a "hash" (a one-way fingerprint). When someone logs in, we hash what they
 * typed and compare fingerprints. Uses PBKDF2 with 210,000 rounds and a
 * random "salt" per password, as recommended for web apps.
 */

const ITERATIONS = 210000;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password, saltHex, iterations) {
  if (!crypto || !crypto.subtle) {
    throw new Error('Secure password storage (WebCrypto) needs HTTPS or localhost. Open the app through the start script or your website address.');
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
    key, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

/** Create a storable password record { algo, iterations, salt, hash }. */
export async function makePasswordRecord(password) {
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return { algo: 'PBKDF2-SHA256', iterations: ITERATIONS, salt, hash };
}

/** Check a typed password against a stored record. */
export async function verifyPassword(password, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  try {
    const hash = await pbkdf2(password, rec.salt, rec.iterations || ITERATIONS);
    // Constant-time-ish comparison
    if (hash.length !== rec.hash.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ rec.hash.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}
