import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock3, Filter, History, Loader2, Search, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import ModuleRefreshButton from '@/components/ModuleRefreshButton';
import AppDropdown from '../../components/ui/AppDropdown';

export default function PurchaseControl() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const canApprove = hasPermission('purchase.create');

    const [productSearch, setProductSearch] = useState('');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [historyLimit, setHistoryLimit] = useState(80);

    const { data: productLookup, isFetching: isSearchingProduct } = useQuery({
        queryKey: ['purchase-control-products', productSearch],
        queryFn: () =>
            api.get('/products', { params: { page: 1, limit: 10, search: productSearch || undefined } }).then((r) => r.data.data),
        enabled: productSearch.trim().length >= 2,
    });

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['purchase-control-overview', selectedProductId, historyLimit],
        queryFn: () =>
            api.get('/purchases/control/overview', {
                params: {
                    productId: selectedProductId || undefined,
                    historyLimit,
                },
            }).then((r) => r.data.data),
    });

    const approveMut = useMutation({
        mutationFn: (orderId: string) => api.post(`/purchases/orders/${orderId}/approve`, { note: 'Approved from Purchase Control' }),
        onSuccess: () => {
            toast.success('Purchase order approved');
            queryClient.invalidateQueries({ queryKey: ['purchase-control-overview'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to approve order'),
    });

    const receiveMut = useMutation({
        mutationFn: (orderId: string) => api.post(`/purchases/orders/${orderId}/convert`),
        onSuccess: (res) => {
            const purchaseId = res?.data?.data?.id;
            toast.success('Purchase receipt created from PO');
            queryClient.invalidateQueries({ queryKey: ['purchase-control-overview'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            if (purchaseId) navigate(`/purchases/${purchaseId}`);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to receive order'),
    });

    const selectedProductName = useMemo(() => {
        const products = Array.isArray(productLookup) ? productLookup : [];
        return products.find((p: any) => p.id === selectedProductId)?.name || '';
    }, [productLookup, selectedProductId]);

    const summary = data?.summary || {};
    const lastPurchasePrices = data?.lastPurchasePrices || [];
    const costHistory = data?.costHistory || [];
    const approvals = data?.approvals || [];
    const pendingReceipts = data?.pendingReceipts || [];

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Purchase Control</h1>
                        <ModuleRefreshButton queryKeys={[['purchase-control-overview'], ['purchase-orders'], ['purchases']]} />
                    </div>
                    <p className="text-sm text-gray-500">Price and cost history, last purchase price, approvals, and pending receipts</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500">Cost History Rows</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{Number(summary.costHistoryCount || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500">Approvals Pending</p>
                    <p className="mt-1 text-2xl font-bold text-amber-700">{Number(summary.approvalsPending || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500">Pending Receipts</p>
                    <p className="mt-1 text-2xl font-bold text-blue-700">{Number(summary.receiptsPending || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500">Pending Value</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{Number(summary.pendingReceiptValue || 0).toLocaleString()} SAR</p>
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Filter size={16} /> Cost History Filter
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="relative">
                        <Search size={16} className={`absolute left-3 top-2.5 ${isSearchingProduct ? 'text-blue-500 animate-pulse' : 'text-gray-400'}`} />
                        <input
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Search product by name/code"
                        />
                    </div>
                    <AppDropdown
                        value={selectedProductId}
                        onChange={(v) => setSelectedProductId(v)}
                        options={[{ value: '', label: 'All Products' }, ...(productLookup || []).map((p: any) => ({ value: p.id, label: `${p.name} (${p.itemCode})` }))]}
                        placeholder='All Products'
                        searchable
                    />
                    <AppDropdown
                        value={String(historyLimit)}
                        onChange={(v) => setHistoryLimit(Number(v))}
                        options={[{ value: '50', label: '50 rows' }, { value: '80', label: '80 rows' }, { value: '150', label: '150 rows' }, { value: '500', label: '500 rows' }]}
                        placeholder='80 rows'
                    />
                </div>
                {selectedProductId && (
                    <p className="text-xs text-blue-700">Showing filtered data for: <span className="font-semibold">{selectedProductName || selectedProductId}</span></p>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <History size={16} className="text-gray-500" />
                        <h2 className="font-semibold text-gray-900">Price and Cost History</h2>
                    </div>
                    <div className="overflow-auto max-h-[420px]">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">Product</th>
                                    <th className="px-4 py-3 text-right">Qty</th>
                                    <th className="px-4 py-3 text-right">Unit Cost</th>
                                    <th className="px-4 py-3 text-left">Supplier</th>
                                    <th className="px-4 py-3 text-left">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {costHistory.length === 0 && (
                                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">No cost history found</td></tr>
                                )}
                                {costHistory.map((row: any) => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900">{row.productName}</p>
                                            <p className="text-[11px] text-gray-500">{row.itemCode} · {row.unitCode}{row.unitName ? ` (${row.unitName})` : ''}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-700">{Number(row.qty || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(row.unitCost || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-gray-700">{row.supplier?.name || '-'}</td>
                                        <td className="px-4 py-3 text-gray-500">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <Search size={16} className="text-gray-500" />
                        <h2 className="font-semibold text-gray-900">Last Purchase Price</h2>
                    </div>
                    <div className="overflow-auto max-h-[420px]">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">Product</th>
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <th className="px-4 py-3 text-right">Last Cost</th>
                                    <th className="px-4 py-3 text-left">Last Supplier</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lastPurchasePrices.length === 0 && (
                                    <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">No recent purchase pricing found</td></tr>
                                )}
                                {lastPurchasePrices.map((row: any) => (
                                    <tr key={`${row.productId}-${row.unitCode}`} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900">{row.productName}</p>
                                            <p className="text-[11px] text-gray-500">{row.itemCode}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{row.unitCode}{row.unitName ? ` (${row.unitName})` : ''}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(row.unitCost || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-gray-700">{row.supplier?.name || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-amber-600" />
                        <h2 className="font-semibold text-gray-900">Purchase Approvals</h2>
                    </div>
                    <div className="overflow-auto max-h-[420px]">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">PO</th>
                                    <th className="px-4 py-3 text-left">Supplier</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {approvals.length === 0 && (
                                    <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">No approval queue</td></tr>
                                )}
                                {approvals.map((row: any) => (
                                    <tr key={row.id}>
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-gray-900">{row.poNo}</p>
                                            <p className="text-[11px] text-gray-500">{new Date(row.createdAt).toLocaleDateString()}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{row.supplier?.name || '-'}</td>
                                        <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">{row.status}</span></td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/purchases/orders/${row.id}`)}
                                                    className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!canApprove || approveMut.isPending}
                                                    onClick={() => approveMut.mutate(row.id)}
                                                    className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    Approve
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <Truck size={16} className="text-blue-600" />
                        <h2 className="font-semibold text-gray-900">Pending Receipts</h2>
                    </div>
                    <div className="overflow-auto max-h-[420px]">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">PO</th>
                                    <th className="px-4 py-3 text-right">Pending Qty</th>
                                    <th className="px-4 py-3 text-right">Pending Value</th>
                                    <th className="px-4 py-3 text-left">ETA</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pendingReceipts.length === 0 && (
                                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">No pending receipts</td></tr>
                                )}
                                {pendingReceipts.map((row: any) => (
                                    <tr key={row.id}>
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-gray-900">{row.poNo}</p>
                                            <p className="text-[11px] text-gray-500">{row.supplier?.name || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-800">{Number(row.pendingQty || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(row.pendingValue || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            <div className="flex items-center gap-1">
                                                <Clock3 size={13} />
                                                <span>{row.expectedDate ? new Date(row.expectedDate).toLocaleDateString() : '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/purchases/orders/${row.id}`)}
                                                    className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={!canApprove || receiveMut.isPending}
                                                    onClick={() => receiveMut.mutate(row.id)}
                                                    className="px-2.5 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                                >
                                                    Receive
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {(isLoading || isFetching) && (
                <div className="fixed bottom-5 right-5 bg-white border border-gray-200 shadow-lg rounded-full px-3 py-2 flex items-center gap-2 text-xs text-gray-600">
                    <Loader2 size={14} className="animate-spin text-blue-600" />
                    Updating Purchase Control
                </div>
            )}
        </div>
    );
}
