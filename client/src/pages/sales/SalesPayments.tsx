import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import api from '../../lib/api';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import { useAuthStore } from '../../stores/authStore';
import Pagination from '../../components/ui/Pagination';
import { getSalesCustomerDisplay } from '../../lib/salesCustomerDisplay';
import AppDropdown from '../../components/ui/AppDropdown';

export default function SalesPayments() {
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [state, setState] = useState<'open' | 'closed' | 'all'>('open');

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-payments', activeBranchId, page, limit, search, state],
        queryFn: () => api.get('/sales/payments', {
            params: { page, limit, search: search || undefined, state },
        }).then((r) => r.data),
    });

    const rows = data?.data || [];
    const meta = data?.meta;
    const pagination = meta?.pagination;
    const summary = meta?.summary;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Sales Payments</h1>
                        <ModuleRefreshButton queryKeys={[['sales-payments', activeBranchId]]} />
                    </div>
                    <p className="text-sm text-gray-500">Track collections from credit sales invoices</p>
                </div>
                <Link to="/sales/payments/receive" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
                    Receive Payment
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Invoice Amount</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary?.totalAmount || 0).toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Collected</p>
                    <p className="text-xl font-semibold text-emerald-700">{Number(summary?.totalPaid || 0).toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Outstanding</p>
                    <p className="text-xl font-semibold text-rose-700">{Number(summary?.totalOutstanding || 0).toLocaleString()} {currency}</p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setPage(1);
                                    setSearch(searchInput.trim());
                                }
                            }}
                            placeholder="Search invoice / customer / phone"
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                        />
                    </div>
                    <AppDropdown
                        value={state}
                        onChange={(v) => setState(v as 'open' | 'closed' | 'all')}
                        options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]}
                        placeholder='Open'
                    />
                    <button
                        onClick={() => {
                            setPage(1);
                            setSearch(searchInput.trim());
                        }}
                        className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Search
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            {['Invoice', 'Date', 'Customer', 'Total', 'Paid', 'Outstanding', 'Status', 'Action'].map((h) => (
                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(isLoading || isFetching) && rows.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                                    <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                                    Loading...
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">No sales payments found</td></tr>
                        ) : rows.map((row: any) => (
                            <tr key={row.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{row.invoiceNo}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{new Date(row.createdAt).toLocaleDateString()}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">
                                    <div className="flex flex-col leading-tight">
                                        <span>{getSalesCustomerDisplay(row).title}</span>
                                        {getSalesCustomerDisplay(row).isWalkInLoyalty && (
                                            <span className="text-[11px] text-gray-500">{getSalesCustomerDisplay(row).detail}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">{Number(row.totalAmount || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm text-emerald-700">{Number(row.paidAmount || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-rose-700">{Number(row.outstandingAmount || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${row.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {row.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    {Number(row.outstandingAmount || 0) > 0 ? (
                                        <Link to={`/sales/payments/receive?invoiceId=${row.id}`} className="text-blue-600 hover:underline">
                                            Receive
                                        </Link>
                                    ) : (
                                        <span className="text-gray-400">Settled</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

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
