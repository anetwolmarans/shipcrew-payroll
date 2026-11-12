/**
 * trips.screen.js — The TRIP REGISTER (Phase 2).
 * The full 8-status flow from the project brief:
 *   Planned → Open → At Sea → Returned → Under Review → Payroll Pending →
 *   Approved → Closed.
 *
 * Integrity rules visible on this screen:
 *  - Trips move FORWARD one step at a time; every change is written to the
 *    trip's statusHistory (who, when, note) — nothing is ever edited away.
 *  - Crew assignments are records with history: adding creates one, removal
 *    stamps its end. Ended assignments stay visible forever.
 *  - A trip cannot be closed while anyone is still clocked in.
 *  - Crew can only clock in on trips that are Open or At Sea (shown here).
 *
 * Managing requires MANAGE_TRIPS / MANAGE_ASSIGNMENTS (Vessel Manager /
 * System Administrator); everyone else sees a read-only view.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, openModal, toast, confirmDialog } from '../../core/ui.js';
import * as ops from '../../core/operations.service.js';
import { can, CAPABILITIES } from '../../core/permissions.js';
import { TRIP_STATUSES, tripStatus, CLOCKABLE_TRIP_STATUSES } from '../../config.js';
import { fmtDateTime, minutesToHHMM } from '../../core/time.js';

export async function render(root, ctx) {
  const role = ctx.session.role;
  const canManageTrips = can(role, CAPABILITIES.MANAGE_TRIPS);
  const canManageAssignments = can(role, CAPABILITIES.MANAGE_ASSIGNMENTS);

  const body = `
    <div class="table-toolbar" style="margin-top:1rem">
      <label class="text-small" for="trip-filter" style="display:flex;align-items:center;gap:.4rem">
        ${icon('search', 15)} Status
        <select class="input" id="trip-filter" style="width:auto;padding:.4rem .6rem">
          <option value="">All statuses</option>
          ${TRIP_STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
        </select>
      </label>
      ${canManageTrips ? `<button class="btn btn-primary btn-sm" id="add-trip">${icon('plus', 16)} Plan a trip</button>` : ''}
      <span class="text-small text-muted" id="trip-count"></span>
    </div>
    <div id="trip-table"></div>
    <p class="text-xs text-muted" style="margin:.8rem 0 0">
      ${icon('clock', 14)} Crew can clock in against trips marked <b>Open</b> or <b>At Sea</b> only.
      Every status change and assignment is kept in history — corrections are added, never overwrites.
    </p>`;

  const content = renderAdminShell(root, ctx, { title: 'Trips', navKey: 'trips', body });

  async function paint(statusFilter = '') {
    const trips = await ops.listTrips();
    const shown = statusFilter ? trips.filter(t => t.status === statusFilter) : trips;
    content.querySelector('#trip-count').textContent = `${shown.length} of ${trips.length} trip${trips.length === 1 ? '' : 's'}`;

    content.querySelector('#trip-table').innerHTML = shown.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Reference</th><th>Vessel</th><th>Status</th><th>Ports</th><th>Departed</th><th>Returned</th><th>Crew</th><th></th></tr></thead>
        <tbody>
          ${shown.map((t) => {
            const st = tripStatus(t.status);
            return `<tr>
              <td class="cell-strong nowrap">${esc(t.reference)}</td>
              <td>${esc(t.vesselName)}</td>
              <td><span class="badge badge-${esc(st.color)}">${esc(st.label)}</span></td>
              <td class="text-small nowrap">${esc(t.departurePort || '—')} → ${esc(t.returnPort || '—')}</td>
              <td class="text-small nowrap">${esc(t.actualDepartAt ? fmtDateTime(t.actualDepartAt) : '—')}</td>
              <td class="text-small nowrap">${esc(t.actualReturnAt ? fmtDateTime(t.actualReturnAt) : '—')}</td>
              <td class="text-small" data-crew-count="${esc(t.id)}">…</td>
              <td><button class="btn btn-outline btn-sm" data-open="${esc(t.id)}">Open</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`
      : `<div class="empty-state">${icon('map', 30)}<div class="title">No trips${statusFilter ? ' with this status' : ''}</div><p>${canManageTrips ? 'Plan a trip to get started.' : 'Trips will appear here once the vessel manager plans them.'}</p></div>}`;

    /* fill crew counts */
    const assignments = await ops.listAssignments();
    for (const t of shown) {
      const active = assignments.filter(a => a.tripId === t.id && a.status === 'active').length;
      const cell = content.querySelector(`[data-crew-count="${t.id}"]`);
      if (cell) cell.innerHTML = `<span class="badge badge-neutral">${active} onboard</span>`;
    }

    content.querySelectorAll('[data-open]').forEach((b) =>
      b.addEventListener('click', () => openTripModal(b.dataset.open)));
  }

  /* ---------------- Create trip ---------------- */
  async function openCreateModal() {
    const vessels = (await ops.listVessels()).filter(v => v.status === 'active');
    openModal({
      title: 'Plan a trip', icon: 'map',
      body: `
        <form id="trip-form" class="form-grid">
          <div class="field" style="grid-column:1/-1">
            <label class="field-label" for="t-vessel">Vessel <span class="req">*</span></label>
            <select class="input" id="t-vessel">
              ${vessels.map(v => `<option value="${esc(v.id)}">${esc(v.name)} (${esc(v.registrationNumber)})</option>`).join('')}
            </select>
            ${vessels.length ? '' : '<div class="field-hint">Add an active vessel first (Vessels screen).</div>'}
          </div>
          <div class="field">
            <label class="field-label" for="t-dep-port">Departure port</label>
            <input class="input" id="t-dep-port" value="Walvis Bay">
          </div>
          <div class="field">
            <label class="field-label" for="t-ret-port">Return port</label>
            <input class="input" id="t-ret-port" value="Walvis Bay">
          </div>
          <div class="field">
            <label class="field-label" for="t-dep">Planned departure</label>
            <input class="input" id="t-dep" type="datetime-local">
            <div class="field-hint">Your device's local time (Namibian time) — stored as UTC.</div>
          </div>
          <div class="field">
            <label class="field-label" for="t-ret">Planned return</label>
            <input class="input" id="t-ret" type="datetime-local">
          </div>
          <div class="field" style="grid-column:1/-1">
            <label class="field-label" for="t-notes">Notes</label>
            <input class="input" id="t-notes" placeholder="e.g. Hake grounds, north of Palgrave Point">
          </div>
        </form>
        <p class="text-xs text-muted" style="margin:.6rem 0 0">The trip is created as <b>Planned</b> with a unique reference (TRP-YYYY-NNN).
        Open it for crewing when the crew list is confirmed — then crew can be assigned and clock in.</p>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Create trip', kind: 'btn-primary',
          onClick: async (overlay) => {
            const g = (s) => overlay.querySelector(s).value.trim();
            const toISO = (v) => v ? new Date(v).toISOString() : null;
            try {
              const trip = await ops.createTrip({
                vesselId: g('#t-vessel'),
                departurePort: g('#t-dep-port'),
                returnPort: g('#t-ret-port'),
                plannedDepartAt: toISO(g('#t-dep')),
                plannedReturnAt: toISO(g('#t-ret')),
                notes: g('#t-notes')
              });
              toast(`Trip ${trip.reference} created (Planned).`, 'success');
              await paint(content.querySelector('#trip-filter').value);
              openTripModal(trip.id);
            } catch (err) {
              toast(err?.message || 'Could not create the trip.', 'error', 6000);
              return true;
            }
          }
        }
      ]
    });
  }

  /* ---------------- Trip detail ---------------- */
  async function openTripModal(tripId) {
    const trip = await ops.getTrip(tripId);
    if (!trip) { toast('Trip not found.', 'error'); return; }
    const st = tripStatus(trip.status);
    const [assignments, crew, openEvents] = await Promise.all([
      ops.listAssignments({ tripId }),
      ops.listCrew(),
      ops.openClockEventsForTrip(tripId)
    ]);
    const vessels = await ops.listVessels();
    const statusIndex = TRIP_STATUSES.findIndex(s => s.key === trip.status);
    const endedAssignments = assignments.filter(a => a.status === 'ended');
    const activeAssignments = assignments.filter(a => a.status === 'active');

    const pipeline = `
      <div class="status-pipeline">
        ${TRIP_STATUSES.map((s, i) => `
          <div class="pipe-step ${i < statusIndex ? 'done' : i === statusIndex ? 'current' : ''}" title="${esc(s.label)}">
            <span class="pipe-dot">${i < statusIndex ? icon('check', 11) : ''}</span>
            <span class="pipe-label">${esc(s.label)}</span>
          </div>`).join('')}
      </div>`;

    openModal({
      title: `${trip.reference} — ${trip.vesselName}`,
      icon: st.icon,
      body: `
        ${pipeline}
        <div class="row" style="gap:.5rem;flex-wrap:wrap;margin:.2rem 0 .8rem">
          <span class="badge badge-${esc(st.color)}">${esc(st.label)}</span>
          ${CLOCKABLE_TRIP_STATUSES.includes(trip.status)
            ? '<span class="badge badge-teal">Clocking open</span>'
            : '<span class="badge badge-neutral">Clocking closed</span>'}
          ${openEvents.length ? `<span class="badge badge-warning">${openEvents.length} crew clocked in now</span>` : ''}
        </div>

        ${canManageTrips && st.next ? `
          <div class="note" style="margin-bottom:.8rem">
            ${icon('flag', 16)}<div>Next step: <b>${esc(tripStatus(st.next).label)}</b>.
            <button class="btn btn-primary btn-sm" id="advance-trip" style="margin-left:.6rem">${esc(st.nextLabel)} →</button></div>
          </div>` : ''}
        ${canManageTrips && trip.status === 'planned' ? `
          <button class="btn btn-danger btn-sm" id="delete-trip" style="margin-bottom:.8rem">${icon('trash', 14)} Delete planned trip</button>` : ''}

        <div class="profile-grid">
          <div class="profile-item"><div class="k">Departure port</div><div class="v">${esc(trip.departurePort || '—')}</div></div>
          <div class="profile-item"><div class="k">Return port</div><div class="v">${esc(trip.returnPort || '—')}</div></div>
          <div class="profile-item"><div class="k">Planned departure</div><div class="v">${esc(trip.plannedDepartAt ? fmtDateTime(trip.plannedDepartAt) : '—')}</div></div>
          <div class="profile-item"><div class="k">Planned return</div><div class="v">${esc(trip.plannedReturnAt ? fmtDateTime(trip.plannedReturnAt) : '—')}</div></div>
          <div class="profile-item"><div class="k">Actually departed</div><div class="v">${esc(trip.actualDepartAt ? fmtDateTime(trip.actualDepartAt) : '—')}</div></div>
          <div class="profile-item"><div class="k">Actually returned</div><div class="v">${esc(trip.actualReturnAt ? fmtDateTime(trip.actualReturnAt) : '—')}</div></div>
        </div>
        ${trip.notes ? `<p class="text-small" style="margin:.6rem 0 0">${icon('info', 14)} ${esc(trip.notes)}</p>` : ''}

        <div class="divider-label">Crew assignments (${activeAssignments.length} onboard · ${endedAssignments.length} in history)</div>
        ${assignments.length ? `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Crew member</th><th>Assigned</th><th>By</th><th>Ended</th><th>Status</th>${canManageAssignments && activeAssignments.length ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${assignments.map((a) => `
                <tr>
                  <td class="cell-strong">${esc(a.crewName)} <span class="text-xs text-muted">${esc(a.crewId)}</span></td>
                  <td class="text-small nowrap">${esc(fmtDateTime(a.assignedAt))}</td>
                  <td class="text-small">${esc(a.assignedBy)}</td>
                  <td class="text-small nowrap">${esc(a.endedAt ? fmtDateTime(a.endedAt) : '—')}</td>
                  <td><span class="badge ${a.status === 'active' ? 'badge-success' : 'badge-neutral'}">${a.status === 'active' ? 'Onboard' : 'Ended'}</span></td>
                  ${canManageAssignments && a.status === 'active' ? `<td><button class="btn btn-outline btn-sm" data-end="${esc(a.id)}">${icon('x', 13)} Remove</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table></div>`
          : '<p class="text-small text-muted" style="margin:0">No crew assigned yet.</p>'}

        ${canManageAssignments && !['closed', 'approved'].includes(trip.status) ? `
          <div class="row" style="gap:.5rem;margin-top:.8rem;flex-wrap:wrap">
            <select class="input" id="assign-crew" style="max-width:320px">
              <option value="">Choose a crew member…</option>
              ${crew.filter(c => c.employmentStatus === 'active' && !activeAssignments.some(a => a.crewId === c.id))
                    .map(c => `<option value="${esc(c.id)}">${esc(c.fullName)} (${esc(c.id)}) — ${esc(c.position || '')}</option>`).join('')}
            </select>
            <button class="btn btn-primary btn-sm" id="assign-add">${icon('plus', 15)} Assign to this trip</button>
          </div>
          <p class="text-xs text-muted" style="margin:.4rem 0 0">One live assignment per crew member — end the previous one first if they are still on another trip.</p>` : ''}

        <div class="divider-label">Status history (permanent record)</div>
        <div class="clocking-list">
          ${(trip.statusHistory || []).slice().reverse().map((h) => `
            <div class="clocking-item">
              <div class="ci-main">
                <span class="badge badge-${esc(tripStatus(h.status).color)}">${esc(tripStatus(h.status).label)}</span>
                <span class="text-small">${esc(h.note || '')}</span>
              </div>
              <div class="ci-side">
                <span class="text-xs text-muted">${esc(fmtDateTime(h.at))} · by ${esc(h.by)}</span>
              </div>
            </div>`).join('')}
        </div>

        <div class="divider-label">Vessel</div>
        <p class="text-small" style="margin:0">${icon('ship', 14)} ${esc(vessels.find(v => v.id === trip.vesselId)?.name || trip.vesselName)}</p>`,
      wide: true,
      actions: [{ label: 'Close', kind: 'btn-outline' }]
    });

    const modal = document.querySelector('.modal-overlay:last-child');
    const closeThis = () => { const c = modal.querySelector('[data-close]'); if (c) c.click(); };
    const advanceBtn = modal.querySelector('#advance-trip');
    if (advanceBtn) advanceBtn.addEventListener('click', async () => {
      advanceBtn.disabled = true;
      try {
        await ops.advanceTripStatus(tripId);
        toast('Trip status updated.', 'success');
        await paint(content.querySelector('#trip-filter').value);
        closeThis();
        openTripModal(tripId);
      } catch (err) {
        toast(err?.message || 'Could not update the trip.', 'error', 6500);
        advanceBtn.disabled = false;
      }
    });

    const deleteBtn = modal.querySelector('#delete-trip');
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Delete ${trip.reference}?`,
        message: 'This planned trip has no assignments and no clockings, so it can be removed. This cannot be undone.',
        confirmLabel: 'Delete trip', danger: true
      });
      if (!ok) return;
      try {
        await ops.deleteTripIfSafe(tripId);
        toast(`Trip ${trip.reference} deleted.`, 'success');
        modal.remove();
        await paint(content.querySelector('#trip-filter').value);
      } catch (err) {
        toast(err?.message || 'Could not delete.', 'error', 6000);
      }
    });

    modal.querySelectorAll('[data-end]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await ops.endAssignment(b.dataset.end);
        toast('Assignment ended — history preserved.', 'success');
        await paint(content.querySelector('#trip-filter').value);
        closeThis();
        openTripModal(tripId);
      } catch (err) {
        toast(err?.message || 'Could not end the assignment.', 'error', 6000);
      }
    }));

    const addBtn = modal.querySelector('#assign-add');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const crewId = modal.querySelector('#assign-crew').value;
      if (!crewId) { toast('Choose a crew member first.', 'warn'); return; }
      try {
        const a = await ops.addAssignment({ crewId, tripId });
        toast(`${a.crewName} assigned to ${a.tripRef}.`, 'success');
        await paint(content.querySelector('#trip-filter').value);
        closeThis();
        openTripModal(tripId);
      } catch (err) {
        toast(err?.message || 'Could not assign.', 'error', 6500);
      }
    });
  }

  const addBtn = content.querySelector('#add-trip');
  if (addBtn) addBtn.addEventListener('click', openCreateModal);
  content.querySelector('#trip-filter').addEventListener('change', (e) => paint(e.target.value));

  await paint();
}
