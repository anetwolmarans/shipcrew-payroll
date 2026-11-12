/**
 * users.screen.js — Users & Roles with IN-APP USER MANAGEMENT (Phase 2).
 *
 *  - The table lists every login (demo accounts in demo mode; Firestore in
 *    live mode) with role, employee number, status and last sign-in.
 *  - System Administrators can, without leaving the app:
 *      • create a new login (any role) with a starting password;
 *      • change someone's role;
 *      • disable / re-enable an account (disabled = cannot sign in);
 *      • reset a password (demo: directly; live: secure Firebase reset email).
 *  - The permission matrix underneath shows exactly what each role may do.
 *
 * SAFETY: you cannot disable or re-role your OWN account while signed in,
 * and every change is written to the audit trail.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, avatarInitials, openModal, toast, confirmDialog } from '../../core/ui.js';
import * as store from '../../core/store.js';
import { isFirebaseConfigured } from '../../firebase-config.js';
import { ROLES, ROLE_MATRIX, CAPABILITIES, roleColor, roleLabel, roleDescription } from '../../core/permissions.js';
import { fbEnsure } from '../../core/firebase.service.js';
import {
  adminCreateUser, adminSetRole, adminSetStatus, adminSetPassword, sendPasswordReset
} from '../../core/auth.service.js';
import { fmtDateTime } from '../../core/time.js';
import { currentSession } from '../../core/auth.service.js';

export async function render(root, ctx) {
  const me = currentSession();
  const canManage = me.role === 'system_admin';

  const body = `
    <div id="users-note"></div>
    <div class="table-toolbar" style="margin-top:1rem">
      ${canManage ? `<button class="btn btn-primary btn-sm" id="add-user">${icon('plus', 16)} Add user</button>` : ''}
      <span class="text-small text-muted" id="users-source"></span>
    </div>
    <div id="users-table"></div>
    <div style="height:1.2rem"></div>
    <div class="card" id="matrix-card">
      <div class="card-title">${icon('shield', 18)} Permission matrix — who may do what</div>
      <p class="card-sub">The app hides what a role may not use, and Firebase enforces the same rules on the server (rules/firestore.rules) — so the restrictions cannot be bypassed from a browser.</p>
      <div class="table-wrap"><table class="table" id="matrix-table"></table></div>
    </div>`;
  const content = renderAdminShell(root, ctx, { title: 'Users & Roles', navKey: 'users', body });

  content.querySelector('#users-note').innerHTML = isFirebaseConfigured()
    ? `<div class="banner banner-info">${icon('info', 18)}<div>Live environment: accounts are managed here and stored centrally in Firebase. New logins sign in with the starting password you set.</div></div>`
    : `<div class="banner banner-demo">${icon('alert', 18)}<div>Demo accounts below — plus any you create. Each account's role decides what it can see and do.</div></div>`;

  async function paint() {
    let users = [];
    let source = '';
    if (isFirebaseConfigured()) {
      try {
        const fb = await fbEnsure();
        const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, 'users'));
        users = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
        source = `Source: Firebase (${users.length} user${users.length === 1 ? '' : 's'})`;
      } catch (err) {
        toast('Could not read users from Firebase — showing local records. ' + (err?.message || ''), 'warn', 6000);
        users = await store.listUsers();
        source = 'Source: this device (Firebase read failed)';
      }
    } else {
      users = await store.listUsers();
      source = `Source: demo data on this device (${users.length} user${users.length === 1 ? '' : 's'})`;
    }
    content.querySelector('#users-source').textContent = source;

    content.querySelector('#users-table').innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Employee no.</th><th>Status</th><th>Last login</th>${canManage ? '<th>Manage</th>' : ''}</tr></thead>
        <tbody>
          ${users.map((u) => `
          <tr>
            <td><span class="row"><span class="avatar" style="width:32px;height:32px;font-size:.75rem">${esc(avatarInitials(u.fullName))}</span><span class="cell-strong">${esc(u.fullName || 'Unnamed')}</span></span></td>
            <td class="text-small">${esc(u.email || '')}</td>
            <td><span class="badge badge-${esc(roleColor(u.role))}">${esc(roleLabel(u.role))}</span></td>
            <td class="text-small">${esc(u.employeeId || '—')}</td>
            <td>${u.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Disabled</span>'}</td>
            <td class="text-small nowrap">${u.lastLoginAt ? esc(fmtDateTime(u.lastLoginAt)) : '—'}</td>
            ${canManage ? `
            <td><span class="row" style="gap:.3rem;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" data-role="${esc(u.id)}" title="Change role">${icon('shield', 13)} Role</button>
              <button class="btn btn-outline btn-sm" data-pass="${esc(u.id)}" title="Reset password">${icon('key', 13)} Password</button>
              <button class="btn ${u.status === 'active' ? 'btn-danger' : 'btn-outline'} btn-sm" data-status="${esc(u.id)}" data-next="${u.status === 'active' ? 'inactive' : 'active'}">
                ${u.status === 'active' ? 'Disable' : 'Enable'}
              </button>
            </span></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    /* Permission matrix */
    const caps = Object.values(CAPABILITIES);
    content.querySelector('#matrix-table').innerHTML = `
      <thead><tr><th>Capability</th>${ROLES.map((r) => `<th>${esc(r.label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${caps.map((cap) => `
          <tr>
            <td class="cell-strong text-small">${esc(cap.replaceAll('_', ' '))}</td>
            ${ROLES.map((r) => `<td style="text-align:center">${(ROLE_MATRIX[r.id] || []).includes(cap) ? icon('check', 16) : '<span class="text-muted">·</span>'}</td>`).join('')}
          </tr>`).join('')}
      </tbody>`;

    if (!canManage) return;
    content.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => openRoleModal(b.dataset.role, users)));
    content.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => openPasswordModal(b.dataset.pass, users)));
    content.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
      const target = users.find(u => u.id === b.dataset.status);
      if (!target) return;
      const disabling = b.dataset.next !== 'active';
      if (disabling) {
        const ok = await confirmDialog({
          title: `Disable ${target.fullName}?`,
          message: 'A disabled account cannot sign in until it is re-enabled. The person keeps all their records and history.',
          confirmLabel: 'Disable account', danger: true
        });
        if (!ok) return;
      }
      try {
        await adminSetStatus(target.id, b.dataset.next);
        toast(disabling ? 'Account disabled.' : 'Account re-enabled.', 'success');
        paint();
      } catch (err) {
        toast(err?.message || 'Could not update the account.', 'error', 6000);
      }
    }));
  }

  /* ---------------- Add user ---------------- */
  content.querySelector('#add-user')?.addEventListener('click', () => {
    openModal({
      title: 'Add user', icon: 'user-check',
      body: `
        <form id="new-user-form" class="form-grid">
          <div class="field" style="grid-column:1/-1">
            <label class="field-label" for="u-name">Full name <span class="req">*</span></label>
            <input class="input" id="u-name" placeholder="Name and surname">
          </div>
          <div class="field">
            <label class="field-label" for="u-email">Email (this is the sign-in name) <span class="req">*</span></label>
            <input class="input" id="u-email" type="email" placeholder="name@company.example">
          </div>
          <div class="field">
            <label class="field-label" for="u-role">Role <span class="req">*</span></label>
            <select class="input" id="u-role">
              ${ROLES.map(r => `<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('')}
            </select>
            <div class="field-hint" id="u-role-hint"></div>
          </div>
          <div class="field">
            <label class="field-label" for="u-employee">Employee number (optional)</label>
            <input class="input" id="u-employee" placeholder="NAF-0042">
            <div class="field-hint">Link crew members to their crew record afterwards (Crew → Edit → Linked login).</div>
          </div>
          <div class="field">
            <label class="field-label" for="u-pass">Starting password <span class="req">*</span></label>
            <input class="input" id="u-pass" type="text" placeholder="At least 8 characters">
            <div class="field-hint">${isFirebaseConfigured()
              ? 'They change it with "Forgot password" on the sign-in screen.'
              : 'Share it privately; the person can change it later (demo mode: admin resets it).'}</div>
          </div>
        </form>
        <div class="note" style="margin-top:.6rem">${icon('shield', 15)}<div>Roles decide everything. Pick the smallest role that does the job — ${ROLES.map(r => `${esc(r.label)}: ${esc(roleDescription(r.id))}`).join(' ')}</div></div>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Create user', kind: 'btn-primary',
          onClick: async (overlay) => {
            const g = (s) => overlay.querySelector(s).value.trim();
            try {
              await adminCreateUser({
                fullName: g('#u-name'), email: g('#u-email'),
                role: g('#u-role'), password: g('#u-pass'), employeeId: g('#u-employee') || null
              });
              toast('User created.', 'success');
              paint();
            } catch (err) {
              toast(err?.message || 'Could not create the user.', 'error', 6500);
              return true;
            }
          }
        }
      ]
    });
  });

  /* ---------------- Change role ---------------- */
  function openRoleModal(userId, users) {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    openModal({
      title: `Change role — ${target.fullName}`, icon: 'shield',
      body: `
        <div class="field">
          <label class="field-label" for="r-role">New role for ${esc(target.email)}</label>
          <select class="input" id="r-role">
            ${ROLES.map(r => `<option value="${esc(r.id)}" ${target.role === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
          </select>
          <div class="field-hint">Takes effect at their next sign-in. ${esc(roleDescription(target.role))}</div>
        </div>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Save role', kind: 'btn-primary',
          onClick: async (overlay) => {
            try {
              await adminSetRole(target.id, overlay.querySelector('#r-role').value);
              toast('Role updated.', 'success');
              paint();
            } catch (err) {
              toast(err?.message || 'Could not change the role.', 'error', 6000);
              return true;
            }
          }
        }
      ]
    });
  }

  /* ---------------- Password ---------------- */
  function openPasswordModal(userId, users) {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    if (isFirebaseConfigured()) {
      openModal({
        title: `Send password reset — ${target.fullName}`, icon: 'key',
        body: `<p style="margin:0">A secure password-reset link will be emailed to <b>${esc(target.email)}</b>.
          Firebase handles it — nobody ever sees or stores the new password.</p>`,
        actions: [
          { label: 'Cancel', kind: 'btn-outline' },
          {
            label: 'Send reset email', kind: 'btn-primary',
            onClick: async () => {
              try {
                await sendPasswordReset(target.email);
                toast('Reset email sent.', 'success');
              } catch (err) {
                toast(err?.message || 'Could not send the email.', 'error', 6000);
                return true;
              }
            }
          }
        ]
      });
      return;
    }
    openModal({
      title: `Reset password — ${target.fullName}`, icon: 'key',
      body: `
        <div class="field">
          <label class="field-label" for="p-new">New password for ${esc(target.email)}</label>
          <input class="input" id="p-new" type="text" placeholder="At least 8 characters">
          <div class="field-hint">Demo mode: the password is re-hashed on this device. Live mode uses emailed reset links instead.</div>
        </div>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Set password', kind: 'btn-primary',
          onClick: async (overlay) => {
            try {
              await adminSetPassword(target.id, overlay.querySelector('#p-new').value);
              toast('Password updated.', 'success');
            } catch (err) {
              toast(err?.message || 'Could not set the password.', 'error', 6000);
              return true;
            }
          }
        }
      ]
    });
  }

  await paint();
}
