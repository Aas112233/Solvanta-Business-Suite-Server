import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from '@/lib/toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../../components/ui/AppDropdown';
import { formatCompanyDate, toDateInputValue, useCompanyRegionalSettings } from '../../lib/companySettings';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
    SALE_RECEIPT_PAYMENT_METHOD_KEYS,
} from '../../lib/globalStrings';

export default function ReceiveSalesPayment() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const regionalSettings = useCompanyRegionalSettings();

    const initialInvoiceId = searchParams.get('invoiceId') || '';
    const initialCustomerId = searchParams.get('customerId') || '';
    const initialAmount = searchParams.get('amount') || '';

    const [customerId, setCustomerId] = useState(initialCustomerId);
    const [invoiceId, setInvoiceId] = useState(initialInvoiceId);
    const [amount, setAmount] = useState(initialAmount);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [paymentDate, setPaymentDate] = useState(() => toDateInputValue(undefined, regionalSettings));
    const [referenceNo, setReferenceNo] = useState('');
    const [notes, setNotes] = useState('');
    const [prefilledInvoiceId, setPrefilledInvoiceId] = useState('');

    const { data: openInvoices, refetch: refetchOpenInvoices, isFetching: isFetchingOpenInvoices } = useQuery({
        queryKey: ['sales-payments-open-invoices-all'],
        queryFn: () => api.get('/sales/payments', {
            params: { page: 1, limit: 500, state: 'open' },
        }).then((r) => r.data.data),
    });

    const { data: invoices, refetch: refetchInvoices, isFetching: isFetchingInvoices } = useQuery({
        queryKey: ['sales-payments-open-invoices', customerId],
        queryFn: () => api.get('/sales/payments', {
            params: { page: 1, limit: 500, state: 'open', customerId: customerId || undefined },
        }).then((r) => r.data.data),
    });

    const { data: globalPaymentMethods, refetch: refetchPaymentMethods, isFetching: isFetchingPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.salePaymentMethods],
        queryFn: async () => {
            const res = await api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.salePaymentMethods}`);
            return res.data.data;
        },
    });

    const paymentMethodOptions = useMemo(
        () =>
            buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_SALE_PAYMENT_METHOD_OPTIONS, {
                blankLabel: 'Select Method',
                allowedKeys: SALE_RECEIPT_PAYMENT_METHOD_KEYS,
            }),
        [globalPaymentMethods]
    );

    const { data: paymentData, isPending: isPendingPaymentData } = useQuery({
        queryKey: ['sales-invoice-payments-summary', invoiceId],
        queryFn: () => api.get(`/sales/invoices/${invoiceId}/payments`).then((r) => r.data.data),
        enabled: !!invoiceId,
    });

    const customerOptions = useMemo(() => {
        const map = new Map<string, any>();
        for (const inv of (openInvoices || [])) {
            if (!inv?.customer?.id) continue;
            if (!map.has(inv.customer.id)) map.set(inv.customer.id, inv.customer);
        }
        const fallbackCustomer = paymentData?.invoice?.customer;
        if (fallbackCustomer?.id && !map.has(fallbackCustomer.id)) {
            map.set(fallbackCustomer.id, fallbackCustomer);
        }
        return Array.from(map.values()).sort((a: any, b: any) =>
            String(a.name || '').localeCompare(String(b.name || ''))
        );
    }, [openInvoices, paymentData]);

    useEffect(() => {
        if (!invoiceId || customerId) return;
        const matched = (openInvoices || []).find((inv: any) => String(inv.id) === String(invoiceId));
        if (matched?.customer?.id) setCustomerId(String(matched.customer.id));
    }, [invoiceId, customerId, openInvoices]);

    const outstanding = useMemo(() => Number(paymentData?.totals?.outstandingAmount || 0), [paymentData]);
    const selectedCustomer = useMemo(() => {
        if (!customerId) return null;
        return (customerOptions || []).find((c: any) => String(c.id) === String(customerId));
    }, [customerId, customerOptions]);
    const selectedInvoiceStatus = String(paymentData?.invoice?.status || '').toUpperCase();
    const cannotPostPayment = selectedInvoiceStatus === 'UNPOSTED' || selectedInvoiceStatus === 'VOID' || selectedInvoiceStatus === 'REFUNDED';
    const blockedReason = selectedInvoiceStatus === 'UNPOSTED'
        ? 'Selected invoice is UNPOSTED. Post the invoice first, then receive payment.'
        : selectedInvoiceStatus === 'VOID' || selectedInvoiceStatus === 'REFUNDED'
            ? `Cannot receive payment for ${selectedInvoiceStatus} invoice.`
            : '';
    const invoiceOptions = useMemo(() => {
        const base = Array.isArray(invoices) ? [...invoices] : [];
        if (!invoiceId || !paymentData?.invoice) return base;
        const exists = base.some((inv: any) => String(inv.id) === String(invoiceId));
        if (exists) return base;

        const fallbackOutstanding = Number(paymentData?.totals?.outstandingAmount || 0);
        if (fallbackOutstanding <= 0) return base;

        return [
            {
                id: paymentData.invoice.id,
                invoiceNo: paymentData.invoice.invoiceNo,
                customer: paymentData.invoice.customer || null,
                outstandingAmount: fallbackOutstanding,
            },
            ...base,
        ];
    }, [invoices, invoiceId, paymentData]);

    useEffect(() => {
        if (!invoiceId || !paymentData?.invoice) return;
        const invoiceCustomerId = String(paymentData.invoice.customerId || '');
        if (!customerId && invoiceCustomerId) {
            setCustomerId(invoiceCustomerId);
        }
        if ((amount === '' || prefilledInvoiceId !== invoiceId) && outstanding > 0) {
            setAmount(outstanding.toFixed(2));
            setPrefilledInvoiceId(invoiceId);
        }
    }, [paymentData, invoiceId, customerId, amount, outstanding, prefilledInvoiceId]);

    useEffect(() => {
        if (!invoiceId || !Array.isArray(invoiceOptions) || isPendingPaymentData) return;
        const exists = invoiceOptions.some((inv: any) => String(inv.id) === String(invoiceId));
        if (!exists) {
            setInvoiceId('');
            setAmount('');
            setPrefilledInvoiceId('');
        }
    }, [invoiceOptions, invoiceId, isPendingPaymentData]);

    const createMut = useMutation({
        mutationFn: (payload: any) => api.post(`/sales/invoices/${invoiceId}/payments`, payload),
        onSuccess: async () => {
            toast.success('Sales payment received');
            
            // Remove cache for sales payment lists so they fetch fresh data upon mount
            queryClient.removeQueries({ queryKey: ['sales-payments'] });
            queryClient.removeQueries({ queryKey: ['sales-payments-open-invoices-all'] });
            queryClient.removeQueries({ queryKey: ['sales-payments-open-invoices'] });
            
            // Invalidate other related queries in parallel
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['sales-payments-open-invoices-all'] }),
                queryClient.invalidateQueries({ queryKey: ['sales-payments-open-invoices'] }),
                queryClient.invalidateQueries({ queryKey: ['sales-pending-payments'] }),
                queryClient.invalidateQueries({ queryKey: ['sales-overdue-invoices'] }),
                queryClient.invalidateQueries({ queryKey: ['sales-credit-control'] }),
                queryClient.invalidateQueries({ queryKey: ['sales-invoices'] }),
                queryClient.invalidateQueries({ queryKey: ['sales-summary'] }),
                queryClient.invalidateQueries({ queryKey: ['sales-invoice-payments-summary', invoiceId] }),
            ]);
            
            navigate('/sales/payments');
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to receive payment');
        },
    });

    const submit = () => {
        if (!customerId) return toast.error('Select credit customer');
        if (!invoiceId) return toast.error('Select sales invoice');
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) return toast.error('Enter valid amount');
        if (!paymentMethod) return toast.error('Select payment method');
        if (cannotPostPayment) return toast.error(blockedReason || 'Cannot receive payment for selected invoice');

        createMut.mutate({
            amount: value,
            paymentMethod,
            paymentDate,
            referenceNo: referenceNo || undefined,
            notes: notes || undefined,
        });
    };

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Receive Sales Payment</h1>
                <button type="button" onClick={() => navigate('/sales/payments')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    Back
                </button>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium text-gray-700">Credit Customer</label>
                        <AppDropdown
                            value={customerId}
                            onChange={(v) => setCustomerId(v)}
                            options={[{ value: '', label: 'Select Customer' }, ...(customerOptions || []).map((c: any) => ({ value: c.id, label: `${c.name}${c.phone ? ` (${c.phone})` : ''}` }))]}
                            placeholder='Select Customer'
                            searchable
                            onRefresh={() => refetchOpenInvoices()}
                            refreshing={isFetchingOpenInvoices}
                            refreshLabel="Refresh customers"
                        />
                        {selectedCustomer && (
                            <div className="mt-2 flex space-x-4 text-xs font-medium">
                                <span className="text-gray-500">
                                    Credit Balance: <strong className="text-indigo-600">{(selectedCustomer.creditBalance || 0).toFixed(2)} {currency}</strong>
                                </span>
                                <span className="text-gray-500">
                                    Saving Balance: <strong className="text-emerald-600">{(selectedCustomer.savingBalance || 0).toFixed(2)} {currency}</strong>
                                </span>
                            </div>
                        )}
                        {(customerOptions || []).length === 0 && (
                            <p className="mt-1 text-xs text-amber-600">
                                No posted open credit invoices available for customer list.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Sales Invoice</label>
                        <AppDropdown
                            value={invoiceId}
                            onChange={(v) => setInvoiceId(v)}
                            options={[...(invoiceOptions || []).map((inv: any) => ({ value: inv.id, label: `${inv.invoiceNo} - ${inv.customer?.name || 'Walk-in'} (${Number(inv.outstandingAmount || 0).toFixed(2)} ${currency})` }))]}
                            placeholder='Select'
                            searchable
                            onRefresh={() => refetchInvoices()}
                            refreshing={isFetchingInvoices}
                            refreshLabel="Refresh invoices"
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
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">Outstanding: {outstanding.toFixed(2)} {currency}</p>
                        {Number(amount) > outstanding && outstanding > 0 && (
                            <div className="mt-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800 border border-blue-100 flex items-center space-x-2">
                                <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>
                                    An excess amount of <strong>{(Number(amount) - outstanding).toFixed(2)} {currency}</strong> will be saved to the customer's credit/saving balance.
                                </span>
                            </div>
                        )}
                        {cannotPostPayment && (
                            <p className="mt-1 text-xs text-rose-600">{blockedReason}</p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Payment Date</label>
                        <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Reference No</label>
                        <input
                            value={referenceNo}
                            onChange={(e) => setReferenceNo(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">Payment History</h2>
                <div className="space-y-2">
                    {(paymentData?.payments || []).length === 0 ? (
                        <p className="text-sm text-gray-500">No payment history found</p>
                    ) : (paymentData?.payments || []).map((payment: any) => (
                        <div key={payment.id} className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm">
                            <span>{payment.paymentNo} · {formatCompanyDate(payment.paymentDate, regionalSettings)} · {payment.paymentMethod}</span>
                            <span className="font-semibold">{Number(payment.amount || 0).toFixed(2)} {currency}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={submit}
                    disabled={createMut.isPending || cannotPostPayment}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                >
                    {createMut.isPending ? 'Posting...' : 'Post Payment'}
                </button>
            </div>
        </div>
    );
}
