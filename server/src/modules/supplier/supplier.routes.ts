import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { basePrisma, prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { nextCounter } from '../../utils/documentCounter.js';
import { Prisma } from '@prisma/client';
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
    supplierCode: z.string().trim().max(50).optional().or(z.literal('')),
    name: z.string().min(1).max(200),
    phone: z.string().optional(),
    vatNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    openingBalance: z.number().optional().default(0),
});

const AUTO_SUPPLIER_CODE_PREFIX = 'VND-';
const AUTO_SUPPLIER_CODE_PADDING = 4;
const MAX_SUPPLIER_CODE_ATTEMPTS = 5;
const SUPPLIER_CODE_COUNTER_SCOPE = 'SUPPLIER_CODE';

function normalizeSupplierCode(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized || undefined;
}

async function findSupplierByCode(companyId: string, supplierCode: string, excludeId?: string) {
    return basePrisma.supplier.findFirst({
        where: {
            companyId,
            supplierCode,
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
    });
}

async function getHighestAutoSupplierCodeNumber(companyId: string): Promise<number> {
    const existingAutoCodes = await basePrisma.supplier.findMany({
        where: {
            companyId,
            supplierCode: { startsWith: AUTO_SUPPLIER_CODE_PREFIX },
        },
        select: { supplierCode: true },
    });

    return existingAutoCodes.reduce((max, supplier) => {
        const match = supplier.supplierCode.match(new RegExp(`^${AUTO_SUPPLIER_CODE_PREFIX}(\\d+)$`));
        const currentNum = match ? Number(match[1]) : 0;
        return Math.max(max, currentNum);
    }, 0);
}

async function syncSupplierCodeCounter(companyId: string): Promise<void> {
    const [highestExistingCodeNumber, currentCounter] = await Promise.all([
        getHighestAutoSupplierCodeNumber(companyId),
        basePrisma.documentCounter.findUnique({
            where: {
                companyId_scope_scopeKey: {
                    companyId,
                    scope: SUPPLIER_CODE_COUNTER_SCOPE,
                    scopeKey: 'global',
                },
            },
            select: { lastNumber: true },
        }),
    ]);

    if (!currentCounter) {
        await basePrisma.documentCounter.create({
            data: {
                companyId,
                scope: SUPPLIER_CODE_COUNTER_SCOPE,
                scopeKey: 'global',
                lastNumber: highestExistingCodeNumber,
            },
        }).catch((error) => {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
                throw error;
            }
        });
        return;
    }

    if (currentCounter.lastNumber < highestExistingCodeNumber) {
        await basePrisma.documentCounter.update({
            where: {
                companyId_scope_scopeKey: {
                    companyId,
                    scope: SUPPLIER_CODE_COUNTER_SCOPE,
                    scopeKey: 'global',
                },
            },
            data: {
                lastNumber: highestExistingCodeNumber,
            },
        });
    }
}

async function generateUniqueSupplierCode(companyId: string): Promise<string> {
    await syncSupplierCodeCounter(companyId);
    for (let attempt = 0; attempt < MAX_SUPPLIER_CODE_ATTEMPTS; attempt += 1) {
        const nextVal = await nextCounter(basePrisma as any, companyId, SUPPLIER_CODE_COUNTER_SCOPE);
        const candidate = `${AUTO_SUPPLIER_CODE_PREFIX}${nextVal.toString().padStart(AUTO_SUPPLIER_CODE_PADDING, '0')}`;
        const existing = await findSupplierByCode(companyId, candidate);
        if (!existing) return candidate;
    }
    throw AppError.conflict('Unable to generate a unique supplier code. Please try again.');
}

function isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function parseOptionalDate(value: unknown, boundary: 'start' | 'end' = 'start'): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const trimmedValue = value.trim();
    const d = new Date(trimmedValue);
    if (Number.isNaN(d.getTime())) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
        if (boundary === 'end') {
            d.setHours(23, 59, 59, 999);
        } else {
            d.setHours(0, 0, 0, 0);
        }
    }
    return d;
}

// GET /suppliers
supplierRoutes.get('/', requirePermission(PERMISSIONS.SUPPLIER_VIEW), asyncHandler(async (req: Request, res: Response) => {
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
        basePrisma.supplier.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        basePrisma.supplier.count({ where }),
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
}));

// GET /suppliers/summary/stats — overall stats for dashboard
supplierRoutes.get('/summary/stats', requirePermission(PERMISSIONS.SUPPLIER_VIEW), asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user!.companyId;
    const [totalSuppliers, activeSuppliers] = await Promise.all([
        basePrisma.supplier.count({ where: { companyId } }),
        basePrisma.supplier.count({
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
}));

// GET /suppliers/:id/ledger — supplier transaction history
supplierRoutes.get('/:id/ledger', requirePermission(PERMISSIONS.SUPPLIER_VIEW), asyncHandler(async (req: Request, res: Response) => {
    const supplierId = req.params.id as string;
    const companyId = req.user!.companyId;
    const dateFrom = parseOptionalDate(req.query.dateFrom, 'start');
    const dateTo = parseOptionalDate(req.query.dateTo, 'end');

    const supplier = await basePrisma.supplier.findFirst({
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

    // Calculate balances against the full transaction history so filtered periods
    // still return the correct opening and closing figures.
    let runningBalance = Number(supplier.openingBalance || 0);
    let openingBalance = runningBalance;
    let finalBalance = runningBalance;
    const filteredLedger: Array<Record<string, unknown>> = [];

    for (const transaction of transactions) {
        const transactionDate = new Date(transaction.date);
        const delta = Number(transaction.credit || 0) - Number(transaction.debit || 0);

        if (dateFrom && transactionDate < dateFrom) {
            runningBalance += delta;
            openingBalance = runningBalance;
            finalBalance = runningBalance;
            continue;
        }

        if (dateTo && transactionDate > dateTo) {
            break;
        }

        runningBalance += delta;
        finalBalance = runningBalance;
        filteredLedger.push({ ...transaction, balance: runningBalance });
    }

    sendSuccess(res, {
        supplier: {
            id: supplier.id,
            name: supplier.name,
            supplierCode: supplier.supplierCode,
            openingBalance: supplier.openingBalance,
            phone: supplier.phone,
            vatNumber: supplier.vatNumber,
            address: supplier.address,
        },
        openingBalance,
        ledger: filteredLedger,
        finalBalance
    });
}));

// GET /suppliers/:id
supplierRoutes.get('/:id', requirePermission(PERMISSIONS.SUPPLIER_VIEW), asyncHandler(async (req: Request, res: Response) => {
    const supplier = await basePrisma.supplier.findFirst({
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
}));

// POST /suppliers
supplierRoutes.post('/', requirePermission(PERMISSIONS.SUPPLIER_CREATE), validate({ body: supplierSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { address, city, country, ...rest } = req.body;
        const companyId = req.user!.companyId;
        const requestedSupplierCode = normalizeSupplierCode(rest.supplierCode);
        const baseData = {
            ...rest,
            address: { street: address, city, country },
            companyId,
            deletedAt: null,
        };

        if (requestedSupplierCode) {
            const existingCode = await findSupplierByCode(companyId, requestedSupplierCode);
            if (existingCode) throw AppError.conflict(`Supplier code '${requestedSupplierCode}' already exists`);

            const supplier = await prisma.supplier.create({
                data: {
                    ...baseData,
                    supplierCode: requestedSupplierCode,
                },
            });
            sendSuccess(res, supplier, undefined, 201);
            return;
        }

        for (let attempt = 0; attempt < MAX_SUPPLIER_CODE_ATTEMPTS; attempt += 1) {
            try {
                const generatedCode = await generateUniqueSupplierCode(companyId);
                const supplier = await prisma.supplier.create({
                    data: {
                        ...baseData,
                        supplierCode: generatedCode,
                    },
                });
                sendSuccess(res, supplier, undefined, 201);
                return;
            } catch (error) {
                if (isUniqueConstraintError(error)) {
                    continue;
                }
                throw error;
            }
        }

        throw AppError.conflict('Unable to generate a unique supplier code. Please try again.');
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            next(AppError.conflict('Supplier code already exists'));
            return;
        }
        next(error);
    }
});

// PATCH /suppliers/:id
supplierRoutes.patch('/:id', requirePermission(PERMISSIONS.SUPPLIER_EDIT), validate({ body: supplierSchema.partial() }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const existing = await basePrisma.supplier.findFirst({
            where: { id: req.params.id as any, companyId: req.user!.companyId, ...activeSupplierFilter },
        });
        if (!existing) throw AppError.notFound('Supplier');

        const { address, city, country, id, ...rest } = req.body;
        const updateData: any = { ...rest };
        if (rest.supplierCode !== undefined) {
            const normalizedSupplierCode = normalizeSupplierCode(rest.supplierCode);
            if (!normalizedSupplierCode) {
                delete updateData.supplierCode;
            } else {
                if (normalizedSupplierCode !== existing.supplierCode) {
                    const existingCode = await findSupplierByCode(req.user!.companyId, normalizedSupplierCode, existing.id);
                    if (existingCode) throw AppError.conflict(`Supplier code '${normalizedSupplierCode}' already exists`);
                }
                updateData.supplierCode = normalizedSupplierCode;
            }
        }
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
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            next(AppError.conflict('Supplier code already exists'));
            return;
        }
        next(error);
    }
});

// DELETE /suppliers/:id (soft-delete)
supplierRoutes.delete('/:id', requirePermission(PERMISSIONS.SUPPLIER_DELETE), asyncHandler(async (req: Request, res: Response) => {
    await basePrisma.supplier.updateMany({
        where: { id: req.params.id as any, companyId: req.user!.companyId, ...activeSupplierFilter },
        data: { deletedAt: new Date() },
    });
    sendSuccess(res, { message: 'Supplier archived' });
}));
