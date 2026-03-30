import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import api from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import ModuleRefreshButton from '../../../components/ModuleRefreshButton';
import Pagination from '../../../components/ui/Pagination';

export default function SalesCashAudit() {
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(30);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-cash-audit', activeBranchId, page, limit, search],
        queryFn: () => api.get('/sales/cash/audit', {
            params: {
                page,
                limit,
                search: search || undefined,
            },
        }).then((r) => r.data),
    });

    const rows = data?.data || [];
    const pagination = data?.meta?.pagination;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Cash Audit Trail</h1>
                        <ModuleRefreshButton queryKeys={[['sales-cash-audit', activeBranchId]]} />
                    </div>
                    <p className="text-sm text-gray-500">Immutable event history for collection, vault, deposit, and reconciliation steps</p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="relative">
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
                        placeholder="Search by note"
                        className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                    />
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-4 py-3">Time</th>
                            <th className="px-4 py-3">Event</th>
                            <th className="px-4 py-3">Run</th>
                            <th className="px-4 py-3">Bag</th>
                            <th className="px-4 py-3">Branch</th>
                            <th className="px-4 py-3">Actor</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(isLoading || isFetching) && rows.length === 0 ? (
                            <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500"><Loader2 className="mx-auto mb-2 animate-spin" size={18} />Loading audit events...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No audit records found.</td></tr>
                        ) : rows.map((row: any) => (
                            <tr key={row.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 text-gray-600">{new Date(row.createdAt).toLocaleString()}</td>
                                <td className="px-4 py-3 font-semibold text-gray-900">{row.eventType}</td>
                                <td className="px-4 py-3 text-gray-700">{row.run?.runNo || '-'}</td>
                                <td className="px-4 py-3 text-gray-700">{row.bag?.bagCode || '-'}</td>
                                <td className="px-4 py-3 text-gray-700">{row.branch?.name || '-'}</td>
                                <td className="px-4 py-3 text-gray-700">{row.actor?.name || '-'}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{Number(row.amount || 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-gray-600">{row.notes || '-'}</td>
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
