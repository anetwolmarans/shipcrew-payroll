/**
 * audit.screen.js — The audit trail: every sensitive action, who did it,
 * when (Namibian time), and whether it has been uploaded to the central
 * database. Entries are append-only — they cannot be edited or deleted.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, downloadFile, updateSyncChips } from '../../core/ui.js';
import { getAll, STORES } from '../../core/idb.js';
import { fmtDateTime } from '../../core/time.js';
import { on } from '../../core/events.js';

export async function render(root, ctx) {
  const body = `
    <div class="banner banner-info">${icon('info', 18)}<div><b>Append-only.</b> Audit entries can never be edited or deleted from the app. In live mode they are also uploaded to Firebase so they survive even if a device is lost.</div></div>
    <div class="table-toolbar" style="margin-top:1rem">
      <select class="input select" id="audit-filter" aria-label="Filter by action"></select>
      <input class="input" id="audit-search" type="search" placeholder="Search person or details…" aria-label="Search audit log">
      <button class="btn btn-outline btn-sm" id="audit-export" style="margin-left:auto">${icon('download', 16)} Export CSV</button>
    </div>
    <div id="audit-table"></div>`;
  const content = renderAdminShell(root, ctx, { title: 'Audit Log', navKey: 'audit', body });

  const filterSel = content.querySelector('#audit-filter');
  const searchInput = content.querySelector('#audit-search');
  let all = [];

  function badgeFor(action) {
    if (action.includes('failed') || action.includes('revok')) return 'badge-danger';
    if (action.includes('success') || action.includes('unlock')) return 'badge-success';
    if (action.includes('lock') || action.includes('cooldown')) return 'badge-warning';
    return 'badge-navy';
  }

  function rowsHtml() {
    const q = searchInput.value.trim().toLowerCase();
    const rows = all
      .filter((a) => (!filterSel.value || filterSel.value === 'all' || a.action === filterSel.value))
      .filter((a) => !q || `${a.actorName} ${a.details} ${a.action}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>When (Namibian)</th><th>Who</th><th>Role</th><th>Action</th><th>Details</th><th>Upload status</th></tr></thead>
        <tbody>
          ${rows.length ? rows.map((a) => `
          <tr>
            <td class="nowrap text-small">${esc(fmtDateTime(a.at))}</td>
            <td class="cell-strong">${esc(a.actorName)}<div class="text-xs text-muted">${esc(a.deviceName)}</div></td>
            <td class="text-small">${esc(a.actorRole)}</td>
            <td><span class="badge ${badgeFor(a.action)}">${esc(a.action)}</span></td>
            <td class="text-small">${esc(a.details)}</td>
            <td><span class="badge ${a.syncStatus === 'synchronised' ? 'badge-success' : a.syncStatus.includes('failed') ? 'badge-danger' : 'badge-neutral'}">${esc(a.syncStatus)}</span></td>
          </tr>`).join('') : '<tr><td colspan="6" class="text-muted text-center">Nothing matches the filter.</td></tr>'}
        </tbody>
      </table></div>
      <p class="text-xs text-muted" style="margin:.7rem 0 0">${rows.length} of ${all.length} entries shown.</p>`;
  }

  async function refresh() {
    all = await getAll(STORES.AUDIT_LOGS);
    const actions = [...new Set(all.map((a) => a.action))].sort();
    const current = filterSel.value || 'all';
    filterSel.innerHTML = `<option value="all">All actions</option>` +
      actions.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    filterSel.value = actions.includes(current) ? current : 'all';
    content.querySelector('#audit-table').innerHTML = rowsHtml();
  }

  filterSel.addEventListener('change', () => { content.querySelector('#audit-table').innerHTML = rowsHtml(); });
  searchInput.addEventListener('input', () => { content.querySelector('#audit-table').innerHTML = rowsHtml(); });

  content.querySelector('#audit-export').addEventListener('click', () => {
    const q = searchInput.value.trim().toLowerCase();
    const rows = all
      .filter((a) => (!filterSel.value || filterSel.value === 'all' || a.action === filterSel.value))
      .filter((a) => !q || `${a.actorName} ${a.details} ${a.action}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const csv = [
      'When (UTC),Who,Role,Device,Action,Details,Upload status',
      ...rows.map((a) => [a.at, a.actorName, a.actorRole, a.deviceName, a.action, a.details, a.syncStatus]
        .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
    ].join('\n');
    downloadFile(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
    toast('Audit log exported as CSV.', 'success');
  });

  const offAudit = on('audit:new', () => refresh());
  await refresh();
  updateSyncChips();
  return () => offAudit();
}
