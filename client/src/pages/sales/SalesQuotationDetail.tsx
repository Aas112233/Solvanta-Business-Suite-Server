import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    Printer,
    Download,
    Edit2,
    Trash2,
    FileText,
    CheckCircle,
    XCircle,
    Clock,
    Calendar,
    User,
    Building2,
    Package,
    TrendingUp,
    Copy,
    Share2,
    RefreshCw
} from 'lucide-react';
import api from '../../lib/api';
import toast from '@/lib/toast';
import AppLoader from '../../components/ui/AppLoader';
import { formatCompanyDate, formatCompanyDateTime, useCompanyCurrency, useCompanyRegionalSettings } from '../../lib/companySettings';

export default function SalesQuotationDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [showActions, setShowActions] = useState(false);
    const currency = useCompanyCurrency();
    const regionalSettings = useCompanyRegionalSettings();

    // Fetch quotation details
    const { data: quotation, isLoading, error, refetch } = useQuery({
        queryKey: ['sales-quotation-detail', id],
        queryFn: () => api.get(`/sales/quotations/${id}`).then(r => r.data.data),
        enabled: !!id
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-40">
                <AppLoader />
            </div>
        );
    }

    if (error || !quotation) {
        return (
            <div className="flex flex-col items-center justify-center py-40 text-rose-500">
                <XCircle size={64} className="mb-4" />
                <p className="font-black text-xl uppercase tracking-widest">Quotation Not Found</p>
                <button 
                    onClick={() => navigate('/sales/quotations')} 
                    className="mt-8 px-6 py-2 bg-rose-500 text-white rounded-xl font-bold"
                >
                    Back to List
                </button>
            </div>
        );
    }

    const handlePrint = () => {
        window.print();
    };

    const handleConvert = () => {
        navigate(`/sales/quotations/${id}/convert`);
    };

    const handleCopyLink = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard');
    };

    const getStatusBadge = (status: string) => {
        const badges: Record<string, string> = {
            DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
            SENT: 'bg-blue-100 text-blue-700 border-blue-200',
            ACCEPTED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            CONVERTED: 'bg-purple-100 text-purple-700 border-purple-200',
            EXPIRED: 'bg-amber-100 text-amber-700 border-amber-200',
            REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
            CANCELLED: 'bg-gray-100 text-gray-600 border-gray-300',
        };
        return badges[status] || badges.DRAFT;
    };

    const getStatusIcon = (status: string) => {
        const icons: Record<string, any> = {
            DRAFT: Clock,
            SENT: FileText,
            ACCEPTED: CheckCircle,
            CONVERTED: CheckCircle,
            EXPIRED: Clock,
            REJECTED: XCircle,
            CANCELLED: XCircle,
        };
        const Icon = icons[status] || Clock;
        return <Icon size={16} />;
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/sales/quotations')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-gray-900">{quotation.quotationNo}</h1>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusBadge(quotation.status)}`}>
                                {quotation.status}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500">Sales Quotation Details</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopyLink}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg border transition-colors"
                        title="Copy Link"
                    >
                        <Copy size={18} />
                    </button>
                    <button
                        onClick={handlePrint}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg border transition-colors"
                        title="Print"
                    >
                        <Printer size={18} />
                    </button>
                    <button
                        onClick={() => toast.success('Export feature coming soon')}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg border transition-colors"
                        title="Export"
                    >
                        <Download size={18} />
                    </button>
                    {quotation.status !== 'CONVERTED' && quotation.status !== 'CANCELLED' && (
                        <>
                            <button
                                onClick={() => navigate(`/sales/quotations/${id}/edit`)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                                title="Edit"
                            >
                                <Edit2 size={18} />
                            </button>
                            <button
                                onClick={handleConvert}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-brand text-white rounded-lg font-medium transition-all hover:opacity-90 shadow-lg shadow-brand-500/20"
                            >
                                <TrendingUp size={18} />
                                Convert to Invoice
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Quotation Details */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Quotation Information Card */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                            <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                                <FileText size={20} />
                                Quotation Information
                            </h2>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Quotation Number</p>
                                    <p className="text-lg font-bold text-gray-900">{quotation.quotationNo}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</p>
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(quotation.status)}
                                        <span className="font-semibold">{quotation.status}</span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</p>
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <Calendar size={16} />
                                        <span className="font-medium">{formatCompanyDate(quotation.date, regionalSettings)}</span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Valid Until</p>
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <Clock size={16} />
                                        <span className="font-medium">
                                            {quotation.validUntil ? formatCompanyDate(quotation.validUntil, regionalSettings) : 'No expiry'}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Created By</p>
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <User size={16} />
                                        <span className="font-medium">{quotation.createdBy?.name || 'Unknown'}</span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Branch</p>
                                    <div className="flex items-center gap-2 text-gray-700">
                                        <Building2 size={16} />
                                        <span className="font-medium">{quotation.branch?.name || 'Main Branch'}</span>
                                    </div>
                                </div>
                            </div>

                            {(quotation.notes || quotation.terms) && (
                                <div className="mt-6 pt-6 border-t border-gray-200">
                                    {quotation.notes && (
                                        <div className="mb-4">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</p>
                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quotation.notes}</p>
                                        </div>
                                    )}
                                    {quotation.terms && (
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Terms & Conditions</p>
                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quotation.terms}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Line Items Card */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 px-6 py-4 border-b border-emerald-200">
                            <h2 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                                <Package size={20} />
                                Line Items ({quotation.items?.length || 0})
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">#</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Qty</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Unit Price</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Discount</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Tax</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {quotation.items?.map((item: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 text-sm text-gray-500">{idx + 1}</td>
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-medium text-gray-900">{item.description}</p>
                                                    {item.product && (
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            {item.product.itemCode} • {item.product.name}
                                                        </p>
                                                    )}
                                                    {item.unitCode && (
                                                        <p className="text-xs text-gray-400 mt-0.5">Unit: {item.unitCode}</p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">{item.qty}</td>
                                            <td className="px-6 py-4 text-right text-sm text-gray-700">
                                                {Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm text-rose-600">
                                                {item.discount > 0 ? `-${Number(item.discount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm text-blue-600">
                                                {item.taxAmount > 0 ? `+${Number(item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                                {Number(item.lineTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right: Summary & Actions */}
                <div className="space-y-6">
                    {/* Financial Summary */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-xl">
                        <h3 className="text-sm font-bold uppercase tracking-widest mb-6 text-slate-400">Financial Summary</h3>
                        
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-300">Subtotal</span>
                                <span className="font-semibold">
                                    {Number(quotation.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-300">Discount</span>
                                <span className="font-semibold text-rose-300">
                                    -{Number(quotation.discountTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-300">Tax</span>
                                <span className="font-semibold text-blue-300">
                                    +{Number(quotation.taxTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                                </span>
                            </div>
                            <div className="border-t border-white/20 pt-4 mt-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-bold text-white">Grand Total</span>
                                    <span className="text-2xl font-black">
                                        {Number(quotation.grandTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Customer Card */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="text-sm font-bold uppercase tracking-widest mb-4 text-gray-500 flex items-center gap-2">
                            <User size={16} />
                            Customer
                        </h3>
                        {quotation.customer ? (
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase">Name</p>
                                    <p className="font-semibold text-gray-900">{quotation.customer.name}</p>
                                </div>
                                {quotation.customer.customerCode && (
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase">Code</p>
                                        <p className="font-medium text-gray-700">{quotation.customer.customerCode}</p>
                                    </div>
                                )}
                                {quotation.customer.phone && (
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase">Phone</p>
                                        <p className="font-medium text-gray-700">{quotation.customer.phone}</p>
                                    </div>
                                )}
                                {quotation.customer.email && (
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase">Email</p>
                                        <p className="font-medium text-gray-700">{quotation.customer.email}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs text-gray-500 uppercase">Credit Sales</p>
                                    <span className={`inline-block mt-1 px-2 py-1 rounded text-xs font-bold ${
                                        quotation.customer.allowCreditSales 
                                            ? 'bg-emerald-100 text-emerald-700' 
                                            : 'bg-rose-100 text-rose-700'
                                    }`}>
                                        {quotation.customer.allowCreditSales ? 'Allowed' : 'Not Allowed'}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 italic">Walk-in Customer</p>
                        )}
                    </div>

                    {/* Converted Invoice Link */}
                    {quotation.status === 'CONVERTED' ? (
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-6">
                            <h3 className="text-sm font-bold uppercase tracking-widest mb-4 text-purple-700 flex items-center gap-2">
                                <CheckCircle size={16} />
                                Converted Invoice
                            </h3>
                            {quotation.convertedInvoiceId || quotation.convertedInvoiceNo ? (
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-purple-600 uppercase">Invoice Number</p>
                                        <p className="font-bold text-purple-900 text-lg">{quotation.convertedInvoiceNo || 'N/A'}</p>
                                    </div>
                                    <Link
                                        to={`/sales/invoices/${quotation.convertedInvoiceId}`}
                                        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
                                    >
                                        <FileText size={18} />
                                        View Invoice
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-purple-600 uppercase">Status</p>
                                        <p className="font-medium text-purple-900">Converted successfully</p>
                                        <p className="text-xs text-purple-600 mt-1">Invoice ID not linked to this quotation</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            toast.error('Invoice ID not linked. Please contact administrator.');
                                        }}
                                        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-purple-200 text-purple-700 rounded-lg font-semibold cursor-not-allowed"
                                        disabled
                                    >
                                        <FileText size={18} />
                                        View Invoice (Not Available)
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : null}

                    {/* Activity Timeline */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="text-sm font-bold uppercase tracking-widest mb-4 text-gray-500 flex items-center gap-2">
                            <Clock size={16} />
                            Timeline
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">Created</p>
                                    <p className="text-xs text-gray-500">{formatCompanyDateTime(quotation.createdAt, regionalSettings)}</p>
                                </div>
                            </div>
                            {quotation.updatedAt && quotation.updatedAt !== quotation.createdAt && (
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-gray-400 mt-2"></div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">Last Updated</p>
                                        <p className="text-xs text-gray-500">{formatCompanyDateTime(quotation.updatedAt, regionalSettings)}</p>
                                    </div>
                                </div>
                            )}
                            {quotation.status === 'CONVERTED' && (
                                <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2"></div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">Converted to Invoice</p>
                                        <p className="text-xs text-gray-500">Ready for invoicing</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    nav, header, aside, .no-print, button {
                        display: none !important;
                    }
                    body {
                        background-color: white !important;
                    }
                    .max-w-7xl {
                        max-width: none !important;
                    }
                    .bg-gradient-to-r {
                        background: #f3f4f6 !important;
                        color: black !important;
                    }
                    .shadow-sm, .shadow-xl {
                        box-shadow: none !important;
                        border: 1px solid #ddd !important;
                    }
                }
            ` }} />
        </div>
    );
}
