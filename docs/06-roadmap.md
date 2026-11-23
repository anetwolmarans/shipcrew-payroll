# Guide 6 — The Roadmap

The system is delivered in six tested phases. Nothing is skipped; every phase is verified before the next starts. This build = **all six phases complete** (v2.5.0). A v2.5.1 hotfix corrected the payroll-screen button rendering and added a locked-trip guard; **v2.6.0 adds bulk crew import** (Crew → Bulk import: paste or upload a CSV, validate, preview, create). v2.6.1 makes the import template downloadable by every role (Crew → Import template). **v2.7.0 corrects the SSC engine** — basic-salary base (premiums excluded), monthly floor/ceiling shared across runs, fixed-salary crew charged on their monthly rate, gazetted ceiling schedule to 2029 pre-loaded, SSC basis shown on payslips and in the statutory report.

| Phase | What it delivers | Status |
|---|---|---|
| **1. Foundation** | Project structure, PWA (installable, offline), IndexedDB with all record stores, sign-in with demo + Firebase modes, six roles with permissions matrix + server security rules, sessions & auto-lock, audit trail, sync queue foundation, all beginner guides | ✅ **Complete** |
| **2. Crew & Operations** | Crew register (full employee records, secured banking), vessel register, trip register with the 8 statuses and permanent status history, crew assignments with preserved history, **crew clock-in/clock-out** with trip validation and duplicate prevention, attendance view, in-app user management | ✅ **Complete** |
| **3. Offline & Synchronisation** | Offline device activation with device-bound PIN, full device registry with administrator revocation, automatic duplicate-proof sync, per-record sync states, conflict handling | ✅ **Complete** |
| **4. Working Hours & Catch** | Automatic hour categories (ordinary, overtime, night, Sunday, public holiday), breaks & rest, midnight-crossing shifts, supervisor corrections with full history, catch register, six quota allocation methods | ✅ **Complete** |
| **5. Payroll** | Contracts (hourly / fixed salary / daily at sea) effective-dated and audited, commissions, allowances, PAYE + SSC **from verified statutory rules only**, per-trip payroll with statutory periods, approval & locking, PDF payslips, adjustment entries | ✅ **Complete** |
| **6. Reporting & Deployment** | Full report library (11 reports) with PDF/Excel/CSV exports, live management dashboard, production security review, Android decision (PWA + signed APK — no Capacitor needed) | ✅ **Complete** |

## How each phase is accepted

Every phase ends with a test guide (like `docs/04-testing-guide.md`) mapped to the acceptance tests in the project brief. You run it, you tick the boxes, you say "approved" — and only then does the next phase begin. Phase 2 is verified with sections H–M of the testing guide (42 automated browser checks cover the same ground — ask your developer to show you the green summary).

## What Phase 4 delivered (live now)

1. **Hour categories are calculated automatically** from the raw clock records — ordinary (first 9 h of a local day, a company setting), overtime beyond it, night work (22:00–05:00), Sunday work, and public-holiday work from the official Namibian calendar (computed from the Public Holidays Act rules: fixed dates, Easter-based days, Monday-after-Sunday). Every minute lands in exactly one category; a minute on a holiday beats night, night beats overtime. Nothing is typed by hand.
2. **Shifts that cross midnight are handled**: the shift belongs to the day it started on, but its after-midnight minutes count on the new day with that day's fresh ordinary allowance. The demo data contains a real 20:15 → 04:40 shift you can check against a hand calculation.
3. **Breaks**: crew start and end their own breaks; break time never counts as worked time. The rules (manual or automatic) are a Settings choice.
4. **Rest warnings**: when two shifts are less than 11 hours apart (adjustable), a visible warning names the person and the gap — recorded, never silently ignored, never blocking.
5. **Supervisor corrections with full history**: a supervisor corrects a completed clock event with a mandatory reason; the original times and every correction (who, when, why) stay in the record forever, visibly marked "corrected". Raw clock presses are never erased.
6. **The catch register**: species, category, weight, landing site, paperwork refs per trip — amendments only, with reasons; nothing is ever deleted.
7. **Six quota-allocation methods** (equal split, percentages, fixed weight per role, rank points, contractual formula, custom with reason) with a live preview, per-member warnings, and superseded allocations kept as history. Different crew members can sit under different arrangements.
8. Phase 5 payroll prices these categories and shares — the calculation work is done.

Full plain-English walkthrough: `docs/11-working-hours-catch.md`. Test checklist: `docs/04-testing-guide.md` sections **S–U**.

## What Phase 5 delivered (live now)

1. **Contracts price the trips** — hourly, daily-per-day-at-sea and fixed-salary contracts, effective-dated (the contract in force on a shift's clock-in date prices that shift), every version kept forever with who/when/why. An hourly rate below the **N$18.00 national minimum wage is refused on entry**.
2. **Statutory rules verified and implemented** — PAYE (2026/27 tables, annualise ÷ 12 method), SSC (0.9% + 0.9%, N$500–N$12,500 insurable, ceiling rise of 1 Sep 2026 honoured), overtime ×1.5, Sunday ×2, public holiday ×2, night-work allowance +6% on the statutory 20:00–07:00 window. Every rule cites its official source in the Statutory Rules screen — nothing was guessed.
3. **Per-trip payroll runs**: build a draft (hours × contracts + allowances + catch-share commission at a price you enter − PAYE − SSC), review every line, then **approve & lock**. A locked run never changes — the engine refuses a rebuild with a clear message.
4. **Payslips**: one per crew member per trip (duplicate-proof), visible to each crew member on their own phone — only their own, enforced again by the Firestore rules. PDFs are generated **on the device, offline**, with every earning and deduction on its own line and the employer SSC shown separately.
5. **Adjustment entries**: the only way to correct payroll after locking — visible entries with mandatory reasons, settled on the next run. History is never rewritten.
6. All money is computed and stored in **integer cents**; totals can never drift by rounding. The automated suite (`scripts/test-payroll-engine.mjs`, 47 checks) verifies every statutory calculation against hand-computed expectations.

Full plain-English walkthrough: `docs/12-payroll.md`. Test checklist: `docs/04-testing-guide.md` sections **V–X**.

## What Phase 6 delivered (live now)

1. **The report library — 11 reports, 3 formats each.** Crew register, vessel register, trip register, attendance & hours summary, catch register, quota & commission allocations, payroll summary, statutory contributions (PAYE & SSC), payslip register, payslip queries & disputes, and the audit trail report. Every report filters (date range in Namibian dates, crew, vessel, trip, status, free-text search) and exports as **PDF** (A4 landscape, print-ready, generated on device), **Excel .xlsx** (a real workbook — bold frozen header, numbers stored as numbers so Excel can sum, hours as decimal hours, totals row) and **CSV** (UTF-8 with BOM, no thousand separators). Filters are printed on every export; every export is recorded in the audit log (`data_exported`).
2. **Role-gated like everything else** — payroll reports need `view_payroll_all`, the audit report needs `view_audit`, and file exports need `export_reports` (the supervisor role reviews on screen without file exports). Reports read only what the server rules already allow each role to read.
3. **Works offline.** The Excel writer is hand-built (no external library, like the PDF writer), so reports and exports run with no internet — important on vessels and at remote landing sites. Verified: the generated workbook opens in openpyxl/Excel with zero warnings.
4. **The management dashboard is now fully live**: catch landed this month (tonnes), the latest payroll run with its net total and status, open payslip queries — alongside vessels, trips, crew, clocked-in-now and sync health. The getting-started card became the production finish-line checklist.
5. **Production security review completed** — `docs/14-security-review.md` documents the line-by-line review of the Firestore rules (deny-by-default, role wall, banking restriction, immutable payslips and locked payroll, append-only audit log) with a sign-off table for the go-live decision. Phase 6 added **no new collections and no new write access**.
6. **Android decision**: the installed PWA plus the existing signed APK (docs/08) cover the phones; a Capacitor wrapper would add a second codebase for no benefit — not needed.
7. **Automated verification**: `scripts/test-reports-engine.mjs` runs 77 checks against hand-computed expectations (per-report data, filters, CSV escaping, ZIP/PDF structure, payslip regression, Namibian timezone handling); the payroll (47) and hours (48) suites still pass — 172 automated checks in total.

Full plain-English walkthrough: `docs/13-reports.md`. Test checklist: `docs/04-testing-guide.md` section **Z**.

## Contact points for decisions you will be asked for

- **Phase 2 (done):** trip reference format was set to `TRP-YYYY-NNN` (e.g. TRP-2026-016) — tell us if you want vessel codes in it.
- **Phase 3 (done):** PIN length is 4–8 digits, set per device in the Devices screen; revocation signs a device out at its next check. Tell us if you want mandatory PINs on all crew devices (currently optional per device).
- **Phase 4 (done):** break rules default to MANUAL (crew press Start break) with automatic deduction available in Settings; ordinary daily allowance defaults to 9 h and night window to 22:00–05:00 — both are Settings choices, so you can tune them to your vessels' agreements without a code change.
- **Phase 5 (done):** the commission input is a price per kg entered per run (share kg × price); commission schemes per position and your allowance types can be added as contract/policy choices in Phase 6 reporting. Tell us your real commission practice and we will encode it.
- **Phase 6 (done):** the eleven report formats are the ones the brief required; more formats (e.g. monthly statutory remittance forms, per-vessel cost summaries) can be added to the library one at a time — each is a small addition now that the engine exists. Android: installed PWA + signed APK, no Capacitor. If you later want payslip **photo attachments** (photographing weighbridge slips onto catch records), that is a Phase-7-scale feature: it needs Firebase Storage (billable above the free tier) and new sync logic — priced and planned before building.
