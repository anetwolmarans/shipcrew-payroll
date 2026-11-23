/**
 * crew-import.js — BULK CREW IMPORT (v2.6.0).
 *
 * PLAIN ENGLISH: companies employ many people. Typing them one by one is
 * slow, so this module turns a pasted or uploaded list (CSV / tab-separated)
 * into validated crew records. Parsing and validation happen HERE (pure
 * functions, unit-tested); the Crew screen shows a preview and then creates
 * each record through the SAME audited write path as the manual form
 * (operations.service.js → createCrew), so nothing bypasses permissions,
 * the audit log or the sync queue.
 *
 * Accepted columns (header row required, order free):
 *   employeeNumber  — optional; blank rows get an auto NAF-#### number
 *   fullName        — REQUIRED
 *   position        — free text (the register's standard list is offered, not enforced)
 *   idType          — optional; unknown values fall back to "Other" with a warning
 *   idNumber        — optional
 *   phone           — optional
 *   emergencyContact— optional
 *   startDate       — optional; YYYY-MM-DD or DD/MM/YYYY
 *   status          — optional; active / on_leave / on leave / inactive (default active)
 *   vessel          — optional; matched by name against the fleet (no match → warning, left empty)
 */
import { ID_TYPES } from '../config.js';

/** Safety valve: one import run is capped so the browser stays responsive. */
export const MAX_IMPORT_ROWS = 2000;

/** Header aliases → canonical field. Matching is case- and separator-insensitive. */
const ALIASES = {
  employeenumber: 'employeeNumber', employeeno: 'employeeNumber',
  empno: 'employeeNumber', employeeid: 'employeeNumber', id: 'employeeNumber', number: 'employeeNumber',
  fullname: 'fullName', name: 'fullName', full_name: 'fullName', crewname: 'fullName',
  position: 'position', role: 'position', jobtitle: 'position',
  idtype: 'idType', iddocument: 'idType', identitydocument: 'idType', documenttype: 'idType',
  idnumber: 'idNumber', idno: 'idNumber', idpassportnumber: 'idNumber', passportnumber: 'idNumber',
  phone: 'phone', phonenumber: 'phone', mobile: 'phone', cellphone: 'phone', tel: 'phone',
  emergencycontact: 'emergencyContact', emergency: 'emergencyContact', emergencyname: 'emergencyContact',
  nextofkin: 'emergencyContact', nextofkincontact: 'emergencyContact',
  startdate: 'startDate', employmentstartdate: 'startDate', started: 'startDate',
  status: 'status', employmentstatus: 'status',
  vessel: 'vessel', homevessel: 'vessel', vesselname: 'vessel', ship: 'vessel'
};
const CANONICAL = ['employeeNumber', 'fullName', 'position', 'idType', 'idNumber', 'phone', 'emergencyContact', 'startDate', 'status', 'vessel'];

/** Parse a CSV/TSV text into { headers, rows, parseErrors }. Handles quoted fields. */
export function parseCrewCsv(text) {
  const out = { headers: [], rows: [], parseErrors: [] };
  const raw = String(text || '').replace(/^\uFEFF/, '');   // strip Excel BOM
  if (!raw.trim()) return { ...out, parseErrors: [{ line: 1, reason: 'The list is empty — paste rows or choose a file first.' }] };

  const firstLine = raw.slice(0, raw.indexOf('\n') === -1 ? raw.length : raw.indexOf('\n'));
  const delim = (firstLine.indexOf('\t') !== -1 && firstLine.indexOf(',') === -1) ? '\t' : ',';

  // Character-scan parser: supports "quoted, fields", "" escapes and newlines inside quotes.
  const records = [];
  let field = '', record = [], inQuotes = false, line = 1, lineOfRecordStart = 1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i], next = raw[i + 1];
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      record.push(field); field = '';
    } else if (ch === '\r') {
      /* skip — handled with \n */
    } else if (ch === '\n') {
      record.push(field); field = ''; records.push({ cells: record, line: lineOfRecordStart });
      record = []; line++; lineOfRecordStart = line;
    } else field += ch;
  }
  if (field !== '' || record.length) { record.push(field); records.push({ cells: record, line: lineOfRecordStart }); }
  if (inQuotes) out.parseErrors.push({ line: lineOfRecordStart, reason: 'A quoted field was never closed.' });

  // Drop fully-empty trailing records (a trailing newline must not create a phantom row).
  const meaningful = records.filter(r => r.cells.some(c => String(c).trim() !== ''));
  if (!meaningful.length) return { ...out, parseErrors: [{ line: 1, reason: 'The list is empty — paste rows or choose a file first.' }] };

  // Header row → canonical names (unknown columns are kept verbatim so data is not silently lost).
  const headerCells = meaningful[0].cells.map(c => String(c).trim());
  const headers = headerCells.map((h, idx) => {
    const key = h.toLowerCase().replace(/[\s_\-.]+/g, '').replace(/#/g, 'number');
    if (ALIASES[key]) return ALIASES[key];
    if (CANONICAL.includes(h)) return h;
    return `unknown:${h || `column${idx + 1}`}`;
  });
  out.headers = headerCells;
  if (!headers.includes('fullName')) {
    out.parseErrors.push({ line: meaningful[0].line, reason: 'The header row has no "fullName" column. Download the template to see the accepted headings.' });
    return out;
  }

  for (const r of meaningful.slice(1)) {
    const data = {};
    headers.forEach((h, idx) => { if (h.startsWith('unknown:')) return; data[h] = String(r.cells[idx] ?? '').trim(); });
    out.rows.push({ line: r.line, data });
  }
  if (out.rows.length > MAX_IMPORT_ROWS) {
    out.rows = out.rows.slice(0, MAX_IMPORT_ROWS);
    out.parseErrors.push({ line: meaningful[0].line, reason: `More than ${MAX_IMPORT_ROWS} rows — the first ${MAX_IMPORT_ROWS} were kept. Split the file and import in batches.` });
  }
  return out;
}

/** Normalise an employment status; returns { value, warning? } */
function normStatus(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!s) return { value: 'active' };
  if (['active', 'on_leave', 'inactive'].includes(s)) return { value: s };
  if (s === 'on leave' || s === 'leave') return { value: 'on_leave' };
  return { value: null, warning: `Unknown status "${raw}" — use active, on_leave or inactive.` };
}

/** Normalise a start date (YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY) → ISO or null+warning. */
function normDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return { value: null };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { value: s, iso: true };
  m = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(s);   // DD/MM/YYYY (Namibian habit)
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1]) {
      return { value: `${m[3]}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}` };
    }
  }
  return { value: null, warning: `Start date "${s}" is not a real date (use YYYY-MM-DD or DD/MM/YYYY) — left empty.` };
}

/**
 * Validate parsed rows against the current register.
 * ctx: { existingIds: Set<string lowercase employee numbers>, vessels: [{id, name}] }
 * Returns { valid, invalid, warnings } — invalid rows carry per-row reasons.
 */
export function validateCrewRows(rows, ctx = {}) {
  const existingIds = ctx.existingIds || new Set();
  const vessels = ctx.vessels || [];
  const valid = [], invalid = [];
  const seenInFile = new Map();   // lowercase employee number → first line
  const namesInFile = new Set();

  for (const row of rows) {
    const d = row.data;
    const errors = [], warnings = [];
    const fullName = String(d.fullName || '').trim();
    if (!fullName) errors.push('Full name is required.');
    if (fullName && namesInFile.has(fullName.toLowerCase())) errors.push(`"${fullName}" appears twice in this list.`);
    if (fullName) namesInFile.add(fullName.toLowerCase());

    let employeeNumber = String(d.employeeNumber || '').trim().toUpperCase();
    if (employeeNumber) {
      if (seenInFile.has(employeeNumber.toLowerCase())) errors.push(`Employee number ${employeeNumber} appears twice in this list.`);
      else if (existingIds.has(employeeNumber.toLowerCase())) errors.push(`Employee number ${employeeNumber} already exists in the register — it will NOT be overwritten.`);
      seenInFile.set(employeeNumber.toLowerCase(), row.line);
    }

    const status = normStatus(d.status);
    if (status.warning) warnings.push(status.warning);
    const startDate = normDate(d.startDate);
    if (startDate.warning) warnings.push(startDate.warning);

    let idType = String(d.idType || '').trim();
    if (idType && !ID_TYPES.includes(idType)) { warnings.push(`ID type "${idType}" is not a standard type — set to "Other".`); idType = 'Other'; }
    if (!idType) idType = 'Namibian ID';

    let vesselId = null;
    const vesselName = String(d.vessel || '').trim();
    if (vesselName) {
      const hit = vessels.find(v =>
        v.name.toLowerCase() === vesselName.toLowerCase() ||
        v.id.toLowerCase() === vesselName.toLowerCase());
      if (hit) vesselId = hit.id;
      else warnings.push(`Vessel "${vesselName}" is not in the fleet — home vessel left empty (add the vessel first, then edit).`);
    }

    const record = {
      line: row.line,
      employeeNumber: employeeNumber || null,   // null → the screen auto-assigns NAF-####
      fullName, position: String(d.position || '').trim(),
      idType, idNumber: String(d.idNumber || '').trim(),
      phone: String(d.phone || '').trim(),
      emergencyContact: String(d.emergencyContact || '').trim(),
      startDate: startDate.value, employmentStatus: status.value || 'active',
      homeVesselId: vesselId
    };
    if (errors.length) invalid.push({ ...record, errors, warnings });
    else valid.push({ ...record, warnings });
  }
  return { valid, invalid };
}

/**
 * Next free employee number in the NAF-#### series, given the numbers already
 * in use (as lowercase strings). Returns e.g. "NAF-0032".
 */
export function nextEmployeeNumber(existingIds) {
  let max = 0;
  for (const id of existingIds) {
    const m = /^naf-(\d+)$/.exec(String(id).toLowerCase());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `NAF-${String(max + 1).padStart(4, '0')}`;
}

/** A batch of auto-numbers: assigns NAF-#### to every valid row that has none. */
export function assignAutoNumbers(validRows, existingIds) {
  const used = new Set(existingIds);
  return validRows.map(r => {
    if (r.employeeNumber) return r;
    let n = nextEmployeeNumber(used);
    while (used.has(n.toLowerCase())) {
      const m = /^naf-(\d+)$/.exec(n);
      n = `NAF-${String(parseInt(m[1], 10) + 1).padStart(4, '0')}`;
    }
    used.add(n.toLowerCase());
    return { ...r, employeeNumber: n };
  });
}

/** The downloadable template: header + three clearly-fake example rows. */
export function crewTemplateCsv() {
  return [
    'employeeNumber,fullName,position,idType,idNumber,phone,emergencyContact,startDate,status,vessel',
    ',Example Crew One,Deckhand,Namibian ID,11010100123,+264 81 000 0001,Next of kin — +264 81 000 0011,2026-01-15,active,MFV Etosha Bay',
    ',Example Crew Two,Cook,Namibian ID,85020200456,+264 81 000 0002,Next of kin — +264 81 000 0012,15/02/2026,active,',
    ',Example Crew Three,Fish Processing Operator,Other,,+264 81 000 0003,,2026-03-01,inactive,'
  ].join('\r\n') + '\r\n';
}
