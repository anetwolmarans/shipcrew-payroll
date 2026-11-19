/**
 * payroll.screen.js — Payroll Processing (Phase 5): per-trip payroll runs.
 *
 * Flow: pick a trip → BUILD DRAFT (prices hours by contract + allowances +
 * catch commission + statutory PAYE/SSC) → review every line → APPROVE &
 * LOCK (issues payslips, immutable) → corrections only via ADJUSTMENT
 * ENTRIES on later runs.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, openModal, confirmDialog } from '../../core/ui.js';
import { get, getAll, STORES } from '../../core/idb.js';
import { fmtDate, fmtDateTime } from '../../core/time.js';
import { CAPABILITIES, can } from '../../core/permissions.js';
import {
  payrollReadyTrips, buildTripRun, approveRun, listRuns, getRun,
  addAdjustment, adjustmentsFor, addAllowance,
  fmtMoneyCents, ALLOWANCE_TYPES
} from '../../core/payroll.service.js';
import { reclassifyTrip } from '../../core/hours.service.js';
import { downloadPayslipPdf } from '../../core/payslip-pdf.js';
import { getCompany } from '../../core/store.js';
import { APP } from '../../config.js';

export async function render(root, ctx) {
  const canProcess = can(ctx.session.role, CAPABILITIES.PROCESS_PAYROLL);
  const canApprove = can(ctx.session.role, CAPABILITIES.APPROVE_PAYROLL);
  const [ready, runs, company] = await Promise.all([payrollReadyTrips(), listRuns(), getCompany()]);

  /* Runs already built: one card row per run. */
  const runRows = runs.map(r => {
    const statusBadge = r.status === 'locked'
      ? '<span class="badge badge-success">approved + locked</span>'
      : '<span class="badge badge-warning">draft</span>';
    return `
    <tr>
      <td class="cell-strong">${esc(r.tripRef)}<div class="text-xs text-muted">${esc(r.vesselName || '')}</div></td>
      <td class="text-small">${esc(fmtDate(r.createdAt))}<div class="text-xs text-muted">${r.payslips.length} payslip${r.payslips.length === 1 ? '' : 's'}</div></td>
      <td class="cell-strong">${esc(fmtMoneyCents(r.totals.netCents))}<div class="text-xs text-muted">gross ${esc(fmtMoneyCents(r.totals.grossCents))}</div></td>
      <td>${statusBadge}</td>
      <td class="text-right">
        <button class="btn btn-outline btn-sm" data-run="${esc(r.id)}">${icon('eye', 14)} Review</button>
        ${r.status === 'draft' && canApprove ? `<button class="btn btn-primary btn-sm" data-approve="${esc(r.id)}">${icon('check-circle', 14)} Approve & lock</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-muted text-center">No payroll runs yet — build one from a trip below.</td></tr>';

  /* Trips that can be built. */
  const builtTripIds = new Set(runs.map(r => r.tripId));
  const lockedTripIds = new Set(runs.filter(r => r.status !== 'draft').map(r => r.tripId));
  const readyRows = ready.map(t => {
    const isLocked = lockedTripIds.has(t.id);
    return `
    <tr>
      <td class="cell-strong">${esc(t.reference)}<div class="text-xs text-muted">${esc(t.vesselName || '')}</div></td>
      <td class="text-small">${t.actualReturnAt ? esc(fmtDate(t.actualReturnAt)) : '—'}</td>
      <td><span class="badge badge-neutral">${esc(t.status.replace('_', ' '))}</span></td>
      <td class="text-small">${isLocked ? 'Locked — no rebuild' : builtTripIds.has(t.id) ? 'Draft exists — rebuild replaces it' : 'Ready'}</td>
      <td class="text-right">
        ${(canProcess && !isLocked) ? `<button class="btn btn-primary btn-sm" data-build="${esc(t.id)}" data-ref="${esc(t.reference)}">${icon('coins', 14)} Build payroll</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-muted text-center">No trips in payroll-ready statuses (send a trip through "Send to payroll" on the Trips screen).</td></tr>';

  const body = `
    <div class="banner banner-info">${icon('coins', 18)}<div><b>Phase 5: per-trip payroll.</b>
      Approved attendance (Phase 4 categories) × contracts + allowances + catch-share commission − PAYE − SSC = net pay.
      Drafts can be rebuilt; an <b>approved run locks forever</b> — corrections happen through visible adjustment entries on a later run.</div></div>

    <div class="card" style="margin-top:1rem">
      <div class="card-title">${icon('file-text', 18)} Payroll runs</div>
      <div class="table-wrap"><table class="table" id="runs-table">
        <thead><tr><th>Trip</th><th>Built</th><th>Net total</th><th>Status</th><th></th></tr></thead>
        <tbody>${runRows}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="card-title">${icon('ship', 18)} Trips ready for payroll</div>
      <div class="table-wrap"><table class="table" id="ready-table">
        <thead><tr><th>Trip</th><th>Returned</th><th>Trip status</th><th>Payroll</th><th></th></tr></thead>
        <tbody>${readyRows}</tbody>
      </table></div>
    </div>`;

  const content = renderAdminShell(root, ctx, { title: 'Payroll Processing', navKey: 'payroll', body });

  /* ---- Build a draft run (with optional commission price) ---- */
  content.querySelectorAll('[data-build]').forEach(btn =>
    btn.addEventListener('click', () => {
      const tripId = btn.getAttribute('data-build');
      const ref = btn.getAttribute('data-ref');
      openModal({
        title: `Build payroll — ${ref}`, icon: 'coins',
        body: `
          <p style="margin:0 0 10px">The run prices every classified hour of the trip with the contract in force on each shift,
          adds allowances and statutory deductions (PAYE 2026/27, SSC 0.9%).</p>
          <label class="field-label">Catch commission price (optional) — N$ per kg
            <input id="p-price" type="number" step="0.01" min="0" placeholder="e.g. 4.50 — leave empty for no commission" />
          </label>
          <p class="text-xs text-muted" style="margin:8px 0 0">If a price is set, each crew member's share of the trip's quota allocation is paid as commission (share kg × price). No active allocation → a warning is recorded.</p>`,
        actions: [
          { label: 'Cancel', kind: 'btn-outline' },
          {
            label: 'Build draft', kind: 'btn-primary', onClick: async (overlay) => {
              btn.disabled = true; btn.textContent = 'Building…';
              try {
                await reclassifyTrip(tripId);   // ensure categories are fresh
                const priceInput = overlay.querySelector('#p-price');
                const priceVal = priceInput ? priceInput.value : '';
                const run = await buildTripRun(tripId, { commissionPricePerKg: priceVal || null });
                toast(`Draft built: ${run.payslips.length} payslip(s), net ${fmtMoneyCents(run.totals.netCents)}.`, 'success');
                render(root, ctx);
              } catch (err) {
                btn.disabled = false; btn.innerHTML = `${icon('coins', 14)} Build payroll`;
                toast(err.message, 'error', 6000);
                return true;
              }
            }
          }
        ]
      });
    }));

  /* ---- Review a run ---- */
  const reviewRun = async (runId) => {
    const run = await getRun(runId);
    if (!run) return;
    const trip = await get(STORES.TRIPS, run.tripId);
    const pendingAdj = await adjustmentsFor(null, run.tripId);

    const slipRows = run.payslips.map((p, i) => `
      <tr>
        <td class="cell-strong">${esc(p.crewName)}<div class="text-xs text-muted">${esc(p.position || '')} · ${esc(p.contractType)}</div></td>
        <td class="text-small">${catChips(p.hourCategories)}</td>
        <td class="text-small">${esc(fmtMoneyCents(p.grossCents))}</td>
        <td class="text-small">${esc(fmtMoneyCents(p.deductionCents))}<div class="text-xs text-muted">PAYE ${esc(fmtMoneyCents(p.payeCents))} · SSC ${esc(fmtMoneyCents(p.grossCents - p.netCents - p.payeCents))}</div></td>
        <td class="cell-strong">${esc(fmtMoneyCents(p.netCents))}</td>
        <td class="text-right"><button class="btn btn-outline btn-sm" data-slip="${i}">${icon('file-text', 14)} Payslip</button></td>
      </tr>`).join('');

    openModal({
      title: `Payroll run — ${run.tripRef}`, icon: 'coins', wide: true,
      body: `
        ${run.warnings.length ? `<div class="banner banner-warn" style="margin:0 0 10px">${icon('alert', 16)}<div>${run.warnings.map(esc).join('<br>')}</div></div>` : ''}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Crew member</th><th>Hours</th><th>Gross</th><th>Deductions</th><th>Net</th><th></th></tr></thead>
          <tbody>${slipRows}</tbody>
        </table></div>
        ${pendingAdj.length ? `
          <div class="card" style="margin-top:10px"><div class="card-title">${icon('edit', 14)} Pending adjustments for this trip</div>
          <ul style="margin:0">${pendingAdj.map(a => `<li>${esc(a.crewName)} — ${esc(a.label)}: <b>${esc(fmtMoneyCents(a.amountCents))}</b> (${a.kind}) — ${esc(a.reason)}</li>`).join('')}</ul></div>` : ''}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          ${canProcess ? `<button class="btn btn-outline btn-sm" id="rv-allowance">${icon('plus', 14)} Add allowance</button>` : ''}
          ${canProcess ? `<button class="btn btn-outline btn-sm" id="rv-adjust">${icon('edit', 14)} Adjustment entry</button>` : ''}
          <span style="flex:1"></span>
          <span class="text-small text-muted" style="align-self:center">Gross ${esc(fmtMoneyCents(run.totals.grossCents))} · Deductions ${esc(fmtMoneyCents(run.totals.deductionCents))} · <b>Net ${esc(fmtMoneyCents(run.totals.netCents))}</b> · Employer SSC ${esc(fmtMoneyCents(run.totals.employerSscCents))}</span>
        </div>`,
      actions: run.status === 'draft' && canApprove
        ? [
            { label: 'Close', kind: 'btn-outline' },
            { label: 'Approve & lock', kind: 'btn-primary', onClick: async (overlay) => { await approveFlow(run, overlay); } }
          ]
        : [{ label: 'Close', kind: 'btn-outline' }]
    });

    /* payslip detail inside the review modal */
    const modalEl = document.querySelector('.modal:last-of-type');
    modalEl?.querySelectorAll('[data-slip]').forEach(b =>
      b.addEventListener('click', () => showPayslipDetail(run.payslips[Number(b.getAttribute('data-slip'))], run, company)));
    modalEl?.querySelector('#rv-allowance')?.addEventListener('click', () => allowForm(run, trip));
    modalEl?.querySelector('#rv-adjust')?.addEventListener('click', () => adjustForm(run, trip));
  };

  const approveFlow = async (run, overlay) => {
    const noteEl = overlay.querySelector('#approve-note');
    openModal({
      title: `Approve & lock — ${run.tripRef}`, icon: 'lock', danger: false,
      body: `
        <p style="margin:0 0 10px">Approving <b>issues ${run.payslips.length} payslip(s)</b> and locks this payroll forever.
        The payslips become visible to each crew member (own payslips only). Numbers can never be edited afterwards — corrections go through adjustment entries on a later run.</p>
        <label class="field-label">Approval note (required)
          <input id="approve-note" type="text" placeholder="e.g. Checked hours against the trip sheet — approved for payment" />
        </label>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Approve & lock', kind: 'btn-primary', onClick: async (ov) => {
            const note = ov.querySelector('#approve-note').value;
            try {
              const { slips } = await approveRun(run.id, { note });
              toast(`Payroll locked. ${slips.length} payslip(s) issued.`, 'success');
              overlay?.remove();
              render(root, ctx);
            } catch (err) { toast(err.message, 'error', 6000); return true; }
          }
        }
      ]
    });
    void noteEl;
  };

  const allowForm = (run, trip) => {
    import('../../core/store.js').then(async ({ listCrew }) => {
      const crew = (await listCrew()).filter(c => run.payslips.some(p => p.crewId === c.id));
      openModal({
        title: 'Add allowance', icon: 'plus',
        body: `
          <div class="form-grid">
            <label>Crew member
              <select id="a-crew">${crew.map(c => `<option value="${esc(c.id)}">${esc(c.fullName)}</option>`).join('')}</select>
            </label>
            <label>Type
              <select id="a-type">${ALLOWANCE_TYPES.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}</select>
            </label>
            <label>Amount (NAD)
              <input id="a-amount" type="number" step="0.01" min="0" />
            </label>
            <label>Note
              <input id="a-note" type="text" placeholder="e.g. Transport to Lüderitz" />
            </label>
          </div>
          <p class="text-xs text-muted" style="margin:8px 0 0">The allowance is added to this crew member's trip pay. Rebuild the draft to include it.</p>`,
        actions: [
          { label: 'Cancel', kind: 'btn-outline' },
          {
            label: 'Add allowance', kind: 'btn-primary', onClick: async (overlay) => {
              try {
                const v = (sel) => overlay.querySelector(sel)?.value || '';
                await addAllowance({
                  crewId: v('#a-crew'),
                  tripId: run.tripId,
                  type: v('#a-type'),
                  amount: v('#a-amount'),
                  note: v('#a-note')
                });
                toast('Allowance added. Rebuild the draft run to include it.', 'success');
              } catch (err) { toast(err.message, 'error'); return true; }
            }
          }
        ]
      });
    });
  };

  const adjustForm = (run, trip) => {
    import('../../core/store.js').then(async ({ listCrew }) => {
      const crew = (await listCrew()).filter(c => run.payslips.some(p => p.crewId === c.id));
      openModal({
        title: 'Adjustment entry', icon: 'edit',
        body: `
          <p style="margin:0 0 10px" class="text-small">Adjustments are the ONLY way to correct payroll after a run — they are visible entries with reasons, applied on the next run. Locked runs are never edited.</p>
          <div class="form-grid">
            <label>Crew member
              <select id="j-crew">${crew.map(c => `<option value="${esc(c.id)}">${esc(c.fullName)}</option>`).join('')}</select>
            </label>
            <label>Direction
              <select id="j-kind"><option value="deduction">Deduction (money out)</option><option value="earning">Earning (money in)</option></select>
            </label>
            <label>Label
              <input id="j-label" type="text" placeholder="e.g. Advance repayment / missed night premium" />
            </label>
            <label>Amount (NAD)
              <input id="j-amount" type="number" step="0.01" min="0" />
            </label>
          </div>
          <label class="field-label" style="margin-top:8px">Reason (required)
            <input id="j-reason" type="text" placeholder="Why this adjustment is being made" />
          </label>`,
        actions: [
          { label: 'Cancel', kind: 'btn-outline' },
          {
            label: 'Record adjustment', kind: 'btn-primary', onClick: async (overlay) => {
              try {
                const v = (sel) => overlay.querySelector(sel)?.value || '';
                await addAdjustment({
                  crewId: v('#j-crew'),
                  tripId: run.tripId,
                  kind: v('#j-kind'),
                  label: v('#j-label'),
                  amount: v('#j-amount'),
                  reason: v('#j-reason')
                });
                toast('Adjustment recorded — it will be included in the next run.', 'success');
              } catch (err) { toast(err.message, 'error'); return true; }
            }
          }
        ]
      });
    });
  };

  content.querySelectorAll('[data-run], [data-approve]').forEach(btn => {
    const runId = btn.getAttribute('data-run') || btn.getAttribute('data-approve');
    btn.addEventListener('click', () => reviewRun(runId));
  });
}

/* ---------------- shared helpers ---------------- */

function catChips(cats) {
  if (!cats) return '—';
  const parts = [
    cats.ordinary ? `Ord ${Math.floor(cats.ordinary / 60)}h${String(cats.ordinary % 60).padStart(2, '0')}` : null,
    cats.overtime ? `OT ${Math.floor(cats.overtime / 60)}h${String(cats.overtime % 60).padStart(2, '0')}` : null,
    cats.night ? `Night ${Math.floor(cats.night / 60)}h${String(cats.night % 60).padStart(2, '0')}` : null,
    cats.sunday ? 'Sun' : null,
    cats.public_holiday ? 'Hol' : null
  ].filter(Boolean);
  return parts.join(' · ') || 'no classified hours';
}

/** Full payslip breakdown (used by the review modal). */
export function showPayslipDetail(p, run, company) {
  const rows = (p.lines || []).map(l => `
    <tr>
      <td>${l.kind === 'earning' ? '<span class="badge badge-success">+</span>' : l.kind === 'deduction' ? '<span class="badge badge-danger">−</span>' : '<span class="badge badge-neutral">i</span>'} ${esc(l.label)}</td>
      <td class="text-xs text-muted">${esc(l.detail || '')}</td>
      <td class="text-right ${l.kind === 'deduction' ? 'text-danger' : ''}">${l.kind === 'info' ? '' : esc(fmtMoneyCents(l.amountCents))}</td>
    </tr>`).join('');
  openModal({
    title: `Payslip — ${p.crewName}`, icon: 'file-text', wide: true,
    body: `
      <p class="text-small" style="margin:0 0 8px">${esc(p.position || '')} · ${esc(p.contractType)}${p.signedContractRef ? ` · Signed contract: <b>${esc(p.signedContractRef)}</b>` : ''} · Trip ${esc(run.tripRef)} · ${esc(run.vesselName || '')}</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Line</th><th>Detail</th><th class="text-right">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="pay-summary" style="margin-top:10px">
        <div>Gross pay <b>${esc(fmtMoneyCents(p.grossCents))}</b></div>
        <div>Deductions <b>${esc(fmtMoneyCents(p.deductionCents))}</b></div>
        <div>Employer SSC (not deducted) <b>${esc(fmtMoneyCents(p.employerSscCents))}</b></div>
        <div class="net">Net pay <b>${esc(fmtMoneyCents(p.netCents))}</b></div>
      </div>`,
    actions: [
      { label: 'Close', kind: 'btn-outline' },
      {
        label: 'Download PDF', kind: 'btn-primary', onClick: async () => {
          downloadPayslipPdf(
            { ...p, tripRef: run.tripRef, periodLabel: `Trip ${run.tripRef}`, payDate: run.runDateKey, vesselName: run.vesselName },
            company,
            { appVersion: APP.version, generatedAt: fmtDateTime(new Date().toISOString()) }
          );
          toast('Payslip PDF downloaded.', 'success');
        }
      }
    ]
  });
}
