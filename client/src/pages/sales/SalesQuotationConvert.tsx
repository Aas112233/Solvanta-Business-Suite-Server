import { useEffect, useMemo, useState } from 'react';
import { isCashType, isBankType, isCreditType, isMixedType } from \'../../lib/globalStrings\';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ArrowRight,
    X,
    FileText,
    User,
    CreditCard,
    Wallet,
    Building2,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Calendar,
    ChevronRight,
    ArrowRightLeft,
    Banknote
} from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import AppLoader from '../../components/ui/AppLoader';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
    SALE_INVOICE_PAYMENT_METHOD_KEYS,
} from '../../lib/globalStrings';

export default function SalesQuotationConvert() {
    const [searchParams] = useSearchParams();
    const quotationId = searchParams.get('id');
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const currency = useAuthStore(s => s.user?.company?.currency) || 'SAR';

    // Form State
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT' | 'BANK_TRANSFER'>('CASH');
    const [confirm, setConfirm] = useState(false);

    // Fetch Quotation
    const { data: quotation, isLoading, error } = useQuery({
        queryKey: ['sales-quotation-detail', quotationId],
        queryFn: () => api.get(`/sales/quotations/${quotationId}`).then(r => r.data.data),
        enabled: !!quotationId
    });

    const { data: globalPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.salePaymentMethods],
        queryFn: () => api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.salePaymentMethods}`).then((r) => r.data.data),
    });

    const canUseCredit = Boolean(quotation?.customer?.id && quotation?.customer?.allowCreditSales !== false);
    const paymentMethodOptions = useMemo(
        () =>
            buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_SALE_PAYMENT_METHOD_OPTIONS, {
                allowedKeys: SALE_INVOICE_PAYMENT_METHOD_KEYS,
            }).filter((option) => option.value !== 'CREDIT' || canUseCredit),
        [globalPaymentMethods, canUseCredit]
    );

    useEffect(() => {
        if (isCreditType(paymentMethod) && !canUseCredit) {
            setPaymentMethod('CASH');
        }
    }, [paymentMethod, canUseCredit]);

    const mutation = useMutation({
        mutationFn: (data: any) => api.post(`/sales/quotations/${quotationId}/convert`, data),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['sales-quotations'] });
            queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
            // Navigate to the newly created invoice
            navigate(`/sales/invoices/${res.data.data.invoiceId}`);
        }
    });

    const handleConvert = (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirm) return;
        if (isCreditType(paymentMethod) && !canUseCredit) return;
        mutation.mutate({ paymentMethod });
    };

    if (isLoading) { return <AppLoader />; }

    if (error || !quotation) {
        return (
            <div className="flex flex-col items-center justify-center py-40 text-rose-500">
                <AlertCircle size={48} className="mb-4" />
                <p className="font-black text-xl uppercase tracking-widest">Error Loading Quotation</p>
                <button onClick={() => navigate('/sales/quotations')} className="mt-8 px-6 py-2 bg-rose-500 text-white rounded-xl font-bold">Back to List</button>
            </div>
        );
    }

    if (quotation.status === 'CONVERTED') {
        return (
            <div className="flex flex-col items-center justify-center py-40 text-purple-600">
                <CheckCircle2 size={48} className="mb-4" />
                <p className="font-black text-xl uppercase tracking-widest text-gray-900 mb-2">Already Converted</p>
                <p className="text-gray-500 mb-8 font-medium">This quotation was already converted to invoice <strong>{quotation.convertedInvoiceNo}</strong></p>
                <button onClick={() => navigate('/sales/quotations')} className="px-6 py-2 bg-purple-600 text-white rounded-xl font-bold">Back to List</button>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-gray-400">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
                        <span>Quotations</span>
                        <ChevronRight size={14} />
                        <span className="text-gray-900">Conversion Wizard</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                {/* Left: Info */}
                <div className="md:col-span-3 space-y-6">
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 leading-none">Quotation Reference</p>
                                    <h2 className="text-3xl font-black text-gray-900 leading-none">{quotation.quotationNo}</h2>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Status</p>
                                    <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-black uppercase border border-amber-100 italic">Unposted</span>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">Bill To</p>
                                        <p className="font-bold text-gray-900">{quotation.customer?.name || quotation.customerName || 'Walk-in Customer'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">Validity</p>
                                        <p className="font-bold text-gray-900">
                                            {quotation.validUntil ? format(new Date(quotation.validUntil), 'dd MMMM yyyy') : 'No expiry'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-gray-50">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 italic">Quotation Summary</p>
                                <div className="space-y-2">
                                    {quotation.items.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 font-medium">
                                                <span className="text-blue-500 font-bold mr-2 uppercase">{item.qty}x</span>
                                                {item.description}
                                            </span>
                                            <span className="font-bold text-gray-700">{item.lineTotal.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <FileText size={120} className="absolute -right-8 -bottom-8 text-slate-50 -rotate-12 pointer-events-none" />
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl shadow-blue-200">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 leading-none">Net Payable</p>
                        <h3 className="text-4xl font-black text-white mb-8 tracking-tighter">
                            {quotation.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            <span className="text-sm font-bold text-slate-500 ml-1 uppercase">{currency}</span>
                        </h3>

                        <form onSubmit={handleConvert} className="space-y-6">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Payment Terms</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {paymentMethodOptions.map((option) => {
                                        const method = option.value as 'CASH' | 'CARD' | 'CREDIT' | 'BANK_TRANSFER';
                                        return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setPaymentMethod(method)}
                                            className={`p-3 rounded-2xl border text-center transition-all ${paymentMethod === method
                                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="flex flex-col items-center gap-1">
                                                {method === 'CASH' && <Banknote size={16} />}
                                                {method === 'CARD' && <CreditCard size={16} />}
                                                {method === 'CREDIT' && <Wallet size={16} />}
                                                {method === 'BANK_TRANSFER' && <Building2 size={16} />}
                                                <span className="text-[10px] font-bold uppercase tracking-tight">{option.label}</span>
                                            </div>
                                        </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-800">
                                <label className="flex items-start gap-3 cursor-pointer group mb-8">
                                    <div className="relative mt-1">
                                        <input
                                            type="checkbox"
                                            checked={confirm}
                                            onChange={(e) => setConfirm(e.target.checked)}
                                            className="peer sr-only"
                                        />
                                        <div className="w-5 h-5 border-2 border-slate-600 rounded-lg group-hover:border-blue-500 transition-all peer-checked:bg-blue-600 peer-checked:border-blue-600" />
                                        <CheckCircle2 size={12} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-all" />
                                    </div>
                                    <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                                        I confirm that this quotation is accepted by the client and ready for conversion to standard invoice
                                    </span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={!confirm || mutation.isPending}
                                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-3 overflow-hidden group"
                                >
                                    {mutation.isPending ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <>
                                            <span>Commit Conversion</span>
                                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100 flex items-start gap-4">
                        <ArrowRightLeft size={20} className="text-blue-500 shrink-0" />
                        <div>
                            <p className="text-xs font-bold text-gray-900 mb-1 leading-none uppercase tracking-wide">Financial Impact</p>
                            <p className="text-[11px] text-gray-500 font-medium">Conversion will mark this quotation as converted and generate a new unposted sales invoice. Stock will be reserved upon posting the resulting invoice.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
