/**
 * vessels.screen.js — The VESSEL REGISTER (Phase 2).
 * Every vessel in the fleet: name, registration number, call sign, type,
 * capacity, home port, responsible manager and active status. Each vessel
 * shows who is assigned right now and its full trip history.
 *
 * Editing requires MANAGE_VESSELS (Vessel Manager / System Administrator) —
 * hidden here AND enforced by the server rules.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, avatarInitials, openModal, toast } from '../../core/ui.js';
import * as ops from '../../core/operations.service.js';
import * as store from '../../core/store.js';
import { can, CAPABILITIES } from '../../core/permissions.js';
import { tripStatus } from '../../config.js';
import { fmtDateTime } from '../../core/time.js';

const VESSEL_TYPES = ['Wet-fish trawler', 'Longliner', 'Purse seiner', 'Factory trawler', 'Mono trawler', 'Other'];

export async function render(root, ctx) {
  const role = ctx.session.role;
  const canManage = can(role, CAPABILITIES.MANAGE_VESSELS);
  const users = await store.listUsers();

  const body = `
    <div id="vessel-banner"></div>
    <div class="table-toolbar" style="margin-top:1rem">
      ${canManage ? `<button class="btn btn-primary btn-sm" id="add-vessel">${icon('plus', 16)} Add vessel</button>` : ''}
      <span class="text-small text-muted" id="vessel-count"></span>
    </div>
    <div id="vessel-cards"></div>`;

  const content = renderAdminShell(root, ctx, { title: 'Vessels', navKey: 'vessels', body });

  content.querySelector('#vessel-banner').innerHTML = `
    <div class="banner ${isDemoBannerClass()}">${icon('info', 18)}<div>The fleet register. Open a vessel to see its current crew list and complete trip history.</div></div>`;

  function isDemoBannerClass() { return 'banner-info'; }

  async function paint() {
    const vessels = await ops.listVessels();
    content.querySelector('#vessel-count').textContent = `${vessels.length} vessel${vessels.length === 1 ? '' : 's'}`;

    const cards = await Promise.all(vessels.map(async (v) => {
      const onboard = await ops.crewOnVessel(v.id);
      const history = await ops.tripHistoryForVessel(v.id);
      const manager = users.find(u => u.id === v.managerUserId);
      return `
      <div class="card">
        <div class="card-title">
          ${icon('ship', 18)} ${esc(v.name)}
          <span class="badge ${v.status === 'active' ? 'badge-success' : 'badge-neutral'}" style="margin-left:auto">${esc(v.status || 'active')}</span>
        </div>
        <div class="profile-grid">
          <div class="profile-item"><div class="k">Registration</div><div class="v">${esc(v.registrationNumber)}</div></div>
          <div class="profile-item"><div class="k">Call sign</div><div class="v">${esc(v.callSign || '—')}</div></div>
          <div class="profile-item"><div class="k">Type</div><div class="v">${esc(v.type || '—')}</div></div>
          <div class="profile-item"><div class="k">Capacity</div><div class="v">${esc(String(v.capacity ?? '—'))} crew</div></div>
          <div class="profile-item"><div class="k">Home port</div><div class="v">${esc(v.homePort || '—')}</div></div>
          <div class="profile-item"><div class="k">Manager</div><div class="v">${esc(manager?.fullName || '—')}</div></div>
        </div>
        <div class="vessel-quick row" style="gap:1.5rem;margin:.8rem 0">
          <span class="text-small">${icon('users', 15)} <b>${onboard.length}</b> assigned on live trips</span>
          <span class="text-small">${icon('map', 15)} <b>${history.length}</b> trip${history.length === 1 ? '' : 's'} in history</span>
          ${canManage ? `<button class="btn btn-outline btn-sm" data-edit="${esc(v.id)}">${icon('edit', 14)} Edit</button>` : ''}
        </div>
        ${onboard.length ? `
          <div class="row" style="flex-wrap:wrap;gap:.4rem">
            ${onboard.map(o => `<span class="badge badge-navy">${icon('user', 12)} ${esc(o.crew.fullName || o.crew.id)} · ${esc(o.assignment.tripRef)}</span>`).join('')}
          </div>` : `<div class="text-xs text-muted">No crew assigned on live trips right now.</div>`}
        ${history.length ? `
          <div class="table-wrap" style="margin-top:.8rem"><table class="table">
            <thead><tr><th>Trip</th><th>Status</th><th>Departed</th><th>Returned</th></tr></thead>
            <tbody>
              ${history.slice(0, 5).map(t => {
                const st = tripStatus(t.status);
                return `<tr>
                  <td class="cell-strong">${esc(t.reference)}</td>
                  <td><span class="badge badge-${esc(st.color)}">${esc(st.label)}</span></td>
                  <td class="text-small nowrap">${esc(t.actualDepartAt ? fmtDateTime(t.actualDepartAt) : '—')}</td>
                  <td class="text-small nowrap">${esc(t.actualReturnAt ? fmtDateTime(t.actualReturnAt) : '—')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>` : ''}
      </div>`;
    }));

    content.querySelector('#vessel-cards').innerHTML = cards.join('') || `
      <div class="empty-state">${icon('ship', 30)}<div class="title">No vessels yet</div><p>Add your first vessel to start planning trips.</p></div>`;

    content.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openVesselModal(b.dataset.edit)));
  }

  async function openVesselModal(id = null) {
    const existing = id ? await ops.getVessel(id) : null;
    openModal({
      title: existing ? `Edit — ${existing.name}` : 'Add vessel',
      icon: 'ship',
      body: `
        <form id="vessel-form" class="form-grid">
          <div class="field">
            <label class="field-label" for="v-name">Vessel name <span class="req">*</span></label>
            <input class="input" id="v-name" value="${esc(existing?.name || '')}" placeholder="MFV …">
          </div>
          <div class="field">
            <label class="field-label" for="v-reg">Registration number <span class="req">*</span></label>
            <input class="input" id="v-reg" value="${esc(existing?.registrationNumber || '')}" placeholder="LWB-200-E">
          </div>
          <div class="field">
            <label class="field-label" for="v-call">Call sign</label>
            <input class="input" id="v-call" value="${esc(existing?.callSign || '')}" placeholder="V5…">
          </div>
          <div class="field">
            <label class="field-label" for="v-type">Type</label>
            <select class="input" id="v-type">
              ${VESSEL_TYPES.map(t => `<option ${existing?.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="v-cap">Crew capacity</label>
            <input class="input" id="v-cap" type="number" min="1" max="200" value="${esc(String(existing?.capacity ?? ''))}">
          </div>
          <div class="field">
            <label class="field-label" for="v-port">Home port</label>
            <input class="input" id="v-port" value="${esc(existing?.homePort || 'Walvis Bay')}">
          </div>
          <div class="field">
            <label class="field-label" for="v-manager">Responsible manager</label>
            <select class="input" id="v-manager">
              <option value="">— none —</option>
              ${users.filter(u => ['vessel_manager', 'system_admin'].includes(u.role)).map(u =>
                `<option value="${esc(u.id)}" ${existing?.managerUserId === u.id ? 'selected' : ''}>${esc(u.fullName)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="v-status">Status</label>
            <select class="input" id="v-status">
              <option value="active" ${existing?.status === 'active' || !existing ? 'selected' : ''}>Active</option>
              <option value="inactive" ${existing?.status === 'inactive' ? 'selected' : ''}>Inactive (laid up)</option>
            </select>
          </div>
        </form>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: existing ? 'Save changes' : 'Create vessel', kind: 'btn-primary',
          onClick: async (overlay) => {
            const g = (s) => overlay.querySelector(s).value.trim();
            const fields = {
              name: g('#v-name'),
              registrationNumber: g('#v-reg').toUpperCase(),
              callSign: g('#v-call').toUpperCase(),
              type: g('#v-type'),
              capacity: Number(g('#v-cap')) || null,
              homePort: g('#v-port'),
              managerUserId: g('#v-manager') || null,
              status: g('#v-status')
            };
            try {
              if (existing) await ops.updateVessel(existing.id, fields);
              else await ops.createVessel(fields);
              toast(existing ? 'Vessel updated.' : 'Vessel created.', 'success');
              await paint();
            } catch (err) {
              toast(err?.message || 'Could not save.', 'error', 6000);
              return true;
            }
          }
        }
      ]
    });
  }

  const addBtn = content.querySelector('#add-vessel');
  if (addBtn) addBtn.addEventListener('click', () => openVesselModal(null));

  await paint();
}
