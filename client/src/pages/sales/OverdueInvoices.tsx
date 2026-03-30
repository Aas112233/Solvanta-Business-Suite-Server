import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Filter, Loader2, Search, ShieldAlert, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import Pagination from '../../components/ui/Pagination';
import { getSalesCustomerDisplay } from '../../lib/salesCustomerDisplay';
import AppDropdown from '../../components/ui/AppDropdown';

export default function OverdueInvoices() {
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const today = new Date().toLocaleDateString('en-CA');

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const [dateInput, setDateInput] = useState({ startDate: '', endDate: today });
    const [minDaysInput, setMinDaysInput] = useState('30');
    const [queryParams, setQueryParams] = useState({
        search: '',
        startDate: '',
        endDate: today,
        minDays: 30,
    });

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-overdue-invoices', activeBranchId, page, limit, queryParams],
        queryFn: async () => {
            const res = await api.get('/sales/overdue-invoices', {
                params: {
                    page,
                    limit,
                    search: queryParams.search || undefined,
                    startDate: queryParams.startDate || undefined,
                    endDate: queryParams.endDate || undefined,
                    minDays: queryParams.minDays,
                },
            });
            return res.data;
        },
    });

    const rows = data?.data || [];
    const pagination = data?.meta?.pagination;
    const summary = data?.meta?.summary;

    const applyFilters = () => {
        const parsedMinDays = Number(minDaysInput);
        setPage(1);
        setQueryParams({
            search: searchInput.trim(),
            startDate: dateInput.startDate,
            endDate: dateInput.endDate,
            minDays: Number.isFinite(parsedMinDays) && parsedMinDays > 0 ? parsedMinDays : 30,
        });
    };

    const buildReceiveLink = (row: any) => {
        const params = new URLSearchParams({ invoiceId: String(row.id) });
        if (row?.customer?.id) {
            params.set('customerId', String(row.customer.id));
        }
        const outstanding = Number(row?.outstanding || 0);
        if (outstanding > 0) {
            params.set('amount', outstanding.toFixed(2));
        }
        return `/sales/payments/receive?${params.toString()}`;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Overdue Invoices</h1>
                    <p className="text-sm text-gray-500">Unpaid credit invoices past due days threshold</p>
                </div>
                <ModuleRefreshButton queryKeys={[['sales-overdue-invoices', activeBranchId]]} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-rose-600"><Wallet size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Overdue</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary?.totalOutstanding || 0).toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-blue-600"><CalendarClock size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Overdue Invoices</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary?.invoiceCount || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-amber-600"><AlertTriangle size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Average Days</p>
                    <p className="text-xl font-semibold text-gray-900">{Math.round(Number(summary?.averageDaysOutstanding || 0))}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-violet-600"><ShieldAlert size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Severe (&gt;90 Days)</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary?.severeCount || 0).toLocaleString()}</p>
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
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Min Days</span>
                        <AppDropdown
                            value={minDaysInput}
                            onChange={(v) => setMinDaysInput(v)}
                            options={[{ value: '1', label: '1+' }, { value: '7', label: '7+' }, { value: '14', label: '14+' }, { value: '30', label: '30+' }, { value: '45', label: '45+' }, { value: '60', label: '60+' }, { value: '90', label: '90+' }]}
                            placeholder='1+'
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

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                <th className="px-4 py-3">Invoice</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3 text-right">Invoice Total</th>
                                <th className="px-4 py-3 text-right">Received</th>
                                <th className="px-4 py-3 text-right">Outstanding</th>
                                <th className="px-4 py-3 text-center">Days</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(isLoading || isFetching) && rows.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                                        <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                                        Loading overdue invoices...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                                        No overdue invoices found for selected filters (older than {Number(summary?.minDays || queryParams.minDays)} days).
                                    </td>
                                </tr>
                            ) : rows.map((row: any) => (
                                <tr key={row.id} className="border-b border-gray-50">
                                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{row.invoiceNo}</td>
                                    <td className="px-4 py-3 text-gray-700">{format(new Date(row.createdAt), 'MMM dd, yyyy')}</td>
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-gray-900">{getSalesCustomerDisplay(row).title}</p>
                                        <p className="text-xs text-gray-500">
                                            {getSalesCustomerDisplay(row).isWalkInLoyalty
                                                ? getSalesCustomerDisplay(row).detail
                                                : (row.customer?.phone || row.loyaltyCustomer?.phone || '-')}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-900">{Number(row.grandTotal || 0).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{Number(row.received || 0).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-rose-700">{Number(row.outstanding || 0).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-3 text-center font-semibold text-gray-900">{row.daysOutstanding}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${row.daysOutstanding > 90 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {row.daysOutstanding > 90 ? 'Severe' : 'Overdue'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            to={buildReceiveLink(row)}
                                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                        >
                                            Receive
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.total}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>
        </div>
    );
}
