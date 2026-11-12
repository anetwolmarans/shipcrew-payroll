# Guide 6 — The Roadmap

The system is delivered in six tested phases. Nothing is skipped; every phase is verified before the next starts. This build = **Phases 1, 2 and 3 complete**.

| Phase | What it delivers | Status |
|---|---|---|
| **1. Foundation** | Project structure, PWA (installable, offline), IndexedDB with all record stores, sign-in with demo + Firebase modes, six roles with permissions matrix + server security rules, sessions & auto-lock, audit trail, sync queue foundation, all beginner guides | ✅ **Complete** |
| **2. Crew & Operations** | Crew register (full employee records, secured banking), vessel register, trip register with the 8 statuses and permanent status history, crew assignments with preserved history, **crew clock-in/clock-out** with trip validation and duplicate prevention, attendance view, in-app user management | ✅ **Complete** |
| **3. Offline & Synchronisation** | Offline device activation with device-bound PIN, full device registry with administrator revocation, automatic duplicate-proof sync, per-record sync states, conflict handling | ✅ **Complete** |
| **4. Working Hours & Catch** | Automatic hour categories (ordinary, overtime, night, Sunday, public holiday), breaks & rest, midnight-crossing shifts, supervisor corrections with full history, catch register, six quota allocation methods | Planned |
| **5. Payroll** | Contracts (hourly / fixed salary) effective-dated and audited, commissions, allowances, PAYE + SSC **from verified statutory rules only**, per-trip payroll with statutory periods, approval & locking, PDF payslips, adjustment entries | Planned |
| **6. Reporting & Deployment** | Full report library with PDF/Excel/CSV exports, management dashboards, optional Android packaging (Capacitor), production security review | Planned |

## How each phase is accepted

Every phase ends with a test guide (like `docs/04-testing-guide.md`) mapped to the acceptance tests in the project brief. You run it, you tick the boxes, you say "approved" — and only then does the next phase begin. Phase 2 is verified with sections H–M of the testing guide (42 automated browser checks cover the same ground — ask your developer to show you the green summary).

## What Phase 3 delivered (live now)

1. Devices activate with a **device-bound PIN** (4–8 digits): the lock screen unlocks without internet at sea. The PIN is hashed and stored on the device only — it never uploads. Five wrong attempts lock the PIN for 60 seconds (the password always works).
2. A **"Lock now"** padlock button in the top bar locks shared devices immediately.
3. The **device registry** shows every device (name, type, owner, last seen, PIN state); administrators can **revoke** a lost phone (it signs out, cannot sign in or sync) and **reinstate** it later. In live mode the central registry is the authority; every device obeys at its next check.
4. The **sync engine is fully automatic** and duplicate-proof: drains on open, on reconnect, in the foreground, after every record, and every 30 s. Each record shows its state: *saved locally → waiting to sync → synchronised / failed — kept* (kept records are safe and retried, never lost).
5. **Conflicts resolve safely**: the newest edit wins, the older device adopts the newer copy, and every conflict is written to the audit log (`sync_conflict`). Every upload run is recorded in the sync ledger (`sync_transactions`).
6. The Statutory Rules research for Phase 5 (NamRA tables, SSC notices, fisher regulations) continues in parallel so payroll is never blocked later.

Full plain-English walkthrough: `docs/10-devices-pin-sync.md`. Test checklist: `docs/04-testing-guide.md` sections P–R.

## Contact points for decisions you will be asked for

- **Phase 2 (done):** trip reference format was set to `TRP-YYYY-NNN` (e.g. TRP-2026-016) — tell us if you want vessel codes in it.
- **Phase 3 (done):** PIN length is 4–8 digits, set per device in the Devices screen; revocation signs a device out at its next check. Tell us if you want mandatory PINs on all crew devices (currently optional per device).
- **Phase 4:** break rules on your vessels (automatic or manual?).
- **Phase 5:** payslip layout, commission schemes per position, which allowances you use.
- **Phase 6:** report formats you want first; whether an Android package (Capacitor) is needed or the installed PWA is enough.
