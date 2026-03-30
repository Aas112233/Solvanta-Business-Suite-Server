import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { getPaginationParams, paginationSchema } from '../../utils/pagination.js';

export const bomRoutes = Router();
bomRoutes.use(authenticate);

const bomItemSchema = z.object({
    productId: z.string().min(1),
    unitCode: z.string().min(1),
    qtyRequired: z.coerce.number().positive(),
    scrapPercent: z.coerce.number().min(0).max(100).optional().default(0),
    notes: z.string().max(500).optional(),
});

const createBomSchema = z.object({
    productId: z.string().min(1),
    name: z.string().min(1).max(120),
    version: z.string().min(1).max(30).optional().default('1.0'),
    outputQty: z.coerce.number().positive().optional().default(1),
    outputUnitCode: z.string().min(1),
    notes: z.string().max(1000).optional(),
    items: z.array(bomItemSchema).min(1),
});

const updateBomSchema = createBomSchema.partial().extend({
    items: z.array(bomItemSchema).min(1).optional(),
});

const idParamsSchema = z.object({
    id: z.string().min(1),
});

const bomQuerySchema = paginationSchema.extend({
    status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    productId: z.string().optional(),
});

const explodeQuerySchema = z.object({
    qty: z.coerce.number().positive().optional(),
    unitCode: z.string().optional(),
});

function uniqueComponentKey(productId: string, unitCode: string) {
    return `${productId}::${unitCode}`.toLowerCase();
}

async function validateBomPayload(
    tx: any,
    companyId: string,
    payload: {
        productId: string;
        outputUnitCode: string;
        items: Array<{ productId: string; unitCode: string; qtyRequired: number }>;
    }
) {
    const finishedGood = await tx.product.findFirst({
        where: { id: payload.productId, companyId },
        include: { units: true },
    });
    if (!finishedGood) throw AppError.badRequest('Finished good product not found');

    if (!(finishedGood.units || []).some((unit: any) => unit.unitCode === payload.outputUnitCode)) {
        throw AppError.badRequest(`Finished good does not support unit "${payload.outputUnitCode}"`);
    }

    const componentProducts = await tx.product.findMany({
        where: {
            companyId,
            id: { in: payload.items.map((item) => item.productId) },
        },
        include: { units: true },
    });
    const productMap = new Map<string, any>(componentProducts.map((product: any) => [String(product.id), product]));

    const duplicateKeys = new Set<string>();
    for (const item of payload.items) {
        if (String(item.productId) === String(payload.productId)) {
            throw AppError.badRequest('Finished good cannot be its own BOM component');
        }

        const component = productMap.get(String(item.productId));
        if (!component) {
            throw AppError.badRequest(`Component product ${item.productId} not found`);
        }
        if (!(component.units || []).some((unit: any) => unit.unitCode === item.unitCode)) {
            throw AppError.badRequest(`Component "${component.name}" does not support unit "${item.unitCode}"`);
        }

        const key = uniqueComponentKey(item.productId, item.unitCode);
        if (duplicateKeys.has(key)) {
            throw AppError.badRequest('Duplicate BOM component lines are not allowed');
        }
        duplicateKeys.add(key);
    }

    return finishedGood;
}

async function getBomOrThrow(companyId: string, id: string) {
    const bom = await prisma.bom.findFirst({
        where: { id, companyId },
        include: {
            product: { select: { id: true, name: true, itemCode: true, kind: true } },
            createdBy: { select: { id: true, name: true } },
            items: {
                include: {
                    product: { select: { id: true, name: true, itemCode: true, kind: true } },
                },
            },
        },
    });

    if (!bom) throw AppError.notFound('BOM');
    return bom;
}

// GET /bom
bomRoutes.get('/', requirePermission(PERMISSIONS.BOM_VIEW), async (req, res, next) => {
    try {
        const query = bomQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = { companyId: req.user!.companyId };

        if (query.status) where.status = query.status;
        if (query.productId) where.productId = query.productId;
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { version: { contains: query.search, mode: 'insensitive' } },
                { product: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
                { product: { is: { itemCode: { contains: query.search, mode: 'insensitive' } } } },
            ];
        }

        const [rows, total] = await Promise.all([
            prisma.bom.findMany({
                where,
                skip,
                take,
                include: {
                    product: { select: { id: true, name: true, itemCode: true, kind: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true, orders: true } },
                },
                orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
            }),
            prisma.bom.count({ where }),
        ]);

        sendPaginated(res, rows, total, page, limit);
    } catch (error) { next(error); }
});

// GET /bom/:id
bomRoutes.get('/:id', requirePermission(PERMISSIONS.BOM_VIEW), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const bom = await getBomOrThrow(req.user!.companyId, String(req.params.id));
        sendSuccess(res, bom);
    } catch (error) { next(error); }
});

// POST /bom
bomRoutes.post('/', requirePermission(PERMISSIONS.BOM_CREATE), validate({ body: createBomSchema }), async (req, res, next) => {
    try {
        const payload = req.body;
        const companyId = req.user!.companyId;

        const bom = await prisma.$transaction(async (tx) => {
            await validateBomPayload(tx, companyId, payload);
            return tx.bom.create({
                data: {
                    companyId,
                    productId: payload.productId,
                    name: payload.name.trim(),
                    version: payload.version.trim(),
                    outputQty: Number(payload.outputQty),
                    outputUnitCode: payload.outputUnitCode,
                    notes: payload.notes?.trim() || undefined,
                    createdById: req.user!.id,
                    items: {
                        create: payload.items.map((item: any) => ({
                            productId: item.productId,
                            unitCode: item.unitCode,
                            qtyRequired: Number(item.qtyRequired),
                            scrapPercent: Number(item.scrapPercent || 0),
                            notes: item.notes?.trim() || undefined,
                        })),
                    },
                },
                include: {
                    product: { select: { id: true, name: true, itemCode: true, kind: true } },
                    createdBy: { select: { id: true, name: true } },
                    items: {
                        include: {
                            product: { select: { id: true, name: true, itemCode: true, kind: true } },
                        },
                    },
                },
            });
        });

        sendSuccess(res, bom, undefined, 201);
    } catch (error) { next(error); }
});

// PATCH /bom/:id
bomRoutes.patch('/:id', requirePermission(PERMISSIONS.BOM_EDIT), validate({ params: idParamsSchema, body: updateBomSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const existing: any = await prisma.bom.findFirst({
            where: { id: String(req.params.id), companyId },
            include: { items: true },
        });
        if (!existing) throw AppError.notFound('BOM');
        if (existing.status === 'ACTIVE') {
            throw AppError.badRequest('Active BOMs cannot be edited directly. Create a new version or deactivate first.');
        }

        const payload = {
            productId: req.body.productId ?? existing.productId,
            outputUnitCode: req.body.outputUnitCode ?? existing.outputUnitCode,
            items: req.body.items ?? existing.items,
        };

        const bom = await prisma.$transaction(async (tx) => {
            await validateBomPayload(tx, companyId, payload as any);

            if (req.body.items) {
                await tx.bomItem.deleteMany({ where: { bomId: existing.id } });
            }

            return tx.bom.update({
                where: { id: existing.id },
                data: {
                    ...(req.body.productId ? { productId: req.body.productId } : {}),
                    ...(req.body.name ? { name: req.body.name.trim() } : {}),
                    ...(req.body.version ? { version: req.body.version.trim() } : {}),
                    ...(req.body.outputQty ? { outputQty: Number(req.body.outputQty) } : {}),
                    ...(req.body.outputUnitCode ? { outputUnitCode: req.body.outputUnitCode } : {}),
                    ...(req.body.notes !== undefined ? { notes: req.body.notes?.trim() || null } : {}),
                    ...(req.body.items ? {
                        items: {
                            create: req.body.items.map((item: any) => ({
                                productId: item.productId,
                                unitCode: item.unitCode,
                                qtyRequired: Number(item.qtyRequired),
                                scrapPercent: Number(item.scrapPercent || 0),
                                notes: item.notes?.trim() || undefined,
                            })),
                        },
                    } : {}),
                },
                include: {
                    product: { select: { id: true, name: true, itemCode: true, kind: true } },
                    createdBy: { select: { id: true, name: true } },
                    items: {
                        include: {
                            product: { select: { id: true, name: true, itemCode: true, kind: true } },
                        },
                    },
                },
            });
        });

        sendSuccess(res, bom);
    } catch (error) { next(error); }
});

// POST /bom/:id/activate
bomRoutes.post('/:id/activate', requirePermission(PERMISSIONS.BOM_ACTIVATE), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const existing = await prisma.bom.findFirst({
            where: { id: String(req.params.id), companyId },
            select: { id: true, productId: true },
        });
        if (!existing) throw AppError.notFound('BOM');

        const activated = await prisma.$transaction(async (tx) => {
            await tx.bom.updateMany({
                where: {
                    companyId,
                    productId: existing.productId,
                    status: 'ACTIVE',
                    id: { not: existing.id },
                },
                data: { status: 'INACTIVE' },
            });

            return tx.bom.update({
                where: { id: existing.id },
                data: { status: 'ACTIVE' },
                include: {
                    product: { select: { id: true, name: true, itemCode: true, kind: true } },
                    createdBy: { select: { id: true, name: true } },
                    items: {
                        include: {
                            product: { select: { id: true, name: true, itemCode: true, kind: true } },
                        },
                    },
                },
            });
        });

        sendSuccess(res, activated);
    } catch (error) { next(error); }
});

// POST /bom/:id/validate
bomRoutes.post('/:id/validate', requirePermission(PERMISSIONS.BOM_VIEW), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const bom = await getBomOrThrow(req.user!.companyId, String(req.params.id));
        const issues: string[] = [];
        const seen = new Set<string>();

        if (Number(bom.outputQty || 0) <= 0) issues.push('BOM output quantity must be greater than zero');
        if ((bom.items || []).length === 0) issues.push('BOM must contain at least one component');

        for (const item of bom.items || []) {
            if (String(item.productId) === String(bom.productId)) {
                issues.push('Finished good cannot be its own component');
            }

            const key = uniqueComponentKey(String(item.productId), String(item.unitCode));
            if (seen.has(key)) issues.push('Duplicate BOM component detected');
            seen.add(key);

            const component = await prisma.product.findFirst({
                where: { id: item.productId, companyId: req.user!.companyId },
                include: { units: true },
            });
            if (!component) {
                issues.push(`Component ${item.productId} no longer exists`);
                continue;
            }
            if (!(component.units || []).some((unit: any) => unit.unitCode === item.unitCode)) {
                issues.push(`Component "${component.name}" is missing unit "${item.unitCode}"`);
            }
        }

        sendSuccess(res, {
            valid: issues.length === 0,
            issues,
            itemCount: bom.items.length,
        });
    } catch (error) { next(error); }
});

// GET /bom/:id/explode
bomRoutes.get('/:id/explode', requirePermission(PERMISSIONS.BOM_VIEW), validate({ params: idParamsSchema, query: explodeQuerySchema }), async (req, res, next) => {
    try {
        const bom = await getBomOrThrow(req.user!.companyId, String(req.params.id));
        const qty = Number(req.query.qty || bom.outputQty || 1);
        const unitCode = String(req.query.unitCode || bom.outputUnitCode);

        if (unitCode !== bom.outputUnitCode) {
            throw AppError.badRequest(`Phase 1 only supports exploding in BOM output unit "${bom.outputUnitCode}"`);
        }

        const factor = qty / Number(bom.outputQty || 1);
        const materials = bom.items.map((item: any) => ({
            productId: item.productId,
            productName: item.product.name,
            itemCode: item.product.itemCode,
            unitCode: item.unitCode,
            qtyRequired: Math.round(factor * Number(item.qtyRequired || 0) * (1 + Number(item.scrapPercent || 0) / 100) * 10000) / 10000,
            scrapPercent: Number(item.scrapPercent || 0),
        }));

        sendSuccess(res, {
            bomId: bom.id,
            productId: bom.productId,
            productName: bom.product.name,
            qty,
            unitCode,
            materials,
        });
    } catch (error) { next(error); }
});
