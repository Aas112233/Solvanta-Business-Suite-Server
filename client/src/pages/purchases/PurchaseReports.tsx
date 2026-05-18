import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
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
    YAxis
} from 'recharts';
import {
    BarChart3,
    Download,
    Filter,
    Loader2,
    Search,
    ShoppingCart,
    Wallet,
    RotateCcw,
    AlertTriangle
} from 'lucide-react';
import toast from '@/lib/toast';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import Pagination from '../../components/ui/Pagination';
import { exportExcel } from '../../lib/fileExport';
import api from '../../lib/api';
import AppDropdown from '../../components/ui/AppDropdown';

const TOP_SUPPLIER_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#dc2626', '#7c3aed'];

const statusColor = (status?: string) => {
    switch (status) {
        case 'RECEIVED': return 'bg-green-50 text-green-700';
        case 'PARTIAL': return 'bg-amber-50 text-amber-700';
        case 'DRAFT': return 'bg-slate-100 text-slate-700';
        case 'CANCELLED': return 'bg-red-50 text-red-700';
        case 'PAID': return 'bg-blue-50 text-blue-700';
        default: return 'bg-slate-100 text-slate-700';
    }
};

function ReportTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-xs font-semibold text-gray-600">{label}</p>
            {payload.map((entry: any, idx: number) => (
                <p key={idx} className="text-xs text-gray-700">
                    <span className="font-semibold">{entry.name}:</span> {Number(entry.value || 0).toLocaleString()}
                </p>
            ))}
        </div>
    );
}

export default function PurchaseReports() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const [branchId, setBranchId] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    const money = (value: number) =>
        `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    const { data: reportData, isLoading: reportLoading } = useQuery({
        queryKey: ['report-purchases', branchId, dateRange.startDate, dateRange.endDate],
        queryFn: () =>
            api.get('/reports/purchases', {
                params: {
                    branchId: branchId || undefined,
                    dateFrom: dateRange.startDate || undefined,
                    dateTo: dateRange.endDate || undefined,
                }
            }).then((r) => r.data.data),
    });

    const { data: purchaseRows, isLoading: listLoading, isFetching: listFetching } = useQuery({
        queryKey: ['purchase-report-list', branchId, dateRange.startDate, dateRange.endDate, status, search, page, limit],
        queryFn: () =>
            api.get('/purchases', {
                params: {
                    page,
                    limit,
                    branchId: branchId || undefined,
                    status: status || undefined,
                    search: search || undefined,
                    startDate: dateRange.startDate || undefined,
                    endDate: dateRange.endDate || undefined,
                }
            }).then((r) => r.data),
    });

    const summary = reportData?.summary || {};
    const trend = reportData?.purchaseTrend || [];
    const topSuppliers = reportData?.topSuppliers || [];
    const paymentBreakdown = [
        { name: 'Payments', value: Number(summary.totalPayments || 0), color: '#16a34a' },
        { name: 'Returns', value: Number(summary.totalReturns || 0), color: '#ea580c' },
        { name: 'Outstanding', value: Number(summary.outstandingAmount || 0), color: '#dc2626' },
    ].filter((x) => x.value > 0);

    const handleExport = async () => {
        try {
            const rows: any[] = [];
            const exportLimit = 500;
            let exportPage = 1;
            let totalPages = 1;

            do {
                const res = await api.get('/purchases', {
                    params: {
                        page: exportPage,
                        limit: exportLimit,
                        branchId: branchId || undefined,
                        status: status || undefined,
                        search: search || undefined,
                        startDate: dateRange.startDate || undefined,
                        endDate: dateRange.endDate || undefined,
                    }
                });

                const chunk = res.data?.data || [];
                const pagination = res.data?.meta?.pagination || {};
                rows.push(...chunk);
                totalPages = Number(pagination.totalPages || 1);
                exportPage += 1;
            } while (exportPage <= totalPages);

            if (rows.length === 0) {
                toast.error('No purchases to export for selected filters');
                return;
            }

            await exportExcel({
                fileName: `purchase-reports-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Purchases',
                title: 'Purchase Reports',
                filters: {
                    Branch: branches?.find((b: any) => b.id === branchId)?.name || 'All Branches',
                    Status: status || 'All',
                    DateFrom: dateRange.startDate || '-',
                    DateTo: dateRange.endDate || '-',
                },
                columns: [
                    { key: 'purchaseNo', header: 'Purchase No', width: 20 },
                    { key: 'supplier', header: 'Supplier', width: 26 },
                    { key: 'branch', header: 'Branch', width: 22 },
                    { key: 'status', header: 'Status', width: 14 },
                    { key: 'items', header: 'Items', type: 'number', width: 10 },
                    { key: 'subtotal', header: 'Subtotal', type: 'currency', width: 16 },
                    { key: 'taxTotal', header: 'Tax', type: 'currency', width: 14 },
                    { key: 'grandTotal', header: 'Grand Total', type: 'currency', width: 16 },
                    { key: 'createdAt', header: 'Created At', type: 'datetime', split: true, width: 20 },
                ],
                rows: rows.map((row: any) => ({
                    purchaseNo: row.purchaseNo || '-',
                    supplier: row.supplier?.name || '-',
                    branch: row.branch?.name || '-',
                    status: row.status || '-',
                    items: Number(row._count?.items || 0),
                    subtotal: Number(row.subtotal || 0),
                    taxTotal: Number(row.taxTotal || 0),
                    grandTotal: Number(row.grandTotal || 0),
                    createdAt: row.createdAt,
                })),
            });
        } catch {
            toast.error('Failed to export purchase report');
        }
    };

    const pagination = purchaseRows?.meta?.pagination || {};

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                            <BarChart3 size={22} className="text-blue-600" />
                            Purchase Reports
                        </h1>
                        <ModuleRefreshButton queryKeys={[['report-purchases'], ['purchase-report-list']]} />
                    </div>
                    <p className="text-sm text-gray-500">Analyze purchasing activity, settlement trend, and supplier distribution.</p>
                </div>
                <button
                    type="button"
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Download size={16} />
                    Export Excel
                </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);}}
                            placeholder="Search purchase no, supplier, supplier invoice ref"
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
                            <Filter size={14} />
                            Filters
                        </div>
                                                <AppDropdown
                            value={branchId}
    onChange={(v) => setBranchId(v)}
                            options={[{ value: '', label: 'All Branches' }, ...(branches || []).map((b: any) => ({ value: b.id, label: b.name }))]}
                            placeholder='All Branches'
                            searchable
                        />
                                                <AppDropdown
                            value={status}
    onChange={(v) => setStatus(v)}
                            options={[{ value: '', label: 'All Statuses' }, { value: 'DRAFT', label: 'Draft' }, { value: 'PARTIAL', label: 'Partial' }, { value: 'RECEIVED', label: 'Received' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' }]}
                            placeholder='All Statuses'
                        />
                        <DateRangeFilter
                            startDate={dateRange.startDate}
                            endDate={dateRange.endDate}
                            onChange={(start, end) => {
                                setDateRange({ startDate: start, endDate: end });
                                setPage(1);
                            }}
                            onClear={() => {
                                setDateRange({ startDate: '', endDate: '' });
                                setPage(1);
                            }}
                        />
                    </div>
                </div>
            </div>

            {reportLoading ? (
                <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
                    <Loader2 size={28} className="mx-auto animate-spin text-blue-600" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-widest text-gray-500">Total Purchases</p>
                            <p className="mt-2 text-2xl font-bold text-gray-900">{money(Number(summary.totalPurchases || 0))}</p>
                            <p className="mt-1 text-xs text-gray-500">{Number(summary.invoiceCount || 0)} invoices</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-widest text-gray-500">Tax Total</p>
                            <p className="mt-2 text-2xl font-bold text-gray-900">{money(Number(summary.totalTax || 0))}</p>
                            <p className="mt-1 text-xs text-gray-500">Input tax from purchases</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-widest text-gray-500">Payments Posted</p>
                            <p className="mt-2 text-2xl font-bold text-green-700">{money(Number(summary.totalPayments || 0))}</p>
                            <p className="mt-1 text-xs text-gray-500">Supplier settlements</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-widest text-gray-500">Outstanding</p>
                            <p className="mt-2 text-2xl font-bold text-red-600">{money(Number(summary.outstandingAmount || 0))}</p>
                            <p className="mt-1 text-xs text-gray-500">Open supplier balances</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        <div className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-900">Purchase Trend (6 months)</h3>
                            <p className="mb-4 text-xs text-gray-500">Monthly purchase value and tax</p>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trend}>
                                        <defs>
                                            <linearGradient id="purchaseTotalFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} />
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                                        <Tooltip content={<ReportTooltip />} />
                                        <Area type="monotone" dataKey="total" name="Total" stroke="#2563eb" fill="url(#purchaseTotalFill)" strokeWidth={2.5} />
                                        <Area type="monotone" dataKey="tax" name="Tax" stroke="#16a34a" fillOpacity={0} strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                                <h3 className="text-sm font-semibold text-gray-900">Settlement Split</h3>
                                <p className="mb-4 text-xs text-gray-500">Payments, returns, and outstanding balance</p>
                                {paymentBreakdown.length === 0 ? (
                                    <div className="flex h-56 items-center justify-center text-sm text-gray-400">No settlement data</div>
                                ) : (
                                    <div className="h-56">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={paymentBreakdown} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78}>
                                                    {paymentBreakdown.map((d) => (
                                                        <Cell key={d.name} fill={d.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={<ReportTooltip />} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                                <h3 className="text-sm font-semibold text-gray-900">Top Suppliers</h3>
                                <p className="mb-4 text-xs text-gray-500">By purchase value</p>
                                {topSuppliers.length === 0 ? (
                                    <div className="flex h-56 items-center justify-center text-sm text-gray-400">No supplier data</div>
                                ) : (
                                    <div className="h-56">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={topSuppliers} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                                                <XAxis type="number" hide />
                                                <YAxis
                                                    dataKey="name"
                                                    type="category"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    width={110}
                                                    tick={{ fontSize: 11 }}
                                                    tickFormatter={(name: string) => name.length > 14 ? `${name.slice(0, 14)}...` : name}
                                                />
                                                <Tooltip content={<ReportTooltip />} />
                                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                    {topSuppliers.map((_: any, idx: number) => (
                                                        <Cell key={idx} fill={TOP_SUPPLIER_COLORS[idx % TOP_SUPPLIER_COLORS.length]} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                {(listLoading || listFetching) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                        <Loader2 size={32} className="animate-spin text-blue-600" />
                    </div>
                )}
                <table className="w-full text-left">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Purchase</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Supplier</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Branch</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Tax</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Grand Total</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Items</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(purchaseRows?.data || []).length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                                    No purchases found for selected filters
                                </td>
                            </tr>
                        ) : (
                            (purchaseRows?.data || []).map((row: any) => (
                                <tr key={row.id} className="border-t border-gray-100">
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-semibold text-gray-900">{row.purchaseNo || '-'}</p>
                                        <p className="text-xs text-gray-500">{new Date(row.createdAt).toLocaleString()}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{row.supplier?.name || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.branch?.name || '-'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${statusColor(row.status)}`}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-gray-700">{money(Number(row.taxTotal || 0))}</td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{money(Number(row.grandTotal || 0))}</td>
                                    <td className="px-4 py-3 text-right text-sm text-gray-600">{Number(row._count?.items || 0)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                <Pagination
                    currentPage={page}
                    totalPages={Number(pagination.totalPages || 1)}
                    totalItems={Number(pagination.totalItems || pagination.total || 0)}
                    itemsPerPage={limit}
                    onPageChange={setPage}
                    onItemsPerPageChange={setLimit}
                    isLoading={listFetching}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
                        <ShoppingCart size={14} /> Purchase Volume
                    </p>
                    <p className="text-xl font-bold text-gray-900">{money(Number(summary.totalPurchases || 0))}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
                        <Wallet size={14} /> Settled Amount
                    </p>
                    <p className="text-xl font-bold text-green-700">{money(Number(summary.totalPayments || 0))}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
                        <RotateCcw size={14} /> Returned + Open
                    </p>
                    <p className="text-xl font-bold text-amber-700">
                        {money(Number(summary.totalReturns || 0) + Number(summary.outstandingAmount || 0))}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                        <AlertTriangle size={12} /> includes outstanding liability
                    </p>
                </div>
            </div>
        </div>
    );
}
