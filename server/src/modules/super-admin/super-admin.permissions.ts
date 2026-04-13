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

export const ALL_SUPER_ADMIN_PERMISSIONS: SuperAdminPermission[] = Object.values(
    SUPER_ADMIN_PERMISSIONS,
);

export const SUPER_ADMIN_ROLE_TEMPLATES = {
    PLATFORM_ADMIN: {
        name: 'Platform Admin',
        permissions: [...ALL_SUPER_ADMIN_PERMISSIONS],
    },
    SUPPORT_ADMIN: {
        name: 'Support Admin',
        permissions: [
            SUPER_ADMIN_PERMISSIONS.ACCESS,
            SUPER_ADMIN_PERMISSIONS.DASHBOARD_READ,
            SUPER_ADMIN_PERMISSIONS.TENANTS_READ,
            SUPER_ADMIN_PERMISSIONS.USERS_MANAGE,
            SUPER_ADMIN_PERMISSIONS.USERS_IMPERSONATE,
            SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_READ,
            SUPER_ADMIN_PERMISSIONS.AUDIT_READ,
        ],
    },
    BILLING_ADMIN: {
        name: 'Billing Admin',
        permissions: [
            SUPER_ADMIN_PERMISSIONS.ACCESS,
            SUPER_ADMIN_PERMISSIONS.DASHBOARD_READ,
            SUPER_ADMIN_PERMISSIONS.TENANTS_READ,
            SUPER_ADMIN_PERMISSIONS.BILLING_MANAGE,
            SUPER_ADMIN_PERMISSIONS.AUDIT_READ,
        ],
    },
} as const;

export function normalizeSuperAdminPermissions(rawPermissions: string[] | null | undefined): SuperAdminPermission[] {
    const normalized = Array.from(
        new Set(
            (rawPermissions || [])
                .map((permission) => String(permission || '').trim())
                .filter((permission): permission is SuperAdminPermission =>
                    ALL_SUPER_ADMIN_PERMISSIONS.includes(permission as SuperAdminPermission),
                ),
        ),
    );

    if (normalized.length > 0 && !normalized.includes(SUPER_ADMIN_PERMISSIONS.ACCESS)) {
        normalized.unshift(SUPER_ADMIN_PERMISSIONS.ACCESS);
    }

    return normalized;
}

export function hasRoleBasedSuperAdminAccess(rawPermissions: string[] | null | undefined) {
    return normalizeSuperAdminPermissions(rawPermissions).includes(SUPER_ADMIN_PERMISSIONS.ACCESS);
}
