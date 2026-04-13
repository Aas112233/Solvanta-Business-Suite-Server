import { Router } from 'express';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { z } from 'zod';
import { enforceTenantCreateWithinLimit } from '../super-admin/tenant-intelligence.js';

export const productRoutes = Router();
productRoutes.use(authenticate);

// ════════════ ZO SCHEMAS ════════════

const itemCodeRegex = /^[0-9]{16}$/;
const objectIdRegex = /^[a-f\d]{24}$/i;

function normalizeCode(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
}

function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

function normalizeNullableString(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

function normalizeCodeList(values: unknown[] | undefined | null): string[] {
    if (!Array.isArray(values)) return [];
    return Array.from(new Set(values.map((v) => normalizeCode(v)).filter(Boolean)));
}

const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid id');
const idParamsSchema = z.object({
    id: objectIdSchema,
});

const requiredTrimmedString = (label: string, maxLength: number) =>
    z.preprocess(
        normalizeOptionalString,
        z.string().min(1, `${label} is required`).max(maxLength, `${label} must be ${maxLength} characters or less`)
    );

const optionalTrimmedString = (maxLength: number) =>
    z.preprocess(normalizeOptionalString, z.string().min(1).max(maxLength).optional());

const optionalNullableTrimmedString = (maxLength: number) =>
    z.preprocess(normalizeNullableString, z.string().min(1).max(maxLength).nullable().optional());

const optionalNullableObjectIdSchema = z.preprocess(
    normalizeNullableString,
    objectIdSchema.nullable().optional()
);

// --- Centralized Uniqueness Check Function ---
// Ensures a code (ItemCode, UnitCode, or Barcode) is unique across the company
// NOTE: companyId and deletedAt filters are now handled AUTOMATICALLY by Prisma Extension.
async function checkCodeUniqueness(companyId: string, code: string, context: string, excludeProductId?: string, excludeUnitId?: string) {
    if (!code) return;
    const normalized = normalizeCode(code);

    // Run all 4 uniqueness checks in parallel (they are independent queries)
    const [conflictingProduct, conflictingUnit, conflictingProductBarcode, conflictingUnitBarcode] = await Promise.all([
        // Check 1: Product ItemCode
        prisma.product.findFirst({
            where: {
                companyId,
                deletedAt: { isSet: false },
                itemCode: normalized,
                id: excludeProductId ? { not: excludeProductId } : undefined,
            },
            select: { id: true, itemCode: true, name: true }
        }),
        // Check 2: Product Units UnitCode
        prisma.productUnit.findFirst({
            where: {
                unitCode: normalized,
                id: excludeUnitId ? { not: excludeUnitId } : undefined,
                product: {
                    companyId,
                    ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
                    deletedAt: { isSet: false }
                }
            },
            include: { product: { select: { id: true, name: true } } }
        }),
        // Check 3: Product Barcodes (Array)
        prisma.product.findFirst({
            where: {
                companyId,
                deletedAt: { isSet: false },
                barcodes: { has: normalized },
                id: excludeProductId ? { not: excludeProductId } : undefined,
            },
            select: { id: true, name: true }
        }),
        // Check 4: Product Unit Barcodes (Array)
        prisma.productUnit.findFirst({
            where: {
                barcodes: { has: normalized },
                id: excludeUnitId ? { not: excludeUnitId } : undefined,
                product: {
                    companyId,
                    ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
                    deletedAt: { isSet: false }
                }
            } as any,
            include: { product: { select: { id: true, name: true } } }
        }),
    ]);

    if (conflictingProduct) throw AppError.badRequest(`${context} '${normalized}' conflicts with Product Code for '${conflictingProduct.name}' (ID: ${conflictingProduct.id})`);
    if (conflictingUnit && conflictingUnit.product) {
        throw AppError.badRequest(`${context} '${normalized}' conflicts with Unit Code in '${conflictingUnit.product.name}' (UnitID: ${conflictingUnit.id}, ProductID: ${conflictingUnit.product.id})`);
    }
    if (conflictingProductBarcode) throw AppError.badRequest(`${context} '${normalized}' conflicts with Barcode of product '${conflictingProductBarcode.name}' (ID: ${conflictingProductBarcode.id})`);
    if (conflictingUnitBarcode && conflictingUnitBarcode.product) {
        throw AppError.badRequest(`${context} '${normalized}' conflicts with Barcode of Unit in '${conflictingUnitBarcode.product.name}' (UnitID: ${conflictingUnitBarcode.id}, ProductID: ${conflictingUnitBarcode.product.id})`);
    }
}

async function assertCategoryExists(companyId: string, categoryId: string) {
    const category = await prisma.category.findFirst({
        where: { id: categoryId, companyId },
        select: { id: true },
    });
    if (!category) throw AppError.badRequest('Invalid category');
}

async function assertProductExists(companyId: string, productId: string) {
    const product = await prisma.product.findFirst({
        where: { id: productId, companyId, deletedAt: { isSet: false } } as any,
        select: { id: true },
    });
    if (!product) throw AppError.notFound('Product');
}


const unitSchema = z.object({
    unitName: z.string().min(1),
    unitCode: z.string().min(1),
    qtyInBaseUnit: z.number().positive().default(1),
    salePrice: z.number().min(0).default(0),
    costPrice: z.number().min(0).default(0),
    barcodes: z.array(z.string()).optional().default([]),
    isDefaultSaleUnit: z.boolean().default(false),
    isBase: z.boolean().default(false),
    minimumNegotiationPrice: z.number().nullable().optional(),
});

const unitUpsertSchema = unitSchema.extend({
    id: z.string().optional(),
});

const productSchema = z.object({
    itemCode: z.string().regex(itemCodeRegex, 'Item Code must be exactly 16 digits'),
    name: z.string().min(1).max(200),
    nameArabic: z.string().optional(),
    categoryId: z.string().min(1, "Category is required"),
    itemGroupId: z.string().min(1, "Group is required"),
    brandId: z.string().optional().nullable(),
    barcodes: z.array(z.string()).optional().default([]), taxId: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    // Initial units can be passed on creation
    units: z.array(unitSchema).min(1, "At least one unit (Base) is required"),
});

const productPatchSchema = z.object({
    itemCode: z.string().regex(itemCodeRegex, 'Item Code must be exactly 16 digits').optional(),
    name: z.string().min(1).max(200).optional(),
    nameArabic: z.string().optional().nullable(),
    categoryId: z.string().min(1).optional(),
    itemGroupId: z.string().min(1).optional(),
    brandId: z.string().optional().nullable(),
    barcodes: z.array(z.string()).optional(), taxId: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    units: z.array(unitUpsertSchema).optional(),
});

const unitPatchSchema = z.object({
    unitName: z.string().min(1).optional(),
    unitCode: z.string().min(1).optional(),
    qtyInBaseUnit: z.number().positive().optional(),
    salePrice: z.number().min(0).optional(),
    costPrice: z.number().min(0).optional(),
    barcodes: z.array(z.string()).optional(),
    isDefaultSaleUnit: z.boolean().optional(),
    isBase: z.boolean().optional(),
    minimumNegotiationPrice: z.number().nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
});

const priceGroupSchema = z.object({
    name: z.string().min(1).max(100),
    code: z.string().optional(),
    isDefault: z.boolean().optional().default(false),
});

const priceGroupPatchSchema = z.object({
    name: optionalTrimmedString(100),
    code: optionalNullableTrimmedString(50),
    isDefault: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
});

const productPricingItemSchema = z.object({
    priceGroupId: objectIdSchema,
    unitCode: requiredTrimmedString('Unit code', 50),
    salePrice: z.coerce.number().min(0),
    minimumNegotiationPrice: z.union([z.null(), z.coerce.number().min(0)]).optional(),
}).strict().superRefine((value, ctx) => {
    if (value.minimumNegotiationPrice !== undefined && value.minimumNegotiationPrice !== null && value.minimumNegotiationPrice > value.salePrice) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minimumNegotiationPrice'],
            message: 'Minimum negotiation price cannot exceed sale price',
        });
    }
});

const productPricingSchema = z.object({
    prices: z.array(productPricingItemSchema).max(500).default([]),
}).strict().superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.prices.forEach((price, index) => {
        const key = `${price.priceGroupId}::${normalizeCode(price.unitCode)}`;
        if (seen.has(key)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['prices', index],
                message: 'Duplicate price group and unit combination',
            });
            return;
        }
        seen.add(key);
    });
});

const categoryCreateSchema = z.object({
    name: requiredTrimmedString('Category name', 100),
    code: optionalNullableTrimmedString(50),
    parentId: optionalNullableObjectIdSchema,
}).strict();

const categoryPatchSchema = z.object({
    name: optionalTrimmedString(100),
    code: optionalNullableTrimmedString(50),
    parentId: optionalNullableObjectIdSchema,
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
});

const groupCreateSchema = z.object({
    name: requiredTrimmedString('Group name', 100),
    code: optionalNullableTrimmedString(50),
}).strict();

const groupPatchSchema = z.object({
    name: optionalTrimmedString(100),
    code: optionalNullableTrimmedString(50),
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
});

const brandCreateSchema = z.object({
    name: requiredTrimmedString('Brand name', 100),
}).strict();

const brandPatchSchema = z.object({
    name: optionalTrimmedString(100),
}).strict().refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
});

const priceGroupCustomersSchema = z.object({
    customerIds: z.array(objectIdSchema).max(1000).default([]),
}).strict();

const priceGroupPricingSchema = z.object({
    prices: z.array(z.object({
        productId: objectIdSchema,
        unitCode: requiredTrimmedString('Unit code', 50),
        salePrice: z.union([z.null(), z.coerce.number().min(0)]),
    }).strict()).max(1000).default([]),
}).strict().superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.prices.forEach((price, index) => {
        const key = `${price.productId}::${normalizeCode(price.unitCode)}`;
        if (seen.has(key)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['prices', index],
                message: 'Duplicate product and unit combination',
            });
            return;
        }
        seen.add(key);
    });
});

const posSyncQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
    since: z.string().optional(),
    priceGroupId: z.string().optional(),
});

// ════════════ PRODUCTS (ITEMS) ════════════

// GET /products
productRoutes.get(
    '/',
    requireAnyPermission(
        PERMISSIONS.PRODUCT_VIEW,
        PERMISSIONS.POS_ACCESS,
        PERMISSIONS.POS_SELL,
        PERMISSIONS.POS_TERMINAL_ONLY
    ),
    async (req, res, next) => {
        try {
            const query = paginationSchema.parse(req.query);
            const { skip, take, page, limit } = getPaginationParams(query);
            const { categoryId, itemGroupId, brandId, status } = req.query;
            const includePricing = ['1', 'true', 'yes'].includes(String(req.query.includePricing || '').toLowerCase());
            const priceGroupId = typeof req.query.priceGroupId === 'string' ? req.query.priceGroupId : undefined;

            const where: any = { deletedAt: { isSet: false } };
            if (categoryId && typeof categoryId === 'string') where.categoryId = categoryId;
            if (itemGroupId && typeof itemGroupId === 'string') where.itemGroupId = itemGroupId;
            if (brandId && typeof brandId === 'string') where.brandId = brandId;
            if (status && typeof status === 'string' && status !== 'all') {
                where.status = status;
            } else if (!status) {
                where.status = 'ACTIVE';
            }

            if (query.search) {
                where.OR = [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { itemCode: { contains: query.search, mode: 'insensitive' } },
                    { barcodes: { has: query.search } },
                    { units: { some: { unitCode: { contains: query.search, mode: 'insensitive' } } } },
                    { units: { some: { barcodes: { has: query.search } } } } as any,
                ];
            }

            const allowedSortFields = new Set(['createdAt', 'updatedAt', 'name', 'itemCode', 'status']);
            const effectiveSortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
            const effectiveSortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

            const [products, total] = await Promise.all([
                prisma.product.findMany({
                    where,
                    skip,
                    take,
                    include: {
                        category: { select: { id: true, name: true } },
                        // @ts-ignore
                        itemGroup: { select: { id: true, name: true } },
                        brand: { select: { id: true, name: true } },
                        tax: true,
                        units: true,
                        ...(includePricing ? {
                            priceGroupPrices: {
                                select: { id: true, priceGroupId: true, unitCode: true, salePrice: true },
                            }
                        } : {}),
                    },
                    orderBy: { [effectiveSortBy]: effectiveSortOrder },
                }),
                prisma.product.count({ where }),
            ]);

            sendPaginated(res, products, total, page, limit);
        } catch (error) { next(error); }
    }
);

// POST /products
productRoutes.post('/', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_ITEM), validate({ body: productSchema }), async (req, res, next) => {
    try {
        await enforceTenantCreateWithinLimit(req.user!.companyId, 'products', {
            actorUserId: req.user!.id,
            actorEmail: req.user!.email,
            request: req,
        });

        const { units, ...rawData } = req.body;
        const companyId = req.user!.companyId;
        const normalizedItemCode = normalizeCode(rawData.itemCode);
        const normalizedBarcodes = normalizeCodeList(rawData.barcodes || []);
        const data = {
            ...rawData,
            itemCode: normalizedItemCode,
            barcodes: normalizedBarcodes,
        };

        // Strict Uniqueness Checks
        await checkCodeUniqueness(companyId, normalizedItemCode, 'Item Code');

        if (normalizedBarcodes.length > 0) {
            for (const bc of normalizedBarcodes) {
                await checkCodeUniqueness(companyId, bc, 'Product Barcode');
            }
        }

        if (units && Array.isArray(units)) {
            const seenCodes = new Set<string>();
            const seenUnitBarcodes = new Set<string>();
            for (const u of units) {
                const uc = normalizeCode(u.unitCode);
                if (seenCodes.has(uc)) throw AppError.badRequest(`Duplicate Unit Code '${uc}' in your request`);
                seenCodes.add(uc);
                await checkCodeUniqueness(companyId, uc, 'Unit Code');

                const unitBcs = normalizeCodeList(u.barcodes || []);
                for (const ub of unitBcs) {
                    if (seenUnitBarcodes.has(ub)) throw AppError.badRequest(`Duplicate Unit Barcode '${ub}' in your request`);
                    seenUnitBarcodes.add(ub);
                    await checkCodeUniqueness(companyId, ub, 'Unit Barcode');
                }
            }
        }

        // Validation: Base Unit logic
        const baseUnits = units.filter((u: any) => u.isBase);
        if (baseUnits.length !== 1) throw AppError.badRequest('Exactly one Base Unit (fraction=1) is required');
        if (baseUnits[0].qtyInBaseUnit !== 1) throw AppError.badRequest('Base Unit must have fraction 1');

        // Transaction
        const result = await prisma.$transaction(async (tx) => {
            // Collect all unit-level barcodes for product-level index
            const allUnitBarcodes: string[] = [];
            const processedUnits = units.map((u: any) => {
                const code = normalizeCode(u.unitCode);
                const unitBcs = normalizeCodeList(u.barcodes || []);
                // Always include the unit code itself as a scannable barcode
                const mergedUnitBarcodes = Array.from(new Set([code, ...unitBcs]));
                allUnitBarcodes.push(...mergedUnitBarcodes);
                return {
                    unitName: u.unitName,
                    unitCode: code,
                    qtyInBaseUnit: Number(u.qtyInBaseUnit || 1),
                    salePrice: Number(u.salePrice || 0),
                    costPrice: Number(u.costPrice || 0),
                    barcodes: mergedUnitBarcodes,
                    isDefaultSaleUnit: Boolean(u.isDefaultSaleUnit),
                    isBase: Boolean(u.isBase),
                    minimumNegotiationPrice: u.minimumNegotiationPrice !== undefined ? u.minimumNegotiationPrice : null,
                };
            });

            if (allUnitBarcodes.includes(normalizedItemCode)) {
                throw AppError.badRequest(`Unit Code '${normalizedItemCode}' cannot match Item Code`);
            }

            // Merge provided barcodes with unit barcodes into product-level array
            const mergedBarcodes = Array.from(new Set([
                ...normalizedBarcodes,
                ...allUnitBarcodes
            ]));

            const product = await tx.product.create({
                data: {
                    ...data,
                    companyId,
                    barcodes: mergedBarcodes
                },
            });

            if (processedUnits.length > 0) {
                await (tx as any).productUnit.createMany({
                    data: processedUnits.map((u: any) => ({ ...u, productId: product.id })),
                });
            }

            return product;
        });

        const fullProduct = await prisma.product.findUnique({
            where: { id: result.id },
            include: { units: true },
        });

        // Audit Log
        if (fullProduct) {
            await prisma.auditLog.create({
                data: {
                    companyId,
                    userId: req.user!.id,
                    action: 'CREATE',
                    entity: 'Product',
                    entityId: result.id,
                    after: fullProduct as any,
                }
            });
        }

        sendSuccess(res, fullProduct, undefined, 201);
    } catch (error) { next(error); }
});

// Barcode Lookup
productRoutes.get('/barcode/:code', async (req, res, next) => {
    try {
        const rawCode = String(req.params.code || '').trim();
        if (!rawCode) throw AppError.badRequest('Barcode code is required');
        const normalizedCode = rawCode.toUpperCase();
        const companyId = req.user!.companyId;
        const priceGroupId = typeof req.query.priceGroupId === 'string' ? req.query.priceGroupId : undefined;

        const productInclude = {
            tax: true,
            units: true,
            priceGroupPrices: {
                select: { id: true, priceGroupId: true, unitCode: true, salePrice: true },
            },
        } as const;

        // Supports scanner input like:
        // - P028              (item code)
        // - P028-PCS          (item code + unit code)
        // - P028/PCS
        const itemUnitMatch = rawCode.match(/^([A-Za-z0-9]+)[\s\-\/:|_]+([A-Za-z0-9]+)$/);
        const itemCodePart = itemUnitMatch?.[1]?.toUpperCase() || null;
        const unitCodePart = itemUnitMatch?.[2]?.toUpperCase() || null;

        let product = await prisma.product.findFirst({
            where: {
                companyId,
                status: 'ACTIVE',
                deletedAt: { isSet: false },
                OR: [{ itemCode: rawCode }, { itemCode: normalizedCode }],
            } as any,
            include: productInclude,
        });

        // Fast path: ProductUnit barcodes array is indexed.
        if (!product) {
            const matchedUnitRecord = await (prisma as any).productUnit.findFirst({
                where: {
                    OR: [
                        { barcodes: { has: rawCode } },
                        { barcodes: { has: normalizedCode } },
                        { unitCode: rawCode },
                        { unitCode: normalizedCode },
                    ],
                    product: {
                        companyId,
                        status: 'ACTIVE',
                        deletedAt: { isSet: false },
                    },
                },
                select: { unitCode: true, productId: true },
            });

            if (matchedUnitRecord) {
                product = await prisma.product.findFirst({
                    where: {
                        id: matchedUnitRecord.productId,
                        companyId,
                        status: 'ACTIVE',
                        deletedAt: { isSet: false },
                    } as any,
                    include: productInclude,
                });
            }
        }

        // Input can be ITEM-UNIT, ITEM/UNIT, etc.
        if (!product && itemCodePart) {
            product = await prisma.product.findFirst({
                where: {
                    companyId,
                    status: 'ACTIVE',
                    deletedAt: { isSet: false },
                    OR: [{ itemCode: itemCodePart }, { itemCode: rawCode }],
                } as any,
                include: productInclude,
            });
        }

        // Slowest fallback (array contains): product-level barcodes.
        if (!product) {
            product = await prisma.product.findFirst({
                where: {
                    companyId,
                    status: 'ACTIVE',
                    deletedAt: { isSet: false },
                    OR: [
                        { barcodes: { has: rawCode } },
                        { barcodes: { has: normalizedCode } },
                    ],
                } as any,
                include: productInclude,
            });
        }

        if (!product) throw AppError.notFound('Product not found');

        const matchedByUnitBarcode = (product.units as any[]).find(
            (u) => (u.barcodes || []).some((b: string) => b.toUpperCase() === normalizedCode)
        );
        const matchedByUnitCode = unitCodePart
            ? (product.units as any[]).find((u) => (u.unitCode || '').toUpperCase() === unitCodePart)
            : null;

        const matchedUnit =
            matchedByUnitBarcode ||
            matchedByUnitCode ||
            (product.units as any[]).find((u) => u.isBase) ||
            product.units[0] ||
            null;

        sendSuccess(res, { product, matchedUnit });
    } catch (error) { next(error); }
});

// POS Products Sync (lightweight payload for local cache)
productRoutes.get(
    '/pos-sync',
    requireAnyPermission(
        PERMISSIONS.PRODUCT_VIEW,
        PERMISSIONS.POS_ACCESS,
        PERMISSIONS.POS_SELL,
        PERMISSIONS.POS_TERMINAL_ONLY
    ),
    async (req, res, next) => {
        try {
            const query = posSyncQuerySchema.parse(req.query);
            const skip = (query.page - 1) * query.limit;
            const companyId = req.user!.companyId;
            const sinceDate = query.since ? new Date(query.since) : null;

            if (sinceDate && Number.isNaN(sinceDate.getTime())) {
                throw AppError.badRequest('Invalid since date');
            }

            const where: any = {
                companyId,
                ...(sinceDate ? { updatedAt: { gt: sinceDate } } : { status: 'ACTIVE', deletedAt: { isSet: false } }),
            };

            const rows = await prisma.product.findMany({
                where,
                skip,
                take: query.limit + 1,
                select: {
                    id: true,
                    itemCode: true,
                    name: true,
                    taxId: true,
                    taxRate: true,
                    tax: true,
                    status: true,
                    deletedAt: true,
                    updatedAt: true,
                    units: {
                        select: {
                            unitCode: true,
                            unitName: true,
                            qtyInBaseUnit: true,
                            salePrice: true,
                            barcodes: true,
                            isBase: true,
                        },
                    },
                    priceGroupPrices: {
                        select: {
                            unitCode: true,
                            salePrice: true,
                            priceGroupId: true,
                        },
                    },
                } as any,
                orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            });

            const hasMore = rows.length > query.limit;
            const items = hasMore ? rows.slice(0, query.limit) : rows;

            sendSuccess(res, {
                items,
                page: query.page,
                limit: query.limit,
                hasMore,
                serverTime: new Date().toISOString(),
            });
        } catch (error) { next(error); }
    }
);



// GET /products/validate-unit-code
productRoutes.get('/validate-unit-code', async (req, res, next) => {
    try {
        const { code, productId } = req.query;
        if (!code || typeof code !== 'string') throw AppError.badRequest('Code is required');

        const normalizedCode = normalizeCode(code);

        // Use centralized check logic
        // If checking only "code", we assume it's for a unit code context, but user might be validating item code too.
        // The endpoint is "validate-unit-code", so we treat it as checking if "code" is available for use as a UNIT CODE.
        // Which means it shouldn't exist as ANY other Code.

        let available = true;
        let message = '';

        try {
            await checkCodeUniqueness(req.user!.companyId, normalizedCode, 'Code', productId ? productId as string : undefined);
            if (productId && typeof productId === 'string') {
                const ownProduct = await prisma.product.findFirst({
                    where: { id: productId, companyId: req.user!.companyId, deletedAt: { isSet: false } },
                    select: { itemCode: true },
                });
                if (ownProduct && normalizeCode(ownProduct.itemCode) === normalizedCode) {
                    available = false;
                    message = `Code '${normalizedCode}' conflicts with this product's Item Code`;
                }
            }
        } catch (e: any) {
            available = false;
            message = e.message;
        }

        sendSuccess(res, { available, message });


    } catch (error) { next(error); }
});

productRoutes.get('/:id/audit', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const logs = await prisma.auditLog.findMany({
            where: {
                entity: 'Product',
                entityId: id,
            },
            include: {
                user: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        sendSuccess(res, logs);
    } catch (error) { next(error); }
});

// GET /products/:id
productRoutes.get('/:id', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (req, res, next) => {
    try {
        const product = await prisma.product.findFirst({
            where: {
                id: req.params.id as string,
                companyId: req.user!.companyId,
                deletedAt: { isSet: false },
            } as any,
            include: {
                category: true,
                // @ts-ignore
                itemGroup: true,
                brand: true,
                units: true,
                priceGroupPrices: { include: { priceGroup: true } },
            },
        });
        if (!product) throw AppError.notFound('Product');
        sendSuccess(res, product);
    } catch (error) { next(error); }
});

// PATCH /products/:id
productRoutes.patch('/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_ITEM), validate({ body: productPatchSchema }), async (req, res, next) => {
    try {
        const { units, ...rawData } = req.body;
        const companyId = req.user!.companyId;
        const productId = req.params.id as string;
        const hasItemCodePatch = typeof rawData.itemCode === 'string';
        const hasBarcodesPatch = Object.prototype.hasOwnProperty.call(rawData, 'barcodes');
        const normalizedItemCode = hasItemCodePatch ? normalizeCode(rawData.itemCode) : undefined;
        const normalizedRequestedBarcodes = hasBarcodesPatch ? normalizeCodeList(rawData.barcodes || []) : undefined;
        const data: any = {
            ...rawData,
            ...(hasItemCodePatch ? { itemCode: normalizedItemCode } : {}),
            ...(hasBarcodesPatch ? { barcodes: normalizedRequestedBarcodes } : {}),
        };

        const existing = await prisma.product.findFirst({
            where: { id: productId, companyId, deletedAt: { isSet: false } },
            include: { units: true },
        });
        if (!existing) throw AppError.notFound('Product');

        if (hasItemCodePatch && normalizedItemCode) {
            await checkCodeUniqueness(companyId, normalizedItemCode, 'Item Code', productId);
            const ownUnitConflict = (existing.units as any[]).some((u: any) => {
                const unitCode = normalizeCode(u.unitCode);
                const unitBarcodes = normalizeCodeList(u.barcodes || []);
                return unitCode === normalizedItemCode || unitBarcodes.includes(normalizedItemCode);
            });
            if (ownUnitConflict) {
                throw AppError.badRequest(`Item Code '${normalizedItemCode}' conflicts with an existing unit code/barcode of this item`);
            }
        }

        if (hasBarcodesPatch && normalizedRequestedBarcodes) {
            for (const bc of normalizedRequestedBarcodes) {
                await checkCodeUniqueness(companyId, bc, 'Product Barcode', productId);
            }
        }

        let product: any;
        if (Array.isArray(units)) {
            const baseUnits = units.filter((u: any) => u.isBase);
            if (baseUnits.length !== 1) throw AppError.badRequest('Exactly one Base Unit (fraction=1) is required');
            if (Number(baseUnits[0].qtyInBaseUnit) !== 1) throw AppError.badRequest('Base Unit must have fraction 1');

            const unitCodes = units.map((u: any) => normalizeCode(u.unitCode));
            if (new Set(unitCodes).size !== unitCodes.length) {
                throw AppError.badRequest('Unit codes must be unique per item');
            }

            const finalItemCode = normalizedItemCode || normalizeCode(existing.itemCode);
            product = await prisma.$transaction(async (tx) => {
                // Collect all unit-level barcodes for product-level index
                const allUnitBarcodes: string[] = [];
                const processedUnits = units.map((u: any) => {
                    const code = normalizeCode(u.unitCode);
                    const unitBcs = normalizeCodeList(u.barcodes || []);
                    const mergedUnitBarcodes = Array.from(new Set([code, ...unitBcs]));
                    allUnitBarcodes.push(...mergedUnitBarcodes);
                    return {
                        unitName: u.unitName,
                        unitCode: code,
                        qtyInBaseUnit: Number(u.qtyInBaseUnit || 1),
                        salePrice: Number(u.salePrice || 0),
                        costPrice: Number(u.costPrice || 0),
                        barcodes: mergedUnitBarcodes,
                        isDefaultSaleUnit: Boolean(u.isDefaultSaleUnit),
                        isBase: Boolean(u.isBase),
                        id: u.id,
                        minimumNegotiationPrice: u.minimumNegotiationPrice !== undefined ? u.minimumNegotiationPrice : null,
                    };
                });

                // Validate Uniqueness for incoming units
                for (const u of processedUnits) {
                    if (u.unitCode === finalItemCode) {
                        throw AppError.badRequest(`Unit Code '${u.unitCode}' cannot match Item Code`);
                    }
                    await checkCodeUniqueness(companyId, u.unitCode, 'Unit Code', productId, u.id || undefined);
                    for (const bc of u.barcodes.filter((b: string) => b !== u.unitCode)) {
                        await checkCodeUniqueness(companyId, bc, 'Unit Barcode', productId, u.id || undefined);
                    }
                }

                // Merge and update master barcodes
                const { barcodes: _ignoredBarcodes, ...restData } = data;
                const mergedBarcodes = Array.from(new Set([
                    ...(hasBarcodesPatch ? (normalizedRequestedBarcodes || []) : normalizeCodeList(existing.barcodes || [])),
                    ...allUnitBarcodes
                ]));

                await tx.product.update({
                    where: { id: productId },
                    data: {
                        ...restData,
                        barcodes: mergedBarcodes
                    },
                });

                const incomingById = new Map(
                    processedUnits.filter((u: any) => u.id).map((u: any) => [u.id, u])
                );
                const existingIds = new Set(existing.units.map((u: any) => u.id));

                // Update existing units
                for (const [unitId, incoming] of incomingById.entries()) {
                    if (!existingIds.has(unitId)) continue;
                    await (tx as any).productUnit.update({
                        where: { id: unitId },
                        data: {
                            unitName: incoming.unitName,
                            unitCode: incoming.unitCode,
                            qtyInBaseUnit: Number(incoming.qtyInBaseUnit),
                            salePrice: Number(incoming.salePrice),
                            costPrice: Number(incoming.costPrice),
                            barcodes: incoming.barcodes,
                            isDefaultSaleUnit: Boolean(incoming.isDefaultSaleUnit),
                            isBase: Boolean(incoming.isBase),
                            minimumNegotiationPrice: incoming.minimumNegotiationPrice !== undefined ? incoming.minimumNegotiationPrice : null,
                        },
                    });
                }

                // Create new units
                const newUnits = processedUnits.filter((u: any) => !u.id);
                if (newUnits.length > 0) {
                    await (tx as any).productUnit.createMany({
                        data: newUnits.map((u: any) => ({
                            productId,
                            unitName: u.unitName,
                            unitCode: u.unitCode,
                            qtyInBaseUnit: Number(u.qtyInBaseUnit),
                            salePrice: Number(u.salePrice),
                            costPrice: Number(u.costPrice),
                            barcodes: u.barcodes,
                            isDefaultSaleUnit: Boolean(u.isDefaultSaleUnit),
                            isBase: Boolean(u.isBase),
                            minimumNegotiationPrice: u.minimumNegotiationPrice !== undefined ? u.minimumNegotiationPrice : null,
                        })),
                    });
                }

                // Delete removed units
                const incomingIds = new Set(processedUnits.filter((u: any) => u.id).map((u: any) => u.id));
                const removedIds = existing.units
                    .filter((u: any) => !incomingIds.has(u.id))
                    .map((u: any) => u.id);
                if (removedIds.length > 0) {
                    await (tx as any).productUnit.deleteMany({ where: { id: { in: removedIds } } });
                }

                return tx.product.findUnique({
                    where: { id: productId },
                    include: { units: true },
                });
            }, { maxWait: 10000, timeout: 20000 });
        } else {
            if (Object.keys(data).length === 0) throw AppError.badRequest('No fields provided for update');
            product = await prisma.product.update({
                where: { id: productId },
                data,
                include: { units: true },
            });
        }

        sendSuccess(res, product);
    } catch (error) { next(error); }
});

// DELETE /products/:id
productRoutes.delete('/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_ITEM), async (req, res, next) => {
    try {
        throw AppError.badRequest('Product deletion is disabled. Please set status to INACTIVE instead.');
        /*
                await prisma.product.update({
                    where: { id: req.params.id as string },
                    data: { deletedAt: new Date() },
                });
                sendSuccess(res, { message: 'Product archived' });
        */
    } catch (error) { next(error); }
});

// ════════════ UNITS MANAGEMENT ════════════

productRoutes.post('/:id/units', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_ITEM), validate({ body: unitSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const product = await prisma.product.findFirst({
            where: { id: req.params.id as string, companyId, deletedAt: { isSet: false } },
            include: { units: true }
        });
        if (!product) throw AppError.notFound('Product');

        const isBase = req.body.isBase;
        if (isBase) {
            // Check if base exists
            // @ts-ignore
            const hasBase = product.units?.some((u: any) => u.isBase);
            if (hasBase) throw AppError.badRequest('Base unit already exists');
            if (req.body.qtyInBaseUnit !== 1) throw AppError.badRequest('Base unit must have fraction 1');
        }

        const unitCode = normalizeCode(req.body.unitCode);
        const requestedBarcodes = normalizeCodeList(req.body.barcodes || []);
        // Always include unitCode itself as a scannable barcode
        const mergedUnitBarcodes = Array.from(new Set([unitCode, ...requestedBarcodes]));
        if (unitCode === normalizeCode(product.itemCode)) {
            throw AppError.badRequest(`Unit Code '${unitCode}' cannot match Item Code`);
        }

        // Strict Uniqueness Check on unit code and each extra barcode
        await checkCodeUniqueness(companyId, unitCode, 'Unit Code');
        for (const bc of requestedBarcodes) {
            await checkCodeUniqueness(companyId, bc, 'Unit Barcode');
        }

        const unit = await prisma.$transaction(async (tx) => {
            const created = await (tx as any).productUnit.create({
                data: {
                    productId: req.params.id as string,
                    unitName: req.body.unitName,
                    unitCode,
                    qtyInBaseUnit: Number(req.body.qtyInBaseUnit || 1),
                    salePrice: Number(req.body.salePrice || 0),
                    costPrice: Number(req.body.costPrice || 0),
                    barcodes: mergedUnitBarcodes,
                    isDefaultSaleUnit: Boolean(req.body.isDefaultSaleUnit),
                    isBase: Boolean(req.body.isBase),
                },
            });

            const mergedBarcodes = Array.from(new Set([
                ...normalizeCodeList((product as any).barcodes || []),
                ...mergedUnitBarcodes,
            ]));
            await tx.product.update({
                where: { id: product.id },
                data: { barcodes: mergedBarcodes },
            });

            return created;
        });

        sendSuccess(res, unit);
    } catch (error) { next(error); }
});

productRoutes.patch('/:productId/units/:unitId', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_ITEM), validate({ body: unitPatchSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const productId = req.params.productId as string;
        const unitId = req.params.unitId as string;

        const unit = await prisma.productUnit.findFirst({
            where: {
                id: unitId,
                productId,
                product: {
                    companyId,
                    deletedAt: { isSet: false },
                },
            },
            include: {
                product: { select: { id: true, itemCode: true, barcodes: true } }
            }
        });
        if (!unit) throw AppError.notFound('Unit');

        if (req.body.isBase === false && unit.isBase) {
            throw AppError.badRequest('Cannot unset Base Unit here. Update product units structure instead.');
        }
        if (req.body.isBase === true && !unit.isBase) {
            const otherBase = await prisma.productUnit.findFirst({
                where: { productId, isBase: true, id: { not: unit.id } },
                select: { id: true },
            });
            if (otherBase) throw AppError.badRequest('Another base unit already exists for this product');
        }

        const nextIsBase = typeof req.body.isBase === 'boolean' ? req.body.isBase : unit.isBase;
        const nextQtyInBaseUnit = req.body.qtyInBaseUnit ?? unit.qtyInBaseUnit;
        if (nextIsBase && Number(nextQtyInBaseUnit) !== 1) {
            throw AppError.badRequest('Base unit must have fraction 1');
        }

        const updateData: any = {};
        if (typeof req.body.unitName === 'string') updateData.unitName = req.body.unitName;
        if (typeof req.body.qtyInBaseUnit === 'number') updateData.qtyInBaseUnit = Number(req.body.qtyInBaseUnit);
        if (typeof req.body.salePrice === 'number') updateData.salePrice = Number(req.body.salePrice);
        if (typeof req.body.costPrice === 'number') updateData.costPrice = Number(req.body.costPrice);
        if (typeof req.body.isDefaultSaleUnit === 'boolean') updateData.isDefaultSaleUnit = req.body.isDefaultSaleUnit;
        if (typeof req.body.isBase === 'boolean') updateData.isBase = req.body.isBase;
        if (req.body.minimumNegotiationPrice !== undefined) updateData.minimumNegotiationPrice = req.body.minimumNegotiationPrice;

        const requestedUnitCode = typeof req.body.unitCode === 'string' ? normalizeCode(req.body.unitCode) : undefined;
        const currentUnitCode = normalizeCode(unit.unitCode);
        const nextUnitCode = requestedUnitCode || currentUnitCode;

        if (typeof req.body.barcode === 'string') {
            const providedBarcode = normalizeCode(req.body.barcode);
            if (providedBarcode !== nextUnitCode) {
                throw AppError.badRequest('Unit barcode must match unit code');
            }
        }

        const itemCode = normalizeCode(unit.product.itemCode);
        if (nextUnitCode === itemCode) {
            throw AppError.badRequest(`Unit Code '${nextUnitCode}' cannot match Item Code`);
        }

        if (requestedUnitCode) {
            await checkCodeUniqueness(companyId, requestedUnitCode, 'Unit Code', productId, unit.id);
            updateData.unitCode = requestedUnitCode;
        }

        // Handle barcodes array update
        if (Array.isArray(req.body.barcodes)) {
            const requestedBarcodes = normalizeCodeList(req.body.barcodes);
            const effectiveUnitCode = requestedUnitCode || normalizeCode(unit.unitCode);
            const mergedUnitBarcodes = Array.from(new Set([effectiveUnitCode, ...requestedBarcodes]));
            for (const bc of requestedBarcodes) {
                await checkCodeUniqueness(companyId, bc, 'Unit Barcode', productId, unit.id);
            }
            updateData.barcodes = mergedUnitBarcodes;
        } else if (requestedUnitCode) {
            // If unit code changed but no explicit barcodes given, update the unit code barcode entry
            const currentBarcodes: string[] = normalizeCodeList((unit as any).barcodes || []);
            updateData.barcodes = Array.from(new Set([
                requestedUnitCode,
                ...currentBarcodes.filter((b) => b !== normalizeCode(unit.unitCode))
            ]));
        }

        if (Object.keys(updateData).length === 0) {
            throw AppError.badRequest('No fields provided for update');
        }

        const updated = await prisma.$transaction(async (tx) => {
            const next = await tx.productUnit.update({
                where: { id: unit.id },
                data: updateData,
            });

            if (requestedUnitCode) {
                const mergedBarcodes = Array.from(new Set([
                    ...normalizeCodeList((unit.product as any).barcodes || []).filter((bc) => bc !== currentUnitCode),
                    requestedUnitCode,
                ]));
                await tx.product.update({
                    where: { id: unit.product.id },
                    data: { barcodes: mergedBarcodes },
                });
            }

            return next;
        });

        sendSuccess(res, updated);
    } catch (error) { next(error); }
});

productRoutes.delete('/:productId/units/:unitId', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_ITEM), async (req, res, next) => {
    try {
        const unit = await prisma.productUnit.findFirst({
            where: {
                id: req.params.unitId as string,
                productId: req.params.productId as string,
                product: {
                    companyId: req.user!.companyId,
                    deletedAt: { isSet: false },
                },
            },
            include: {
                product: { select: { id: true, barcodes: true } }
            }
        });
        if (!unit) throw AppError.notFound('Unit');
        if ((unit as any)?.isBase) throw AppError.badRequest('Cannot delete Base Unit. Modify structure instead.');

        const unitCode = normalizeCode(unit.unitCode);
        const unitBarcodes = normalizeCodeList((unit as any).barcodes || []);

        await prisma.$transaction(async (tx) => {
            await (tx as any).productUnit.delete({ where: { id: unit.id } });
            const remainingBarcodes = normalizeCodeList((unit.product as any).barcodes || []).filter(
                (bc) => !unitBarcodes.includes(bc) && bc !== unitCode
            );
            await tx.product.update({
                where: { id: unit.product.id },
                data: { barcodes: remainingBarcodes },
            });
        });

        sendSuccess(res, { message: 'Unit deleted' });
    } catch (error) { next(error); }
});

// ════════════ PRICING CHANNELS (BULK UPSERT) ════════════

productRoutes.put('/:id/pricing', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_PRICING), validate({ params: idParamsSchema, body: productPricingSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const productId = req.params.id as string;
        const { prices } = req.body as z.infer<typeof productPricingSchema>;

        const product = await prisma.product.findFirst({
            where: { id: productId, companyId, deletedAt: { isSet: false } } as any,
            include: { units: { select: { unitCode: true } } },
        });
        if (!product) throw AppError.notFound('Product');

        const uniquePriceGroupIds = Array.from(new Set(prices.map((price) => price.priceGroupId)));
        if (uniquePriceGroupIds.length > 0) {
            const validPriceGroupCount = await (prisma as any).priceGroup.count({
                where: { companyId, id: { in: uniquePriceGroupIds } },
            });
            if (validPriceGroupCount !== uniquePriceGroupIds.length) {
                throw AppError.badRequest('One or more price groups are invalid');
            }
        }

        const validUnitCodes = new Set(product.units.map((unit) => normalizeCode(unit.unitCode)));
        const normalizedPrices = prices.map((price) => ({
            ...price,
            unitCode: normalizeCode(price.unitCode),
            minimumNegotiationPrice: price.minimumNegotiationPrice ?? null,
        }));

        for (const price of normalizedPrices) {
            if (!validUnitCodes.has(price.unitCode)) {
                throw AppError.badRequest(`Unit ${price.unitCode} is invalid for product ${product.itemCode}`);
            }
        }

        await prisma.$transaction(
            normalizedPrices.map((p) =>
                prisma.productPriceGroup.upsert({
                    where: {
                        productId_priceGroupId_unitCode: {
                            productId,
                            priceGroupId: p.priceGroupId,
                            unitCode: p.unitCode,
                        }
                    },
                    create: {
                        productId,
                        priceGroupId: p.priceGroupId,
                        unitCode: p.unitCode,
                        salePrice: p.salePrice,
                        minimumNegotiationPrice: p.minimumNegotiationPrice
                    },
                    update: {
                        salePrice: p.salePrice,
                        minimumNegotiationPrice: p.minimumNegotiationPrice
                    }
                })
            )
        );
        sendSuccess(res, { message: 'Prices updated' });
    } catch (error) { next(error); }
});

// ════════════ MASTER DATA ════════════

// Categories
productRoutes.get('/meta/categories', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (req, res, next) => {
    try {
        const categories = await prisma.category.findMany({ where: { companyId: req.user!.companyId }, orderBy: { name: 'asc' } });
        sendSuccess(res, categories);
    } catch (error) { next(error); }
});
productRoutes.post('/meta/categories', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ body: categoryCreateSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const { name, code, parentId } = req.body as z.infer<typeof categoryCreateSchema>;
        if (parentId) {
            await assertCategoryExists(companyId, parentId);
        }
        const category = await prisma.category.create({
            data: {
                companyId,
                name,
                code: code ? String(code).trim().toUpperCase() : null,
                parentId: parentId ?? null,
            }
        });
        sendSuccess(res, category);
    } catch (error) { next(error); }
});
productRoutes.patch('/meta/categories/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ params: idParamsSchema, body: categoryPatchSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const { name, code, parentId } = req.body as z.infer<typeof categoryPatchSchema>;
        const existing = await prisma.category.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!existing) throw AppError.notFound('Category');
        if (parentId === id) throw AppError.badRequest('Category cannot be its own parent');
        if (parentId) {
            await assertCategoryExists(companyId, parentId);
        }
        const category = await prisma.category.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(code !== undefined ? { code: code ? String(code).trim().toUpperCase() : null } : {}),
                ...(parentId !== undefined ? { parentId: parentId ?? null } : {}),
            }
        });
        sendSuccess(res, category);
    } catch (error) { next(error); }
});
productRoutes.delete('/meta/categories/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const existing = await prisma.category.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!existing) throw AppError.notFound('Category');
        await prisma.category.delete({ where: { id } });
        sendSuccess(res, { message: 'Category deleted' });
    } catch (error) { next(error); }
});

// Groups
productRoutes.get('/meta/groups', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (req, res, next) => {
    try {
        const groups = await (prisma as any).itemGroup.findMany({ where: { companyId: req.user!.companyId }, orderBy: { name: 'asc' } });
        sendSuccess(res, groups);
    } catch (error) { next(error); }
});
productRoutes.post('/meta/groups', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ body: groupCreateSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const { name, code } = req.body as z.infer<typeof groupCreateSchema>;
        const group = await (prisma as any).itemGroup.create({
            data: {
                companyId,
                name,
                code: code ? String(code).trim().toUpperCase() : null,
            }
        });
        sendSuccess(res, group);
    } catch (error) { next(error); }
});
productRoutes.patch('/meta/groups/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ params: idParamsSchema, body: groupPatchSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const { name, code } = req.body as z.infer<typeof groupPatchSchema>;
        const existing = await (prisma as any).itemGroup.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!existing) throw AppError.notFound('Group');
        const group = await (prisma as any).itemGroup.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(code !== undefined ? { code: code ? String(code).trim().toUpperCase() : null } : {}),
            }
        });
        sendSuccess(res, group);
    } catch (error) { next(error); }
});
productRoutes.delete('/meta/groups/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const existing = await (prisma as any).itemGroup.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!existing) throw AppError.notFound('Group');
        await (prisma as any).itemGroup.delete({ where: { id } });
        sendSuccess(res, { message: 'Group deleted' });
    } catch (error) { next(error); }
});

// Brands
productRoutes.get('/meta/brands', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (req, res, next) => {
    try {
        const brands = await prisma.brand.findMany({ where: { companyId: req.user!.companyId }, orderBy: { name: 'asc' } });
        sendSuccess(res, brands);
    } catch (error) { next(error); }
});
productRoutes.post('/meta/brands', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ body: brandCreateSchema }), async (req, res, next) => {
    try {
        const brand = await prisma.brand.create({
            data: {
                companyId: req.user!.companyId,
                name: req.body.name,
            }
        });
        sendSuccess(res, brand);
    } catch (error) { next(error); }
});
productRoutes.patch('/meta/brands/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ params: idParamsSchema, body: brandPatchSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const existing = await prisma.brand.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!existing) throw AppError.notFound('Brand');
        const brand = await prisma.brand.update({ where: { id }, data: { name: req.body.name } });
        sendSuccess(res, brand);
    } catch (error) { next(error); }
});
productRoutes.delete('/meta/brands/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const existing = await prisma.brand.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!existing) throw AppError.notFound('Brand');
        await prisma.brand.delete({ where: { id } });
        sendSuccess(res, { message: 'Brand deleted' });
    } catch (error) { next(error); }
});

// Price Groups (Channels)
productRoutes.get('/meta/price-groups', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (req, res, next) => {
    try {
        const groups = await (prisma as any).priceGroup.findMany({
            where: { companyId: req.user!.companyId },
            include: {
                _count: {
                    select: {
                        customers: true,
                        productPriceGroups: true,
                    }
                }
            },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
        });
        sendSuccess(res, groups);
    } catch (error) { next(error); }
});
productRoutes.post('/meta/price-groups', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ body: priceGroupSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const payload = {
            name: String(req.body.name || '').trim(),
            code: req.body.code ? String(req.body.code).trim().toUpperCase() : null,
            isDefault: Boolean(req.body.isDefault),
            companyId,
        };

        const group = await prisma.$transaction(async (tx) => {
            if (payload.isDefault) {
                await (tx as any).priceGroup.updateMany({
                    where: { companyId },
                    data: { isDefault: false },
                });
            }
            return (tx as any).priceGroup.create({ data: payload });
        });
        sendSuccess(res, group);
    } catch (error) { next(error); }
});
productRoutes.patch('/meta/price-groups/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), validate({ params: idParamsSchema, body: priceGroupPatchSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const existing = await (prisma as any).priceGroup.findFirst({
            where: { id, companyId },
            select: { id: true },
        });
        if (!existing) throw AppError.notFound('Price Group');

        const { name, code, isDefault } = req.body as z.infer<typeof priceGroupPatchSchema>;
        const payload = {
            ...(name !== undefined ? { name } : {}),
            ...(code !== undefined ? { code: code ? String(code).trim().toUpperCase() : null } : {}),
            ...(isDefault !== undefined ? { isDefault } : {}),
        };

        const group = await prisma.$transaction(async (tx) => {
            if (payload.isDefault) {
                await (tx as any).priceGroup.updateMany({
                    where: { companyId, id: { not: id } },
                    data: { isDefault: false },
                });
            }
            return (tx as any).priceGroup.update({ where: { id }, data: payload });
        });
        sendSuccess(res, group);
    } catch (error) { next(error); }
});
productRoutes.delete('/meta/price-groups/:id', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;
        const existing = await (prisma as any).priceGroup.findFirst({
            where: { id, companyId },
            include: {
                _count: {
                    select: {
                        customers: true,
                        productPriceGroups: true,
                    }
                }
            }
        });
        if (!existing) throw AppError.notFound('Price Group');
        if (existing.isDefault) throw AppError.badRequest('Default price channel cannot be deleted');
        if (existing._count.customers > 0 || existing._count.productPriceGroups > 0) {
            throw AppError.badRequest('Price channel is in use. Unassign customers and remove overrides first');
        }

        await (prisma as any).priceGroup.delete({ where: { id } });
        sendSuccess(res, { message: 'Price Group deleted' });
    } catch (error) { next(error); }
});

// GET /products/meta/price-groups/:id
productRoutes.get('/meta/price-groups/:id', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const id = req.params.id as string;

        const group = await (prisma as any).priceGroup.findFirst({
            where: { id, companyId },
            include: {
                _count: {
                    select: {
                        customers: true,
                        productPriceGroups: true,
                    }
                }
            }
        });
        if (!group) throw AppError.notFound('Price Group');

        const [sampleCustomers, sampleOverrides] = await Promise.all([
            prisma.customer.findMany({
                where: { companyId, priceGroupId: id, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] as any },
                select: { id: true, customerCode: true, name: true },
                orderBy: { name: 'asc' },
                take: 10,
            }),
            (prisma as any).productPriceGroup.findMany({
                where: { priceGroupId: id, product: { companyId, deletedAt: { isSet: false } } },
                include: { product: { select: { id: true, itemCode: true, name: true } } },
                orderBy: { product: { name: 'asc' } },
                take: 20,
            }),
        ]);

        sendSuccess(res, { ...group, sampleCustomers, sampleOverrides });
    } catch (error) { next(error); }
});

// PUT /products/meta/price-groups/:id/customers
productRoutes.put('/meta/price-groups/:id/customers', requirePermission(PERMISSIONS.CRM_EDIT), validate({ params: idParamsSchema, body: priceGroupCustomersSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const groupId = req.params.id as string;
        const { customerIds } = req.body as z.infer<typeof priceGroupCustomersSchema>;

        const group = await (prisma as any).priceGroup.findFirst({ where: { id: groupId, companyId }, select: { id: true } });
        if (!group) throw AppError.notFound('Price Group');

        const uniqueCustomerIds = Array.from(new Set(customerIds));
        if (uniqueCustomerIds.length > 0) {
            const validCount = await prisma.customer.count({
                where: {
                    companyId,
                    id: { in: uniqueCustomerIds },
                    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] as any,
                }
            });
            if (validCount !== uniqueCustomerIds.length) {
                throw AppError.badRequest('One or more customers are invalid for this company');
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.customer.updateMany({
                where: { companyId, priceGroupId: groupId },
                data: { priceGroupId: null },
            });
            if (uniqueCustomerIds.length > 0) {
                await tx.customer.updateMany({
                    where: { companyId, id: { in: uniqueCustomerIds } },
                    data: { priceGroupId: groupId },
                });
            }
        });

        sendSuccess(res, { assignedCount: uniqueCustomerIds.length });
    } catch (error) { next(error); }
});

// PUT /products/meta/price-groups/:id/pricing
productRoutes.put('/meta/price-groups/:id/pricing', requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_PRICING), validate({ params: idParamsSchema, body: priceGroupPricingSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const groupId = req.params.id as string;
        const { prices } = req.body as z.infer<typeof priceGroupPricingSchema>;

        const group = await (prisma as any).priceGroup.findFirst({ where: { id: groupId, companyId }, select: { id: true } });
        if (!group) throw AppError.notFound('Price Group');

        const normalizedPrices = prices.map((p) => ({
            productId: p.productId,
            unitCode: String(p.unitCode || '').trim().toUpperCase(),
            salePrice: p.salePrice,
        }));

        const productIds = Array.from(new Set(normalizedPrices.map((p) => p.productId)));
        if (productIds.length > 0) {
            const products = await prisma.product.findMany({
                where: { companyId, deletedAt: { isSet: false }, id: { in: productIds } } as any,
                include: { units: true },
            });
            const productById = new Map(products.map((p) => [p.id, p]));
            if (products.length !== productIds.length) throw AppError.badRequest('One or more products are invalid');

            for (const row of normalizedPrices) {
                const product = productById.get(row.productId);
                if (!product) throw AppError.badRequest('Invalid product in pricing payload');
                const hasUnit = product.units.some((u) => String(u.unitCode).toUpperCase() === row.unitCode);
                if (!hasUnit) throw AppError.badRequest(`Unit ${row.unitCode} is invalid for product ${product.itemCode}`);
            }
        }

        await prisma.$transaction(async (tx) => {
            for (const row of normalizedPrices) {
                if (row.salePrice === null) {
                    await (tx as any).productPriceGroup.deleteMany({
                        where: {
                            productId: row.productId,
                            priceGroupId: groupId,
                            unitCode: row.unitCode,
                        }
                    });
                    continue;
                }
                await (tx as any).productPriceGroup.upsert({
                    where: {
                        productId_priceGroupId_unitCode: {
                            productId: row.productId,
                            priceGroupId: groupId,
                            unitCode: row.unitCode,
                        },
                    },
                    create: {
                        productId: row.productId,
                        priceGroupId: groupId,
                        unitCode: row.unitCode,
                        salePrice: Number(row.salePrice),
                    },
                    update: {
                        salePrice: Number(row.salePrice),
                    },
                });
            }
        });

        sendSuccess(res, { updated: normalizedPrices.length });
    } catch (error) { next(error); }
});

