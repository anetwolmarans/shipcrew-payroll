# Guide 7 — Keep a safe copy of the app on GitHub (click by click)

**Time needed: about 15 minutes.** GitHub is a free website that keeps a safe, private copy of your app's **files** (the code). If your laptop is lost, stolen or breaks, your app is not lost with it — and every change you ever upload is kept in a history you can go back to.

> **GitHub and Firebase are NOT competitors — they do two different jobs:**
>
> | Service | What it keeps | Example |
> |---|---|---|
> | **Firebase** | Your company's **DATA** | crew records, clock-ins, trips, logins |
> | **GitHub** | The app's **CODE** | index.html, the js/ folder, this guide |
>
> The app talks to Firebase. You upload files to GitHub. You need both, and they never replace each other. Firebase is covered in `docs/01-firebase-setup.md`; data backups are covered in `docs/05-backup-recovery.md`.

**Is GitHub required?** No — the app works perfectly from the folder on your computer. But we recommend it: it costs nothing, takes 15 minutes, and later (Phase 6) it lets Cloudflare Pages update your website automatically whenever you upload a new version.

---

## Step 1 — Create the free account

1. Go to <https://github.com> in Chrome or Edge.
2. Click **Sign up** and fill in: your email, a password, a username (e.g. `atlantic-harvest-hq`).
3. Verify your email (GitHub sends a code). That's it — the free plan is enough for us.

## Step 2 — Create the private repository

A *repository* (or "repo") is one project's storage box on GitHub.

1. While signed in, click the **+** icon at the top-right → **New repository**.
2. Repository name: `shipcrew-payroll`
3. Visibility: choose **Private** — only people you invite can see it. (We keep the project private; it also keeps prying eyes away from company details in the guides.)
4. Leave every other option unticked (no README, no .gitignore, no license — we already have our own files).
5. Click **Create repository**. You land on a page that says "Quick setup" — keep it open for Step 3.

## Step 3 — Upload the app (drag and drop, no command line)

1. On the "Quick setup" page, click the link **uploading an existing file**.
2. Open your `shipcrew-payroll` folder on your computer (do **not** zip it).
3. Drag **the folders** (`css`, `docs`, `icons`, `js`, `rules`) and **the loose files** (`index.html`, `manifest.json`, `offline.html`, `server.js`, `service-worker.js`, `README.md`, `ARCHITECTURE.md`, `start-windows.bat`, `start-mac.command`, `start-linux.sh`) from your folder onto the big upload area in the browser.
   - Dragging a folder keeps the folder structure — you will see `css/…`, `js/…` names appear in the upload list.
   - GitHub accepts up to 100 files per drop; this project is about 60, so one drag is fine. If ever a drop is rejected, drag the folders one at a time.
4. Below the upload area there is a small green button area: leave "Commit changes" as is, and in the text box type a short note, e.g. `First upload — Phase 2 build`.
5. Click **Commit changes**. A progress bar runs, then you see the file list — your app now lives safely on GitHub.

## Step 4 — Check it worked

1. On the repo page you should see the folders: `css`, `docs`, `icons`, `js`, `rules` and the loose files.
2. Click into `js` → `core` — you should see the files (`store.js`, `sync.service.js`, …).
3. Top-left of the file list it should say **Private** next to the repo name.

That is your safe copy. Nothing else to configure — GitHub only stores; the app itself never talks to GitHub.

## Step 5 — Updating the copy later (when the app changes)

When you receive a new build (a new ZIP, or updated files):

1. Go to your repo on GitHub → click **Add file** → **Upload files**.
2. Drag the NEW or CHANGED files/folders in (same names replace the old ones).
3. Type a note like `Update to Phase 3 build` → **Commit changes**.
   - Every upload is a version in the history: click **Commits** at any time to see (or download) any earlier version. Nothing is lost.

### The easier way for regular updates: GitHub Desktop (optional)

If you will update often, the free **GitHub Desktop** app replaces drag-and-drop with two buttons:

1. Install from <https://desktop.github.com> and sign in.
2. Menu **File → Add local repository…** → choose your `shipcrew-payroll` folder → GitHub Desktop offers **"create a repository here"** → accept (Name: `shipcrew-payroll`, tick **Private** in the dialog if shown) → **Create**.
3. Click **Publish repository** → confirm. Your folder is now linked to GitHub.
4. From now on, whenever files change, GitHub Desktop shows them: type a short note → click **Commit to main** → click **Push origin**. Done — that is the whole update routine.

---

## Two rules to keep you out of trouble

1. **Keep the repository Private.** The app's Firebase config values are designed to be public-safe (the security rules do the real protecting — see README §12), but private costs nothing and keeps your guides, port numbers and company name out of search engines.
2. **Never upload real employee data or SitePro files.** Specifically: the JSON exports made under *Settings → Data tools* contain real names and must never go to GitHub; and nothing from the SitePro Clock In project (its code, its Firebase keys, its data) belongs in this repository — the two systems stay strictly separate.

## How this helps later (Phase 6)

When we deploy the website with Cloudflare Pages (`docs/03-deployment-cloudflare.md`), Pages can connect **directly to this GitHub repository**: every time you upload a new version to GitHub, the website updates itself within a minute — no more manual drag-and-drop to Cloudflare.

---

## Common problems

| Problem | Meaning / fix |
|---|---|
| Upload rejects a folder, or files appear without folders | Drag the folder itself (not files picked out of it). Chrome and Edge handle folders best. Still stuck? Drag one folder at a time. |
| "This file exceeds the maximum size" | GitHub files must be under 100 MB. Our biggest file is well under 1 MB — if you see this, you are uploading the wrong thing (e.g. a database export or a ZIP of a ZIP). |
| I uploaded the wrong file | Don't worry — upload the correct file with the same name; it replaces the old one. Or restore an earlier version from the **Commits** history. |
| "username already taken" at sign-up | Try adding your company, e.g. `atlantic-harvest-hq2`. |
| I want to give a colleague access | Repo page → **Settings** → **Collaborators** → **Add people** → their GitHub username. They accept the invite by email. |
