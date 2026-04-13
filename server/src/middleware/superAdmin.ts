import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import {
    ALL_SUPER_ADMIN_PERMISSIONS,
    normalizeSuperAdminPermissions,
    type SuperAdminPermission,
} from '../modules/super-admin/super-admin.permissions.js';

export function parseSuperAdminEmails() {
    const allEmails = [env.SUPER_ADMIN_EMAILS, env.SUPER_ADMIN_EMAIL]
        .filter(Boolean)
        .join(',');

    return allEmails
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
        .filter((email, index, arr) => arr.indexOf(email) === index);
}

export function isEmailSuperAdmin(email?: string) {
    if (!email) return false;
    return parseSuperAdminEmails().includes(email.trim().toLowerCase());
}

export function resolveSuperAdminAccess(params: {
    email?: string;
    rolePermissions?: string[] | null;
}) {
    const rolePermissions = normalizeSuperAdminPermissions(params.rolePermissions);
    if (rolePermissions.length > 0) {
        return {
            isSuperAdmin: true,
            superAdminPermissions: rolePermissions,
            source: 'role' as const,
        };
    }

    if (isEmailSuperAdmin(params.email)) {
        return {
            isSuperAdmin: true,
            superAdminPermissions: [...ALL_SUPER_ADMIN_PERMISSIONS],
            source: 'env' as const,
        };
    }

    return {
        isSuperAdmin: false,
        superAdminPermissions: [] as SuperAdminPermission[],
        source: null,
    };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
        next(AppError.unauthorized());
        return;
    }

    if (!req.user.isSuperAdmin) {
        next(AppError.forbidden('Super admin access required'));
        return;
    }

    next();
}

export function requireSuperAdminPermission(...permissions: SuperAdminPermission[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) {
            next(AppError.unauthorized());
            return;
        }

        if (!req.user.isSuperAdmin) {
            next(AppError.forbidden('Super admin access required'));
            return;
        }

        if (permissions.length === 0) {
            next();
            return;
        }

        const missing = permissions.filter(
            (permission) => !req.user?.superAdminPermissions.includes(permission),
        );

        if (missing.length > 0) {
            next(AppError.forbidden(`Missing super admin permissions: ${missing.join(', ')}`));
            return;
        }

        next();
    };
}
