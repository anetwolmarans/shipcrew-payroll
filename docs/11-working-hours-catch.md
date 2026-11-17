# Guide 11 — Working Hours & Catch (Phase 4)

This guide explains, in plain English, what Phase 4 added: **automatic hour
categories, breaks & rest, supervisor corrections, the catch register and the
six quota-allocation methods**. Test checklist: `docs/04-testing-guide.md`,
sections **S–U**.

---

## 1. Hour categories — calculated, never typed

When a crew member clocks out, the system splits their shift **automatically**
into five categories. Nobody chooses the category by hand — that is exactly
where paper timesheets go wrong.

| Category | Meaning | How the system decides |
|---|---|---|
| **Ordinary** | Normal paid time | The first 9 hours of a local day (company setting) |
| **Overtime** | Time beyond the ordinary allowance | Everything past the day's remaining allowance |
| **Night work** | The night window | Minutes between **22:00 and 05:00** Namibian time (adjustable) |
| **Sunday work** | Work on a Sunday | Minutes on a Sunday, up to the day's allowance |
| **Public holiday** | Work on an official holiday | Minutes on a Namibian public holiday, up to the day's allowance |

The exact rules:

- **Every minute lands in exactly ONE category.** Priority when several
  windows overlap: **public holiday > Sunday > night > overtime > ordinary**.
  (If Christmas Day falls at 23:00, those minutes are *public-holiday*
  minutes, not night minutes.)
- **The ordinary allowance is per local day** (default 9 h). A second shift
  on the same day — including the morning tail of a shift that crossed
  midnight — only counts as ordinary while the day still has allowance left;
  then it becomes overtime.
- **A shift belongs to the day it started on**, but its minutes after
  midnight are counted on the new day (with that day's fresh allowance).

### Shifts that cross midnight

A 20:15 → 04:40 shift with a 30-minute break becomes:

- 20:15–22:00 → **ordinary** (1 h 45 m — part of Wednesday's allowance)
- 22:00–04:40 → **night** (6 h 10 m, minus the break: break time is never
  worked time)
- The gap to the next shift is checked for **rest** (see below).

You can see this exact example in the demo data: sign in as the supervisor,
open **Attendance & Hours**, choose trip TRP-2026-014 and press
**Recalculate categories**.

### Breaks

While clocked in, the crew member sees a **Start break** button. Breaks:

- are started and ended by the crew member themselves (same rule as
  clocking: nobody does it for you);
- **do not count as worked time** — the hour categories are calculated on
  net time;
- are recorded as their own history (break_records), audited and synced like
  everything else.

The break *rules* are a company choice in **Settings → Working hours**:
manual (crew press the button — the default) or automatic (after 6 hours the
system deducts a 30-minute break automatically).

### Rest warnings

If two shifts of the same person are less than **11 hours** apart
(adjustable), the Attendance screen shows a yellow **rest-period warning**
with the names and times. Warnings are recorded for review — they never
block clocking, because at sea reality wins; but they are visible to the
supervisor and to payroll, so nobody can pretend the rest happened.

### Public holidays — from the Act, not from a list

The holiday calendar is computed from the **Public Holidays Act, 1990 (Act
26 of 1990)** rules: the fixed dates (New Year, Independence Day, Cassinga
Day, Africa Day, Genocide Remembrance Day, Heroes' Day, Human Rights Day,
Christmas, Day of Goodwill), the Easter-based days (Good Friday, Easter
Monday, Ascension Day — computed for any year), and the
Monday-after-Sunday rule. The 2026 calendar was verified against the
Ministry of ICT's published list. If Parliament ever changes the Act, the
list in `js/config.js` is the single place to update.

### Supervisor corrections — visible, never silent

People clock in on the wrong phone, forget to clock out, or the device was
flat. A **supervisor (or admin)** can correct a *completed* clock event:

1. Attendance & Hours → find the event → **Correct**.
2. Enter the corrected clock-in/out and a **reason (required)**.
3. Save. The system recalculates the categories from the corrected times.

What the record keeps forever: the **original times**
(`originalClockInAt` / `originalClockOutAt`), the full **correction
history** (who, when, why, what changed), and an **audit-log entry**
(`attendance_corrected`). The crew member's raw clock press is never
erased — a corrected event is visibly marked "corrected".

Nobody can correct an *open* (still running) clock event, and nobody below
supervisor can correct anything (enforced again in the server rules).

---

## 2. The catch register

**Catch & Quota** (sidebar) records what each trip landed:

- species (the common Namibian species are in the dropdown),
- category (whole round, gutted, headed and gutted, filleted…),
- weight in kilograms,
- landing site and date,
- the paperwork references (landing note, monitoring ref) that follow catch
  in Namibia.

Records are **history**: if a weight was captured wrong, you **Amend** it
with a reason, and the amendment list shows every change (who, when, from
which value to which value, why). The original value is never overwritten.
Deleting a catch record is impossible — on the device and on the server.

Totals per trip (tonnage, per-species breakdown) are shown automatically and
feed the quota allocations.

## 3. Quota allocations — the six methods

For any trip, the vessel manager (or system administrator) can create an
allocation that splits the catch among the crew. Pick a method, see a live
preview, save:

| Method | How it splits | Example |
|---|---|---|
| **Equal split** | Everyone gets the same share | 96.95 t ÷ 2 crew = 48.475 t each |
| **Percentage shares** | Fixed % per person per contract; must total 100% | Skipper 50%, mate 30%, cook 20% |
| **Fixed weight per role** | A fixed kg amount per position | Every deckhand 2,000 kg |
| **Rank-based points** | Points per rank; share = your points ÷ total points | Skipper 5, deckhand 2 → 5/7 and 2/7 |
| **Contractual formula** | A written formula is recorded as a note; settled in payroll | "30% of net proceeds after costs, per clause 4.2" |
| **Custom per member** | Manual kg amounts, **reason required** | One-off arrangements |

Facts that keep it honest:

- A **live preview** shows every member's share before you save; warnings
  appear if percentages do not total 100% or fixed weights exceed the catch.
- Re-running the **same method** on the same trip supersedes the old
  allocation — the old one stays visible as *superseded*, never deleted.
- Different methods can coexist on one trip (different crew members can sit
  under different arrangements — the project brief requires this).
- **Money is not calculated here.** Phase 4 records tonnes and shares;
  pricing them (commissions, N$ values) is Phase 5 payroll, from verified
  contracts and statutory rules only.

## 4. What this means for payroll (Phase 5, next)

Phase 5 will price these categories: ordinary hours at the contract rate,
overtime/night/Sunday/public-holiday at the statutory rates (only from the
verified rules in the Statutory Rules screen), plus commissions from the
quota allocations. Because the categories are already calculated per event
per day, payroll becomes pure multiplication — no re-interpretation of
timesheets.

## 5. Roles in Phase 4

| Role | Phase 4 abilities |
|---|---|
| Crew member | Clock in/out, start/end own breaks, see own hours in categories |
| Supervisor | Everything above for review + **correct** completed clock events (reason required) |
| Vessel manager | Catch register + quota allocations + everything viewable |
| Payroll administrator | Views categories and catch (pricing arrives in Phase 5) |
| Auditor | Read-only view of everything, including corrections and amendments |
| System administrator | All of the above |

Server-side rules (rules/firestore.rules) enforce the same boundaries: crew
write only their own clock events and breaks; only supervisors correct
closed events; only vessel managers/system administrators write catch and
quota; nobody deletes history.

## 6. Files that changed

| File | What |
|---|---|
| `js/core/hours.service.js` | **New** — the classification engine, holiday calendar, breaks, corrections, rest audit |
| `js/core/catch.service.js` | **New** — catch register + the six allocation methods |
| `js/screens/admin/attendance.screen.js` | Categories, corrections, rest warnings, per-day breakdown |
| `js/screens/admin/catch.screen.js` | **New** — Catch & Quota screen |
| `js/screens/crew/home.screen.js` | Break buttons + today's category chips |
| `js/screens/admin/settings.screen.js` | Working-hours rules card |
| `js/config.js` | Hour-category constants, holiday rules, quota methods, v2.2.0 |
| `js/core/store.js` | Phase 4 demo data (seed v4) |
| `rules/firestore.rules` | Phase 4 write access (breaks, corrections, catch, quota) |
| `service-worker.js` | Cache bump v2.2.0-phase4 |
