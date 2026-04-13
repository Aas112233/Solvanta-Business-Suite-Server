import { Router } from 'express';
import { authenticate, requirePermission, requireBranch } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';
import { Decimal } from '@prisma/client/runtime/library';
import { z } from 'zod';
import { CoreAccountingService } from '../accounting/CoreAccountingService.js';
import { InventoryService } from '../inventory/InventoryService.js';
export const purchaseRoutes = Router();
purchaseRoutes.use(authenticate);

const PURCHASE_ORDER_COUNTER = 'PURCHASE_ORDER';
const PURCHASE_INVOICE_COUNTER = 'PURCHASE_INVOICE';

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

function parseDateOrThrow(value: unknown, fieldName: string): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw AppError.badRequest(`Invalid ${fieldName}`);
    }
    return date;
}

const purchaseItemSchema = z.object({
    productId: z.string().min(1),
    unitCode: z.string().min(1),
    qty: z.number().positive(),
    unitCost: z.number().min(0),
    taxAmount: z.number().min(0).optional().default(0),
    lineTotal: z.number().min(0),
});

const purchaseSchema = z.object({
    supplierId: z.string().min(1),
    branchId: z.string().min(1),
    invoiceNoSupplier: z.string().optional(),
    items: z.array(purchaseItemSchema).min(1),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
});

const purchaseReturnItemSchema = z.object({
    purchaseItemId: z.string().min(1),
    qty: z.number().positive(),
});

const purchaseReturnSchema = z.object({
    items: z.array(purchaseReturnItemSchema).min(1),
    reason: z.string().max(300).optional(),
    notes: z.string().max(1000).optional(),
    returnDate: z.string().optional(),
});

const purchasePaymentSchema = z.object({
    amount: z.number().positive(),
    paymentMethod: z.string().min(1),
    paymentDate: z.string().optional(),
    referenceNo: z.string().max(100).optional(),
    notes: z.string().max(1000).optional(),
});

const purchaseProductInsightsQuerySchema = z.object({
    productId: z.string().min(1),
    unitCode: z.string().optional(),
    branchId: z.string().optional(),
});

const purchaseControlQuerySchema = z.object({
    branchId: z.string().optional(),
    productId: z.string().optional(),
    supplierId: z.string().optional(),
    unitCode: z.string().optional(),
    historyLimit: z.coerce.number().int().min(10).max(300).optional().default(80),
});

const purchaseOrderItemSchema = z.object({
    productId: z.string().min(1),
    unitCode: z.string().min(1),
    qty: z.number().positive(),
    unitCost: z.number().min(0),
    taxAmount: z.number().min(0).optional().default(0),
    lineTotal: z.number().min(0),
});

const purchaseOrderSchema = z.object({
    supplierId: z.string().min(1),
    branchId: z.string().min(1),
    date: z.string().optional(),
    expectedDate: z.string().optional(),
    items: z.array(purchaseOrderItemSchema).min(1),
    notes: z.string().optional(),
});

const purchaseOrderApproveSchema = z.object({
    note: z.string().max(500).optional(),
});

// GET /purchases
purchaseRoutes.get('/', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const {
            branchId,
            supplierId,
            status,
            search,
            startDate,
            endDate,
            dateFrom,
            dateTo,
        } = req.query as any;

        const where: any = applyUserBranchScope(req, { companyId: req.user!.companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (supplierId) where.supplierId = supplierId;
        if (status) where.status = status;
        const fromDate = parseDateOrThrow(startDate ?? dateFrom, 'startDate');
        const toDate = parseDateOrThrow(endDate ?? dateTo, 'endDate');
        if (fromDate || toDate) {
            where.createdAt = {};
            if (fromDate) where.createdAt.gte = fromDate;
            if (toDate) {
                // If only YYYY-MM-DD is provided, include the full day.
                const inclusiveTo = typeof (endDate ?? dateTo) === 'string' && String(endDate ?? dateTo).length <= 10
                    ? new Date(toDate)
                    : toDate;
                if (inclusiveTo !== toDate) inclusiveTo.setHours(23, 59, 59, 999);
                where.createdAt.lte = inclusiveTo;
            }
        }
        if (search && typeof search === 'string') {
            where.OR = [
                { purchaseNo: { contains: search, mode: 'insensitive' } },
                { invoiceNoSupplier: { contains: search, mode: 'insensitive' } },
                { supplier: { is: { name: { contains: search, mode: 'insensitive' } } } }
            ];
        }

        const [purchases, total] = await Promise.all([
            prisma.purchaseInvoice.findMany({
                where,
                skip,
                take,
                include: {
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.purchaseInvoice.count({ where }),
        ]);

        sendPaginated(res, purchases, total, page, limit);
    } catch (error) { next(error); }
});

// GET /orders
purchaseRoutes.get('/orders', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const { branchId, supplierId, status, search } = req.query as any;

        const where: any = applyUserBranchScope(req, { companyId: req.user!.companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (supplierId) where.supplierId = supplierId;
        if (status) where.status = status;
        if (search && typeof search === 'string') {
            where.OR = [
                { poNo: { contains: search, mode: 'insensitive' } },
                { supplier: { is: { name: { contains: search, mode: 'insensitive' } } } }
            ];
        }

        const [orders, total] = await Promise.all([
            prisma.purchaseOrder.findMany({
                where,
                skip,
                take,
                include: {
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true, invoices: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.purchaseOrder.count({ where }),
        ]);

        sendPaginated(res, orders, total, page, limit);
    } catch (error) { next(error); }
});

// GET /orders/:id
purchaseRoutes.get('/orders/:id', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const order = await prisma.purchaseOrder.findFirst({
            where: {
                id: String(req.params.id),
                companyId: String(req.user!.companyId),
                ...(branchScope as any)
            },
            include: {
                supplier: true,
                branch: true,
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                itemCode: true,
                                name: true,
                                nameArabic: true,
                                taxRate: true,
                                tax: { select: { rate: true } },
                                // @ts-ignore – barcodes[] added to schema, Prisma client regeneration required
                                units: { select: { unitCode: true, unitName: true, barcodes: true, qtyInBaseUnit: true } }
                            }
                        }
                    }
                },
                invoices: {
                    select: {
                        id: true,
                        purchaseNo: true,
                        grandTotal: true,
                        status: true,
                        createdAt: true
                    }
                }
            }
        });

        if (!order) throw AppError.notFound('Purchase Order');
        sendSuccess(res, order);
    } catch (error) { next(error); }
});

// POST /orders/:id/approve
purchaseRoutes.post('/orders/:id/approve', requirePermission(PERMISSIONS.PURCHASE_CREATE), validate({ body: purchaseOrderApproveSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        const orderId = req.params.id as string;
        const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };

        const order = await prisma.purchaseOrder.findFirst({
            where: {
                id: orderId,
                companyId,
                ...branchScope,
            },
            select: {
                id: true,
                status: true,
                notes: true,
                branchId: true,
            },
        });
        if (!order) throw AppError.notFound('Purchase Order not found');
        if (order.status === 'CANCELLED') throw AppError.badRequest('Cancelled order cannot be approved');
        if (order.status === 'RECEIVED') throw AppError.badRequest('Fully received order cannot be approved');
        if (order.status === 'ORDERED' || order.status === 'PARTIAL') {
            throw AppError.badRequest(`Order is already ${order.status.toLowerCase()}`);
        }

        const approvalStamp = `[APPROVED ${new Date().toISOString()} by ${userId}]`;
        const notesMerged = [order.notes, note, approvalStamp].filter(Boolean).join('\n').trim();

        const updated = await prisma.purchaseOrder.update({
            where: { id: orderId },
            data: {
                status: 'ORDERED',
                notes: notesMerged,
            },
            include: {
                supplier: { select: { id: true, name: true, supplierCode: true } },
                branch: { select: { id: true, name: true, code: true } },
                createdBy: { select: { id: true, name: true } },
                _count: { select: { items: true, invoices: true } },
            },
        });

        sendSuccess(res, updated, { message: 'Purchase order approved' });
    } catch (error) {
        next(error);
    }
});

// GET /orders/lookup/:poNo
purchaseRoutes.get('/orders/lookup/:poNo', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };

        const order = await prisma.purchaseOrder.findFirst({
            where: {
                companyId,
                poNo: { equals: req.params.poNo as string, mode: 'insensitive' },
                status: { not: 'CANCELLED' },
                ...branchScope
            },
            include: {
                supplier: true,
                branch: true,
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                itemCode: true,
                                name: true,
                            }
                        }
                    }
                }
            }
        });

        if (!order) throw AppError.notFound('Purchase Order not found');
        sendSuccess(res, order);
    } catch (error) { next(error); }
});

// POST /orders
purchaseRoutes.post('/orders', requirePermission(PERMISSIONS.PURCHASE_CREATE), validate({ body: purchaseOrderSchema }), async (req, res, next) => {
    try {
        const { supplierId, branchId, date, expectedDate, items, notes } = req.body;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        await assertBranchAccessible(req, branchId);

        const result = await prisma.$transaction(async (tx) => {
            const poNo = formatDocNo('PO', await nextCounter(tx as any, companyId, PURCHASE_ORDER_COUNTER));

            let subtotal = 0;
            let taxTotal = 0;
            const preparedItems = items.map((item: any) => {
                const qty = Number(item.qty) || 0;
                const unitCost = Number(item.unitCost) || 0;
                const lineTotal = Number(item.lineTotal) || (qty * unitCost);
                const taxAmount = Number(item.taxAmount) || 0;

                subtotal += lineTotal;
                taxTotal += taxAmount;

                return {
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qty,
                    unitCost,
                    taxAmount,
                    lineTotal,
                };
            });

            return await tx.purchaseOrder.create({
                data: {
                    companyId,
                    branchId,
                    supplierId,
                    poNo,
                    date: date ? new Date(date) : new Date(),
                    expectedDate: expectedDate ? new Date(expectedDate) : null,
                    subtotal,
                    taxTotal,
                    grandTotal: subtotal + taxTotal,
                    notes,
                    createdById: userId,
                    items: {
                        create: preparedItems
                    }
                },
                include: { items: true }
            });
        });

        sendSuccess(res, result, undefined, 201);
    } catch (error) { next(error); }
});

// POST /orders/:id/convert - Convert PO to Purchase Invoice
purchaseRoutes.post('/orders/:id/convert', requirePermission(PERMISSIONS.PURCHASE_CREATE), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        const poId = req.params.id as string;

        const result = await prisma.$transaction(async (tx) => {
            const po: any = await tx.purchaseOrder.findFirst({
                where: {
                    id: String(poId),
                    companyId: String(companyId)
                },
                include: { items: true, supplier: true }
            });

            if (!po) throw AppError.notFound('Purchase Order');
            if (po.status === 'CANCELLED') throw AppError.badRequest('Cannot convert cancelled order');
            // if (po.status === 'RECEIVED') throw AppError.badRequest('Order already received');

            // Create Purchase Invoice (Received)
            const purchaseNo = formatDocNo('PUR', await nextCounter(tx as any, companyId, PURCHASE_INVOICE_COUNTER));

            const invoice = await tx.purchaseInvoice.create({
                data: {
                    companyId,
                    branchId: po.branchId,
                    supplierId: po.supplierId,
                    purchaseOrderId: po.id,
                    purchaseNo,
                    subtotal: po.subtotal,
                    taxTotal: po.taxTotal,
                    grandTotal: po.grandTotal,
                    status: 'RECEIVED',
                    notes: `Converted from PO: ${po.poNo}`,
                    createdById: userId,
                    items: {
                        create: po.items.map((item: any) => ({
                            productId: item.productId,
                            unitCode: item.unitCode,
                            qty: item.qty,
                            unitCost: item.unitCost,
                            taxAmount: item.taxAmount,
                            lineTotal: item.lineTotal,
                        }))
                    }
                },
                include: { items: true }
            });

            // Update PO status
            await tx.purchaseOrder.update({
                where: { id: String(poId) },
                data: { status: 'RECEIVED' }
            });            // Update inventory and stock movements
            for (const item of invoice.items) {
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: po.branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: item.qty,
                    cost: item.unitCost, // Pass current unit cost; service handles average cost normalization
                    type: 'PURCHASE_RECEIPT',
                    referenceType: 'PurchaseInvoice',
                    referenceId: invoice.id,
                    createdById: userId,
                });
            }

            await CoreAccountingService.recordPurchaseReceipt(tx as any, {
                id: invoice.id,
                companyId,
                branchId: po.branchId,
                supplierId: po.supplierId,
                purchaseNo: invoice.purchaseNo,
                grandTotal: Number(invoice.grandTotal || 0),
                taxTotal: Number(invoice.taxTotal || 0),
                createdAt: invoice.createdAt,
                createdById: userId,
                items: (invoice.items || []).map((item: any) => ({
                    productId: item.productId,
                    qty: Number(item.qty || 0),
                    unitCost: Number(item.unitCost || 0),
                    taxAmount: Number(item.taxAmount || 0),
                    lineTotal: Number(item.lineTotal || 0),
                })),
            });

            return invoice;
        });

        sendSuccess(res, result, { message: 'Converted to invoice successfully' });
    } catch (error) { next(error); }
});

// GET /purchases/product-insights
purchaseRoutes.get('/product-insights', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const query = purchaseProductInsightsQuerySchema.parse(req.query);
        const companyId = req.user!.companyId;
        const { productId, unitCode, branchId } = query;

        if (branchId) {
            await assertBranchAccessible(req, branchId);
        }

        const itemWhere: any = {
            productId,
            invoice: {
                companyId,
                status: { not: 'CANCELLED' } as any,
                ...(branchId ? { branchId } : {}),
            },
            ...(unitCode ? { unitCode } : {}),
        };

        const [lastItem, recentItems, stockByUnit] = await Promise.all([
            (prisma as any).purchaseInvoiceItem.findFirst({
                where: itemWhere,
                orderBy: { invoice: { createdAt: 'desc' } },
                include: {
                    invoice: {
                        select: {
                            id: true,
                            purchaseNo: true,
                            invoiceNoSupplier: true,
                            createdAt: true,
                            supplier: { select: { id: true, name: true, supplierCode: true } },
                        },
                    },
                },
            }),
            (prisma as any).purchaseInvoiceItem.findMany({
                where: itemWhere,
                orderBy: { invoice: { createdAt: 'desc' } },
                take: 5,
                select: {
                    unitCode: true,
                    unitCost: true,
                    qty: true,
                    lineTotal: true,
                    invoice: {
                        select: {
                            createdAt: true,
                            purchaseNo: true,
                            supplier: { select: { name: true } },
                        },
                    },
                },
            }),
            (prisma as any).inventoryStock.findMany({
                where: {
                    companyId,
                    productId,
                    ...(branchId ? { branchId } : {}),
                    ...(unitCode ? { unitCode } : {}),
                },
                select: {
                    branchId: true,
                    unitCode: true,
                    qtyOnHand: true,
                    avgCost: true,
                },
            }),
        ]);

        const recentCosts = recentItems.map((x: any) => Number(x.unitCost || 0));
        const avgRecentCost = recentCosts.length
            ? recentCosts.reduce((a: number, b: number) => a + b, 0) / recentCosts.length
            : 0;

        sendSuccess(res, {
            lastPurchase: lastItem
                ? {
                    unitCode: lastItem.unitCode,
                    unitCost: Number(lastItem.unitCost || 0),
                    qty: Number(lastItem.qty || 0),
                    lineTotal: Number(lastItem.lineTotal || 0),
                    purchaseNo: lastItem.invoice?.purchaseNo,
                    invoiceNoSupplier: lastItem.invoice?.invoiceNoSupplier,
                    supplier: lastItem.invoice?.supplier || null,
                    createdAt: lastItem.invoice?.createdAt,
                }
                : null,
            recentPurchases: recentItems.map((x: any) => ({
                unitCode: x.unitCode,
                unitCost: Number(x.unitCost || 0),
                qty: Number(x.qty || 0),
                lineTotal: Number(x.lineTotal || 0),
                purchaseNo: x.invoice?.purchaseNo,
                supplierName: x.invoice?.supplier?.name || null,
                createdAt: x.invoice?.createdAt,
            })),
            costStats: {
                avgRecentCost: Number(avgRecentCost || 0),
                minRecentCost: recentCosts.length ? Math.min(...recentCosts) : 0,
                maxRecentCost: recentCosts.length ? Math.max(...recentCosts) : 0,
            },
            stockContext: stockByUnit,
        });
    } catch (error) { next(error); }
});

// GET /purchases/control/overview
purchaseRoutes.get('/control/overview', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const query = purchaseControlQuerySchema.parse(req.query);
        const companyId = req.user!.companyId;
        const { branchId, productId, supplierId, unitCode, historyLimit } = query;

        if (branchId) await assertBranchAccessible(req, branchId);
        const branchScope = branchId
            ? { branchId }
            : (isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } });

        const invoiceScope: any = {
            companyId,
            status: { not: 'CANCELLED' } as any,
            ...branchScope,
            ...(supplierId ? { supplierId } : {}),
        };

        const itemWhere: any = {
            ...(productId ? { productId } : {}),
            ...(unitCode ? { unitCode } : {}),
            invoice: invoiceScope,
        };

        const [historyRows, approvalRows, receiptRows] = await Promise.all([
            (prisma as any).purchaseInvoiceItem.findMany({
                where: itemWhere,
                orderBy: { invoice: { createdAt: 'desc' } },
                take: historyLimit,
                select: {
                    id: true,
                    productId: true,
                    unitCode: true,
                    qty: true,
                    unitCost: true,
                    lineTotal: true,
                    taxAmount: true,
                    invoice: {
                        select: {
                            id: true,
                            purchaseNo: true,
                            createdAt: true,
                            supplier: { select: { id: true, name: true, supplierCode: true } },
                            branch: { select: { id: true, name: true, code: true } },
                        },
                    },
                    product: {
                        select: {
                            id: true,
                            itemCode: true,
                            name: true,
                            units: { select: { unitCode: true, unitName: true } },
                        },
                    },
                },
            }),
            prisma.purchaseOrder.findMany({
                where: {
                    companyId,
                    ...branchScope,
                    status: { in: ['DRAFT', 'PENDING'] },
                },
                include: {
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'asc' },
                take: 100,
            }),
            prisma.purchaseOrder.findMany({
                where: {
                    companyId,
                    ...branchScope,
                    status: { in: ['PENDING', 'ORDERED', 'PARTIAL'] },
                },
                include: {
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    items: {
                        select: {
                            productId: true,
                            unitCode: true,
                            qty: true,
                            unitCost: true,
                            lineTotal: true,
                        },
                    },
                    invoices: {
                        where: { status: { not: 'CANCELLED' } },
                        select: {
                            id: true,
                            purchaseNo: true,
                            createdAt: true,
                            items: {
                                select: {
                                    productId: true,
                                    unitCode: true,
                                    qty: true,
                                    lineTotal: true,
                                },
                            },
                        },
                    },
                },
                orderBy: [{ expectedDate: 'asc' }, { createdAt: 'asc' }],
                take: 200,
            }),
        ]);

        const lastPurchaseMap = new Map<string, any>();
        for (const row of historyRows) {
            const key = `${row.productId}__${row.unitCode}`;
            if (lastPurchaseMap.has(key)) continue;
            const unitName = row.product?.units?.find((u: any) => u.unitCode === row.unitCode)?.unitName || '';
            lastPurchaseMap.set(key, {
                productId: row.productId,
                productName: row.product?.name || '-',
                itemCode: row.product?.itemCode || '-',
                unitCode: row.unitCode,
                unitName,
                unitCost: Number(row.unitCost || 0),
                qty: Number(row.qty || 0),
                createdAt: row.invoice?.createdAt,
                purchaseNo: row.invoice?.purchaseNo || null,
                supplier: row.invoice?.supplier || null,
            });
        }
        const lastPurchasePrices = Array.from(lastPurchaseMap.values());

        const pendingReceipts = receiptRows
            .map((order) => {
                const orderedByKey = new Map<string, { qty: number; amount: number }>();
                for (const line of order.items || []) {
                    const key = `${line.productId}__${line.unitCode}`;
                    const prev = orderedByKey.get(key) || { qty: 0, amount: 0 };
                    orderedByKey.set(key, {
                        qty: prev.qty + Number(line.qty || 0),
                        amount: prev.amount + Number(line.lineTotal || 0),
                    });
                }

                const receivedByKey = new Map<string, number>();
                for (const invoice of order.invoices || []) {
                    for (const line of invoice.items || []) {
                        const key = `${line.productId}__${line.unitCode}`;
                        receivedByKey.set(key, (receivedByKey.get(key) || 0) + Number(line.qty || 0));
                    }
                }

                let orderedQty = 0;
                let receivedQty = 0;
                let pendingQty = 0;
                let pendingValue = 0;

                for (const [key, ordered] of orderedByKey.entries()) {
                    const rec = Number(receivedByKey.get(key) || 0);
                    const linePendingQty = Math.max(0, ordered.qty - rec);
                    const lineUnitValue = ordered.qty > 0 ? ordered.amount / ordered.qty : 0;
                    const linePendingValue = linePendingQty * lineUnitValue;
                    orderedQty += ordered.qty;
                    receivedQty += Math.min(rec, ordered.qty);
                    pendingQty += linePendingQty;
                    pendingValue += linePendingValue;
                }

                const receiptPct = orderedQty > 0 ? Math.round((receivedQty / orderedQty) * 100) : 0;

                return {
                    id: order.id,
                    poNo: order.poNo,
                    status: order.status,
                    date: order.date,
                    expectedDate: order.expectedDate,
                    supplier: order.supplier,
                    branch: order.branch,
                    orderedQty,
                    receivedQty,
                    pendingQty,
                    pendingValue,
                    receiptPct: Math.min(100, Math.max(0, receiptPct)),
                    invoiceCount: order.invoices?.length || 0,
                };
            })
            .filter((row) => row.pendingQty > 0);

        const totalPendingValue = pendingReceipts.reduce((sum, row) => sum + Number(row.pendingValue || 0), 0);

        sendSuccess(res, {
            summary: {
                costHistoryCount: historyRows.length,
                approvalsPending: approvalRows.length,
                receiptsPending: pendingReceipts.length,
                pendingReceiptValue: totalPendingValue,
            },
            costHistory: historyRows.map((row: any) => ({
                id: row.id,
                productId: row.productId,
                productName: row.product?.name || '-',
                itemCode: row.product?.itemCode || '-',
                unitCode: row.unitCode,
                unitName: row.product?.units?.find((u: any) => u.unitCode === row.unitCode)?.unitName || '',
                qty: Number(row.qty || 0),
                unitCost: Number(row.unitCost || 0),
                lineTotal: Number(row.lineTotal || 0),
                taxAmount: Number(row.taxAmount || 0),
                purchaseNo: row.invoice?.purchaseNo || null,
                createdAt: row.invoice?.createdAt,
                supplier: row.invoice?.supplier || null,
                branch: row.invoice?.branch || null,
            })),
            lastPurchasePrices,
            approvals: approvalRows,
            pendingReceipts,
        });
    } catch (error) {
        next(error);
    }
});

// POST /purchases — TRANSACTIONAL: create invoice + update stock + stock movements + journal entry
purchaseRoutes.post('/', requirePermission(PERMISSIONS.PURCHASE_CREATE), validate({ body: purchaseSchema }), async (req, res, next) => {
    try {
        const { supplierId, branchId, invoiceNoSupplier, items, notes, paymentMethod } = req.body;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        await assertBranchAccessible(req, branchId);

        console.log(`[Purchase] Start creation - Branch: ${branchId}, Supplier: ${supplierId}`);

        const result = await prisma.$transaction(async (tx) => {            // Generate Purchase No
            const purchaseNo = formatDocNo('PUR', await nextCounter(tx as any, companyId, 'PURCHASE_INVOICE'));

            // Calculate totals and sanitize items
            let subtotal = 0;
            let taxTotal = 0;
            const sanitizedItems = items.map((item: any) => {
                const qty = Number(item.qty) || 0;
                const unitCost = Number(item.unitCost) || 0;
                const lineTotal = Number(item.lineTotal) || (qty * unitCost);
                const taxAmount = Number(item.taxAmount) || 0;

                subtotal += lineTotal;
                taxTotal += taxAmount;

                return {
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qty,
                    unitCost,
                    taxAmount,
                    lineTotal,
                };
            });

            const grandTotal = subtotal + taxTotal;

            // Create purchase invoice
            const pModel = (tx as any).purchaseInvoice || tx['purchaseInvoice'];
            if (!pModel) throw new Error('PurchaseInvoice model not found on transaction client');

            const invoice = await pModel.create({
                data: {
                    companyId,
                    branchId,
                    supplierId,
                    purchaseNo,
                    invoiceNoSupplier,
                    subtotal,
                    taxTotal,
                    grandTotal,
                    paymentMethod,
                    status: 'RECEIVED',
                    notes,
                    createdById: userId,
                    items: {
                        create: sanitizedItems.map((i: any) => ({
                            productId: i.productId,
                            unitCode: i.unitCode,
                            qty: i.qty,
                            unitCost: i.unitCost,
                            taxAmount: i.taxAmount,
                            lineTotal: i.lineTotal,
                        })),
                    },
                },
                include: { items: true },
            });

            // Update inventory stock for each item using unified service
            for (const item of sanitizedItems) {
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: item.qty,
                    cost: Number(item.unitCost || 0),
                    type: 'PURCHASE_RECEIPT',
                    referenceType: 'PurchaseInvoice',
                    referenceId: invoice.id,
                    createdById: userId,
                });
            }

            await CoreAccountingService.recordPurchaseReceipt(tx as any, {
                id: invoice.id,
                companyId,
                branchId,
                supplierId,
                purchaseNo: invoice.purchaseNo,
                grandTotal: Number(invoice.grandTotal || 0),
                taxTotal: Number(invoice.taxTotal || 0),
                createdAt: invoice.createdAt,
                createdById: userId,
                items: (invoice.items || []).map((item: any) => ({
                    productId: item.productId,
                    qty: Number(item.qty || 0),
                    unitCost: Number(item.unitCost || 0),
                    taxAmount: Number(item.taxAmount || 0),
                    lineTotal: Number(item.lineTotal || 0),
                })),
            });

            return invoice;
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result, undefined, 201);
    } catch (error) {
        console.error('[Purchase POST Error]:', error);
        next(error);
    }
});

// PUT /purchases/:id - Edit Purchase Invoice
purchaseRoutes.put('/:id', requirePermission(PERMISSIONS.PURCHASE_CREATE), validate({ body: purchaseSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const { supplierId, branchId, invoiceNoSupplier, items, notes, paymentMethod } = req.body;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;

        await assertBranchAccessible(req, branchId);

        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch Existing
            const existing = await tx.purchaseInvoice.findUnique({
                where: { id },
                include: { items: true }
            });

            if (!existing) throw AppError.notFound('Purchase Invoice not found');
            if (existing.companyId !== companyId) throw AppError.notFound('Purchase Invoice not found');
            if (existing.status === 'CANCELLED') throw AppError.badRequest('Cannot edit cancelled invoice');
            await assertBranchAccessible(req, existing.branchId);
            if (branchId !== existing.branchId) {
                throw AppError.badRequest('Changing branch on an existing purchase invoice is not supported');
            }

            // 2. Check Payments
            const payments = await tx.purchasePayment.aggregate({
                where: { purchaseInvoiceId: id, status: 'POSTED' },
                _sum: { amount: true }
            });
            const paidAmount = Number(payments._sum?.amount || 0);

            // 3. Prepare New Items & Calculations
            let newSubtotal = 0;
            let newTaxTotal = 0;

            const sanitizedNewItems = items.map((item: any) => {
                const qty = Number(item.qty) || 0;
                const unitCost = Number(item.unitCost) || 0;
                const lineTotal = Number(item.lineTotal) || (qty * unitCost);
                const taxAmount = Number(item.taxAmount) || 0;
                newSubtotal += lineTotal;
                newTaxTotal += taxAmount;
                return { ...item, qty, unitCost, lineTotal, taxAmount };
            });
            const newGrandTotal = newSubtotal + newTaxTotal;

            if (newGrandTotal < paidAmount) {
                throw AppError.badRequest(`Cannot reduce invoice total below paid amount (${paidAmount})`);
            }            // 4. Stock Validation (CurrentStock + (NewQty - OldQty) >= 0)
            // Aggregate Old Items
            const oldQtyMap = new Map<string, number>();
            const buildStockKey = (item: any) => JSON.stringify({
                productId: item.productId,
                unitCode: item.unitCode,
            });

            for (const item of (existing as any).items) {
                const key = buildStockKey(item);
                oldQtyMap.set(key, (oldQtyMap.get(key) || 0) + Number(item.qty));
            }

            // Aggregate New Items
            const newQtyMap = new Map<string, number>();
            for (const item of sanitizedNewItems) {
                const key = buildStockKey(item);
                newQtyMap.set(key, (newQtyMap.get(key) || 0) + Number(item.qty));
            }

            // Unite Keys
            const allKeys = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);

            for (const key of allKeys) {
                const oldQ = oldQtyMap.get(key) || 0;
                const newQ = newQtyMap.get(key) || 0;
                const netChange = newQ - oldQ;

                if (netChange < 0) {
                    // We are reducing stock. Must check availability.
                    const parsedKey = JSON.parse(key) as {
                        productId: string;
                        unitCode: string;
                    };
                    const currentQty = await InventoryService.getAvailableStockQty(tx as any, {
                        companyId,
                        branchId: existing.branchId,
                        productId: parsedKey.productId,
                        unitCode: parsedKey.unitCode,
                    });
                    // allow floating point tolerance? standard JS math usually fine for simple inventory
                    if (currentQty + netChange < 0) {
                        throw AppError.badRequest(`Insufficient stock to edit invoice. Product: ${parsedKey.productId}, Unit: ${parsedKey.unitCode}. Required reduction: ${Math.abs(netChange)}, Available: ${currentQty}`);
                    }
                }
            }

            // 5. Execution
            // Update Invoice Header
            await tx.purchaseInvoice.update({
                where: { id: id as string },
                data: {
                    supplierId,
                    branchId,
                    invoiceNoSupplier,
                    subtotal: newSubtotal,
                    taxTotal: newTaxTotal,
                    grandTotal: newGrandTotal,
                    paymentMethod,
                    notes,
                    updatedAt: new Date()
                }
            });

            // 6. Handle Items & Stock
            // Optimization: We use mutateStock to revert old and apply new safely.
            // Revert Old
            for (const item of (existing as any).items) {
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: existing.branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: -Math.abs(item.qty),
                    cost: item.unitCost, type: 'ADJUSTMENT', // Reversal of previous receipt
                    referenceType: 'PurchaseInvoice',
                    referenceId: id,
                    createdById: userId,
                });
            }

            // Delete Old Items
            await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } });

            // Apply New
            for (const item of sanitizedNewItems) {
                await tx.purchaseInvoiceItem.create({
                    data: {
                        invoiceId: id,
                        productId: item.productId,
                        unitCode: item.unitCode,
                        qty: item.qty,
                        unitCost: item.unitCost,
                        taxAmount: item.taxAmount,
                        lineTotal: item.lineTotal,
                    }
                });

                // Upsert Stock via Service
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: item.qty,
                    cost: item.unitCost, type: 'PURCHASE_RECEIPT',
                    referenceType: 'PurchaseInvoice',
                    referenceId: id,
                    createdById: userId,
                });
            }

            // 7. Accounting: replace old receipt JE atomically with new strict posting.
            await tx.journalEntry.deleteMany({
                where: { sourceType: 'PurchaseInvoice', sourceId: id }
            });

            await CoreAccountingService.recordPurchaseReceipt(tx as any, {
                id,
                companyId,
                branchId,
                supplierId,
                purchaseNo: existing.purchaseNo,
                grandTotal: newGrandTotal,
                taxTotal: newTaxTotal,
                createdAt: new Date(),
                createdById: userId,
                items: sanitizedNewItems.map((item: any) => ({
                    productId: item.productId,
                    qty: Number(item.qty || 0),
                    unitCost: Number(item.unitCost || 0),
                    taxAmount: Number(item.taxAmount || 0),
                    lineTotal: Number(item.lineTotal || 0),
                })),
            });

            return { id, message: 'Purchase Invoice updated successfully' };
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result);
    } catch (error) { next(error); }
});

// GET /purchases/returns
purchaseRoutes.get('/returns', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const { branchId, search } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (search && typeof search === 'string') {
            where.OR = [
                { returnNo: { contains: search, mode: 'insensitive' } },
                { purchaseInvoice: { is: { purchaseNo: { contains: search, mode: 'insensitive' } } } },
                { supplier: { is: { name: { contains: search, mode: 'insensitive' } } } },
            ];
        }

        const [returns, total] = await Promise.all([
            (prisma as any).purchaseReturn.findMany({
                where,
                skip,
                take,
                include: {
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true } },
                    purchaseInvoice: { select: { id: true, purchaseNo: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            (prisma as any).purchaseReturn.count({ where }),
        ]);

        sendPaginated(res, returns, total, page, limit);
    } catch (error) {
        next(error);
    }
});

// GET /purchases/returns/:id
purchaseRoutes.get('/returns/:id', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const record = await (prisma as any).purchaseReturn.findFirst({
            where: { id: req.params.id as string, companyId, ...branchScope },
            include: {
                supplier: true,
                branch: true,
                purchaseInvoice: {
                    select: {
                        id: true,
                        purchaseNo: true,
                        invoiceNoSupplier: true,
                        createdAt: true,
                    },
                },
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                itemCode: true,
                                name: true,
                                nameArabic: true,
                                taxRate: true,
                                tax: { select: { rate: true } },
                                units: { select: { unitCode: true, unitName: true, barcodes: true, qtyInBaseUnit: true } }
                            }
                        },
                        purchaseItem: {
                            select: {
                                id: true,
                                qty: true,
                                unitCost: true,
                                unitCode: true,
                            },
                        },
                    },
                },
            },
        });

        if (!record) throw AppError.notFound('Purchase Return');
        sendSuccess(res, record);
    } catch (error) {
        next(error);
    }
});

// GET /purchases/payments
purchaseRoutes.get('/payments', requirePermission(PERMISSIONS.PURCHASE_PAYMENT), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const { branchId, purchaseInvoiceId, supplierId, search } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (purchaseInvoiceId) where.purchaseInvoiceId = purchaseInvoiceId;
        if (supplierId) where.supplierId = supplierId;
        if (search && typeof search === 'string') {
            where.OR = [
                { paymentNo: { contains: search, mode: 'insensitive' } },
                { referenceNo: { contains: search, mode: 'insensitive' } },
                { purchaseInvoice: { is: { purchaseNo: { contains: search, mode: 'insensitive' } } } },
                { supplier: { is: { name: { contains: search, mode: 'insensitive' } } } },
            ];
        }

        const [payments, total] = await Promise.all([
            (prisma as any).purchasePayment.findMany({
                where,
                skip,
                take,
                include: {
                    purchaseInvoice: { select: { id: true, purchaseNo: true, grandTotal: true } },
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                    branch: { select: { id: true, name: true, code: true } },
                    createdBy: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            (prisma as any).purchasePayment.count({ where }),
        ]);

        sendPaginated(res, payments, total, page, limit);
    } catch (error) {
        next(error);
    }
});

// GET /purchases/:id/payments
purchaseRoutes.get('/:id/payments', requirePermission(PERMISSIONS.PURCHASE_PAYMENT), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const purchaseId = req.params.id as string;
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const purchase = await prisma.purchaseInvoice.findFirst({
            where: { id: purchaseId, companyId, ...branchScope },
            select: { id: true, purchaseNo: true, grandTotal: true, supplier: { select: { id: true, name: true } } },
        });
        if (!purchase) throw AppError.notFound('Purchase Invoice');

        const [payments, totals] = await Promise.all([
            (prisma as any).purchasePayment.findMany({
                where: { companyId, purchaseInvoiceId: purchaseId },
                include: {
                    createdBy: { select: { id: true, name: true } },
                },
                orderBy: { paymentDate: 'desc' },
            }),
            (prisma as any).purchasePayment.aggregate({
                where: { companyId, purchaseInvoiceId: purchaseId, status: 'POSTED' },
                _sum: { amount: true },
            }),
        ]);

        const paid = Number(totals._sum.amount || 0);
        const grandTotal = Number(purchase.grandTotal || 0);
        sendSuccess(res, {
            purchase,
            totals: {
                grandTotal,
                paid,
                outstanding: Math.max(0, grandTotal - paid),
            },
            payments,
        });
    } catch (error) {
        next(error);
    }
});

// POST /purchases/:id/payments
purchaseRoutes.post('/:id/payments', requirePermission(PERMISSIONS.PURCHASE_PAYMENT), validate({ body: purchasePaymentSchema }), async (req, res, next) => {
    try {
        const purchaseId = req.params.id as string;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        const { amount, paymentMethod, paymentDate, referenceNo, notes } = req.body as z.infer<typeof purchasePaymentSchema>;
        const normalizedPaymentMethod = String(paymentMethod || '').trim().toUpperCase();
        if (!['CASH', 'CARD', 'BANK_TRANSFER'].includes(normalizedPaymentMethod)) {
            throw AppError.badRequest('Payment method must be CASH, CARD, or BANK_TRANSFER');
        }

        const result = await prisma.$transaction(async (tx) => {
            const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
            const invoice = await tx.purchaseInvoice.findFirst({
                where: { id: purchaseId, companyId, ...branchScope },
                select: {
                    id: true,
                    purchaseNo: true,
                    grandTotal: true,
                    status: true,
                    supplierId: true,
                    branchId: true,
                },
            });
            if (!invoice) throw AppError.notFound('Purchase Invoice');
            if (invoice.status === 'CANCELLED') throw AppError.badRequest('Cannot post payment against cancelled purchase invoice');
            if (invoice.status === 'DRAFT') throw AppError.badRequest('Cannot post payment against draft purchase invoice');

            const totals = await (tx as any).purchasePayment.aggregate({
                where: { companyId, purchaseInvoiceId: purchaseId, status: 'POSTED' },
                _sum: { amount: true },
            });
            const alreadyPaid = Number(totals._sum.amount || 0);
            const grandTotal = Number(invoice.grandTotal || 0);
            const outstanding = grandTotal - alreadyPaid;
            if (amount > outstanding) {
                throw AppError.badRequest(`Payment exceeds outstanding balance. Outstanding: ${outstanding.toFixed(2)}`);
            }

            const paymentNo = formatDocNo('PP', await nextCounter(tx as any, companyId, 'PURCHASE_PAYMENT'));
            const postedAt = paymentDate ? new Date(paymentDate) : new Date();
            if (Number.isNaN(postedAt.getTime())) throw AppError.badRequest('Invalid payment date');

            const payment = await (tx as any).purchasePayment.create({
                data: {
                    companyId,
                    branchId: invoice.branchId,
                    purchaseInvoiceId: invoice.id,
                    supplierId: invoice.supplierId,
                    paymentNo,
                    paymentDate: postedAt,
                    amount: Number(amount),
                    paymentMethod: normalizedPaymentMethod,
                    referenceNo,
                    notes,
                    status: 'POSTED',
                    createdById: userId,
                },
            });

            const newTotalPaid = alreadyPaid + Number(amount);

            let newStatus = invoice.status as any;
            if (newTotalPaid >= grandTotal) {
                newStatus = 'PAID';
            } else if (newTotalPaid > 0 && invoice.status !== ('PAID' as any)) {
                newStatus = 'PARTIAL';
            }

            if (newStatus !== invoice.status) {
                await tx.purchaseInvoice.update({
                    where: { id: invoice.id },
                    data: { status: newStatus }
                });
            }

            const journalEntry = await CoreAccountingService.recordPurchasePayment(tx as any, {
                id: payment.id,
                companyId,
                branchId: invoice.branchId,
                supplierId: invoice.supplierId,
                purchaseNo: invoice.purchaseNo,
                paymentNo: payment.paymentNo,
                amount: Number(payment.amount || 0),
                paymentMethod: normalizedPaymentMethod,
                paymentDate: payment.paymentDate,
                postedById: userId,
                referenceNo: payment.referenceNo,
                notes: payment.notes,
            });

            return { ...payment, journalEntryNo: journalEntry.entryNo };
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result, undefined, 201);
    } catch (error) {
        next(error);
    }
});

// POST /purchases/:id/returns
purchaseRoutes.post('/:id/returns', requirePermission(PERMISSIONS.PURCHASE_RETURN), validate({ body: purchaseReturnSchema }), async (req, res, next) => {
    try {
        const purchaseInvoiceId = req.params.id as string;
        const { items, reason, notes, returnDate } = req.body as z.infer<typeof purchaseReturnSchema>;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        const postedAt = returnDate ? new Date(`${returnDate}T00:00:00.000`) : new Date();
        if (Number.isNaN(postedAt.getTime())) throw AppError.badRequest('Invalid return date');

        const result = await prisma.$transaction(async (tx) => {
            const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
            const invoice = await tx.purchaseInvoice.findFirst({
                where: { id: purchaseInvoiceId, companyId, ...branchScope },
                include: {
                    items: true,
                },
            });

            if (!invoice) throw AppError.notFound('Purchase Invoice');
            if (invoice.status === 'CANCELLED') throw AppError.badRequest('Cannot return against cancelled purchase invoice');
            if (invoice.status === 'DRAFT') throw AppError.badRequest('Cannot return against draft purchase invoice');

            const purchaseItemMap = new Map(invoice.items.map((item) => [item.id, item]));
            const selectedItemIds = items.map((i) => i.purchaseItemId);
            if (new Set(selectedItemIds).size !== selectedItemIds.length) {
                throw AppError.badRequest('Duplicate return item lines are not allowed');
            }

            const existingReturned = await (tx as any).purchaseReturnItem.groupBy({
                by: ['purchaseItemId'],
                where: {
                    purchaseItemId: { in: selectedItemIds },
                    purchaseReturn: {
                        is: {
                            companyId,
                            status: { in: ['DRAFT', 'POSTED'] },
                        },
                    },
                },
                _sum: { qty: true },
            });
            const returnedByItem = new Map(existingReturned.map((x: any) => [x.purchaseItemId, Number(x._sum.qty || 0)]));

            let subtotal = 0;
            let taxTotal = 0;
            const preparedItems = items.map((line) => {
                const source = purchaseItemMap.get(line.purchaseItemId);
                if (!source) throw AppError.badRequest(`Invalid purchase item: ${line.purchaseItemId}`);
                const alreadyReturned = Number(returnedByItem.get(source.id) || 0);
                const availableQty = Number(source.qty) - alreadyReturned;
                if (line.qty > availableQty) {
                    throw AppError.badRequest(`Return qty exceeds available qty for item ${source.id}`);
                }

                const unitCost = Number(source.unitCost);
                const lineTotal = Number(new Decimal(line.qty).mul(unitCost));
                const taxRate = Number(source.qty) > 0 ? Number(source.taxAmount || 0) / Number(source.qty) : 0;
                const lineTax = Number(new Decimal(line.qty).mul(taxRate));
                subtotal += lineTotal;
                taxTotal += lineTax;

                return {
                    purchaseItemId: source.id,
                    productId: source.productId,
                    unitCode: source.unitCode,
                    qty: Number(line.qty),
                    unitCost,
                    taxAmount: lineTax,
                    lineTotal,
                };
            });

            if (preparedItems.length === 0) throw AppError.badRequest('At least one return line is required');
            const grandTotal = subtotal + taxTotal;

            const returnNo = formatDocNo('PR', await nextCounter(tx as any, companyId, 'PURCHASE_RETURN'));

            const purchaseReturn = await (tx as any).purchaseReturn.create({
                data: {
                    companyId,
                    branchId: invoice.branchId,
                    purchaseInvoiceId: invoice.id,
                    supplierId: invoice.supplierId,
                    returnNo,
                    subtotal,
                    taxTotal,
                    grandTotal,
                    status: 'POSTED',
                    reason,
                    notes,
                    createdById: userId,
                    createdAt: postedAt,
                    items: {
                        create: preparedItems.map((line) => ({
                            purchaseItemId: line.purchaseItemId,
                            productId: line.productId,
                            unitCode: line.unitCode,
                            qty: line.qty,
                            unitCost: line.unitCost,
                            taxAmount: line.taxAmount,
                            lineTotal: line.lineTotal,
                        })),
                    },
                },
                include: {
                    items: true,
                },
            });

            for (const item of preparedItems) {
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: invoice.branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: -Math.abs(item.qty), // Drop stock
                    cost: Number(item.unitCost || 0),
                    type: 'RETURN',
                    referenceType: 'PurchaseReturn',
                    referenceId: purchaseReturn.id,
                    createdById: userId,
                });
            }

            const journalEntry = await CoreAccountingService.recordPurchaseReturn(tx as any, {
                id: purchaseReturn.id,
                companyId,
                branchId: invoice.branchId,
                supplierId: invoice.supplierId,
                returnNo,
                purchaseNo: invoice.purchaseNo,
                grandTotal: Number(purchaseReturn.grandTotal || 0),
                taxTotal: Number(purchaseReturn.taxTotal || 0),
                postedAt,
                postedById: userId,
                items: preparedItems.map((item) => ({
                    productId: item.productId,
                    qty: Number(item.qty || 0),
                    unitCost: Number(item.unitCost || 0),
                    lineTotal: Number(item.lineTotal || 0),
                })),
            });

            return { ...purchaseReturn, journalEntryNo: journalEntry.entryNo };
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result, undefined, 201);
    } catch (error) {
        next(error);
    }
});

// PUT /purchases/returns/:id
purchaseRoutes.put('/returns/:id', requirePermission(PERMISSIONS.PURCHASE_RETURN), validate({ body: purchaseReturnSchema }), async (req, res, next) => {
    try {
        const returnId = req.params.id as string;
        const { items, reason, notes, returnDate } = req.body as z.infer<typeof purchaseReturnSchema>;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        const postedAt = returnDate ? new Date(`${returnDate}T00:00:00.000`) : new Date();
        if (Number.isNaN(postedAt.getTime())) throw AppError.badRequest('Invalid return date');

        const result = await prisma.$transaction(async (tx) => {
            const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
            const existing = await (tx as any).purchaseReturn.findFirst({
                where: { id: returnId, companyId, ...branchScope },
                include: {
                    items: true,
                    purchaseInvoice: {
                        include: { items: true }
                    }
                },
            });

            if (!existing) throw AppError.notFound('Purchase Return');
            if (existing.status === 'CANCELLED') throw AppError.badRequest('Cannot edit cancelled purchase return');

            const invoice = existing.purchaseInvoice;
            if (!invoice) throw AppError.badRequest('Purchase invoice not found for this return');
            if (invoice.status === 'CANCELLED') throw AppError.badRequest('Cannot edit return against cancelled purchase invoice');
            if (invoice.status === 'DRAFT') throw AppError.badRequest('Cannot edit return against draft purchase invoice');

            const purchaseItemMap: Map<string, any> = new Map(
                (invoice.items as any[]).map((item: any) => [String(item.id), item] as const)
            );
            const selectedItemIds = items.map((i) => i.purchaseItemId);
            if (new Set(selectedItemIds).size !== selectedItemIds.length) {
                throw AppError.badRequest('Duplicate return item lines are not allowed');
            }

            const existingReturned = await (tx as any).purchaseReturnItem.groupBy({
                by: ['purchaseItemId'],
                where: {
                    purchaseItemId: { in: selectedItemIds },
                    purchaseReturn: {
                        is: {
                            companyId,
                            id: { not: returnId },
                            status: { in: ['DRAFT', 'POSTED'] },
                        },
                    },
                },
                _sum: { qty: true },
            });
            const returnedByItem = new Map(existingReturned.map((x: any) => [x.purchaseItemId, Number(x._sum.qty || 0)]));

            let subtotal = 0;
            let taxTotal = 0;
            const preparedItems = items.map((line) => {
                const source = purchaseItemMap.get(line.purchaseItemId);
                if (!source) throw AppError.badRequest(`Invalid purchase item: ${line.purchaseItemId}`);
                const alreadyReturned = Number(returnedByItem.get(source.id) || 0);
                const availableQty = Number(source.qty) - alreadyReturned;
                if (line.qty > availableQty) {
                    throw AppError.badRequest(`Return qty exceeds available qty for item ${source.id}`);
                }

                const unitCost = Number(source.unitCost);
                const lineTotal = Number(new Decimal(line.qty).mul(unitCost));
                const taxRate = Number(source.qty) > 0 ? Number(source.taxAmount || 0) / Number(source.qty) : 0;
                const lineTax = Number(new Decimal(line.qty).mul(taxRate));
                subtotal += lineTotal;
                taxTotal += lineTax;

                return {
                    purchaseItemId: source.id,
                    productId: source.productId,
                    unitCode: source.unitCode,
                    qty: Number(line.qty),
                    unitCost,
                    taxAmount: lineTax,
                    lineTotal,
                };
            });

            if (preparedItems.length === 0) throw AppError.badRequest('At least one return line is required');
            const grandTotal = subtotal + taxTotal;

            // Restore inventory from existing return lines before applying new lines.
            for (const item of existing.items as any[]) {
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: existing.branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: Math.abs(Number(item.qty || 0)),
                    cost: Number(item.unitCost || 0), type: 'RETURN',
                    referenceType: 'PurchaseReturnEditRollback',
                    referenceId: existing.id,
                    createdById: userId,
                });
            }

            await (tx as any).purchaseReturnItem.deleteMany({
                where: { returnId: existing.id },
            });

            await (tx as any).purchaseReturn.update({
                where: { id: existing.id },
                data: {
                    subtotal,
                    taxTotal,
                    grandTotal,
                    reason: reason || null,
                    notes: notes || null,
                    createdAt: postedAt,
                },
            });

            if (preparedItems.length > 0) {
                await (tx as any).purchaseReturnItem.createMany({
                    data: preparedItems.map((line) => ({
                        returnId: existing.id,
                        purchaseItemId: line.purchaseItemId,
                        productId: line.productId,
                        unitCode: line.unitCode,
                        qty: line.qty,
                        unitCost: line.unitCost,
                        taxAmount: line.taxAmount,
                        lineTotal: line.lineTotal,
                    })),
                });
            }

            // Apply edited inventory impact.
            for (const item of preparedItems) {
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: existing.branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: -Math.abs(item.qty),
                    cost: item.unitCost, type: 'RETURN',
                    referenceType: 'PurchaseReturn',
                    referenceId: existing.id,
                    createdById: userId,
                });
            }

            await tx.journalEntry.deleteMany({
                where: {
                    sourceType: 'PurchaseReturn',
                    sourceId: existing.id,
                },
            });

            await CoreAccountingService.recordPurchaseReturn(tx as any, {
                id: existing.id,
                companyId,
                branchId: existing.branchId,
                supplierId: existing.supplierId,
                returnNo: existing.returnNo,
                purchaseNo: invoice.purchaseNo,
                grandTotal,
                taxTotal,
                postedAt,
                postedById: userId,
                items: preparedItems.map((item) => ({
                    productId: item.productId,
                    qty: Number(item.qty || 0),
                    unitCost: Number(item.unitCost || 0),
                    lineTotal: Number(item.lineTotal || 0),
                })),
            });

            const updated = await (tx as any).purchaseReturn.findFirst({
                where: { id: existing.id, companyId },
                include: {
                    items: true,
                    purchaseInvoice: { select: { id: true, purchaseNo: true } },
                    supplier: { select: { id: true, name: true, supplierCode: true } },
                },
            });

            return updated;
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result);
    } catch (error) {
        next(error);
    }
});

// DELETE /purchases/returns/:id
purchaseRoutes.delete('/returns/:id', requirePermission(PERMISSIONS.PURCHASE_RETURN), async (req, res, next) => {
    try {
        const returnId = req.params.id as string;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;

        const result = await prisma.$transaction(async (tx) => {
            const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
            const existing = await (tx as any).purchaseReturn.findFirst({
                where: { id: returnId, companyId, ...branchScope },
                include: { items: true },
            });

            if (!existing) throw AppError.notFound('Purchase Return');
            if (existing.status === 'CANCELLED') {
                return { alreadyCancelled: true };
            }

            // Revert inventory impact from the posted return.
            for (const item of existing.items as any[]) {
                await InventoryService.mutateStock(tx, {
                    companyId,
                    branchId: existing.branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyChange: Math.abs(Number(item.qty || 0)),
                    cost: Number(item.unitCost || 0), type: 'RETURN',
                    referenceType: 'PurchaseReturnVoid',
                    referenceId: existing.id,
                    createdById: userId,
                });
            }

            const mergedNotes = [
                existing.notes || null,
                `[Cancelled ${new Date().toISOString()} by ${req.user?.email || userId}]`,
            ].filter(Boolean).join(' | ');

            await (tx as any).purchaseReturn.update({
                where: { id: existing.id },
                data: {
                    status: 'CANCELLED',
                    notes: mergedNotes,
                },
            });

            await tx.journalEntry.deleteMany({
                where: {
                    sourceType: 'PurchaseReturn',
                    sourceId: existing.id,
                },
            });

            return { alreadyCancelled: false };
        }, { maxWait: 10000, timeout: 20000 });

        if (result.alreadyCancelled) {
            sendSuccess(res, { message: 'Purchase return already cancelled' });
            return;
        }
        sendSuccess(res, { message: 'Purchase return cancelled and inventory restored' });
    } catch (error) {
        next(error);
    }
});

// GET /purchases/:id
purchaseRoutes.get('/:id/return-candidates', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const purchaseId = req.params.id as string;
        const returnId = typeof req.query.returnId === 'string' ? req.query.returnId : undefined;

        if (returnId) {
            const existingReturn = await (prisma as any).purchaseReturn.findFirst({
                where: { id: returnId, companyId },
                select: { id: true, purchaseInvoiceId: true },
            });
            if (!existingReturn) throw AppError.notFound('Purchase Return');
            if (String(existingReturn.purchaseInvoiceId) !== purchaseId) {
                throw AppError.badRequest('Return does not belong to selected purchase invoice');
            }
        }

        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const purchase = await prisma.purchaseInvoice.findFirst({
            where: { id: purchaseId, companyId, ...branchScope },
            include: {
                supplier: { select: { id: true, name: true, supplierCode: true } },
                branch: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                itemCode: true,
                                name: true,
                                nameArabic: true,
                                taxRate: true,
                                tax: { select: { rate: true } },
                                units: { select: { unitCode: true, unitName: true, barcodes: true, qtyInBaseUnit: true, isBase: true } }
                            }
                        },
                    },
                },
            },
        });
        if (!purchase) throw AppError.notFound('Purchase Invoice');

        const existingReturned = await (prisma as any).purchaseReturnItem.groupBy({
            by: ['purchaseItemId'],
            where: {
                purchaseItemId: { in: purchase.items.map((i) => i.id) },
                purchaseReturn: {
                    is: {
                        companyId,
                        status: { in: ['DRAFT', 'POSTED'] },
                        ...(returnId ? { id: { not: returnId } } : {}),
                    }
                },
            },
            _sum: { qty: true },
        });
        const returnedMap = new Map(existingReturned.map((r: any) => [r.purchaseItemId, Number(r._sum.qty || 0)]));

        const productIds = purchase.items.map(i => i.productId);
        const stocks = await prisma.inventoryStock.findMany({
            where: {
                companyId,
                branchId: purchase.branchId,
                productId: { in: productIds }
            }
        });
        const stockMap = new Map(stocks.map(s => [s.productId, Number(s.qtyOnHand || 0)]));

        const items = purchase.items.map((item) => {
            const product = item.product as any;
            const purchasedQty = Number(item.qty);
            const returnedQty = returnedMap.get(item.id) || 0;
            const invoiceQtyAvailable = purchasedQty - Number(returnedQty);

            const baseUnit = product.units?.find((u: any) => u.isBase);
            const currentUnit = product.units?.find((u: any) => u.unitCode === item.unitCode);

            let physicalQtyAvailable = 999999999;
            if (baseUnit && currentUnit) {
                const stockInBase = stockMap.get(item.productId) || 0;
                physicalQtyAvailable = stockInBase / Number(currentUnit.qtyInBaseUnit || 1);
            }

            return {
                id: item.id,
                productId: item.productId,
                product: item.product,
                unitCode: item.unitCode,
                qtyPurchased: purchasedQty,
                qtyReturned: returnedQty,
                qtyAvailable: Math.max(0, Math.min(invoiceQtyAvailable, physicalQtyAvailable)),
                invoiceQtyAvailable,
                physicalQtyAvailable,
                unitCost: item.unitCost,
                taxAmount: item.taxAmount,
                lineTotal: item.lineTotal,
            };
        });

        sendSuccess(res, {
            purchase: {
                id: purchase.id,
                purchaseNo: purchase.purchaseNo,
                invoiceNoSupplier: purchase.invoiceNoSupplier,
                supplier: purchase.supplier,
                branch: purchase.branch,
                createdAt: purchase.createdAt,
            },
            items,
        });
    } catch (error) {
        next(error);
    }
});

// GET /purchases/:id
purchaseRoutes.get('/:id', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const purchase = await prisma.purchaseInvoice.findFirst({
            where: { id: req.params.id as string, companyId: req.user!.companyId, ...branchScope },
            include: {
                supplier: true,
                branch: true,
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                itemCode: true,
                                name: true,
                                nameArabic: true,
                                taxRate: true,
                                tax: { select: { rate: true } },
                                units: { select: { unitCode: true, unitName: true, barcodes: true, qtyInBaseUnit: true } }
                            }
                        }
                    }
                },
            },
        });
        if (!purchase) throw AppError.notFound('Purchase Invoice');
        sendSuccess(res, purchase);
    } catch (error) { next(error) }
});

// ══════════════════════════════════════════════════════════════
// EXPENSE PURCHASE ROUTES (Non-Stock Purchases)
// ══════════════════════════════════════════════════════════════

const expensePurchaseItemSchema = z.object({
    description: z.string().min(1),
    expenseAccountId: z.string().min(1),
    amount: z.number().positive(),
    quantity: z.number().int().positive().optional().default(1),
});

const expensePurchaseSchema = z.object({
    vendorName: z.string().min(1),
    branchId: z.string().min(1),
    invoiceNo: z.string().optional(),
    date: z.string().optional(),
    paymentMethod: z.enum(['CASH', 'BANK', 'BANK_TRANSFER', 'CREDIT']),
    items: z.array(expensePurchaseItemSchema).min(1),
    notes: z.string().optional(),
});

// GET /expense-purchases
purchaseRoutes.get('/expense-purchases', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const { branchId, status, search } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (status) where.status = status;
        if (search && typeof search === 'string') {
            where.OR = [
                { vendorName: { contains: search, mode: 'insensitive' } },
                { invoiceNo: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [expenses, total] = await Promise.all([
            prisma.expensePurchase.findMany({
                where,
                skip,
                take,
                include: {
                    branch: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.expensePurchase.count({ where }),
        ]);

        sendPaginated(res, expenses, total, page, limit);
    } catch (error) { next(error); }
});

// GET /expense-purchases/:id
purchaseRoutes.get('/expense-purchases/:id', requirePermission(PERMISSIONS.PURCHASE_VIEW), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const expense = await prisma.expensePurchase.findFirst({
            where: { id: req.params.id as string, companyId, ...branchScope },
            include: {
                branch: true,
                createdBy: { select: { id: true, name: true } },
                items: true,
                journalEntry: { select: { id: true, entryNo: true } },
            },
        });

        if (!expense) throw AppError.notFound('Expense Purchase');
        sendSuccess(res, expense);
    } catch (error) { next(error); }
});

// POST /expense-purchases
purchaseRoutes.post('/expense-purchases', requirePermission(PERMISSIONS.PURCHASE_CREATE), validate({ body: expensePurchaseSchema }), async (req, res, next) => {
    try {
        const { vendorName, branchId, invoiceNo, date, paymentMethod, items, notes } = req.body;
        const companyId = req.user!.companyId;
        const userId = req.user!.id;
        await assertBranchAccessible(req, branchId);
        const normalizedPaymentMethod = String(paymentMethod || '').trim().toUpperCase() === 'BANK'
            ? 'BANK_TRANSFER'
            : String(paymentMethod || '').trim().toUpperCase();

        const result = await prisma.$transaction(async (tx) => {
            // Calculate total amount
            const totalAmount = items.reduce((sum: number, item: any) => {
                return sum + (Number(item.amount) * Number(item.quantity || 1));
            }, 0);

            // Create expense purchase
            const expensePurchase = await (tx as any).expensePurchase.create({
                data: {
                    companyId,
                    branchId,
                    vendorName,
                    invoiceNo,
                    date: date ? new Date(date) : new Date(),
                    totalAmount,
                    paymentMethod: normalizedPaymentMethod,
                    status: 'POSTED',
                    notes,
                    createdById: userId,
                    items: {
                        create: items.map((item: any) => ({
                            description: item.description,
                            expenseAccountId: item.expenseAccountId,
                            amount: Number(item.amount),
                            quantity: Number(item.quantity || 1),
                        })),
                    },
                },
                include: { items: true },
            });

            // Create journal entry
            const journalEntryLines: any[] = [];

            // Debit: Expense accounts (one line per item)
            for (const item of expensePurchase.items) {
                journalEntryLines.push({
                    accountId: item.expenseAccountId,
                    debit: Number(item.amount) * Number(item.quantity || 1),
                    credit: 0,
                    description: item.description,
                });
            }

            // Credit: Cash/Bank account (depends on payment method)
            let creditAccountId: string;
            if (normalizedPaymentMethod === 'CASH') {
                // Find cash account (you may want to make this configurable)
                const cashAccount = await (tx as any).account.findFirst({
                    where: { companyId, accountType: 'ASSET', name: { contains: 'Cash', mode: 'insensitive' } },
                });
                creditAccountId = cashAccount?.id;
                if (!creditAccountId) {
                    throw AppError.badRequest('Cash account not found. Please create a Cash account first.');
                }
            } else if (normalizedPaymentMethod === 'BANK_TRANSFER') {
                // Find bank account
                const bankAccount = await (tx as any).account.findFirst({
                    where: { companyId, accountType: 'ASSET', name: { contains: 'Bank', mode: 'insensitive' } },
                });
                creditAccountId = bankAccount?.id;
                if (!creditAccountId) {
                    throw AppError.badRequest('Bank account not found. Please create a Bank account first.');
                }
            } else {
                // Credit - use Accounts Payable
                const payableAccount = await (tx as any).account.findFirst({
                    where: { companyId, accountType: 'LIABILITY', name: { contains: 'Payable', mode: 'insensitive' } },
                });
                creditAccountId = payableAccount?.id;
                if (!creditAccountId) {
                    throw AppError.badRequest('Accounts Payable account not found.');
                }
            }

            journalEntryLines.push({
                accountId: creditAccountId,
                debit: 0,
                credit: totalAmount,
                description: `Payment to ${vendorName}`,
            });

            // Create journal entry via CoreAccountingService
            const journalEntry = await (CoreAccountingService as any).createJournalEntryStrict(tx as any, {
                companyId,
                branchId,
                date: expensePurchase.date,
                memo: `Expense Purchase - ${vendorName} (Invoice: ${invoiceNo || 'N/A'})`,
                lines: journalEntryLines,
                sourceType: 'ExpensePurchase',
                sourceId: expensePurchase.id,
                postedById: userId,
            });

            // Update expense purchase with journal entry reference
            await (tx as any).expensePurchase.update({
                where: { id: expensePurchase.id },
                data: { journalEntryId: journalEntry.id, status: normalizedPaymentMethod === 'CREDIT' ? 'DRAFT' : 'PAID' },
            });

            return expensePurchase;
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result, undefined, 201);
    } catch (error) {
        console.error('[Expense Purchase POST Error]:', error);
        next(error);
    }
});

// DELETE /expense-purchases/:id
purchaseRoutes.delete('/expense-purchases/:id', requirePermission(PERMISSIONS.PURCHASE_CREATE), async (req, res, next) => {
  try {
   const id = req.params.id as string;
   const companyId = req.user!.companyId;
   const userId = req.user!.id;
   const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };

   const result = await prisma.$transaction(async (tx) => {
     const expense = await tx.expensePurchase.findFirst({
        where: { id, companyId, ...branchScope },
        include: { journalEntry: true },
      });

      if (!expense) throw AppError.notFound('Expense Purchase');

      // Delete associated journal entry if exists
      if (expense.journalEntryId) {
        await tx.journalEntry.delete({ where: { id: expense.journalEntryId } });
      }

      // Delete expense purchase (items will be cascade deleted)
      await tx.expensePurchase.delete({ where: { id } });

      return { message: 'Expense purchase deleted successfully' };
    });

    sendSuccess(res, result);
  } catch (error) {
   console.error('[Expense Purchase DELETE Error]:', error);
    next(error);
  }
});
