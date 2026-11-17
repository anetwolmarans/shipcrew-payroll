# Guide 12 — Payroll (Phase 5): contracts, PAYE, SSC and payslips

**Time to read: about 20 minutes. This is the phase where hours become money.**

PLAIN ENGLISH — Phase 5 turns the Phase 4 hour categories into pay:

```
classified hours  ×  contract rates         → ordinary, overtime, night,
                                                Sunday, public-holiday pay
+ allowances (transport, sea duty, …)       → extra agreed payments
+ catch commission (quota share × price)    → the crew's share of the catch
− PAYE (income tax, verified 2026/27 table) → statutory deduction
− SSC (0.9% employee share)                 → statutory deduction
= NET PAY  → payslip per crew member → approve → locked forever
```

Every number comes from a **verified statutory rule** or a **contract the
company entered**. Nothing is guessed, and nothing can be quietly changed
after approval.

---

## 1. The statutory rules (all verified against official sources)

Each rule below was researched and verified before a single line of
calculation code was written. The verification trail lives in the app
(Statutory Rules screen) and in `js/core/payroll.service.js`.

| Rule | Value | Source (verified) |
|---|---|---|
| **PAYE** — income tax | 0% on the first N$100,000/year; 18% to 150k; 25% to 350k; 28% to 550k; 30% to 850k; 32% to 1.55M; 37% above | Income Tax Act, 1981 as amended — 2026/27 tables (NamRA; PwC Namibia Tax Reference and Rate Card 2026) |
| PAYE method | Monthly deduction = annual tax on (12 × the month's taxable pay) ÷ 12 | NamRA employer method — seasonal months even out over the year |
| **SSC** (Maternity, Sick & Death fund) | 0.9% employee + 0.9% employer on monthly basic earnings of N$500–N$12,500 (max N$112.50 each side) | Social Security Act, 1994; SSC ceiling increase effective 1 Sep 2026 (was N$11,000 / max N$99.00) |
| **Overtime** | ×1.5 the hourly basic wage | Labour Act, 2007, s17(2) |
| **Sunday work** | ×2 the hourly basic wage | Labour Act, 2007, s21(5) |
| **Public-holiday work** | ×2 the hourly basic wage | Labour Act, 2007, s22(7) |
| **Night work** | +6% of the hourly basic wage for each hour between 20:00 and 07:00 | Labour Act, 2007, s19(1) |
| **Minimum wage** | N$18.00 per hour (since 1 Jan 2025) | National Minimum Wage Order under the Labour Act (Government Gazette; Wages Commission; ILO) |
| **Fishers' conditions** | Shifts ≤ 8 h; overtime ≤ 35 h/week and ≤ 5 h/day; rest 10 h per 24 h (6 h uninterrupted sleep) and 77 h/week; pay per day at sea on agreed dates | Regulations Relating to Fishers, 2025 (GN 308 of 2025), regs 4, 9–11. Where the regulations state no rate (reg 21), the Labour Act applies |

Two important notes:

- **Night work has two parts.** The Phase 4 *classification window*
  (default 22:00–05:00, a company setting) sorts minutes into the "night"
  category for the *hours* line. The *6% allowance* is paid on the
  statutory 20:00–07:00 minutes of each shift (computed per shift,
  net of breaks) — that is the letter of s19(1).
- **Rules never change silently.** They are versioned and effective-dated in
  the code, shown read-only in the app, and locked in the database security
  rules. A new tax year arrives as a controlled app release, never as an
  editable setting.

## 2. Contracts (the "Contracts" screen)

**Is this the physical contract the crew member signs?** No — and that is
deliberate. The signed **paper contract stays in your HR file** (or your
cloud drive). What the app records is the contract's **pay terms** — type,
rate, effective dates: exactly what payroll needs to calculate with, and
exactly what an auditor wants to see versioned. So the workflow is:

1. The crew member signs the paper contract; you file it and give it a
   reference (e.g. `HR/CONTRACTS/2026/041`).
2. You enter its pay terms here, including the **signed-on date** and the
   **signed-contract reference** fields.
3. Every payslip then shows that reference — any payslip can be traced back
   to the signed original in seconds.

Why not upload the signed PDF into the app? The app is offline-first: every
document would have to be copied to every device's local database (bloating
phones at sea), and employment contracts are the most sensitive paper a
company holds — best kept where you already control access. If you later
want in-app storage of signed documents, that is a Phase 6+ feature to
discuss (Firebase has a file-storage service with proper access rules).

Three types, each effective-dated with full history:

| Type | What it means | How the hourly rate is derived |
|---|---|---|
| **Hourly rate** | Paid per worked hour | The contract rate itself |
| **Daily rate (per day at sea)** | A fixed amount per day at sea (fishers' regs, reg 4(a)); the day's shift hours also price at the implied rate | Daily rate ÷ 8 (the 8-h shift structure, reg 9) |
| **Fixed monthly salary** | A fixed monthly amount; premiums (overtime etc.) on top | Salary ÷ (45-hour week × 4.333 weeks) |

- The contract in force **on a shift's clock-in date** prices that shift —
  mid-trip raises are handled correctly.
- New versions **supersede** the old one; every version stays readable
  forever with who set it, when, and why.
- An hourly rate below the **N$18.00 minimum wage is refused** on entry.

## 3. Running payroll (the "Payroll Processing" screen)

1. A trip reaches status **Payroll Pending** (or later) on the Trips screen.
2. Press **Build payroll** — optionally entering a **catch commission price
   (N$/kg)**. The engine then:
   - reclassifies the trip's hours (fresh Phase 4 categories),
   - prices each crew member's hours with their contract,
   - adds allowances recorded for the trip,
   - pays each person's **quota share × price** as commission,
   - deducts SSC (0.9%, capped) and PAYE (annualise method),
   - produces a **draft** run with a full line-by-line breakdown.
3. **Review**: open any payslip — every earning and deduction is a separate
   line with its calculation shown (e.g. "0h13 × N$28.50/h × 1.5").
4. **Approve & lock** (a note is required). This:
   - issues one **payslip per crew member** (visible on their phone),
   - locks the run **forever** — no recalculation, no edits.
5. **Corrections** after locking never rewrite history: record an
   **Adjustment entry** (earning or deduction, with a mandatory reason);
   it settles on the next run. Adjustments are listed on the review screen.

**Duplicate prevention:** one payslip per crew member per trip, ever. A
locked trip refuses a second run with a clear message. The same protections
run again in the Firestore security rules (Phase 5 rules deployed with this
version — see `rules/firestore.rules`).

## 4. Payslips (PDF, offline)

- Admins see the fleet's payslips (**Payslips** screen); each crew member
  sees **only their own** on their crew home screen ("My payslips") —
  enforced in the app AND in the server rules.
- Every payslip PDF is print-ready and auditable at a glance: navy company
  header, **EMPLOYEE** and **PAY PERIOD** cards (the employee card shows the
  position, employee number, contract type **and the signed-contract
  reference**), a worked-time strip (the five categories in boxes), then
  the **EARNINGS** and **DEDUCTIONS** tables — every line on its own row
  with its calculation in the DETAIL column and the amount right-aligned —
  a highlighted **NET PAY** band, and an **EMPLOYER CONTRIBUTIONS** box
  (the employer SSC, shown separately because it is NOT deducted from pay —
  a legal payslip requirement). The footer records which app version
  generated it and the payslip ID.
- The PDF is generated **on the device** by the app itself
  (`js/core/payslip-pdf.js` — no internet, no external library). It prints
  on A4 and can be shared from the phone.

## 5. What the demo data contains (try it immediately)

- **Frans Nangolo** — hourly contract at **N$28.50/h** since 1 Jan 2026,
  signed 18 Dec 2025, reference `HR/CONTRACTS/2026/027`.
- **Selma Uugwanga** — daily-at-sea contract at **N$245.00/day**, signed
  19 Dec 2025, reference `HR/CONTRACTS/2026/031`.
- Trip **TRP-2026-013** is closed and payroll-ready, with an equal-split
  quota allocation (48,475 kg each) and classified hours.
- Build it with a commission price of, say, **N$9.00/kg** and check Frans's
  payslip: commission ≈ N$436,275.00, PAYE ≈ N$149,481.18 (the top-band
  rate applies at that income), SSC N$4.50 (floored) — the numbers in this
  guide are the ones the engine produces.

## 6. Where the money records live

| Store / collection | What it holds |
|---|---|
| `contracts` | Effective-dated contract versions with signed-on date + signed-contract reference (never deleted) |
| `allowances` | Allowance entries per crew + trip |
| `deductions` | Adjustment entries (with reasons) — pending settlement |
| `payroll_calculations` | The runs: draft → locked, with every payslip line |
| `payslips` | Issued payslips (immutable; crew read their own) |
| `payslip_queries` | Crew questions/disputes about payslips + the answers (never deleted) |

All amounts are stored in **integer cents** (N$ amounts × 100) so rounding
can never drift a cent between screens, totals and the PDF.

## 7. Payslip history on the crew's phone (v2.4.0)

Payslips **stay on the crew member's phone forever** — they are records,
not messages. Two things make this true in the live environment:

- **Pull sync.** A payslip is approved on the payroll admin's device; until
  v2.4.0 the sync engine only UPLOADED records, so the crew member's phone
  never received it. The engine now also DOWNLOADS the collections that
  are born on other devices (`payslips`, `payslip_queries`) — after every
  upload cycle and every 2 minutes while online. Firestore security rules
  decide what each device may read: a crew member can only ever be sent
  their own payslips and their own queries.
- **Duplicate-proof by design.** Every record's ID becomes the Firestore
  document ID, so re-downloading can never create a duplicate; the screen
  repaints the moment new records arrive (`sync:pulled` event).

## 7b. Payslip queries — disputing an error (v2.4.0)

If a crew member thinks a payslip is wrong, they open it on their phone
(**My payslips → View → Query this payslip**) and send a question, dispute
or missing-pay report. The payroll team answers from the **Payslip
Queries** screen; the answer appears on the crew member's phone under
**My queries**.

The rules that keep this honest:

- **One open query per payslip** — raise, wait for the answer, raise a
  follow-up if needed.
- **Queries are never deleted** and the crew member's message can never be
  edited — not in the app, not in the Firestore rules.
- **An answer is a commitment**: once sent, it is immutable.
- **A locked payslip is never rewritten.** If a query reveals a real
  error, the correction is an **Adjustment entry** on the next payroll run
  (visible, reasoned, auditable) — the original payslip stands as history.
- Every raise, answer and close is written to the **audit log**.

## 8. Acceptance tests

Run the click-by-click checklist in `docs/04-testing-guide.md`, **sections
V–X (Payroll)**. The automated suites cover the arithmetic:
`node scripts/test-payroll-engine.mjs` (47 checks) and
`node scripts/test-hours-engine.mjs` (48 checks) — both must be green.

## 9. Coming in Phase 6

The report library (payroll summaries, cost per vessel/trip, tax and SSC
reports, exports) and production deployment review. Payroll data is already
structured for it: every line item is queryable by crew, trip, vessel,
category and period.
