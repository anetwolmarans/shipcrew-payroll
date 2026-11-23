import { SSC_RULES } from './payroll.service.js';

/**
 * payslip-pdf.js — Offline PDF payslips (Phase 5), no external libraries.
 *
 * PLAIN ENGLISH: this module writes a REAL PDF file (the same format Word
 * or Excel saves) by hand — page, fonts, text, lines, boxes — so payslips
 * can be downloaded and printed AT SEA with no internet and no CDN.
 *
 * The payslip is designed to be print-ready and auditable at a glance:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ NAVY HEADER — company details · PAYSLIP · trip, date    │
 *   ├───────────────┬────────────────────────────────────────┤
 *   │ EMPLOYEE card │ PAY PERIOD card (trip, vessel, date)    │
 *   ├───────────────┴────────────────────────────────────────┤
 *   │ WORKED TIME strip (ordinary · OT · night · Sun · hol)   │
 *   ├────────────────────────────────────────────────────────┤
 *   │ EARNINGS table (description · how it was calculated · N$)│
 *   │ Gross pay …                                             │
 *   │ DEDUCTIONS table (PAYE, SSC)  Total deductions …        │
 *   │ ███ NET PAY band ███                                    │
 *   │ EMPLOYER CONTRIBUTIONS box (SSC employer — not deducted)│
 *   │ footer: generator version · statutory rules · payslip ID│
 *   └────────────────────────────────────────────────────────┘
 *
 * Built-in Helvetica (regular + bold), WinAnsi encoding; unsafe characters
 * are substituted (payslip content is plain words + numbers).
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

export class PdfPage {
  constructor(width, height) {
    this.w = width; this.h = height;
    this.ops = [];          // content stream operators
  }  /** Draw a text string. align: 'left' | 'right' | 'center'. tracking: letter spacing. */
  text(x, y, size, str, { bold = false, align = 'left', color = null, tracking = 0 } = {}) {
    const font = bold ? '/F2' : '/F1';
    let tx = x;
    const width = PdfPage.textWidth(String(str), size, bold);
    if (align === 'right') tx = x - width;
    else if (align === 'center') tx = x - width / 2;
    let op = '';
    if (color) op += `${color.r} ${color.g} ${color.b} rg\n`;
    op += `BT ${font} ${size} Tf ${tracking} Tc ${tx.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscapeText(str)}) Tj ET`;
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
  /** Filled (and optionally stroked) rectangle. */
  rect(x, y, w, h, { fill = null, stroke = null, strokeWidth = 0.8 } = {}) {
    let op = '';
    if (fill) op += `${fill.r} ${fill.g} ${fill.b} rg\n`;
    if (stroke) op += `${stroke.r} ${stroke.g} ${stroke.b} RG ${strokeWidth} w\n`;
    op += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`;
    if (fill) op += `\n0 0 0 rg`;
    if (stroke) op += `\n0 0 0 RG`;
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
export function buildPdf(pages) {
  const enc = new TextEncoder();
  const objects = [];      // array of object bodies
  const pushObj = (body) => { objects.push(body); return objects.length; };

  // 1: Catalog, 2: Pages, 3: F1 (Helvetica), 4: F2 (Helvetica-Bold)
  const catalogId = 1, pagesId = 2, f1Id = 3, f2Id = 4;
  pushObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  pushObj(`<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pushObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  pushObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  pages.forEach((page, i) => {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
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

/* Design tokens (match the app's navy + teal brand). */
const NAVY  = { r: 0.040, g: 0.145, b: 0.251 };   // #0A2540
const TEAL  = { r: 0.055, g: 0.486, b: 0.529 };   // #0E7C87
const INK   = { r: 0.118, g: 0.145, b: 0.173 };   // #1E252C
const MUTED = { r: 0.447, g: 0.490, b: 0.533 };   // #727D88
const LINE  = { r: 0.835, g: 0.867, b: 0.898 };   // #D5DDE5
const CARD  = { r: 0.937, g: 0.953, b: 0.965 };   // #EFF3F6
const ZEBRA = { r: 0.965, g: 0.973, b: 0.980 };   // #F6F8FA
const HEAD  = { r: 0.912, g: 0.937, b: 0.956 };   // #E8EFF4

const WHITE = { r: 1, g: 1, b: 1 };
const PALE  = { r: 0.788, g: 0.847, b: 0.886 };   // header sub-text

function money(cents) {
  const v = (Math.round(cents) / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `N$ ${v}`;
}
function hrs(mins) {
  const m = Math.round(mins || 0);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
/** Trim a string with "..." until it fits maxW at the given size. */
function fit(str, size, bold, maxW) {
  let s = String(str ?? '');
  if (PdfPage.textWidth(s, size, bold) <= maxW) return s;
  while (s.length && PdfPage.textWidth(s + '...', size, bold) > maxW) s = s.slice(0, -1);
  return s + '...';
}

/**
 * Render one payslip (record from payroll.service) into PDF bytes.
 * `company` is the company profile record; `meta` carries version stamps.
 */
export function payslipPdfBytes(payslip, company, meta = {}) {
  const W = 595.28, H = 841.89;   // A4 portrait in points
  const M = 46;                    // page margin
  const right = W - M;
  const page = new PdfPage(W, H);

  /* column geometry for the tables */
  const descX = M + 10;
  const detX  = M + 225;
  const amtR  = right - 10;

  const lines = payslip.lines || [];
  const earnings = lines.filter(l => l.kind === 'earning');
  const deductions = lines.filter(l => l.kind === 'deduction');
  const infos = lines.filter(l => l.kind === 'info');

  /* ============ 1. HEADER BAND ============ */
  const bandH = 96;
  page.rect(0, H - bandH, W, bandH, { fill: NAVY });
  page.rect(0, H - bandH - 4, W, 4, { fill: TEAL });            // accent underline
  page.text(M, H - 36, 16, company?.name || 'ShipCrew Payroll', { bold: true, color: WHITE });
  page.text(M, H - 52, 8.5, company?.address || '', { color: PALE });
  page.text(M, H - 65, 8.5, `${company?.phone || ''}   ${company?.email || ''}`.trim(), { color: PALE });

  page.text(right, H - 40, 21, 'PAYSLIP', { bold: true, align: 'right', color: WHITE, tracking: 2 });
  page.text(right, H - 56, 9, `Trip ${payslip.tripRef || ''}`, { align: 'right', color: PALE });
  page.text(right, H - 69, 9, `Pay date: ${payslip.payDate || ''}`, { align: 'right', color: PALE });

  /* ============ 2. EMPLOYEE + PERIOD CARDS ============ */
  const cardTop = H - bandH - 18;      // top edge of the cards
  const cardH = 62;
  const cardW = (right - M - 14) / 2;
  const card = (x, title, mainText, sub1, sub2) => {
    page.rect(x, cardTop - cardH, cardW, cardH, { fill: CARD });
    page.rect(x, cardTop - cardH, 3, cardH, { fill: TEAL });
    page.text(x + 14, cardTop - 16, 7, title, { bold: true, color: MUTED, tracking: 1.4 });
    page.text(x + 14, cardTop - 32, 11.5, fit(mainText, 11.5, true, cardW - 28), { bold: true, color: NAVY });
    if (sub1) page.text(x + 14, cardTop - 45, 8.5, fit(sub1, 8.5, false, cardW - 28), { color: INK });
    if (sub2) page.text(x + 14, cardTop - 57, 8.5, fit(sub2, 8.5, false, cardW - 28), { color: INK });
  };
  card(M, 'EMPLOYEE',
    payslip.crewName || '',
    [payslip.position, payslip.crewId ? `Employee no: ${payslip.crewId}` : ''].filter(Boolean).join('   ·   '),
    [payslip.contractType, payslip.signedContractRef ? `Signed contract: ${payslip.signedContractRef}` : ''].filter(Boolean).join('   ·   '));
  card(M + cardW + 14, 'PAY PERIOD',
    payslip.periodLabel || `Trip ${payslip.tripRef || ''}`,
    payslip.vesselName ? `Vessel: ${payslip.vesselName}` : '',
    payslip.payDate ? `Payment date: ${payslip.payDate}` : '');

  let y = cardTop - cardH;

  /* ============ 3. WORKED-TIME STRIP ============ */
  const cats = payslip.hourCategories || {};
  const boxes = [
    ['ORDINARY', cats.ordinary], ['OVERTIME', cats.overtime], ['NIGHT', cats.night],
    ['SUNDAY', cats.sunday], ['PUBLIC HOLIDAY', cats.public_holiday]
  ];
  if (boxes.some(([, v]) => v > 0)) {
    y -= 22;
    page.text(M, y, 9, 'WORKED TIME THIS TRIP', { bold: true, color: NAVY, tracking: 1.4 });
    y -= 10;
    const gap = 8;
    const boxW = (right - M - gap * (boxes.length - 1)) / boxes.length;
    const boxH = 34;
    boxes.forEach(([label, v], i) => {
      const bx = M + i * (boxW + gap);
      page.rect(bx, y - boxH, boxW, boxH, { fill: CARD, stroke: LINE, strokeWidth: 0.7 });
      page.text(bx + boxW / 2, y - 12, 6.3, label, { align: 'center', bold: true, color: MUTED, tracking: 0.7 });
      page.text(bx + boxW / 2, y - 26, 10.5, hrs(v), { align: 'center', bold: true, color: NAVY });
    });
    y -= boxH;
  }

  /* ============ 4. TABLES ============ */
  const totalRows = earnings.length + deductions.length;
  const rowH = totalRows > 14 ? 13 : totalRows > 10 ? 14.5 : 16.5;

  const sectionTitle = (title) => {
    y -= 26;
    page.text(M, y, 9, title, { bold: true, color: NAVY, tracking: 1.4 });
    y -= 7;
    page.line(M, y, right, y, { width: 0.9, color: LINE });
  };
  const tableHead = () => {
    y -= 17;
    page.rect(M, y, right - M, 17, { fill: HEAD });
    page.text(descX, y + 5.5, 7, 'DESCRIPTION', { bold: true, color: MUTED, tracking: 0.8 });
    page.text(detX, y + 5.5, 7, 'DETAIL', { bold: true, color: MUTED, tracking: 0.8 });
    page.text(amtR, y + 5.5, 7, 'AMOUNT (N$)', { bold: true, color: MUTED, tracking: 0.8, align: 'right' });
  };
  const row = (i, label, detail, cents) => {
    y -= rowH;
    if (i % 2 === 1) page.rect(M, y, right - M, rowH, { fill: ZEBRA });
    page.text(descX, y + (rowH - 9.5) / 2 + 1, 9.5, fit(label, 9.5, false, detX - descX - 14), { color: INK });
    if (detail) page.text(detX, y + (rowH - 8) / 2 + 1, 8, fit(detail, 8, false, 205), { color: MUTED });
    page.text(amtR, y + (rowH - 9.5) / 2 + 1, 9.5, money(cents), { align: 'right', color: INK });
  };
  const totalRow = (label, cents, strong = false) => {
    y -= 19;
    if (strong) {
      page.rect(right - 250, y - 3, 250, 19, { fill: HEAD });
      page.text(right - 240, y + 2.5, 9.5, label, { bold: true, color: NAVY });
      page.text(amtR, y + 2.5, 10.5, money(cents), { align: 'right', bold: true, color: NAVY });
    } else {
      page.text(right - 240, y + 2.5, 9.5, label, { color: INK });
      page.text(amtR, y + 2.5, 10, money(cents), { align: 'right', color: INK });
    }
  };

  /* Earnings */
  sectionTitle('EARNINGS');
  tableHead();
  if (earnings.length) {
    earnings.forEach((l, i) => row(i, l.label, l.detail, l.amountCents));
  } else {
    y -= rowH;
    page.text(descX, y + 4, 9, 'No time-based or other earnings recorded for this period.', { color: MUTED });
  }
  totalRow('Gross pay', payslip.grossCents, true);

  /* Deductions */
  if (deductions.length) {
    sectionTitle('DEDUCTIONS');
    tableHead();
    deductions.forEach((l, i) => row(i, l.label, l.detail, l.amountCents));
    totalRow('Total deductions', payslip.deductionCents, true);
  }

  /* ============ 5. NET PAY BAND ============ */
  y -= 16;
  const netH = 42;
  y -= netH;
  page.rect(M, y, right - M, netH, { fill: NAVY });
  page.rect(M, y, 4, netH, { fill: TEAL });
  page.text(M + 16, y + 16, 12.5, 'NET PAY', { bold: true, color: WHITE, tracking: 2 });
  page.text(right - 14, y + 15, 15, money(payslip.netCents), { align: 'right', bold: true, color: WHITE });

  /* ============ 6. EMPLOYER CONTRIBUTIONS ============ */
  y -= 18;
  const empH = 44;
  y -= empH;
  page.rect(M, y, right - M, empH, { fill: CARD, stroke: LINE, strokeWidth: 0.7 });
  page.text(M + 12, y + empH - 15, 7, 'EMPLOYER CONTRIBUTIONS — NOT DEDUCTED FROM PAY', { bold: true, color: MUTED, tracking: 0.8 });
  const sscCapped = (Number(payslip.sscBasicCents) || 0) > (Number(payslip.sscMonthInsurableCents) || 0);
  page.text(M + 12, y + 13, 9.5, `SSC employer share (0.9%)${sscCapped ? ' - at the monthly maximum' : ''}`, { color: INK });
  page.text(right - 12, y + 13, 9.5, money(payslip.employerSscCents || 0), { align: 'right', color: INK });

  /* ============ 7. NOTES + FOOTER ============ */
  y -= 18;
  for (const info of infos) {
    page.text(M, y, 8, fit(`Note: ${info.label} - ${info.detail || ''}`, 8, false, right - M), { color: MUTED });
    y -= 12;
  }
  if (meta.note) {
    page.text(M, y, 8, fit(meta.note, 8, false, right - M), { color: MUTED });
    y -= 12;
  }

  page.line(M, 64, right, 64, { width: 0.7, color: LINE });
  page.text(M, 52, 7, `Generated by ShipCrew Payroll v${meta.appVersion || ''} - ${meta.generatedAt || ''} (Africa/Windhoek)`, { color: MUTED });
  const sscRule = SSC_RULES.find(r => r.id === payslip.sscRuleId) || null;
  const sscCeil = sscRule ? `N$${Math.round(sscRule.monthlyCeilingCents / 100).toLocaleString('en')}/m` : 'per SSC notice';
  page.text(M, 42, 7, `Statutory rules: PAYE 2026/27 - SSC 0.9% + 0.9% of basic pay (ceiling ${sscCeil}) - Labour Act 2007 premiums - verified.`, { color: MUTED });
  page.text(right, 52, 7, `Payslip ID: ${payslip.id || ''}`, { align: 'right', color: MUTED });
  page.text(right, 42, 7, 'Page 1 of 1', { align: 'right', color: MUTED });

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
