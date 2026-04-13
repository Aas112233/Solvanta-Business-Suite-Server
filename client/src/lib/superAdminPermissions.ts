export const SUPER_ADMIN_PERMISSIONS = {
    ACCESS: 'superadmin.access',
    DASHBOARD_READ: 'superadmin.dashboard.read',
    TENANTS_READ: 'superadmin.tenants.read',
    TENANTS_MANAGE: 'superadmin.tenants.manage',
    USERS_MANAGE: 'superadmin.users.manage',
    USERS_IMPERSONATE: 'superadmin.users.impersonate',
    BILLING_MANAGE: 'superadmin.billing.manage',
    LIMITS_MANAGE: 'superadmin.limits.manage',
    MAINTENANCE_MANAGE: 'superadmin.maintenance.manage',
    ANNOUNCEMENTS_READ: 'superadmin.announcements.read',
    ANNOUNCEMENTS_MANAGE: 'superadmin.announcements.manage',
    AUDIT_READ: 'superadmin.audit.read',
} as const;

export type SuperAdminPermission =
    typeof SUPER_ADMIN_PERMISSIONS[keyof typeof SUPER_ADMIN_PERMISSIONS];
