/**
 * devices.screen.js — Phase 3: the full device registry.
 *
 *  - THIS DEVICE: rename, set/change/remove the offline device PIN, and
 *    revoke this device. If this device is revoked, an administrator sees
 *    the Reinstate button here.
 *  - ALL DEVICES: in live mode, every device that signed in (from the
 *    Firebase registry); in demo mode, this device only. Administrators can
 *    revoke a lost phone or reinstate a device from here.
 *
 * The device PIN is stored HASHED on this device only — it never uploads.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, confirmDialog, openModal, updateSyncChips } from '../../core/ui.js';
import * as store from '../../core/store.js';
import { isFirebaseConfigured } from '../../firebase-config.js';
import { fbEnsure } from '../../core/firebase.service.js';
import { logout, currentSession } from '../../core/auth.service.js';
import { logAction, AUDIT_ACTIONS } from '../../core/audit.service.js';
import { fmtDateTime } from '../../core/time.js';
import { can, CAPABILITIES } from '../../core/permissions.js';
import { go } from '../../core/router.js';
import {
  setPin, removePin, pinEnabled,
  revokeDevice, reinstateDevice, getOrCreateDeviceRecord
} from '../../core/device.service.js';

export async function render(root, ctx) {
  const body = `
    <div class="card" id="this-device-card"></div>
    <div class="card" id="all-devices-card"></div>
    <div class="card">
      <div class="card-title">${icon('info', 18)} About the device registry</div>
      <p style="margin:0">Every device that signs in is registered with a unique ID, its owner and its last-seen time. The registry powers two protections:</p>
      <ul style="margin:.6rem 0 0">
        <li><b>Offline activation with a device PIN:</b> a quick 4–8 digit PIN that unlocks the app on THIS device without internet — that is how crew unlock at sea. The PIN is hashed and stored on the device only; it never uploads.</li>
        <li><b>Revocation:</b> a lost or stolen phone can be revoked so it cannot sign in or sync. An administrator can reinstate it later. Records already on a revoked device stay safe on that device.</li>
      </ul>
      <p class="text-xs text-muted" style="margin:.7rem 0 0">Sync engine: uploads are automatic and duplicate-proof by design; if the cloud holds a newer version of a record, this device adopts it and the conflict is written to the audit log — nothing is ever lost or silently overwritten.</p>
    </div>`;
  const content = renderAdminShell(root, ctx, { title: 'Devices', navKey: 'devices', body });

  const session = currentSession();
  const isAdmin = can(session.role, CAPABILITIES.MANAGE_DEVICES);
  const device = await getOrCreateDeviceRecord();
  const revoked = device.status === 'revoked';

  function pinModal(mode) {
    // mode: 'set' | 'change' | 'remove'
    const fields = mode === 'remove'
      ? `<div class="field"><label class="field-label" for="pin-current">Current PIN</label>
           <input class="input" id="pin-current" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••"></div>`
      : `${mode === 'change' ? `<div class="field"><label class="field-label" for="pin-current">Current PIN</label>
           <input class="input" id="pin-current" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••"></div>` : ''}
         <div class="field"><label class="field-label" for="pin-new">New PIN (4–8 digits)</label>
           <input class="input" id="pin-new" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="e.g. 2468"></div>
         <div class="field"><label class="field-label" for="pin-repeat">Repeat the new PIN</label>
           <input class="input" id="pin-repeat" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••"></div>
         <p class="text-xs text-muted" style="margin:.4rem 0 0">The PIN unlocks THIS device only, works without internet, and is stored hashed on the device — never uploaded.</p>`;
    openModal({
      title: mode === 'set' ? 'Set up the device PIN' : mode === 'change' ? 'Change the device PIN' : 'Remove the device PIN',
      icon: 'key',
      body: fields,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: mode === 'remove' ? 'Remove PIN' : 'Save PIN',
          kind: mode === 'remove' ? 'btn-danger' : 'btn-primary',
          onClick: async (overlay) => {
            const current = overlay.querySelector('#pin-current')?.value || null;
            const newPin = overlay.querySelector('#pin-new')?.value || null;
            const repeat = overlay.querySelector('#pin-repeat')?.value || null;
            try {
              if (mode === 'remove') {
                await removePin(current);
                toast('Device PIN removed. Password unlock only.', 'success');
              } else {
                if (newPin !== repeat) { toast('The two new PINs do not match.', 'warn'); return true; }
                await setPin(newPin, current);
                toast(mode === 'set' ? 'Device PIN set — this device can now be unlocked offline.' : 'Device PIN changed.', 'success');
              }
              paint();
            } catch (err) {
              toast(err?.message || 'Could not save the PIN.', 'error', 6000);
              return true;
            }
          }
        }
      ]
    });
  }

  /* ---------- This device card ---------- */
  const pin = await pinEnabled();
  content.querySelector('#this-device-card').innerHTML = `
    ${revoked ? `<div class="banner banner-danger" style="margin:0 0 1rem">${icon('alert', 18)}<div>
      <b>This device is revoked.</b> ${esc(device.revokedReason || 'Revoked by an administrator')} — sign-in is blocked for normal users and synchronisation is stopped.
      Records on this device stay safe. ${isAdmin ? 'You can reinstate it below.' : ''}</div></div>` : ''}
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
          <div class="kv"><span class="k">Status</span><span class="v"><span class="badge ${revoked ? 'badge-danger' : 'badge-success'}">${esc(device.status || 'active')}</span></span></div>
          ${revoked ? `<div class="kv"><span class="k">Revoked</span><span class="v">${esc(fmtDateTime(device.revokedAt))} by ${esc(device.revokedBy || '—')}</span></div>` : ''}
        </div>
      </div>
    </div>
    <div class="card-title" style="margin-top:1.2rem">${icon('key', 18)} Offline device PIN (Phase 3)</div>
    <div class="kv-list">
      <div class="kv"><span class="k">Device PIN</span><span class="v">${pin ? '<span class="badge badge-success">Enabled — offline unlock active</span>' : '<span class="badge badge-neutral">Not set</span>'}</span></div>
      ${pin && device.activation?.changedAt ? `<div class="kv"><span class="k">Last changed</span><span class="v">${esc(fmtDateTime(device.activation.changedAt))}</span></div>` : ''}
    </div>
    <p class="text-xs text-muted" style="margin:.5rem 0 .8rem">The PIN unlocks the app on this device when it is locked — with no internet needed. Signing IN still uses the email and password.</p>
    <div class="row" style="margin-top:.8rem">
      <button class="btn btn-outline btn-sm" id="save-device-name">${icon('check', 16)} Save name</button>
      ${!pin ? `<button class="btn btn-accent btn-sm" id="pin-set">${icon('key', 16)} Set up PIN</button>` : `
      <button class="btn btn-accent btn-sm" id="pin-change">${icon('edit', 16)} Change PIN</button>
      <button class="btn btn-danger btn-sm" id="pin-remove">${icon('x', 16)} Remove PIN</button>`}
    </div>
    <div class="card-title" style="margin-top:1.4rem">${icon('shield', 18)} Trust</div>
    <div class="row">
      <button class="btn btn-danger btn-sm" id="revoke-device">${icon('x', 16)} Revoke this device</button>
      ${revoked && isAdmin ? `<button class="btn btn-primary btn-sm" id="reinstate-device">${icon('check-circle', 16)} Reinstate this device</button>` : ''}
    </div>`;

  content.querySelector('#save-device-name').addEventListener('click', async () => {
    const name = content.querySelector('#device-name').value.trim();
    if (!name) { toast('Give the device a name first.', 'warn'); return; }
    await store.updateDevice({ ...device, name });
    await logAction(AUDIT_ACTIONS.DEVICE_RENAMED, `Device renamed to "${name}".`);
    toast('Device name saved.', 'success');
  });

  content.querySelector('#device-name').addEventListener('change', (e) => {
    if (e.target.value.trim()) content.querySelector('#save-device-name').click();
  });

  content.querySelector('#pin-set')?.addEventListener('click', () => pinModal('set'));
  content.querySelector('#pin-change')?.addEventListener('click', () => pinModal('change'));
  content.querySelector('#pin-remove')?.addEventListener('click', () => pinModal('remove'));

  content.querySelector('#revoke-device').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Revoke this device?',
      message: `Revoking "${esc(device.name)}" marks this device as no longer trusted: synchronisation stops immediately and you will be signed out. Sign-in on it is blocked (a system administrator can still sign in to reinstate it). Records stay safe on the device.`,
      confirmLabel: 'Revoke & sign out',
      danger: true
    });
    if (!ok) return;
    await revokeDevice('local', 'Revoked on this device');
    await logout();
    toast('Device revoked and signed out.', 'info');
    go('#/login');
  });

  content.querySelector('#reinstate-device')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reinstate this device?',
      message: 'The device becomes trusted again: sign-in and synchronisation work as before. Reinstate only devices you recognise.',
      confirmLabel: 'Reinstate'
    });
    if (!ok) return;
    try {
      await reinstateDevice('local');
      toast('Device reinstated — sign-in and sync are active again.', 'success');
      paint();
    } catch (err) {
      toast(err?.message || 'Could not reinstate the device.', 'error', 6000);
    }
  });

  /* ---------- All devices ---------- */
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
      <thead><tr><th>Device</th><th>Type</th><th>Owner</th><th>Last seen</th><th>PIN</th><th>Status</th>${isAdmin ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>
        ${devices.length ? devices.map((d) => {
          const isRevoked = d.status === 'revoked';
          const isThis = d.id === device.id;
          return `
          <tr>
            <td class="cell-strong">${esc(d.name || d.deviceName || 'Unnamed')}${isThis ? ' <span class="badge badge-info">this device</span>' : ''}
              <div class="text-xs text-muted mono">${esc(String(d.id).slice(0, 8))}…</div></td>
            <td class="text-small">${esc(d.platform || '—')}</td>
            <td class="text-small">${esc(d.ownerName || '—')}</td>
            <td class="text-small nowrap">${d.lastSeenAt ? esc(fmtDateTime(d.lastSeenAt)) : '—'}</td>
            <td>${(d.activation?.enabled || d.activationEnabled) ? '<span class="badge badge-success">On</span>' : '<span class="badge badge-neutral">Off</span>'}</td>
            <td>${isRevoked ? '<span class="badge badge-danger">Revoked</span>' : '<span class="badge badge-success">Active</span>'}</td>
            ${isAdmin ? `<td class="nowrap">
              ${isRevoked
                ? `<button class="btn btn-outline btn-sm" data-reinstate="${esc(d.id)}">${icon('check-circle', 14)} Reinstate</button>`
                : `<button class="btn btn-danger btn-sm" data-revoke="${esc(d.id)}" data-name="${esc(d.name || d.deviceName || 'device')}">${icon('x', 14)} Revoke</button>`}
            </td>` : ''}
          </tr>`;
        }).join('') : '<tr><td colspan="7" class="text-muted text-center">No devices registered yet.</td></tr>'}
      </tbody>
    </table></div>`;

  content.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.revoke;
      const name = btn.dataset.name;
      const isThis = id === device.id;
      const ok = await confirmDialog({
        title: `Revoke "${name}"?`,
        message: isThis
          ? 'This is the device you are using. Revoking signs you out and stops synchronisation on it. An administrator can reinstate it later.'
          : 'The device will be signed out at its next check and can no longer sign in or sync. Its already-saved records stay on the device. You can reinstate it any time.',
        confirmLabel: 'Revoke device',
        danger: true
      });
      if (!ok) return;
      try {
        await revokeDevice(id, `Revoked from the Devices screen by ${session.fullName}`);
        if (isThis) { await logout(); go('#/login'); }
        else { toast(`"${name}" revoked. It will stop syncing at its next check.`, 'success'); paint(); }
      } catch (err) {
        toast(err?.message || 'Could not revoke the device.', 'error', 6000);
      }
    });
  });

  content.querySelectorAll('[data-reinstate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.reinstate;
      const ok = await confirmDialog({
        title: 'Reinstate this device?',
        message: 'The device becomes trusted again: sign-in and synchronisation work as before. Reinstate only devices you recognise.',
        confirmLabel: 'Reinstate'
      });
      if (!ok) return;
      try {
        await reinstateDevice(id);
        toast('Device reinstated.', 'success');
        paint();
      } catch (err) {
        toast(err?.message || 'Could not reinstate the device.', 'error', 6000);
      }
    });
  });

  async function paint() { /* re-render the whole screen after actions */ go(location.hash || '#/admin/devices'); }

  updateSyncChips();
}
