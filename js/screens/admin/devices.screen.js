/**
 * devices.screen.js — Device registry. Shows this device (renameable) and,
 * in live mode, every device that has signed in — so administrators can see
 * which devices still have records waiting to sync. Full offline-activation
 * management (revoke a lost phone at sea) arrives in Phase 3.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, confirmDialog, updateSyncChips } from '../../core/ui.js';
import * as store from '../../core/store.js';
import { isFirebaseConfigured } from '../../firebase-config.js';
import { fbEnsure } from '../../core/firebase.service.js';
import { logout } from '../../core/auth.service.js';
import { logAction, AUDIT_ACTIONS } from '../../core/audit.service.js';
import { fmtDateTime } from '../../core/time.js';
import { go } from '../../core/router.js';

export async function render(root, ctx) {
  const body = `
    <div class="card" id="this-device-card"></div>
    <div class="card" id="all-devices-card"></div>
    <div class="card">
      <div class="card-title">${icon('info', 18)} About the device registry</div>
      <p style="margin:0">Every device that signs in is registered with a unique ID, its owner and its last-seen time.
      This is the foundation for two protections:</p>
      <ul style="margin:.6rem 0 0">
        <li><b>Offline activation (Phase 3):</b> a device that has signed in once keeps working offline; a lost or stolen device can be revoked so it stops syncing.</li>
        <li><b>Sync visibility:</b> administrators can see which devices still hold records waiting to upload.</li>
      </ul>
    </div>`;
  const content = renderAdminShell(root, ctx, { title: 'Devices', navKey: 'devices', body });

  const device = await store.getOrCreateLocalDevice();

  /* This device */
  content.querySelector('#this-device-card').innerHTML = `
    <div class="card-title">${icon('smartphone', 18)} This device</div>
    <div class="form-grid form-grid-2">
      <div class="field">
        <label class="field-label" for="device-name">Device name (shown in audit records)</label>
        <input class="input" id="device-name" value="${esc(device.name)}" maxlength="40">
      </div>
      <div class="field">
        <label class="field-label">Details</label>
        <div class="kv-list">
          <div class="kv"><span class="k">Type</span><span class="v">${esc(device.platform)}</span></div>
          <div class="kv"><span class="k">Registered</span><span class="v">${esc(fmtDateTime(device.registeredAt))}</span></div>
          <div class="kv"><span class="k">Last seen</span><span class="v">${esc(fmtDateTime(device.lastSeenAt))}</span></div>
          <div class="kv"><span class="k">Status</span><span class="v"><span class="badge ${device.status === 'revoked' ? 'badge-danger' : 'badge-success'}">${esc(device.status || 'active')}</span></span></div>
        </div>
      </div>
    </div>
    <div class="row">
      <button class="btn btn-accent btn-sm" id="save-device-name">${icon('check', 16)} Save name</button>
      <button class="btn btn-danger btn-sm" id="revoke-device">${icon('x', 16)} Revoke this device</button>
    </div>`;

  content.querySelector('#save-device-name').addEventListener('click', async () => {
    const name = content.querySelector('#device-name').value.trim();
    if (!name) { toast('Give the device a name first.', 'warn'); return; }
    await store.updateDevice({ ...device, name });
    await logAction(AUDIT_ACTIONS.DEVICE_RENAMED, `Device renamed to "${name}".`);
    toast('Device name saved.', 'success');
  });

  content.querySelector('#revoke-device').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Revoke this device?',
      message: 'Revoking marks this device as no longer trusted. You will be signed out immediately. (Full revocation enforcement arrives in Phase 3.)',
      confirmLabel: 'Revoke & sign out',
      danger: true
    });
    if (!ok) return;
    await store.updateDevice({ ...device, status: 'revoked' });
    await logAction(AUDIT_ACTIONS.DEVICE_REVOKED, `Device "${device.name}" (${device.platform}) revoked by its user.`);
    await logout();
    toast('Device revoked and signed out.', 'info');
    go('#/login');
  });

  /* All devices */
  let devices = await store.listDevices();
  let sourceNote = 'Source: this device only (demo mode). In live mode all registered devices appear here.';
  if (isFirebaseConfigured()) {
    try {
      const fb = await fbEnsure();
      const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, 'devices'));
      devices = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
      sourceNote = 'Source: Firebase device registry (all devices).';
    } catch (err) {
      toast('Could not read the device registry from Firebase. ' + (err?.message || ''), 'warn', 6000);
    }
  }
  content.querySelector('#all-devices-card').innerHTML = `
    <div class="card-title">${icon('database', 18)} Registered devices</div>
    <p class="card-sub">${esc(sourceNote)}</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Device</th><th>Type</th><th>Owner</th><th>Last seen</th><th>Status</th></tr></thead>
      <tbody>
        ${devices.length ? devices.map((d) => `
        <tr>
          <td class="cell-strong">${esc(d.name || d.deviceName || 'Unnamed')}<div class="text-xs text-muted mono">${esc(String(d.id).slice(0, 8))}…</div></td>
          <td class="text-small">${esc(d.platform || '—')}</td>
          <td class="text-small">${esc(d.ownerName || '—')}</td>
          <td class="text-small nowrap">${d.lastSeenAt ? esc(fmtDateTime(d.lastSeenAt)) : '—'}</td>
          <td>${d.status === 'revoked' ? '<span class="badge badge-danger">Revoked</span>' : '<span class="badge badge-success">Active</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="text-muted text-center">No devices registered yet.</td></tr>'}
      </tbody>
    </table></div>`;

  updateSyncChips();
}
