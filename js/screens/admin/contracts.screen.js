/**
 * contracts.screen.js — Contracts (Phase 5): each crew member's pay terms.
 * Hourly / daily-at-sea / fixed-salary contracts, effective-dated, full
 * history kept; the national minimum wage is enforced on entry.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, openModal } from '../../core/ui.js';
import { get, getAll, put, STORES } from '../../core/idb.js';
import { fmtDate } from '../../core/time.js';
import { CAPABILITIES, can } from '../../core/permissions.js';
import {
  listContracts, createContract, updateContract, CONTRACT_TYPES,
  fmtMoneyCents, impliedHourlyCents, minimumWageFor
} from '../../core/payroll.service.js';
import { APP } from '../../config.js';

export async function render(root, ctx) {
  const editable = can(ctx.session.role, CAPABILITIES.MANAGE_CONTRACTS);
  const crew = (await getAll(STORES.CREW)).filter(c => c.employmentStatus !== 'inactive')
    .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  const contracts = await listContracts();

  const rowsHtml = crew.map(c => {
    const mine = contracts.filter(k => k.crewId === c.id);
    const current = mine.find(k => k.status === 'active') || null;
    const history = mine.filter(k => k.status === 'superseded');
    return `
    <tr>
      <td class="cell-strong">${esc(c.fullName)}<div class="text-xs text-muted">${esc(c.position || '')} · ${esc(c.id)}</div></td>
      <td>
        ${current ? `
          <span class="badge badge-success">${esc(current.typeLabel)}</span>
          <div class="text-small" style="margin-top:4px"><b>${esc(fmtMoneyCents(current.rateCents))}</b>
            ${current.type === 'hourly' ? '/hour' : current.type === 'daily_sea' ? '/day at sea' : '/month'}</div>
          <div class="text-xs text-muted">since ${esc(fmtDate(current.effectiveFrom))}</div>
        ` : '<span class="text-muted">No contract yet</span>'}
      </td>
      <td class="text-small">
        ${current ? `≈ ${esc(fmtMoneyCents(impliedHourlyCents(current)))}/hour implied` : '<span class="text-muted">—</span>'}
        ${history.length ? `<div class="text-xs text-muted">${history.length} earlier version${history.length === 1 ? '' : 's'} kept</div>` : ''}
      </td>
      <td class="text-right">
        ${current ? `<button class="btn btn-outline btn-sm" data-view="${esc(current.id)}">${icon('eye', 14)} View</button>` : ''}
        ${editable ? `
          <button class="btn btn-outline btn-sm" data-newfor="${esc(c.id)}">${icon('plus', 14)} ${current ? 'New version' : 'Add contract'}</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="text-muted text-center">No active crew members.</td></tr>';

  const nmw = minimumWageFor(new Date().toISOString().slice(0, 10));
  const body = `
    <div class="banner banner-info">${icon('coins', 18)}<div><b>Phase 5: contracts price the trips.</b>
      Each crew member needs a contract — hourly, daily rate per day at sea, or fixed monthly salary. Contracts are
      effective-dated: the contract in force on a shift's date prices that shift, and every change keeps its history.
      The national minimum wage (<b>${esc(fmtMoneyCents(nmw.hourlyCents))}/hour</b> since ${esc(nmw.effectiveFrom)}) is enforced — illegal rates are refused.</div></div>
    <div class="card" style="margin-top:1rem">
      <div class="card-title">${icon('file-text', 18)} Crew contracts</div>
      <div class="table-wrap"><table class="table" id="contracts-table">
        <thead><tr><th>Crew member</th><th>Current contract</th><th>Implied rate</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
    </div>`;

  const content = renderAdminShell(root, ctx, { title: 'Contracts', navKey: 'payroll', body });

  /* --- new contract / new version modal --- */
  const openContractForm = (crewId) => {
    const member = crew.find(c => c.id === crewId);
    const today = new Date().toISOString().slice(0, 10);
    openModal({
      title: `Contract — ${member.fullName}`, icon: 'file-text', wide: true,
      body: `
        <div class="form-grid">
          <label>Type
            <select id="c-type">${CONTRACT_TYPES.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}</select>
          </label>
          <label>Rate (NAD)
            <input id="c-rate" type="number" step="0.01" min="0" placeholder="e.g. 28.50" />
          </label>
          <label>Effective from
            <input id="c-from" type="date" value="${today}" />
          </label>
          <label>Reason for this version
            <input id="c-reason" type="text" placeholder="e.g. Annual increase / new crew member" />
          </label>
        </div>
        <p class="text-xs text-muted" id="c-hint" style="margin:10px 0 0">Hourly: paid per worked hour with statutory premiums. Daily: a fixed amount per day at sea (fishers' regulations reg 4). Fixed salary: monthly, premiums on top.</p>
        <p class="text-xs" style="margin:8px 0 0" id="c-warn"></p>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Save contract', kind: 'btn-primary', onClick: async () => {
            try {
              await createContract({
                crewId,
                type: content.querySelector('#c-type').value,
                rate: content.querySelector('#c-rate').value,
                effectiveFrom: content.querySelector('#c-from').value,
                changeReason: content.querySelector('#c-reason').value
              });
              toast('Contract saved. Older versions are kept as history.', 'success');
              render(root, ctx);
            } catch (err) { toast(err.message, 'error'); return true; }
          }
        }
      ]
    });
  };

  content.querySelectorAll('[data-newfor]').forEach(btn =>
    btn.addEventListener('click', () => openContractForm(btn.getAttribute('data-newfor'))));

  /* --- view contract + history --- */
  content.querySelectorAll('[data-view]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const c = contracts.find(k => k.id === btn.getAttribute('data-view'));
      if (!c) return;
      const mine = contracts.filter(k => k.crewId === c.crewId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
      const historyHtml = mine.map(k => `
        <tr>
          <td>${esc(fmtDate(k.effectiveFrom))} → ${k.effectiveTo ? esc(fmtDate(k.effectiveTo)) : 'now'}</td>
          <td>${esc(k.typeLabel)}</td>
          <td class="cell-strong">${esc(fmtMoneyCents(k.rateCents))}</td>
          <td class="text-small">${esc(k.changeReason || '')}</td>
          <td>${k.status === 'active' ? '<span class="badge badge-success">active</span>' : '<span class="badge badge-neutral">superseded</span>'}</td>
        </tr>`).join('');
      openModal({
        title: `Contract history — ${c.crewName}`, icon: 'book', wide: true,
        body: `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Period</th><th>Type</th><th>Rate</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>${historyHtml}</tbody>
          </table></div>
          ${c.notes ? `<p class="text-small" style="margin-top:10px">${esc(c.notes)}</p>` : ''}
          <p class="text-xs text-muted" style="margin-top:8px">Contract versions are permanent records: they are never deleted, and payslips always name the version that priced them.</p>`,
        actions: [{ label: 'Close', kind: 'btn-outline' }]
      });
    }));
}
