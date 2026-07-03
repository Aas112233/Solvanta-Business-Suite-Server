import { format } from 'date-fns';
import { Building2, User, Printer, Download, X } from 'lucide-react';
import { getSalesCustomerDisplay, getSalesInvoiceDiscountBreakdown } from '../../lib/salesCustomerDisplay';
import { DEFAULT_CURRENCY } from '../../lib/constants';
import Modal from '../ui/Modal';

interface InvoicePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    currency?: string;
    onPrint: (invoice: any) => void;
    onDownload: (invoice: any) => void;
}

export default function InvoicePreviewModal({
    isOpen,
    onClose,
    invoice,
    currency = DEFAULT_CURRENCY,
    onPrint,
    onDownload
}: InvoicePreviewModalProps) {
    if (!invoice) return null;

    const customerDisplay = getSalesCustomerDisplay(invoice);
    const discountBreakdown = getSalesInvoiceDiscountBreakdown(invoice);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md">
                        <Building2 size={20} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 leading-none">Invoice Details</h3>
                        <p className="text-gray-400 font-mono text-xs mt-1">#{invoice.invoiceNo}</p>
                    </div>
                </div>
            }
            maxWidth="4xl"
        >
            <div className="flex flex-col h-[80vh] md:h-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50/50 border-b border-gray-100 flex-shrink-0">
                    <div className="space-y-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Customer Info</h4>
                        <div className="space-y-2">
                            <p className="text-lg font-black text-gray-900">{customerDisplay.title}</p>
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                                <User size={14} />
                                {customerDisplay.isWalkInLoyalty
                                    ? customerDisplay.detail
                                    : (invoice.customer?.phone || invoice.loyaltyCustomer?.phone || 'No Phone')}
                            </p>
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                                <Building2 size={14} /> {invoice.branch?.name} ({invoice.branch?.code})
                            </p>
                        </div>
                    </div>
                    <div className="space-y-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Transaction Info</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">Date & Time</p>
                                <p className="text-sm font-bold text-gray-900">{format(new Date(invoice.createdAt), 'MMM dd, yyyy HH:mm')}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">Payment Method</p>
                                <p className="text-sm font-bold text-gray-900">{invoice.paymentMethod}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">Salesperson</p>
                                <p className="text-sm font-bold text-gray-900">{invoice.createdBy?.name}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">Status</p>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                                    invoice.status === 'UNPOSTED' ? 'bg-orange-100 text-orange-700' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                    {invoice.status}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white shadow-sm z-10">
                            <tr className="text-gray-400 font-black uppercase text-[10px] tracking-widest border-b border-gray-100">
                                <th className="pb-3 pt-2 text-left w-[45%]">Item Desc</th>
                                <th className="pb-3 pt-2 text-center w-[20%]">Unit</th>
                                <th className="pb-3 pt-2 text-right w-[15%]">Price</th>
                                <th className="pb-3 pt-2 text-center w-[10%]">Qty</th>
                                <th className="pb-3 pt-2 text-right w-[10%]">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {invoice.items?.map((item: any, idx: number) => (
                                <tr key={idx} className="group">
                                    <td className="py-3 font-bold text-gray-900">
                                        {item.product?.name}
                                        <p className="text-[10px] font-mono text-gray-400 mt-1 uppercase">{item.product?.itemCode}</p>
                                    </td>
                                    <td className="py-3 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className="font-bold text-gray-900">
                                                {item.unitName || item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.unitName || '-'}
                                            </span>
                                            <span className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[10px] font-bold uppercase whitespace-normal break-all text-center max-w-[130px] leading-tight mt-1">
                                                {item.unitCode}
                                            </span>
                                            {item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit > 1 && (
                                                <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5 font-bold border border-blue-100">
                                                    x{item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 text-right font-medium text-gray-600">{Number(item.unitPrice).toLocaleString()}</td>
                                    <td className="py-3 text-center font-black text-gray-900">{item.qty}</td>
                                    <td className="py-3 text-right font-black text-gray-900">{Number(item.lineTotal).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => onPrint(invoice)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-black text-gray-600 hover:bg-gray-100 transition-all shadow-sm"
                        >
                            <Printer size={16} />
                            Print
                        </button>
                        <button
                            onClick={() => onDownload(invoice)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-black text-gray-600 hover:bg-gray-100 transition-all shadow-sm"
                        >
                            <Download size={16} />
                            Download
                        </button>
                    </div>
                    <div className="text-right w-full sm:w-auto">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Grand Total</p>
                        <p className="text-3xl font-black text-blue-600">{Number(invoice.grandTotal).toLocaleString()} <span className="text-base">SAR</span></p>
                        {discountBreakdown.standardDiscount > 0 && (
                            <p className="text-xs font-bold text-orange-600 mt-1">Discount: -{discountBreakdown.standardDiscount.toFixed(2)} {currency}</p>
                        )}
                        {discountBreakdown.loyaltyDiscount > 0 && (
                            <p className="text-xs font-bold text-pink-600 mt-1">Loyalty Discount: -{discountBreakdown.loyaltyDiscount.toFixed(2)} {currency}</p>
                        )}
                        {discountBreakdown.totalDiscount > 0 && (
                            <p className="text-xs font-bold text-rose-700 mt-1">Total Discount: -{discountBreakdown.totalDiscount.toFixed(2)} {currency}</p>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
