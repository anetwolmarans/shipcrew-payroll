# Guide 4 — Test Checklist

Work through this list yourself — every row tells you exactly what to do and what you should see. All tests use **demo mode** (no Firebase needed). Sections A–G are the Phase 1 foundation (about 30 minutes); **sections H–M are the Phase 2 tests: crew, vessels, trips, assignments, clocking and user management** (about 40 minutes); **sections P–R are the Phase 3 tests: device PIN, registry & revocation, sync engine**; **sections S–U are the Phase 4 tests: hour categories, breaks & corrections, catch & quota** (about 30 minutes).

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

# Phase 3 tests — Offline & Synchronisation (P–R)

## P. Device PIN (offline activation)

| # | Do this | You should see |
|---|---|---|
| P1 | Sign in as admin → **Devices** | "This device" card with an **Offline device PIN** section showing "Not set" |
| P2 | **Set up PIN** → enter `2468`, repeat it, Save | Green toast "Device PIN set — this device can now be unlocked offline."; badge shows "Enabled — offline unlock active"; Audit Log records `device_pin_set` |
| P3 | **Change PIN** → wrong current PIN (`0000`), new `1357` | Red toast "The current PIN is not correct." — nothing changes |
| P4 | **Change PIN** → correct current PIN `2468`, new `1357`, repeat | Green toast; "Last changed" updates; Audit Log records `device_pin_changed` |
| P5 | Top bar → **padlock (Lock now)** | Lock screen appears at once: password box **and** a "Device PIN" box |
| P6 | Lock screen: wrong PIN `9999` | Red error "Incorrect PIN. 4 attempts left…" (each wrong try counts down) |
| P7 | Lock screen: five wrong PINs in a row | "Too many incorrect PIN attempts. The PIN is locked for 60 seconds — unlock with your password instead." (`pin_lockout` in the Audit Log) |
| P8 | Lock screen: unlock with the **password** | Works immediately — the PIN lockout never blocks the password |
| P9 | Lock now again → correct PIN `1357` | Green toast "Unlocked with the device PIN."; Audit Log records `pin_unlock_success` |
| P10 | Devices → **Remove PIN** → wrong current PIN | Red toast, PIN stays enabled |
| P11 | Devices → **Remove PIN** → correct PIN `1357` | Badge back to "Not set"; Audit Log records `device_pin_removed` |

## Q. Device registry & revocation

| # | Do this | You should see |
|---|---|---|
| Q1 | **Devices** → Registered devices table | Device name, type, owner, last seen, PIN On/Off, status badge ("this device" chip on your own row) |
| Q2 | As a supervisor (has the Devices menu): **Revoke this device** → confirm | Signed out immediately; the sign-in screen shows a red **"This device has been revoked"** banner |
| Q3 | Try signing in as a crew member on the revoked device | Blocked: "This device has been revoked by your administrator, so sign-in is blocked…" |
| Q4 | Sign in as **System Administrator** on the revoked device | Works (administrators may sign in to fix it); Devices screen shows the revoked banner + **Reinstate this device** button |
| Q5 | **Reinstate this device** → confirm | Status badge returns to Active; Audit Log records `device_revoked` and `device_reinstated` |
| Q6 | Sign in as the crew member again | Works normally |
| Q7 | (Live mode only) Admin on device A revokes device B from the registry | Device B signs itself out at its next sync check and can no longer sign in — records on it stay safe |

## R. Sync engine (automatic, duplicate-proof, per-record states)

| # | Do this | You should see |
|---|---|---|
| R1 | Dashboard → **Offline & synchronisation** card | This device (name + Active badge), PIN state, connection, "Waiting to sync", "Sync failed — kept: 0", "Synchronised so far", last sync time |
| R2 | Clock in as a crew member (demo mode) | The new clock event's sync badge reads **"saved locally"** (demo mode keeps data on the device; in live mode it moves to "waiting to sync" and then "synchronised" by itself) |
| R3 | (Live mode) Create a record while **offline** | Badge "saved locally"; when internet returns it flips to "waiting to sync" → "synchronised" **without any button press** |
| R4 | (Live mode) Turn the internet off and on, reopen the app | Uploads resume automatically; the header chip shows "Synchronised" when the queue empties |
| R5 | (Live mode) **Sync now** button on the dashboard | Green toast with the number of records uploaded; the same upload never creates duplicates (every record has one permanent ID) |
| R6 | (Live mode) Edit the same record on two devices | The cloud's newest version wins; the other device adopts it and the Audit Log records `sync_conflict` — nothing is lost or silently overwritten |
| R7 | (Live mode) Pull the network cable mid-sync | Failed attempts are retried; after 5 tries the record shows **"sync failed — kept"** and stays safe; a successful later retry clears the flag |

## S. Hour categories (Phase 4 — automatic calculation)

| # | Do this | You should see |
|---|---|---|
| S1 | Admin → **Attendance & Hours** | A Phase 4 banner: "hours are now categorised automatically". Stat cards show **Net worked time** (breaks excluded) and **Night / Sunday / Holiday** |
| S2 | Filter to trip **TRP-2026-014**, press **Recalculate categories** | Each completed event shows category chips. The midnight shift (20:15 → 04:40, 30-min break) shows **Ordinary 1h 45m + Night work 6h 10m**, net 7h 55m |
| S3 | Check the yellow **rest-period warning** | "Frans Nangolo rested only 4h 20m between shifts (04:40 → 09:00)" — the gap between the two demo shifts is below 11 h |
| S4 | Scroll to **One day, in categories** | Pick a crew member + date: per-event categories and the day total, with breaks shown separately |
| S5 | **Settings → Working hours** | Ordinary hours 9, night 22:00–05:00, rest warning 11 h, break rules (manual default). Change the night start to 20:00 and save |
| S6 | Back on Attendance, Recalculate again | The midnight shift now shows MORE night minutes (night starts 2 h earlier) — categories follow the settings, deterministically |
| S7 | **Statutory Rules** screen | The public-holiday calendar comes from the Public Holidays Act rules (fixed dates + Easter + Monday rule) — no rates, no guessing. 2026 dates verified against the Ministry's list |

## T. Breaks & supervisor corrections (Phase 4)

| # | Do this | You should see |
|---|---|---|
| T1 | Sign in as **Crew Member (Frans)** → CLOCK IN | Under CLOCK OUT a **Start break** button appears |
| T2 | Press **Start break** | The big button becomes **END BREAK** with "On break since … Namibian time — break time does not count as worked time" |
| T3 | Press **END BREAK**, then clock out | The event's break minutes appear on the Attendance screen in the **Break** column and are excluded from net time |
| T4 | Sign in as **Supervisor** (or admin) → Attendance → **Correct** on a completed event | A dialog with the current times, a REQUIRED reason box, and any previous corrections listed |
| T5 | Change the clock-out, enter a reason, save | The event shows a yellow **corrected** badge; the new duration and categories apply; the reason and the ORIGINAL times are kept in the record |
| T6 | Open the same event's correction again | The earlier correction is listed (who, when, why) — history is never overwritten |
| T7 | Try to save a correction WITHOUT a reason | Blocked: "A reason is required — corrections are never anonymous." |
| T8 | Audit Log | New actions: `attendance_corrected`, `hours_reclassified`, `break_started`, `break_ended` — each with who, when, what |

## U. Catch register & quota allocations (Phase 4)

| # | Do this | You should see |
|---|---|---|
| U1 | Admin → **Catch & Quota** → trip **TRP-2026-013** | Total catch **96.950 t**, 2 species (Hake, Horse mackerel), both catch records with paperwork refs (LN-2026-0341/2, MFA-8817/8) |
| U2 | The seeded **Equal split** allocation | Frans and Selma each **50.00% / 48,475 kg** — "Equal share: 1 of 2" |
| U3 | **New allocation** → Rank-based points | A per-member points table with the live preview; enter points and watch each share update |
| U4 | Save the rank-based allocation | It appears as a second ACTIVE allocation (different methods can coexist); re-running the SAME method supersedes the old one, which stays as *superseded* |
| U5 | **Record catch** on an at-sea trip (e.g. TRP-2026-014) | Species dropdown (Hake, Horse mackerel, Monkfish…), category, kg weight, landing site, refs — saved with an audit entry `catch_recorded` |
| U6 | **Amend** that catch record with a new weight + reason | An "amended ×1" badge; the original value and the reason are preserved in the amendments list |
| U7 | Try percentages that do not total 100% | A warning "Percentages total 95% — they should total 100%" and saving is blocked |
| U8 | Sign in as **Crew Member (Frans)** | No Catch & Quota in the menu — crew see only their own screen (the server rules block them too) |

## When every box ticks

Congratulations — Phases 1, 2, 3 and 4 are verified. Tell your developer "Phase 4 approved" and Phase 5 (Payroll: contracts, commissions, allowances, PAYE + SSC from verified statutory rules, per-trip payroll, approval & locking, PDF payslips) begins.
