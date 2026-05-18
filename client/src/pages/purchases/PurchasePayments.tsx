import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '../../lib/api';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import { formatCompanyDate } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';

export default function PurchasePayments() {
    const company = useAuthStore((s) => s.user?.company);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['purchase-payments', page, search],
        queryFn: () => api.get('/purchases/payments', {
            params: { page, limit: 20, search: search || undefined },
        }).then((r) => r.data),
    });

    const rows = data?.data || [];
    const lastPage = data?.meta?.pagination?.totalPages || 1;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Purchase Payments</h1>
                        <ModuleRefreshButton queryKeys={[['purchase-payments']]} />
                    </div>
                    <p className="text-sm text-gray-500">Record and track supplier payments</p>
                </div>
                <Link to="/purchases/payments/new" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
                    Record Payment
                </Link>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="relative max-w-md">
                    <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search payment no / purchase no / supplier"
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            {['Payment No', 'Date', 'Purchase No', 'Supplier', 'Method', 'Amount', 'Status'].map((h) => (
                                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">No payments found</td></tr>
                        ) : rows.map((row: any) => (
                            <tr key={row.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{row.paymentNo}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{formatCompanyDate(row.paymentDate, company)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{row.purchaseInvoice?.purchaseNo}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{row.supplier?.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{row.paymentMethod}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{Number(row.amount || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{row.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-center gap-2">
                <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
                >
                    Previous
                </button>
                <span className="text-sm text-gray-600">Page {page} of {lastPage}</span>
                <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                    disabled={page >= lastPage}
                    className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
