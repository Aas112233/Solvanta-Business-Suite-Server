import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AppLoader from '../../components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';
import {
    broadcastTenantAnnouncement,
    fetchSuperAdminTenants,
    fetchTenantControlCenter,
    fetchTenantUsage,
    TenantPlan,
    updateTenantLimits,
    updateTenantMaintenance,
    updateTenantPlan,
    updateTenantStatus,
    updateTenantUserStatus,
} from './api';

type UserFilter = 'All' | 'Active' | 'Inactive';

function isoToDateInput(isoDate: string) {
    if (!isoDate) return '';
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function parseOptionalLimit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 1) return null;
    return Math.floor(num);
}

export default function SuperAdminCompanyProfile() {
    const { id = '' } = useParams();
    const queryClient = useQueryClient();

    const [planDraft, setPlanDraft] = useState({
        plan: 'Starter' as TenantPlan,
        monthlyRevenue: '0',
        failedPayments: '0',
        nextBillingDate: '',
    });

    const [limitsDraft, setLimitsDraft] = useState({
        maxUsers: '',
        maxBranches: '',
        maxProducts: '',
    });

    const [maintenanceDraft, setMaintenanceDraft] = useState({
        enabled: false,
        message: '',
    });

    const [announcement, setAnnouncement] = useState({
        title: '',
        message: '',
        level: 'info' as 'info' | 'warning' | 'critical',
    });

    const [userSearch, setUserSearch] = useState('');
    const [userFilter, setUserFilter] = useState<UserFilter>('All');

    const { data: tenants = [], isLoading: loadingTenant } = useQuery({
        queryKey: ['super-admin', 'tenants'],
        queryFn: fetchSuperAdminTenants,
    });

    const { data: controlCenter, isLoading: loadingControlCenter } = useQuery({
        queryKey: ['super-admin', 'tenant-control', id],
        queryFn: () => fetchTenantControlCenter(id),
        enabled: Boolean(id),
    });

    const { data: usage, isLoading: loadingUsage } = useQuery({
        queryKey: ['super-admin', 'tenant-usage', id],
        queryFn: () => fetchTenantUsage(id),
        enabled: Boolean(id),
    });

    const tenant = tenants.find((item) => item.id === id);

    useEffect(() => {
        if (!controlCenter?.tenant) return;

        setPlanDraft({
            plan: controlCenter.tenant.plan,
            monthlyRevenue: String(controlCenter.tenant.monthlyRevenue ?? 0),
            failedPayments: String(controlCenter.tenant.failedPayments ?? 0),
            nextBillingDate: isoToDateInput(controlCenter.tenant.nextBillingDate),
        });

        setLimitsDraft({
            maxUsers: controlCenter.tenant.limits.maxUsers === null ? '' : String(controlCenter.tenant.limits.maxUsers),
            maxBranches: controlCenter.tenant.limits.maxBranches === null ? '' : String(controlCenter.tenant.limits.maxBranches),
            maxProducts: controlCenter.tenant.limits.maxProducts === null ? '' : String(controlCenter.tenant.limits.maxProducts),
        });

        setMaintenanceDraft({
            enabled: controlCenter.tenant.maintenance.enabled,
            message: controlCenter.tenant.maintenance.message || '',
        });
    }, [controlCenter]);

    const statusMutation = useMutation({
        mutationFn: ({ status, reason }: { status: 'Active' | 'Suspended'; reason?: string }) =>
            updateTenantStatus(id, status, reason),
        onSuccess: () => {
            toast.success('Tenant status updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant-control', id] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update tenant status'),
    });

    const planMutation = useMutation({
        mutationFn: async () => {
            const monthlyRevenue = Number(planDraft.monthlyRevenue || '0');
            const failedPayments = Number(planDraft.failedPayments || '0');

            if (!Number.isFinite(monthlyRevenue) || monthlyRevenue < 0) {
                throw new Error('Monthly revenue must be a positive number');
            }
            if (!Number.isFinite(failedPayments) || failedPayments < 0) {
                throw new Error('Failed payments must be a positive number');
            }

            await updateTenantPlan(id, {
                plan: planDraft.plan,
                monthlyRevenue,
                failedPayments: Math.floor(failedPayments),
                nextBillingDate: planDraft.nextBillingDate ? new Date(planDraft.nextBillingDate).toISOString() : '',
            });
        },
        onSuccess: () => {
            toast.success('Plan and billing controls updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant-control', id] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to update plan settings'),
    });

    const limitsMutation = useMutation({
        mutationFn: async () => {
            await updateTenantLimits(id, {
                maxUsers: parseOptionalLimit(limitsDraft.maxUsers),
                maxBranches: parseOptionalLimit(limitsDraft.maxBranches),
                maxProducts: parseOptionalLimit(limitsDraft.maxProducts),
            });
        },
        onSuccess: () => {
            toast.success('Tenant limits updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant-control', id] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update tenant limits'),
    });

    const maintenanceMutation = useMutation({
        mutationFn: () =>
            updateTenantMaintenance(id, {
                enabled: maintenanceDraft.enabled,
                message: maintenanceDraft.message,
            }),
        onSuccess: () => {
            toast.success('Maintenance controls updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant-control', id] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update maintenance controls'),
    });

    const userStatusMutation = useMutation({
        mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
            updateTenantUserStatus(id, userId, isActive, isActive ? 'Activated by super admin' : 'Suspended by super admin'),
        onSuccess: () => {
            toast.success('User status updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant-control', id] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update user status'),
    });

    const announcementMutation = useMutation({
        mutationFn: () =>
            broadcastTenantAnnouncement(id, {
                title: announcement.title.trim(),
                message: announcement.message.trim(),
                level: announcement.level,
            }),
        onSuccess: () => {
            toast.success('Announcement sent to this tenant');
            setAnnouncement({ title: '', message: '', level: 'info' });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to send tenant announcement'),
    });

    const filteredUsers = useMemo(() => {
        const allUsers = controlCenter?.users || [];

        return allUsers.filter((user) => {
            if (userFilter === 'Active' && !user.isActive) return false;
            if (userFilter === 'Inactive' && user.isActive) return false;
            if (!userSearch.trim()) return true;
            const searchTerm = userSearch.trim().toLowerCase();
            return user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm);
        });
    }, [controlCenter?.users, userFilter, userSearch]);

    if (loadingTenant || loadingControlCenter || loadingUsage) {
        return <AppLoader />;
    }

    if (!tenant) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                Company not found. <Link to="/super-admin/companies" className="text-blue-600">Back to company list</Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Company Profile</p>
                        <h2 className="text-xl font-bold text-slate-900">{tenant.name}</h2>
                        <p className="text-xs text-slate-500 mt-1">{tenant.id}</p>
                    </div>
                    <Link to="/super-admin/companies" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        Back To Companies
                    </Link>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <InfoCard label="Plan" value={tenant.plan} />
                    <InfoCard label="Status" value={tenant.status} />
                    <InfoCard label="Users" value={`${tenant.activeUsers} / ${tenant.totalUsers}`} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {tenant.status === 'Suspended' ? (
                        <button
                            type="button"
                            onClick={() => statusMutation.mutate({ status: 'Active' })}
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                            Activate Tenant
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => statusMutation.mutate({ status: 'Suspended', reason: 'Suspended from control center' })}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                        >
                            Suspend Tenant
                        </button>
                    )}
                    {tenant.maintenance.enabled && (
                        <span className="rounded-md bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                            Maintenance mode is active
                        </span>
                    )}
                </div>
                {tenant.statusReason && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Status reason: {tenant.statusReason}
                    </p>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">Usage Insights</h3>
                {loadingUsage && <p className="mt-3 text-sm text-slate-500">Loading usage snapshot...</p>}
                {!loadingUsage && usage && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(usage.counts).map(([key, value]) => (
                            <div key={key} className="rounded-lg border border-slate-200 p-3">
                                <p className="text-xs text-slate-500">{key}</p>
                                <p className="text-lg font-semibold text-slate-900">{value}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">Plan & Billing Controls</h3>
                <p className="text-xs text-slate-500">Override commercial plan and billing metrics used in super-admin reporting.</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="text-xs text-slate-600">Plan</label>
                        <AppDropdown
                            value={planDraft.plan}
                            onChange={(v) => setPlanDraft(prev => ({ ...prev, plan: v as TenantPlan }))}
                            options={[{ value: 'Starter', label: 'Starter' }, { value: 'Growth', label: 'Growth' }, { value: 'SOLVANTA', label: 'SOLVANTA' }]}
                            placeholder='Starter'
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600">Monthly Revenue</label>
                        <input
                            type="number"
                            min={0}
                            value={planDraft.monthlyRevenue}
                            onChange={(e) => setPlanDraft((prev) => ({ ...prev, monthlyRevenue: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600">Failed Payments</label>
                        <input
                            type="number"
                            min={0}
                            value={planDraft.failedPayments}
                            onChange={(e) => setPlanDraft((prev) => ({ ...prev, failedPayments: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600">Next Billing Date</label>
                        <input
                            type="date"
                            value={planDraft.nextBillingDate}
                            onChange={(e) => setPlanDraft((prev) => ({ ...prev, nextBillingDate: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => planMutation.mutate()}
                    disabled={planMutation.isPending}
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    Save Plan Controls
                </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">Resource Limits</h3>
                <p className="text-xs text-slate-500">Set hard guidance values. Leave fields empty to remove the limit.</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="text-xs text-slate-600">Max Users</label>
                        <input
                            type="number"
                            min={1}
                            value={limitsDraft.maxUsers}
                            onChange={(e) => setLimitsDraft((prev) => ({ ...prev, maxUsers: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                            placeholder="Unlimited"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600">Max Branches</label>
                        <input
                            type="number"
                            min={1}
                            value={limitsDraft.maxBranches}
                            onChange={(e) => setLimitsDraft((prev) => ({ ...prev, maxBranches: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                            placeholder="Unlimited"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-600">Max Products</label>
                        <input
                            type="number"
                            min={1}
                            value={limitsDraft.maxProducts}
                            onChange={(e) => setLimitsDraft((prev) => ({ ...prev, maxProducts: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                            placeholder="Unlimited"
                        />
                    </div>
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Current usage: {controlCenter?.usage.users ?? tenant.totalUsers} users, {controlCenter?.usage.branches ?? tenant.totalBranches} branches, {controlCenter?.usage.products ?? tenant.totalProducts} products
                </div>
                <button
                    type="button"
                    onClick={() => limitsMutation.mutate()}
                    disabled={limitsMutation.isPending}
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    Save Limits
                </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">Maintenance Lock</h3>
                <p className="text-xs text-slate-500">When enabled, this tenant cannot access APIs except super-admin users.</p>
                <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div>
                        <p className="text-sm font-medium text-slate-900">Enable maintenance mode</p>
                        <p className="text-xs text-slate-500">Block tenant access with a platform message.</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={maintenanceDraft.enabled}
                        onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                        className="h-4 w-4"
                    />
                </div>
                <textarea
                    rows={3}
                    value={maintenanceDraft.message}
                    onChange={(e) => setMaintenanceDraft((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Maintenance message shown to blocked users"
                    className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <button
                    type="button"
                    onClick={() => maintenanceMutation.mutate()}
                    disabled={maintenanceMutation.isPending}
                    className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    Save Maintenance Controls
                </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Tenant User Control</h3>
                        <p className="text-xs text-slate-500">Activate or suspend individual users inside this tenant.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder="Search user..."
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                        />
                        <AppDropdown
                            value={userFilter}
                            onChange={(v) => setUserFilter(v as UserFilter)}
                            options={[{ value: 'All', label: 'All' }, { value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
                            placeholder='All'
                        />
                    </div>
                </div>

                {loadingControlCenter && <p className="mt-4 text-sm text-slate-500">Loading tenant users...</p>}

                {!loadingControlCenter && (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                                    <th className="py-2 pr-3">Name</th>
                                    <th className="py-2 pr-3">Role</th>
                                    <th className="py-2 pr-3">Last Login</th>
                                    <th className="py-2 pr-3">Status</th>
                                    <th className="py-2">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="border-b border-slate-100 last:border-none">
                                        <td className="py-3 pr-3">
                                            <p className="font-medium text-slate-900">{user.name}</p>
                                            <p className="text-xs text-slate-500">{user.email}</p>
                                        </td>
                                        <td className="py-3 pr-3 text-slate-700">{user.role}</td>
                                        <td className="py-3 pr-3 text-xs text-slate-500">
                                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                                        </td>
                                        <td className="py-3 pr-3">
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="py-3">
                                            <button
                                                type="button"
                                                onClick={() => userStatusMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                                                className={`rounded-md px-2 py-1 text-xs font-medium text-white ${user.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                            >
                                                {user.isActive ? 'Suspend' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredUsers.length === 0 && <p className="py-4 text-sm text-slate-500">No users matched this filter.</p>}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">Tenant Announcement</h3>
                <p className="text-xs text-slate-500">Send a control message only to this tenant.</p>
                <div className="mt-4 space-y-3">
                    <input
                        value={announcement.title}
                        onChange={(e) => setAnnouncement((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Announcement title"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <textarea
                        rows={4}
                        value={announcement.message}
                        onChange={(e) => setAnnouncement((prev) => ({ ...prev, message: e.target.value }))}
                        placeholder="Announcement message"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <AppDropdown
                        value={announcement.level}
                        onChange={(v) => setAnnouncement(prev => ({ ...prev, level: v as 'info' | 'warning' | 'critical' }))}
                        options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]}
                        placeholder='Info'
                    />
                    <button
                        type="button"
                        onClick={() => announcementMutation.mutate()}
                        disabled={announcementMutation.isPending || !announcement.title.trim() || !announcement.message.trim()}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        Send Tenant Announcement
                    </button>
                </div>
            </section>
        </div>
    );
}

function InfoCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm font-semibold text-slate-900 mt-1">{value}</p>
        </div>
    );
}
