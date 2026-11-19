/**
 * report-pdf.js — Phase 6: PDF export for every report, no external library.
 *
 * PLAIN ENGLISH: reuses the tiny hand-written PDF writer that produces the
 * payslips (payslip-pdf.js) and lays a report TABLE onto A4 landscape pages:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ NAVY band — report title · company · generated when/by       │
 *   │ subtitle + chosen filters, one line each                     │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ TABLE with repeated header row, zebra rows, right-aligned    │
 *   │ numbers, totals row shaded                                   │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ footer: page x of y · app version · "works offline"          │
 *   └──────────────────────────────────────────────────────────────┘
 * Columns are auto-sized from their content; long text is trimmed to fit.
 */

import { PdfPage, buildPdf } from './payslip-pdf.js';
import { fmtNumber } from './report-data.js';

const NAVY  = { r: 0.040, g: 0.145, b: 0.251 };   // #0A2540
const TEAL  = { r: 0.055, g: 0.486, b: 0.529 };   // #0E7C87
const INK   = { r: 0.118, g: 0.145, b: 0.173 };
const MUTED = { r: 0.447, g: 0.490, b: 0.533 };
const LINE  = { r: 0.835, g: 0.867, b: 0.898 };
const ZEBRA = { r: 0.965, g: 0.973, b: 0.980 };
const HEADF = { r: 0.912, g: 0.937, b: 0.956 };
const TOTAL = { r: 0.886, g: 0.925, b: 0.937 };
const WHITE = { r: 1, g: 1, b: 1 };
const PALE  = { r: 0.788, g: 0.847, b: 0.886 };

/** Trim a string with "..." until it fits maxW at the given size. */
function fit(str, size, bold, maxW) {
  let s = String(str ?? '');
  if (PdfPage.textWidth(s, size, bold) <= maxW) return s;
  while (s.length && PdfPage.textWidth(s + '...', size, bold) > maxW) s = s.slice(0, -1);
  return s + '...';
}

function displayValue(col, v) {
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

/**
 * Build the PDF bytes for one report table.
 * @param {{title, subtitle, filters, generatedAt, generatedBy, columns, rows, totals, companyName?, appVersion?}} report
 * @returns {Uint8Array}
 */
export function reportPdfBytes(report) {
  const W = 841.89, H = 595.28;        // A4 landscape
  const M = 34;                        // margins
  const top = H - M;
  const headH = 64;                    // navy band height
  const footH = 34;

  const columns = report.columns || [];
  const rows = report.rows || [];
  const totals = report.totals || null;

  /* ---- column widths: proportional to the longest content ---- */
  const natural = columns.map((c) => {
    let w = PdfPage.textWidth(c.label, 8, true) + 12;
    const sampleN = Math.min(rows.length, 60);
    for (let r = 0; r < sampleN; r++) {
      const t = displayValue(c, rows[r][c.key]);
      w = Math.max(w, PdfPage.textWidth(t, 8, false) + 12);
    }
    if (totals && totals[c.key] !== undefined && totals[c.key] !== null) {
      w = Math.max(w, PdfPage.textWidth(displayValue(c, totals[c.key]), 8, true) + 12);
    }
    return w;
  });
  const usable = W - 2 * M;
  const natSum = natural.reduce((a, b) => a + b, 0);
  const widths = natSum > 0 ? natural.map(w => w / natSum * usable) : columns.map(() => usable / Math.max(1, columns.length));

  /* ---- paginate: the same band + filters are drawn on every page, so the
     grid geometry is identical on all pages ---- */
  const rowH = 16;
  const bandH = 58 + Math.max(0, (report.filters || []).length) * 11 + 8;
  const gridTop = top - headH - bandH;
  const gridBottom = M + footH;
  // header row (rowH + 4 gap) then data rows until the footer zone
  const rowsPerPage = Math.max(1, Math.floor((gridTop - rowH - 4 - gridBottom) / rowH));

  const pages = [];
  const perPage = [];
  let idx = 0;
  while (idx < Math.max(1, rows.length)) {
    perPage.push(rows.slice(idx, idx + rowsPerPage));
    idx += rowsPerPage;
    if (perPage.length > 400) break;   // hard safety stop
  }
  if (!perPage.length) perPage.push([]);

  const totalPages = perPage.length;
  let totalsDrawn = false;

  for (let pi = 0; pi < totalPages; pi++) {
    const page = new PdfPage(W, H);
    const pageRows = perPage[pi];
    const isLast = pi === totalPages - 1;

    /* ---- navy header band ---- */
    page.rect(M, top - headH, usable, headH, { fill: NAVY });
    page.text(M + 14, top - 24, 14, fit(report.title || 'Report', 14, true, usable - 260), { bold: true, color: WHITE });
    page.text(M + 14, top - 42, 8, fit(report.subtitle || '', 8, false, usable - 260), { color: PALE });
    const gen = `${report.companyName ? report.companyName + ' · ' : ''}Generated ${report.generatedAt || ''}${report.generatedBy ? ' by ' + report.generatedBy : ''}`;
    page.text(M + usable - 14, top - 24, 8, fit(gen, 8, false, 300), { align: 'right', color: PALE });
    page.text(M + usable - 14, top - 42, 8, 'ShipCrew Payroll — Namibia', { align: 'right', color: PALE });
    page.text(M + usable - 14, top - 56, 7, `Page ${pi + 1} of ${totalPages}`, { align: 'right', color: PALE });

    /* ---- filters block ---- */
    let fy = top - headH - 16;
    for (const f of (report.filters || [])) {
      page.text(M, fy, 8, fit(`Filter: ${f}`, 8, false, usable), { color: MUTED });
      fy -= 11;
    }

    /* ---- table header row ---- */
    let y = gridTop;
    page.rect(M, y - rowH + 4, usable, rowH, { fill: HEADF, stroke: LINE, strokeWidth: 0.5 });
    let x = M + 6;
    columns.forEach((c, i) => {
      const w = widths[i];
      const tx = c.align === 'right' ? x + w - 12 : x + 6;
      page.text(tx, y - rowH + 15, 8, fit(c.label, 8, true, w - 12), { bold: true, align: c.align === 'right' ? 'right' : 'left', color: NAVY });
      x += w;
    });
    y -= rowH + 4;

    /* ---- data rows ---- */
    for (let ri = 0; ri < pageRows.length; ri++) {
      const r = pageRows[ri];
      if (ri % 2 === 1) page.rect(M, y - rowH + 4, usable, rowH, { fill: ZEBRA });
      let xx = M + 6;
      columns.forEach((c, i) => {
        const w = widths[i];
        const t = fit(displayValue(c, r[c.key]), 8, false, w - 12);
        page.text(c.align === 'right' ? xx + w - 12 : xx + 6, y - rowH + 15, 8, t, { align: c.align === 'right' ? 'right' : 'left', color: INK });
        xx += w;
      });
      y -= rowH;
    }

    /* ---- totals row (last page only, above the footer) ---- */
    if (isLast && totals) {
      const ty = Math.max(y - 2, gridBottom + rowH + 6);
      page.rect(M, ty - rowH + 4, usable, rowH, { fill: TOTAL, stroke: LINE, strokeWidth: 0.6 });
      let xx = M + 6;
      columns.forEach((c, i) => {
        const w = widths[i];
        let t = '';
        if (i === 0) t = fit(totals.label || 'Totals', 8, true, w - 12);
        else if (totals[c.key] !== undefined && totals[c.key] !== null) t = fit(displayValue(c, totals[c.key]), 8, true, w - 12);
        page.text(c.align === 'right' ? xx + w - 12 : xx + 6, ty - rowH + 15, 8, t, { bold: true, align: c.align === 'right' ? 'right' : 'left', color: NAVY });
        xx += w;
      });
      totalsDrawn = true;
    }

    /* ---- footer ---- */
    page.line(M, M + footH - 8, M + usable, M + footH - 8, { width: 0.7, color: LINE });
    page.text(M, M + 12, 7, `ShipCrew Payroll v${report.appVersion || ''} — report generated on this device, works offline`, { color: MUTED });
    page.text(M, M + 22, 7, `${rows.length} row${rows.length === 1 ? '' : 's'}${totals && totalsDrawn ? ' · totals row shaded' : ''}`, { color: MUTED });
    page.text(M + usable, M + 12, 7, `${report.fileName || ''}`, { align: 'right', color: MUTED });
    page.text(M + usable, M + 22, 7, 'Statutory figures: PAYE 2026/27 · SSC 0.9% + 0.9% · Labour Act 2007 premiums', { align: 'right', color: MUTED });

    // teal accent line under the band
    page.rect(M, top - headH - 3, usable, 3, { fill: TEAL });
    pages.push(page);
  }

  return buildPdf(pages);
}

/** Trigger the browser download of the report PDF. Returns byte length. */
export function downloadReportPdf(report) {
  const bytes = reportPdfBytes(report);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = report.fileName || 'report.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return bytes.length;
}
