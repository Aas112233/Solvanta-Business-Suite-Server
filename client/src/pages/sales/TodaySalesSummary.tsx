import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarDays, CreditCard, DollarSign, FileText, Loader2, Receipt, TrendingUp, User } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import { getSalesCustomerDisplay } from '../../lib/salesCustomerDisplay';
import AppLoader from '../../components/ui/AppLoader';
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
import { DEFAULT_CURRENCY } from '../../lib/constants';

const PAYMENT_COLORS = ['#2563eb', '#0ea5e9', '#0f766e', '#f97316', '#7c3aed', '#be123c'];
const chartTooltipStyle = {
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
    backgroundColor: 'rgba(255,255,255,0.96)',
};

export default function TodaySalesSummary() {
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const today = format(new Date(), 'yyyy-MM-dd');

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['today-sales-summary', activeBranchId, today],
        queryFn: async () => {
            const res = await api.get('/sales/invoices', {
                params: {
                    startDate: today,
                    endDate: today,
                    page: 1,
                    limit: 500,
                },
            });
            return res.data;
        },
    });

    const invoices = data?.data || [];
    const meta = data?.meta?.pagination;
    const formatMoney = (value: number) => `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    const stats = useMemo(() => {
        const posted = invoices.filter((inv: any) => inv.isPosted && inv.status !== 'VOID' && inv.status !== 'UNPOSTED');
        const postedRevenue = posted.reduce((sum: number, inv: any) => sum + Number(inv.grandTotal || 0), 0);
        const paidCount = invoices.filter((inv: any) => inv.status === 'PAID').length;
        const unpostedCount = invoices.filter((inv: any) => !inv.isPosted || inv.status === 'UNPOSTED').length;
        const avgInvoice = posted.length > 0 ? postedRevenue / posted.length : 0;
        const postedCount = posted.length;
        const collectionRatePct = postedCount > 0 ? (paidCount / postedCount) * 100 : 0;

        const paymentMap = posted.reduce((acc: Record<string, number>, inv: any) => {
            const method = String(inv.paymentMethod || 'UNKNOWN');
            acc[method] = (acc[method] || 0) + Number(inv.grandTotal || 0);
            return acc;
        }, {});

        const paymentRows = Object.entries(paymentMap)
            .map(([method, total]) => ({ method, total }))
            .sort((a, b) => Number(b.total) - Number(a.total));

        const hourlyRows = Array.from({ length: 24 }).map((_, hour) => ({
            hour,
            label: `${String(hour).padStart(2, '0')}:00`,
            revenue: 0,
            invoices: 0,
        }));

        posted.forEach((inv: any) => {
            const hour = new Date(inv.createdAt).getHours();
            if (!hourlyRows[hour]) return;
            hourlyRows[hour].revenue += Number(inv.grandTotal || 0);
            hourlyRows[hour].invoices += 1;
        });

        const peakHour = hourlyRows.reduce((best, row) => (row.revenue > best.revenue ? row : best), hourlyRows[0]);

        const statusRows = [
            { name: 'Paid', value: invoices.filter((inv: any) => inv.status === 'PAID').length, color: '#059669' },
            { name: 'Unposted', value: unpostedCount, color: '#dc2626' },
            {
                name: 'Posted Open',
                value: invoices.filter((inv: any) => inv.isPosted && inv.status !== 'PAID' && inv.status !== 'UNPOSTED' && inv.status !== 'VOID').length,
                color: '#2563eb',
            },
        ].filter((row) => row.value > 0);

        const customerTotals: Record<string, { name: string; total: number }> = {};
        for (const inv of posted as any[]) {
            const customerDisplay = getSalesCustomerDisplay(inv);
            const key = customerDisplay.isWalkInLoyalty
                ? `walkin-${String(inv.loyaltyCustomer?.id || customerDisplay.detail)}`
                : String(inv.customer?.id || customerDisplay.title || 'walkin');
            const name = customerDisplay.isWalkInLoyalty
                ? `${customerDisplay.title} ${customerDisplay.detail}`
                : customerDisplay.title;
            if (!customerTotals[key]) customerTotals[key] = { name, total: 0 };
            customerTotals[key].total += Number(inv.grandTotal || 0);
        }

        const topCustomerRows: { name: string; total: number }[] = Object.keys(customerTotals)
            .map((key) => customerTotals[key])
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        return {
            invoiceCount: invoices.length,
            postedRevenue,
            postedCount,
            paidCount,
            unpostedCount,
            avgInvoice,
            paymentRows,
            hourlyRows,
            peakHour,
            statusRows,
            topCustomerRows,
            collectionRatePct,
        };
    }, [invoices]);

    if (isLoading) { return <AppLoader />; }

    return (
        <div className="space-y-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Today Sales Summary</h1>
                    <p className="text-sm text-gray-500">Live snapshot for {format(new Date(), 'MMM dd, yyyy')}</p>
                </div>
                <ModuleRefreshButton queryKeys={[['today-sales-summary', activeBranchId, today]]} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-6 text-slate-100 shadow-xl shadow-blue-200/40">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Today Revenue Pulse</p>
                        <p className="mt-2 text-3xl font-black tracking-tight">{formatMoney(stats.postedRevenue)}</p>
                        <p className="mt-1 text-sm text-slate-300">
                            Peak hour: {stats.peakHour?.label || '--:--'} ({formatMoney(stats.peakHour?.revenue || 0)})
                        </p>
                    </div>
                    <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                        <p className="text-xs uppercase tracking-wide text-blue-100">Collection Rate</p>
                        <p className="text-xl font-bold">{stats.collectionRatePct.toFixed(1)}%</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-600"><DollarSign size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Posted Revenue</p>
                    <p className="text-xl font-semibold text-slate-900">{formatMoney(stats.postedRevenue)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-blue-50 p-2 text-blue-600"><FileText size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Invoices</p>
                    <p className="text-xl font-semibold text-gray-900">{stats.invoiceCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-amber-50 p-2 text-amber-600"><CalendarDays size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Unposted</p>
                    <p className="text-xl font-semibold text-gray-900">{stats.unpostedCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 inline-flex rounded-lg bg-violet-50 p-2 text-violet-600"><Receipt size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Avg Invoice</p>
                    <p className="text-xl font-semibold text-gray-900">{formatMoney(stats.avgInvoice)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                    <div className="mb-4">
                        <h2 className="text-sm font-semibold text-slate-900">Hourly Revenue Trend</h2>
                        <p className="text-xs text-slate-500">Posted invoice flow across today</p>
                    </div>
                    <div className="h-[280px]">
                        {stats.postedCount === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">No posted sales yet today.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.hourlyRows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                                    <defs>
                                        <linearGradient id="hourlyRevenueFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickFormatter={(value: string) => (value.endsWith(':00') && Number(value.slice(0, 2)) % 3 === 0 ? value.slice(0, 2) : '')}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        formatter={(value: number) => [formatMoney(value), 'Revenue']}
                                        labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                                    />
                                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.4} fill="url(#hourlyRevenueFill)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-4 text-sm font-semibold text-slate-900">Payment Distribution</h2>
                    <div className="h-[220px]">
                        {stats.paymentRows.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">No payment mix yet.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.paymentRows.map((row) => ({ name: row.method, value: Number(row.total || 0) }))}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={52}
                                        outerRadius={84}
                                        paddingAngle={3}
                                    >
                                        {stats.paymentRows.map((_, index) => (
                                            <Cell key={`payment-cell-${index}`} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatMoney(value)} contentStyle={chartTooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                    {stats.paymentRows.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                            {stats.paymentRows.slice(0, 4).map((row, index) => (
                                <div key={row.method} className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-2 text-slate-600">
                                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }} />
                                        {row.method}
                                    </span>
                                    <span className="font-semibold text-slate-900">{formatMoney(Number(row.total || 0))}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-4 text-sm font-semibold text-slate-900">Invoice Status Mix</h2>
                    <div className="h-[220px]">
                        {stats.statusRows.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">No status data available.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.statusRows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                    <Tooltip contentStyle={chartTooltipStyle} />
                                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                        {stats.statusRows.map((row) => (
                                            <Cell key={row.name} fill={row.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                    <div className="mb-4">
                        <h2 className="text-sm font-semibold text-slate-900">Top Customers (Today)</h2>
                        <p className="text-xs text-slate-500">Top posted sales contribution</p>
                    </div>
                    <div className="space-y-2.5">
                        {stats.topCustomerRows.length === 0 ? (
                            <p className="text-sm text-slate-500">No posted customer sales yet.</p>
                        ) : stats.topCustomerRows.map((row, index) => (
                            <div key={`${row.name}-${row.total}`} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-semibold text-slate-700">#{index + 1} {row.name}</span>
                                    <span className="font-bold text-slate-900">{formatMoney(Number(row.total || 0))}</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
                                    <div
                                        className="h-full rounded bg-blue-600"
                                        style={{ width: `${Math.min(100, Math.max(10, (Number(row.total || 0) / Number(stats.topCustomerRows[0]?.total || 1)) * 100))}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Recent Invoices (Today)</h2>
                        <span className="text-xs text-gray-500">Paid: {stats.paidCount} / {stats.invoiceCount}</span>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        <TrendingUp size={12} />
                        Live
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                                <th className="py-2 pr-3">Invoice</th>
                                <th className="py-2 pr-3">Time</th>
                                <th className="py-2 pr-3">Customer</th>
                                <th className="py-2 pr-3">Method</th>
                                <th className="py-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.length === 0 ? (
                                <tr>
                                    <td className="py-6 text-sm text-gray-500" colSpan={5}>No invoices created today.</td>
                                </tr>
                            ) : invoices.slice(0, 12).map((inv: any) => (
                                <tr key={inv.id} className="border-b border-gray-50">
                                    <td className="py-2 pr-3 font-mono text-xs font-semibold text-gray-900">{inv.invoiceNo}</td>
                                    <td className="py-2 pr-3 text-gray-600">{format(new Date(inv.createdAt), 'HH:mm')}</td>
                                    <td className="py-2 pr-3 text-gray-700">
                                        <span className="inline-flex items-start gap-1">
                                            <User size={12} className="mt-0.5" />
                                            <span className="flex flex-col leading-tight">
                                                <span>{getSalesCustomerDisplay(inv).title}</span>
                                                {getSalesCustomerDisplay(inv).isWalkInLoyalty && (
                                                    <span className="text-[11px] text-gray-500">{getSalesCustomerDisplay(inv).detail}</span>
                                                )}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="py-2 pr-3 text-gray-700">
                                        <span className="inline-flex items-center gap-1">
                                            <CreditCard size={12} />
                                            {inv.paymentMethod || '-'}
                                        </span>
                                    </td>
                                    <td className="py-2 text-right font-semibold text-gray-900">{formatMoney(Number(inv.grandTotal || 0))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {meta && meta.totalItems > invoices.length && (
                    <p className="mt-3 text-xs text-amber-700">
                        Showing {invoices.length} of {meta.totalItems} invoices for today.
                    </p>
                )}
            </div>

            {isFetching && (
                <p className="text-xs text-gray-500">Refreshing live sales data...</p>
            )}
        </div>
    );
}
