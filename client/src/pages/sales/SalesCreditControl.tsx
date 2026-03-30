import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Filter, Loader2, Search, ShieldCheck, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import DateRangeFilter from '@/components/ui/DateRangeFilter';
import ModuleRefreshButton from '@/components/ModuleRefreshButton';
import Pagination from '@/components/ui/Pagination';
import { getSalesCustomerDisplay } from '@/lib/salesCustomerDisplay';

type CreditRow = {
    id: string;
    invoiceNo: string;
    createdAt: string;
    customer?: { id?: string; name?: string; phone?: string };
    loyaltyCustomer?: { id?: string; name?: string; phone?: string };
    status: string;
    grandTotal: number;
    received: number;
    outstanding: number;
    daysOutstanding: number;
    isOverdue: boolean;
};

export default function SalesCreditControl() {
    const navigate = useNavigate();
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const today = new Date().toLocaleDateString('en-CA');

    const [searchInput, setSearchInput] = useState('');
    const [dateInput, setDateInput] = useState({ startDate: '', endDate: today });
    const [queryParams, setQueryParams] = useState({ search: '', startDate: '', endDate: today });

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-credit-control', activeBranchId, queryParams],
        queryFn: async () => {
            const res = await api.get('/sales/pending-payments', {
                params: {
                    page: 1,
                    limit: 500,
                    search: queryParams.search || undefined,
                    startDate: queryParams.startDate || undefined,
                    endDate: queryParams.endDate || undefined,
                },
            });
            return res.data;
        },
    });

    const rows: CreditRow[] = data?.data || [];
    const backendSummary = data?.meta?.summary || {};

    const customerExposure = useMemo(() => {
        const map = new Map<string, { customerId: string; customerName: string; phone: string; invoices: number; outstanding: number; maxDays: number; overdueInvoices: number }>();
        for (const row of rows) {
            const customerDisplay = getSalesCustomerDisplay(row);
            const customerId = customerDisplay.isWalkInLoyalty
                ? String(row.loyaltyCustomer?.id || `walk-in-${customerDisplay.detail}`)
                : String(row.customer?.id || 'walk-in');
            const customerName = customerDisplay.title;
            const phone = customerDisplay.isWalkInLoyalty ? customerDisplay.detail : (row.customer?.phone || '-');
            const existing = map.get(customerId) || {
                customerId,
                customerName,
                phone,
                invoices: 0,
                outstanding: 0,
                maxDays: 0,
                overdueInvoices: 0,
            };
            existing.invoices += 1;
            existing.outstanding += Number(row.outstanding || 0);
            existing.maxDays = Math.max(existing.maxDays, Number(row.daysOutstanding || 0));
            if (row.isOverdue) existing.overdueInvoices += 1;
            map.set(customerId, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding).slice(0, 25);
    }, [rows]);

    const aging = useMemo(() => {
        const buckets = { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
        for (const row of rows) {
            const value = Number(row.outstanding || 0);
            const days = Number(row.daysOutstanding || 0);
            if (days <= 30) buckets.b0_30 += value;
            else if (days <= 60) buckets.b31_60 += value;
            else if (days <= 90) buckets.b61_90 += value;
            else buckets.b90p += value;
        }
        return buckets;
    }, [rows]);

    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const pagedRows = rows.slice(start, start + limit);

    const applyFilters = () => {
        setPage(1);
        setQueryParams({
            search: searchInput.trim(),
            startDate: dateInput.startDate,
            endDate: dateInput.endDate,
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Credit Control</h1>
                    <p className="text-sm text-gray-500">Control customer credit exposure, overdue invoices, and collection actions</p>
                </div>
                <ModuleRefreshButton queryKeys={[['sales-credit-control', activeBranchId], ['sales-pending-payments', activeBranchId], ['sales-payments']]} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-emerald-600"><Wallet size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Outstanding</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(backendSummary.totalOutstanding || 0).toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-blue-600"><CalendarClock size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Open Credit Invoices</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(backendSummary.invoiceCount || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-amber-600"><AlertTriangle size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Overdue (&gt;30 Days)</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(backendSummary.overdueCount || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-violet-600"><ShieldCheck size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Customers Exposed</p>
                    <p className="text-xl font-semibold text-gray-900">{customerExposure.length.toLocaleString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Aging 0-30 Days</p>
                    <p className="text-lg font-semibold text-gray-900">{aging.b0_30.toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Aging 31-60 Days</p>
                    <p className="text-lg font-semibold text-amber-700">{aging.b31_60.toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Aging 61-90 Days</p>
                    <p className="text-lg font-semibold text-orange-700">{aging.b61_90.toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Aging 90+ Days</p>
                    <p className="text-lg font-semibold text-rose-700">{aging.b90p.toLocaleString()} {currency}</p>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                            placeholder="Search invoice/customer/phone..."
                            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
                        />
                    </div>
                    <DateRangeFilter
                        startDate={dateInput.startDate}
                        endDate={dateInput.endDate}
                        onChange={(start: string, end: string) => setDateInput({ startDate: start, endDate: end })}
                        onClear={() => setDateInput({ startDate: '', endDate: '' })}
                    />
                    <button
                        onClick={applyFilters}
                        disabled={isFetching}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
                    >
                        {isFetching ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
                        {isFetching ? 'Loading...' : 'Apply'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Customer Exposure</div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-4 py-3">Customer</th>
                                    <th className="px-4 py-3 text-right">Invoices</th>
                                    <th className="px-4 py-3 text-right">Outstanding</th>
                                    <th className="px-4 py-3 text-right">Max Days</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customerExposure.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No exposure found</td></tr>
                                ) : customerExposure.map((c) => (
                                    <tr key={c.customerId} className="border-b border-gray-50">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900">{c.customerName}</p>
                                            <p className="text-xs text-gray-500">{c.phone}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-700">{c.invoices}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{c.outstanding.toLocaleString()} {currency}</td>
                                        <td className="px-4 py-3 text-right text-gray-700">{c.maxDays}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Credit Invoices</div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-4 py-3">Invoice</th>
                                    <th className="px-4 py-3">Customer</th>
                                    <th className="px-4 py-3 text-right">Outstanding</th>
                                    <th className="px-4 py-3 text-center">Days</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(isLoading || isFetching) && rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                            <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                                            Loading credit data...
                                        </td>
                                    </tr>
                                ) : pagedRows.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No credit invoices found</td></tr>
                                ) : pagedRows.map((row) => (
                                    <tr key={row.id} className="border-b border-gray-50">
                                        <td className="px-4 py-3">
                                            <p className="font-mono text-xs font-semibold text-gray-900">{row.invoiceNo}</p>
                                            <p className="text-xs text-gray-500">{format(new Date(row.createdAt), 'MMM dd, yyyy')}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900">{getSalesCustomerDisplay(row).title}</p>
                                            <p className="text-xs text-gray-500">
                                                {getSalesCustomerDisplay(row).isWalkInLoyalty
                                                    ? getSalesCustomerDisplay(row).detail
                                                    : (row.customer?.phone || row.loyaltyCustomer?.phone || '-')}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-rose-700">{Number(row.outstanding || 0).toLocaleString()} {currency}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${row.isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {row.daysOutstanding}d
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => navigate(`/sales/payments/receive?invoiceId=${row.id}`)}
                                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                            >
                                                Receive
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={safePage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                </div>
            </div>
        </div>
    );
}
