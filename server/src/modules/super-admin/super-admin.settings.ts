export type TenantStatus = 'Active' | 'Trial' | 'Suspended';
export type TenantPlan = 'Starter' | 'Growth' | 'SOLVANTA';
export type ModuleKey = 'crm' | 'inventory' | 'purchases' | 'accounting' | 'pos' | 'reports' | 'bom' | 'production';

export interface FeatureFlags {
    crm: boolean;
    inventory: boolean;
    purchases: boolean;
    accounting: boolean;
    pos: boolean;
    reports: boolean;
    bom: boolean;
    production: boolean;
}

export interface TenantBilling {
    monthlyRevenue: number;
    failedPayments: number;
    nextBillingDate: string;
}

export interface TenantLimits {
    maxUsers: number | null;
    maxBranches: number | null;
    maxProducts: number | null;
}

export type TenantLimitResourceKey = 'users' | 'branches' | 'products';
export type TenantLimitWarningLevel = 'none' | '80' | '90' | '100';

export interface TenantLimitEnforcementMeta {
    breachStartedAt: string;
    breachedResources: TenantLimitResourceKey[];
    graceEndsAt: string;
    lastEvaluatedAt: string;
    autoSuspendedAt: string;
    lastWarningLevel: TenantLimitWarningLevel;
}

export interface TenantMaintenance {
    enabled: boolean;
    message: string;
}

export interface TenantStatusMeta {
    changedAt: string;
    changedBy: string;
    suspendedUserIds: string[];
}

export interface SuperAdminSettings {
    status?: TenantStatus;
    statusReason?: string;
    statusMeta?: Partial<TenantStatusMeta>;
    featureFlags?: Partial<FeatureFlags>;
    planOverride?: TenantPlan;
    billing?: Partial<TenantBilling>;
    limits?: Partial<TenantLimits>;
    limitEnforcement?: Partial<TenantLimitEnforcementMeta>;
    maintenance?: Partial<TenantMaintenance>;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    crm: true,
    inventory: true,
    purchases: true,
    accounting: true,
    pos: true,
    reports: true,
    bom: true,
    production: true,
};

const DEFAULT_BILLING: TenantBilling = {
    monthlyRevenue: 0,
    failedPayments: 0,
    nextBillingDate: '',
};

const DEFAULT_LIMITS: TenantLimits = {
    maxUsers: null,
    maxBranches: null,
    maxProducts: null,
};

const DEFAULT_MAINTENANCE: TenantMaintenance = {
    enabled: false,
    message: '',
};

const DEFAULT_STATUS_META: TenantStatusMeta = {
    changedAt: '',
    changedBy: '',
    suspendedUserIds: [],
};

const DEFAULT_LIMIT_ENFORCEMENT_META: TenantLimitEnforcementMeta = {
    breachStartedAt: '',
    breachedResources: [],
    graceEndsAt: '',
    lastEvaluatedAt: '',
    autoSuspendedAt: '',
    lastWarningLevel: 'none',
};

function isPlainObject(input: unknown): input is Record<string, unknown> {
    return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

function sanitizePositiveNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    return fallback;
}

function sanitizeNullableLimit(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
    return null;
}

function sanitizeDateString(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
}

export function getSuperAdminSettings(settings: unknown): SuperAdminSettings {
    if (!isPlainObject(settings)) return {};
    const raw = settings.superAdmin;
    if (!isPlainObject(raw)) return {};
    return raw as SuperAdminSettings;
}

export function sanitizeTenantStatus(rawStatus: unknown): TenantStatus | undefined {
    if (rawStatus === 'Active' || rawStatus === 'Trial' || rawStatus === 'Suspended') {
        return rawStatus;
    }
    return undefined;
}

export function sanitizeTenantPlan(rawPlan: unknown): TenantPlan | undefined {
    if (rawPlan === 'Starter' || rawPlan === 'Growth' || rawPlan === 'SOLVANTA') {
        return rawPlan;
    }
    return undefined;
}

export function resolveFeatureFlags(raw?: Partial<FeatureFlags>): FeatureFlags {
    return {
        ...DEFAULT_FEATURE_FLAGS,
        ...(raw || {}),
    };
}

export function resolveTenantBilling(raw?: Partial<TenantBilling>): TenantBilling {
    return {
        monthlyRevenue: sanitizePositiveNumber(raw?.monthlyRevenue, DEFAULT_BILLING.monthlyRevenue),
        failedPayments: Math.floor(sanitizePositiveNumber(raw?.failedPayments, DEFAULT_BILLING.failedPayments)),
        nextBillingDate: sanitizeDateString(raw?.nextBillingDate),
    };
}

export function resolveTenantLimits(raw?: Partial<TenantLimits>): TenantLimits {
    return {
        maxUsers: sanitizeNullableLimit(raw?.maxUsers),
        maxBranches: sanitizeNullableLimit(raw?.maxBranches),
        maxProducts: sanitizeNullableLimit(raw?.maxProducts),
    };
}

export function resolveTenantMaintenance(raw?: Partial<TenantMaintenance>): TenantMaintenance {
    const enabled = raw?.enabled === true;
    const message = typeof raw?.message === 'string' ? raw.message.trim().slice(0, 300) : '';
    return {
        ...DEFAULT_MAINTENANCE,
        enabled,
        message,
    };
}

export function resolveTenantStatusMeta(raw?: Partial<TenantStatusMeta>): TenantStatusMeta {
    const changedAt = sanitizeDateString(raw?.changedAt);
    const changedBy = typeof raw?.changedBy === 'string' ? raw.changedBy.trim().slice(0, 160) : '';
    const suspendedUserIds = Array.from(
        new Set(
            Array.isArray(raw?.suspendedUserIds)
                ? raw!.suspendedUserIds
                    .filter((value): value is string => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter(Boolean)
                : [],
        ),
    );

    return {
        ...DEFAULT_STATUS_META,
        changedAt,
        changedBy,
        suspendedUserIds,
    };
}

export function resolveTenantLimitEnforcementMeta(raw?: Partial<TenantLimitEnforcementMeta>): TenantLimitEnforcementMeta {
    const breachStartedAt = sanitizeDateString(raw?.breachStartedAt);
    const graceEndsAt = sanitizeDateString(raw?.graceEndsAt);
    const lastEvaluatedAt = sanitizeDateString(raw?.lastEvaluatedAt);
    const autoSuspendedAt = sanitizeDateString(raw?.autoSuspendedAt);
    const breachedResources = Array.from(
        new Set(
            Array.isArray(raw?.breachedResources)
                ? raw!.breachedResources
                    .filter((value): value is TenantLimitResourceKey => value === 'users' || value === 'branches' || value === 'products')
                : [],
        ),
    );
    const lastWarningLevel =
        raw?.lastWarningLevel === '80'
        || raw?.lastWarningLevel === '90'
        || raw?.lastWarningLevel === '100'
            ? raw.lastWarningLevel
            : 'none';

    return {
        ...DEFAULT_LIMIT_ENFORCEMENT_META,
        breachStartedAt,
        breachedResources,
        graceEndsAt,
        lastEvaluatedAt,
        autoSuspendedAt,
        lastWarningLevel,
    };
}

export function permissionToModule(permission: string): ModuleKey | null {
    const module = permission.split('.')[0];
    if (module === 'crm') return 'crm';
    if (module === 'inventory') return 'inventory';
    if (module === 'purchase') return 'purchases';
    if (module === 'accounting') return 'accounting';
    if (module === 'pos') return 'pos';
    if (module === 'reports') return 'reports';
    if (module === 'bom') return 'bom';
    if (module === 'production') return 'production';
    return null;
}
