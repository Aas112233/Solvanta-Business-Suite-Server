import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    FileText,
    CheckCircle2,
    AlertCircle,
    Search,
    Filter,
    ArrowRight,
    Loader2,
    ShoppingCart,
    Clock,
    DollarSign,
    MoreHorizontal,
    Eye,
    CheckSquare,
    Square,
    MapPin,
    User,
    CreditCard
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { getSalesCustomerDisplay } from '../../lib/salesCustomerDisplay';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import AppDropdown from '../../components/ui/AppDropdown';
import AppLoader from '../../components/ui/AppLoader';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
} from '../../lib/globalStrings';

export default function UnpostedInvoices() {
    const queryClient = useQueryClient();
    const [showFilters, setShowFilters] = useState(false);
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        branchId: '',
        dateFrom: '',
        dateTo: '',
        paymentMethod: '',
        createdById: '',
        posTerminalId: '',
        minAmount: '',
        maxAmount: '',
    });
    const [appliedFilters, setAppliedFilters] = useState({
        branchId: '',
        dateFrom: '',
        dateTo: '',
        paymentMethod: '',
        createdById: '',
        posTerminalId: '',
        minAmount: '',
        maxAmount: '',
    });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [viewingInvoice, setViewingInvoice] = useState<any>(null);

    const { data: globalPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.salePaymentMethods],
        queryFn: () => api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.salePaymentMethods}`).then((r) => r.data.data),
    });

    const paymentMethodOptions = useMemo(
        () => buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_SALE_PAYMENT_METHOD_OPTIONS, { blankLabel: 'All Payment Methods' }),
        [globalPaymentMethods]
    );

    const { data: branches = [] } = useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data.data || [];
        }
    });

    const { data: invoices, isLoading, isFetching } = useQuery({
        queryKey: ['unpostedInvoices', searchTerm, appliedFilters],
        queryFn: async () => {
            const params: any = {};
            if (searchTerm) params.search = searchTerm;
            if (appliedFilters.branchId) params.branchId = appliedFilters.branchId;
            if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
            if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
            if (appliedFilters.paymentMethod) params.paymentMethod = appliedFilters.paymentMethod;
            if (appliedFilters.createdById) params.createdById = appliedFilters.createdById;
            if (appliedFilters.posTerminalId) params.posTerminalId = appliedFilters.posTerminalId;
            if (appliedFilters.minAmount) params.minAmount = Number(appliedFilters.minAmount);
            if (appliedFilters.maxAmount) params.maxAmount = Number(appliedFilters.maxAmount);

            const res = await api.get('/pos/unposted', { params });
            return res.data.data;
        }
    });

    const postMutation = useMutation({
        mutationFn: async (invoiceIds: string[]) => {
            const res = await api.post('/pos/post-batch', { invoiceIds });
            return res.data;
        },
        onSuccess: (data) => {
            const results = Array.isArray(data?.data) ? data.data : [];
            const successCount = results.filter((r: any) => r.status === 'success').length;
            const errorRows = results.filter((r: any) => r.status === 'error');
            const errorCount = errorRows.length;
            const invoiceNoById = new Map<string, string>(
                (invoices || []).map((inv: any) => [inv.id, inv.invoiceNo || inv.id])
            );

            if (successCount > 0) {
                toast.success(`Successfully posted ${successCount} invoices`);
            }
            if (errorCount > 0) {
                errorRows.forEach((row: any) => {
                    const invoiceNo = invoiceNoById.get(row.id) || row.id || 'Invoice';
                    const message = String(row.message || 'Failed to post invoice').trim();
                    toast.error(`${invoiceNo}: ${message}`);
                });
            }

            queryClient.invalidateQueries({ queryKey: ['unpostedInvoices'] });
            setSelectedIds([]);
        }
    });

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredInvoices?.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredInvoices?.map((i: any) => i.id) || []);
        }
    };

    const handleBatchPost = () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to process ${selectedIds.length} invoices? This will deduct stock and create accounting entries.`)) return;
        postMutation.mutate(selectedIds);
    };

    const filteredInvoices = invoices || [];

    const userOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const inv of (invoices || [])) {
            if (inv?.createdBy?.id) map.set(inv.createdBy.id, inv.createdBy.name || 'Unknown');
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [invoices]);

    const terminalOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const inv of (invoices || [])) {
            if (inv?.posTerminal?.id) {
                map.set(inv.posTerminal.id, `${inv.posTerminal.code || 'N/A'} - ${inv.posTerminal.name || 'Terminal'}`);
            }
        }
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [invoices]);

    useEffect(() => {
        if (!filteredInvoices?.length) {
            setSelectedIds([]);
            return;
        }
        const allowed = new Set(filteredInvoices.map((i: any) => i.id));
        setSelectedIds((prev) => prev.filter((id) => allowed.has(id)));
    }, [filteredInvoices]);

    const applyFilters = () => {
        setSearchTerm(searchInput.trim());
        setAppliedFilters({ ...filters });
        setSelectedIds([]);
    };

    const resetFilters = () => {
        const reset = {
            branchId: '',
            dateFrom: '',
            dateTo: '',
            paymentMethod: '',
            createdById: '',
            posTerminalId: '',
            minAmount: '',
            maxAmount: '',
        };
        setSearchInput('');
        setSearchTerm('');
        setFilters(reset);
        setAppliedFilters(reset);
        setSelectedIds([]);
    };

    const totalUnpostedAmount = filteredInvoices?.reduce((sum: number, inv: any) => sum + inv.grandTotal, 0) || 0;

    if (isLoading) {
        return <AppLoader />;
    }

    return (
        <div className="space-y-6">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Clock className="text-orange-500" />
                        Unposted Sales Invoices
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Invoices waiting for stock replenishment before final posting
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleBatchPost}
                        disabled={selectedIds.length === 0 || postMutation.isPending}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-100"
                    >
                        {postMutation.isPending ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <CheckCircle2 size={18} />
                        )}
                        Post Selected ({selectedIds.length})
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Pending Invoices</p>
                        <p className="text-2xl font-black text-gray-900">{filteredInvoices?.length || 0}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Value</p>
                        <p className="text-2xl font-black text-gray-900">{totalUnpostedAmount.toLocaleString()} <span className="text-sm font-normal text-gray-400">SAR</span></p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                        <ShoppingCart size={24} />
                    </div>
                    <div>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Selected</p>
                        <p className="text-2xl font-black text-gray-900">{selectedIds.length}</p>
                    </div>
                </div>
            </div>

            {/* Table Container */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by invoice # or customer..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-blue-100 outline-none transition-all text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={applyFilters}
                            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-sm font-bold"
                        >
                            Apply
                        </button>
                        <button
                            onClick={() => setShowFilters((v) => !v)}
                            className={`p-2.5 rounded-xl transition-all ${showFilters ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                        >
                            <Filter size={20} />
                        </button>
                    </div>
                </div>

                {showFilters && (
                    <div className="px-6 pb-6 border-b border-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <AppDropdown
                                value={filters.branchId}
                                onChange={(v) => setFilters((prev) => ({ ...prev, branchId: v }))}
                                options={[{ value: '', label: 'All/Active Branch' }, ...branches.map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))]}
                                placeholder="All/Active Branch"
                                searchable
                            />

                            <AppDropdown
                                value={filters.paymentMethod}
                                onChange={(v) => setFilters((prev) => ({ ...prev, paymentMethod: v }))}
                                options={paymentMethodOptions}
                                placeholder="All Payment Methods"
                            />

                            <AppDropdown
                                value={filters.createdById}
                                onChange={(v) => setFilters((prev) => ({ ...prev, createdById: v }))}
                                options={[{ value: '', label: 'All Salespersons' }, ...userOptions.map((u) => ({ value: u.id, label: u.name }))]}
                                placeholder="All Salespersons"
                                searchable
                            />

                            <AppDropdown
                                value={filters.posTerminalId}
                                onChange={(v) => setFilters((prev) => ({ ...prev, posTerminalId: v }))}
                                options={[{ value: '', label: 'All Terminals' }, ...terminalOptions.map((t) => ({ value: t.id, label: t.name }))]}
                                placeholder="All Terminals"
                                searchable
                            />

                            <input
                                type="date"
                                value={filters.dateFrom}
                                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                                className="h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-200 outline-none"
                            />

                            <input
                                type="date"
                                value={filters.dateTo}
                                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                                className="h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-200 outline-none"
                            />

                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Min Amount"
                                value={filters.minAmount}
                                onChange={(e) => setFilters((prev) => ({ ...prev, minAmount: e.target.value }))}
                                className="h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-200 outline-none"
                            />

                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Max Amount"
                                value={filters.maxAmount}
                                onChange={(e) => setFilters((prev) => ({ ...prev, maxAmount: e.target.value }))}
                                className="h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-200 outline-none"
                            />
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                onClick={applyFilters}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                            >
                                Apply Filters
                            </button>
                            <button
                                onClick={resetFilters}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-6 py-4 text-left">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="text-gray-400 hover:text-blue-600 transition-colors"
                                    >
                                        {selectedIds.length === filteredInvoices?.length && filteredInvoices?.length > 0 ? (
                                            <CheckSquare size={20} className="text-blue-600" />
                                        ) : (
                                            <Square size={20} />
                                        )}
                                    </button>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Invoice #</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Warehouse</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Date & Time</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Salesperson</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredInvoices?.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic">
                                        No unposted invoices found
                                    </td>
                                </tr>
                            ) : (
                                filteredInvoices.map((inv: any) => (
                                    <tr key={inv.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(inv.id) ? 'bg-blue-50/50' : ''}`} onClick={() => toggleSelect(inv.id)}>
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => toggleSelect(inv.id)}
                                                className="transition-colors"
                                            >
                                                {selectedIds.includes(inv.id) ? (
                                                    <CheckSquare size={20} className="text-blue-600" />
                                                ) : (
                                                    <Square size={20} className="text-gray-300" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-gray-900">{inv.invoiceNo}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                                                    {inv.customer?.name?.[0] || 'C'}
                                                </div>
                                                <span className="text-sm font-medium text-gray-700 truncate max-w-[120px]">{inv.customer?.name || 'Walk-in Customer'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-700">{inv.branch?.name}</span>
                                                <span className="text-[10px] text-gray-400 uppercase font-mono">{inv.branch?.code}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-700">{format(new Date(inv.createdAt), 'MMM dd, yyyy')}</span>
                                                <span className="text-xs text-gray-400">{format(new Date(inv.createdAt), 'HH:mm:ss')}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600">
                                                    {inv.createdBy?.name?.[0] || 'U'}
                                                </div>
                                                <span className="text-sm text-gray-600 font-medium">{inv.createdBy?.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-black text-gray-900">{inv.grandTotal.toLocaleString()} SAR</span>
                                        </td>
                                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => setViewingInvoice(inv)}
                                                className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-blue-600 transition-all border border-transparent hover:border-blue-100"
                                            >
                                                <Eye size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Invoice Detail Modal */}
            <DocumentPreviewModal
                isOpen={!!viewingInvoice}
                onClose={() => setViewingInvoice(null)}
                title="Invoice Details"
                documentNo={viewingInvoice?.invoiceNo}
                document={viewingInvoice}
                currency="SAR"
                customerDisplay={viewingInvoice ? {
                    title: getSalesCustomerDisplay(viewingInvoice).title,
                    detail: getSalesCustomerDisplay(viewingInvoice).isWalkInLoyalty
                        ? getSalesCustomerDisplay(viewingInvoice).detail
                        : (viewingInvoice.customer?.phone || viewingInvoice.loyaltyCustomer?.phone || 'No Phone')
                } : undefined}
                metaDetails={[
                    { label: 'Warehouse / Branch', value: <div className="flex items-center gap-2 text-gray-700"><MapPin size={14} className="text-blue-500" /><span>{viewingInvoice?.branch?.name} ({viewingInvoice?.branch?.code})</span></div> },
                    { label: 'Salesperson', value: <div className="flex items-center gap-2 text-gray-700"><User size={14} className="text-blue-500" /><span>{viewingInvoice?.createdBy?.name}</span></div> },
                    { label: 'Transaction Date', value: <div className="flex items-center gap-2 text-gray-700"><Clock size={14} className="text-blue-500" /><span>{viewingInvoice ? format(new Date(viewingInvoice.createdAt), 'PPPP p') : ''}</span></div> },
                    { label: 'Payment Method', value: <div className="flex items-center gap-2 text-gray-700"><CreditCard size={14} className="text-blue-500" /><span>{viewingInvoice?.paymentMethod}</span></div> }
                ]}
                columns={[
                    {
                        key: 'description', label: 'Item Details', render: (item) => (
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                                    <ShoppingCart size={14} />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900 leading-none">{item.product?.name || 'Product'}</p>
                                    <p className="text-[10px] text-gray-400 mt-1 font-mono">{item.product?.itemCode}</p>
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'unitCode', label: 'Unit', align: 'center', render: (item) => (
                            <div className="flex flex-col items-center">
                                <span className="font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-[10px] uppercase">{item.unitCode}</span>
                                {item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit > 1 && (
                                    <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5 font-bold border border-blue-100">
                                        x{item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit}
                                    </span>
                                )}
                            </div>
                        )
                    },
                    { key: 'currentStock', label: 'Current Stock', align: 'right', render: (item) => <span className="font-medium text-gray-600">{item.currentStock?.toLocaleString() || 0}</span> },
                    { key: 'qty', label: 'Unposted Qty', align: 'right', render: (item) => <span className="font-black text-orange-600">{item.qty?.toLocaleString()}</span> },
                    {
                        key: 'status', label: 'Status', align: 'center', render: (item) => {
                            const isReady = item.currentStock >= item.qty;
                            return isReady ? (
                                <div className="flex items-center justify-center gap-1 text-emerald-600 font-bold text-[10px] uppercase">
                                    <CheckCircle2 size={12} /> Ready
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-1 text-rose-500 font-bold text-[10px] uppercase">
                                    <AlertCircle size={12} /> Shortage
                                </div>
                            );
                        }
                    }
                ]}
                items={viewingInvoice?.items || []}
                subtotal={viewingInvoice?.subtotal || 0}
                taxTotal={viewingInvoice?.taxTotal || 0}
                grandTotal={viewingInvoice?.grandTotal || 0}
                icon={<Clock size={20} />}
                footerActions={
                    <button
                        onClick={() => {
                            const hasShortage = viewingInvoice.items?.some((i: any) => i.currentStock < i.qty);
                            if (hasShortage) {
                                toast.error('Cannot post: Some items still have insufficient stock');
                                return;
                            }
                            postMutation.mutate([viewingInvoice.id]);
                            setViewingInvoice(null);
                        }}
                        disabled={viewingInvoice?.items?.some((i: any) => i.currentStock < i.qty)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:bg-gray-300 disabled:shadow-none transition-all"
                    >
                        Post Now
                    </button>
                }
            />
            {isFetching && <AppLoader />}
        </div>
    );
}
