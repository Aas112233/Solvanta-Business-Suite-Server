import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeDollarSign, Building2, Clock3, Flag, Shield } from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { fetchSuperAdminOverview } from './api';
import { useAuthStore } from '../../stores/authStore';
import { SUPER_ADMIN_PERMISSIONS } from '../../lib/superAdminPermissions';
import SuperAdminAccessCard from './SuperAdminAccessCard';

const statusClassMap = {
    Healthy: 'bg-emerald-50 text-emerald-700',
    Warning: 'bg-amber-50 text-amber-700',
    Critical: 'bg-red-50 text-red-700',
};

const pieColors = ['#0f766e', '#f59e0b', '#dc2626'];
const moduleColors = ['#0f766e', '#94a3b8'];

export default function SuperAdminDashboard() {
    const canReadDashboard = useAuthStore((state) =>
        state.hasSuperAdminPermission(SUPER_ADMIN_PERMISSIONS.DASHBOARD_READ),
    );

    const { data, isLoading } = useQuery({
        queryKey: ['super-admin', 'overview'],
        queryFn: fetchSuperAdminOverview,
        enabled: canReadDashboard,
    });

    if (!canReadDashboard) {
        return (
            <SuperAdminAccessCard message="Your super admin role does not include dashboard access." />
        );
    }

    const kpis = data?.kpis;

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Control Tower Dashboard</h2>
                        <p className="mt-1 text-sm text-slate-600">Platform health, tenant risk, adoption, and revenue signals in one view.</p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                        <Shield size={14} />
                        Owner Mode
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-8">
                    <MetricCard icon={Building2} label="Active Tenants" value={isLoading ? '...' : String(kpis?.activeTenants ?? 0)} />
                    <MetricCard icon={Clock3} label="Trial Tenants" value={isLoading ? '...' : String(kpis?.trialTenants ?? 0)} />
                    <MetricCard icon={AlertTriangle} label="Suspended" value={isLoading ? '...' : String(kpis?.suspendedTenants ?? 0)} />
                    <MetricCard icon={BadgeDollarSign} label="MRR" value={isLoading ? '...' : `$${kpis?.mrr?.toLocaleString() ?? 0}`} />
                    <MetricCard icon={Flag} label="Failed Payments" value={isLoading ? '...' : String(kpis?.failedPayments ?? 0)} />
                    <MetricCard icon={Shield} label="Maintenance" value={isLoading ? '...' : String(kpis?.maintenanceTenants ?? 0)} />
                    <MetricCard icon={AlertTriangle} label="Limit Breaches" value={isLoading ? '...' : String(kpis?.breachedLimitTenants ?? 0)} />
                    <MetricCard icon={Shield} label="Avg Health" value={isLoading ? '...' : `${kpis?.averageHealthScore ?? 0}/100`} />
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <ChartCard title="Tenant Growth" subtitle="New tenants created over the last six months." className="xl:col-span-2">
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={data?.charts.tenantGrowth ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="tenants" fill="#0f766e" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Health Mix" subtitle="Current distribution of tenant health scores.">
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie data={data?.charts.healthDistribution ?? []} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                                {(data?.charts.healthDistribution ?? []).map((entry, index) => (
                                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ChartCard title="Module Adoption" subtitle="Adopted vs unused enabled modules across tenants.">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data?.charts.moduleAdoption ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="module" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="adopted" stackId="modules" fill={moduleColors[0]} radius={[6, 6, 0, 0]} />
                            <Bar dataKey="unused" stackId="modules" fill={moduleColors[1]} radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Attention Queue" subtitle="Tenants that need the fastest follow-up.">
                    <div className="space-y-3">
                        {(data?.attentionTenants ?? []).map((tenant) => (
                            <Link
                                key={tenant.id}
                                to={`/super-admin/companies/${tenant.id}`}
                                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{tenant.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Health {tenant.healthScore}/100 • {tenant.limitState} limits • {tenant.failedPayments} failed payments
                                    </p>
                                </div>
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClassMap[tenant.healthStatus]}`}>
                                    {tenant.healthStatus}
                                </span>
                            </Link>
                        ))}
                        {!isLoading && (data?.attentionTenants ?? []).length === 0 && (
                            <p className="text-sm text-slate-500">No urgent tenant follow-up items right now.</p>
                        )}
                    </div>
                </ChartCard>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-900">System Health</h3>
                <p className="text-xs text-slate-500">Current platform service indicators and governance checks.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
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

function ChartCard({
    title,
    subtitle,
    className = '',
    children,
}: {
    title: string;
    subtitle: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
            <div className="mt-4">{children}</div>
        </section>
    );
}
