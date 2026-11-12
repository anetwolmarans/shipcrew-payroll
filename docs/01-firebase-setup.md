# Guide 1 — Connecting Firebase (click by click)

**Time needed: about 20 minutes.** Firebase is Google's cloud service that will hold your real logins and shared records. Until you do this guide, the app runs in clearly-marked **demo mode** on your device only.

> RULE: do this guide with a **TEST** project first. Create the production project only when you are happy with testing (step 9). Never mix them.

---

## Step 1 — Create the test project

1. Go to <https://console.firebase.google.com> in Chrome or Edge and sign in with a Google account.
2. Click **Create a project** (or "Add project").
3. Project name: `shipcrew-payroll-test`
4. Google Analytics: **Disable** it (not needed) and click **Continue**.
5. Wait for "Your project is ready" and click **Continue**.

## Step 2 — Turn on sign-in (Authentication)

1. In the left menu, click **Build** → **Authentication**.
2. Click **Get started**.
3. In the list of sign-in providers, click **Email/Password**.
4. Toggle **Enable** to on. Leave "Email link (passwordless)" off. Click **Save**.

## Step 3 — Create the database (Cloud Firestore)

1. In the left menu, click **Build** → **Firestore Database**.
2. Click **Create database**.
3. Location: choose **europe-west1 (Belgium)** — the closest reliable region to Namibia. Click **Next**.
4. Choose **Start in production mode** (secure). Click **Create**.
5. Wait about a minute. You will see an empty database page.

## Step 4 — Register the app and copy your config

1. Click the gear icon ⚙ (top-left, next to "Project settings" or via the ⚙ → **Project settings**).
2. Scroll down to **Your apps** and click the **Web** icon (</>).
3. App nickname: `ShipCrew Payroll Web`. Do NOT tick "Also set up Firebase Hosting". Click **Register app**.
4. You will see a block of code like:
   ```
   const firebaseConfig = {
     apiKey: "AIza....",
     authDomain: "shipcrew-payroll-test.firebaseapp.com",
     projectId: "shipcrew-payroll-test",
     storageBucket: "shipcrew-payroll-test.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef123456"
   };
   ```
5. Keep this page open — you will paste these values in Step 5.

## Step 5 — Check the values are in the app (already done for you)

> **Good news:** when the Firebase project `shipcrew-payroll-test` was connected, the values were already pasted into the app for you, and `ACTIVE_ENV` is already `'test'`. So this step is only a verification:

1. Open the project folder on your computer, then open the file `js/firebase-config.js` in any text editor (Notepad works; right-click → Open with → Notepad).
2. Confirm the `test: { ... }` block contains YOUR project's values (projectId `shipcrew-payroll-test`) and that the line near the top reads `export const ACTIVE_ENV = 'test';`.
3. Reload the app in the browser. The orange DEMO banner is gone — you are now connected to your test project.
4. Only if you ever create a DIFFERENT Firebase project: replace the values in the `test` block (or fill the `prod` block and switch `ACTIVE_ENV` to `'prod'`).

> Training tip: you can force demo mode at any time by adding `?env=demo` to the end of the address — handy for showing the system to colleagues without touching real data. Remove it from the URL to go back to live mode.

## Step 6 — Install the security rules (the real protection)

1. In the Firebase console, go to **Build → Firestore Database → Rules** (tab at the top).
2. Open the file `rules/firestore.rules` from the project folder in Notepad. Select ALL of it (Ctrl+A) and copy it (Ctrl+C).
3. Delete whatever is in the console's rules editor, paste your rules, and click **Publish**.
4. Confirm "Rules published". These rules now run on Google's servers: deny-by-default, crew see only their own data, statutory rules locked, audit log append-only.

## Step 7 — Create the FIRST administrator

1. In the Firebase console, go to **Build → Authentication → Users** and click **Add user**.
2. Email: your email (e.g. `anna@atlanticharvest.example`). Password: a strong password you will remember. Click **Add user**.
3. A row appears in the user list. Click it and find the **User UID** (a long code like `xK3v9pQ...`). Copy it.
4. Go to **Build → Firestore Database → Start collection**.
5. Collection ID: `users` → click **Next**.
6. Document ID: **paste the UID you copied** (this is important — it links the login to the role).
7. Add these fields (use "Add field" for each; type must be **string** unless noted):

   | Field | Type | Value |
   |---|---|---|
   | `email` | string | your email (exactly as in Authentication) |
   | `fullName` | string | e.g. `Anna Shipanga` |
   | `role` | string | `system_admin` |
   | `status` | string | `active` |
   | `createdAt` | string | e.g. `2026-11-10T08:00:00.000Z` (today's date, UTC format is fine) |

8. Click **Save**.
9. Open the app, sign in with this email and password → you land on the management dashboard as **System Administrator**. Done!

## Step 8 — Create more users (the other roles)

Repeat Step 7 for each staff member. Only the `role` value changes:

| Role value in the users document | What that person can do |
|---|---|
| `system_admin` | Everything, including user management and settings |
| `payroll_admin` | Contracts, remuneration, payroll, payslips, statutory reports |
| `vessel_manager` | Vessels, trips, crew assignments, catch & quota |
| `supervisor` | Review attendance, request clocking corrections |
| `auditor` | Read-only oversight, including the audit log |
| `crew` | Own profile, own clocking, own payslips — nothing else |

> In Phase 2, user creation moves into the app itself (Users & Roles screen) and this manual step disappears. Until then, the console is the controlled path.

> Crew members also need a `crew` document (employee record) linked by `userId` — that document is created by the in-app crew register in Phase 2. For Phase 1 testing, staff accounts are enough; the demo crew accounts remain available only in demo mode.

## Step 9 — The production project (when you are ready to go live)

1. Repeat Steps 1–6 with a NEW project named `shipcrew-payroll-prod`.
2. Put the production values into the `prod: { ... }` block of `js/firebase-config.js`.
3. Switch `ACTIVE_ENV` to `'prod'` **only in your production copy of the website** (see docs/03 — you will keep a test deployment and a production deployment).
4. Create the production administrator (Step 7) — real name, real email.
5. Test and production databases are completely separate. Data never crosses between them.

---

## Common problems

| Problem | Meaning / fix |
|---|---|
| "Your user record is not set up yet" after sign-in | The password works but the `users/{UID}` document is missing or the UID does not match. Redo Step 7.4–7.8 carefully. |
| "Incorrect email or password" | Check Authentication → Users — does the email exist? Passwords are case-sensitive. |
| Permission-denied errors in the app | The security rules were not published (Step 6), or the signed-in user's role value is misspelled. |
| App still shows the demo banner | Either the address has `?env=demo` in it (the training override — remove it and reload), or `ACTIVE_ENV` is still `'demo'`, or a config value still starts with `YOUR_`. Reload after saving. |
| Users screen empty in live mode | No `users` documents yet, or your account's role cannot read them. Sign in as system_admin. |
