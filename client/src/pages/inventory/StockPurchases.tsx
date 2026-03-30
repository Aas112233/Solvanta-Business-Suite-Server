import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import api from '../../lib/api';
import {
    Plus, Search, Filter, ShoppingCart,
    ArrowRight, CheckCircle2, User,
    Calendar, MapPin, DollarSign, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import AppDropdown from '../../components/ui/AppDropdown';

export default function StockPurchases() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

    const activeBranchId = useAuthStore(s => s.activeBranchId);
    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['purchases', activeBranchId, page, limit, status, search, dateRange],
        queryFn: () => api.get('/purchases', {
            params: {
                page,
                limit,
                status: status || undefined,
                search: search || undefined,
                startDate: dateRange.startDate || undefined,
                endDate: dateRange.endDate || undefined
            }
        }).then((r: any) => r.data)
    });
    const pagination = data?.meta?.pagination;

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700';
            case 'RECEIVED': return 'bg-green-50 text-green-700';
            case 'PARTIAL': return 'bg-orange-50 text-orange-700';
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
                        <h1 className="text-2xl font-bold text-gray-900">Purchase Invoices</h1>
                        <ModuleRefreshButton queryKeys={[['purchases']]} />
                    </div>
                    <p className="text-gray-500">Manage stock replenishment from suppliers</p>
                </div>
                <button
                    onClick={() => navigate('/purchases/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus size={18} /> Record Purchase
                </button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><ShoppingCart size={24} /></div>
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase">Total Purchases</p>
                        <p className="text-xl font-bold text-gray-900">{pagination?.total || 0}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg"><CheckCircle2 size={24} /></div>
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase">Status Received</p>
                        <p className="text-xl font-bold text-gray-900">
                            {data?.data?.filter((p: any) => p.status === 'RECEIVED').length || 0}
                        </p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg"><DollarSign size={24} /></div>
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase">Page Spend</p>
                        <p className="text-xl font-bold text-gray-900">
                            {data?.data?.reduce((acc: number, p: any) => acc + p.grandTotal, 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">SAR</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search invoice or supplier..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);}}
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
                        options={[{ value: '', label: 'All Statuses' }, { value: 'DRAFT', label: 'Draft' }, { value: 'RECEIVED', label: 'Received' }, { value: 'PARTIAL', label: 'Partial' }]}
                        placeholder='All Statuses'
                    />
                </div>
            </div>

            {/* List */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative min-h-[400px]">
                {(isLoading || isFetching) && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-blue-600">
                        <Loader2 size={40} className="animate-spin mb-3" />
                        <span className="text-sm font-bold animate-pulse">Loading purchases...</span>
                    </div>
                )}

                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-sm">Purchase No</th>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-sm">Supplier</th>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-sm">Branch</th>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-sm">Total Amount</th>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-sm">Items</th>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-sm">Status</th>
                            <th className="py-3 px-4 font-semibold text-gray-600 text-sm text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading && !isFetching ? (
                            <tr><td colSpan={7} className="py-12 text-center text-gray-500"></td></tr>
                        ) : data?.data?.length === 0 ? (
                            <tr><td colSpan={7} className="py-8 text-center text-gray-500">No purchases found</td></tr>
                        ) : (
                            data?.data?.map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 px-4">
                                        <div className="font-bold text-gray-900 leading-tight">{p.purchaseNo}</div>
                                        <div className="text-[10px] text-gray-400 mt-0.5">{new Date(p.createdAt).toLocaleDateString()}</div>
                                    </td>
                                    <td className="py-4 px-4 text-gray-700">
                                        <div className="font-medium">{p.supplier?.name}</div>
                                        <div className="text-xs text-gray-400">{p.invoiceNoSupplier || 'No Ref'}</div>
                                    </td>
                                    <td className="py-4 px-4 text-gray-600 text-sm">{p.branch?.name}</td>
                                    <td className="py-4 px-4 font-bold text-gray-900">
                                        {p.grandTotal.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">SAR</span>
                                    </td>
                                    <td className="py-4 px-4 text-gray-500 text-sm">{p._count?.items} items</td>
                                    <td className="py-4 px-4">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(p.status)}`}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <button title="Edit" onClick={() => navigate(`/purchases/${p.id}/edit`)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Pencil size={18} /></button><button 
                                            onClick={() => navigate(`/purchases/${p.id}`)}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        >
                                            <ArrowRight size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
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

