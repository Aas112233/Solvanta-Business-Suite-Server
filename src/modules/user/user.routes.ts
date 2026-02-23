import { Router } from 'express';
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
    branchIds: z.array(z.string()).min(1),
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
userRoutes.get('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), async (req, res, next) => {
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
userRoutes.get('/me', async (req, res, next) => {
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
userRoutes.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), validate({ body: createUserSchema }), async (req, res, next) => {
    try {
        const { password, branchIds, ...data } = req.body;
        if (data.email) data.email = data.email.toLowerCase().trim();
        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                ...data,
                passwordHash,
                companyId: req.user!.companyId,
                branches: {
                    create: branchIds.map((branchId: string) => ({ branchId })),
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
userRoutes.patch('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), validate({ body: updateUserSchema }), async (req, res, next) => {
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
userRoutes.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), async (req, res, next) => {
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
