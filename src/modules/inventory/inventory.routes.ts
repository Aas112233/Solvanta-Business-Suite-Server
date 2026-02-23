import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';
import { CoreAccountingService } from '../accounting/CoreAccountingService.js';
import { InventoryService } from './InventoryService.js';


const inventoryRoutes = Router();

inventoryRoutes.use(authenticate);

const ADMIN_BRANCH_PERMISSION = PERMISSIONS.ADMIN_MANAGE_BRANCHES;

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(ADMIN_BRANCH_PERMISSION);
}

async function assertBranchAccessible(req: any, branchId: string): Promise<void> {
    if (!isBranchAdmin(req) && !req.user!.branchIds.includes(branchId)) {
        throw AppError.forbidden('You do not have access to this branch');
    }
    await assertBranchInCompany(req.user!.companyId, branchId);
}

function branchScope(req: any): any {
    if (isBranchAdmin(req)) return {};
    return { branchId: { in: req.user!.branchIds } };
}

const MOVEMENT_TYPES = new Set([
    'PURCHASE_RECEIPT',
    'POS_SALE',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'ADJUSTMENT',
    'DAMAGE',
    'EXPIRED',
    'RETURN',
]);

const ADJUST_INPUT_TYPES = new Set([
    'ADJUSTMENT',
    'DAMAGE',
    'EXPIRED',
    'RETURN',
    'SHRINKAGE',
    'OTHER',
    'OPENING_BALANCE',
]);

type InventoryAdjustmentAccountingType = 'SHRINKAGE' | 'DAMAGE' | 'OTHER' | 'OPENING_BALANCE';

function resolveAdjustmentTypes(inputType: string, qty: number): { movementType: string; accountingType: InventoryAdjustmentAccountingType | null } {
    const normalized = inputType.toUpperCase();
    if (!ADJUST_INPUT_TYPES.has(normalized)) throw AppError.badRequest('Invalid movement type');

    if ((normalized === 'DAMAGE' || normalized === 'EXPIRED' || normalized === 'SHRINKAGE') && qty > 0) {
        throw AppError.badRequest(`${normalized} adjustment must be negative quantity`);
    }
    if (normalized === 'OPENING_BALANCE' && qty < 0) {
        throw AppError.badRequest('OPENING_BALANCE must be positive quantity');
    }

    switch (normalized) {
        case 'SHRINKAGE':
            return { movementType: 'ADJUSTMENT', accountingType: 'SHRINKAGE' };
        case 'OTHER':
            return { movementType: 'ADJUSTMENT', accountingType: 'OTHER' };
        case 'OPENING_BALANCE':
            return { movementType: 'ADJUSTMENT', accountingType: 'OPENING_BALANCE' };
        case 'DAMAGE':
            return { movementType: 'DAMAGE', accountingType: 'DAMAGE' };
        case 'EXPIRED':
            return { movementType: 'EXPIRED', accountingType: 'SHRINKAGE' };
        case 'ADJUSTMENT':
            return { movementType: 'ADJUSTMENT', accountingType: qty < 0 ? 'SHRINKAGE' : 'OTHER' };
        default:
            return { movementType: normalized, accountingType: null };
    }
}

async function assertBranchInCompany(companyId: string, branchId: string) {
    const exists = await prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: { id: true },
    });
    if (!exists) throw AppError.badRequest('Invalid branch for this company');
}

// GET /inventory/stock
// Stock Overview
inventoryRoutes.get('/stock', requirePermission(PERMISSIONS.INVENTORY_VIEW as any), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, branchId, lowStock, productId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        const companyId = req.user!.companyId;
        const where: any = { companyId, ...branchScope(req) };

        if (branchId && typeof branchId === 'string') {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (productId && typeof productId === 'string') where.productId = productId;
        if (typeof lowStock === 'string' && ['1', 'true', 'yes'].includes(lowStock.toLowerCase())) {
            where.qtyOnHand = { lte: 5 };
        }

        // Search logic requires filtering PRODUCTS matching name/code, then finding stock for them.
        if (search && typeof search === 'string') {
            const products = await prisma.product.findMany({
                where: {
                    companyId,
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { itemCode: { contains: search, mode: 'insensitive' } },
                        { barcodes: { has: search } }
                    ]
                },
                select: { id: true }
            });
            const productIds = products.map(p => p.id);
            where.productId = { in: productIds };
        }

        const [stock, total] = await Promise.all([
            prisma.inventoryStock.findMany({
                where,
                skip,
                take,
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            itemCode: true,
                            barcodes: true,
                            units: true
                        }
                    },
                    branch: { select: { id: true, name: true } }
                }
            }),
            prisma.inventoryStock.count({ where })
        ]);

        sendPaginated(res, stock, total, Number(page), Number(limit));
    } catch (error) { next(error); }
});

// GET /inventory/alerts
// Low Stock Alerts (Real logic)
inventoryRoutes.get('/alerts', requirePermission(PERMISSIONS.INVENTORY_VIEW as any), async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const where: any = {
            companyId: req.user!.companyId,
            ...branchScope(req),
        };
        // Optional: Filter by branch if provided
        if (branchId && typeof branchId === 'string') {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }

        const stocks = await prisma.inventoryStock.findMany({
            where: {
                ...where,
                qtyOnHand: { lte: 100 }
            },
            select: { qtyOnHand: true, minStock: true } as any
        });

        const count = stocks.filter(s => s.qtyOnHand <= s.minStock).length;

        sendSuccess(res, { lowStockCount: count });
    } catch (error) { next(error); }
});

// POST /inventory/adjust
inventoryRoutes.post('/adjust', requirePermission(PERMISSIONS.INVENTORY_ADJUST as any), async (req, res, next) => {
    try {
        const { productId, branchId, unitCode, qty, type } = req.body;

        if (
            !productId ||
            !branchId ||
            !unitCode ||
            qty === undefined ||
            qty === null ||
            type === undefined ||
            type === null ||
            String(type).trim() === ''
        ) throw AppError.badRequest('Missing required fields');

        const adjQty = Number(qty);
        if (!Number.isFinite(adjQty) || adjQty === 0) throw AppError.badRequest('Quantity must be a non-zero number');
        const rawType = String(type).trim().toUpperCase();
        const { movementType, accountingType } = resolveAdjustmentTypes(rawType, adjQty);
        if (!MOVEMENT_TYPES.has(movementType)) throw AppError.badRequest('Invalid movement type');

        await assertBranchAccessible(req, branchId);

        // Verify Product & Unit
        const product = await prisma.product.findFirst({
            where: { id: productId, companyId: req.user!.companyId },
            include: { units: true }
        });
        if (!product) throw AppError.notFound('Product');

        // @ts-ignore
        const unit = product.units.find((u: any) => u.unitCode === unitCode);
        if (!unit) throw AppError.badRequest('Invalid Unit');

        const cost = unit.costPrice || 0;

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create/Update Stock Record and Movement via Service
            const { movement } = await InventoryService.mutateStock(tx, {
                companyId: req.user!.companyId,
                branchId,
                productId,
                unitCode,
                qtyChange: adjQty,
                cost,

                type: movementType as any,
                referenceType: 'MANUAL_ADJUSTMENT',
                createdById: req.user!.id
            });

            // 3. Post Accounting Ledger
            if (accountingType && adjQty !== 0) {
                await CoreAccountingService.recordInventoryAdjustment(tx as any, {
                    id: movement.id,
                    companyId: req.user!.companyId,
                    branchId,
                    type: accountingType,
                    createdAt: movement.createdAt,
                    createdById: req.user!.id,
                    items: [{
                        productId,
                        qtyChange: adjQty,
                        cost
                    }]
                });
            }

            return movement;
        });

        sendSuccess(res, result);
    } catch (error) { next(error); }
});

// GET /inventory/movements
// Stock Ledger / Movement History
inventoryRoutes.get('/movements', requirePermission(PERMISSIONS.INVENTORY_VIEW as any), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, productId, branchId, type, search, dateFrom, dateTo } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        const where: any = { companyId: req.user!.companyId, ...branchScope(req) };
        if (productId) where.productId = productId;
        if (branchId) {
            await assertBranchAccessible(req, String(branchId));
            where.branchId = branchId;
        }
        if (type) where.type = type;
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom && typeof dateFrom === 'string') where.createdAt.gte = new Date(dateFrom);
            if (dateTo && typeof dateTo === 'string') where.createdAt.lte = new Date(dateTo);
        }

        if (search && typeof search === 'string') {
            const products = await prisma.product.findMany({
                where: {
                    companyId: req.user!.companyId,
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { itemCode: { contains: search, mode: 'insensitive' } },
                        { barcodes: { has: search } }
                    ]
                },
                select: { id: true }
            });
            const productIds = products.map((p) => p.id);

            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { productId: { in: productIds } },
                        { referenceId: { contains: search, mode: 'insensitive' } },
                        { referenceType: { contains: search, mode: 'insensitive' } }
                    ]
                }
            ];
        }

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                skip,
                take,
                include: {
                    product: { select: { name: true, itemCode: true } },
                    branch: { select: { name: true } },
                    createdBy: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.stockMovement.count({ where })
        ]);

        const movementsWithRunning = await Promise.all(
            movements.map(async (movement) => {
                const running = await prisma.stockMovement.aggregate({
                    _sum: { qty: true },
                    where: {
                        companyId: req.user!.companyId,
                        branchId: movement.branchId,
                        productId: movement.productId,
                        unitCode: movement.unitCode,

                        createdAt: { lte: movement.createdAt },
                    },
                });

                const runningQty = Number(running._sum.qty || 0);
                return { ...movement, runningQty };
            })
        );

        sendPaginated(res, movementsWithRunning, total, Number(page), Number(limit));
    } catch (error) { next(error); }
});

// ─── TRANSFERS ────────────────────────────────────────────────────────

// GET /inventory/transfers
inventoryRoutes.get('/transfers', requirePermission(PERMISSIONS.INVENTORY_VIEW as any), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, fromBranchId, toBranchId, search } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        const where: any = { companyId: req.user!.companyId };
        if (status) where.status = status;
        if (fromBranchId) {
            await assertBranchAccessible(req, String(fromBranchId));
            where.fromBranchId = fromBranchId;
        }
        if (toBranchId) {
            await assertBranchAccessible(req, String(toBranchId));
            where.toBranchId = toBranchId;
        }
        if (search && typeof search === 'string') where.transferNo = { contains: search, mode: 'insensitive' };
        if (!isBranchAdmin(req)) {
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { fromBranchId: { in: req.user!.branchIds } },
                        { toBranchId: { in: req.user!.branchIds } },
                    ],
                },
            ];
        }

        const [transfers, total] = await Promise.all([
            prisma.transfer.findMany({
                where,
                skip,
                take,
                include: {
                    fromBranch: { select: { id: true, name: true } },
                    toBranch: { select: { id: true, name: true } },
                    items: {
                        include: {
                            product: { select: { id: true, name: true, itemCode: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.transfer.count({ where })
        ]);

        sendPaginated(res, transfers, total, Number(page), Number(limit));
    } catch (error) { next(error); }
});

// POST /inventory/transfers (Create Draft)
inventoryRoutes.post('/transfers', requirePermission(PERMISSIONS.INVENTORY_TRANSFER as any), async (req, res, next) => {
    try {
        const { fromBranchId, toBranchId, items } = req.body;
        if (!fromBranchId || !toBranchId || !items || !items.length) throw AppError.badRequest('Missing required fields');
        if (fromBranchId === toBranchId) throw AppError.badRequest('Source and destination branches must be different');

        await Promise.all([
            assertBranchAccessible(req, fromBranchId),
            assertBranchAccessible(req, toBranchId),
        ]);
        for (const item of items) {
            if (!item.productId || !item.unitCode) throw AppError.badRequest('Transfer item missing productId/unitCode');
            if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) {
                throw AppError.badRequest('Transfer qty must be > 0');
            }
        }

        const transferNo = formatDocNo('TRF', await nextCounter(prisma as any, req.user!.companyId, 'TRANSFER'));



        const transfer = await prisma.transfer.create({
            data: {
                companyId: req.user!.companyId,
                fromBranchId,
                toBranchId,
                transferNo,
                status: 'DRAFT',
                createdById: req.user!.id,
                items: {
                    create: items.map((item: any) => ({
                        productId: item.productId,
                        unitCode: item.unitCode,
                        qty: Number(item.qty),

                    }))
                }
            },
            include: { items: true }
        });
        sendSuccess(res, transfer);
    } catch (error) { next(error); }
});

// GET /inventory/transfers/:id
inventoryRoutes.get('/transfers/:id', requirePermission(PERMISSIONS.INVENTORY_VIEW as any), async (req, res, next) => {
    try {
        const transfer = await prisma.transfer.findFirst({
            where: {
                id: req.params.id as string,
                companyId: req.user!.companyId,
                ...(isBranchAdmin(req) ? {} : {
                    OR: [
                        { fromBranchId: { in: req.user!.branchIds } },
                        { toBranchId: { in: req.user!.branchIds } },
                    ]
                }),
            },
            include: {
                fromBranch: { select: { id: true, name: true } },
                toBranch: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
                // @ts-ignore
                items: {
                    include: {
                        product: { select: { id: true, name: true, itemCode: true } }
                    }
                }
            }
        });
        if (!transfer) throw AppError.notFound('Transfer not found');
        sendSuccess(res, transfer);
    } catch (error) { next(error); }
});

// POST /inventory/transfers/:id/send (Deduct Stock)
inventoryRoutes.post('/transfers/:id/send', requirePermission(PERMISSIONS.INVENTORY_TRANSFER as any), async (req, res, next) => {
    try {
        // @ts-ignore
        const transfer = await prisma.transfer.findFirst({
            where: {
                id: req.params.id as string,
                companyId: req.user!.companyId,
                ...(isBranchAdmin(req) ? {} : {
                    OR: [
                        { fromBranchId: { in: req.user!.branchIds } },
                        { toBranchId: { in: req.user!.branchIds } },
                    ]
                }),
            },
            include: { items: true }
        });
        if (!transfer) throw AppError.notFound('Transfer');
        if (!isBranchAdmin(req) && !req.user!.branchIds.includes(transfer.fromBranchId)) {
            throw AppError.forbidden('You do not have access to send from this branch');
        }

        const sendResult = await prisma.$transaction(async (tx) => {

            const transition = await (tx as any).transfer.updateMany({
                where: { id: (transfer as any).id, companyId: req.user!.companyId, status: 'DRAFT' },
                data: { status: 'SENT', sentAt: new Date() },
            });
            if (transition.count === 0) {
                const current = await (tx as any).transfer.findFirst({
                    where: { id: (transfer as any).id, companyId: req.user!.companyId },
                    select: { status: true },
                });
                if (!current) throw AppError.notFound('Transfer');
                if (current.status === 'SENT') return { alreadySent: true };
                throw AppError.badRequest(`Transfer is not in DRAFT status (current: ${current.status})`);
            }

            // Deduct Stock from Source
            // Deduct Stock from Source
            for (const item of (transfer as any).items) {
                await InventoryService.mutateStock(tx, {
                    companyId: req.user!.companyId,
                    branchId: transfer.fromBranchId,
                    productId: (item as any).productId,
                    unitCode: (item as any).unitCode,
                    qtyChange: -Number((item as any).qty),
                    cost: 0,
                    type: 'TRANSFER_OUT',
                    referenceType: 'TRANSFER',
                    referenceId: (transfer as any).id,
                    createdById: req.user!.id,
                });
            }
            return { alreadySent: false };
        }, { maxWait: 10000, timeout: 20000 });

        if (sendResult.alreadySent) {
            sendSuccess(res, { message: 'Transfer already sent' });
            return;
        }
        sendSuccess(res, { message: 'Transfer sent successfully' });
    } catch (error) { next(error); }
});

// POST /inventory/transfers/:id/receive (Add Stock)
inventoryRoutes.post('/transfers/:id/receive', requirePermission(PERMISSIONS.INVENTORY_TRANSFER as any), async (req, res, next) => {
    try {
        // @ts-ignore
        const transfer = await prisma.transfer.findFirst({
            where: {
                id: req.params.id as string,
                companyId: req.user!.companyId,
                ...(isBranchAdmin(req) ? {} : {
                    OR: [
                        { fromBranchId: { in: req.user!.branchIds } },
                        { toBranchId: { in: req.user!.branchIds } },
                    ]
                }),
            },
            include: { items: true }
        });
        if (!transfer) throw AppError.notFound('Transfer');
        if (!isBranchAdmin(req) && !req.user!.branchIds.includes(transfer.toBranchId)) {
            throw AppError.forbidden('You do not have access to receive into this branch');
        }

        const receiveResult = await prisma.$transaction(async (tx) => {

            const transition = await (tx as any).transfer.updateMany({
                where: { id: (transfer as any).id, companyId: req.user!.companyId, status: 'SENT' },
                data: { status: 'RECEIVED', receivedAt: new Date() },
            });
            if (transition.count === 0) {
                const current = await (tx as any).transfer.findFirst({
                    where: { id: (transfer as any).id, companyId: req.user!.companyId },
                    select: { status: true },
                });
                if (!current) throw AppError.notFound('Transfer');
                if (current.status === 'RECEIVED') return { alreadyReceived: true };
                throw AppError.badRequest(`Transfer is not in SENT status (current: ${current.status})`);
            }

            // Add Stock to Destination
            for (const item of (transfer as any).items) {
                const sourceMove = await tx.stockMovement.findFirst({
                    where: {
                        companyId: req.user!.companyId,
                        referenceType: 'TRANSFER',
                        referenceId: (transfer as any).id,
                        type: 'TRANSFER_OUT',
                        productId: (item as any).productId,
                        unitCode: (item as any).unitCode,

                    },
                    select: { cost: true },
                    orderBy: { createdAt: 'desc' },
                });
                const transferCost = Number(sourceMove?.cost || 0);

                await InventoryService.mutateStock(tx, {
                    companyId: req.user!.companyId,
                    branchId: (transfer as any).toBranchId,
                    productId: (item as any).productId,
                    unitCode: (item as any).unitCode,
                    qtyChange: Number((item as any).qty),
                    cost: transferCost,

                    type: 'TRANSFER_IN',
                    referenceType: 'TRANSFER',
                    referenceId: (transfer as any).id,
                    createdById: req.user!.id,

                });
            }

            // Post Accounting Ledger for Transfer
            await CoreAccountingService.recordInventoryTransfer(tx as any, {
                id: (transfer as any).id,
                companyId: req.user!.companyId,
                fromBranchId: (transfer as any).fromBranchId,
                toBranchId: (transfer as any).toBranchId,
                createdAt: new Date(),
                createdById: req.user!.id,
                transferNo: (transfer as any).transferNo,
                items: await Promise.all((transfer as any).items.map(async (item: any) => {
                    const sourceMove = await tx.stockMovement.findFirst({
                        where: {
                            companyId: req.user!.companyId,
                            referenceType: 'TRANSFER',
                            referenceId: (transfer as any).id,
                            type: 'TRANSFER_OUT',
                            productId: item.productId,
                            unitCode: item.unitCode,

                        },
                        select: { cost: true },
                        orderBy: { createdAt: 'desc' },
                    });
                    const transferCost = Number(sourceMove?.cost || 0);

                    return {
                        productId: item.productId,
                        qty: Number(item.qty),
                        cost: transferCost
                    };
                }))
            });
            return { alreadyReceived: false };
        }, { maxWait: 10000, timeout: 20000 });

        if (receiveResult.alreadyReceived) {
            sendSuccess(res, { message: 'Transfer already received' });
            return;
        }
        sendSuccess(res, { message: 'Transfer received successfully' });
    } catch (error) { next(error); }
});

// ══════════════════════════════════════════════════════════════
// STOCK COUNTING (AUDIT)
// ══════════════════════════════════════════════════════════════

// GET /inventory/stock-counts
inventoryRoutes.get('/stock-counts', requirePermission(PERMISSIONS.INVENTORY_VIEW), async (req, res, next) => {
    try {
        const counts = await (prisma as any).stockCount.findMany({
            where: { companyId: req.user!.companyId, ...branchScope(req) },
            include: {
                branch: { select: { name: true } },
                createdBy: { select: { name: true } },
                _count: { select: { items: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        sendSuccess(res, counts);
    } catch (error) { next(error); }
});

// POST /inventory/stock-counts (Create Draft)
inventoryRoutes.post('/stock-counts', requirePermission(PERMISSIONS.INVENTORY_AUDIT), async (req, res, next) => {
    try {
        const { branchId, notes, items } = req.body;
        await assertBranchAccessible(req, branchId);
        const countNo = formatDocNo('CNT', await nextCounter(prisma as any, req.user!.companyId, 'STOCK_COUNT'));

        const result = await (prisma as any).stockCount.create({
            data: {
                companyId: req.user!.companyId,
                branchId,
                countNo,
                notes,
                createdById: req.user!.id,
                items: {
                    create: items.map((i: any) => ({
                        productId: i.productId,
                        unitCode: i.unitCode,

                        systemQty: i.systemQty || 0,
                        countedQty: i.countedQty || 0,
                        variance: (i.countedQty || 0) - (i.systemQty || 0)
                    }))
                }
            }
        });
        sendSuccess(res, result, { message: 'Draft count created' }, 201);
    } catch (error) { next(error); }
});

// GET /inventory/stock-counts/:id
inventoryRoutes.get('/stock-counts/:id', requirePermission(PERMISSIONS.INVENTORY_VIEW), async (req, res, next) => {
    try {
        const result = await (prisma as any).stockCount.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId, ...branchScope(req) },
            include: {
                branch: true,
                createdBy: { select: { name: true } },
                committedBy: { select: { name: true } },
                items: {
                    include: {
                        product: { select: { name: true, itemCode: true } }
                    }
                }
            }
        });
        if (!result) throw AppError.notFound('Stock Count');
        sendSuccess(res, result);
    } catch (error) { next(error); }
});

// POST /inventory/stock-counts/:id/commit
inventoryRoutes.post('/stock-counts/:id/commit', requirePermission(PERMISSIONS.INVENTORY_AUDIT), async (req, res, next) => {
    try {
        const sc = await (prisma as any).stockCount.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId, ...branchScope(req) },
            include: { items: true }
        });
        if (!sc) throw AppError.notFound('Stock Count');

        const commitResult = await prisma.$transaction(async (tx) => {
            const transition = await (tx as any).stockCount.updateMany({
                where: { id: sc.id, companyId: req.user!.companyId, status: 'DRAFT' },
                data: {
                    status: 'COMMITTED',
                    committedById: req.user!.id,
                    updatedAt: new Date()
                }
            });
            if (transition.count === 0) {
                const current = await (tx as any).stockCount.findFirst({
                    where: { id: sc.id, companyId: req.user!.companyId },
                    select: { status: true },
                });
                if (!current) throw AppError.notFound('Stock Count');
                if (current.status === 'COMMITTED') return { alreadyCommitted: true };
                throw AppError.badRequest(`Only DRAFT counts can be committed (current: ${current.status})`);
            }

            const gains: any[] = [];
            const losses: any[] = [];

            for (const item of (sc as any).items) {
                const variance = Number(item.variance) || 0;
                if (variance === 0) continue;

                // Determine missing cost before transaction
                let cost = 0;
                let stock = await tx.inventoryStock.findFirst({
                    where: {
                        companyId: req.user!.companyId,
                        branchId: (sc as any).branchId,
                        productId: item.productId,
                        unitCode: item.unitCode,

                    }
                });

                if (stock) {
                    cost = stock.avgCost;
                } else {
                    const product = await tx.product.findUnique({
                        where: { id: item.productId },
                        include: { units: true }
                    });
                    const unit = (product as any)?.units?.find((u: any) => u.unitCode === item.unitCode);
                    cost = unit?.costPrice || 0;
                }

                await InventoryService.mutateStock(tx, {
                    companyId: req.user!.companyId,
                    branchId: (sc as any).branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: variance,
                    cost,

                    type: 'ADJUSTMENT',
                    referenceType: 'STOCK_COUNT',
                    referenceId: sc.id,
                    createdById: req.user!.id
                });

                // Bucket for Accounting double-entry
                if (variance < 0) {
                    losses.push({ productId: item.productId, qtyChange: variance, cost });
                } else {
                    gains.push({ productId: item.productId, qtyChange: variance, cost });
                }
            }

            // Post Shrinkage / Gains to Ledger
            if (losses.length > 0) {
                await CoreAccountingService.recordInventoryAdjustment(tx as any, {
                    id: sc.id + '-LOSS',
                    companyId: req.user!.companyId,
                    branchId: (sc as any).branchId,
                    type: 'SHRINKAGE',
                    createdAt: new Date(),
                    createdById: req.user!.id,
                    items: losses
                });
            }
            if (gains.length > 0) {
                await CoreAccountingService.recordInventoryAdjustment(tx as any, {
                    id: sc.id + '-GAIN',
                    companyId: req.user!.companyId,
                    branchId: (sc as any).branchId,
                    type: 'OTHER',
                    createdAt: new Date(),
                    createdById: req.user!.id,
                    items: gains
                });
            }

            return { alreadyCommitted: false };
        }, { maxWait: 10000, timeout: 20000 });

        if (commitResult.alreadyCommitted) {
            sendSuccess(res, { message: 'Stock count already committed' });
            return;
        }
        sendSuccess(res, { message: 'Stock count committed and inventory adjusted' });
    } catch (error) { next(error); }
});

// GET /inventory/analytics
inventoryRoutes.get('/analytics', requirePermission(PERMISSIONS.INVENTORY_VIEW), async (req, res, next) => {
    try {
        const now = new Date();
        const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const stocks = await prisma.inventoryStock.findMany({
            where: { companyId: req.user!.companyId, ...branchScope(req) },
            include: {
                product: { include: { category: true } }
            }
        });
        const movements = await prisma.stockMovement.findMany({
            where: {
                companyId: req.user!.companyId,
                ...branchScope(req),
                createdAt: { gte: trendStart },
            },
            select: {
                createdAt: true,
                qty: true,
                type: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        // 1. Valuation by Category
        const catVal: Record<string, number> = {};
        stocks.forEach(s => {
            const cat = (s as any).product?.category?.name || 'Uncategorized';
            catVal[cat] = (catVal[cat] || 0) + (s.qtyOnHand * s.avgCost);
        });

        // 2. Top 10 Products by Value
        const topByValue = stocks
            .map(s => ({
                name: (s as any).product?.name,
                value: s.qtyOnHand * s.avgCost
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const monthKeys = Array.from({ length: 6 }).map((_, idx) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return {
                key,
                label: d.toLocaleDateString('en-US', { month: 'short' }),
            };
        });
        const trendMap = monthKeys.reduce((acc, entry) => {
            acc[entry.key] = { month: entry.label, inQty: 0, outQty: 0, netQty: 0, movementCount: 0 };
            return acc;
        }, {} as Record<string, { month: string; inQty: number; outQty: number; netQty: number; movementCount: number }>);

        movements.forEach((mv) => {
            const d = new Date(mv.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const bucket = trendMap[key];
            if (!bucket) return;
            const qty = Number(mv.qty || 0);
            if (qty >= 0) bucket.inQty += qty;
            else bucket.outQty += Math.abs(qty);
            bucket.netQty += qty;
            bucket.movementCount += 1;
        });

        sendSuccess(res, {
            categoryValuation: Object.entries(catVal).map(([name, value]) => ({ name, value })),
            topByValue,
            totalValuation: Object.values(catVal).reduce((a, b) => a + b, 0),
            movementTrend: monthKeys.map((x) => trendMap[x.key]),
        });
    } catch (error) { next(error); }
});

export { inventoryRoutes };
