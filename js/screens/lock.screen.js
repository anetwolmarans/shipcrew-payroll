/**
 * lock.screen.js — Shown when the app locks itself after inactivity (or when
 * a locked session is reopened, or after "Lock now"). Protects shared
 * devices: one crew member cannot use another's open session.
 *
 * Phase 3 — TWO ways to unlock:
 *  1. Password (always available; in live mode it re-checks with Firebase).
 *  2. Device PIN (4–8 digits) — the quick offline way at sea. Offered when
 *     this device has an activated PIN and either the app is in demo mode
 *     or there is no internet right now. The PIN belongs to this device
 *     only and has its own wrong-attempt guard.
 */
import { unlock, unlockWithPin, logout, currentSession } from '../core/auth.service.js';
import { pinEnabled, pinCooldownSecondsLeft } from '../core/device.service.js';
import { isFirebaseConfigured } from '../firebase-config.js';
import { homeFor } from '../core/router.js';
import { icon, esc, toast, avatarInitials } from '../core/ui.js';

export async function render(root, ctx) {
  const session = currentSession();
  const pinAvailable = await pinEnabled();
  const offline = !navigator.onLine;
  // Live mode unlocks online use the password (server re-check). The PIN is
  // the OFFLINE tool — exactly what the roadmap promised for use at sea.
  const showPin = pinAvailable && (!isFirebaseConfigured() || offline);
  const cooldown = await pinCooldownSecondsLeft();

  root.innerHTML = `
  <div class="lock-wrap">
    <div class="card lock-card">
      <div class="avatar avatar-lg avatar-navy">${esc(avatarInitials(session?.fullName))}</div>
      <h2 style="margin-bottom:.2rem">${esc(session?.fullName || 'Session locked')}</h2>
      <p class="text-muted text-small" style="margin-bottom:1.1rem">${esc(session?.roleLabel || '')} · ${esc(session?.deviceName || '')}</p>
      <div class="banner banner-info" style="justify-content:center;text-align:center">${icon('lock', 16)}<div>Locked to protect this shared device.</div></div>
      ${offline && isFirebaseConfigured() ? `
      <div class="banner banner-warn" style="justify-content:center;text-align:center;margin-top:.6rem">${icon('wifi-off', 16)}<div>You are offline — unlock with your device PIN below.</div></div>` : ''}
      <form id="unlock-form" novalidate style="margin-top:1.1rem;text-align:left">
        <div class="field">
          <label class="field-label" for="unlock-password">Password</label>
          <div class="input-wrap">
            <input class="input" id="unlock-password" type="password" autocomplete="current-password" placeholder="Your password" required autofocus>
          </div>
        </div>
        <div id="unlock-error" class="banner banner-danger" role="alert" style="display:none"></div>
        <button class="btn btn-primary btn-block btn-lg" id="unlock-btn" type="submit">${icon('check', 20)} Unlock</button>
      </form>

      ${showPin ? `
      <div class="row" style="align-items:center;margin:.9rem 0 .3rem">
        <span style="flex:1;height:1px;background:var(--border)"></span>
        <span class="text-xs text-muted" style="padding:0 .6rem">or</span>
        <span style="flex:1;height:1px;background:var(--border)"></span>
      </div>
      <form id="pin-form" novalidate style="text-align:left">
        <div class="field">
          <label class="field-label" for="unlock-pin">${icon('smartphone', 14)} Device PIN <span class="text-xs text-muted">(belongs to this device)</span></label>
          <div class="input-wrap">
            <input class="input" id="unlock-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8"
                   placeholder="••••" autocomplete="off" ${cooldown > 0 ? 'disabled' : ''}>
          </div>
        </div>
        <div id="pin-error" class="banner banner-danger" role="alert" style="display:none"></div>
        <button class="btn btn-outline btn-block" id="pin-btn" type="submit" ${cooldown > 0 ? 'disabled' : ''}>${icon('key', 18)} Unlock with device PIN</button>
        ${cooldown > 0 ? `<p class="text-xs text-muted" style="margin:.5rem 0 0;text-align:center">PIN locked for ${cooldown} more second${cooldown === 1 ? '' : 's'} — use your password meanwhile.</p>` : ''}
      </form>` : ''}

      <button class="btn btn-ghost btn-block" id="lock-logout" style="margin-top:.6rem">${icon('logout', 18)} Sign out instead</button>
    </div>
  </div>`;

  const passwordInput = root.querySelector('#unlock-password');
  const errorBox = root.querySelector('#unlock-error');
  const unlockBtn = root.querySelector('#unlock-btn');

  root.querySelector('#unlock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    unlockBtn.disabled = true;
    unlockBtn.innerHTML = `${icon('refresh', 20)} Checking…`;
    try {
      await unlock(passwordInput.value);
      toast('Unlocked. Welcome back.', 'success');
      ctx.go(homeFor(currentSession()));
    } catch (err) {
      errorBox.style.display = 'flex';
      errorBox.innerHTML = `${icon('alert', 18)}<div>${esc(err?.message || 'Unlock failed.')}</div>`;
      unlockBtn.disabled = false;
      unlockBtn.innerHTML = `${icon('check', 20)} Unlock`;
      passwordInput.focus();
      passwordInput.select();
    }
  });

  const pinForm = root.querySelector('#pin-form');
  if (pinForm) {
    const pinInput = root.querySelector('#unlock-pin');
    const pinError = root.querySelector('#pin-error');
    const pinBtn = root.querySelector('#pin-btn');
    pinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      pinError.style.display = 'none';
      pinBtn.disabled = true;
      pinBtn.innerHTML = `${icon('refresh', 18)} Checking…`;
      try {
        await unlockWithPin(pinInput.value);
        toast('Unlocked with the device PIN.', 'success');
        ctx.go(homeFor(currentSession()));
      } catch (err) {
        pinError.style.display = 'flex';
        pinError.innerHTML = `${icon('alert', 18)}<div>${esc(err?.message || 'PIN unlock failed.')}</div>`;
        pinBtn.disabled = false;
        pinBtn.innerHTML = `${icon('key', 18)} Unlock with device PIN`;
        pinInput.value = '';
        pinInput.focus();
      }
    });
  }

  root.querySelector('#lock-logout').addEventListener('click', async () => {
    await logout();
    ctx.go('#/login');
  });

  passwordInput.focus();
}
