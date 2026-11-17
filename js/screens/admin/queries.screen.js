/**
 * queries.screen.js — Payslip queries (admin side), v2.4.0.
 *
 * The payroll team's inbox for crew questions and disputes. A query is
 * raised by a crew member from their phone (crew home → payslip → Query)
 * and arrives here via pull sync.
 *
 * Rules visible on this screen:
 *  - OPEN queries sort first (newest first).
 *  - Answering requires a real answer (3+ characters); the answer appears
 *    verbatim on the crew member's phone.
 *  - An answered query is immutable — follow-ups arrive as new queries.
 *  - Closing without an answer requires a reason (duplicate, resolved in
 *    person…). Queries are never deleted.
 *  - If the query reveals a real payroll error, the fix is an ADJUSTMENT
 *    ENTRY on the next run (Payroll Processing → Adjustment entry) — a
 *    locked payslip is never quietly rewritten.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, openModal, toast } from '../../core/ui.js';
import * as queries from '../../core/queries.service.js';
import { listPayslips } from '../../core/payroll.service.js';
import { fmtDateTime, fmtDate } from '../../core/time.js';
import { centsToNAD } from '../../core/payroll.service.js';
import { on as onEvent } from '../../core/events.js';

const CATEGORY_LABELS = {
  question: 'Question',
  dispute: 'Dispute',
  missing_pay: 'Missing pay'
};
const CATEGORY_BADGES = {
  question: 'badge-info',
  dispute: 'badge-danger',
  missing_pay: 'badge-warning'
};

export async function render(root, ctx) {
  async function paint() {
    const all = await queries.listPayslipQueries();
    const open = all.filter(q => q.status === 'open');
    const answered = all.filter(q => q.status !== 'open');
    const slips = await listPayslips(null);

    const rowHtml = (q) => {
      const slip = slips.find(s => s.id === q.payslipId);
      return `
      <tr>
        <td class="cell-strong">${esc(q.crewName)}<div class="text-xs text-muted">${esc(q.crewId || '')}</div></td>
        <td class="text-small">${esc(q.tripRef || '')}<div class="text-xs text-muted">Net ${esc(centsToNAD(q.netCents))} · raised ${esc(fmtDateTime(q.createdAt))}</div></td>
        <td><span class="badge ${CATEGORY_BADGES[q.category] || 'badge-neutral'}">${esc(CATEGORY_LABELS[q.category] || q.category)}</span></td>
        <td class="text-small" style="max-width:320px">${esc(q.message)}</td>
        <td>${q.status === 'open'
          ? '<span class="badge badge-warning">open</span>'
          : q.status === 'answered'
            ? `<span class="badge badge-success">answered</span><div class="text-xs text-muted" style="margin-top:3px">${esc(q.respondedBy)} · ${esc(fmtDate(q.respondedAt))}</div>`
            : `<span class="badge badge-neutral">closed</span><div class="text-xs text-muted" style="margin-top:3px">${esc(q.closedReason || '')}</div>`}</td>
        <td class="text-right">
          ${q.status === 'open' ? `
            <button class="btn btn-primary btn-sm" data-answer="${esc(q.id)}">${icon('check', 13)} Answer</button>
            <button class="btn btn-outline btn-sm" data-close="${esc(q.id)}">Close</button>` : ''}
          ${slip ? `<button class="btn btn-outline btn-sm" data-slip="${esc(q.id)}">${icon('eye', 13)} Payslip</button>` : ''}
        </td>
      </tr>`;
    };

    const body = `
      <div class="banner banner-info">${icon('help', 18)}<div><b>Payslip queries.</b>
        Crew members can raise a question or dispute from their phone (My payslips → Query). Answer from here — your answer
        appears on their phone. If a query reveals a real error, fix it with an <b>Adjustment entry</b> on the next payroll run:
        issued payslips are never rewritten. One open query per payslip; answered queries are permanent records.</div></div>
      <div class="card" style="margin-top:1rem">
        <div class="card-title">${icon('help', 18)} Open queries
          ${open.length ? `<span class="badge badge-warning">${open.length}</span>` : ''}</div>
        ${open.length ? `
        <div class="table-wrap"><table class="table table-compact">
          <thead><tr><th>Crew member</th><th>Payslip</th><th>Type</th><th>Message</th><th>Status</th><th></th></tr></thead>
          <tbody>${open.map(rowHtml).join('')}</tbody>
        </table></div>` : `
        <div class="empty-state" style="padding:1.4rem">${icon('check', 30)}<div class="title">No open queries</div>
          <p>New questions and disputes from the crew appear here automatically.</p></div>`}
      </div>
      ${answered.length ? `
      <div class="card" style="margin-top:1rem">
        <div class="card-title">${icon('book', 18)} Answered &amp; closed (${answered.length})</div>
        <div class="table-wrap"><table class="table table-compact">
          <thead><tr><th>Crew member</th><th>Payslip</th><th>Type</th><th>Message</th><th>Status</th><th></th></tr></thead>
          <tbody>${answered.map(rowHtml).join('')}</tbody>
        </table></div>
      </div>` : ''}`;

    const content = renderAdminShell(root, ctx, { title: 'Payslip Queries', navKey: 'queries', body });

    content.querySelectorAll('[data-answer]').forEach(btn =>
      btn.addEventListener('click', () => {
        const q = all.find(x => x.id === btn.getAttribute('data-answer'));
        if (!q) return;
        openModal({
          title: `Answer — ${q.crewName} (${q.tripRef})`, icon: 'help', wide: true,
          body: `
            <div class="note" style="margin:0 0 .7rem">${icon('user', 15)}<div><b>${esc(q.crewName)}:</b> ${esc(q.message)}
              <div class="text-xs text-muted" style="margin-top:.25rem">Raised ${esc(fmtDateTime(q.createdAt))} · payslip net ${esc(centsToNAD(q.netCents))}</div></div></div>
            <div class="field">
              <label class="field-label" for="a-msg">Your answer (shown on their phone) <span class="req">*</span></label>
              <textarea class="input" id="a-msg" rows="3" placeholder="e.g. The night of 14 Nov ends at 22:00 for night-pay purposes; your 05:00 finish is in the 2 Nov shift. I have added an overtime adjustment to the next run."></textarea>
              <div class="field-hint">If the query reveals a real error, add the correction as an Adjustment entry on the next payroll run — payslips themselves are never rewritten.</div>
            </div>`,
          actions: [
            { label: 'Cancel', kind: 'btn-outline' },
            {
              label: 'Send answer', kind: 'btn-primary',
              onClick: async (overlay) => {
                try {
                  await queries.respondToQuery(q.id, overlay.querySelector('#a-msg').value);
                  toast('Answer sent — the crew member sees it on their phone.', 'success');
                  await paint();
                } catch (err) {
                  toast(err?.message || 'Could not send the answer.', 'error', 6000);
                  return true;
                }
              }
            }
          ]
        });
      }));

    content.querySelectorAll('[data-close]').forEach(btn =>
      btn.addEventListener('click', () => {
        const q = all.find(x => x.id === btn.getAttribute('data-close'));
        if (!q) return;
        openModal({
          title: `Close query — ${q.crewName}`, icon: 'x',
          body: `
            <p class="text-small" style="margin:0 0 .7rem"><b>${esc(q.crewName)}:</b> ${esc(q.message)}</p>
            <div class="field">
              <label class="field-label" for="c-reason">Reason for closing without an answer <span class="req">*</span></label>
              <input class="input" id="c-reason" type="text" placeholder="e.g. Duplicate of an earlier query / resolved in person">
              <div class="field-hint">The reason is shown on the crew member's phone. Queries are never deleted.</div>
            </div>`,
          actions: [
            { label: 'Cancel', kind: 'btn-outline' },
            {
              label: 'Close query', kind: 'btn-danger',
              onClick: async (overlay) => {
                try {
                  await queries.closeQuery(q.id, overlay.querySelector('#c-reason').value);
                  toast('Query closed.', 'success');
                  await paint();
                } catch (err) {
                  toast(err?.message || 'Could not close the query.', 'error', 6000);
                  return true;
                }
              }
            }
          ]
        });
      }));

    content.querySelectorAll('[data-slip]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const q = all.find(x => x.id === btn.getAttribute('data-slip'));
        const slip = slips.find(s => s.id === q?.payslipId);
        if (!slip) return;
        const rows = (slip.lines || []).map(l => `
          <tr>
            <td>${l.kind === 'earning' ? '<span class="badge badge-success">+</span>' : l.kind === 'deduction' ? '<span class="badge badge-danger">−</span>' : '<span class="badge badge-neutral">i</span>'} ${esc(l.label)}</td>
            <td class="text-xs text-muted">${esc(l.detail || '')}</td>
            <td class="text-right">${l.kind === 'info' ? '' : esc(centsToNAD(l.amountCents))}</td>
          </tr>`).join('');
        openModal({
          title: `Payslip — ${slip.crewName} (${slip.tripRef})`, icon: 'file-text', wide: true,
          body: `
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Line</th><th>Detail</th><th class="text-right">Amount</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
            <div class="pay-summary" style="margin-top:10px">
              <div>Gross pay <b>${esc(centsToNAD(slip.grossCents))}</b></div>
              <div>Deductions <b>${esc(centsToNAD(slip.deductionCents))}</b></div>
              <div class="net">Net pay <b>${esc(centsToNAD(slip.netCents))}</b></div>
            </div>`,
          actions: [{ label: 'Close', kind: 'btn-outline' }]
        });
      }));

    /* New queries arrive via pull sync → repaint (the count matters). */
    if (!root._onPulled) {
      root._onPulled = () => { paint(); };
      onEvent('sync:pulled', root._onPulled);
    }
  }

  await paint();
}
