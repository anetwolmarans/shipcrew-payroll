# Guide 6 — The Roadmap

The system is delivered in six tested phases. Nothing is skipped; every phase is verified before the next starts. This build = **Phases 1, 2, 3 and 4 complete**.

| Phase | What it delivers | Status |
|---|---|---|
| **1. Foundation** | Project structure, PWA (installable, offline), IndexedDB with all record stores, sign-in with demo + Firebase modes, six roles with permissions matrix + server security rules, sessions & auto-lock, audit trail, sync queue foundation, all beginner guides | ✅ **Complete** |
| **2. Crew & Operations** | Crew register (full employee records, secured banking), vessel register, trip register with the 8 statuses and permanent status history, crew assignments with preserved history, **crew clock-in/clock-out** with trip validation and duplicate prevention, attendance view, in-app user management | ✅ **Complete** |
| **3. Offline & Synchronisation** | Offline device activation with device-bound PIN, full device registry with administrator revocation, automatic duplicate-proof sync, per-record sync states, conflict handling | ✅ **Complete** |
| **4. Working Hours & Catch** | Automatic hour categories (ordinary, overtime, night, Sunday, public holiday), breaks & rest, midnight-crossing shifts, supervisor corrections with full history, catch register, six quota allocation methods | ✅ **Complete** |
| **5. Payroll** | Contracts (hourly / fixed salary) effective-dated and audited, commissions, allowances, PAYE + SSC **from verified statutory rules only**, per-trip payroll with statutory periods, approval & locking, PDF payslips, adjustment entries | Planned |
| **6. Reporting & Deployment** | Full report library with PDF/Excel/CSV exports, management dashboards, optional Android packaging (Capacitor), production security review | Planned |

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

## Contact points for decisions you will be asked for

- **Phase 2 (done):** trip reference format was set to `TRP-YYYY-NNN` (e.g. TRP-2026-016) — tell us if you want vessel codes in it.
- **Phase 3 (done):** PIN length is 4–8 digits, set per device in the Devices screen; revocation signs a device out at its next check. Tell us if you want mandatory PINs on all crew devices (currently optional per device).
- **Phase 4 (done):** break rules default to MANUAL (crew press Start break) with automatic deduction available in Settings; ordinary daily allowance defaults to 9 h and night window to 22:00–05:00 — both are Settings choices, so you can tune them to your vessels' agreements without a code change.
- **Phase 5:** payslip layout, commission schemes per position, which allowances you use.
- **Phase 6:** report formats you want first; whether an Android package (Capacitor) is needed or the installed PWA is enough.
