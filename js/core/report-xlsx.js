/**
 * report-xlsx.js — Phase 6: real Excel (.xlsx) workbooks, no external library.
 *
 * PLAIN ENGLISH: an .xlsx file is a ZIP archive holding a few XML files.
 * This module writes that ZIP byte by byte (stored, i.e. uncompressed, which
 * Excel accepts happily) so the app can produce workbooks OFFLINE, exactly
 * like the hand-written PDF writer does for payslips.
 *
 * The workbook has one sheet with a bold header row, sensible column
 * widths and the header frozen so it stays visible while scrolling.
 * Numbers are stored as real numbers, so Excel's SUM works on totals.
 */

/* ---------------- CRC-32 (for the ZIP entries) ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---------------- minimal ZIP writer (stored entries) ---------------- */

function zipStore(entries) {
  // entries: [{ name, data(Uint8Array) }]
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]);
  const u32 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);

  for (const e of entries) {
    const nameB = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + nameB.length);
    local.set(u32(0x04034B50), 0);       // local file header signature
    local.set(u16(20), 4);               // version needed
    local.set(u16(0x0800), 6);           // UTF-8 names
    local.set(u16(0), 8);                // method: stored
    local.set(u16(0), 10); local.set(u16(0), 12);  // time/date (0 fine)
    local.set(u32(crc), 14);
    local.set(u32(e.data.length), 18);   // compressed size
    local.set(u32(e.data.length), 22);   // uncompressed size
    local.set(u16(nameB.length), 26);
    local.set(u16(0), 28);
    local.set(nameB, 30);
    chunks.push(local, e.data);
    central.push({ nameB, crc, size: e.data.length, offset });
    offset += local.length + e.data.length;
  }

  const centralStart = offset;
  for (const c of central) {
    const rec = new Uint8Array(46 + c.nameB.length);
    rec.set(u32(0x02014B50), 0);         // central directory signature
    rec.set(u16(20), 4); rec.set(u16(20), 6);   // versions
    rec.set(u16(0x0800), 8);             // UTF-8 names
    rec.set(u16(0), 10);                 // method stored
    rec.set(u16(0), 12); rec.set(u16(0), 14);
    rec.set(u32(c.crc), 16);
    rec.set(u32(c.size), 20); rec.set(u32(c.size), 24);
    rec.set(u16(c.nameB.length), 28);
    rec.set(u32(c.offset), 42);          // relative offset of local header
    rec.set(c.nameB, 46);
    chunks.push(rec);
    offset += rec.length;
  }

  const end = new Uint8Array(22);
  end.set(u32(0x06054B50), 0);           // end of central directory
  end.set(u16(0), 4); end.set(u16(0), 6);
  end.set(u16(central.length), 8); end.set(u16(central.length), 10);
  end.set(u32(offset - centralStart), 12);   // size of central directory
  end.set(u32(centralStart), 16);            // central directory offset
  chunks.push(end);
  offset += 22;

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const ch of chunks) { out.set(ch, pos); pos += ch.length; }
  return out;
}

/* ---------------- XML helpers ---------------- */

function xmlEsc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Column letter from 0-based index (0→A, 27→AB). */
function colLetter(i) {
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

const XML_CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const XML_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const XML_WORKBOOK =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const XML_WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/* styles.xml: font 0 = Calibri 11, font 1 = Calibri 11 bold (header);
   fill 0 = none, fill 1 = light grey header; cellXfs: 0 default, 1 header. */
const XML_STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF0A2540"/><name val="Calibri"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EFF4"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Build the sheet XML. rows: array of arrays; the row at headerRowIndex
 * (0-based) gets the bold header style.
 * Values: string → inline string cell; number → numeric cell.
 */
function sheetXml(rows, colWidths, headerRowIndex = 0) {
  const cols = colWidths.length
    ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.min(60, w))}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const body = rows.map((row, r) => {
    const cells = row.map((v, ci) => {
      const ref = `${colLetter(ci)}${r + 1}`;
      const style = r === headerRowIndex ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) {
        return `<c r="${ref}"${style}><v>${v}</v></c>`;
      }
      const text = String(v ?? '');
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(text)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${cols}<sheetViews><sheetView workbookViewId="1"><pane ySplit="${headerRowIndex + 1}" topLeftCell="A${headerRowIndex + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetData>${body}</sheetData>
</worksheet>`;
  return sheet;
}

/**
 * Build an .xlsx file for one report table.
 * @param {{title:string, subtitle?:string, filters?:string[], generatedAt?:string, generatedBy?:string, columns:Array, rows:Array, totals?:object|null, fileName?:string}} report
 * @returns {Uint8Array} the workbook bytes
 */
export function xlsxBytes(report) {
  const enc = new TextEncoder();
  // First two rows: title block (kept as plain text rows), then header row.
  const meta = [];
  meta.push([report.title || 'Report']);
  const subBits = [];
  if (report.subtitle) subBits.push(report.subtitle);
  if (report.filters && report.filters.length) subBits.push(report.filters.join(' · '));
  if (subBits.length) meta.push([subBits.join(' — ')]);
  if (report.generatedAt) {
    meta.push([`Generated ${report.generatedAt}${report.generatedBy ? ' by ' + report.generatedBy : ''} — ShipCrew Payroll (Namibia)`]);
  }
  meta.push([]);  // spacer row

  const headerRow = report.columns.map(c => c.label);
  const cellValue = (c, v) => {
    // Excel gets real NUMBERS it can sum: money/number as-is, hours as
    // decimal hours (930 min → 15.5). Text stays text.
    if (v === null || v === undefined || v === '') return '';
    if (c.type === 'money' || c.type === 'number') return Number(v);
    if (c.type === 'hours') return Math.round((Number(v) / 60) * 100) / 100;
    return String(v);
  };
  const dataRows = report.rows.map(r => report.columns.map(c => cellValue(c, r[c.key])));
  let allRows = [...meta, headerRow, ...dataRows];
  const headerIdx = meta.length;   // header row position in allRows (0-based)
  if (report.totals) {
    allRows.push([]);  // spacer
    const totalRow = report.columns.map(c => {
      if (c.key === (report.columns[0].key)) return report.totals.label || 'Totals';
      const v = report.totals[c.key];
      if (v === undefined || v === null) return '';
      return (c.type === 'money' || c.type === 'number') ? Number(v)
        : (c.type === 'hours' ? Math.round((Number(v) / 60) * 100) / 100 : String(v));
    });
    allRows.push(totalRow);
  }

  // Column widths: from the longest text in each column (rough, char count).
  const widths = report.columns.map((c, i) => {
    let w = c.label.length + 2;
    for (const r of dataRows) {
      const v = r[c.key];
      if (v === null || v === undefined) continue;
      const len = (typeof v === 'number' ? String(v) : String(v)).length + 2;
      if (len > w) w = len;
    }
    return w;
  });

  const sheet = sheetXml(allRows, widths, headerIdx);
  const files = [
    { name: '[Content_Types].xml', data: enc.encode(XML_CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(XML_RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(XML_WORKBOOK) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(XML_WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: enc.encode(XML_STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) }
  ];
  return zipStore(files);
}

/** Trigger the browser download of the workbook. Returns byte length. */
export function downloadXlsx(report) {
  const bytes = xlsxBytes(report);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = report.fileName || 'report.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return bytes.length;
}
