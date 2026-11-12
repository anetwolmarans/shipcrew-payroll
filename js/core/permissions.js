/**
 * permissions.js — The six user roles and what each is allowed to do.
 * PLAIN ENGLISH: this is the single "who may do what" list used by the whole
 * app. Screens hide options the role may not use, and — more importantly —
 * the Firebase security rules (rules/firestore.rules) enforce the SAME rules
 * on the server, so a crew member cannot bypass them by changing anything
 * in the browser.
 */

export const ROLES = [
  { id: 'system_admin',   label: 'System Administrator', color: 'navy',    description: 'Full access: users, roles, settings, devices and every module.' },
  { id: 'payroll_admin',  label: 'Payroll Administrator', color: 'violet', description: 'Runs payroll: contracts, remuneration, payslips, statutory reports.' },
  { id: 'vessel_manager', label: 'Vessel Manager',       color: 'teal',    description: 'Manages vessels, trips, crew assignments, catch and quota records.' },
  { id: 'supervisor',     label: 'Supervisor',           color: 'info',    description: 'Reviews attendance and can request clocking corrections.' },
  { id: 'crew',           label: 'Crew Member',          color: 'neutral', description: 'Own profile, own clocking, own payslips. Nothing else.' },
  { id: 'auditor',        label: 'Read-only Auditor',    color: 'warning', description: 'Sees records and audit trails for checking, changes nothing.' }
];

/** Everything a user could possibly be allowed to do. */
export const CAPABILITIES = {
  VIEW_OWN_PROFILE: 'view_own_profile',
  VIEW_OWN_PAYSLIPS: 'view_own_payslips',
  VIEW_OWN_ATTENDANCE: 'view_own_attendance',
  CLOCK_IN_OUT: 'clock_in_out',
  VIEW_CREW_ALL: 'view_crew_all',
  MANAGE_CREW: 'manage_crew',
  MANAGE_VESSELS: 'manage_vessels',
  MANAGE_TRIPS: 'manage_trips',
  MANAGE_ASSIGNMENTS: 'manage_assignments',
  MANAGE_CATCH_QUOTA: 'manage_catch_quota',
  REVIEW_ATTENDANCE: 'review_attendance',
  CORRECT_ATTENDANCE: 'correct_attendance',
  MANAGE_CONTRACTS: 'manage_contracts',
  MANAGE_REMUNERATION: 'manage_remuneration',
  PROCESS_PAYROLL: 'process_payroll',
  APPROVE_PAYROLL: 'approve_payroll',
  VIEW_PAYROLL_ALL: 'view_payroll_all',
  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',
  VIEW_AUDIT: 'view_audit',
  MANAGE_USERS: 'manage_users',
  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_DEVICES: 'manage_devices',
  VIEW_STATUTORY_RULES: 'view_statutory_rules'
};

const ALL = Object.values(CAPABILITIES);

/** The actual matrix: which role has which capabilities. */
export const ROLE_MATRIX = {
  system_admin: ALL,
  payroll_admin: [
    CAPABILITIES.VIEW_CREW_ALL, CAPABILITIES.MANAGE_CREW,
    CAPABILITIES.MANAGE_CONTRACTS, CAPABILITIES.MANAGE_REMUNERATION,
    CAPABILITIES.PROCESS_PAYROLL, CAPABILITIES.APPROVE_PAYROLL, CAPABILITIES.VIEW_PAYROLL_ALL,
    CAPABILITIES.VIEW_REPORTS, CAPABILITIES.EXPORT_REPORTS, CAPABILITIES.VIEW_STATUTORY_RULES
  ],
  vessel_manager: [
    CAPABILITIES.MANAGE_VESSELS, CAPABILITIES.MANAGE_TRIPS, CAPABILITIES.MANAGE_ASSIGNMENTS,
    CAPABILITIES.MANAGE_CATCH_QUOTA, CAPABILITIES.REVIEW_ATTENDANCE,
    CAPABILITIES.VIEW_CREW_ALL, CAPABILITIES.VIEW_REPORTS, CAPABILITIES.EXPORT_REPORTS,
    CAPABILITIES.VIEW_STATUTORY_RULES
  ],
  supervisor: [
    CAPABILITIES.VIEW_CREW_ALL, CAPABILITIES.REVIEW_ATTENDANCE,
    CAPABILITIES.CORRECT_ATTENDANCE, CAPABILITIES.VIEW_REPORTS
  ],
  crew: [
    CAPABILITIES.VIEW_OWN_PROFILE, CAPABILITIES.CLOCK_IN_OUT,
    CAPABILITIES.VIEW_OWN_PAYSLIPS, CAPABILITIES.VIEW_OWN_ATTENDANCE
  ],
  auditor: [
    CAPABILITIES.VIEW_CREW_ALL, CAPABILITIES.VIEW_PAYROLL_ALL,
    CAPABILITIES.VIEW_REPORTS, CAPABILITIES.EXPORT_REPORTS,
    CAPABILITIES.VIEW_AUDIT, CAPABILITIES.VIEW_STATUTORY_RULES
  ]
};

export function can(roleId, capability) {
  return (ROLE_MATRIX[roleId] || []).includes(capability);
}
export function canAny(roleId, list) {
  return (list || []).some(c => can(roleId, c));
}
export function roleLabel(roleId) {
  return ROLES.find(r => r.id === roleId)?.label || 'Unknown role';
}
export function roleColor(roleId) {
  return ROLES.find(r => r.id === roleId)?.color || 'neutral';
}
export function roleDescription(roleId) {
  return ROLES.find(r => r.id === roleId)?.description || '';
}
