import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { getPaginationParams, paginationSchema } from '../../utils/pagination.js';
import { ProductionService } from './ProductionService.js';

export const productionRoutes = Router();
productionRoutes.use(authenticate);

const ADMIN_BRANCH_PERMISSION = PERMISSIONS.ADMIN_MANAGE_BRANCHES;

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(ADMIN_BRANCH_PERMISSION);
}

async function assertBranchAccessible(req: any, branchId: string): Promise<void> {
    const companyId = req.user!.companyId;
    if (!isBranchAdmin(req) && !req.user!.branchIds.includes(branchId)) {
        throw AppError.forbidden('You do not have access to this branch');
    }

    const branch = await prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: { id: true },
    });
    if (!branch) throw AppError.badRequest('Invalid branch for this company');
}

function applyUserBranchScope(req: any, where: Record<string, any>): Record<string, any> {
    if (!isBranchAdmin(req)) {
        where.branchId = { in: req.user!.branchIds };
    }
    return where;
}

const idParamsSchema = z.object({
    id: z.string().min(1),
});

const orderListQuerySchema = paginationSchema.extend({
    branchId: z.string().optional(),
    bomId: z.string().optional(),
    productId: z.string().optional(),
    status: z.enum(['DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});

const createOrderSchema = z.object({
    branchId: z.string().min(1),
    bomId: z.string().min(1),
    plannedQty: z.coerce.number().positive(),
    plannedUnitCode: z.string().min(1),
    plannedStartDate: z.string().optional(),
    plannedEndDate: z.string().optional(),
    notes: z.string().max(1000).optional(),
});

const consumeSchema = z.object({
    items: z.array(z.object({
        productId: z.string().min(1),
        unitCode: z.string().min(1),
        qtyConsumed: z.coerce.number().positive(),
        batchNo: z.string().max(100).optional(),
        notes: z.string().max(500).optional(),
    })).min(1),
});

const completeSchema = z.object({
    qtyCompleted: z.coerce.number().positive(),
    unitCode: z.string().min(1),
    scrapQty: z.coerce.number().min(0).optional().default(0),
    notes: z.string().max(1000).optional(),
});

async function getOrderBranchOrThrow(companyId: string, id: string) {
    const order = await prisma.productionOrder.findFirst({
        where: { id, companyId },
        select: { id: true, branchId: true },
    });
    if (!order) throw AppError.notFound('Production order');
    return order;
}

// GET /production/orders
productionRoutes.get('/orders', requirePermission(PERMISSIONS.PRODUCTION_VIEW), async (req, res, next) => {
    try {
        const query = orderListQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = applyUserBranchScope(req, { companyId: req.user!.companyId });

        if (query.branchId) {
            await assertBranchAccessible(req, query.branchId);
            where.branchId = query.branchId;
        }
        if (query.bomId) where.bomId = query.bomId;
        if (query.productId) where.productId = query.productId;
        if (query.status) where.status = query.status;
        if (query.search) {
            where.OR = [
                { productionNo: { contains: query.search, mode: 'insensitive' } },
                { product: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
                { product: { is: { itemCode: { contains: query.search, mode: 'insensitive' } } } },
                { bom: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
            ];
        }

        const [rows, total] = await Promise.all([
            prisma.productionOrder.findMany({
                where,
                skip,
                take,
                include: {
                    branch: { select: { id: true, name: true, code: true } },
                    bom: { select: { id: true, name: true, version: true } },
                    product: { select: { id: true, name: true, itemCode: true, kind: true } },
                    _count: { select: { materials: true, consumptions: true, completions: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.productionOrder.count({ where }),
        ]);

        sendPaginated(res, rows, total, page, limit);
    } catch (error) { next(error); }
});

// GET /production/orders/:id
productionRoutes.get('/orders/:id', requirePermission(PERMISSIONS.PRODUCTION_VIEW), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const orderId = String(req.params.id);
        const orderRef = await getOrderBranchOrThrow(req.user!.companyId, orderId);
        await assertBranchAccessible(req, String(orderRef.branchId));
        const order = await ProductionService.getOrderOrThrow(prisma as any, req.user!.companyId, orderId);
        sendSuccess(res, order);
    } catch (error) { next(error); }
});

// POST /production/orders
productionRoutes.post('/orders', requirePermission(PERMISSIONS.PRODUCTION_CREATE), validate({ body: createOrderSchema }), async (req, res, next) => {
    try {
        await assertBranchAccessible(req, req.body.branchId);
        const order = await prisma.$transaction((tx) => ProductionService.createOrder(tx, {
            companyId: req.user!.companyId,
            branchId: req.body.branchId,
            bomId: req.body.bomId,
            plannedQty: Number(req.body.plannedQty),
            plannedUnitCode: req.body.plannedUnitCode,
            plannedStartDate: req.body.plannedStartDate,
            plannedEndDate: req.body.plannedEndDate,
            notes: req.body.notes,
            createdById: req.user!.id,
        }));

        sendSuccess(res, order, undefined, 201);
    } catch (error) { next(error); }
});

// POST /production/orders/:id/start
productionRoutes.post('/orders/:id/start', requirePermission(PERMISSIONS.PRODUCTION_EDIT), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const orderId = String(req.params.id);
        const orderRef = await getOrderBranchOrThrow(req.user!.companyId, orderId);
        await assertBranchAccessible(req, String(orderRef.branchId));
        const order = await prisma.$transaction((tx) => ProductionService.startOrder(tx, {
            companyId: req.user!.companyId,
            orderId,
        }));

        sendSuccess(res, order);
    } catch (error) { next(error); }
});

// POST /production/orders/:id/consume
productionRoutes.post('/orders/:id/consume', requirePermission(PERMISSIONS.PRODUCTION_CONSUME), validate({ params: idParamsSchema, body: consumeSchema }), async (req, res, next) => {
    try {
        const orderId = String(req.params.id);
        const orderRef = await getOrderBranchOrThrow(req.user!.companyId, orderId);
        await assertBranchAccessible(req, String(orderRef.branchId));
        const order = await prisma.$transaction((tx) => ProductionService.consumeMaterials(tx, {
            companyId: req.user!.companyId,
            orderId,
            createdById: req.user!.id,
            items: req.body.items,
        }));

        sendSuccess(res, order);
    } catch (error) { next(error); }
});

// POST /production/orders/:id/complete
productionRoutes.post('/orders/:id/complete', requirePermission(PERMISSIONS.PRODUCTION_COMPLETE), validate({ params: idParamsSchema, body: completeSchema }), async (req, res, next) => {
    try {
        const orderId = String(req.params.id);
        const orderRef = await getOrderBranchOrThrow(req.user!.companyId, orderId);
        await assertBranchAccessible(req, String(orderRef.branchId));
        const order = await prisma.$transaction((tx) => ProductionService.completeOrder(tx, {
            companyId: req.user!.companyId,
            orderId,
            createdById: req.user!.id,
            qtyCompleted: Number(req.body.qtyCompleted),
            unitCode: req.body.unitCode,
            scrapQty: Number(req.body.scrapQty || 0),
            notes: req.body.notes,
        }));

        sendSuccess(res, order);
    } catch (error) { next(error); }
});

// POST /production/orders/:id/cancel
productionRoutes.post('/orders/:id/cancel', requirePermission(PERMISSIONS.PRODUCTION_CANCEL), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const orderId = String(req.params.id);
        const orderRef = await getOrderBranchOrThrow(req.user!.companyId, orderId);
        await assertBranchAccessible(req, String(orderRef.branchId));
        const order = await prisma.$transaction((tx) => ProductionService.cancelOrder(tx, {
            companyId: req.user!.companyId,
            orderId,
        }));

        sendSuccess(res, order);
    } catch (error) { next(error); }
});
