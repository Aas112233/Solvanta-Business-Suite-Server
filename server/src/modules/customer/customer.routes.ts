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
import { asyncHandler } from '../../middleware/errorHandler.js';

export const customerRoutes = Router();
customerRoutes.use(authenticate);

const interactionSchema = z.object({
    type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'FOLLOW_UP']),
    subject: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    scheduledAt: z.string().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional().default('NORMAL'),
    assignedTo: z.string().trim().optional().nullable(),
});

const interactionUpdateSchema = interactionSchema.partial();

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
customerRoutes.get('/', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
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
}));

// GET /customers/summary/stats
customerRoutes.get('/summary/stats', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
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
}));

// GET /customers/:id
customerRoutes.get('/:id', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
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
}));

function parseOptionalDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    
    // Try parsing DD/MM/YYYY format (common in many regions)
    const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy;
        const d = new Date(Number(year), Number(month) - 1, Number(day));
        if (!Number.isNaN(d.getTime())) return d;
    }
    
    // Try standard date formats
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
}

// GET /customers/:id/ledger — customer transaction history
customerRoutes.get('/:id/ledger', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
    const customerId = req.params.id as string;
    const companyId = req.user!.companyId;
    const dateFrom = parseOptionalDate(req.query.dateFrom);
    const dateTo = parseOptionalDate(req.query.dateTo);

    const customer = await prisma.customer.findFirst({
        where: { id: customerId, companyId, ...getActiveCustomerFilter() },
    });
    if (!customer) throw AppError.notFound('Customer');

    // Fetch all transactions: Invoices, Returns, and Payment Receipts
    const [invoices, returns] = await Promise.all([
        prisma.pOSInvoice.findMany({
            where: {
                customerId,
                companyId,
            },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.salesReturn.findMany({
            where: {
                customerId,
                companyId,
            },
            orderBy: { createdAt: 'asc' },
        }),
    ]);

    console.log(`[Ledger] Customer ${customerId}: Found ${invoices.length} invoices, ${returns.length} returns`);

    // Get all invoice IDs for this customer to fetch payment journal entries
    const invoiceIds = invoices.map(i => i.id);

    // Fetch journal entries for payments
    let journalEntries: any[] = [];
    if (invoiceIds.length > 0) {
        journalEntries = await (prisma as any).journalEntry.findMany({
            where: {
                companyId,
                sourceType: 'SALES_PAYMENT',
                sourceId: { in: invoiceIds },
            },
            include: {
                lines: { include: { account: true } },
            },
            orderBy: { date: 'asc' },
        });
        console.log(`[Ledger] Found ${journalEntries.length} payment journal entries`);
    }

    // Merge and sort all transactions
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

    // Add payment journal entries
    journalEntries.forEach((je: any) => {
        // Find the credit line (Accounts Receivable - customer account)
        const creditLine = je.lines?.find((line: any) => line.credit > 0);
        const debitLine = je.lines?.find((line: any) => line.debit > 0);

        transactions.push({
            id: je.id,
            date: je.date,
            type: 'PAYMENT',
            reference: je.entryNo,
            description: `Payment Receipt: ${je.entryNo}${je.memo ? ` - ${je.memo}` : ''}`,
            debit: 0,
            credit: creditLine ? Number(creditLine.credit) : debitLine ? Number(debitLine.debit) : 0,
        });
    });

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance starting from opening balance
    let balance = Number(customer.openingBalance || 0);
    const ledger = transactions.map(t => {
        balance += (t.debit - t.credit);
        return { ...t, balance };
    });

    // Filter by date if provided (filter AFTER calculating running balance)
    let filteredLedger = ledger;
    if (dateFrom || dateTo) {
        filteredLedger = ledger.filter(t => {
            const tDate = new Date(t.date);
            if (dateFrom && tDate < dateFrom) return false;
            if (dateTo && tDate > dateTo) return false;
            return true;
        });
    }

    sendSuccess(res, {
        customer: { id: customer.id, name: customer.name, customerCode: customer.customerCode, openingBalance: customer.openingBalance },
        openingBalance: customer.openingBalance,
        ledger: filteredLedger,
        finalBalance: balance
    });
}));

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
customerRoutes.delete('/:id', requirePermission(PERMISSIONS.CRM_EDIT), asyncHandler(async (req, res) => {
    const customerId = req.params.id as string;
    await prisma.customer.updateMany({
        where: { id: customerId, companyId: req.user!.companyId },
        data: { deletedAt: new Date() },
    });
    sendSuccess(res, { message: 'Customer archived' });
}));

// POST /customers/:id/restore
customerRoutes.post('/:id/restore', requirePermission(PERMISSIONS.CRM_EDIT), asyncHandler(async (req, res) => {
    const customerId = req.params.id as string;
    await prisma.customer.updateMany({
        where: { id: customerId, companyId: req.user!.companyId },
        data: { deletedAt: null },
    });
    sendSuccess(res, { message: 'Customer restored' });
}));

// POST /customers/bulk-archive
customerRoutes.post('/bulk-archive', requirePermission(PERMISSIONS.CRM_EDIT), asyncHandler(async (req, res) => {
    const { customerIds } = req.body as { customerIds: string[] };
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
        throw AppError.badRequest('Invalid or empty customer IDs');
    }

    const companyId = req.user!.companyId;
    const result = await prisma.customer.updateMany({
        where: {
            id: { in: customerIds },
            companyId,
        },
        data: { deletedAt: new Date() },
    });

    sendSuccess(res, { message: `${result.count} customer(s) archived successfully`, count: result.count });
}));

// POST /customers/bulk-restore
customerRoutes.post('/bulk-restore', requirePermission(PERMISSIONS.CRM_EDIT), asyncHandler(async (req, res) => {
    const { customerIds } = req.body as { customerIds: string[] };
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
        throw AppError.badRequest('Invalid or empty customer IDs');
    }

    const companyId = req.user!.companyId;
    const result = await prisma.customer.updateMany({
        where: {
            id: { in: customerIds },
            companyId,
            deletedAt: { not: null },
        },
        data: { deletedAt: null },
    });

    sendSuccess(res, { message: `${result.count} customer(s) restored successfully`, count: result.count });
}));

// GET /customers/archived
customerRoutes.get('/archived', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const { skip, take, page, limit } = getPaginationParams(query);
    const where: any = {
        companyId: req.user!.companyId,
        deletedAt: { not: null },
    };

    if (query.search) {
        where.AND = [
            {
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { phone: { contains: query.search, mode: 'insensitive' } },
                    { customerCode: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } },
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
            orderBy: { deletedAt: 'desc' },
        }),
        prisma.customer.count({ where }),
    ]);

    sendPaginated(res, customers, total, page, limit);
}));

// POST /customers/export
customerRoutes.post('/export', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
    const { format = 'csv', customerIds } = req.body as { format?: 'csv' | 'excel'; customerIds?: string[] };
    const companyId = req.user!.companyId;

    const where: any = {
        companyId,
        ...getActiveCustomerFilter(),
    };

    if (customerIds && Array.isArray(customerIds) && customerIds.length > 0) {
        where.id = { in: customerIds };
    }

    const customers = await prisma.customer.findMany({
        where,
        include: { priceGroup: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
    });

    // Prepare data for export
    const exportData = customers.map((c) => ({
        'Customer Code': c.customerCode,
        'Customer Name': c.name,
        'Phone': c.phone || '',
        'Email': c.email || '',
        'VAT Number': c.vatNumber || '',
        'Address': c.address ? JSON.parse(c.address as any).street || '' : '',
        'City': c.address ? JSON.parse(c.address as any).city || '' : '',
        'Country': c.address ? JSON.parse(c.address as any).country || '' : '',
        'Credit Limit': c.creditLimit,
        'Allow Credit Sales': c.allowCreditSales ? 'Yes' : 'No',
        'Opening Balance': c.openingBalance,
        'Price Group': c.priceGroup?.name || 'Default',
        'Tags': (c.tags || []).join(', '),
        'Notes': c.notes || '',
    }));

    if (format === 'excel') {
        // Create Excel file using xlsx library
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="customers_${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(buffer);
    } else {
        // Create CSV file
        const headers = Object.keys(exportData[0] || {});
        const csvRows = [
            headers.join(','),
            ...exportData.map((row) =>
                headers
                    .map((header) => {
                        const value = row[header as keyof typeof row];
                        // Escape quotes and wrap in quotes if contains comma or quote
                        const escaped = String(value || '').replace(/"/g, '""');
                        return escaped.includes(',') || escaped.includes('"') ? `"${escaped}"` : escaped;
                    })
                    .join(',')
            ),
        ];

        const csv = csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="customers_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
    }
}));

// POST /customers/import
customerRoutes.post('/import', requirePermission(PERMISSIONS.CRM_EDIT), asyncHandler(async (req, res) => {
    const { customers: customerData } = req.body as { customers: any[] };
    if (!Array.isArray(customerData) || customerData.length === 0) {
        throw AppError.badRequest('Invalid or empty customer data');
    }

    const companyId = req.user!.companyId;
    const results = { created: 0, updated: 0, failed: 0, errors: [] as string[] };

    for (const [index, data] of customerData.entries()) {
        try {
            // Validate required fields
            if (!data.name || !data.name.trim()) {
                results.errors.push(`Row ${index + 1}: Customer name is required`);
                results.failed++;
                continue;
            }

            const customerPayload: any = {
                name: data.name.trim(),
                phone: data.phone?.trim() || null,
                email: data.email?.trim() || null,
                vatNumber: data.vatNumber?.trim() || null,
                creditLimit: Number(data.creditLimit) || 0,
                allowCreditSales: data.allowCreditSales !== false,
                openingBalance: Number(data.openingBalance) || 0,
                priceGroupId: data.priceGroupId || null,
                tags: data.tags ? (typeof data.tags === 'string' ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : data.tags) : [],
                notes: data.notes?.trim() || null,
                address: data.address || data.street ? {
                    street: data.address?.street || data.street || '',
                    city: data.city || '',
                    country: data.country || '',
                } : null,
            };

            // Check if customer code exists
            if (data.customerCode) {
                const existing = await prisma.customer.findFirst({
                    where: {
                        companyId,
                        customerCode: data.customerCode,
                        ...getActiveCustomerFilter(),
                    },
                    select: { id: true },
                });

                if (existing) {
                    // Update existing customer
                    await prisma.customer.update({
                        where: { id: existing.id },
                        data: customerPayload,
                    });
                    results.updated++;
                } else {
                    // Create with provided code
                    customerPayload.customerCode = data.customerCode.trim();
                    await prisma.customer.create({
                        data: { ...customerPayload, companyId },
                    });
                    results.created++;
                }
            } else {
                // Auto-generate customer code
                const generatedCode = await generateUniqueCustomerCode(companyId);
                await prisma.customer.create({
                    data: { ...customerPayload, customerCode: generatedCode, companyId },
                });
                results.created++;
            }
        } catch (error: any) {
            results.errors.push(`Row ${index + 1}: ${error.message}`);
            results.failed++;
        }
    }

    sendSuccess(res, results);
}));

// GET /customers/:id/interactions - Get all interactions for a customer
customerRoutes.get('/:id/interactions', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
    const customerId = req.params.id as string;
    const companyId = req.user!.companyId;
    const query = paginationSchema.parse(req.query);
    const { skip, take, page, limit } = getPaginationParams(query);

    const where: any = {
        customerId,
        companyId,
    };

    const [interactions, total] = await Promise.all([
        prisma.customerInteraction.findMany({
            where,
            skip,
            take,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.customerInteraction.count({ where }),
    ]);

    sendPaginated(res, interactions, total, page, limit);
}));

// POST /customers/:id/interactions - Create a new interaction
customerRoutes.post('/:id/interactions', requirePermission(PERMISSIONS.CRM_EDIT), validate({ body: interactionSchema }), asyncHandler(async (req, res) => {
    const customerId = req.params.id as string;
    const companyId = req.user!.companyId;
    const interactionData = req.body;

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
        where: { id: customerId, companyId },
        select: { id: true },
    });
    if (!customer) throw AppError.notFound('Customer');

    const interaction = await prisma.customerInteraction.create({
        data: {
            ...interactionData,
            companyId,
            customerId,
            scheduledAt: interactionData.scheduledAt ? new Date(interactionData.scheduledAt) : undefined,
        },
    });

    sendSuccess(res, interaction, { message: 'Interaction created successfully' });
}));

// PATCH /customers/:id/interactions/:interactionId - Update an interaction
customerRoutes.patch('/:id/interactions/:interactionId', requirePermission(PERMISSIONS.CRM_EDIT), validate({ body: interactionUpdateSchema }), asyncHandler(async (req, res) => {
    const customerId = String(req.params.id);
    const interactionId = String(req.params.interactionId);
    const companyId = req.user!.companyId;
    const updateData = req.body;

    // Verify interaction exists and belongs to customer
    const existing = await prisma.customerInteraction.findFirst({
        where: { id: interactionId, customerId, companyId },
        select: { id: true },
    });
    if (!existing) throw AppError.notFound('Interaction');

    const interaction = await prisma.customerInteraction.update({
        where: { id: interactionId },
        data: {
            ...updateData,
            scheduledAt: updateData.scheduledAt ? new Date(updateData.scheduledAt as string) : undefined,
        },
    });

    sendSuccess(res, interaction, { message: 'Interaction updated successfully' });
}));

// DELETE /customers/:id/interactions/:interactionId - Delete an interaction
customerRoutes.delete('/:id/interactions/:interactionId', requirePermission(PERMISSIONS.CRM_EDIT), asyncHandler(async (req, res) => {
    const customerId = String(req.params.id);
    const interactionId = String(req.params.interactionId);
    const companyId = req.user!.companyId;

    // Verify interaction exists and belongs to customer
    const existing = await prisma.customerInteraction.findFirst({
        where: { id: interactionId, customerId, companyId },
        select: { id: true },
    });
    if (!existing) throw AppError.notFound('Interaction');

    await prisma.customerInteraction.delete({
        where: { id: interactionId },
    });

    sendSuccess(res, undefined, { message: 'Interaction deleted successfully' });
}));

// POST /customers/:id/interactions/:interactionId/complete - Mark interaction as completed
customerRoutes.post('/:id/interactions/:interactionId/complete', requirePermission(PERMISSIONS.CRM_EDIT), asyncHandler(async (req, res) => {
    const customerId = String(req.params.id);
    const interactionId = String(req.params.interactionId);
    const companyId = req.user!.companyId;

    const interaction = await prisma.customerInteraction.update({
        where: { id: interactionId, customerId, companyId },
        data: {
            status: 'COMPLETED',
            completedAt: new Date(),
        },
    });

    sendSuccess(res, interaction, { message: 'Interaction marked as completed' });
}));

// GET /customers/:id/activity - Get combined activity log (interactions + transactions)
customerRoutes.get('/:id/activity', requirePermission(PERMISSIONS.CRM_VIEW), asyncHandler(async (req, res) => {
    const customerId = req.params.id as string;
    const companyId = req.user!.companyId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const [interactions, invoices] = await Promise.all([
        prisma.customerInteraction.findMany({
            where: { customerId, companyId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        }),
        prisma.pOSInvoice.findMany({
            where: { customerId, companyId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                invoiceNo: true,
                createdAt: true,
                grandTotal: true,
                status: true,
            },
        }),
    ]);

    // Merge and sort activities
    const activities = [
        ...interactions.map((i) => ({
            id: i.id,
            type: 'INTERACTION',
            interactionType: i.type,
            subject: i.subject,
            description: i.description,
            status: i.status,
            priority: i.priority,
            date: i.createdAt,
            createdAt: i.createdAt,
        })),
        ...invoices.map((inv) => ({
            id: inv.id,
            type: 'INVOICE',
            interactionType: 'INVOICE',
            subject: `Invoice ${inv.invoiceNo}`,
            description: `Sales invoice for SAR ${Number(inv.grandTotal).toLocaleString()}`,
            status: inv.status,
            priority: 'NORMAL',
            date: inv.createdAt,
            createdAt: inv.createdAt,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    sendSuccess(res, { activities: activities.slice(0, limit) });
}));
