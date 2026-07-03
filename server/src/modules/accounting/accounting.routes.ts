import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
const ACCOUNT_MAPPING_TYPES = [
    'INVENTORY_ASSET',
    'COGS_EXPENSE',
    'SALES_REVENUE',
    'SALES_RETURN',
    'OUTPUT_TAX',
    'INPUT_TAX',
    'CASH',
    'BANK',
    'ACCOUNT_PAYABLE',
    'ACCOUNT_RECEIVABLE',
    'PURCHASE_RETURN',
    'EXPENSE',
    'DISCOUNT_GIVEN',
    'DISCOUNT_RECEIVED',
    'SHRINKAGE_EXPENSE',
    'DAMAGED_GOODS_EXPENSE',
    'TRANSFER_IN_TRANSIT',
    'WIP_ASSET',
    'PRODUCTION_VARIANCE',
] as const;
const ACCOUNT_ENTITY_TYPES = ['GLOBAL', 'BRANCH', 'PRODUCT', 'CATEGORY', 'CUSTOMER', 'SUPPLIER'] as const;

function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

function normalizeNullableString(value: unknown) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

function isValidDateInput(value: string) {
    const normalized = value.includes('T') ? value : `${value}T00:00:00.000`;
    return !Number.isNaN(new Date(normalized).getTime());
}

const idParamsSchema = z.object({
    id: objectIdSchema,
});

const optionalObjectIdSchema = z.preprocess(normalizeOptionalString, objectIdSchema.optional());

const nullableObjectIdSchema = z.preprocess(
    normalizeNullableString,
    objectIdSchema.nullable().optional()
).transform((value) => value ?? null);

const optionalTrimmedString = (maxLength: number) =>
    z.preprocess(normalizeOptionalString, z.string().max(maxLength).optional());

const nullableTrimmedString = (maxLength: number) =>
    z.preprocess(
        normalizeNullableString,
        z.string().max(maxLength).nullable().optional()
    ).transform((value) => value ?? null);

const optionalDateStringSchema = z.preprocess(
    normalizeOptionalString,
    z.string().refine(isValidDateInput, 'Invalid date').optional()
);

const accountCreateSchema = z.object({
    code: optionalTrimmedString(30),
    name: z.string().trim().min(1, 'Account name is required').max(120, 'Account name must be 120 characters or less'),
    type: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(ACCOUNT_TYPES)
    ),
    parentId: nullableObjectIdSchema,
}).strict();

const accountMappingSchema = z.object({
    mappingType: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(ACCOUNT_MAPPING_TYPES)
    ),
    entityType: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(ACCOUNT_ENTITY_TYPES).default('GLOBAL')
    ),
    entityId: nullableObjectIdSchema,
    accountId: objectIdSchema,
}).strict().superRefine((data, ctx) => {
    if (data.entityType === 'GLOBAL' && data.entityId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['entityId'],
            message: 'entityId must be empty when entityType is GLOBAL',
        });
    }
    if (data.entityType !== 'GLOBAL' && !data.entityId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['entityId'],
            message: 'entityId is required for non-GLOBAL mappings',
        });
    }
});

const journalEntryListQuerySchema = z.object({
    branchId: optionalObjectIdSchema,
    startDate: optionalDateStringSchema,
    endDate: optionalDateStringSchema,
    skip: z.coerce.number().int().min(0).default(0),
    take: z.coerce.number().int().min(1).max(500).default(50),
}).superRefine((data, ctx) => {
    if (!data.startDate || !data.endDate) return;

    const startDate = new Date(data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00:00.000`);
    const endDate = new Date(data.endDate.includes('T') ? data.endDate : `${data.endDate}T00:00:00.000`);
    if (startDate > endDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'endDate must be on or after startDate',
        });
    }
});

const journalLineSchema = z.object({
    accountId: objectIdSchema,
    debit: z.coerce.number().min(0, 'Debit cannot be negative').finite('Debit must be a valid number').default(0),
    credit: z.coerce.number().min(0, 'Credit cannot be negative').finite('Credit must be a valid number').default(0),
}).strict().superRefine((line, ctx) => {
    if (line.debit > 0 && line.credit > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['credit'],
            message: 'A line cannot have both debit and credit values',
        });
    }
    if (line.debit <= 0 && line.credit <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['debit'],
            message: 'A line must have either a debit or a credit value',
        });
    }
});

const journalEntryCreateSchema = z.object({
    date: optionalDateStringSchema,
    memo: nullableTrimmedString(1000),
    branchId: nullableObjectIdSchema,
    lines: z.array(journalLineSchema).min(2, 'A journal entry requires at least two lines').max(500, 'A maximum of 500 lines is allowed'),
}).strict().superRefine((data, ctx) => {
    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);

    if (totalDebit <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines'],
            message: 'Journal entry must have a non-zero value',
        });
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines'],
            message: 'Debits must equal credits',
        });
    }
});

const asOfReportQuerySchema = z.object({
    branchId: optionalObjectIdSchema,
    asOfDate: optionalDateStringSchema,
});

const rangedReportQuerySchema = z.object({
    branchId: optionalObjectIdSchema,
    startDate: optionalDateStringSchema,
    endDate: optionalDateStringSchema,
}).superRefine((data, ctx) => {
    if (!data.startDate || !data.endDate) return;

    const startDate = new Date(data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00:00.000`);
    const endDate = new Date(data.endDate.includes('T') ? data.endDate : `${data.endDate}T00:00:00.000`);
    if (startDate > endDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'endDate must be on or after startDate',
        });
    }
});

const generalLedgerQuerySchema = z.object({
    accountId: objectIdSchema,
    branchId: optionalObjectIdSchema,
    startDate: optionalDateStringSchema,
    endDate: optionalDateStringSchema,
}).superRefine((data, ctx) => {
    if (!data.startDate || !data.endDate) return;

    const startDate = new Date(data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00:00.000`);
    const endDate = new Date(data.endDate.includes('T') ? data.endDate : `${data.endDate}T00:00:00.000`);
    if (startDate > endDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'endDate must be on or after startDate',
        });
    }
});

async function assertBranchInCompany(companyId: string, branchId: string) {
    const branch = await prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: { id: true },
    });
    if (!branch) throw AppError.badRequest('Invalid branch');
}

async function assertAccountInCompany(companyId: string, accountId: string) {
    const account = await prisma.account.findFirst({
        where: { id: accountId, companyId },
        select: { id: true },
    });
    if (!account) throw AppError.badRequest('Invalid account');
}

async function assertMappingEntityExists(companyId: string, entityType: (typeof ACCOUNT_ENTITY_TYPES)[number], entityId: string | null) {
    if (entityType === 'GLOBAL') return;
    if (!entityId) throw AppError.badRequest('entityId is required for non-GLOBAL mappings');

    let exists = null;
    switch (entityType) {
        case 'BRANCH':
            exists = await prisma.branch.findFirst({ where: { id: entityId, companyId }, select: { id: true } });
            break;
        case 'PRODUCT':
            exists = await prisma.product.findFirst({ where: { id: entityId, companyId }, select: { id: true } });
            break;
        case 'CATEGORY':
            exists = await prisma.category.findFirst({ where: { id: entityId, companyId }, select: { id: true } });
            break;
        case 'CUSTOMER':
            exists = await prisma.customer.findFirst({ where: { id: entityId, companyId }, select: { id: true } });
            break;
        case 'SUPPLIER':
            exists = await prisma.supplier.findFirst({ where: { id: entityId, companyId }, select: { id: true } });
            break;
    }

    if (!exists) {
        throw AppError.badRequest(`Invalid entityId for entityType ${entityType}`);
    }
}

export const accountingRoutes = Router();
accountingRoutes.use(authenticate);

// --- Chart of Accounts ---
accountingRoutes.get('/accounts', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), asyncHandler(async (req, res) => {
    const query = paginationSchema.parse(req.query);
    const { skip, take, page, limit } = getPaginationParams(query);
    const where = { companyId: req.user!.companyId };

    const [accounts, total] = await Promise.all([
        prisma.account.findMany({
            where,
            skip,
            take,
            orderBy: [{ type: 'asc' }, { code: 'asc' }]
        }),
        prisma.account.count({ where }),
    ]);
    sendPaginated(res, accounts, total, page, limit);
}));

accountingRoutes.post('/accounts', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ body: accountCreateSchema }), asyncHandler(async (req, res) => {
    const { code, name, type, parentId } = req.body;
    const companyId = req.user!.companyId;

    if (parentId) {
        await assertAccountInCompany(companyId, parentId);
    }

    let finalCode = code;

    if (!finalCode) {
        let prefix = '1';
        if (type === 'ASSET') prefix = '1';
        else if (type === 'LIABILITY') prefix = '2';
        else if (type === 'EQUITY') prefix = '3';
        else if (type === 'REVENUE') prefix = '4';
        else if (type === 'EXPENSE') prefix = '5';

        const accountsOfType = await prisma.account.findMany({
            where: { companyId, type },
            select: { code: true }
        });

        const numericCodes = accountsOfType
            .map(a => parseInt(a.code.replace(/\D/g, ''), 10))
            .filter(n => !isNaN(n));

        if (numericCodes.length > 0) {
            const maxCode = Math.max(...numericCodes);
            finalCode = String(maxCode + 1);
        } else {
            finalCode = `${prefix}000`;
        }

        // Ensure uniqueness fallback
        let existingCode = await prisma.account.findFirst({ where: { companyId, code: finalCode } });
        let attempt = 1;
        while (existingCode && attempt < 100) {
            const parsed = parseInt(finalCode, 10);
            finalCode = isNaN(parsed) ? `${finalCode}-${attempt}` : String(parsed + 1);
            existingCode = await prisma.account.findFirst({ where: { companyId, code: finalCode } });
            attempt++;
        }
    } else {
        // Check if code already exists if user provided it
        const existing = await prisma.account.findFirst({
            where: { companyId, code: finalCode }
        });

        if (existing) {
            throw AppError.badRequest(`Account with code ${finalCode} already exists`);
        }
    }

    const account = await prisma.account.create({
        data: {
            companyId,
            code: finalCode,
            name,
            type,
            parentId: parentId || null,
            isSystem: false // User created accounts are never system accounts initially
        }
    });

    sendSuccess(res, account, undefined, 201);
}));

// --- Mappings ---
accountingRoutes.get('/mappings', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), asyncHandler(async (req, res) => {
    const mappings = await prisma.accountMapping.findMany({
        where: { companyId: req.user!.companyId },
        include: { account: true }
    });
    sendSuccess(res, mappings);
}));

accountingRoutes.post('/mappings', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ body: accountMappingSchema }), asyncHandler(async (req, res) => {
    const { mappingType, entityType, entityId, accountId } = req.body;
    const companyId = req.user!.companyId;

    await assertAccountInCompany(companyId, accountId);
    await assertMappingEntityExists(companyId, entityType, entityId);

    // Note: Using upsert or manually unquing because [companyId, mappingType, entityType, entityId] is unique
    const existing = await prisma.accountMapping.findFirst({
        where: {
            companyId,
            mappingType,
            entityType,
            entityId: entityId || null
        }
    });

    if (existing) {
        const updated = await prisma.accountMapping.update({
            where: { id: existing.id },
            data: { accountId },
            include: { account: true }
        });
        return sendSuccess(res, updated);
    }

    const mapping = await prisma.accountMapping.create({
        data: {
            companyId,
            mappingType,
            entityType: entityType || 'GLOBAL',
            entityId: entityId || null,
            accountId
        },
        include: { account: true }
    });

    sendSuccess(res, mapping, undefined, 201);
}));

accountingRoutes.delete('/mappings/:id', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
    await prisma.accountMapping.delete({
        where: { id: req.params.id as string, companyId: req.user!.companyId }
    });
    sendSuccess(res, { message: 'Mapping deleted successfully' });
}));

// --- Journal Entries ---
accountingRoutes.get('/journal-entries', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ query: journalEntryListQuerySchema }), asyncHandler(async (req, res) => {
    const { branchId, startDate, endDate, skip = 0, take = 50 } = req.query;

    if (branchId && typeof branchId === 'string') {
        await assertBranchInCompany(req.user!.companyId, branchId);
    }

    let where: any = { companyId: req.user!.companyId };
    if (branchId) where.branchId = branchId;
    if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
    }

    // First fetch entries without including lines
    const entries = await prisma.journalEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: Number(skip),
        take: Number(take),
    });

    // Then fetch lines separately (without include to avoid relation error)
    const entryIds = entries.map(e => e.id);
    const lines = entryIds.length > 0
        ? await prisma.journalEntryLine.findMany({
            where: { journalEntryId: { in: entryIds } }
        })
        : [];

    // Fetch all accounts referenced by these lines
    const accountIds = [...new Set(lines.map(l => l.accountId))];
    const accounts = accountIds.length > 0
        ? await prisma.account.findMany({
            where: { id: { in: accountIds } }
        })
        : [];

    // Create account lookup map
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    // Build lines with accounts (only include lines with valid accounts)
    const linesWithAccounts = lines
        .filter(l => accountMap.has(l.accountId))
        .map(l => ({
            ...l,
            account: accountMap.get(l.accountId)!
        }));

    // Group lines by entry
    const entriesWithLines = entries.map(entry => ({
        ...entry,
        lines: linesWithAccounts.filter(l => l.journalEntryId === entry.id)
    }));

    const count = await prisma.journalEntry.count({ where });

    sendSuccess(res, { data: entriesWithLines, meta: { total: count, skip: Number(skip), take: Number(take) } });
}));

accountingRoutes.post('/journal-entries', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ body: journalEntryCreateSchema }), asyncHandler(async (req, res) => {
    const { date, memo, branchId, lines } = req.body;
    const companyId = req.user!.companyId;

    if (branchId) {
        await assertBranchInCompany(companyId, branchId);
    }

    const uniqueAccountIds = [...new Set((lines as Array<{ accountId: string }>).map((line) => line.accountId))];
    const validAccounts = await prisma.account.findMany({
        where: { companyId, id: { in: uniqueAccountIds } },
        select: { id: true },
    });
    if (validAccounts.length !== uniqueAccountIds.length) {
        throw AppError.badRequest('One or more journal line accounts are invalid');
    }

    // Generate Entry No
    const today = new Date();
    const yy = today.getFullYear().toString().slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const count = await prisma.journalEntry.count({
        where: {
            companyId,
            date: {
                gte: new Date(today.getFullYear(), today.getMonth(), 1),
                lt: new Date(today.getFullYear(), today.getMonth() + 1, 1)
            }
        }
    });
    const entryNo = `JE-${yy}${mm}-${String(count + 1).padStart(4, '0')}`;

    const entry = await prisma.journalEntry.create({
        data: {
            companyId,
            entryNo,
            date: new Date(date || Date.now()),
            memo,
            sourceType: 'MANUAL',
            postedById: req.user!.id,
            branchId: branchId || null,
            lines: {
                create: lines.map((l: any) => ({
                    accountId: l.accountId,
                    debit: Number(l.debit) || 0,
                    credit: Number(l.credit) || 0
                }))
            }
        },
        include: { lines: { include: { account: true } } }
    });

    sendSuccess(res, entry, undefined, 201);
}));

// --- Trial Balance Extract ---
accountingRoutes.get('/reports/trial-balance', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ query: asOfReportQuerySchema }), asyncHandler(async (req, res) => {
    const { branchId, asOfDate } = req.query;

    if (branchId && typeof branchId === 'string') {
        await assertBranchInCompany(req.user!.companyId, branchId);
    }

    // Sum all debits and credits grouped by account
    const whereClause: any = {
        journalEntry: {
            companyId: req.user!.companyId
        }
    };

    if (branchId) whereClause.journalEntry.branchId = branchId;
    if (asOfDate) whereClause.journalEntry.date = { lte: new Date(asOfDate as string) };

    const lines = await prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        _sum: {
            debit: true,
            credit: true
        },
        where: whereClause
    });

    const accounts = await prisma.account.findMany({
        where: { companyId: req.user!.companyId },
        select: { id: true, code: true, name: true, type: true }
    });

    const tb = accounts.map(acc => {
        const aggs = lines.find(l => l.accountId === acc.id);
        const dr = Number(aggs?._sum.debit || 0);
        const cr = Number(aggs?._sum.credit || 0);

        // Calculate natural balance difference based on base type
        let balance = 0;
        if (['ASSET', 'EXPENSE'].includes(acc.type)) {
            balance = dr - cr;
        } else { // LIAB, EQUITY, REVENUE
            balance = cr - dr;
        }

        return {
            ...acc,
            debit: dr,
            credit: cr,
            balance
        };
    }).filter(a => a.debit > 0 || a.credit > 0 || a.balance !== 0);

    sendSuccess(res, tb);
}));

// --- Profit & Loss Extract ---
accountingRoutes.get('/reports/pl', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ query: rangedReportQuerySchema }), asyncHandler(async (req, res) => {
    const { branchId, startDate, endDate } = req.query;

    if (branchId && typeof branchId === 'string') {
        await assertBranchInCompany(req.user!.companyId, branchId);
    }

    const whereClause: any = {
        journalEntry: {
            companyId: req.user!.companyId
        }
    };

    if (branchId) whereClause.journalEntry.branchId = branchId;
    if (startDate || endDate) {
        whereClause.journalEntry.date = {};
        if (startDate) whereClause.journalEntry.date.gte = new Date(startDate as string);
        if (endDate) whereClause.journalEntry.date.lte = new Date(endDate as string);
    }

    const lines = await prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        _sum: {
            debit: true,
            credit: true
        },
        where: whereClause
    });

    const accounts = await prisma.account.findMany({
        where: {
            companyId: req.user!.companyId,
            type: { in: ['REVENUE', 'EXPENSE'] }
        },
        select: { id: true, code: true, name: true, type: true }
    });

    let totalRevenue = 0;
    let totalExpense = 0;

    const details = accounts.map(acc => {
        const aggs = lines.find(l => l.accountId === acc.id);
        const dr = Number(aggs?._sum.debit || 0);
        const cr = Number(aggs?._sum.credit || 0);

        let balance = 0;
        if (acc.type === 'REVENUE') {
            balance = cr - dr;
            totalRevenue += balance;
        } else if (acc.type === 'EXPENSE') {
            balance = dr - cr;
            totalExpense += balance;
        }

        return {
            ...acc,
            balance
        };
    }).filter(a => a.balance !== 0);

    sendSuccess(res, {
        details,
        summary: {
            totalRevenue,
            totalExpense,
            netIncome: totalRevenue - totalExpense
        }
    });
}));

// --- Balance Sheet Extract ---
accountingRoutes.get('/reports/balance-sheet', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ query: asOfReportQuerySchema }), asyncHandler(async (req, res) => {
    const { branchId, asOfDate } = req.query;

    if (branchId && typeof branchId === 'string') {
        await assertBranchInCompany(req.user!.companyId, branchId);
    }

    // 1. Calculate retained earnings (Net income up to asOfDate)
    const reWhere: any = { journalEntry: { companyId: req.user!.companyId } };
    if (branchId) reWhere.journalEntry.branchId = branchId;
    if (asOfDate) reWhere.journalEntry.date = { lte: new Date(asOfDate as string) };

    const allLines = await prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        _sum: { debit: true, credit: true },
        where: reWhere
    });

    const allAccounts = await prisma.account.findMany({
        where: { companyId: req.user!.companyId }
    });

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0; // Excludes computed retained earnings
    let netIncome = 0; // The computed retained earnings

    const assetsDetails: any[] = [];
    const liabilitiesDetails: any[] = [];
    const equityDetails: any[] = [];

    allAccounts.forEach(acc => {
        const aggs = allLines.find(l => l.accountId === acc.id);
        const dr = Number(aggs?._sum.debit || 0);
        const cr = Number(aggs?._sum.credit || 0);

        let balance = 0;
        if (acc.type === 'REVENUE') {
            netIncome += (cr - dr);
        } else if (acc.type === 'EXPENSE') {
            netIncome -= (dr - cr);
        } else if (acc.type === 'ASSET') {
            balance = dr - cr;
            if (balance !== 0) {
                totalAssets += balance;
                assetsDetails.push({ ...acc, balance });
            }
        } else if (acc.type === 'LIABILITY') {
            balance = cr - dr;
            if (balance !== 0) {
                totalLiabilities += balance;
                liabilitiesDetails.push({ ...acc, balance });
            }
        } else if (acc.type === 'EQUITY') {
            balance = cr - dr;
            if (balance !== 0) {
                totalEquity += balance;
                equityDetails.push({ ...acc, balance });
            }
        }
    });

    const totalEquityAndLiabilities = totalLiabilities + totalEquity + netIncome;

    sendSuccess(res, {
        assets: { items: assetsDetails, total: totalAssets },
        liabilities: { items: liabilitiesDetails, total: totalLiabilities },
        equity: { items: equityDetails, total: totalEquity, retainedEarnings: netIncome, totalIncludingRE: totalEquity + netIncome },
        summary: {
            totalAssets,
            totalEquityAndLiabilities,
            isBalanced: Math.abs(totalAssets - totalEquityAndLiabilities) < 0.01 // Floating point tolerance
        }
    });
}));

// --- General Ledger Extract ---
accountingRoutes.get('/reports/general-ledger', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ query: generalLedgerQuerySchema }), asyncHandler(async (req, res) => {
    const { accountId, branchId, startDate, endDate } = req.query;
    if (branchId && typeof branchId === 'string') {
        await assertBranchInCompany(req.user!.companyId, branchId);
    }

    const account = await prisma.account.findFirst({
        where: { id: accountId as string, companyId: req.user!.companyId }
    });

    if (!account) {
        throw AppError.notFound('Account');
    }

    let whereClause: any = {
        accountId: accountId as string,
        journalEntry: {
            companyId: req.user!.companyId
        }
    };

    let activeBranchId = branchId;
    if (activeBranchId) {
        whereClause.journalEntry.branchId = activeBranchId;
    }

    let dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    if (Object.keys(dateFilter).length > 0) {
        whereClause.journalEntry.date = dateFilter;
    }

    // Fetch opening balance (all entries before startDate)
    let openingBalanceDr = 0;
    let openingBalanceCr = 0;

    if (startDate) {
        const openingWhere = {
            ...whereClause,
            journalEntry: {
                ...whereClause.journalEntry,
                date: { lt: new Date(startDate as string) }
            }
        };

        const openingAgg = await prisma.journalEntryLine.aggregate({
            _sum: { debit: true, credit: true },
            where: openingWhere
        });

        openingBalanceDr = openingAgg._sum.debit || 0;
        openingBalanceCr = openingAgg._sum.credit || 0;
    }


    // Fetch current period transactions
    const lines = await prisma.journalEntryLine.findMany({
        where: whereClause,
        include: {
            journalEntry: true,
            account: true
        },
        orderBy: {
            journalEntry: {
                date: 'asc'
            }
        }
    });

    // Compute running balance based on account type
    let runningBalance = ['ASSET', 'EXPENSE'].includes(account.type)
        ? openingBalanceDr - openingBalanceCr
        : openingBalanceCr - openingBalanceDr;

    const openingBalance = runningBalance;

    const transactions = lines.map(line => {
        const dr = Number(line.debit);
        const cr = Number(line.credit);

        if (['ASSET', 'EXPENSE'].includes(account.type)) {
            runningBalance += (dr - cr);
        } else {
            runningBalance += (cr - dr);
        }

        return {
            id: line.id,
            date: line.journalEntry.date,
            entryNo: line.journalEntry.entryNo,
            memo: line.journalEntry.memo,
            sourceType: line.journalEntry.sourceType,
            debit: dr,
            credit: cr,
            balance: runningBalance
        };
    });

    let currentPeriodDr = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    let currentPeriodCr = lines.reduce((sum, line) => sum + Number(line.credit), 0);

    sendSuccess(res, {
        account,
        openingBalance,
        transactions,
        summary: {
            totalDebits: currentPeriodDr,
            totalCredits: currentPeriodCr,
            closingBalance: runningBalance
        }
    });
}));
