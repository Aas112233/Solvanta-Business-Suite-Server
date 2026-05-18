import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from '@/lib/toast';
import AppLoader from '../../components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { SUPER_ADMIN_PERMISSIONS } from '../../lib/superAdminPermissions';
import SuperAdminAccessCard from './SuperAdminAccessCard';
import ImpersonationDialog from './ImpersonationDialog';
import TenantStatusDialog from './TenantStatusDialog';
import {
    broadcastTenantAnnouncement,
    fetchSuperAdminTenants,
    fetchTenantControlCenter,
    fetchTenantUsage,
    impersonateTenantUser,
    Tenant,
    TenantPlan,
    updateTenantLimits,
    updateTenantMaintenance,
    updateTenantPlan,
    updateTenantStatus,
    updateTenantUserStatus,
    updateTenantUserPassword,
    createTenantUser,
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
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const setUser = useAuthStore((state) => state.setUser);
    const startImpersonation = useAuthStore((state) => state.startImpersonation);
    const canReadTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ),
    );
    const canManageTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_MANAGE),
    );
    const canManageBilling = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.BILLING_MANAGE),
    );
    const canManageLimits = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.LIMITS_MANAGE),
    );
    const canManageMaintenance = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.MAINTENANCE_MANAGE),
    );
    const canManageUsers = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.USERS_MANAGE),
    );
    const canImpersonateUsers = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.USERS_IMPERSONATE),
    );
    const canManageAnnouncements = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.ANNOUNCEMENTS_MANAGE),
    );

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
    const [statusReason, setStatusReason] = useState('');
    const [pendingStatus, setPendingStatus] = useState<'Active' | 'Suspended' | null>(null);

    const [userSearch, setUserSearch] = useState('');
    const [userFilter, setUserFilter] = useState<UserFilter>('All');

    // Role options for new user
    const roleOptions = useMemo(() => [
        { value: '', label: 'Select Role (Optional)' },
        { value: 'Admin', label: 'Admin' },
        { value: 'Manager', label: 'Manager' },
        { value: 'Operations Associate', label: 'Operations Associate' },
        { value: 'Accountant', label: 'Accountant' },
        { value: 'Sales Associate', label: 'Sales Associate' },
        { value: 'Cashier', label: 'Cashier' },
        { value: 'Shopkeeper', label: 'Shopkeeper' },
        { value: 'Viewer', label: 'Viewer' },
    ], []);

    // New User Form
    const [showNewUserForm, setShowNewUserForm] = useState(false);
    const [newUserForm, setNewUserForm] = useState({
        name: '',
        email: '',
        password: '',
        role: '',
        phone: '',
    });
    const [newUserErrors, setNewUserErrors] = useState<Record<string, string>>({});

    // User Password Reset
    const [passwordResetUser, setPasswordResetUser] = useState<{ id: string; name: string } | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [impersonationUser, setImpersonationUser] = useState<{ id: string; name: string; email: string } | null>(null);
    const [impersonationReason, setImpersonationReason] = useState('');
    const [impersonationTicket, setImpersonationTicket] = useState('');
    const focusedUserId = searchParams.get('userId')?.trim() || '';

    const { data: tenants = [], isLoading: loadingTenant } = useQuery<Tenant[]>({
        queryKey: ['super-admin', 'tenants'],
        queryFn: () => fetchSuperAdminTenants(),
        enabled: canReadTenants,
    });

    const { data: controlCenter, isLoading: loadingControlCenter } = useQuery({
        queryKey: ['super-admin', 'tenant-control', id],
        queryFn: () => fetchTenantControlCenter(id),
        enabled: canReadTenants && Boolean(id),
    });

    const { data: usage, isLoading: loadingUsage } = useQuery({
        queryKey: ['super-admin', 'tenant-usage', id],
        queryFn: () => fetchTenantUsage(id),
        enabled: canReadTenants && Boolean(id),
    });

    const tenant = tenants.find((item: Tenant) => item.id === id);

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
        onSuccess: (data) => {
            toast.success(
                data.status === 'Suspended'
                    ? `Tenant suspended. ${data.affectedUsers} user${data.affectedUsers === 1 ? '' : 's'} paused.`
                    : `Tenant reactivated. ${data.affectedUsers} user${data.affectedUsers === 1 ? '' : 's'} restored.`,
            );
            setPendingStatus(null);
            setStatusReason('');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant-control', id] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: (error: any) => toast.error(error?.response?.data?.error?.message || 'Failed to update tenant status'),
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
        onError: (error: any) => toast.error(error?.response?.data?.error?.message || 'Failed to update user status'),
    });

    const passwordMutation = useMutation({
        mutationFn: ({ userId, password }: { userId: string; password: string }) =>
            updateTenantUserPassword(id, userId, password),
        onSuccess: () => {
            toast.success('User password updated');
            setPasswordResetUser(null);
            setNewPassword('');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: (error: any) => toast.error(error?.response?.data?.error?.message || 'Failed to update user password'),
    });

    const createUserMutation = useMutation({
        mutationFn: (payload: { name: string; email: string; password: string; role?: string; phone?: string }) =>
            createTenantUser(id, payload),
        onSuccess: () => {
            toast.success('User created successfully');
            setShowNewUserForm(false);
            setNewUserForm({ name: '', email: '', password: '', role: '', phone: '' });
            setNewUserErrors({});
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant-control', id] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: (error: any) => {
            const message = error?.response?.data?.error?.message || 'Failed to create user';
            toast.error(message);
            if (error?.response?.data?.error?.details) {
                setNewUserErrors(error.response.data.error.details);
            }
        },
    });

    const impersonationMutation = useMutation({
        mutationFn: ({ userId, reason, ticket }: { userId: string; reason: string; ticket?: string }) =>
            impersonateTenantUser(id, userId, { reason, ticket }),
        onSuccess: async (session) => {
            startImpersonation({
                token: session.accessToken,
                refreshToken: session.refreshToken,
            });

            const profile = await api.get('/users/me');
            setUser(profile.data.data);
            setImpersonationUser(null);
            setImpersonationReason('');
            setImpersonationTicket('');
            toast.success(`Now impersonating ${session.targetUser.name}`);
            navigate('/');
        },
        onError: (error: any) => toast.error(error?.response?.data?.error?.message || 'Failed to start impersonation'),
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
            if (focusedUserId && user.id === focusedUserId) return true;
            if (userFilter === 'Active' && !user.isActive) return false;
            if (userFilter === 'Inactive' && user.isActive) return false;
            if (!userSearch.trim()) return true;
            const searchTerm = userSearch.trim().toLowerCase();
            return user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm);
        });
    }, [controlCenter?.users, focusedUserId, userFilter, userSearch]);

    const focusedUser = useMemo(
        () => controlCenter?.users.find((user) => user.id === focusedUserId) ?? null,
        [controlCenter?.users, focusedUserId],
    );

    useEffect(() => {
        if (!focusedUserId) return;

        const frame = window.requestAnimationFrame(() => {
            const row = document.getElementById(`tenant-user-row-${focusedUserId}`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [focusedUserId, filteredUsers.length]);

    if (!canReadTenants) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include tenant visibility." />
        );
    }

    if (loadingTenant || loadingControlCenter || loadingUsage) {
        return <AppLoader />;
    }

    if (!tenant) {
        return (
            <div className="rounded-2xl border border-border bg-background-card p-5 text-sm text-text-secondary">
                Company not found. <Link to="/super-admin/companies" className="text-blue-600">Back to company list</Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-background-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-text-tertiary">Company Profile</p>
                        <h2 className="text-xl font-bold text-text-primary">{tenant.name}</h2>
                        <p className="text-xs text-text-tertiary mt-1">{tenant.id}</p>
                    </div>
                    <Link to="/super-admin/companies" className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-background-subtle">
                        Back To Companies
                    </Link>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <InfoCard label="Plan" value={tenant.plan} />
                    <InfoCard label="Status" value={tenant.status} />
                    <InfoCard label="Users" value={`${tenant.activeUsers} / ${tenant.totalUsers}`} />
                    <InfoCard label="Health" value={`${tenant.healthScore}/100 • ${tenant.healthStatus}`} />
                    <InfoCard label="Payment" value={tenant.paymentStatus} />
                    <InfoCard label="Module Adoption" value={`${tenant.moduleUsageSummary.adoptedModules}/${tenant.moduleUsageSummary.enabledModules}`} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canManageTenants && (
                        tenant.status === 'Suspended' ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingStatus('Active');
                                    setStatusReason('');
                                }}
                                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                                Activate Tenant
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingStatus('Suspended');
                                    setStatusReason('');
                                }}
                                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                            >
                                Suspend Tenant
                            </button>
                        )
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
                {tenant.statusChangedAt && (
                    <p className="mt-2 text-xs text-text-tertiary">
                        Last status change: {new Date(tenant.statusChangedAt).toLocaleString()}
                        {tenant.statusChangedBy ? ` by ${tenant.statusChangedBy}` : ''}
                    </p>
                )}
                {tenant.graceEndsAt && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        Resource grace window ends {new Date(tenant.graceEndsAt).toLocaleString()}.
                        {tenant.daysUntilAutoSuspend !== null ? ` Auto-suspension in ${tenant.daysUntilAutoSuspend} day${tenant.daysUntilAutoSuspend === 1 ? '' : 's'}.` : ''}
                    </p>
                )}
                {tenant.healthDrivers.length > 0 && (
                    <p className="mt-2 text-xs text-text-tertiary">
                        Health drivers: {tenant.healthDrivers.join(' • ')}
                    </p>
                )}
            </section>

            <section className="rounded-2xl border border-border bg-background-card p-5">
                <h3 className="text-lg font-semibold text-text-primary">Usage Insights</h3>
                {loadingUsage && <p className="mt-3 text-sm text-text-tertiary">Loading usage snapshot...</p>}
                {!loadingUsage && usage && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(usage.counts).map(([key, value]) => (
                            <div key={key} className="rounded-lg border border-border p-3">
                                <p className="text-xs text-text-tertiary">{key}</p>
                                <p className="text-lg font-semibold text-text-primary">{value}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-border bg-background-card p-5">
                <h3 className="text-lg font-semibold text-text-primary">Tenant Health & Module Adoption</h3>
                <p className="text-xs text-text-tertiary">Activity-based module analytics and tenant health factors from the last 30 days.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <InfoCard label="Health Trend" value={tenant.healthTrend} />
                    <InfoCard label="Last Activity" value={new Date(tenant.lastActivityAt).toLocaleString()} />
                    <InfoCard
                        label="Unused Enabled Modules"
                        value={tenant.moduleUsageSummary.unusedEnabledModules.length === 0 ? 'None' : tenant.moduleUsageSummary.unusedEnabledModules.join(', ')}
                    />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {(Object.values(tenant.moduleUsage) as Tenant['moduleUsage'][keyof Tenant['moduleUsage']][]).map((module) => (
                        <div key={module.key} className="rounded-xl border border-border p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold uppercase tracking-wide text-text-primary">{module.key}</p>
                                    <p className="text-xs text-text-tertiary">
                                        {module.monthlyActiveUsers} MAU • {module.eventCount30d} events in 30 days
                                    </p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${module.status === 'adopted'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : module.status === 'unused'
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'bg-background-subtle text-text-secondary'
                                    }`}>
                                    {module.status}
                                </span>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-text-secondary">
                                <div className="rounded-lg bg-background-subtle px-2 py-2">DAU: {module.dailyActiveUsers}</div>
                                <div className="rounded-lg bg-background-subtle px-2 py-2">WAU: {module.weeklyActiveUsers}</div>
                                <div className="rounded-lg bg-background-subtle px-2 py-2">Adoption: {module.adoptionRate}%</div>
                            </div>
                            {module.lastUsedAt && (
                                <p className="mt-2 text-xs text-text-tertiary">Last activity: {new Date(module.lastUsedAt).toLocaleString()}</p>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {canManageBilling && (
                <section className="rounded-2xl border border-border bg-background-card p-5">
                    <h3 className="text-lg font-semibold text-text-primary">Plan & Billing Controls</h3>
                    <p className="text-xs text-text-tertiary">Override commercial plan and billing metrics used in super-admin reporting.</p>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="text-xs text-text-secondary">Plan</label>
                            <AppDropdown
                                value={planDraft.plan}
                                onChange={(v) => setPlanDraft(prev => ({ ...prev, plan: v as TenantPlan }))}
                                options={[{ value: 'Starter', label: 'Starter' }, { value: 'Growth', label: 'Growth' }, { value: 'SOLVANTA', label: 'SOLVANTA' }]}
                                placeholder='Starter'
                            />
                        </div>
                        <div>
                            <label className="text-xs text-text-secondary">Monthly Revenue</label>
                            <input
                                type="number"
                                min={0}
                                value={planDraft.monthlyRevenue}
                                onChange={(e) => setPlanDraft((prev) => ({ ...prev, monthlyRevenue: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-text-secondary">Failed Payments</label>
                            <input
                                type="number"
                                min={0}
                                value={planDraft.failedPayments}
                                onChange={(e) => setPlanDraft((prev) => ({ ...prev, failedPayments: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-text-secondary">Next Billing Date</label>
                            <input
                                type="date"
                                value={planDraft.nextBillingDate}
                                onChange={(e) => setPlanDraft((prev) => ({ ...prev, nextBillingDate: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => planMutation.mutate()}
                        disabled={planMutation.isPending}
                        className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        Save Plan Controls
                    </button>
                </section>
            )}

            {canManageLimits && (
                <section className="rounded-2xl border border-border bg-background-card p-5">
                    <h3 className="text-lg font-semibold text-text-primary">Resource Limits</h3>
                    <p className="text-xs text-text-tertiary">Set enforced limits. Warnings start at 80% and 90%, new resources are blocked at the limit, and unresolved breaches auto-suspend after 7 days.</p>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-text-secondary">Max Users</label>
                            <input
                                type="number"
                                min={1}
                                value={limitsDraft.maxUsers}
                                onChange={(e) => setLimitsDraft((prev) => ({ ...prev, maxUsers: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                                placeholder="Unlimited"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-text-secondary">Max Branches</label>
                            <input
                                type="number"
                                min={1}
                                value={limitsDraft.maxBranches}
                                onChange={(e) => setLimitsDraft((prev) => ({ ...prev, maxBranches: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                                placeholder="Unlimited"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-text-secondary">Max Products</label>
                            <input
                                type="number"
                                min={1}
                                value={limitsDraft.maxProducts}
                                onChange={(e) => setLimitsDraft((prev) => ({ ...prev, maxProducts: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                                placeholder="Unlimited"
                            />
                        </div>
                    </div>
                    <div className="mt-3 rounded-lg bg-background-subtle px-3 py-2 text-xs text-text-secondary">
                        Current usage: {controlCenter?.usage.users ?? tenant.totalUsers} users, {controlCenter?.usage.branches ?? tenant.totalBranches} branches, {controlCenter?.usage.products ?? tenant.totalProducts} products
                    </div>
                    {tenant.limitWarnings.length > 0 && (
                        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {tenant.limitWarnings.map((warning: Tenant['limitWarnings'][number]) => `${warning.label}: ${warning.count}/${warning.limit ?? 'Unlimited'} (${warning.percentUsed ?? 0}%)`).join(' • ')}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => limitsMutation.mutate()}
                        disabled={limitsMutation.isPending}
                        className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        Save Limits
                    </button>
                </section>
            )}

            {canManageMaintenance && (
                <section className="rounded-2xl border border-border bg-background-card p-5">
                    <h3 className="text-lg font-semibold text-text-primary">Maintenance Lock</h3>
                    <p className="text-xs text-text-tertiary">When enabled, this tenant cannot access APIs except super-admin users.</p>
                    <div className="mt-4 flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                            <p className="text-sm font-medium text-text-primary">Enable maintenance mode</p>
                            <p className="text-xs text-text-tertiary">Block tenant access with a platform message.</p>
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
                        className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                    />
                    <button
                        type="button"
                        onClick={() => maintenanceMutation.mutate()}
                        disabled={maintenanceMutation.isPending}
                        className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        Save Maintenance Controls
                    </button>
                </section>
            )}

            {canManageUsers && (
                <section className="rounded-2xl border border-border bg-background-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-semibold text-text-primary">Tenant User Control</h3>
                            <p className="text-xs text-text-tertiary">Activate or suspend individual users inside this tenant.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder="Search user..."
                                className="rounded-lg border border-border px-3 py-1.5 text-sm outline-none focus:border-border-strong"
                            />
                            <AppDropdown
                                value={userFilter}
                                onChange={(v) => setUserFilter(v as UserFilter)}
                                options={[{ value: 'All', label: 'All' }, { value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
                                placeholder='All'
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewUserForm(!showNewUserForm)}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                            >
                                {showNewUserForm ? 'Cancel' : 'Add New User'}
                            </button>
                        </div>
                    </div>

                    {showNewUserForm && (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                            <h4 className="mb-3 text-sm font-semibold text-text-primary">Add New User</h4>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">Name *</label>
                                    <input
                                        value={newUserForm.name}
                                        onChange={(e) => setNewUserForm(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Full name"
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-border-strong ${newUserErrors.name ? 'border-red-500' : 'border-border'}`}
                                    />
                                    {newUserErrors.name && <p className="mt-1 text-xs text-red-600">{newUserErrors.name}</p>}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">Email *</label>
                                    <input
                                        value={newUserForm.email}
                                        onChange={(e) => setNewUserForm(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="Email address"
                                        type="email"
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-border-strong ${newUserErrors.email ? 'border-red-500' : 'border-border'}`}
                                    />
                                    {newUserErrors.email && <p className="mt-1 text-xs text-red-600">{newUserErrors.email}</p>}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">Password *</label>
                                    <input
                                        value={newUserForm.password}
                                        onChange={(e) => setNewUserForm(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder="Password"
                                        type="password"
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-border-strong ${newUserErrors.password ? 'border-red-500' : 'border-border'}`}
                                    />
                                    {newUserErrors.password && <p className="mt-1 text-xs text-red-600">{newUserErrors.password}</p>}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">Role</label>
                                    <AppDropdown
                                        value={newUserForm.role}
                                        onChange={(v) => setNewUserForm(prev => ({ ...prev, role: v }))}
                                        options={roleOptions}
                                        placeholder='Select Role (Optional)'
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">Phone</label>
                                    <input
                                        value={newUserForm.phone}
                                        onChange={(e) => setNewUserForm(prev => ({ ...prev, phone: e.target.value }))}
                                        placeholder="Phone number"
                                        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                                    />
                                </div>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowNewUserForm(false);
                                        setNewUserForm({ name: '', email: '', password: '', role: '', phone: '' });
                                        setNewUserErrors({});
                                    }}
                                    className="rounded-lg bg-background-subtle px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const errors: Record<string, string> = {};
                                        if (!newUserForm.name.trim()) errors.name = 'Name is required';
                                        if (!newUserForm.email.trim()) errors.email = 'Email is required';
                                        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUserForm.email)) errors.email = 'Invalid email format';
                                        if (!newUserForm.password.trim()) errors.password = 'Password is required';
                                        else if (newUserForm.password.length < 6) errors.password = 'Password must be at least 6 characters';

                                        if (Object.keys(errors).length > 0) {
                                            setNewUserErrors(errors);
                                            return;
                                        }

                                        createUserMutation.mutate({
                                            name: newUserForm.name.trim(),
                                            email: newUserForm.email.trim(),
                                            password: newUserForm.password,
                                            role: newUserForm.role.trim() || undefined,
                                            phone: newUserForm.phone.trim() || undefined,
                                        });
                                    }}
                                    disabled={createUserMutation.isPending}
                                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </div>
                    )}

                    {loadingControlCenter && <p className="mt-4 text-sm text-text-tertiary">Loading tenant users...</p>}

                    {!loadingControlCenter && (
                        <div className="mt-4 overflow-x-auto">
                            {focusedUser && (
                                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    Focused user from support session: <span className="font-semibold">{focusedUser.name}</span> ({focusedUser.email})
                                </div>
                            )}
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-tertiary">
                                        <th className="py-2 pr-3">Name</th>
                                        <th className="py-2 pr-3">Role</th>
                                        <th className="py-2 pr-3">Last Login</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((user) => (
                                        <tr
                                            key={user.id}
                                            id={`tenant-user-row-${user.id}`}
                                            className={`border-b border-border-subtle last:border-none ${focusedUserId === user.id ? 'bg-amber-50/70' : ''}`}
                                        >
                                            <td className="py-3 pr-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-medium text-text-primary">{user.name}</p>
                                                    {user.isSuperAdmin && (
                                                        <span className="inline-flex rounded-full bg-background-subtle px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                                                            Protected
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-text-tertiary">{user.email}</p>
                                            </td>
                                            <td className="py-3 pr-3 text-text-secondary">{user.role}</td>
                                            <td className="py-3 pr-3 text-xs text-text-tertiary">
                                                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                                            </td>
                                            <td className="py-3 pr-3">
                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                                    {user.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                {user.isSuperAdmin ? (
                                                    <span className="text-xs font-medium text-text-tertiary">Protected account</span>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => userStatusMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                                                            className={`rounded-md px-2 py-1 text-xs font-medium text-white ${user.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                                        >
                                                            {user.isActive ? 'Suspend' : 'Activate'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setPasswordResetUser({ id: user.id, name: user.name });
                                                                setNewPassword('');
                                                            }}
                                                            className="rounded-md bg-background-subtle px-2 py-1 text-xs font-medium text-text-secondary hover:bg-slate-200"
                                                        >
                                                            Password
                                                        </button>
                                                        {canImpersonateUsers && user.canImpersonate !== false && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setImpersonationUser({ id: user.id, name: user.name, email: user.email });
                                                                    setImpersonationReason('');
                                                                    setImpersonationTicket('');
                                                                }}
                                                                className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
                                                            >
                                                                Impersonate
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredUsers.length === 0 && <p className="py-4 text-sm text-text-tertiary">No users matched this filter.</p>}
                        </div>
                    )}
                </section>
            )}

            {canManageAnnouncements && (
                <section className="rounded-2xl border border-border bg-background-card p-5">
                    <h3 className="text-lg font-semibold text-text-primary">Tenant Announcement</h3>
                    <p className="text-xs text-text-tertiary">Send a control message only to this tenant.</p>
                    <div className="mt-4 space-y-3">
                        <input
                            value={announcement.title}
                            onChange={(e) => setAnnouncement((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder="Announcement title"
                            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                        />
                        <textarea
                            rows={4}
                            value={announcement.message}
                            onChange={(e) => setAnnouncement((prev) => ({ ...prev, message: e.target.value }))}
                            placeholder="Announcement message"
                            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
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
                            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            Send Tenant Announcement
                        </button>
                    </div>
                </section>
            )}

            {/* Password Reset Modal */}
            {canManageUsers && passwordResetUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-sm rounded-2xl bg-background-card p-5 shadow-xl">
                        <h3 className="text-lg font-bold text-text-primary">Reset Password</h3>
                        <p className="mt-1 text-sm text-text-tertiary">
                            Enter a new password for <strong>{passwordResetUser.name}</strong>.
                        </p>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New password (min 6 chars)"
                            className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-border-strong"
                        />
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setPasswordResetUser(null);
                                    setNewPassword('');
                                }}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-background-subtle"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={newPassword.length < 6 || passwordMutation.isPending}
                                onClick={() => passwordMutation.mutate({ userId: passwordResetUser.id, password: newPassword })}
                                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {passwordMutation.isPending ? 'Saving...' : 'Update Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {canImpersonateUsers && impersonationUser && (
                <ImpersonationDialog
                    userName={impersonationUser.name}
                    userEmail={impersonationUser.email}
                    reason={impersonationReason}
                    ticket={impersonationTicket}
                    onReasonChange={setImpersonationReason}
                    onTicketChange={setImpersonationTicket}
                    onClose={() => {
                        setImpersonationUser(null);
                        setImpersonationReason('');
                        setImpersonationTicket('');
                    }}
                    onConfirm={() => impersonationMutation.mutate({
                        userId: impersonationUser.id,
                        reason: impersonationReason.trim(),
                        ticket: impersonationTicket.trim() || undefined,
                    })}
                    isSubmitting={impersonationMutation.isPending}
                />
            )}

            {canManageTenants && pendingStatus && (
                <TenantStatusDialog
                    tenantName={tenant.name}
                    nextStatus={pendingStatus}
                    reason={statusReason}
                    onReasonChange={setStatusReason}
                    onClose={() => {
                        setPendingStatus(null);
                        setStatusReason('');
                    }}
                    onConfirm={() => statusMutation.mutate({
                        status: pendingStatus,
                        reason: pendingStatus === 'Suspended' ? statusReason.trim() : undefined,
                    })}
                    isSubmitting={statusMutation.isPending}
                    affectedUsers={pendingStatus === 'Suspended' ? tenant.activeUsers : tenant.suspendedUserCount}
                />
            )}
        </div>
    );
}

function InfoCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-text-tertiary">{label}</p>
            <p className="text-sm font-semibold text-text-primary mt-1">{value}</p>
        </div>
    );
}
