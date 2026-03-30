import api from '../../lib/api';

export type HealthStatus = 'Healthy' | 'Warning' | 'Critical';
export type TenantStatus = 'Active' | 'Trial' | 'Suspended';
export type TenantPlan = 'Starter' | 'Growth' | 'SOLVANTA';

export type FeatureFlags = {
    crm: boolean;
    inventory: boolean;
    purchases: boolean;
    accounting: boolean;
    pos: boolean;
    reports: boolean;
    bom: boolean;
    production: boolean;
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
    plan: TenantPlan;
    status: TenantStatus;
    statusReason: string;
    featureFlags: FeatureFlags;
    monthlyRevenue: number;
    failedPayments: number;
    nextBillingDate: string;
    limits: TenantLimits;
    maintenance: TenantMaintenance;
    totalUsers: number;
    activeUsers: number;
    totalBranches: number;
    totalProducts: number;
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
    createdAt: string;
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
    };
    health: { id: string; label: string; value: string; status: HealthStatus }[];
}

export interface TenantUser {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
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

export async function fetchSuperAdminTenants() {
    const res = await api.get('/super-admin/tenants');
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

export async function fetchTenantUsage(tenantId: string) {
    const res = await api.get(`/super-admin/tenants/${tenantId}/usage`);
    return res.data.data as TenantUsageResponse;
}

export async function updateTenantStatus(tenantId: string, status: 'Active' | 'Suspended', reason?: string) {
    await api.patch(`/super-admin/tenants/${tenantId}/status`, { status, reason });
}

export async function updateTenantFeatures(tenantId: string, featureFlags: FeatureFlags) {
    await api.patch(`/super-admin/tenants/${tenantId}/features`, { featureFlags });
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

export async function broadcastTenantAnnouncement(
    tenantId: string,
    payload: { title: string; message: string; level: 'info' | 'warning' | 'critical'; expiresAt?: string },
) {
    await api.post(`/super-admin/announcements/tenant/${tenantId}`, payload);
}
