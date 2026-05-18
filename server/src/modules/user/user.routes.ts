import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ALL_PERMISSIONS, PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { resolveSuperAdminAccess } from '../../middleware/superAdmin.js';
import { buildTenantLimitSnapshot, enforceTenantCreateWithinLimit } from '../super-admin/tenant-intelligence.js';
import { getSuperAdminSettings, resolveFeatureFlags, resolveTenantBilling, resolveTenantLimits } from '../super-admin/super-admin.settings.js';
import { loadUserAssignedBranches } from './user-profile.utils.js';
import { resolveCompanyTaxSettings } from '../../utils/companyTax.js';
import { resolveCompanyDocumentSettings, resolveCompanyRegionalSettings } from '../../utils/companySettings.js';

export const userRoutes = Router();
userRoutes.use(authenticate);

const createUserSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    phone: z.string().optional(),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be less than 128 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    roleId: z.string().min(1),
    branchIds: z.array(z.string()).optional().default([]),
    isActive: z.boolean().optional().default(true),
});

const updateUserSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be less than 128 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .optional(),
    roleId: z.string().optional(),
    branchIds: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
});

const userListQuerySchema = paginationSchema.extend({
    roleId: z.string().optional(),
});

const activeUserFilter = {
    OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
    ],
};

function normalizeBranchIds(branchIds: unknown): string[] {
    return Array.from(
        new Set(
            (Array.isArray(branchIds) ? branchIds : [])
                .filter((branchId): branchId is string => typeof branchId === 'string' && branchId.trim().length > 0)
        )
    );
}

function isAdminLikeRole(permissions: string[] = []): boolean {
    return (
        permissions.includes(PERMISSIONS.ADMIN_MANAGE_USERS) ||
        permissions.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES)
    );
}

// GET /users
userRoutes.get('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = userListQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = {
            companyId: req.user!.companyId,
            AND: [activeUserFilter],
        };
        if (query.search) {
            where.AND.push({
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } },
                ],
            });
        }
        if (query.roleId) {
            where.roleId = query.roleId;
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take,
                include: {
                    role: { select: { id: true, name: true } },
                    branches: { select: { branch: { select: { id: true, name: true, code: true } } } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.user.count({ where }),
        ]);

        const sanitized = users.map(({ passwordHash, refreshToken, ...u }) => ({
            ...u,
            branches: u.branches.map((ub) => ub.branch),
        }));

        sendPaginated(res, sanitized, total, page, limit);
    } catch (error) { next(error); }
});

// GET /users/me
userRoutes.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            include: {
                role: { select: { id: true, name: true, permissions: true } },
                company: { select: { id: true, name: true, currency: true, logoUrl: true, settings: true, createdAt: true } },
            },
        });
        if (!user) throw AppError.notFound('User');
        const { passwordHash, refreshToken, ...safe } = user;
        // Extract setupCompleted from company settings for wizard flow
        const companySettings = (safe.company?.settings && typeof safe.company.settings === 'object' && !Array.isArray(safe.company.settings))
            ? safe.company.settings as Record<string, any>
            : {};
        const taxSettings = resolveCompanyTaxSettings(companySettings);
        const regionalSettings = resolveCompanyRegionalSettings(companySettings);
        const documentSettings = resolveCompanyDocumentSettings(companySettings);
        const companyData = {
            id: safe.company.id,
            name: safe.company.name,
            currency: safe.company.currency,
            logoUrl: safe.company.logoUrl,
            setupCompleted: companySettings.setupCompleted !== false, // default true for existing companies
            regionalSettings,
            documentSettings,
            taxSettings,
        };
        const superAdminSettings = getSuperAdminSettings(safe.company.settings);
        const enabledModules = resolveFeatureFlags(superAdminSettings.featureFlags);
        const billing = resolveTenantBilling(superAdminSettings.billing);
        const limits = resolveTenantLimits(superAdminSettings.limits);
        const [userCount, branchCount, productCount] = await Promise.all([
            prisma.user.count({ where: { companyId: req.user!.companyId, ...activeUserFilter } }),
            prisma.branch.count({ where: { companyId: req.user!.companyId } }),
            prisma.product.count({ where: { companyId: req.user!.companyId, deletedAt: { isSet: false } } }),
        ]);
        const limitSnapshot = buildTenantLimitSnapshot(
            {
                users: userCount,
                branches: branchCount,
                products: productCount,
            },
            limits,
        );
        const companyStartDate = safe.company.createdAt.toISOString();
        const trialEndDate = new Date(safe.company.createdAt);
        trialEndDate.setUTCDate(trialEndDate.getUTCDate() + 14);
        const companyEndDate = billing.nextBillingDate || trialEndDate.toISOString();
        const assignedBranches = await loadUserAssignedBranches(safe.id, req.user!.companyId);
        const superAdminAccess = resolveSuperAdminAccess({
            email: safe.email,
            rolePermissions: safe.role?.permissions || [],
        });
        const isImpersonating = Boolean(req.user?.impersonation);
        const isSuperAdmin = !isImpersonating && superAdminAccess.isSuperAdmin;
        const effectiveBranches = isSuperAdmin
            ? await prisma.branch.findMany({
                where: { companyId: req.user!.companyId },
                select: { id: true, name: true, code: true },
                orderBy: { name: 'asc' },
            })
            : assignedBranches;

        sendSuccess(res, {
            ...safe,
            role: safe.role ? {
                ...safe.role,
                permissions: isSuperAdmin ? [...ALL_PERMISSIONS] : safe.role.permissions,
            } : safe.role,
            company: companyData,
            branches: effectiveBranches,
            enabledModules,
            isSuperAdmin,
            superAdminPermissions: isImpersonating ? [] : superAdminAccess.superAdminPermissions,
            profileSummary: {
                companyStartDate,
                companyEndDate,
                companyEndDateLabel: billing.nextBillingDate ? 'Next Billing Date' : 'Trial End Date',
                storageStatus: limitSnapshot.status,
                usage: limitSnapshot.counts,
                limits,
            },
            impersonation: req.user?.impersonation
                ? {
                    isActive: true,
                    actorUserId: req.user.impersonation.actorUserId,
                    actorEmail: req.user.impersonation.actorEmail,
                    actorName: req.user.impersonation.actorName,
                    actorCompanyId: req.user.impersonation.actorCompanyId,
                    reason: req.user.impersonation.reason,
                    startedAt: req.user.impersonation.startedAt,
                    sessionId: req.user.impersonation.sessionId,
                }
                : null,
        });
    } catch (error) { next(error); }
});

// POST /users
userRoutes.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), validate({ body: createUserSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        await enforceTenantCreateWithinLimit(req.user!.companyId, 'users', {
            actorUserId: req.user!.id,
            actorEmail: req.user!.email,
            request: req,
        });

        const { password, branchIds = [], ...data } = req.body;
        if (data.email) data.email = data.email.toLowerCase().trim();
        const passwordHash = await bcrypt.hash(password, 12);

        const role = await prisma.role.findFirst({
            where: { id: data.roleId, companyId: req.user!.companyId },
            select: { permissions: true },
        });
        if (!role) {
            throw AppError.badRequest('Invalid role selected', [
                { field: 'roleId', message: 'Select a valid role' },
            ]);
        }

        const companyBranches = await prisma.branch.findMany({
            where: { companyId: req.user!.companyId },
            select: { id: true },
        });
        const companyBranchIds = new Set(companyBranches.map((branch) => branch.id));

        let normalizedBranchIds = normalizeBranchIds(branchIds);

        // Admin-like roles can be created without manual branch selection; grant all company branches.
        if (normalizedBranchIds.length === 0 && isAdminLikeRole(role.permissions)) {
            normalizedBranchIds = companyBranches.map((branch) => branch.id);
        }

        if (normalizedBranchIds.length === 0) {
            throw AppError.badRequest('Select at least one branch for this user', [
                { field: 'branchIds', message: 'Select at least one branch' },
            ]);
        }

        const hasInvalidBranch = normalizedBranchIds.some((branchId) => !companyBranchIds.has(branchId));
        if (hasInvalidBranch) {
            throw AppError.badRequest('One or more selected branches are invalid', [
                { field: 'branchIds', message: 'One or more selected branches are invalid' },
            ]);
        }

        const user = await prisma.user.create({
            data: {
                ...data,
                passwordHash,
                companyId: req.user!.companyId,
                branches: {
                    create: normalizedBranchIds.map((branchId: string) => ({ branchId })),
                },
            },
            include: {
                role: { select: { id: true, name: true } },
                branches: { select: { branch: { select: { id: true, name: true, code: true } } } },
            },
        });

        const { passwordHash: _, refreshToken, ...safe } = user;
        sendSuccess(res, { ...safe, branches: safe.branches.map((ub) => ub.branch) }, undefined, 201);
    } catch (error) { next(error); }
});

// PATCH /users/:id
userRoutes.patch('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), validate({ body: updateUserSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { password, branchIds, ...data } = req.body;
        const updateData: any = { ...data };
        if (updateData.email) updateData.email = updateData.email.toLowerCase().trim();

        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 12);
            updateData.forcePasswordChange = true; // Force password change after admin reset
        }

        // Verify user belongs to company
        const existing = await prisma.user.findFirst({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
            include: {
                role: {
                    select: { permissions: true },
                },
            },
        });
        if (!existing) throw AppError.notFound('User');

        let rolePermissions = existing.role?.permissions || [];

        // Validate role belongs to same company if changing role
        if (data.roleId) {
            const role = await prisma.role.findFirst({
                where: { id: data.roleId, companyId: req.user!.companyId },
                select: { permissions: true },
            });
            if (!role) {
                throw AppError.badRequest('Invalid role selected: role does not belong to your company', [
                    { field: 'roleId', message: 'Select a valid role' },
                ]);
            }
            rolePermissions = role.permissions;
        }

        let normalizedBranchIds: string[] | undefined;
        if (branchIds !== undefined) {
            const companyBranches = await prisma.branch.findMany({
                where: { companyId: req.user!.companyId },
                select: { id: true },
            });
            const companyBranchIds = new Set(companyBranches.map((branch) => branch.id));

            normalizedBranchIds = normalizeBranchIds(branchIds);

            if (normalizedBranchIds.length === 0 && isAdminLikeRole(rolePermissions)) {
                normalizedBranchIds = companyBranches.map((branch) => branch.id);
            }

            if (normalizedBranchIds.length === 0) {
                throw AppError.badRequest('Select at least one branch for this user', [
                    { field: 'branchIds', message: 'Select at least one branch' },
                ]);
            }

            const hasInvalidBranch = normalizedBranchIds.some((branchId) => !companyBranchIds.has(branchId));
            if (hasInvalidBranch) {
                throw AppError.badRequest('One or more selected branches are invalid', [
                    { field: 'branchIds', message: 'One or more selected branches are invalid' },
                ]);
            }
        }

        await prisma.user.update({
            where: { id: req.params.id as any },
            data: updateData,
        });

        // Update branches if provided
        if (normalizedBranchIds) {
            await prisma.userBranch.deleteMany({ where: { userId: req.params.id as any } });
            await prisma.userBranch.createMany({
                data: normalizedBranchIds.map((branchId: string) => ({ userId: req.params.id as any, branchId })),
            });
        }

        // Fetch fresh data
        const user = await prisma.user.findUnique({
            where: { id: req.params.id as any },
            include: {
                role: { select: { id: true, name: true } },
                branches: { select: { branch: { select: { id: true, name: true, code: true } } } },
            },
        });

        if (!user) throw AppError.notFound('User');

        const { passwordHash, refreshToken, ...safe } = user;
        sendSuccess(res, { ...safe, branches: safe.branches.map((ub) => ub.branch) });
    } catch (error) { next(error); }
});

// DELETE /users/:id - Soft delete to preserve data integrity
userRoutes.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.params.id === req.user!.id) {
            throw AppError.badRequest('Cannot delete your own account');
        }

        // Soft delete: set deletedAt and isActive instead of hard delete
        await prisma.user.updateMany({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
            data: {
                deletedAt: new Date(),
                isActive: false,
                refreshToken: null, // Invalidate any active sessions
            },
        });
        sendSuccess(res, { message: 'User deleted' });
    } catch (error) { next(error); }
});
