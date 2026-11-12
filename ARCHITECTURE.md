# Architecture — How ShipCrew Payroll Works

This document explains the system in plain English first, with technical detail underneath. It is written for the project owner and for any developer who takes over later.

---

## 1. The big picture

```
   ON THE VESSEL (offline)                      ON SHORE (online)
  ┌──────────────────────────┐                ┌──────────────────────────┐
  │  Crew phone / tablet     │                │  Manager / payroll PC    │
  │  ┌────────────────────┐  │   internet     │  ┌────────────────────┐  │
  │  │  The PWA (HTML/JS) │  │  (when it      │  │  The same PWA      │  │
  │  ├────────────────────┤  │   exists)      │  ├────────────────────┤  │
  │  │  Service worker    │◄─┼───────────────►│  │  Service worker    │  │
  │  │  (app files cache) │  │  HTTPS only    │  │                    │  │
  │  ├────────────────────┤  │                │  └────────────────────┘  │
  │  │  IndexedDB         │  │                └────────────┬─────────────┘
  │  │  (device data +    │  │                             │
  │  │   sync OUTBOX)     │  │                  ┌──────────▼──────────┐
  │  └────────────────────┘  │                  │  Firebase (Google)  │
  └──────────────────────────┘                  │  • Authentication   │
                                                │  • Cloud Firestore  │
                                                │  • Security rules   │
                                                └─────────────────────┘
         Cloudflare Pages serves the app files worldwide (HTTPS).
```

Two interfaces, one app: crew members see the simple crew screen; staff see the management dashboard. The server-side rules decide what each login may actually touch — the interface is just the friendly layer.

---

## 2. Why Cloud Firestore (and not the Realtime Database)

The project brief asked for the better choice to be explained before implementation. **Cloud Firestore** was chosen:

1. **Queries for reports.** The required reports (hours by vessel, payroll cost per trip, attendance by date range) need real querying — "give me documents where vessel = X and date between A and B". Firestore is built for this; the Realtime Database (RTDB) is one big JSON tree with very limited filtering, so reports would require downloading far too much data to slow satellite connections.
2. **Offline-first support.** Firestore has a well-designed local cache layer and was designed around occasionally-connected clients.
3. **Expressive security rules.** Role-based access ("crew may read only their own payslips"; "statutory rules are read-only for everyone") maps directly onto Firestore rules, evaluated on Google's servers.
4. **Structure matches the domain.** The required data (crew, vessels, trips, clocking events, payslips…) is naturally a set of document collections with relationships — exactly Firestore's model.
5. **Write controls.** Server timestamps, transactions and atomic batched writes support payroll integrity (e.g. locking an approved payroll run).

**But we do not rely on Firestore's offline cache alone.** The app keeps its own explicit IndexedDB store plus a sync outbox, because the brief demands visible record states ("saved locally / waiting to sync / synchronised / failed"), queue survival across restarts, and duplicate-proof uploads. Firestore is the central truth; IndexedDB is the device's memory and outbox.

---

## 3. The offline-first design

**Write path (device → cloud):**

1. The user acts (a clock-in, a new crew member, a status change, an audit entry).
2. The record is written to IndexedDB immediately. It is now safe forever (survives restart).
3. A copy is placed in the **sync queue** (an outbox) with a **unique event ID**.
4. When connectivity returns, the sync engine uploads each queued item to Firestore **using the event ID as the document ID**. This makes every upload **idempotent**: sending the same event twice simply overwrites the same document — duplicates are structurally impossible.
5. A clock-out re-queues the SAME event id with the complete final record, so the cloud always ends up holding the full, final event.
6. Failed uploads are retried with a counter; **nothing is ever discarded**. After 5 failures the item is shown as "sync failed — kept" and still retried.
7. The "last successful sync" time is stored and displayed.

**Read path (cloud → device):** staff screens query Firestore when online; crew devices work from their local store and refresh when connected.

**Conflict policy:** the server is authoritative. Devices never "update" shared documents in place — they contribute uniquely-named records (events, corrections, approvals). Approved payroll documents are write-locked by the security rules, so no device can silently overwrite history. Corrections are new adjustment documents, never edits.

**What is cached offline:** the entire app shell (service worker precache), including the Firebase SDK files from gstatic.com. First load must be online; every load after that works offline.

---

## 4. Authentication, sessions and devices

- **Live mode:** Firebase Authentication (email/password). The user's role is read from `users/{uid}` in Firestore — so roles come from the server, not the browser.
- **Demo mode:** before Firebase is connected, the app runs with device-local demo accounts (PBKDF2-hashed passwords) so a beginner can evaluate everything safely.
- **Sessions:** a successful sign-in stores a session record on the device, so closing the app, restarting the device or losing internet does not log you out. (First-time activation always requires internet, as specified.)
- **Shared-device protection:** after a configurable idle time the app auto-locks and demands the password again; every action is stamped with the signed-in identity. Phase 3 adds a device-bound quick PIN for offline unlocking, a full device registry with administrator revocation, and device-bound offline activation.
- **Brute-force protection:** after 5 failed sign-ins the app enforces a 60-second cooldown (and Firebase adds its own protection in live mode).

---

## 5. Security model — four layers

1. **Interface layer:** screens only render what the role may use. (Convenience, not security.)
2. **Router layer:** the router blocks crew from staff routes and vice versa.
3. **Business-rule layer (Phase 2):** `operations.service.js` validates every clocking, status change and assignment before anything is saved — the screens cannot bypass it.
4. **Server layer (the real wall):** `rules/firestore.rules` — deny by default; roles read from `users/{uid}`; crew can only read their own documents and create only their own clock events; banking details in a separate, tighter collection; statutory rules read-only for everyone; audit log append-only; writes for future modules stay locked until each phase ships (least privilege).

Additional protections: passwords never stored in readable form; no secrets in the app code; HTTPS enforced by Cloudflare Pages; device data treated as untrusted until validated server-side; storage persistence requested so the browser does not evict offline data.

---

## 6. Time, money and legal data

- **Time:** every timestamp is stored in UTC (ISO 8601) and displayed in Africa/Windhoek. This keeps multi-device records consistent. `js/core/time.js` is the only place formatting happens.
- **Money:** Namibian Dollar (NAD), formatted consistently via `js/core/ui.js`.
- **Statutory rules (critical legal policy):** the system contains a *statutory rule store* whose schema includes source, effective dates, version, verified-by, verified-date and approval. **No rate, threshold or formula is implemented until verified against the official source.** Phase 1 seeds the framework with the relevant Namibian instruments — Labour Act 11 of 2007; Regulations Relating to Fishers, 2025 (GN 308 of 2025); Social Security Act 34 of 1994; Public Holidays Act 26 of 1990; Income Tax Act 24 of 1981 as amended (NamRA) — each marked "awaiting verification". Rules are write-protected in the database AND in the app; updates arrive only as controlled, versioned releases that record who verified what, when. Where land-based provisions differ from fisher-specific provisions, the fisher regulations win.

---

## 7. Data model

29 local stores mirror the Firestore collections — companies, users, roles, crew, **crew_banking** (restricted), contracts, vessels, trips, assignments, clock events, work/break/rest records, catch records, quota allocations, remuneration rules, statutory rules, payroll periods/calculations/approvals, payslips, deductions, allowances, audit logs, sync queue/transactions, devices, plus a small internal `meta`/`sessions` store. Every record carries: unique ID, createdAt/By, updatedAt/By, status and its relationship IDs. Full field-by-field documentation: `docs/02-database-design.md`.

Phase 2 business rules live in `js/core/operations.service.js` — the single referee every screen must go through: clock-in validation (assigned + Open/At-Sea trip + no open event), trip status transitions (forward-only, with status history), one-live-assignment-per-crew, banking separation, and trip-close blocking while crew are clocked in.

---

## 8. Environments

| Environment | Firebase config | Used for |
|---|---|---|
| `demo` | none (null) | Trying the app — device only, demo accounts |
| `test` | separate test Firebase project | Everyday testing with fake data |
| `prod` | separate production project | Real company data |

Switching is a single constant (`ACTIVE_ENV` in `js/firebase-config.js`) plus separate Cloudflare Pages projects. Test and production never mix. See `docs/01` and `docs/03`.

---

## 9. Codebase map

```
shipcrew-payroll/
├── index.html               App shell + splash + import map (Firebase SDK pinned)
├── manifest.json            PWA install definition
├── service-worker.js        Offline app-shell caching (versioned)
├── offline.html             Friendly fallback if a page was never cached
├── css/styles.css           The whole design system (navy/white/teal)
├── js/
│   ├── main.js              Boot sequence, auto-lock, update prompts
│   ├── config.js            App constants, trip statuses, phase number
│   ├── firebase-config.js   demo/test/prod switch (edit this to go live)
│   ├── core/                Services: idb, security, time, events,
│   │                        permissions, audit, store (seed), auth, sync,
│   │                        firebase loader, ui toolkit, router,
│   │                        operations (Phase 2 business rules)
│   └── screens/             login, lock, crew home (clocking),
│                            admin: dashboard, crew, vessels, trips,
│                            attendance, users, devices, audit, settings,
│                            statutory, roadmap, future-module info
├── rules/firestore.rules    Server-side security rules
├── docs/                    The beginner guides
└── start-*.bat/.command/.sh Local run scripts
```

No build tools, no node_modules, no frameworks: plain HTML + CSS + JavaScript ES modules. This is deliberate — the project must be inspectable, hostable anywhere static, and maintainable by a beginner.
