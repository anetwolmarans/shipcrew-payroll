/**
 * attendance.screen.js — Attendance & Hours (Phase 2 scope).
 *
 * Phase 2 shows the RAW clock events: who clocked in and out, when, on which
 * trip and vessel, for how long — filterable and with totals. Every event
 * carries its sync state ("saved locally / waiting to sync / synchronised").
 *
 * Phase 4 will add on top of this exact data: hour categories (ordinary,
 * overtime, night, Sunday, public holiday), breaks & rest periods and
 * supervisor corrections with preserved originals.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc } from '../../core/ui.js';
import * as ops from '../../core/operations.service.js';
import { getAll, STORES } from '../../core/idb.js';
import { fmtDate, fmtTime, fmtDateTime, minutesToHHMM } from '../../core/time.js';
import { APP } from '../../config.js';

export async function render(root, ctx) {
  const [trips, crew] = await Promise.all([ops.listTrips(), ops.listCrew()]);

  const body = `
    <div class="banner banner-info">${icon('info', 18)}<div>
      <b>Phase 2 view: raw clockings.</b> Crew clock themselves in and out against their assigned trip.
      Hour categories (ordinary, overtime, night work, Sunday, public holiday), breaks and supervisor
      corrections arrive in Phase 4 — calculated from these same records, which are never edited.
    </div></div>

    <div class="table-toolbar" style="margin-top:1rem">
      <select class="input" id="f-trip" style="width:auto;padding:.4rem .6rem">
        <option value="">All trips</option>
        ${trips.map(t => `<option value="${esc(t.id)}">${esc(t.reference)} — ${esc(t.vesselName)}</option>`).join('')}
      </select>
      <select class="input" id="f-crew" style="width:auto;padding:.4rem .6rem">
        <option value="">All crew</option>
        ${crew.map(c => `<option value="${esc(c.id)}">${esc(c.fullName)} (${esc(c.id)})</option>`).join('')}
      </select>
      <select class="input" id="f-status" style="width:auto;padding:.4rem .6rem">
        <option value="">Open &amp; closed</option>
        <option value="open">Clocked in now</option>
        <option value="closed">Completed</option>
      </select>
      <span class="text-small text-muted" id="ev-count"></span>
    </div>

    <div class="stat-grid" id="att-stats" style="margin-top:1rem"></div>

    <div id="att-table"></div>

    <div class="card" id="by-crew-card" style="margin-top:1rem"></div>

    <p class="text-xs text-muted" style="margin:.8rem 0 0">
      ${icon('clock', 14)} All times stored in UTC and displayed in ${esc(APP.timezone)}. A shift crossing midnight belongs to the day its clock-in happened.
      Duplicate clock-ins, clock-outs without a clock-in, and clocking against trips that are not Open/At Sea are blocked by the system.
    </p>`;

  const content = renderAdminShell(root, ctx, { title: 'Attendance & Hours', navKey: 'attendance', body });

  async function paint() {
    const ft = content.querySelector('#f-trip').value;
    const fc = content.querySelector('#f-crew').value;
    const fs = content.querySelector('#f-status').value;

    let events = await getAll(STORES.CLOCK_EVENTS);
    const total = events.length;
    if (ft) events = events.filter(e => e.tripId === ft);
    if (fc) events = events.filter(e => e.employeeId === fc);
    if (fs) events = events.filter(e => e.status === fs);
    events.sort((a, b) => String(b.clockInAt).localeCompare(String(a.clockInAt)));

    const openNow = events.filter(e => e.status === 'open').length;
    const totalMins = events.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
    content.querySelector('#att-stats').innerHTML = `
      <div class="stat-card"><div class="stat-label">${icon('clock', 15)} Events shown</div><div class="stat-value">${events.length}</div><div class="stat-sub">of ${total} recorded on this device</div></div>
      <div class="stat-card"><div class="stat-label">${icon('user', 15)} Clocked in now</div><div class="stat-value">${openNow}</div><div class="stat-sub">open clock events</div></div>
      <div class="stat-card"><div class="stat-label">${icon('activity', 15)} Recorded time</div><div class="stat-value">${esc(minutesToHHMM(totalMins))}</div><div class="stat-sub">completed events in this view</div></div>
      <div class="stat-card"><div class="stat-label">${icon('refresh', 15)} Waiting to sync</div><div class="stat-value">${events.filter(e => e.syncStatus && e.syncStatus !== 'synchronised').length}</div><div class="stat-sub">uploads when online</div></div>`;

    content.querySelector('#ev-count').textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;

    content.querySelector('#att-table').innerHTML = events.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Crew member</th><th>Trip</th><th>Clock in</th><th>Clock out</th><th>Duration</th><th>Device</th><th>Sync</th></tr></thead>
        <tbody>
          ${events.map((e) => `
            <tr>
              <td><span class="cell-strong">${esc(e.crewName)}</span><div class="text-xs text-muted">${esc(e.employeeId || '')}</div></td>
              <td class="text-small nowrap">${esc(e.tripRef)}<div class="text-xs text-muted">${esc(e.vesselName)}</div></td>
              <td class="text-small nowrap">${esc(fmtDate(e.clockInAt))} ${esc(fmtTime(e.clockInAt))}</td>
              <td class="text-small nowrap">${e.clockOutAt ? `${esc(fmtDate(e.clockOutAt))} ${esc(fmtTime(e.clockOutAt))}` : '<span class="badge badge-teal">clocked in</span>'}</td>
              <td class="text-small nowrap">${e.status === 'closed' ? esc(minutesToHHMM(e.durationMinutes || 0)) : '—'}</td>
              <td class="text-xs text-muted">${esc(e.deviceName || '—')}</td>
              <td><span class="badge ${e.syncStatus === 'synchronised' ? 'badge-success' : 'badge-neutral'}">${esc(e.syncStatus || 'saved locally')}</span></td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="empty-state">${icon('clock', 30)}<div class="title">No clock events for this filter</div><p>Try clearing the filters — or wait for the crew to clock in.</p></div>`;

    /* Totals by crew member (raw durations; categories arrive in Phase 4) */
    const byCrew = new Map();
    for (const e of events) {
      const key = e.employeeId || e.crewName;
      const cur = byCrew.get(key) || { name: e.crewName, id: e.employeeId, mins: 0, events: 0 };
      cur.mins += e.durationMinutes ?? 0;
      cur.events += 1;
      byCrew.set(key, cur);
    }
    const rows = [...byCrew.values()].sort((a, b) => b.mins - a.mins);
    content.querySelector('#by-crew-card').innerHTML = `
      <div class="card-title">${icon('activity', 18)} Totals by crew member (this view)</div>
      ${rows.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Crew member</th><th>Events</th><th>Recorded time</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr><td class="cell-strong">${esc(r.name)} <span class="text-xs text-muted">${esc(r.id || '')}</span></td>
          <td class="text-small">${r.events}</td><td class="text-small">${esc(minutesToHHMM(r.mins))}</td></tr>`).join('')}
        </tbody>
      </table></div>
      <p class="text-xs text-muted" style="margin:.6rem 0 0">These are raw clock durations. Payroll categories (ordinary vs overtime vs night…) are calculated in Phase 4 under the verified fisher regulations.</p>`
      : '<p class="text-small text-muted" style="margin:0">Nothing to total yet.</p>'}`;
  }

  ['#f-trip', '#f-crew', '#f-status'].forEach(sel =>
    content.querySelector(sel).addEventListener('change', paint));

  await paint();
}
