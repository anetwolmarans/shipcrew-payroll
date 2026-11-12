/**
 * crew.screen.js — The CREW REGISTER (Phase 2).
 * Full employee records: employee number, identity, contact, emergency,
 * position, employment status, start date, home vessel, and the linked
 * login (so crew members sign in as themselves).
 *
 * SECURITY SHAPES THIS SCREEN:
 *  - Viewing: every staff role may see the register (auditor included).
 *  - Editing: only roles with MANAGE_CREW (System Administrator and Payroll
 *    Administrator). The buttons are hidden AND the server rules enforce it.
 *  - Banking details live in a SEPARATE restricted record (crew_banking) and
 *    are only shown to those same two roles — never inside the crew list.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, avatarInitials, openModal, toast } from '../../core/ui.js';
import * as ops from '../../core/operations.service.js';
import * as store from '../../core/store.js';
import { can, CAPABILITIES } from '../../core/permissions.js';
import { isFirebaseConfigured } from '../../firebase-config.js';
import { CREW_POSITIONS, ID_TYPES } from '../../config.js';
import { fmtDate } from '../../core/time.js';

export async function render(root, ctx) {
  const role = ctx.session.role;
  const canManage = can(role, CAPABILITIES.MANAGE_CREW);

  const body = `
    <div id="crew-banner"></div>
    <div class="table-toolbar" style="margin-top:1rem">
      <div class="input-wrap" style="max-width:280px">
        <input class="input" id="crew-search" type="search" placeholder="Search name, number, position…">
      </div>
      ${canManage ? `<button class="btn btn-primary btn-sm" id="add-crew">${icon('plus', 16)} Add crew member</button>` : ''}
      <span class="text-small text-muted" id="crew-count"></span>
    </div>
    <div id="crew-table"></div>
    <p class="text-xs text-muted" style="margin:.8rem 0 0">
      ${icon('shield', 14)} Banking details are stored in a separate restricted collection
      (<span class="mono">crew_banking</span>) and never appear in this list. In live mode the server blocks everyone
      except the payroll and system administrators — enforced by <span class="mono">rules/firestore.rules</span>.
    </p>`;

  const content = renderAdminShell(root, ctx, { title: 'Crew', navKey: 'crew', body });

  content.querySelector('#crew-banner').innerHTML = isFirebaseConfigured()
    ? `<div class="banner banner-info">${icon('info', 18)}<div>Live environment — the crew register synchronises through Firebase. Banking details stay restricted.</div></div>`
    : `<div class="banner banner-demo">${icon('alert', 18)}<div>Demo mode — the register below is fictional demo data on this device. Never enter real employee data in demo mode.</div></div>`;

  const [vessels, users] = await Promise.all([ops.listVessels(), store.listUsers()]);
  const crewUsers = users.filter(u => u.role === 'crew');

  async function paint(filter = '') {
    const crew = await ops.listCrew();
    const f = filter.trim().toLowerCase();
    const shown = f
      ? crew.filter(c => [c.fullName, c.id, c.position].some(v => String(v || '').toLowerCase().includes(f)))
      : crew;

    content.querySelector('#crew-count').textContent = `${shown.length} of ${crew.length} crew member${crew.length === 1 ? '' : 's'}`;

    content.querySelector('#crew-table').innerHTML = shown.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Employee</th><th>Position</th><th>Home vessel</th><th>Contact</th><th>Start</th><th>Login</th><th>Status</th>${canManage ? '<th></th>' : ''}</tr></thead>
        <tbody>
          ${shown.map((c) => `
          <tr>
            <td><span class="row"><span class="avatar" style="width:32px;height:32px;font-size:.75rem">${esc(avatarInitials(c.fullName))}</span>
              <span><span class="cell-strong">${esc(c.fullName)}</span><div class="text-xs text-muted">${esc(c.id)}</div></span></span></td>
            <td class="text-small">${esc(c.position || '—')}</td>
            <td class="text-small">${esc(vessels.find(v => v.id === c.homeVesselId)?.name || c.vessel || '—')}</td>
            <td class="text-small">${esc(c.phone || '—')}</td>
            <td class="text-small nowrap">${esc(c.startDate ? fmtDate(c.startDate) : '—')}</td>
            <td>${c.userId ? '<span class="badge badge-success">Linked</span>' : '<span class="badge badge-neutral">No login</span>'}</td>
            <td><span class="badge ${c.employmentStatus === 'active' ? 'badge-success' : 'badge-warning'}">${esc(c.employmentStatus || 'active')}</span></td>
            ${canManage ? `<td><button class="btn btn-outline btn-sm" data-edit="${esc(c.id)}">${icon('edit', 14)} Edit</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="empty-state">${icon('users', 30)}<div class="title">No crew members found</div><p>${f ? 'Nothing matches your search.' : 'Add your first crew member to get started.'}</p></div>`;

    content.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openCrewModal(b.dataset.edit)));
  }

  /* ---------------- Add / edit modal ---------------- */
  async function openCrewModal(id = null) {
    const existing = id ? await ops.getCrew(id) : null;
    const banking = id ? await ops.getBanking(id) : null;
    const linkedIds = new Set((await ops.listCrew()).filter(c => c.userId && c.id !== id).map(c => c.userId));
    const freeCrewUsers = crewUsers.filter(u => !linkedIds.has(u.id));

    const posOptions = [...CREW_POSITIONS];
    if (existing?.position && !posOptions.includes(existing.position)) posOptions.push(existing.position);

    openModal({
      title: existing ? `Edit — ${existing.fullName} (${existing.id})` : 'Add crew member',
      icon: 'users',
      body: `
        <form id="crew-form" class="form-grid">
          <div class="field">
            <label class="field-label" for="c-employeeId">Employee number <span class="req">*</span></label>
            <input class="input" id="c-employeeId" value="${esc(existing?.id || '')}" ${existing ? 'readonly' : ''} placeholder="NAF-0042">
            ${existing ? '<div class="field-hint">The employee number is the record\\u2019s identity — it never changes.</div>' : '<div class="field-hint">Must be unique. It becomes the record\\u2019s identity.</div>'}
          </div>
          <div class="field">
            <label class="field-label" for="c-fullName">Full name <span class="req">*</span></label>
            <input class="input" id="c-fullName" value="${esc(existing?.fullName || '')}" placeholder="Name and surname">
          </div>
          <div class="field">
            <label class="field-label" for="c-position">Position</label>
            <select class="input" id="c-position">
              ${posOptions.map(p => `<option ${existing?.position === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="c-idType">Identity document</label>
            <select class="input" id="c-idType">
              ${ID_TYPES.map(t => `<option ${existing?.idType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="c-idNumber">ID / passport number</label>
            <input class="input" id="c-idNumber" value="${esc(existing?.idNumber || '')}">
          </div>
          <div class="field">
            <label class="field-label" for="c-phone">Phone</label>
            <input class="input" id="c-phone" value="${esc(existing?.phone || '')}" placeholder="+264 81 …">
          </div>
          <div class="field">
            <label class="field-label" for="c-emergency">Emergency contact</label>
            <input class="input" id="c-emergency" value="${esc(existing?.emergencyContact || '')}" placeholder="Name — phone">
          </div>
          <div class="field">
            <label class="field-label" for="c-startDate">Employment start date</label>
            <input class="input" id="c-startDate" type="date" value="${esc(existing?.startDate || '')}">
          </div>
          <div class="field">
            <label class="field-label" for="c-status">Employment status</label>
            <select class="input" id="c-status">
              ${['active', 'on_leave', 'inactive'].map(s => `<option value="${s}" ${existing?.employmentStatus === s ? 'selected' : ''}>${s === 'active' ? 'Active' : s === 'on_leave' ? 'On leave' : 'Inactive'}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="c-vessel">Home vessel</label>
            <select class="input" id="c-vessel">
              <option value="">— none —</option>
              ${vessels.map(v => `<option value="${esc(v.id)}" ${existing?.homeVesselId === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label class="field-label" for="c-user">Linked login (crew member signs in as themselves)</label>
            <select class="input" id="c-user">
              <option value="">— no login linked —</option>
              ${existing?.userId ? `<option value="${esc(existing.userId)}" selected>${esc(users.find(u => u.id === existing.userId)?.fullName || existing.userId)} (current)</option>` : ''}
              ${freeCrewUsers.map(u => `<option value="${esc(u.id)}">${esc(u.fullName)} — ${esc(u.email)}</option>`).join('')}
            </select>
            <div class="field-hint">Need a new crew login? Create it first under Users &amp; Roles, then link it here.</div>
          </div>

          <div class="divider-label" style="grid-column:1/-1">${icon('shield', 14)} Banking details (separate restricted record — only payroll &amp; system administrators ever see this)</div>
          <div class="field"><label class="field-label" for="c-bank">Bank</label>
            <input class="input" id="c-bank" value="${esc(banking?.bank || '')}" placeholder="e.g. Bank Windhoek"></div>
          <div class="field"><label class="field-label" for="c-branch">Branch / branch code</label>
            <input class="input" id="c-branch" value="${esc(banking?.branch || '')}"></div>
          <div class="field"><label class="field-label" for="c-account">Account number</label>
            <input class="input" id="c-account" value="${esc(banking?.accountNumber || '')}"></div>
          <div class="field"><label class="field-label" for="c-accType">Account type</label>
            <select class="input" id="c-accType">
              ${['Savings', 'Cheque', 'Other'].map(t => `<option ${banking?.accountType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select></div>
        </form>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: existing ? 'Save changes' : 'Create crew member', kind: 'btn-primary',
          onClick: async (overlay) => {
            const g = (sel) => overlay.querySelector(sel).value.trim();
            const fields = {
              employeeId: g('#c-employeeId'),
              fullName: g('#c-fullName'),
              position: g('#c-position'),
              idType: g('#c-idType'),
              idNumber: g('#c-idNumber'),
              phone: g('#c-phone'),
              emergencyContact: g('#c-emergency'),
              startDate: g('#c-startDate') || null,
              employmentStatus: g('#c-status'),
              homeVesselId: g('#c-vessel') || null,
              userId: g('#c-user') || null
            };
            try {
              let crewId;
              if (existing) {
                crewId = (await ops.updateCrew(existing.id, fields)).id;
              } else {
                crewId = (await ops.createCrew(fields)).id;
              }
              const bank = {
                bank: g('#c-bank'), branch: g('#c-branch'),
                accountNumber: g('#c-account'), accountType: g('#c-accType')
              };
              if (Object.values(bank).some(v => v)) await ops.saveBanking(crewId, bank);
              toast(existing ? 'Crew member updated.' : 'Crew member created.', 'success');
              content.querySelector('#crew-search').value = '';
              await paint();
            } catch (err) {
              toast(err?.message || 'Could not save.', 'error', 6000);
              return true; // keep the modal open so nothing is lost
            }
          }
        }
      ]
    });
  }

  const addBtn = content.querySelector('#add-crew');
  if (addBtn) addBtn.addEventListener('click', () => openCrewModal(null));
  content.querySelector('#crew-search').addEventListener('input', (e) => paint(e.target.value));

  await paint();
}
