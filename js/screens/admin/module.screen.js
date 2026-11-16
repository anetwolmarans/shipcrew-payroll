/**
 * module.screen.js — The information screen for modules that arrive in
 * later phases (currently: Reports & Exports, Phase 6). Clicking a future
 * menu item shows what the module will do and when it arrives — honest
 * information instead of dead buttons. Payroll and Payslips graduated to
 * real screens in Phase 5 (see contracts/payroll/payslips.screen.js).
 */
import { renderAdminShell } from './layout.js';
import { icon, esc } from '../../core/ui.js';

const MODULES = {
  reports: {
    title: 'Reports & Exports', phase: 'Phase 6', icon: 'download',
    summary: 'The full management report library — crew, vessels, trips, attendance, overtime, night work, rest periods, catch and quota, commissions, payroll summaries and costs per vessel and trip, deductions, tax, SSC and the audit report.',
    items: [
      'Filter by crew member, vessel, trip, date range, payroll period and status',
      'Export as PDF, Excel and CSV',
      'Management dashboard with live fleet and payroll totals'
    ],
    tests: 'Final production sign-off'
  }
};

export function render(root, ctx) {
  const key = ctx.params.key;
  const mod = MODULES[key];
  const title = mod ? mod.title : 'Module';
  const body = mod ? `
    <div class="card card-navy">
      <div class="card-title" style="color:#fff">${icon(mod.icon, 20)} ${esc(mod.title)}
        <span class="badge badge-outline-light" style="margin-left:auto">${esc(mod.phase)}</span>
      </div>
      <p style="margin:0">${esc(mod.summary)}</p>
    </div>
    <div class="card">
      <div class="card-title">${icon('check-circle', 18)} What this module will include</div>
      <ul style="margin:0">${mod.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>
    <div class="note">${icon('info', 18)}<div><b>Not built yet — by design.</b> This project is delivered in tested phases (see the Roadmap). ${esc(mod.phase)} is built and verified before anything here goes live, so nothing on this screen is a fake button.</div></div>
    <div class="note">${icon('flag', 18)}<div><b>Unlocks:</b> ${esc(mod.tests)}.</div></div>
    <a class="btn btn-outline btn-sm" href="#/admin/roadmap">${icon('arrow-left', 16)} Back to the roadmap</a>
  ` : `
    <div class="empty-state">
      ${icon('search', 30)}
      <div class="title">Module not found</div>
      <p>This module does not exist. Choose an item from the menu.</p>
    </div>
    <a class="btn btn-outline btn-sm" href="#/admin/dashboard">${icon('arrow-left', 16)} Back to the dashboard</a>
  `;
  renderAdminShell(root, ctx, { title, navKey: key, body });
}
