import { useEffect, useMemo, useState } from 'react';
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
    Banknote,
    Printer,
    Download,
    Eye
} from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import { downloadPdfFromComponent, printPdfFromComponent } from '../../lib/fileExport';
import { InvoicePdfTemplate } from '../../components/sales/InvoicePdfTemplate';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
} from '../../lib/globalStrings';

export default function SalesOrderConvert() {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('id');
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const currency = useAuthStore(s => s.user?.company?.currency) || 'SAR';
    const companyName = useAuthStore(s => s.user?.company?.name) || 'SOLVANTA ERP';

    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT' | 'BANK_TRANSFER'>('CASH');
    const [confirm, setConfirm] = useState(false);
    const [newInvoiceId, setNewInvoiceId] = useState<string | null>(null);

    const { data: order, isLoading, error } = useQuery({
        queryKey: ['sales-order-detail', orderId],
        queryFn: () => api.get(`/sales/orders/${orderId}`).then(r => r.data.data),
        enabled: !!orderId && !newInvoiceId
    });

    const { data: newInvoice, isLoading: isLoadingInvoice } = useQuery({
        queryKey: ['sales-invoice-detail', newInvoiceId],
        queryFn: () => api.get(`/sales/invoices/${newInvoiceId}`).then(r => r.data.data),
        enabled: !!newInvoiceId
    });

    const { data: globalPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.salePaymentMethods],
        queryFn: () => api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.salePaymentMethods}`).then((r) => r.data.data),
    });

    const canUseCredit = Boolean(order?.customer?.id && order?.customer?.allowCreditSales !== false);
    const paymentMethodOptions = useMemo(
        () =>
            buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_SALE_PAYMENT_METHOD_OPTIONS, {
                allowedKeys: ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT'],
            }).filter((option) => option.value !== 'CREDIT' || canUseCredit),
        [globalPaymentMethods, canUseCredit]
    );

    useEffect(() => {
        if (paymentMethod === 'CREDIT' && !canUseCredit) {
            setPaymentMethod('CASH');
        }
    }, [paymentMethod, canUseCredit]);

    const mutation = useMutation({
        mutationFn: (data: any) => api.post(`/sales/orders/${orderId}/convert`, data),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
            queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
            setNewInvoiceId(res.data.data.invoiceId);
        }
    });

    const handleConvert = (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirm) return;
        if (paymentMethod === 'CREDIT' && !canUseCredit) return;
        mutation.mutate({ paymentMethod });
    };

    if (isLoading || (newInvoiceId && isLoadingInvoice)) {
        return (
            <div className="flex flex-col items-center justify-center py-40 text-gray-500">
                <Loader2 className="animate-spin mb-4" size={40} />
                <p className="font-bold text-lg">{newInvoiceId ? 'Preparing invoice...' : 'Retreiving order data...'}</p>
            </div>
        );
    }

    if (error || (!order && !newInvoiceId)) {
        return (
            <div className="flex flex-col items-center justify-center py-40 text-rose-500">
                <AlertCircle size={48} className="mb-4" />
                <p className="font-black text-xl uppercase tracking-widest">Error Loading Order</p>
                <button onClick={() => navigate('/sales/orders')} className="mt-8 px-6 py-2 bg-rose-500 text-white rounded-xl font-bold">Back to List</button>
            </div>
        );
    }

    if (newInvoice) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-500">
                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-50">
                    <CheckCircle2 size={48} />
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-2">Invoice Generated!</h2>
                <p className="text-gray-500 mb-8 font-medium">Successfully converted Order <span className="font-bold text-gray-900">{order?.orderNo}</span> to Invoice <span className="font-bold text-emerald-600 text-lg">{newInvoice.invoiceNo}</span></p>

                <div className="grid grid-cols-1 gap-4 w-full">
                    <button
                        onClick={() => navigate(`/sales/invoices/${newInvoice.id}`)}
                        className="w-full py-4 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-bold hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md"
                    >
                        <Eye size={20} /> View Invoice Details
                    </button>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => printPdfFromComponent(<InvoicePdfTemplate invoice={newInvoice} companyName={companyName} currency={currency} />)}
                            className="py-4 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-bold hover:border-gray-300 transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md"
                        >
                            <Printer size={20} /> Print
                        </button>
                        <button
                            onClick={() => downloadPdfFromComponent(`Invoice_${newInvoice.invoiceNo}`, <InvoicePdfTemplate invoice={newInvoice} companyName={companyName} currency={currency} />)}
                            className="py-4 bg-white border-2 border-gray-100 text-gray-900 rounded-2xl font-bold hover:border-gray-300 transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md"
                        >
                            <Download size={20} /> PDF
                        </button>
                    </div>
                    <button
                        onClick={() => navigate('/sales/orders')}
                        className="mt-6 text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors"
                    >
                        Back to Orders List
                    </button>
                </div>
            </div>
        );
    }

    if (order.status === 'INVOICED') {
        const invoiceNo = order.invoices?.[0]?.invoiceNo || 'Unknown';
        return (
            <div className="flex flex-col items-center justify-center py-40 text-purple-600">
                <CheckCircle2 size={48} className="mb-4" />
                <p className="font-black text-xl uppercase tracking-widest text-gray-900 mb-2">Already Invoiced</p>
                <p className="text-gray-500 mb-8 font-medium">This order was already converted to invoice <strong>{invoiceNo}</strong></p>
                <button onClick={() => navigate('/sales/orders')} className="px-6 py-2 bg-purple-600 text-white rounded-xl font-bold">Back to List</button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-gray-400">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white rounded-xl transition-all">
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
                        <span>Orders</span>
                        <ChevronRight size={14} />
                        <span className="text-gray-900">Conversion Wizard</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-8">
                                <div>
                                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 leading-none">Order Reference</p>
                                    <h2 className="text-4xl font-black text-gray-900 leading-none mb-1">{order.orderNo}</h2>
                                    <p className="text-sm font-medium text-gray-400">{format(new Date(order.date), 'dd MMMM yyyy')}</p>
                                </div>
                                <div className="text-right">
                                    <span className="inline-flex px-4 py-1.5 bg-amber-50 text-amber-600 rounded-full text-xs font-black uppercase border border-amber-100 italic tracking-wider">
                                        {order.status}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 mb-8 p-4 bg-gray-50/50 rounded-2xl border border-gray-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-gray-400 shrink-0 shadow-sm border border-gray-100">
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">Bill To</p>
                                        <p className="font-bold text-gray-900 text-lg leading-none">{order.customer?.name || order.customerName || 'Walk-in Customer'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 italic">Order Items</p>
                                <div className="overflow-hidden border border-gray-100 rounded-xl">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-gray-500 uppercase bg-gray-50/80">
                                            <tr>
                                                <th className="px-4 py-3 font-bold">Description</th>
                                                <th className="px-4 py-3 font-bold text-center">Qty</th>
                                                <th className="px-4 py-3 font-bold text-right">Price</th>
                                                <th className="px-4 py-3 font-bold text-center">Tax</th>
                                                <th className="px-4 py-3 font-bold text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 bg-white">
                                            {order.items.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3 font-bold text-gray-900">
                                                        {item.description}
                                                        {item.unitCode && <span className="block text-[10px] text-gray-400 font-normal">{item.unitCode}</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-medium text-gray-600 bg-gray-50/30">{item.qty}</td>
                                                    <td className="px-4 py-3 text-right text-gray-600">{Number(item.unitPrice).toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-center text-gray-400 text-xs">{(item.taxAmount || 0) > 0 ? Number(item.taxAmount).toFixed(2) : '-'}</td>
                                                    <td className="px-4 py-3 text-right font-black text-gray-900 bg-gray-50/30">{item.lineTotal.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-gray-50/80 border-t border-gray-100">
                                            <tr>
                                                <td colSpan={4} className="px-4 py-3 text-right font-bold text-gray-500">Total</td>
                                                <td className="px-4 py-3 text-right font-black text-gray-900 border-l border-gray-200">{order.subtotal.toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">{currency}</span></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-200/50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 leading-none">Net Payable</p>
                            <h3 className="text-5xl font-black text-white mb-10 tracking-tighter">
                                {order.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                <span className="text-lg font-bold text-slate-500 ml-2 uppercase">{currency}</span>
                            </h3>

                            <form onSubmit={handleConvert} className="space-y-8">
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
                                                className={`p-4 rounded-2xl border text-center transition-all duration-300 ${paymentMethod === method
                                                    ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-900/20 scale-[1.02]'
                                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:border-slate-600'
                                                    }`}
                                            >
                                                <div className="flex flex-col items-center gap-2">
                                                    {method === 'CASH' && <Banknote size={20} />}
                                                    {method === 'CARD' && <CreditCard size={20} />}
                                                    {method === 'CREDIT' && <Wallet size={20} />}
                                                    {method === 'BANK_TRANSFER' && <Building2 size={20} />}
                                                    <span className="text-[10px] font-black uppercase tracking-tight">{option.label}</span>
                                                </div>
                                            </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-slate-800/50">
                                    <label className="flex items-start gap-4 cursor-pointer group mb-8 select-none">
                                        <div className="relative mt-0.5">
                                            <input
                                                type="checkbox"
                                                checked={confirm}
                                                onChange={(e) => setConfirm(e.target.checked)}
                                                className="peer sr-only"
                                            />
                                            <div className="w-6 h-6 border-2 border-slate-600 rounded-xl group-hover:border-blue-500 transition-all peer-checked:bg-blue-600 peer-checked:border-blue-600 shadow-inner bg-slate-800/50" />
                                            <CheckCircle2 size={14} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-all transform scale-50 peer-checked:scale-105" />
                                        </div>
                                        <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors leading-relaxed">
                                            I confirm order fulfillment and invoice generation. This action cannot be undone.
                                        </span>
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={!confirm || mutation.isPending}
                                        className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-blue-900/50 hover:shadow-blue-900/80 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none flex items-center justify-center gap-3 overflow-hidden group"
                                    >
                                        {mutation.isPending ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : (
                                            <>
                                                <span>Generate Invoice</span>
                                                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="bg-blue-50/50 rounded-[2rem] p-8 border border-blue-100 flex items-start gap-5 backdrop-blur-sm">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                            <ArrowRightLeft size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-900 mb-2 leading-none uppercase tracking-wide">Financial Impact</p>
                            <p className="text-xs text-gray-500 font-medium leading-relaxed">This will lock the order and generate a formal invoice. Revenue will be recognized and stock will be deducted if applicable.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
