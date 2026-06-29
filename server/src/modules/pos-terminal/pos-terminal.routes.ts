import { Router } from 'express';
import { authenticate, requirePermission, requireAnyPermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getPosTerminalPolicy, upsertPosTerminalPolicy } from '../pos/pos-policy.js';
import { isCashType, isBankType, isCreditType, isMixedType } from '../../utils/paymentMethods.js';

export const posTerminalRoutes = Router();
posTerminalRoutes.use(authenticate);

// ═══════════════════════════════════════════════
// POS TERMINAL CRUD
// ═══════════════════════════════════════════════

const terminalSchema = z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(100),
    branchId: z.string().min(1),
    defaultUserId: z.string().optional().nullable(),
    priceGroupId: z.string().optional().nullable(),
    receiptHeader: z.string().optional().nullable(),
    receiptFooter: z.string().optional().nullable(),
    policy: z.object({
        allowedPaymentMethods: z.array(z.string()).optional(),
        allowCreditSales: z.boolean().optional(),
        allowPriceChange: z.boolean().optional(),
        maxDiscountPct: z.number().min(0).max(100).optional(),
        returnWindowDays: z.number().min(0).max(365).optional(),
        allowPosReturns: z.boolean().optional(),
        requireSameShiftForReturns: z.boolean().optional(),
        pricePriority: z.enum(['CUSTOMER_FIRST', 'TERMINAL_FIRST']).optional(),
        requireShiftForSale: z.boolean().optional(),
    }).optional(),
    isActive: z.boolean().optional(),
});

const terminalUpdateSchema = terminalSchema.partial();

async function verifyActionAuthUser(reqUser: any, companyId: string, authEmail?: string, authPassword?: string) {
    const email = String(authEmail || '').trim().toLowerCase();
    const password = String(authPassword || '');

    // If no explicit credentials provided, use the logged-in user
    if (!email && !password) {
        const user = await prisma.user.findFirst({
            where: { id: reqUser.id, companyId },
            include: {
                role: { select: { name: true, permissions: true } },
                branches: { select: { branchId: true } },
            },
        });
        if (!user || !user.isActive) throw AppError.unauthorized('User account is inactive');
        return user;
    }

    // Require both if one is provided
    if (!email || !password) throw AppError.badRequest('Email and password are required for override');

    const user = await prisma.user.findFirst({
        where: { companyId, email },
        include: {
            role: { select: { name: true, permissions: true } },
            branches: { select: { branchId: true } },
        },
    });
    if (!user || !user.isActive) throw AppError.unauthorized('Invalid override email or password');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw AppError.unauthorized('Invalid override email or password');
    return user;
}

function isManagerOrAdmin(user: any): boolean {
    const roleName = String(user?.role?.name || '').toLowerCase();
    const perms = user?.role?.permissions || [];
    return roleName.includes('manager') || perms.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES);
}

// GET /pos-terminals
posTerminalRoutes.get('/', requirePermission(PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const hasManagePerm = req.user?.permissions?.includes(PERMISSIONS.POS_MANAGE_TERMINALS);
        const { branchId, isActive } = req.query as any;

        const where: any = { companyId };
        if (branchId) {
            where.branchId = branchId;
        } else if (!hasManagePerm) {
            // Cashiers only see terminals in their branches
            where.branchId = { in: req.user!.branchIds };
        }
        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }

        const terminals = await (prisma as any).pOSTerminal.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true, code: true } },
                defaultUser: { select: { id: true, name: true } },
                priceGroup: { select: { id: true, name: true } },
                shifts: {
                    where: { status: 'OPEN' },
                    select: { id: true, userId: true, openedAt: true, user: { select: { id: true, name: true } } },
                    take: 1,
                },
            },
            orderBy: { code: 'asc' },
        });

        // Flatten: add `activeShift` convenience field
        const policies = await prisma.globalString.findMany({
            where: {
                companyId,
                group: 'POS_TERMINAL_POLICY',
                systemKey: { in: terminals.map((t: any) => t.id) },
                isActive: true,
            },
            select: { systemKey: true, metadata: true },
        });
        const policyMap = new Map((policies || []).map((p: any) => [String(p.systemKey), p.metadata]));

        const result = terminals.map((t: any) => ({
            ...t,
            activeShift: t.shifts[0] || null,
            policy: policyMap.get(String(t.id)) || null,
            shifts: undefined,
        }));

        sendSuccess(res, result);
    } catch (error) { next(error); }
});

// GET /pos-terminals/:id
posTerminalRoutes.get('/:id', requirePermission(PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const terminal = await (prisma as any).pOSTerminal.findFirst({
            where: { id: req.params.id, companyId: req.user!.companyId },
            include: {
                branch: { select: { id: true, name: true, code: true } },
                defaultUser: { select: { id: true, name: true } },
                priceGroup: { select: { id: true, name: true } },
                shifts: {
                    where: { status: 'OPEN' },
                    select: { id: true, userId: true, openedAt: true, openingCash: true, user: { select: { id: true, name: true } } },
                    take: 1,
                },
            },
        });
        if (!terminal) throw AppError.notFound('Terminal');
        const policy = await prisma.globalString.findFirst({
            where: {
                companyId: req.user!.companyId,
                group: 'POS_TERMINAL_POLICY',
                systemKey: terminal.id,
                isActive: true,
            },
            select: { metadata: true },
        });
        sendSuccess(res, { ...terminal, activeShift: terminal.shifts[0] || null, policy: policy?.metadata || null, shifts: undefined });
    } catch (error) { next(error); }
});

// POST /pos-terminals
posTerminalRoutes.post('/', requireAnyPermission(PERMISSIONS.POS_MANAGE_TERMINALS, PERMISSIONS.POS_ACCESS), validate({ body: terminalSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const { code, name, branchId, defaultUserId, priceGroupId, receiptHeader, receiptFooter, policy } = req.body;

        // Validate branch
        const branch = await prisma.branch.findFirst({ where: { id: branchId, companyId } });
        if (!branch) throw AppError.badRequest('Invalid branch');

        // Check unique code
        const existing = await (prisma as any).pOSTerminal.findFirst({ where: { companyId, code } });
        if (existing) throw AppError.badRequest(`Terminal code "${code}" already exists`);

        const terminal = await (prisma as any).pOSTerminal.create({
            data: {
                companyId,
                code,
                name,
                branchId,
                defaultUserId: defaultUserId || null,
                priceGroupId: priceGroupId || null,
                receiptHeader: receiptHeader || null,
                receiptFooter: receiptFooter || null,
            },
            include: {
                branch: { select: { id: true, name: true, code: true } },
                defaultUser: { select: { id: true, name: true } },
                priceGroup: { select: { id: true, name: true } },
            },
        });

        if (policy) {
            await upsertPosTerminalPolicy(companyId, terminal.id, policy as any);
        }

        sendSuccess(res, terminal, 'Terminal created' as any, 201);
    } catch (error) { next(error); }
});

// PATCH /pos-terminals/:id
posTerminalRoutes.patch('/:id', requireAnyPermission(PERMISSIONS.POS_MANAGE_TERMINALS, PERMISSIONS.POS_ACCESS), validate({ body: terminalUpdateSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const terminal = await (prisma as any).pOSTerminal.findFirst({ where: { id: req.params.id, companyId } });
        if (!terminal) throw AppError.notFound('Terminal');

        // If code is changing, check uniqueness
        if (req.body.code && req.body.code !== terminal.code) {
            const dup = await (prisma as any).pOSTerminal.findFirst({ where: { companyId, code: req.body.code } });
            if (dup) throw AppError.badRequest(`Terminal code "${req.body.code}" already exists`);
        }

        // If branchId is changing, validate
        if (req.body.branchId && req.body.branchId !== terminal.branchId) {
            const branch = await prisma.branch.findFirst({ where: { id: req.body.branchId, companyId } });
            if (!branch) throw AppError.badRequest('Invalid branch');
        }

        const { policy, ...patchData } = req.body || {};
        const updated = await (prisma as any).pOSTerminal.update({
            where: { id: terminal.id },
            data: patchData,
            include: {
                branch: { select: { id: true, name: true, code: true } },
                defaultUser: { select: { id: true, name: true } },
                priceGroup: { select: { id: true, name: true } },
            },
        });

        if (policy) {
            await upsertPosTerminalPolicy(companyId, terminal.id, policy as any);
        }

        sendSuccess(res, updated, 'Terminal updated' as any);
    } catch (error) { next(error); }
});

// DELETE /pos-terminals/:id (soft-delete: set isActive = false)
posTerminalRoutes.delete('/:id', requireAnyPermission(PERMISSIONS.POS_MANAGE_TERMINALS, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const terminal = await (prisma as any).pOSTerminal.findFirst({ where: { id: req.params.id, companyId: req.user!.companyId } });
        if (!terminal) throw AppError.notFound('Terminal');

        // Ensure no open shift
        const openShift = await (prisma as any).pOSShift.findFirst({ where: { terminalId: terminal.id, status: 'OPEN' } });
        if (openShift) throw AppError.badRequest('Cannot deactivate terminal with an open shift');

        await (prisma as any).pOSTerminal.update({ where: { id: terminal.id }, data: { isActive: false } });
        sendSuccess(res, null, 'Terminal deactivated' as any);
    } catch (error) { next(error); }
});


// ═══════════════════════════════════════════════
// POS SHIFT LIFECYCLE
// ═══════════════════════════════════════════════

const openShiftSchema = z.object({
    openingCash: z.number().min(0).default(0),
    authEmail: z.string().email().optional().or(z.literal('')),
    authPassword: z.string().optional().or(z.literal('')),
});

const closeShiftSchema = z.object({
    actualCash: z.number().min(0),
    denominations: z.record(z.string(), z.number()).optional(),
    notes: z.string().optional(),
    authEmail: z.string().email().optional().or(z.literal('')),
    authPassword: z.string().optional().or(z.literal('')),
});

async function buildShiftConsolidation(companyId: string, shiftId: string, openingCash: number) {
    const invoices = await (prisma as any).pOSInvoice.findMany({
        where: { posShiftId: shiftId, companyId },
        select: {
            id: true,
            invoiceNo: true,
            grandTotal: true,
            paymentMethod: true,
            cashReceived: true,
            changeGiven: true,
            status: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const totalInvoices = invoices.length;
    const firstInvoiceNo = invoices[0]?.invoiceNo || null;
    const lastInvoiceNo = invoices[invoices.length - 1]?.invoiceNo || null;

    let grossSales = 0;
    let postedSales = 0;
    let unpostedSales = 0;
    let unpostedCount = 0;

    let cashSales = 0;
    let cardSales = 0;
    let mixedSales = 0;
    let creditSales = 0;
    let bankTransferSales = 0;
    let otherSales = 0;

    let mixedCashPart = 0;
    let mixedCardPart = 0;

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const inv of invoices) {
        const amount = Number(inv.grandTotal || 0);
        const method = String(inv.paymentMethod || 'UNKNOWN').toUpperCase();
        const status = String(inv.status || '').toUpperCase();

        grossSales += amount;
        if (status === 'UNPOSTED') {
            unpostedSales += amount;
            unpostedCount += 1;
        } else {
            postedSales += amount;
        }

        if (!paymentBreakdown[method]) paymentBreakdown[method] = { count: 0, total: 0 };
        paymentBreakdown[method].count += 1;
        paymentBreakdown[method].total += amount;

        if (isCashType(method)) {
            cashSales += amount;
        } else if (isMixedType(method)) {
            mixedSales += amount;
            const cashPart = Math.max(0, Number(inv.cashReceived || 0) - Number(inv.changeGiven || 0));
            const cardPart = Math.max(0, amount - cashPart);
            mixedCashPart += cashPart;
            mixedCardPart += cardPart;
        } else if (isCreditType(method)) {
            creditSales += amount;
        } else if (isBankType(method)) {
            bankTransferSales += amount;
        } else {
            otherSales += amount;
        }
    }

    const invoiceIds = invoices.map((inv: any) => inv.id);
    const returnWhere: any = { companyId, status: 'POSTED' };
    if (invoiceIds.length > 0) {
        returnWhere.invoiceId = { in: invoiceIds };
    } else {
        returnWhere.invoiceId = '__none__';
    }

    const [salesReturnAgg, totalReturnsCount] = await Promise.all([
        (prisma as any).salesReturn.aggregate({
            where: returnWhere,
            _sum: { grandTotal: true },
        }),
        (prisma as any).salesReturn.count({ where: returnWhere }),
    ]);

    const totalReturns = Number(salesReturnAgg?._sum?.grandTotal || 0);
    const netSales = grossSales - totalReturns;

    const cashIn = cashSales + mixedCashPart;
    const cardIn = cardSales + mixedCardPart;
    const totalExpectedAllSalesTypes = cashSales + cardSales + mixedSales + creditSales + bankTransferSales + otherSales;
    const expectedCash = Number(openingCash || 0) + cashIn - totalReturns;

    return {
        grossSales,
        postedSales,
        unpostedSales,
        netSales,
        totalInvoices,
        unpostedCount,
        totalReturns,
        totalReturnsCount,
        invoiceRange: {
            firstInvoiceNo,
            lastInvoiceNo,
        },
        paymentBreakdown,
        paymentTotals: {
            cashSales,
            cardSales,
            mixedSales,
            creditSales,
            bankTransferSales,
            otherSales,
            mixedCashPart,
            mixedCardPart,
            cashIn,
            cardIn,
            totalExpectedAllSalesTypes,
        },
        cash: {
            openingCash: Number(openingCash || 0),
            expectedCash,
            cashIn,
            cashOutReturns: totalReturns,
        },
    };
}

// POST /pos-terminals/:id/open-shift
posTerminalRoutes.post('/:id/open-shift', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), validate({ body: openShiftSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const terminalId = req.params.id;
        const authUser: any = await verifyActionAuthUser(req.user, companyId, req.body?.authEmail, req.body?.authPassword);

        // Validate terminal
        const terminal = await (prisma as any).pOSTerminal.findFirst({ where: { id: terminalId, companyId, isActive: true } });
        if (!terminal) throw AppError.notFound('Terminal not found or inactive');

        // Check user has access to terminal's branch
        const authBranchIds = (authUser.branches || []).map((b: any) => b.branchId);
        const managerOrAdmin = isManagerOrAdmin(authUser);
        if (!managerOrAdmin && !authBranchIds.includes(terminal.branchId)) {
            throw AppError.forbidden('You do not have access to this terminal\'s branch');
        }
        if (terminal.defaultUserId && terminal.defaultUserId !== authUser.id && !managerOrAdmin) {
            throw AppError.forbidden('Only assigned terminal user can open shift');
        }

        // Ensure no existing open shift on this terminal
        const existingShift = await (prisma as any).pOSShift.findFirst({ where: { terminalId, status: 'OPEN' } });
        if (existingShift) {
            throw AppError.badRequest('This terminal already has an open shift. Close it first.');
        }

        const shift = await (prisma as any).pOSShift.create({
            data: {
                companyId,
                terminalId,
                userId: authUser.id,
                openingCash: req.body.openingCash || 0,
            },
            include: {
                terminal: { select: { id: true, code: true, name: true, branchId: true } },
                user: { select: { id: true, name: true } },
            },
        });

        sendSuccess(res, shift, 'Shift opened' as any, 201);
    } catch (error) { next(error); }
});

// GET /pos-terminals/:id/active-shift
posTerminalRoutes.get('/:id/active-shift', requirePermission(PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const shift = await (prisma as any).pOSShift.findFirst({
            where: {
                terminalId: req.params.id,
                companyId: req.user!.companyId,
                status: 'OPEN',
            },
            include: {
                terminal: { select: { id: true, code: true, name: true, branchId: true } },
                user: { select: { id: true, name: true } },
            },
        });

        sendSuccess(res, shift); // null if no active shift — that's valid
    } catch (error) { next(error); }
});

// POST /pos-shifts/:shiftId/close
posTerminalRoutes.post('/shifts/:shiftId/close', requireAnyPermission(PERMISSIONS.POS_CLOSE_SHIFT, PERMISSIONS.POS_ACCESS), validate({ body: closeShiftSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const shiftId = req.params.shiftId;
        const authUser: any = await verifyActionAuthUser(req.user, companyId, req.body?.authEmail, req.body?.authPassword);
        const managerOrAdmin = isManagerOrAdmin(authUser);

        const shift = await (prisma as any).pOSShift.findFirst({
            where: { id: shiftId, companyId, status: 'OPEN' },
            include: { terminal: { select: { id: true, branchId: true } } },
        });
        if (!shift) throw AppError.notFound('Shift not found or already closed');
        const authBranchIds = (authUser.branches || []).map((b: any) => b.branchId);
        if (!managerOrAdmin && !authBranchIds.includes(shift.terminal.branchId)) {
            throw AppError.forbidden('You do not have access to this terminal branch');
        }
        if (shift.userId !== authUser.id && !managerOrAdmin) {
            throw AppError.forbidden('Only shift owner can close this shift');
        }

        const summaryBase = await buildShiftConsolidation(companyId, String(shiftId), Number(shift.openingCash || 0));
        const expectedCash = Number(summaryBase.cash.expectedCash || 0);
        const actualCash = req.body.actualCash;
        const variance = actualCash - expectedCash;

        const closedShift = await (prisma as any).pOSShift.update({
            where: { id: shiftId },
            data: {
                status: 'CLOSED',
                closedAt: new Date(),
                expectedCash,
                actualCash,
                variance,
                totalSales: summaryBase.grossSales,
                totalRefunds: summaryBase.totalReturns,
                totalTransactions: summaryBase.totalInvoices,
                denominations: req.body.denominations || null,
                notes: [req.body.notes || null, shift.userId !== authUser.id ? `[Override by ${authUser.email}]` : null].filter(Boolean).join(' | ') || null,
            },
            include: {
                terminal: { select: { id: true, code: true, name: true } },
                user: { select: { id: true, name: true } },
            },
        });

        const summary = {
            ...summaryBase,
            cash: {
                ...summaryBase.cash,
                actualCash,
                variance,
            },
            closedBy: {
                id: authUser.id,
                name: authUser.name,
                email: authUser.email,
            },
            closedAt: closedShift.closedAt,
        };

        sendSuccess(
            res,
            {
                ...closedShift,
                summary,
            },
            'Shift closed successfully' as any
        );
    } catch (error) { next(error); }
});


// ═══════════════════════════════════════════════
// POS SHIFT HISTORY & DETAIL
// ═══════════════════════════════════════════════

// GET /pos-shifts (mounted at /pos-terminals/shifts)
posTerminalRoutes.get('/shifts/list', requireAnyPermission(PERMISSIONS.POS_VIEW_SHIFTS, PERMISSIONS.POS_VIEW_OWN_SHIFTS, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const { terminalId, userId, status, dateFrom, dateTo } = req.query as any;
        const companyId = req.user!.companyId;
        const canViewAllShifts = Boolean(
            req.user?.permissions?.includes(PERMISSIONS.POS_VIEW_SHIFTS)
            || req.user?.permissions?.includes(PERMISSIONS.POS_ACCESS)
            || req.user?.permissions?.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES)
        );

        const where: any = { companyId };
        if (terminalId) where.terminalId = terminalId;
        if (userId) where.userId = userId;
        if (status) where.status = status;
        if (dateFrom || dateTo) {
            where.openedAt = {};
            if (dateFrom) where.openedAt.gte = new Date(dateFrom);
            if (dateTo) where.openedAt.lte = new Date(dateTo);
        }

        // Non-admin users only see shifts on their branches
        const isAdmin = req.user?.permissions?.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES);
        if (!isAdmin) {
            const terminalIds = await (prisma as any).pOSTerminal.findMany({
                where: { companyId, branchId: { in: req.user!.branchIds } },
                select: { id: true },
            });
            where.terminalId = { in: terminalIds.map((t: any) => t.id) };
        }
        if (!canViewAllShifts) {
            where.userId = req.user!.id;
        }

        const [shifts, total] = await Promise.all([
            (prisma as any).pOSShift.findMany({
                where,
                skip,
                take,
                include: {
                    terminal: { select: { id: true, code: true, name: true } },
                    user: { select: { id: true, name: true } },
                },
                orderBy: { openedAt: 'desc' },
            }),
            (prisma as any).pOSShift.count({ where }),
        ]);

        sendPaginated(res, shifts, total, page, limit);
    } catch (error) { next(error); }
});

// GET /pos-shifts/:id (mounted at /pos-terminals/shifts/:id)
posTerminalRoutes.get('/shifts/:shiftId', requireAnyPermission(PERMISSIONS.POS_VIEW_SHIFTS, PERMISSIONS.POS_VIEW_OWN_SHIFTS, PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_CLOSE_SHIFT), async (req, res, next) => {
    try {
        const shift = await (prisma as any).pOSShift.findFirst({
            where: { id: req.params.shiftId, companyId: req.user!.companyId },
            include: {
                terminal: { select: { id: true, code: true, name: true } },
                user: { select: { id: true, name: true } },
                invoices: {
                    select: {
                        id: true,
                        invoiceNo: true,
                        grandTotal: true,
                        paymentMethod: true,
                        cashReceived: true,
                        changeGiven: true,
                        status: true,
                        createdAt: true,
                        customer: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!shift) throw AppError.notFound('Shift');
        const canViewAllShifts = Boolean(
            req.user?.permissions?.includes(PERMISSIONS.POS_VIEW_SHIFTS)
            || req.user?.permissions?.includes(PERMISSIONS.POS_ACCESS)
            || req.user?.permissions?.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES)
        );
        if (!canViewAllShifts && String((shift as any).userId) !== String(req.user!.id)) {
            throw AppError.forbidden('You can only view your own shifts');
        }

        const summary = await buildShiftConsolidation(req.user!.companyId, String(req.params.shiftId), Number((shift as any).openingCash || 0));
        sendSuccess(res, { ...shift, paymentBreakdown: summary.paymentBreakdown, summary });
    } catch (error) { next(error); }
});
