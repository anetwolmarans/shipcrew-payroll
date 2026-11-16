/**
 * payslip-pdf.js — Offline PDF payslips (Phase 5), no external libraries.
 *
 * PLAIN ENGLISH: this module writes a REAL PDF file (the same format Word
 * or Excel saves) by hand — page, fonts, text, lines — so payslips can be
 * downloaded and printed AT SEA with no internet and no CDN dependency.
 *
 * What it supports (deliberately minimal and robust):
 *   - One A4 page per payslip, portrait
 *   - Built-in Helvetica (regular + bold): ASCII + basic Latin-1 text
 *   - Right-aligned money columns, ruled section tables
 *   - WinAnsi encoding; unsafe characters are substituted (the payslip
 *     content itself is plain words + numbers)
 *
 * Every payslip shows: company block, employee block, trip + pay date,
 * EVERY earning and deduction on its own line, employer SSC (a legal
 * payslip requirement), and the net pay — see docs/12-payroll.md.
 */

/* ---------------- PDF primitives (tiny PDF writer) ---------------- */

function pdfEscapeText(s) {
  // WinAnsi safety: replace characters outside the safe set.
  let out = String(s ?? '');
  out = out
    .replaceAll('—', '-').replaceAll('–', '-').replaceAll('×', 'x')
    .replaceAll('’', "'").replaceAll('‘', "'").replaceAll('“', '"').replaceAll('”', '"')
    .replaceAll('…', '...').replaceAll('•', '-').replaceAll('·', '-')
    .replaceAll('\u00A0', ' ');
  out = out.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  return out.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

class PdfPage {
  constructor(width, height) {
    this.w = width; this.h = height;
    this.ops = [];          // content stream operators
    this.fontRegular = null; this.fontBold = null; // resource refs set later
  }
  text(x, y, size, str, { bold = false, align = 'left', color = null } = {}) {
    const font = bold ? '/F2' : '/F1';
    let tx = x;
    const width = PdfPage.textWidth(String(str), size, bold);
    if (align === 'right') tx = x - width;
    else if (align === 'center') tx = x - width / 2;
    let op = '';
    if (color) op += `${color.r} ${color.g} ${color.b} rg\n`;
    op += `BT ${font} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscapeText(str)}) Tj ET`;
    if (color) op += `\n0 0 0 rg`;
    this.ops.push(op);
    return width;
  }
  line(x1, y1, x2, y2, { width = 0.7, color = null, dash = null } = {}) {
    let op = '';
    if (color) op += `${color.r} ${color.g} ${color.b} RG\n`;
    if (dash) op += `[${dash}] 0 d\n`;
    op += `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
    if (color) op += `\n0 0 0 RG`;
    this.ops.push(op);
  }
  rect(x, y, w, h, { fill = null } = {}) {
    let op = '';
    if (fill) op += `${fill.r} ${fill.g} ${fill.b} rg\n`;
    op += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
    if (fill) op += `\n0 0 0 rg`;
    this.ops.push(op);
  }
  /** Approximate Helvetica text width (metrics table below). */
  static textWidth(str, size, bold) {
    let units = 0;
    for (const ch of String(str)) {
      units += (HELV_METRICS[ch] ?? 556) * (bold ? 1.06 : 1);
    }
    return units / 1000 * size;
  }
}

/* Helvetica (AFM) advance widths for common characters — enough accuracy
   for right-aligned columns on a payslip. */
const HELV_METRICS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, 'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
  'H': 722, 'I': 278, 'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778,
  'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944,
  'X': 667, 'Y': 667, 'Z': 611, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556,
  '`': 333, 'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556,
  'h': 556, 'i': 222, 'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556,
  'p': 556, 'q': 556, 'r': 333, 's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722,
  'x': 500, 'y': 500, 'z': 500, '{': 334, '|': 260, '}': 334, '~': 584,
  '\u00A0': 278
};

/** Assemble the PDF file bytes from pages. */
function buildPdf(pages) {
  const enc = new TextEncoder();
  const objects = [];      // array of Uint8Array (body per object)
  const pushObj = (body) => { objects.push(body); return objects.length; };

  // 1: Catalog, 2: Pages, 3: F1 (Helvetica), 4: F2 (Helvetica-Bold)
  const catalogId = 1, pagesId = 2, f1Id = 3, f2Id = 4;
  pushObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  pushObj(`<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pushObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  pushObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  const pageIds = [];
  pages.forEach((page, i) => {
    const contentId = 5 + i * 2 + 1;
    const pageId = 5 + i * 2;
    pageIds.push(pageId);
    pushObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.w} ${page.h}] /Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R >> >> /Contents ${contentId} 0 R >>`);
    const stream = page.ops.join('\n');
    pushObj(`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  // xref + trailer. Offsets must be recorded WHILE appending (each object's
  // byte position in the finished file), not before.
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((body, idx) => {
    const id = idx + 1;
    offsets[id] = out.length;
    out += `${id} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes;
}

/* ---------------- the payslip layout ---------------- */

const NAVY = { r: 0.04, g: 0.145, b: 0.25 };   // #0A2540
const GREY_LINE = { r: 0.82, g: 0.85, b: 0.88 };
const LIGHT_BG = { r: 0.955, g: 0.965, b: 0.97 };

function money(cents) {
  const v = (Math.round(cents) / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `N$ ${v}`;
}
function hrs(mins) {
  const m = Math.round(mins || 0);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/**
 * Render one payslip (record from payroll.service) into PDF bytes.
 * `company` is the company profile record; `meta` carries extra labels.
 */
export function payslipPdfBytes(payslip, company, meta = {}) {
  const W = 595.28, H = 841.89;   // A4 portrait in points
  const M = 48;                    // page margin
  const page = new PdfPage(W, H);
  const right = W - M;
  let y = H - M;

  /* Header band */
  page.rect(0, H - 92, W, 92, { fill: NAVY });
  page.text(M, H - 40, 17, company?.name || 'ShipCrew Payroll', { bold: true, color: { r: 1, g: 1, b: 1 } });
  page.text(M, H - 58, 9, `${company?.address || ''}   ${company?.phone || ''}`.trim(), { color: { r: 0.85, g: 0.88, b: 0.92 } });
  page.text(M, H - 72, 9, company?.email || '', { color: { r: 0.85, g: 0.88, b: 0.92 } });
  page.text(right, H - 40, 15, 'PAYSLIP', { bold: true, align: 'right', color: { r: 1, g: 1, b: 1 } });
  page.text(right, H - 58, 9, `Trip ${payslip.tripRef || ''}`, { align: 'right', color: { r: 0.85, g: 0.88, b: 0.92 } });
  page.text(right, H - 72, 9, `Pay date: ${payslip.payDate || ''}`, { align: 'right', color: { r: 0.85, g: 0.88, b: 0.92 } });

  y = H - 120;

  /* Employee block */
  page.text(M, y, 13, payslip.crewName || '', { bold: true });
  page.text(M, y - 16, 9, [
    payslip.position ? `Position: ${payslip.position}` : '',
    payslip.crewId ? `Employee no: ${payslip.crewId}` : '',
    `Contract: ${payslip.contractType || ''}`
  ].filter(Boolean).join('    ·    '), { color: { r: 0.35, g: 0.4, b: 0.45 } });
  if (payslip.vesselName) {
    page.text(M, y - 30, 9, `Vessel: ${payslip.vesselName}    ·    Period: ${payslip.periodLabel || ''}`, { color: { r: 0.35, g: 0.4, b: 0.45 } });
  }
  y -= 52;

  /* Hour categories summary (worked time this trip) */
  const cats = payslip.hourCategories || {};
  const catRow = [
    ['Ordinary', cats.ordinary], ['Overtime', cats.overtime], ['Night', cats.night],
    ['Sunday', cats.sunday], ['Public holiday', cats.public_holiday]
  ];
  const hasCats = catRow.some(([, v]) => v > 0);
  if (hasCats) {
    page.text(M, y, 10, 'WORKED TIME THIS TRIP', { bold: true, color: NAVY });
    y -= 16;
    const colW = (W - 2 * M) / catRow.length;
    catRow.forEach(([label, v], i) => {
      const cx = M + i * colW + colW / 2;
      page.text(cx, y + 14, 8, label, { align: 'center', color: { r: 0.35, g: 0.4, b: 0.45 } });
      page.text(cx, y, 11, hrs(v), { align: 'center', bold: true });
    });
    y -= 30;
    page.line(M, y, right, y, { width: 0.7, color: GREY_LINE });
    y -= 22;
  }

  /* Earnings table */
  const drawTable = (title, rows, kind) => {
    page.text(M, y, 10, title, { bold: true, color: NAVY });
    y -= 8;
    page.line(M, y, right, y, { width: 0.7, color: GREY_LINE });
    y -= 6;
    for (const line of rows) {
      if (line.kind === 'info') {
        y -= 14;
        page.text(M, y, 8.5, `Note: ${line.label} - ${line.detail || ''}`, { color: { r: 0.45, g: 0.5, b: 0.55 } });
        continue;
      }
      y -= 17;
      page.text(M + 4, y, 9.5, line.label, { bold: false });
      page.text(M + 4 + 210, y, 8.5, String(line.detail || ''), { color: { r: 0.45, g: 0.5, b: 0.55 } });
      page.text(right, y, 9.5, money(line.amountCents), { align: 'right', bold: false });
    }
    y -= 6;
    page.line(M, y, right, y, { width: 0.7, color: GREY_LINE });
    y -= 4;
  };

  const earnings = (payslip.lines || []).filter(l => l.kind === 'earning');
  const deductions = (payslip.lines || []).filter(l => l.kind === 'deduction');
  const infos = (payslip.lines || []).filter(l => l.kind === 'info');
  drawTable('EARNINGS', earnings, 'earning');

  /* Totals */
  const totalRow = (label, cents, emphasis) => {
    y -= 20;
    if (emphasis) page.rect(M, y - 5, right - M, 22, { fill: LIGHT_BG });
    page.text(right - 110, y + 3, 10, label, { bold: true, color: NAVY });
    page.text(right, y + 3, 11, money(cents), { align: 'right', bold: true, color: NAVY });
  };
  totalRow('GROSS PAY', payslip.grossCents, false);
  for (const d of deductions) { /* rows already drawn below */ }
  y -= 8;

  if (deductions.length) {
    drawTable('DEDUCTIONS', deductions, 'deduction');
    totalRow('TOTAL DEDUCTIONS', payslip.deductionCents, false);
    y -= 8;
  }

  /* NET PAY band */
  y -= 6;
  page.rect(M, y - 34, right - M, 40, { fill: NAVY });
  page.text(M + 10, y - 9, 12, 'NET PAY', { bold: true, color: { r: 1, g: 1, b: 1 } });
  page.text(right - 10, y - 9, 14, money(payslip.netCents), { align: 'right', bold: true, color: { r: 1, g: 1, b: 1 } });
  y -= 52;

  /* Employer contributions (shown separately — legal payslip requirement) */
  page.text(M, y, 9, 'EMPLOYER CONTRIBUTIONS (not deducted from pay)', { bold: true, color: NAVY });
  y -= 16;
  page.text(M + 4, y, 9, 'SSC employer (0.9%)');
  page.text(right, y, 9.5, money(payslip.employerSscCents || 0), { align: 'right' });
  y -= 22;

  /* Notes / adjustments */
  for (const info of infos) {
    page.text(M, y, 8.5, `Note: ${info.label} - ${info.detail || ''}`, { color: { r: 0.45, g: 0.5, b: 0.55 } });
    y -= 14;
  }
  if (meta.note) {
    page.text(M, y, 8.5, meta.note, { color: { r: 0.45, g: 0.5, b: 0.55 } });
    y -= 14;
  }

  /* Footer: generation stamp */
  page.line(M, M + 22, right, M + 22, { width: 0.7, color: GREY_LINE });
  page.text(M, M + 8, 7.5,
    `Generated by ShipCrew Payroll (v${meta.appVersion || ''}) - ${meta.generatedAt || ''} - statutory rules: PAYE 2026/27, SSC 0.9% (ceiling N$12,500), Labour Act 2007 premiums.`,
    { color: { r: 0.5, g: 0.55, b: 0.6 } });
  page.text(right, M + 8, 7.5, `Payslip ID: ${payslip.id || ''}`, { align: 'right', color: { r: 0.5, g: 0.55, b: 0.6 } });

  return buildPdf([page]);
}

/** Trigger the browser download of the PDF. */
export function downloadPayslipPdf(payslip, company, meta = {}) {
  const bytes = payslipPdfBytes(payslip, company, meta);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = String(payslip.crewName || 'crew').replace(/[^A-Za-z0-9]+/g, '-');
  a.href = url;
  a.download = `Payslip-${safeName}-${payslip.tripRef || ''}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return bytes.length;
}
