# Guide 13 — Reports & Exports (Phase 6, v2.5.0)

**Time needed to learn: 10 minutes.** Phase 6 completes the system: a report library with eleven reports, each exportable as **PDF** (print-ready), **Excel (.xlsx)** (a real workbook you can sum and sort) and **CSV** (opens anywhere). Every report is built from the records on your device, so **reports work offline** — at sea, with no internet.

---

## 1. Where to find it

Sidebar → **Reports & Exports** (Payroll group). Everyone on staff can open it; each person sees only the reports their role allows:

| Role | Sees |
|---|---|
| System Administrator | All 11 reports |
| Payroll Administrator | Crew, vessels, trips, attendance, catch, quota + **all payroll/statutory reports** |
| Vessel Manager | Crew, vessels, trips, attendance, catch, quota (no payroll figures) |
| Supervisor | Crew, vessels, trips, attendance, catch, quota — **on screen only** (no file exports) |
| Auditor | Everything, including the audit trail report — read-only |

Exports are recorded in the audit log (`data_exported`) with the report name, row count and the filters used — so an export can always be traced.

## 2. The eleven reports

| Group | Report | Answers the question |
|---|---|---|
| Operations | **Crew register** | Who is employed, in what position, with what contact details |
| Operations | **Vessel register** | What vessels do we run, what status, how many trips each |
| Operations | **Trip register** | Every trip: ports, planned/actual dates, crew count, catch landed |
| Operations | **Attendance & hours summary** | Per crew member: shifts, worked time, ordinary / overtime / night / Sunday / holiday minutes, breaks |
| Operations | **Catch register** | Every landing: species, category, weight, site, paperwork refs — with the total tonnage |
| Operations | **Quota & commission allocations** | How each trip's catch was split among the crew (superseded allocations included) |
| Payroll | **Payroll summary** | Per payslip: gross, PAYE, SSC employee, net, SSC employer — per run, draft runs marked |
| Payroll | **Statutory contributions (PAYE & SSC)** | What we owe NamRA and SSC per payslip and in total |
| Payroll | **Payslip register** | Every payslip ever issued, with pay date and who issued it |
| Payroll | **Payslip queries & disputes** | Every question a crew member raised, and the answer given |
| System | **Audit trail report** | Who did what, when — filtered by date or action |

## 3. Filters

Each report offers the filters that make sense for it — date range (Namibian dates), crew member, vessel, trip, status, and a free-text search. **Leave everything empty to report on all records on the device.** The filters you chose are printed on the PDF, in the Excel title block and in the CSV header, so a printout always says what it covers.

## 4. The three formats and when to use each

| Format | Use it for | Notes |
|---|---|---|
| **PDF** | Printing, filing, handing to an auditor | A4 landscape, navy header band, totals row shaded, page numbers. Generated on the device — works offline. |
| **Excel (.xlsx)** | Working with the numbers: sums, pivots, VAT/SSC checks | A real workbook: bold frozen header, sized columns, money and hours stored as **numbers** (hours as decimal hours, e.g. 15.5 = 15 h 30 m), totals row at the bottom. |
| **CSV** | Importing into other software (Sage, accounting packages, email to the bookkeeper) | Plain text with a UTF-8 marker so names with special characters open correctly. Numbers have no thousand separators so nothing gets confused. |

On screen the first 300 rows are shown; **the downloads always contain every row**.

## 5. The management dashboard

The Dashboard's stat cards are now all live: active vessels, trips at sea, crew, who is clocked in right now, **catch landed this month (tonnes)**, **the latest payroll run with its net total and status** (approved & locked / draft), **open payslip queries**, waiting-to-sync, and audit entries. Below them is the finish-line checklist (reports → security review → backups → device installs → final test checklist).

## 6. How the reports stay honest

- Reports read **the same records** the screens show — a report can never show more than the role may see, and the server rules enforce the same restrictions on the raw data.
- Payroll figures come from **locked runs** (never recalculated) and payslip records that **cannot change** — so a payroll report and a payslip can never disagree.
- Nothing in the reports is editable; catch reports show the **amended (current) weight**, and the amendment history stays on the Catch & Quota screen.
- Exports carry the app version, generation time and the user who made them.

## 7. Common problems

| Problem | Meaning / fix |
|---|---|
| A report shows fewer rows than expected | Check the filters — a date range or a selected trip narrows the report. Leave filters empty for everything. |
| "Waiting to sync" is not zero and the report lacks recent records | The report reads this device's records. Sync first (Dashboard → **Sync now**), then build the report. |
| Excel shows ##### in a column | Widen the column — Excel does not auto-fit on import. |
| Supervisor sees no export buttons | By design: supervisors review on screen; exports are for payroll, management and auditor roles. |
| A crew member asks for a report | Crew use their own phone screens (my payslips, my hours). Reports are a staff tool. |

## 8. Android / installation (the Phase 6 decision)

The app installs from the browser on any phone or laptop (install icon in the address bar) and the **signed Android APK** from `docs/08-android-apk.md` stays available for company phones. A separate Capacitor wrapper was evaluated and is **not needed** — the installed PWA already gives a home-screen icon, fullscreen operation and offline use, without a second codebase to maintain.
