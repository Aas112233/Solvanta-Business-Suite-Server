import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma, basePrisma } from '../lib/prisma.js';
import { AppError } from '../utils/AppError.js';
import { tenantStorage } from '../lib/tenantContext.js';
import { ALL_PERMISSIONS, type Permission } from '../config/permissions.js';
import { resolveSuperAdminAccess } from './superAdmin.js';
import {
    type FeatureFlags,
    type TenantMaintenance,
    type TenantStatus,
    getSuperAdminSettings,
    permissionToModule,
    resolveFeatureFlags,
    resolveTenantMaintenance,
    sanitizeTenantStatus,
} from '../modules/super-admin/super-admin.settings.js';
import { syncTenantLimitEnforcement } from '../modules/super-admin/tenant-intelligence.js';
import type { ImpersonationContext } from '../modules/auth/auth.service.js';

export interface AuthUser {
    id: string;
    companyId: string;
    email: string;
    name: string;
    roleId: string;
    permissions: string[];
    superAdminPermissions: string[];
    branchIds: string[];
    isSuperAdmin: boolean;
    moduleAccess: FeatureFlags;
    tenantStatus: TenantStatus;
    maintenance: TenantMaintenance;
    impersonation?: ImpersonationContext;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            activeBranchId?: string;
            userBranchIds?: string[];
        }
    }
}

interface JwtPayload {
    userId: string;
    companyId: string;
    impersonation?: ImpersonationContext;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw AppError.unauthorized('Missing or invalid authorization header');
        }

        const token = authHeader.split(' ')[1];
        let decoded: JwtPayload;
        try {
            decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        } catch (jwtErr) {
            console.error('[Auth Error] JWT Verification failed:', (jwtErr as Error).message);
            throw AppError.unauthorized('Invalid or expired token');
        }

        if (!decoded.userId || !decoded.companyId) {
            console.error('[Auth Error] Token payload missing fields:', decoded);
            throw AppError.unauthorized('Invalid token payload');
        }

        // Use basePrisma to bypass multi-tenant extension during auth handshake
        const user = await basePrisma.user.findUnique({
            where: { id: decoded.userId },
            include: {
                role: true,
                branches: { select: { branchId: true } },
                company: { select: { settings: true } },
            },
        });

        if (!user) {
            console.error('[Auth Error] User not found in DB for ID:', decoded.userId);
            throw AppError.unauthorized('User not found');
        }

        if (!user.isActive) {
            console.error('[Auth Error] User is inactive:', user.email);
            throw AppError.unauthorized('User account is inactive');
        }

        // Use string conversion to reliably compare IDs (handles MongoDB ObjectIds vs Token Strings)
        const userCoId = String(user.companyId);
        const tokenCoId = String(decoded.companyId);

        if (userCoId !== tokenCoId) {
            console.error('[Auth Error] Company mismatch!', {
                userEmail: user.email,
                userCoId,
                tokenCoId
            });
            throw AppError.unauthorized('Access denied: Company context mismatch');
        }

        if (!user.role) {
            console.error('[Auth Error] User has no role assigned:', user.email);
            throw AppError.unauthorized('Access denied: No role assigned');
        }

        const rolePermissions = user.role.permissions || [];
        const superAdminAccess = resolveSuperAdminAccess({
            email: user.email,
            rolePermissions,
        });
        const isSuperAdmin = superAdminAccess.isSuperAdmin;
        const impersonation = decoded.impersonation;
        let companySettings = user.company?.settings;
        const initialSuperAdminSettings = getSuperAdminSettings(companySettings);
        if (!isSuperAdmin && !impersonation) {
            const limits = initialSuperAdminSettings.limits;
            if (limits && (limits.maxUsers !== undefined || limits.maxBranches !== undefined || limits.maxProducts !== undefined)) {
                const synced = await syncTenantLimitEnforcement(user.companyId, {
                    actorUserId: user.id,
                    actorEmail: user.email,
                    companySettings,
                    request: req,
                });
                companySettings = synced.companySettings;
            }
        }

        const superAdminSettings = getSuperAdminSettings(companySettings);
        const moduleAccess = resolveFeatureFlags(superAdminSettings.featureFlags);
        const tenantStatus = sanitizeTenantStatus(superAdminSettings.status) ?? 'Active';
        const maintenance = resolveTenantMaintenance(superAdminSettings.maintenance);
        const assignedBranchIds = user.branches.map((b) => b.branchId);

        if (!isSuperAdmin && !impersonation && tenantStatus === 'Suspended') {
            throw AppError.forbidden(superAdminSettings.statusReason || 'Tenant access is suspended by super admin');
        }

        if (!isSuperAdmin && !impersonation && maintenance.enabled) {
            throw AppError.forbidden(maintenance.message || 'Tenant access is temporarily disabled for maintenance');
        }

        const superAdminBranchIds = isSuperAdmin
            ? (await basePrisma.branch.findMany({
                where: { companyId: user.companyId },
                select: { id: true },
            })).map((branch) => branch.id)
            : [];

        const effectiveBranchIds = isSuperAdmin
            ? (superAdminBranchIds.length > 0 ? superAdminBranchIds : assignedBranchIds)
            : assignedBranchIds;

        req.user = {
            id: user.id,
            companyId: userCoId,
            email: user.email,
            name: user.name,
            roleId: user.roleId,
            permissions: isSuperAdmin ? [...ALL_PERMISSIONS] : rolePermissions,
            superAdminPermissions: superAdminAccess.superAdminPermissions,
            branchIds: effectiveBranchIds,
            isSuperAdmin: impersonation ? false : isSuperAdmin,
            moduleAccess,
            tenantStatus,
            maintenance,
            impersonation,
        };

        // Global branch context is always resolved from the user's assigned branches.
        req.activeBranchId = req.user.branchIds[0];

        // Setup Tenant Context for the rest of the request
        tenantStorage.run({
            companyId: userCoId,
            userId: user.id,
            activeBranchId: req.activeBranchId,
            impersonation: impersonation
                ? {
                    sessionId: impersonation.sessionId,
                    actorUserId: impersonation.actorUserId,
                    actorEmail: impersonation.actorEmail,
                    actorName: impersonation.actorName,
                    reason: impersonation.reason,
                    startedAt: impersonation.startedAt,
                }
                : undefined,
        }, () => {
            next();
        });
    } catch (error) {
        if (error instanceof AppError) {
            next(error);
        } else {
            console.error('[Auth Internal Error]:', error);
            next(error);
        }
    }
}

export function requirePermission(...permissions: Permission[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            next(AppError.unauthorized());
            return;
        }

        if (req.user.isSuperAdmin) {
            next();
            return;
        }

        if (!req.user.isSuperAdmin) {
            const blocked = permissions
                .map((permission) => permissionToModule(permission))
                .filter((module): module is keyof FeatureFlags => Boolean(module))
                .filter((module) => req.user && req.user.moduleAccess[module] === false);

            if (blocked.length > 0) {
                const uniqueBlocked = Array.from(new Set(blocked));
                next(AppError.forbidden(`Module disabled by super admin: ${uniqueBlocked.join(', ')}`));
                return;
            }
        }

        const userPerms = req.user.permissions;
        if (userPerms.includes('*')) {
            next();
            return;
        }
        const hasAll = permissions.every((p) => {
            if (userPerms.includes(p)) return true;
            // Check for master permission (module.access)
            const module = p.split('.')[0];
            if (userPerms.includes(`${module}.access`)) return true;
            return false;
        });

        if (!hasAll) {
            console.error(`[Auth Debug] 403 Forbidden. User: ${req.user.email}, Role: ${req.user.roleId}`);
            console.error(`[Auth Debug] Required Permissions: ${permissions.join(', ')}`);
            console.error(`[Auth Debug] User Permissions: ${userPerms.slice(0, 10).join(', ')}... (Total: ${userPerms.length})`);
            next(AppError.forbidden(`Missing permissions: ${permissions.join(', ')}`));
            return;
        }

        next();
    };
}

export function requireAnyPermission(...permissions: Permission[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            next(AppError.unauthorized());
            return;
        }

        if (req.user.isSuperAdmin) {
            next();
            return;
        }

        let effectivePermissions = permissions;

        if (!req.user.isSuperAdmin) {
            effectivePermissions = permissions.filter((permission) => {
                const module = permissionToModule(permission);
                if (!module) return true;
                return req.user?.moduleAccess[module] !== false;
            });

            if (effectivePermissions.length === 0) {
                next(AppError.forbidden('Module disabled by super admin'));
                return;
            }
        }

        const userPerms = req.user.permissions;
        if (userPerms.includes('*')) {
            next();
            return;
        }
        const hasAny = effectivePermissions.some((p) => {
            if (userPerms.includes(p)) return true;
            // Check for master permission (module.access)
            const module = p.split('.')[0];
            if (userPerms.includes(`${module}.access`)) return true;
            return false;
        });

        if (!hasAny) {
            next(AppError.forbidden(`Missing any of permissions: ${permissions.join(', ')}`));
            return;
        }

        next();
    };
}

export function requireBranch(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
        next(AppError.unauthorized());
        return;
    }

    // Always populate all assigned branch IDs for list endpoints
    req.userBranchIds = req.user.branchIds;

    // Auto-default activeBranchId to first assigned branch
    if (!req.activeBranchId) {
        if (req.user.branchIds.length > 0) {
            req.activeBranchId = req.user.branchIds[0];
        } else {
            next(AppError.badRequest('No branch assigned to your account'));
            return;
        }
    }

    next();
}
