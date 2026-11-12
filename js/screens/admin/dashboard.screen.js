/**
 * dashboard.screen.js — Management overview: fleet stats, system health and
 * the latest activity. Stat cards show live counts from the local database;
 * they fill up as modules arrive in Phases 2–6.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, fmtNAD, updateSyncChips } from '../../core/ui.js';
import { getAll, STORES } from '../../core/idb.js';
import { state as syncState } from '../../core/sync.service.js';
import { isFirebaseConfigured, environmentName } from '../../firebase-config.js';
import { APP } from '../../config.js';
import { fmtDateTime, relativeTime } from '../../core/time.js';

export async function render(root, ctx) {
  const body = `
    <div class="banner banner-demo" id="mode-banner" style="margin-bottom:1rem"></div>
    <div class="stat-grid" id="stat-grid"></div>
    <div style="height:1rem"></div>
    <div class="card" id="getting-started-card"></div>
    <div class="card" id="status-card"></div>
    <div class="card" id="activity-card"></div>
  `;
  const content = renderAdminShell(root, ctx, { title: 'Dashboard', navKey: 'dashboard', body });
  const session = ctx.session;

  /* Mode banner */
  const banner = content.querySelector('#mode-banner');
  if (!isFirebaseConfigured()) {
    banner.innerHTML = `${icon('alert', 18)}<div><b>Demo mode.</b> You are viewing clearly-marked demo data on this device only.
      To go live: <b>docs/01-firebase-setup.md</b> (about 20 minutes, click by click).</div>`;
  } else {
    banner.className = 'banner banner-success';
    banner.innerHTML = `${icon('check-circle', 18)}<div><b>${esc(environmentName())} environment connected.</b> Shared records synchronise through Firebase.</div>`;
  }

  /* Stat cards */
  const [vessels, trips, crew, openClockEvents, sync, auditAll] = await Promise.all([
    getAll(STORES.VESSELS), getAll(STORES.TRIPS), getAll(STORES.CREW),
    getAll(STORES.CLOCK_EVENTS), syncState(), getAll(STORES.AUDIT_LOGS)
  ]);
  const stats = [
    { label: 'Active vessels', icon: 'ship', value: vessels.filter(v => v.status === 'active').length, sub: 'From the vessel register' },
    { label: 'Trips at sea', icon: 'map', value: trips.filter(t => t.status === 'at_sea').length, sub: `${trips.length} trip${trips.length === 1 ? '' : 's'} in the register` },
    { label: 'Crew members', icon: 'users', value: crew.filter(c => c.employmentStatus === 'active').length, sub: `Active of ${crew.length} registered` },
    { label: 'Clocked in now', icon: 'clock', value: openClockEvents.filter(e => e.clockInAt && !e.clockOutAt).length, sub: 'Open clock events' },
    { label: 'Pending approvals', icon: 'user-check', value: 0, sub: 'Attendance review arrives in Phase 4' },
    { label: 'Waiting to sync', icon: 'refresh', value: sync.pending, sub: sync.live ? 'Uploads automatically when online' : 'Sync starts once Firebase is connected' },
    { label: 'Payroll this period', icon: 'coins', value: fmtNAD(0), nad: true, sub: 'Payroll calculation arrives in Phase 5' },
    { label: 'Audit entries', icon: 'activity', value: auditAll.length, sub: 'Every sensitive action is recorded' }
  ];
  content.querySelector('#stat-grid').innerHTML = stats.map((s) => `
    <div class="stat-card">
      <div class="stat-label">${icon(s.icon, 15)} ${esc(s.label)}</div>
      <div class="stat-value ${s.nad ? 'nad' : ''}">${esc(String(s.value))}</div>
      <div class="stat-sub">${esc(s.sub)}</div>
    </div>`).join('');

  /* Getting started */
  content.querySelector('#getting-started-card').innerHTML = `
    <div class="card-title">${icon('flag', 18)} Getting started (Phase 2)</div>
    <div class="getting-started">
      <div class="gs-step done"><span class="num">1</span><div><div class="gs-title">Registers are live</div><div class="gs-desc">Crew, Vessels and Trips are real modules now — try adding a crew member or planning a trip.</div></div></div>
      <div class="gs-step"><span class="num">2</span><div><div class="gs-title">Watch the clock flow</div><div class="gs-desc">Sign in as Frans (crew) on this trip TRP-2026-014 — CLOCK IN, then CLOCK OUT. Then try Selma: she is not assigned, so clocking is blocked (by design).</div></div></div>
      <div class="gs-step"><span class="num">3</span><div><div class="gs-title">Manage users in-app</div><div class="gs-desc">Users &amp; Roles now creates logins, changes roles and resets passwords without the console.</div></div></div>
      <div class="gs-step"><span class="num">4</span><div><div class="gs-title">Run the Phase 2 checklist</div><div class="gs-desc">Work through <span class="mono">docs/04-testing-guide.md</span> sections H–M. When every box ticks, Phase 3 (offline sync with device PINs) begins.</div></div></div>
      <div class="gs-step"><span class="num">5</span><div><div class="gs-title">Connect Firebase when ready</div><div class="gs-desc">Follow <span class="mono">docs/01-firebase-setup.md</span> — the registers then synchronise across all your devices.</div></div></div>
    </div>`;

  /* System status */
  let persisted = null;
  try { persisted = await navigator.storage?.persisted?.(); } catch {}
  const swActive = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  content.querySelector('#status-card').innerHTML = `
    <div class="card-title">${icon('shield-check', 18)} System status</div>
    <div class="kv-list">
      <div class="kv"><span class="k">Environment</span><span class="v">${isFirebaseConfigured() ? esc(environmentName()) : 'Demo mode'}</span></div>
      <div class="kv"><span class="k">Firebase</span><span class="v">${isFirebaseConfigured() ? '<span class="status-dot status-ok">Connected</span>' : '<span class="status-dot status-idle">Not connected</span>'}</span></div>
      <div class="kv"><span class="k">Internet</span><span class="v">${sync.online ? '<span class="status-dot status-ok">Online</span>' : '<span class="status-dot status-err">Offline — records still save</span>'}</span></div>
      <div class="kv"><span class="k">Last successful sync</span><span class="v">${sync.lastSyncAt ? esc(fmtDateTime(sync.lastSyncAt)) : 'Not yet'}</span></div>
      <div class="kv"><span class="k">Offline mode (service worker)</span><span class="v">${swActive ? '<span class="status-dot status-ok">Active</span>' : '<span class="status-dot status-warn">Warming up (reload once)</span>'}</span></div>
      <div class="kv"><span class="k">Storage protection</span><span class="v">${persisted ? '<span class="status-dot status-ok">Persistent</span>' : '<span class="status-dot status-warn">Standard</span>'}</span></div>
      <div class="kv"><span class="k">App version</span><span class="v">v${APP.version} — Phase ${APP.buildPhase} of ${APP.totalPhases}</span></div>
    </div>`;

  /* Recent activity */
  const audit = auditAll.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
  content.querySelector('#activity-card').innerHTML = `
    <div class="card-title">${icon('activity', 18)} Recent activity
      <a href="#/admin/audit" class="text-small" style="margin-left:auto">View all</a></div>
    ${audit.length ? `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>Status</th></tr></thead>
      <tbody>
        ${audit.map((a) => `
        <tr>
          <td class="nowrap">${esc(fmtDateTime(a.at))}<div class="text-xs text-muted">${esc(relativeTime(a.at))}</div></td>
          <td class="cell-strong">${esc(a.actorName)}</td>
          <td><span class="badge badge-navy">${esc(a.action)}</span></td>
          <td class="text-small">${esc(a.details)}</td>
          <td><span class="badge ${a.syncStatus === 'synchronised' ? 'badge-success' : 'badge-neutral'}">${esc(a.syncStatus)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : `
    <div class="empty-state">${icon('activity', 30)}<div class="title">No activity yet</div><p>Sign-ins, settings changes and other sensitive actions will appear here automatically.</p></div>`}
  `;
  updateSyncChips();
}
