import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { PERMISSIONS } from '../../config/permissions.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

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

const BANK_ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CASH', 'CREDIT_CARD', 'LOAN', 'INVESTMENT'] as const;
const BANK_TRANSACTION_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'INTEREST', 'DIRECT_DEBIT', 'CHECK', 'POS', 'ADJUSTMENT'] as const;
const RECONCILIATION_STATUSES = ['UNRECONCILED', 'PARTIAL', 'RECONCILED'] as const;

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

const optionalBooleanSchema = z.preprocess((value) => {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes'].includes(normalized)) return true;
        if (['false', '0', 'no'].includes(normalized)) return false;
    }
    return value;
}, z.boolean().optional());

const optionalDateStringSchema = z.preprocess(
    normalizeOptionalString,
    z.string().refine(isValidDateInput, 'Invalid date').optional()
);

const currencySchema = z.preprocess(
    normalizeOptionalString,
    z.string()
        .regex(/^[A-Z]{3}$/i, 'Currency must be a valid 3-letter code')
        .optional()
).transform((value) => value?.toUpperCase());

const optionalIbanSchema = z.preprocess(
    normalizeOptionalString,
    z.string()
        .regex(/^[A-Z0-9]{15,34}$/i, 'Invalid IBAN format')
        .optional()
).transform((value) => value?.toUpperCase());

const optionalSwiftCodeSchema = z.preprocess(
    normalizeOptionalString,
    z.string()
        .regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i, 'Invalid SWIFT code format')
        .optional()
).transform((value) => value?.toUpperCase());

const nullableIbanSchema = z.preprocess(
    normalizeNullableString,
    z.string()
        .regex(/^[A-Z0-9]{15,34}$/i, 'Invalid IBAN format')
        .nullable()
        .optional()
).transform((value) => value?.toUpperCase() ?? null);

const nullableSwiftCodeSchema = z.preprocess(
    normalizeNullableString,
    z.string()
        .regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i, 'Invalid SWIFT code format')
        .nullable()
        .optional()
).transform((value) => value?.toUpperCase() ?? null);

const bankAccountBaseSchema = z.object({
    accountName: z.string().trim().min(1, 'Account name is required').max(120, 'Account name must be 120 characters or less'),
    accountNumber: z.string().trim().min(1, 'Account number is required').max(50, 'Account number must be 50 characters or less'),
    bankName: z.string().trim().min(1, 'Bank name is required').max(120, 'Bank name must be 120 characters or less'),
    branchName: nullableTrimmedString(120),
    iban: nullableIbanSchema,
    swiftCode: nullableSwiftCodeSchema,
    accountType: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(BANK_ACCOUNT_TYPES).optional()
    ),
    currency: currencySchema,
    openingBalance: z.coerce.number().min(0, 'Opening balance cannot be negative').finite('Opening balance must be a valid number').optional(),
    branchId: nullableObjectIdSchema,
    glAccountId: nullableObjectIdSchema,
    notes: nullableTrimmedString(1000),
    isDefault: optionalBooleanSchema,
});

const bankAccountCreateSchema = bankAccountBaseSchema.extend({
    iban: optionalIbanSchema.transform((value) => value ?? null),
    swiftCode: optionalSwiftCodeSchema.transform((value) => value ?? null),
    accountType: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(BANK_ACCOUNT_TYPES).default('CHECKING')
    ),
    currency: currencySchema.transform((value) => value ?? 'SAR'),
    openingBalance: z.coerce.number().min(0, 'Opening balance cannot be negative').finite('Opening balance must be a valid number').default(0),
    isDefault: optionalBooleanSchema.default(false),
});

const bankAccountUpdateSchema = bankAccountBaseSchema.extend({
    iban: nullableIbanSchema,
    swiftCode: nullableSwiftCodeSchema,
}).partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field is required' }
);

const bankTransactionListQuerySchema = z.object({
    bankAccountId: optionalObjectIdSchema,
    startDate: optionalDateStringSchema,
    endDate: optionalDateStringSchema,
    isReconciled: optionalBooleanSchema,
    transactionType: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(BANK_TRANSACTION_TYPES).optional()
    ),
    search: optionalTrimmedString(120),
    reconciliationId: optionalObjectIdSchema,
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

const bankTransactionCreateSchema = z.object({
    bankAccountId: objectIdSchema,
    transactionDate: z.string().refine(isValidDateInput, 'Invalid transaction date'),
    description: z.string().trim().min(1, 'Description is required').max(500, 'Description must be 500 characters or less'),
    reference: nullableTrimmedString(120),
    transactionType: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(BANK_TRANSACTION_TYPES)
    ),
    amount: z.coerce.number().finite('Amount must be a valid number').refine((value) => value !== 0, 'Amount must be non-zero'),
    notes: nullableTrimmedString(1000),
}).superRefine((data, ctx) => {
    const positiveTypes = new Set(['DEPOSIT', 'TRANSFER_IN', 'INTEREST']);
    const negativeTypes = new Set(['WITHDRAWAL', 'TRANSFER_OUT', 'FEE', 'DIRECT_DEBIT', 'CHECK', 'POS']);

    if (positiveTypes.has(data.transactionType) && data.amount < 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['amount'],
            message: `${data.transactionType} amount must be positive`,
        });
    }

    if (negativeTypes.has(data.transactionType) && data.amount > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['amount'],
            message: `${data.transactionType} amount must be negative`,
        });
    }
});

const transactionReconcileSchema = z.object({
    reconciliationId: objectIdSchema,
});

const reconciliationListQuerySchema = z.object({
    bankAccountId: optionalObjectIdSchema,
    status: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(RECONCILIATION_STATUSES).optional()
    ),
});

const reconciliationCreateSchema = z.object({
    bankAccountId: objectIdSchema,
    statementDate: z.string().refine(isValidDateInput, 'Invalid statement date'),
    statementNumber: optionalTrimmedString(100),
    closingBalance: z.coerce.number().finite('Closing balance must be a valid number'),
    openingBalance: z.coerce.number().finite('Opening balance must be a valid number').optional(),
});

const reconciliationMatchSchema = z.object({
    transactionIds: z.array(objectIdSchema)
        .min(1, 'At least one transaction is required')
        .max(1000, 'A maximum of 1000 transactions can be matched at once'),
}).superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.transactionIds.forEach((id, index) => {
        if (seen.has(id)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['transactionIds', index],
                message: 'Duplicate transaction ids are not allowed',
            });
        }
        seen.add(id);
    });
});

const statementImportTransactionSchema = z.object({
    date: z.string().refine(isValidDateInput, 'Invalid transaction date'),
    description: z.string().trim().min(1, 'Description is required').max(500, 'Description must be 500 characters or less'),
    reference: optionalTrimmedString(120),
    amount: z.coerce.number().finite('Amount must be a valid number').refine((value) => value !== 0, 'Amount must be non-zero'),
});

const statementImportSchema = z.object({
    bankAccountId: objectIdSchema,
    fileName: optionalTrimmedString(255),
    transactions: z.array(statementImportTransactionSchema)
        .min(1, 'At least one transaction is required')
        .max(5000, 'A maximum of 5000 transactions can be imported at once'),
});

export const bankRoutes = Router();
bankRoutes.use(authenticate);

const ADMIN_BRANCH_PERMISSION = PERMISSIONS.ADMIN_MANAGE_BRANCHES;

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(ADMIN_BRANCH_PERMISSION);
}

function applyUserBranchScope(req: any, where: Record<string, any>): Record<string, any> {
    if (!isBranchAdmin(req)) {
        where.branchId = { in: req.user!.branchIds };
    }
    return where;
}

async function assertBranchAccessible(req: any, branchId: string): Promise<void> {
    if (!isBranchAdmin(req) && !req.user!.branchIds.includes(branchId)) {
        throw AppError.forbidden('You do not have access to this branch');
    }

    const branch = await prisma.branch.findFirst({
        where: { id: branchId, companyId: req.user!.companyId },
        select: { id: true },
    });
    if (!branch) {
        throw AppError.badRequest('Invalid branch');
    }
}

async function getAccessibleBankAccount(req: any, bankAccountId: string, include?: Record<string, any>, select?: Record<string, any>) {
    const account = await prisma.bankAccount.findFirst({
        where: applyUserBranchScope(req, {
            id: bankAccountId,
            companyId: req.user!.companyId,
        }),
        ...(include ? { include } : {}),
        ...(select ? { select } : {}),
    });

    if (!account) {
        throw AppError.notFound('Bank account not found');
    }

    return account;
}

// ═══════════════════════════════════════════════════════════════
// BANK ACCOUNTS
// ═══════════════════════════════════════════════════════════════

// GET /bank/accounts - List all bank accounts
bankRoutes.get('/accounts', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const where = applyUserBranchScope(req, {
            companyId: req.user!.companyId,
        });

        const accounts = await prisma.bankAccount.findMany({
            where,
            include: {
                branch: { select: { name: true, code: true } },
                glAccount: { select: { code: true, name: true } },
                _count: {
                    select: {
                        transactions: {
                            where: { isReconciled: false }
                        }
                    }
                }
            },
            orderBy: [
                { isDefault: 'desc' },
                { bankName: 'asc' },
                { accountName: 'asc' }
            ]
        });

        // Calculate unreconciled transaction counts
        const accountsWithStats = accounts.map(acc => ({
            ...acc,
            unreconciledCount: acc._count.transactions
        }));

        sendSuccess(res, accountsWithStats);
    } catch (error) { next(error); }
});

// GET /bank/accounts/:id - Get single account with details
bankRoutes.get('/accounts/:id', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const account = await getAccessibleBankAccount(req, id, {
            branch: { select: { name: true, code: true } },
            glAccount: { select: { code: true, name: true } },
            _count: {
                select: {
                    transactions: true
                }
            }
        });

        sendSuccess(res, account);
    } catch (error) { next(error); }
});

// POST /bank/accounts - Create new bank account
bankRoutes.post('/accounts', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ body: bankAccountCreateSchema }), async (req, res, next) => {
    try {
        const {
            accountName,
            accountNumber,
            bankName,
            branchName,
            iban,
            swiftCode,
            accountType,
            currency,
            openingBalance,
            branchId,
            glAccountId,
            notes,
            isDefault
        } = req.body;

        const companyId = req.user!.companyId;

        if (branchId) {
            await assertBranchAccessible(req, branchId);
        }

        if (glAccountId) {
            const glAccount = await prisma.account.findFirst({
                where: { id: glAccountId, companyId },
                select: { id: true },
            });
            if (!glAccount) {
                throw AppError.badRequest('Invalid GL account');
            }
        }

        const existing = await prisma.bankAccount.findFirst({
            where: { companyId, accountNumber }
        });

        if (existing) {
            throw AppError.badRequest('Bank account with this number already exists');
        }

        if (isDefault) {
            await prisma.bankAccount.updateMany({
                where: { companyId },
                data: { isDefault: false }
            });
        }

        const account = await prisma.bankAccount.create({
            data: {
                companyId,
                branchId: branchId || null,
                accountName,
                accountNumber,
                bankName,
                branchName,
                iban,
                swiftCode,
                accountType,
                currency: currency || 'SAR',
                openingBalance: openingBalance || 0,
                currentBalance: openingBalance || 0,
                glAccountId,
                notes,
                isDefault: isDefault || false
            },
            include: {
                branch: { select: { name: true, code: true } },
                glAccount: { select: { code: true, name: true } },
            }
        });

        sendSuccess(res, account, undefined, 201);
    } catch (error) { next(error); }
});

// PUT /bank/accounts/:id - Update bank account
bankRoutes.put('/accounts/:id', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ params: idParamsSchema, body: bankAccountUpdateSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const companyId = req.user!.companyId;
        const updateData = req.body;

        const existing = await getAccessibleBankAccount(req, id);

        if (updateData.branchId) {
            await assertBranchAccessible(req, updateData.branchId);
        }

        if (updateData.glAccountId) {
            const glAccount = await prisma.account.findFirst({
                where: { id: updateData.glAccountId, companyId },
                select: { id: true },
            });
            if (!glAccount) {
                throw AppError.badRequest('Invalid GL account');
            }
        }

        // Check account number uniqueness if changing
        if (updateData.accountNumber && updateData.accountNumber !== existing.accountNumber) {
            const duplicate = await prisma.bankAccount.findFirst({
                where: { companyId, accountNumber: updateData.accountNumber }
            });
            if (duplicate) {
                throw AppError.badRequest('Bank account with this number already exists');
            }
        }

        // Handle default flag
        if (updateData.isDefault && !existing.isDefault) {
            await prisma.bankAccount.updateMany({
                where: { companyId },
                data: { isDefault: false }
            });
        }

        const account = await prisma.bankAccount.update({
            where: { id: id as string },
            data: updateData,
            include: {
                branch: { select: { name: true } },
                glAccount: { select: { code: true, name: true } }
            }
        });

        sendSuccess(res, account);
    } catch (error) { next(error); }
});

// DELETE /bank/accounts/:id - Soft delete bank account
bankRoutes.delete('/accounts/:id', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const account = await getAccessibleBankAccount(req, id, {
            _count: { select: { transactions: true } }
        });

        if ((account as any)._count.transactions > 0) {
            throw AppError.badRequest('Cannot delete account with transactions. Deactivate it instead.');
        }

        await prisma.bankAccount.delete({ where: { id: id as string } });

        sendSuccess(res, { message: 'Bank account deleted successfully' });
    } catch (error) { next(error); }
});

// GET /bank/accounts/:id/balance - Get account balance info
bankRoutes.get('/accounts/:id/balance', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const companyId = req.user!.companyId;

        const account = await getAccessibleBankAccount(req, id, undefined, {
            id: true,
            accountName: true,
            currentBalance: true,
            openingBalance: true
        });

        // Calculate additional stats
        const stats = await prisma.bankTransaction.aggregate({
            where: {
                bankAccountId: id as string,
                companyId,
                isReconciled: false
            },
            _sum: {
                amount: true
            },
            _count: true
        });

        sendSuccess(res, {
            ...account,
            unreconciledAmount: stats._sum?.amount || 0,
            unreconciledCount: stats._count
        });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════
// BANK TRANSACTIONS
// ═══════════════════════════════════════════════════════════════

// GET /bank/transactions - List transactions with filters
bankRoutes.get('/transactions', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ query: bankTransactionListQuerySchema }), async (req, res, next) => {
    try {
        const {
            bankAccountId,
            startDate,
            endDate,
            isReconciled,
            transactionType,
            search,
            skip = 0,
            take = 50
        } = req.query as any;

        const companyId = req.user!.companyId;

        const where: any = { companyId };

        if (bankAccountId) {
            await getAccessibleBankAccount(req, bankAccountId);
            where.bankAccountId = bankAccountId;
        } else {
            // Filter by accessible bank accounts if no specific account
            const accessibleAccounts = await prisma.bankAccount.findMany({
                where: applyUserBranchScope(req, { companyId }),
                select: { id: true }
            });
            where.bankAccountId = { in: accessibleAccounts.map(a => a.id) };
        }

        if (startDate || endDate) {
            where.transactionDate = {};
            if (startDate) where.transactionDate.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.transactionDate.lte = end;
            }
        }

        if (isReconciled !== undefined) {
            where.isReconciled = isReconciled === 'true' || isReconciled === true;
        }

        if (transactionType) {
            where.transactionType = transactionType;
        }

        if (search) {
            where.OR = [
                { description: { contains: search, mode: 'insensitive' } },
                { reference: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [transactions, total] = await Promise.all([
            prisma.bankTransaction.findMany({
                where,
                include: {
                    bankAccount: { select: { accountName: true, bankName: true } },
                    createdBy: { select: { name: true } },
                    reconciliation: { select: { statementDate: true } }
                },
                orderBy: { transactionDate: 'desc' },
                skip: Number(skip),
                take: Number(take)
            }),
            prisma.bankTransaction.count({ where })
        ]);

        sendSuccess(res, {
            data: transactions,
            pagination: {
                total,
                skip: Number(skip),
                take: Number(take),
                hasMore: Number(skip) + transactions.length < total
            }
        });
    } catch (error) { next(error); }
});

// POST /bank/transactions - Create manual transaction
bankRoutes.post('/transactions', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ body: bankTransactionCreateSchema }), async (req, res, next) => {
    try {
        const {
            bankAccountId,
            transactionDate,
            description,
            reference,
            transactionType,
            amount,
            notes
        } = req.body;

        const companyId = req.user!.companyId;

        await getAccessibleBankAccount(req, bankAccountId);

        const transaction = await prisma.$transaction(async (tx) => {
            // Create transaction
            const newTransaction = await tx.bankTransaction.create({
                data: {
                    companyId,
                    bankAccountId,
                    transactionDate: new Date(transactionDate),
                    description,
                    reference,
                    transactionType,
                    amount,
                    notes,
                    createdById: req.user!.id
                }
            });

            // Update account balance
            await tx.bankAccount.update({
                where: { id: bankAccountId },
                data: {
                    currentBalance: {
                        increment: amount
                    }
                }
            });

            return newTransaction;
        });

        sendSuccess(res, transaction, undefined, 201);
    } catch (error) { next(error); }
});

// POST /bank/transactions/:id/reconcile - Mark transaction as reconciled
bankRoutes.post('/transactions/:id/reconcile', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ params: idParamsSchema, body: transactionReconcileSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const { reconciliationId } = req.body;
        const companyId = req.user!.companyId;

        const transaction = await prisma.bankTransaction.updateMany({
            where: { id: id as string, companyId },
            data: {
                isReconciled: true,
                reconciledAt: new Date(),
                reconciliationId
            }
        });

        if (transaction.count === 0) {
            throw AppError.notFound('Transaction not found');
        }

        sendSuccess(res, { message: 'Transaction reconciled successfully' });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════
// BANK RECONCILIATION
// ═══════════════════════════════════════════════════════════════

// GET /bank/reconciliations - List reconciliations
bankRoutes.get('/reconciliations', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ query: reconciliationListQuerySchema }), async (req, res, next) => {
    try {
        const { bankAccountId, status } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = { companyId };
        if (bankAccountId) {
            await getAccessibleBankAccount(req, bankAccountId);
            where.bankAccountId = bankAccountId;
        } else if (!isBranchAdmin(req)) {
            const accessibleAccounts = await prisma.bankAccount.findMany({
                where: applyUserBranchScope(req, { companyId }),
                select: { id: true },
            });
            where.bankAccountId = { in: accessibleAccounts.map((account) => account.id) };
        }
        if (status) where.status = status;

        const reconciliations = await prisma.bankReconciliation.findMany({
            where,
            include: {
                bankAccount: { select: { accountName: true, bankName: true, currency: true } },
                preparedBy: { select: { name: true } },
                reviewedBy: { select: { name: true } },
                _count: { select: { transactions: true } }
            },
            orderBy: { statementDate: 'desc' }
        });

        sendSuccess(res, reconciliations);
    } catch (error) { next(error); }
});

// GET /bank/reconciliations/:id - Get reconciliation with transactions
bankRoutes.get('/reconciliations/:id', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const companyId = req.user!.companyId;

        const reconciliation = await prisma.bankReconciliation.findFirst({
            where: { id: id as string, companyId },
            include: {
                bankAccount: true,
                preparedBy: { select: { name: true } },
                reviewedBy: { select: { name: true } },
                transactions: {
                    orderBy: { transactionDate: 'desc' }
                }
            }
        });

        if (!reconciliation) {
            throw AppError.notFound('Reconciliation not found');
        }

        await getAccessibleBankAccount(req, reconciliation.bankAccountId);

        sendSuccess(res, reconciliation);
    } catch (error) { next(error); }
});

// POST /bank/reconciliations - Create new reconciliation
bankRoutes.post('/reconciliations', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ body: reconciliationCreateSchema }), async (req, res, next) => {
    try {
        const {
            bankAccountId,
            statementDate,
            statementNumber,
            closingBalance,
            openingBalance
        } = req.body;

        const companyId = req.user!.companyId;

        const bankAccount = await getAccessibleBankAccount(req, bankAccountId);

        // Check for existing reconciliation for this period
        const existing = await prisma.bankReconciliation.findFirst({
            where: {
                companyId,
                bankAccountId,
                statementDate: new Date(statementDate)
            }
        });

        if (existing) {
            throw AppError.badRequest('Reconciliation already exists for this statement date');
        }

        // Get unreconciled transactions
        const unreconciledTransactions = await prisma.bankTransaction.findMany({
            where: {
                companyId,
                bankAccountId,
                isReconciled: false,
                transactionDate: { lte: new Date(statementDate) }
            },
            orderBy: { transactionDate: 'desc' }
        });

        const reconciliation = await prisma.bankReconciliation.create({
            data: {
                companyId,
                bankAccountId,
                statementDate: new Date(statementDate),
                statementNumber,
                openingBalance: openingBalance ?? bankAccount.currentBalance,
                closingBalance,
                statementBalance: closingBalance,
                systemBalance: bankAccount.currentBalance,
                difference: closingBalance - bankAccount.currentBalance,
                totalTransactions: unreconciledTransactions.length,
                reconciledCount: 0,
                preparedById: req.user!.id
            },
            include: {
                bankAccount: { select: { accountName: true, bankName: true } },
                preparedBy: { select: { name: true } }
            }
        });

        sendSuccess(res, {
            ...reconciliation,
            unreconciledTransactions
        }, undefined, 201);
    } catch (error) { next(error); }
});

// POST /bank/reconciliations/:id/match - Match transactions
bankRoutes.post('/reconciliations/:id/match', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ params: idParamsSchema, body: reconciliationMatchSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const { transactionIds } = req.body;
        const companyId = req.user!.companyId;

        const reconciliation = await prisma.bankReconciliation.findFirst({
            where: { id: id as string, companyId }
        });

        if (!reconciliation) {
            throw AppError.notFound('Reconciliation not found');
        }

        await getAccessibleBankAccount(req, reconciliation.bankAccountId);

        if (reconciliation.status === 'RECONCILED') {
            throw AppError.badRequest('Cannot modify reconciled statement');
        }

        // Calculate matched amount
        const matchedTransactions = await prisma.bankTransaction.findMany({
            where: {
                id: { in: transactionIds },
                companyId,
                bankAccountId: reconciliation.bankAccountId
            }
        });

        const matchedAmount = matchedTransactions.reduce((sum, t) => sum + t.amount, 0);

        // Update transactions
        await prisma.bankTransaction.updateMany({
            where: {
                id: { in: transactionIds },
                companyId
            },
            data: {
                isReconciled: true,
                reconciledAt: new Date(),
                reconciliationId: id as string
            }
        });

        // Update reconciliation
        const updatedReconciliation = await prisma.bankReconciliation.update({
            where: { id: id as string },
            data: {
                reconciledCount: { increment: transactionIds.length },
                status: 'PARTIAL',
                difference: reconciliation.closingBalance - (reconciliation.systemBalance - matchedAmount)
            },
            include: {
                bankAccount: { select: { accountName: true } }
            }
        });

        sendSuccess(res, updatedReconciliation);
    } catch (error) { next(error); }
});

// POST /bank/reconciliations/:id/complete - Complete reconciliation
bankRoutes.post('/reconciliations/:id/complete', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const companyId = req.user!.companyId;

        const reconciliation = await prisma.bankReconciliation.findFirst({
            where: { id: id as string, companyId },
            include: {
                _count: { select: { transactions: true } }
            }
        });

        if (!reconciliation) {
            throw AppError.notFound('Reconciliation not found');
        }

        await getAccessibleBankAccount(req, reconciliation.bankAccountId);

        // Allow completion even with small differences (tolerance)
        const tolerance = 0.01;
        if (Math.abs(reconciliation.difference) > tolerance) {
            throw AppError.badRequest(
                `Cannot complete reconciliation. Difference of ${reconciliation.difference.toFixed(2)} remains.`
            );
        }

        const updated = await prisma.bankReconciliation.update({
            where: { id: id as string },
            data: {
                status: 'RECONCILED',
                reviewedById: req.user!.id,
                reviewedAt: new Date()
            }
        });

        sendSuccess(res, updated);
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════
// BANK STATEMENT IMPORT
// ═══════════════════════════════════════════════════════════════

// POST /bank/statement-import - Import statement (CSV format)
bankRoutes.post('/statement-import', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), validate({ body: statementImportSchema }), async (req, res, next) => {
    try {
        const { bankAccountId, transactions, fileName } = req.body;
        const companyId = req.user!.companyId;

        await getAccessibleBankAccount(req, bankAccountId);

        const results = {
            imported: 0,
            skipped: 0,
            errors: [] as any[]
        };

        const importedTransactions = [];

        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            try {
                // Check for duplicates based on reference + date + amount
                const existing = await prisma.bankTransaction.findFirst({
                    where: {
                        companyId,
                        bankAccountId,
                        reference: tx.reference,
                        transactionDate: new Date(tx.date),
                        amount: tx.amount
                    }
                });

                if (existing) {
                    results.skipped++;
                    continue;
                }

                const transaction = await prisma.bankTransaction.create({
                    data: {
                        companyId,
                        bankAccountId,
                        transactionDate: new Date(tx.date),
                        description: tx.description,
                        reference: tx.reference,
                        transactionType: inferTransactionType(tx.description, tx.amount) as any,
                        amount: tx.amount,
                        createdById: req.user!.id
                    }
                });

                importedTransactions.push(transaction);
                results.imported++;
            } catch (error: any) {
                results.errors.push({
                    row: i + 1,
                    error: error.message
                });
            }
        }

        // Update account balance
        const totalImported = importedTransactions.reduce((sum, t) => sum + t.amount, 0);
        await prisma.bankAccount.update({
            where: { id: bankAccountId },
            data: {
                currentBalance: {
                    increment: totalImported
                }
            }
        });

        // Record import
        await prisma.bankStatementImport.create({
            data: {
                companyId,
                bankAccountId,
                fileName: fileName || 'import.csv',
                rowCount: transactions.length,
                importedCount: results.imported,
                skippedCount: results.skipped,
                errorCount: results.errors.length,
                errors: results.errors.length > 0 ? results.errors : null,
                importedById: req.user!.id
            }
        });

        sendSuccess(res, results);
    } catch (error) { next(error); }
});

// Helper function to infer transaction type from description
function inferTransactionType(description: string, amount: number): string {
    const desc = description.toLowerCase();
    
    if (desc.includes('check') || desc.includes('cheque')) return 'CHECK';
    if (desc.includes('transfer')) return amount > 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT';
    if (desc.includes('fee') || desc.includes('charge')) return 'FEE';
    if (desc.includes('interest')) return 'INTEREST';
    if (desc.includes('pos') || desc.includes('purchase')) return 'POS';
    if (desc.includes('direct debit')) return 'DIRECT_DEBIT';
    
    return amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
}

// GET /bank/dashboard - Bank dashboard summary
bankRoutes.get('/dashboard', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const where = applyUserBranchScope(req, { companyId });

        const [
            accounts,
            totalBalance,
            recentTransactions,
            unreconciledCount,
            pendingReconciliations
        ] = await Promise.all([
            prisma.bankAccount.findMany({
                where: { ...where, isActive: true },
                select: {
                    id: true,
                    accountName: true,
                    bankName: true,
                    currentBalance: true,
                    currency: true
                },
                orderBy: { isDefault: 'desc' }
            }),
            prisma.bankAccount.aggregate({
                where: { ...where, isActive: true },
                _sum: { currentBalance: true }
            }),
            prisma.bankTransaction.findMany({
                where: {
                    companyId,
                    bankAccount: { is: where }
                },
                include: {
                    bankAccount: { select: { accountName: true } }
                },
                orderBy: { transactionDate: 'desc' },
                take: 10
            }),
            prisma.bankTransaction.count({
                where: {
                    companyId,
                    bankAccount: { is: where },
                    isReconciled: false
                }
            }),
            prisma.bankReconciliation.count({
                where: {
                    companyId,
                    bankAccount: { is: where },
                    status: { in: ['UNRECONCILED', 'PARTIAL'] }
                }
            })
        ]);

        sendSuccess(res, {
            accounts,
            totalBalance: totalBalance._sum.currentBalance || 0,
            recentTransactions,
            unreconciledCount,
            pendingReconciliations
        });
    } catch (error) { next(error); }
});
