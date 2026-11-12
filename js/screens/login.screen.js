/**
 * login.screen.js — The sign-in screen.
 * Works in demo mode (device accounts) and live mode (Firebase).
 * In demo mode it lists the demo accounts so a beginner can try each role.
 */
import { login, sendPasswordReset } from '../core/auth.service.js';
import { getOrCreateDeviceRecord } from '../core/device.service.js';
import { isFirebaseConfigured, environmentName } from '../firebase-config.js';
import { DEMO_ACCOUNTS, APP } from '../config.js';
import { homeFor } from '../core/router.js';
import { icon, esc, toast, openModal } from '../core/ui.js';

export function render(root, ctx) {
  const demo = !isFirebaseConfigured();
  root.innerHTML = `
  <div class="login-wrap">
    <aside class="login-brand">
      <div>
        <div class="brand-row">
          <div class="mark">${icon('anchor', 26)}</div>
          <div>
            <div class="brand-tag">Namibia · Fishing Fleet</div>
            <h1>ShipCrew Payroll</h1>
          </div>
        </div>
        <div style="height:2.2rem"></div>
        <ul class="points">
          <li>${icon('wifi-off', 20)}<div>
            <div class="pt-title">Works at sea, without internet</div>
            <div class="pt-desc">Clockings and records are saved on the device and sync automatically when you are back online.</div>
          </div></li>
          <li>${icon('ship', 20)}<div>
            <div class="pt-title">Built for fishing crews</div>
            <div class="pt-desc">Vessels, trips, catch, quota commission, working hours and payslips — per crew contract.</div>
          </div></li>
          <li>${icon('shield-check', 20)}<div>
            <div class="pt-title">Secure and role-based</div>
            <div class="pt-desc">Crew see only their own information. Payroll data is protected on the server, not just hidden on screen.</div>
          </div></li>
        </ul>
      </div>
      <div class="brand-foot">
        ${esc(APP.name)} · Version ${APP.version} · Development Phase ${APP.buildPhase} of ${APP.totalPhases}<br>
        Records are stored in UTC and displayed in Namibian time.
      </div>
    </aside>

    <main class="login-panel">
      <div class="login-card">
        <div class="login-mobile-head">
          <div class="mark">${icon('anchor', 30)}</div>
          <h1>ShipCrew Payroll</h1>
          <p class="text-muted text-small" style="margin:0">Fishing fleet payroll — Namibia</p>
        </div>

        ${demo
          ? `<div class="banner banner-demo">${icon('alert', 18)}<div><b>Demo mode.</b> No Firebase project is connected yet, so data stays on this device with demo accounts. Never enter real employee data. <b>How to connect: docs/01-firebase-setup.md</b></div></div>`
          : `<div class="banner banner-info">${icon('info', 18)}<div><b>${esc(environmentName())} environment.</b> Sign in with the account your administrator created for you.</div></div>`}

        <div id="revoked-banner" style="display:none"></div>

        <form id="login-form" novalidate style="margin-top:1rem">
          <div class="field">
            <label class="field-label" for="login-email">Email address <span class="req">*</span></label>
            <input class="input" id="login-email" type="email" autocomplete="username" placeholder="name@company.example" required>
          </div>
          <div class="field">
            <label class="field-label" for="login-password">Password <span class="req">*</span></label>
            <div class="input-wrap">
              <input class="input" id="login-password" type="password" autocomplete="current-password" placeholder="Your password" required>
              <button class="eye-btn" type="button" id="toggle-password" aria-label="Show or hide password">${icon('eye', 18)}</button>
            </div>
          </div>
          <div id="login-error" class="banner banner-danger" role="alert" style="display:none"></div>
          <button class="btn btn-primary btn-block btn-lg" id="login-submit" type="submit" style="margin-top:.6rem">
            ${icon('logout', 20)} Sign in
          </button>
          <div class="row-between" style="margin-top:.9rem">
            <button type="button" class="btn btn-ghost btn-sm" id="forgot-link">Forgot password?</button>
            <span class="text-xs text-muted">v${APP.version}</span>
          </div>
        </form>

        ${demo ? `
        <div class="card demo-panel" style="box-shadow:none;background:var(--surface-2)">
          <div class="card-title" style="font-size:.9rem">${icon('users', 18)} Demo accounts — click one to fill the form</div>
          <div class="demo-list">
            ${DEMO_ACCOUNTS.map(a => `
              <button type="button" class="demo-btn" data-email="${esc(a.email)}" data-password="${esc(a.password)}">
                ${icon('user', 16)} <span>${esc(a.label)}</span>
                <span class="demo-mail">${esc(a.email)}</span>
              </button>`).join('')}
          </div>
          <p class="text-xs text-muted" style="margin:.7rem 0 0">Passwords: <span class="mono">${DEMO_ACCOUNTS.map(a => esc(a.password)).join(' / ')}</span><br>
          Demo data can be reset anytime in Settings.</p>
        </div>` : ''}

        <footer class="login-footer">
          ${esc(APP.name)} · Phase ${APP.buildPhase} of ${APP.totalPhases} ·
          ${demo ? 'Demo mode' : esc(environmentName())}
        </footer>
      </div>
    </main>
  </div>`;

  const emailInput = root.querySelector('#login-email');
  const passwordInput = root.querySelector('#login-password');
  const errorBox = root.querySelector('#login-error');
  const submitBtn = root.querySelector('#login-submit');

  root.querySelector('#toggle-password').addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    root.querySelector('#toggle-password').innerHTML = icon(show ? 'eye-off' : 'eye', 18);
  });

  root.querySelectorAll('.demo-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      emailInput.value = btn.dataset.email;
      passwordInput.value = btn.dataset.password;
      errorBox.style.display = 'none';
      passwordInput.focus();
    });
  });

  root.querySelector('#forgot-link').addEventListener('click', () => {
    if (!isFirebaseConfigured()) {
      openModal({
        title: 'Forgot password (demo mode)',
        icon: 'info',
        body: `<p style="margin:0">In demo mode use one of the listed demo accounts — passwords are shown on this screen.
        <br><br>When Firebase is connected, "Forgot password" emails a secure reset link to your email address.</p>`
      });
      return;
    }
    openModal({
      title: 'Reset your password',
      icon: 'key',
      body: `
        <div class="field">
          <label class="field-label" for="reset-email">Your email address</label>
          <input class="input" id="reset-email" type="email" value="${esc(emailInput.value)}">
        </div>
        <p class="text-small text-muted" style="margin:0">We will send a password-reset link to this address.</p>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline' },
        {
          label: 'Send reset email', kind: 'btn-primary',
          onClick: async (overlay) => {
            const val = overlay.querySelector('#reset-email').value.trim();
            if (!val) { toast('Enter your email address first.', 'warn'); return true; }
            try {
              await sendPasswordReset(val);
              toast('Reset email sent. Check your inbox (and spam folder).', 'success', 6000);
            } catch (err) {
              toast(err?.message || 'Could not send the email.', 'error', 6000);
            }
          }
        }
      ]
    });
  });

  root.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = `${icon('refresh', 20)} Signing in…`;
    try {
      const session = await login(emailInput.value, passwordInput.value);
      toast(`Welcome, ${session.fullName.split(' ')[0]}!`, 'success');
      ctx.go(homeFor(session));
    } catch (err) {
      errorBox.style.display = 'flex';
      errorBox.innerHTML = `${icon('alert', 18)}<div>${esc(err?.message || 'Sign-in failed. Please try again.')}</div>`;
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${icon('logout', 20)} Sign in`;
      passwordInput.focus();
      passwordInput.select();
    }
  });

  emailInput.focus();

  /* Phase 3 — if this device was revoked, say so loudly before sign-in. */
  (async () => {
    try {
      const device = await getOrCreateDeviceRecord();
      if (device.status === 'revoked') {
        const box = root.querySelector('#revoked-banner');
        if (box) {
          box.style.display = 'block';
          box.innerHTML = `<div class="banner banner-danger" style="margin-top:1rem">${icon('alert', 18)}<div>
            <b>This device has been revoked</b> by an administrator (${esc(device.revokedBy || 'administrator')}${device.revokedAt ? `, ${esc(String(device.revokedAt).slice(0, 10))}` : ''}).
            Sign-in is blocked for everyone except a system administrator, who can reinstate it on the Devices screen.
            Records already saved on this device stay safe and cannot sync until it is reinstated.</div></div>`;
        }
      }
    } catch { /* never block the login screen on this check */ }
  })();
}
