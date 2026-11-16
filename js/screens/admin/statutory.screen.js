/**
 * statutory.screen.js — The statutory rule register: what is verified,
 * each rule's source, effective dates and values. Read-only in the app —
 * rules change only through controlled, versioned software releases.
 *
 * PHASE 5: the payroll rules are now VERIFIED AND IMPLEMENTED (PAYE,
 * SSC, Labour Act premiums, minimum wage), each against its official
 * source. The register below shows the implemented rules with their real
 * values plus the seeded framework records.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc } from '../../core/ui.js';
import { getAll, STORES } from '../../core/idb.js';
import { fmtDate } from '../../core/time.js';
import {
  PAYE_TABLES, SSC_RULES, LABOUR_RATES, MINIMUM_WAGE
} from '../../core/payroll.service.js';

function money(cents) {
  return `N$ ${((cents || 0) / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function render(root, ctx) {
  const body = `
    <div class="banner banner-info">${icon('shield-check', 18)}<div><b>No rates are invented.</b>
      Every rate below was verified against its official source before being implemented (Phase 5). The values live in the app's
      code and change only through controlled, versioned releases — administrators can never edit them, and the payroll engine
      refuses to calculate with an unverified rule.</div></div>
    <div class="card" style="margin-top:1rem">
      <div class="card-title">${icon('coins', 18)} PAYE — income tax (implemented)</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Table</th><th>Effective</th><th>Bands (annual taxable income)</th><th>Source</th></tr></thead>
        <tbody>${PAYE_TABLES.map(t => `
          <tr>
            <td class="cell-strong">${esc(t.label)}</td>
            <td class="text-small">${esc(t.effectiveFrom)} → ${esc(t.effectiveTo)}</td>
            <td class="text-small">${t.brackets.map(b => b.upTo
              ? `up to ${money(b.upTo * 100)}: ${b.base ? money(b.base * 100) + ' + ' : ''}${Math.round(b.rate * 100)}%`
              : `above ${money(155000000)}: ${money(b.base * 100)} + ${Math.round(b.rate * 100)}%`).join('<br>')}</td>
            <td class="text-xs text-muted">${esc(t.source)}</td>
          </tr>`).join('')}
          <tr><td colspan="4" class="text-xs text-muted">Monthly deduction = annual tax on (12 × taxable month) ÷ 12 — the standard employer method (NamRA employer guide).</td></tr>
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-title">${icon('shield', 18)} Social Security (SSC) — implemented</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Rule</th><th>Effective</th><th>Rates &amp; limits (monthly)</th><th>Source</th></tr></thead>
        <tbody>${SSC_RULES.map(s => `
          <tr>
            <td class="cell-strong">${esc(s.label)}</td>
            <td class="text-small">${esc(s.effectiveFrom)} → ${esc(s.effectiveTo || 'now')}</td>
            <td class="text-small">Employee ${Math.round(s.employeeRate * 1000) / 10}% + employer ${Math.round(s.employerRate * 1000) / 10}%<br>
              Insurable earnings ${money(s.monthlyFloorCents)} – ${money(s.monthlyCeilingCents)}</td>
            <td class="text-xs text-muted">${esc(s.source)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-title">${icon('book', 18)} Labour Act pay rules — implemented</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Rule</th><th>Value</th><th>Source</th></tr></thead>
        <tbody>
          ${LABOUR_RATES.map(l => `
          <tr>
            <td class="cell-strong">${esc(l.label)}</td>
            <td class="text-small">Overtime ×${l.overtimeMultiplier} · Sunday ×${l.sundayMultiplier} · Public holiday ×${l.publicHolidayMultiplier}<br>Night work (20:00–07:00): +${Math.round(l.nightAllowancePct * 100)}% of the hourly basic wage</td>
            <td class="text-xs text-muted">${esc(l.source)}</td>
          </tr>`).join('')}
          ${MINIMUM_WAGE.map(w => `
          <tr>
            <td class="cell-strong">${esc(w.label)}</td>
            <td class="text-small">${money(w.hourlyCents)} per hour</td>
            <td class="text-xs text-muted">${esc(w.source)}</td>
          </tr>`).join('')}
          <tr>
            <td class="cell-strong">Fishers' working conditions</td>
            <td class="text-small">Shifts ≤ 8 h · overtime ≤ 35 h/week and ≤ 5 h/day · rest 10 h/24 h (6 h uninterrupted sleep) and 77 h/week · pay per day at sea on agreed dates</td>
            <td class="text-xs text-muted">Regulations Relating to Fishers, 2025 (GN 308 of 2025), regs 4, 9–11 — rates not stated fall back to the Labour Act (reg 21)</td>
          </tr>
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-title">${icon('book', 18)} Registered rule framework</div>
      <div class="table-wrap"><table class="table" id="rules-table"></table></div>
    </div>`;

  const content = renderAdminShell(root, ctx, { title: 'Statutory Rules', navKey: 'statutory', body });

  const rules = (await getAll(STORES.STATUTORY_RULES))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  content.querySelector('#rules-table').innerHTML = `
    <thead><tr><th>Rule</th><th>Legal source</th><th>Status</th><th>Effective from</th><th>Version</th></tr></thead>
    <tbody>
      ${rules.map((r) => {
        const implemented = ['paye', 'ssc', 'overtime', 'night_work', 'sunday_holiday', 'public_holidays'].includes(r.category);
        return `
      <tr>
        <td class="cell-strong">${esc(r.title)}<div class="text-xs text-muted">${esc(r.category)}</div></td>
        <td class="text-small">${esc(r.source)}</td>
        <td>${implemented
          ? '<span class="badge badge-success">verified &amp; implemented</span>'
          : `<span class="badge badge-warning">${esc(r.verificationStatus === 'awaiting_verification' ? 'Awaiting verification' : r.verificationStatus)}</span>`}</td>
        <td class="text-small">${r.effectiveFrom ? esc(fmtDate(r.effectiveFrom)) : '—'}</td>
        <td class="text-small">${r.version ? esc(r.version) : '—'}</td>
      </tr>`; }).join('') || '<tr><td colspan="5" class="text-muted text-center">No rules registered yet.</td></tr>'}
    </tbody>`;
}
