# Guide 10 — Devices, the offline PIN and how sync works (plain English)

**Time needed: about 5 minutes per device.**

This guide explains the three things Phase 3 added to ShipCrew Payroll: **activating a device with a PIN**, **the device registry with revocation**, and **the automatic sync engine with its per-record states**.

---

## 1. What is a "device"?

Any phone, tablet or computer where the app is installed and someone has signed in. Each device gets its own hidden ID at first sign-in, and appears in the registry: **Devices** (in the app menu). The registry shows the device name, type, owner, when it was last seen, whether the offline PIN is on, and whether it is Active or Revoked.

## 2. Activate a device with a PIN (one minute per device)

The PIN is a quick 4–8 digit code that **unlocks the app on that one device when it is locked — without internet**. This is what crew use at sea, where typing a long password on a wet screen is no fun.

1. Sign in on the device (first sign-in needs internet once).
2. Open **Devices** in the menu.
3. Under "This device" → **Set up PIN** → type 4–8 digits, repeat, **Save PIN**.
4. From then on: when the screen locks (after idle time, or with the padlock "Lock now" button), the lock screen offers **both** boxes:
   - **Password** — always works, and online it is re-checked by the server;
   - **Device PIN** — works with no internet at all.

Good to know:

- The PIN is stored **hashed on that device only** — it never uploads to Firebase, and no administrator can see or reset it. Forgot the PIN? The password always unlocks the screen.
- After **5 wrong PIN attempts** the PIN locks for 60 seconds (the password still works). This is deliberate — a shared wheelhouse device must not be guessable.
- The PIN never replaces signing in. Signing in still needs email + password; the PIN only unlocks a locked screen.

## 3. Revoke or reinstate a device

Lost a phone? A crew member left? Revoke the device:

1. Sign in as an administrator on **your** device.
2. **Devices** → find the phone in "Registered devices" → **Revoke**.
3. That phone is signed out at its next check, can no longer sign in, and **stops syncing**. Records already saved on it stay safe on the device — nothing is deleted.

Changed your mind? **Reinstate** does the opposite (same screen). Two details worth knowing:

- In **live mode** the decision lives in the central registry: the revoked phone obeys as soon as it can reach the internet.
- In **demo mode** (one device only) an administrator can still sign in on the revoked device to press **Reinstate this device** — that is the escape hatch.

## 4. How syncing works (and how it can never duplicate or lose data)

Every record carries its own **sync state**, visible next to it:

| State | Meaning |
|---|---|
| **saved locally** | Written safely onto this device (works fully offline) |
| **waiting to sync** | In the outbox, will upload by itself |
| **synchronised** | Confirmed in the central cloud database |
| **sync failed — kept** | Upload failed 5 times — the record is **kept safe** on the device and retried; a later success clears this |

The engine is **fully automatic**: it uploads when the app opens, when the internet returns, when you bring the app back to the foreground, after every new record, and every 30 seconds anyway. The **Sync now** and **Retry failed** buttons on the dashboard run exactly the same safe routine.

Two promises built into the design:

1. **Duplicate-proof:** every record has one permanent unique ID that becomes its document ID in the cloud. Uploading twice simply rewrites the same document — duplicates are impossible.
2. **Safe conflicts:** if two devices edited the same record, the **newest edit wins**. The device with the older copy adopts the newer version instead of overwriting it, and the event is written to the **Audit Log** (`sync_conflict`). Nothing is ever silently overwritten or lost.

Every upload run also writes one line in the **sync ledger** (`sync_transactions`) — which device uploaded how much, when — visible to administrators.

## 5. Troubleshooting

| Symptom | What it means / what to do |
|---|---|
| Lock screen says "Too many incorrect PIN attempts" | Wait 60 seconds, or unlock with the password (always works) |
| "This device has been revoked" on the sign-in screen | Normal — an administrator revoked this device. An admin can sign in and press **Reinstate this device** |
| Records stay "saved locally" for a long time in live mode | The device is offline or Firebase is unreachable — it will upload by itself when the connection returns |
| A record shows "sync failed — kept" | Tap **Retry failed** on the dashboard, or just wait — the engine retries by itself. The record is not lost |
| Admin revoked a device while it was offline | It will sign itself out at its first moment online — the registry is the authority |
