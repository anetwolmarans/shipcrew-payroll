/**
 * statutory.screen.js — Read-only view of the statutory rule framework
 * (PAYE, SSC, minimum wage, overtime, holidays…).
 *
 * IMPORTANT LEGAL POLICY OF THIS SYSTEM:
 * No rate, threshold or formula is implemented until it has been verified
 * against the official Namibian source. Every rule below is deliberately
 * shown as "Awaiting verification" with its legal source. Verification and
 * implementation happen in Phase 5, through a controlled, versioned update
 * process — ordinary administrators can NEVER edit these rules.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc } from '../../core/ui.js';
import { getAll, STORES } from '../../core/idb.js';
import { fmtDate } from '../../core/time.js';

export async function render(root, ctx) {
  const body = `
    <div class="banner banner-warn">${icon('alert', 18)}<div><b>No rates are invented.</b> This system will not calculate PAYE, SSC, minimum wage or any allowance until each rule is verified against the official Namibian source. Below you see the framework and where each rule will come from — all marked <b>Awaiting verification (Phase 5)</b>.</div></div>
    <div class="card" style="margin-top:1rem">
      <div class="card-title">${icon('book', 18)} Statutory rule framework — Namibia</div>
      <div class="table-wrap"><table class="table" id="rules-table"></table></div>
    </div>
    <div class="card">
      <div class="card-title">${icon('shield-check', 18)} How statutory rules are managed</div>
      <ul style="margin:0">
        <li><b>Versioned:</b> every rule records its source, effective dates, version, who verified it and when, and who approved the update.</li>
        <li><b>Write-protected:</b> tax and SSC formulas are locked away from normal admin editing — in the app AND in the database security rules. They change only through controlled software releases.</li>
        <li><b>Effective-dated:</b> a rule change never silently changes an already-approved historical payroll.</li>
        <li><b>Verified before use:</b> the payroll engine refuses to calculate with a rule whose status is not "verified". If a rule cannot be verified, the system flags it as awaiting verification instead of guessing.</li>
        <li><b>Fishing sector first:</b> ordinary land-based overtime rules are NOT assumed to apply to fishers — the Regulations Relating to Fishers (GN 308 of 2025) are checked first.</li>
      </ul>
    </div>`;
  const content = renderAdminShell(root, ctx, { title: 'Statutory Rules', navKey: 'statutory', body });

  const rules = (await getAll(STORES.STATUTORY_RULES))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  content.querySelector('#rules-table').innerHTML = `
    <thead><tr><th>Rule</th><th>Legal source (to verify)</th><th>Status</th><th>Effective from</th><th>Version</th></tr></thead>
    <tbody>
      ${rules.map((r) => `
      <tr>
        <td class="cell-strong">${esc(r.title)}<div class="text-xs text-muted">${esc(r.category)}</div></td>
        <td class="text-small">${esc(r.source)}</td>
        <td><span class="badge badge-warning">${esc(r.verificationStatus === 'awaiting_verification' ? 'Awaiting verification (Phase 5)' : r.verificationStatus)}</span></td>
        <td class="text-small">${r.effectiveFrom ? esc(fmtDate(r.effectiveFrom)) : '—'}</td>
        <td class="text-small">${r.version ? esc(r.version) : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="text-muted text-center">No rules registered yet.</td></tr>'}
    </tbody>`;
}
