import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeDollarSign, Building2, Clock3, Flag, Shield } from 'lucide-react';
import { fetchSuperAdminOverview } from './api';

const statusClassMap = {
    Healthy: 'bg-emerald-50 text-emerald-700',
    Warning: 'bg-amber-50 text-amber-700',
    Critical: 'bg-red-50 text-red-700',
};

export default function SuperAdminDashboard() {
    const { data, isLoading } = useQuery({
        queryKey: ['super-admin', 'overview'],
        queryFn: fetchSuperAdminOverview,
    });

    const kpis = data?.kpis;

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Control Tower Dashboard</h2>
                        <p className="text-sm text-slate-600 mt-1">Snapshot of platform tenants, billing placeholders, and service health.</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                        <Shield size={14} />
                        Owner Mode
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-3">
                    <MetricCard icon={Building2} label="Active Tenants" value={isLoading ? '...' : String(kpis?.activeTenants ?? 0)} />
                    <MetricCard icon={Clock3} label="Trial Tenants" value={isLoading ? '...' : String(kpis?.trialTenants ?? 0)} />
                    <MetricCard icon={AlertTriangle} label="Suspended" value={isLoading ? '...' : String(kpis?.suspendedTenants ?? 0)} />
                    <MetricCard icon={BadgeDollarSign} label="MRR" value={isLoading ? '...' : `$${kpis?.mrr?.toLocaleString() ?? 0}`} />
                    <MetricCard icon={Flag} label="Failed Payments" value={isLoading ? '...' : String(kpis?.failedPayments ?? 0)} />
                    <MetricCard icon={Shield} label="Maintenance" value={isLoading ? '...' : String(kpis?.maintenanceTenants ?? 0)} />
                    <MetricCard icon={AlertTriangle} label="Limit Breaches" value={isLoading ? '...' : String(kpis?.breachedLimitTenants ?? 0)} />
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">System Health</h3>
                <p className="text-xs text-slate-500">Current platform service indicators.</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(data?.health ?? []).map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClassMap[item.status]}`}>
                                    {item.status}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{item.value}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="inline-flex rounded-lg bg-white p-2 text-slate-700">
                <Icon size={16} />
            </div>
            <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-lg font-bold text-slate-900">{value}</p>
        </div>
    );
}
