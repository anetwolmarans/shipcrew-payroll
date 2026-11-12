/**
 * main.js — The app's starting point.
 * PLAIN ENGLISH boot sequence:
 *   1. Check the app was opened correctly (via the start script or website).
 *   2. Create/open the local database and (first run only) the demo data.
 *   3. Register the service worker so the app works offline next time.
 *   4. Restore a saved session (so reopening keeps you signed in).
 *   5. Start connectivity monitoring, the idle auto-lock and the router.
 */
import { APP, SW_VERSION } from './config.js';
import * as store from './core/store.js';
import * as auth from './core/auth.service.js';
import { initSync } from './core/sync.service.js';
import { start as startRouter } from './core/router.js';
import { on } from './core/events.js';
import { toast, updateSyncChips, openModal, icon, esc } from './core/ui.js';

const splash = document.getElementById('splash');
const splashStatus = document.getElementById('splash-status');
function say(text) { if (splashStatus) splashStatus.textContent = text; }
function hideSplash() {
  if (!splash) return;
  splash.style.transition = 'opacity .3s ease';
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 320);
}

/* ---------- Opened as a file instead of through a server? ---------- */
function showFileProtocolHelp() {
  document.getElementById('app').hidden = false;
  document.getElementById('app').innerHTML = `
    <div style="max-width:620px;margin:48px auto;padding:0 16px">
      <div class="card">
        <div class="card-title">${icon('alert', 20)} Please open the app with the start script</div>
        <p>You opened this file directly from its folder. Browsers block the app's offline features
        (service worker and local database) when a page is opened that way.</p>
        <ol style="line-height:1.9">
          <li>Close this tab.</li>
          <li>Open the project folder (<code>shipcrew-payroll</code>).</li>
          <li>Double-click <code>start-windows.bat</code> (Windows) or <code>start-mac.command</code> (Mac) or run <code>start-linux.sh</code>.</li>
          <li>The app opens by itself at <code>http://localhost:8080</code>.</li>
        </ol>
        <p class="text-small text-muted">Full instructions are in the <b>README.md</b> file in the same folder.</p>
      </div>
    </div>`;
  hideSplash();
}

/* ---------- Service worker (offline shell + update prompt) ---------- */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secureHost = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!secureHost) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js');
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  } catch (err) {
    console.warn('Service worker registration failed:', err);
  }
}
function offerUpdate(worker) {
  if (window.__swUpdateOffered) return;
  window.__swUpdateOffered = true;
  openModal({
    title: 'Update available',
    icon: 'refresh',
    body: '<p style="margin:0">A new version of ShipCrew Payroll has been downloaded. Update now to use it.</p>',
    actions: [
      { label: 'Later', kind: 'btn-outline' },
      {
        label: 'Update & reload', kind: 'btn-primary',
        onClick: () => { window.__swUpdating = true; worker.postMessage({ type: 'SKIP_WAITING' }); }
      }
    ]
  });
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__swUpdating) location.reload();
  });
}

/* ---------- Idle auto-lock (shared-device protection) ---------- */
let lastActivity = Date.now();
['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
  window.addEventListener(evt, () => { lastActivity = Date.now(); }, { passive: true });
});
setInterval(async () => {
  const session = auth.currentSession();
  if (!session || session.locked) return;
  const settings = await store.getSettings();
  const minutes = Number(settings.autoLockMinutes) || 0;
  if (minutes > 0 && Date.now() - lastActivity > minutes * 60000) {
    await auth.lock();
    const { go } = await import('./core/router.js');
    go('#/lock');
    toast('Locked automatically after inactivity.', 'info');
  }
}, 15000);

/* ---------- Boot ---------- */
(async function boot() {
  try {
    if (location.protocol === 'file:') { showFileProtocolHelp(); return; }

    say('Opening local database…');
    await store.ensureSeed();

    say('Preparing offline mode…');
    registerServiceWorker(); // no await: the app works while this settles

    say('Restoring your session…');
    await auth.restoreSession();

    initSync();
    on('sync:status', () => updateSyncChips());
    on('tick', () => updateSyncChips());
    updateSyncChips();

    startRouter();
    hideSplash();
    window.dispatchEvent(new CustomEvent('app:ready'));
  } catch (err) {
    console.error('Boot failed:', err);
    document.getElementById('app').hidden = false;
    document.getElementById('app').innerHTML = `
      <div style="max-width:620px;margin:48px auto;padding:0 16px">
        <div class="card">
          <div class="card-title">${icon('alert', 20)} The app could not start</div>
          <p>${esc(err?.message || 'Unknown error')}</p>
          <p class="text-small text-muted">This is usually caused by browser storage being full or blocked.
          Close other tabs of this app, or clear the site data (see README.md → Troubleshooting), then reload.</p>
          <button class="btn btn-primary" onclick="location.reload()">Reload</button>
        </div>
      </div>`;
    hideSplash();
  }
})();
