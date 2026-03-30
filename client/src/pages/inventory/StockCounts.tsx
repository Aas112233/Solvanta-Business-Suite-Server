import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    Plus, ClipboardCheck, ArrowRight, CheckCircle2, Clock, XCircle, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter from '../../components/ui/DateRangeFilter';

export default function StockCounts() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['stock-counts', page, limit, dateRange],
        queryFn: () => api.get('/inventory/stock-counts', {
            params: {
                page,
                limit,
                startDate: dateRange.startDate || undefined,
                endDate: dateRange.endDate || undefined
            }
        }).then((r: any) => r.data)
    });
    const counts = data?.data;
    const pagination = data?.meta?.pagination;

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'COMMITTED': return 'bg-green-50 text-green-700 border-green-100';
            case 'DRAFT': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'PENDING': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
            case 'CANCELLED': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'COMMITTED': return <CheckCircle2 size={12} />;
            case 'DRAFT': return <Clock size={12} />;
            case 'CANCELLED': return <XCircle size={12} />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <ClipboardCheck className="text-blue-600" /> Stock Count and Adjust
                        </h1>
                        <ModuleRefreshButton queryKeys={[['stock-counts']]} />
                    </div>
                    <p className="text-gray-500 text-sm">Physical stock count and adjustment reconciliation</p>
                </div>
                <button
                    onClick={() => navigate('/inventory/stock-counts/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
                >
                    <Plus size={18} /> New Count Session
                </button>
            </div>

            <div className="flex items-center justify-end">
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
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden min-h-[400px] relative">
                {(isLoading || isFetching) && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-blue-600">
                        <Loader2 size={40} className="animate-spin mb-3" />
                        <span className="text-sm font-bold animate-pulse">Loading count sessions...</span>
                    </div>
                )}

                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Count Ref</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Branch</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Items</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Inspector</th>
                            <th className="py-4 px-6"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading && !isFetching ? (
                            <tr><td colSpan={7} className="py-20 h-16 bg-gray-50/20" /></tr>
                        ) : counts?.length === 0 ? (
                            <tr><td colSpan={7} className="py-20 text-center text-gray-400">No count sessions recorded</td></tr>
                        ) : (
                            counts?.map((c: any) => (
                                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer" onClick={() => navigate(`/inventory/stock-counts/${c.id}`)}>
                                    <td className="py-5 px-6">
                                        <div className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase">{c.countNo}</div>
                                        <div className="text-[10px] text-gray-400 font-bold mt-0.5">{c.notes?.substring(0, 30) || 'Routine Check'}</div>
                                    </td>
                                    <td className="py-5 px-6">
                                        <div className="text-xs font-bold text-gray-600">{c.branch?.name}</div>
                                    </td>
                                    <td className="py-5 px-6">
                                        <div className="text-xs font-bold text-gray-600">{new Date(c.createdAt).toLocaleDateString()}</div>
                                        <div className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="py-5 px-6">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border tracking-widest uppercase ${getStatusStyle(c.status)}`}>
                                            {getStatusIcon(c.status)}
                                            {c.status}
                                        </div>
                                    </td>
                                    <td className="py-5 px-6 text-xs font-black text-gray-500">
                                        {c._count?.items || 0} Products
                                    </td>
                                    <td className="py-5 px-6 text-xs font-medium text-gray-500 italic">
                                        {c.createdBy?.name}
                                    </td>
                                    <td className="py-5 px-6 text-right">
                                        <ArrowRight size={16} className="text-gray-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
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
