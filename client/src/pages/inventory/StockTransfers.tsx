import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    Plus, Search, ArrowRight, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import AppDropdown from '../../components/ui/AppDropdown';

export default function StockTransfers() {
    const navigate = useNavigate();
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['transfers', status, search, page, limit, dateRange],
        queryFn: () => api.get('/inventory/transfers', {
            params: {
                status: status || undefined,
                search: search || undefined,
                page,
                limit,
                startDate: dateRange.startDate || undefined,
                endDate: dateRange.endDate || undefined
            }
        }).then((r: any) => r.data)
    });
    const pagination = data?.meta?.pagination;

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700';
            case 'SENT': return 'bg-blue-50 text-blue-700';
            case 'RECEIVED': return 'bg-green-50 text-green-700';
            case 'CANCELLED': return 'bg-red-50 text-red-700';
            default: return 'bg-gray-50 text-gray-600';
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Stock Transfers</h1>
                        <ModuleRefreshButton queryKeys={[['transfers']]} />
                    </div>
                    <p className="text-gray-500">Move inventory between branches</p>
                </div>
                <button onClick={() => navigate('/inventory/transfers/new')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    <Plus size={18} /> New Transfer
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);}}
                        placeholder="Search transfer no..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <DateRangeFilter
                        startDate={dateRange.startDate}
                        endDate={dateRange.endDate}
                        onChange={(start: string, end: string) => {
                            setDateRange({ startDate: start, endDate: end });
                            setPage(1);
                        }}
                        onClear={() => {
                            setDateRange({ startDate: '', endDate: '' });
                            setPage(1);
                        }}
                    />
                                        <AppDropdown
                        value={status}
    onChange={(v) => setStatus(v)}
                        options={[{ value: '', label: 'All Statuses' }, { value: 'DRAFT', label: 'Draft' }, { value: 'SENT', label: 'Sent' }, { value: 'RECEIVED', label: 'Received' }]}
                        placeholder='All Statuses'
                    />
                </div>
            </div>

            {/* List */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative min-h-[400px]">
                {(isLoading || isFetching) && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-blue-600">
                        <Loader2 size={40} className="animate-spin mb-3" />
                        <span className="text-sm font-bold animate-pulse">Loading transfers...</span>
                    </div>
                )}

                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="py-3 px-4 font-semibold text-gray-600">Transfer No</th>
                            <th className="py-3 px-4 font-semibold text-gray-600">From Branch</th>
                            <th className="py-3 px-4 font-semibold text-gray-600">To Branch</th>
                            <th className="py-3 px-4 font-semibold text-gray-600">Items</th>
                            <th className="py-3 px-4 font-semibold text-gray-600">Status</th>
                            <th className="py-3 px-4 font-semibold text-gray-600">Date</th>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading && !isFetching ? (
                            <tr><td colSpan={7} className="py-8 h-16 bg-gray-50/20" /></tr>
                        ) : data?.data?.length === 0 ? (
                            <tr><td colSpan={7} className="py-8 text-center text-gray-500">No transfers found</td></tr>
                        ) : (
                            data?.data?.map((t: any) => (
                                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-blue-600">{t.transferNo}</td>
                                    <td className="py-3 px-4 text-gray-700">{t.fromBranch?.name}</td>
                                    <td className="py-3 px-4 text-gray-700">{t.toBranch?.name}</td>
                                    <td className="py-3 px-4 text-gray-600">{t.items?.length} items</td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(t.status)}`}>
                                            {t.status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-gray-500 text-sm">
                                        {new Date(t.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            onClick={() => navigate(`/inventory/transfers/${t.id}`)}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems}
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
