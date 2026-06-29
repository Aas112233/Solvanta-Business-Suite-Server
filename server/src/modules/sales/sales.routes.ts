import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission, requireAnyPermission, requireBranch } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';
import { resolveCompanyDocumentSettings } from '../../utils/companySettings.js';
import { SALES_INVOICE_PAYMENT_METHODS, SALES_RECEIPT_PAYMENT_METHODS, isCreditType, isMixedType } from '../../utils/paymentMethods.js';
import { z } from 'zod';
import { getPosTerminalPolicy } from '../pos/pos-policy.js';
import { CoreAccountingService } from '../accounting/CoreAccountingService.js';
import { InventoryService } from '../inventory/InventoryService.js';
import { resolveCompanyTaxSettings } from '../../utils/companyTax.js';

function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const salesRoutes = Router();
salesRoutes.use(authenticate);

const objectIdRegex = /^[a-f\d]{24}$/i;
function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

function isValidDateInput(value: string) {
    const normalized = value.includes('T') ? value : `${value}T00:00:00.000`;
    return !Number.isNaN(new Date(normalized).getTime());
}

async function loadCompanyDocumentSettings(db: any, companyId: string) {
    const company = await db.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
    });

    return resolveCompanyDocumentSettings(company?.settings);
}

function toComparableDate(value?: string) {
    if (!value) return null;
    const normalized = value.includes('T') ? value : `${value}T00:00:00.000`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}

function addSalesItemIssues(
    items: Array<{ productId?: string; unitCode?: string; qty: number; unitPrice: number; discount?: number }>,
    ctx: z.RefinementCtx
) {
    items.forEach((item, index) => {
        const discount = Number(item.discount || 0);
        const gross = Number(item.qty) * Number(item.unitPrice);
        if (item.productId && !item.unitCode) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['items', index, 'unitCode'],
                message: 'unitCode is required when productId is provided',
            });
        }
        if (discount > gross) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['items', index, 'discount'],
                message: 'Discount cannot exceed qty * unitPrice',
            });
        }
    });
}

const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid id');
const optionalObjectIdSchema = z.preprocess(normalizeOptionalString, objectIdSchema.optional());
const optionalTrimmedString = (maxLength: number) =>
    z.preprocess(normalizeOptionalString, z.string().min(1).max(maxLength).optional());
const optionalDateStringSchema = z.preprocess(
    normalizeOptionalString,
    z.string().refine(isValidDateInput, 'Invalid date').optional()
);
const salesPaymentMethodSchema = z.preprocess(
    (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
    z.enum(SALES_INVOICE_PAYMENT_METHODS)
);
const salesReceiptPaymentMethodSchema = z.preprocess(
    (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
    z.enum(SALES_RECEIPT_PAYMENT_METHODS)
);

const salesReturnSchema = z.object({
    reason: optionalTrimmedString(300),
    notes: optionalTrimmedString(1000),
    items: z.array(z.object({
        invoiceItemId: objectIdSchema,
        qty: z.number().positive(),
    })).min(1),
}).superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.items.forEach((item, index) => {
        if (seen.has(item.invoiceItemId)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['items', index, 'invoiceItemId'],
                message: 'Duplicate invoiceItemId is not allowed',
            });
            return;
        }
        seen.add(item.invoiceItemId);
    });
});

const salesInvoiceQuerySchema = paginationSchema.extend({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    paymentMethod: z.string().optional(),
    status: z.string().optional(),
});

const topSellingItemsQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(['qty', 'revenue', 'invoices']).default('qty'),
});

const pendingPaymentsQuerySchema = paginationSchema.extend({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    customerId: z.string().optional(),
});

const overdueInvoicesQuerySchema = paginationSchema.extend({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    customerId: z.string().optional(),
    minDays: z.coerce.number().int().min(1).max(3650).default(30),
});

const salesPaymentsQuerySchema = paginationSchema.extend({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    state: z.enum(['open', 'closed', 'all']).default('open'),
    customerId: z.string().optional(),
});

const salesReceivePaymentSchema = z.object({
    amount: z.number().positive(),
    paymentMethod: salesReceiptPaymentMethodSchema,
    paymentDate: optionalDateStringSchema,
    referenceNo: optionalTrimmedString(100),
    notes: optionalTrimmedString(1000),
});

const salesQuotationQuerySchema = paginationSchema.extend({
    state: z.enum(['active', 'converted', 'all']).default('active'),
});

const salesQuotationItemSchema = z.object({
    productId: optionalObjectIdSchema,
    description: z.string().trim().min(1),
    unitCode: optionalTrimmedString(40),
    qty: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    discount: z.number().nonnegative().default(0),
    taxAmount: z.number().nonnegative().default(0),
}).superRefine((item, ctx) => {
    const gross = Number(item.qty) * Number(item.unitPrice);
    if (item.productId && !item.unitCode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['unitCode'],
            message: 'unitCode is required when productId is provided',
        });
    }
    if (Number(item.discount || 0) > gross) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discount'],
            message: 'Discount cannot exceed qty * unitPrice',
        });
    }
});

const salesQuotationCreateSchema = z.object({
    customerId: optionalObjectIdSchema,
    customerName: optionalTrimmedString(200),
    validUntil: optionalDateStringSchema,
    notes: optionalTrimmedString(2000),
    terms: optionalTrimmedString(5000),
    items: z.array(salesQuotationItemSchema).min(1),
}).superRefine((data, ctx) => {
    addSalesItemIssues(data.items, ctx);
    const validUntil = data.validUntil
        ? new Date(data.validUntil.includes('T') ? data.validUntil : `${data.validUntil}T23:59:59.999`)
        : null;
    if (validUntil && validUntil < new Date()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['validUntil'],
            message: 'validUntil cannot be in the past',
        });
    }
});

const salesQuotationConvertSchema = z.object({
    paymentMethod: salesPaymentMethodSchema.optional(),
});

const salesOrderQuerySchema = paginationSchema.extend({
    state: z.enum(['active', 'completed', 'cancelled', 'all']).default('active'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

const salesOrderItemSchema = z.object({
    productId: optionalObjectIdSchema,
    description: z.string().trim().min(1),
    unitCode: optionalTrimmedString(40),
    qty: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    discount: z.number().nonnegative().default(0),
    taxAmount: z.number().nonnegative().default(0),
}).superRefine((item, ctx) => {
    const gross = Number(item.qty) * Number(item.unitPrice);
    if (item.productId && !item.unitCode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['unitCode'],
            message: 'unitCode is required when productId is provided',
        });
    }
    if (Number(item.discount || 0) > gross) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discount'],
            message: 'Discount cannot exceed qty * unitPrice',
        });
    }
});

const salesOrderCreateSchema = z.object({
    customerId: optionalObjectIdSchema,
    customerName: optionalTrimmedString(200),
    date: optionalDateStringSchema,
    deliveryDate: optionalDateStringSchema,
    notes: optionalTrimmedString(2000),
    terms: optionalTrimmedString(5000),
    items: z.array(salesOrderItemSchema).min(1),
}).superRefine((data, ctx) => {
    addSalesItemIssues(data.items, ctx);
    const date = toComparableDate(data.date);
    const deliveryDate = toComparableDate(data.deliveryDate);
    if (date && deliveryDate && deliveryDate < date) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['deliveryDate'],
            message: 'deliveryDate must be on or after date',
        });
    }
});

const salesOrderUpdateSchema = z.object({
    customerId: optionalObjectIdSchema,
    customerName: optionalTrimmedString(200),
    date: optionalDateStringSchema,
    deliveryDate: optionalDateStringSchema,
    notes: optionalTrimmedString(2000),
    terms: optionalTrimmedString(5000),
    items: z.array(salesOrderItemSchema).min(1).optional(),
    status: z.enum(['DRAFT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'INVOICED']).optional(),
}).superRefine((data, ctx) => {
    if (data.items) {
        addSalesItemIssues(data.items, ctx);
    }
    const date = toComparableDate(data.date);
    const deliveryDate = toComparableDate(data.deliveryDate);
    if (date && deliveryDate && deliveryDate < date) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['deliveryDate'],
            message: 'deliveryDate must be on or after date',
        });
    }
});

const salesOrderConvertSchema = z.object({
    paymentMethod: salesPaymentMethodSchema.optional(),
});

const salesPricingGroupSchema = z.object({
    name: z.string().min(1).max(100),
    code: z.string().optional().nullable(),
    isDefault: z.boolean().optional().default(false),
});

const salesPricingAssignCustomersSchema = z.object({
    customerIds: z.array(z.string()).default([]),
});

const salesPricingMatrixSchema = z.object({
    prices: z.array(z.object({
        productId: z.string().min(1),
        unitCode: z.string().min(1),
        salePrice: z.number().min(0).nullable(),
    })).default([]),
});

const salesPricingRuleSchema = z.object({
    value: z.string().min(1).max(120),
    description: z.string().max(1000).optional(),
    color: z.string().max(20).optional(),
    isActive: z.boolean().optional().default(true),
});

const SALES_QUOTATION_META_PREFIX = '[SQMETA]';
const DEFAULT_LOYALTY_VALUE_PER_POINT = 0.005;

function buildSalesQuotationNotes(notes?: string, validUntil?: string, converted?: { invoiceId: string; invoiceNo: string; at: string }) {
    const meta = {
        validUntil: validUntil || null,
        convertedInvoiceId: converted?.invoiceId || null,
        convertedInvoiceNo: converted?.invoiceNo || null,
        convertedAt: converted?.at || null,
    };
    const base = `${SALES_QUOTATION_META_PREFIX}${JSON.stringify(meta)}`;
    return notes?.trim() ? `${base}\n${notes.trim()}` : base;
}

function parseSalesQuotationNotes(raw?: string | null) {
    const value = String(raw || '');
    if (!value.startsWith(SALES_QUOTATION_META_PREFIX)) {
        return { notes: value || null, validUntil: null as string | null, convertedInvoiceId: null as string | null, convertedInvoiceNo: null as string | null, convertedAt: null as string | null };
    }
    const lines = value.split('\n');
    const metaLine = lines[0].slice(SALES_QUOTATION_META_PREFIX.length);
    let meta: any = {};
    try {
        meta = JSON.parse(metaLine);
    } catch {
        meta = {};
    }
    const notes = lines.slice(1).join('\n').trim();
    return {
        notes: notes || null,
        validUntil: typeof meta.validUntil === 'string' ? meta.validUntil : null,
        convertedInvoiceId: typeof meta.convertedInvoiceId === 'string' ? meta.convertedInvoiceId : null,
        convertedInvoiceNo: typeof meta.convertedInvoiceNo === 'string' ? meta.convertedInvoiceNo : null,
        convertedAt: typeof meta.convertedAt === 'string' ? meta.convertedAt : null,
    };
}

function parseSalesPricingRuleMeta(description?: string | null) {
    if (!description) return { description: null as string | null, color: '#2563eb', isActive: true };
    const text = String(description);
    if (!text.startsWith('[SRMETA]')) return { description: text, color: '#2563eb', isActive: true };
    const lines = text.split('\n');
    const metaRaw = lines[0].slice('[SRMETA]'.length);
    let meta: any = {};
    try { meta = JSON.parse(metaRaw); } catch { meta = {}; }
    return {
        description: lines.slice(1).join('\n').trim() || null,
        color: typeof meta.color === 'string' && meta.color ? meta.color : '#2563eb',
        isActive: typeof meta.isActive === 'boolean' ? meta.isActive : true,
    };
}

function buildSalesPricingRuleMeta(description?: string, color?: string, isActive?: boolean) {
    const meta = `[SRMETA]${JSON.stringify({ color: color || '#2563eb', isActive: isActive !== false })}`;
    return description?.trim() ? `${meta}\n${description.trim()}` : meta;
}

function getCreatedAtDateRange(startDate?: string, endDate?: string) {
    const start = typeof startDate === 'string' && startDate.trim() ? startDate.trim() : undefined;
    const end = typeof endDate === 'string' && endDate.trim() ? endDate.trim() : undefined;
    const createdAt: any = {};

    if (start) {
        const startAt = new Date(`${start}T00:00:00.000`);
        if (Number.isNaN(startAt.getTime())) throw AppError.badRequest('Invalid startDate, expected YYYY-MM-DD');
        createdAt.gte = startAt;
    }
    if (end) {
        const endAt = new Date(`${end}T23:59:59.999`);
        if (Number.isNaN(endAt.getTime())) throw AppError.badRequest('Invalid endDate, expected YYYY-MM-DD');
        createdAt.lte = endAt;
    }
    return Object.keys(createdAt).length ? createdAt : undefined;
}

async function getLoyaltyValuePerPoint(companyId: string): Promise<number> {
    const row: any = await (prisma as any).globalString.findFirst({
        where: {
            companyId,
            group: 'POS_LOYALTY_SETTINGS',
            systemKey: 'DEFAULT',
        },
        select: { metadata: true },
    });

    const pointsPerUnit = Number(row?.metadata?.redemptionPointsPerUnit);
    const currencyValue = Number(row?.metadata?.redemptionCurrencyValue);
    if (!Number.isFinite(pointsPerUnit) || pointsPerUnit <= 0) return DEFAULT_LOYALTY_VALUE_PER_POINT;
    if (!Number.isFinite(currencyValue) || currencyValue <= 0) return DEFAULT_LOYALTY_VALUE_PER_POINT;
    const value = currencyValue / pointsPerUnit;
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_LOYALTY_VALUE_PER_POINT;
}

function withLoyaltyDiscountValue<T extends { loyaltyPointsRedeemed?: number | null }>(invoice: T, valuePerPoint: number): T & { loyaltyDiscountValue: number } {
    const redeemed = Number(invoice?.loyaltyPointsRedeemed || 0);
    const loyaltyDiscountValue = Number((Math.max(0, redeemed) * valuePerPoint).toFixed(2));
    return {
        ...invoice,
        loyaltyDiscountValue,
    };
}

async function validateAndCalculateTaxes(
    companyId: string,
    items: { productId?: string | null; description: string; qty: number; unitPrice: number; discount?: number; unitCode?: string | null }[]
) {
    const taxes = await (prisma as any).tax.findMany({
        where: { companyId, isActive: true, type: { in: ['SALES', 'BOTH'] } },
        orderBy: { createdAt: 'asc' },
    });

    const activeSalesTaxById = new Map<string, any>(taxes.map((t: any) => [t.id, t]));
    const defaultSalesTax = taxes.find((t: any) => t.isDefault) || taxes[0] || null;

    // Load company tax settings for inclusive pricing
    const companyRecord = await prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
    });
    const companyTaxSettings = resolveCompanyTaxSettings(companyRecord?.settings);

    const productIds = items.map(i => i.productId).filter(Boolean) as string[];
    const products = productIds.length > 0 ? await (prisma as any).product.findMany({
        where: { id: { in: productIds }, companyId }
    }) : [];
    const productById = new Map<string, any>(products.map((p: any) => [p.id, p]));

    const taxConfigErrors = new Set<string>();

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const computedItems = items.map(item => {
        const qty = Number(item.qty);
        const unitPrice = Number(item.unitPrice);
        const discount = Number(item.discount || 0);

        const lineGross = (qty * unitPrice) - discount;
        const product = item.productId ? (productById.get(item.productId) as any) : null;
        const productLabel = product ? `${product.itemCode} (${product.name})` : item.description;

        let appliedTax = null;
        if (product && product.taxId) {
            appliedTax = activeSalesTaxById.get(product.taxId) || null;
            if (!appliedTax) {
                taxConfigErrors.add(`${productLabel}: assigned tax is inactive or not valid for sales`);
                return null;
            }
        } else if (defaultSalesTax) {
            appliedTax = defaultSalesTax;
        }

        if (!appliedTax) {
            taxConfigErrors.add(`${productLabel}: no tax assigned and no default sales tax configured`);
            return null;
        }

        const taxRate = Number(appliedTax.rate);
        if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
            taxConfigErrors.add(`${productLabel}: tax rate is invalid`);
            return null;
        }

        let taxAmount: number;
        let lineSubtotal: number;
        if (companyTaxSettings.inclusivePricing && taxRate > 0) {
            taxAmount = roundMoney(lineGross - (lineGross / (1 + taxRate)));
            lineSubtotal = roundMoney(lineGross - taxAmount);
        } else {
            taxAmount = roundMoney(lineGross * taxRate);
            lineSubtotal = roundMoney(lineGross);
        }
        subtotal += lineSubtotal;
        taxTotal += taxAmount;
        discountTotal += discount;

        return {
            productId: item.productId || null,
            description: item.description,
            unitCode: item.unitCode || null,
            qty,
            unitPrice,
            discount,
            taxAmount,
            lineTotal: lineSubtotal
        };
    }).filter(Boolean);

    if (taxConfigErrors.size > 0) {
        const errors = Array.from(taxConfigErrors);
        const preview = errors.slice(0, 3).join('; ');
        const suffix = errors.length > 3 ? `; and ${errors.length - 3} more item(s)` : '';
        throw AppError.badRequest(`Tax configuration is incomplete: ${preview}${suffix}`);
    }

    return {
        preparedItems: computedItems as NonNullable<typeof computedItems[0]>[],
        subtotal: roundMoney(subtotal),
        taxTotal: roundMoney(taxTotal),
        discountTotal: roundMoney(discountTotal)
    };
}

async function isManagerOrAdminUser(req: any): Promise<boolean> {
    const role = await prisma.role.findFirst({
        where: { id: req.user!.roleId, companyId: req.user!.companyId },
        select: { name: true, permissions: true },
    });
    const roleName = String(role?.name || '').toLowerCase();
    const perms = role?.permissions || [];
    return roleName.includes('manager') || perms.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES);
}

// GET /sales/invoices - List all sales invoices
salesRoutes.get('/invoices', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = salesInvoiceQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);

        const where: any = {
            companyId: req.user!.companyId,
            branchId: { in: req.userBranchIds! },
        };
        const createdAt = getCreatedAtDateRange(query.startDate, query.endDate);
        if (createdAt) where.createdAt = createdAt;
        if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
        if (query.status) where.status = query.status;

        if (query.search?.trim()) {
            const search = query.search.trim();
            where.OR = [
                { invoiceNo: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
                { customer: { name: { contains: search, mode: 'insensitive' } } },
                { loyaltyCustomer: { name: { contains: search, mode: 'insensitive' } } },
                { loyaltyCustomer: { phone: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const [invoices, total, loyaltyValuePerPoint] = await Promise.all([
            (prisma as any).pOSInvoice.findMany({
                where,
                skip,
                take,
                include: {
                    customer: { select: { id: true, name: true, customerCode: true, phone: true } },
                    loyaltyCustomer: { select: { id: true, name: true, phone: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            (prisma as any).pOSInvoice.count({ where }),
            getLoyaltyValuePerPoint(req.user!.companyId),
        ]);

        const enriched = invoices.map((inv: any) => withLoyaltyDiscountValue(inv, loyaltyValuePerPoint));
        sendPaginated(res, enriched, total, page, limit);
    } catch (error) { next(error); }
});

// GET /sales/invoices/:id - Detailed invoice view
salesRoutes.get('/invoices/:id', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const invoice = await (prisma as any).pOSInvoice.findFirst({
            where: {
                id,
                companyId: req.user!.companyId,
                branchId: { in: req.userBranchIds! },
            },
            include: {
                customer: { select: { id: true, name: true, phone: true, email: true } },
                loyaltyCustomer: { select: { id: true, name: true, phone: true } },
                branch: { select: { id: true, name: true, code: true } },
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: { select: { name: true, nameArabic: true, itemCode: true, units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true } } } }
                    }
                },
            },
        });

        if (!invoice) throw AppError.notFound('Invoice not found');
        const loyaltyValuePerPoint = await getLoyaltyValuePerPoint(req.user!.companyId);
        sendSuccess(res, withLoyaltyDiscountValue(invoice, loyaltyValuePerPoint));
    } catch (error) { next(error); }
});

// GET /sales/summary - Global summary for analytics
salesRoutes.get('/summary', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;
        const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
        const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
        const createdAt = getCreatedAtDateRange(startDate, endDate);
        const whereBase: any = { companyId, branchId: { in: branchIds } };
        if (createdAt) whereBase.createdAt = createdAt;
        if (req.query.paymentMethod) whereBase.paymentMethod = String(req.query.paymentMethod);

        const [totalCount, totalAmount, unpostedCount] = await Promise.all([
            (prisma as any).pOSInvoice.count({ where: whereBase }),
            (prisma as any).pOSInvoice.aggregate({
                where: { ...whereBase, isPosted: true },
                _sum: { grandTotal: true }
            }),
            (prisma as any).pOSInvoice.count({ where: { ...whereBase, isPosted: false } }),
        ]);

        sendSuccess(res, {
            totalInvoices: totalCount,
            totalRevenue: totalAmount._sum.grandTotal || 0,
            pendingPost: unpostedCount,
        });
    } catch (error) { next(error); }
});

// GET /sales/quotations - List all sales quotations
salesRoutes.get('/quotations', requirePermission(PERMISSIONS.SALES_QUOTATION_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = salesQuotationQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;

        const where: any = {
            companyId,
            branchId: { in: branchIds },
        };

        if (query.state === 'active') {
            where.status = { in: ['DRAFT', 'SENT', 'ACCEPTED'] };
        } else if (query.state === 'converted') {
            where.status = 'CONVERTED';
        }

        if (query.search?.trim()) {
            const search = query.search.trim();
            where.OR = [
                { quotationNo: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
            ];
        }

        const [rows, total] = await Promise.all([
            (prisma as any).salesQuotation.findMany({
                where,
                skip,
                take,
                include: {
                    customer: { select: { id: true, name: true, customerCode: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            (prisma as any).salesQuotation.count({ where }),
        ]);

        sendPaginated(res, rows, total, page, limit);
    } catch (error) { next(error); }
});

// GET /sales/quotations/:id - Get quotation detail
salesRoutes.get('/quotations/:id', requirePermission(PERMISSIONS.SALES_QUOTATION_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const row = await (prisma as any).salesQuotation.findFirst({
            where: {
                id: req.params.id,
                companyId: req.user!.companyId,
                branchId: { in: req.userBranchIds! },
            },
            include: {
                customer: { select: { id: true, name: true, customerCode: true, phone: true, email: true, allowCreditSales: true } },
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: { select: { id: true, name: true, itemCode: true, units: { select: { unitCode: true, unitName: true } } } },
                    },
                },
            },
        });

        if (!row) throw AppError.notFound('Quotation');
        sendSuccess(res, row);
    } catch (error) { next(error); }
});

// POST /sales/quotations - Create new quotation
salesRoutes.post('/quotations', requirePermission(PERMISSIONS.SALES_QUOTATION_CREATE), requireBranch, validate({ body: salesQuotationCreateSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchId = req.activeBranchId!;
        const userId = req.user!.id;
        const body = req.body as z.infer<typeof salesQuotationCreateSchema>;

        const { preparedItems, subtotal, taxTotal, discountTotal } = await validateAndCalculateTaxes(companyId, body.items);
        const documentSettings = await loadCompanyDocumentSettings(prisma as any, companyId);
        const quotationNo = formatDocNo(
            documentSettings.quotationPrefix,
            await nextCounter(prisma as any, companyId, 'SALES_QUOTATION', branchId)
        );

        const row = await (prisma as any).salesQuotation.create({
            data: {
                companyId,
                branchId,
                quotationNo,
                customerId: body.customerId || null,
                customerName: body.customerName || null,
                validUntil: body.validUntil ? new Date(body.validUntil) : null,
                subtotal,
                taxTotal,
                discountTotal,
                grandTotal: subtotal + taxTotal,
                notes: body.notes,
                terms: body.terms,
                createdById: userId,
                status: 'DRAFT',
                items: { create: preparedItems }
            },
            include: { items: true }
        });

        sendSuccess(res, row, { message: 'Quotation created successfully' }, 201);
    } catch (error) { next(error); }
});

// POST /sales/quotations/:id/convert - Convert quotation to invoice
salesRoutes.post('/quotations/:id/convert', requirePermission(PERMISSIONS.SALES_QUOTATION_CONVERT), requireBranch, validate({ body: salesQuotationConvertSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const quotationId = req.params.id;
        const paymentMethod = String(req.body?.paymentMethod || 'CREDIT').toUpperCase();

        const result = await prisma.$transaction(async (tx) => {
            const quote: any = await (tx as any).salesQuotation.findFirst({
                where: {
                    id: quotationId,
                    companyId,
                    branchId: { in: req.userBranchIds! },
                },
                include: { items: true }
            });

            if (!quote) throw AppError.notFound('Quotation');
            const quoteBranchId = String(quote.branchId);
            if (quote.status === 'CONVERTED') throw AppError.badRequest('Quotation is already converted');
            if (quote.status === 'CANCELLED') throw AppError.badRequest('Cannot convert a cancelled quotation');
            if (isCreditType(paymentMethod) && !quote.customerId) {
                throw AppError.badRequest('Customer is required for CREDIT payment');
            }
            if (isCreditType(paymentMethod) && quote.customerId) {
                const customer = await tx.customer.findFirst({
                    where: { id: quote.customerId, companyId },
                    select: { id: true, allowCreditSales: true },
                });
                if (!customer) throw AppError.notFound('Customer');
                if (customer.allowCreditSales === false) {
                    throw AppError.badRequest('Selected customer is not allowed for CREDIT sales');
                }
            }

            // 1. Create Invoice
            let invoice: any;
            let invoiceNo: string;
            let retryCount = 0;
            const maxRetries = 5;
            const documentSettings = await loadCompanyDocumentSettings(tx as any, companyId);

            while (retryCount < maxRetries) {
                invoiceNo = formatDocNo(
                    documentSettings.invoicePrefix,
                    await nextCounter(tx as any, companyId, 'SALES_INVOICE', quoteBranchId)
                );

                // Check if this invoice number already exists
                const existingInvoice = await (tx as any).pOSInvoice.findFirst({
                    where: {
                        companyId,
                        invoiceNo,
                    },
                });

                if (existingInvoice) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        throw AppError.conflict(`Failed to create invoice: invoice number ${invoiceNo} already exists. Please check the document counter or try again.`);
                    }
                    continue; // Try next number
                }

                // No conflict, proceed to create
                invoice = await (tx as any).pOSInvoice.create({
                    data: {
                        companyId,
                        branchId: quoteBranchId,
                        invoiceNo,
                        customerId: quote.customerId,
                        subtotal: quote.subtotal,
                        taxTotal: quote.taxTotal,
                        discountTotal: quote.discountTotal,
                        grandTotal: quote.grandTotal,
                        paymentMethod,
                        status: 'UNPOSTED',
                        isPosted: false,
                        notes: `Converted from Quotation ${quote.quotationNo}`,
                        createdById: req.user!.id,
                        items: {
                            create: quote.items.map((item: any) => {
                                if (!item.productId) throw AppError.badRequest(`Quotation line "${item.description}" has no product and cannot be converted to invoice`);
                                return {
                                    productId: item.productId,
                                    unitCode: item.unitCode || 'UNIT',
                                    qty: item.qty,
                                    unitPrice: item.unitPrice,
                                    discount: item.discount,
                                    taxAmount: item.taxAmount,
                                    lineTotal: item.lineTotal
                                };
                            })
                        }
                    }
                });
                break; // Success, exit retry loop
            }

            // 2. Update Quotation Status and link invoice
            await (tx as any).salesQuotation.update({
                where: { id: quotationId },
                data: { 
                    status: 'CONVERTED',
                    convertedInvoiceId: invoice.id,
                    convertedInvoiceNo: invoice.invoiceNo
                }
            });

            return {
                quotationId: quote.id,
                quotationNo: quote.quotationNo,
                invoiceId: invoice.id,
                invoiceNo: invoice.invoiceNo
            };
        });

        sendSuccess(res, result, { message: 'Quotation converted to invoice successfully' });
    } catch (error) { next(error); }
});

// GET /sales/pricing/price-groups (Alias: /price-lists)
salesRoutes.get(['/pricing/price-groups', '/pricing/price-lists'], requireAnyPermission(PERMISSIONS.SALES_PRICING_MANAGE, PERMISSIONS.SALES_VIEW, PERMISSIONS.INVENTORY_AUDIT), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await (prisma as any).priceGroup.findMany({
            where: { companyId: req.user!.companyId },
            include: {
                _count: { select: { customers: true, productPriceGroups: true } },
            },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
        sendSuccess(res, rows);
    } catch (error) { next(error); }
});

// GET /sales/pricing/price-lists/price - Get specific price for a product/unit/group
salesRoutes.get('/pricing/price-lists/price', requireAnyPermission(PERMISSIONS.SALES_PRICING_MANAGE, PERMISSIONS.SALES_VIEW, PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.INVENTORY_AUDIT), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productId, priceGroupId, unitCode } = req.query as { productId: string, priceGroupId?: string, unitCode: string };
        if (!productId || !unitCode) throw AppError.badRequest('productId and unitCode are required');

        let salePrice = 0;

        // 1. Check Price Group override
        if (priceGroupId) {
            const override = await (prisma as any).productPriceGroup.findFirst({
                where: { productId, priceGroupId, unitCode: String(unitCode).toUpperCase() }
            });
            if (override) salePrice = Number(override.salePrice);
        }

        // 2. Fallback to default product unit price if no override found
        if (salePrice === 0) {
            const product = await prisma.product.findFirst({
                where: { id: productId, companyId: req.user!.companyId },
                include: { units: true }
            });
            const unit = (product as any)?.units?.find((u: any) => String(u.unitCode).toUpperCase() === String(unitCode).toUpperCase());
            salePrice = Number(unit?.salePrice || 0);
        }

        sendSuccess(res, { salePrice });
    } catch (error) { next(error); }
});

// POST /sales/pricing/price-groups
salesRoutes.post('/pricing/price-groups', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingGroupSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const payload = {
            name: String(req.body.name || '').trim(),
            code: req.body.code ? String(req.body.code).trim().toUpperCase() : null,
            isDefault: Boolean(req.body.isDefault),
            companyId,
        };
        const row = await prisma.$transaction(async (tx) => {
            if (payload.isDefault) {
                await (tx as any).priceGroup.updateMany({
                    where: { companyId },
                    data: { isDefault: false },
                });
            }
            return (tx as any).priceGroup.create({ data: payload });
        });
        sendSuccess(res, row, undefined, 201);
    } catch (error) { next(error); }
});

// PATCH /sales/pricing/price-groups/:id
salesRoutes.patch('/pricing/price-groups/:id', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingGroupSchema.partial() }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = String(req.params.id);
        const companyId = req.user!.companyId;
        const existing = await (prisma as any).priceGroup.findFirst({ where: { id, companyId } });
        if (!existing) throw AppError.notFound('Price Group');
        const payload = {
            ...(req.body.name !== undefined ? { name: String(req.body.name || '').trim() } : {}),
            ...(req.body.code !== undefined ? { code: req.body.code ? String(req.body.code).trim().toUpperCase() : null } : {}),
            ...(req.body.isDefault !== undefined ? { isDefault: Boolean(req.body.isDefault) } : {}),
        };
        const row = await prisma.$transaction(async (tx) => {
            if (payload.isDefault) {
                await (tx as any).priceGroup.updateMany({
                    where: { companyId, id: { not: id } },
                    data: { isDefault: false },
                });
            }
            return (tx as any).priceGroup.update({ where: { id }, data: payload });
        });
        sendSuccess(res, row);
    } catch (error) { next(error); }
});

// DELETE /sales/pricing/price-groups/:id
salesRoutes.delete('/pricing/price-groups/:id', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = String(req.params.id);
        const companyId = req.user!.companyId;
        const row = await (prisma as any).priceGroup.findFirst({
            where: { id, companyId },
            include: {
                _count: { select: { customers: true, productPriceGroups: true } },
            },
        });
        if (!row) throw AppError.notFound('Price Group');
        if (row.isDefault) throw AppError.badRequest('Default price group cannot be deleted');
        if ((row?._count?.customers || 0) > 0 || (row?._count?.productPriceGroups || 0) > 0) {
            throw AppError.badRequest('Price group is in use');
        }
        await (prisma as any).priceGroup.delete({ where: { id } });
        sendSuccess(res, { message: 'Deleted' });
    } catch (error) { next(error); }
});

// GET /sales/pricing/price-groups/:id
salesRoutes.get('/pricing/price-groups/:id', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = String(req.params.id);
        const companyId = req.user!.companyId;
        const row = await (prisma as any).priceGroup.findFirst({
            where: { id, companyId },
            include: {
                _count: { select: { customers: true, productPriceGroups: true } },
            },
        });
        if (!row) throw AppError.notFound('Price Group');
        sendSuccess(res, row);
    } catch (error) { next(error); }
});

// PUT /sales/pricing/price-groups/:id/customers
salesRoutes.put('/pricing/price-groups/:id/customers', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingAssignCustomersSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = String(req.params.id);
        const companyId = req.user!.companyId;
        const { customerIds } = req.body as z.infer<typeof salesPricingAssignCustomersSchema>;
        const group = await (prisma as any).priceGroup.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!group) throw AppError.notFound('Price Group');

        const uniqueIds = Array.from(new Set((customerIds || []).map((x) => String(x))));
        if (uniqueIds.length > 0) {
            const cnt = await prisma.customer.count({ where: { companyId, id: { in: uniqueIds } } });
            if (cnt !== uniqueIds.length) throw AppError.badRequest('Invalid customer in payload');
        }

        await prisma.$transaction(async (tx) => {
            await tx.customer.updateMany({
                where: { companyId, priceGroupId: id },
                data: { priceGroupId: null },
            });
            if (uniqueIds.length > 0) {
                await tx.customer.updateMany({
                    where: { companyId, id: { in: uniqueIds } },
                    data: { priceGroupId: id },
                });
            }
        });

        sendSuccess(res, { assignedCount: uniqueIds.length });
    } catch (error) { next(error); }
});

// PUT /sales/pricing/price-groups/:id/pricing
salesRoutes.put('/pricing/price-groups/:id/pricing', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingMatrixSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = String(req.params.id);
        const companyId = req.user!.companyId;
        const { prices } = req.body as z.infer<typeof salesPricingMatrixSchema>;
        const group = await (prisma as any).priceGroup.findFirst({ where: { id, companyId }, select: { id: true } });
        if (!group) throw AppError.notFound('Price Group');

        const normalized = prices.map((row) => ({
            productId: row.productId,
            unitCode: String(row.unitCode).trim().toUpperCase(),
            salePrice: row.salePrice,
        }));

        const productIds = Array.from(new Set(normalized.map((p) => p.productId)));
        if (productIds.length > 0) {
            const products = await prisma.product.findMany({
                where: { companyId, id: { in: productIds } },
                include: { units: { select: { unitCode: true } } },
            });
            const map = new Map(products.map((p) => [p.id, p]));
            if (products.length !== productIds.length) throw AppError.badRequest('Invalid product in payload');
            for (const row of normalized) {
                const product = map.get(row.productId);
                if (!product) throw AppError.badRequest('Invalid product in payload');
                const hasUnit = (product.units || []).some((u: any) => String(u.unitCode).toUpperCase() === row.unitCode);
                if (!hasUnit) throw AppError.badRequest(`Invalid unit ${row.unitCode} for selected product`);
            }
        }

        await prisma.$transaction(async (tx) => {
            for (const row of normalized) {
                if (row.salePrice === null) {
                    await (tx as any).productPriceGroup.deleteMany({
                        where: {
                            productId: row.productId,
                            priceGroupId: id,
                            unitCode: row.unitCode,
                        },
                    });
                    continue;
                }
                await (tx as any).productPriceGroup.upsert({
                    where: {
                        productId_priceGroupId_unitCode: {
                            productId: row.productId,
                            priceGroupId: id,
                            unitCode: row.unitCode,
                        },
                    },
                    create: {
                        productId: row.productId,
                        priceGroupId: id,
                        unitCode: row.unitCode,
                        salePrice: Number(row.salePrice),
                    },
                    update: {
                        salePrice: Number(row.salePrice),
                    },
                });
            }
        });

        sendSuccess(res, { updated: normalized.length });
    } catch (error) { next(error); }
});

// GET /sales/pricing/customers
salesRoutes.get('/pricing/customers', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = { companyId: req.user!.companyId };
        if (query.search?.trim()) {
            const key = query.search.trim();
            where.OR = [
                { name: { contains: key, mode: 'insensitive' } },
                { customerCode: { contains: key, mode: 'insensitive' } },
                { phone: { contains: key, mode: 'insensitive' } },
            ];
        }
        const [rows, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip,
                take,
                select: { id: true, name: true, customerCode: true, phone: true, priceGroupId: true },
                orderBy: { name: 'asc' },
            }),
            prisma.customer.count({ where }),
        ]);
        sendPaginated(res, rows, total, page, limit);
    } catch (error) { next(error); }
});

// GET /sales/pricing/products
salesRoutes.get('/pricing/products', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined;
        const where: any = { companyId: req.user!.companyId };
        if (query.search?.trim()) {
            const key = query.search.trim();
            where.OR = [
                { name: { contains: key, mode: 'insensitive' } },
                { itemCode: { contains: key, mode: 'insensitive' } },
            ];
        }
        const [rows, total] = await Promise.all([
            prisma.product.findMany({
                where,
                skip,
                take,
                include: {
                    units: { select: { unitCode: true, unitName: true, salePrice: true } },
                    priceGroupPrices: {
                        where: groupId ? { priceGroupId: groupId } : undefined,
                        select: { id: true, priceGroupId: true, unitCode: true, salePrice: true },
                    },
                },
                orderBy: { name: 'asc' },
            }),
            prisma.product.count({ where }),
        ]);
        sendPaginated(res, rows, total, page, limit);
    } catch (error) { next(error); }
});

// GET /sales/pricing/promotions
salesRoutes.get('/pricing/promotions', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await (prisma as any).globalString.findMany({
            where: { companyId: req.user!.companyId, group: 'SALES_PROMOTION' },
            orderBy: [{ isActive: 'desc' }, { value: 'asc' }],
        });
        const data = rows.map((row: any) => {
            const meta = parseSalesPricingRuleMeta(row.description);
            return {
                id: row.id,
                value: row.value,
                description: meta.description,
                color: meta.color,
                isActive: meta.isActive && row.isActive !== false,
            };
        });
        sendSuccess(res, data);
    } catch (error) { next(error); }
});

// POST /sales/pricing/promotions
salesRoutes.post('/pricing/promotions', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingRuleSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { value, description, color, isActive } = req.body as z.infer<typeof salesPricingRuleSchema>;
        const row = await (prisma as any).globalString.create({
            data: {
                companyId: req.user!.companyId,
                group: 'SALES_PROMOTION',
                value: value.trim(),
                isActive: isActive !== false,
                description: buildSalesPricingRuleMeta(description, color, isActive),
                color: color || '#2563eb',
            },
        });
        sendSuccess(res, row, undefined, 201);
    } catch (error) { next(error); }
});

// PUT /sales/pricing/promotions/:id
salesRoutes.put('/pricing/promotions/:id', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingRuleSchema.partial() }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const existing = await (prisma as any).globalString.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId, group: 'SALES_PROMOTION' },
        });
        if (!existing) throw AppError.notFound('Promotion');
        const currentMeta = parseSalesPricingRuleMeta(existing.description);
        const nextValue = req.body.value !== undefined ? String(req.body.value).trim() : existing.value;
        const nextColor = req.body.color !== undefined ? String(req.body.color) : currentMeta.color;
        const nextIsActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : currentMeta.isActive;
        const nextDescription = req.body.description !== undefined ? String(req.body.description) : (currentMeta.description || '');

        const row = await (prisma as any).globalString.update({
            where: { id: existing.id },
            data: {
                value: nextValue,
                isActive: nextIsActive,
                color: nextColor,
                description: buildSalesPricingRuleMeta(nextDescription, nextColor, nextIsActive),
            },
        });
        sendSuccess(res, row);
    } catch (error) { next(error); }
});

// DELETE /sales/pricing/promotions/:id
salesRoutes.delete('/pricing/promotions/:id', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const existing = await (prisma as any).globalString.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId, group: 'SALES_PROMOTION' },
        });
        if (!existing) throw AppError.notFound('Promotion');
        await (prisma as any).globalString.delete({ where: { id: existing.id } });
        sendSuccess(res, { message: 'Deleted' });
    } catch (error) { next(error); }
});

// GET /sales/pricing/discount-rules
salesRoutes.get('/pricing/discount-rules', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await (prisma as any).globalString.findMany({
            where: { companyId: req.user!.companyId, group: 'SALES_DISCOUNT_RULE' },
            orderBy: [{ isActive: 'desc' }, { value: 'asc' }],
        });
        const data = rows.map((row: any) => {
            const meta = parseSalesPricingRuleMeta(row.description);
            return {
                id: row.id,
                value: row.value,
                description: meta.description,
                color: meta.color,
                isActive: meta.isActive && row.isActive !== false,
            };
        });
        sendSuccess(res, data);
    } catch (error) { next(error); }
});

// POST /sales/pricing/discount-rules
salesRoutes.post('/pricing/discount-rules', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingRuleSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { value, description, color, isActive } = req.body as z.infer<typeof salesPricingRuleSchema>;
        const row = await (prisma as any).globalString.create({
            data: {
                companyId: req.user!.companyId,
                group: 'SALES_DISCOUNT_RULE',
                value: value.trim(),
                isActive: isActive !== false,
                description: buildSalesPricingRuleMeta(description, color, isActive),
                color: color || '#2563eb',
            },
        });
        sendSuccess(res, row, undefined, 201);
    } catch (error) { next(error); }
});

// PUT /sales/pricing/discount-rules/:id
salesRoutes.put('/pricing/discount-rules/:id', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), validate({ body: salesPricingRuleSchema.partial() }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const existing = await (prisma as any).globalString.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId, group: 'SALES_DISCOUNT_RULE' },
        });
        if (!existing) throw AppError.notFound('Discount Rule');
        const currentMeta = parseSalesPricingRuleMeta(existing.description);
        const nextValue = req.body.value !== undefined ? String(req.body.value).trim() : existing.value;
        const nextColor = req.body.color !== undefined ? String(req.body.color) : currentMeta.color;
        const nextIsActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : currentMeta.isActive;
        const nextDescription = req.body.description !== undefined ? String(req.body.description) : (currentMeta.description || '');

        const row = await (prisma as any).globalString.update({
            where: { id: existing.id },
            data: {
                value: nextValue,
                isActive: nextIsActive,
                color: nextColor,
                description: buildSalesPricingRuleMeta(nextDescription, nextColor, nextIsActive),
            },
        });
        sendSuccess(res, row);
    } catch (error) { next(error); }
});

// DELETE /sales/pricing/discount-rules/:id
salesRoutes.delete('/pricing/discount-rules/:id', requirePermission(PERMISSIONS.SALES_PRICING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const existing = await (prisma as any).globalString.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId, group: 'SALES_DISCOUNT_RULE' },
        });
        if (!existing) throw AppError.notFound('Discount Rule');
        await (prisma as any).globalString.delete({ where: { id: existing.id } });
        sendSuccess(res, { message: 'Deleted' });
    } catch (error) { next(error); }
});

// GET /sales/analytics - detailed metrics for dashboards
salesRoutes.get('/analytics', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;
        const now = new Date();
        const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const [invoices, returns] = await Promise.all([
            (prisma as any).pOSInvoice.findMany({
                where: { companyId, branchId: { in: branchIds }, createdAt: { gte: trendStart } },
                select: {
                    id: true,
                    createdAt: true,
                    grandTotal: true,
                    isPosted: true,
                    status: true,
                    paymentMethod: true,
                    customerId: true,
                    customer: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'asc' },
            }),
            (prisma as any).salesReturn.findMany({
                where: { companyId, branchId: { in: branchIds }, status: 'POSTED', createdAt: { gte: trendStart } },
                select: { id: true, createdAt: true, grandTotal: true },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        const postedInvoices = invoices.filter((inv: any) => inv.isPosted && inv.status !== 'VOID' && inv.status !== 'UNPOSTED');
        const grossSales = postedInvoices.reduce((sum: number, inv: any) => sum + Number(inv.grandTotal || 0), 0);
        const returnTotal = returns.reduce((sum: number, row: any) => sum + Number(row.grandTotal || 0), 0);
        const netSales = grossSales - returnTotal;
        const avgOrderValue = postedInvoices.length > 0 ? grossSales / postedInvoices.length : 0;

        const paymentMethodTotals = postedInvoices.reduce((acc: Record<string, number>, inv: any) => {
            const key = String(inv.paymentMethod || 'UNKNOWN');
            acc[key] = (acc[key] || 0) + Number(inv.grandTotal || 0);
            return acc;
        }, {});

        const customerTotals = postedInvoices.reduce((acc: Record<string, { name: string; value: number }>, inv: any) => {
            if (!inv.customerId) return acc;
            const key = String(inv.customerId);
            const name = inv.customer?.name || 'Customer';
            if (!acc[key]) acc[key] = { name, value: 0 };
            acc[key].value += Number(inv.grandTotal || 0);
            return acc;
        }, {});

        const monthKeys = Array.from({ length: 6 }).map((_, idx) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return {
                key,
                label: d.toLocaleDateString('en-US', { month: 'short' }),
            };
        });
        const trendMap = monthKeys.reduce((acc, entry) => {
            acc[entry.key] = { month: entry.label, gross: 0, returns: 0, net: 0 };
            return acc;
        }, {} as Record<string, { month: string; gross: number; returns: number; net: number }>);

        for (const inv of postedInvoices) {
            const d = new Date(inv.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (trendMap[key]) {
                trendMap[key].gross += Number(inv.grandTotal || 0);
            }
        }
        for (const ret of returns) {
            const d = new Date(ret.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (trendMap[key]) {
                trendMap[key].returns += Number(ret.grandTotal || 0);
            }
        }

        const trend = monthKeys.map((m) => {
            const row = trendMap[m.key];
            row.net = row.gross - row.returns;
            return row;
        });

        const paymentMethodBreakdown = Object.entries(paymentMethodTotals as Record<string, number>)
            .map(([method, total]) => ({ method, total: Number(total || 0) }))
            .sort((a, b) => b.total - a.total);
        const topCustomers = Object.values(customerTotals as Record<string, { name: string; value: number }>)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        sendSuccess(res, {
            metrics: {
                totalInvoices: invoices.length,
                postedInvoices: postedInvoices.length,
                unpostedInvoices: invoices.filter((inv: any) => !inv.isPosted || inv.status === 'UNPOSTED').length,
                grossSales,
                returnTotal,
                netSales,
                avgOrderValue,
                returnRatePct: postedInvoices.length > 0 ? (returns.length / postedInvoices.length) * 100 : 0,
            },
            paymentMethodBreakdown,
            topCustomers,
            trend,
        });
    } catch (error) { next(error); }
});

// GET /sales/top-selling-items - top selling products in selected date range
salesRoutes.get('/top-selling-items', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;
        const query = topSellingItemsQuerySchema.parse(req.query);
        const createdAt = getCreatedAtDateRange(query.startDate, query.endDate);
        const search = query.search?.trim();

        const invoiceWhere: any = {
            companyId,
            branchId: { in: branchIds },
            isPosted: true,
            status: { notIn: ['VOID', 'UNPOSTED'] },
        };
        if (createdAt) invoiceWhere.createdAt = createdAt;

        const where: any = {
            invoice: { is: invoiceWhere },
        };
        if (search) {
            where.product = {
                is: {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { itemCode: { contains: search, mode: 'insensitive' } },
                    ],
                },
            };
        }

        const lines = await (prisma as any).pOSInvoiceItem.findMany({
            where,
            select: {
                invoiceId: true,
                productId: true,
                qty: true,
                lineTotal: true,
                taxAmount: true,
                product: { select: { itemCode: true, name: true, nameArabic: true } },
            },
        });

        const agg = new Map<string, {
            productId: string;
            itemCode: string;
            name: string;
            nameArabic: string | null;
            qty: number;
            revenue: number;
            tax: number;
            total: number;
            invoiceIds: Set<string>;
        }>();

        for (const line of lines) {
            const key = String(line.productId);
            const existing = agg.get(key) || {
                productId: key,
                itemCode: line.product?.itemCode || '-',
                name: line.product?.name || 'Unnamed Product',
                nameArabic: line.product?.nameArabic || null,
                qty: 0,
                revenue: 0,
                tax: 0,
                total: 0,
                invoiceIds: new Set<string>(),
            };
            existing.qty += Number(line.qty || 0);
            existing.revenue += Number(line.lineTotal || 0);
            existing.tax += Number(line.taxAmount || 0);
            existing.total += Number(line.lineTotal || 0) + Number(line.taxAmount || 0);
            existing.invoiceIds.add(String(line.invoiceId));
            agg.set(key, existing);
        }

        const sortBy = query.sortBy;
        const items = Array.from(agg.values())
            .map((row) => ({
                productId: row.productId,
                itemCode: row.itemCode,
                name: row.name,
                nameArabic: row.nameArabic,
                qty: row.qty,
                revenue: row.revenue,
                tax: row.tax,
                total: row.total,
                invoiceCount: row.invoiceIds.size,
            }))
            .sort((a, b) => {
                if (sortBy === 'revenue') return b.revenue - a.revenue;
                if (sortBy === 'invoices') return b.invoiceCount - a.invoiceCount;
                return b.qty - a.qty;
            })
            .slice(0, query.limit);

        sendSuccess(res, {
            items,
            filters: {
                startDate: query.startDate || null,
                endDate: query.endDate || null,
                search: search || null,
                sortBy,
                limit: query.limit,
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (error) { next(error); }
});

// GET /sales/pending-payments - credit invoices with outstanding balance
salesRoutes.get('/pending-payments', requirePermission(PERMISSIONS.SALES_PAYMENT_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;
        const query = pendingPaymentsQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const createdAt = getCreatedAtDateRange(query.startDate, query.endDate);

        const where: any = {
            companyId,
            branchId: { in: branchIds },
            paymentMethod: 'CREDIT',
            status: { notIn: ['VOID', 'REFUNDED'] },
        };
        if (createdAt) where.createdAt = createdAt;
        if (query.customerId) where.customerId = query.customerId;
        if (query.search?.trim()) {
            const key = query.search.trim();
            where.OR = [
                { invoiceNo: { contains: key, mode: 'insensitive' } },
                { customer: { is: { name: { contains: key, mode: 'insensitive' } } } },
                { customer: { is: { phone: { contains: key, mode: 'insensitive' } } } },
                { loyaltyCustomer: { is: { name: { contains: key, mode: 'insensitive' } } } },
                { loyaltyCustomer: { is: { phone: { contains: key, mode: 'insensitive' } } } },
            ];
        }

        const invoices = await (prisma as any).pOSInvoice.findMany({
            where,
            include: {
                customer: { select: { id: true, name: true, phone: true } },
                loyaltyCustomer: { select: { id: true, name: true, phone: true } },
                createdBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const now = Date.now();
        const rows = invoices.map((inv: any) => {
            const grandTotal = Number(inv.grandTotal || 0);
            const received = Number(inv.cashReceived || 0);
            const outstanding = Math.max(0, grandTotal - received);
            const daysOutstanding = Math.max(
                0,
                Math.floor((now - new Date(inv.createdAt).getTime()) / (24 * 60 * 60 * 1000))
            );
            return {
                id: inv.id,
                invoiceNo: inv.invoiceNo,
                createdAt: inv.createdAt,
                customer: inv.customer,
                loyaltyCustomer: inv.loyaltyCustomer,
                createdBy: inv.createdBy,
                status: inv.status,
                isPosted: Boolean(inv.isPosted),
                paymentMethod: inv.paymentMethod,
                grandTotal,
                received,
                outstanding,
                daysOutstanding,
                isOverdue: daysOutstanding > 30,
            };
        });

        // Guardrail: only show truly unpaid credit invoices
        const unpaidRows = rows.filter((row: any) => Number(row.outstanding || 0) > 0.000001);
        const total = unpaidRows.length;
        const pagedRows = unpaidRows.slice(skip, skip + take);

        const summaryAcc = unpaidRows.reduce((acc: any, row: any) => {
            const grandTotal = Number(row.grandTotal || 0);
            const received = Number(row.received || 0);
            const outstanding = Number(row.outstanding || 0);
            acc.totalInvoiced += grandTotal;
            acc.totalReceived += received;
            acc.totalOutstanding += outstanding;
            if (row.isOverdue) acc.overdueCount += 1;
            return acc;
        }, {
            totalInvoiced: 0,
            totalReceived: 0,
            totalOutstanding: 0,
            overdueCount: 0,
        });

        sendSuccess(res, pagedRows, {
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            summary: {
                invoiceCount: total,
                totalInvoiced: summaryAcc.totalInvoiced,
                totalReceived: summaryAcc.totalReceived,
                totalOutstanding: summaryAcc.totalOutstanding,
                averageOutstanding: total > 0 ? summaryAcc.totalOutstanding / total : 0,
                overdueCount: summaryAcc.overdueCount,
            },
        });
    } catch (error) { next(error); }
});

// GET /sales/overdue-invoices - unpaid credit invoices older than minDays
salesRoutes.get('/overdue-invoices', requirePermission(PERMISSIONS.SALES_CREDIT_CONTROL), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;
        const query = overdueInvoicesQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const createdAt = getCreatedAtDateRange(query.startDate, query.endDate);

        const where: any = {
            companyId,
            branchId: { in: branchIds },
            paymentMethod: 'CREDIT',
            status: { notIn: ['VOID', 'REFUNDED'] },
        };
        if (createdAt) where.createdAt = createdAt;
        if (query.customerId) where.customerId = query.customerId;
        if (query.search?.trim()) {
            const key = query.search.trim();
            where.OR = [
                { invoiceNo: { contains: key, mode: 'insensitive' } },
                { customer: { is: { name: { contains: key, mode: 'insensitive' } } } },
                { customer: { is: { phone: { contains: key, mode: 'insensitive' } } } },
                { loyaltyCustomer: { is: { name: { contains: key, mode: 'insensitive' } } } },
                { loyaltyCustomer: { is: { phone: { contains: key, mode: 'insensitive' } } } },
            ];
        }

        const invoices = await (prisma as any).pOSInvoice.findMany({
            where,
            include: {
                customer: { select: { id: true, name: true, phone: true } },
                loyaltyCustomer: { select: { id: true, name: true, phone: true } },
                createdBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const now = Date.now();
        const rows = invoices.map((inv: any) => {
            const grandTotal = Number(inv.grandTotal || 0);
            const received = Number(inv.cashReceived || 0);
            const outstanding = Math.max(0, grandTotal - received);
            const daysOutstanding = Math.max(
                0,
                Math.floor((now - new Date(inv.createdAt).getTime()) / (24 * 60 * 60 * 1000))
            );
            return {
                id: inv.id,
                invoiceNo: inv.invoiceNo,
                createdAt: inv.createdAt,
                customer: inv.customer,
                loyaltyCustomer: inv.loyaltyCustomer,
                createdBy: inv.createdBy,
                status: inv.status,
                isPosted: Boolean(inv.isPosted),
                paymentMethod: inv.paymentMethod,
                grandTotal,
                received,
                outstanding,
                daysOutstanding,
                isOverdue: daysOutstanding > query.minDays,
            };
        });

        const overdueRows = rows
            .filter((row: any) => Number(row.outstanding || 0) > 0.000001 && Number(row.daysOutstanding || 0) > query.minDays)
            .sort((a: any, b: any) => Number(b.daysOutstanding || 0) - Number(a.daysOutstanding || 0));
        const total = overdueRows.length;
        const pagedRows = overdueRows.slice(skip, skip + take);

        const summaryAcc = overdueRows.reduce((acc: any, row: any) => {
            acc.totalOutstanding += Number(row.outstanding || 0);
            acc.totalInvoiced += Number(row.grandTotal || 0);
            acc.totalReceived += Number(row.received || 0);
            acc.totalDays += Number(row.daysOutstanding || 0);
            if (Number(row.daysOutstanding || 0) > 90) acc.severeCount += 1;
            return acc;
        }, {
            totalOutstanding: 0,
            totalInvoiced: 0,
            totalReceived: 0,
            totalDays: 0,
            severeCount: 0,
        });

        sendSuccess(res, pagedRows, {
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            summary: {
                invoiceCount: total,
                totalInvoiced: summaryAcc.totalInvoiced,
                totalReceived: summaryAcc.totalReceived,
                totalOutstanding: summaryAcc.totalOutstanding,
                averageOutstanding: total > 0 ? summaryAcc.totalOutstanding / total : 0,
                averageDaysOutstanding: total > 0 ? summaryAcc.totalDays / total : 0,
                severeCount: summaryAcc.severeCount,
                minDays: query.minDays,
            },
        });
    } catch (error) { next(error); }
});

// GET /sales/payments - list credit invoices and collected amounts
salesRoutes.get('/payments', requirePermission(PERMISSIONS.SALES_PAYMENT_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;
        const query = salesPaymentsQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const createdAt = getCreatedAtDateRange(query.startDate, query.endDate);

        const where: any = {
            companyId,
            branchId: { in: branchIds },
            isPosted: true,
            paymentMethod: 'CREDIT',
            status: { notIn: ['VOID', 'UNPOSTED', 'REFUNDED'] },
        };
        if (createdAt) where.createdAt = createdAt;
        if (query.customerId) where.customerId = query.customerId;
        if (query.state === 'open') where.status = { in: ['CREDIT', 'PARTIAL'] };
        if (query.state === 'closed') where.status = 'PAID';
        if (query.search?.trim()) {
            const key = query.search.trim();
            where.OR = [
                { invoiceNo: { contains: key, mode: 'insensitive' } },
                { customer: { is: { name: { contains: key, mode: 'insensitive' } } } },
                { customer: { is: { phone: { contains: key, mode: 'insensitive' } } } },
                { loyaltyCustomer: { is: { name: { contains: key, mode: 'insensitive' } } } },
                { loyaltyCustomer: { is: { phone: { contains: key, mode: 'insensitive' } } } },
            ];
        }

        const [invoices, total, agg] = await Promise.all([
            (prisma as any).pOSInvoice.findMany({
                where,
                skip,
                take,
                include: {
                    customer: { select: { id: true, name: true, phone: true, creditBalance: true, savingBalance: true } },
                    loyaltyCustomer: { select: { id: true, name: true, phone: true } },
                    createdBy: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            (prisma as any).pOSInvoice.count({ where }),
            (prisma as any).pOSInvoice.aggregate({
                where,
                _sum: { grandTotal: true, cashReceived: true },
                _count: { id: true },
            }),
        ]);

        const rows = invoices.map((inv: any) => {
            const totalAmount = Number(inv.grandTotal || 0);
            const paid = Number(inv.cashReceived || 0);
            const outstanding = Math.max(0, totalAmount - paid);
            return {
                id: inv.id,
                invoiceNo: inv.invoiceNo,
                createdAt: inv.createdAt,
                customer: inv.customer,
                loyaltyCustomer: inv.loyaltyCustomer,
                createdBy: inv.createdBy,
                status: inv.status,
                totalAmount,
                paidAmount: paid,
                outstandingAmount: outstanding,
            };
        });

        const totalAmount = Number(agg?._sum?.grandTotal || 0);
        const totalPaid = Number(agg?._sum?.cashReceived || 0);
        const totalOutstanding = Math.max(0, totalAmount - totalPaid);

        sendSuccess(res, rows, {
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            summary: {
                invoiceCount: Number(agg?._count?.id || 0),
                totalAmount,
                totalPaid,
                totalOutstanding,
            },
        });
    } catch (error) { next(error); }
});

// GET /sales/invoices/:id/payments - payment summary and receipt history
salesRoutes.get('/invoices/:id/payments', requirePermission(PERMISSIONS.SALES_PAYMENT_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const invoiceId = String(req.params.id);

        const invoice = await (prisma as any).pOSInvoice.findFirst({
            where: {
                id: invoiceId,
                companyId,
                branchId: { in: req.userBranchIds! },
            },
            select: {
                id: true,
                invoiceNo: true,
                createdAt: true,
                paymentMethod: true,
                status: true,
                grandTotal: true,
                cashReceived: true,
                customerId: true,
                customer: { select: { id: true, name: true, phone: true, creditBalance: true, savingBalance: true } },
            },
        });
        if (!invoice) throw AppError.notFound('Invoice');

        const entries = await prisma.journalEntry.findMany({
            where: {
                companyId,
                sourceType: 'SalesPayment',
                sourceId: invoiceId,
            },
            include: {
                postedBy: { select: { id: true, name: true } },
                lines: {
                    select: { debit: true, credit: true },
                },
            },
            orderBy: { date: 'desc' },
        });

        const payments = entries.map((entry: any) => {
            const totalDebit = (entry.lines || []).reduce((sum: number, line: any) => sum + Number(line.debit || 0), 0);
            const totalCredit = (entry.lines || []).reduce((sum: number, line: any) => sum + Number(line.credit || 0), 0);
            return {
                id: entry.id,
                paymentNo: entry.entryNo,
                paymentDate: entry.date,
                amount: totalDebit > 0 ? totalDebit : totalCredit,
                paymentMethod: 'CASH/BANK',
                referenceNo: null,
                notes: entry.memo || null,
                createdBy: entry.postedBy,
            };
        });

        const totalAmount = Number(invoice.grandTotal || 0);
        const paidAmount = Number(invoice.cashReceived || 0);
        const outstandingAmount = Math.max(0, totalAmount - paidAmount);

        sendSuccess(res, {
            invoice: {
                ...invoice,
                totalAmount,
                paidAmount,
                outstandingAmount,
            },
            payments,
            totals: {
                totalAmount,
                paidAmount,
                outstandingAmount,
            },
        });
    } catch (error) { next(error); }
});

// POST /sales/invoices/:id/payments - receive customer payment for credit invoice
salesRoutes.post('/invoices/:id/payments', requirePermission(PERMISSIONS.SALES_PAYMENT_RECEIVE), requireBranch, validate({ body: salesReceivePaymentSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        const invoiceId = String(req.params.id);
        const { amount, paymentMethod, paymentDate, referenceNo, notes } = req.body as z.infer<typeof salesReceivePaymentSchema>;
        const normalizedPaymentMethod = String(paymentMethod || '').trim().toUpperCase();
        if (!['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE'].includes(normalizedPaymentMethod) && !normalizedPaymentMethod.startsWith('CASH_') && !normalizedPaymentMethod.startsWith('CARD_') && !normalizedPaymentMethod.startsWith('BANK_') && !normalizedPaymentMethod.startsWith('MOBILE_')) {
            throw AppError.badRequest('Payment method must be a valid cash, card, bank, or mobile payment type');
        }

        const result = await prisma.$transaction(async (tx) => {
            const invoice: any = await (tx as any).pOSInvoice.findFirst({
                where: {
                    id: invoiceId,
                    companyId,
                    branchId: { in: req.userBranchIds! },
                },
                select: {
                    id: true,
                    invoiceNo: true,
                    paymentMethod: true,
                    status: true,
                    isPosted: true,
                    customerId: true,
                    grandTotal: true,
                    cashReceived: true,
                    branchId: true,
                },
            });
            if (!invoice) throw AppError.notFound('Invoice');
            if (!invoice.isPosted || invoice.status === 'VOID' || invoice.status === 'UNPOSTED' || invoice.status === 'REFUNDED') {
                throw AppError.badRequest('Cannot receive payment for this invoice status');
            }
            if (String(invoice.paymentMethod) !== 'CREDIT') {
                throw AppError.badRequest('Only CREDIT invoices can receive payment in this module');
            }
            if (!invoice.customerId) {
                throw AppError.badRequest('Customer is required for CREDIT invoice payment');
            }

            const totalAmount = Number(invoice.grandTotal || 0);
            const alreadyPaid = Number(invoice.cashReceived || 0);
            const outstanding = Math.max(0, totalAmount - alreadyPaid);
            if (outstanding <= 0) throw AppError.badRequest('Invoice has no outstanding balance');

            const postedAt = paymentDate ? new Date(paymentDate) : new Date();
            if (Number.isNaN(postedAt.getTime())) throw AppError.badRequest('Invalid payment date');

            const paymentAmount = Number(amount);
            const excessAmount = Math.max(0, paymentAmount - outstanding);
            const appliedAmount = Math.min(paymentAmount, outstanding);

            const newPaid = alreadyPaid + appliedAmount;
            const newOutstanding = Math.max(0, totalAmount - newPaid);
            const newStatus = newOutstanding <= 0.000001 ? 'PAID' : 'PARTIAL';

            await (tx as any).pOSInvoice.update({
                where: { id: invoice.id },
                data: {
                    cashReceived: newPaid,
                    status: newStatus,
                },
            });

            if (excessAmount > 0) {
                await (tx as any).customer.update({
                    where: { id: String(invoice.customerId) },
                    data: {
                        creditBalance: { increment: excessAmount },
                        savingBalance: { increment: excessAmount },
                    },
                });
            }

            const journalEntry = await CoreAccountingService.recordSalesPayment(tx as any, {
                companyId,
                branchId: invoice.branchId,
                invoiceId: invoice.id,
                invoiceNo: invoice.invoiceNo,
                customerId: String(invoice.customerId),
                amount: paymentAmount,
                paymentMethod: normalizedPaymentMethod,
                postedAt,
                postedById: userId,
                referenceNo: referenceNo || null,
                notes: notes || null,
            });

            return {
                invoiceId: invoice.id,
                invoiceNo: invoice.invoiceNo,
                paymentDate: postedAt,
                amount: paymentAmount,
                paymentMethod: normalizedPaymentMethod,
                referenceNo: referenceNo || null,
                notes: notes || null,
                totals: {
                    totalAmount,
                    paidAmount: newPaid,
                    outstandingAmount: newOutstanding,
                    excessAmount,
                },
                status: newStatus,
                journalEntryNo: journalEntry.entryNo,
            };
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result, undefined, 201);
    } catch (error) { next(error); }
});

// GET /sales/returns
salesRoutes.get('/returns', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = {
            companyId: req.user!.companyId,
            branchId: { in: req.userBranchIds! },
        };
        if (query.search) {
            where.OR = [
                { returnNo: { contains: query.search, mode: 'insensitive' } },
                { invoice: { is: { invoiceNo: { contains: query.search, mode: 'insensitive' } } } },
                { customer: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
            ];
        }

        const [rows, total] = await Promise.all([
            (prisma as any).salesReturn.findMany({
                where,
                skip,
                take,
                include: {
                    invoice: { select: { id: true, invoiceNo: true } },
                    customer: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            (prisma as any).salesReturn.count({ where }),
        ]);

        sendPaginated(res, rows, total, page, limit);
    } catch (error) { next(error); }
});

// GET /sales/returns/:id
salesRoutes.get('/returns/:id', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const row = await (prisma as any).salesReturn.findFirst({
            where: {
                id: req.params.id,
                companyId: req.user!.companyId,
                branchId: { in: req.userBranchIds! },
            },
            include: {
                invoice: { select: { id: true, invoiceNo: true, paymentMethod: true, createdAt: true } },
                customer: { select: { id: true, name: true, customerCode: true } },
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: { select: { id: true, itemCode: true, name: true } },
                        invoiceItem: { select: { id: true, qty: true, unitCode: true } },
                    }
                }
            }
        });
        if (!row) throw AppError.notFound('Sales Return');
        sendSuccess(res, row);
    } catch (error) { next(error); }
});

// GET /sales/invoices/:id/return-candidates
salesRoutes.get('/invoices/:id/return-candidates', requirePermission(PERMISSIONS.SALES_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const invoice = await (prisma as any).pOSInvoice.findFirst({
            where: {
                id: req.params.id,
                companyId: req.user!.companyId,
                branchId: { in: req.userBranchIds! },
            },
            include: {
                customer: { select: { id: true, name: true, customerCode: true } },
                items: {
                    include: {
                        product: { select: { id: true, itemCode: true, name: true, units: { select: { unitCode: true, isBase: true, qtyInBaseUnit: true } } } },
                    },
                },
            },
        });
        if (!invoice) throw AppError.notFound('Invoice');
        if (!invoice.isPosted || invoice.status === 'VOID' || invoice.status === 'UNPOSTED') {
            throw AppError.badRequest('Only posted non-void invoices can be returned');
        }

        const returned = await (prisma as any).salesReturnItem.groupBy({
            by: ['invoiceItemId'],
            where: {
                invoiceItemId: { in: invoice.items.map((x: any) => x.id) },
                salesReturn: { is: { companyId: req.user!.companyId, status: 'POSTED' } },
            },
            _sum: { qty: true },
        });
        const returnedMap = new Map<string, number>(returned.map((x: any) => [x.invoiceItemId, Number(x._sum.qty || 0)]));

        const productIds = invoice.items.map((i: any) => i.productId);
        const stocks = await prisma.inventoryStock.findMany({
            where: {
                companyId: req.user!.companyId,
                branchId: invoice.branchId,
                productId: { in: productIds }
            }
        });
        const stockMap = new Map(stocks.map(s => [s.productId, Number(s.qtyOnHand || 0)]));

        const items = invoice.items.map((item: any) => {
            const product = item.product as any;
            const returnedQty = returnedMap.get(item.id) || 0;
            const invoiceQtyAvailable = Number(item.qty) - returnedQty;

            const baseUnit = product.units?.find((u: any) => u.isBase);
            const currentUnit = product.units?.find((u: any) => u.unitCode === item.unitCode);

            let physicalQtyAvailable = 999999999;
            if (baseUnit && currentUnit) {
                const stockInBase = stockMap.get(item.productId) || 0;
                physicalQtyAvailable = stockInBase / Number(currentUnit.qtyInBaseUnit || 1);
            }

            return {
                id: item.id,
                product: item.product,
                productId: item.productId,
                unitCode: item.unitCode,
                unitPrice: item.unitPrice,
                discount: item.discount,
                taxAmount: item.taxAmount,
                lineTotal: item.lineTotal,
                qtyInvoiced: Number(item.qty),
                qtyReturned: returnedQty,
                qtyAvailable: Math.max(0, Math.min(invoiceQtyAvailable, physicalQtyAvailable)),
                invoiceQtyAvailable,
                physicalQtyAvailable,
            };
        });

        sendSuccess(res, {
            invoice: {
                id: invoice.id,
                invoiceNo: invoice.invoiceNo,
                customer: invoice.customer,
                grandTotal: invoice.grandTotal,
                paymentMethod: invoice.paymentMethod,
                createdAt: invoice.createdAt,
            },
            items,
        });
    } catch (error) { next(error); }
});

// POST /sales/invoices/:id/returns
salesRoutes.post('/invoices/:id/returns', requirePermission(PERMISSIONS.SALES_RETURN), requireBranch, validate({ body: salesReturnSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        const invoiceId = req.params.id;
        const { reason, notes, items } = req.body as z.infer<typeof salesReturnSchema>;
        const actorIsManagerOrAdmin = await isManagerOrAdminUser(req);

        const result = await prisma.$transaction(async (tx) => {
            const invoice: any = await (tx as any).pOSInvoice.findFirst({
                where: {
                    id: invoiceId,
                    companyId,
                    branchId: { in: req.userBranchIds! },
                },
                include: { items: true },
            });
            if (!invoice) throw AppError.notFound('Invoice');
            if (!invoice.isPosted || invoice.status === 'VOID' || invoice.status === 'UNPOSTED') {
                throw AppError.badRequest('Only posted non-void invoices can be returned');
            }

            if (invoice.posTerminalId) {
                const policy = await getPosTerminalPolicy(companyId, String(invoice.posTerminalId));
                if (!policy.allowPosReturns && !actorIsManagerOrAdmin) {
                    throw AppError.forbidden('Returns are disabled for this POS terminal');
                }
                const ageDays = Math.max(0, Math.floor((Date.now() - new Date(invoice.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
                if (!actorIsManagerOrAdmin && ageDays > Number(policy.returnWindowDays || 0)) {
                    throw AppError.badRequest(`Return window exceeded (${policy.returnWindowDays} days)`);
                }
                if (!actorIsManagerOrAdmin && policy.requireSameShiftForReturns) {
                    const openShift = await (tx as any).pOSShift.findFirst({
                        where: {
                            companyId,
                            terminalId: String(invoice.posTerminalId),
                            userId,
                            status: 'OPEN',
                        },
                        select: { id: true },
                    });
                    if (!openShift || String(openShift.id) !== String(invoice.posShiftId || '')) {
                        throw AppError.forbidden('Return allowed only in same open shift for this POS invoice');
                    }
                }
            }

            const invoiceItems: any[] = Array.isArray(invoice.items) ? invoice.items : [];
            const itemMap = new Map<string, any>(invoiceItems.map((i: any) => [i.id, i]));
            const requestedIds = items.map((x) => x.invoiceItemId);
            if (new Set(requestedIds).size !== requestedIds.length) {
                throw AppError.badRequest('Duplicate return lines are not allowed');
            }

            const returned = await (tx as any).salesReturnItem.groupBy({
                by: ['invoiceItemId'],
                where: {
                    invoiceItemId: { in: requestedIds },
                    salesReturn: { is: { companyId, status: 'POSTED' } },
                },
                _sum: { qty: true },
            });
            const returnedMap = new Map<string, number>(returned.map((x: any) => [x.invoiceItemId, Number(x._sum.qty || 0)]));

            let subtotal = 0;
            let taxTotal = 0;
            const prepared = items.map((line) => {
                const src = itemMap.get(line.invoiceItemId);
                if (!src) throw AppError.badRequest('Invalid invoice item reference');
                const alreadyReturned = returnedMap.get(src.id) || 0;
                const available = Number(src.qty) - alreadyReturned;
                if (line.qty > available) {
                    throw AppError.badRequest(`Return qty exceeds available qty for invoice item ${src.id}`);
                }

                const unitPrice = Number(src.unitPrice || 0);
                const unitDiscount = Number(src.qty) > 0 ? Number(src.discount || 0) / Number(src.qty) : 0;
                const unitTax = Number(src.qty) > 0 ? Number(src.taxAmount || 0) / Number(src.qty) : 0;
                const lineDiscount = roundMoney(Number(line.qty) * unitDiscount);
                const lineTax = roundMoney(Number(line.qty) * unitTax);
                const lineTotal = roundMoney(Number(line.qty) * unitPrice - lineDiscount);
                subtotal = roundMoney(subtotal + lineTotal);
                taxTotal = roundMoney(taxTotal + lineTax);

                return {
                    invoiceItemId: src.id,
                    productId: src.productId,
                    unitCode: src.unitCode,
                    qty: Number(line.qty),
                    unitPrice,
                    discount: lineDiscount,
                    taxAmount: lineTax,
                    lineTotal,
                };
            });

            const grandTotal = subtotal + taxTotal;
            const returnNo = formatDocNo('SR', await nextCounter(tx as any, companyId, 'SALES_RETURN', String(invoice.branchId)));

            const row = await (tx as any).salesReturn.create({
                data: {
                    companyId,
                    branchId: invoice.branchId,
                    invoiceId: invoice.id,
                    customerId: invoice.customerId,
                    returnNo,
                    subtotal,
                    taxTotal,
                    grandTotal,
                    status: 'POSTED',
                    reason,
                    notes: [
                        notes || null,
                        actorIsManagerOrAdmin ? `[Manager/Admin Override by ${req.user?.email || userId}]` : null,
                    ].filter(Boolean).join(' | ') || null,
                    createdById: userId,
                    items: {
                        create: prepared,
                    },
                },
                include: { items: true },
            });

            // Build per-product historical sold cost from the original sale movements.
            const saleMovements = await (tx as any).stockMovement.findMany({
                where: {
                    companyId,
                    branchId: invoice.branchId,
                    referenceType: 'POSInvoice',
                    referenceId: invoice.id,
                    type: 'POS_SALE',
                },
                select: {
                    productId: true,
                    unitCode: true,
                    qty: true,
                    cost: true,
                },
            });
            const saleCostMap = new Map<string, { qty: number; totalCost: number }>();
            for (const movement of saleMovements) {
                const key = `${movement.productId}::${movement.unitCode}`;
                const qty = Math.abs(Number(movement.qty || 0));
                const totalCost = qty * Number(movement.cost || 0);
                const current = saleCostMap.get(key) || { qty: 0, totalCost: 0 };
                saleCostMap.set(key, {
                    qty: current.qty + qty,
                    totalCost: current.totalCost + totalCost,
                });
            }

            const restockedItems: Array<{ productId: string; qty: number; unitCost: number; lineTotal: number }> = [];

            // Restock + movement
            for (const line of prepared) {
                const key = `${line.productId}::${line.unitCode}`;
                const soldCostBag = saleCostMap.get(key);
                const historicalUnitCost = soldCostBag && soldCostBag.qty > 0
                    ? soldCostBag.totalCost / soldCostBag.qty
                    : 0;

                const { movement } = await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: invoice.branchId,
                    productId: line.productId,
                    unitCode: line.unitCode,
                    qtyChange: line.qty,
                    cost: historicalUnitCost,
                    price: line.unitPrice,
                    type: 'RETURN',
                    referenceType: 'SalesReturn',
                    referenceId: row.id,
                    createdById: userId,
                });

                restockedItems.push({
                    productId: line.productId,
                    qty: Number(line.qty),
                    unitCost: Number(movement?.cost || historicalUnitCost || 0),
                    lineTotal: Number(line.lineTotal || 0),
                });
            }

            const allReturned = await (tx as any).salesReturnItem.groupBy({
                by: ['invoiceItemId'],
                where: {
                    invoiceItemId: { in: invoiceItems.map((x: any) => x.id) },
                    salesReturn: { is: { companyId, status: 'POSTED' } },
                },
                _sum: { qty: true },
            });
            const allReturnedMap = new Map<string, number>(allReturned.map((x: any) => [x.invoiceItemId, Number(x._sum.qty || 0)]));
            const fullyReturned = invoiceItems.every((it: any) => (allReturnedMap.get(it.id) || 0) >= Number(it.qty));
            await (tx as any).pOSInvoice.update({
                where: { id: invoice.id },
                data: { status: fullyReturned ? 'REFUNDED' : 'PARTIAL' },
            });

            const roundMoney = (value: number): number => Math.round(Number(value || 0) * 100) / 100;
            let cashRefund: number | undefined;
            let bankRefund: number | undefined;
            if (isMixedType(String(invoice.paymentMethod || '').toUpperCase())) {
                const originalNetCash = roundMoney(
                    Math.max(0, Number(invoice.cashReceived || 0) - Math.max(0, Number(invoice.changeGiven || 0)))
                );
                const originalGrandTotal = roundMoney(Number(invoice.grandTotal || 0));
                const cashRatio = originalGrandTotal > 0 ? originalNetCash / originalGrandTotal : 0;
                cashRefund = roundMoney(grandTotal * cashRatio);
                bankRefund = roundMoney(grandTotal - cashRefund);
            }

            const journalEntry = await CoreAccountingService.recordSalesReturn(tx as any, {
                id: row.id,
                companyId,
                branchId: invoice.branchId,
                returnNo: row.returnNo,
                invoiceNo: invoice.invoiceNo,
                customerId: invoice.customerId || undefined,
                originalPaymentMethod: invoice.paymentMethod,
                taxTotal,
                grandTotal,
                postedAt: new Date(),
                postedById: userId,
                cashRefund,
                bankRefund,
                items: restockedItems.map((item) => ({
                    productId: item.productId,
                    qty: item.qty,
                    unitCost: item.unitCost,
                    lineTotal: item.lineTotal,
                })),
            });

            return { ...row, journalEntryNo: journalEntry.entryNo };
        }, { maxWait: 10000, timeout: 30000 });

        sendSuccess(res, result, undefined, 201);
    } catch (error) { next(error); }
});

// ══════════════════════════════════════════════════════════════
// SALES ORDERS
// ══════════════════════════════════════════════════════════════

// GET /sales/orders
salesRoutes.get('/orders', requirePermission(PERMISSIONS.SALES_ORDER_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = salesOrderQuerySchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const companyId = req.user!.companyId;
        const branchIds = req.userBranchIds!;

        const where: any = { companyId, branchId: { in: branchIds } };

        if (query.state === 'active') {
            where.status = { in: ['DRAFT', 'CONFIRMED', 'PROCESSING', 'SHIPPED'] };
        } else if (query.state === 'completed') {
            where.status = { in: ['DELIVERED', 'INVOICED'] };
        } else if (query.state === 'cancelled') {
            where.status = 'CANCELLED';
        }

        const createdAt = getCreatedAtDateRange(query.startDate, query.endDate);
        if (createdAt) where.createdAt = createdAt;

        if (query.search?.trim()) {
            const search = query.search.trim();
            where.OR = [
                { orderNo: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
            ];
        }

        const [rows, total] = await Promise.all([
            (prisma as any).salesOrder.findMany({
                where,
                skip,
                take,
                include: {
                    customer: { select: { id: true, name: true, customerCode: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            (prisma as any).salesOrder.count({ where }),
        ]);

        sendPaginated(res, rows, total, page, limit);
    } catch (error) { next(error); }
});

// GET /sales/orders/:id
salesRoutes.get('/orders/:id', requirePermission(PERMISSIONS.SALES_ORDER_VIEW), requireBranch, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const row = await (prisma as any).salesOrder.findFirst({
            where: {
                id: req.params.id,
                companyId: req.user!.companyId,
                branchId: { in: req.userBranchIds! },
            },
            include: {
                customer: { select: { id: true, name: true, customerCode: true, phone: true, email: true, allowCreditSales: true } },
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: { select: { id: true, name: true, itemCode: true, units: { select: { unitCode: true, unitName: true } } } },
                    },
                },
                invoices: { select: { id: true, invoiceNo: true, status: true, grandTotal: true } },
            },
        });

        if (!row) throw AppError.notFound('Sales Order');
        sendSuccess(res, row);
    } catch (error) { next(error); }
});

// POST /sales/orders
salesRoutes.post('/orders', requirePermission(PERMISSIONS.SALES_ORDER_CREATE), requireBranch, validate({ body: salesOrderCreateSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const branchId = req.activeBranchId!;
        const userId = req.user!.id;
        const body = req.body as z.infer<typeof salesOrderCreateSchema>;

        const { preparedItems, subtotal, taxTotal, discountTotal } = await validateAndCalculateTaxes(companyId, body.items);
        const documentSettings = await loadCompanyDocumentSettings(prisma as any, companyId);
        const orderNo = formatDocNo(
            documentSettings.salesOrderPrefix,
            await nextCounter(prisma as any, companyId, 'SALES_ORDER', branchId)
        );

        const row = await (prisma as any).salesOrder.create({
            data: {
                companyId,
                branchId,
                orderNo,
                customerId: body.customerId || null,
                customerName: body.customerName || null,
                date: body.date ? new Date(body.date) : new Date(),
                deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
                subtotal,
                taxTotal,
                discountTotal,
                grandTotal: subtotal + taxTotal,
                notes: body.notes,
                terms: body.terms,
                createdById: userId,
                status: 'DRAFT',
                items: { create: preparedItems }
            },
            include: { items: true }
        });

        sendSuccess(res, row, { message: 'Sales Order created' }, 201);
    } catch (error) { next(error); }
});

// PATCH /sales/orders/:id
salesRoutes.patch('/orders/:id', requirePermission(PERMISSIONS.SALES_ORDER_CREATE), requireBranch, validate({ body: salesOrderUpdateSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id;
        const companyId = req.user!.companyId;
        const body = req.body as z.infer<typeof salesOrderUpdateSchema>;

        const existing = await (prisma as any).salesOrder.findFirst({
            where: { id, companyId, branchId: { in: req.userBranchIds! } },
        });
        if (!existing) throw AppError.notFound('Sales Order');
        if (existing.status === 'INVOICED' || existing.status === 'CANCELLED') throw AppError.badRequest(`Cannot edit order in ${existing.status} status`);

        const data: any = {};
        if (body.status) data.status = body.status;
        if (body.notes !== undefined) data.notes = body.notes;
        if (body.terms !== undefined) data.terms = body.terms;
        if (body.deliveryDate !== undefined) data.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
        if (body.customerId !== undefined) data.customerId = body.customerId;
        if (body.customerName !== undefined) data.customerName = body.customerName;

        if (body.items) {
            const taxRes = await validateAndCalculateTaxes(companyId, body.items);
            const preparedItems = taxRes.preparedItems;
            data.subtotal = taxRes.subtotal;
            data.taxTotal = taxRes.taxTotal;
            data.discountTotal = taxRes.discountTotal;
            data.grandTotal = taxRes.subtotal + taxRes.taxTotal;

            await prisma.$transaction(async (tx) => {
                await (tx as any).salesOrderItem.deleteMany({ where: { orderId: id } });
                await (tx as any).salesOrder.update({
                    where: { id },
                    data: {
                        ...data,
                        items: { create: preparedItems as any[] }
                    }
                });
            });
        } else {
            await (prisma as any).salesOrder.update({ where: { id }, data });
        }

        sendSuccess(res, { message: 'Order updated' });
    } catch (error) { next(error); }
});

// POST /sales/orders/:id/convert
salesRoutes.post('/orders/:id/convert', requirePermission(PERMISSIONS.SALES_QUOTATION_CONVERT), requireBranch, validate({ body: salesOrderConvertSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const orderId = req.params.id;
        const paymentMethod = String(req.body?.paymentMethod || 'CREDIT').toUpperCase();

        const result = await prisma.$transaction(async (tx) => {
            const order: any = await (tx as any).salesOrder.findFirst({
                where: {
                    id: orderId,
                    companyId,
                    branchId: { in: req.userBranchIds! },
                },
                include: { items: true }
            });

            if (!order) throw AppError.notFound('Sales Order');
            if (order.status === 'INVOICED') throw AppError.badRequest('Order is already invoiced');
            if (order.status === 'CANCELLED') throw AppError.badRequest('Cannot invoice a cancelled order');
            if (isCreditType(paymentMethod) && !order.customerId) {
                throw AppError.badRequest('Customer is required for CREDIT payment');
            }
            if (isCreditType(paymentMethod) && order.customerId) {
                const customer = await tx.customer.findFirst({
                    where: { id: order.customerId, companyId },
                    select: { id: true, allowCreditSales: true },
                });
                if (!customer) throw AppError.notFound('Customer');
                if (customer.allowCreditSales === false) {
                    throw AppError.badRequest('Selected customer is not allowed for CREDIT sales');
                }
            }

            // Create Invoice
            const documentSettings = await loadCompanyDocumentSettings(tx as any, companyId);
            const invoiceNo = formatDocNo(
                documentSettings.invoicePrefix,
                await nextCounter(tx as any, companyId, 'SALES_INVOICE', String(order.branchId))
            );
            const invoice = await (tx as any).pOSInvoice.create({
                data: {
                    companyId,
                    branchId: order.branchId,
                    invoiceNo,
                    customerId: order.customerId,
                    salesOrderId: order.id,
                    subtotal: order.subtotal,
                    taxTotal: order.taxTotal,
                    discountTotal: order.discountTotal,
                    grandTotal: order.grandTotal,
                    paymentMethod,
                    status: 'UNPOSTED',
                    isPosted: false,
                    notes: `Converted from Sales Order ${order.orderNo}`,
                    createdById: req.user!.id,
                    items: {
                        create: order.items.map((item: any) => {
                            if (!item.productId) throw AppError.badRequest(`Order line "${item.description}" has no product and cannot be converted to invoice`);
                            return {
                                productId: item.productId,
                                unitCode: item.unitCode || 'UNIT',
                                qty: item.qty,
                                unitPrice: item.unitPrice,
                                discount: item.discount,
                                taxAmount: item.taxAmount,
                                lineTotal: item.lineTotal
                            };
                        })
                    }
                }
            });

            // Update Order Status
            await (tx as any).salesOrder.update({
                where: { id: orderId },
                data: { status: 'INVOICED' }
            });

            return {
                orderId: order.id,
                orderNo: order.orderNo,
                invoiceId: invoice.id,
                invoiceNo: invoice.invoiceNo
            };
        });

        sendSuccess(res, result, { message: 'Order converted to invoice' });
    } catch (error) { next(error); }
});
