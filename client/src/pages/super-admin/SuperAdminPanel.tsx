import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from '@/lib/toast';
import {
    Activity,
    AlertTriangle,
    BadgeDollarSign,
    Building2,
    CheckCircle2,
    Clock3,
    Flag,
    Lock,
    Megaphone,
    Search,
    Server,
    Shield,
} from 'lucide-react';
import api from '../../lib/api';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';
import AppLoader from '../../components/ui/AppLoader';

type HealthStatus = 'Healthy' | 'Warning' | 'Critical';
type TenantStatus = 'Active' | 'Trial' | 'Suspended';
type TenantFilter = 'All' | TenantStatus;

type FeatureFlags = {
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

interface Tenant {
    id: string;
    name: string;
    plan: 'Starter' | 'Growth' | 'SOLVANTA';
    status: TenantStatus;
    statusReason: string;
    featureFlags: FeatureFlags;
    totalUsers: number;
    activeUsers: number;
    updatedAt: string;
}

interface HealthItem {
    id: string;
    label: string;
    value: string;
    status: HealthStatus;
}

interface AuditItem {
    id: string;
    actor: string;
    action: string;
    target: string;
    company: string;
    createdAt: string;
}

interface OverviewResponse {
    kpis: {
        totalTenants: number;
        activeTenants: number;
        trialTenants: number;
        suspendedTenants: number;
        totalUsers: number;
        mrr: number;
        failedPayments: number;
    };
    health: HealthItem[];
}

interface TenantUsageResponse {
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

const statusClassMap: Record<HealthStatus, string> = {
    Healthy: 'bg-emerald-50 text-emerald-700',
    Warning: 'bg-amber-50 text-amber-700',
    Critical: 'bg-red-50 text-red-700',
};

const tenantStatusClassMap: Record<TenantStatus, string> = {
    Active: 'bg-emerald-50 text-emerald-700',
    Trial: 'bg-sky-50 text-sky-700',
    Suspended: 'bg-red-50 text-red-700',
};

const featureLabelMap: Record<keyof FeatureFlags, string> = {
    crm: 'CRM',
    inventory: 'Inventory',
    purchases: 'Purchases',
    accounting: 'Accounting',
    pos: 'POS',
    reports: 'Reports',
    bom: 'Production Recipes',
    production: 'Production',
    sales: 'Sales',
    items: 'Items / Products',
    suppliers: 'Suppliers',
    hr: 'Human Resources',
};

export default function SuperAdminPanel() {
    const queryClient = useQueryClient();
    const [tenantFilter, setTenantFilter] = useState<TenantFilter>('All');
    const [search, setSearch] = useState('');
    const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
    const [moduleDraft, setModuleDraft] = useState<FeatureFlags | null>(null);
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [broadcastLevel, setBroadcastLevel] = useState<'info' | 'warning' | 'critical'>('info');
    const token = useAuthStore((state) => state.token);
    const user = useAuthStore((state) => state.user);
    const canAccess = useAuthStore((state) => Boolean(state.user?.isSuperAdmin));

    if (token && !user) {
        return <AppLoader />;
    }

    const {
        data: overview,
        isLoading: isOverviewLoading,
        error: overviewError,
    } = useQuery<OverviewResponse>({
        queryKey: ['super-admin', 'overview'],
        queryFn: async () => {
            const res = await api.get('/super-admin/overview');
            return res.data.data;
        },
        enabled: canAccess,
    });

    const { data: tenants = [], isLoading: isTenantsLoading } = useQuery<Tenant[]>({
        queryKey: ['super-admin', 'tenants'],
        queryFn: async () => {
            const res = await api.get('/super-admin/tenants');
            return res.data.data;
        },
        enabled: canAccess,
    });

    const { data: auditItems = [], isLoading: isAuditLoading } = useQuery<AuditItem[]>({
        queryKey: ['super-admin', 'audit'],
        queryFn: async () => {
            const res = await api.get('/super-admin/audit?limit=12');
            return res.data.data.map((row: any) => ({
                ...row,
                createdAt: new Date(row.createdAt).toLocaleString(),
            }));
        },
        enabled: canAccess,
    });

    const selectedTenant = useMemo(
        () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
        [selectedTenantId, tenants]
    );

    const { data: selectedUsage, isLoading: isUsageLoading } = useQuery<TenantUsageResponse>({
        queryKey: ['super-admin', 'tenant-usage', selectedTenantId],
        queryFn: async () => {
            const res = await api.get(`/super-admin/tenants/${selectedTenantId}/usage`);
            return res.data.data;
        },
        enabled: canAccess && Boolean(selectedTenantId),
    });

    const statusMutation = useMutation({
        mutationFn: async ({ tenantId, status, reason }: { tenantId: string; status: 'Active' | 'Suspended'; reason?: string }) => {
            await api.patch(`/super-admin/tenants/${tenantId}/status`, { status, reason });
        },
        onSuccess: () => {
            toast.success('Tenant status updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update tenant status'),
    });

    const featureMutation = useMutation({
        mutationFn: async ({ tenantId, featureFlags }: { tenantId: string; featureFlags: FeatureFlags }) => {
            await api.patch(`/super-admin/tenants/${tenantId}/features`, { featureFlags });
        },
        onSuccess: () => {
            toast.success('Module access updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update modules'),
    });

    const broadcastMutation = useMutation({
        mutationFn: async () => {
            await api.post('/super-admin/announcements/broadcast', {
                title: broadcastTitle.trim(),
                message: broadcastMessage.trim(),
                level: broadcastLevel,
            });
        },
        onSuccess: () => {
            toast.success('Broadcast sent to all tenants');
            setBroadcastTitle('');
            setBroadcastMessage('');
            setBroadcastLevel('info');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to send broadcast'),
    });

    const filteredTenants = useMemo(() => {
        const filteredByStatus = tenantFilter === 'All'
            ? tenants
            : tenants.filter((tenant) => tenant.status === tenantFilter);
        if (!search.trim()) return filteredByStatus;
        const key = search.trim().toLowerCase();
        return filteredByStatus.filter((tenant) => tenant.name.toLowerCase().includes(key));
    }, [tenantFilter, tenants, search]);

    const toggleModule = (key: keyof FeatureFlags) => {
        setModuleDraft((prev) => {
            if (!prev) return prev;
            return { ...prev, [key]: !prev[key] };
        });
    };

    if (!canAccess) {
        return (
            <div className="max-w-5xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-6">
                <div className="flex items-start gap-3">
                    <Lock size={20} className="text-red-600 mt-0.5" />
                    <div>
                        <h1 className="text-lg font-semibold text-red-800">Super Admin Access Required</h1>
                        <p className="text-sm text-red-700 mt-1">
                            Your account does not have super admin access. Contact a platform administrator if this is unexpected.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (overviewError) {
        return (
            <div className="max-w-5xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-6">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-red-600 mt-0.5" />
                    <div>
                        <h1 className="text-lg font-semibold text-red-800">Unable To Load Super Admin Data</h1>
                        <p className="text-sm text-red-700 mt-1">Check backend authentication and super admin access configuration.</p>
                    </div>
                </div>
            </div>
        );
    }

    const kpis = overview?.kpis;
    const health = overview?.health ?? [];

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <section className="rounded-2xl border border-border bg-background-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary">Super Admin Control Tower</h1>
                        <p className="text-sm text-text-secondary mt-1">
                            Tenant operations, feature governance, platform health, and cross-tenant controls.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                        <Shield size={14} />
                        Platform Owner Mode
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    <MetricCard icon={Building2} label="Active Tenants" value={isOverviewLoading ? '...' : String(kpis?.activeTenants ?? 0)} />
                    <MetricCard icon={Clock3} label="Trial Tenants" value={isOverviewLoading ? '...' : String(kpis?.trialTenants ?? 0)} />
                    <MetricCard icon={AlertTriangle} label="Suspended" value={isOverviewLoading ? '...' : String(kpis?.suspendedTenants ?? 0)} />
                    <MetricCard icon={BadgeDollarSign} label="MRR" value={isOverviewLoading ? '...' : `$${kpis?.mrr?.toLocaleString() ?? 0}`} />
                    <MetricCard icon={Flag} label="Failed Payments" value={isOverviewLoading ? '...' : String(kpis?.failedPayments ?? 0)} />
                </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 rounded-2xl border border-border bg-background-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">Tenant Operations</h2>
                            <p className="text-xs text-text-tertiary">Suspend/reactivate tenants, inspect usage, and control modules.</p>
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-2.5 text-text-tertiary" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search tenant..."
                                className="rounded-lg border border-border bg-background-card py-2 pl-8 pr-3 text-sm outline-none focus:border-border-strong"
                            />
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        {(['All', 'Active', 'Trial', 'Suspended'] as const).map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                onClick={() => setTenantFilter(filter)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tenantFilter === filter ? 'bg-brand text-white' : 'bg-background-subtle text-text-secondary hover:bg-slate-200'
                                    }`}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-tertiary">
                                    <th className="py-2 pr-3">Tenant</th>
                                    <th className="py-2 pr-3">Plan</th>
                                    <th className="py-2 pr-3">Status</th>
                                    <th className="py-2 pr-3">Users</th>
                                    <th className="py-2 pr-3">Updated</th>
                                    <th className="py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isTenantsLoading && (
                                    <tr>
                                        <td className="py-5 text-text-tertiary" colSpan={6}>
                                            Loading tenants...
                                        </td>
                                    </tr>
                                )}
                                {!isTenantsLoading && filteredTenants.length === 0 && (
                                    <tr>
                                        <td className="py-5 text-text-tertiary" colSpan={6}>
                                            No tenants match this filter.
                                        </td>
                                    </tr>
                                )}
                                {!isTenantsLoading && filteredTenants.map((tenant) => (
                                    <tr key={tenant.id} className="border-b border-border-subtle last:border-none">
                                        <td className="py-3 pr-3">
                                            <p className="font-medium text-text-primary">{tenant.name}</p>
                                            <p className="text-xs text-text-tertiary">{tenant.id}</p>
                                        </td>
                                        <td className="py-3 pr-3 text-text-secondary">{tenant.plan}</td>
                                        <td className="py-3 pr-3">
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tenantStatusClassMap[tenant.status]}`}>
                                                {tenant.status}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-3 text-text-secondary">{tenant.activeUsers} / {tenant.totalUsers}</td>
                                        <td className="py-3 pr-3 text-xs text-text-tertiary">{new Date(tenant.updatedAt).toLocaleString()}</td>
                                        <td className="py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTenantId(tenant.id);
                                                        setModuleDraft(tenant.featureFlags);
                                                    }}
                                                    className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-background-subtle"
                                                >
                                                    Manage
                                                </button>
                                                {tenant.status === 'Suspended' ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => statusMutation.mutate({ tenantId: tenant.id, status: 'Active' })}
                                                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
                                                    >
                                                        Activate
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => statusMutation.mutate({ tenantId: tenant.id, status: 'Suspended', reason: 'Suspended by super admin' })}
                                                        className="rounded-md bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                                                    >
                                                        Suspend
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-background-card p-5">
                        <h2 className="text-lg font-semibold text-text-primary">System Health</h2>
                        <p className="text-xs text-text-tertiary">Critical services and risk signals.</p>
                        <div className="mt-4 space-y-3">
                            {health.map((item) => (
                                <div key={item.id} className="rounded-xl border border-border-subtle p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium text-text-primary">{item.label}</p>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClassMap[item.status]}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-text-tertiary">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background-card p-5">
                        <h2 className="text-lg font-semibold text-text-primary">Broadcast Center</h2>
                        <p className="text-xs text-text-tertiary">Send global platform announcements to all tenants.</p>
                        <div className="mt-3 space-y-2">
                            <input
                                value={broadcastTitle}
                                onChange={(e) => setBroadcastTitle(e.target.value)}
                                placeholder="Announcement title"
                                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                            />
                            <textarea
                                value={broadcastMessage}
                                onChange={(e) => setBroadcastMessage(e.target.value)}
                                rows={3}
                                placeholder="Announcement message"
                                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                            />
                            <AppDropdown
                                value={broadcastLevel}
                                onChange={(v) => setBroadcastLevel(v as 'info' | 'warning' | 'critical')}
                                options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]}
                                placeholder='Info'
                            />
                            <button
                                type="button"
                                onClick={() => broadcastMutation.mutate()}
                                disabled={broadcastMutation.isPending || !broadcastTitle.trim() || !broadcastMessage.trim()}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                <Megaphone size={15} />
                                Broadcast Announcement
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-background-card p-5">
                        <h2 className="text-lg font-semibold text-text-primary">Quick Actions</h2>
                        <p className="text-xs text-text-tertiary">Operational functions for platform incidents.</p>
                        <div className="mt-3 grid grid-cols-1 gap-2">
                            <ActionButton icon={Server} label="Retry Failed Jobs" />
                            <ActionButton icon={Activity} label="Run Health Snapshot" />
                            <ActionButton icon={Flag} label="Open Incident Timeline" />
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-border bg-background-card p-5">
                    <h2 className="text-lg font-semibold text-text-primary">Tenant Detail</h2>
                    {!selectedTenant && <p className="mt-3 text-sm text-text-tertiary">Select a tenant and click `Manage` to inspect details.</p>}
                    {selectedTenant && (
                        <div className="mt-3 space-y-4">
                            <div className="rounded-xl bg-background-subtle p-3">
                                <p className="text-sm font-semibold text-text-primary">{selectedTenant.name}</p>
                                <p className="text-xs text-text-tertiary">{selectedTenant.id}</p>
                                <p className="text-xs text-text-tertiary mt-1">Status: {selectedTenant.status}</p>
                            </div>

                            <div>
                                <p className="text-xs uppercase tracking-wide text-text-tertiary">Usage Snapshot</p>
                                {isUsageLoading && <p className="text-sm text-text-tertiary mt-2">Loading usage...</p>}
                                {!isUsageLoading && selectedUsage && (
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                        {Object.entries(selectedUsage.counts).map(([key, value]) => (
                                            <div key={key} className="rounded-lg border border-border p-2">
                                                <p className="text-xs text-text-tertiary">{key}</p>
                                                <p className="font-semibold text-text-primary">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-border bg-background-card p-5">
                    <h2 className="text-lg font-semibold text-text-primary">Module Controls</h2>
                    {!selectedTenant && <p className="mt-3 text-sm text-text-tertiary">Select a tenant to update feature access.</p>}
                    {selectedTenant && moduleDraft && (
                        <div className="mt-3 space-y-3">
                            {(Object.keys(moduleDraft) as (keyof FeatureFlags)[]).map((key) => (
                                <label key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                                    <span className="text-sm font-medium text-text-primary">{featureLabelMap[key]}</span>
                                    <input
                                        type="checkbox"
                                        checked={moduleDraft[key]}
                                        onChange={() => toggleModule(key)}
                                        className="h-4 w-4"
                                    />
                                </label>
                            ))}
                            <button
                                type="button"
                                onClick={() => featureMutation.mutate({ tenantId: selectedTenant.id, featureFlags: moduleDraft })}
                                disabled={featureMutation.isPending}
                                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                Save Module Settings
                            </button>
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-border bg-background-card p-5">
                <h2 className="text-lg font-semibold text-text-primary">Recent Audit Activity</h2>
                <p className="text-xs text-text-tertiary">Every high-impact action is tracked here.</p>
                <div className="mt-4 divide-y divide-slate-100">
                    {isAuditLoading && <div className="py-4 text-sm text-text-tertiary">Loading audit activity...</div>}
                    {!isAuditLoading && auditItems.length === 0 && <div className="py-4 text-sm text-text-tertiary">No audit data found.</div>}
                    {!isAuditLoading &&
                        auditItems.map((item) => (
                            <div key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm text-text-primary">
                                        <span className="font-semibold">{item.actor}</span> {item.action} on <span className="font-semibold">{item.target}</span>
                                    </p>
                                    <p className="text-xs text-text-tertiary">{item.company}</p>
                                </div>
                                <div className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                                    <CheckCircle2 size={14} />
                                    {item.createdAt}
                                </div>
                            </div>
                        ))}
                </div>
            </section>
        </div>
    );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-background-subtle p-3">
            <div className="inline-flex rounded-lg bg-background-card p-2 text-text-secondary">
                <Icon size={16} />
            </div>
            <p className="mt-2 text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
            <p className="text-lg font-bold text-text-primary">{value}</p>
        </div>
    );
}

function ActionButton({ icon: Icon, label }: { icon: typeof Building2; label: string }) {
    return (
        <button
            type="button"
            className="inline-flex items-center justify-between rounded-lg border border-border bg-background-card px-3 py-2 text-sm font-medium text-text-secondary hover:bg-background-subtle"
        >
            <span>{label}</span>
            <Icon size={16} />
        </button>
    );
}

