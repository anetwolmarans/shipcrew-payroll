/**
 * events.js — A tiny "radio station" for the app.
 * PLAIN ENGLISH: when something important happens (sync status changes, a new
 * audit entry), that code "broadcasts" it here, and any open screen that is
 * listening updates itself. Used events:
 *   'sync:status'   – connectivity/queue state changed
 *   'audit:new'     – a new audit entry was recorded
 *   'session:changed' – login/logout
 *   'tick'          – once a minute, for clocks
 */
const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}
export function off(name, fn) {
  listeners.get(name)?.delete(fn);
}
export function emit(name, data) {
  listeners.get(name)?.forEach(fn => {
    try { fn(data); } catch (err) { console.warn(`Listener error for "${name}":`, err); }
  });
}
