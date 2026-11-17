/**
 * reports.screen.js — Phase 6: the report library with PDF / Excel / CSV
 * exports. Every report is built from the records on this device, so
 * reports and exports WORK OFFLINE (at sea, no internet needed).
 *
 * Flow: pick a report → (optional) choose filters → the table is built
 * from your own records → export as PDF (print-ready, A4 landscape),
 * Excel (.xlsx, real workbook) or CSV (opens anywhere). Every export is
 * written to the audit trail. The report list respects the role's
 * capabilities — payroll reports need VIEW_PAYROLL_ALL, the audit report
 * needs VIEW_AUDIT — and only roles with EXPORT_REPORTS see the export
 * buttons (the supervisor role reviews on screen without file exports).
 */
import { renderAdminShell } from './layout.js';
import { icon, esc, toast, downloadFile, updateSyncChips } from '../../core/ui.js';
import { getAll, STORES } from '../../core/idb.js';
import { getSettings } from '../../core/store.js';
import { getHoursSettings } from '../../core/hours.service.js';
import { REPORT_DEFS, emptyFilters, fmtNumber, csvForReport } from '../../core/report-data.js';
import { downloadReportPdf } from '../../core/report-pdf.js';
import { downloadXlsx } from '../../core/report-xlsx.js';
import { can, canAny, CAPABILITIES } from '../../core/permissions.js';
import { logAction, AUDIT_ACTIONS } from '../../core/audit.service.js';
import { currentSession } from '../../core/auth.service.js';
import { fmtDateTime } from '../../core/time.js';
import { APP } from '../../config.js';

const TRIP_STATUS_OPTS = [
  ['planned', 'Planned'], ['open', 'Open'], ['at_sea', 'At Sea'], ['returned', 'Returned'],
  ['under_review', 'Under Review'], ['payroll_pending', 'Payroll Pending'], ['approved', 'Approved'], ['closed', 'Closed']
];
const STATUS_OPTS = {
  status_employment: [['active', 'Active'], ['on_leave', 'On leave'], ['inactive', 'Inactive']],
  status_vessel: [['active', 'Active'], ['inactive', 'Inactive (laid up)']],
  status_trip: TRIP_STATUS_OPTS,
  status_run: [['draft', 'Draft'], ['approved', 'Approved'], ['locked', 'Locked']],
  status_query: [['open', 'Open'], ['answered', 'Answered'], ['closed', 'Closed']],
  status_allocation: [['active', 'Active'], ['superseded', 'Superseded (history)']]
};

/* -------- preview formatting (mirrors the PDF layer) -------- */
function displayCell(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  switch (col.type) {
    case 'money': return `N$ ${fmtNumber(v)}`;
    case 'number': return fmtNumber(v, col.decimals ?? 0);
    case 'hours': {
      const m = Math.max(0, Math.round(Number(v) || 0));
      return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
    }
    default: return String(v);
  }
}

function buildCsv(r) {
  return csvForReport(r);
}

let _dataCache = null;

async function loadData() {
  if (_dataCache) return _dataCache;
  const [
    crew, users, vessels, trips, assignments, clockEvents,
    catchRecords, quotaAllocations, runs, payslips, queries, audit, settings, hoursSettings
  ] = await Promise.all([
    getAll(STORES.CREW), getAll(STORES.USERS), getAll(STORES.VESSELS), getAll(STORES.TRIPS),
    getAll(STORES.ASSIGNMENTS), getAll(STORES.CLOCK_EVENTS),
    getAll(STORES.CATCH_RECORDS), getAll(STORES.QUOTA_ALLOCATIONS),
    getAll(STORES.PAYROLL_CALCULATIONS), getAll(STORES.PAYSLIPS),
    getAll(STORES.PAYSLIP_QUERIES), getAll(STORES.AUDIT_LOGS), getSettings(), getHoursSettings()
  ]);
  _dataCache = { crew, users, vessels, trips, assignments, clockEvents, catchRecords, quotaAllocations, runs, payslips, queries, audit, settings, hoursSettings };
  return _dataCache;
}

/** Which raw collections each report needs. */
const NEEDED = {
  crew_register: ({ crew, users }) => ({ crew, users }),
  vessel_register: ({ vessels, trips }) => ({ vessels, trips }),
  trip_register: ({ trips, vessels, assignments, catchRecords }) => ({ trips, vessels, assignments, catchRecords }),
  attendance_hours: ({ crew, clockEvents, hoursSettings }) => ({ crew, clockEvents, hoursSettings }),
  catch_register: ({ trips, catchRecords }) => ({ trips, catchRecords }),
  quota_allocations: ({ trips, quotaAllocations }) => ({ trips, quotaAllocations }),
  payroll_summary: ({ runs }) => ({ runs }),
  statutory: ({ payslips }) => ({ payslips }),
  payslip_register: ({ payslips, trips }) => ({ payslips, trips }),
  queries: ({ queries }) => ({ queries }),
  audit_trail: ({ audit }) => ({ audit })
};

function fileNameFor(def, f) {
  const parts = [def.title.replaceAll(/[^A-Za-z0-9]+/g, '-')];
  if (f.dateFrom || f.dateTo) parts.push(`${f.dateFrom || 'start'}_to_${f.dateTo || 'today'}`);
  parts.push(new Date().toISOString().slice(0, 10));
  return parts.join('-');
}

export async function render(root, ctx) {
  const session = ctx.session;
  const role = session.role;
  const canExport = can(role, CAPABILITIES.EXPORT_REPORTS);
  const allowed = REPORT_DEFS.filter(def => !def.cap || can(role, def.cap));

  const body = !allowed.length ? `
    <div class="empty-state">${icon('shield', 30)}
      <div class="title">No reports for your role</div>
      <p>Reports are available to payroll, management, supervisory and auditor roles. Ask a System Administrator if you need access.</p>
    </div>` : `
    <div class="banner banner-success" style="margin-bottom:1rem">
      ${icon('check-circle', 18)}<div><b>Report library — Phase 6.</b> Every report is built from the records on this device, so it works offline. Exports: PDF (print-ready), Excel (.xlsx) and CSV. Every export is recorded in the audit log.</div>
    </div>
    <div class="card" id="report-picker"></div>
    <div class="card" id="filter-card" hidden></div>
    <div class="card" id="result-card" hidden></div>`;

  const content = renderAdminShell(root, ctx, { title: 'Reports & Exports', navKey: 'reports', body });
  if (!allowed.length) { updateSyncChips(); return; }

  const pickerEl = content.querySelector('#report-picker');
  const filterCard = content.querySelector('#filter-card');
  const resultCard = content.querySelector('#result-card');
  const data = await loadData();
  const companyName = data.settings?.companyName || '';

  /* ---- picker ---- */
  const groups = [...new Set(allowed.map(d => d.group))];
  pickerEl.innerHTML = `
    <div class="card-title">${icon('book', 18)} Choose a report
      <span class="badge badge-neutral" style="margin-left:auto">${allowed.length} of ${REPORT_DEFS.length} available for your role</span></div>
    ${groups.map(g => `
      <div class="nav-group-label" style="margin:.7rem 0 .3rem">${esc(g)}</div>
      <div class="report-grid">
        ${allowed.filter(d => d.group === g).map(d => `
          <button class="report-tile" data-report="${esc(d.key)}" type="button">
            ${icon(d.icon, 18)}<span>${esc(d.title)}</span>
          </button>`).join('')}
      </div>`).join('')}
    ${!canExport ? `<p class="text-xs text-muted" style="margin:.8rem 0 0">${icon('eye', 14)} Your role can view reports here on screen. File exports (PDF / Excel / CSV) are limited to payroll, management and auditor roles.</p>` : ''}
  `;

  /* ---- state ---- */
  let selected = allowed[0]?.key || null;
  let lastReport = null;

  async function buildReport() {
    const def = allowed.find(d => d.key === selected);
    if (!def) return null;
    const f = emptyFilters();
    filterCard.querySelectorAll('[data-filter]').forEach(el => { f[el.dataset.filter] = el.value.trim(); });
    const table = def.builder(NEEDED[def.key](data), f);
    const who = currentSession();
    return {
      title: table.meta.title,
      subtitle: table.meta.subtitle,
      filters: table.meta.filters || [],
      generatedAt: fmtDateTime(new Date().toISOString()),
      generatedBy: who?.fullName || '',
      companyName,
      appVersion: APP.version,
      fileName: fileNameFor(def, f),
      columns: table.columns,
      rows: table.rows,
      totals: table.totals
    };
  }

  async function runReport() {
    const def = allowed.find(d => d.key === selected);
    if (!def) return;
    lastReport = await buildReport();
    paintResult(def);
  }

  function paintResult(def) {
    const r = lastReport;
    const filterBits = (r.filters || []).join(' · ');
    resultCard.hidden = false;
    resultCard.innerHTML = `
      <div class="card-title">${icon('file-text', 18)} ${esc(r.title)}
        <span class="badge badge-navy" style="margin-left:auto">${r.rows.length} row${r.rows.length === 1 ? '' : 's'}</span></div>
      <p class="text-small text-muted" style="margin:0 0 .8rem">${esc(r.subtitle || '')}${filterBits ? ` — <b>Filters:</b> ${esc(filterBits)}` : ' — no filters (everything on file)'}</p>
      ${r.rows.length === 0 ? `
        <div class="empty-state">${icon('search', 28)}<div class="title">Nothing matches</div><p>No records match this report and its filters. Widen the date range or clear a filter, then build it again.</p></div>
        <div class="row" style="margin-top:.9rem"><button class="btn btn-outline btn-sm" id="rerun">${icon('refresh', 16)} Run again</button></div>` : `
        <div class="table-wrap"><table class="table">
          <thead><tr>${r.columns.map(c => `<th class="${c.align === 'right' ? 'text-right' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${r.rows.slice(0, 300).map(row => `<tr>${r.columns.map(c => `<td class="${c.align === 'right' ? 'text-right nowrap' : ''}">${esc(displayCell(c, row[c.key]))}</td>`).join('')}</tr>`).join('')}
          </tbody>
          ${r.totals ? `<tfoot><tr>${r.columns.map((c, i) => `<td class="${c.align === 'right' ? 'text-right' : ''}" style="font-weight:600;background:var(--surface-2,#EFF3F6)">${esc(i === 0 ? (r.totals.label || 'Totals') : (r.totals[c.key] !== undefined && r.totals[c.key] !== null ? displayCell(c, r.totals[c.key]) : ''))}</td>`).join('')}</tr></tfoot>` : ''}
        </table></div>
        ${r.rows.length > 300 ? `<p class="text-xs text-muted" style="margin:.5rem 0 0">On screen the first 300 rows are shown — the downloads always contain ALL ${r.rows.length} rows.</p>` : ''}
        <div class="row" style="margin-top:.9rem;flex-wrap:wrap">
          ${canExport ? `
            <button class="btn btn-primary btn-sm" id="exp-pdf">${icon('file-text', 16)} PDF</button>
            <button class="btn btn-primary btn-sm" id="exp-xlsx">${icon('download', 16)} Excel (.xlsx)</button>
            <button class="btn btn-outline btn-sm" id="exp-csv">${icon('download', 16)} CSV</button>` : ''}
          <button class="btn btn-outline btn-sm" id="rerun">${icon('refresh', 16)} Run again</button>
        </div>`}
    `;
    resultCard.querySelector('#rerun')?.addEventListener('click', runReport);
    if (canExport && r.rows.length) {
      const doExport = async (fmt) => {
        if (fmt === 'pdf') downloadReportPdf(lastReport);
        else if (fmt === 'xlsx') downloadXlsx(lastReport);
        else downloadFile(`${r.fileName}.csv`, buildCsv(r), 'text/csv');
        await logAction(AUDIT_ACTIONS.DATA_EXPORTED,
          `Report "${r.title}" exported as ${fmt.toUpperCase()} — ${r.rows.length} row(s). Filters: ${(r.filters || []).join('; ') || 'none'}.`);
        toast(`${fmt.toUpperCase()} export started — ${r.rows.length} row${r.rows.length === 1 ? '' : 's'}.`, 'success');
      };
      resultCard.querySelector('#exp-pdf').addEventListener('click', () => doExport('pdf'));
      resultCard.querySelector('#exp-xlsx').addEventListener('click', () => doExport('xlsx'));
      resultCard.querySelector('#exp-csv').addEventListener('click', () => doExport('csv'));
    }
  }

  /* ---- filter panel ---- */
  function paintFilters() {
    const def = allowed.find(d => d.key === selected);
    if (!def) { filterCard.hidden = true; return; }
    const opts = (key) => (STATUS_OPTS[key] || []).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    const bits = [];
    if (def.filters.includes('dates')) {
      bits.push(`<label class="field"><span>From (Namibian date)</span><input class="input" type="date" data-filter="dateFrom"></label>
        <label class="field"><span>To</span><input class="input" type="date" data-filter="dateTo"></label>`);
    }
    if (def.filters.includes('crew')) {
      bits.push(`<label class="field"><span>Crew member</span><select class="input" data-filter="crewId"><option value="">All crew</option>${data.crew.slice().sort((a, b) => String(a.fullName).localeCompare(String(b.fullName))).map(c => `<option value="${esc(c.id)}">${esc(c.fullName)} (${esc(c.employeeId || c.id)})</option>`).join('')}</select></label>`);
    }
    if (def.filters.includes('vessel')) {
      bits.push(`<label class="field"><span>Vessel</span><select class="input" data-filter="vesselId"><option value="">All vessels</option>${data.vessels.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select></label>`);
    }
    if (def.filters.includes('trip')) {
      bits.push(`<label class="field"><span>Trip</span><select class="input" data-filter="tripId"><option value="">All trips</option>${data.trips.slice().sort((a, b) => String(b.reference).localeCompare(String(a.reference))).map(t => `<option value="${esc(t.id)}">${esc(t.reference)} — ${esc(t.vesselName || '')}</option>`).join('')}</select></label>`);
    }
    for (const key of ['status_employment', 'status_vessel', 'status_trip', 'status_run', 'status_query', 'status_allocation']) {
      if (def.filters.includes(key)) {
        bits.push(`<label class="field"><span>Status</span><select class="input" data-filter="status"><option value="">All</option>${opts(key)}</select></label>`);
      }
    }
    if (def.filters.includes('search')) {
      bits.push(`<label class="field" style="grid-column:1/-1"><span>Search (name, reference, words)</span><input class="input" type="search" data-filter="search" maxlength="60" placeholder="Type to narrow the report…"></label>`);
    }
    filterCard.hidden = false;
    filterCard.innerHTML = `
      <div class="card-title">${icon('settings', 18)} Filters — ${esc(def.title)}</div>
      <p class="text-xs text-muted" style="margin:0 0 .7rem">Leave everything empty to report on all records on this device.</p>
      <div class="form-grid">${bits.join('')}</div>
      <div class="row" style="margin-top:.9rem">
        <button class="btn btn-accent" id="run-report">${icon('check', 16)} Build report</button>
      </div>`;
    filterCard.querySelector('#run-report').addEventListener('click', runReport);
  }

  /* ---- wire picker ---- */
  pickerEl.querySelectorAll('.report-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      selected = btn.dataset.report;
      pickerEl.querySelectorAll('.report-tile').forEach(b => b.classList.toggle('active', b === btn));
      resultCard.hidden = true; lastReport = null;
      paintFilters();
      runReport();
    });
  });
  pickerEl.querySelector('.report-tile')?.classList.add('active');
  paintFilters();
  await runReport();
  updateSyncChips();
  return () => { _dataCache = null; };
}
