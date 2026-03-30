import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import Pagination from '../../components/ui/Pagination';
import AppDropdown from '../../components/ui/AppDropdown';

export default function SalesReturn() {
    const queryClient = useQueryClient();
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [returnsPage, setReturnsPage] = useState(1);
    const [returnsLimit, setReturnsLimit] = useState(8);
    const [returnsSearch, setReturnsSearch] = useState('');

    const { data: invoiceData, isLoading: invoiceLoading } = useQuery({
        queryKey: ['sales-return', 'invoices', invoiceSearch],
        queryFn: () => api.get('/sales/invoices', { params: { page: 1, limit: 50, search: invoiceSearch.trim() || undefined } }).then((r) => r.data),
    });

    const { data: candidates, isLoading: candidatesLoading, refetch: refetchCandidates, isFetching: candidatesFetching, error: candidatesError } = useQuery<any>({
        queryKey: ['sales-return-candidates', selectedInvoiceId],
        queryFn: () => api.get(`/sales/invoices/${selectedInvoiceId}/return-candidates`).then((r) => r.data.data),
        enabled: !!selectedInvoiceId,
        retry: false,
    });

    useEffect(() => {
        if (candidatesError) {
            toast.error((candidatesError as any)?.response?.data?.error?.message || 'Failed to load return candidates');
        }
    }, [candidatesError]);

    const { data: returnsData, isLoading: returnsLoading, refetch: refetchReturns, isFetching: returnsFetching } = useQuery({
        queryKey: ['sales-returns', returnsSearch, returnsPage, returnsLimit],
        queryFn: () => api.get('/sales/returns', { params: { page: returnsPage, limit: returnsLimit, search: returnsSearch.trim() || undefined } }).then((r) => r.data),
    });

    const invoiceRows = useMemo(
        () => {
            return (invoiceData?.data || []).filter(
                (row: any) =>
                    Boolean(row?.isPosted) &&
                    row?.status !== 'VOID' &&
                    row?.status !== 'UNPOSTED'
            );
        },
        [invoiceData?.data]
    );

    useEffect(() => {
        if (!selectedInvoiceId) return;
        const stillVisible = invoiceRows.some((row: any) => String(row.id) === String(selectedInvoiceId));
        if (!stillVisible) {
            setSelectedInvoiceId('');
            setQtyByItem({});
        }
    }, [invoiceRows, selectedInvoiceId]);
    const returnRows = returnsData?.data || [];
    const returnPagination = returnsData?.meta?.pagination;

    const returnItems = useMemo(
        () =>
            (candidates?.items || [])
                .map((item: any) => ({
                    invoiceItemId: item.id,
                    qty: Number(qtyByItem[item.id] || 0),
                    maxQty: Number(item.qtyAvailable || 0),
                }))
                .filter((item: any) => item.qty > 0),
        [candidates?.items, qtyByItem]
    );

    const createReturnMut = useMutation({
        mutationFn: (payload: any) => api.post(`/sales/invoices/${selectedInvoiceId}/returns`, payload),
        onSuccess: (res) => {
            toast.success(`Sales return ${res.data?.data?.returnNo || 'posted'} created`);
            setQtyByItem({});
            setReason('');
            setNotes('');
            setSelectedInvoiceId('');
            queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
            queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
            queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
            queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to post sales return'),
    });

    const totalQty = returnItems.reduce((sum: number, line: any) => sum + line.qty, 0);

    const submit = () => {
        if (!selectedInvoiceId) return toast.error('Select an invoice');
        if (returnItems.length === 0) return toast.error('Enter at least one return quantity');
        const exceeded = returnItems.find((line: any) => line.qty > line.maxQty);
        if (exceeded) return toast.error('Return quantity cannot exceed available quantity');

        createReturnMut.mutate({
            reason: reason || undefined,
            notes: notes || undefined,
            items: returnItems.map((line: any) => ({ invoiceItemId: line.invoiceItemId, qty: line.qty })),
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales Return</h1>
                    <p className="text-sm text-gray-500">Post customer returns and auto-restock inventory</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        refetchCandidates();
                        refetchReturns();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                    <RefreshCw size={16} className={(candidatesFetching || returnsFetching) ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            <div className="space-y-6">
                {/* Return Form Section */}
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Find Invoice</label>
                            <div className="relative mt-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    value={invoiceSearch}
                                    onChange={(e) => setInvoiceSearch(e.target.value)}
                                    placeholder="Search by invoice number"
                                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Invoice</label>
                            <AppDropdown
                                value={selectedInvoiceId}
                                onChange={(v) => setSelectedInvoiceId(v)}
                                options={[{ value: '', label: 'Select invoice' }, ...invoiceRows.map((row: any) => ({ value: row.id, label: `${row.invoiceNo} - ${row.customer?.name || 'Walk-in'}` }))]}
                                placeholder='Select invoice'
                                searchable
                            />
                            {invoiceLoading && <p className="mt-1 text-xs text-gray-500">Loading invoices...</p>}
                            {!invoiceLoading && (
                                <p className="mt-1 text-xs text-gray-500">Posted invoices from your assigned branches are listed for returns.</p>
                            )}
                        </div>
                    </div>

                    {selectedInvoiceId && (
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
                            <div className="font-medium">Invoice: {candidates?.invoice?.invoiceNo || '-'}</div>
                            <div>Customer: {candidates?.invoice?.customer?.name || 'Walk-in'}</div>
                            <div>Total: {Number(candidates?.invoice?.grandTotal || 0).toLocaleString()} SAR</div>
                        </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    {['Product', 'Unit', 'Invoiced', 'Returned', 'Available', 'Return Qty'].map((head) => (
                                        <th key={head} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {!selectedInvoiceId ? (
                                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">Select invoice to load returnable items</td></tr>
                                ) : candidatesLoading ? (
                                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">Loading items...</td></tr>
                                ) : (candidates?.items || []).length === 0 ? (
                                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">No items available for return</td></tr>
                                ) : (candidates?.items || []).map((item: any) => (
                                    <tr key={item.id} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-sm text-gray-900">
                                            <div className="font-medium">{item.product?.name || '-'}</div>
                                            <div className="text-xs text-gray-500">{item.product?.itemCode || '-'}</div>
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-700">{item.unitCode}</td>
                                        <td className="px-3 py-2 text-sm text-gray-700">{Number(item.qtyInvoiced || 0)}</td>
                                        <td className="px-3 py-2 text-sm text-gray-700">{Number(item.qtyReturned || 0)}</td>
                                        <td className="px-3 py-2 text-sm font-semibold text-gray-900">{Number(item.qtyAvailable || 0)}</td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                min={0}
                                                max={Number(item.qtyAvailable || 0)}
                                                step="0.01"
                                                value={qtyByItem[item.id] ?? ''}
                                                onChange={(e) => setQtyByItem((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))}
                                                className="w-28 rounded border border-gray-200 px-2 py-1 text-sm"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Reason</label>
                            <input
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Damaged, wrong item..."
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Notes</label>
                            <input
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Total return qty: {totalQty.toFixed(2)}</span>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={createReturnMut.isPending}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {createReturnMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                            {createReturnMut.isPending ? 'Posting...' : 'Post Sales Return'}
                        </button>
                    </div>
                </div>

                {/* Recent Returns Section */}
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">Recent Returns</h2>
                        <div className="relative w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                value={returnsSearch}
                                onChange={(e) => {
                                    setReturnsSearch(e.target.value);
                                    setReturnsPage(1);
                                }}
                                placeholder="Search return/invoice/customer"
                                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                        {returnsLoading ? (
                            <p className="py-8 text-center text-sm text-gray-500">Loading...</p>
                        ) : returnRows.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-500">No sales returns found</p>
                        ) : (
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold text-gray-600">Return No</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600">Invoice / Customer</th>
                                        <th className="px-4 py-3 font-semibold text-gray-600 text-right">Total Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {returnRows.map((row: any) => (
                                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">{row.returnNo}</td>
                                            <td className="px-4 py-3 text-gray-600">{new Date(row.createdAt).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 text-gray-600">
                                                <div className="font-medium text-gray-800">Invoice: {row.invoice?.invoiceNo || '-'}</div>
                                                <div className="text-xs">{row.customer?.name || 'Walk-in'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900">
                                                {Number(row.grandTotal || 0).toLocaleString()} SAR
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {returnPagination && (
                        <div className="pt-2">
                            <Pagination
                                currentPage={returnsPage}
                                totalPages={returnPagination.totalPages}
                                totalItems={returnPagination.total}
                                itemsPerPage={returnsLimit}
                                onPageChange={setReturnsPage}
                                onItemsPerPageChange={setReturnsLimit}
                                isLoading={returnsFetching}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
