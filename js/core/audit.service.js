/**
 * audit.service.js — Writes the audit trail ("who did what, when").
 * Every sensitive action (logins, settings changes, resets) is recorded:
 *   - on this device immediately (IndexedDB), and
 *   - queued for upload to Firestore so administrators see it centrally.
 * Audit entries can never be edited or deleted from the app.
 */
import { get, put, STORES } from './idb.js';
import { nowISO } from './time.js';
import { emit } from './events.js';
import { uuid } from './security.js';
import { queueForSync } from './sync.service.js';

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_COOLDOWN: 'login_cooldown',
  LOGOUT: 'logout',
  SESSION_RESTORED: 'session_restored',
  LOCK_TRIGGERED: 'lock_triggered',
  UNLOCK_SUCCESS: 'unlock_success',
  UNLOCK_FAILED: 'unlock_failed',
  SETTINGS_CHANGED: 'settings_changed',
  DATA_EXPORTED: 'data_exported',
  DEMO_RESET: 'demo_reset',
  DEVICE_REGISTERED: 'device_registered',
  DEVICE_REVOKED: 'device_revoked',
  DEVICE_RENAMED: 'device_renamed',
  DEVICE_REINSTATED: 'device_reinstated',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_CONFLICT: 'sync_conflict',
  /* ---- Phase 3: device activation, PIN, revocation ---- */
  DEVICE_PIN_SET: 'device_pin_set',
  DEVICE_PIN_CHANGED: 'device_pin_changed',
  DEVICE_PIN_REMOVED: 'device_pin_removed',
  PIN_UNLOCK_SUCCESS: 'pin_unlock_success',
  PIN_UNLOCK_FAILED: 'pin_unlock_failed',
  PIN_LOCKOUT: 'pin_lockout',
  /* ---- Phase 2: Crew & Operations ---- */
  CREW_CREATED: 'crew_created',
  CREW_UPDATED: 'crew_updated',
  CREW_STATUS_CHANGED: 'crew_status_changed',
  BANKING_SAVED: 'banking_saved',
  VESSEL_CREATED: 'vessel_created',
  VESSEL_UPDATED: 'vessel_updated',
  TRIP_CREATED: 'trip_created',
  TRIP_UPDATED: 'trip_updated',
  TRIP_STATUS_CHANGED: 'trip_status_changed',
  TRIP_DELETED: 'trip_deleted',
  ASSIGNMENT_ADDED: 'assignment_added',
  ASSIGNMENT_ENDED: 'assignment_ended',
  CLOCK_IN: 'clock_in',
  CLOCK_OUT: 'clock_out',
  CLOCK_IN_BLOCKED: 'clock_in_blocked',
  CLOCK_OUT_BLOCKED: 'clock_out_blocked',
  USER_CREATED: 'user_created',
  USER_ROLE_CHANGED: 'user_role_changed',
  USER_DISABLED: 'user_disabled',
  USER_ENABLED: 'user_enabled',
  USER_PASSWORD_RESET: 'user_password_reset'
};

export async function logAction(action, details = '') {
  const session = await get(STORES.SESSIONS, 'current');
  const record = {
    id: uuid(),
    at: nowISO(),                                   // stored in UTC
    action,
    details: String(details || ''),
    actorId: session?.userId || 'anonymous',
    actorName: session?.fullName || 'Unknown user',
    actorRole: session?.role || '-',
    deviceName: session?.deviceName || '-',
    syncStatus: 'saved locally'                    // saved locally → waiting → synchronised / failed-kept
  };
  await put(STORES.AUDIT_LOGS, record);
  emit('audit:new', record);
  // Upload to the central database when connected. Never blocks the user's action.
  queueForSync(record).catch(err => console.warn('Audit queue error:', err?.message || err));
  return record;
}
