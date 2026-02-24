import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const userRoutes = Router();
userRoutes.use(authenticate);

const createUserSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    phone: z.string().optional(),
    password: z.string().min(6),
    roleId: z.string().min(1),
    branchIds: z.array(z.string()).optional().default([]),
    isActive: z.boolean().optional().default(true),
});

const updateUserSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    password: z.string().min(6).optional(),
    roleId: z.string().optional(),
    branchIds: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
});

const userListQuerySchema = paginationSchema.extend({
    roleId: z.string().optional(),
});

// GET /users
userRoutes.get('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = userListQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = { companyId: req.user!.companyId };
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
            ];
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
                branches: { select: { branch: { select: { id: true, name: true, code: true } } } },
                company: { select: { id: true, name: true, currency: true, logoUrl: true, settings: true } },
            },
        });
        if (!user) throw AppError.notFound('User');
        const { passwordHash, refreshToken, ...safe } = user;
        // Extract setupCompleted from company settings for wizard flow
        const companySettings = (safe.company?.settings && typeof safe.company.settings === 'object' && !Array.isArray(safe.company.settings))
            ? safe.company.settings as Record<string, any>
            : {};
        const companyData = {
            id: safe.company.id,
            name: safe.company.name,
            currency: safe.company.currency,
            logoUrl: safe.company.logoUrl,
            setupCompleted: companySettings.setupCompleted !== false, // default true for existing companies
        };
        sendSuccess(res, { ...safe, company: companyData, branches: safe.branches.map((ub) => ub.branch) });
    } catch (error) { next(error); }
});

// POST /users
userRoutes.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), validate({ body: createUserSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { password, branchIds = [], ...data } = req.body;
        if (data.email) data.email = data.email.toLowerCase().trim();
        const passwordHash = await bcrypt.hash(password, 12);

        const role = await prisma.role.findFirst({
            where: { id: data.roleId, companyId: req.user!.companyId },
            select: { permissions: true },
        });
        if (!role) throw AppError.badRequest('Invalid role selected');

        const companyBranches = await prisma.branch.findMany({
            where: { companyId: req.user!.companyId },
            select: { id: true },
        });
        const companyBranchIds = new Set(companyBranches.map((branch) => branch.id));

        let normalizedBranchIds = Array.from(
            new Set(
                (Array.isArray(branchIds) ? branchIds : [])
                    .filter((branchId): branchId is string => typeof branchId === 'string' && branchId.trim().length > 0)
            )
        );

        // Admin-like roles can be created without manual branch selection; grant all company branches.
        if (normalizedBranchIds.length === 0) {
            const isAdminLikeRole =
                role.permissions.includes(PERMISSIONS.ADMIN_MANAGE_USERS) ||
                role.permissions.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES);
            if (isAdminLikeRole) {
                normalizedBranchIds = companyBranches.map((branch) => branch.id);
            }
        }

        if (normalizedBranchIds.length === 0) {
            throw AppError.badRequest('Select at least one branch for this user');
        }

        const hasInvalidBranch = normalizedBranchIds.some((branchId) => !companyBranchIds.has(branchId));
        if (hasInvalidBranch) {
            throw AppError.badRequest('One or more selected branches are invalid');
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
        }

        // Verify user belongs to company
        const existing = await prisma.user.findFirst({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
        });
        if (!existing) throw AppError.notFound('User');

        await prisma.user.update({
            where: { id: req.params.id as any },
            data: updateData,
        });

        // Update branches if provided
        if (branchIds) {
            await prisma.userBranch.deleteMany({ where: { userId: req.params.id as any } });
            await prisma.userBranch.createMany({
                data: branchIds.map((branchId: string) => ({ userId: req.params.id as any, branchId })),
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

// DELETE /users/:id
userRoutes.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.params.id === req.user!.id) {
            throw AppError.badRequest('Cannot delete your own account');
        }
        await prisma.user.deleteMany({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
        });
        sendSuccess(res, { message: 'User deleted' });
    } catch (error) { next(error); }
});
