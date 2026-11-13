/**
 * attendance.screen.js — Attendance & Hours (Phase 4 scope).
 *
 * Phase 2 showed the RAW clock events. Phase 4 adds, on top of the same
 * never-edited records:
 *   - the five HOUR CATEGORIES per event (ordinary, overtime, night, Sunday,
 *     public holiday), calculated automatically by hours.service.js;
 *   - BREAK minutes and NET worked time per event;
 *   - SUPERVISOR CORRECTIONS with a mandatory reason — the original times
 *     stay preserved in the record and every correction is listed;
 *   - REST-PERIOD warnings when the gap between two shifts is too short;
 *   - a per-day category breakdown for any date you pick.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, openModal } from '../../core/ui.js';
import * as ops from '../../core/operations.service.js';
import * as hours from '../../core/hours.service.js';
import { getAll, STORES } from '../../core/idb.js';
import { fmtDate, fmtTime, minutesToHHMM, todayKey, localDateKey } from '../../core/time.js';
import { can, CAPABILITIES } from '../../core/permissions.js';
import { HOUR_CATEGORIES, APP } from '../../config.js';

const CAT_BADGE = {
  ordinary: 'badge-info', overtime: 'badge-warning', night: 'badge-navy',
  sunday: 'badge-violet', public_holiday: 'badge-teal'
};

/** One line of category chips (0-minute categories hidden). */
function catChips(cats) {
  if (!cats) return '<span class="text-xs text-muted">not calculated</span>';
  const parts = HOUR_CATEGORIES
    .filter(c => (cats[c.key] || 0) > 0)
    .map(c => `<span class="badge ${CAT_BADGE[c.key]}" title="${esc(c.label)}">${esc(c.label)} ${esc(minutesToHHMM(cats[c.key]))}</span>`);
  return parts.length ? parts.join(' ') : '<span class="text-xs text-muted">0 minutes</span>';
}

/** datetime-local input value from an ISO string, Namibian time. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const g = (t) => p.find(x => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

export async function render(root, ctx) {
  const [trips, crew] = await Promise.all([ops.listTrips(), ops.listCrew()]);
  const canCorrect = can(ctx.session.role, CAPABILITIES.CORRECT_ATTENDANCE);
  const dayKey = todayKey();

  const body = `
    <div class="banner banner-info">${icon('info', 18)}<div>
      <b>Phase 4: hours are now categorised automatically.</b> Ordinary, overtime, night (22:00–05:00),
      Sunday and public-holiday minutes are calculated from the clock records below — the records
      themselves are never edited. Supervisors correct mistakes with a visible reason; the original
      times are always preserved.
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
      <button class="btn btn-outline btn-sm" id="btn-recalc" title="Recalculate hour categories for the filtered trip">${icon('refresh', 16)} Recalculate categories</button>
      <span class="text-small text-muted" id="ev-count"></span>
    </div>

    <div class="stat-grid" id="att-stats" style="margin-top:1rem"></div>

    <div id="att-table"></div>

    <div class="card" id="day-card" style="margin-top:1rem"></div>

    <div class="card" id="by-crew-card" style="margin-top:1rem"></div>

    <p class="text-xs text-muted" style="margin:.8rem 0 0">
      ${icon('clock', 14)} All times stored in UTC and displayed in ${esc(APP.timezone)}. A shift crossing midnight belongs
      to the day its clock-in happened, but its minutes after midnight count on the new day. Breaks do not count as worked time.
      Rest warnings appear when two shifts of the same person are less than 11 hours apart (adjustable in Settings).
    </p>`;

  const content = renderAdminShell(root, ctx, { title: 'Attendance & Hours', navKey: 'attendance', body });

  async function collectEvents() {
    const ft = content.querySelector('#f-trip').value;
    const fc = content.querySelector('#f-crew').value;
    const fs = content.querySelector('#f-status').value;
    let events = await getAll(STORES.CLOCK_EVENTS);
    if (ft) events = events.filter(e => e.tripId === ft);
    if (fc) events = events.filter(e => e.employeeId === fc);
    if (fs) events = events.filter(e => e.status === fs);
    return events.sort((a, b) => String(b.clockInAt).localeCompare(String(a.clockInAt)));
  }

  /* ---------- the correction dialog (supervisors and above) ---------- */
  function openCorrection(event) {
    const original = event.corrected
      ? `<p class="text-xs text-muted" style="margin:0 0 .6rem">${icon('info', 14)} This event was corrected before — the times below are the CURRENT times; the very first original is kept inside the record.</p>`
      : '';
    openModal({
      title: `Correct clock event — ${event.crewName}`,
      icon: 'edit',
      wide: true,
      body: `
        ${original}
        <div class="form-grid">
          <label class="field"><span>Clock in (Namibian time) *</span>
            <input class="input" type="datetime-local" id="corr-in" value="${esc(toLocalInput(event.clockInAt))}"></label>
          <label class="field"><span>Clock out (Namibian time) *</span>
            <input class="input" type="datetime-local" id="corr-out" value="${esc(toLocalInput(event.clockOutAt))}"></label>
        </div>
        <label class="field" style="margin-top:.8rem"><span>Reason for the correction (required, kept forever) *</span>
          <textarea class="input" id="corr-reason" rows="3" maxlength="300"
            placeholder="e.g. Frans clocked in on the wrong phone — actual start confirmed by the skipper's deck log."></textarea></label>
        ${event.correctionHistory?.length ? `
        <div class="banner banner-info" style="margin-top:.8rem">${icon('activity', 16)}<div>
          <b>Correction history (${event.correctionHistory.length})</b>
          ${event.correctionHistory.map(h => `
            <div class="text-xs" style="margin-top:.3rem">
              ${esc(fmtDate(h.at))} ${esc(fmtTime(h.at))} — ${esc(h.by)}: ${esc(h.reason)}
              ${h.changes.clockInAt ? `<br>Clock in: ${esc(fmtDateTimeShort(h.changes.clockInAt.from))} → ${esc(fmtDateTimeShort(h.changes.clockInAt.to))}` : ''}
              ${h.changes.clockOutAt ? `<br>Clock out: ${esc(fmtDateTimeShort(h.changes.clockOutAt.from))} → ${esc(fmtDateTimeShort(h.changes.clockOutAt.to))}` : ''}
            </div>`).join('')}
        </div></div>` : ''}
      `,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Save correction', kind: 'btn-primary',
          onClick: async (overlay) => {
            const inVal = overlay.querySelector('#corr-in').value;
            const outVal = overlay.querySelector('#corr-out').value;
            const reason = overlay.querySelector('#corr-reason').value.trim();
            if (!reason) { toast('A reason is required — corrections are never anonymous.', 'warn', 5000); return true; }
            if (!inVal || !outVal) { toast('Both times are required.', 'warn'); return true; }
            // datetime-local is wall time in Namibia (UTC+2, no DST since 2017).
            const inAt = new Date(inVal + ':00+02:00').toISOString();
            const outAt = new Date(outVal + ':00+02:00').toISOString();
            try {
              await hours.correctClockEvent(event.id, { clockInAt: inAt, clockOutAt: outAt, reason });
              toast('Correction saved. The original times are preserved in the record.', 'success');
              await paint();
              return false;
            } catch (err) {
              toast(err?.message || 'Could not save the correction.', 'error', 6000);
              return true;
            }
          }
        }
      ]
    });
  }
  function fmtDateTimeShort(iso) {
    return iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '—';
  }

  async function paint() {
    const events = await collectEvents();
    const total = events.length;

    const openNow = events.filter(e => e.status === 'open').length;
    const closed = events.filter(e => e.status === 'closed');
    const totalMins = closed.reduce((s, e) => s + (e.netWorkedMinutes ?? e.durationMinutes ?? 0), 0);
    const catTotals = { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0 };
    for (const e of closed) {
      if (e.categories) for (const k of Object.keys(catTotals)) catTotals[k] += e.categories[k] || 0;
    }
    const totalBreaks = closed.reduce((s, e) => s + (e.breakMinutes || 0), 0);

    content.querySelector('#att-stats').innerHTML = `
      <div class="stat-card"><div class="stat-label">${icon('clock', 15)} Events shown</div><div class="stat-value">${events.length}</div><div class="stat-sub">open + completed</div></div>
      <div class="stat-card"><div class="stat-label">${icon('user', 15)} Clocked in now</div><div class="stat-value">${openNow}</div><div class="stat-sub">open clock events</div></div>
      <div class="stat-card"><div class="stat-label">${icon('activity', 15)} Net worked time</div><div class="stat-value">${esc(minutesToHHMM(totalMins))}</div><div class="stat-sub">breaks (${esc(minutesToHHMM(totalBreaks))}) excluded</div></div>
      <div class="stat-card"><div class="stat-label">${icon('moon', 15)} Night / Sunday / Holiday</div><div class="stat-value">${esc(minutesToHHMM(catTotals.night + catTotals.sunday + catTotals.public_holiday))}</div><div class="stat-sub">of which ${esc(minutesToHHMM(catTotals.overtime))} overtime</div></div>`;

    content.querySelector('#ev-count').textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;

    /* Rest warnings: same person, consecutive closed events, gap < threshold. */
    const settings = await hours.getHoursSettings();
    const byPerson = new Map();
    for (const e of closed) {
      if (!byPerson.has(e.employeeId)) byPerson.set(e.employeeId, []);
      byPerson.get(e.employeeId).push(e);
    }
    const restFlags = [];
    for (const list of byPerson.values()) {
      list.sort((a, b) => String(a.clockInAt).localeCompare(String(b.clockInAt)));
      for (let i = 1; i < list.length; i++) {
        const gap = hours.restMinutesBetween(list[i - 1], list[i]);
        if (gap !== null && gap < settings.minRestMinutes) {
          restFlags.push({ name: list[i].crewName, gap, from: list[i - 1].clockOutAt, to: list[i].clockInAt });
        }
      }
    }

    content.querySelector('#att-table').innerHTML = events.length ? `
      ${restFlags.length ? `
      <div class="banner banner-warn" style="margin-bottom:1rem">${icon('alert', 18)}<div>
        <b>${restFlags.length} rest-period warning${restFlags.length === 1 ? '' : 's'}.</b>
        ${restFlags.slice(0, 3).map(f =>
          `${esc(f.name)} rested only ${esc(minutesToHHMM(f.gap))} between shifts (${esc(fmtTime(f.from))} → ${esc(fmtTime(f.to))}).`).join('<br>')}
        ${restFlags.length > 3 ? `<br>…and ${restFlags.length - 3} more.` : ''}
        Warnings are recorded for review — they never block clocking at sea.
      </div></div>` : ''}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Crew member</th><th>Trip</th><th>Clock in</th><th>Clock out</th><th>Break</th><th>Net time</th><th>Hour categories</th><th>${canCorrect ? 'Actions' : 'Sync'}</th></tr></thead>
        <tbody>
          ${events.map((e) => `
            <tr>
              <td><span class="cell-strong">${esc(e.crewName)}</span>
                <div class="text-xs text-muted">${esc(e.employeeId || '')}${e.corrected ? ' · <span class="badge badge-warning">corrected</span>' : ''}</div></td>
              <td class="text-small nowrap">${esc(e.tripRef)}<div class="text-xs text-muted">${esc(e.vesselName)}</div></td>
              <td class="text-small nowrap">${esc(fmtDate(e.clockInAt))} ${esc(fmtTime(e.clockInAt))}</td>
              <td class="text-small nowrap">${e.clockOutAt ? `${esc(fmtDate(e.clockOutAt))} ${esc(fmtTime(e.clockOutAt))}` : '<span class="badge badge-teal">clocked in</span>'}</td>
              <td class="text-small nowrap">${e.breakMinutes ? esc(minutesToHHMM(e.breakMinutes)) : '—'}</td>
              <td class="text-small nowrap">${e.status === 'closed' ? `<b>${esc(minutesToHHMM(e.netWorkedMinutes ?? (e.durationMinutes || 0)))}</b>` : '—'}</td>
              <td>${e.status === 'closed' ? catChips(e.categories) : '<span class="text-xs text-muted">on completion</span>'}</td>
              <td class="nowrap">${canCorrect && e.status === 'closed'
                ? `<button class="btn btn-outline btn-sm" data-correct="${esc(e.id)}">${icon('edit', 14)} Correct</button>`
                : `<span class="badge ${e.syncStatus === 'synchronised' ? 'badge-success' : 'badge-neutral'}">${esc(e.syncStatus || 'saved locally')}</span>`}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="empty-state">${icon('clock', 30)}<div class="title">No clock events for this filter</div><p>Try clearing the filters — or wait for the crew to clock in.</p></div>`;

    content.querySelectorAll('[data-correct]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const ev = events.find(x => x.id === btn.dataset.correct);
        if (ev) openCorrection(ev);
      }));

    /* ---------- per-day breakdown card ---------- */
    const dayCrewSel = `<select class="input" id="day-crew" style="width:auto;padding:.4rem .6rem">
      ${crew.map(c => `<option value="${esc(c.id)}" ${c.id === (events[0]?.employeeId || crew[0]?.id) ? 'selected' : ''}>${esc(c.fullName)}</option>`).join('')}
    </select>`;
    content.querySelector('#day-card').innerHTML = `
      <div class="card-title">${icon('calendar', 18)} One day, in categories</div>
      <div class="table-toolbar" style="margin:0 0 .8rem">
        ${dayCrewSel}
        <input class="input" id="day-date" type="date" value="${dayKey}" style="width:auto;padding:.4rem .6rem">
      </div>
      <div id="day-detail"></div>`;

    async function paintDay() {
      const emp = content.querySelector('#day-crew').value;
      const dk = content.querySelector('#day-date').value;
      if (!emp || !dk) { content.querySelector('#day-detail').innerHTML = '<p class="text-small text-muted" style="margin:0">Pick a crew member and a date.</p>'; return; }
      const { rows, total, breaksTotal } = await hours.dayCategoriesFor(emp, dk);
      content.querySelector('#day-detail').innerHTML = rows.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Clock in</th><th>Clock out</th><th>Break</th><th>Net</th><th>Categories</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td class="text-small nowrap">${esc(fmtTime(r.event.clockInAt))}</td>
              <td class="text-small nowrap">${esc(fmtTime(r.event.clockOutAt))}</td>
              <td class="text-small">${r.breakMinutes ? esc(minutesToHHMM(r.breakMinutes)) : '—'}</td>
              <td class="text-small"><b>${esc(minutesToHHMM(r.netMinutes))}</b></td>
              <td>${catChips(r.cats)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        <div style="margin-top:.8rem">${catChips(total)}
          <span class="text-xs text-muted" style="margin-left:.5rem">day total (net ${esc(minutesToHHMM(rows.reduce((s, r) => s + r.netMinutes, 0)))}, breaks ${esc(minutesToHHMM(breaksTotal))})</span></div>`
        : `<p class="text-small text-muted" style="margin:0">No completed shifts started on this date for this crew member.</p>`;
    }
    content.querySelector('#day-crew').addEventListener('change', paintDay);
    content.querySelector('#day-date').addEventListener('change', paintDay);
    await paintDay();

    /* ---------- totals by crew member with categories ---------- */
    const byCrew = new Map();
    for (const e of closed) {
      const key = e.employeeId || e.crewName;
      const cur = byCrew.get(key) || {
        name: e.crewName, id: e.employeeId, mins: 0, events: 0,
        cats: { ordinary: 0, overtime: 0, night: 0, sunday: 0, public_holiday: 0 }
      };
      cur.mins += e.netWorkedMinutes ?? e.durationMinutes ?? 0;
      cur.events += 1;
      if (e.categories) for (const k of Object.keys(cur.cats)) cur.cats[k] += e.categories[k] || 0;
      byCrew.set(key, cur);
    }
    const rows2 = [...byCrew.values()].sort((a, b) => b.mins - a.mins);
    content.querySelector('#by-crew-card').innerHTML = `
      <div class="card-title">${icon('activity', 18)} Totals by crew member (this view)</div>
      ${rows2.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Crew member</th><th>Events</th><th>Net time</th><th>Categories</th></tr></thead>
        <tbody>${rows2.map(r => `
          <tr>
            <td class="cell-strong">${esc(r.name)} <span class="text-xs text-muted">${esc(r.id || '')}</span></td>
            <td class="text-small">${r.events}</td>
            <td class="text-small"><b>${esc(minutesToHHMM(r.mins))}</b></td>
            <td>${catChips(r.cats)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <p class="text-xs text-muted" style="margin:.6rem 0 0">These category totals feed payroll in Phase 5 — priced only from verified statutory rules and contracts.</p>`
      : '<p class="text-small text-muted" style="margin:0">Nothing to total yet.</p>'}`;

    /* ---------- recalculate button ---------- */
    const recalc = content.querySelector('#btn-recalc');
    recalc.disabled = true;
    recalc.title = 'Available when a trip is selected';
    const tripSel = content.querySelector('#f-trip');
    const syncRecalcAvail = () => {
      recalc.disabled = !tripSel.value;
      recalc.title = tripSel.value ? 'Recalculate hour categories for this trip' : 'Choose a trip first';
    };
    syncRecalcAvail();
    recalc.addEventListener('click', async () => {
      if (!tripSel.value) return;
      recalc.disabled = true;
      try {
        const n = await hours.reclassifyTrip(tripSel.value);
        toast(`Recalculated hour categories for ${n} event${n === 1 ? '' : 's'}.`, 'success');
        await paint();
      } catch (err) {
        toast(err?.message || 'Recalculation failed.', 'error', 6000);
        recalc.disabled = false;
      }
    });
  }

  ['#f-trip', '#f-crew', '#f-status'].forEach(sel =>
    content.querySelector(sel).addEventListener('change', paint));

  await paint();
}
