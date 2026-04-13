import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download } from 'lucide-react';
import { exportSuperAdminAuditCsv, fetchSuperAdminAudit, fetchSuperAdminTenants } from './api';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';
import { SUPER_ADMIN_PERMISSIONS } from '../../lib/superAdminPermissions';
import SuperAdminAccessCard from './SuperAdminAccessCard';

const severityClassMap = {
    Info: 'bg-slate-100 text-slate-700',
    Warning: 'bg-amber-50 text-amber-700',
    Critical: 'bg-red-50 text-red-700',
};

export default function SuperAdminAudit() {
    const canReadAudit = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.AUDIT_READ),
    );
    const canReadTenants = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.TENANTS_READ),
    );
    const [search, setSearch] = useState('');
    const [action, setAction] = useState('');
    const [companyId, setCompanyId] = useState('');

    const { data: tenants = [] } = useQuery({
        queryKey: ['super-admin', 'tenants'],
        queryFn: () => fetchSuperAdminTenants(),
        enabled: canReadAudit && canReadTenants,
    });

    const { data = [], isLoading } = useQuery({
        queryKey: ['super-admin', 'audit', { search, action, companyId }],
        queryFn: () => fetchSuperAdminAudit({
            limit: 50,
            search: search.trim() || undefined,
            action: action || undefined,
            companyId: companyId || undefined,
        }),
        enabled: canReadAudit,
    });

    const exportMutation = useMutation({
        mutationFn: () => exportSuperAdminAuditCsv({
            search: search.trim() || undefined,
            action: action || undefined,
            companyId: companyId || undefined,
        }),
        onSuccess: (blob) => {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `super-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            window.URL.revokeObjectURL(url);
        },
    });

    if (!canReadAudit) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include audit log access." />
        );
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Audit Logs</h2>
                    <p className="text-xs text-slate-500">Recent high-impact actions across tenants, including before/after state and request metadata.</p>
                </div>
                <button
                    type="button"
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    <Download size={14} />
                    {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
                </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search actor, action, company, target..."
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <input
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    placeholder="Filter by action key"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <AppDropdown
                    value={companyId}
                    onChange={(value) => setCompanyId(value)}
                    options={[{ value: '', label: 'All companies' }, ...tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }))]}
                    placeholder="All companies"
                    searchable
                />
            </div>
            <div className="mt-4 divide-y divide-slate-100">
                {isLoading && <div className="py-4 text-sm text-slate-500">Loading logs...</div>}
                {!isLoading && data.length === 0 && <div className="py-4 text-sm text-slate-500">No audit data found.</div>}
                {!isLoading && data.map((item) => (
                    <div key={item.id} className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-sm text-slate-800">
                                    <span className="font-semibold">{item.actor}</span> {item.action} on <span className="font-semibold">{item.target}</span>
                                </p>
                                <p className="mt-1 text-xs text-slate-500">{item.company}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClassMap[item.severity]}`}>
                                    {item.severity}
                                </span>
                                <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                                    <CheckCircle2 size={14} />
                                    {item.createdAt}
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
                            <AuditBlock title="Before" payload={item.before} />
                            <AuditBlock title="After" payload={item.after} />
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Request</p>
                                <p className="mt-2 text-xs text-slate-700"><span className="font-medium">IP:</span> {item.ipAddress || 'Unavailable'}</p>
                                <p className="mt-1 break-all text-xs text-slate-700"><span className="font-medium">Agent:</span> {item.userAgent || 'Unavailable'}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function AuditBlock({ title, payload }: { title: string; payload: unknown }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                {payload ? JSON.stringify(payload, null, 2) : 'No snapshot recorded'}
            </pre>
        </div>
    );
}
