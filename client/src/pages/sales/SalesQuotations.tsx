import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Plus,
    Search,
    FileText,
    Calendar,
    User,
    ArrowRight,
    Filter,
    MoreVertical,
    Eye,
    CheckCircle,
    Copy,
    Trash2,
    Clock,
    XCircle,
    ChevronRight,
    Loader2
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import { format } from 'date-fns';

export default function SalesQuotations() {
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [search, setSearch] = useState('');
    const [state, setState] = useState<'active' | 'converted' | 'all'>('active');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const navigate = useNavigate();

    const { data: qData, isLoading, refetch } = useQuery({
        queryKey: ['sales-quotations', page, limit, search, state, startDate, endDate],
        queryFn: () => api.get('/sales/quotations', {
            params: {
                page,
                limit,
                search: search || undefined,
                state,
                startDate: startDate || undefined,
                endDate: endDate || undefined
            }
        }).then(r => r.data),
    });

    const quotations = qData?.data || [];
    const total = qData?.meta?.total || 0;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700 border-gray-200';
            case 'SENT': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'ACCEPTED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'CONVERTED': return 'bg-purple-100 text-purple-700 border-purple-200';
            case 'EXPIRED': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'REJECTED': return 'bg-red-100 text-red-700 border-red-200';
            case 'CANCELLED': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales Quotations</h1>
                    <p className="text-sm text-gray-500">Manage client proposals and estimates</p>
                </div>
                <Link
                    to="/sales/quotations/new"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 font-medium"
                >
                    <Plus size={18} />
                    Create Quotation
                </Link>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by quote # or customer name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                        {(['active', 'converted', 'all'] as const).map((s) => (
                            <button
                                key={s}
                                onClick={() => setState(s)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${state === s
                                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                    : 'text-gray-500 hover:bg-gray-100 border border-transparent'
                                    }`}
                            >
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-gray-100">
                    <DateRangeFilter
                        startDate={startDate}
                        endDate={endDate}
                        onChange={(start: string, end: string) => {
                            setStartDate(start);
                            setEndDate(end); }}
                    />
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Displaying {quotations.length ?? 0} of {total ?? 0} records
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 gap-4">
                {isLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-gray-400 bg-white rounded-2xl border border-gray-100">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p className="font-medium text-gray-600">Syncing quotations...</p>
                    </div>
                ) : quotations.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <FileText size={32} />
                        </div>
                        <p className="text-lg font-medium text-gray-600">No records found</p>
                        <p className="text-sm">Try adjusting your filters or create a new quotation</p>
                    </div>
                ) : (
                    <>
                        {quotations.map((q: any) => (
                            <div
                                key={q.id}
                                className="group bg-white rounded-2xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer relative"
                                onClick={() => navigate(`/sales/quotations/${q.id}`)}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${q.status === 'CONVERTED' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                                            }`}>
                                            <FileText size={24} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-bold text-gray-900 truncate">
                                                    {q.quotationNo}
                                                </h3>
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${getStatusColor(q.status)}`}>
                                                    {q.status}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={14} className="text-gray-400" />
                                                    <span className="font-medium text-gray-700">
                                                        {q.customer?.name || q.customerName || 'Walk-in Customer'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={14} className="text-gray-400" />
                                                    <span>{format(new Date(q.createdAt), 'dd MMM yyyy')}</span>
                                                </div>
                                                {q.validUntil && (
                                                    <div className="flex items-center gap-1.5 text-amber-600 font-medium">
                                                        <Clock size={14} />
                                                        <span>Valid until {format(new Date(q.validUntil), 'dd MMM')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between md:justify-end gap-6 md:gap-10 border-t md:border-t-0 pt-4 md:pt-0">
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">Total Value</p>
                                            <p className="text-xl font-black text-gray-900 tracking-tight">
                                                {q.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] font-normal text-gray-400 ml-0.5">SAR</span>
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {q.status !== 'CONVERTED' && q.status !== 'CANCELLED' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/sales/quotations/convert?id=${q.id}`);
                                                    }}
                                                    className="p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all"
                                                    title="Convert to Order/Invoice"
                                                >
                                                    <ArrowRight size={18} />
                                                </button>
                                            )}
                                            <button
                                                className="p-2 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {q.status === 'CONVERTED' && q.convertedInvoiceNo && (
                                    <div className="mt-4 flex items-center gap-2 text-xs bg-purple-50/50 text-purple-700 px-3 py-2 rounded-lg border border-purple-100">
                                        <CheckCircle size={14} />
                                        <span>Successfully converted to invoice <strong>{q.convertedInvoiceNo}</strong></span>
                                    </div>
                                )}
                            </div>
                        ))}
                        <Pagination
                            currentPage={page}
                            totalPages={Math.ceil(total / limit)}
                            totalItems={total}
                            itemsPerPage={limit}
                            onPageChange={setPage}
                            onItemsPerPageChange={() => { }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
