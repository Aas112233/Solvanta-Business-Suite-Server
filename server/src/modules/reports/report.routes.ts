import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { basePrisma, prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/response.js';

export const reportRoutes = Router();
reportRoutes.use(authenticate, requirePermission(PERMISSIONS.REPORTS_VIEW));

const ADMIN_BRANCH_PERMISSION = PERMISSIONS.ADMIN_MANAGE_BRANCHES;

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(ADMIN_BRANCH_PERMISSION);
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

function parseDateOrThrow(value: unknown, fieldName: string): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw AppError.badRequest(`Invalid ${fieldName}`);
    }
    return date;
}

const toRawObjectId = (id: string) => ({ $oid: id });
const toRawDate = (date: Date) => ({ $date: date.toISOString() });

function buildRawCompanyBranchFilter(companyId: string, branchFilter?: unknown): Record<string, unknown> {
    const filter: Record<string, unknown> = { companyId: toRawObjectId(companyId) };

    if (typeof branchFilter === 'string' && branchFilter) {
        filter.branchId = toRawObjectId(branchFilter);
        return filter;
    }

    const branchIds = Array.isArray((branchFilter as { in?: string[] } | undefined)?.in)
        ? (branchFilter as { in: string[] }).in.filter(Boolean)
        : [];

    if (branchIds.length > 0) {
        filter.branchId = { $in: branchIds.map((id) => toRawObjectId(id)) };
    }

    return filter;
}

async function countDocumentsRaw(collection: string, filter: Record<string, unknown>): Promise<number> {
    const result = await basePrisma.$runCommandRaw({
        count: collection,
        query: filter as any,
    });

    return Number((result as { n?: number | string } | null)?.n ?? 0);
}

async function countActiveProductsRaw(companyId: string): Promise<number> {
    return countDocumentsRaw('products', {
        companyId: toRawObjectId(companyId),
        status: 'ACTIVE',
        deletedAt: { $exists: false },
    });
}

async function countActiveCustomersRaw(companyId: string): Promise<number> {
    return countDocumentsRaw('customers', {
        companyId: toRawObjectId(companyId),
        deletedAt: { $exists: false },
    });
}

function normalizeRawObjectId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && typeof (value as { $oid?: unknown }).$oid === 'string') {
        return (value as { $oid: string }).$oid;
    }
    return null;
}

function normalizeRawDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'object') {
        const rawValue = (value as { $date?: unknown }).$date;
        if (typeof rawValue === 'string' || typeof rawValue === 'number') {
            const parsed = new Date(rawValue);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        if (typeof rawValue === 'object' && rawValue && typeof (rawValue as { $numberLong?: unknown }).$numberLong === 'string') {
            const parsed = new Date(Number((rawValue as { $numberLong: string }).$numberLong));
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
    }

    return null;
}

function normalizeRawNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value) || 0;
    if (typeof value === 'object' && value) {
        if (typeof (value as { $numberDouble?: unknown }).$numberDouble === 'string') {
            return Number((value as { $numberDouble: string }).$numberDouble) || 0;
        }
        if (typeof (value as { $numberInt?: unknown }).$numberInt === 'string') {
            return Number((value as { $numberInt: string }).$numberInt) || 0;
        }
        if (typeof (value as { $numberLong?: unknown }).$numberLong === 'string') {
            return Number((value as { $numberLong: string }).$numberLong) || 0;
        }
    }
    return Number(value || 0) || 0;
}

async function fetchDashboardPurchasesRaw(args: {
    companyId: string;
    branchFilter?: unknown;
    from: Date;
    to: Date;
}): Promise<Array<{ createdAt: Date; grandTotal: number; supplierId: string | null; supplier: { name: string } | null }>> {
    const match = {
        ...buildRawCompanyBranchFilter(args.companyId, args.branchFilter),
        createdAt: {
            $gte: toRawDate(args.from),
            $lte: toRawDate(args.to),
        },
    };

    const rawRows = await (basePrisma.purchaseInvoice as any).aggregateRaw({
        pipeline: [
            { $match: match },
            {
                $project: {
                    _id: 0,
                    createdAt: 1,
                    grandTotal: 1,
                    supplierId: 1,
                },
            },
        ],
    }) as Array<{ createdAt?: unknown; grandTotal?: unknown; supplierId?: unknown }>;

    const supplierIds = Array.from(new Set(
        rawRows
            .map((row) => normalizeRawObjectId(row.supplierId))
            .filter((value): value is string => Boolean(value))
    ));

    const suppliers = supplierIds.length > 0
        ? await basePrisma.supplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, name: true },
        })
        : [];

    const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

    return rawRows
        .map((row) => {
            const createdAt = normalizeRawDate(row.createdAt);
            if (!createdAt) return null;

            const supplierId = normalizeRawObjectId(row.supplierId);

            return {
                createdAt,
                grandTotal: normalizeRawNumber(row.grandTotal),
                supplierId,
                supplier: supplierId ? { name: supplierNameById.get(supplierId) || 'Unknown' } : null,
            };
        })
        .filter((row): row is { createdAt: Date; grandTotal: number; supplierId: string | null; supplier: { name: string } | null } => Boolean(row));
}

// GET /reports/sales
reportRoutes.get('/sales', async (req, res, next) => {
    try {
        const { branchId, dateFrom, dateTo } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId, status: { not: 'VOID' } });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) where.createdAt.lte = new Date(dateTo);
        }

        const [summary, invoices, byPaymentMethod] = await Promise.all([
            prisma.pOSInvoice.aggregate({
                where,
                _sum: { grandTotal: true, taxTotal: true, discountTotal: true, subtotal: true },
                _count: true,
            }),
            prisma.pOSInvoice.findMany({
                where,
                include: {
                    branch: { select: { name: true } },
                    customer: { select: { name: true } },
                    createdBy: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            }),
            prisma.pOSInvoice.groupBy({
                by: ['paymentMethod'],
                where,
                _sum: { grandTotal: true },
                _count: true,
            }),
        ]);

        sendSuccess(res, {
            summary: {
                totalSales: summary._sum.grandTotal || 0,
                totalTax: summary._sum.taxTotal || 0,
                totalDiscount: summary._sum.discountTotal || 0,
                invoiceCount: summary._count,
            },
            byPaymentMethod,
            invoices,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchases
reportRoutes.get('/purchases', async (req, res, next) => {
    try {
        const { branchId, dateFrom, dateTo } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) where.createdAt.lte = new Date(dateTo);
        }

        const [summary, purchases] = await Promise.all([
            prisma.purchaseInvoice.aggregate({
                where,
                _sum: { grandTotal: true, taxTotal: true },
                _count: true,
            }),
            prisma.purchaseInvoice.findMany({
                where,
                include: {
                    supplier: { select: { name: true } },
                    branch: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            }),
        ]);

        sendSuccess(res, {
            summary: {
                totalPurchases: summary._sum.grandTotal || 0,
                totalTax: summary._sum.taxTotal || 0,
                invoiceCount: summary._count,
            },
            purchases,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchase-order-report
reportRoutes.get('/purchase-order-report', async (req, res, next) => {
    try {
        const {
            branchId,
            dateFrom,
            dateTo,
            includeZeroRequired,
            supplierId,
            productId,
            itemGroupId,
            categoryId,
            brandId,
            search,
        } = req.query as any;
        const companyId = req.user!.companyId;
        const now = new Date();

        const fromDate = parseDateOrThrow(dateFrom, 'dateFrom') || new Date(now.getFullYear(), now.getMonth(), 1);
        fromDate.setHours(0, 0, 0, 0);
        const parsedToDate = parseDateOrThrow(dateTo, 'dateTo');
        const toDateValue = parsedToDate || now;
        const toDate = new Date(toDateValue);
        if (typeof dateTo === 'string' && dateTo.length <= 10) {
            toDate.setHours(23, 59, 59, 999);
        } else if (!parsedToDate) {
            toDate.setHours(23, 59, 59, 999);
        }
        if (fromDate.getTime() > toDate.getTime()) {
            throw AppError.badRequest('dateFrom cannot be greater than dateTo');
        }

        const includeZero = String(includeZeroRequired || '').toLowerCase() === 'true'
            || String(includeZeroRequired || '') === '1';

        const salesInvoiceWhere: any = applyUserBranchScope(req, {
            companyId,
            status: { not: 'VOID' },
            isPosted: true,
            createdAt: { gte: fromDate, lte: toDate },
        });
        const stockWhere: any = applyUserBranchScope(req, { companyId });
        const purchaseInvoiceWhere: any = applyUserBranchScope(req, {
            companyId,
            status: { not: 'CANCELLED' },
        });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            salesInvoiceWhere.branchId = branchId;
            stockWhere.branchId = branchId;
            purchaseInvoiceWhere.branchId = branchId;
        }

        const [soldItems, stockItems] = await Promise.all([
            prisma.pOSInvoiceItem.findMany({
                where: {
                    invoice: { is: salesInvoiceWhere },
                },
                select: {
                    productId: true,
                    unitCode: true,
                    qty: true,
                    product: {
                        select: {
                            id: true,
                            itemCode: true,
                            name: true,
                            categoryId: true,
                            itemGroupId: true,
                            brandId: true,
                            units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true, isBase: true } },
                        },
                    },
                },
            }),
            prisma.inventoryStock.findMany({
                where: stockWhere,
                select: {
                    productId: true,
                    unitCode: true,
                    qtyOnHand: true,
                },
            }),
        ]);

        const productMap = new Map<string, any>();
        const soldQtyMap = new Map<string, number>();
        const stockQtyMap = new Map<string, number>();

        const getUnitFactor = (units: any[], unitCode?: string | null): number => {
            const match = units?.find((u: any) => String(u.unitCode || '').toLowerCase() === String(unitCode || '').toLowerCase());
            const factor = Number(match?.qtyInBaseUnit || 0);
            return factor > 0 ? factor : 1;
        };

        soldItems.forEach((line: any) => {
            if (line.product) productMap.set(line.productId, line.product);
            const units = line.product?.units || [];
            const factor = getUnitFactor(units, line.unitCode);
            const normalizedQty = Number(line.qty || 0) * factor;
            soldQtyMap.set(line.productId, Number(soldQtyMap.get(line.productId) || 0) + normalizedQty);
        });

        const productIds = Array.from(new Set([
            ...Array.from(soldQtyMap.keys()),
            ...stockItems.map((line: any) => line.productId),
        ]));
        if (productIds.length === 0) {
            const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
            sendSuccess(res, {
                summary: {
                    analyzedItems: 0,
                    reportItems: 0,
                    requiredItems: 0,
                    totalSoldQty: 0,
                    totalCurrentStock: 0,
                    totalRequiredQty: 0,
                    totalRequiredValueExVat: 0,
                    totalRequiredValueIncVat: 0,
                    periodDays: Math.max(1, diffDays),
                },
                items: [],
            });
            return;
        }

        const missingProductIds = productIds.filter((id) => !productMap.has(id));
        if (missingProductIds.length > 0) {
            const missingProducts = await prisma.product.findMany({
                where: { id: { in: missingProductIds } },
                select: {
                    id: true,
                    itemCode: true,
                    name: true,
                    categoryId: true,
                    itemGroupId: true,
                    brandId: true,
                    units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true, isBase: true } },
                },
            });
            missingProducts.forEach((p: any) => productMap.set(p.id, p));
        }

        stockQtyMap.clear();
        stockItems.forEach((line: any) => {
            const product = productMap.get(line.productId);
            const units = product?.units || [];
            const factor = getUnitFactor(units, line.unitCode);
            const normalizedQty = Number(line.qtyOnHand || 0) * factor;
            stockQtyMap.set(line.productId, Number(stockQtyMap.get(line.productId) || 0) + normalizedQty);
        });

        const latestPurchases = await prisma.purchaseInvoiceItem.findMany({
            where: {
                productId: { in: productIds },
                invoice: { is: purchaseInvoiceWhere },
            },
            select: {
                productId: true,
                unitCode: true,
                qty: true,
                unitCost: true,
                taxAmount: true,
                invoice: {
                    select: {
                        createdAt: true,
                        supplier: { select: { id: true, name: true, supplierCode: true, phone: true } },
                    },
                },
            },
            orderBy: [
                { invoice: { createdAt: 'desc' } },
            ],
            take: 20000,
        });

        const latestPurchaseByProduct = new Map<string, any>();
        latestPurchases.forEach((entry: any) => {
            if (!latestPurchaseByProduct.has(entry.productId)) {
                latestPurchaseByProduct.set(entry.productId, entry);
            }
        });

        const rowsUnfiltered = productIds.map((productId) => {
            const product = productMap.get(productId);
            const units = product?.units || [];
            const baseUnit = units.find((u: any) => Boolean(u.isBase)) || units[0];
            const soldQty = Number(soldQtyMap.get(productId) || 0);
            const currentStock = Number(stockQtyMap.get(productId) || 0);
            const requiredQty = Math.max(0, soldQty - currentStock);
            const suggestedOrderQty = requiredQty;

            const latestPurchase = latestPurchaseByProduct.get(productId);
            const supplier = latestPurchase?.invoice?.supplier;
            let unitPurchasePriceExVat = 0;
            let unitPurchasePriceIncVat = 0;
            if (latestPurchase) {
                const factor = getUnitFactor(units, latestPurchase.unitCode);
                const costPerUnit = Number(latestPurchase.unitCost || 0);
                const qty = Number(latestPurchase.qty || 0);
                const taxPerUnit = qty > 0 ? Number(latestPurchase.taxAmount || 0) / qty : 0;
                unitPurchasePriceExVat = costPerUnit / factor;
                unitPurchasePriceIncVat = (costPerUnit + taxPerUnit) / factor;
            }

            return {
                productId,
                itemCode: product?.itemCode || '',
                itemName: product?.name || 'Unknown Item',
                categoryId: product?.categoryId || null,
                itemGroupId: product?.itemGroupId || null,
                brandId: product?.brandId || null,
                baseUnitCode: baseUnit?.unitCode || '',
                baseUnitName: baseUnit?.unitName || baseUnit?.unitCode || '',
                supplierId: supplier?.id || null,
                supplierName: supplier?.name || null,
                supplierCode: supplier?.supplierCode || null,
                supplierPhone: supplier?.phone || null,
                soldQty,
                currentStock,
                requiredQty,
                suggestedOrderQty,
                unitPurchasePriceExVat,
                unitPurchasePriceIncVat,
                lastPurchasedAt: latestPurchase?.invoice?.createdAt || null,
            };
        });

        let rows = rowsUnfiltered;
        if (productId) {
            rows = rows.filter((row: any) => row.productId === productId);
        }
        if (itemGroupId) {
            rows = rows.filter((row: any) => row.itemGroupId === itemGroupId);
        }
        if (categoryId) {
            rows = rows.filter((row: any) => row.categoryId === categoryId);
        }
        if (brandId) {
            rows = rows.filter((row: any) => row.brandId === brandId);
        }

        rows = rows.filter((row) => includeZero || row.requiredQty > 0);
        if (supplierId) {
            rows = rows.filter((row) => row.supplierId === supplierId);
        }
        if (typeof search === 'string' && search.trim()) {
            const s = search.trim().toLowerCase();
            rows = rows.filter((row) =>
                String(row.itemCode || '').toLowerCase().includes(s)
                || String(row.itemName || '').toLowerCase().includes(s)
                || String(row.supplierName || '').toLowerCase().includes(s)
                || String(row.supplierCode || '').toLowerCase().includes(s)
            );
        }

        rows.sort((a, b) =>
            Number(b.requiredQty || 0) - Number(a.requiredQty || 0)
            || Number(b.soldQty || 0) - Number(a.soldQty || 0)
            || String(a.itemName || '').localeCompare(String(b.itemName || ''))
        );

        const totals = rows.reduce(
            (acc, row) => {
                acc.totalSoldQty += Number(row.soldQty || 0);
                acc.totalCurrentStock += Number(row.currentStock || 0);
                acc.totalRequiredQty += Number(row.requiredQty || 0);
                acc.totalRequiredValueExVat += Number(row.requiredQty || 0) * Number(row.unitPurchasePriceExVat || 0);
                acc.totalRequiredValueIncVat += Number(row.requiredQty || 0) * Number(row.unitPurchasePriceIncVat || 0);
                return acc;
            },
            {
                totalSoldQty: 0,
                totalCurrentStock: 0,
                totalRequiredQty: 0,
                totalRequiredValueExVat: 0,
                totalRequiredValueIncVat: 0,
            }
        );

        const startDay = new Date(fromDate);
        startDay.setHours(0, 0, 0, 0);
        const endDay = new Date(toDate);
        endDay.setHours(0, 0, 0, 0);
        const periodDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / 86400000) + 1);

        sendSuccess(res, {
            summary: {
                analyzedItems: productIds.length,
                reportItems: rows.length,
                requiredItems: rows.filter((row) => Number(row.requiredQty || 0) > 0).length,
                totalSoldQty: totals.totalSoldQty,
                totalCurrentStock: totals.totalCurrentStock,
                totalRequiredQty: totals.totalRequiredQty,
                totalRequiredValueExVat: totals.totalRequiredValueExVat,
                totalRequiredValueIncVat: totals.totalRequiredValueIncVat,
                periodDays,
            },
            items: rows,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchase-invoices-filter-options
reportRoutes.get('/purchase-invoices-filter-options', async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;

        const [products, categories, groups, brands] = await Promise.all([
            prisma.product.findMany({
                where: { companyId, deletedAt: { isSet: false } },
                select: {
                    id: true,
                    itemCode: true,
                    name: true,
                    categoryId: true,
                    itemGroupId: true,
                    brandId: true,
                },
                orderBy: { name: 'asc' },
                take: 2000,
            }),
            prisma.category.findMany({
                where: { companyId },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
            (prisma as any).itemGroup.findMany({
                where: { companyId },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
            prisma.brand.findMany({
                where: { companyId },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
        ]);

        sendSuccess(res, {
            products,
            categories,
            groups,
            brands,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchase-invoices-report
reportRoutes.get('/purchase-invoices-report', async (req, res, next) => {
    try {
        const {
            branchId,
            supplierId,
            productId,
            itemGroupId,
            categoryId,
            brandId,
            dateFrom,
            dateTo,
        } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (supplierId) where.supplierId = supplierId;

        const itemFilter: Record<string, any> = {};
        if (productId) itemFilter.productId = productId;
        const productFilter: Record<string, any> = {};
        if (itemGroupId) productFilter.itemGroupId = itemGroupId;
        if (categoryId) productFilter.categoryId = categoryId;
        if (brandId) productFilter.brandId = brandId;
        if (Object.keys(productFilter).length > 0) {
            itemFilter.product = { is: productFilter };
        }
        if (Object.keys(itemFilter).length > 0) {
            where.items = { some: itemFilter };
        }

        const fromDate = parseDateOrThrow(dateFrom, 'dateFrom');
        const toDate = parseDateOrThrow(dateTo, 'dateTo');
        if (fromDate || toDate) {
            where.createdAt = {};
            if (fromDate) where.createdAt.gte = fromDate;
            if (toDate) {
                const inclusiveTo = new Date(toDate);
                if (typeof dateTo === 'string' && dateTo.length <= 10) {
                    inclusiveTo.setHours(23, 59, 59, 999);
                }
                where.createdAt.lte = inclusiveTo;
            }
        }

        const [summary, invoices] = await Promise.all([
            prisma.purchaseInvoice.aggregate({
                where,
                _sum: { grandTotal: true, taxTotal: true },
                _count: true,
            }),
            prisma.purchaseInvoice.findMany({
                where,
                include: {
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    createdBy: { select: { id: true, name: true } },
                    items: {
                        where: Object.keys(itemFilter).length > 0 ? itemFilter : undefined,
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    itemCode: true,
                                    name: true,
                                    units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true, isBase: true } },
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 1000,
            }),
        ]);

        sendSuccess(res, {
            summary: {
                count: summary._count,
                totalAmount: summary._sum.grandTotal || 0,
                totalTax: summary._sum.taxTotal || 0,
            },
            invoices,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchases-on-date
reportRoutes.get('/purchases-on-date', async (req, res, next) => {
    try {
        const {
            date,
            branchId,
            supplierId,
            productId,
            itemGroupId,
            categoryId,
            brandId,
            search,
        } = req.query as any;
        const companyId = req.user!.companyId;

        const targetDate = parseDateOrThrow(date || new Date().toISOString().slice(0, 10), 'date')!;
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const invoiceWhere: any = applyUserBranchScope(req, {
            companyId,
            createdAt: { gte: startOfDay, lte: endOfDay },
        });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            invoiceWhere.branchId = branchId;
        }
        if (supplierId) invoiceWhere.supplierId = supplierId;

        const itemWhere: any = {
            invoice: { is: invoiceWhere },
        };
        if (productId) itemWhere.productId = productId;

        const productWhere: Record<string, any> = {};
        if (itemGroupId) productWhere.itemGroupId = itemGroupId;
        if (categoryId) productWhere.categoryId = categoryId;
        if (brandId) productWhere.brandId = brandId;
        if (Object.keys(productWhere).length > 0) {
            itemWhere.product = { is: productWhere };
        }

        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            itemWhere.OR = [
                { invoice: { is: { purchaseNo: { contains: s, mode: 'insensitive' } } } },
                { invoice: { is: { invoiceNoSupplier: { contains: s, mode: 'insensitive' } } } },
                { invoice: { is: { supplier: { is: { name: { contains: s, mode: 'insensitive' } } } } } },
                { product: { is: { itemCode: { contains: s, mode: 'insensitive' } } } },
                { product: { is: { name: { contains: s, mode: 'insensitive' } } } },
            ];
        }

        const lines = await prisma.purchaseInvoiceItem.findMany({
            where: itemWhere,
            include: {
                invoice: {
                    select: {
                        id: true,
                        purchaseNo: true,
                        createdAt: true,
                        supplier: { select: { id: true, name: true, supplierCode: true } },
                        branch: { select: { id: true, name: true, code: true } },
                        createdBy: { select: { id: true, name: true } },
                    },
                },
                product: {
                    select: {
                        id: true,
                        itemCode: true,
                        name: true,
                        categoryId: true,
                        itemGroupId: true,
                        brandId: true,
                        category: { select: { id: true, name: true } },
                        itemGroup: { select: { id: true, name: true } },
                        brand: { select: { id: true, name: true } },
                        units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true, isBase: true } },
                    },
                },
            },
            orderBy: [
                { invoice: { createdAt: 'desc' } },
                { product: { name: 'asc' } },
            ],
            take: 3000,
        });

        const summary = lines.reduce(
            (acc, line: any) => {
                acc.totalQty += Number(line.qty || 0);
                acc.totalAmount += Number(line.lineTotal || 0);
                acc.totalTax += Number(line.taxAmount || 0);
                return acc;
            },
            { totalQty: 0, totalAmount: 0, totalTax: 0 }
        );
        const uniqueInvoices = new Set(lines.map((line: any) => line.invoice?.id).filter(Boolean));

        sendSuccess(res, {
            summary: {
                lineCount: lines.length,
                invoiceCount: uniqueInvoices.size,
                totalQty: summary.totalQty,
                totalAmount: summary.totalAmount,
                totalTax: summary.totalTax,
            },
            items: lines,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchase-payments-filter-options
reportRoutes.get('/purchase-payments-filter-options', async (req, res, next) => {
    try {
        const { branchId, supplierId, search } = req.query as any;
        const companyId = req.user!.companyId;

        const invoiceWhere: any = applyUserBranchScope(req, { companyId });
        const methodWhere: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            invoiceWhere.branchId = branchId;
            methodWhere.branchId = branchId;
        }
        if (supplierId) {
            invoiceWhere.supplierId = supplierId;
            methodWhere.supplierId = supplierId;
        }

        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            invoiceWhere.OR = [
                { purchaseNo: { contains: s, mode: 'insensitive' } },
                { invoiceNoSupplier: { contains: s, mode: 'insensitive' } },
                { supplier: { is: { name: { contains: s, mode: 'insensitive' } } } },
            ];
        }

        const [invoices, paymentMethodsRaw] = await Promise.all([
            prisma.purchaseInvoice.findMany({
                where: invoiceWhere,
                select: {
                    id: true,
                    purchaseNo: true,
                    supplierId: true,
                    branchId: true,
                    createdAt: true,
                    supplier: { select: { id: true, name: true } },
                    branch: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 1500,
            }),
            (prisma as any).purchasePayment.groupBy({
                by: ['paymentMethod'],
                where: methodWhere,
                _count: true,
            }),
        ]);

        const paymentMethods = paymentMethodsRaw
            .map((m: any) => String(m?.paymentMethod || '').trim())
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b));

        sendSuccess(res, {
            invoices,
            paymentMethods,
            statuses: ['POSTED', 'VOID', 'ALL'],
        });
    } catch (error) { next(error); }
});

// GET /reports/purchase-returns-filter-options
reportRoutes.get('/purchase-returns-filter-options', async (req, res, next) => {
    try {
        const { branchId, supplierId, search } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (supplierId) where.supplierId = supplierId;

        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            where.OR = [
                { returnNo: { contains: s, mode: 'insensitive' } },
                { purchaseInvoice: { is: { purchaseNo: { contains: s, mode: 'insensitive' } } } },
                { supplier: { is: { name: { contains: s, mode: 'insensitive' } } } },
            ];
        }

        const returns = await (prisma as any).purchaseReturn.findMany({
            where,
            select: {
                purchaseInvoice: { select: { id: true, purchaseNo: true } },
                supplier: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 3000,
        });

        const invoicesMap = new Map<string, { id: string; purchaseNo: string; supplierName: string; branchName: string }>();
        returns.forEach((r: any) => {
            const invoiceId = r?.purchaseInvoice?.id;
            if (!invoiceId || invoicesMap.has(invoiceId)) return;
            invoicesMap.set(invoiceId, {
                id: invoiceId,
                purchaseNo: r.purchaseInvoice?.purchaseNo || '',
                supplierName: r.supplier?.name || '',
                branchName: r.branch?.name || '',
            });
        });

        sendSuccess(res, {
            invoices: Array.from(invoicesMap.values()),
            statuses: ['POSTED', 'CANCELLED', 'DRAFT', 'ALL'],
        });
    } catch (error) { next(error); }
});

// GET /reports/purchase-returns-report
reportRoutes.get('/purchase-returns-report', async (req, res, next) => {
    try {
        const {
            branchId,
            supplierId,
            purchaseInvoiceId,
            status,
            dateFrom,
            dateTo,
            search,
        } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (supplierId) where.supplierId = supplierId;
        if (purchaseInvoiceId) where.purchaseInvoiceId = purchaseInvoiceId;
        if (status && String(status).toUpperCase() !== 'ALL') {
            const normalizedStatus = String(status).toUpperCase();
            if (['POSTED', 'CANCELLED', 'DRAFT'].includes(normalizedStatus)) {
                where.status = normalizedStatus;
            } else {
                where.status = 'POSTED';
            }
        } else if (!status) {
            where.status = 'POSTED';
        }

        const fromDate = parseDateOrThrow(dateFrom, 'dateFrom');
        const toDate = parseDateOrThrow(dateTo, 'dateTo');
        if (fromDate || toDate) {
            where.createdAt = {};
            if (fromDate) where.createdAt.gte = fromDate;
            if (toDate) {
                const inclusiveTo = new Date(toDate);
                if (typeof dateTo === 'string' && dateTo.length <= 10) {
                    inclusiveTo.setHours(23, 59, 59, 999);
                }
                where.createdAt.lte = inclusiveTo;
            }
        }

        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            where.OR = [
                { returnNo: { contains: s, mode: 'insensitive' } },
                { reason: { contains: s, mode: 'insensitive' } },
                { notes: { contains: s, mode: 'insensitive' } },
                { purchaseInvoice: { is: { purchaseNo: { contains: s, mode: 'insensitive' } } } },
                { supplier: { is: { name: { contains: s, mode: 'insensitive' } } } },
                { createdBy: { is: { name: { contains: s, mode: 'insensitive' } } } },
            ];
        }

        const [summaryAgg, byStatus, returns] = await Promise.all([
            (prisma as any).purchaseReturn.aggregate({
                where,
                _sum: { grandTotal: true, taxTotal: true },
                _avg: { grandTotal: true },
                _count: true,
            }),
            (prisma as any).purchaseReturn.groupBy({
                by: ['status'],
                where,
                _sum: { grandTotal: true },
                _count: true,
            }),
            (prisma as any).purchaseReturn.findMany({
                where,
                include: {
                    purchaseInvoice: { select: { id: true, purchaseNo: true } },
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: [{ createdAt: 'desc' }],
                take: 3000,
            }),
        ]);

        const supplierIds = new Set(returns.map((r: any) => r.supplierId).filter(Boolean));
        const invoiceIds = new Set(returns.map((r: any) => r.purchaseInvoiceId).filter(Boolean));

        sendSuccess(res, {
            summary: {
                count: summaryAgg._count,
                totalAmount: Number(summaryAgg._sum.grandTotal || 0),
                totalTax: Number(summaryAgg._sum.taxTotal || 0),
                averageAmount: Number(summaryAgg._avg.grandTotal || 0),
                uniqueSuppliers: supplierIds.size,
                uniqueInvoices: invoiceIds.size,
            },
            byStatus,
            returns,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchase-payments-report
reportRoutes.get('/purchase-payments-report', async (req, res, next) => {
    try {
        const {
            branchId,
            supplierId,
            purchaseInvoiceId,
            paymentMethod,
            status,
            dateFrom,
            dateTo,
            search,
        } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (supplierId) where.supplierId = supplierId;
        if (purchaseInvoiceId) where.purchaseInvoiceId = purchaseInvoiceId;
        if (paymentMethod) where.paymentMethod = String(paymentMethod).trim();
        if (status && String(status).toUpperCase() !== 'ALL') {
            const normalizedStatus = String(status).toUpperCase();
            if (['POSTED', 'VOID'].includes(normalizedStatus)) {
                where.status = normalizedStatus;
            } else {
                where.status = 'POSTED';
            }
        } else if (!status) {
            where.status = 'POSTED';
        }

        const fromDate = parseDateOrThrow(dateFrom, 'dateFrom');
        const toDate = parseDateOrThrow(dateTo, 'dateTo');
        if (fromDate || toDate) {
            where.paymentDate = {};
            if (fromDate) where.paymentDate.gte = fromDate;
            if (toDate) {
                const inclusiveTo = new Date(toDate);
                if (typeof dateTo === 'string' && dateTo.length <= 10) {
                    inclusiveTo.setHours(23, 59, 59, 999);
                }
                where.paymentDate.lte = inclusiveTo;
            }
        }

        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            where.OR = [
                { paymentNo: { contains: s, mode: 'insensitive' } },
                { referenceNo: { contains: s, mode: 'insensitive' } },
                { purchaseInvoice: { is: { purchaseNo: { contains: s, mode: 'insensitive' } } } },
                { supplier: { is: { name: { contains: s, mode: 'insensitive' } } } },
                { createdBy: { is: { name: { contains: s, mode: 'insensitive' } } } },
            ];
        }

        const [summaryAgg, byMethod, payments] = await Promise.all([
            (prisma as any).purchasePayment.aggregate({
                where,
                _sum: { amount: true },
                _avg: { amount: true },
                _count: true,
            }),
            (prisma as any).purchasePayment.groupBy({
                by: ['paymentMethod'],
                where,
                _sum: { amount: true },
                _count: true,
            }),
            (prisma as any).purchasePayment.findMany({
                where,
                include: {
                    purchaseInvoice: { select: { id: true, purchaseNo: true, grandTotal: true } },
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    createdBy: { select: { id: true, name: true } },
                },
                orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
                take: 3000,
            }),
        ]);

        const supplierIds = new Set(payments.map((p: any) => p.supplierId).filter(Boolean));
        const invoiceIds = new Set(payments.map((p: any) => p.purchaseInvoiceId).filter(Boolean));

        sendSuccess(res, {
            summary: {
                count: summaryAgg._count,
                totalAmount: Number(summaryAgg._sum.amount || 0),
                averageAmount: Number(summaryAgg._avg.amount || 0),
                uniqueSuppliers: supplierIds.size,
                uniqueInvoices: invoiceIds.size,
            },
            byMethod,
            payments,
        });
    } catch (error) { next(error); }
});

// GET /reports/stock-on-date
reportRoutes.get('/stock-on-date', async (req, res, next) => {
    try {
        const {
            date,
            branchId,
            productId,
            itemGroupId,
            categoryId,
            brandId,
            search,
        } = req.query as any;
        const companyId = req.user!.companyId;
        const targetDate = parseDateOrThrow(date || new Date().toISOString().slice(0, 10), 'date')!;
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const stockWhere: any = applyUserBranchScope(req, { companyId });
        const movementWhere: any = applyUserBranchScope(req, {
            companyId,
            createdAt: { gt: endOfDay },
        });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            stockWhere.branchId = branchId;
            movementWhere.branchId = branchId;
        }
        if (productId) {
            stockWhere.productId = productId;
            movementWhere.productId = productId;
        }

        const productFilter: Record<string, any> = {};
        if (itemGroupId) productFilter.itemGroupId = itemGroupId;
        if (categoryId) productFilter.categoryId = categoryId;
        if (brandId) productFilter.brandId = brandId;
        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            productFilter.OR = [
                { itemCode: { contains: s, mode: 'insensitive' } },
                { name: { contains: s, mode: 'insensitive' } },
            ];
        }
        if (Object.keys(productFilter).length > 0) {
            stockWhere.product = { is: productFilter };
            movementWhere.product = { is: productFilter };
        }

        const [currentStocks, futureMovements] = await Promise.all([
            prisma.inventoryStock.findMany({
                where: stockWhere,
                include: {
                    product: {
                        select: {
                            id: true,
                            itemCode: true,
                            name: true,
                            categoryId: true,
                            itemGroupId: true,
                            brandId: true,
                            category: { select: { id: true, name: true } },
                            itemGroup: { select: { id: true, name: true } },
                            brand: { select: { id: true, name: true } },
                            units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true, isBase: true } },
                        },
                    },
                    branch: { select: { id: true, name: true, code: true } },
                },
            }),
            prisma.stockMovement.findMany({
                where: movementWhere,
                select: {
                    id: true,
                    productId: true,
                    branchId: true,
                    unitCode: true,
                    qty: true,
                    product: {
                        select: {
                            id: true,
                            units: { select: { unitCode: true, qtyInBaseUnit: true, isBase: true } },
                        },
                    },
                },
            }),
        ]);

        const adjustmentByKey = new Map<string, number>();
        futureMovements.forEach((movement: any) => {
            const units = movement.product?.units || [];
            const matched = units.find((u: any) => String(u.unitCode || '').toLowerCase() === String(movement.unitCode || '').toLowerCase());
            const baseUnit = units.find((u: any) => Boolean(u.isBase));
            const factor = Number(matched?.qtyInBaseUnit || 0) || 1;
            const baseQty = Number(movement.qty || 0) * factor;
            const baseUnitCode = String(baseUnit?.unitCode || movement.unitCode || '');
            const key = `${movement.branchId}::${movement.productId}::${baseUnitCode}`;
            adjustmentByKey.set(key, Number(adjustmentByKey.get(key) || 0) + baseQty);
        });

        let totalValuation = 0;
        let totalQty = 0;
        const stocks = currentStocks
            .map((stock: any) => {
                const key = `${stock.branchId}::${stock.productId}::${stock.unitCode}`;
                const futureQtyChange = Number(adjustmentByKey.get(key) || 0);
                const qtyOnDate = Number(stock.qtyOnHand || 0) - futureQtyChange;
                if (qtyOnDate <= 0) return null;
                const valuation = qtyOnDate * Number(stock.avgCost || 0);
                totalQty += qtyOnDate;
                totalValuation += valuation;
                return {
                    ...stock,
                    qtyOnHand: qtyOnDate,
                    valuation,
                };
            })
            .filter(Boolean);

        const uniqueProducts = new Set(stocks.map((s: any) => s.productId).filter(Boolean));

        sendSuccess(res, {
            summary: {
                totalItems: stocks.length,
                totalProducts: uniqueProducts.size,
                totalQty,
                totalValuation,
                targetDate: endOfDay.toISOString().slice(0, 10),
            },
            stocks,
        });
    } catch (error) { next(error); }
});

// GET /reports/stock
reportRoutes.get('/stock', async (req, res, next) => {
    try {
        const {
            branchId,
            productId,
            itemGroupId,
            categoryId,
            brandId,
            search,
        } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId, qtyOnHand: { gt: 0 } });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (productId) where.productId = productId;

        const productFilter: Record<string, any> = {};
        if (itemGroupId) productFilter.itemGroupId = itemGroupId;
        if (categoryId) productFilter.categoryId = categoryId;
        if (brandId) productFilter.brandId = brandId;
        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            productFilter.OR = [
                { itemCode: { contains: s, mode: 'insensitive' } },
                { name: { contains: s, mode: 'insensitive' } },
            ];
        }
        if (Object.keys(productFilter).length > 0) {
            where.product = { is: productFilter };
        }

        const stocks = await prisma.inventoryStock.findMany({
            where,
            include: {
                product: {
                    select: {
                        id: true,
                        itemCode: true,
                        name: true,
                        categoryId: true,
                        itemGroupId: true,
                        brandId: true,
                        category: { select: { id: true, name: true } },
                        itemGroup: { select: { id: true, name: true } },
                        brand: { select: { id: true, name: true } },
                        units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true, isBase: true } },
                    },
                },
                branch: { select: { id: true, name: true, code: true } },
            },
            orderBy: { product: { name: 'asc' } },
        });

        // Calculate total valuation
        let totalValuation = 0;
        let totalQty = 0;
        const enriched = stocks.map((s) => {
            const value = Number(s.qtyOnHand) * Number(s.avgCost);
            totalValuation += value;
            totalQty += Number(s.qtyOnHand || 0);
            return { ...s, valuation: value };
        });
        const uniqueProducts = new Set(enriched.map((s: any) => s.productId).filter(Boolean));

        sendSuccess(res, {
            summary: {
                totalItems: stocks.length,
                totalProducts: uniqueProducts.size,
                totalQty,
                totalValuation,
            },
            stocks: enriched,
        });
    } catch (error) { next(error); }
});

// GET /reports/inventory-transaction-summary
reportRoutes.get('/inventory-transaction-summary', async (req, res, next) => {
    try {
        const {
            branchId,
            productId,
            itemGroupId,
            categoryId,
            brandId,
            search,
            dateFrom,
            dateTo,
        } = req.query as any;
        const companyId = req.user!.companyId;

        const now = new Date();
        const parsedFrom = parseDateOrThrow(dateFrom, 'dateFrom');
        const parsedTo = parseDateOrThrow(dateTo, 'dateTo');
        const from = parsedFrom || new Date(now.getFullYear(), now.getMonth(), 1);
        from.setHours(0, 0, 0, 0);
        const to = parsedTo || new Date(now);
        if (typeof dateTo === 'string' && dateTo.length <= 10) {
            to.setHours(23, 59, 59, 999);
        } else if (!parsedTo) {
            to.setHours(23, 59, 59, 999);
        }
        if (from.getTime() > to.getTime()) {
            throw AppError.badRequest('dateFrom cannot be greater than dateTo');
        }

        const stockWhere: any = applyUserBranchScope(req, { companyId });
        const periodMovementWhere: any = applyUserBranchScope(req, {
            companyId,
            createdAt: { gte: from, lte: to },
        });
        const openingMovementWhere: any = applyUserBranchScope(req, { companyId });

        if (branchId) {
            await assertBranchAccessible(req, branchId);
            stockWhere.branchId = branchId;
            periodMovementWhere.branchId = branchId;
            openingMovementWhere.branchId = branchId;
        }
        if (productId) {
            stockWhere.productId = productId;
            periodMovementWhere.productId = productId;
            openingMovementWhere.productId = productId;
        }

        const productFilter: Record<string, any> = {};
        if (itemGroupId) productFilter.itemGroupId = itemGroupId;
        if (categoryId) productFilter.categoryId = categoryId;
        if (brandId) productFilter.brandId = brandId;
        if (typeof search === 'string' && search.trim()) {
            const s = search.trim();
            productFilter.OR = [
                { itemCode: { contains: s, mode: 'insensitive' } },
                { name: { contains: s, mode: 'insensitive' } },
            ];
        }
        if (Object.keys(productFilter).length > 0) {
            stockWhere.product = { is: productFilter };
            periodMovementWhere.product = { is: productFilter };
            openingMovementWhere.product = { is: productFilter };
        }

        const movementSelect = {
            id: true,
            branchId: true,
            productId: true,
            unitCode: true,
            qty: true,
            type: true,
            referenceType: true,
            createdAt: true,
            product: {
                select: {
                    id: true,
                    itemCode: true,
                    name: true,
                    category: { select: { id: true, name: true } },
                    itemGroup: { select: { id: true, name: true } },
                    brand: { select: { id: true, name: true } },
                    units: { select: { unitCode: true, qtyInBaseUnit: true, isBase: true } },
                },
            },
            branch: { select: { id: true, name: true, code: true } },
        };

        const [periodMovements, openingMovements, currentStocks] = await Promise.all([
            prisma.stockMovement.findMany({
                where: periodMovementWhere,
                select: movementSelect,
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
            prisma.stockMovement.findMany({
                where: openingMovementWhere,
                select: movementSelect,
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
            prisma.inventoryStock.findMany({
                where: stockWhere,
                select: {
                    branchId: true,
                    productId: true,
                    qtyOnHand: true,
                    product: {
                        select: {
                            id: true,
                            itemCode: true,
                            name: true,
                            category: { select: { id: true, name: true } },
                            itemGroup: { select: { id: true, name: true } },
                            brand: { select: { id: true, name: true } },
                        },
                    },
                    branch: { select: { id: true, name: true, code: true } },
                },
            }),
        ]);

        const unitFactor = (units: Array<{ unitCode: string; qtyInBaseUnit: number; isBase: boolean }>, unitCode?: string | null): number => {
            const matched = units.find((u) => String(u.unitCode || '').toLowerCase() === String(unitCode || '').toLowerCase());
            const factor = Number(matched?.qtyInBaseUnit || 0);
            return factor > 0 ? factor : 1;
        };

        const reportMap = new Map<string, any>();
        const rowKey = (branchIdValue: string, productIdValue: string) => `${branchIdValue}::${productIdValue}`;
        const ensureRow = (branch: any, product: any) => {
            const key = rowKey(branch.id, product.id);
            if (!reportMap.has(key)) {
                reportMap.set(key, {
                    key,
                    branchId: branch.id,
                    branchName: branch.name || '',
                    branchCode: branch.code || '',
                    productId: product.id,
                    itemCode: product.itemCode || '',
                    itemName: product.name || '',
                    itemGroup: product.itemGroup?.name || '',
                    itemCategory: product.category?.name || '',
                    itemBrand: product.brand?.name || '',
                    openingStock: 0,
                    closingStock: 0,
                    purchase: 0,
                    sales: 0,
                    transferIn: 0,
                    transferOut: 0,
                    stockDamaged: 0,
                    purchaseReturn: 0,
                    salesReturn: 0,
                    internalUse: 0,
                    __openingSet: false,
                });
            }
            return reportMap.get(key);
        };

        // Opening stock = first positive stock entry for the item in the selected warehouse scope.
        for (const movement of openingMovements as any[]) {
            if (!movement?.product?.id || !movement?.branch?.id) continue;
            const row = ensureRow(movement.branch, movement.product);
            if (row.__openingSet) continue;
            const factor = unitFactor(movement.product?.units || [], movement.unitCode);
            const baseQty = Number(movement.qty || 0) * factor;
            if (baseQty > 0) {
                row.openingStock = baseQty;
                row.__openingSet = true;
            }
        }

        // Closing stock = latest current stock from inventory bucket.
        for (const stock of currentStocks as any[]) {
            if (!stock?.product?.id || !stock?.branch?.id) continue;
            const row = ensureRow(stock.branch, stock.product);
            row.closingStock += Number(stock.qtyOnHand || 0);
        }

        // Period transactions grouped by type.
        for (const movement of periodMovements as any[]) {
            if (!movement?.product?.id || !movement?.branch?.id) continue;
            const row = ensureRow(movement.branch, movement.product);
            const factor = unitFactor(movement.product?.units || [], movement.unitCode);
            const baseQty = Number(movement.qty || 0) * factor;
            const movementType = String(movement.type || '');
            const refType = String(movement.referenceType || '');

            if (movementType === 'PURCHASE_RECEIPT') {
                row.purchase += Math.max(baseQty, 0);
                continue;
            }
            if (movementType === 'POS_SALE') {
                row.sales += Math.abs(Math.min(baseQty, 0));
                continue;
            }
            if (movementType === 'TRANSFER_IN') {
                row.transferIn += Math.max(baseQty, 0);
                continue;
            }
            if (movementType === 'TRANSFER_OUT') {
                row.transferOut += Math.abs(Math.min(baseQty, 0));
                continue;
            }
            if (movementType === 'DAMAGE') {
                row.stockDamaged += Math.abs(baseQty);
                continue;
            }
            if (movementType === 'RETURN') {
                if (refType === 'PurchaseReturn') row.purchaseReturn += Math.abs(baseQty);
                if (refType === 'SalesReturn') row.salesReturn += Math.abs(baseQty);
                continue;
            }
            if (movementType === 'ADJUSTMENT' && refType === 'MANUAL_ADJUSTMENT' && baseQty < 0) {
                row.internalUse += Math.abs(baseQty);
            }
        }

        const rows = Array.from(reportMap.values())
            .map((row: any) => ({
                branchId: row.branchId,
                branchName: row.branchName,
                branchCode: row.branchCode,
                productId: row.productId,
                itemCode: row.itemCode,
                itemName: row.itemName,
                itemGroup: row.itemGroup,
                itemCategory: row.itemCategory,
                itemBrand: row.itemBrand,
                openingStock: Number(row.openingStock || 0),
                closingStock: Number(row.closingStock || 0),
                purchase: Number(row.purchase || 0),
                sales: Number(row.sales || 0),
                transferIn: Number(row.transferIn || 0),
                transferOut: Number(row.transferOut || 0),
                stockDamaged: Number(row.stockDamaged || 0),
                purchaseReturn: Number(row.purchaseReturn || 0),
                salesReturn: Number(row.salesReturn || 0),
                internalUse: Number(row.internalUse || 0),
            }))
            .filter((row: any) =>
                Number(row.openingStock || 0) > 0
                || Number(row.closingStock || 0) > 0
                || Number(row.purchase || 0) > 0
                || Number(row.sales || 0) > 0
                || Number(row.transferIn || 0) > 0
                || Number(row.transferOut || 0) > 0
                || Number(row.stockDamaged || 0) > 0
                || Number(row.purchaseReturn || 0) > 0
                || Number(row.salesReturn || 0) > 0
                || Number(row.internalUse || 0) > 0
            )
            .sort((a: any, b: any) =>
                String(a.branchName || '').localeCompare(String(b.branchName || ''))
                || String(a.itemName || '').localeCompare(String(b.itemName || ''))
            );

        const summary = rows.reduce(
            (acc: any, row: any) => {
                acc.totalOpeningStock += Number(row.openingStock || 0);
                acc.totalClosingStock += Number(row.closingStock || 0);
                acc.totalPurchase += Number(row.purchase || 0);
                acc.totalSales += Number(row.sales || 0);
                acc.totalTransferIn += Number(row.transferIn || 0);
                acc.totalTransferOut += Number(row.transferOut || 0);
                acc.totalStockDamaged += Number(row.stockDamaged || 0);
                acc.totalPurchaseReturn += Number(row.purchaseReturn || 0);
                acc.totalSalesReturn += Number(row.salesReturn || 0);
                acc.totalInternalUse += Number(row.internalUse || 0);
                return acc;
            },
            {
                rowCount: rows.length,
                totalOpeningStock: 0,
                totalClosingStock: 0,
                totalPurchase: 0,
                totalSales: 0,
                totalTransferIn: 0,
                totalTransferOut: 0,
                totalStockDamaged: 0,
                totalPurchaseReturn: 0,
                totalSalesReturn: 0,
                totalInternalUse: 0,
                periodFrom: from.toISOString(),
                periodTo: to.toISOString(),
            }
        );

        sendSuccess(res, { summary, items: rows });
    } catch (error) { next(error); }
});

// GET /reports/warehouses — High-level summary of all warehouses stock
reportRoutes.get('/warehouses', async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const scopedStockWhere = applyUserBranchScope(req, { companyId, qtyOnHand: { gt: 0 } });

        const [stockGroups, branches, allStocks] = await Promise.all([
            prisma.inventoryStock.groupBy({
                by: ['branchId'],
                where: scopedStockWhere,
                _count: { productId: true },
                _sum: { qtyOnHand: true },
            }),
            prisma.branch.findMany({
                where: isBranchAdmin(req) ? { companyId } : { companyId, id: { in: req.user!.branchIds } },
                select: { id: true, name: true, code: true }
            }),
            prisma.inventoryStock.findMany({
                where: scopedStockWhere,
                select: { branchId: true, qtyOnHand: true, avgCost: true }
            })
        ]);

        const report = branches.map(b => {
            const group = stockGroups.find(g => g.branchId === b.id);
            const branchStocks = allStocks.filter(s => s.branchId === b.id);
            const valuation = branchStocks.reduce((sum, s) => sum + (Number(s.qtyOnHand) * Number(s.avgCost)), 0);

            return {
                id: b.id,
                name: b.name,
                code: b.code,
                itemCount: group?._count.productId || 0,
                totalQty: Number(group?._sum.qtyOnHand || 0),
                totalValuation: valuation
            };
        });

        sendSuccess(res, report);
    } catch (error) { next(error); }
});

// GET /reports/vat
reportRoutes.get('/vat', async (req, res, next) => {
    try {
        const { dateFrom, dateTo, branchId, postedOnly } = req.query as any;
        const companyId = req.user!.companyId;

        const now = new Date();
        const parsedFrom = parseDateOrThrow(dateFrom, 'dateFrom');
        const parsedTo = parseDateOrThrow(dateTo, 'dateTo');
        const from = parsedFrom || new Date(now.getFullYear(), now.getMonth(), 1);
        from.setHours(0, 0, 0, 0);
        const to = parsedTo || new Date(now);
        if (typeof dateTo === 'string' && dateTo.length <= 10) {
            to.setHours(23, 59, 59, 999);
        } else if (!parsedTo) {
            to.setHours(23, 59, 59, 999);
        }
        if (from.getTime() > to.getTime()) {
            throw AppError.badRequest('dateFrom cannot be greater than dateTo');
        }

        const isPostedOnly = String(postedOnly ?? 'true').toLowerCase() !== 'false' && String(postedOnly ?? 'true') !== '0';

        const baseWhere: any = applyUserBranchScope(req, {
            companyId,
            createdAt: { gte: from, lte: to },
        });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            baseWhere.branchId = branchId;
        }

        const salesWhere: any = {
            ...baseWhere,
            status: { not: 'VOID' },
            ...(isPostedOnly ? { isPosted: true } : {}),
        };
        const purchaseWhere: any = {
            ...baseWhere,
            status: { not: 'CANCELLED' },
        };

        const [salesAgg, purchaseAgg, salesInvoices, purchaseInvoices, salesLines, purchaseLines] = await Promise.all([
            prisma.pOSInvoice.aggregate({
                where: salesWhere,
                _sum: { subtotal: true, taxTotal: true, grandTotal: true },
                _count: true,
            }),
            prisma.purchaseInvoice.aggregate({
                where: purchaseWhere,
                _sum: { subtotal: true, taxTotal: true, grandTotal: true },
                _count: true,
            }),
            prisma.pOSInvoice.findMany({
                where: salesWhere,
                select: {
                    id: true,
                    invoiceNo: true,
                    createdAt: true,
                    subtotal: true,
                    taxTotal: true,
                    grandTotal: true,
                    status: true,
                    isPosted: true,
                    customer: { select: { name: true, customerCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 1000,
            }),
            prisma.purchaseInvoice.findMany({
                where: purchaseWhere,
                select: {
                    id: true,
                    purchaseNo: true,
                    createdAt: true,
                    subtotal: true,
                    taxTotal: true,
                    grandTotal: true,
                    status: true,
                    supplier: { select: { name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 1000,
            }),
            prisma.pOSInvoiceItem.findMany({
                where: { invoice: { is: salesWhere } },
                select: { lineTotal: true, taxAmount: true },
            }),
            prisma.purchaseInvoiceItem.findMany({
                where: { invoice: { is: purchaseWhere } },
                select: { lineTotal: true, taxAmount: true },
            }),
        ]);

        const outputVAT = Number(salesAgg._sum.taxTotal || 0);
        const inputVAT = Number(purchaseAgg._sum.taxTotal || 0);
        const netVAT = outputVAT - inputVAT;
        const taxableSales = Number(salesAgg._sum.subtotal || 0);
        const taxablePurchases = Number(purchaseAgg._sum.subtotal || 0);
        const totalSales = Number(salesAgg._sum.grandTotal || 0);
        const totalPurchases = Number(purchaseAgg._sum.grandTotal || 0);

        const normalizeRate = (value: number): number => {
            if (!Number.isFinite(value) || value <= 0) return 0;
            return Number(value.toFixed(2));
        };
        const buildRateBuckets = (rows: Array<{ lineTotal: number; taxAmount: number }>) => {
            const map = new Map<number, { rate: number; taxableAmount: number; vatAmount: number; grossAmount: number }>();
            rows.forEach((row) => {
                const taxableAmount = Number(row.lineTotal || 0);
                const vatAmount = Number(row.taxAmount || 0);
                if (taxableAmount <= 0 && vatAmount <= 0) return;
                const rawRate = taxableAmount > 0 ? (vatAmount / taxableAmount) * 100 : 0;
                const rate = normalizeRate(rawRate);
                const existing = map.get(rate) || { rate, taxableAmount: 0, vatAmount: 0, grossAmount: 0 };
                existing.taxableAmount += taxableAmount;
                existing.vatAmount += vatAmount;
                existing.grossAmount += taxableAmount + vatAmount;
                map.set(rate, existing);
            });
            return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
        };

        const salesByRate = buildRateBuckets(salesLines as any);
        const purchasesByRate = buildRateBuckets(purchaseLines as any);

        const entries = [
            ...salesInvoices.map((invoice: any) => {
                const taxableAmount = Number(invoice.subtotal || 0);
                const vatAmount = Number(invoice.taxTotal || 0);
                const effectiveRate = taxableAmount > 0 ? Number(((vatAmount / taxableAmount) * 100).toFixed(2)) : 0;
                return {
                    id: invoice.id,
                    source: 'SALES',
                    docNo: invoice.invoiceNo,
                    date: invoice.createdAt,
                    party: invoice.customer?.name || '',
                    partyCode: invoice.customer?.customerCode || '',
                    branchId: invoice.branch?.id || null,
                    branchName: invoice.branch?.name || '',
                    taxableAmount,
                    vatAmount,
                    grossAmount: Number(invoice.grandTotal || 0),
                    effectiveRate,
                    status: invoice.status,
                    isPosted: Boolean(invoice.isPosted),
                };
            }),
            ...purchaseInvoices.map((invoice: any) => {
                const taxableAmount = Number(invoice.subtotal || 0);
                const vatAmount = Number(invoice.taxTotal || 0);
                const effectiveRate = taxableAmount > 0 ? Number(((vatAmount / taxableAmount) * 100).toFixed(2)) : 0;
                return {
                    id: invoice.id,
                    source: 'PURCHASE',
                    docNo: invoice.purchaseNo,
                    date: invoice.createdAt,
                    party: invoice.supplier?.name || '',
                    partyCode: invoice.supplier?.supplierCode || '',
                    branchId: invoice.branch?.id || null,
                    branchName: invoice.branch?.name || '',
                    taxableAmount,
                    vatAmount,
                    grossAmount: Number(invoice.grandTotal || 0),
                    effectiveRate,
                    status: invoice.status,
                    isPosted: true,
                };
            }),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        sendSuccess(res, {
            summary: {
                outputVAT,
                inputVAT,
                netVAT,
                netStatus: netVAT >= 0 ? 'PAYABLE' : 'REFUNDABLE',
                taxableSales,
                taxablePurchases,
                totalSales,
                totalPurchases,
                salesDocuments: Number((salesAgg as any)?._count || 0),
                purchaseDocuments: Number((purchaseAgg as any)?._count || 0),
                totalDocuments: Number((salesAgg as any)?._count || 0) + Number((purchaseAgg as any)?._count || 0),
                dateFrom: from.toISOString().slice(0, 10),
                dateTo: to.toISOString().slice(0, 10),
                postedOnly: isPostedOnly,
            },
            outputVAT,
            inputVAT,
            netVAT,
            totalSales,
            totalPurchases,
            salesInvoices,
            purchaseInvoices,
            entries,
            byRate: {
                sales: salesByRate,
                purchases: purchasesByRate,
            },
        });
    } catch (error) { next(error); }
});

// GET /reports/dashboard-consolidated
// One stop optimized analytical engine for the landing dashboard.
reportRoutes.get('/dashboard-consolidated', async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchId = req.query.branchId as string | undefined;
        const startDateParam = req.query.startDate as string | undefined;
        const endDateParam = req.query.endDate as string | undefined;

        const now = new Date();
        // Today is just for the "Today's Summary" card independently
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let filterStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        let filterEnd = new Date();
        filterEnd.setHours(23, 59, 59, 999);

        if (startDateParam) {
            filterStart = new Date(startDateParam);
            filterStart.setHours(0, 0, 0, 0);
        }
        if (endDateParam) {
            filterEnd = new Date(endDateParam);
            filterEnd.setHours(23, 59, 59, 999);
        }

        const dateFilter = { gte: filterStart, lte: filterEnd };

        const baseWhere: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            baseWhere.branchId = branchId;
        }

        // 1. Fetch data in parallel for speed
        // Split into batches to avoid overwhelming MongoDB connection
        const [
            todaySales,
            totalProducts,
            totalCustomers,
            lowStockCount,
            recentInvoices,
            financeAgg,
        ] = await Promise.all([
            // Summary Cards
            prisma.pOSInvoice.aggregate({
                where: { ...baseWhere, createdAt: { gte: today }, status: { not: 'VOID' } },
                _sum: { grandTotal: true },
                _count: true,
            }).catch((err) => {
                console.error('[Reports] Error fetching today sales:', err.message);
                return { _sum: { grandTotal: 0 }, _count: 0 };
            }),
            countActiveProductsRaw(companyId).catch((err) => {
                console.error('[Reports] Error counting products:', err.message);
                return { count: 0 };
            }),
            countActiveCustomersRaw(companyId).catch((err) => {
                console.error('[Reports] Error counting customers:', err.message);
                return { count: 0 };
            }),
            prisma.inventoryStock.count({
                where: { ...baseWhere, qtyOnHand: { lte: 10, gt: 0 } }
            }).catch((err) => {
                console.error('[Reports] Error counting low stock:', err.message);
                return 0;
            }),
            prisma.pOSInvoice.findMany({
                where: { ...baseWhere },
                include: {
                    customer: { select: { name: true } },
                    createdBy: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }).catch((err) => {
                console.error('[Reports] Error fetching recent invoices:', err.message);
                return [];
            }),
            // Consolidated Totals (Sales & Purchases)
            Promise.all([
                prisma.pOSInvoice.aggregate({
                    where: { ...baseWhere, createdAt: dateFilter, isPosted: true, status: { not: 'VOID' } },
                    _sum: { grandTotal: true, taxTotal: true }
                }).catch((err) => {
                    console.error('[Reports] Error aggregating sales:', err.message);
                    return { _sum: { grandTotal: 0, taxTotal: 0 } };
                }),
                prisma.purchaseInvoice.aggregate({
                    where: { ...baseWhere, createdAt: dateFilter },
                    _sum: { grandTotal: true, taxTotal: true }
                }).catch((err) => {
                    console.error('[Reports] Error aggregating purchases:', err.message);
                    return { _sum: { grandTotal: 0, taxTotal: 0 } };
                })
            ]),
        ]);

        // 2. Fetch trend data separately to avoid connection overload
        let salesRaw: any[] = [];
        try {
            salesRaw = await prisma.pOSInvoice.findMany({
                where: { ...baseWhere, isPosted: true, status: { not: 'VOID' }, createdAt: dateFilter },
                select: {
                    createdAt: true, grandTotal: true, taxTotal: true,
                    paymentMethod: true, customerId: true,
                    customer: { select: { name: true } },
                    items: { select: { qty: true } },
                },
            });
        } catch (err) {
            console.error('[Reports] Error fetching sales trend:', getErrorMessage(err));
            salesRaw = [];
        }
        // 3. Fetch remaining data sequentially to avoid connection overload
        let purchasesRaw: Awaited<ReturnType<typeof fetchDashboardPurchasesRaw>> = [];
        let inventoryAnalytics: any[] = [];
        let branches: any[] = [];
        let posSessionsRaw: any[] = [];
        let allInvoicesForInsights: any[] = [];
        let expensesRaw: any[] = [];

        try {
            purchasesRaw = await fetchDashboardPurchasesRaw({
                companyId,
                branchFilter: baseWhere.branchId,
                from: filterStart,
                to: filterEnd,
            });
        } catch (err) {
            console.error('[Reports] Error fetching purchases:', getErrorMessage(err));
            purchasesRaw = [];
        }

        try {
            [inventoryAnalytics, branches, posSessionsRaw, allInvoicesForInsights, expensesRaw] = await Promise.all([
                // Inventory Valuation
                prisma.inventoryStock.findMany({
                    where: { ...baseWhere, qtyOnHand: { gt: 0 } },
                    include: { product: { include: { category: { select: { name: true } } } } }
                }).catch((err) => {
                    console.error('[Reports] Error fetching inventory:', err.message);
                    return [];
                }),
                prisma.branch.findMany({
                    where: { companyId },
                    select: { id: true, name: true, code: true }
                }).catch((err) => {
                    console.error('[Reports] Error fetching branches:', err.message);
                    return [];
                }),
                // POS Shifts for variance
                prisma.pOSShift.findMany({
                    where: { companyId, createdAt: dateFilter },
                    select: { variance: true },
                }).catch((err) => {
                    console.error('[Reports] Error fetching POS shifts:', err.message);
                    return [];
                }),
                // ALL non-void invoices for AOV / Items-per-order / returning customers
                prisma.pOSInvoice.findMany({
                    where: { ...baseWhere, createdAt: dateFilter, isPosted: true, status: { not: 'VOID' } },
                    select: { grandTotal: true, customerId: true, items: { select: { qty: true } } },
                }).catch((err) => {
                    console.error('[Reports] Error fetching all invoices:', err.message);
                    return [];
                }),
                // Expenses
                prisma.expense.findMany({
                    where: { companyId, createdAt: dateFilter },
                    select: { amount: true, category: true, createdAt: true },
                }).catch((err) => {
                    console.error('[Reports] Error fetching expenses:', err.message);
                    return [];
                }),
            ]);
        } catch (err) {
            console.error('[Reports] Error in batch fetching:', getErrorMessage(err));
        }

        // 2. Post-process trend data
        const trendKeys: { key: string, label: string }[] = [];
        const diffDays = (filterEnd.getTime() - filterStart.getTime()) / (1000 * 3600 * 24);
        const formatKey = (d: Date) => diffDays <= 60
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        if (diffDays <= 60) {
            let limit = new Date(filterStart);
            limit.setHours(0, 0, 0, 0);
            const endLimit = new Date(filterEnd);
            endLimit.setHours(23, 59, 59, 999);
            while (limit <= endLimit) {
                trendKeys.push({
                    key: formatKey(limit),
                    label: limit.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                });
                limit.setDate(limit.getDate() + 1);
                limit.setHours(0, 0, 0, 0);
            }
        } else {
            let limit = new Date(filterStart.getFullYear(), filterStart.getMonth(), 1);
            const endLimit = new Date(filterEnd);
            while (limit <= endLimit) {
                trendKeys.push({
                    key: formatKey(limit),
                    label: limit.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                });
                limit.setMonth(limit.getMonth() + 1);
            }
        }

        const trendMap: Record<string, { month: string; net: number; tax: number; purchases: number; expenses: number }> = {};
        trendKeys.forEach(m => trendMap[m.key] = { month: m.label, net: 0, tax: 0, purchases: 0, expenses: 0 });

        const paymentMap: Record<string, number> = {};
        const customerMap: Record<string, { name: string; value: number }> = {};
        const hourMap: Record<string, number> = {};
        const dayMap: Record<string, number> = {};
        const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        salesRaw.forEach((inv: any) => {
            const d = new Date(inv.createdAt);
            const key = formatKey(d);
            const gt = Number(inv.grandTotal || 0);
            const tax = Number(inv.taxTotal || 0);

            if (trendMap[key]) {
                trendMap[key].net += gt;
                trendMap[key].tax += tax;
            }

            const method = inv.paymentMethod || 'OTHER';
            paymentMap[method] = (paymentMap[method] || 0) + gt;

            if (inv.customerId) {
                const cId = inv.customerId;
                if (!customerMap[cId]) customerMap[cId] = { name: inv.customer?.name || 'Unknown', value: 0 };
                customerMap[cId].value += gt;
            }

            // Sales by hour
            const hour = d.getHours();
            const hourLabel = `${String(hour).padStart(2, '0')}:00`;
            hourMap[hourLabel] = (hourMap[hourLabel] || 0) + gt;

            // Sales by day of week
            const dayLabel = DAY_NAMES[d.getDay()];
            dayMap[dayLabel] = (dayMap[dayLabel] || 0) + gt;
        });

        // Purchases trend + top suppliers
        const supplierMap: Record<string, { name: string; value: number }> = {};
        purchasesRaw.forEach((p: any) => {
            const d = new Date(p.createdAt);
            const key = formatKey(d);
            const gt = Number(p.grandTotal || 0);
            if (trendMap[key]) trendMap[key].purchases += gt;
            if (p.supplierId) {
                const sId = p.supplierId;
                if (!supplierMap[sId]) supplierMap[sId] = { name: p.supplier?.name || 'Unknown', value: 0 };
                supplierMap[sId].value += gt;
            }
        });

        // Expenses trend + categories
        const expenseCatMap: Record<string, number> = {};
        let totalExpenses = 0;
        expensesRaw.forEach((e: any) => {
            const d = new Date(e.createdAt);
            const key = formatKey(d);
            const amt = Number(e.amount || 0);
            if (trendMap[key]) trendMap[key].expenses += amt;
            const cat = e.category || 'Uncategorized';
            expenseCatMap[cat] = (expenseCatMap[cat] || 0) + amt;
            totalExpenses += amt;
        });

        // 3. Insights
        const totalInvoiceCount = allInvoicesForInsights.length;
        let totalGrandSum = 0;
        let totalItemLines = 0;
        const customerInvoiceCounts: Record<string, number> = {};

        allInvoicesForInsights.forEach((inv: any) => {
            totalGrandSum += Number(inv.grandTotal || 0);
            totalItemLines += (inv.items || []).reduce((sum: number, it: { qty: number | null }) => sum + Number(it.qty || 0), 0);
            if (inv.customerId) {
                customerInvoiceCounts[inv.customerId] = (customerInvoiceCounts[inv.customerId] || 0) + 1;
            }
        });

        const returningCustomers = Object.values(customerInvoiceCounts).filter(c => c > 1).length;
        const totalUniqueCustomers = Object.keys(customerInvoiceCounts).length;

        const posTotalVariance = posSessionsRaw.reduce(
            (sum: number, s: any) => sum + Number(s.variance || 0), 0
        );

        // 4. Post-process inventory data
        const catVal: Record<string, number> = {};
        let healthyCount = 0;
        let lowCount = 0;
        const productValMap = inventoryAnalytics.map((s: any) => {
            const val = Number(s.qtyOnHand) * Number(s.avgCost);
            const qty = Number(s.qtyOnHand);
            const catName = s.product?.category?.name || 'Uncategorized';
            catVal[catName] = (catVal[catName] || 0) + val;
            if (qty <= Number(s.minStock || 10)) lowCount++;
            else healthyCount++;
            return { name: s.product.name, value: val, qty };
        });

        const topByValue = [...productValMap].sort((a, b) => b.value - a.value).slice(0, 7);
        const topByQty = [...productValMap].sort((a, b) => b.qty - a.qty).slice(0, 7);

        // Sales by day — ordered Mon-Sun
        const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const salesByDayOfWeek = orderedDays.map(day => ({ day, total: dayMap[day] || 0 }));

        // Sales by hour — ordered 00:00 to 23:00
        const salesByHour = Array.from({ length: 24 }).map((_, h) => {
            const hourLabel = `${String(h).padStart(2, '0')}:00`;
            return { hour: hourLabel, total: hourMap[hourLabel] || 0 };
        });

        sendSuccess(res, {
            summary: {
                todaySales: { total: todaySales._sum.grandTotal || 0, count: todaySales._count },
                totalProducts,
                totalCustomers,
                lowStockCount,
                recentInvoices,
            },
            finance: {
                netSales: Number(financeAgg[0]._sum.grandTotal || 0),
                totalPurchases: Number(financeAgg[1]._sum.grandTotal || 0),
                outputVAT: Number(financeAgg[0]._sum.taxTotal || 0),
                inputVAT: Number(financeAgg[1]._sum.taxTotal || 0),
            },
            insights: {
                averageOrderValue: totalInvoiceCount > 0 ? totalGrandSum / totalInvoiceCount : 0,
                averageItemsPerOrder: totalInvoiceCount > 0 ? totalItemLines / totalInvoiceCount : 0,
                returningCustomersCount: returningCustomers,
                returningCustomerRate: totalUniqueCustomers > 0 ? (returningCustomers / totalUniqueCustomers) * 100 : 0,
                totalExpensesAllTime: totalExpenses,
                posTotalVariance,
            },
            salesTrend: trendKeys.map(m => trendMap[m.key]),
            paymentBreakdown: Object.entries(paymentMap).map(([method, total]) => ({ method, total })),
            topCustomers: Object.values(customerMap).sort((a, b) => b.value - a.value).slice(0, 6),
            topSuppliers: Object.values(supplierMap).sort((a, b) => b.value - a.value).slice(0, 6),
            expenseCategories: Object.entries(expenseCatMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            salesByDayOfWeek,
            salesByHour,
            inventory: {
                categoryValuation: Object.entries(catVal).map(([name, value]) => ({ name, value })),
                topByValue,
                topByQty,
                health: [
                    { name: 'Healthy', value: healthyCount },
                    { name: 'Low Stock', value: lowCount },
                ],
            },
        });
    } catch (error) { next(error); }
});

// GET /reports/dashboard (Legacy support)
reportRoutes.get('/dashboard', async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchId = req.query.branchId as string | undefined;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const baseWhere: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            baseWhere.branchId = branchId;
        }

        const [
            todaySales,
            totalProducts,
            totalCustomers,
            lowStockCount,
            recentInvoices,
        ] = await Promise.all([
            prisma.pOSInvoice.aggregate({
                where: { ...baseWhere, createdAt: { gte: today }, status: { not: 'VOID' } },
                _sum: { grandTotal: true },
                _count: true,
            }),
            countActiveProductsRaw(companyId),
            countActiveCustomersRaw(companyId),
            prisma.inventoryStock.count({ where: { ...baseWhere, qtyOnHand: { lte: 10, gt: 0 } } }),
            prisma.pOSInvoice.findMany({
                where: { ...baseWhere },
                include: {
                    customer: { select: { name: true } },
                    createdBy: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
        ]);

        sendSuccess(res, {
            todaySales: {
                total: todaySales._sum.grandTotal || 0,
                count: todaySales._count,
            },
            totalProducts,
            totalCustomers,
            lowStockCount,
            recentInvoices,
        });
    } catch (error) { next(error); }
});
