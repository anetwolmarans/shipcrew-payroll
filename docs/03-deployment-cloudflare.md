# Guide 3 — Put the App on the Internet (Cloudflare Pages)

**Time needed: about 10 minutes.** Cloudflare Pages hosts the app as a website with HTTPS (the padlock in the address bar) — required for offline installation on phones. The free plan is enough to start.

> **Prefer to stay inside GitHub?** `docs/09-deployment-github-pages.md` does the same job with GitHub Pages — your existing repository becomes the website. Choose Cloudflare over GitHub Pages if you want the repository to stay **private** on the free plan, or if you prefer drag-and-drop uploads. One hosting is enough; you do not need both.

---

## Step 1 — Create your Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and create a free account with your email.

## Step 2 — Deploy the TEST website (drag and drop)

1. Make sure Firebase is connected to the TEST project first (docs/01) and `ACTIVE_ENV` in `js/firebase-config.js` says `'test'`.
2. Go to <https://dash.cloudflare.com> → **Workers & Pages** (left menu) → **Create** → **Pages** tab → **Upload assets** (Direct Upload).
3. Project name: `shipcrew-payroll-test`
4. Click **Create project**, then drag the whole `shipcrew-payroll` folder from your computer into the upload area.
5. Click **Deploy site** and wait about a minute.
6. Your app is live at an address like `https://shipcrew-payroll-test.pages.dev`. Open it on your phone and install it (browser menu → Add to Home screen / Install app).

> Tip: after uploading, the site keeps a copy of your files. To change the site later, open the project → **Create new deployment** → drag the updated folder again. The address never changes.

## Step 3 — Deploy the PRODUCTION website (separate!)

1. In `js/firebase-config.js`: put the PRODUCTION Firebase values into `prod: { ... }` and set `ACTIVE_ENV = 'prod'`.
2. Repeat Step 2 with project name `shipcrew-payroll-prod` and upload the folder again.
3. Production site: `https://shipcrew-payroll-prod.pages.dev` — connected to the production database only.

**The golden rule of environments:** the TEST website always points at the TEST Firebase project, and the PRODUCTION website always points at the PRODUCTION Firebase project. Before each upload, check `ACTIVE_ENV`. They must never be swapped by accident — that is why they are two separate files/folders on your side too: keep a `shipcrew-payroll-test` folder and a `shipcrew-payroll-prod` folder on your computer, each with its own `firebase-config.js`.

## Step 4 — A proper domain name (optional, later)

1. Buy a domain (e.g. `yourcompany.com.na`) from any registrar.
2. In Cloudflare: **Workers & Pages** → your project → **Custom domains** → **Set up a custom domain** → follow the steps.
3. Cloudflare handles the HTTPS certificate automatically.

## Step 5 — Deploying app updates

Whenever you receive a new version of the app:

1. Replace the files in your local folder (keep your `firebase-config.js`!).
2. In the app code, the version is in `js/config.js` (`APP.version` and `SW_VERSION`) — make sure it changed; this tells devices there is an update.
3. Drag the folder to a new deployment (Step 2 / Step 3).
4. Opened apps will detect the update and offer **"Update & reload"** automatically.

## Troubleshooting

| Problem | Fix |
|---|---|
| The site shows the demo banner | The uploaded `firebase-config.js` still has `ACTIVE_ENV = 'demo'`. Fix the file, upload again. |
| Old version keeps showing | Reload the page; the app will offer "Update & reload". If not, clear site data for the address once. |
| Icons missing / weird layout | The upload missed files — re-deploy the complete folder. |
| "Install app" not offered | The app must be opened over HTTPS (pages.dev always is) and you need a modern browser (Chrome/Edge on Windows, Chrome on Android). |
