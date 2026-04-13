import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import AppLoader from '../../components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';

function toInputDate(value?: string | null): string {
    if (!value) return new Date().toLocaleDateString('en-CA');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('en-CA');
    return date.toLocaleDateString('en-CA');
}

export default function PurchaseReturnForm() {
    const navigate = useNavigate();
    const { id: returnId } = useParams();
    const isEdit = Boolean(returnId);
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const [purchaseId, setPurchaseId] = useState(isEdit ? '' : (searchParams.get('purchaseId') || ''));
    const [purchaseSearch, setPurchaseSearch] = useState('');
    const [notes, setNotes] = useState('');
    const [reason, setReason] = useState('');
    const [returnDate, setReturnDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
    const [isPrefilled, setIsPrefilled] = useState(false);
    const [returnAsBaseUnit, setReturnAsBaseUnit] = useState(false);

    const { data: existingReturn, isLoading: existingLoading, isError: existingError } = useQuery({
        queryKey: ['purchase-return', returnId],
        queryFn: () => api.get(`/purchases/returns/${returnId}`).then((r) => r.data.data),
        enabled: isEdit && !!returnId,
    });

    const { data: purchases, refetch: refetchPurchases, isFetching: isFetchingPurchases } = useQuery({
        queryKey: ['purchases', 'for-return'],
        queryFn: () => api.get('/purchases', { params: { page: 1, limit: 200 } }).then((r) => r.data.data),
    });

    const { data: candidates, isLoading: itemsLoading } = useQuery({
        queryKey: ['purchase-return-candidates', purchaseId, returnId],
        queryFn: () => api.get(`/purchases/${purchaseId}/return-candidates`, {
            params: isEdit && returnId ? { returnId } : undefined
        }).then((r) => r.data.data),
        enabled: !!purchaseId && (!isEdit || isPrefilled),
    });

    useEffect(() => {
        if (!isEdit) return;
        if (!existingReturn) return;
        if (isPrefilled) return;

        setPurchaseId(existingReturn.purchaseInvoice?.id || '');
        setReason(existingReturn.reason || '');
        setNotes(existingReturn.notes || '');
        setReturnDate(toInputDate(existingReturn.createdAt));

        const mappedQty: Record<string, number> = {};
        for (const line of existingReturn.items || []) {
            if (!line.purchaseItemId) continue;
            mappedQty[line.purchaseItemId] = Number(line.qty || 0);
        }
        setQtyByItem(mappedQty);
        setIsPrefilled(true);
    }, [isEdit, existingReturn, isPrefilled]);

    const saveMut = useMutation({
        mutationFn: (payload: any) => {
            if (isEdit && returnId) {
                return api.put(`/purchases/returns/${returnId}`, payload);
            }
            return api.post(`/purchases/${purchaseId}/returns`, payload);
        },
        onSuccess: (res) => {
            toast.success(isEdit ? 'Purchase return updated' : 'Purchase return posted');
            queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
            if (isEdit && returnId) {
                queryClient.invalidateQueries({ queryKey: ['purchase-return', returnId] });
            }
            const targetId = res?.data?.data?.id || returnId;
            navigate(`/purchases/returns/${targetId}`);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || (isEdit ? 'Failed to update purchase return' : 'Failed to create purchase return'));
        },
    });

    const returnItems = useMemo<Array<{ purchaseItemId: string; qty: number; maxQty: number; factor: number }>>(() => {
        const rows = (candidates?.items || [])
            .map((item: any) => {
                const unitMeta = item.product?.units?.find((u: any) =>
                    String(u.unitCode) === String(item.unitCode) ||
                    String(u.barcode || '') === String(item.unitCode)
                );
                return {
                    purchaseItemId: item.id,
                    qty: Number(qtyByItem[item.id] || 0),
                    maxQty: Number(item.qtyAvailable || 0),
                    factor: unitMeta?.qtyInBaseUnit || 1,
                };
            })
            .filter((item: { qty: number }) => item.qty > 0);
        return rows;
    }, [candidates?.items, qtyByItem]);

    const totalQtyDisplay = returnItems.reduce((sum: number, i) => sum + (returnAsBaseUnit ? i.qty * i.factor : i.qty), 0);
    const totals = useMemo(() => {
        const sourceMap = new Map<string, any>((candidates?.items || []).map((item: any) => [item.id, item]));
        let subtotal = 0;
        let taxTotal = 0;
        for (const line of returnItems) {
            const src = sourceMap.get(line.purchaseItemId);
            if (!src) continue;
            const purchasedQty = Number(src.qtyPurchased || 0);
            const unitLine = purchasedQty > 0 ? Number(src.lineTotal || 0) / purchasedQty : 0;
            const unitTax = purchasedQty > 0 ? Number(src.taxAmount || 0) / purchasedQty : 0;
            subtotal += unitLine * Number(line.qty || 0);
            taxTotal += unitTax * Number(line.qty || 0);
        }
        return {
            subtotal,
            taxTotal,
            grandTotal: subtotal + taxTotal,
        };
    }, [candidates?.items, returnItems]);

    const filteredPurchases = useMemo(() => {
        const rows = purchases || [];
        const key = purchaseSearch.trim().toLowerCase();
        if (!key) return rows;
        return rows.filter((p: any) =>
            String(p.purchaseNo || '').toLowerCase().includes(key) ||
            String(p.supplier?.name || '').toLowerCase().includes(key) ||
            String(p.supplier?.supplierCode || '').toLowerCase().includes(key)
        );
    }, [purchases, purchaseSearch]);
    const purchaseMeta = candidates?.purchase || null;
    const selectedPurchaseRow = (purchases || []).find((p: any) => p.id === purchaseId);

    const submit = () => {
        if (!purchaseId) return toast.error('Select purchase invoice');
        if (returnItems.length === 0) return toast.error('Enter at least one item quantity');
        const exceeds = returnItems.find((line: { qty: number; maxQty: number }) => line.qty > line.maxQty);
        if (exceeds) return toast.error('One or more lines exceed available quantity');
        saveMut.mutate({
            reason: reason || undefined,
            notes: notes || undefined,
            returnDate,
            items: returnItems.map(({ purchaseItemId, qty }: { purchaseItemId: string; qty: number }) => ({ purchaseItemId, qty })),
        });
    };

    if (isEdit && existingLoading) {
        return <AppLoader />;
    }
    if (isEdit && existingError) {
        return <div className="py-10 text-center text-sm text-red-600">Unable to load purchase return</div>;
    }

    return (
        <div className="space-y-6 w-full max-w-[1500px] mx-auto">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Purchase Return' : 'New Purchase Return'}</h1>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            checked={returnAsBaseUnit}
                            onChange={(e) => setReturnAsBaseUnit(e.target.checked)}
                        />
                        <span className="text-sm font-medium text-gray-700">Return as Base Unit</span>
                    </label>
                    <button type="button" onClick={() => navigate('/purchases/returns')} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                        Back to Returns
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-4 space-y-6">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700">Purchase Invoice</label>
                                <input
                                    value={purchaseSearch}
                                    onChange={(e) => setPurchaseSearch(e.target.value)}
                                    disabled={isEdit}
                                    placeholder="Search purchase no or supplier..."
                                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
                                />
                                <AppDropdown
                                    value={purchaseId}
                                    onChange={(v) => setPurchaseId(v)}
                                    options={[{ value: '', label: 'Select Purchase' }, ...filteredPurchases.map((p: any) => ({ value: p.id, label: `${p.purchaseNo} - ${p.supplier?.name}` }))]}
                                    placeholder='Select Purchase'
                                    searchable
                                    onRefresh={() => refetchPurchases()}
                                    refreshing={isFetchingPurchases}
                                    refreshLabel="Refresh purchases"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Reason</label>
                                <input
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="Damaged, wrong item, quality issue..."
                                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700">Return Date</label>
                                <input
                                    type="date"
                                    value={returnDate}
                                    onChange={(e) => setReturnDate(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Supplier</label>
                                <input
                                    value={purchaseMeta?.supplier?.name || selectedPurchaseRow?.supplier?.name || ''}
                                    readOnly
                                    placeholder="Auto from purchase invoice"
                                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700">Return From Warehouse</label>
                                <input
                                    value={purchaseMeta?.branch ? `${purchaseMeta.branch.name}${purchaseMeta.branch.code ? ` (${purchaseMeta.branch.code})` : ''}` : ''}
                                    readOnly
                                    placeholder="Auto from purchase invoice"
                                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">Notes</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    {['Product', 'Unit', 'Purchased', 'Already Returned', 'Available', 'Return Qty'].map((h) => (
                                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {!purchaseId ? (
                                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">Select purchase invoice first</td></tr>
                                ) : itemsLoading ? (
                                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">Loading items...</td></tr>
                                ) : (candidates?.items || []).length === 0 ? (
                                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">No returnable items</td></tr>
                                ) : (candidates?.items || []).map((item: any) => {
                                    const unitMeta = item.product?.units?.find((u: any) =>
                                        String(u.unitCode) === String(item.unitCode) ||
                                        String(u.barcode || '') === String(item.unitCode)
                                    );

                                    return (
                                        <tr key={item.id} className="border-t border-gray-100">
                                            <td className="px-4 py-3 text-sm text-gray-900">
                                                <div className="font-medium text-gray-900">
                                                    {item.product?.name || '-'}
                                                </div>
                                                <div className="text-xs text-gray-500 font-mono tracking-wide mt-0.5">
                                                    {item.product?.itemCode}
                                                    {unitMeta?.qtyInBaseUnit > 1 && (
                                                        <span className="ml-2 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold">
                                                            x{unitMeta?.qtyInBaseUnit}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                <div className="font-bold text-gray-900">
                                                    {returnAsBaseUnit ? (item.product?.baseUnit?.unitName || 'Base Unit') : (unitMeta?.unitName || item.unitCode)}
                                                </div>
                                                <div className="text-xs text-gray-500 font-mono">
                                                    {returnAsBaseUnit ? (item.product?.baseUnit?.unitCode || 'BASE') : item.unitCode}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {returnAsBaseUnit ? (Number(item.qtyPurchased || 0) * (unitMeta?.qtyInBaseUnit || 1)).toLocaleString() : Number(item.qtyPurchased || 0)}
                                                {returnAsBaseUnit && <span className="ml-1 text-[10px] text-gray-500">{item.product?.baseUnit?.unitName || 'Units'}</span>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {returnAsBaseUnit ? (Number(item.qtyReturned || 0) * (unitMeta?.qtyInBaseUnit || 1)).toLocaleString() : Number(item.qtyReturned || 0)}
                                                {returnAsBaseUnit && <span className="ml-1 text-[10px] text-gray-500">{item.product?.baseUnit?.unitName || 'Units'}</span>}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                                {returnAsBaseUnit ? (Number(item.qtyAvailable || 0) * (unitMeta?.qtyInBaseUnit || 1)).toLocaleString() : Number(item.qtyAvailable || 0)}
                                                {returnAsBaseUnit && <span className="ml-1 text-[10px] text-gray-500 font-normal">{item.product?.baseUnit?.unitName || 'Units'}</span>}
                                            </td>
                                            <td className="px-4 py-3 flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={returnAsBaseUnit ? Number(item.qtyAvailable || 0) * (unitMeta?.qtyInBaseUnit || 1) : Number(item.qtyAvailable || 0)}
                                                    step={returnAsBaseUnit ? "1" : "0.01"}
                                                    value={returnAsBaseUnit
                                                        ? (qtyByItem[item.id] ? (qtyByItem[item.id] * (unitMeta?.qtyInBaseUnit || 1)).toFixed(2).replace(/\.00$/, '') : '')
                                                        : (qtyByItem[item.id] ?? '')
                                                    }
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        const parsed = raw === '' ? 0 : Number(raw);
                                                        const factor = unitMeta?.qtyInBaseUnit || 1;
                                                        const finalValue = returnAsBaseUnit ? parsed / factor : parsed;
                                                        setQtyByItem((prev) => ({ ...prev, [item.id]: Number.isFinite(finalValue) ? finalValue : 0 }));
                                                    }}
                                                    className="w-28 px-2 py-1 border border-gray-200 rounded text-sm"
                                                />
                                                {returnAsBaseUnit && <span className="text-[10px] text-gray-500">{item.product?.baseUnit?.unitName || 'Units'}</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm sticky top-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-6 font-mono uppercase tracking-tighter">Return Overview</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Selected Lines</span>
                                <span className="font-medium">{returnItems.length}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Total Return Qty</span>
                                <span className="font-medium">
                                    {totalQtyDisplay.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    {returnAsBaseUnit && <span className="ml-1 text-[10px] text-gray-500 font-normal">Base Units</span>}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-medium">{totals.subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Tax Total</span>
                                <span className="font-medium">{totals.taxTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                            </div>
                            <div className="pt-4 border-t border-dashed flex justify-between items-center">
                                <span className="font-bold text-gray-900">Grand Total</span>
                                <span className="text-xl font-black text-blue-600">{totals.grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={saveMut.isPending}
                            className="w-full mt-8 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                        >
                            {saveMut.isPending ? (isEdit ? 'Saving...' : 'Posting...') : (isEdit ? 'Save Changes' : 'Post Purchase Return')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
