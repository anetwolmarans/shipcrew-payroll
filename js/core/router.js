/**
 * router.js — Decides which screen to show for the current address
 * (e.g. #/crew or #/admin/dashboard) and enforces the security rules:
 *  - no session → login screen
 *  - locked session → lock screen
 *  - crew members can never open admin screens (and vice versa)
 * The SAME rules are re-checked by Firebase on the server (see rules/firestore.rules).
 */
import { currentSession } from './auth.service.js';

import * as loginScreen from '../screens/login.screen.js';
import * as lockScreen from '../screens/lock.screen.js';
import * as crewHome from '../screens/crew/home.screen.js';
import * as dashboardScreen from '../screens/admin/dashboard.screen.js';
import * as usersScreen from '../screens/admin/users.screen.js';
import * as devicesScreen from '../screens/admin/devices.screen.js';
import * as auditScreen from '../screens/admin/audit.screen.js';
import * as settingsScreen from '../screens/admin/settings.screen.js';
import * as statutoryScreen from '../screens/admin/statutory.screen.js';
import * as roadmapScreen from '../screens/admin/roadmap.screen.js';
import * as moduleScreen from '../screens/admin/module.screen.js';
import * as crewScreen from '../screens/admin/crew.screen.js';
import * as vesselsScreen from '../screens/admin/vessels.screen.js';
import * as tripsScreen from '../screens/admin/trips.screen.js';
import * as attendanceScreen from '../screens/admin/attendance.screen.js';
import * as catchScreen from '../screens/admin/catch.screen.js';

export const ADMIN_ROLES = ['system_admin', 'payroll_admin', 'vessel_manager', 'supervisor', 'auditor'];

const ROUTES = [
  { path: '#/login', screen: loginScreen, public: true, title: 'Sign in' },
  { path: '#/lock', screen: lockScreen, public: true, title: 'Locked' },
  { path: '#/crew', screen: crewHome, roles: ['crew'], title: 'My Day' },
  { path: '#/admin/dashboard', screen: dashboardScreen, roles: ADMIN_ROLES, title: 'Dashboard' },
  { path: '#/admin/crew', screen: crewScreen, roles: ADMIN_ROLES, title: 'Crew' },
  { path: '#/admin/vessels', screen: vesselsScreen, roles: ADMIN_ROLES, title: 'Vessels' },
  { path: '#/admin/trips', screen: tripsScreen, roles: ADMIN_ROLES, title: 'Trips' },
  { path: '#/admin/attendance', screen: attendanceScreen, roles: ADMIN_ROLES, title: 'Attendance & Hours' },
  { path: '#/admin/catch', screen: catchScreen, roles: ADMIN_ROLES, title: 'Catch & Quota' },
  { path: '#/admin/users', screen: usersScreen, roles: ADMIN_ROLES, title: 'Users & Roles' },
  { path: '#/admin/devices', screen: devicesScreen, roles: ADMIN_ROLES, title: 'Devices' },
  { path: '#/admin/audit', screen: auditScreen, roles: ADMIN_ROLES, title: 'Audit Log' },
  { path: '#/admin/settings', screen: settingsScreen, roles: ADMIN_ROLES, title: 'Settings' },
  { path: '#/admin/statutory', screen: statutoryScreen, roles: ADMIN_ROLES, title: 'Statutory Rules' },
  { path: '#/admin/roadmap', screen: roadmapScreen, roles: ADMIN_ROLES, title: 'Roadmap' },
  { path: '#/admin/module/', screen: moduleScreen, roles: ADMIN_ROLES, prefix: true, title: 'Module' }
];

let _cleanup = null;
let _root = null;

export function go(hash) {
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

export function homeFor(session) {
  if (!session) return '#/login';
  return session.role === 'crew' ? '#/crew' : '#/admin/dashboard';
}

function findRoute(hash) {
  let route = ROUTES.find((r) => r.path === hash);
  if (!route) route = ROUTES.find((r) => r.prefix && hash.startsWith(r.path));
  return route;
}

export function handleRoute() {
  if (!_root) return;
  const hash = location.hash || '';
  const route = findRoute(hash);
  const session = currentSession();

  if (hash === '#/lock' && !session) { go('#/login'); return; }
  if (!route) { go(homeFor(session)); return; }

  if (route.public) {
    if (session && !session.locked) { go(homeFor(session)); return; }
  } else {
    if (!session) { go('#/login'); return; }
    if (session.locked) { go('#/lock'); return; }
    if (route.roles && !route.roles.includes(session.role)) { go(homeFor(session)); return; }
  }

  const params = route.prefix ? { key: hash.split('/').filter(Boolean).pop() } : {};
  document.title = `${route.title} — ShipCrew Payroll`;

  if (typeof _cleanup === 'function') { try { _cleanup(); } catch {} _cleanup = null; }
  _root.innerHTML = '';
  const ctx = { session, params, go, route };
  const maybeCleanup = route.screen.render(_root, ctx);
  if (typeof maybeCleanup === 'function') {
    _cleanup = maybeCleanup;
  } else if (maybeCleanup && typeof maybeCleanup.then === 'function') {
    // Async screens (e.g. crew home) resolve with their cleanup function.
    maybeCleanup
      .then((fn) => { if (typeof fn === 'function') _cleanup = fn; })
      .catch(() => {});
  } else {
    _cleanup = null;
  }
}

export function start() {
  _root = document.getElementById('app');
  _root.hidden = false;
  window.addEventListener('hashchange', handleRoute);
  if (!location.hash) go('#/login');
  else handleRoute();
}
