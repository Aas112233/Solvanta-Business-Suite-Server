import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { nextCounter } from '../../utils/documentCounter.js';
import { z } from 'zod';

export const customerRoutes = Router();
customerRoutes.use(authenticate);

const getActiveCustomerFilter = (): Prisma.CustomerWhereInput => ({
    OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
});

const customerSchema = z.object({
    customerCode: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Invalid customer code').optional(),
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).regex(/^[+0-9()\- ]{7,20}$/, 'Invalid phone number').optional().or(z.literal('')),
    email: z.string().trim().email().optional().or(z.literal('')),
    vatNumber: z.string().trim().max(50).optional(),
    address: z.object({
        street: z.string().trim().max(250).optional(),
        city: z.string().trim().max(120).optional(),
        country: z.string().trim().max(120).optional(),
    }).optional(),
    creditLimit: z.coerce.number().min(0).optional().default(0),
    allowCreditSales: z.coerce.boolean().optional().default(true),
    openingBalance: z.coerce.number().optional().default(0),
    priceGroupId: z.string().trim().optional().nullable(),
    tags: z.array(z.string().trim().min(1)).optional().default([]),
    notes: z.string().trim().max(1000).optional(),
});

const customerUpdateSchema = customerSchema.partial();

async function generateUniqueCustomerCode(companyId: string): Promise<string> {
    // Generate 5 digit customer code starting from 10001
    const nextVal = await nextCounter(prisma as any, companyId, 'CUSTOMER_CODE');
    // Ensure 5 digits by adding base 10000 if needed, or just standard padding. 
    // User requested "unique 5 digit". 
    // If nextVal is 1, code is 00001 or 10001? 
    // Let's assume sequential 5 digit number string.
    const code = (10000 + nextVal).toString();

    // Safety check (unlikely to collide if counter is source of truth, but good practice)
    const exists = await prisma.customer.findFirst({
        where: { companyId, customerCode: code },
        select: { id: true },
    });

    if (exists) {
        // Fallback: This shouldn't happen with atomic counters unless manual inserts messed it up.
        // Try next value.
        return generateUniqueCustomerCode(companyId);
    }
    return code;
}

// GET /customers
customerRoutes.get('/', requirePermission(PERMISSIONS.CRM_VIEW), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = { companyId: req.user!.companyId, ...getActiveCustomerFilter() };
        if (query.search) {
            where.AND = [
                {
                    OR: [
                        { name: { contains: query.search, mode: 'insensitive' } },
                        { phone: { contains: query.search, mode: 'insensitive' } },
                        { customerCode: { contains: query.search, mode: 'insensitive' } },
                        { email: { contains: query.search, mode: 'insensitive' } },
                        { vatNumber: { contains: query.search, mode: 'insensitive' } },
                    ],
                },
            ];
        }

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip,
                take,
                include: { priceGroup: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.customer.count({ where }),
        ]);

        sendPaginated(res, customers, total, page, limit);
    } catch (error) { next(error); }
});

// GET /customers/summary/stats
customerRoutes.get('/summary/stats', requirePermission(PERMISSIONS.CRM_VIEW), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;

        const [totalCustomers, activeCustomers, creditInvoiceStats] = await Promise.all([
            prisma.customer.count({ where: { companyId } }),
            prisma.customer.count({ where: { companyId, ...getActiveCustomerFilter() } }),
            prisma.pOSInvoice.aggregate({
                where: {
                    companyId,
                    status: { in: ['CREDIT', 'PARTIAL'] },
                },
                _sum: { grandTotal: true, cashReceived: true },
                _count: { id: true },
            }),
        ]);

        const totalCreditSales = Number(creditInvoiceStats._sum.grandTotal || 0);
        const totalReceivedAgainstCredit = Number(creditInvoiceStats._sum.cashReceived || 0);
        const totalReceivable = Math.max(0, totalCreditSales - totalReceivedAgainstCredit);

        sendSuccess(res, {
            totalCustomers,
            activeCustomers,
            totalReceivable,
            totalCreditInvoices: creditInvoiceStats._count.id,
        });
    } catch (error) { next(error); }
});

// GET /customers/:id
customerRoutes.get('/:id', requirePermission(PERMISSIONS.CRM_VIEW), async (req, res, next) => {
    try {
        const customerId = req.params.id as string;
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, companyId: req.user!.companyId, ...getActiveCustomerFilter() },
            include: { priceGroup: true },
        });
        if (!customer) throw AppError.notFound('Customer');

        const recentInvoices = await prisma.pOSInvoice.findMany({
            where: { companyId: req.user!.companyId, customerId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                invoiceNo: true,
                status: true,
                grandTotal: true,
                cashReceived: true,
                createdAt: true,
            },
        });

        const creditStats = await prisma.pOSInvoice.aggregate({
            where: {
                companyId: req.user!.companyId,
                customerId,
                status: { in: ['CREDIT', 'PARTIAL'] },
            },
            _sum: { grandTotal: true, cashReceived: true },
        });

        const totalCreditSales = Number(creditStats._sum.grandTotal || 0);
        const totalReceivedAgainstCredit = Number(creditStats._sum.cashReceived || 0);
        const receivableBalance = Math.max(0, totalCreditSales - totalReceivedAgainstCredit);

        sendSuccess(res, {
            ...customer,
            receivableBalance,
            recentInvoices,
        });
    } catch (error) { next(error); }
});

function parseOptionalDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
}

// GET /customers/:id/ledger — customer transaction history
customerRoutes.get('/:id/ledger', requirePermission(PERMISSIONS.CRM_VIEW), async (req, res, next) => {
    try {
        const customerId = req.params.id as string;
        const companyId = req.user!.companyId;
        const dateFrom = parseOptionalDate(req.query.dateFrom);
        const dateTo = parseOptionalDate(req.query.dateTo);

        const customer = await prisma.customer.findFirst({
            where: { id: customerId, companyId, ...getActiveCustomerFilter() },
        });
        if (!customer) throw AppError.notFound('Customer');

        // Fetch all transactions: Invoices, Returns
        const [invoices, returns] = await Promise.all([
            prisma.pOSInvoice.findMany({
                where: {
                    customerId,
                    companyId,
                    status: { not: 'CANCELLED' } as any,
                },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.salesReturn.findMany({
                where: {
                    customerId,
                    companyId,
                    status: { not: 'CANCELLED' } as any,
                },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        // Merge and sort
        const transactions: any[] = [
            ...invoices.map(i => ({
                id: i.id,
                date: i.createdAt,
                type: 'INVOICE',
                reference: i.invoiceNo,
                description: `Sales Invoice: ${i.invoiceNo}`,
                debit: Number(i.grandTotal), // Invoice increases what customer owes
                credit: 0,
            })),
            // Map payments directly from invoices that had cashReceived
            ...invoices.filter(i => i.cashReceived > 0).map(i => ({
                id: `${i.id}-payment`,
                date: i.createdAt,
                type: 'PAYMENT',
                reference: i.invoiceNo,
                description: `Payment against Invoice: ${i.invoiceNo}`,
                debit: 0,
                credit: Number(i.cashReceived), // Payment decreases what customer owes
            })),
            ...returns.map(r => ({
                id: r.id,
                date: r.createdAt,
                type: 'RETURN',
                reference: r.returnNo,
                description: `Sales Return: ${r.returnNo}`,
                debit: 0,
                credit: Number(r.grandTotal), // Return decreases what customer owes
            })),
        ];

        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate running balance
        let balance = Number(customer.openingBalance || 0);
        const ledger = transactions.map(t => {
            balance += (t.debit - t.credit);
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
            customer: { id: customer.id, name: customer.name, customerCode: customer.customerCode, openingBalance: customer.openingBalance },
            openingBalance: customer.openingBalance,
            ledger: filteredLedger,
            finalBalance: balance
        });
    } catch (error) { next(error); }
});

// POST /customers
customerRoutes.post('/', requirePermission(PERMISSIONS.CRM_EDIT), validate({ body: customerSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const requestedCode = req.body.customerCode?.trim();
        const basePayload = {
            ...req.body,
            email: req.body.email ? req.body.email : null,
            phone: req.body.phone ? req.body.phone : null,
            notes: req.body.notes ? req.body.notes : null,
            priceGroupId: req.body.priceGroupId ? req.body.priceGroupId : null,
            tags: Array.isArray(req.body.tags) ? req.body.tags.filter(Boolean) : [],
        };

        if (requestedCode) {
            const existingCode = await prisma.customer.findFirst({
                where: {
                    companyId,
                    customerCode: requestedCode,
                    ...getActiveCustomerFilter(),
                },
                select: { id: true },
            });
            if (existingCode) throw AppError.badRequest('Customer code already exists');

            const customer = await prisma.customer.create({
                data: { ...basePayload, customerCode: requestedCode, companyId },
            });
            sendSuccess(res, customer, undefined, 201);
            return;
        }

        // Auto-generate 5-digit code
        const generatedCode = await generateUniqueCustomerCode(companyId);
        const customer = await prisma.customer.create({
            data: { ...basePayload, customerCode: generatedCode, companyId },
        });
        sendSuccess(res, customer, undefined, 201);
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            next(AppError.badRequest('Customer code already exists'));
            return;
        }
        next(error);
    }
});

// PATCH /customers/:id
customerRoutes.patch('/:id', requirePermission(PERMISSIONS.CRM_EDIT), validate({ body: customerUpdateSchema }), async (req, res, next) => {
    try {
        const customerId = req.params.id as string;
        const existing = await prisma.customer.findFirst({
            where: { id: customerId, companyId: req.user!.companyId, ...getActiveCustomerFilter() },
        });
        if (!existing) throw AppError.notFound('Customer');

        const updateData: any = { ...req.body };
        if (typeof updateData.customerCode === 'string') {
            updateData.customerCode = updateData.customerCode.trim();
            if (!updateData.customerCode) {
                delete updateData.customerCode;
            } else if (updateData.customerCode !== existing.customerCode) {
                const codeInUse = await prisma.customer.findFirst({
                    where: {
                        companyId: req.user!.companyId,
                        customerCode: updateData.customerCode,
                        ...getActiveCustomerFilter(),
                        id: { not: customerId },
                    },
                    select: { id: true },
                });
                if (codeInUse) throw AppError.badRequest('Customer code already exists');
            }
        }
        if (updateData.email === '') updateData.email = null;
        if (updateData.phone === '') updateData.phone = null;
        if (updateData.notes === '') updateData.notes = null;
        if (updateData.priceGroupId === '') updateData.priceGroupId = null;

        const customer = await prisma.customer.update({
            where: { id: customerId },
            data: updateData,
        });
        sendSuccess(res, customer);
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            next(AppError.badRequest('Customer code already exists'));
            return;
        }
        next(error);
    }
});

// DELETE /customers/:id (soft-delete)
customerRoutes.delete('/:id', requirePermission(PERMISSIONS.CRM_EDIT), async (req, res, next) => {
    try {
        const customerId = req.params.id as string;
        await prisma.customer.updateMany({
            where: { id: customerId, companyId: req.user!.companyId },
            data: { deletedAt: new Date() },
        });
        sendSuccess(res, { message: 'Customer archived' });
    } catch (error) { next(error); }
});

// POST /customers/:id/restore
customerRoutes.post('/:id/restore', requirePermission(PERMISSIONS.CRM_EDIT), async (req, res, next) => {
    try {
        const customerId = req.params.id as string;
        await prisma.customer.updateMany({
            where: { id: customerId, companyId: req.user!.companyId },
            data: { deletedAt: null },
        });
        sendSuccess(res, { message: 'Customer restored' });
    } catch (error) { next(error); }
});
