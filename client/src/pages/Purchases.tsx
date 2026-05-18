import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import {
    ShoppingCart,
    Users,
    BarChart3,
    Wallet,
    ArrowUpRight,
    TrendingUp,
    Clock,
    AlertTriangle
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import api from '../lib/api';
import { clsx } from 'clsx';
import AppLoader from '../components/ui/AppLoader';
import { formatCompanyDate, resolveCompanyCurrency } from '../lib/companySettings';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const CustomTooltip = ({ active, payload, label, formatter }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-xl border border-gray-100 bg-white/95 p-4 shadow-xl backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
                <p className="mb-2 font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-3">
                        <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color || entry.payload.fill }}
                        />
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            {entry.name}:
                        </span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {formatter ? formatter(entry.value) : entry.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const modules = [
    {
        to: '/purchases/invoices',
        title: 'Purchase Invoices',
        description: 'View and track supplier invoices',
        icon: ShoppingCart,
    },
    {
        to: '/purchases/returns',
        title: 'Purchase Returns',
        description: 'Return items to suppliers with stock and GL impact',
        icon: ArrowUpRight,
    },
    {
        to: '/purchases/payments',
        title: 'Purchase Payments',
        description: 'Post supplier payments against invoices',
        icon: Wallet,
    },
    {
        to: '/suppliers',
        title: 'Suppliers',
        description: 'Manage supplier master records',
        icon: Users,
    },
    {
        to: '/purchases/reports',
        title: 'Purchase Reports',
        description: 'Analyze purchases, tax, and trends',
        icon: BarChart3,
    },
];

export default function Purchases() {
    const user = useAuthStore((s) => s.user);
    const currency = resolveCompanyCurrency(user?.company);
    const formatMoney = (value: number) => `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const { data: rawData, isLoading } = useQuery({
        queryKey: ['report-purchases'],
        queryFn: () => api.get('/reports/purchases').then((r) => r.data.data),
    });

    if (isLoading) { return <AppLoader />; }

    const summary = rawData?.summary || {};
    const recentInvoices = rawData?.recentInvoices || [];
    const purchaseTrend = rawData?.purchaseTrend || [];
    const topSuppliers = rawData?.topSuppliers || [];

    const statCards = [
        {
            label: "Total Purchases",
            value: formatMoney(Number(summary.totalPurchases || 0)),
            sub: `${summary.invoiceCount || 0} invoices recorded`,
            icon: ShoppingCart,
            color: 'text-emerald-600 dark:text-emerald-400',
            bg: 'bg-emerald-50 dark:bg-emerald-500/10',
            ring: 'ring-emerald-100 dark:ring-emerald-500/20'
        },
        {
            label: 'Total Payments',
            value: formatMoney(Number(summary.totalPayments || 0)),
            sub: `Amounts settled`,
            icon: Wallet,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-50 dark:bg-blue-500/10',
            ring: 'ring-blue-100 dark:ring-blue-500/20'
        },
        {
            label: 'Outstanding Payables',
            value: formatMoney(Number(summary.outstandingAmount || 0)),
            sub: 'Pending clearings',
            icon: AlertTriangle,
            color: 'text-rose-600 dark:text-rose-400',
            bg: 'bg-rose-50 dark:bg-rose-500/10',
            ring: 'ring-rose-100 dark:ring-rose-500/20'
        },
        {
            label: 'Purchase Returns',
            value: formatMoney(Number(summary.totalReturns || 0)),
            sub: 'Stock sent back',
            icon: ArrowUpRight,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-500/10',
            ring: 'ring-amber-100 dark:ring-amber-500/20'
        },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Purchases Hub</h1>
                    <ModuleRefreshButton queryKeys={[['report-purchases'], ['suppliers']]} />
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Manage procurements, vendor payments, and supply chain insights.</p>
            </div>

            {/* Quick Actions (Modules) */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {modules.map((module) => (
                    <Link
                        key={module.to}
                        to={module.to}
                        className="group flex flex-col justify-center rounded-xl border border-gray-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition dark:bg-gray-900 dark:border-gray-800 dark:hover:border-emerald-700"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                <module.icon size={18} />
                            </div>
                            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">{module.title}</h2>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{module.description}</p>
                    </Link>
                ))}
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {statCards.map((card) => (
                    <div
                        key={card.label}
                        className="group relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md dark:bg-gray-900 dark:ring-gray-800"
                    >
                        <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-gradient-to-br from-gray-50 to-transparent opacity-50 transition-transform group-hover:scale-110 dark:from-gray-800/50"></div>
                        <div className={clsx("mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1", card.bg, card.color, card.ring)}>
                            <card.icon strokeWidth={2.5} size={20} />
                        </div>
                        <p className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white truncate">
                            {card.value}
                        </p>
                        <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                            {card.label}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                            {card.sub}
                        </p>
                    </div>
                ))}
            </div>

            {/* Charts & Graphs */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Purchase Trend */}
                <div className="lg:col-span-2 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Purchase Volumes</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">6-month supplier spending tracker</p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                            <TrendingUp size={16} />
                            <span>Volumes</span>
                        </div>
                    </div>
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={purchaseTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                <XAxis
                                    dataKey="month"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                                    tickFormatter={(value) => `${value / 1000}k`}
                                    dx={-10}
                                />
                                <Tooltip content={<CustomTooltip formatter={(val: number) => formatMoney(val)} />} />
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    name="Purchases"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorTotal)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#059669' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Suppliers */}
                <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Top Suppliers</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">By purchase invoice total</p>
                    </div>
                    {topSuppliers.length > 0 ? (
                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topSuppliers} margin={{ top: 0, right: 0, left: -10, bottom: 0 }} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.5} />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={110} tick={{ fill: 'var(--color-text-primary)', fontSize: 11, fontWeight: 500 }} tickFormatter={(val) => val?.length > 15 ? val.substring(0, 15) + '...' : val} />
                                    <Tooltip cursor={{ fill: 'var(--color-bg-subtle)', opacity: 0.4 }} content={<CustomTooltip formatter={(val: number) => formatMoney(val)} />} />
                                    <Bar dataKey="value" name="Purchases" radius={[0, 4, 4, 0]} barSize={16}>
                                        {topSuppliers.map((_: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                            <p className="text-sm text-gray-500 dark:text-gray-400">No supplier data</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Purchase Invoices</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Latest supplier activity</p>
                    </div>
                    <Link to="/purchases/invoices" className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">View All →</Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentInvoices.length === 0 && (
                        <div className="flex col-span-1 lg:col-span-3 h-20 items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                            <p className="text-sm text-gray-500 dark:text-gray-400">No active invoices</p>
                        </div>
                    )}
                    {recentInvoices.map((inv: any) => (
                        <div key={inv.id} className="group flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                                    <span className="rounded bg-white px-2 py-0.5 text-xs ring-1 ring-gray-200 dark:bg-gray-700 dark:ring-gray-600">
                                        {inv.invoiceNo}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    <Users size={12} className="text-gray-400" />
                                    {inv.supplier?.name || 'Unknown Supplier'}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[15px] font-bold text-gray-900 dark:text-white">
                                    {formatMoney(Number(inv.grandTotal || 0))}
                                </div>
                                <div className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-500 dark:text-gray-400">
                                    <Clock size={12} />
                                    {formatCompanyDate(inv.createdAt, user?.company)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
