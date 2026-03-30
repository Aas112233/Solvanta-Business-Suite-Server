import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { fetchSuperAdminAudit, fetchSuperAdminTenants } from './api';
import AppDropdown from '../../components/ui/AppDropdown';

export default function SuperAdminAudit() {
    const [search, setSearch] = useState('');
    const [action, setAction] = useState('');
    const [companyId, setCompanyId] = useState('');

    const { data: tenants = [] } = useQuery({
        queryKey: ['super-admin', 'tenants'],
        queryFn: fetchSuperAdminTenants,
    });

    const { data = [], isLoading } = useQuery({
        queryKey: ['super-admin', 'audit', { search, action, companyId }],
        queryFn: () => fetchSuperAdminAudit({
            limit: 50,
            search: search.trim() || undefined,
            action: action || undefined,
            companyId: companyId || undefined,
        }),
    });

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Audit Logs</h2>
            <p className="text-xs text-slate-500">Recent high-impact actions across tenants.</p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search actor/action/company..."
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
    onChange={(v) => setCompanyId(v)}
                    options={[{ value: '', label: 'All companies' }, ...tenants.map((tenant: any) => ({ value: tenant.id, label: tenant.name }))]}
                    placeholder='All companies'
                    searchable
                />
            </div>
            <div className="mt-4 divide-y divide-slate-100">
                {isLoading && <div className="py-4 text-sm text-slate-500">Loading logs...</div>}
                {!isLoading && data.length === 0 && <div className="py-4 text-sm text-slate-500">No audit data found.</div>}
                {!isLoading &&
                    data.map((item) => (
                        <div key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm text-slate-800">
                                    <span className="font-semibold">{item.actor}</span> {item.action} on <span className="font-semibold">{item.target}</span>
                                </p>
                                <p className="text-xs text-slate-500">{item.company}</p>
                            </div>
                            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <CheckCircle2 size={14} />
                                {item.createdAt}
                            </div>
                        </div>
                    ))}
            </div>
        </section>
    );
}
