/**
 * home.screen.js — The CREW screen. Deliberately simple for phones at sea:
 * two big buttons (CLOCK IN / CLOCK OUT), my trip, my hours today, my recent
 * clockings, my profile, my payslips, sync state.
 *
 * RULES THAT SHAPE THIS SCREEN (enforced in operations.service.js, mirrored
 * in the Firebase server rules):
 *  - You clock YOURSELF in and out — nobody can do it for you, and you can
 *    never clock for someone else.
 *  - You can only clock in against a trip you are assigned to that is Open
 *    or At Sea.
 *  - You cannot clock in twice; you cannot clock out without a clock-in.
 *  - Everything saves on the device first (offline-first) and syncs later.
 */
import { currentSession, logout } from '../../core/auth.service.js';
import * as store from '../../core/store.js';
import * as ops from '../../core/operations.service.js';
import * as hours from '../../core/hours.service.js';
import { icon, esc, avatarInitials, toast, updateSyncChips, openModal } from '../../core/ui.js';
import { state as syncState } from '../../core/sync.service.js';
import { fmtDate, fmtDateTime, fmtTime, minutesToHHMM, tzOffsetLabel, todayKey } from '../../core/time.js';
import { isFirebaseConfigured } from '../../firebase-config.js';
import { APP, tripStatus, HOUR_CATEGORIES } from '../../config.js';
import { go } from '../../core/router.js';
import * as payroll from '../../core/payroll.service.js';
import { downloadPayslipPdf } from '../../core/payslip-pdf.js';
import { getCompany } from '../../core/store.js';
import { fmtNAD } from '../../core/ui.js';
import { centsToNAD } from '../../core/payroll.service.js';
import * as queries from '../../core/queries.service.js';
import { QUERY_CATEGORIES } from '../../core/queries.service.js';
import { on as onEvent } from '../../core/events.js';

export async function render(root, ctx) {
  const session = currentSession();
  let timer = null;

  async function paint() {
    const crew = await store.getCrewByUserId(session.userId);
    const sync = await syncState();

    const assignment = crew ? await ops.activeAssignmentForCrew(crew.id) : null;
    const trip = assignment?.trip || null;
    const openEvent = await ops.myOpenClockEvent(session.userId);
    const clocked = !!openEvent;
    const onBreak = openEvent ? await hours.myOpenBreak(openEvent.id) : null;
    const workedToday = crew ? await ops.minutesWorkedOn(session.userId, todayKey()) : 0;
    const recent = crew ? await ops.myClockEvents(session.userId, 5) : [];
    const todayCats = crew ? await hours.dayCategoriesFor(crew.id, todayKey()) : null;
    const mySlips = await payroll.myPayslips(session.userId);
    const myQueries = await queries.myPayslipQueries(session.userId);

    const statusDef = trip ? tripStatus(trip.status) : null;

    /* Today's categories as chips (crew sees their own hours in categories). */
    const catChips = todayCats && todayCats.total
      ? HOUR_CATEGORIES
          .filter(c => (todayCats.total[c.key] || 0) > 0)
          .map(c => `<span class="badge badge-${c.color}" style="margin:.15rem .2rem">${esc(c.label)} ${esc(minutesToHHMM(todayCats.total[c.key]))}</span>`)
          .join('')
      : '<span class="text-xs text-muted">Hours are categorised (ordinary, overtime, night, Sunday, public holiday) once a shift is completed.</span>';

    root.innerHTML = `
  <div class="crew-wrap">
    <header class="crew-top">
      <div class="crew-top-inner">
        <div class="hello">
          <span class="avatar avatar-lg">${esc(avatarInitials(session.fullName))}</span>
          <span class="who">
            <span class="name">${esc(session.fullName)}</span>
            <span class="pos">${esc(crew?.position || 'Crew member')} · ${esc(crew?.id || '')}</span>
          </span>
        </div>
        <div class="crew-sync">
          <span class="sync-chip" data-sync-chip>${icon('wifi', 14)}<span>…</span></span>
        </div>
      </div>
    </header>

    <main class="crew-main">
      <section class="crew-clock-card" aria-label="Clocking">
        <div class="status-line row" style="justify-content:center">
          ${clocked
            ? `<span class="badge badge-teal"><span class="dot"></span> Clocked in — ${esc(trip ? trip.reference : '')}</span>`
            : `<span class="badge badge-neutral"><span class="dot"></span> Clocked out</span>`}
        </div>
        <div class="live-clock" id="live-clock">--:--</div>
        <div class="live-date" id="live-date">Loading…</div>

        ${clocked ? `
          ${onBreak ? `
            <button class="clock-btn clock-btn-out" id="btn-break-end" style="background:var(--accent-600,#c47d00)">
              ${icon('coffee', 28)} END BREAK
            </button>
            <div class="text-center text-xs text-muted" style="margin-top:.5rem">
              On break since ${esc(fmtTime(onBreak.startedAt))} — break time does not count as worked time.
            </div>
          ` : `
            <button class="clock-btn clock-btn-out" id="btn-clock-out">
              ${icon('logout', 30)} CLOCK OUT
            </button>
            <button class="btn btn-outline" id="btn-break-start" style="width:100%;margin-top:.6rem">
              ${icon('coffee', 18)} Start break
            </button>
            <div class="text-center text-xs text-muted" style="margin-top:.5rem">
              Clocked in at ${esc(fmtTime(openEvent.clockInAt))} Namibian time · trip ${esc(openEvent.tripRef)}
            </div>
          `}
        ` : `
          <button class="clock-btn clock-btn-in" id="btn-clock-in">
            ${icon('clock', 30)} CLOCK IN
          </button>
          <div class="text-center text-xs text-muted" style="margin-top:.5rem">
            ${trip
              ? `Your trip ${esc(trip.reference)} is ${esc(statusDef.label)} — you can clock in.`
              : `Clock in works when your manager assigns you to an Open or At-Sea trip.`}
          </div>
        `}

        <div class="kv-list" style="margin-top:1rem">
          <div class="kv"><span class="k">Today's hours</span><span class="v" id="today-hours">${esc(minutesToHHMM(workedToday))}</span></div>
          <div class="kv"><span class="k">Time zone</span><span class="v">Namibian time · ${esc(tzOffsetLabel())}</span></div>
        </div>
        <div style="margin-top:.7rem">${catChips}</div>
        <div class="banner banner-warn" id="clock-msg" style="display:none;margin-top:.8rem"></div>
      </section>

      <section class="card" aria-label="My vessel and trip">
        <div class="card-title">${icon('ship', 18)} My vessel &amp; trip</div>
        ${trip ? `
        <div class="kv-list">
          <div class="kv"><span class="k">Trip</span><span class="v">${esc(trip.reference)}</span></div>
          <div class="kv"><span class="k">Vessel</span><span class="v">${esc(trip.vesselName)}</span></div>
          <div class="kv"><span class="k">Trip status</span><span class="v"><span class="badge badge-${esc(statusDef.color)}">${esc(statusDef.label)}</span></span></div>
          <div class="kv"><span class="k">Ports</span><span class="v">${esc(trip.departurePort || '—')} → ${esc(trip.returnPort || '—')}</span></div>
          <div class="kv"><span class="k">Planned return</span><span class="v">${esc(trip.plannedReturnAt ? fmtDateTime(trip.plannedReturnAt) : '—')}</span></div>
        </div>` : `
        <div class="empty-state">
          ${icon('anchor', 30)}
          <div class="title">Not assigned to a trip</div>
          <p>Your manager assigns you to a vessel's trip. Clocking opens as soon as that trip is Open or At Sea.</p>
        </div>`}
        <p class="text-xs text-muted" style="margin:.8rem 0 0">Your vessel and trip are assigned by your manager. You can never be clocked against a vessel or trip you are not assigned to.</p>
      </section>

      <section class="card" aria-label="My recent clockings">
        <div class="card-title">${icon('clock', 18)} My recent clockings</div>
        ${recent.length ? `
        <div class="clocking-list">
          ${recent.map((e) => `
            <div class="clocking-item">
              <div class="ci-main">
                <span class="ci-date">${esc(fmtDate(e.clockInAt))}</span>
                <span class="ci-times">${esc(fmtTime(e.clockInAt))} → ${e.clockOutAt ? esc(fmtTime(e.clockOutAt)) : '<b>now</b>'}</span>
              </div>
              <div class="ci-side">
                <span class="text-xs text-muted">${esc(e.tripRef)} · ${esc(e.vesselName)}</span>
                <span class="badge ${e.status === 'closed' ? 'badge-neutral' : 'badge-teal'}">${e.status === 'closed' ? esc(minutesToHHMM(e.durationMinutes || 0)) : 'running'}</span>
              </div>
            </div>`).join('')}
        </div>` : `
        <div class="empty-state">${icon('clock', 30)}<div class="title">No clockings yet</div><p>Your clock in and clock out history will appear here.</p></div>`}
        <p class="text-xs text-muted" style="margin:.8rem 0 0">Shifts that cross midnight count from the day you clocked in. Your hours are split automatically into ordinary, overtime, night (22:00–05:00), Sunday and public-holiday time — you can see today's split above.</p>
      </section>

      <section class="card" aria-label="My profile">
        <div class="card-title">${icon('user', 18)} My profile</div>
        <div class="profile-grid">
          <div class="profile-item"><div class="k">Employee number</div><div class="v">${esc(crew?.id || '—')}</div></div>
          <div class="profile-item"><div class="k">Position</div><div class="v">${esc(crew?.position || '—')}</div></div>
          <div class="profile-item"><div class="k">Phone</div><div class="v">${esc(crew?.phone || '—')}</div></div>
          <div class="profile-item"><div class="k">Emergency contact</div><div class="v">${esc(crew?.emergencyContact || '—')}</div></div>
          <div class="profile-item"><div class="k">Employment start</div><div class="v">${esc(crew?.startDate ? fmtDate(crew.startDate) : '—')}</div></div>
          <div class="profile-item"><div class="k">Employment status</div><div class="v">${esc(crew?.employmentStatus || 'active')}</div></div>
        </div>
        <p class="text-xs text-muted" style="margin:.8rem 0 0">You can view your own profile only. Salary and contract details are managed by the payroll administrator.</p>
      </section>

      <section class="card" aria-label="My payslips">
        <div class="card-title">${icon('file-text', 18)} My payslips</div>
        ${mySlips.length ? `
        <div class="payslip-list">
          ${mySlips.map((s) => {
            const openQ = myQueries.find(q => q.payslipId === s.id && q.status === 'open');
            return `
          <div class="clocking-item">
            <div class="ci-main">
              <span class="ci-date">${esc(s.tripRef)} · ${esc(fmtDate(s.createdAt))}</span>
              <span class="ci-times">Gross ${esc(fmtNAD(centsToNAD(s.grossCents)))} − ${esc(fmtNAD(centsToNAD(s.deductionCents)))}</span>
            </div>
            <div class="ci-side">
              <span class="badge badge-success">Net ${esc(fmtNAD(centsToNAD(s.netCents)))}</span>
              <button class="btn btn-outline btn-sm" data-myview="${esc(s.id)}">${icon('eye', 14)} View</button>
              <button class="btn btn-outline btn-sm" data-mypdf="${esc(s.id)}">${icon('download', 14)} PDF</button>
              ${openQ
                ? `<span class="badge badge-warning" title="A query on this payslip is waiting for an answer">${icon('help', 13)} Query open</span>`
                : `<button class="btn btn-outline btn-sm" data-myquery="${esc(s.id)}">${icon('help', 14)} Query</button>`}
            </div>
          </div>`;}).join('')}
        </div>
        <p class="text-xs text-muted" style="margin:.8rem 0 0">Every payslip stays here permanently. If anything looks wrong, press <b>Query</b> — the payroll team answers it and you will see the answer below under "My queries".</p>` : `
        <div class="empty-state">
          ${icon('file-text', 30)}
          <div class="title">No payslips yet</div>
          <p>Payslips appear here after payroll is approved — and they stay here forever. Only you and the payroll team can see them.</p>
        </div>`}
      </section>

      <section class="card" aria-label="My payslip queries">
        <div class="card-title">${icon('help', 18)} My queries</div>
        ${myQueries.length ? `
        <div class="clocking-list">
          ${myQueries.map((q) => `
          <div class="clocking-item" style="align-items:flex-start">
            <div class="ci-main" style="flex-direction:column;align-items:flex-start;gap:.2rem">
              <span class="ci-date">${esc(q.tripRef || 'Payslip')} · ${esc(fmtDateTime(q.createdAt))}</span>
              <span class="text-small">${esc(q.message)}</span>
              ${q.status === 'answered' ? `
                <span class="text-small" style="background:var(--surface-2);border-radius:8px;padding:.45rem .6rem;margin-top:.2rem">
                  <b>Answer from ${esc(q.respondedBy)}:</b> ${esc(q.response)}
                </span>` : q.status === 'closed' ? `
                <span class="text-small text-muted">Closed by ${esc(q.updatedBy)}: ${esc(q.closedReason)}</span>` : `
                <span class="badge badge-warning">Waiting for an answer</span>`}
            </div>
            <div class="ci-side">
              <span class="badge ${q.status === 'answered' ? 'badge-success' : q.status === 'closed' ? 'badge-neutral' : 'badge-warn'}">${esc(q.status)}</span>
            </div>
          </div>`).join('')}
        </div>` : `
        <div class="empty-state">${icon('help', 30)}<div class="title">No queries</div><p>If a payslip ever looks wrong, open it and press "Query" — your question goes straight to the payroll team.</p></div>`}
        <p class="text-xs text-muted" style="margin:.8rem 0 0">Answers appear on this phone automatically. If an answer confirms a mistake, the payroll team corrects it with an <b>adjustment entry</b> on the next payroll run — your payslip is never quietly changed.</p>
      </section>

      <section class="card" aria-label="Synchronisation">
        <div class="card-title">${icon('refresh', 18)} Saving &amp; synchronising</div>
        <div class="kv-list">
          <div class="kv"><span class="k">Your records</span><span class="v">${sync.online ? '<span class="status-dot status-ok">Internet available</span>' : '<span class="status-dot status-err">Offline — records still save on this device</span>'}</span></div>
          <div class="kv"><span class="k">Last successful sync</span><span class="v">${sync.lastSyncAt ? esc(fmtDateTime(sync.lastSyncAt)) : 'Not yet'}</span></div>
          <div class="kv"><span class="k">Waiting to upload</span><span class="v">${sync.pending} record${sync.pending === 1 ? '' : 's'}</span></div>
        </div>
        <p class="text-xs text-muted" style="margin:.8rem 0 0">Everything you do is saved on this device first, so nothing is lost when the internet drops. Uploads happen by themselves when the connection returns — a repeated upload can never create duplicates.</p>
      </section>

      <footer class="text-center text-xs text-muted" style="padding:.4rem 0 1rem">
        ${esc(APP.name)} · v${APP.version} · Phase ${APP.buildPhase} of ${APP.totalPhases} · ${isFirebaseConfigured() ? 'Connected' : 'Demo mode'}<br>
        <button class="btn btn-outline btn-sm" id="crew-logout" style="margin-top:.6rem">${icon('logout', 16)} Sign out</button>
      </footer>
    </main>
  </div>`;

    /* Live Namibian clock */
    const tick = () => {
      const c = root.querySelector('#live-clock'), d = root.querySelector('#live-date');
      if (!c || !d) return;
      c.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: APP.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
      d.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: APP.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    };
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 1000);

    /* Clock buttons */
    const showMsg = (msg) => {
      const box = root.querySelector('#clock-msg');
      if (box) { box.style.display = 'flex'; box.innerHTML = `${icon('alert', 18)}<div>${esc(msg)}</div>`; }
    };

    const inBtn = root.querySelector('#btn-clock-in');
    if (inBtn) inBtn.addEventListener('click', async () => {
      inBtn.disabled = true;
      try {
        await ops.clockIn();
        toast('Clocked in. Have a safe shift!', 'success');
        await paint();
      } catch (err) {
        toast(err?.message || 'Could not clock in.', 'error', 6000);
        showMsg(err?.message || 'Could not clock in.');
        inBtn.disabled = false;
      }
    });

    const outBtn = root.querySelector('#btn-clock-out');
    if (outBtn) outBtn.addEventListener('click', async () => {
      outBtn.disabled = true;
      try {
        const saved = await ops.clockOut();
        toast(`Clocked out — ${minutesToHHMM(saved.durationMinutes || 0)} recorded.`, 'success');
        await paint();
      } catch (err) {
        toast(err?.message || 'Could not clock out.', 'error', 6000);
        showMsg(err?.message || 'Could not clock out.');
        outBtn.disabled = false;
      }
    });

    /* Break buttons (Phase 4) — breaks do not count as worked time. */
    const breakStartBtn = root.querySelector('#btn-break-start');
    if (breakStartBtn) breakStartBtn.addEventListener('click', async () => {
      breakStartBtn.disabled = true;
      try {
        await hours.startBreak();
        toast('Break started — enjoy your meal.', 'info');
        await paint();
      } catch (err) {
        toast(err?.message || 'Could not start the break.', 'error', 6000);
        breakStartBtn.disabled = false;
      }
    });

    const breakEndBtn = root.querySelector('#btn-break-end');
    if (breakEndBtn) breakEndBtn.addEventListener('click', async () => {
      breakEndBtn.disabled = true;
      try {
        await hours.endBreak();
        toast('Break ended — back to work.', 'info');
        await paint();
      } catch (err) {
        toast(err?.message || 'Could not end the break.', 'error', 6000);
        breakEndBtn.disabled = false;
      }
    });

    /* My payslip PDFs */
    root.querySelectorAll('[data-mypdf]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const slip = mySlips.find(s => s.id === btn.getAttribute('data-mypdf'));
        if (!slip) return;
        const company = await getCompany();
        downloadPayslipPdf(slip, company, { appVersion: APP.version, generatedAt: new Date().toISOString() });
        toast('Payslip PDF downloaded.', 'success');
      }));

    /* My payslip detail — every line, and a Query button if something is wrong */
    root.querySelectorAll('[data-myview]').forEach(btn =>
      btn.addEventListener('click', () => {
        const slip = mySlips.find(s => s.id === btn.getAttribute('data-myview'));
        if (!slip) return;
        const rows = (slip.lines || []).map(l => `
          <tr>
            <td>${l.kind === 'earning' ? '<span class="badge badge-success">+</span>' : l.kind === 'deduction' ? '<span class="badge badge-danger">−</span>' : '<span class="badge badge-neutral">i</span>'} ${esc(l.label)}</td>
            <td class="text-xs text-muted">${esc(l.detail || '')}</td>
            <td class="text-right">${l.kind === 'info' ? '' : esc(fmtNAD(centsToNAD(l.amountCents)))}</td>
          </tr>`).join('');
        const openQ = myQueries.find(q => q.payslipId === slip.id && q.status === 'open');
        openModal({
          title: `Payslip — ${slip.tripRef}`, icon: 'file-text', wide: true,
          body: `
            <p class="text-small" style="margin:0 0 8px">${esc(slip.position || '')} · ${esc(slip.contractType || '')}${slip.signedContractRef ? ` · Signed contract: <b>${esc(slip.signedContractRef)}</b>` : ''}</p>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Line</th><th>Detail</th><th class="text-right">Amount</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
            <div class="pay-summary" style="margin-top:10px">
              <div>Gross pay <b>${esc(fmtNAD(centsToNAD(slip.grossCents)))}</b></div>
              <div>Deductions <b>${esc(fmtNAD(centsToNAD(slip.deductionCents)))}</b></div>
              <div class="net">Net pay <b>${esc(fmtNAD(centsToNAD(slip.netCents)))}</b></div>
            </div>`,
          actions: [
            { label: 'Close', kind: 'btn-outline' },
            ...(openQ
              ? []   // one open query per payslip — the button already shows "Query open"
              : [{
                  label: 'Query this payslip', kind: 'btn-primary',
                  onClick: () => { openQueryModal(slip); return true; }
                }])
          ]
        });
      }));

    /* Raise a payslip query (question / dispute / missing pay) */
    function openQueryModal(slip) {
      openModal({
        title: `Query payslip ${slip.tripRef}`, icon: 'help',
        body: `
          <p class="text-xs text-muted" style="margin:0 0 10px">Your question goes to the payroll team with this payslip attached. Their answer will appear on this phone under "My queries".</p>
          <div class="field">
            <label class="field-label" for="q-cat">What is it about?</label>
            <select class="input" id="q-cat">
              ${QUERY_CATEGORIES.map(c => `<option value="${esc(c.key)}">${esc(c.label)} — ${esc(c.hint)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="margin-top:.6rem">
            <label class="field-label" for="q-msg">Your message <span class="req">*</span></label>
            <textarea class="input" id="q-msg" rows="3" placeholder="e.g. My overtime for the night of 14 Nov looks short — I worked until 05:00."></textarea>
          </div>`,
        actions: [
          { label: 'Cancel', kind: 'btn-outline' },
          {
            label: 'Send query', kind: 'btn-primary',
            onClick: async (overlay) => {
              try {
                await queries.raisePayslipQuery(
                  slip,
                  overlay.querySelector('#q-msg').value,
                  overlay.querySelector('#q-cat').value
                );
                toast('Query sent. The answer will appear under "My queries".', 'success');
                await paint();
              } catch (err) {
                toast(err?.message || 'Could not send the query.', 'error', 6000);
                return true;
              }
            }
          }
        ]
      });
    }
    root.querySelectorAll('[data-myquery]').forEach(btn =>
      btn.addEventListener('click', () => {
        const slip = mySlips.find(s => s.id === btn.getAttribute('data-myquery'));
        if (slip) openQueryModal(slip);
      }));

    /* Live refresh: when payslips or query answers arrive from the server
       (pull sync), repaint so they appear without a reload. */
    if (!root._onPulled) {
      root._onPulled = () => { paint(); };
      onEvent('sync:pulled', root._onPulled);
    }

    root.querySelector('#crew-logout').addEventListener('click', async () => {
      await logout();
      toast('Signed out. See you next trip!', 'info');
      go('#/login');
    });

    updateSyncChips();
  }

  await paint();
  return () => { if (timer) clearInterval(timer); };
}
