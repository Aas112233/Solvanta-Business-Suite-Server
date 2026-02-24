import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { authenticate } from '../../middleware/auth.js';
import { requireSuperAdmin } from '../../middleware/superAdmin.js';
import { basePrisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { DEFAULT_SYSTEM_ROLES } from '../../config/permissions.js';
import {
    type FeatureFlags,
    type SuperAdminSettings,
    type TenantBilling,
    type TenantLimits,
    type TenantMaintenance,
    type TenantPlan,
    type TenantStatus,
    DEFAULT_FEATURE_FLAGS,
    getSuperAdminSettings,
    resolveFeatureFlags,
    resolveTenantBilling,
    resolveTenantLimits,
    resolveTenantMaintenance,
    sanitizeTenantPlan,
    sanitizeTenantStatus,
} from './super-admin.settings.js';

export const superAdminRoutes = Router();

superAdminRoutes.use(authenticate, requireSuperAdmin);

const statusSchema = z.object({
    status: z.enum(['Active', 'Suspended']),
    reason: z.string().max(200).optional(),
});

const featureSchema = z.object({
    featureFlags: z.object({
        crm: z.boolean(),
        inventory: z.boolean(),
        purchases: z.boolean(),
        accounting: z.boolean(),
        pos: z.boolean(),
        reports: z.boolean(),
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
    plan: z.enum(['Starter', 'Growth', 'Enterprise']),
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

const maintenanceSchema = z.object({
    enabled: z.boolean(),
    message: z.string().max(300).optional(),
});

const userStatusSchema = z.object({
    isActive: z.boolean(),
    reason: z.string().max(200).optional(),
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
    plan: z.enum(['Starter', 'Growth', 'Enterprise']).optional(),
    featureFlags: z.object({
        crm: z.boolean(),
        inventory: z.boolean(),
        purchases: z.boolean(),
        accounting: z.boolean(),
        pos: z.boolean(),
        reports: z.boolean(),
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
    if (totalUsers >= 50) return 'Enterprise';
    if (totalUsers >= 10) return 'Growth';
    return 'Starter';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCompanySettings(settings: unknown): Record<string, unknown> {
    if (!isRecord(settings)) return {};
    return settings;
}

function mergeCompanySuperAdminSettings(companySettings: unknown, patch: Partial<SuperAdminSettings>) {
    const baseSettings = normalizeCompanySettings(companySettings);
    const currentSuperAdmin = getSuperAdminSettings(baseSettings);

    return {
        ...baseSettings,
        superAdmin: {
            ...currentSuperAdmin,
            ...patch,
        },
    };
}

function toIsoDateOrEmpty(raw: string | undefined) {
    if (!raw || !raw.trim()) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
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

async function writeAudit(companyId: any, userId: any, action: any, entity: any, entityId?: any, after?: any) {
    await basePrisma.auditLog.create({
        data: {
            companyId,
            userId,
            action,
            entity,
            entityId,
            after: (after || undefined) as any,
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
    const [companies, users, branches, products] = await Promise.all([
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

    return companies.map((company) => {
        const usage = usersByCompany.get(company.id) ?? { total: 0, active: 0, lastActivityAt: null };
        const systemSettings = getSuperAdminSettings(company.settings);
        const inferredStatus = inferTenantStatus(company.createdAt, usage.active);
        const status = sanitizeTenantStatus(systemSettings.status) ?? inferredStatus;
        const plan = sanitizeTenantPlan(systemSettings.planOverride) ?? inferTenantPlan(usage.total);
        const billing = resolveTenantBilling(systemSettings.billing);
        const limits = resolveTenantLimits(systemSettings.limits);
        const maintenance = resolveTenantMaintenance(systemSettings.maintenance);

        const totalBranches = branchCounts.get(company.id) || 0;
        const totalProducts = productCounts.get(company.id) || 0;

        return {
            id: company.id,
            name: company.name,
            currency: company.currency,
            plan,
            status,
            statusReason: systemSettings.statusReason || '',
            featureFlags: resolveFeatureFlags(systemSettings.featureFlags),
            monthlyRevenue: billing.monthlyRevenue,
            failedPayments: billing.failedPayments,
            nextBillingDate: billing.nextBillingDate,
            limits,
            maintenance,
            totalUsers: usage.total,
            activeUsers: usage.active,
            totalBranches,
            totalProducts,
            lastActivityAt: usage.lastActivityAt ?? company.updatedAt,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
        };
    });
}

function hasLimitBreach(tenant: {
    limits: TenantLimits;
    totalUsers: number;
    totalBranches: number;
    totalProducts: number;
}) {
    const overUsers = tenant.limits.maxUsers !== null && tenant.totalUsers > tenant.limits.maxUsers;
    const overBranches = tenant.limits.maxBranches !== null && tenant.totalBranches > tenant.limits.maxBranches;
    const overProducts = tenant.limits.maxProducts !== null && tenant.totalProducts > tenant.limits.maxProducts;

    return overUsers || overBranches || overProducts;
}

superAdminRoutes.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
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
            },
            health,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/tenants', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const statusFilter = String(req.query.status || 'All');
        const planFilter = String(req.query.plan || 'All');
        const maintenanceFilter = String(req.query.maintenance || 'All');
        const search = String(req.query.search || '').trim().toLowerCase();

        const tenants = await buildTenantSnapshots();
        const filtered = tenants
            .filter((tenant) => (statusFilter === 'All' ? true : tenant.status === statusFilter))
            .filter((tenant) => (planFilter === 'All' ? true : tenant.plan === planFilter))
            .filter((tenant) => {
                if (maintenanceFilter === 'All') return true;
                if (maintenanceFilter === 'On') return tenant.maintenance.enabled;
                if (maintenanceFilter === 'Off') return !tenant.maintenance.enabled;
                return true;
            })
            .filter((tenant) => (search ? tenant.name.toLowerCase().includes(search) : true));

        sendSuccess(res, filtered);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.post('/tenants', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.get('/tenants/:id/control-center', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = String(req.params.id);
        const [tenantList, users] = await Promise.all([
            buildTenantSnapshots(),
            basePrisma.user.findMany({
                where: { companyId },
                include: { role: { select: { name: true } } },
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
            users: users.map((user: any) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role?.name || 'Unassigned',
                isActive: user.isActive,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
            })),
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.get('/tenants/:id/users', async (req: Request, res: Response, next: NextFunction) => {
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
            include: { role: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        const filtered = users
            .filter((user) => {
                if (!search) return true;
                return user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search);
            })
            .slice(0, limit)
            .map((user: any) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role?.name || 'Unassigned',
                isActive: user.isActive,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
            }));

        sendSuccess(res, {
            company: { id: company.id, name: company.name },
            users: filtered,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/users/:userId/status', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.get('/tenants/:id/usage', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.patch('/tenants/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = statusSchema.parse(req.body);
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);

        const updated = await basePrisma.company.update({
            where: { id: companyId as any },
            data: {
                settings: mergeCompanySuperAdminSettings(company.settings, {
                    status: parsed.status,
                    statusReason: parsed.reason || '',
                }) as any,
            },
        });

        if (parsed.status === 'Suspended') {
            await basePrisma.user.updateMany({
                where: { companyId: companyId as any, id: { not: req.user!.id } },
                data: { isActive: false },
            });
        }

        await writeAudit(companyId as any, req.user!.id, `TENANT_${parsed.status.toUpperCase()}`, 'Company', companyId as any, {
            status: parsed.status,
            reason: parsed.reason || '',
        });

        sendSuccess(res, {
            id: updated.id,
            status: parsed.status,
            statusReason: parsed.reason || '',
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/features', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const parsed = featureSchema.parse(req.body);
        const companyId = String(req.params.id);
        const company = await getTenantCompanyOrThrow(companyId);

        const updated = await basePrisma.company.update({
            where: { id: companyId as any },
            data: {
                settings: mergeCompanySuperAdminSettings(company.settings, {
                    featureFlags: parsed.featureFlags,
                }) as any,
            },
        });

        await writeAudit(companyId as string, req.user!.id, 'TENANT_FEATURE_FLAGS_UPDATED', 'Company', companyId as string, parsed.featureFlags);

        sendSuccess(res, {
            id: updated.id,
            featureFlags: parsed.featureFlags,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/plan', async (req: Request, res: Response, next: NextFunction) => {
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
        });

        sendSuccess(res, {
            plan: parsed.plan,
            billing: updatedBilling,
        });
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/limits', async (req: Request, res: Response, next: NextFunction) => {
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

        await basePrisma.company.update({
            where: { id: companyId as any },
            data: {
                settings: mergeCompanySuperAdminSettings(company.settings, {
                    limits: updatedLimits,
                }) as any,
            },
        });

        await writeAudit(companyId as string, req.user!.id, 'TENANT_LIMITS_UPDATED', 'Company', companyId as string, updatedLimits);
        sendSuccess(res, updatedLimits);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.patch('/tenants/:id/maintenance', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.get('/announcements', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await loadAnnouncementRows();
        const summary = buildAnnouncementSummary(rows);
        sendSuccess(res, summary);
    } catch (error) {
        next(error);
    }
});

superAdminRoutes.post('/announcements/broadcast', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.post('/announcements/tenant/:id', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.patch('/announcements/:id', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.delete('/announcements/:id', async (req: Request, res: Response, next: NextFunction) => {
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

superAdminRoutes.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const action = String(req.query.action || '').trim();
        const companyId = String(req.query.companyId || '').trim();
        const search = String(req.query.search || '').trim().toLowerCase();
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();

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

        const mapped = audit.map((row) => ({
            id: row.id,
            actor: row.user?.email || row.user?.name || 'unknown',
            action: row.action,
            target: `${row.entity}${row.entityId ? ` (${row.entityId})` : ''}`,
            company: row.company?.name || 'unknown',
            createdAt: row.createdAt,
        }));

        const filtered = mapped
            .filter((row) => {
                if (!search) return true;
                const haystack = `${row.actor} ${row.action} ${row.target} ${row.company}`.toLowerCase();
                return haystack.includes(search);
            })
            .slice(0, limit);

        sendSuccess(res, filtered);
    } catch (error) {
        next(error);
    }
});
