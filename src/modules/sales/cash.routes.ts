import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission, requireBranch } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { AppError } from '../../utils/AppError.js';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';

export const salesCashRoutes = Router();
salesCashRoutes.use(authenticate);

const BAG_STATUSES = [
    'DECLARED',
    'PICKUP_ASSIGNED',
    'PICKED_UP',
    'IN_TRANSIT',
    'VAULT_RECEIVED',
    'DEPOSITED',
    'RECONCILED',
    'SHORT',
    'EXCESS',
    'LOST',
    'CANCELLED',
] as const;

type BagStatus = typeof BAG_STATUSES[number];

const createRunSchema = z.object({
    scheduledAt: z.string().optional(),
    collectorId: z.string().optional(),
    notes: z.string().max(1000).optional(),
    bags: z.array(z.object({
        branchId: z.string().min(1),
        declaredAmount: z.number().min(0),
        bagCode: z.string().min(2).max(40).optional(),
        sourceShiftId: z.string().optional(),
        notes: z.string().max(400).optional(),
    })).min(1),
});

const listRunsQuerySchema = paginationSchema.extend({
    status: z.enum(['DRAFT', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']).optional(),
    collectorId: z.string().optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

const listBagsQuerySchema = paginationSchema.extend({
    status: z.string().optional(),
    runId: z.string().optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

const listDepositsQuerySchema = paginationSchema.extend({
    branchId: z.string().optional(),
    runId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

const listAuditQuerySchema = paginationSchema.extend({
    runId: z.string().optional(),
    bagId: z.string().optional(),
    branchId: z.string().optional(),
    eventType: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

const pickupSchema = z.object({
    collectedAmount: z.number().min(0).optional(),
    inTransit: z.boolean().optional().default(true),
    pickedAt: z.string().optional(),
    notes: z.string().max(400).optional(),
});

const vaultReceiveSchema = z.object({
    vaultAmount: z.number().min(0),
    receivedAt: z.string().optional(),
    notes: z.string().max(400).optional(),
});

const depositSchema = z.object({
    amount: z.number().min(0).optional(),
    bankAccount: z.string().min(1).max(120),
    depositSlipNo: z.string().min(1).max(120),
    depositDate: z.string().optional(),
    notes: z.string().max(400).optional(),
});

const reconcileSchema = z.object({
    reconciledAmount: z.number().min(0).optional(),
    forceStatus: z.enum(['RECONCILED', 'SHORT', 'EXCESS']).optional(),
    notes: z.string().max(400).optional(),
});

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES);
}

async function getAccessibleBranchIds(req: any): Promise<string[]> {
    if (!req.user) return [];
    if (!isBranchAdmin(req)) return req.user.branchIds || [];
    const rows = await prisma.branch.findMany({
        where: { companyId: req.user.companyId },
        select: { id: true },
    });
    return rows.map((b) => b.id);
}

function asDateStart(value?: string) {
    if (!value?.trim()) return null;
    const d = new Date(`${value.trim()}T00:00:00.000`);
    if (Number.isNaN(d.getTime())) throw AppError.badRequest('Invalid startDate, expected YYYY-MM-DD');
    return d;
}

function asDateEnd(value?: string) {
    if (!value?.trim()) return null;
    const d = new Date(`${value.trim()}T23:59:59.999`);
    if (Number.isNaN(d.getTime())) throw AppError.badRequest('Invalid endDate, expected YYYY-MM-DD');
    return d;
}

function parseStatusList(raw?: string): BagStatus[] | undefined {
    if (!raw?.trim()) return undefined;
    const tokens = raw.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    const valid = tokens.filter((x): x is BagStatus => (BAG_STATUSES as readonly string[]).includes(x));
    if (valid.length === 0) return undefined;
    return valid;
}

async function recordCashEvent(
    tx: any,
    payload: {
        companyId: string;
        actorId: string;
        eventType: string;
        runId?: string | null;
        bagId?: string | null;
        branchId?: string | null;
        fromStatus?: BagStatus | null;
        toStatus?: BagStatus | null;
        amount?: number | null;
        notes?: string | null;
        metadata?: any;
    }
) {
    await (tx as any).cashCollectionEvent.create({
        data: {
            companyId: payload.companyId,
            actorId: payload.actorId,
            eventType: payload.eventType,
            runId: payload.runId || null,
            bagId: payload.bagId || null,
            branchId: payload.branchId || null,
            fromStatus: payload.fromStatus || null,
            toStatus: payload.toStatus || null,
            amount: payload.amount ?? null,
            notes: payload.notes || null,
            metadata: payload.metadata || null,
        },
    });
}

async function refreshRunStatus(tx: any, companyId: string, runId: string) {
    const bags = await (tx as any).cashCollectionBag.findMany({
        where: { companyId, runId },
        select: { status: true },
    });
    if (bags.length === 0) return;

    const closedStatuses = new Set<BagStatus>(['RECONCILED', 'SHORT', 'EXCESS', 'LOST', 'CANCELLED']);
    const allClosed = bags.every((b: any) => closedStatuses.has(String(b.status) as BagStatus));

    await (tx as any).cashCollectionRun.update({
        where: { id: runId },
        data: allClosed
            ? { status: 'CLOSED', completedAt: new Date() }
            : { status: 'IN_PROGRESS', startedAt: new Date() },
    });
}

async function getBagForMutation(tx: any, req: any, bagId: string) {
    const bag = await (tx as any).cashCollectionBag.findFirst({
        where: { id: bagId, companyId: req.user!.companyId },
        include: { run: { select: { id: true, runNo: true } }, branch: { select: { id: true, name: true, code: true } } },
    });
    if (!bag) throw AppError.notFound('Cash bag not found');
    if (!isBranchAdmin(req) && !req.user!.branchIds.includes(String(bag.branchId))) {
        throw AppError.forbidden('You do not have access to this branch cash bag');
    }
    return bag;
}

// GET /sales/cash/lookups
salesCashRoutes.get(
    '/lookups',
    requirePermission(PERMISSIONS.SALES_CASH_VIEW),
    async (req, res, next) => {
        try {
            const companyId = req.user!.companyId;
            const branchIds = await getAccessibleBranchIds(req);

            const [branches, users] = await Promise.all([
                prisma.branch.findMany({
                    where: { companyId, id: { in: branchIds } },
                    select: { id: true, name: true, code: true },
                    orderBy: { name: 'asc' },
                }),
                prisma.user.findMany({
                    where: {
                        companyId,
                        isActive: true,
                        branches: { some: { branchId: { in: branchIds } } },
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: { select: { name: true, permissions: true } },
                    },
                    orderBy: { name: 'asc' },
                }),
            ]);

            const collectors = users.filter((u: any) => {
                const perms: string[] = u.role?.permissions || [];
                return perms.includes(PERMISSIONS.SALES_CASH_PICKUP) || perms.includes(PERMISSIONS.SALES_CASH_VIEW) || perms.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES);
            });

            sendSuccess(res, { branches, collectors });
        } catch (error) {
            next(error);
        }
    }
);

// GET /sales/cash/dashboard
salesCashRoutes.get(
    '/dashboard',
    requirePermission(PERMISSIONS.SALES_CASH_VIEW),
    async (req, res, next) => {
        try {
            const companyId = req.user!.companyId;
            const branchIds = await getAccessibleBranchIds(req);
            const where: any = { companyId };
            if (!isBranchAdmin(req)) where.branchId = { in: branchIds };

            const today = new Date();
            const trendStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13, 0, 0, 0, 0);

            const [summaryAgg, byStatus, byBranchAgg, trendRows] = await Promise.all([
                (prisma as any).cashCollectionBag.aggregate({
                    where,
                    _sum: {
                        declaredAmount: true,
                        collectedAmount: true,
                        vaultAmount: true,
                        depositedAmount: true,
                        varianceAmount: true,
                    },
                    _count: { _all: true },
                }),
                (prisma as any).cashCollectionBag.groupBy({
                    by: ['status'],
                    where,
                    _count: { _all: true },
                    _sum: { declaredAmount: true },
                }),
                (prisma as any).cashCollectionBag.groupBy({
                    by: ['branchId'],
                    where,
                    _count: { _all: true },
                    _sum: { declaredAmount: true, depositedAmount: true },
                }),
                (prisma as any).cashCollectionBag.findMany({
                    where: { ...where, createdAt: { gte: trendStart } },
                    select: { createdAt: true, declaredAmount: true, depositedAmount: true },
                    orderBy: { createdAt: 'asc' },
                }),
            ]);

            const branchMap = new Map(
                (
                    await prisma.branch.findMany({
                        where: { companyId, id: { in: byBranchAgg.map((b: any) => String(b.branchId)) } },
                        select: { id: true, name: true, code: true },
                    })
                ).map((b) => [String(b.id), b])
            );

            const byBranch = byBranchAgg.map((row: any) => {
                const branch = branchMap.get(String(row.branchId));
                return {
                    branchId: row.branchId,
                    branchName: branch?.name || 'Unknown Branch',
                    branchCode: branch?.code || '-',
                    bags: Number(row._count?._all || 0),
                    declaredAmount: Number(row._sum?.declaredAmount || 0),
                    depositedAmount: Number(row._sum?.depositedAmount || 0),
                };
            }).sort((a: any, b: any) => b.declaredAmount - a.declaredAmount);

            const trendMap = new Map<string, { date: string; declared: number; deposited: number }>();
            for (let i = 13; i >= 0; i -= 1) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                trendMap.set(key, { date: key, declared: 0, deposited: 0 });
            }
            for (const row of trendRows as any[]) {
                const key = new Date(row.createdAt).toISOString().slice(0, 10);
                const item = trendMap.get(key);
                if (!item) continue;
                item.declared += Number(row.declaredAmount || 0);
                item.deposited += Number(row.depositedAmount || 0);
            }

            const pendingStatuses = new Set<BagStatus>(['DECLARED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'VAULT_RECEIVED', 'DEPOSITED']);
            const pendingAmount = byStatus
                .filter((s: any) => pendingStatuses.has(String(s.status) as BagStatus))
                .reduce((sum: number, s: any) => sum + Number(s._sum?.declaredAmount || 0), 0);

            sendSuccess(res, {
                summary: {
                    totalBags: Number(summaryAgg?._count?._all || 0),
                    declaredAmount: Number(summaryAgg?._sum?.declaredAmount || 0),
                    collectedAmount: Number(summaryAgg?._sum?.collectedAmount || 0),
                    vaultAmount: Number(summaryAgg?._sum?.vaultAmount || 0),
                    depositedAmount: Number(summaryAgg?._sum?.depositedAmount || 0),
                    varianceAmount: Number(summaryAgg?._sum?.varianceAmount || 0),
                    pendingAmount: Number(pendingAmount || 0),
                },
                byStatus: byStatus.map((s: any) => ({
                    status: s.status,
                    count: Number(s._count?._all || 0),
                    declaredAmount: Number(s._sum?.declaredAmount || 0),
                })),
                byBranch,
                trend: Array.from(trendMap.values()),
            });
        } catch (error) {
            next(error);
        }
    }
);

// GET /sales/cash/runs
salesCashRoutes.get(
    '/runs',
    requirePermission(PERMISSIONS.SALES_CASH_VIEW),
    async (req, res, next) => {
        try {
            const query = listRunsQuerySchema.parse(req.query);
            const { skip, take, page, limit } = getPaginationParams(query);
            const companyId = req.user!.companyId;
            const accessibleBranchIds = await getAccessibleBranchIds(req);

            const where: any = { companyId };
            if (query.status) where.status = query.status;
            if (query.collectorId) where.collectorId = query.collectorId;
            if (query.search?.trim()) {
                const search = query.search.trim();
                where.OR = [
                    { runNo: { contains: search, mode: 'insensitive' } },
                    { notes: { contains: search, mode: 'insensitive' } },
                ];
            }

            const start = asDateStart(query.startDate);
            const end = asDateEnd(query.endDate);
            if (start || end) {
                where.createdAt = {};
                if (start) where.createdAt.gte = start;
                if (end) where.createdAt.lte = end;
            }

            if (query.branchId) {
                if (!isBranchAdmin(req) && !accessibleBranchIds.includes(query.branchId)) {
                    throw AppError.forbidden('Branch is not accessible');
                }
                where.bags = { some: { branchId: query.branchId } };
            } else if (!isBranchAdmin(req)) {
                where.bags = { some: { branchId: { in: accessibleBranchIds } } };
            }

            const [rows, total] = await Promise.all([
                (prisma as any).cashCollectionRun.findMany({
                    where,
                    skip,
                    take,
                    include: {
                        collector: { select: { id: true, name: true, email: true } },
                        createdBy: { select: { id: true, name: true } },
                        bags: {
                            select: {
                                id: true,
                                declaredAmount: true,
                                status: true,
                                branch: { select: { id: true, name: true, code: true } },
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
                (prisma as any).cashCollectionRun.count({ where }),
            ]);

            const mapped = rows.map((r: any) => ({
                ...r,
                totalDeclared: (r.bags || []).reduce((sum: number, b: any) => sum + Number(b.declaredAmount || 0), 0),
                totalBags: (r.bags || []).length,
            }));

            sendPaginated(res, mapped, total, page, limit);
        } catch (error) {
            next(error);
        }
    }
);

// POST /sales/cash/runs
salesCashRoutes.post(
    '/runs',
    requirePermission(PERMISSIONS.SALES_CASH_RUN_CREATE),
    validate({ body: createRunSchema }),
    async (req, res, next) => {
        try {
            const companyId = req.user!.companyId;
            const actorId = req.user!.id;
            const body = req.body as z.infer<typeof createRunSchema>;
            const accessibleBranchIds = await getAccessibleBranchIds(req);

            const uniqueBranches = Array.from(new Set(body.bags.map((b) => b.branchId)));
            const blocked = uniqueBranches.find((id) => !accessibleBranchIds.includes(id));
            if (blocked) throw AppError.forbidden('One or more selected branches are not accessible');

            if (body.collectorId) {
                const collector = await prisma.user.findFirst({
                    where: { id: body.collectorId, companyId, isActive: true },
                    select: { id: true },
                });
                if (!collector) throw AppError.badRequest('Collector user is invalid');
            }

            const created = await prisma.$transaction(async (tx) => {
                const runNo = formatDocNo('CRN', await nextCounter(tx as any, companyId, 'CASH_COLLECTION_RUN'));
                const run = await (tx as any).cashCollectionRun.create({
                    data: {
                        companyId,
                        runNo,
                        status: 'IN_PROGRESS',
                        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
                        startedAt: new Date(),
                        collectorId: body.collectorId || null,
                        notes: body.notes || null,
                        createdById: actorId,
                    },
                });

                for (const bag of body.bags) {
                    const bagCode = bag.bagCode?.trim()
                        ? bag.bagCode.trim()
                        : formatDocNo('CBG', await nextCounter(tx as any, companyId, 'CASH_COLLECTION_BAG'));

                    const createdBag = await (tx as any).cashCollectionBag.create({
                        data: {
                            companyId,
                            runId: run.id,
                            branchId: bag.branchId,
                            bagCode,
                            sourceShiftId: bag.sourceShiftId || null,
                            declaredAmount: Number(bag.declaredAmount || 0),
                            status: 'PICKUP_ASSIGNED',
                            notes: bag.notes || null,
                            createdById: actorId,
                        },
                    });

                    await recordCashEvent(tx, {
                        companyId,
                        actorId,
                        eventType: 'BAG_DECLARED',
                        runId: run.id,
                        bagId: createdBag.id,
                        branchId: bag.branchId,
                        toStatus: 'PICKUP_ASSIGNED',
                        amount: Number(bag.declaredAmount || 0),
                        notes: bag.notes || null,
                    });
                }

                await recordCashEvent(tx, {
                    companyId,
                    actorId,
                    eventType: 'RUN_CREATED',
                    runId: run.id,
                    notes: body.notes || null,
                    metadata: {
                        bagCount: body.bags.length,
                        collectorId: body.collectorId || null,
                    },
                });

                return (tx as any).cashCollectionRun.findFirst({
                    where: { id: run.id },
                    include: {
                        collector: { select: { id: true, name: true, email: true } },
                        createdBy: { select: { id: true, name: true } },
                        bags: {
                            include: {
                                branch: { select: { id: true, name: true, code: true } },
                            },
                            orderBy: { createdAt: 'asc' },
                        },
                    },
                });
            });

            sendSuccess(res, created, { message: 'Cash collection run created' }, 201);
        } catch (error) {
            next(error);
        }
    }
);

// GET /sales/cash/runs/:id
salesCashRoutes.get(
    '/runs/:id',
    requirePermission(PERMISSIONS.SALES_CASH_VIEW),
    async (req, res, next) => {
        try {
            const companyId = req.user!.companyId;
            const run = await (prisma as any).cashCollectionRun.findFirst({
                where: { id: req.params.id, companyId },
                include: {
                    collector: { select: { id: true, name: true, email: true } },
                    createdBy: { select: { id: true, name: true } },
                    bags: {
                        include: {
                            branch: { select: { id: true, name: true, code: true } },
                            deposit: true,
                        },
                        orderBy: { createdAt: 'asc' },
                    },
                    events: {
                        include: { actor: { select: { id: true, name: true, email: true } } },
                        orderBy: { createdAt: 'desc' },
                        take: 50,
                    },
                },
            });
            if (!run) throw AppError.notFound('Cash run not found');
            if (!isBranchAdmin(req)) {
                const hasAccess = (run.bags || []).some((b: any) => req.user!.branchIds.includes(String(b.branchId)));
                if (!hasAccess) throw AppError.forbidden('You do not have access to this run');
            }
            sendSuccess(res, run);
        } catch (error) {
            next(error);
        }
    }
);

// GET /sales/cash/bags
salesCashRoutes.get(
    '/bags',
    requirePermission(PERMISSIONS.SALES_CASH_VIEW),
    async (req, res, next) => {
        try {
            const query = listBagsQuerySchema.parse(req.query);
            const { skip, take, page, limit } = getPaginationParams(query);
            const companyId = req.user!.companyId;
            const accessibleBranchIds = await getAccessibleBranchIds(req);

            const where: any = { companyId };
            if (query.runId) where.runId = query.runId;

            const statuses = parseStatusList(query.status);
            if (statuses && statuses.length > 0) where.status = { in: statuses };

            if (query.branchId) {
                if (!isBranchAdmin(req) && !accessibleBranchIds.includes(query.branchId)) {
                    throw AppError.forbidden('Branch is not accessible');
                }
                where.branchId = query.branchId;
            } else if (!isBranchAdmin(req)) {
                where.branchId = { in: accessibleBranchIds };
            }

            const start = asDateStart(query.startDate);
            const end = asDateEnd(query.endDate);
            if (start || end) {
                where.createdAt = {};
                if (start) where.createdAt.gte = start;
                if (end) where.createdAt.lte = end;
            }

            if (query.search?.trim()) {
                const search = query.search.trim();
                where.OR = [
                    { bagCode: { contains: search, mode: 'insensitive' } },
                    { notes: { contains: search, mode: 'insensitive' } },
                    { run: { is: { runNo: { contains: search, mode: 'insensitive' } } } },
                ];
            }

            const [rows, total] = await Promise.all([
                (prisma as any).cashCollectionBag.findMany({
                    where,
                    skip,
                    take,
                    include: {
                        run: { select: { id: true, runNo: true, status: true } },
                        branch: { select: { id: true, name: true, code: true } },
                        deposit: true,
                    },
                    orderBy: { createdAt: 'desc' },
                }),
                (prisma as any).cashCollectionBag.count({ where }),
            ]);

            sendPaginated(res, rows, total, page, limit);
        } catch (error) {
            next(error);
        }
    }
);

// POST /sales/cash/bags/:id/pickup
salesCashRoutes.post(
    '/bags/:id/pickup',
    requirePermission(PERMISSIONS.SALES_CASH_PICKUP),
    validate({ body: pickupSchema }),
    async (req, res, next) => {
        try {
            const body = req.body as z.infer<typeof pickupSchema>;
            const companyId = req.user!.companyId;
            const actorId = req.user!.id;

            const updated = await prisma.$transaction(async (tx) => {
                const bag = await getBagForMutation(tx, req, String(req.params.id));
                if (!['DECLARED', 'PICKUP_ASSIGNED'].includes(String(bag.status))) {
                    throw AppError.badRequest(`Cannot pickup bag in ${bag.status} status`);
                }

                const nextStatus: BagStatus = body.inTransit ? 'IN_TRANSIT' : 'PICKED_UP';
                const collectedAmount = Number(body.collectedAmount ?? bag.declaredAmount ?? 0);
                const pickedAt = body.pickedAt ? new Date(body.pickedAt) : new Date();

                const row = await (tx as any).cashCollectionBag.update({
                    where: { id: bag.id },
                    data: {
                        status: nextStatus,
                        collectedAmount,
                        pickedAt,
                        pickedById: actorId,
                        notes: body.notes ?? bag.notes,
                    },
                    include: {
                        run: { select: { id: true, runNo: true, status: true } },
                        branch: { select: { id: true, name: true, code: true } },
                    },
                });

                await recordCashEvent(tx, {
                    companyId,
                    actorId,
                    eventType: 'BAG_PICKED_UP',
                    runId: bag.runId,
                    bagId: bag.id,
                    branchId: bag.branchId,
                    fromStatus: String(bag.status) as BagStatus,
                    toStatus: nextStatus,
                    amount: collectedAmount,
                    notes: body.notes || null,
                });

                await refreshRunStatus(tx, companyId, String(bag.runId));
                return row;
            });

            sendSuccess(res, updated, { message: 'Cash bag marked as picked up' });
        } catch (error) {
            next(error);
        }
    }
);

// POST /sales/cash/bags/:id/vault-receive
salesCashRoutes.post(
    '/bags/:id/vault-receive',
    requirePermission(PERMISSIONS.SALES_CASH_VAULT),
    validate({ body: vaultReceiveSchema }),
    async (req, res, next) => {
        try {
            const body = req.body as z.infer<typeof vaultReceiveSchema>;
            const companyId = req.user!.companyId;
            const actorId = req.user!.id;

            const updated = await prisma.$transaction(async (tx) => {
                const bag = await getBagForMutation(tx, req, String(req.params.id));
                if (!['PICKED_UP', 'IN_TRANSIT', 'PICKUP_ASSIGNED'].includes(String(bag.status))) {
                    throw AppError.badRequest(`Cannot receive bag in vault from ${bag.status} status`);
                }

                const vaultAmount = Number(body.vaultAmount || 0);
                const row = await (tx as any).cashCollectionBag.update({
                    where: { id: bag.id },
                    data: {
                        status: 'VAULT_RECEIVED',
                        vaultAmount,
                        vaultReceivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
                        vaultReceivedById: actorId,
                        notes: body.notes ?? bag.notes,
                    },
                    include: {
                        run: { select: { id: true, runNo: true, status: true } },
                        branch: { select: { id: true, name: true, code: true } },
                    },
                });

                await recordCashEvent(tx, {
                    companyId,
                    actorId,
                    eventType: 'BAG_VAULT_RECEIVED',
                    runId: bag.runId,
                    bagId: bag.id,
                    branchId: bag.branchId,
                    fromStatus: String(bag.status) as BagStatus,
                    toStatus: 'VAULT_RECEIVED',
                    amount: vaultAmount,
                    notes: body.notes || null,
                });

                await refreshRunStatus(tx, companyId, String(bag.runId));
                return row;
            });

            sendSuccess(res, updated, { message: 'Cash bag received in vault' });
        } catch (error) {
            next(error);
        }
    }
);

// POST /sales/cash/bags/:id/deposit
salesCashRoutes.post(
    '/bags/:id/deposit',
    requirePermission(PERMISSIONS.SALES_CASH_DEPOSIT),
    validate({ body: depositSchema }),
    async (req, res, next) => {
        try {
            const body = req.body as z.infer<typeof depositSchema>;
            const companyId = req.user!.companyId;
            const actorId = req.user!.id;

            const updated = await prisma.$transaction(async (tx) => {
                const bag = await getBagForMutation(tx, req, String(req.params.id));
                if (!['VAULT_RECEIVED', 'SHORT', 'EXCESS'].includes(String(bag.status))) {
                    throw AppError.badRequest(`Cannot deposit bag in ${bag.status} status`);
                }

                const amount = Number((body.amount ?? bag.vaultAmount ?? bag.collectedAmount ?? bag.declaredAmount) || 0);
                const depositDate = body.depositDate ? new Date(body.depositDate) : new Date();
                const depositNo = formatDocNo('CBD', await nextCounter(tx as any, companyId, 'CASH_BANK_DEPOSIT'));

                await (tx as any).cashBankDeposit.create({
                    data: {
                        companyId,
                        bagId: bag.id,
                        depositNo,
                        bankAccount: body.bankAccount,
                        depositSlipNo: body.depositSlipNo,
                        amount,
                        depositDate,
                        notes: body.notes || null,
                        createdById: actorId,
                    },
                });

                const row = await (tx as any).cashCollectionBag.update({
                    where: { id: bag.id },
                    data: {
                        status: 'DEPOSITED',
                        depositedAmount: amount,
                        depositedAt: depositDate,
                        depositedById: actorId,
                        notes: body.notes ?? bag.notes,
                    },
                    include: {
                        run: { select: { id: true, runNo: true, status: true } },
                        branch: { select: { id: true, name: true, code: true } },
                        deposit: true,
                    },
                });

                await recordCashEvent(tx, {
                    companyId,
                    actorId,
                    eventType: 'BAG_DEPOSITED',
                    runId: bag.runId,
                    bagId: bag.id,
                    branchId: bag.branchId,
                    fromStatus: String(bag.status) as BagStatus,
                    toStatus: 'DEPOSITED',
                    amount,
                    notes: body.notes || null,
                    metadata: {
                        bankAccount: body.bankAccount,
                        depositSlipNo: body.depositSlipNo,
                        depositNo,
                    },
                });

                await refreshRunStatus(tx, companyId, String(bag.runId));
                return row;
            });

            sendSuccess(res, updated, { message: 'Cash bag deposited to bank' });
        } catch (error) {
            next(error);
        }
    }
);

// POST /sales/cash/bags/:id/reconcile
salesCashRoutes.post(
    '/bags/:id/reconcile',
    requirePermission(PERMISSIONS.SALES_CASH_RECONCILE),
    validate({ body: reconcileSchema }),
    async (req, res, next) => {
        try {
            const body = req.body as z.infer<typeof reconcileSchema>;
            const companyId = req.user!.companyId;
            const actorId = req.user!.id;

            const updated = await prisma.$transaction(async (tx) => {
                const bag = await getBagForMutation(tx, req, String(req.params.id));
                if (!['DEPOSITED'].includes(String(bag.status))) {
                    throw AppError.badRequest(`Cannot reconcile bag in ${bag.status} status`);
                }

                const baseline = Number((bag.vaultAmount ?? bag.collectedAmount ?? bag.declaredAmount) || 0);
                const reconciledAmount = Number((body.reconciledAmount ?? bag.depositedAmount ?? baseline) || 0);
                const varianceAmount = Number((reconciledAmount - baseline).toFixed(2));

                let status: BagStatus = 'RECONCILED';
                if (body.forceStatus) {
                    status = body.forceStatus;
                } else if (varianceAmount > 0) {
                    status = 'EXCESS';
                } else if (varianceAmount < 0) {
                    status = 'SHORT';
                }

                const row = await (tx as any).cashCollectionBag.update({
                    where: { id: bag.id },
                    data: {
                        status,
                        varianceAmount,
                        reconciledAt: new Date(),
                        reconciledById: actorId,
                        notes: body.notes ?? bag.notes,
                    },
                    include: {
                        run: { select: { id: true, runNo: true, status: true } },
                        branch: { select: { id: true, name: true, code: true } },
                        deposit: true,
                    },
                });

                await recordCashEvent(tx, {
                    companyId,
                    actorId,
                    eventType: 'BAG_RECONCILED',
                    runId: bag.runId,
                    bagId: bag.id,
                    branchId: bag.branchId,
                    fromStatus: 'DEPOSITED',
                    toStatus: status,
                    amount: reconciledAmount,
                    notes: body.notes || null,
                    metadata: { baseline, reconciledAmount, varianceAmount },
                });

                await refreshRunStatus(tx, companyId, String(bag.runId));
                return row;
            });

            sendSuccess(res, updated, { message: 'Cash bag reconciled' });
        } catch (error) {
            next(error);
        }
    }
);

// GET /sales/cash/deposits
salesCashRoutes.get(
    '/deposits',
    requirePermission(PERMISSIONS.SALES_CASH_VIEW),
    async (req, res, next) => {
        try {
            const query = listDepositsQuerySchema.parse(req.query);
            const { skip, take, page, limit } = getPaginationParams(query);
            const companyId = req.user!.companyId;
            const accessibleBranchIds = await getAccessibleBranchIds(req);

            const where: any = { companyId };
            if (query.search?.trim()) {
                const search = query.search.trim();
                where.OR = [
                    { depositNo: { contains: search, mode: 'insensitive' } },
                    { depositSlipNo: { contains: search, mode: 'insensitive' } },
                    { bankAccount: { contains: search, mode: 'insensitive' } },
                ];
            }

            const start = asDateStart(query.startDate);
            const end = asDateEnd(query.endDate);
            if (start || end) {
                where.depositDate = {};
                if (start) where.depositDate.gte = start;
                if (end) where.depositDate.lte = end;
            }

            if (query.runId) {
                where.bag = { is: { runId: query.runId } };
            }

            if (query.branchId) {
                if (!isBranchAdmin(req) && !accessibleBranchIds.includes(query.branchId)) {
                    throw AppError.forbidden('Branch is not accessible');
                }
                where.bag = { ...(where.bag || {}), is: { ...(where.bag?.is || {}), branchId: query.branchId } };
            } else if (!isBranchAdmin(req)) {
                where.bag = { ...(where.bag || {}), is: { ...(where.bag?.is || {}), branchId: { in: accessibleBranchIds } } };
            }

            const [rows, total, agg] = await Promise.all([
                (prisma as any).cashBankDeposit.findMany({
                    where,
                    skip,
                    take,
                    include: {
                        createdBy: { select: { id: true, name: true, email: true } },
                        bag: {
                            select: {
                                id: true,
                                bagCode: true,
                                run: { select: { id: true, runNo: true } },
                                branch: { select: { id: true, name: true, code: true } },
                            },
                        },
                    },
                    orderBy: { depositDate: 'desc' },
                }),
                (prisma as any).cashBankDeposit.count({ where }),
                (prisma as any).cashBankDeposit.aggregate({
                    where,
                    _sum: { amount: true },
                }),
            ]);

            sendSuccess(res, rows, {
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
                summary: {
                    totalAmount: Number(agg?._sum?.amount || 0),
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

// GET /sales/cash/audit
salesCashRoutes.get(
    '/audit',
    requirePermission(PERMISSIONS.SALES_CASH_AUDIT),
    async (req, res, next) => {
        try {
            const query = listAuditQuerySchema.parse(req.query);
            const { skip, take, page, limit } = getPaginationParams(query);
            const companyId = req.user!.companyId;
            const accessibleBranchIds = await getAccessibleBranchIds(req);

            const where: any = { companyId };
            if (query.runId) where.runId = query.runId;
            if (query.bagId) where.bagId = query.bagId;
            if (query.eventType?.trim()) where.eventType = query.eventType.trim();

            if (query.branchId) {
                if (!isBranchAdmin(req) && !accessibleBranchIds.includes(query.branchId)) {
                    throw AppError.forbidden('Branch is not accessible');
                }
                where.branchId = query.branchId;
            } else if (!isBranchAdmin(req)) {
                where.OR = [
                    { branchId: null },
                    { branchId: { in: accessibleBranchIds } },
                ];
            }

            const start = asDateStart(query.startDate);
            const end = asDateEnd(query.endDate);
            if (start || end) {
                where.createdAt = {};
                if (start) where.createdAt.gte = start;
                if (end) where.createdAt.lte = end;
            }

            if (query.search?.trim()) {
                const search = query.search.trim();
                where.notes = { contains: search, mode: 'insensitive' };
            }

            const [rows, total] = await Promise.all([
                (prisma as any).cashCollectionEvent.findMany({
                    where,
                    skip,
                    take,
                    include: {
                        actor: { select: { id: true, name: true, email: true } },
                        branch: { select: { id: true, name: true, code: true } },
                        run: { select: { id: true, runNo: true } },
                        bag: { select: { id: true, bagCode: true, status: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
                (prisma as any).cashCollectionEvent.count({ where }),
            ]);

            sendPaginated(res, rows, total, page, limit);
        } catch (error) {
            next(error);
        }
    }
);

// GET /sales/cash/branch-pending (active branch snapshot)
salesCashRoutes.get(
    '/branch-pending',
    requirePermission(PERMISSIONS.SALES_CASH_VIEW),
    requireBranch,
    async (req, res, next) => {
        try {
            const where = {
                companyId: req.user!.companyId,
                branchId: req.activeBranchId!,
                status: { in: ['DECLARED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'VAULT_RECEIVED', 'DEPOSITED'] },
            };
            const [rows, agg] = await Promise.all([
                (prisma as any).cashCollectionBag.findMany({
                    where,
                    include: {
                        run: { select: { id: true, runNo: true, status: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                }),
                (prisma as any).cashCollectionBag.aggregate({
                    where,
                    _sum: { declaredAmount: true },
                    _count: { _all: true },
                }),
            ]);

            sendSuccess(res, {
                pendingBags: rows,
                summary: {
                    count: Number(agg?._count?._all || 0),
                    declaredAmount: Number(agg?._sum?.declaredAmount || 0),
                },
            });
        } catch (error) {
            next(error);
        }
    }
);
