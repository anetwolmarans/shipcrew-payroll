/**
 * roadmap.screen.js — Shows the six development phases and their status,
 * so everyone knows exactly what is built, what is next, and which
 * acceptance tests each phase unlocks.
 */
import { renderAdminShell } from './layout.js';
import { icon, esc } from '../../core/ui.js';

const PHASES = [
  {
    n: 1, title: 'Foundation', status: 'done',
    items: [
      'Project structure, responsive PWA, installable on Android and Windows',
      'Local database (IndexedDB) with 28 record stores — survives restarts',
      'Service worker: the whole app shell works offline after first load',
      'Sign-in screen with demo mode and Firebase mode',
      'Six roles established (permissions matrix + server security rules)',
      'Sessions, automatic locking, audit trail, sync queue foundation',
      'Beginner guides: README, Firebase setup, database design, deployment, testing, backup'
    ],
    tests: 'Groundwork for acceptance tests 5–6, 9–10, 17'
  },
  {
    n: 2, title: 'Crew & Operations', status: 'done',
    items: [
      'Crew register: full employee records, banking details (secured separately)',
      'Vessel register: names, registration, call signs, managers, crew lists',
      'Trip register: the 8 trip statuses with permanent status history',
      'Crew assignments to vessels and trips (historical assignments preserved)',
      'Crew CLOCK IN / CLOCK OUT with duplicate prevention and trip validation',
      'In-app user management (create logins, reset passwords, assign roles)',
      'Attendance view: raw clockings with totals (categories arrive in Phase 4)'
    ],
    tests: 'Acceptance tests 1–4, 7–8 (clocking), 12'
  },
  {
    n: 3, title: 'Offline & Synchronisation', status: 'next',
    items: [
      'Offline device activation and device-bound sign-in with quick PIN',
      'Device registry with administrator revocation',
      'Automatic sync with duplicate prevention and safe conflict handling',
      'Full sync-status visibility per record (saved / waiting / synced / failed)'
    ],
    tests: 'Acceptance tests 7–11 (offline clocking, no duplicates after repeated sync)'
  },
  {
    n: 4, title: 'Working Hours & Catch', status: 'planned',
    items: [
      'Automatic hour categories: ordinary, overtime, night work, Sunday, public holiday',
      'Breaks and rest periods; shifts crossing midnight; totals per day/trip/period',
      'Supervisor corrections with preserved originals and approval history',
      'Catch register per trip (species, weights, landing documentation)',
      'Quota allocations: equal, percentage, fixed weight, rank-based, contractual, custom'
    ],
    tests: 'Feeds acceptance tests 12–13'
  },
  {
    n: 5, title: 'Payroll', status: 'planned',
    items: [
      'Contract management: hourly rate or fixed basic salary, effective-dated and audited',
      'Commissions (catch & quota), bonuses, allowances, advances, deductions',
      'PAYE and SSC — ONLY after legal verification, from the locked statutory rule store',
      'Per-trip payroll that respects statutory pay periods; approval and locking',
      'PDF payslips; corrections via adjustment entries, never silent edits'
    ],
    tests: 'Acceptance tests 13–15 (verified rules, approved payroll locked)'
  },
  {
    n: 6, title: 'Reporting & Deployment', status: 'planned',
    items: [
      'Management reports: crew, vessels, trips, attendance, overtime, catch, payroll cost per vessel/trip, tax, SSC, audit',
      'Exports: PDF, Excel, CSV with filters',
      'Android packaging via Capacitor (optional; the PWA already installs)',
      'Production security review and go-live checklist'
    ],
    tests: 'Acceptance test 16 and full production sign-off'
  }
];

export function render(root, ctx) {
  const body = `
    <div class="banner banner-success">${icon('check-circle', 18)}<div><b>Phases 1 and 2 are complete and tested.</b> Phase 2 delivered the crew register, vessels, trips, assignments, crew clocking and in-app user management. Run sections H–M of <span class="mono">docs/04-testing-guide.md</span> to verify it yourself.</div></div>
    <div style="height:1rem"></div>
    ${PHASES.map((p) => `
    <div class="card">
      <div class="card-title">
        ${icon(p.status === 'done' ? 'check-circle' : p.status === 'next' ? 'clock' : 'calendar', 18)}
        Phase ${p.n} — ${esc(p.title)}
        <span class="badge ${p.status === 'done' ? 'badge-success' : p.status === 'next' ? 'badge-teal' : 'badge-neutral'}" style="margin-left:auto">
          ${p.status === 'done' ? (p.n === 2 ? 'Complete (this build)' : 'Complete') : p.status === 'next' ? 'Next up' : 'Planned'}
        </span>
      </div>
      <ul style="margin:0 0 .6rem">${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <p class="text-xs text-muted" style="margin:0"><b>Unlocks:</b> ${esc(p.tests)}</p>
    </div>`).join('')}
    <div class="card card-navy">
      <div class="card-title" style="color:#fff">${icon('flag', 18)} The golden rule</div>
      <p style="margin:0">Each phase is built and tested before the next one starts. Nothing is skipped, no fake buttons, no invented legal rates — a payroll system earns trust one verified step at a time.</p>
    </div>`;
  renderAdminShell(root, ctx, { title: 'Roadmap', navKey: 'roadmap', body });
}
