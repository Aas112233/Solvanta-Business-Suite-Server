import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { z } from 'zod';
import { enforceTenantCreateWithinLimit } from '../super-admin/tenant-intelligence.js';

export const branchRoutes = Router();
branchRoutes.use(authenticate);

const branchSchema = z.object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(20),
    address: z.string().optional(),
    phone: z.string().optional(),
    isActive: z.boolean().optional(),
}).strict();

const branchPatchSchema = branchSchema.partial().strict().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field is required' }
);

// GET /branches
branchRoutes.get('/', async (req, res, next) => {
    try {
        const includeInactive = typeof req.query.includeInactive === 'string'
            && ['1', 'true', 'yes'].includes(req.query.includeInactive.toLowerCase());

        const branches = await prisma.branch.findMany({
            where: {
                companyId: req.user!.companyId,
                ...(includeInactive ? {} : { isActive: true }),
            },
            orderBy: { name: 'asc' },
        });
        sendSuccess(res, branches);
    } catch (error) { next(error); }
});

// GET /branches/:id
branchRoutes.get('/:id', async (req, res, next) => {
    try {
        const branchId = String(req.params.id);
        const branch = await prisma.branch.findFirst({
            where: { id: branchId, companyId: req.user!.companyId },
        });
        if (!branch) throw AppError.notFound('Branch');
        sendSuccess(res, branch);
    } catch (error) { next(error); }
});

// POST /branches
branchRoutes.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_BRANCHES), validate({ body: branchSchema }), async (req, res, next) => {
    try {
        await enforceTenantCreateWithinLimit(req.user!.companyId, 'branches', {
            actorUserId: req.user!.id,
            actorEmail: req.user!.email,
            request: req,
        });

        const branch = await prisma.branch.create({
            data: { ...req.body, companyId: req.user!.companyId },
        });
        sendSuccess(res, branch, undefined, 201);
    } catch (error) { next(error); }
});

// PATCH /branches/:id
branchRoutes.patch('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_BRANCHES), validate({ body: branchPatchSchema }), async (req, res, next) => {
    try {
        const branchId = String(req.params.id);
        const branch = await prisma.branch.updateMany({
            where: { id: branchId, companyId: req.user!.companyId },
            data: req.body,
        });
        if (branch.count === 0) throw AppError.notFound('Branch');
        const updated = await prisma.branch.findUnique({ where: { id: branchId } });
        sendSuccess(res, updated);
    } catch (error) { next(error); }
});

// DELETE /branches/:id
branchRoutes.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_BRANCHES), async (req, res, next) => {
    try {
        const branchId = String(req.params.id);

        // CHECK FOR STOCK BEFORE DELETING/DEACTIVATING
        const stockCount = await prisma.inventoryStock.count({
            where: { branchId, qtyOnHand: { gt: 0 } }
        });

        if (stockCount > 0) {
            throw AppError.badRequest(`Cannot delete/deactivate warehouse because it still has ${stockCount} items in stock. Please transfer or adjust stock to zero first.`);
        }

        const result = await prisma.branch.updateMany({
            where: { id: branchId, companyId: req.user!.companyId, isActive: true },
            data: { isActive: false },
        });
        if (result.count > 0) {
            sendSuccess(res, { message: 'Branch deactivated' });
            return;
        }

        const existing = await prisma.branch.findFirst({
            where: { id: branchId, companyId: req.user!.companyId },
            select: { id: true, isActive: true },
        });
        if (!existing) throw AppError.notFound('Branch');
        sendSuccess(res, { message: 'Branch already inactive' });
    } catch (error) { next(error); }
});
