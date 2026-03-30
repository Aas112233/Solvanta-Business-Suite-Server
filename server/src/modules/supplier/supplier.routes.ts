import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { z } from 'zod';

export const supplierRoutes = Router();
supplierRoutes.use(authenticate);

const activeSupplierFilter = {
    OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
    ],
};

const supplierSchema = z.object({
    supplierCode: z.string().max(50).optional().or(z.literal('')),
    name: z.string().min(1).max(200),
    phone: z.string().optional(),
    vatNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    openingBalance: z.number().optional().default(0),
});

function parseOptionalDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
}

// GET /suppliers
supplierRoutes.get('/', requirePermission(PERMISSIONS.SUPPLIER_VIEW), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const companyId = req.user!.companyId;
        const where: any = {
            companyId,
            ...activeSupplierFilter,
        };
        if (query.search) {
            where.AND = [
                {
                    OR: [
                        { name: { contains: query.search, mode: 'insensitive' } },
                        { supplierCode: { contains: query.search, mode: 'insensitive' } },
                        { phone: { contains: query.search, mode: 'insensitive' } },
                        { vatNumber: { contains: query.search, mode: 'insensitive' } },
                    ]
                }
            ];
        }

        const [suppliers, total] = await Promise.all([
            prisma.supplier.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
            prisma.supplier.count({ where }),
        ]);

        const supplierIds = suppliers.map((supplier) => supplier.id);
        const purchaseStatsBySupplier = new Map<string, {
            purchaseCount: number;
            totalPurchases: number;
            lastPurchase: { id: string; purchaseNo: string; grandTotal: number; createdAt: Date; status: string } | null;
        }>();
        const paymentStatsBySupplier = new Map<string, { paymentCount: number; totalPaid: number }>();

        if (supplierIds.length > 0) {
            const [purchaseRows, paymentRows] = await Promise.all([
                prisma.purchaseInvoice.findMany({
                    where: {
                        companyId,
                        supplierId: { in: supplierIds },
                        status: { not: 'CANCELLED' } as any,
                    },
                    select: {
                        id: true,
                        supplierId: true,
                        purchaseNo: true,
                        grandTotal: true,
                        createdAt: true,
                        status: true,
                    },
                    orderBy: [{ supplierId: 'asc' }, { createdAt: 'desc' }],
                }),
                prisma.purchasePayment.findMany({
                    where: {
                        companyId,
                        supplierId: { in: supplierIds },
                        status: 'POSTED' as any,
                    },
                    select: {
                        id: true,
                        supplierId: true,
                        amount: true,
                    },
                }),
            ]);

            for (const row of purchaseRows) {
                const current = purchaseStatsBySupplier.get(row.supplierId) ?? {
                    purchaseCount: 0,
                    totalPurchases: 0,
                    lastPurchase: null,
                };
                current.purchaseCount += 1;
                current.totalPurchases += Number(row.grandTotal || 0);
                if (!current.lastPurchase) {
                    current.lastPurchase = {
                        id: row.id,
                        purchaseNo: row.purchaseNo,
                        grandTotal: row.grandTotal,
                        createdAt: row.createdAt,
                        status: String(row.status),
                    };
                }
                purchaseStatsBySupplier.set(row.supplierId, current);
            }

            for (const row of paymentRows) {
                const current = paymentStatsBySupplier.get(row.supplierId) ?? { paymentCount: 0, totalPaid: 0 };
                current.paymentCount += 1;
                current.totalPaid += Number(row.amount || 0);
                paymentStatsBySupplier.set(row.supplierId, current);
            }
        }

        const enriched = suppliers.map((supplier) => {
            const purchaseStats = purchaseStatsBySupplier.get(supplier.id) ?? {
                purchaseCount: 0,
                totalPurchases: 0,
                lastPurchase: null,
            };
            const paymentStats = paymentStatsBySupplier.get(supplier.id) ?? {
                paymentCount: 0,
                totalPaid: 0,
            };

            const openingBalance = Number(supplier.openingBalance || 0);
            const outstandingBalance = openingBalance + purchaseStats.totalPurchases - paymentStats.totalPaid;

            return {
                ...supplier,
                metrics: {
                    purchaseCount: purchaseStats.purchaseCount,
                    paymentCount: paymentStats.paymentCount,
                    totalPurchases: purchaseStats.totalPurchases,
                    totalPaid: paymentStats.totalPaid,
                    outstandingBalance,
                    lastPurchase: purchaseStats.lastPurchase,
                },
            };
        });

        sendPaginated(res, enriched, total, page, limit);
    } catch (error) { next(error); }
});

// GET /suppliers/summary/stats — overall stats for dashboard
supplierRoutes.get('/summary/stats', requirePermission(PERMISSIONS.SUPPLIER_VIEW), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user!.companyId;
        const [totalSuppliers, activeSuppliers] = await Promise.all([
            prisma.supplier.count({ where: { companyId } }),
            prisma.supplier.count({
                where: {
                    companyId,
                    ...activeSupplierFilter,
                }
            }),
        ]);

        const purchases = await prisma.purchaseInvoice.aggregate({
            where: { companyId },
            _sum: { grandTotal: true },
            _count: { id: true }
        });

        sendSuccess(res, {
            totalSuppliers,
            activeSuppliers,
            totalPurchaseValue: purchases._sum.grandTotal || 0,
            totalPurchaseCount: purchases._count.id
        });
    } catch (error) { next(error); }
});

// GET /suppliers/:id/ledger — supplier transaction history
supplierRoutes.get('/:id/ledger', requirePermission(PERMISSIONS.SUPPLIER_VIEW), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const supplierId = req.params.id as string;
        const companyId = req.user!.companyId;
        const dateFrom = parseOptionalDate(req.query.dateFrom);
        const dateTo = parseOptionalDate(req.query.dateTo);

        const supplier = await prisma.supplier.findFirst({
            where: { id: supplierId, companyId, ...activeSupplierFilter },
        });
        if (!supplier) throw AppError.notFound('Supplier');

        // Fetch all transactions: Invoices, Returns, Payments
        const [invoices, returns, payments] = await Promise.all([
            prisma.purchaseInvoice.findMany({
                where: {
                    supplierId,
                    companyId,
                    status: { not: 'CANCELLED' } as any,
                },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.purchaseReturn.findMany({
                where: {
                    supplierId,
                    companyId,
                    status: { not: 'CANCELLED' } as any,
                },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.purchasePayment.findMany({
                where: {
                    supplierId,
                    companyId,
                    status: { not: 'VOID' } as any,
                },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        // Merge and sort
        const transactions: any[] = [
            ...invoices.map(i => ({
                id: i.id,
                date: i.createdAt,
                type: 'PURCHASE',
                reference: i.purchaseNo,
                supplierInvoiceNo: i.invoiceNoSupplier || '-',
                description: `Purchase Invoice: ${i.purchaseNo}`,
                debit: 0,
                credit: Number(i.grandTotal),
            })),
            ...returns.map(r => ({
                id: r.id,
                date: r.createdAt,
                type: 'RETURN',
                reference: r.returnNo,
                supplierInvoiceNo: '-',
                description: `Purchase Return: ${r.returnNo}`,
                debit: Number(r.grandTotal),
                credit: 0,
            })),
            ...payments.map(p => ({
                id: p.id,
                date: p.paymentDate || p.createdAt,
                type: 'PAYMENT',
                reference: p.paymentNo,
                supplierInvoiceNo: '-',
                description: `Payment: ${p.paymentNo}${p.referenceNo ? ` (${p.referenceNo})` : ''}`,
                debit: Number(p.amount),
                credit: 0,
            })),
        ];

        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate running balance
        let balance = Number(supplier.openingBalance || 0);
        const ledger = transactions.map(t => {
            balance += (t.credit - t.debit);
            return { ...t, balance };
        });

        // Filter by date if provided
        const filteredLedger = ledger.filter(t => {
            const tDate = new Date(t.date);
            if (dateFrom && tDate < dateFrom) return false;
            if (dateTo && tDate > dateTo) return false;
            return true;
        });

        sendSuccess(res, {
            supplier: { id: supplier.id, name: supplier.name, supplierCode: supplier.supplierCode, openingBalance: supplier.openingBalance },
            openingBalance: supplier.openingBalance,
            ledger: filteredLedger,
            finalBalance: balance
        });
    } catch (error) { next(error); }
});

// GET /suppliers/:id
supplierRoutes.get('/:id', requirePermission(PERMISSIONS.SUPPLIER_VIEW), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const supplier = await prisma.supplier.findFirst({
            where: { id: req.params.id as any, companyId: req.user!.companyId, ...activeSupplierFilter },
        });
        if (!supplier) throw AppError.notFound('Supplier');

        // Fetch recent purchases for this supplier
        const recentPurchases = await prisma.purchaseInvoice.findMany({
            where: { supplierId: req.params.id as any, companyId: req.user!.companyId },
            take: 5,
            orderBy: { createdAt: 'desc' }
        });

        sendSuccess(res, { ...supplier, recentPurchases });
    } catch (error) { next(error); }
});

// POST /suppliers
supplierRoutes.post('/', requirePermission(PERMISSIONS.SUPPLIER_CREATE), validate({ body: supplierSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { address, city, country, ...rest } = req.body;
        const companyId = req.user!.companyId;

        // Auto-generate supplierCode if not provided
        if (!rest.supplierCode) {
            const lastSupplier = await prisma.supplier.findFirst({
                where: { companyId },
                orderBy: { supplierCode: 'desc' },
                select: { supplierCode: true }
            });

            let nextNum = 1;
            if (lastSupplier?.supplierCode) {
                const match = lastSupplier.supplierCode.match(/\d+/);
                if (match) {
                    nextNum = parseInt(match[0]) + 1;
                }
            }
            rest.supplierCode = `VND-${nextNum.toString().padStart(4, '0')}`;
        }

        const supplier = await prisma.supplier.create({
            data: {
                ...rest,
                address: { street: address, city, country },
                companyId,
                deletedAt: null
            },
        });
        sendSuccess(res, supplier, undefined, 201);
    } catch (error) { next(error); }
});

// PATCH /suppliers/:id
supplierRoutes.patch('/:id', requirePermission(PERMISSIONS.SUPPLIER_EDIT), validate({ body: supplierSchema.partial() }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const existing = await prisma.supplier.findFirst({
            where: { id: req.params.id as any, companyId: req.user!.companyId, ...activeSupplierFilter },
        });
        if (!existing) throw AppError.notFound('Supplier');

        const { address, city, country, id, ...rest } = req.body;
        const updateData: any = { ...rest };
        if (address !== undefined || city !== undefined || country !== undefined) {
            updateData.address = {
                ...(existing.address as any || {}),
                ...(address !== undefined && { street: address }),
                ...(city !== undefined && { city }),
                ...(country !== undefined && { country }),
            };
        }

        const supplier = await prisma.supplier.update({
            where: { id: req.params.id as any },
            data: updateData
        });
        sendSuccess(res, supplier);
    } catch (error) { next(error); }
});

// DELETE /suppliers/:id (soft-delete)
supplierRoutes.delete('/:id', requirePermission(PERMISSIONS.SUPPLIER_DELETE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        await prisma.supplier.updateMany({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
            data: { deletedAt: new Date() },
        });
        sendSuccess(res, { message: 'Supplier archived' });
    } catch (error) { next(error); }
});
