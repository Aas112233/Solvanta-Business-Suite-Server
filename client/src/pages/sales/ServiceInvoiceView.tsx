import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Download, Mail, Share2 } from 'lucide-react';
import api from '../../lib/api';
import {
    PageLayout,
    PageHeader,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button,
    Badge,
    StatusBadge,
} from '@/components/ui';
import { ServiceInvoicePdfTemplate } from './ServiceInvoicePdfTemplate';
import { formatCompanyDate, formatCurrencyAmount, resolveCompanyCurrency } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';

export interface ServiceInvoice {
    id: string;
    invoiceNo: string;
    customerId?: string;
    walkInCustomerName?: string;
    walkInPhone?: string;
    customer?: { name: string; phone: string; email?: string };
    branch: { name: string; code: string };
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
    paymentMethod: string;
    cashReceived?: number;
    changeGiven?: number;
    status: string;
    isPosted: boolean;
    notes?: string;
    createdAt: string;
    createdBy: { name: string; email: string };
    items: Array<{
        serviceName: string;
        serviceCode?: string;
        unitCode: string;
        qty: number;
        unitPrice: number;
        discount: number;
        taxAmount: number;
        lineTotal: number;
    }>;
}

export default function ServiceInvoiceView() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const company = useAuthStore((s) => s.user?.company);
    const currency = resolveCompanyCurrency(company);
    const [isPrinting, setIsPrinting] = useState(false);

    const { data: invoice, isLoading } = useQuery({
        queryKey: ['service-invoice', id],
        queryFn: async () => {
            if (!id) return null;
            const res = await api.get(`/service-invoices/${id}`);
            return res.data?.data as ServiceInvoice;
        },
        enabled: !!id,
    });

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPdf = () => {
        // Use browser's built-in PDF save from print dialog
        window.print();
        // Note: Users can select "Save as PDF" in the print dialog
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: `Service Invoice ${invoice?.invoiceNo}`,
                text: `Service Invoice for ${invoice?.customer?.name || invoice?.walkInCustomerName}`,
                url: window.location.href,
            });
        } else {
            // Fallback: copy link to clipboard
            navigator.clipboard.writeText(window.location.href);
            alert('Link copied to clipboard!');
        }
    };

    if (isLoading) {
        return (
            <PageLayout>
                <div className="flex justify-center items-center h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
                </div>
            </PageLayout>
        );
    }

    if (!invoice) {
        return (
            <PageLayout>
                <PageHeader
                    title="Invoice Not Found"
                    action={
                        <Button variant="outline" icon={<ArrowLeft size={16} />} onClick={() => navigate('/sales/invoices/service')}>
                            Back to List
                        </Button>
                    }
                />
            </PageLayout>
        );
    }

    return (
        <PageLayout>
            {/* Print styles */}
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print\\:block {
                        display: block !important;
                    }
                    .print-content, .print-content * {
                        visibility: visible;
                    }
                    .print-content {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                }
            `}</style>

            {/* Print-only header */}
            <div className="hidden print:block mb-6">
                <h1 className="text-2xl font-bold">Service Invoice</h1>
                <p className="text-sm text-gray-600">{invoice.invoiceNo}</p>
            </div>

            <PageHeader
                title={`Service Invoice: ${invoice.invoiceNo}`}
                subtitle={`Created on ${formatCompanyDate(invoice.createdAt, company)}`}
                action={
                    <div className="flex gap-2 print:hidden">
                        <Button
                            variant="outline"
                            icon={<ArrowLeft size={16} />}
                            onClick={() => navigate('/sales/invoices/service')}
                        >
                            Back
                        </Button>
                        <Button
                            variant="secondary"
                            icon={<Printer size={16} />}
                            onClick={handlePrint}
                        >
                            Print
                        </Button>
                        <Button
                            variant="secondary"
                            icon={<Download size={16} />}
                            onClick={handleDownloadPdf}
                        >
                            Save as PDF
                        </Button>
                        <Button
                            variant="secondary"
                            icon={<Share2 size={16} />}
                            onClick={handleShare}
                        >
                            Share
                        </Button>
                    </div>
                }
            />

            <div className="print-content">
            <div className="grid gap-4 lg:grid-cols-3 print:grid-cols-1">
                {/* Main Invoice Details */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Invoice Header */}
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-brand">SOLVANTA</h2>
                                    <p className="text-sm text-text-tertiary">Service Invoice</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold">{invoice.invoiceNo}</div>
                                    <StatusBadge status={invoice.status.toLowerCase() as any} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wide mb-2">
                                        Bill To
                                    </h3>
                                    <div className="text-base font-medium">
                                        {invoice.customer?.name || invoice.walkInCustomerName || 'Walk-in Customer'}
                                    </div>
                                    {invoice.customer?.phone && (
                                        <div className="text-sm text-text-secondary">
                                            {invoice.customer.phone}
                                        </div>
                                    )}
                                    {invoice.walkInPhone && (
                                        <div className="text-sm text-text-secondary">
                                            {invoice.walkInPhone}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wide mb-2">
                                        Invoice Details
                                    </h3>
                                    <div className="space-y-1 text-sm">
                                        <div>
                                            <span className="text-text-tertiary">Branch:</span>{' '}
                                            <span className="font-medium">{invoice.branch.name}</span>
                                        </div>
                                        <div>
                                            <span className="text-text-tertiary">Date:</span>{' '}
                                            <span className="font-medium">
                                                {formatCompanyDate(invoice.createdAt, company)}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-text-tertiary">Payment:</span>{' '}
                                            <span className="font-medium">{invoice.paymentMethod}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Invoice Items */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Services</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                                Service
                                            </th>
                                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                                Code
                                            </th>
                                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                                Qty
                                            </th>
                                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                                Unit Price
                                            </th>
                                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                                Discount
                                            </th>
                                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                                Tax
                                            </th>
                                            <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                                Total
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoice.items.map((item, index) => (
                                            <tr key={index} className="border-b border-border-subtle last:border-b-0">
                                                <td className="py-3 px-4">
                                                    <div className="font-medium">{item.serviceName}</div>
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono text-sm">
                                                    {item.serviceCode || '-'}
                                                </td>
                                                <td className="py-3 px-4 text-right">{item.qty}</td>
                                                <td className="py-3 px-4 text-right">
                                                    {formatCurrencyAmount(Number(item.unitPrice || 0), currency)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-text-tertiary">
                                                    {formatCurrencyAmount(Number(item.discount || 0), currency)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-text-tertiary">
                                                    {formatCurrencyAmount(Number(item.taxAmount || 0), currency)}
                                                </td>
                                                <td className="py-3 px-4 text-right font-medium">
                                                    {formatCurrencyAmount(Number(item.lineTotal || 0), currency)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Summary Sidebar */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Invoice Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-text-tertiary">Subtotal</span>
                                <span className="font-medium">{formatCurrencyAmount(Number(invoice.subtotal || 0), currency)}</span>
                            </div>
                            {invoice.discountTotal > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-tertiary">Discount</span>
                                    <span className="font-medium text-danger">
                                        -{formatCurrencyAmount(Number(invoice.discountTotal || 0), currency)}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-text-tertiary">Tax</span>
                                <span className="font-medium">{formatCurrencyAmount(Number(invoice.taxTotal || 0), currency)}</span>
                            </div>
                            <div className="border-t border-border pt-3">
                                <div className="flex justify-between text-base font-bold">
                                    <span>Grand Total</span>
                                    <span className="text-brand">{formatCurrencyAmount(Number(invoice.grandTotal || 0), currency)}</span>
                                </div>
                            </div>
                            {invoice.paymentMethod === 'CASH' && (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-text-tertiary">Cash Received</span>
                                        <span className="font-medium">
                                            {formatCurrencyAmount(Number(invoice.cashReceived || 0), currency)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-text-tertiary">Change</span>
                                        <span className="font-medium">
                                            {formatCurrencyAmount(Number(invoice.changeGiven || 0), currency)}
                                        </span>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {invoice.notes && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-text-secondary">{invoice.notes}</p>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardContent className="py-4">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-text-tertiary">Created By:</span>
                                    <span className="font-medium">{invoice.createdBy?.name || 'Unknown'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-text-tertiary">Status:</span>
                                    <StatusBadge status={invoice.status.toLowerCase() as any} />
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-text-tertiary">Posted:</span>
                                    <Badge variant={invoice.isPosted ? 'success' : 'default'}>
                                        {invoice.isPosted ? 'Yes' : 'No'}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            </div>

            {/* Hidden PDF template for printing */}
            <div className="hidden">
                <ServiceInvoicePdfTemplate invoice={invoice} />
            </div>
        </PageLayout>
    );
}
