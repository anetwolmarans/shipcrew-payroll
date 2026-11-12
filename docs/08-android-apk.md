# Guide 8 — Android: install the app on phones and make an APK (click by click)

**Time needed: about 10 minutes for Route A, about 30 minutes for Route B.**

PLAIN ENGLISH — two ways to get ShipCrew Payroll onto an Android phone:

| | Route A — *Install the app* (recommended) | Route B — *Real APK file* |
|---|---|---|
| What it is | Chrome turns the website into an installed app | A signed `.apk` file you install manually (or send to Play Store) |
| Icon & full screen | Yes — exactly like a native app | Yes |
| Works offline | Yes | Yes |
| Updates | **Automatic** — open the app and it updates itself | Manual — you rebuild and reinstall for each new version |
| Needs | The website online (Step 1) | The website online (Step 1) |
| Best for | Everyday use by the crew | Formal distribution, Play Store, companies that require an APK file |

> **Why the website must be online first:** both routes are built around the published app's address. Once the site is live (about 15 minutes with `docs/09-deployment-github-pages.md` or `docs/03-deployment-cloudflare.md`), everything below is quick. The offline features are exactly the same either way — data is saved on the device and syncs through Firebase when internet returns.

---

## Step 1 — Put the website online (one time)

1. Follow **either** hosting guide — both are free, pick one:
   - `docs/09-deployment-github-pages.md` — GitHub Pages: your repository becomes the website (repo must be public on the free plan).
   - `docs/03-deployment-cloudflare.md` — Cloudflare Pages: drag-and-drop, repo can stay private.
2. At the end you have a permanent address like `https://USERNAME.github.io/shipcrew-payroll/` (GitHub) or `https://shipcrew-payroll-test.pages.dev` (Cloudflare).
3. Do this once for the **test** website with the test Firebase project; repeat later for production. Keep them separate.

## Step 2 — Route A: install the app on an Android phone (2 minutes per phone)

1. Open **Chrome** on the Android phone and go to your site address.
2. Sign in once (or at least let the page load fully while online) — this saves the app for offline use.
3. Tap the **⋮ menu** (three dots, top-right).
4. Tap **"Add to Home screen"** (or **"Install app"** — wording varies slightly by phone).
5. Confirm the name (e.g. `ShipCrew`) and tap **Install / Add**.
6. An anchor icon appears on the home screen. Opening it starts the app **full-screen, with no browser bar** — it looks and behaves like a normal app.
7. Test offline mode: put the phone in airplane mode, open the app — it still starts, and clock-ins are saved on the device and upload later automatically.

The crew just needs the address and these steps — no files, no settings, no "unknown sources" warnings.

## Step 3 — Route B: make a real APK with PWABuilder (optional)

PWABuilder (Microsoft's free tool, no install needed) wraps the published app into an Android package.

1. Go to <https://www.pwabuilder.com> in Chrome.
2. Paste your site address (e.g. `https://shipcrew-payroll.pages.dev`) and click **Start** (or **Analyze**).
3. The analysis should show strong scores — this app already has everything PWAs need (manifest, icons, offline service worker).
4. Click **Package for stores** → **Android**.
5. Options (defaults are fine, but note these):
   - **Package ID:** something you own, e.g. `na.atlanticharvest.shipcrew` (no spaces; keep it stable forever).
   - **App name:** `ShipCrew Payroll`.
   - **Signing key:** PWABuilder creates one for you. **Download it and keep it safe** (a password manager or a printed copy in a drawer). If the key is lost, updates to the same app identity become complicated.
6. Click **Download package** — a ZIP arrives containing an `app-release-signed.apk`, an `.aab` (Play Store format) and an `assetlinks.json` file.
7. **Install the APK on a phone:**
   - Copy the APK to the phone (download it there directly, or send it to yourself via email/WhatsApp).
   - Tap it. Android warns "unknown apps" — tap **Settings → allow from this source** (normal for any APK outside the Play Store), then **Install**.
8. **The browser-bar removal (recommended, 5 minutes):** PWABuilder's ZIP includes `assetlinks.json`. Putting it on your website tells Android "this app really belongs to this site", so the APK opens with **no address bar at all**:
   - On your computer, create a folder named `.well-known` inside the project folder.
   - Put `assetlinks.json` inside it.
   - Publish it with the next deployment — GitHub Pages: upload it into the repository so it sits at the top level as `.well-known/assetlinks.json` (docs/09 Step 7); Cloudflare Pages: drag the folder with the next upload (docs/03).
   - Check: open `https://YOUR-SITE/.well-known/assetlinks.json` in a browser — it must show the JSON, not a 404.
9. **Play Store (optional, later):** the `.aab` file is what Google Play accepts (a one-time US$25 developer account). Only worth it if you want crew to install from the store.

## Keeping both routes up to date

- **Route A:** always current — when you deploy new files, the app updates itself on next open (it even asks "Update & reload").
- **Route B:** the APK's *code* is frozen at build time — after a significant update, repeat Step 3 (5 minutes) and reinstall. The *data* never freezes: all devices keep syncing through Firebase either way.

## Common problems

| Problem | Meaning / fix |
|---|---|
| "Add to Home screen" missing on the phone menu | The site must be `https://` and opened in Chrome. Use the address, not an old bookmark with a lock sign. |
| PWABuilder scores "installability: low" | It analysed the wrong URL or an old deployment — redeploy (docs/03 or docs/09) and analyse the exact final address. |
| APK installed but shows a small browser bar | Expected until `assetlinks.json` is live (Step 3.8). |
| Play Protect blocks the APK | Normal for non-store APKs. Tap **More details → Install anyway** on your own device. |
| APK app cannot sign in offline at sea | First-ever sign-in needs internet once; after that the app works offline. Install and sign in **before** the vessel sails. |
| Icon shows white edges on some phones | We ship maskable icons already (`icon-maskable-*.png`) — if you ever change the icon, keep the maskable versions. |

---

*Advanced alternative for developers: the project brief lists Capacitor packaging as a Phase 6 option (a locally-built APK from the source code). PWABuilder above is the no-code way to the same result and is what we recommend for your team.*
