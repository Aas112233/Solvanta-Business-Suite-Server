import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Calendar, FileText, MapPin,
    User, Package, DollarSign, Loader2,
    CheckCircle2, Clock, Printer, ShoppingBag, ArrowRight
} from 'lucide-react';
import api from '@/lib/api';
import toast from '@/lib/toast';
import { printPdfFromComponent } from '@/lib/fileExport';
import { PurchaseOrderPdf } from '@/components/purchases/PurchaseOrderPdf';
import { useAuthStore } from '@/stores/authStore';
import { formatCompanyDate, useCompanyCurrency } from '@/lib/companySettings';

export default function PurchaseOrderDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const user = useAuthStore((s: any) => s.user);
    const currency = useCompanyCurrency();

    const { data: order, isLoading } = useQuery({
        queryKey: ['purchase-orders', id],
        queryFn: () => api.get(`/purchases/orders/${id}`).then(r => r.data.data)
    });

    const convertMut = useMutation({
        mutationFn: () => api.post(`/purchases/orders/${id}/convert`),
        onSuccess: (res) => {
            toast.success('Converted to Purchase Invoice successfully');
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            navigate(`/purchases/${res.data.data.id}`);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Conversion failed')
    });

    if (isLoading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-blue-600">
            <Loader2 size={48} className="animate-spin mb-4" />
            <span className="font-bold animate-pulse">Loading order details...</span>
        </div>
    );

    if (!order) return <div className="text-center py-12 text-gray-500">Purchase Order not found</div>;

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700';
            case 'PENDING': return 'bg-yellow-100 text-yellow-700';
            case 'ORDERED': return 'bg-blue-100 text-blue-700';
            case 'RECEIVED': return 'bg-green-100 text-green-700';
            case 'CANCELLED': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const handlePrint = async () => {
        if (!order) return;
        await printPdfFromComponent(
            <PurchaseOrderPdf
                order={order}
                companyName={user?.company?.name || 'Company'}
                currency={currency}
            />
        );
    };

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-[1200px] mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/purchases/orders')} className="p-2 hover:bg-gray-100 rounded-full transition-colors bg-white border">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-gray-900">{order.poNo}</h1>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>
                                {order.status}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                            Created on {formatCompanyDate(order.createdAt, user?.company)} by {order.createdBy?.name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-bold text-gray-700 transition-all shadow-sm"
                    >
                        <Printer size={18} /> Print PO
                    </button>
                    {order.status !== 'RECEIVED' && order.status !== 'CANCELLED' && (
                        <button
                            onClick={() => convertMut.mutate()}
                            disabled={convertMut.isPending}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-all shadow-lg shadow-blue-200"
                        >
                            {convertMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <ShoppingBag size={18} />}
                            Convert to Invoice
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Items & Details */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Items Table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
                            <Package size={18} className="text-blue-500" />
                            <h3 className="font-bold text-gray-900 uppercase tracking-tighter">Order Line Items</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-3">Item Description</th>
                                        <th className="px-6 py-3 text-right">Quantity</th>
                                        <th className="px-6 py-3 text-right">Unit Cost</th>
                                        <th className="px-6 py-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {order.items.map((item: any) => (
                                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{item.product?.name}</div>
                                                <div className="text-[10px] text-gray-500 font-bold mt-0.5 flex items-center gap-2">
                                                    <span className="font-mono text-gray-400">{item.product?.itemCode}</span>
                                                    <span className="text-gray-300">•</span>
                                                    <span className="uppercase text-blue-600">
                                                        {item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.unitName || item.unitCode}
                                                        {item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit > 1 &&
                                                            ` (x${item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit})`
                                                        }
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-gray-700">{item.qty}</td>
                                            <td className="px-6 py-4 text-right text-gray-600 font-medium">{item.unitCost.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right font-bold text-gray-900">{item.lineTotal.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50/50">
                                    <tr>
                                        <td colSpan={3} className="px-6 py-3 text-right text-sm font-bold text-gray-500 uppercase tracking-tighter">Subtotal</td>
                                        <td className="px-6 py-3 text-right font-bold text-gray-900">{order.subtotal.toLocaleString()}</td>
                                    </tr>
                                    <tr>
                                        <td colSpan={3} className="px-6 py-3 text-right text-sm font-bold text-gray-500 uppercase tracking-tighter">Tax (15%)</td>
                                        <td className="px-6 py-3 text-right font-bold text-gray-900">{order.taxTotal.toLocaleString()}</td>
                                    </tr>
                                    <tr className="border-t border-gray-200">
                                        <td colSpan={3} className="px-6 py-4 text-right text-base font-black text-gray-900 uppercase tracking-tighter">Grand Total</td>
                                        <td className="px-6 py-4 text-right text-xl font-black text-blue-600">{order.grandTotal.toLocaleString()} <span className="text-xs font-normal">SAR</span></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <FileText size={16} /> Internal Notes
                        </h3>
                        <p className="text-gray-700 text-sm whitespace-pre-wrap italic">
                            {order.notes || "No notes provided for this order."}
                        </p>
                    </div>
                </div>

                {/* Right Side: Header Info */}
                <div className="space-y-6">
                    {/* Supplier Card */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><User size={24} /></div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest leading-none">Supplier</h3>
                                <p className="text-lg font-black text-gray-900 mt-1">{order.supplier?.name}</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-sm">
                                <FileText size={16} className="text-gray-400" />
                                <span className="text-gray-500">Code:</span>
                                <span className="font-bold text-gray-900 ml-auto">{order.supplier?.supplierCode}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <MapPin size={16} className="text-gray-400" />
                                <span className="text-gray-500">Branch:</span>
                                <span className="font-bold text-gray-900 ml-auto">{order.branch?.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Calendar size={16} className="text-gray-400" />
                                <span className="text-gray-500">Order Date:</span>
                                <span className="font-bold text-gray-900 ml-auto">{formatCompanyDate(order.date, user?.company)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Clock size={16} className="text-gray-400" />
                                <span className="text-gray-500">Expected:</span>
                                <span className="font-bold text-orange-600 ml-auto leading-none">
                                    {order.expectedDate ? formatCompanyDate(order.expectedDate, user?.company) : 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Related Invoices */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Related Invoices</h3>
                        {order.invoices?.length > 0 ? (
                            <div className="space-y-3">
                                {order.invoices.map((inv: any) => (
                                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-blue-50/50 cursor-pointer transition-all border border-transparent hover:border-blue-100 group" onClick={() => navigate(`/purchases/${inv.id}`)}>
                                        <div>
                                            <p className="text-xs font-black text-gray-900 leading-none group-hover:text-blue-700">{inv.purchaseNo}</p>
                                            <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">{inv.status}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-black text-gray-900">{inv.grandTotal.toLocaleString()}</p>
                                            <ArrowRight size={14} className="text-gray-300 group-hover:text-blue-500 mt-1 inline" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">No invoices created yet.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
