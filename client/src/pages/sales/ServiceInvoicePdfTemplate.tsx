import type { ServiceInvoice } from './ServiceInvoiceView';

interface ServiceInvoicePdfTemplateProps {
    invoice: ServiceInvoice;
}

export function ServiceInvoicePdfTemplate({ invoice }: ServiceInvoicePdfTemplateProps) {
    return (
        <div className="p-8 bg-white">
            {/* Header */}
            <div className="flex justify-between items-start mb-8 border-b-2 border-brand pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-brand">SOLVANTA</h1>
                    <p className="text-sm text-gray-600 mt-1">Service Invoice</p>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-bold">{invoice.invoiceNo}</h2>
                    <p className="text-sm text-gray-600">
                        {new Date(invoice.createdAt).toLocaleDateString()}
                    </p>
                </div>
            </div>

            {/* Bill To & Details */}
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Bill To
                    </h3>
                    <p className="text-lg font-semibold">
                        {invoice.customer?.name || invoice.walkInCustomerName || 'Walk-in Customer'}
                    </p>
                    {invoice.customer?.phone && (
                        <p className="text-sm text-gray-600">{invoice.customer.phone}</p>
                    )}
                    {invoice.walkInPhone && (
                        <p className="text-sm text-gray-600">{invoice.walkInPhone}</p>
                    )}
                </div>
                <div className="text-right">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Invoice Details
                    </h3>
                    <div className="space-y-1 text-sm">
                        <p>
                            <span className="text-gray-500">Branch:</span>{' '}
                            <span className="font-semibold">{invoice.branch.name}</span>
                        </p>
                        <p>
                            <span className="text-gray-500">Payment:</span>{' '}
                            <span className="font-semibold">{invoice.paymentMethod}</span>
                        </p>
                        <p>
                            <span className="text-gray-500">Status:</span>{' '}
                            <span className="font-semibold">{invoice.status}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Services Table */}
            <table className="w-full mb-8">
                <thead>
                    <tr className="bg-brand-50 border-b-2 border-brand">
                        <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide">
                            Service
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide">
                            Code
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide">
                            Qty
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide">
                            Unit Price
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide">
                            Discount
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide">
                            Tax
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wide">
                            Total
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.items.map((item, index) => (
                        <tr key={index} className="border-b border-gray-200">
                            <td className="py-3 px-4 font-medium">{item.serviceName}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm">
                                {item.serviceCode || '-'}
                            </td>
                            <td className="py-3 px-4 text-right">{item.qty}</td>
                            <td className="py-3 px-4 text-right">
                                ${item.unitPrice.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                                ${item.discount.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                                ${item.taxAmount.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">
                                ${item.lineTotal.toFixed(2)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Summary */}
            <div className="flex justify-end mb-8">
                <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="font-medium">${invoice.subtotal.toFixed(2)}</span>
                    </div>
                    {invoice.discountTotal > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Discount</span>
                            <span className="font-medium text-red-600">
                                -${invoice.discountTotal.toFixed(2)}
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tax</span>
                        <span className="font-medium">${invoice.taxTotal.toFixed(2)}</span>
                    </div>
                    <div className="border-t-2 border-brand pt-2">
                        <div className="flex justify-between text-lg font-bold">
                            <span>Grand Total</span>
                            <span className="text-brand">${invoice.grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
                <div className="mb-8 p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
                    <p className="text-sm text-gray-600">{invoice.notes}</p>
                </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-300 pt-4 text-center text-sm text-gray-500">
                <p>Thank you for your business!</p>
                <p className="mt-1">
                    Created by {invoice.createdBy.name} •{' '}
                    {new Date(invoice.createdAt).toLocaleString()}
                </p>
            </div>
        </div>
    );
}
