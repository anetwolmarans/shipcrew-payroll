# Guide 2 — Database Design

This guide explains every collection (think: folder of records) in the system, what each record contains, and how records relate. The same design is used in two places:

- **On each device** — IndexedDB stores (created automatically on first run, names identical to the collections below).
- **In the cloud** — Firestore collections (created as you go live; protected by `rules/firestore.rules`).

## Record conventions (every record, everywhere)

| Field | Meaning |
|---|---|
| `id` | Unique identifier. For user-created events (clock-ins, audit entries, sync items) this is a UUID that doubles as the Firestore document ID — the trick that makes duplicate uploads impossible. |
| `createdAt` / `createdBy` | When the record was created and by whom. |
| `updatedAt` / `updatedBy` | Last change and by whom. |
| `status` | Lifecycle state (e.g. `active`, `pending_sync`, `synchronised`, `approved`, `closed`, `revoked`). |
| Relationship IDs | Fields like `userId`, `employeeId`, `vesselId`, `tripId` connect records to each other. |

All timestamps are stored in **UTC** and displayed in **Namibian time**.

## The collections

### Company & people

| Collection | Holds | Key fields | Notes |
|---|---|---|---|
| `companies` | One profile per company | name, address, phone, email, currency | Shown on payslips/reports. Only system_admin may edit. |
| `users` | One login account per person | email, fullName, **role**, status, employeeId? | The role is read by the security rules on every request — this is where permissions really live. Managed via console in Phase 1, in-app from Phase 2. |
| `roles` | The six role definitions + their capability lists | id, label, description, capabilities | Reference data, read-only. |
| `crew` | Employee records | employeeId, userId, identity/passport, contact, emergencyContact, position, employmentStatus, startDate, vesselId, tripId, remunerationType | Crew can read ONLY their own record. |
| `crew_banking` | Bank account details (separate!) | employeeId, bank, branch, accountNumber | Extra-sensitive: readable only by payroll/system admins and the owner. Separate collection so it can never leak through a broad crew query. |
| `contracts` | Employment contracts & pay arrangements | employeeId, type (hourly/fixed), rate or salary, payPeriod, effectiveFrom, effectiveTo, allowances, commissionRules | Effective-dated: changing a contract never rewrites history. Phase 5. |

### Operations

| Collection | Holds | Key fields |
|---|---|---|
| `vessels` | The fleet | name, registrationNumber, callSign, type, capacity, managerUserId, status |
| `trips` | Fishing trips | reference, vesselId, departAt/returnAt (UTC), ports, **status** (Planned → Open → At Sea → Returned → Under Review → Payroll Pending → Approved → Closed), payrollPeriodId, documents |
| `assignments` | Who is on which vessel/trip and when | crewId, vesselId, tripId, from, to, isPrimary — history preserved, never overwritten |

### Time & attendance

| Collection | Holds | Key fields |
|---|---|---|
| `clock_events` | Raw clock-in/out pairs | userId, employeeId, tripId, vesselId, clockInAt, clockOutAt (UTC), status, deviceId, correctionOf? |
| `work_records` | Calculated hours per day | employeeId, tripId, date, ordinaryHrs, overtimeHrs, nightHrs, sundayHrs, holidayHrs, totalHrs |
| `break_records` / `rest_records` | Breaks and rest periods | employeeId, date, start/end, type |

Corrections are new records pointing at the original (`correctionOf`), with reason, corrector, timestamps and approval — the original is never edited (Phase 4 completes this).

### Catch & quota

| Collection | Holds | Key fields |
|---|---|---|
| `catch_records` | Landings per trip | tripId, vesselId, date, species, weightKg, landingWeightKg, category, responsibleUserId, documents |
| `quota_allocations` | Commission shares | tripId, employeeId, method (equal/percentage/fixedWeight/rank/contractual/custom), value, basisCatchId? |

### Money

| Collection | Holds | Key fields |
|---|---|---|
| `remuneration_rules` | Per-employee pay components | employeeId, component (basic/overtime/night/sunday/holiday/commission/bonus/allowance/advance/deduction), amount or rate, effectiveFrom/To |
| `statutory_rules` | THE locked legal rules | ruleKey, category, source, effectiveFrom/To, version, verifiedBy, verifiedDate, approvedBy, values, verificationStatus |
| `payroll_periods` | Pay periods (statutory, e.g. monthly) | periodStart, periodEnd, status |
| `payroll_calculations` | One per employee per trip/period | tripId, employeeId, all pay lines, gross, PAYE, SSC employee/employer, deductions, net |
| `payroll_approvals` | Who approved what, when | payrollRunId, approvedBy, approvedAt, status |
| `payslips` | Final payslips | payrollRunId, employeeId, userId, lines, amounts, status (`draft`→`approved`→`locked`), pdfRef |
| `deductions` / `allowances` | Itemised extras | employeeId, type, amount, reason, authorisedBy |

### System & integrity

| Collection | Holds | Key fields |
|---|---|---|
| `audit_logs` | Append-only history | at, actorId/Name/Role, action, details, deviceName, syncStatus. Nobody can update or delete. |
| `devices` | Registered devices | id (UUID), deviceName, platform, userId, ownerName, status (`active`/`revoked`), lastSeenAt |
| `sync_transactions` | Idempotency ledger of uploads | id = event id, type, collection, attempts, status |

## Local-only stores (not in Firestore)

| Store | Purpose |
|---|---|
| `meta` | Settings, pointers (e.g. which device record is this one), last-sync time, login guard. |
| `sessions` | The current signed-in session on this device (`id: 'current'`). |
| `sync_queue` | The outbox: records waiting for upload. Each item: id, type, collection, payload, status (`pending`/`synced`/`failed`), attempts. |

## How the pieces connect (example: a clock-in in Phase 2+)

```
crew member (users.id) ──< assignments >── trip ──> vessel
        │                        │
        └──── clock_events ──────┘  (only against an ACTIVE assigned trip)
                 │
                 ▼
          work_records  ──▶ payroll_calculations ──▶ payslips
                 │                  │                      │
                 └── catch_records ─┴─ quota_allocations ──┘
                 │
          audit trail every step; everything offline-first via sync_queue
```

## Integrity rules baked into the design

1. **Idempotency:** event IDs become Firestore document IDs → replayed uploads overwrite the same document, never duplicate.
2. **Append-only history:** audit logs and corrections add records; originals are immutable.
3. **Effective dating:** contracts and statutory rules carry effective dates → approved historical payroll is never silently recalculated.
4. **Separation of secrets:** banking details in their own restricted collection.
5. **Server-side enforcement:** every rule above is mirrored in `rules/firestore.rules`, which runs on Google's servers.
