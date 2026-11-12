# Guide 4 — Test Checklist

Work through this list yourself — every row tells you exactly what to do and what you should see. All tests use **demo mode** (no Firebase needed). Sections A–G are the Phase 1 foundation (about 30 minutes); **sections H–M are the Phase 2 tests: crew, vessels, trips, assignments, clocking and user management** (about 40 minutes).

Legend: ✅ = the test passes when you see the expected result.

## A. Starting the app

| # | Do this | You should see |
|---|---|---|
| A1 | Double-click `start-windows.bat` | A black window appears; the browser opens at http://localhost:8080 |
| A2 | Watch the first load | The navy splash with the anchor logo, then the sign-in screen |
| A3 | Look at the sign-in screen | An orange **Demo mode** banner and a list of 7 demo accounts with one-click fill buttons |

## B. Roles and sign-in

| # | Do this | You should see |
|---|---|---|
| B1 | Click the "System Administrator" demo button, then **Sign in** | The management dashboard: stat cards, Getting Started, System status, Recent activity |
| B2 | Look at the sidebar | Groups: Overview, Operations, Payroll, System — future modules show phase chips (P2, P4, P5, P6) |
| B3 | Click **Crew** in the sidebar | An information screen: "Crew — Phase 2", what it will include. (Information screens, never dead buttons) |
| B4 | Open **Users & Roles** | A table with 7 demo users and a permission matrix (ticks per role) |
| B5 | Sign out (top-right icon), sign in as **Crew Member (Frans)** | The simple crew screen: name, vessel, clock placeholder, profile — NO admin menus anywhere |
| B6 | In the crew screen, try to reach an admin page: type `#/admin/dashboard` after the address (…8080/#/admin/dashboard) and press Enter | You are bounced back to the crew screen — the router blocks staff pages for crew |
| B7 | Sign in as **Read-only Auditor** | Dashboard works; System group shows Audit and Statutory Rules, but Settings and Devices are hidden |

## C. Data that survives closing (offline-first core)

| # | Do this | You should see |
|---|---|---|
| C1 | As admin: **Settings → Company profile**, change the name to "Test Company Ltd", **Save** | Green confirmation toast |
| C2 | Close the browser tab completely, re-open http://localhost:8080 | You are STILL signed in (no login screen), and the company name is still "Test Company Ltd" |
| C3 | **Settings → Data tools → Export this device's data (JSON)** | A `.json` file downloads. Open it: data is there, and every `password` field says `[removed]` |
| C4 | **Audit Log** | Your actions listed: `settings_changed`, `session_restored`, `login_success`… with times in Namibian time |

## D. Offline (the important one)

| # | Do this | You should see |
|---|---|---|
| D1 | While the app is open, press F12 → **Network** tab → find the dropdown that says "No throttling"/"Online" → choose **Offline** | The sync chip in the header turns red: "Offline — saved on this device" |
| D2 | Reload the page (F5) while still offline | **The app loads completely** — no browser error page. (First load had to be online; from now on it works offline) |
| D3 | Change the company name again while offline, save, reload again while offline | Still signed in, change still there — everything is saved on the device |
| D4 | Set the network dropdown back to **Online** | The chip returns to normal within seconds |

> On a phone: install the app (Add to Home screen), open it once with internet, then turn on airplane mode and open it again. Same result.

## E. Security behaviours

| # | Do this | You should see |
|---|---|---|
| E1 | Sign out. Type a wrong password for admin@shipcrew.demo | Clear error: "Incorrect password" |
| E2 | Fail 5 times in a row | "Too many failed attempts. Please wait …" — a cooldown blocks further tries |
| E3 | Sign in as crew, then leave the app idle for 15+ minutes (default) | The app locks itself; unlocking needs the password (this protects shared devices) |
| E4 | **Devices** screen (as admin) | This device listed with name, type, status; you can rename it |

## F. Statutory rules (the legal promise)

| # | Do this | You should see |
|---|---|---|
| F1 | Open **Statutory Rules** | Every rule (minimum wage, overtime, PAYE, SSC…) shows **"Awaiting verification (Phase 5)"** with its legal source — and NO rates anywhere. This is deliberate: the system refuses to guess legal values. |

## G. Acceptance-test progress (from the project brief)

| Brief test # | Status |
|---|---|
| 5 — crew sees only their own info | ✅ Testable now (B5, B6) |
| 6 — crew cannot access another crew member's info | ✅ Testable in demo (sign in as Frans, then as Selma — each sees only their own profile). Server-enforced in live mode. |
| 9 — records remain after closing/reopening | ✅ C2, D3 |
| 10 — records synchronise after reconnection | ✅ Foundation built (sync queue runs; visible in demo as "waiting to sync"). Full cloud sync activates with Firebase (docs/01). |
| 17 — audit logs capture sensitive changes | ✅ C4, E1–E2, O1–O6 |
| 18 — existing SitePro Clock In unaffected | ✅ This is a completely separate project, folder and Firebase project. |
| 1 — crew register | ✅ Phase 2: sections H1–H4 |
| 2 — vessel register | ✅ Phase 2: sections I1–I3 |
| 3 — trip register & 8 statuses | ✅ Phase 2: sections J1–J4 |
| 4 — assignments with preserved history | ✅ Phase 2: sections K1–K3 |
| 7 — crew clock themselves in/out | ✅ Phase 2: sections L1–L4 |
| 8 — clocking rules (duplicates, wrong trips) | ✅ Phase 2: sections L3, L5, J4 |
| 11–16 | Phase 3–6 (offline sync, hours, catch, payroll, payslips) |

---

# Phase 2 tests — Crew & Operations (H–M)

> Tip: the fastest way through H–M is to stay signed in as **System Administrator** (Anna) on your computer, and open a **second browser window** for the crew tests in section L (sign in as Frans or Selma there). Demo data lives per device — the demo fleet (2 vessels, 3 trips) is created automatically.

## H. Crew register

| # | Do this | You should see |
|---|---|---|
| H1 | As admin: sidebar → **Crew** | The register lists Frans Nangolo (NAF-0027) and Selma Uugwanga (NAF-0031) with position, vessel, status — and NO banking details anywhere in the list |
| H2 | **Add crew member** → employee number `NAF-0055`, name, position, a bank + account number → **Create crew member** | Green toast, and the new person appears in the list |
| H3 | Try again with the SAME employee number `NAF-0055` | Blocked with: "Employee number NAF-0055 is already used by another crew member" |
| H4 | **Edit** NAF-0055 → scroll to Banking | The bank details you saved are loaded back (they live in the separate restricted `crew_banking` record) |
| H5 | Sign in as **Payroll Administrator** → Crew | The Add/Edit buttons appear (payroll may manage crew). Sign in as **Read-only Auditor** → Crew | No Add/Edit buttons at all — read-only |

## I. Vessels

| # | Do this | You should see |
|---|---|---|
| I1 | Sidebar → **Vessels** | Cards for MFV Etosha Bay (LWB-200-E) and MFV Kunene Runner, with type, capacity, home port, manager |
| I2 | On MFV Etosha Bay | Current crew (Frans · TRP-2026-014) and trip history (TRP-2026-013, TRP-2026-014) |
| I3 | **Add vessel** → name `MFV Orange Dawn`, registration `LWB-301-O` → **Create vessel** | Green toast; the vessel card appears with 0 trips |

## J. Trips (the 8-status flow)

| # | Do this | You should see |
|---|---|---|
| J1 | Sidebar → **Trips** | TRP-2026-013 (Closed), TRP-2026-014 (At Sea), TRP-2026-015 (Planned) with coloured status badges |
| J2 | **Plan a trip** → choose MFV Kunene Runner → **Create trip** | A new trip TRP-2026-016 is created as **Planned** with a pipeline showing all 8 statuses |
| J3 | Open TRP-2026-016 → **Open for crewing →** then **Depart — At Sea →** | Status moves one step at a time; each change is added to "Status history (permanent record)" with who and when |
| J4 | Open TRP-2026-014 (At Sea) and try its next step, then close the modal and re-open | You never skip steps; the badge shows "Clocking open" for Open/At-Sea trips only |

## K. Assignments (history preserved)

| # | Do this | You should see |
|---|---|---|
| K1 | In TRP-2026-016: choose Selma Uugwanga → **Assign to this trip** | She appears with badge "Onboard", with who assigned her and when |
| K2 | Try to assign Selma again | She is no longer offered in the dropdown — one live assignment per crew member |
| K3 | **Remove** Selma → look at the assignments table | She is NOT deleted: her row remains with "Ended", the end time and reason — history preserved |

## L. Clocking (crew phone view)

| # | Do this | You should see |
|---|---|---|
| L1 | As **Frans** (phone-size window): crew screen | Trip TRP-2026-014 (At Sea) shown, big green CLOCK IN button |
| L2 | Press **CLOCK IN** | Badge changes to "Clocked in — TRP-2026-014", button becomes red CLOCK OUT, "Today's hours" starts counting |
| L3 | While clocked in, try to clock in again (reload, look at the screen) | No CLOCK IN button exists while an event is open — duplicates are structurally impossible; the blocked attempt is written to the audit trail |
| L4 | Press **CLOCK OUT** | Duration recorded (e.g. "0h 03m"), event appears under "My recent clockings" with trip and vessel |
| L5 | Sign in as **Selma** (she is NOT assigned to the at-sea trip) and press CLOCK IN | Blocked with a friendly explanation: "You are not assigned to a trip that is open for clocking (Open or At Sea)" |
| L6 | Turn the internet off (F12 → Network → Offline) and clock in as Frans | It still works — "saved locally" badge; it uploads when back online (full offline sync engine arrives in Phase 3) |

## M. In-app user management

| # | Do this | You should see |
|---|---|---|
| M1 | As admin: **Users & Roles → Add user** → name, email `talia@shipcrew.demo`, role Supervisor, password 8+ characters | Green toast; Talia appears in the table with her role badge |
| M2 | Sign out, sign in as Talia | She gets the Supervisor view: Trips visible but NO "Plan a trip" button, no Settings menu |
| M3 | As admin: **Disable** Talia's account, then try to sign in as her | "This account has been disabled. Contact your system administrator." |
| M4 | **Enable** her again and sign in as her | She is back in |
| M5 | As admin: **Role** → change Talia to Payroll Administrator; **Password** → set a new one (demo mode) | Both work with green toasts; every change lands in the Audit Log |

## N. Attendance

| # | Do this | You should see |
|---|---|---|
| N1 | Sidebar → **Attendance & Hours** | Every clock event with trip, vessel, clock-in/out, duration, device and sync badge — plus "Totals by crew member" |
| N2 | Filter by trip TRP-2026-014 | Only that trip's clockings |

## O. Audit trail (Phase 2 actions)

| # | Do this | You should see |
|---|---|---|
| O1 | **Audit Log** after doing H–M | Entries: `crew_created`, `vessel_created`, `trip_created`, `trip_status_changed`, `assignment_added`, `assignment_ended`, `user_created`, `user_disabled`… — plus (on the crew member's device) `clock_in` and `clock_out` |

## When every box ticks

Congratulations — Phases 1 and 2 are verified. Tell your developer "Phase 2 approved" and Phase 3 (Offline & Synchronisation: device-bound offline sign-in with quick PIN, full device registry, duplicate-proof automatic sync with per-record status) begins.
