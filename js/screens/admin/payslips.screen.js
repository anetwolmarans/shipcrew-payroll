/**
 * payslips.screen.js — Payslips (Phase 5): issued, locked payslips.
 * Admins/payroll see all; each crew member sees ONLY their own (enforced
 * again by the Firebase server rules). PDF download works offline.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, openModal } from '../../core/ui.js';
import { getAll, STORES } from '../../core/idb.js';
import { fmtDate, fmtDateTime } from '../../core/time.js';
import { listPayslips, fmtMoneyCents } from '../../core/payroll.service.js';
import { downloadPayslipPdf } from '../../core/payslip-pdf.js';
import { showPayslipDetail } from './payroll.screen.js';
import { getCompany } from '../../core/store.js';
import { APP } from '../../config.js';

export async function render(root, ctx) {
  const [slips, company, runs] = await Promise.all([
    listPayslips(),
    getCompany(),
    getAll(STORES.PAYROLL_CALCULATIONS)
  ]);
  const runById = new Map(runs.map(r => [r.id, r]));
  const crewFilter = ctx.params?.crewId || null;
  const rows = (crewFilter ? slips.filter(s => s.crewId === crewFilter) : slips)
    .map(s => {
      const run = runById.get(s.runId);
      return `
      <tr>
        <td class="cell-strong">${esc(s.crewName)}<div class="text-xs text-muted">${esc(s.position || '')} · ${esc(s.crewId)}</div></td>
        <td class="text-small">${esc(s.tripRef)}<div class="text-xs text-muted">${esc(s.vesselName || '')}</div></td>
        <td class="text-small">${esc(fmtDate(s.createdAt))}</td>
        <td class="text-small">${esc(fmtMoneyCents(s.grossCents))}<div class="text-xs text-muted">− ${esc(fmtMoneyCents(s.deductionCents))}</div></td>
        <td class="cell-strong">${esc(fmtMoneyCents(s.netCents))}</td>
        <td class="text-right">
          <button class="btn btn-outline btn-sm" data-view="${esc(s.id)}">${icon('eye', 14)} View</button>
          <button class="btn btn-primary btn-sm" data-pdf="${esc(s.id)}">${icon('download', 14)} PDF</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="text-muted text-center">No payslips issued yet. Approve a payroll run to issue them.</td></tr>';

  const body = `
    <div class="banner banner-info">${icon('file-text', 18)}<div><b>Issued payslips.</b>
      Each approved payroll run issues one payslip per crew member — locked, never edited. Crew members see their own
      payslips on their phone (My Payslips); this screen shows the fleet view with PDF download.</div></div>
    <div class="card" style="margin-top:1rem">
      <div class="card-title">${icon('file-text', 18)} All payslips (${slips.length})</div>
      <div class="table-wrap"><table class="table" id="slips-table">
        <thead><tr><th>Crew member</th><th>Trip</th><th>Issued</th><th>Gross − deductions</th><th>Net</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;

  const content = renderAdminShell(root, ctx, { title: 'Payslips', navKey: 'payslips', body });

  content.querySelectorAll('[data-view]').forEach(btn =>
    btn.addEventListener('click', () => {
      const s = slips.find(x => x.id === btn.getAttribute('data-view'));
      const run = runById.get(s.runId);
      showPayslipDetail(s, run || { tripRef: s.tripRef, vesselName: s.vesselName, runDateKey: s.payDate }, company);
    }));
  content.querySelectorAll('[data-pdf]').forEach(btn =>
    btn.addEventListener('click', () => {
      const s = slips.find(x => x.id === btn.getAttribute('data-pdf'));
      const size = downloadPayslipPdf(s, company, { appVersion: APP.version, generatedAt: fmtDateTime(new Date().toISOString()) });
      toast(`Payslip PDF downloaded (${(size / 1024).toFixed(1)} KB).`, 'success');
    }));
}
