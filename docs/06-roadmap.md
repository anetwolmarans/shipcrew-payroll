# Guide 6 — The Roadmap

The system is delivered in six tested phases. Nothing is skipped; every phase is verified before the next starts. This build = **Phases 1 and 2 complete**.

| Phase | What it delivers | Status |
|---|---|---|
| **1. Foundation** | Project structure, PWA (installable, offline), IndexedDB with all record stores, sign-in with demo + Firebase modes, six roles with permissions matrix + server security rules, sessions & auto-lock, audit trail, sync queue foundation, all beginner guides | ✅ **Complete** |
| **2. Crew & Operations** (this build) | Crew register (full employee records, secured banking), vessel register, trip register with the 8 statuses and permanent status history, crew assignments with preserved history, **crew clock-in/clock-out** with trip validation and duplicate prevention, attendance view, in-app user management | ✅ **Complete** |
| **3. Offline & Synchronisation** | Offline device activation with device-bound PIN, full device registry with administrator revocation, automatic duplicate-proof sync, per-record sync states, conflict handling | ▶ Next |
| **4. Working Hours & Catch** | Automatic hour categories (ordinary, overtime, night, Sunday, public holiday), breaks & rest, midnight-crossing shifts, supervisor corrections with full history, catch register, six quota allocation methods | Planned |
| **5. Payroll** | Contracts (hourly / fixed salary) effective-dated and audited, commissions, allowances, PAYE + SSC **from verified statutory rules only**, per-trip payroll with statutory periods, approval & locking, PDF payslips, adjustment entries | Planned |
| **6. Reporting & Deployment** | Full report library with PDF/Excel/CSV exports, management dashboards, optional Android packaging (Capacitor), production security review | Planned |

## How each phase is accepted

Every phase ends with a test guide (like `docs/04-testing-guide.md`) mapped to the acceptance tests in the project brief. You run it, you tick the boxes, you say "approved" — and only then does the next phase begin. Phase 2 is verified with sections H–M of the testing guide (42 automated browser checks cover the same ground — ask your developer to show you the green summary).

## What Phase 3 will look like in practice

1. You confirm Phase 2 testing (sections H–M) — that is the trigger.
2. Devices register themselves with the administrator; each device gets an offline PIN so crew can unlock at sea without internet.
3. The sync engine goes fully automatic: every clock event and record carries its own state ("saved locally / waiting to sync / synchronised / failed — kept"), uploads are duplicate-proof by design, and conflicts resolve safely.
4. The Statutory Rules research for Phase 5 (NamRA tables, SSC notices, fisher regulations) continues in parallel so payroll is never blocked later.

## Contact points for decisions you will be asked for

- **Phase 2 (done):** trip reference format was set to `TRP-YYYY-NNN` (e.g. TRP-2026-016) — tell us if you want vessel codes in it.
- **Phase 4:** break rules on your vessels (automatic or manual?).
- **Phase 5:** payslip layout, commission schemes per position, which allowances you use.
- **Phase 6:** report formats you want first; whether an Android package (Capacitor) is needed or the installed PWA is enough.
