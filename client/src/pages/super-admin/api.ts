import api from '../../lib/api';

export type HealthStatus = 'Healthy' | 'Warning' | 'Critical';
export type TenantStatus = 'Active' | 'Trial' | 'Suspended';
export type TenantPlan = 'Starter' | 'Growth' | 'SOLVANTA';
export type TenantHealthTrend = 'Improving' | 'Stable' | 'Declining';
export type PaymentStatus = 'Current' | 'At Risk' | 'Overdue';
export type LimitState = 'ok' | 'warning' | 'breached';

export type FeatureFlags = {
    crm: boolean;
    inventory: boolean;
    purchases: boolean;
    accounting: boolean;
    pos: boolean;
    reports: boolean;
    bom: boolean;
    production: boolean;
    sales: boolean;
    items: boolean;
    suppliers: boolean;
    hr: boolean;
};

export type TenantLimits = {
    maxUsers: number | null;
    maxBranches: number | null;
    maxProducts: number | null;
};

export type TenantMaintenance = {
    enabled: boolean;
    message: string;
};

export type LimitWarning = {
    key: 'users' | 'branches' | 'products';
    label: string;
    percentUsed: number | null;
    count: number;
    limit: number | null;
    warningLevel: 'none' | '80' | '90' | '100';
    isBreached: boolean;
};

export type ModuleUsageItem = {
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
};

export type ModuleUsageSummary = {
    enabledModules: number;
    adoptedModules: number;
    unusedEnabledModules: string[];
};

export interface CreateTenantPayload {
    company: {
        name: string;
        currency: string;
        vatNumber?: string;
        logoUrl?: string;
        contactPhone?: string;
        contactEmail?: string;
        contactWebsite?: string;
        contactAddress?: string;
        timezone?: string;
        dateFormat?: string;
        timeFormat?: '12H' | '24H';
        language?: string;
    };
    adminUser: {
        name: string;
        email: string;
        password: string;
        phone?: string;
    };
    headOffice?: {
        name: string;
        code: string;
        address?: string;
        phone?: string;
    };
    plan?: TenantPlan;
    featureFlags?: FeatureFlags;
}

export interface Tenant {
    id: string;
    name: string;
    currency?: string;
    plan: TenantPlan;
    status: TenantStatus;
    statusReason: string;
    statusChangedAt: string;
    statusChangedBy: string;
    suspendedUserCount: number;
    featureFlags: FeatureFlags;
    monthlyRevenue: number;
    failedPayments: number;
    nextBillingDate: string;
    paymentStatus: PaymentStatus;
    limits: TenantLimits;
    limitState: LimitState;
    limitWarnings: LimitWarning[];
    breachStartedAt: string;
    graceEndsAt: string;
    daysUntilAutoSuspend: number | null;
    autoSuspendedAt: string;
    maintenance: TenantMaintenance;
    totalUsers: number;
    activeUsers: number;
    totalBranches: number;
    totalProducts: number;
    moduleUsageSummary: ModuleUsageSummary;
    moduleUsage: Record<keyof FeatureFlags, ModuleUsageItem>;
    healthScore: number;
    healthStatus: HealthStatus;
    healthTrend: TenantHealthTrend;
    healthDrivers: string[];
    trialEndsAt: string;
    daysToTrialEnd: number | null;
    lastActivityAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface AuditItem {
    id: string;
    actor: string;
    action: string;
    target: string;
    company: string;
    companyId: string;
    severity: 'Info' | 'Warning' | 'Critical';
    before: unknown;
    after: unknown;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
}

export interface SupportSessionListItem {
    sessionId: string;
    actor: string;
    actorEmail: string;
    companyId: string;
    company: string;
    targetUserId: string;
    targetUserEmail: string;
    reason: string;
    startedAt: string;
    endedAt: string | null;
    lastActivityAt: string;
    noteCount: number;
    activityCount: number;
    status: 'Active' | 'Ended';
}

export interface SupportSessionTranscriptItem {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    actor: string;
    company: string;
    companyId: string;
    createdAt: string;
    before: unknown;
    after: any;
    kind: 'session' | 'note' | 'activity';
}

export type AnnouncementAudience = 'all-tenants' | 'single-tenant';
export type AnnouncementLevel = 'info' | 'warning' | 'critical';

export interface SuperAdminAnnouncement {
    id: string;
    broadcastId: string;
    title: string;
    message: string;
    level: AnnouncementLevel;
    audience: AnnouncementAudience;
    expiresAt: string | null;
    isExpired: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
    targetCompanyId: string | null;
    targetCompanyName: string | null;
    tenantCount: number;
}

export interface OverviewResponse {
    kpis: {
        totalTenants: number;
        activeTenants: number;
        trialTenants: number;
        suspendedTenants: number;
        totalUsers: number;
        mrr: number;
        failedPayments: number;
        maintenanceTenants: number;
        breachedLimitTenants: number;
        averageHealthScore: number;
    };
    health: { id: string; label: string; value: string; status: HealthStatus }[];
    charts: {
        tenantGrowth: Array<{ month: string; tenants: number }>;
        healthDistribution: Array<{ name: string; value: number }>;
        planDistribution: Array<{ name: string; value: number }>;
        moduleAdoption: Array<{ module: string; adopted: number; unused: number }>;
    };
    attentionTenants: Array<{
        id: string;
        name: string;
        healthScore: number;
        healthStatus: HealthStatus;
        limitState: LimitState;
        failedPayments: number;
    }>;
}

export interface TenantUser {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    canImpersonate?: boolean;
    lastLoginAt: string | null;
    createdAt: string;
}

export interface TenantControlCenterResponse {
    tenant: Tenant;
    usage: {
        users: number;
        branches: number;
        products: number;
    };
    users: TenantUser[];
}

export interface TenantUsageResponse {
    company: { id: string; name: string };
    counts: {
        branches: number;
        users: number;
        roles: number;
        products: number;
        customers: number;
        suppliers: number;
        posInvoices: number;
        purchaseInvoices: number;
        stockCounts: number;
    };
}

export async function fetchSuperAdminOverview() {
    const res = await api.get('/super-admin/overview');
    return res.data.data as OverviewResponse;
}

export async function fetchSuperAdminTenants(filters: {
    status?: string;
    plan?: string;
    maintenance?: string;
    paymentStatus?: string;
    limitState?: string;
    healthStatus?: string;
    healthMin?: number;
    healthMax?: number;
    trialEndingWithinDays?: number;
    module?: string;
    search?: string;
} = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    });

    const query = params.toString();
    const res = await api.get(`/super-admin/tenants${query ? `?${query}` : ''}`);
    return res.data.data as Tenant[];
}

export async function fetchSuperAdminAudit(filters: {
    limit?: number;
    action?: string;
    companyId?: string;
    search?: string;
    from?: string;
    to?: string;
} = {}) {
    const params = new URLSearchParams();
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.action) params.set('action', filters.action);
    if (filters.companyId) params.set('companyId', filters.companyId);
    if (filters.search) params.set('search', filters.search);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);

    const res = await api.get(`/super-admin/audit?${params.toString()}`);
    return (res.data.data as AuditItem[]).map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toLocaleString(),
    }));
}

export async function exportSuperAdminAuditCsv(filters: {
    action?: string;
    companyId?: string;
    search?: string;
    from?: string;
    to?: string;
} = {}) {
    const params = new URLSearchParams();
    params.set('format', 'csv');
    if (filters.action) params.set('action', filters.action);
    if (filters.companyId) params.set('companyId', filters.companyId);
    if (filters.search) params.set('search', filters.search);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);

    const res = await api.get(`/super-admin/audit?${params.toString()}`, { responseType: 'blob' });
    return res.data as Blob;
}

export async function fetchSupportSessions(filters: {
    companyId?: string;
    actor?: string;
    sessionId?: string;
    status?: 'All' | 'Active' | 'Ended';
    search?: string;
} = {}) {
    const params = new URLSearchParams();
    if (filters.companyId) params.set('companyId', filters.companyId);
    if (filters.actor) params.set('actor', filters.actor);
    if (filters.sessionId) params.set('sessionId', filters.sessionId);
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);

    const res = await api.get(`/super-admin/audit/support-sessions${params.toString() ? `?${params.toString()}` : ''}`);
    return res.data.data as SupportSessionListItem[];
}

export async function fetchSupportSessionTranscript(sessionId: string) {
    const res = await api.get(`/super-admin/audit/support-sessions/${sessionId}`);
    return res.data.data as {
        sessionId: string;
        company: string;
        companyId: string;
        actor: string;
        actorEmail: string;
        targetUserId: string;
        targetUserEmail: string;
        reason: string;
        startedAt: string;
        endedAt: string | null;
        transcript: SupportSessionTranscriptItem[];
    };
}

export async function exportSupportSessionTranscriptCsv(sessionId: string) {
    const res = await api.get(`/super-admin/audit/support-sessions/${sessionId}?format=csv`, {
        responseType: 'blob',
    });
    return res.data as Blob;
}

export async function fetchTenantUsage(tenantId: string) {
    const res = await api.get(`/super-admin/tenants/${tenantId}/usage`);
    return res.data.data as TenantUsageResponse;
}

export async function updateTenantStatus(tenantId: string, status: 'Active' | 'Suspended', reason?: string) {
    const res = await api.patch(`/super-admin/tenants/${tenantId}/status`, { status, reason });
    return res.data.data as {
        id: string;
        status: TenantStatus;
        statusReason: string;
        statusChangedAt: string;
        statusChangedBy: string;
        affectedUsers: number;
    };
}

export async function updateTenantFeatures(tenantId: string, featureFlags: FeatureFlags) {
    await api.patch(`/super-admin/tenants/${tenantId}/features`, { featureFlags });
}

export async function bulkUpdateTenantStatus(payload: {
    tenantIds: string[];
    status: 'Active' | 'Suspended';
    reason?: string;
}) {
    const res = await api.patch('/super-admin/tenants/bulk/status', payload);
    return res.data.data as {
        updated: number;
        status: TenantStatus;
        tenants: Array<{
            id: string;
            status: TenantStatus;
            statusReason: string;
            statusChangedAt: string;
            statusChangedBy: string;
            affectedUsers: number;
        }>;
    };
}

export async function bulkUpdateTenantFeatures(payload: {
    tenantIds: string[];
    featureFlags: FeatureFlags;
}) {
    const res = await api.patch('/super-admin/tenants/bulk/features', payload);
    return res.data.data as {
        updated: number;
        tenantIds: string[];
        featureFlags: FeatureFlags;
    };
}

export async function fetchTenantControlCenter(tenantId: string) {
    const res = await api.get(`/super-admin/tenants/${tenantId}/control-center`);
    return res.data.data as TenantControlCenterResponse;
}

export async function updateTenantPlan(tenantId: string, payload: {
    plan: TenantPlan;
    monthlyRevenue?: number;
    failedPayments?: number;
    nextBillingDate?: string;
}) {
    await api.patch(`/super-admin/tenants/${tenantId}/plan`, payload);
}

export async function updateTenantLimits(tenantId: string, payload: Partial<TenantLimits>) {
    await api.patch(`/super-admin/tenants/${tenantId}/limits`, payload);
}

export async function updateTenantMaintenance(tenantId: string, payload: TenantMaintenance) {
    await api.patch(`/super-admin/tenants/${tenantId}/maintenance`, payload);
}

export async function updateTenantUserStatus(tenantId: string, userId: string, isActive: boolean, reason?: string) {
    await api.patch(`/super-admin/tenants/${tenantId}/users/${userId}/status`, { isActive, reason });
}

export async function createTenantCompany(payload: CreateTenantPayload) {
    const res = await api.post('/super-admin/tenants', payload);
    return res.data.data as {
        company: { id: string; name: string; currency: string; vatNumber: string | null };
        headOffice: { id: string; name: string; code: string };
        adminUser: { id: string; name: string; email: string };
        adminCredentials: { email: string; password: string };
    };
}

export async function fetchSuperAdminAnnouncements() {
    const res = await api.get('/super-admin/announcements');
    return res.data.data as SuperAdminAnnouncement[];
}

export async function broadcastAnnouncement(payload: { title: string; message: string; level: 'info' | 'warning' | 'critical'; expiresAt?: string }) {
    await api.post('/super-admin/announcements/broadcast', payload);
}

export async function updateSuperAdminAnnouncement(
    announcementId: string,
    payload: {
        title?: string;
        message?: string;
        level?: AnnouncementLevel;
        expiresAt?: string | null;
        isActive?: boolean;
    },
) {
    await api.patch(`/super-admin/announcements/${announcementId}`, payload);
}

export async function deleteSuperAdminAnnouncement(announcementId: string) {
    await api.delete(`/super-admin/announcements/${announcementId}`);
}

export async function updateTenantUserPassword(tenantId: string, userId: string, password: string) {
    await api.patch(`/super-admin/tenants/${tenantId}/users/${userId}/password`, { password });
}

export async function createTenantUser(tenantId: string, payload: {
    name: string;
    email: string;
    password: string;
    role?: string;
    phone?: string;
}) {
    const res = await api.post(`/super-admin/tenants/${tenantId}/users`, payload);
    return res.data.data as TenantUser;
}

export async function impersonateTenantUser(
    tenantId: string,
    userId: string,
    payload: { reason: string; ticket?: string },
) {
    const res = await api.post(`/super-admin/tenants/${tenantId}/users/${userId}/impersonate`, payload);
    return res.data.data as {
        accessToken: string;
        refreshToken: string;
        impersonation: {
            actorUserId: string;
            actorEmail: string;
            actorName: string;
            actorCompanyId: string;
            reason: string;
            startedAt: string;
            sessionId: string;
        };
        targetUser: {
            id: string;
            name: string;
            email: string;
            companyId: string;
        };
    };
}

export async function broadcastTenantAnnouncement(
    tenantId: string,
    payload: { title: string; message: string; level: 'info' | 'warning' | 'critical'; expiresAt?: string },
) {
    await api.post(`/super-admin/announcements/tenant/${tenantId}`, payload);
}
