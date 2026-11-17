/**
 * dashboard.screen.js — Management overview: live fleet, catch, payroll and
 * system-health stats plus the latest activity. All figures come from the
 * local database; with Phase 6 every card shows real data (catch tonnage
 * this month, latest payroll net, open payslip queries).
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, fmtNAD, updateSyncChips, toast } from '../../core/ui.js';
import { getAll, STORES } from '../../core/idb.js';
import { state as syncState, syncReport, syncNow, retryFailedNow } from '../../core/sync.service.js';
import { isFirebaseConfigured, environmentName } from '../../firebase-config.js';
import { APP } from '../../config.js';
import { fmtDateTime, relativeTime } from '../../core/time.js';
import { can, CAPABILITIES } from '../../core/permissions.js';
import { getOrCreateDeviceRecord, pinEnabled } from '../../core/device.service.js';

export async function render(root, ctx) {
  const body = `
    <div class="banner banner-demo" id="mode-banner" style="margin-bottom:1rem"></div>
    <div class="stat-grid" id="stat-grid"></div>
    <div style="height:1rem"></div>
    <div class="card" id="getting-started-card"></div>
    <div class="card" id="status-card"></div>
    <div class="card" id="offline-card"></div>
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
  const [vessels, trips, crew, openClockEvents, sync, auditAll, catchRecords, runs, queries] = await Promise.all([
    getAll(STORES.VESSELS), getAll(STORES.TRIPS), getAll(STORES.CREW),
    getAll(STORES.CLOCK_EVENTS), syncState(), getAll(STORES.AUDIT_LOGS),
    getAll(STORES.CATCH_RECORDS), getAll(STORES.PAYROLL_CALCULATIONS), getAll(STORES.PAYSLIP_QUERIES)
  ]);

  /* This month in Windhoek time, e.g. '2026-11' — used for catch tonnage.
     Intl 'sv-SE' formats as YYYY-MM, which compares cleanly as a string. */
  const monthKeyFmt = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit' }).format(new Date(iso));
  const nowParts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
    .reduce((p, x) => { p[x.type] = x.value; return p; }, {});
  const monthKey = `${nowParts.year}-${nowParts.month}`;
  const monthName = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Windhoek', month: 'long', year: 'numeric' }).format(new Date());
  const monthCatchKg = catchRecords
    .filter(c => c.landedAt && monthKeyFmt(c.landedAt) === monthKey)
    .reduce((sum, c) => sum + (Number(c.weightKg) || 0), 0);

  /* Latest payroll run — locked runs are final; drafts are marked as such. */
  const latestRun = runs.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  const openQueries = queries.filter(q => q.status === 'open').length;

  const stats = [
    { label: 'Active vessels', icon: 'ship', value: vessels.filter(v => v.status === 'active').length, sub: 'From the vessel register' },
    { label: 'Trips at sea', icon: 'map', value: trips.filter(t => t.status === 'at_sea').length, sub: `${trips.length} trip${trips.length === 1 ? '' : 's'} in the register` },
    { label: 'Crew members', icon: 'users', value: crew.filter(c => c.employmentStatus === 'active').length, sub: `Active of ${crew.length} registered` },
    { label: 'Clocked in now', icon: 'clock', value: openClockEvents.filter(e => e.clockInAt && !e.clockOutAt).length, sub: 'Open clock events' },
    { label: `Catch — ${monthName}`, icon: 'fish', value: `${(monthCatchKg / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} t`, sub: `${monthCatchKg.toLocaleString('en', { maximumFractionDigits: 0 })} kg landed this month` },
    { label: 'Latest payroll', icon: 'coins', value: latestRun ? fmtNAD(latestRun.totals?.netCents ? latestRun.totals.netCents / 100 : 0) : fmtNAD(0), nad: true, sub: latestRun ? `${latestRun.tripRef} · ${latestRun.status === 'locked' ? 'approved & locked' : latestRun.status}` : 'No payroll run yet' },
    { label: 'Open payslip queries', icon: 'help', value: openQueries, sub: openQueries ? 'Answer them on the Payslip Queries screen' : 'All crew questions answered' },
    { label: 'Waiting to sync', icon: 'refresh', value: sync.pending, sub: sync.live ? 'Uploads automatically when online' : 'Sync starts once Firebase is connected' },
    { label: 'Audit entries', icon: 'activity', value: auditAll.length, sub: 'Every sensitive action is recorded' }
  ];
  content.querySelector('#stat-grid').innerHTML = stats.map((s) => `
    <div class="stat-card">
      <div class="stat-label">${icon(s.icon, 15)} ${esc(s.label)}</div>
      <div class="stat-value ${s.nad ? 'nad' : ''}">${esc(String(s.value))}</div>
      <div class="stat-sub">${esc(s.sub)}</div>
    </div>`).join('');

  /* Phase 6 finish line */
  content.querySelector('#getting-started-card').innerHTML = `
    <div class="card-title">${icon('flag', 18)} All six phases are built — your finish-line checklist</div>
    <div class="getting-started">
      <div class="gs-step done"><span class="num">1</span><div><div class="gs-title">Run your first report</div><div class="gs-desc"><b>Reports &amp; Exports</b> (left menu) — crew, trips, hours, catch, payroll, PAYE/SSC and the audit trail, each exportable as PDF, Excel and CSV. Full story: <span class="mono">docs/13-reports.md</span>.</div></div></div>
      <div class="gs-step"><span class="num">2</span><div><div class="gs-title">Do the production security review</div><div class="gs-desc">Work through <span class="mono">docs/14-security-review.md</span> before real payroll goes live — it ends with a sign-off table you keep on file.</div></div></div>
      <div class="gs-step"><span class="num">3</span><div><div class="gs-title">Keep devices and data safe</div><div class="gs-desc">Set PINs on every crew device (Devices screen), and take regular backups: <span class="mono">docs/05-backup-recovery.md</span>.</div></div></div>
      <div class="gs-step"><span class="num">4</span><div><div class="gs-title">Install the app on phones</div><div class="gs-desc">The app installs from the browser (install icon in the address bar) — or use the signed Android APK from <span class="mono">docs/08-android-apk.md</span>. No app store needed.</div></div></div>
      <div class="gs-step"><span class="num">5</span><div><div class="gs-title">Run the final checklist</div><div class="gs-desc">Phase 6 checks live in <span class="mono">docs/04-testing-guide.md</span> section Z — reports, exports, dashboard and sign-off.</div></div></div>
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

  /* Offline & synchronisation (Phase 3) */
  const [device, pinOn, report] = await Promise.all([
    getOrCreateDeviceRecord(), pinEnabled(), syncReport()
  ]);
  const devRevoked = device.status === 'revoked';
  content.querySelector('#offline-card').innerHTML = `
    <div class="card-title">${icon('wifi-off', 18)} Offline &amp; synchronisation
      ${can(ctx.session.role, CAPABILITIES.MANAGE_DEVICES) || can(ctx.session.role, CAPABILITIES.VIEW_AUDIT) ? `<a href="#/admin/devices" class="text-small" style="margin-left:auto">Open Devices</a>` : ''}</div>
    <div class="kv-list">
      <div class="kv"><span class="k">This device</span><span class="v">${esc(device.name)} <span class="badge ${devRevoked ? 'badge-danger' : 'badge-success'}">${devRevoked ? 'Revoked' : 'Active'}</span></span></div>
      <div class="kv"><span class="k">Offline device PIN</span><span class="v">${pinOn ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-neutral">Not set</span>'}</span></div>
      <div class="kv"><span class="k">Connection</span><span class="v">${report.online ? '<span class="status-dot status-ok">Online</span>' : '<span class="status-dot status-err">Offline — records still save</span>'}</span></div>
      <div class="kv"><span class="k">Waiting to sync</span><span class="v">${report.pending} record${report.pending === 1 ? '' : 's'}${report.live ? ' — upload automatic' : ' (demo mode: sync starts when Firebase is connected)'}</span></div>
      <div class="kv"><span class="k">Sync failed — kept</span><span class="v">${report.failedCount ? `<span class="badge badge-warning">${report.failedCount}</span>` : '0'}</span></div>
      <div class="kv"><span class="k">Synchronised so far</span><span class="v">${report.syncedTotal} upload${report.syncedTotal === 1 ? '' : 's'}</span></div>
      <div class="kv"><span class="k">Last successful sync</span><span class="v">${report.lastSyncAt ? esc(fmtDateTime(report.lastSyncAt)) : 'Not yet'}</span></div>
    </div>
    ${report.failedCount ? `
    <div class="table-wrap" style="margin-top:.8rem"><table class="table">
      <thead><tr><th>Record</th><th>Type</th><th>Attempts</th><th>Reason</th></tr></thead>
      <tbody>${report.failedSample.map((f) => `
        <tr><td class="mono text-xs">${esc(String(f.id).slice(0, 8))}…</td><td class="text-small">${esc(f.type)}</td><td class="text-small">${esc(String(f.attempts))}</td><td class="text-small">${esc(f.error || '')}</td></tr>`).join('')}
      </tbody>
    </table></div>
    <p class="text-xs text-muted" style="margin:.5rem 0 0">"Failed — kept" records are safe on this device and are retried automatically; nothing is lost or deleted.</p>` : ''}
    <div class="row" style="margin-top:.9rem">
      <button class="btn btn-accent btn-sm" id="dash-sync-now">${icon('refresh', 16)} Sync now</button>
      ${report.failedCount ? `<button class="btn btn-outline btn-sm" id="dash-retry-failed">${icon('upload', 16)} Retry failed</button>` : ''}
    </div>
    <p class="text-xs text-muted" style="margin:.6rem 0 0">Conflicts are safe by design: if the cloud holds a newer version of a record, this device adopts it and the event is written to the audit log.</p>`;
  content.querySelector('#dash-sync-now').addEventListener('click', async () => {
    try {
      const res = await syncNow();
      toast(res.synced ? `Synchronised ${res.synced} record${res.synced === 1 ? '' : 's'}.` : 'Nothing waiting to sync — all clear.', 'success');
    } catch (err) {
      toast(err?.message || 'Sync could not run.', 'warn', 6000);
    }
  });
  content.querySelector('#dash-retry-failed')?.addEventListener('click', async () => {
    try {
      const res = await retryFailedNow();
      toast(`Retry finished — ${res.synced} uploaded${res.failed ? `, ${res.failed} still failing (kept)` : ''}.`, res.failed ? 'warn' : 'success', 6000);
    } catch (err) {
      toast(err?.message || 'Retry could not run.', 'warn', 6000);
    }
  });

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
