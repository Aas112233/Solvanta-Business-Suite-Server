import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { createTenantCompany, fetchSuperAdminTenants, Tenant, updateTenantStatus } from './api';

type TenantFilter = 'All' | 'Active' | 'Trial' | 'Suspended';

const tenantStatusClassMap: Record<Tenant['status'], string> = {
    Active: 'bg-emerald-50 text-emerald-700',
    Trial: 'bg-sky-50 text-sky-700',
    Suspended: 'bg-red-50 text-red-700',
};

export default function SuperAdminCompanies() {
    const queryClient = useQueryClient();
    const [tenantFilter, setTenantFilter] = useState<TenantFilter>('All');
    const [search, setSearch] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
    const [form, setForm] = useState({
        companyName: '',
        currency: 'SAR',
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

    const { data: tenants = [], isLoading } = useQuery({
        queryKey: ['super-admin', 'tenants'],
        queryFn: fetchSuperAdminTenants,
    });

    const statusMutation = useMutation({
        mutationFn: ({ tenantId, status, reason }: { tenantId: string; status: 'Active' | 'Suspended'; reason?: string }) =>
            updateTenantStatus(tenantId, status, reason),
        onSuccess: () => {
            toast.success('Tenant status updated');
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
            queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit'] });
        },
        onError: () => toast.error('Failed to update tenant status'),
    });

    const createTenantMutation = useMutation({
        mutationFn: async () => {
            if (!form.companyName.trim()) {
                throw new Error('Company name is required');
            }
            if (!form.currency.trim()) {
                throw new Error('Currency is required');
            }
            if (!form.adminName.trim()) {
                throw new Error('Admin name is required');
            }
            if (!form.adminEmail.trim()) {
                throw new Error('Admin email is required');
            }
            if (!form.adminPassword.trim()) {
                throw new Error('Admin password is required');
            }

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
                currency: 'SAR',
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

    const filteredTenants = useMemo(() => {
        const byStatus = tenantFilter === 'All' ? tenants : tenants.filter((tenant) => tenant.status === tenantFilter);
        if (!search.trim()) return byStatus;
        return byStatus.filter((tenant) => tenant.name.toLowerCase().includes(search.trim().toLowerCase()));
    }, [search, tenantFilter, tenants]);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Company Management</h2>
                    <p className="text-xs text-slate-500">Tenant lifecycle control and per-company management.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setShowCreateForm((prev) => !prev);
                            setCreatedCredentials(null);
                        }}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                    >
                        {showCreateForm ? 'Close Create Form' : 'Create Company'}
                    </button>
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search company..."
                            className="rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-slate-400"
                        />
                    </div>
                </div>
            </div>

            {createdCredentials && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    Admin credentials: <span className="font-semibold">{createdCredentials.email}</span> / <span className="font-semibold">{createdCredentials.password}</span>
                </div>
            )}

            {showCreateForm && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Create New Company</h3>
                    <p className="text-xs text-slate-600 mt-1">Provide required company information and the first admin account credentials.</p>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            value={form.companyName}
                            onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                            placeholder="Company Name *"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.currency}
                            onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                            placeholder="Currency (e.g. SAR) *"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.vatNumber}
                            onChange={(e) => setForm((prev) => ({ ...prev, vatNumber: e.target.value }))}
                            placeholder="VAT Number"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.contactEmail}
                            onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                            placeholder="Company Contact Email"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.contactPhone}
                            onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                            placeholder="Company Contact Phone"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.contactAddress}
                            onChange={(e) => setForm((prev) => ({ ...prev, contactAddress: e.target.value }))}
                            placeholder="Company Address"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.adminName}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminName: e.target.value }))}
                            placeholder="Admin Full Name *"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.adminEmail}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value }))}
                            placeholder="Admin Email *"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            type="password"
                            value={form.adminPassword}
                            onChange={(e) => setForm((prev) => ({ ...prev, adminPassword: e.target.value }))}
                            placeholder="Admin Password *"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.headOfficeName}
                            onChange={(e) => setForm((prev) => ({ ...prev, headOfficeName: e.target.value }))}
                            placeholder="Head Office Name"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                        <input
                            value={form.headOfficeCode}
                            onChange={(e) => setForm((prev) => ({ ...prev, headOfficeCode: e.target.value }))}
                            placeholder="Head Office Code"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
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
                            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="mt-3 flex items-center gap-2">
                {(['All', 'Active', 'Trial', 'Suspended'] as const).map((filter) => (
                    <button
                        key={filter}
                        type="button"
                        onClick={() => setTenantFilter(filter)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            tenantFilter === filter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="py-2 pr-3">Company</th>
                            <th className="py-2 pr-3">Plan</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 pr-3">Revenue</th>
                            <th className="py-2 pr-3">Users</th>
                            <th className="py-2 pr-3">Updated</th>
                            <th className="py-2">Operations</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr>
                                <td className="py-5 text-slate-500" colSpan={7}>Loading companies...</td>
                            </tr>
                        )}
                        {!isLoading && filteredTenants.length === 0 && (
                            <tr>
                                <td className="py-5 text-slate-500" colSpan={7}>No companies match this filter.</td>
                            </tr>
                        )}
                        {!isLoading &&
                            filteredTenants.map((tenant) => (
                                <tr key={tenant.id} className="border-b border-slate-100 last:border-none">
                                    <td className="py-3 pr-3">
                                        <p className="font-medium text-slate-900">{tenant.name}</p>
                                        <p className="text-xs text-slate-500">{tenant.id}</p>
                                    </td>
                                    <td className="py-3 pr-3 text-slate-700">{tenant.plan}</td>
                                    <td className="py-3 pr-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tenantStatusClassMap[tenant.status]}`}>
                                            {tenant.status}
                                        </span>
                                        {tenant.maintenance.enabled && (
                                            <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                                Maintenance
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 pr-3 text-slate-700">${tenant.monthlyRevenue.toLocaleString()}</td>
                                    <td className="py-3 pr-3 text-slate-700">{tenant.activeUsers} / {tenant.totalUsers}</td>
                                    <td className="py-3 pr-3 text-xs text-slate-500">{new Date(tenant.updatedAt).toLocaleString()}</td>
                                    <td className="py-3">
                                        <div className="flex items-center gap-2">
                                            <Link
                                                to={`/super-admin/companies/${tenant.id}`}
                                                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                            >
                                                Open
                                            </Link>
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
        </section>
    );
}
