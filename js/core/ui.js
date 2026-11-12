/**
 * ui.js — Shared interface building blocks: icons, toasts, modals, dialogs,
 * file downloads, currency formatting and the sync status chip.
 * Plain SVG icons are drawn inline, so the app needs no internet for icons.
 */
import { state as syncState } from './sync.service.js';
import { fmtTime, relativeTime } from './time.js';
import { APP } from '../config.js';

/* ---------- Inline SVG icon set (24×24, stroke = current colour) ---------- */
const PATHS = {
  'menu': '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
  'x': '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  'check': '<polyline points="4 12.5 9.5 18 20 6.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/>',
  'chevron-right': '<polyline points="9 5 16 12 9 19"/>',
  'chevron-left': '<polyline points="15 5 8 12 15 19"/>',
  'arrow-left': '<line x1="20" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/>',
  'info': '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><line x1="12" y1="7.5" x2="12" y2="7.6"/>',
  'alert': '<path d="M12 3.5 21.5 20H2.5Z"/><line x1="12" y1="9.5" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17.1"/>',
  'search': '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/>',
  'home': '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v10h12V10"/>',
  'user': '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.2 4-5 7.5-5s6.3 1.8 7.5 5"/>',
  'users': '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c1-2.8 3.5-4.3 6.5-4.3s5.5 1.5 6.5 4.3"/><path d="M16 5.6a3.3 3.3 0 0 1 0 6"/><path d="M17.8 15.9c1.7.6 2.9 1.8 3.7 3.6"/>',
  'user-check': '<circle cx="9.5" cy="8.5" r="3.5"/><path d="M3 20c1-2.8 3.5-4.3 6.5-4.3 1.2 0 2.3.25 3.3.75"/><polyline points="15 17.5 17.2 19.5 21.5 15"/>',
  'settings': '<line x1="4" y1="7" x2="11.5" y2="7"/><line x1="16.5" y1="7" x2="20" y2="7"/><circle cx="14" cy="7" r="2.5"/><line x1="4" y1="17" x2="5.5" y2="17"/><line x1="10.5" y1="17" x2="20" y2="17"/><circle cx="8" cy="17" r="2.5"/>',
  'shield': '<path d="M12 3 19 5.8v5.4c0 4.3-2.8 7.3-7 8.8-4.2-1.5-7-4.5-7-8.8V5.8Z"/>',
  'shield-check': '<path d="M12 3 19 5.8v5.4c0 4.3-2.8 7.3-7 8.8-4.2-1.5-7-4.5-7-8.8V5.8Z"/><polyline points="8.8 12 11 14.2 15.4 9.6"/>',
  'activity': '<polyline points="3 12 7 12 10 5 14 19 17 12 21 12"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  'calendar': '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><line x1="3.5" y1="10" x2="20.5" y2="10"/><line x1="8" y1="2.8" x2="8" y2="6.5"/><line x1="16" y1="2.8" x2="16" y2="6.5"/>',
  'file': '<path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z"/><polyline points="13.5 3 13.5 8.5 19 8.5"/>',
  'file-text': '<path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z"/><polyline points="13.5 3 13.5 8.5 19 8.5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
  'download': '<path d="M12 4v11"/><polyline points="7 10.5 12 15.5 17 10.5"/><path d="M4 19.5h16"/>',
  'upload': '<path d="M12 15V4"/><polyline points="7 9 12 4 17 9"/><path d="M4 19.5h16"/>',
  'wifi': '<path d="M2.5 9.5a14 14 0 0 1 19 0"/><path d="M5.5 12.8a9.5 9.5 0 0 1 13 0"/><path d="M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.2" r="0.9" fill="currentColor" stroke="none"/>',
  'wifi-off': '<path d="M2.5 9.5a14 14 0 0 1 19 0"/><path d="M5.5 12.8a9.5 9.5 0 0 1 13 0"/><path d="M8.6 16a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.2" r="0.9" fill="currentColor" stroke="none"/><line x1="3" y1="3" x2="21" y2="21"/>',
  'database': '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  'smartphone': '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><line x1="11" y1="18.5" x2="13" y2="18.5"/>',
  'lock': '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  'eye': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/><line x1="4" y1="4" x2="20" y2="20"/>',
  'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  'refresh': '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  'ship': '<path d="M4 15.5h16l-1.8 4H5.8Z"/><line x1="12" y1="4.5" x2="12" y2="15.5"/><path d="M12 4.5c3 1.8 4.6 3.9 4.9 6.5H12Z"/><path d="M3 20.5c1.5 1 3-1 4.5 0s3-1 4.5 0 3-1 4.5 0 3-1 4.5 0"/>',
  'anchor': '<circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
  'coins': '<circle cx="9" cy="9" r="5"/><circle cx="15" cy="15" r="5"/>',
  'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  'map': '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="20"/>',
  'key': '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.5 12.5 20 3"/><line x1="16" y1="7" x2="19" y2="10"/><line x1="13.5" y1="9.5" x2="16" y2="12"/>',
  'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'edit': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  'trash': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
};

export function icon(name, size = 20) {
  const d = PATHS[name] || PATHS['info'];
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/* ---------- Text safety ---------- */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/* ---------- Toasts ---------- */
export function toast(message, type = 'info', duration = 4200) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    document.body.appendChild(region);
  }
  const iconName = { success: 'check-circle', error: 'x', warn: 'alert', info: 'info' }[type] || 'info';
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(iconName, 18)}<span>${esc(message)}</span>`;
  region.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, duration);
}

/* ---------- Modals ---------- */
export function openModal({ title, body, icon: iconName = 'info', actions = [], danger = false, wide = false }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <span style="color:${danger ? 'var(--danger)' : 'var(--navy-700)'}">${icon(iconName, 20)}</span>
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 18)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) =>
        `<button class="btn ${a.kind || 'btn-outline'}" data-action="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  actions.forEach((a, i) => {
    overlay.querySelector(`[data-action="${i}"]`).addEventListener('click', async () => {
      const keepOpen = a.onClick ? await a.onClick(overlay) : undefined;
      if (keepOpen !== true) close();
    });
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  const first = overlay.querySelector('input, select, textarea, button:not([data-close])');
  if (first) first.focus();
  return close;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    openModal({
      title,
      icon: danger ? 'alert' : 'info',
      danger,
      body: `<p style="margin:0">${message}</p>`,
      actions: [
        { label: 'Cancel', kind: 'btn-outline', onClick: () => { resolve(false); } },
        { label: confirmLabel, kind: danger ? 'btn-danger' : 'btn-primary', onClick: () => { resolve(true); } }
      ]
    });
  });
}

/* ---------- Files & money ---------- */
export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function fmtNAD(amount) {
  return `${APP.currencySymbol} ${(Number(amount) || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function avatarInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export function spinner(size = 22) {
  return `<div class="spinner spinner-dark" style="width:${size}px;height:${size}px" role="progressbar" aria-label="Loading"></div>`;
}

/* ---------- Sync status chip (updated everywhere via [data-sync-chip]) ---------- */
export async function updateSyncChips() {
  const els = document.querySelectorAll('[data-sync-chip]');
  if (!els.length) return;
  const st = await syncState();
  let label, cls = 'sync-chip', iconName = 'wifi';
  if (!st.online) { label = 'Offline — saved on this device'; cls += ' is-offline'; iconName = 'wifi-off'; }
  else if (!st.live) { label = 'Demo mode — data stays on this device'; iconName = 'info'; }
  else if (st.pending > 0) { label = `${st.pending} waiting to sync`; cls += ' is-pending'; iconName = 'refresh'; }
  else { label = st.lastSyncAt ? `Synchronised ${fmtTime(st.lastSyncAt)}` : 'Synchronised'; cls += ' is-online'; }
  els.forEach((el) => {
    el.className = cls;
    el.title = st.lastSyncAt ? `Last successful sync: ${relativeTime(st.lastSyncAt)}` : 'No sync yet';
    el.innerHTML = `${icon(iconName, 14)}<span>${esc(label)}</span>`;
  });
}
