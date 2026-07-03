import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, PackageOpen, Wallet, Building2, ShieldAlert } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import api from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import ModuleRefreshButton from '../../../components/ModuleRefreshButton';
import { formatMoney } from './utils';
import AppLoader from '../../../components/ui/AppLoader';
import { DEFAULT_CURRENCY } from '../../../lib/constants';

const COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#f97316', '#e11d48', '#7c3aed', '#4f46e5'];

export default function SalesCashDashboard() {
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

    const { data, isLoading } = useQuery({
        queryKey: ['sales-cash-dashboard', activeBranchId],
        queryFn: () => api.get('/sales/cash/dashboard').then((r) => r.data.data),
    });

    const summary = data?.summary || {};
    const byStatus = data?.byStatus || [];
    const byBranch = data?.byBranch || [];
    const trend = data?.trend || [];

    const statusPie = useMemo(() => byStatus.map((row: any) => ({ name: row.status, value: Number(row.count || 0) })), [byStatus]);

    if (isLoading) { return <AppLoader />; }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Cash Collection Dashboard</h1>
                    <p className="text-sm text-gray-500">Track branch cash pickup, vault intake, bank deposits, and reconciliation</p>
                </div>
                <ModuleRefreshButton queryKeys={[['sales-cash-dashboard', activeBranchId]]} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="mb-2 inline-flex rounded-lg bg-blue-50 p-2 text-blue-600"><PackageOpen size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Bags</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary.totalBags || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="mb-2 inline-flex rounded-lg bg-amber-50 p-2 text-amber-600"><Wallet size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Declared</p>
                    <p className="text-xl font-semibold text-gray-900">{formatMoney(Number(summary.declaredAmount || 0), currency)}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="mb-2 inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-600"><Building2 size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Deposited</p>
                    <p className="text-xl font-semibold text-gray-900">{formatMoney(Number(summary.depositedAmount || 0), currency)}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="mb-2 inline-flex rounded-lg bg-rose-50 p-2 text-rose-600"><ShieldAlert size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Pending</p>
                    <p className="text-xl font-semibold text-gray-900">{formatMoney(Number(summary.pendingAmount || 0), currency)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:col-span-2">
                    <h2 className="mb-3 text-sm font-semibold text-gray-900">Declared vs Deposited (14 Days)</h2>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="declaredFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.03} />
                                    </linearGradient>
                                    <linearGradient id="depositedFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                                <Tooltip formatter={(value: number) => formatMoney(value, currency)} />
                                <Area type="monotone" dataKey="declared" name="Declared" stroke="#f59e0b" fill="url(#declaredFill)" strokeWidth={2} />
                                <Area type="monotone" dataKey="deposited" name="Deposited" stroke="#2563eb" fill="url(#depositedFill)" strokeWidth={2.4} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <h2 className="mb-3 text-sm font-semibold text-gray-900">Status Mix</h2>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={88} paddingAngle={3}>
                                    {statusPie.map((_: any, index: number) => (
                                        <Cell key={`status-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:col-span-2">
                    <h2 className="mb-3 text-sm font-semibold text-gray-900">Branch Exposure</h2>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={byBranch} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="branchCode" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                                <Tooltip formatter={(value: number) => formatMoney(value, currency)} />
                                <Bar dataKey="declaredAmount" name="Declared" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                                <Bar dataKey="depositedAmount" name="Deposited" fill="#2563eb" radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <h2 className="mb-3 text-sm font-semibold text-gray-900">Quick Actions</h2>
                    <div className="space-y-2">
                        <Link to="/sales/cash/runs" className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Collection Runs</Link>
                        <Link to="/sales/cash/vault" className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Vault Intake</Link>
                        <Link to="/sales/cash/deposits" className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Bank Deposits</Link>
                        <Link to="/sales/cash/reconciliation" className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Reconciliation</Link>
                        <Link to="/sales/cash/audit" className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Audit Trail</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
