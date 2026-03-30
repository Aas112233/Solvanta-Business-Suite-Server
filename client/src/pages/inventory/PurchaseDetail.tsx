import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Package, User, Building, Calendar, DollarSign, ReceiptText, Pencil } from 'lucide-react';
import api from '../../lib/api';
import AppLoader from '../../components/ui/AppLoader';

export default function PurchaseDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    const { data: purchase, isLoading, isError } = useQuery({
        queryKey: ['purchase', id],
        queryFn: () => api.get(`/purchases/${id}`).then((r: any) => {
            // Need accurate product unit info which might be nested in product
            // Ensure backend returns deep product info or fetch it.
            // Current /purchases/:id usually includes items.product 
            return r.data.data;
        })
    });

    const { data: paymentData } = useQuery({
        queryKey: ['purchase-payments-summary', id],
        queryFn: () => api.get(`/purchases/${id}/payments`).then((r: any) => r.data.data),
        enabled: !!id,
    });

    if (isLoading) return <AppLoader />;
    if (isError || !purchase) return <div className="p-8 text-center text-red-500 font-bold">Purchase record not found</div>;

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/purchases/invoices')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900">{purchase.purchaseNo}</h1>
                        <p className="text-xs text-gray-400 font-medium tracking-tight">Ref: {purchase.invoiceNoSupplier || 'None'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-50 text-green-700 border border-green-100">
                        {purchase.status}
                    </span>
                    {purchase.status !== 'CANCELLED' && (
                        <button
                            onClick={() => navigate(`/purchases/${purchase.id}/edit`)}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-bold text-gray-600"
                        >
                            <Pencil size={16} /> Edit
                        </button>
                    )}
                    <button
                        onClick={() => navigate(`/purchases/payments/new?purchaseId=${purchase.id}`)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-bold text-gray-600"
                    >
                        Record Payment
                    </button>
                    <button
                        onClick={() => navigate(`/purchases/returns/new?purchaseId=${purchase.id}`)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-bold text-gray-600"
                    >
                        Create Return
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-bold text-gray-600">
                        <Printer size={16} /> Print
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg w-fit mb-4"><Building size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Supplier</p>
                    <p className="font-black text-gray-900">{purchase.supplier?.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{purchase.supplier?.supplierCode}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg w-fit mb-4"><Building size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Target Warehouse</p>
                    <p className="font-black text-gray-900">{purchase.branch?.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{purchase.branch?.code}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg w-fit mb-4"><Calendar size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Recorded On</p>
                    <p className="font-black text-gray-900">{new Date(purchase.createdAt).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(purchase.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg w-fit mb-4"><User size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Created By</p>
                    <p className="font-black text-gray-900">{purchase.createdBy?.name}</p>
                    <p className="text-xs text-gray-500 mt-1">Authorized Official</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg w-fit mb-4"><DollarSign size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Bill</p>
                    <p className="font-black text-gray-900 text-lg">{purchase.grandTotal.toLocaleString()} SAR</p>
                    <p className="text-xs text-green-600 font-bold mt-1">
                        Paid {Number(paymentData?.totals?.paid || 0).toFixed(2)} · Outstanding {Number(paymentData?.totals?.outstanding || purchase.grandTotal).toFixed(2)}
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden min-h-[400px]">
                <div className="px-6 py-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-100"><Package size={20} className="text-blue-600" /></div>
                        <h3 className="font-black text-gray-900 uppercase tracking-tight">Invoice Line Items</h3>
                    </div>
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-bold tracking-tighter">
                        {purchase.items?.length || 0} Products
                    </span>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-white border-b border-gray-100">
                        <tr>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Product Description</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Unit</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Quantity</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Unit Cost</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">VAT (15%)</th>
                            <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {purchase.items?.map((item: any) => (
                            <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                                <td className="py-5 px-6">
                                    <Link to={`/items/${item.product?.id}`} className="text-sm font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-tighter hover:underline decoration-blue-200 underline-offset-4">
                                        {item.product?.name}
                                    </Link>
                                    <div className="text-[10px] text-gray-400 font-bold mt-0.5">{item.product?.itemCode}</div>
                                </td>
                                <td className="py-5 px-6 text-[10px] font-black text-gray-500 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="uppercase font-bold">{item.unitCode}</span>
                                        {item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit > 1 && (
                                            <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5 font-bold border border-blue-100">
                                                x{item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-5 px-6 text-sm font-black text-right text-gray-900">{item.qty}</td>
                                <td className="py-5 px-6 text-sm font-medium text-right text-gray-400">{item.unitCost.toLocaleString()}</td>
                                <td className="py-5 px-6 text-sm font-medium text-right text-red-400">{item.taxAmount.toLocaleString()}</td>
                                <td className="py-5 px-6 text-sm font-black text-right text-gray-900">{(item.qty * item.unitCost).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-50/80 border-t-2 border-gray-100">
                        <tr>
                            <td colSpan={5} className="py-4 px-6 text-right text-sm font-bold text-gray-500">Subtotal</td>
                            <td className="py-4 px-6 text-right text-sm font-black text-gray-900 font-mono">{purchase.subtotal.toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td colSpan={5} className="py-4 px-6 text-right text-sm font-bold text-gray-500">VAT (15%)</td>
                            <td className="py-4 px-6 text-right text-sm font-black text-red-600 font-mono">{purchase.taxTotal.toLocaleString()}</td>
                        </tr>
                        <tr className="bg-blue-600 text-white">
                            <td colSpan={5} className="py-6 px-6 text-right text-lg font-black uppercase tracking-widest">Grand Total</td>
                            <td className="py-6 px-6 text-right text-2xl font-black font-mono tracking-tighter">{purchase.grandTotal.toLocaleString()} SAR</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {purchase.notes && (
                <div className="bg-yellow-50 border border-yellow-100 p-6 rounded-3xl flex gap-4 shadow-sm">
                    <ReceiptText size={24} className="text-yellow-600 flex-shrink-0" />
                    <div>
                        <p className="text-[10px] font-black text-yellow-800 uppercase tracking-widest mb-1 font-sans">Administrative Notes</p>
                        <p className="text-yellow-700 text-sm font-medium italic">"{purchase.notes}"</p>
                    </div>
                </div>
            )}
        </div>
    );
}

