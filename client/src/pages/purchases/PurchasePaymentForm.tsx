import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from '@/lib/toast';
import api from '../../lib/api';
import AppDropdown from '../../components/ui/AppDropdown';
import {
    buildPaymentMethodOptions,
    DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
    PURCHASE_SETTLEMENT_PAYMENT_METHOD_KEYS,
} from '../../lib/globalStrings';
import { formatCompanyDate, toDateInputValue, useCompanyRegionalSettings } from '../../lib/companySettings';

export default function PurchasePaymentForm() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const regionalSettings = useCompanyRegionalSettings();
    const [purchaseId, setPurchaseId] = useState(searchParams.get('purchaseId') || '');
    const [purchaseSearch, setPurchaseSearch] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [paymentDate, setPaymentDate] = useState(() => toDateInputValue(undefined, regionalSettings));
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');

    const { data: purchases, refetch: refetchPurchases, isFetching: isFetchingPurchases } = useQuery({
        queryKey: ['purchases', 'for-payment'],
        queryFn: () => api.get('/purchases', { params: { page: 1, limit: 200 } }).then((r) => r.data.data),
    });

    const { data: globalPaymentMethods, refetch: refetchPaymentMethods, isFetching: isFetchingPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.purchasePaymentMethods],
        queryFn: async () => {
            const res = await api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.purchasePaymentMethods}`);
            return res.data.data;
        },
    });

    const paymentMethodOptions = useMemo(
        () =>
            buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS, {
                blankLabel: 'Select Method',
                allowedKeys: PURCHASE_SETTLEMENT_PAYMENT_METHOD_KEYS,
            }),
        [globalPaymentMethods]
    );

    const { data: paymentData } = useQuery({
        queryKey: ['purchase-payments-summary', purchaseId],
        queryFn: () => api.get(`/purchases/${purchaseId}/payments`).then((r) => r.data.data),
        enabled: !!purchaseId,
    });

    const outstanding = useMemo(() => Number(paymentData?.totals?.outstanding || 0), [paymentData]);
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

    const createMut = useMutation({
        mutationFn: (payload: any) => api.post(`/purchases/${purchaseId}/payments`, payload),
        onSuccess: () => {
            toast.success('Purchase payment posted');
            queryClient.invalidateQueries({ queryKey: ['purchase-payments'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-payments-summary', purchaseId] });
            navigate('/purchases/payments');
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to post payment');
        },
    });

    const submit = () => {
        if (!purchaseId) return toast.error('Select purchase invoice');
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) return toast.error('Enter valid amount');
        if (value > outstanding) return toast.error('Amount exceeds outstanding balance');
        if (!paymentMethod) return toast.error('Select payment method');

        createMut.mutate({
            amount: value,
            paymentMethod,
            paymentDate,
            referenceNo: referenceNo || undefined,
            notes: notes || undefined,
        });
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Record Purchase Payment</h1>
                <button type="button" onClick={() => navigate('/purchases/payments')} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                    Back
                </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-gray-700">Purchase Invoice</label>
                        <input
                            value={purchaseSearch}
                            onChange={(e) => setPurchaseSearch(e.target.value)}
                            placeholder="Search purchase no or supplier..."
                            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
                        <label className="text-sm font-medium text-gray-700">Payment Method</label>
                        <AppDropdown
                            value={paymentMethod}
                            onChange={(v) => setPaymentMethod(v)}
                            options={paymentMethodOptions}
                            placeholder='Select Method'
                            onRefresh={() => refetchPaymentMethods()}
                            refreshing={isFetchingPaymentMethods}
                            refreshLabel="Refresh methods"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Amount</label>
                        <input
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">Outstanding: {outstanding.toFixed(2)}</p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Payment Date</label>
                        <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Reference No</label>
                        <input
                            value={referenceNo}
                            onChange={(e) => setReferenceNo(e.target.value)}
                            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Existing Payments</h2>
                <div className="space-y-2">
                    {(paymentData?.payments || []).length === 0 ? (
                        <p className="text-sm text-gray-500">No payments recorded</p>
                    ) : (paymentData?.payments || []).map((payment: any) => (
                        <div key={payment.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                            <span>{payment.paymentNo} · {formatCompanyDate(payment.paymentDate, regionalSettings)} · {payment.paymentMethod}</span>
                            <span className="font-semibold">{Number(payment.amount || 0).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={submit}
                    disabled={createMut.isPending}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                    {createMut.isPending ? 'Posting...' : 'Post Payment'}
                </button>
            </div>
        </div>
    );
}
