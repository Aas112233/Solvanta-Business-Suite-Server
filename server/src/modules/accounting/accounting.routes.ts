import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { PERMISSIONS } from '../../config/permissions.js';

export const accountingRoutes = Router();
accountingRoutes.use(authenticate);

// --- Chart of Accounts ---
accountingRoutes.get('/accounts', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const accounts = await prisma.account.findMany({
            where: { companyId: req.user!.companyId },
            orderBy: [{ type: 'asc' }, { code: 'asc' }]
        });
        sendSuccess(res, accounts);
    } catch (error) { next(error); }
});

accountingRoutes.post('/accounts', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), async (req, res, next) => {
    try {
        const { code, name, type, parentId } = req.body;
        const companyId = req.user!.companyId;

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
                return res.status(400).json({ success: false, error: { message: `Account with code ${finalCode} already exists`, code: 'DUPLICATE_CODE' } });
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
    } catch (error) { next(error); }
});

// --- Mappings ---
accountingRoutes.get('/mappings', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const mappings = await prisma.accountMapping.findMany({
            where: { companyId: req.user!.companyId },
            include: { account: true }
        });
        sendSuccess(res, mappings);
    } catch (error) { next(error); }
});

accountingRoutes.post('/mappings', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), async (req, res, next) => {
    try {
        const { mappingType, entityType, entityId, accountId } = req.body;
        const companyId = req.user!.companyId;

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
    } catch (error) { next(error); }
});

accountingRoutes.delete('/mappings/:id', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), async (req, res, next) => {
    try {
        await prisma.accountMapping.delete({
            where: { id: req.params.id as string, companyId: req.user!.companyId }
        });
        sendSuccess(res, { message: 'Mapping deleted successfully' });
    } catch (error) { next(error); }
});

// --- Journal Entries ---
accountingRoutes.get('/journal-entries', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const { branchId, startDate, endDate, skip = 0, take = 50 } = req.query;

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
    } catch (error) { next(error); }
});

accountingRoutes.post('/journal-entries', requirePermission(PERMISSIONS.ACCOUNTING_POST as any), async (req, res, next) => {
    try {
        const { date, memo, branchId, lines } = req.body;
        const companyId = req.user!.companyId;

        if (!lines || !Array.isArray(lines) || lines.length < 2) {
            return res.status(400).json({ success: false, error: { message: 'A journal entry requires at least two lines', code: 'INVALID_LINES' } });
        }

        // Validate debits = credits
        const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return res.status(400).json({ success: false, error: { message: 'Debits must equal credits', code: 'UNBALANCED_JOURNAL' } });
        }

        if (totalDebit <= 0) {
            return res.status(400).json({ success: false, error: { message: 'Journal entry must have a non-zero value', code: 'ZERO_VALUE' } });
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
    } catch (error) { next(error); }
});

// --- Trial Balance Extract ---
accountingRoutes.get('/reports/trial-balance', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const { branchId, asOfDate } = req.query;

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
    } catch (error) { next(error); }
});

// --- Profit & Loss Extract ---
accountingRoutes.get('/reports/pl', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const { branchId, startDate, endDate } = req.query;

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
    } catch (error) { next(error); }
});

// --- Balance Sheet Extract ---
accountingRoutes.get('/reports/balance-sheet', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const { branchId, asOfDate } = req.query;

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
    } catch (error) { next(error); }
});

// --- General Ledger Extract ---
accountingRoutes.get('/reports/general-ledger', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const { accountId, branchId, startDate, endDate } = req.query;

        // If no account is selected, we might want to return an empty array or require it
        if (!accountId) {
            return res.status(400).json({ success: false, error: { message: "accountId is required for general ledger", code: 'MISSING_PARAM' } });
        }

        const account = await prisma.account.findUnique({
            where: { id: accountId as string, companyId: req.user!.companyId }
        });

        if (!account) {
            return res.status(404).json({ success: false, error: { message: "Account not found", code: 'NOT_FOUND' } });
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
    } catch (error) { next(error); }
});
