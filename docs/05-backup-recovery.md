# Guide 5 — Backup & Recovery

The system stores data in two places, and both need a backup plan:

1. **The cloud (Firebase Firestore)** — the central, shared database. THE most important one.
2. **Devices** — each phone/tablet/PC keeps its own working copy (IndexedDB). Devices can be lost at sea; the cloud is what survives.

---

## Part 1 — What to back up and how often

| What | How often | How |
|---|---|---|
| Firestore database (test + prod) | Weekly at minimum; before every big change (e.g. a new phase go-live) | Part 2 below |
| A copy of the app folder (with your `firebase-config.js`) | Whenever the app is updated | Keep 2 copies (e.g. one on your PC, one on a USB/external drive) |
| Firebase Authentication user list | Monthly | Console screenshot or export (Part 4) |
| Security rules | Whenever changed | The master copy IS `rules/firestore.rules` in your app folder — keep the folder safe |

## Part 2 — Backing up Firestore (built-in export)

These steps use Firebase's own export to a Google Cloud Storage bucket:

1. In the Firebase console open your project → **Build → Firestore Database**.
2. Click the ⋮ (three dots) menu at the top → **Export** (if you do not see it, use the "Usage" tab → the export option appears there once billing-aware features are visible; Firebase asks you to create a Cloud Storage bucket the first time).
3. Follow the prompts to choose/create a bucket (e.g. `shipcrew-payroll-prod-backups`) and start the export.
4. When it finishes, the backup lives in that bucket. Downloads are possible from <https://console.cloud.google.com/storage-browser> (same Google account).

> Simpler alternative for small companies: in Firestore → **Data**, collections can be exported as JSON via the "Export" option where available, or use the device export (Part 3) for a readable snapshot.

> Recommended from Phase 6: an automatic scheduled export (a small scheduled Cloud Function). Your developer will set this up as part of the production go-live checklist.

## Part 3 — Device-level snapshot (readable JSON)

Any administrator can make a human-readable snapshot at any time:

1. Sign in to the app on the PC that has the most complete data.
2. **Settings → Data tools → Export this device's data (JSON)**.
3. Save the downloaded file with the date in its name, e.g. `shipcrew-data-2026-11-10.json`, on your backup drive.

This includes everything on that device (passwords are excluded by design). It is NOT a substitute for the Firestore export, but it is an excellent quick snapshot and audit aid.

## Part 4 — Authentication users

1. Firebase console → **Build → Authentication → Users**.
2. Note the list (or screenshot it): emails + UIDs.
3. Remember: passwords themselves are never exportable (that is a security feature). If the user list is ever lost, you recreate users and set new passwords.

## Part 5 — Recovery scenarios

| Scenario | Recovery |
|---|---|
| A phone falls in the sea | Nothing to do for the data: its records are on the device and in the sync queue. Once the device is gone: sign in on a replacement device with the same account; ask an administrator to mark the lost device **Revoked** (Devices screen — full enforcement in Phase 3). |
| Wrong data entered by mistake | Never delete in panic: use the correction flow (Phase 4+) which preserves history, or contact your developer. The audit log always shows who changed what. |
| Firestore data accidentally deleted | Restore from the most recent export (Part 2): Firebase console → Firestore → ⋮ → **Import** → choose the export/bucket. Data after the backup date is lost — another reason for weekly backups. |
| The whole Firebase project is lost | Recreate the project (docs/01), deploy the rules, recreate users, import the latest Firestore backup, redeploy the website (docs/03). |
| A device shows "sync failed — kept" | The record is safe on the device. Fix the internet connection and press **Sync now** (Settings). Failed uploads retry automatically anyway. |
| Browser storage was wiped | Sign in again online; shared data comes back from Firestore. Only that device's *unsynced* items would be affected — another reason to sync often when in port. |

## Part 6 — Golden rules

1. **Weekly cloud backup.** Put a recurring reminder in your calendar.
2. **Backup before every phase go-live** and before changing security rules.
3. **Keep the app folder** (with your Firebase config and rules) in two places.
4. **Test a restore once** — a backup you have never restored is only a hope.
