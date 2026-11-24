# ShipCrew Payroll — Start Here

A payroll management system for a Namibian fishing company: crew records, vessels, trips, clock-in/clock-out, working hours, catch & quota commission, statutory deductions, payslips and reports — built to work **on fishing vessels with no internet**.

**This build is v2.8.0 — all six phases complete (Phase 6: Reporting & Deployment).** On top of the registers, crew clocking, device PINs, the automatic sync engine, automatically categorised hours and the verified payroll engine (PAYE + SSC, locked runs, PDF payslips, the payslip query loop), the report library is live — 11 reports, each exportable as PDF, Excel (.xlsx) and CSV, all generated on the device and fully offline (see docs/06-roadmap.md and docs/13-reports.md). Crew can now be loaded in bulk: Crew → Bulk import takes a pasted or uploaded CSV list, validates every row, shows a preview, then creates each record through the audited register. Since v2.6.1 the import template is available to everyone — the **Import template** button on the Crew screen downloads the CSV layout for any signed-in role, so whoever compiles the list can prepare it even if they cannot run the import. v2.7.0 corrects the SSC engine: contributions are 0.9% each side of the month's **basic salary** (not premiums), the N$500 floor and monthly ceiling are shared across all of a person's runs in the month, fixed-salary crew contribute 0.9% of their monthly rate, and the gazetted ceiling schedule to 2029 is pre-loaded (GN 236 of 2026). v2.8.0 adds **reopen**: an admin can reopen a locked payroll with a recorded reason — issued payslips are revoked (money fields frozen, audit kept), the run returns to draft for rebuild and re-approval. v2.8.1 makes the SSC ceiling visible on payslips: when the month's basic salary exceeds N$12,500 the deduction line states the monthly maximum is charged (0.9% of the ceiling = N$112.50 per side). v2.8.2 publishes the crew-import template publicly: `crew-import-template.csv` sits at the app root and the sign-in screen offers it as a download, so the crew list can be prepared before any account exists. v2.8.3 untangles the environments: the Test sign-in screen offers a one-tap "Use Demo mode" switch, and a failed Test sign-in now explains that the @shipcrew.demo demo accounts live in Demo mode instead of a bare "Incorrect email or password". Before going live with real data, complete the production security review: docs/14-security-review.md.

---

## 1. What is included

| Working today | |
|---|---|
| Sign-in with roles (crew vs 5 staff roles) | **Payroll**: contracts (hourly / daily at sea / fixed), PAYE + SSC from verified rules, per-trip runs, approval & locking, adjustment entries |
| Works offline after first load (PWA) | **Payslips**: one per crew member per trip, PDF generated on the device, crew see only their own |
| **Crew register** with secured banking details | **Payslip queries**: crew raise questions/disputes, admins answer — the full loop |
| **Vessel register** with crew lists & trip history | **Report library**: crew, vessels, trips, attendance & hours, catch, quota allocations, payroll summary, statutory contributions, payslip register, queries, audit trail |
| **Trip register** with the 8-status flow & permanent status history | **Exports**: PDF (print-ready), Excel .xlsx (real workbook), CSV — with filters, works offline, every export audited |
| **Assignments** with preserved history (one live trip per crew member) | **Management dashboard**: live fleet, catch this month, latest payroll, open queries |
| **Crew CLOCK IN / CLOCK OUT** — duplicate-proof, trip-validated, offline | **Automatic hour categories**: ordinary, overtime, night, Sunday, public holiday; breaks; supervisor corrections with full history |
| **In-app user management**: create logins, change roles, reset passwords, disable | **Catch register & six quota-allocation methods** (amend-only history) |
| **Device PIN** (4–8 digits): unlock a locked device offline — at sea | |
| **Device registry** with administrator revoke / reinstate (lost phone protection) | |
| **Automatic duplicate-proof sync** with per-record states (saved / waiting / synced / failed — kept) | |
| **Safe conflict handling**: newest edit wins, older devices adopt it, conflicts audited | |
| Six user roles with a permission matrix | |
| Server-side security rules for Firebase | |
| Audit trail (append-only) + sync ledger | |
| Session auto-lock + "Lock now" button for shared devices | |
| Demo mode — try it before touching Firebase | |

**No payroll rates are invented.** The Statutory Rules screen lists every rule the payroll uses (Labour Act 2007 + premiums, Regulations Relating to Fishers GN 308/2025, SSC Act 0.9% + 0.9% with the N$500–N$12,500 insurable band, PAYE 2026/27 annualise-÷12 tables) — **each verified against its official source in Phase 5**, with the source cited on screen. The formulas are locked against editing by anyone, including administrators; updates arrive only as verified, versioned releases.

---

## 2. What you need before starting

- A computer with Windows, Mac or Linux, with **Chrome or Edge** (recommended) or Firefox.
- **Python *or* Node.js installed** (only for running the app on your own computer — the deployed website does not need it). One of the two is enough.
  - Windows: download Python from <https://www.python.org/downloads/> and **tick the box "Add Python to PATH"** during installation. (If you already have Node.js instead, that works too — the start script finds it automatically.)
  - Mac: Python 3 is usually already installed. If not: <https://www.python.org/downloads/>
- To go live later: a free Google account (Firebase) and ONE free hosting account — GitHub (recommended, since you keep a backup there anyway; see sections 7–8) or Cloudflare. Not needed to try the app today.
- Also recommended: a free GitHub account for an off-site safety copy of the app's files — and with GitHub Pages that same copy can also BE the website (see section 8). Not needed to try the app today.

---

## 3. Start the app (5 minutes)

1. **Unzip** the project folder if it came as a ZIP (right-click → Extract All).
2. Open the `shipcrew-payroll` folder.
3. Double-click the starter for your system:
   - **Windows:** `start-windows.bat`
   - **Mac:** `start-mac.command` (first time: right-click → Open)
   - **Linux:** run `./start-linux.sh` in a terminal
4. Your browser opens at **http://localhost:8080** with the ShipCrew Payroll sign-in screen.
5. Keep the black window (Windows) or Terminal (Mac/Linux) open while using the app — that little window IS the app's server on your computer. Close it to stop.

> ⚠️ Do NOT open `index.html` directly by double-clicking it. Browsers block the offline features when a page is opened that way. Always use the start script — the app will remind you if you forget.

### Demo accounts (demo mode only)

| Role | Email | Password |
|---|---|---|
| System Administrator | admin@shipcrew.demo | Admin@2026 |
| Payroll Administrator | payroll@shipcrew.demo | Payroll@2026 |
| Vessel Manager | manager@shipcrew.demo | Manager@2026 |
| Supervisor | supervisor@shipcrew.demo | Super@2026 |
| Crew Member (Frans) | crew1@shipcrew.demo | Crew@2026 |
| Crew Member (Selma) | crew2@shipcrew.demo | Crew@2026 |
| Read-only Auditor | auditor@shipcrew.demo | Audit@2026 |

Sign in as each role to see exactly what that person can and cannot do. The crew account shows the simple crew screen; the admin account shows the management dashboard. Demo data can be reset under **Settings → Data tools**.

---

## 4. Install it like a real app (optional but recommended)

Once the app is open (locally or on your deployed website):

- **Android phone/tablet (Chrome):** tap the browser menu ⋮ → **"Add to Home screen"** or **"Install app"**. The app gets its own icon and opens full-screen like any other app.
- **Windows (Chrome/Edge):** click the install icon (⊕ or a screen-with-arrow) in the address bar, or menu → **Install ShipCrew Payroll**.
- The app then works **offline** — try it: install it, open it once, turn off your internet, open it again. It still starts, and everything you do is saved and syncs later.
- Want a real **APK file** (for formal distribution or the Play Store)? Follow `docs/08-android-apk.md` — it needs the website online first (section 7).

---

## 5. Test it

Work through `docs/04-testing-guide.md` — a click-by-click checklist with expected results. Sections A–G cover the foundation (sign-in, roles, offline, security); **H–O cover Phase 2** (crew, vessels, trips, assignments, clocking, users); **P–R cover Phase 3** (device PIN, revocation, sync — see also `docs/10-devices-pin-sync.md`); **S–U cover Phase 4** (hour categories, breaks & corrections, catch & quota — see also `docs/11-working-hours-catch.md`); **V–X cover Phase 5** (contracts, payroll runs, payslips & adjustments — see also `docs/12-payroll.md`); **Y covers the payslip dispute loop** (v2.4.0); **Z covers Phase 6** (reports, exports, dashboard, production review — see also `docs/13-reports.md` and `docs/14-security-review.md`).

## 6. Connect Firebase (real accounts, real data)

Follow `docs/01-firebase-setup.md` — every click is described. Until then the app stays in clearly-marked demo mode. **Never enter real employee data in demo mode.**

## 7. Put it on the internet (GitHub Pages or Cloudflare Pages)

Two free ways to get the HTTPS website address that phones need for installing the app — pick ONE:

- **GitHub Pages (recommended if you use the GitHub backup):** follow `docs/09-deployment-github-pages.md`. Your repository becomes the website — backup and live site in one place, updates by uploading new files to the repo. Note: on the free GitHub plan the repository must be public (safe for this app's code, and the guide explains the rules).
- **Cloudflare Pages:** follow `docs/03-deployment-cloudflare.md` — drag-and-drop deployment, no command line needed. The repository can stay private.

Both give the app a permanent HTTPS address; the APK guide (docs/08) works with either.

## 8. Keep a safe copy of the app on GitHub (recommended, free)

Follow `docs/07-github-code-backup.md` — drag-and-drop upload, no command line needed.

Plain English: **Firebase and GitHub do two different jobs.** Firebase holds your company's *data* (crew records, clock-ins, trips) so every device sees the same thing. GitHub holds the app's *files* (the code) so a lost laptop never means a lost app — and with GitHub Pages (docs/09) that same repository can also serve the app as your website. The app is designed for Firebase; GitHub is a safety deposit box for the code that can double as the website. Use both.

---

## 9. The guides in this folder

| File | What it is for |
|---|---|
| `README.md` | This file — start here |
| `ARCHITECTURE.md` | How the system works (plain English + technical detail) |
| `docs/01-firebase-setup.md` | Connect your Firebase project, click by click |
| `docs/02-database-design.md` | Every data collection and field, explained |
| `docs/03-deployment-cloudflare.md` | Put the app online with Cloudflare Pages |
| `docs/04-testing-guide.md` | Test checklist for every phase, with expected results |
| `docs/05-backup-recovery.md` | How to back up and restore your data |
| `docs/06-roadmap.md` | The 6-phase plan and what comes next |
| `docs/07-github-code-backup.md` | Keep a safe copy of the app's files on GitHub |
| `docs/08-android-apk.md` | Install on Android phones and build an APK |
| `docs/09-deployment-github-pages.md` | Put the app online with GitHub Pages (repo becomes the website) |
| `docs/10-devices-pin-sync.md` | Devices, the offline PIN, revocation and how sync works |
| `docs/13-reports.md` | The report library and PDF / Excel / CSV exports (Phase 6) |
| `docs/14-security-review.md` | Production security review with sign-off table — complete before going live |
| `rules/firestore.rules` | The server-side security rules (deployed in step 6 of the Firebase guide) |

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| **Double-clicking `start-windows.bat` does nothing, or the black window flashes and disappears** | The black window is designed to **stay open and tell you the problem** — if it closes instantly, Windows or your antivirus is blocking the file. Fix 1: right-click `start-windows.bat` → **Properties** → tick **Unblock** → OK → try again. Fix 2: open the folder, click the address bar at the top, type `cmd`, press Enter, then type `start-windows.bat` and press Enter — now you can read the message. |
| "Neither Python nor Node.js was found" | Install Python from python.org and **tick "Add Python to PATH"**, then run `start-windows.bat` again. (Or install Node.js from nodejs.org instead — the start script accepts either.) |
| A message about the **Microsoft Store** / "Python was not found; run without arguments to install from the Microsoft Store" | Your Windows has a fake Python shortcut. The start script usually avoids it automatically. If not: Settings → Apps → **Advanced app settings → App execution aliases** → turn **OFF** the `python.exe` and `python3.exe` aliases, install real Python from python.org (tick "Add Python to PATH"), and run the script again. |
| "Port 8080 is in use" | Another app is using the port. Close other copies of the start script, or open the start script in Notepad and change the line `set "PORT=8080"` near the top to `set "PORT=8081"`. |
| Page is blank / stuck on "Preparing app…" | Press Ctrl+F5 (hard reload). If it persists: browser settings → clear site data for localhost → reload. |
| I see an old version after an update | The app caches itself for offline use. Reload once — the app will offer "Update & reload". If not, clear site data. |
| "The local database is blocked" | You have the app open in another tab or window. Close the others and reload. |
| Forgot a demo password | They are listed in the table above — or reset everything under Settings → Data tools → Reset demo data. |
| App works but no data syncs | Demo mode does not sync (by design). Connect Firebase first (docs/01). |
| Port 8080 busy but no window open | An old copy may still be running in the background. Restart the computer, or see the note in the black window — it explains this. |

Still stuck? Re-read the exact error message on screen — the app explains most problems in plain English.

---

## 11. Plain-English glossary

- **PWA (Progressive Web App):** a website that installs like an app and works offline.
- **Service worker:** a helper inside the browser that saves the app's files so it can start without internet.
- **IndexedDB:** storage inside the browser that keeps data even after closing the app or restarting the device.
- **Firebase:** Google's cloud service that stores your shared data (logins, records, payroll) centrally so every device sees the same thing.
- **Firestore:** the specific Firebase database this system uses (organised like folders of documents).
- **Security rules:** instructions that run on Google's servers deciding who may read or write what. The real security wall.
- **Sync (synchronisation):** copying records from a device to the central database (and back) when internet is available.
- **Idempotent:** "doing it twice has the same effect as doing it once" — repeated syncs can never create duplicates.
- **Audit trail:** an append-only history of who did what, when. Nobody can edit it, not even administrators.
- **UTC:** the world clock. All timestamps are stored in UTC and displayed in Namibian time (Africa/Windhoek).
- **Demo mode:** the app running without Firebase, using clearly-marked fake accounts, entirely on your device.

---

## 12. A note on security

- Crew members can only ever see their own profile, clockings and payslips — enforced on Google's servers (`rules/firestore.rules`), not just by hiding menus.
- Passwords are never stored as readable text (demo mode uses PBKDF2 hashing on-device; live mode uses Firebase Authentication).
- Tax and SSC formulas are locked against editing by anyone, including administrators — they change only through verified, versioned software releases.
- Audit entries are append-only.
- The app never asks for, or contains, any secret keys. Your Firebase config values are safe to be in the app (that is how Firebase is designed) — the security rules do the protecting.
