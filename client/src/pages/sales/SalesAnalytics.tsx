import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    Loader2,
    PieChart as PieChartIcon,
    Receipt,
    RotateCcw,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import {
    Area,
    AreaChart,
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
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_CURRENCY } from '../../lib/constants';
import AppLoader from '../../components/ui/AppLoader';

const PAYMENT_COLORS = ['#2563eb', '#0ea5e9', '#0f766e', '#f97316', '#7c3aed', '#be123c'];

const chartTooltipStyle = {
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
    backgroundColor: 'rgba(255,255,255,0.96)',
};

export default function SalesAnalytics() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const { data, isLoading } = useQuery({
        queryKey: ['sales-analytics'],
        queryFn: () => api.get('/sales/analytics').then((r) => r.data.data),
    });

    const formatMoney = (value: number) =>
        `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    const metrics = data?.metrics || {};
    const paymentRows = data?.paymentMethodBreakdown || [];
    const topCustomers = data?.topCustomers || [];
    const trend = data?.trend || [];

    const trendRows = useMemo(() => (
        trend.map((row: any) => ({
            month: row.month,
            gross: Number(row.gross || 0),
            returns: Number(row.returns || 0),
            net: Number(row.net || 0),
        }))
    ), [trend]);

    const paymentChartData = useMemo(() => (
        paymentRows.map((row: any) => ({
            name: String(row.method || 'UNKNOWN'),
            value: Number(row.total || 0),
        }))
    ), [paymentRows]);

    const topCustomerRows = useMemo(() => (
        topCustomers.map((row: any) => ({
            name: String(row.name || 'Customer'),
            value: Number(row.value || 0),
        }))
    ), [topCustomers]);

    if (isLoading) { return <AppLoader />; }

    const totalPaymentVolume = paymentChartData.reduce((sum: number, row: { value: number }) => sum + row.value, 0);
    const latestNet = trendRows[trendRows.length - 1]?.net || 0;
    const previousNet = trendRows[trendRows.length - 2]?.net || 0;
    const momDelta = previousNet > 0 ? ((latestNet - previousNet) / previousNet) * 100 : 0;

    return (
        <div className="space-y-7">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales Dashboard</h1>
                    <p className="text-sm text-gray-500">Revenue trajectory, payment behavior, and customer concentration</p>
                </div>
                <ModuleRefreshButton queryKeys={[['sales-analytics']]} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-6 text-slate-100 shadow-xl shadow-blue-200/40">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Sales Momentum</p>
                        <p className="mt-2 text-3xl font-black tracking-tight">{formatMoney(Number(metrics.netSales || 0))}</p>
                        <p className="mt-1 text-sm text-slate-300">
                            MoM change: <span className={momDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{momDelta >= 0 ? '+' : ''}{momDelta.toFixed(1)}%</span>
                        </p>
                    </div>
                    <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                        <p className="text-xs uppercase tracking-wide text-blue-100">Posted Invoices</p>
                        <p className="text-xl font-bold">{Number(metrics.postedInvoices || 0)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-600"><Wallet size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Gross Sales</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(Number(metrics.grossSales || 0))}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-indigo-50 p-2 text-indigo-600"><Receipt size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Average Order Value</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(Number(metrics.avgOrderValue || 0))}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-rose-50 p-2 text-rose-600"><RotateCcw size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Returns</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(Number(metrics.returnTotal || 0))}</p>
                    <p className="mt-1 text-xs text-slate-500">Rate: {Number(metrics.returnRatePct || 0).toFixed(2)}%</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-blue-50 p-2 text-blue-600"><TrendingUp size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Net Sales</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(Number(metrics.netSales || 0))}</p>
                    <p className="mt-1 text-xs text-slate-500">Invoices: {Number(metrics.totalInvoices || 0)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                    <div className="mb-4">
                        <h2 className="text-sm font-semibold text-slate-900">6-Month Sales Flow</h2>
                        <p className="text-xs text-slate-500">Layered view of gross, returns, and net sales</p>
                    </div>
                    <div className="h-[320px]">
                        {trendRows.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">No trend data available</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendRows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                                    <defs>
                                        <linearGradient id="grossFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.22} />
                                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                                    <Tooltip
                                        formatter={(value: number) => [formatMoney(value), '']}
                                        contentStyle={chartTooltipStyle}
                                        labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                                    />
                                    <Area type="monotone" dataKey="gross" name="Gross Sales" stroke="#2563eb" strokeWidth={2.2} fill="url(#grossFill)" />
                                    <Area type="monotone" dataKey="returns" name="Returns" stroke="#e11d48" strokeWidth={2} fill="transparent" />
                                    <Area type="monotone" dataKey="net" name="Net Sales" stroke="#0f766e" strokeWidth={2.4} fill="url(#netFill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-slate-900">Payment Mix</h2>
                        <PieChartIcon size={16} className="text-slate-400" />
                    </div>
                    <div className="h-[220px]">
                        {paymentChartData.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">No payment data available</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={paymentChartData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={56}
                                        outerRadius={88}
                                        paddingAngle={3}
                                    >
                                        {paymentChartData.map((_: any, index: number) => (
                                            <Cell key={`payment-cell-${index}`} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number) => formatMoney(value)}
                                        contentStyle={chartTooltipStyle}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                    {paymentChartData.length > 0 && (
                        <div className="mt-2 space-y-2">
                            {paymentChartData.map((row: any, index: number) => {
                                const pct = totalPaymentVolume > 0 ? (row.value / totalPaymentVolume) * 100 : 0;
                                return (
                                    <div key={row.name} className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-2 text-slate-600">
                                            <span
                                                className="inline-block h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }}
                                            />
                                            {row.name}
                                        </span>
                                        <span className="font-semibold text-slate-900">{pct.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                    <div className="mb-4">
                        <h2 className="text-sm font-semibold text-slate-900">Top Customers by Revenue</h2>
                        <p className="text-xs text-slate-500">Customer concentration for posted sales</p>
                    </div>
                    <div className="h-[280px]">
                        {topCustomerRows.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">No customer sales yet</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={[...topCustomerRows].reverse()} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
                                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                                    <YAxis dataKey="name" type="category" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#334155' }} />
                                    <Tooltip
                                        formatter={(value: number) => formatMoney(value)}
                                        contentStyle={chartTooltipStyle}
                                    />
                                    <Bar dataKey="value" fill="#2563eb" radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-4 text-sm font-semibold text-slate-900">Customer Leaderboard</h2>
                    <div className="space-y-2.5">
                        {topCustomerRows.length === 0 ? (
                            <p className="text-sm text-slate-500">No customer sales yet</p>
                        ) : topCustomerRows.map((row: any, index: number) => (
                            <div key={`${row.name}-${row.value}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-semibold text-slate-700">#{index + 1} {row.name}</span>
                                    <span className="font-bold text-slate-900">{formatMoney(row.value)}</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
                                    <div
                                        className="h-full rounded bg-blue-600"
                                        style={{ width: `${Math.min(100, Math.max(8, (row.value / (topCustomerRows[0]?.value || 1)) * 100))}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
