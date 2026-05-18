import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from '@/lib/toast';
import { Search } from 'lucide-react';
import {
    bulkUpdateTenantStatus,
    createTenantCompany,
    fetchSuperAdminTenants,
    Tenant,
    updateTenantStatus,
} from './api';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_COMPANY_CURRENCY } from '../../lib/companySettings';
import { SUPER_ADMIN_PERMISSIONS } from '../../lib/superAdminPermissions';
import SuperAdminAccessCard from './SuperAdminAccessCard';
import TenantStatusDialog from './TenantStatusDialog';
import AppDropdown from '../../components/ui/AppDropdown';

type TenantFilter = 'All' | 'Active' | 'Trial' | 'Suspended';

const tenantStatusClassMap: Record<Tenant['status'], string> = {
    Active: 'bg-emerald-50 text-emerald-700',
    Trial: 'bg-sky-50 text-sky-700',
    Suspended: 'bg-red-50 text-red-700',
};

const healthClassMap: Record<Tenant['healthStatus'], string> = {
    Healthy: 'bg-emerald-50 text-emerald-700',
    Warning: 'bg-amber-50 text-amber-700',
    Critical: 'bg-red-50 text-red-700',
};

export default function SuperAdminCompanies() {
    const queryClient = useQueryClient();
    const canReadTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ),
    );
    const canManageTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE),
    );
    const [tenantFilter, setTenantFilter] = useState<TenantFilter>('All');
    const [search, setSearch] = useState('');
    const [healthStatus, setHealthStatus] = useState('All');
    const [paymentStatus, setPaymentStatus] = useState('All');
    const [limitState, setLimitState] = useState('All');
    const [trialEndingWithinDays, setTrialEndingWithinDays] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
    const [statusDialog, setStatusDialog] = useState<{ tenant: Tenant; nextStatus: 'Active' | 'Suspended' } | null>(null);
    const [bulkStatus, setBulkStatus] = useState<'Active' | 'Suspended' | null>(null);
    const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
    const [statusReason, setStatusReason] = useState('');
    const [form, setForm] = useState({
        companyName: '',
        currency: DEFAULT_COMPANY_CURRENCY,
        vatNumber: '',
        contactEmail: '',
        contactPhone: '',
        contactAddress: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        headOfficeName: 'Head Office',
        headOfficeCode: 'HQ',
    });

    const tenantFilters = {
        status: tenantFilter,
        search: search.trim() || undefined,
        healthStatus,
        paymentStatus,
        limitState,
        trialEndingWithinDays: trialEndingWithinDays ? Number(trialEndingWithinDays) : undefined,
    };

    const { data: tenants = [], isLoading } = useQuery({
        queryKey: ['super-admin', 'tenants', tenantFilters],
        queryFn: () => fetchSuperAdminTenants(tenantFilters),
        enabled: canReadTenants,
    });

    const selectedTenants = useMemo(
        () => tenants.filter((tenant) => selectedTenantIds.includes(tenant.id)),
        [selectedTenantIds, tenants],
    );

    const statusMutation = useMutation({
        mutationFn: ({ tenantId, status, reason }: { tenantId: string; status: 'Active' | 'Suspended'; reason?: string }) =>
            updateTenantStatus(tenantId, status, reason),
        onSuccess: (data) => {
            toast.success(
                data.status === 'Suspended'
                    ? `Tenant suspended. ${data.affectedUsers} user${data.affectedUsers === 1 ? '' : 's'} paused.`
                    : `Tenant reactivated. ${data.affectedUsers} user${data.affectedUsers === 1 ? '' : 's'} restored.`,
            );
            setStatusDialog(null);
            setStatusReason('');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: (error: any) => toast.error(error?.response?.data?.error?.message || 'Failed to update tenant status'),
    });

    const bulkStatusMutation = useMutation({
        mutationFn: ({ status, reason }: { status: 'Active' | 'Suspended'; reason?: string }) =>
            bulkUpdateTenantStatus({ tenantIds: selectedTenantIds, status, reason }),
        onSuccess: (data) => {
            toast.success(`${data.updated} tenant${data.updated === 1 ? '' : 's'} updated`);
            setSelectedTenantIds([]);
            setBulkStatus(null);
            setStatusReason('');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: (error: any) => toast.error(error?.response?.data?.error?.message || 'Failed to update selected tenants'),
    });

    const createTenantMutation = useMutation({
        mutationFn: async () => {
            if (!form.companyName.trim()) throw new Error('Company name is required');
            if (!form.currency.trim()) throw new Error('Currency is required');
            if (!form.adminName.trim()) throw new Error('Admin name is required');
            if (!form.adminEmail.trim()) throw new Error('Admin email is required');
            if (!form.adminPassword.trim()) throw new Error('Admin password is required');

            return createTenantCompany({
                company: {
                    name: form.companyName.trim(),
                    currency: form.currency.trim().toUpperCase(),
                    vatNumber: form.vatNumber.trim() || undefined,
                    contactEmail: form.contactEmail.trim() || undefined,
                    contactPhone: form.contactPhone.trim() || undefined,
                    contactAddress: form.contactAddress.trim() || undefined,
                },
                adminUser: {
                    name: form.adminName.trim(),
                    email: form.adminEmail.trim().toLowerCase(),
                    password: form.adminPassword,
                },
                headOffice: {
                    name: form.headOfficeName.trim() || 'Head Office',
                    code: form.headOfficeCode.trim().toUpperCase() || 'HQ',
                },
            });
        },
        onSuccess: (data) => {
            toast.success('Company created successfully');
            setCreatedCredentials(data.adminCredentials);
            setShowCreateForm(false);
            setForm({
                companyName: '',
                currency: DEFAULT_COMPANY_CURRENCY,
                vatNumber: '',
                contactEmail: '',
                contactPhone: '',
                contactAddress: '',
                adminName: '',
                adminEmail: '',
                adminPassword: '',
                headOfficeName: 'Head Office',
                headOfficeCode: 'HQ',
            });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: (error: unknown) => {
            const message = (error as any)?.response?.data?.message || (error as Error)?.message || 'Failed to create company';
            toast.error(message);
        },
    });

    function toggleTenantSelection(tenantId: string) {
        setSelectedTenantIds((current) =>
            current.includes(tenantId) ? current.filter((id) => id !== tenantId) : [...current, tenantId],
        );
    }

    function toggleSelectAll() {
        setSelectedTenantIds((current) =>
            current.length === tenants.length ? [] : tenants.map((tenant) => tenant.id),
        );
    }

    if (!canReadTenants) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include tenant visibility." />
        );
    }

    return (
        <section className="rounded-2xl border border-border bg-background-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-text-primary">Company Management</h2>
                    <p className="text-xs text-text-tertiary">Tenant lifecycle control, health review, and bulk platform operations.</p>
                </div>
                <div className="flex items-center gap-2">
                    {canManageTenants && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowCreateForm((prev) => !prev);
                                setCreatedCredentials(null);
                            }}
                            className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                        >
                            {showCreateForm ? 'Close Create Form' : 'Create Company'}
                        </button>
                    )}
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-2.5 text-text-tertiary" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search company, plan, status..."
                            className="rounded-lg border border-border bg-background-card py-2 pl-8 pr-3 text-sm outline-none focus:border-border-strong"
                        />
                    </div>
                </div>
            </div>

            {createdCredentials && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    Admin credentials: <span className="font-semibold">{createdCredentials.email}</span> / <span className="font-semibold">{createdCredentials.password}</span>
                </div>
            )}

            {canManageTenants && showCreateForm && (
                <div className="mt-4 rounded-xl border border-border bg-background-subtle p-4">
                    <h3 className="text-sm font-semibold text-text-primary">Create New Company</h3>
                    <p className="mt-1 text-xs text-text-secondary">Provide required company information and the first admin account credentials.</p>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {[
                            ['companyName', 'Company Name *'],
                            ['currency', 'Currency (e.g. SAR) *'],
                            ['vatNumber', 'VAT Number'],
                            ['contactEmail', 'Company Contact Email'],
                            ['contactPhone', 'Company Contact Phone'],
                            ['contactAddress', 'Company Address'],
                            ['adminName', 'Admin Full Name *'],
                            ['adminEmail', 'Admin Email *'],
                            ['adminPassword', 'Admin Password *'],
                            ['headOfficeName', 'Head Office Name'],
                            ['headOfficeCode', 'Head Office Code'],
                        ].map(([key, placeholder]) => (
                            <input
                                key={key}
                                type={key === 'adminPassword' ? 'password' : 'text'}
                                value={form[key as keyof typeof form]}
                                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                                placeholder={placeholder}
                                className="rounded-lg border border-border bg-background-card px-3 py-2 text-sm outline-none focus:border-border-strong"
                            />
                        ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => createTenantMutation.mutate()}
                            disabled={createTenantMutation.isPending}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {createTenantMutation.isPending ? 'Creating...' : 'Create Company & Admin'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreateForm(false)}
                            className="rounded-lg border border-border-strong px-4 py-2 text-xs font-medium text-text-secondary hover:bg-background-subtle"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-5">
                <AppDropdown
                    value={healthStatus}
                    onChange={(value) => setHealthStatus(value || 'All')}
                    options={[
                        { value: 'All', label: 'All health states' },
                        { value: 'Healthy', label: 'Healthy' },
                        { value: 'Warning', label: 'Warning' },
                        { value: 'Critical', label: 'Critical' },
                    ]}
                    placeholder="All health states"
                />
                <AppDropdown
                    value={paymentStatus}
                    onChange={(value) => setPaymentStatus(value || 'All')}
                    options={[
                        { value: 'All', label: 'All payment states' },
                        { value: 'Current', label: 'Current' },
                        { value: 'At Risk', label: 'At Risk' },
                        { value: 'Overdue', label: 'Overdue' },
                    ]}
                    placeholder="All payment states"
                />
                <AppDropdown
                    value={limitState}
                    onChange={(value) => setLimitState(value || 'All')}
                    options={[
                        { value: 'All', label: 'All limit states' },
                        { value: 'ok', label: 'Within limits' },
                        { value: 'warning', label: 'Warning' },
                        { value: 'breached', label: 'Breached' },
                    ]}
                    placeholder="All limit states"
                />
                <input
                    value={trialEndingWithinDays}
                    onChange={(e) => setTrialEndingWithinDays(e.target.value)}
                    placeholder="Trial ending in days"
                    className="rounded-lg border border-border bg-background-card px-3 py-2 text-sm outline-none focus:border-border-strong"
                />
                <button
                    type="button"
                    onClick={() => {
                        setSearch('');
                        setHealthStatus('All');
                        setPaymentStatus('All');
                        setLimitState('All');
                        setTrialEndingWithinDays('');
                        setTenantFilter('All');
                    }}
                    className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-background-subtle"
                >
                    Reset Filters
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {(['All', 'Active', 'Trial', 'Suspended'] as const).map((filter) => (
                    <button
                        key={filter}
                        type="button"
                        onClick={() => setTenantFilter(filter)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            tenantFilter === filter ? 'bg-brand text-white' : 'bg-background-subtle text-text-secondary hover:bg-slate-200'
                        }`}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            {canManageTenants && selectedTenantIds.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background-subtle px-4 py-3">
                    <p className="text-sm text-text-secondary">
                        <span className="font-semibold">{selectedTenantIds.length}</span> tenant{selectedTenantIds.length === 1 ? '' : 's'} selected
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setBulkStatus('Active');
                                setStatusReason('');
                            }}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                            Bulk Activate
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setBulkStatus('Suspended');
                                setStatusReason('');
                            }}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                        >
                            Bulk Suspend
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedTenantIds([])}
                            className="rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-text-secondary hover:bg-background-card"
                        >
                            Clear Selection
                        </button>
                    </div>
                </div>
            )}

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-tertiary">
                            <th className="py-2 pr-3">
                                {canManageTenants && (
                                    <input
                                        type="checkbox"
                                        checked={tenants.length > 0 && selectedTenantIds.length === tenants.length}
                                        onChange={toggleSelectAll}
                                        className="h-4 w-4 rounded border-border-strong"
                                    />
                                )}
                            </th>
                            <th className="py-2 pr-3">Company</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 pr-3">Health</th>
                            <th className="py-2 pr-3">Limits</th>
                            <th className="py-2 pr-3">Usage</th>
                            <th className="py-2 pr-3">Revenue</th>
                            <th className="py-2 pr-3">Updated</th>
                            <th className="py-2">Operations</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr>
                                <td className="py-5 text-text-tertiary" colSpan={9}>Loading companies...</td>
                            </tr>
                        )}
                        {!isLoading && tenants.length === 0 && (
                            <tr>
                                <td className="py-5 text-text-tertiary" colSpan={9}>No companies match this filter.</td>
                            </tr>
                        )}
                        {!isLoading && tenants.map((tenant) => (
                            <tr key={tenant.id} className="border-b border-border-subtle last:border-none">
                                <td className="py-3 pr-3">
                                    {canManageTenants && (
                                        <input
                                            type="checkbox"
                                            checked={selectedTenantIds.includes(tenant.id)}
                                            onChange={() => toggleTenantSelection(tenant.id)}
                                            className="h-4 w-4 rounded border-border-strong"
                                        />
                                    )}
                                </td>
                                <td className="py-3 pr-3">
                                    <p className="font-medium text-text-primary">{tenant.name}</p>
                                    <p className="text-xs text-text-tertiary">{tenant.id}</p>
                                    <p className="mt-1 text-xs text-text-tertiary">{tenant.plan} • {tenant.paymentStatus}</p>
                                </td>
                                <td className="py-3 pr-3">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tenantStatusClassMap[tenant.status]}`}>
                                        {tenant.status}
                                    </span>
                                    {tenant.maintenance.enabled && (
                                        <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                            Maintenance
                                        </span>
                                    )}
                                    {tenant.daysToTrialEnd !== null && (
                                        <p className="mt-1 text-xs text-text-tertiary">Trial ends in {tenant.daysToTrialEnd} day{tenant.daysToTrialEnd === 1 ? '' : 's'}</p>
                                    )}
                                </td>
                                <td className="py-3 pr-3">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${healthClassMap[tenant.healthStatus]}`}>
                                        {tenant.healthStatus}
                                    </span>
                                    <p className="mt-1 text-xs text-text-secondary">{tenant.healthScore}/100 • {tenant.healthTrend}</p>
                                    <p className="mt-1 max-w-[220px] text-xs text-text-tertiary">{tenant.healthDrivers.slice(0, 2).join(' • ') || 'No active risk flags'}</p>
                                </td>
                                <td className="py-3 pr-3">
                                    <p className="text-xs text-text-secondary">
                                        {tenant.limitWarnings.length > 0
                                            ? tenant.limitWarnings.map((warning) => `${warning.label} ${warning.percentUsed ?? 0}%`).join(' • ')
                                            : 'Within limits'}
                                    </p>
                                    {tenant.graceEndsAt && (
                                        <p className="mt-1 text-xs text-red-600">
                                            Auto-suspend {tenant.daysUntilAutoSuspend === 0 ? 'today' : `in ${tenant.daysUntilAutoSuspend} days`}
                                        </p>
                                    )}
                                </td>
                                <td className="py-3 pr-3">
                                    <p className="text-text-secondary">{tenant.activeUsers} / {tenant.totalUsers} users</p>
                                    <p className="text-xs text-text-tertiary">
                                        {tenant.moduleUsageSummary.adoptedModules}/{tenant.moduleUsageSummary.enabledModules} modules adopted
                                    </p>
                                    {tenant.moduleUsageSummary.unusedEnabledModules.length > 0 && (
                                        <p className="text-xs text-text-tertiary">
                                            Unused: {tenant.moduleUsageSummary.unusedEnabledModules.slice(0, 2).join(', ')}
                                        </p>
                                    )}
                                </td>
                                <td className="py-3 pr-3 text-text-secondary">${tenant.monthlyRevenue.toLocaleString()}</td>
                                <td className="py-3 pr-3 text-xs text-text-tertiary">{new Date(tenant.updatedAt).toLocaleString()}</td>
                                <td className="py-3">
                                    <div className="flex items-center gap-2">
                                        <Link
                                            to={`/super-admin/companies/${tenant.id}`}
                                            className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-background-subtle"
                                        >
                                            Open
                                        </Link>
                                        {canManageTenants && (
                                            tenant.status === 'Suspended' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStatusDialog({ tenant, nextStatus: 'Active' });
                                                        setStatusReason('');
                                                    }}
                                                    className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
                                                >
                                                    Activate
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStatusDialog({ tenant, nextStatus: 'Suspended' });
                                                        setStatusReason('');
                                                    }}
                                                    className="rounded-md bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                                                >
                                                    Suspend
                                                </button>
                                            )
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {statusDialog && (
                <TenantStatusDialog
                    tenantName={statusDialog.tenant.name}
                    nextStatus={statusDialog.nextStatus}
                    reason={statusReason}
                    onReasonChange={setStatusReason}
                    onClose={() => {
                        setStatusDialog(null);
                        setStatusReason('');
                    }}
                    onConfirm={() => statusMutation.mutate({
                        tenantId: statusDialog.tenant.id,
                        status: statusDialog.nextStatus,
                        reason: statusDialog.nextStatus === 'Suspended' ? statusReason.trim() : undefined,
                    })}
                    isSubmitting={statusMutation.isPending}
                    affectedUsers={statusDialog.nextStatus === 'Suspended'
                        ? statusDialog.tenant.activeUsers
                        : statusDialog.tenant.suspendedUserCount}
                />
            )}

            {bulkStatus && (
                <TenantStatusDialog
                    tenantName={`${selectedTenants.length} selected tenants`}
                    nextStatus={bulkStatus}
                    reason={statusReason}
                    onReasonChange={setStatusReason}
                    onClose={() => {
                        setBulkStatus(null);
                        setStatusReason('');
                    }}
                    onConfirm={() => bulkStatusMutation.mutate({
                        status: bulkStatus,
                        reason: bulkStatus === 'Suspended' ? statusReason.trim() : undefined,
                    })}
                    isSubmitting={bulkStatusMutation.isPending}
                    affectedUsers={selectedTenants.reduce((sum, tenant) => sum + (bulkStatus === 'Suspended' ? tenant.activeUsers : tenant.suspendedUserCount), 0)}
                />
            )}
        </section>
    );
}
