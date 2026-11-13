/**
 * layout.js — The admin dashboard frame: navy sidebar, top bar with sync
 * status, and the content area. Every admin screen renders inside this frame.
 * Menu items for future phases are shown with phase chips and open an
 * information screen (they are never fake buttons).
 */
import { icon, esc, avatarInitials, toast } from '../../core/ui.js';
import { canAny, CAPABILITIES } from '../../core/permissions.js';
import { logout, lock } from '../../core/auth.service.js';
import { isFirebaseConfigured } from '../../firebase-config.js';
import { APP } from '../../config.js';
import { go } from '../../core/router.js';

export const NAV = [
  {
    group: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', hash: '#/admin/dashboard', icon: 'home' }
    ]
  },
  {
    group: 'Operations',
    items: [
      { key: 'crew', label: 'Crew', hash: '#/admin/crew', icon: 'users' },
      { key: 'vessels', label: 'Vessels', hash: '#/admin/vessels', icon: 'ship' },
      { key: 'trips', label: 'Trips', hash: '#/admin/trips', icon: 'map' },
      { key: 'attendance', label: 'Attendance & Hours', hash: '#/admin/attendance', icon: 'clock' },
      { key: 'catch', label: 'Catch & Quota', hash: '#/admin/catch', icon: 'fish' }
    ]
  },
  {
    group: 'Payroll',
    items: [
      { key: 'payroll', label: 'Payroll Processing', hash: '#/admin/module/payroll', icon: 'coins', phase: 'P5' },
      { key: 'payslips', label: 'Payslips', hash: '#/admin/module/payslips', icon: 'file-text', phase: 'P5' },
      { key: 'reports', label: 'Reports & Exports', hash: '#/admin/module/reports', icon: 'download', phase: 'P6' }
    ]
  },
  {
    group: 'System',
    items: [
      { key: 'users', label: 'Users & Roles', hash: '#/admin/users', icon: 'user-check', caps: [CAPABILITIES.MANAGE_USERS, CAPABILITIES.VIEW_AUDIT] },
      { key: 'devices', label: 'Devices', hash: '#/admin/devices', icon: 'smartphone', caps: [CAPABILITIES.MANAGE_DEVICES, CAPABILITIES.VIEW_AUDIT] },
      { key: 'audit', label: 'Audit Log', hash: '#/admin/audit', icon: 'activity', caps: [CAPABILITIES.VIEW_AUDIT] },
      { key: 'statutory', label: 'Statutory Rules', hash: '#/admin/statutory', icon: 'book', caps: [CAPABILITIES.VIEW_STATUTORY_RULES] },
      { key: 'settings', label: 'Settings', hash: '#/admin/settings', icon: 'settings', caps: [CAPABILITIES.MANAGE_SETTINGS] },
      { key: 'roadmap', label: 'Roadmap', hash: '#/admin/roadmap', icon: 'flag' }
    ]
  }
];

function navItemVisible(item, role) {
  if (item.caps) return canAny(role, item.caps);
  return true; // dashboards, future-phase info screens and the roadmap are fine for all staff roles
}

export function renderAdminShell(root, ctx, { title, navKey, body }) {
  const session = ctx.session;
  const groups = NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => navItemVisible(i, session.role)) }))
    .filter((g) => g.items.length);

  root.innerHTML = `
  <div class="app-shell">
    <button class="scrim" id="nav-scrim" aria-label="Close menu"></button>
    <aside class="sidebar" id="sidebar" aria-label="Main menu">
      <div class="sidebar-head">
        <a class="sidebar-brand" href="#/admin/dashboard">
          <span class="brand-mark">${icon('anchor', 22)}</span>
          <span><span class="brand-name">ShipCrew Payroll</span><span class="brand-sub">Fishing fleet · Namibia</span></span>
        </a>
      </div>
      <div class="sidebar-user">
        <span class="avatar">${esc(avatarInitials(session.fullName))}</span>
        <span class="who">
          <span class="name">${esc(session.fullName)}</span>
          <span class="role">${esc(session.roleLabel)}</span>
        </span>
      </div>
      <nav>
        ${groups.map((g) => `
          <div class="nav-group">
            <div class="nav-group-label">${esc(g.group)}</div>
            ${g.items.map((item) => `
              <a class="nav-link ${item.key === navKey ? 'active' : ''}" href="${item.hash}">
                ${icon(item.icon, 18)}<span class="label">${esc(item.label)}</span>
                ${item.phase ? `<span class="phase-chip">${esc(item.phase)}</span>` : ''}
              </a>`).join('')}
          </div>`).join('')}
      </nav>
      <div class="sidebar-foot">
        ${isFirebaseConfigured() ? 'Connected to Firebase' : 'Demo mode — not connected'}<br>
        v${APP.version} · Phase ${APP.buildPhase}/${APP.totalPhases}
      </div>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <button class="icon-btn" id="nav-toggle" aria-label="Open menu">${icon('menu', 22)}</button>
        <h1 class="page-title">${esc(title)}</h1>
        <div class="spacer"></div>
        <span class="sync-chip" data-sync-chip>${icon('wifi', 14)}<span>…</span></span>
        <button class="icon-btn" id="topbar-lock" title="Lock now" aria-label="Lock now">${icon('lock', 20)}</button>
        <button class="icon-btn" id="topbar-logout" title="Sign out" aria-label="Sign out">${icon('logout', 20)}</button>
      </header>
      <main class="content" id="admin-content">${body}</main>
    </div>
  </div>`;

  const sidebar = root.querySelector('#sidebar');
  const scrim = root.querySelector('#nav-scrim');
  const closeDrawer = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };
  root.querySelector('#nav-toggle').addEventListener('click', () => {
    sidebar.classList.add('open'); scrim.classList.add('show');
  });
  scrim.addEventListener('click', closeDrawer);
  sidebar.querySelectorAll('.nav-link').forEach((a) => a.addEventListener('click', closeDrawer));

  root.querySelector('#topbar-lock').addEventListener('click', async () => {
    await lock('Locked with the "Lock now" button.');
    go('#/lock');
    toast('Locked. Unlock with your password or device PIN.', 'info');
  });

  root.querySelector('#topbar-logout').addEventListener('click', async () => {
    await logout();
    toast('Signed out.', 'info');
    go('#/login');
  });

  return root.querySelector('#admin-content');
}
