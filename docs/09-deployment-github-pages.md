# Guide 9 — Put the App on the Internet with GitHub Pages (click by click)

**Time needed: about 10 minutes.**

PLAIN ENGLISH: GitHub Pages is a free feature of GitHub that turns your repository into a real website with HTTPS (the padlock in the address bar). You already keep a safety copy of the app on GitHub (docs/07) — with GitHub Pages that same copy becomes your live website. **One account, one place: backup and website together.**

Yes, it fully replaces Cloudflare Pages for this app. Both are free and both do the same job here. The only real difference:

| | GitHub Pages (docs/09) | Cloudflare Pages (docs/03) |
|---|---|---|
| Where your code lives | Your GitHub repository | Your computer only (drag-and-drop) |
| Website address | `https://USERNAME.github.io/shipcrew-payroll/` | `https://shipcrew-payroll-test.pages.dev` |
| Free plan works with a **private** repo? | **No** — the repo must be **public** (or pay for GitHub Pro) | **Yes** — private repos fine, and you can upload without a repo at all |
| Updates | Upload new files to the repo → website updates itself | Drag the updated folder again |
| Everything in one place | Yes | No (code on GitHub, website on Cloudflare) |

> **About the "public" requirement:** a public repository means anyone can *see the app's code*. That is safe for this app — the code contains no secrets (the Firebase `apiKey` is designed to be public; your data is protected by the Firestore *rules*, not by hiding the code). BUT the iron rules from docs/07 become even more important on a public repo:
> 1. **Never** upload data exports (crew lists, clock-in JSON, payroll files) into the repository.
> 2. **Never** upload anything belonging to the SitePro Clock In system.
> 3. **Never** put a file of passwords, PINs or keys in the repository.
>
> If you prefer your code stay private: keep using Cloudflare Pages (docs/03), or pay for GitHub Pro (about US$4/month, then private repos get Pages too). Both choices are fine.

---

## Step 1 — Make sure the repository is ready

1. You have done docs/07: the repository `shipcrew-payroll` exists on github.com and contains the app files (a file list like `index.html`, `service-worker.js`, `js/…`, `docs/…` — not a folder *inside* the repo; check that `index.html` sits at the top level).
2. This project folder already includes a tiny file named `.nojekyll` (you cannot see it with a dot in some file explorers — that is normal). GitHub needs it to publish the files exactly as they are. If you built the repo before `.nojekyll` existed, upload it once: on the repository page click **Add file → Upload files** and drop the `.nojekyll` file in, then **Commit changes**.

## Step 2 — Switch the repository to public (free plan only)

1. Open your repository on github.com.
2. Click **Settings** (top menu of the repository, not your account settings).
3. Scroll to the very bottom, to the **Danger Zone**.
4. Click **Change repository visibility** → **Change to public**.
5. GitHub asks you to type the repository name to confirm — type it, click the button.

(Done this already, or you have GitHub Pro? Skip this step and leave the repo private.)

## Step 3 — Turn on GitHub Pages

1. Still in **Settings**, click **Pages** in the left menu.
2. Under **Build and deployment**, in the **Source** dropdown choose **Deploy from a branch**.
3. In the **Branch** dropdown choose **main** and the folder **/(root)** (the only choices you normally get).
4. Click **Save**.
5. Wait 1–5 minutes, then reload the Pages page. A green box appears: **"Your site is live at https://USERNAME.github.io/shipcrew-payroll/"**. That long address is your website — open it.

## Step 4 — Check the app works

1. Open `https://USERNAME.github.io/shipcrew-payroll/` in Chrome (computer or phone).
2. The app must load with **no demo banner** — your repository already contains the connected `js/firebase-config.js` (`ACTIVE_ENV = 'test'`, project `shipcrew-payroll-test`). If you still see the demo banner, the uploaded `firebase-config.js` on GitHub still says `'demo'` — fix that file in the repo (docs/07 shows how to edit a file online) and the site updates itself in a minute or two.
3. Sign in with your admin account, add one test crew member, check it appears — this confirms Firebase is reachable from the new address.

## Step 5 — Tell Firebase about the new address (recommended, 2 minutes)

Email/password sign-in already works from the new address. Adding the domain now keeps every future Firebase feature working from it:

1. Go to <https://console.firebase.google.com> → your project **shipcrew-payroll-test**.
2. **Authentication** → **Settings** tab → **Authorized domains**.
3. Click **Add domain** and enter `USERNAME.github.io` (just that — no `https://`, no path).
4. Save. Repeat later on the production Firebase project with the production address.

## Step 6 — Install on phones and make the APK

The website is online — now follow `docs/08-android-apk.md` from its **Step 2** onward, using your new address `https://USERNAME.github.io/shipcrew-payroll/` everywhere it says to paste the site address:

- Route A: Chrome → **Add to Home screen / Install app** (for the crew, recommended).
- Route B: PWABuilder → paste your address → **Package for stores → Android** → download the ZIP with the APK.
- For the APK's `assetlinks.json` (removes the browser bar): create the `.well-known` folder **inside the repository** (Add file → Create new file, name it `.well-known/assetlinks.json`, paste the content), commit, and the file appears at `https://USERNAME.github.io/shipcrew-payroll/.well-known/assetlinks.json`.

## Step 7 — Updating the app later

1. Get a new version of the app (from me, or your backup).
2. On the repository page: **Add file → Upload files**, drag the new files in (replace the old ones — GitHub asks to confirm replacement).
3. **Commit changes**. GitHub Pages republishes automatically in 1–2 minutes.
4. Opened apps detect the update and offer **"Update & reload"**.

Keep your local `js/firebase-config.js` whenever you replace files — it is the only file that holds your project's connection details.

## Step 8 — The production website (later, Phase 6)

Same golden rule as always: **test and production never share a website or a database.**

- Create a second repository named `shipcrew-payroll-prod` (docs/07 steps again).
- Inside it, the `js/firebase-config.js` holds the **production** Firebase values and `ACTIVE_ENV = 'prod'`.
- Turn on GitHub Pages for it (Step 3 above). Result: `https://USERNAME.github.io/shipcrew-payroll-prod/`.
- Add that new address to the *production* Firebase project's Authorized domains (Step 5 above).

## Troubleshooting

| Problem | Meaning / fix |
|---|---|
| "404" when opening the site address | Pages is not on yet (Step 3), or you opened the address before the green "live" box appeared. Wait a few minutes. |
| The site shows the file list instead of the app / page is unstyled | `index.html` is not at the top level of the repo, or `.nojekyll` is missing (Step 1.2). Move files / upload `.nojekyll`. |
| Demo banner on the live site | The repo's `js/firebase-config.js` still has `ACTIVE_ENV = 'demo'` (Step 4.2). |
| "Install app" not offered on the phone | Open the address in Chrome (not an old bookmark) and make sure the address shows the padlock. GitHub Pages always serves HTTPS. |
| Changes do not appear after uploading | The site can take 1–2 minutes; then force-refresh (Ctrl+Shift+R) or the app will offer "Update & reload". |
| Username or repo name is different | The address is always `https://USERNAME.github.io/REPO-NAME/` — use exactly the green-box address from Step 3, no trailing spaces. |

---

*Cloudflare Pages (docs/03) remains a perfectly good alternative — choose it if you want the repository to stay private on the free plan, or if you prefer drag-and-drop deployments without going through GitHub. You do not need both; one hosting is enough.*
