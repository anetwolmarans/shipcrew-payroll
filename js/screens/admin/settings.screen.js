/**
 * settings.screen.js — Company profile, security, synchronisation and data
 * tools. Everything you change here is saved on this device immediately and
 * recorded in the audit log; in live mode company details also go to Firebase.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, confirmDialog, downloadFile, updateSyncChips } from '../../core/ui.js';
import * as store from '../../core/store.js';
import { logAction, AUDIT_ACTIONS } from '../../core/audit.service.js';
import { syncNow, state as syncState } from '../../core/sync.service.js';
import { isFirebaseConfigured, environmentName, ACTIVE_ENV } from '../../firebase-config.js';
import { getAll, STORES } from '../../core/idb.js';
import { fmtDateTime } from '../../core/time.js';
import { APP } from '../../config.js';

export async function render(root, ctx) {
  const settings = await store.getSettings();
  const company = await store.getCompany();
  const sync = await syncState();

  const body = `
    <div class="card">
      <div class="card-title">${icon('ship', 18)} Company profile</div>
      <p class="card-sub">Shown on payslips and reports (payslips arrive in Phase 5).</p>
      <form id="company-form">
        <div class="form-grid form-grid-2">
          <div class="field">
            <label class="field-label" for="company-name">Company name</label>
            <input class="input" id="company-name" value="${esc(company?.name || '')}" maxlength="80" required>
          </div>
          <div class="field">
            <label class="field-label" for="company-phone">Phone</label>
            <input class="input" id="company-phone" value="${esc(company?.phone || '')}" maxlength="30">
          </div>
          <div class="field">
            <label class="field-label" for="company-address">Address</label>
            <input class="input" id="company-address" value="${esc(company?.address || '')}" maxlength="120">
          </div>
          <div class="field">
            <label class="field-label" for="company-email">Payroll email</label>
            <input class="input" id="company-email" type="email" value="${esc(company?.email || '')}" maxlength="80">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">${icon('check', 16)} Save company profile</button>
      </form>
    </div>

    <div class="card">
      <div class="card-title">${icon('lock', 18)} Security</div>
      <form id="security-form">
        <div class="form-grid form-grid-2">
          <div class="field">
            <label class="field-label" for="autolock">Auto-lock after inactivity (minutes)</label>
            <input class="input" id="autolock" type="number" min="1" max="240" value="${esc(settings.autoLockMinutes)}">
            <p class="field-hint">Protects shared devices: after this idle time the app locks and asks for the password again.</p>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">${icon('check', 16)} Save security settings</button>
      </form>
    </div>

    <div class="card">
      <div class="card-title">${icon('refresh', 18)} Synchronisation</div>
      <div class="kv-list" id="sync-kv">
        <div class="kv"><span class="k">Internet</span><span class="v">${sync.online ? '<span class="status-dot status-ok">Online</span>' : '<span class="status-dot status-err">Offline</span>'}</span></div>
        <div class="kv"><span class="k">Environment</span><span class="v">${esc(environmentName())}</span></div>
        <div class="kv"><span class="k">Last successful sync</span><span class="v">${sync.lastSyncAt ? esc(fmtDateTime(sync.lastSyncAt)) : 'Not yet'}</span></div>
        <div class="kv"><span class="k">Records waiting to upload</span><span class="v">${sync.pending}</span></div>
      </div>
      <div class="row" style="margin-top:.9rem">
        <button class="btn btn-accent btn-sm" id="sync-now">${icon('upload', 16)} Sync now</button>
      </div>
      <p class="text-xs text-muted" style="margin:.8rem 0 0">In demo mode records stay on this device — connect Firebase (docs/01-firebase-setup.md) to enable central synchronisation.</p>
    </div>

    <div class="card">
      <div class="card-title">${icon('database', 18)} Data tools</div>
      <p class="card-sub">Back up what is on this device, or reset the demo data to a clean state.</p>
      <div class="row">
        <button class="btn btn-outline btn-sm" id="export-data">${icon('download', 16)} Export this device's data (JSON)</button>
        <button class="btn btn-danger btn-sm" id="reset-demo">${icon('trash', 16)} Reset demo data</button>
      </div>
      <p class="text-xs text-muted" style="margin:.8rem 0 0" id="storage-note"></p>
    </div>

    <div class="card">
      <div class="card-title">${icon('info', 18)} About</div>
      <div class="kv-list">
        <div class="kv"><span class="k">App version</span><span class="v">v${APP.version} — Phase ${APP.buildPhase} of ${APP.totalPhases}</span></div>
        <div class="kv"><span class="k">Environment</span><span class="v">${esc(environmentName())} (${esc(ACTIVE_ENV)})</span></div>
        <div class="kv"><span class="k">Firebase</span><span class="v">${isFirebaseConfigured() ? 'Connected' : 'Not connected'}</span></div>
        <div class="kv"><span class="k">Currency / time zone</span><span class="v">${esc(APP.currency)} · Africa/Windhoek (stored in UTC)</span></div>
      </div>
      <p class="text-small" style="margin:.9rem 0 0">Guides in the project folder:
      <span class="mono">README.md</span> (start here),
      <span class="mono">docs/01-firebase-setup.md</span>,
      <span class="mono">docs/03-deployment-cloudflare.md</span>,
      <span class="mono">docs/04-testing-guide.md</span>,
      <span class="mono">docs/05-backup-recovery.md</span>,
      <span class="mono">docs/07-github-code-backup.md</span>,
      <span class="mono">docs/08-android-apk.md</span>,
      <span class="mono">docs/09-deployment-github-pages.md</span>,
      <span class="mono">docs/10-devices-pin-sync.md</span>.</p>
    </div>`;

  const content = renderAdminShell(root, ctx, { title: 'Settings', navKey: 'settings', body });

  /* Company profile */
  content.querySelector('#company-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = {
      name: content.querySelector('#company-name').value.trim(),
      phone: content.querySelector('#company-phone').value.trim(),
      address: content.querySelector('#company-address').value.trim(),
      email: content.querySelector('#company-email').value.trim()
    };
    if (!patch.name) { toast('Company name cannot be empty.', 'warn'); return; }
    await store.saveCompany(patch);
    await store.saveSettings({ companyName: patch.name, companyPhone: patch.phone, companyAddress: patch.address, companyEmail: patch.email });
    await logAction(AUDIT_ACTIONS.SETTINGS_CHANGED, `Company profile updated: "${patch.name}".`);
    toast('Company profile saved.', 'success');
  });

  /* Security */
  content.querySelector('#security-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mins = parseInt(content.querySelector('#autolock').value, 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 240) { toast('Auto-lock must be between 1 and 240 minutes.', 'warn'); return; }
    await store.saveSettings({ autoLockMinutes: mins });
    await logAction(AUDIT_ACTIONS.SETTINGS_CHANGED, `Auto-lock set to ${mins} minutes.`);
    toast('Security settings saved.', 'success');
  });

  /* Sync now */
  content.querySelector('#sync-now').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${icon('refresh', 16)} Syncing…`;
    try {
      const result = await syncNow();
      toast(result.synced > 0 ? `Uploaded ${result.synced} record${result.synced === 1 ? '' : 's'} to Firebase.` : 'Nothing waiting — everything is already uploaded.', 'success');
    } catch (err) {
      toast(err?.message || 'Sync failed. Records are kept and retried automatically.', 'warn', 6000);
    }
    btn.disabled = false;
    btn.innerHTML = `${icon('upload', 16)} Sync now`;
    updateSyncChips();
  });

  /* Export data (never includes password hashes) */
  content.querySelector('#export-data').addEventListener('click', async () => {
    const dump = {};
    for (const name of Object.values(STORES)) {
      if (name === STORES.SESSIONS) continue;
      dump[name] = await getAll(name);
    }
    const safe = JSON.stringify({ exportedAt: new Date().toISOString(), app: APP.version, data: dump },
      (key, value) => (key === 'password' ? '[removed]' : value), 2);
    downloadFile(`shipcrew-data-${new Date().toISOString().slice(0, 10)}.json`, safe, 'application/json');
    await logAction(AUDIT_ACTIONS.DATA_EXPORTED, 'Local data exported as JSON (passwords excluded).');
    toast('Data exported. Keep the file somewhere safe.', 'success');
  });

  /* Reset demo data */
  content.querySelector('#reset-demo').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset demo data?',
      message: 'This deletes everything on this device (including sign-ins and audit entries) and recreates the demo accounts. You will be signed out. This cannot be undone.',
      confirmLabel: 'Delete & reset',
      danger: true
    });
    if (!ok) return;
    await logAction(AUDIT_ACTIONS.DEMO_RESET, 'Demo data reset requested.');
    await store.resetDemoData();
    toast('Demo data reset. Reloading…', 'success');
    setTimeout(() => { location.hash = '#/login'; location.reload(); }, 900);
  });

  /* Storage estimate */
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      const used = (est.usage / 1048576).toFixed(1);
      const quota = (est.quota / 1048576).toFixed(0);
      content.querySelector('#storage-note').textContent = `This device is using about ${used} MB of ${quota} MB available for the app.`;
    }
  } catch {}

  updateSyncChips();
}
