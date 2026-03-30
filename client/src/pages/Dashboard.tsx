import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    Clock,
    DollarSign,
    Package,
    Receipt,
    RefreshCw,
    ShoppingCart,
    TrendingUp,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AppLoader from '../components/ui/AppLoader';
import { Button, PageHeader, PageLayout, StatsGrid } from '../components/ui';

const DASHBOARD_QUERY_KEY = ['dashboard-consolidated'] as const;
const PIE_COLORS = ['#0f766e', '#1d4ed8', '#0e7490', '#475569', '#7c3aed', '#b45309', '#be123c', '#0284c7'];
const CHART_COLORS = {
    net: '#0f766e',
    tax: '#0284c7',
    purchases: '#1d4ed8',
    expenses: '#b45309',
    hour: '#0e7490',
    bars: '#2563eb',
    healthGood: '#0f766e',
    healthRisk: '#be123c',
} as const;
const PANEL_CLASS =
    'rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_18px_42px_-26px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95';

type NumberLike = number | string | null | undefined;
type InventoryMode = 'value' | 'qty';

interface RecentInvoiceRaw {
    id?: string;
    invoiceNo?: string | null;
    grandTotal?: NumberLike;
    createdAt?: string | null;
    customer?: { name?: string | null } | null;
}

interface DashboardPayload {
    summary?: {
        todaySales?: { total?: NumberLike; count?: NumberLike };
        totalProducts?: NumberLike;
        totalCustomers?: NumberLike;
        lowStockCount?: NumberLike;
        recentInvoices?: RecentInvoiceRaw[];
    };
    finance?: {
        netSales?: NumberLike;
        totalPurchases?: NumberLike;
        outputVAT?: NumberLike;
        inputVAT?: NumberLike;
    };
    insights?: {
        averageOrderValue?: NumberLike;
        averageItemsPerOrder?: NumberLike;
        returningCustomersCount?: NumberLike;
        returningCustomerRate?: NumberLike;
        totalExpensesAllTime?: NumberLike;
        posTotalVariance?: NumberLike;
    };
    salesTrend?: Array<{
        month?: string;
        net?: NumberLike;
        tax?: NumberLike;
        purchases?: NumberLike;
        expenses?: NumberLike;
    }>;
    paymentBreakdown?: Array<{ method?: string | null; total?: NumberLike }>;
    topSuppliers?: Array<{ name?: string | null; value?: NumberLike }>;
    expenseCategories?: Array<{ name?: string | null; value?: NumberLike }>;
    salesByDayOfWeek?: Array<{ day?: string; total?: NumberLike }>;
    salesByHour?: Array<{ hour?: string; total?: NumberLike }>;
    inventory?: {
        topByValue?: Array<{ name?: string; value?: NumberLike; qty?: NumberLike }>;
        topByQty?: Array<{ name?: string; value?: NumberLike; qty?: NumberLike }>;
        categoryValuation?: Array<{ name?: string | null; value?: NumberLike }>;
        health?: Array<{ name?: string; value?: NumberLike }>;
    };
}

interface RecentInvoice {
    id: string;
    invoiceNo: string;
    grandTotal: number;
    createdAt: string;
    customerName: string;
}

interface NamedValue {
    name: string;
    value: number;
}

interface SalesTrendPoint {
    month: string;
    net: number;
    tax: number;
    purchases: number;
    expenses: number;
}

interface SalesByHourPoint {
    hour: string;
    total: number;
}

interface SalesByDayPoint {
    day: string;
    total: number;
}
interface InventoryPoint {
    name: string;
    value: number;
    qty: number;
}

interface DashboardModel {
    summary: {
        todaySalesTotal: number;
        todaySalesCount: number;
        totalProducts: number;
        totalCustomers: number;
        lowStockCount: number;
        recentInvoices: RecentInvoice[];
    };
    finance: {
        netSales: number;
        totalPurchases: number;
        outputVAT: number;
        inputVAT: number;
        netVAT: number;
    };
    insights: {
        averageOrderValue: number;
        averageItemsPerOrder: number;
        returningCustomersCount: number;
        returningCustomerRate: number;
        totalExpensesAllTime: number;
        posTotalVariance: number;
    };
    salesTrend: SalesTrendPoint[];
    paymentBreakdown: NamedValue[];
    topSuppliers: NamedValue[];
    expenseCategories: NamedValue[];
    salesByDayOfWeek: SalesByDayPoint[];
    salesByHour: SalesByHourPoint[];
    inventory: {
        topByValue: InventoryPoint[];
        topByQty: InventoryPoint[];
        categoryValuation: NamedValue[];
        health: NamedValue[];
    };
}

interface StatCard {
    label: string;
    value: string;
    sub: string;
    icon: LucideIcon;
    color: string;
    bg: string;
    ring: string;
}

interface DashboardTooltipPayload {
    color?: string;
    name?: string;
    value?: number;
    payload?: { fill?: string };
}

interface DashboardTooltipProps {
    active?: boolean;
    payload?: DashboardTooltipPayload[];
    label?: string;
    formatter?: (value: number) => string;
}

const toNumber = (value: NumberLike): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const asText = (value: unknown, fallback = 'Unknown'): string => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
};

const truncateLabel = (value: string, max = 15): string => {
    if (value.length <= max) return value;
    return `${value.slice(0, max)}...`;
};

const formatAxisThousands = (value: number): string => `${value / 1000}k`;

const normalizeDashboardData = (payload?: DashboardPayload): DashboardModel => {
    const summary = payload?.summary;
    const finance = payload?.finance;
    const insights = payload?.insights;
    const inventory = payload?.inventory;

    const normalizedRecentInvoices = (summary?.recentInvoices ?? []).map((invoice, index) => ({
        id: invoice.id ?? `${index}`,
        invoiceNo: asText(invoice.invoiceNo, 'N/A'),
        grandTotal: toNumber(invoice.grandTotal),
        createdAt: invoice.createdAt ?? '',
        customerName: asText(invoice.customer?.name, 'Walk-in'),
    }));

    const normalizedPaymentBreakdown: NamedValue[] = (payload?.paymentBreakdown ?? []).map((entry) => ({
        name: asText(entry.method),
        value: toNumber(entry.total),
    }));

    const normalizeNamedValue = (list: Array<{ name?: string | null; value?: NumberLike }>): NamedValue[] =>
        list.map((entry) => ({
            name: asText(entry.name),
            value: toNumber(entry.value),
        }));

    const normalizeInventoryPoints = (
        list: Array<{ name?: string; value?: NumberLike; qty?: NumberLike }>
    ): InventoryPoint[] =>
        list.map((entry) => ({
            name: asText(entry.name),
            value: toNumber(entry.value),
            qty: toNumber(entry.qty),
        }));

    const outputVAT = toNumber(finance?.outputVAT);
    const inputVAT = toNumber(finance?.inputVAT);

    return {
        summary: {
            todaySalesTotal: toNumber(summary?.todaySales?.total),
            todaySalesCount: toNumber(summary?.todaySales?.count),
            totalProducts: toNumber(summary?.totalProducts),
            totalCustomers: toNumber(summary?.totalCustomers),
            lowStockCount: toNumber(summary?.lowStockCount),
            recentInvoices: normalizedRecentInvoices,
        },
        finance: {
            netSales: toNumber(finance?.netSales),
            totalPurchases: toNumber(finance?.totalPurchases),
            outputVAT,
            inputVAT,
            netVAT: outputVAT - inputVAT,
        },
        insights: {
            averageOrderValue: toNumber(insights?.averageOrderValue),
            averageItemsPerOrder: toNumber(insights?.averageItemsPerOrder),
            returningCustomersCount: toNumber(insights?.returningCustomersCount),
            returningCustomerRate: toNumber(insights?.returningCustomerRate),
            totalExpensesAllTime: toNumber(insights?.totalExpensesAllTime),
            posTotalVariance: toNumber(insights?.posTotalVariance),
        },
        salesTrend: (payload?.salesTrend ?? []).map((entry) => ({
            month: asText(entry.month, ''),
            net: toNumber(entry.net),
            tax: toNumber(entry.tax),
            purchases: toNumber(entry.purchases),
            expenses: toNumber(entry.expenses),
        })),
        paymentBreakdown: normalizedPaymentBreakdown,
        topSuppliers: normalizeNamedValue(payload?.topSuppliers ?? []),
        expenseCategories: normalizeNamedValue(payload?.expenseCategories ?? []),
        salesByDayOfWeek: (payload?.salesByDayOfWeek ?? []).map((entry) => ({
            day: asText(entry.day, ''),
            total: toNumber(entry.total),
        })),
        salesByHour: (payload?.salesByHour ?? []).map((entry) => ({
            hour: asText(entry.hour, ''),
            total: toNumber(entry.total),
        })),
        inventory: {
            topByValue: normalizeInventoryPoints(inventory?.topByValue ?? []),
            topByQty: normalizeInventoryPoints(inventory?.topByQty ?? []),
            categoryValuation: normalizeNamedValue(inventory?.categoryValuation ?? []),
            health: normalizeNamedValue(inventory?.health ?? []),
        },
    };
};

const DashboardPanel = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => <div className={clsx(PANEL_CLASS, className)}>{children}</div>;

const EmptyState = ({ message, className }: { message: string; className?: string }) => (
    <div
        className={clsx(
            'flex items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40',
            className
        )}
    >
        <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
);

const DashboardTooltip = ({ active, payload, label, formatter }: DashboardTooltipProps) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
        <div className="rounded-xl border border-slate-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
            {label ? <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">{label}</p> : null}
            {payload.map((entry, index) => (
                <div key={index} className="flex items-center gap-3">
                    <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: entry.color ?? entry.payload?.fill }}
                    />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {entry.name ?? 'Value'}:
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {formatter ? formatter(entry.value ?? 0) : entry.value ?? 0}
                    </span>
                </div>
            ))}
        </div>
    );
};

const StatCardTile = ({ card }: { card: StatCard }) => (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_38px_-24px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900/95">
        <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-gradient-to-br from-slate-100 to-transparent opacity-60 transition-transform group-hover:scale-110 dark:from-slate-800/60" />
        <div
            className={clsx(
                'mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1',
                card.bg,
                card.color,
                card.ring
            )}
        >
            <card.icon strokeWidth={2.5} size={20} />
        </div>
        <p className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{card.value}</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{card.label}</p>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{card.sub}</p>
    </div>
);

const formatInvoiceTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function Dashboard() {
    const user = useAuthStore((state) => state.user);
    const [inventoryMode, setInventoryMode] = useState<InventoryMode>('value');
    const currency = user?.company?.currency || 'SAR';

    const numberFormatter = useMemo(
        () =>
            new Intl.NumberFormat(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }),
        []
    );
    const formatMoney = (value: number): string => `${currency} ${numberFormatter.format(value)}`;

    const { data: rawData, isLoading, isFetching, refetch } = useQuery<DashboardPayload>({
        queryKey: DASHBOARD_QUERY_KEY,
        queryFn: () => api.get('/reports/dashboard-consolidated').then((response) => response.data.data),
    });

    const dashboard = useMemo(() => normalizeDashboardData(rawData), [rawData]);
    const inventoryBars =
        inventoryMode === 'value' ? dashboard.inventory.topByValue : dashboard.inventory.topByQty;
    const inventoryBarDataKey = inventoryMode === 'value' ? 'value' : 'qty';
    const inventoryBarName = inventoryMode === 'value' ? 'Value' : 'Units';

    const statCards: StatCard[] = useMemo(
        () => [
            {
                label: "Today's Sales",
                value: formatMoney(dashboard.summary.todaySalesTotal),
                sub: `${dashboard.summary.todaySalesCount} invoices today`,
                icon: DollarSign,
                color: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-500/10',
                ring: 'ring-blue-100 dark:ring-blue-500/20',
            },
            {
                label: 'Total Revenue',
                value: formatMoney(dashboard.finance.netSales),
                sub: `Purchases: ${formatMoney(dashboard.finance.totalPurchases)}`,
                icon: Wallet,
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-500/10',
                ring: 'ring-emerald-100 dark:ring-emerald-500/20',
            },
            {
                label: 'Total Expenses',
                value: formatMoney(dashboard.insights.totalExpensesAllTime),
                sub: 'Over last 6 months',
                icon: ArrowDownRight,
                color: 'text-rose-600 dark:text-rose-400',
                bg: 'bg-rose-50 dark:bg-rose-500/10',
                ring: 'ring-rose-100 dark:ring-rose-500/20',
            },
            {
                label: 'AOV',
                value: formatMoney(dashboard.insights.averageOrderValue),
                sub: 'Avg. order value',
                icon: ShoppingCart,
                color: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-500/10',
                ring: 'ring-blue-100 dark:ring-blue-500/20',
            },
            {
                label: 'Avg Items/Order',
                value: dashboard.insights.averageItemsPerOrder.toFixed(1),
                sub: 'Lines per invoice',
                icon: BarChart3,
                color: 'text-cyan-600 dark:text-cyan-400',
                bg: 'bg-cyan-50 dark:bg-cyan-500/10',
                ring: 'ring-cyan-100 dark:ring-cyan-500/20',
            },
            {
                label: 'Return Customers',
                value: `${dashboard.insights.returningCustomerRate.toFixed(1)}%`,
                sub: `${dashboard.insights.returningCustomersCount} repeat buyers`,
                icon: RefreshCw,
                color: 'text-indigo-600 dark:text-indigo-400',
                bg: 'bg-indigo-50 dark:bg-indigo-500/10',
                ring: 'ring-indigo-100 dark:ring-indigo-500/20',
            },
            {
                label: 'Tax Collected',
                value: formatMoney(dashboard.finance.outputVAT),
                sub: `Inputs: ${formatMoney(dashboard.finance.inputVAT)}`,
                icon: Receipt,
                color: 'text-orange-600 dark:text-orange-400',
                bg: 'bg-orange-50 dark:bg-orange-500/10',
                ring: 'ring-orange-100 dark:ring-orange-500/20',
            },
            {
                label: 'POS Variance',
                value: formatMoney(dashboard.insights.posTotalVariance),
                sub: 'Cash drawer diffs',
                icon: AlertTriangle,
                color:
                    dashboard.insights.posTotalVariance < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                bg:
                    dashboard.insights.posTotalVariance < 0
                        ? 'bg-red-50 dark:bg-red-500/10'
                        : 'bg-emerald-50 dark:bg-emerald-500/10',
                ring:
                    dashboard.insights.posTotalVariance < 0
                        ? 'ring-red-100 dark:ring-red-500/20'
                        : 'ring-emerald-100 dark:ring-emerald-500/20',
            },
            {
                label: 'Total Products',
                value: dashboard.summary.totalProducts.toLocaleString(),
                sub: 'Active items listed',
                icon: Package,
                color: 'text-amber-600 dark:text-amber-400',
                bg: 'bg-amber-50 dark:bg-amber-500/10',
                ring: 'ring-amber-100 dark:ring-amber-500/20',
            },
            {
                label: 'Total Customers',
                value: dashboard.summary.totalCustomers.toLocaleString(),
                sub: 'Registered accounts',
                icon: Users,
                color: 'text-purple-600 dark:text-purple-400',
                bg: 'bg-purple-50 dark:bg-purple-500/10',
                ring: 'ring-purple-100 dark:ring-purple-500/20',
            },
        ],
        [dashboard, formatMoney]
    );

    if (isLoading) return <AppLoader />;

    return (
        <PageLayout fullWidth className="animate-in gap-8 fade-in duration-500 pb-10">
            <PageHeader
                title="Executive Dashboard"
                subtitle={`Today: ${dashboard.summary.todaySalesCount} invoices, ${dashboard.summary.lowStockCount} low-stock alerts, ${dashboard.summary.totalCustomers.toLocaleString()} customers tracked`}
                action={
                    <Button
                        type="button"
                        variant="outline"
                        icon={<RefreshCw size={16} />}
                        loading={isFetching}
                        onClick={() => void refetch()}
                    >
                        Refresh Data
                    </Button>
                }
            />

            <StatsGrid columns={5} className="gap-5">
                {statCards.map((card) => (
                    <StatCardTile key={card.label} card={card} />
                ))}
            </StatsGrid>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <DashboardPanel className="lg:col-span-2">
                    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revenue Trend</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Net sales over the last 6 months
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                            <TrendingUp size={16} />
                            <span>Growth</span>
                        </div>
                    </div>
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dashboard.salesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={CHART_COLORS.net} stopOpacity={0.28} />
                                        <stop offset="95%" stopColor={CHART_COLORS.net} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorTax" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={CHART_COLORS.tax} stopOpacity={0.22} />
                                        <stop offset="95%" stopColor={CHART_COLORS.tax} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={CHART_COLORS.purchases} stopOpacity={0.22} />
                                        <stop offset="95%" stopColor={CHART_COLORS.purchases} stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={CHART_COLORS.expenses} stopOpacity={0.22} />
                                        <stop offset="95%" stopColor={CHART_COLORS.expenses} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="var(--color-border)"
                                    opacity={0.5}
                                />
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
                                    tickFormatter={formatAxisThousands}
                                    dx={-10}
                                />
                                <Tooltip content={<DashboardTooltip formatter={formatMoney} />} />
                                <Area
                                    type="monotone"
                                    dataKey="net"
                                    name="Net Sales"
                                    stroke={CHART_COLORS.net}
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorNet)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: CHART_COLORS.net }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="tax"
                                    name="Tax Collected"
                                    stroke={CHART_COLORS.tax}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorTax)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="purchases"
                                    name="Purchases"
                                    stroke={CHART_COLORS.purchases}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorPurchases)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="expenses"
                                    name="Expenses"
                                    stroke={CHART_COLORS.expenses}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorExpenses)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardPanel>

                <DashboardPanel>
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payment Methods</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Revenue distribution by payment type
                        </p>
                    </div>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={dashboard.paymentBreakdown}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={3}
                                    stroke="none"
                                >
                                    {dashboard.paymentBreakdown.map((entry, index) => (
                                        <Cell
                                            key={`${entry.name}-${index}`}
                                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip content={<DashboardTooltip formatter={formatMoney} />} />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    formatter={(value) => (
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {value}
                                        </span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardPanel>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <DashboardPanel>
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Peak Sales Hours</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Revenue distribution by time of day
                        </p>
                    </div>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dashboard.salesByHour} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorHour" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={CHART_COLORS.hour} stopOpacity={0.28} />
                                        <stop offset="95%" stopColor={CHART_COLORS.hour} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="var(--color-border)"
                                    opacity={0.5}
                                />
                                <XAxis
                                    dataKey="hour"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={formatAxisThousands}
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                                />
                                <Tooltip content={<DashboardTooltip formatter={formatMoney} />} />
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    name="Sales"
                                    stroke={CHART_COLORS.hour}
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorHour)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardPanel>

                <DashboardPanel>
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sales By Day</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Average performance per weekday
                        </p>
                    </div>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dashboard.salesByDayOfWeek} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="var(--color-border)"
                                    opacity={0.5}
                                />
                                <XAxis
                                    dataKey="day"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={formatAxisThousands}
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'var(--color-bg-subtle)', opacity: 0.4 }}
                                    content={<DashboardTooltip formatter={formatMoney} />}
                                />
                                <Bar dataKey="total" name="Sales" radius={[4, 4, 0, 0]} fill={CHART_COLORS.bars} barSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardPanel>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <DashboardPanel>
                        <div className="mb-6 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Inventory Analysis</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Highest performing inventory assets via {inventoryMode}
                                </p>
                            </div>
                            <div className="flex rounded-lg border border-slate-200/80 bg-slate-100/80 p-1 dark:border-slate-700/80 dark:bg-slate-900/60">
                                <button
                                    type="button"
                                    onClick={() => setInventoryMode('value')}
                                    className={clsx(
                                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                                        inventoryMode === 'value'
                                            ? 'relative bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                    )}
                                >
                                    Value
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInventoryMode('qty')}
                                    className={clsx(
                                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                                        inventoryMode === 'qty'
                                            ? 'relative bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                    )}
                                >
                                    Quantity
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                            <div className="h-[260px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={inventoryBars} margin={{ top: 0, right: 0, left: -10, bottom: 0 }} layout="vertical">
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            horizontal={false}
                                            stroke="var(--color-border)"
                                            opacity={0.5}
                                        />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            axisLine={false}
                                            tickLine={false}
                                            width={110}
                                            tick={{
                                                fill: 'var(--color-text-primary)',
                                                fontSize: 11,
                                                fontWeight: 500,
                                            }}
                                            tickFormatter={(value: string) => truncateLabel(value)}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'var(--color-bg-subtle)', opacity: 0.4 }}
                                            content={
                                                <DashboardTooltip
                                                    formatter={
                                                        inventoryMode === 'value'
                                                            ? formatMoney
                                                            : undefined
                                                    }
                                                />
                                            }
                                        />
                                        <Bar
                                            dataKey={inventoryBarDataKey}
                                            name={inventoryBarName}
                                            radius={[0, 4, 4, 0]}
                                            barSize={16}
                                        >
                                            {inventoryBars.map((entry, index) => (
                                                <Cell
                                                    key={`${entry.name}-${index}`}
                                                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div>
                                <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                                    Category Value Breakdown
                                </h4>
                                <div className="space-y-3">
                                    {dashboard.inventory.categoryValuation.slice(0, 6).map((category, index) => (
                                        <div
                                            key={category.name}
                                            className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-900/45"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="h-3 w-3 rounded-full shadow-sm"
                                                    style={{
                                                        backgroundColor:
                                                            PIE_COLORS[index % PIE_COLORS.length],
                                                    }}
                                                />
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    {category.name}
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                                                {formatMoney(category.value)}
                                            </span>
                                        </div>
                                    ))}
                                    {dashboard.inventory.categoryValuation.length === 0 ? (
                                        <EmptyState message="No category data" className="h-32" />
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </DashboardPanel>
                </div>

                <div className="flex flex-col gap-6">
                    <DashboardPanel>
                        <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Tax Summary</h3>
                        <div className="space-y-4">
                            <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-rose-50 to-white p-4 ring-1 ring-rose-100 dark:from-rose-900/15 dark:to-slate-900 dark:ring-rose-900/30">
                                <div className="absolute right-0 top-0 -mr-4 -mt-4 h-16 w-16 rounded-full bg-rose-100 opacity-50 dark:bg-rose-900/20" />
                                <div className="flex items-center gap-2 text-sm font-medium text-rose-600 dark:text-rose-400">
                                    <ArrowUpRight size={18} /> Output VAT
                                </div>
                                <div className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-300">
                                    {formatMoney(dashboard.finance.outputVAT)}
                                </div>
                            </div>
                            <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 to-white p-4 ring-1 ring-emerald-100 dark:from-emerald-900/12 dark:to-slate-900 dark:ring-emerald-900/30">
                                <div className="absolute right-0 top-0 -mr-4 -mt-4 h-16 w-16 rounded-full bg-emerald-100 opacity-50 dark:bg-emerald-900/20" />
                                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                    <ArrowDownRight size={18} /> Input VAT
                                </div>
                                <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                                    {formatMoney(dashboard.finance.inputVAT)}
                                </div>
                            </div>
                            <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-sky-50 to-white p-4 ring-1 ring-sky-100 dark:from-sky-900/12 dark:to-slate-900 dark:ring-sky-900/30">
                                <div className="absolute right-0 top-0 -mr-4 -mt-4 h-16 w-16 rounded-full bg-sky-100 opacity-50 dark:bg-sky-900/20" />
                                <div className="flex items-center gap-2 text-sm font-medium text-sky-600 dark:text-sky-400">
                                    <Receipt size={18} /> Net VAT{' '}
                                    {dashboard.finance.netVAT >= 0 ? '(Payable)' : '(Refundable)'}
                                </div>
                                <div className="mt-2 text-2xl font-bold text-sky-700 dark:text-sky-300">
                                    {formatMoney(Math.abs(dashboard.finance.netVAT))}
                                </div>
                            </div>
                        </div>
                    </DashboardPanel>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <DashboardPanel>
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Top Suppliers</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Largest vendors by purchase volume
                        </p>
                    </div>
                    {dashboard.topSuppliers.length > 0 ? (
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dashboard.topSuppliers} margin={{ top: 0, right: 0, left: -10, bottom: 0 }} layout="vertical">
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        horizontal={false}
                                        stroke="var(--color-border)"
                                        opacity={0.5}
                                    />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        width={110}
                                        tick={{
                                            fill: 'var(--color-text-primary)',
                                            fontSize: 11,
                                            fontWeight: 500,
                                        }}
                                        tickFormatter={(value: string) => truncateLabel(value)}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'var(--color-bg-subtle)', opacity: 0.4 }}
                                        content={<DashboardTooltip formatter={formatMoney} />}
                                    />
                                    <Bar dataKey="value" name="Purchases" radius={[0, 4, 4, 0]} barSize={16}>
                                        {dashboard.topSuppliers.map((supplier, index) => (
                                            <Cell
                                                key={`${supplier.name}-${index}`}
                                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptyState message="No supplier data available" className="h-[280px]" />
                    )}
                </DashboardPanel>

                <DashboardPanel>
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Expense Distribution</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Total company spending by category
                        </p>
                    </div>
                    {dashboard.expenseCategories.length > 0 ? (
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={dashboard.expenseCategories}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70}
                                        outerRadius={100}
                                        paddingAngle={3}
                                        stroke="none"
                                    >
                                        {dashboard.expenseCategories.map((entry, index) => (
                                            <Cell
                                                key={`${entry.name}-${index}`}
                                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<DashboardTooltip formatter={formatMoney} />} />
                                    <Legend
                                        verticalAlign="bottom"
                                        height={36}
                                        iconType="circle"
                                        formatter={(value) => (
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                {value}
                                            </span>
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptyState message="No expense data available" className="h-[280px]" />
                    )}
                </DashboardPanel>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <DashboardPanel>
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Invoices</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Latest successful transactions
                            </p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {dashboard.summary.recentInvoices.length === 0 ? (
                            <EmptyState message="No recent invoices" className="h-32" />
                        ) : null}

                        {dashboard.summary.recentInvoices.map((invoice) => (
                            <div
                                key={invoice.id}
                                className="group flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/85 p-4 transition-colors hover:bg-slate-100/85 dark:border-slate-700/80 dark:bg-slate-900/45 dark:hover:bg-slate-800/70"
                            >
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                                        <span className="rounded bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                                            {invoice.invoiceNo}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                        <Users size={12} className="text-slate-400" />
                                        {invoice.customerName}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[15px] font-bold text-slate-900 dark:text-white">
                                        {formatMoney(invoice.grandTotal)}
                                    </div>
                                    <div className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-500 dark:text-slate-400">
                                        <Clock size={12} />
                                        {formatInvoiceTime(invoice.createdAt)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DashboardPanel>

                <DashboardPanel>
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Risk & Alerts Monitor</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Critical operational indicators
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 dark:border-rose-900/30 dark:from-rose-900/15 dark:to-slate-900">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                                    <Package size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                        Low Stock
                                    </p>
                                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                                        {dashboard.summary.lowStockCount.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col items-center">
                        <h4 className="mb-2 self-start text-sm font-semibold text-slate-900 dark:text-white">
                            Stock Health Overview
                        </h4>
                        <div className="h-[200px] w-full max-w-sm">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={dashboard.inventory.health}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={3}
                                        stroke="none"
                                    >
                                        {dashboard.inventory.health.map((entry, index) => (
                                            <Cell
                                                key={`${entry.name}-${index}`}
                                                fill={
                                                    entry.name === 'Healthy'
                                                        ? CHART_COLORS.healthGood
                                                        : CHART_COLORS.healthRisk
                                                }
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<DashboardTooltip />} />
                                    <Legend
                                        verticalAlign="bottom"
                                        height={20}
                                        iconType="circle"
                                        formatter={(value) => (
                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                                {value}
                                            </span>
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </DashboardPanel>
            </div>
        </PageLayout>
    );
}


