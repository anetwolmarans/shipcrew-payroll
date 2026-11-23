# Guide 14 — Production Security Review (Phase 6 sign-off)

**Time needed: about 45 minutes, once.** Before real names, real banking and real payroll go into the production Firebase project, work through this page with the developer. Every item below was **reviewed and verified against the actual code and rules file** during the Phase 6 build (v2.5.0). Tick the boxes on paper as you re-verify the live project, then sign at the bottom.

---

## 1. The security wall (server-side rules)

Reviewed file: `rules/firestore.rules` (v2.5.0). Findings:

| # | Check | Result | Where |
|---|---|---|---|
| 1.1 | **Deny by default** — a catch-all rule blocks every collection not explicitly allowed | ✅ Pass — `match /{document=**} { allow read, write: if false; }` closes the file | rules line 317 |
| 1.2 | Roles read from `users/{uid}` only, which staff cannot rewrite | ✅ Pass — `hasRole()` reads the user document; `users` writes are system-admin only | rules 39–72 |
| 1.3 | Crew read only their own clock events, payslips, queries, banking | ✅ Pass — every crew-accessible collection filters on `userId == request.auth.uid` | rules 125–145, 242–252, 262–280, 91–101 |
| 1.4 | Banking visible to payroll/system admins and the owning crew member **only** — not even vessel managers | ✅ Pass | rules 91–101 |
| 1.5 | Payslips: created only on approval, never deleted; the ONLY update allowed is the v2.8.0 revoke flip (status issued→revoked) with every money field and recipient frozen (`unchanged`) — crew self-read | ✅ Pass | rules 248–265 |
| 1.6 | Payroll runs: once `locked`, totals and the payslip list can never change; the only exit from `locked` is a v2.8.0 reopen to `draft` with `payslips` unchanged (reason recorded); drafts only are deletable | ✅ Pass | rules 231–247 |
| 1.7 | Payslip queries: crew open against own payslip only; message immutable; only admins answer/close | ✅ Pass (added v2.4.0) | rules 262–280 |
| 1.8 | Audit log append-only: anyone may add **their own** entry, only admin/auditor read, nobody edits | ✅ Pass | rules 291–297 |
| 1.9 | Statutory rules (tax/SSC formulas): **no app role can write them**, not even admins | ✅ Pass — `allow write: if false` | rules 215–221 |
| 1.10 | Catch records: amendments only, `tripId`/`createdAt`/`createdBy` immutable, no deletes | ✅ Pass | rules 172–182 |
| 1.11 | Crew/vessels/trips/assignments/contracts/allowances/deductions/devices: `delete: if false` or equivalent — history is never destroyed | ✅ Pass | throughout |
| 1.12 | Clock events: crew create only their own; clock-in time/employee/trip immutable; close only while open; supervisor corrections only on closed events with correction history | ✅ Pass | rules 125–143 |
| 1.13 | **Phase 6 reports added no new collections and no new write access** — reports re-read the same collections under the same rules | ✅ Pass by design | rules header note |

**Accepted design decisions** (documented, not defects):

- `vessels`, `trips`, `catch_records`, `quota_allocations`, `statutory_rules` are readable by any signed-in user. Crew need trip/vessel context for clocking and their own payslips; nothing financial is exposed (payroll figures live in collections crew cannot read).
- The Firestore `apiKey` in `js/firebase-config.js` is public by design — Firebase Web API keys identify the project, they do not authorise anything. Data safety comes from the rules above.

## 2. Device & session security

| # | Check | Where |
|---|---|---|
| 2.1 | Sessions auto-lock after the configured idle time (Settings → auto-lock minutes) | `auth.service.js`, Settings screen |
| 2.2 | "Lock now" padlock in every top bar; unlock needs password or device PIN | topbar, `lock.screen.js` |
| 2.3 | Device PINs (4–8 digits) are stored **only on the device** — never uploaded | `device.service.js`, docs/10 |
| 2.4 | Revoking a device signs it out at its next check and it can never sync again | `device.service.js`, `sync.service.js` |
| 2.5 | Failed logins cooldown after 5 attempts (Settings values) | `auth.service.js` |
| 2.6 | Crew members cannot open admin screens even by typing the address (router re-checks role) | `router.js` |

**To re-verify on the live project:** do docs/04 sections A–D (sessions, roles, locking) on one real device.

## 3. Data protection

| # | Check | Where |
|---|---|---|
| 3.1 | Banking details never appear in any report or export | `report-data.js` — crew register exports contact/position only |
| 3.2 | Payroll figures appear in reports only for roles with `view_payroll_all`; exports additionally need `export_reports` | `permissions.js` matrix, reports screen |
| 3.3 | Every export is written to the audit log with report, format, row count and filters | reports screen → `data_exported` |
| 3.4 | Demo mode (`?env=demo` or `ACTIVE_ENV: 'demo'`) uses only fictional people and is clearly banner-marked | `firebase-config.js`, dashboard banner |
| 3.5 | Backups: follow docs/05 (Firestore scheduled export or manual JSON export monthly, plus the GitHub code backup docs/07) | docs/05 |

## 4. Public-repo hygiene (GitHub Pages is public)

| # | Check |
|---|---|
| 4.1 | No data exports, crew lists, clocking JSON or payroll files are ever committed to the repository |
| 4.2 | No passwords, PINs, API keys (other than the public Firebase config) or tokens in any committed file |
| 4.3 | The SitePro Clock In system files are never uploaded |
| 4.4 | The GitHub token used for deployment is kept by the owner privately (env var) and never stored in the repo |

## 5. Deployment checklist (live mode)

1. Rules published: Firebase console → Firestore → Rules shows the v2.5.0 file (or `firebase deploy --only firestore:rules`).
2. `ACTIVE_ENV` is `'prod'` **only** in the production copy; the test deployment still points at `shipcrew-payroll-test`.
3. Production administrator created (docs/01 step 9) with a real name and a strong password.
4. First sign-in, first crew member, one test trip and one test payroll approved — then deleted via the documented amendment path (never deleted from history; reversed by adjustment entry if needed).
5. Devices of all staff registered; crew devices get PINs; unused devices revoked.
6. Backup schedule agreed and the first backup taken (docs/05).

## 6. Sign-off

| | Name | Date | Signature |
|---|---|---|---|
| Reviewed by (owner) | | | |
| Reviewed by (developer) | | | |
| Approved for production | | | |
