/**
 * lock.screen.js — Shown when the app locks itself after inactivity
 * (or when a locked session is reopened). Protects shared devices:
 * one crew member cannot use another's open session.
 */
import { unlock, logout, currentSession } from '../core/auth.service.js';
import { homeFor } from '../core/router.js';
import { icon, esc, toast, avatarInitials } from '../core/ui.js';

export function render(root, ctx) {
  const session = currentSession();
  root.innerHTML = `
  <div class="lock-wrap">
    <div class="card lock-card">
      <div class="avatar avatar-lg avatar-navy">${esc(avatarInitials(session?.fullName))}</div>
      <h2 style="margin-bottom:.2rem">${esc(session?.fullName || 'Session locked')}</h2>
      <p class="text-muted text-small" style="margin-bottom:1.1rem">${esc(session?.roleLabel || '')} · ${esc(session?.deviceName || '')}</p>
      <div class="banner banner-info" style="justify-content:center;text-align:center">${icon('lock', 16)}<div>Locked to protect this shared device.</div></div>
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

  root.querySelector('#lock-logout').addEventListener('click', async () => {
    await logout();
    ctx.go('#/login');
  });

  passwordInput.focus();
}
