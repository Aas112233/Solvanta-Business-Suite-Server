import type { Request } from 'express';
import { basePrisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import {
    type FeatureFlags,
    type SuperAdminSettings,
    type TenantLimitEnforcementMeta,
    type TenantLimitResourceKey,
    type TenantLimits,
    type TenantStatus,
    getSuperAdminSettings,
    resolveFeatureFlags,
    resolveTenantLimitEnforcementMeta,
    resolveTenantLimits,
    resolveTenantStatusMeta,
    sanitizeTenantStatus,
} from './super-admin.settings.js';

export const TENANT_LIMIT_GRACE_DAYS = 7;

export type TenantHealthStatus = 'Healthy' | 'Warning' | 'Critical';
export type TenantHealthTrend = 'Improving' | 'Stable' | 'Declining';

export interface TenantUsageCounts {
    users: number;
    branches: number;
    products: number;
}

export interface TenantLimitMetric {
    key: TenantLimitResourceKey;
    label: string;
    count: number;
    limit: number | null;
    percentUsed: number | null;
    warningLevel: 'none' | '80' | '90' | '100';
    isBreached: boolean;
    remaining: number | null;
}

export interface TenantLimitSnapshot {
    counts: TenantUsageCounts;
    limits: TenantLimits;
    metrics: Record<TenantLimitResourceKey, TenantLimitMetric>;
    warnings: TenantLimitMetric[];
    breached: TenantLimitMetric[];
    breachStartedAt: string;
    graceEndsAt: string;
    daysUntilAutoSuspend: number | null;
    autoSuspendedAt: string;
    status: 'ok' | 'warning' | 'breached';
}

export interface TenantModuleUsageItem {
    key: keyof FeatureFlags;
    enabled: boolean;
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    eventCount30d: number;
    lastUsedAt: string;
    adoptionRate: number;
    status: 'disabled' | 'unused' | 'adopted';
    trend7d: Array<{ date: string; events: number }>;
}

export interface TenantModuleUsageSummary {
    enabledModules: number;
    adoptedModules: number;
    unusedEnabledModules: string[];
}

export interface TenantHealthSummary {
    score: number;
    status: TenantHealthStatus;
    trend: TenantHealthTrend;
    drivers: string[];
}

const RESOURCE_LABELS: Record<TenantLimitResourceKey, string> = {
    users: 'Users',
    branches: 'Branches',
    products: 'Products',
};

const LIMIT_FIELD_MAP: Record<TenantLimitResourceKey, keyof TenantLimits> = {
    users: 'maxUsers',
    branches: 'maxBranches',
    products: 'maxProducts',
};

const ENTITY_MODULE_MAP: Record<string, keyof FeatureFlags> = {
    Account: 'accounting',
    AccountMapping: 'accounting',
    BankAccount: 'accounting',
    BankReconciliation: 'accounting',
    BankStatementImport: 'accounting',
    BankTransaction: 'accounting',
    Bom: 'bom',
    Brand: 'inventory',
    Category: 'inventory',
    Customer: 'crm',
    Expense: 'accounting',
    GlobalString: 'reports',
    InventoryStock: 'inventory',
    ItemGroup: 'inventory',
    JournalEntry: 'accounting',
    POSInvoice: 'pos',
    POSShift: 'pos',
    POSTerminal: 'pos',
    PeriodClose: 'accounting',
    PriceGroup: 'inventory',
    Product: 'inventory',
    ProductPriceGroup: 'inventory',
    ProductUnit: 'inventory',
    ProductionCompletion: 'production',
    ProductionMaterialConsumption: 'production',
    ProductionOrder: 'production',
    PurchaseInvoice: 'purchases',
    PurchaseOrder: 'purchases',
    PurchasePayment: 'purchases',
    PurchaseReturn: 'purchases',
    Role: 'reports',
    SalesOrder: 'reports',
    SalesQuotation: 'reports',
    SalesReturn: 'reports',
    StockCount: 'inventory',
    StockMovement: 'inventory',
    Supplier: 'crm',
    Tax: 'accounting',
    Transfer: 'inventory',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCompanySettings(settings: unknown): Record<string, unknown> {
    if (!isRecord(settings)) return {};
    return settings;
}

export function mergeCompanySuperAdminSettings(companySettings: unknown, patch: Partial<SuperAdminSettings>) {
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

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function diffInDays(fromIso: string, to = new Date()) {
    const from = new Date(fromIso);
    if (Number.isNaN(from.getTime())) return 0;
    return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function resolveWarningLevel(count: number, limit: number | null): TenantLimitMetric['warningLevel'] {
    if (!limit || limit <= 0) return 'none';
    const percent = (count / limit) * 100;
    if (percent >= 100) return '100';
    if (percent >= 90) return '90';
    if (percent >= 80) return '80';
    return 'none';
}

export async function getTenantUsageCounts(companyId: string): Promise<TenantUsageCounts> {
    const [users, branches, products] = await Promise.all([
        basePrisma.user.count({ where: { companyId } }),
        basePrisma.branch.count({ where: { companyId } }),
        basePrisma.product.count({ where: { companyId, deletedAt: { isSet: false } } }),
    ]);

    return { users, branches, products };
}

export function buildTenantLimitSnapshot(
    counts: TenantUsageCounts,
    limits: TenantLimits,
    meta?: Partial<TenantLimitEnforcementMeta>,
): TenantLimitSnapshot {
    const resolvedMeta = resolveTenantLimitEnforcementMeta(meta);
    const metrics = (Object.keys(RESOURCE_LABELS) as TenantLimitResourceKey[]).reduce((acc, key) => {
        const limit = limits[LIMIT_FIELD_MAP[key]];
        const count = counts[key];
        const warningLevel = resolveWarningLevel(count, limit);
        const percentUsed = limit ? Math.round((count / limit) * 100) : null;
        const isBreached = limit !== null && count > limit;

        acc[key] = {
            key,
            label: RESOURCE_LABELS[key],
            count,
            limit,
            percentUsed,
            warningLevel,
            isBreached,
            remaining: limit === null ? null : Math.max(limit - count, 0),
        };

        return acc;
    }, {} as Record<TenantLimitResourceKey, TenantLimitMetric>);

    const warnings = Object.values(metrics).filter((metric) => metric.warningLevel !== 'none');
    const breached = warnings.filter((metric) => metric.isBreached);

    let breachStartedAt = '';
    let graceEndsAt = '';
    let autoSuspendedAt = '';
    let daysUntilAutoSuspend: number | null = null;

    if (breached.length > 0) {
        breachStartedAt = resolvedMeta.breachStartedAt || new Date().toISOString();
        graceEndsAt = resolvedMeta.graceEndsAt || addDays(new Date(breachStartedAt), TENANT_LIMIT_GRACE_DAYS).toISOString();
        autoSuspendedAt = resolvedMeta.autoSuspendedAt;

        if (!autoSuspendedAt) {
            const daysRemaining = Math.ceil((new Date(graceEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            daysUntilAutoSuspend = Math.max(daysRemaining, 0);
        }
    }

    return {
        counts,
        limits,
        metrics,
        warnings,
        breached,
        breachStartedAt,
        graceEndsAt,
        daysUntilAutoSuspend,
        autoSuspendedAt,
        status: breached.length > 0 ? 'breached' : warnings.length > 0 ? 'warning' : 'ok',
    };
}

export async function syncTenantLimitEnforcement(
    companyId: string,
    options: {
        actorUserId?: string;
        actorEmail?: string;
        companySettings?: unknown;
        request?: Request;
    } = {},
) {
    const company = options.companySettings === undefined
        ? await basePrisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, settings: true },
        })
        : { id: companyId, settings: options.companySettings };

    if (!company) throw AppError.notFound('Company');

    const settings = getSuperAdminSettings(company.settings);
    const limits = resolveTenantLimits(settings.limits);
    const currentStatus = sanitizeTenantStatus(settings.status) ?? 'Active';
    const currentStatusMeta = resolveTenantStatusMeta(settings.statusMeta);
    const currentEnforcement = resolveTenantLimitEnforcementMeta(settings.limitEnforcement);

    if (limits.maxUsers === null && limits.maxBranches === null && limits.maxProducts === null) {
        if (
            currentEnforcement.breachStartedAt
            || currentEnforcement.autoSuspendedAt
            || currentEnforcement.breachedResources.length > 0
        ) {
            const mergedSettings = mergeCompanySuperAdminSettings(company.settings, {
                limitEnforcement: {
                    breachStartedAt: '',
                    breachedResources: [],
                    graceEndsAt: '',
                    lastEvaluatedAt: new Date().toISOString(),
                    autoSuspendedAt: '',
                    lastWarningLevel: 'none',
                },
            });

            await basePrisma.company.update({
                where: { id: companyId },
                data: { settings: mergedSettings as any },
            });

            return {
                limitSnapshot: buildTenantLimitSnapshot({ users: 0, branches: 0, products: 0 }, limits),
                companySettings: mergedSettings,
            };
        }

        return {
            limitSnapshot: buildTenantLimitSnapshot({ users: 0, branches: 0, products: 0 }, limits),
            companySettings: company.settings,
        };
    }

    const counts = await getTenantUsageCounts(companyId);
    const baseSnapshot = buildTenantLimitSnapshot(counts, limits, currentEnforcement);
    const nowIso = new Date().toISOString();
    const breachedResources = baseSnapshot.breached.map((metric) => metric.key);
    const highestWarningLevel = baseSnapshot.warnings.some((metric) => metric.warningLevel === '100')
        ? '100'
        : baseSnapshot.warnings.some((metric) => metric.warningLevel === '90')
            ? '90'
            : baseSnapshot.warnings.some((metric) => metric.warningLevel === '80')
                ? '80'
                : 'none';

    const nextLimitEnforcement: TenantLimitEnforcementMeta = {
        breachStartedAt: breachedResources.length > 0 ? (currentEnforcement.breachStartedAt || nowIso) : '',
        breachedResources,
        graceEndsAt:
            breachedResources.length > 0
                ? (currentEnforcement.graceEndsAt || addDays(new Date(currentEnforcement.breachStartedAt || nowIso), TENANT_LIMIT_GRACE_DAYS).toISOString())
                : '',
        lastEvaluatedAt: nowIso,
        autoSuspendedAt: breachedResources.length > 0 ? currentEnforcement.autoSuspendedAt : '',
        lastWarningLevel: highestWarningLevel,
    };

    const shouldAutoSuspend = Boolean(
        breachedResources.length > 0
        && nextLimitEnforcement.graceEndsAt
        && !nextLimitEnforcement.autoSuspendedAt
        && new Date(nextLimitEnforcement.graceEndsAt).getTime() <= Date.now(),
    );

    if (shouldAutoSuspend) {
        nextLimitEnforcement.autoSuspendedAt = nowIso;
    }

    const patches: Partial<SuperAdminSettings> = {
        limitEnforcement: nextLimitEnforcement,
    };

    if (shouldAutoSuspend && currentStatus !== 'Suspended') {
        patches.status = 'Suspended';
        patches.statusReason = `Auto-suspended after exceeding configured resource limits for more than ${TENANT_LIMIT_GRACE_DAYS} days.`;
        patches.statusMeta = {
            changedAt: nowIso,
            changedBy: 'System (resource limits)',
            suspendedUserIds: currentStatusMeta.suspendedUserIds,
        };
    }

    const mergedSettings = mergeCompanySuperAdminSettings(company.settings, patches);
    const hasStateChange =
        currentEnforcement.breachStartedAt !== nextLimitEnforcement.breachStartedAt
        || currentEnforcement.graceEndsAt !== nextLimitEnforcement.graceEndsAt
        || currentEnforcement.autoSuspendedAt !== nextLimitEnforcement.autoSuspendedAt
        || currentEnforcement.lastWarningLevel !== nextLimitEnforcement.lastWarningLevel
        || JSON.stringify(currentEnforcement.breachedResources) !== JSON.stringify(nextLimitEnforcement.breachedResources)
        || shouldAutoSuspend;

    if (hasStateChange) {
        await basePrisma.company.update({
            where: { id: companyId },
            data: { settings: mergedSettings as any },
        });

        if (shouldAutoSuspend && options.actorUserId) {
            await basePrisma.auditLog.create({
                data: {
                    companyId,
                    userId: options.actorUserId,
                    action: 'TENANT_AUTO_SUSPENDED_LIMITS',
                    entity: 'Company',
                    entityId: companyId,
                    before: {
                        status: currentStatus,
                        breachStartedAt: currentEnforcement.breachStartedAt,
                    } as any,
                    after: {
                        status: 'Suspended',
                        reason: patches.statusReason,
                        breachedResources,
                        graceEndsAt: nextLimitEnforcement.graceEndsAt,
                        triggeredBy: options.actorEmail || 'system',
                    } as any,
                    ipAddress: options.request?.ip || options.request?.socket?.remoteAddress || null,
                    userAgent: options.request?.get('user-agent') || null,
                },
            });
        }
    }

    return {
        limitSnapshot: buildTenantLimitSnapshot(counts, limits, nextLimitEnforcement),
        companySettings: mergedSettings,
    };
}

export async function enforceTenantCreateWithinLimit(
    companyId: string,
    resource: TenantLimitResourceKey,
    options: {
        actorUserId?: string;
        actorEmail?: string;
        request?: Request;
    } = {},
) {
    const { limitSnapshot } = await syncTenantLimitEnforcement(companyId, options);
    const metric = limitSnapshot.metrics[resource];

    if (metric.limit !== null && metric.count >= metric.limit) {
        throw AppError.forbidden(
            `${metric.label} limit reached (${metric.count}/${metric.limit}). Increase the tenant limit or remove unused ${resource} before creating more.`,
        );
    }

    return limitSnapshot;
}

export function buildTenantModuleUsage(
    featureFlags: FeatureFlags,
    activeUsers: number,
    companyEvents: Array<{ userId: string; entity: string; createdAt: Date }>,
    now = new Date(),
) {
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const trendDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now);
        date.setUTCDate(now.getUTCDate() - (6 - index));
        return date.toISOString().slice(0, 10);
    });

    const usage = (Object.keys(featureFlags) as Array<keyof FeatureFlags>).reduce((acc, moduleKey) => {
        const moduleEvents = companyEvents.filter((event) => ENTITY_MODULE_MAP[event.entity] === moduleKey);
        const dailyUsers = new Set(moduleEvents.filter((event) => event.createdAt >= dayStart).map((event) => event.userId));
        const weeklyUsers = new Set(moduleEvents.filter((event) => event.createdAt >= weekStart).map((event) => event.userId));
        const monthlyEvents = moduleEvents.filter((event) => event.createdAt >= monthStart);
        const monthlyUsers = new Set(monthlyEvents.map((event) => event.userId));
        const lastUsedAt = monthlyEvents[0]?.createdAt?.toISOString()
            || moduleEvents[0]?.createdAt?.toISOString()
            || '';
        const enabled = featureFlags[moduleKey];
        const trend7d = trendDays.map((date) => ({
            date: date.slice(5),
            events: monthlyEvents.filter((event) => event.createdAt.toISOString().slice(0, 10) === date).length,
        }));
        const adoptionRate = activeUsers > 0 ? Math.round((monthlyUsers.size / activeUsers) * 100) : 0;
        const status: TenantModuleUsageItem['status'] =
            !enabled ? 'disabled' : monthlyUsers.size > 0 ? 'adopted' : 'unused';

        acc[moduleKey] = {
            key: moduleKey,
            enabled,
            dailyActiveUsers: dailyUsers.size,
            weeklyActiveUsers: weeklyUsers.size,
            monthlyActiveUsers: monthlyUsers.size,
            eventCount30d: monthlyEvents.length,
            lastUsedAt,
            adoptionRate,
            status,
            trend7d,
        };

        return acc;
    }, {} as Record<keyof FeatureFlags, TenantModuleUsageItem>);

    const enabledModuleKeys = (Object.keys(featureFlags) as Array<keyof FeatureFlags>).filter((key) => featureFlags[key]);
    const adoptedModules = enabledModuleKeys.filter((key) => usage[key].monthlyActiveUsers > 0);

    const summary: TenantModuleUsageSummary = {
        enabledModules: enabledModuleKeys.length,
        adoptedModules: adoptedModules.length,
        unusedEnabledModules: enabledModuleKeys.filter((key) => usage[key].monthlyActiveUsers === 0),
    };

    return { usage, summary };
}

export function buildTenantHealthSummary(input: {
    status: TenantStatus;
    activeUsers: number;
    totalUsers: number;
    failedPayments: number;
    lastActivityAt: Date;
    limitSnapshot: TenantLimitSnapshot;
    moduleSummary: TenantModuleUsageSummary;
}) {
    let score = 100;
    const drivers: string[] = [];

    const activeRatio = input.totalUsers > 0 ? input.activeUsers / input.totalUsers : 0;
    if (activeRatio < 0.5) {
        score -= 20;
        drivers.push('Low active-user ratio');
    } else if (activeRatio < 0.75) {
        score -= 10;
    }

    if (input.failedPayments >= 3) {
        score -= 20;
        drivers.push('Repeated failed payments');
    } else if (input.failedPayments > 0) {
        score -= 10;
        drivers.push('Recent payment failures');
    }

    if (input.limitSnapshot.status === 'breached') {
        score -= 25;
        drivers.push('Resource limits exceeded');
    } else if (input.limitSnapshot.status === 'warning') {
        score -= 10;
        drivers.push('Approaching configured resource limits');
    }

    const inactiveDays = diffInDays(input.lastActivityAt.toISOString());
    if (inactiveDays >= 14) {
        score -= 20;
        drivers.push('Low login activity');
    } else if (inactiveDays >= 7) {
        score -= 10;
    }

    const adoptionRatio = input.moduleSummary.enabledModules > 0
        ? input.moduleSummary.adoptedModules / input.moduleSummary.enabledModules
        : 1;
    if (adoptionRatio < 0.4) {
        score -= 15;
        drivers.push('Low module adoption');
    } else if (adoptionRatio < 0.7) {
        score -= 8;
    }

    if (input.status === 'Suspended') {
        score = Math.min(score, 35);
        drivers.push('Tenant currently suspended');
    }

    score = Math.max(0, Math.min(100, score));
    const status: TenantHealthStatus = score >= 80 ? 'Healthy' : score >= 60 ? 'Warning' : 'Critical';
    const trend: TenantHealthTrend =
        input.limitSnapshot.status === 'breached' || input.failedPayments > 0 || inactiveDays >= 14
            ? 'Declining'
            : adoptionRatio >= 0.7 && inactiveDays <= 3
                ? 'Improving'
                : 'Stable';

    return {
        score,
        status,
        trend,
        drivers,
    };
}
