import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { authenticate } from '../../middleware/auth.js';
import { requireSuperAdmin, requireSuperAdminPermission, resolveSuperAdminAccess } from '../../middleware/superAdmin.js';
import { basePrisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { DEFAULT_SYSTEM_ROLES } from '../../config/permissions.js';
import { AuthService } from '../auth/auth.service.js';
import { SUPER_ADMIN_PERMISSIONS } from './super-admin.permissions.js';
import {
    type FeatureFlags,
    type SuperAdminSettings,
    type TenantBilling,
    type TenantLimitEnforcementMeta,
    type TenantLimits,
    type TenantMaintenance,
    type TenantPlan,
    type TenantStatusMeta,
    type TenantStatus,
    DEFAULT_FEATURE_FLAGS,
    getSuperAdminSettings,
    resolveFeatureFlags,
    resolveTenantBilling,
    resolveTenantLimitEnforcementMeta,
    resolveTenantLimits,
    resolveTenantMaintenance,
    resolveTenantStatusMeta,
    sanitizeTenantPlan,
    sanitizeTenantStatus,
} from './super-admin.settings.js';
import {
    type TenantHealthStatus,
    TENANT_LIMIT_GRACE_DAYS,
    buildTenantHealthSummary,
    buildTenantLimitSnapshot,
    buildTenantModuleUsage,
    getTenantUsageCounts,
    mergeCompanySuperAdminSettings,
    syncTenantLimitEnforcement,
} from './tenant-intelligence.js';

export const superAdminRoutes = Router();

superAdminRoutes.use(authenticate, requireSuperAdmin);

const statusSchema = z.object({
    status: z.enum(['Active', 'Suspended']),
    reason: z.string().trim().max(200).optional(),
}).superRefine((value, ctx) => {
    if (value.status === 'Suspended' && !value.reason?.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reason'],
            message: 'Suspension reason is required',
        });
    }
});

const featureSchema = z.object({
    featureFlags: z.object({
        crm: z.boolean(),
        inventory: z.boolean(),
        purchases: z.boolean(),
        accounting: z.boolean(),
        pos: z.boolean(),
        reports: z.boolean(),
        bom: z.boolean(),
        production: z.boolean(),
    }),
});

const broadcastSchema = z.object({
    title: z.string().min(3).max(120),
    message: z.string().min(5).max(1000),
    level: z.enum(['info', 'warning', 'critical']).default('info'),
    expiresAt: z
        .string()
        .optional()
        .refine((value) => value === undefined || value.trim() === '' || !Number.isNaN(new Date(value).getTime()), {
            message: 'expiresAt must be a valid date string',
        }),
});

const announcementUpdateSchema = z.object({
    title: z.string().min(3).max(120).optional(),
    message: z.string().min(5).max(1000).optional(),
    level: z.enum(['info', 'warning', 'critical']).optional(),
    expiresAt: z
        .union([z.string(), z.null()])
        .optional()
        .refine((value) => value === undefined || value === null || value.trim() === '' || !Number.isNaN(new Date(value).getTime()), {
            message: 'expiresAt must be a valid date string',
        }),
    isActive: z.boolean().optional(),
});

const planSchema = z.object({
    plan: z.enum(['Starter', 'Growth', 'SOLVANTA']),
    monthlyRevenue: z.number().min(0).max(1_000_000).optional(),
    failedPayments: z.number().int().min(0).max(100_000).optional(),
    nextBillingDate: z
        .string()
        .optional()
        .refine((value) => value === undefined || value.trim() === '' || !Number.isNaN(new Date(value).getTime()), {
            message: 'nextBillingDate must be a valid date string',
        }),
});

const limitsSchema = z.object({
    maxUsers: z.number().int().min(1).max(500_000).nullable().optional(),
    maxBranches: z.number().int().min(1).max(50_000).nullable().optional(),
    maxProducts: z.number().int().min(1).max(10_000_000).nullable().optional(),
});

const bulkStatusSchema = z.object({
    tenantIds: z.array(z.string().min(1)).min(1).max(200),
    status: z.enum(['Active', 'Suspended']),
    reason: z.string().trim().max(200).optional(),
}).superRefine((value, ctx) => {
    if (value.status === 'Suspended' && !value.reason?.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reason'],
            message: 'Suspension reason is required',
        });
    }
});

const bulkFeatureSchema = z.object({
    tenantIds: z.array(z.string().min(1)).min(1).max(200),
    featureFlags: featureSchema.shape.featureFlags,
});

const maintenanceSchema = z.object({
    enabled: z.boolean(),
    message: z.string().max(300).optional(),
});

const userPasswordSchema = z.object({
    password: z.string().min(6).max(100),
});

const userStatusSchema = z.object({
    isActive: z.boolean(),
    reason: z.string().max(200).optional(),
});

const impersonationSchema = z.object({
    reason: z.string().trim().min(6).max(300),
    ticket: z.string().trim().max(60).optional(),
});

const createTenantSchema = z.object({
    company: z.object({
        name: z.string().trim().min(2).max(120),
        currency: z.string().trim().min(3).max(10),
        vatNumber: z.string().trim().max(60).optional(),
        logoUrl: z.string().url().optional(),
        contactPhone: z.string().trim().max(40).optional(),
        contactEmail: z.string().trim().email().optional(),
        contactWebsite: z.string().trim().max(200).optional(),
        contactAddress: z.string().trim().max(500).optional(),
        timezone: z.string().trim().max(80).optional(),
        dateFormat: z.string().trim().max(30).optional(),
        timeFormat: z.enum(['12H', '24H']).optional(),
        language: z.string().trim().max(20).optional(),
    }),
    adminUser: z.object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email(),
        password: z.string().min(8).max(100),
        phone: z.string().trim().max(40).optional(),
    }),
    headOffice: z.object({
        name: z.string().trim().min(2).max(100).default('Head Office'),
        code: z.string().trim().min(1).max(20).default('HQ'),
        address: z.string().trim().max(300).optional(),
        phone: z.string().trim().max(40).optional(),
    }).optional(),
    plan: z.enum(['Starter', 'Growth', 'SOLVANTA']).optional(),
    featureFlags: z.object({
        crm: z.boolean(),
        inventory: z.boolean(),
        purchases: z.boolean(),
        accounting: z.boolean(),
        pos: z.boolean(),
        reports: z.boolean(),
        bom: z.boolean(),
        production: z.boolean(),
    }).optional(),
});

function diffInDays(from: Date, to: Date) {
    const ms = to.getTime() - from.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function inferTenantStatus(createdAt: Date, activeUserCount: number): TenantStatus {
    if (activeUserCount === 0) return 'Suspended';
    if (diffInDays(createdAt, new Date()) <= 14) return 'Trial';
    return 'Active';
}

function inferTenantPlan(totalUsers: number): TenantPlan {
    if (totalUsers >= 50) return 'SOLVANTA';
    if (totalUsers >= 10) return 'Growth';
    return 'Starter';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toIsoDateOrEmpty(raw: string | undefined) {
    if (!raw || !raw.trim()) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
}

function extractSupportSessionMeta(payload: unknown) {
    if (!isRecord(payload)) return null;

    const directSessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
    if (directSessionId) {
        return {
            sessionId: directSessionId,
            actorEmail: typeof payload.actorEmail === 'string' ? payload.actorEmail : '',
            actorName: typeof payload.actorName === 'string' ? payload.actorName : '',
            startedAt: typeof payload.startedAt === 'string' ? payload.startedAt : '',
        };
    }

    const nested = isRecord(payload.__supportSession) ? payload.__supportSession : null;
    if (!nested) return null;

    return {
        sessionId: typeof nested.sessionId === 'string' ? nested.sessionId.trim() : '',
        actorEmail: typeof nested.actorEmail === 'string' ? nested.actorEmail : '',
        actorName: typeof nested.actorName === 'string' ? nested.actorName : '',
        startedAt: typeof nested.startedAt === 'string' ? nested.startedAt : '',
    };
}

type AnnouncementLevel = 'info' | 'warning' | 'critical';
type AnnouncementAudience = 'all-tenants' | 'single-tenant';

interface AnnouncementMeta {
    level: AnnouncementLevel;
    createdBy: string;
    createdAt: string;
    updatedBy?: string;
    updatedAt?: string;
    broadcastId: string;
    audience: AnnouncementAudience;
    expiresAt: string;
    targetCompanyId: string;
}

interface AnnouncementRow {
    id: string;
    companyId: string;
    value: string;
    description: string | null;
    metadata: unknown;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    companyName: string;
}

function parseAnnouncementMetadata(metadata: unknown, fallback: { companyId: string; createdAt: Date; rowId: string }): AnnouncementMeta {
    const raw = isRecord(metadata) ? metadata : {};
    const rawLevel = raw.level;
    const rawAudience = raw.audience;

    const level: AnnouncementLevel =
        rawLevel === 'critical' ? 'critical' : rawLevel === 'warning' ? 'warning' : 'info';
    const audience: AnnouncementAudience = rawAudience === 'single-tenant' ? 'single-tenant' : 'all-tenants';
    const createdBy = typeof raw.createdBy === 'string' ? raw.createdBy : 'super-admin';
    const createdAt = toIsoDateOrEmpty(typeof raw.createdAt === 'string' ? raw.createdAt : '') || fallback.createdAt.toISOString();
    const updatedBy = typeof raw.updatedBy === 'string' ? raw.updatedBy : undefined;
    const updatedAt = toIsoDateOrEmpty(typeof raw.updatedAt === 'string' ? raw.updatedAt : '') || undefined;
    const expiresAt = toIsoDateOrEmpty(typeof raw.expiresAt === 'string' ? raw.expiresAt : '');
    const broadcastId = typeof raw.broadcastId === 'string' && raw.broadcastId.trim() ? raw.broadcastId.trim() : fallback.rowId;
    const targetCompanyId = typeof raw.targetCompanyId === 'string' && raw.targetCompanyId.trim()
        ? raw.targetCompanyId.trim()
        : audience === 'single-tenant'
            ? fallback.companyId
            : '';

    return {
        level,
        createdBy,
        createdAt,
        updatedBy,
        updatedAt,
        broadcastId,
        audience,
        expiresAt,
        targetCompanyId,
    };
}

function isAnnouncementExpired(expiresAt: string) {
    if (!expiresAt) return false;
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() <= Date.now();
}

function buildTenantCompanySettings(payload: z.infer<typeof createTenantSchema>) {
    return {
        setupCompleted: false,
        contact: {
            phone: payload.company.contactPhone || '',
            email: payload.company.contactEmail || '',
            website: payload.company.contactWebsite || '',
            address: payload.company.contactAddress || '',
        },
        regional: {
            timezone: payload.company.timezone || 'UTC',
            dateFormat: payload.company.dateFormat || 'YYYY-MM-DD',
            timeFormat: payload.company.timeFormat || '24H',
            language: payload.company.language || 'en',
        },
        tax: {
            label: 'VAT',
            defaultRate: 0.15,
            inclusivePricing: false,
        },
        inventory: {
            lowStockThreshold: 10,
        },
        documents: {
            invoicePrefix: 'INV',
            quotationPrefix: 'QUO',
            salesOrderPrefix: 'SO',
        },
        superAdmin: {
            status: 'Active',
            statusReason: '',
            statusMeta: {
                changedAt: '',
                changedBy: '',
                suspendedUserIds: [],
            },
            featureFlags: payload.featureFlags || DEFAULT_FEATURE_FLAGS,
            planOverride: payload.plan,
            billing: {
                monthlyRevenue: 0,
                failedPayments: 0,
                nextBillingDate: '',
            },
            limits: {
                maxUsers: null,
                maxBranches: null,
                maxProducts: null,
            },
            maintenance: {
                enabled: false,
                message: '',
            },
        },
    };
}

async function writeAudit(
    companyId: any,
    userId: any,
    action: any,
    entity: any,
    entityId?: any,
    after?: any,
    options?: {
        before?: any;
        request?: Request;
    },
) {
    await basePrisma.auditLog.create({
        data: {
            companyId,
            userId,
            action,
            entity,
            entityId,
            before: (options?.before || undefined) as any,
            after: (after || undefined) as any,
            ipAddress: options?.request?.ip || options?.request?.socket?.remoteAddress || null,
            userAgent: options?.request?.get('user-agent') || null,
        },
    });
}

async function getTenantCompanyOrThrow(companyId: string) {
    const company = await basePrisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, settings: true },
    });

    if (!company) throw AppError.notFound('Company');
    return company;
}

async function buildTenantSnapshots() {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [companies, users, branches, products, auditEvents] = await Promise.all([
        basePrisma.company.findMany({
            select: {
                id: true,
                name: true,
                createdAt: true,
                updatedAt: true,
                currency: true,
                settings: true,
            },
            orderBy: { createdAt: 'desc' },
        }),
        basePrisma.user.findMany({
            select: {
                companyId: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
            },
        }),
        basePrisma.branch.findMany({
            select: { companyId: true },
        }),
        basePrisma.product.findMany({
            where: { deletedAt: { isSet: false } },
            select: { companyId: true },
        }),
        basePrisma.auditLog.findMany({
            where: { createdAt: { gte: since30d } },
            select: {
                companyId: true,
                userId: true,
                entity: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        }),
    ]);

    const usersByCompany = new Map<string, { total: number; active: number; lastActivityAt: Date | null }>();
    for (const user of users) {
        const current = usersByCompany.get(user.companyId) ?? { total: 0, active: 0, lastActivityAt: null };
        const candidateLastActivity = user.lastLoginAt ?? user.createdAt;

        current.total += 1;
        if (user.isActive) current.active += 1;
        if (!current.lastActivityAt || candidateLastActivity > current.lastActivityAt) {
            current.lastActivityAt = candidateLastActivity;
        }

        usersByCompany.set(user.companyId, current);
    }

    const branchCounts = new Map<string, number>();
    for (const branch of branches) {
        branchCounts.set(branch.companyId, (branchCounts.get(branch.companyId) || 0) + 1);
    }

    const productCounts = new Map<string, number>();
    for (const product of products) {
        productCounts.set(product.companyId, (productCounts.get(product.companyId) || 0) + 1);
    }

    const auditEventsByCompany = new Map<string, Array<{ userId: string; entity: string; createdAt: Date }>>();
    for (const event of auditEvents) {
        const current = auditEventsByCompany.get(event.companyId) ?? [];
        current.push({
            userId: event.userId,
            entity: event.entity,
            createdAt: event.createdAt,
        });
        auditEventsByCompany.set(event.companyId, current);
    }

    return companies.map((company) => {
        const usage = usersByCompany.get(company.id) ?? { total: 0, active: 0, lastActivityAt: null };
        const systemSettings = getSuperAdminSettings(company.settings);
        const inferredStatus = inferTenantStatus(company.createdAt, usage.active);
        const status = sanitizeTenantStatus(systemSettings.status) ?? inferredStatus;
        const plan = sanitizeTenantPlan(systemSettings.planOverride) ?? inferTenantPlan(usage.total);
        const billing = resolveTenantBilling(systemSettings.billing);
        const limits = resolveTenantLimits(systemSettings.limits);
        const maintenance = resolveTenantMaintenance(systemSettings.maintenance);
        const statusMeta = resolveTenantStatusMeta(systemSettings.statusMeta);
        const limitEnforcement = resolveTenantLimitEnforcementMeta(systemSettings.limitEnforcement);

        const totalBranches = branchCounts.get(company.id) || 0;
        const totalProducts = productCounts.get(company.id) || 0;
        const limitSnapshot = buildTenantLimitSnapshot(
            { users: usage.total, branches: totalBranches, products: totalProducts },
            limits,
            limitEnforcement,
        );
        const { usage: moduleUsage, summary: moduleUsageSummary } = buildTenantModuleUsage(
            resolveFeatureFlags(systemSettings.featureFlags),
            usage.active,
            auditEventsByCompany.get(company.id) ?? [],
        );
        const health = buildTenantHealthSummary({
            status,
            activeUsers: usage.active,
            totalUsers: usage.total,
            failedPayments: billing.failedPayments,
            lastActivityAt: usage.lastActivityAt ?? company.updatedAt,
            limitSnapshot,
            moduleSummary: moduleUsageSummary,
        });
        const trialEndsAt = new Date(company.createdAt);
        trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + 14);
        const daysToTrialEnd = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const paymentStatus = billing.failedPayments >= 3 ? 'Overdue' : billing.failedPayments > 0 ? 'At Risk' : 'Current';

        return {
            id: company.id,
            name: company.name,
            currency: company.currency,
            plan,
            status,
            statusReason: systemSettings.statusReason || '',
            statusChangedAt: statusMeta.changedAt,
            statusChangedBy: statusMeta.changedBy,
            suspendedUserCount: statusMeta.suspendedUserIds.length,
            featureFlags: resolveFeatureFlags(systemSettings.featureFlags),
            monthlyRevenue: billing.monthlyRevenue,
            failedPayments: billing.failedPayments,
            nextBillingDate: billing.nextBillingDate,
            paymentStatus,
            limits,
            limitState: limitSnapshot.status,
            limitWarnings: limitSnapshot.warnings.map((metric) => ({
                key: metric.key,
                label: metric.label,
                percentUsed: metric.percentUsed,
                count: metric.count,
                limit: metric.limit,
                warningLevel: metric.warningLevel,
                isBreached: metric.isBreached,
            })),
            breachStartedAt: limitSnapshot.breachStartedAt,
            graceEndsAt: limitSnapshot.graceEndsAt,
            daysUntilAutoSuspend: limitSnapshot.daysUntilAutoSuspend,
            autoSuspendedAt: limitSnapshot.autoSuspendedAt,
            maintenance,
            totalUsers: usage.total,
            activeUsers: usage.active,
            totalBranches,
            totalProducts,
            moduleUsageSummary,
            moduleUsage,
            healthScore: health.score,
            healthStatus: health.status,
            healthTrend: health.trend,
            healthDrivers: health.drivers,
            trialEndsAt: status === 'Trial' ? trialEndsAt.toISOString() : '',
            daysToTrialEnd: status === 'Trial' ? daysToTrialEnd : null,
            lastActivityAt: usage.lastActivityAt ?? company.updatedAt,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
        };
    });
}

function hasLimitBreach(tenant: {
    limitState: 'ok' | 'warning' | 'breached';
}) {
    return tenant.limitState === 'breached';
}

superAdminRoutes.get('/overview', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.DASHBOARD_READ), async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [tenants, auditLast24h] = await Promise.all([
            buildTenantSnapshots(),
            basePrisma.auditLog.count({
                where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            }),
        ]);

        const totalTenants = tenants.length;
        const activeTenants = tenants.filter((tenant) => tenant.status === 'Active').length;
        const trialTenants = tenants.filter((tenant) => tenant.status === 'Trial').length;
        const suspendedTenants = tenants.filter((tenant) => tenant.status === 'Suspended').length;
        const maintenanceTenants = tenants.filter((tenant) => tenant.maintenance.enabled).length;
        const breachedLimitTenants = tenants.filter(hasLimitBreach).length;
        const totalUsers = tenants.reduce((sum, tenant) => sum + tenant.totalUsers, 0);
        const mrr = tenants.reduce((sum, tenant) => sum + tenant.monthlyRevenue, 0);
        const failedPayments = tenants.reduce((sum, tenant) => sum + tenant.failedPayments, 0);
        const averageHealthScore = tenants.length > 0
            ? Math.round(tenants.reduce((sum, tenant) => sum + tenant.healthScore, 0) / tenants.length)
            : 0;
        const healthDistribution = [
            { name: 'Healthy', value: tenants.filter((tenant) => tenant.healthStatus === 'Healthy').length },
            { name: 'Warning', value: tenants.filter((tenant) => tenant.healthStatus === 'Warning').length },
            { name: 'Critical', value: tenants.filter((tenant) => tenant.healthStatus === 'Critical').length },
        ];
        const planDistribution = [
            { name: 'Starter', value: tenants.filter((tenant) => tenant.plan === 'Starter').length },
            { name: 'Growth', value: tenants.filter((tenant) => tenant.plan === 'Growth').length },
            { name: 'SOLVANTA', value: tenants.filter((tenant) => tenant.plan === 'SOLVANTA').length },
        ];
        const tenantGrowthMap = new Map<string, number>();
        for (const tenant of tenants) {
            const key = tenant.createdAt.toISOString().slice(0, 7);
            tenantGrowthMap.set(key, (tenantGrowthMap.get(key) || 0) + 1);
        }
        const tenantGrowth = Array.from(tenantGrowthMap.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .slice(-6)
            .map(([month, value]) => ({ month, tenants: value }));
        const moduleAdoption = ['crm', 'inventory', 'purchases', 'accounting', 'pos', 'reports', 'bom', 'production'].map((key) => ({
            module: key.toUpperCase(),
            adopted: tenants.filter((tenant) => tenant.moduleUsage?.[key as keyof FeatureFlags]?.status === 'adopted').length,
            unused: tenants.filter((tenant) => tenant.moduleUsage?.[key as keyof FeatureFlags]?.status === 'unused').length,
        }));
        const attentionTenants = tenants
            .filter((tenant) => tenant.healthStatus !== 'Healthy' || tenant.limitState === 'breached' || tenant.failedPayments > 0)
            .sort((left, right) => left.healthScore - right.healthScore)
            .slice(0, 5)
            .map((tenant) => ({
                id: tenant.id,
                name: tenant.name,
                healthScore: tenant.healthScore,
                healthStatus: tenant.healthStatus,
                limitState: tenant.limitState,
                failedPayments: tenant.failedPayments,
            }));

        const health = [
            { id: 'api', label: 'API Gateway', value: 'Operational', status: 'Healthy' as const },
            { id: 'db', label: 'Database Cluster', value: `${totalTenants} tenant databases active`, status: 'Healthy' as const },
            {
                id: 'audit',
                label: 'Audit Throughput',
                value: `${auditLast24h} events in last 24h`,
                status: auditLast24h > 0 ? ('Healthy' as const) : ('Warning' as const),
            },
            {
                id: 'security',
                label: 'Security Alerts',
                value: `${maintenanceTenants} tenants in maintenance mode`,
                status: 'Warning' as const,
            },
            {
                id: 'limits',
                label: 'Tenant Limits',
                value: `${breachedLimitTenants} tenants are above configured limits`,
                status: breachedLimitTenants === 0 ? ('Healthy' as const) : ('Warning' as const),
            },
            {
                id: 'tenant-health',
                label: 'Tenant Health',
                value: `Average score ${averageHealthScore}/100`,
                status: averageHealthScore >= 80 ? ('Healthy' as const) : averageHealthScore >= 60 ? ('Warning' as const) : ('Critical' as const),
            },
        ];

        sendSuccess(res, {
            kpis: {
                totalTenants,
                activeTenants,
                trialTenants,
                suspendedTenants,
                totalUsers,
                mrr,
                failedPayments,
                maintenanceTenants,
                breachedLimitTenants,
                averageHealthScore,
            },
            health,
            charts: {
                tenantGrowth,
                healthDistribution,
                planDistribution,
                moduleAdoption,
            },
            attentionTenants,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/tenants', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const statusFilter = String(req.query.status || 'All');
        const planFilter = String(req.query.plan || 'All');
        const maintenanceFilter = String(req.query.maintenance || 'All');
        const paymentFilter = String(req.query.paymentStatus || 'All');
        const limitFilter = String(req.query.limitState || 'All');
        const healthStatusFilter = String(req.query.healthStatus || 'All');
        const healthMin = Number(req.query.healthMin);
        const healthMax = Number(req.query.healthMax);
        const trialEndingWithinDays = Number(req.query.trialEndingWithinDays);
        const moduleFilter = String(req.query.module || 'All').trim().toLowerCase();
        const search = String(req.query.search || '').trim().toLowerCase();

        const tenants = await buildTenantSnapshots();
        const filtered = tenants
            .filter((tenant) => (statusFilter === 'All' ? true : tenant.status === statusFilter))
            .filter((tenant) => (planFilter === 'All' ? true : tenant.plan === planFilter))
            .filter((tenant) => (paymentFilter === 'All' ? true : tenant.paymentStatus === paymentFilter))
            .filter((tenant) => (limitFilter === 'All' ? true : tenant.limitState === limitFilter))
            .filter((tenant) => (healthStatusFilter === 'All' ? true : tenant.healthStatus === healthStatusFilter))
            .filter((tenant) => (Number.isFinite(healthMin) ? tenant.healthScore >= healthMin : true))
            .filter((tenant) => (Number.isFinite(healthMax) ? tenant.healthScore <= healthMax : true))
            .filter((tenant) => (
                Number.isFinite(trialEndingWithinDays) && trialEndingWithinDays >= 0
                    ? tenant.daysToTrialEnd !== null && tenant.daysToTrialEnd <= trialEndingWithinDays
                    : true
            ))
            .filter((tenant) => (
                moduleFilter && moduleFilter !== 'all'
                    ? tenant.moduleUsage?.[moduleFilter as keyof FeatureFlags]?.status === 'adopted'
                    : true
            ))
            .filter((tenant) => {
                if (maintenanceFilter === 'All') return true;
                if (maintenanceFilter === 'On') return tenant.maintenance.enabled;
                if (maintenanceFilter === 'Off') return !tenant.maintenance.enabled;
                return true;
            })
            .filter((tenant) => {
                if (!search) return true;
                const haystack = [
                    tenant.name,
                    tenant.id,
                    tenant.plan,
                    tenant.status,
                    tenant.statusReason,
                    tenant.paymentStatus,
                    tenant.healthStatus,
                    ...tenant.healthDrivers,
                ].join(' ').toLowerCase();
                return haystack.includes(search);
            });

        sendSuccess(res, filtered);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.post('/tenants', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = createTenantSchema.parse(req.body);
        const adminEmail = parsed.adminUser.email.trim().toLowerCase();
        const existingUser = await basePrisma.user.findUnique({
            where: { email: adminEmail },
            select: { id: true },
        });
        if (existingUser) {
            throw AppError.conflict('Admin email is already used by another user');
        }

        const passwordHash = await bcrypt.hash(parsed.adminUser.password, 12);

        const created = await basePrisma.$transaction(async (tx) => {
            const company = await tx.company.create({
                data: {
                    name: parsed.company.name.trim(),
                    currency: parsed.company.currency.trim().toUpperCase(),
                    vatNumber: parsed.company.vatNumber?.trim() || null,
                    logoUrl: parsed.company.logoUrl || null,
                    settings: buildTenantCompanySettings(parsed) as any,
                },
            });

            await tx.role.createMany({
                data: DEFAULT_SYSTEM_ROLES.map((role) => ({
                    companyId: company.id,
                    name: role.name,
                    permissions: [...role.permissions] as string[],
                })),
            });

            const roles = await tx.role.findMany({
                where: { companyId: company.id },
                select: { id: true, name: true },
            });
            const adminRole = roles.find((role) => role.name.trim().toLowerCase() === 'admin');
            if (!adminRole) throw AppError.internal('Failed to initialize admin role');

            const headOffice = await tx.branch.create({
                data: {
                    companyId: company.id,
                    name: (parsed.headOffice?.name || 'Head Office').trim(),
                    code: (parsed.headOffice?.code || 'HQ').trim().toUpperCase(),
                    address: parsed.headOffice?.address || null,
                    phone: parsed.headOffice?.phone || null,
                    isActive: true,
                },
            });

            const adminUser = await tx.user.create({
                data: {
                    companyId: company.id,
                    name: parsed.adminUser.name.trim(),
                    email: adminEmail,
                    phone: parsed.adminUser.phone || null,
                    passwordHash,
                    roleId: adminRole.id,
                    isActive: true,
                },
            });

            await tx.userBranch.create({
                data: {
                    userId: adminUser.id,
                    branchId: headOffice.id,
                },
            });

            return {
                company: {
                    id: company.id,
                    name: company.name,
                    currency: company.currency,
                    vatNumber: company.vatNumber,
                },
                headOffice: {
                    id: headOffice.id,
                    name: headOffice.name,
                    code: headOffice.code,
                },
                adminUser: {
                    id: adminUser.id,
                    name: adminUser.name,
                    email: adminUser.email,
                },
            };
        });

        await writeAudit(created.company.id as any, req.user!.id, 'TENANT_CREATED', 'Company', created.company.id as any, {
            company: created.company,
            headOffice: created.headOffice,
            adminUser: created.adminUser,
        });

        sendSuccess(
            res,
            {
                ...created,
                adminCredentials: {
                    email: adminEmail,
                    password: parsed.adminUser.password,
                },
            },
            undefined,
            201,
        );
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/tenants/:id/control-center', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = String(req.params.id);
        const [tenantList, users] = await Promise.all([
            buildTenantSnapshots(),
            basePrisma.user.findMany({
                where: { companyId },
                include: { role: { select: { name: true, permissions: true } } },
                orderBy: { createdAt: 'desc' },
                take: 200,
            }),
        ]);

        const tenant = tenantList.find((row) => row.id === companyId);
        if (!tenant) throw AppError.notFound('Company');

        sendSuccess(res, {
            tenant,
            usage: {
                users: tenant.totalUsers,
                branches: tenant.totalBranches,
                products: tenant.totalProducts,
            },
            users: users.map((user: any) => {
                const superAdminAccess = resolveSuperAdminAccess({
                    email: user.email,
                    rolePermissions: user.role?.permissions || [],
                });

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role?.name || 'Unassigned',
                    isActive: user.isActive,
                    lastLoginAt: user.lastLoginAt,
                    createdAt: user.createdAt,
                    canImpersonate: !superAdminAccess.isSuperAdmin,
                };
            }),
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/tenants/:id/users', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);
        const statusFilter = String(req.query.status || 'All');
        const search = String(req.query.search || '').trim().toLowerCase();
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

        const users = await basePrisma.user.findMany({
            where: {
                companyId,
                ...(statusFilter === 'All' ? {} : { isActive: statusFilter === 'Active' }),
            },
            include: { role: { select: { name: true, permissions: true } } },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        const filtered = users
            .filter((user) => {
                if (!search) return true;
                return user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search);
            })
            .slice(0, limit)
            .map((user: any) => {
                const superAdminAccess = resolveSuperAdminAccess({
                    email: user.email,
                    rolePermissions: user.role?.permissions || [],
                });

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role?.name || 'Unassigned',
                    isActive: user.isActive,
                    lastLoginAt: user.lastLoginAt,
                    createdAt: user.createdAt,
                    canImpersonate: !superAdminAccess.isSuperAdmin,
                };
            });

        sendSuccess(res, {
            company: { id: company.id, name: company.name },
            users: filtered,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.post('/tenants/:id/users/:userId/impersonate', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.USERS_IMPERSONATE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = impersonationSchema.parse(req.body);
        const companyId = String(req.params.id);
        const userId = String(req.params.userId);

        const target = await basePrisma.user.findFirst({
            where: { id: userId, companyId },
            include: {
                role: { select: { permissions: true, name: true } },
            },
        });

        if (!target) throw AppError.notFound('User');
        if (!target.isActive) throw AppError.badRequest('Only active users can be impersonated');

        const targetSuperAdminAccess = resolveSuperAdminAccess({
            email: target.email,
            rolePermissions: target.role?.permissions || [],
        });

        if (targetSuperAdminAccess.isSuperAdmin) {
            throw AppError.badRequest('Super admin accounts cannot be impersonated');
        }

        const session = await AuthService.createImpersonationSession({
            actorUserId: req.user!.id,
            targetUserId: target.id,
            reason: parsed.ticket?.trim()
                ? `${parsed.reason.trim()} (Ticket: ${parsed.ticket.trim()})`
                : parsed.reason.trim(),
        });

        await writeAudit(
            companyId,
            req.user!.id,
            'TENANT_USER_IMPERSONATION_STARTED',
            'User',
            target.id,
            {
                targetEmail: target.email,
                targetName: target.name,
                role: target.role?.name || 'Unassigned',
                reason: parsed.reason.trim(),
                ticket: parsed.ticket?.trim() || '',
                sessionId: session.impersonation.sessionId,
                startedAt: session.impersonation.startedAt,
            },
            {
                request: req,
            },
        );

        sendSuccess(res, {
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            impersonation: session.impersonation,
            targetUser: {
                id: target.id,
                name: target.name,
                email: target.email,
                companyId: target.companyId,
            },
        }, undefined, 201);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/users/:userId/status', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = userStatusSchema.parse(req.body);
        const companyId = String(req.params.id);
        const userId = String(req.params.userId);

        const target = await basePrisma.user.findFirst({
            where: { id: userId, companyId },
            select: { id: true, name: true, email: true, isActive: true },
        });

        if (!target) throw AppError.notFound('User');
        if (target.id === req.user!.id && !parsed.isActive) {
            throw AppError.badRequest('Cannot deactivate your own account from super-admin controls');
        }

        await basePrisma.user.update({
            where: { id: target.id },
            data: { isActive: parsed.isActive },
        });

        await writeAudit(
            companyId as any,
            req.user!.id,
            parsed.isActive ? 'TENANT_USER_ACTIVATED' : 'TENANT_USER_SUSPENDED',
            'User',
            target.id,
            {
                userEmail: target.email,
                reason: parsed.reason || '',
            },
            {
                before: {
                    isActive: target.isActive,
                },
                request: req,
            },
        );

        sendSuccess(res, {
            id: target.id,
            email: target.email,
            isActive: parsed.isActive,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/users/:userId/password', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = userPasswordSchema.parse(req.body);
        const companyId = String(req.params.id);
        const userId = String(req.params.userId);

        const target = await basePrisma.user.findFirst({
            where: { id: userId, companyId },
            select: { id: true, email: true },
        });

        if (!target) throw AppError.notFound('User');

        const passwordHash = await bcrypt.hash(parsed.password, 12);

        await basePrisma.user.update({
            where: { id: target.id },
            data: { passwordHash },
        });

        await writeAudit(
            companyId as any,
            req.user!.id,
            'TENANT_USER_PASSWORD_UPDATED',
            'User',
            target.id,
            { userEmail: target.email },
            {
                before: { passwordReset: false },
                request: req,
            },
        );

        sendSuccess(res, { message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.post('/tenants/:id/users', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = String(req.params.id);

        const createUserSchema = z.object({
            name: z.string().trim().min(2).max(100),
            email: z.string().trim().email(),
            password: z.string().min(6).max(100),
            role: z.string().trim().optional(),
            phone: z.string().trim().max(40).optional(),
        });

        const parsed = createUserSchema.parse(req.body);
        const normalizedEmail = parsed.email.trim().toLowerCase();
        const requestedRoleName = parsed.role?.trim();

        const company = await basePrisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true },
        });

        if (!company) throw AppError.notFound('Company');

        const existingUser = await basePrisma.user.findFirst({
            where: { email: normalizedEmail, companyId },
            select: { id: true },
        });

        if (existingUser) {
            throw AppError.conflict('User with this email already exists');
        }

        const passwordHash = await bcrypt.hash(parsed.password, 12);

        const fallbackRole = DEFAULT_SYSTEM_ROLES.find((role) => role.name === 'Viewer');
        if (!fallbackRole) throw AppError.internal('Default Viewer role is not configured');

        const requestedSystemRole = requestedRoleName
            ? DEFAULT_SYSTEM_ROLES.find((role) => role.name.trim().toLowerCase() === requestedRoleName.toLowerCase())
            : null;
        const desiredRoleName = requestedRoleName || fallbackRole.name;

        let resolvedRole = await basePrisma.role.findFirst({
            where: { companyId, name: desiredRoleName },
            select: { id: true, name: true },
        });

        if (!resolvedRole) {
            const roleTemplate = requestedSystemRole || (desiredRoleName === fallbackRole.name ? fallbackRole : null);
            if (!roleTemplate) {
                throw AppError.badRequest('Invalid role selected');
            }

            resolvedRole = await basePrisma.role.create({
                data: {
                    companyId,
                    name: roleTemplate.name,
                    permissions: [...roleTemplate.permissions] as string[],
                },
                select: { id: true, name: true },
            });
        }

        const newUser = await basePrisma.user.create({
            data: {
                companyId,
                name: parsed.name,
                email: normalizedEmail,
                passwordHash,
                phone: parsed.phone || undefined,
                roleId: resolvedRole.id,
                isActive: true,
            },
            include: {
                role: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        await writeAudit(
            companyId as any,
            req.user!.id,
            'TENANT_USER_CREATED',
            'User',
            newUser.id,
            {
                userName: newUser.name,
                userEmail: newUser.email,
                role: newUser.role.name,
            },
            {
                request: req,
            },
        );

        sendSuccess(res, {
            message: 'User created successfully',
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role.name,
                isActive: newUser.isActive,
                lastLoginAt: null,
                createdAt: newUser.createdAt,
            },
        }, undefined, 201);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/tenants/:id/usage', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = String(req.params.id);
        const company = await basePrisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
        if (!company) throw AppError.notFound('Company');

        const [branches, users, roles, products, customers, suppliers, posInvoices, purchaseInvoices, stockCounts] = await Promise.all([
            basePrisma.branch.count({ where: { companyId: companyId as string } }),
            basePrisma.user.count({ where: { companyId: companyId as string } }),
            basePrisma.role.count({ where: { companyId: companyId as string } }),
            basePrisma.product.count({ where: { companyId: companyId as string, deletedAt: { isSet: false } } }),
            basePrisma.customer.count({ where: { companyId: companyId as string, deletedAt: { isSet: false } } }),
            basePrisma.supplier.count({ where: { companyId: companyId as string, deletedAt: { isSet: false } } }),
            basePrisma.pOSInvoice.count({ where: { companyId: companyId as string } }),
            basePrisma.purchaseInvoice.count({ where: { companyId: companyId as string } }),
            basePrisma.stockCount.count({ where: { companyId: companyId as string } }),
        ]);

        sendSuccess(res, {
            company,
            counts: {
                branches,
                users,
                roles,
                products,
                customers,
                suppliers,
                posInvoices,
                purchaseInvoices,
                stockCounts,
            },
        });
    } catch (error) {
        next(error);
    }
});

async function applyTenantStatusChange(
    companyId: string,
    parsed: z.infer<typeof statusSchema>,
    actor: { id: string; email: string; companyId: string },
    request?: Request,
) {
    const company = await getTenantCompanyOrThrow(companyId);
    const settings = getSuperAdminSettings(company.settings);
    const currentStatus = sanitizeTenantStatus(settings.status) ?? 'Active';
    const currentStatusMeta = resolveTenantStatusMeta(settings.statusMeta);
    const nowIso = new Date().toISOString();

    let affectedUserIds: string[] = [];
    let affectedUsers = 0;
    let updatedStatusMeta: TenantStatusMeta = {
        changedAt: nowIso,
        changedBy: actor.email,
        suspendedUserIds: [],
    };

    if (parsed.status === 'Suspended') {
        const usersToSuspend = await basePrisma.user.findMany({
            where: {
                companyId: companyId as any,
                isActive: true,
                ...(String(actor.companyId) === companyId ? { id: { not: actor.id } } : {}),
            },
            select: { id: true },
        });

        affectedUserIds = usersToSuspend.map((user) => user.id);
        affectedUsers = affectedUserIds.length;

        if (affectedUserIds.length > 0) {
            await basePrisma.user.updateMany({
                where: { id: { in: affectedUserIds as any } },
                data: { isActive: false },
            });
        }

        updatedStatusMeta = {
            changedAt: nowIso,
            changedBy: actor.email,
            suspendedUserIds: affectedUserIds,
        };
    } else {
        const userIdsToReactivate = currentStatus === 'Suspended'
            ? currentStatusMeta.suspendedUserIds
            : [];

        affectedUserIds = userIdsToReactivate;
        affectedUsers = userIdsToReactivate.length;

        if (userIdsToReactivate.length > 0) {
            await basePrisma.user.updateMany({
                where: {
                    id: { in: userIdsToReactivate as any },
                    companyId: companyId as any,
                },
                data: { isActive: true },
            });
        }

        updatedStatusMeta = {
            changedAt: nowIso,
            changedBy: actor.email,
            suspendedUserIds: [],
        };
    }

    const updated = await basePrisma.company.update({
        where: { id: companyId as any },
        data: {
            settings: mergeCompanySuperAdminSettings(company.settings, {
                status: parsed.status,
                statusReason: parsed.status === 'Suspended' ? (parsed.reason || '') : '',
                statusMeta: updatedStatusMeta,
            }) as any,
        },
    });

    await writeAudit(
        companyId as any,
        actor.id,
        `TENANT_${parsed.status.toUpperCase()}`,
        'Company',
        companyId as any,
        {
            status: parsed.status,
            reason: parsed.reason || '',
            changedAt: nowIso,
            changedBy: actor.email,
            affectedUsers,
        },
        {
            before: {
                status: currentStatus,
                reason: settings.statusReason || '',
                suspendedUserCount: currentStatusMeta.suspendedUserIds.length,
            },
            request,
        },
    );

    return {
        id: updated.id,
        status: parsed.status,
        statusReason: parsed.status === 'Suspended' ? (parsed.reason || '') : '',
        statusChangedAt: updatedStatusMeta.changedAt,
        statusChangedBy: updatedStatusMeta.changedBy,
        affectedUsers,
    };
}

superAdminRoutes.patch('/tenants/:id/status', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = statusSchema.parse(req.body);
        const result = await applyTenantStatusChange(
            String(req.params.id),
            parsed,
            {
                id: req.user!.id,
                email: req.user!.email,
                companyId: req.user!.companyId,
            },
            req,
        );

        sendSuccess(res, result);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/bulk/status', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = bulkStatusSchema.parse(req.body);
        const tenantIds = Array.from(new Set(parsed.tenantIds.map((id) => String(id).trim()).filter(Boolean)));
        const results = [];

        for (const companyId of tenantIds) {
            const result = await applyTenantStatusChange(
                companyId,
                { status: parsed.status, reason: parsed.reason },
                {
                    id: req.user!.id,
                    email: req.user!.email,
                    companyId: req.user!.companyId,
                },
                req,
            );
            results.push(result);
        }

        sendSuccess(res, {
            updated: results.length,
            status: parsed.status,
            tenants: results,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/features', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = featureSchema.parse(req.body);
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);
        const currentFeatureFlags = resolveFeatureFlags(getSuperAdminSettings(company.settings).featureFlags);

        const updated = await basePrisma.company.update({
            where: { id: companyId as any },
            data: {
                settings: mergeCompanySuperAdminSettings(company.settings, {
                    featureFlags: parsed.featureFlags,
                }) as any,
            },
        });

        await writeAudit(
            companyId as string,
            req.user!.id,
            'TENANT_FEATURE_FLAGS_UPDATED',
            'Company',
            companyId as string,
            parsed.featureFlags,
            {
                before: currentFeatureFlags,
                request: req,
            },
        );

        sendSuccess(res, {
            id: updated.id,
            featureFlags: parsed.featureFlags,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/bulk/features', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = bulkFeatureSchema.parse(req.body);
        const tenantIds = Array.from(new Set(parsed.tenantIds.map((id) => String(id).trim()).filter(Boolean)));
        const updatedTenants: string[] = [];

        for (const companyId of tenantIds) {
            const company = await getTenantCompanyOrThrow(companyId);
            const currentFeatureFlags = resolveFeatureFlags(getSuperAdminSettings(company.settings).featureFlags);

            await basePrisma.company.update({
                where: { id: companyId as any },
                data: {
                    settings: mergeCompanySuperAdminSettings(company.settings, {
                        featureFlags: parsed.featureFlags,
                    }) as any,
                },
            });

            await writeAudit(
                companyId,
                req.user!.id,
                'TENANT_FEATURE_FLAGS_BULK_UPDATED',
                'Company',
                companyId,
                parsed.featureFlags,
                {
                    before: currentFeatureFlags,
                    request: req,
                },
            );
            updatedTenants.push(companyId);
        }

        sendSuccess(res, {
            updated: updatedTenants.length,
            tenantIds: updatedTenants,
            featureFlags: parsed.featureFlags,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/plan', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.BILLING_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = planSchema.parse(req.body);
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);
        const settings = getSuperAdminSettings(company.settings);

        const currentBilling = resolveTenantBilling(settings.billing);
        const updatedBilling: TenantBilling = {
            ...currentBilling,
            ...(parsed.monthlyRevenue !== undefined ? { monthlyRevenue: parsed.monthlyRevenue } : {}),
            ...(parsed.failedPayments !== undefined ? { failedPayments: parsed.failedPayments } : {}),
            ...(parsed.nextBillingDate !== undefined ? { nextBillingDate: toIsoDateOrEmpty(parsed.nextBillingDate) } : {}),
        };

        await basePrisma.company.update({
            where: { id: companyId as any },
            data: {
                settings: mergeCompanySuperAdminSettings(company.settings, {
                    planOverride: parsed.plan,
                    billing: updatedBilling,
                }) as any,
            },
        });

        await writeAudit(companyId as string, req.user!.id, 'TENANT_PLAN_UPDATED', 'Company', companyId as string, {
            plan: parsed.plan,
            billing: updatedBilling,
        }, {
            before: {
                plan: sanitizeTenantPlan(settings.planOverride) ?? inferTenantPlan(0),
                billing: currentBilling,
            },
            request: req,
        });

        sendSuccess(res, {
            plan: parsed.plan,
            billing: updatedBilling,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/limits', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.LIMITS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = limitsSchema.parse(req.body);
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);
        const settings = getSuperAdminSettings(company.settings);

        const currentLimits = resolveTenantLimits(settings.limits);
        const updatedLimits: TenantLimits = {
            ...currentLimits,
            ...(parsed.maxUsers !== undefined ? { maxUsers: parsed.maxUsers } : {}),
            ...(parsed.maxBranches !== undefined ? { maxBranches: parsed.maxBranches } : {}),
            ...(parsed.maxProducts !== undefined ? { maxProducts: parsed.maxProducts } : {}),
        };

        const updatedCompany = await basePrisma.company.update({
            where: { id: companyId as any },
            data: {
                settings: mergeCompanySuperAdminSettings(company.settings, {
                    limits: updatedLimits,
                }) as any,
            },
        });

        const synced = await syncTenantLimitEnforcement(companyId, {
            actorUserId: req.user!.id,
            actorEmail: req.user!.email,
            companySettings: updatedCompany.settings,
            request: req,
        });

        await writeAudit(companyId as string, req.user!.id, 'TENANT_LIMITS_UPDATED', 'Company', companyId as string, {
            limits: updatedLimits,
            limitState: synced.limitSnapshot.status,
            breachedResources: synced.limitSnapshot.breached.map((metric) => metric.key),
            graceEndsAt: synced.limitSnapshot.graceEndsAt || null,
        }, {
            before: currentLimits,
            request: req,
        });
        sendSuccess(res, {
            ...updatedLimits,
            limitState: synced.limitSnapshot.status,
            graceEndsAt: synced.limitSnapshot.graceEndsAt || null,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/maintenance', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.MAINTENANCE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = maintenanceSchema.parse(req.body);
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);
        const settings = getSuperAdminSettings(company.settings);

        const currentMaintenance = resolveTenantMaintenance(settings.maintenance);
        const updatedMaintenance: TenantMaintenance = {
            enabled: parsed.enabled,
            message: parsed.enabled
                ? ((parsed.message || currentMaintenance.message || 'Tenant is under maintenance').trim().slice(0, 300))
                : '',
        };

        await basePrisma.company.update({
            where: { id: companyId as any },
            data: {
                settings: mergeCompanySuperAdminSettings(company.settings, {
                    maintenance: updatedMaintenance,
                }) as any,
            },
        });

        await writeAudit(
            companyId as string,
            req.user!.id,
            parsed.enabled ? 'TENANT_MAINTENANCE_ENABLED' : 'TENANT_MAINTENANCE_DISABLED',
            'Company',
            companyId as string,
            updatedMaintenance,
            {
                before: currentMaintenance,
                request: req,
            },
        );

        sendSuccess(res, updatedMaintenance);
    } catch (error) {
        next(error);
    }
});

async function loadAnnouncementRows(): Promise<AnnouncementRow[]> {
    const rows = await basePrisma.globalString.findMany({
        where: { group: 'SYSTEM_ANNOUNCEMENT' },
        include: {
            company: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        value: row.value,
        description: row.description || '',
        metadata: row.metadata,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        companyName: row.company?.name || 'unknown',
    }));
}

function buildAnnouncementSummary(rows: AnnouncementRow[]) {
    const grouped = new Map<string, AnnouncementRow[]>();

    for (const row of rows) {
        const meta = parseAnnouncementMetadata(row.metadata, {
            companyId: row.companyId,
            createdAt: row.createdAt,
            rowId: row.id,
        });
        const key = meta.broadcastId || row.id;
        const existing = grouped.get(key) || [];
        existing.push(row);
        grouped.set(key, existing);
    }

    return Array.from(grouped.entries())
        .map(([key, groupedRows]) => {
            const latest = groupedRows.reduce((prev, current) => (current.updatedAt > prev.updatedAt ? current : prev), groupedRows[0]);
            const meta = parseAnnouncementMetadata(latest.metadata, {
                companyId: latest.companyId,
                createdAt: latest.createdAt,
                rowId: latest.id,
            });
            const tenantIds = Array.from(new Set(groupedRows.map((row) => row.companyId)));

            return {
                id: key,
                broadcastId: key,
                title: latest.value,
                message: latest.description || '',
                level: meta.level,
                audience: meta.audience,
                expiresAt: meta.expiresAt || null,
                isExpired: isAnnouncementExpired(meta.expiresAt),
                isActive: groupedRows.some((row) => row.isActive),
                createdAt: meta.createdAt || latest.createdAt.toISOString(),
                updatedAt: latest.updatedAt.toISOString(),
                createdBy: meta.createdBy,
                updatedBy: meta.updatedBy || '',
                targetCompanyId: meta.targetCompanyId || null,
                targetCompanyName: meta.targetCompanyId
                    ? (groupedRows.find((row) => row.companyId === meta.targetCompanyId)?.companyName || null)
                    : null,
                tenantCount: tenantIds.length,
            };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function getAnnouncementRowsByKey(key: string): Promise<{ rows: AnnouncementRow[]; broadcastId: string }> {
    const rows = await loadAnnouncementRows();
    const byBroadcast = rows.filter((row) => {
        const meta = parseAnnouncementMetadata(row.metadata, {
            companyId: row.companyId,
            createdAt: row.createdAt,
            rowId: row.id,
        });
        return meta.broadcastId === key;
    });
    if (byBroadcast.length > 0) {
        return { rows: byBroadcast, broadcastId: key };
    }

    const byId = rows.filter((row) => row.id === key);
    if (byId.length > 0) {
        return { rows: byId, broadcastId: key };
    }

    throw AppError.notFound('Announcement');
}

superAdminRoutes.get('/announcements', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_READ), async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await loadAnnouncementRows();
        const summary = buildAnnouncementSummary(rows);
        sendSuccess(res, summary);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.post('/announcements/broadcast', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = broadcastSchema.parse(req.body);
        const companies = await basePrisma.company.findMany({ select: { id: true } });
        const now = new Date();
        const nowIso = now.toISOString();
        const broadcastId = randomUUID();
        const expiresAt = toIsoDateOrEmpty(parsed.expiresAt);

        for (const company of companies) {
            await basePrisma.globalString.create({
                data: {
                    companyId: company.id,
                    group: 'SYSTEM_ANNOUNCEMENT',
                    value: parsed.title,
                    description: parsed.message,
                    metadata: {
                        level: parsed.level,
                        createdBy: req.user!.email,
                        createdAt: nowIso,
                        audience: 'all-tenants',
                        targetCompanyId: '',
                        broadcastId,
                        expiresAt,
                    } as any,
                    isActive: true,
                },
            });

            await writeAudit(company.id as string, req.user!.id, 'SUPER_ADMIN_BROADCAST', 'GlobalString', undefined, {
                title: parsed.title,
                level: parsed.level,
                expiresAt: expiresAt || null,
                broadcastId,
            });
        }

        sendSuccess(
            res,
            { sentToTenants: companies.length, title: parsed.title, level: parsed.level, expiresAt: expiresAt || null, broadcastId },
            undefined,
            201,
        );
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.post('/announcements/tenant/:id', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = broadcastSchema.parse(req.body);
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);
        const now = new Date();
        const nowIso = now.toISOString();
        const broadcastId = randomUUID();
        const expiresAt = toIsoDateOrEmpty(parsed.expiresAt);

        await basePrisma.globalString.create({
            data: {
                companyId,
                group: 'SYSTEM_ANNOUNCEMENT',
                value: parsed.title,
                description: parsed.message,
                metadata: {
                    level: parsed.level,
                    createdBy: req.user!.email,
                    createdAt: nowIso,
                    audience: 'single-tenant',
                    targetCompanyId: companyId,
                    broadcastId,
                    expiresAt,
                } as any,
                isActive: true,
            },
        });

        await writeAudit(companyId as string, req.user!.id, 'SUPER_ADMIN_TENANT_BROADCAST', 'GlobalString', undefined, {
            title: parsed.title,
            level: parsed.level,
            companyId,
            expiresAt: expiresAt || null,
            broadcastId,
        });

        sendSuccess(
            res,
            {
                company: { id: company.id, name: company.name },
                title: parsed.title,
                level: parsed.level,
                expiresAt: expiresAt || null,
                broadcastId,
            },
            undefined,
            201,
        );
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/announcements/:id', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = announcementUpdateSchema.parse(req.body);
        if (
            parsed.title === undefined
            && parsed.message === undefined
            && parsed.level === undefined
            && parsed.expiresAt === undefined
            && parsed.isActive === undefined
        ) {
            throw AppError.badRequest('No announcement fields to update');
        }

        const { rows, broadcastId } = await getAnnouncementRowsByKey(req.params.id as any);
        const nowIso = new Date().toISOString();

        await basePrisma.$transaction(
            rows.map((row) => {
                const baseMeta = isRecord(row.metadata) ? row.metadata : {};
                const meta = parseAnnouncementMetadata(row.metadata, {
                    companyId: row.companyId,
                    createdAt: row.createdAt,
                    rowId: row.id,
                });
                const nextExpiresAt =
                    parsed.expiresAt === undefined
                        ? meta.expiresAt
                        : parsed.expiresAt === null
                            ? ''
                            : toIsoDateOrEmpty(parsed.expiresAt);

                return basePrisma.globalString.update({
                    where: { id: row.id },
                    data: {
                        value: parsed.title ?? row.value,
                        description: parsed.message ?? (row.description || ''),
                        isActive: parsed.isActive ?? row.isActive,
                        metadata: {
                            ...baseMeta,
                            ...meta,
                            broadcastId,
                            level: parsed.level ?? meta.level,
                            expiresAt: nextExpiresAt,
                            updatedBy: req.user!.email,
                            updatedAt: nowIso,
                        } as any,
                    },
                });
            }),
        );

        const affectedCompanyIds = Array.from(new Set(rows.map((row) => row.companyId)));
        for (const companyId of affectedCompanyIds) {
            await writeAudit(companyId as string, req.user!.id, 'SUPER_ADMIN_ANNOUNCEMENT_UPDATED', 'GlobalString', undefined, {
                broadcastId,
                title: parsed.title,
                level: parsed.level,
                expiresAt: parsed.expiresAt === null ? null : parsed.expiresAt,
                isActive: parsed.isActive,
            });
        }

        sendSuccess(res, { id: broadcastId, updatedCopies: rows.length });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.delete('/announcements/:id', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { rows, broadcastId } = await getAnnouncementRowsByKey(req.params.id as any);
        const rowIds = rows.map((row) => row.id);

        await basePrisma.globalString.deleteMany({
            where: { id: { in: rowIds } },
        });

        const affectedCompanyIds = Array.from(new Set(rows.map((row) => row.companyId)));
        for (const companyId of affectedCompanyIds) {
            await writeAudit(companyId as string, req.user!.id, 'SUPER_ADMIN_ANNOUNCEMENT_DELETED', 'GlobalString', undefined, {
                broadcastId,
                deletedCopies: rowIds.length,
            });
        }

        sendSuccess(res, { id: broadcastId, deletedCopies: rowIds.length });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/audit/support-sessions/:sessionId', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.AUDIT_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionId = String(req.params.sessionId || '').trim();
        const format = String(req.query.format || '').trim().toLowerCase();
        if (!sessionId) throw AppError.badRequest('Session ID is required');

        const recentCandidates = await basePrisma.auditLog.findMany({
            where: {
                action: {
                    in: ['TENANT_USER_IMPERSONATION_STARTED', 'TENANT_USER_IMPERSONATION_NOTE', 'TENANT_USER_IMPERSONATION_ENDED'],
                },
                createdAt: {
                    gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                },
            },
            orderBy: { createdAt: 'asc' },
            include: {
                company: { select: { id: true, name: true } },
                user: { select: { email: true, name: true } },
            },
            take: 2000,
        });

        const matchingStart = recentCandidates.find((row) => extractSupportSessionMeta(row.after)?.sessionId === sessionId);
        if (!matchingStart) throw AppError.notFound('Support session');
        const matchingSupportSession = extractSupportSessionMeta(matchingStart.after);
        const matchingStartAfter = isRecord(matchingStart.after) ? matchingStart.after : {};

        const transcriptRows = await basePrisma.auditLog.findMany({
            where: {
                companyId: matchingStart.companyId,
                createdAt: {
                    gte: new Date(extractSupportSessionMeta(matchingStart.after)?.startedAt || matchingStart.createdAt.toISOString()),
                },
            },
            orderBy: { createdAt: 'asc' },
            include: {
                company: { select: { id: true, name: true } },
                user: { select: { email: true, name: true } },
            },
            take: 1500,
        });

        const transcript = transcriptRows
            .filter((row) => extractSupportSessionMeta(row.after)?.sessionId === sessionId)
            .map((row) => {
                const supportSession = extractSupportSessionMeta(row.after);
                return ({
                    id: row.id,
                    action: row.action,
                    entity: row.entity,
                    entityId: row.entityId || '',
                    actor: supportSession?.actorEmail || row.user?.email || row.user?.name || 'unknown',
                    company: row.company?.name || 'unknown',
                    companyId: row.companyId,
                    createdAt: row.createdAt,
                    before: row.before,
                    after: row.after,
                    kind:
                        row.action === 'TENANT_USER_IMPERSONATION_NOTE'
                            ? 'note'
                            : row.action === 'TENANT_USER_IMPERSONATION_STARTED' || row.action === 'TENANT_USER_IMPERSONATION_ENDED'
                                ? 'session'
                                : 'activity',
                });
            });

        let endedAt: Date | null = null;
        for (let index = transcript.length - 1; index >= 0; index -= 1) {
            const item = transcript[index];
            if (item.action === 'TENANT_USER_IMPERSONATION_ENDED') {
                endedAt = item.createdAt;
                break;
            }
        }

        if (format === 'csv') {
            const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
            const lines = [
                [
                    'Timestamp',
                    'Kind',
                    'Action',
                    'Actor',
                    'Company',
                    'Company ID',
                    'Entity',
                    'Entity ID',
                    'Note',
                    'Payload',
                ].join(','),
                ...transcript.map((item) => [
                    escapeCsv(item.createdAt.toISOString()),
                    escapeCsv(item.kind),
                    escapeCsv(item.action),
                    escapeCsv(item.actor),
                    escapeCsv(item.company),
                    escapeCsv(item.companyId),
                    escapeCsv(item.entity),
                    escapeCsv(item.entityId),
                    escapeCsv(isRecord(item.after) && typeof item.after.note === 'string' ? item.after.note : ''),
                    escapeCsv(JSON.stringify(item.after ?? {})),
                ].join(',')),
            ];

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="support-session-${sessionId}.csv"`);
            res.status(200).send(lines.join('\n'));
            return;
        }

        sendSuccess(res, {
            sessionId,
            company: matchingStart.company?.name || 'unknown',
            companyId: matchingStart.companyId,
            actor: matchingSupportSession?.actorName || matchingSupportSession?.actorEmail || matchingStart.user?.name || matchingStart.user?.email || 'unknown',
            actorEmail: matchingSupportSession?.actorEmail || matchingStart.user?.email || '',
            targetUserId: typeof matchingStart.entityId === 'string' ? matchingStart.entityId : '',
            targetUserEmail:
                typeof matchingStartAfter.targetEmail === 'string'
                    ? matchingStartAfter.targetEmail
                    : typeof matchingStartAfter.targetUserEmail === 'string'
                        ? matchingStartAfter.targetUserEmail
                        : '',
            reason: typeof matchingStartAfter.reason === 'string' ? matchingStartAfter.reason : '',
            startedAt: matchingStart.createdAt,
            endedAt,
            transcript,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/audit/support-sessions', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.AUDIT_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = String(req.query.companyId || '').trim();
        const actor = String(req.query.actor || '').trim().toLowerCase();
        const sessionIdFilter = String(req.query.sessionId || '').trim().toLowerCase();
        const status = String(req.query.status || 'All').trim();
        const search = String(req.query.search || '').trim().toLowerCase();

        const rows = await basePrisma.auditLog.findMany({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                },
                ...(companyId ? { companyId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                company: { select: { id: true, name: true } },
                user: { select: { email: true, name: true } },
            },
            take: 4000,
        });

        const sessions = new Map<string, {
            sessionId: string;
            actor: string;
            actorEmail: string;
            companyId: string;
            company: string;
            targetUserId: string;
            targetUserEmail: string;
            reason: string;
            startedAt: Date;
            endedAt: Date | null;
            lastActivityAt: Date;
            noteCount: number;
            activityCount: number;
            status: 'Active' | 'Ended';
        }>();

        for (const row of rows) {
            const supportSession = extractSupportSessionMeta(row.after);
            if (!supportSession?.sessionId) continue;

            const current = sessions.get(supportSession.sessionId) ?? {
                sessionId: supportSession.sessionId,
                actor: supportSession.actorName || supportSession.actorEmail || row.user?.name || row.user?.email || 'unknown',
                actorEmail: supportSession.actorEmail || row.user?.email || '',
                companyId: row.companyId,
                company: row.company?.name || 'unknown',
                targetUserId: '',
                targetUserEmail: '',
                reason: '',
                startedAt: row.createdAt,
                endedAt: null,
                lastActivityAt: row.createdAt,
                noteCount: 0,
                activityCount: 0,
                status: 'Active' as const,
            };

            current.lastActivityAt = current.lastActivityAt > row.createdAt ? current.lastActivityAt : row.createdAt;

            if (row.action === 'TENANT_USER_IMPERSONATION_STARTED') {
                current.startedAt = row.createdAt;
                current.reason = typeof (row.after as any)?.reason === 'string' ? (row.after as any).reason : current.reason;
                current.targetUserId = typeof row.entityId === 'string' ? row.entityId : current.targetUserId;
                current.targetUserEmail = typeof (row.after as any)?.targetEmail === 'string' ? (row.after as any).targetEmail : current.targetUserEmail;
            } else if (row.action === 'TENANT_USER_IMPERSONATION_ENDED') {
                current.endedAt = row.createdAt;
                current.status = 'Ended';
            } else if (row.action === 'TENANT_USER_IMPERSONATION_NOTE') {
                current.noteCount += 1;
            } else {
                current.activityCount += 1;
            }

            if (!current.reason && typeof (row.after as any)?.reason === 'string') {
                current.reason = (row.after as any).reason;
            }
            if (!current.targetUserEmail && typeof (row.after as any)?.targetUserEmail === 'string') {
                current.targetUserEmail = (row.after as any).targetUserEmail;
            }

            sessions.set(supportSession.sessionId, current);
        }

        const filtered = Array.from(sessions.values())
            .filter((session) => (status === 'All' ? true : session.status === status))
            .filter((session) => (actor ? session.actor.toLowerCase().includes(actor) || session.actorEmail.toLowerCase().includes(actor) : true))
            .filter((session) => (sessionIdFilter ? session.sessionId.toLowerCase().includes(sessionIdFilter) : true))
            .filter((session) => {
                if (!search) return true;
                const haystack = [
                    session.sessionId,
                    session.actor,
                    session.actorEmail,
                    session.company,
                    session.targetUserEmail,
                    session.reason,
                ].join(' ').toLowerCase();
                return haystack.includes(search);
            })
            .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime());

        sendSuccess(res, filtered);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/audit', requireSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.AUDIT_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const action = String(req.query.action || '').trim();
        const companyId = String(req.query.companyId || '').trim();
        const search = String(req.query.search || '').trim().toLowerCase();
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();
        const format = String(req.query.format || '').trim().toLowerCase();

        const where: any = {};
        if (action) where.action = action;
        if (companyId) where.companyId = companyId;

        const createdAt: Record<string, Date> = {};
        if (from) {
            const parsedFrom = new Date(from);
            if (!Number.isNaN(parsedFrom.getTime())) createdAt.gte = parsedFrom;
        }
        if (to) {
            const parsedTo = new Date(to);
            if (!Number.isNaN(parsedTo.getTime())) createdAt.lte = parsedTo;
        }
        if (Object.keys(createdAt).length > 0) {
            where.createdAt = createdAt;
        }

        const queryLimit = search ? Math.min(limit * 5, 500) : limit;
        const audit = await basePrisma.auditLog.findMany({
            take: queryLimit,
            orderBy: { createdAt: 'desc' },
            where,
            include: {
                user: { select: { email: true, name: true } },
                company: { select: { id: true, name: true } },
            },
        });

        const mapped = audit.map((row) => {
            const supportSession = extractSupportSessionMeta(row.after);
            return ({
                id: row.id,
                actor: supportSession?.actorEmail || row.user?.email || row.user?.name || 'unknown',
                action: row.action,
                target: `${row.entity}${row.entityId ? ` (${row.entityId})` : ''}`,
                company: row.company?.name || 'unknown',
                companyId: row.companyId,
                sessionId: supportSession?.sessionId || '',
                severity:
                    row.action.includes('SUSPEND') || row.action.includes('DELETE')
                        ? 'Critical'
                        : row.action.includes('MAINTENANCE') || row.action.includes('PASSWORD') || row.action.includes('LIMIT')
                            ? 'Warning'
                            : 'Info',
                before: row.before,
                after: row.after,
                ipAddress: row.ipAddress || '',
                userAgent: row.userAgent || '',
                createdAt: row.createdAt,
            });
        });

        const filtered = mapped
            .filter((row) => {
                if (!search) return true;
                const haystack = `${row.actor} ${row.action} ${row.target} ${row.company} ${row.sessionId}`.toLowerCase();
                return haystack.includes(search);
            })
            .slice(0, limit);

        if (format === 'csv') {
            const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
            const header = ['Timestamp', 'Actor', 'Action', 'Company', 'Target', 'Severity', 'IP Address', 'User Agent'];
            const lines = [
                header.join(','),
                ...filtered.map((row) => [
                    escapeCsv(row.createdAt.toISOString()),
                    escapeCsv(row.actor),
                    escapeCsv(row.action),
                    escapeCsv(row.company),
                    escapeCsv(row.target),
                    escapeCsv(row.severity),
                    escapeCsv(row.ipAddress),
                    escapeCsv(row.userAgent),
                ].join(',')),
            ];
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="super-admin-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
            res.status(200).send(lines.join('\n'));
            return;
        }

        sendSuccess(res, filtered);
    } catch (error) {
        next(error);
    }
});
