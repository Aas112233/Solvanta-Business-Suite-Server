import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { X, User, Phone, Mail, MapPin, CreditCard, TrendingUp, FileText, Calendar, Wallet, PiggyBank } from 'lucide-react';
// import CustomerActivityLog from './CustomerActivityLog';

interface CustomerQuickViewModalProps {
    customerId: string;
    onClose: () => void;
}

interface Customer {
    id: string;
    customerCode: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    vatNumber?: string | null;
    creditLimit: number;
    allowCreditSales?: boolean;
    openingBalance: number;
    creditBalance?: number;
    savingBalance?: number;
    priceGroup?: { id: string; name: string } | null;
    tags?: string[];
    notes?: string | null;
    address?: any;
    receivableBalance?: number;
    recentInvoices?: any[];
}

export default function CustomerQuickViewModal({ customerId, onClose }: CustomerQuickViewModalProps) {
    const { data: customer, isLoading } = useQuery<Customer>({
        queryKey: ['customer', customerId],
        queryFn: () => api.get(`/customers/${customerId}`).then((r) => r.data.data),
    });

    if (!customerId) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div 
                className="bg-background-card border border-border rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-border flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-100" style={{ background: 'var(--color-bg-subtle)' }}>
                            <User size={24} style={{ color: 'var(--color-accent)' }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                {customer?.name}
                            </h2>
                            <p className="text-sm font-mono" style={{ color: 'var(--color-accent)' }}>
                                {customer?.customerCode}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-background-subtle"
                        style={{ color: 'var(--color-text-muted)' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                {isLoading ? (
                    <div className="p-12 flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : customer ? (
                    <div className="p-6 space-y-6">
                        {/* Key Stats */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 rounded-lg bg-background-subtle border border-border">
                                <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                    <CreditCard size={16} />
                                    <span className="text-xs font-medium uppercase">Credit Limit</span>
                                </div>
                                <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    SAR {Number(customer.creditLimit || 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-background-subtle border border-border">
                                <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                    <TrendingUp size={16} />
                                    <span className="text-xs font-medium uppercase">Receivable</span>
                                </div>
                                <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    SAR {Number(customer.receivableBalance || 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-background-subtle border border-border">
                                <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                    <FileText size={16} />
                                    <span className="text-xs font-medium uppercase">Opening Balance</span>
                                </div>
                                <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    SAR {Number(customer.openingBalance || 0).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        {/* Customer Funds / Balances */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1 text-emerald-800 dark:text-emerald-300">
                                        <Wallet size={16} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Credit Balance</span>
                                    </div>
                                    <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                                        SAR {Number(customer.creditBalance || 0).toLocaleString()}
                                    </p>
                                </div>
                                <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-1 rounded-md font-medium">
                                    Overpaid Balance
                                </div>
                            </div>
                            <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1 text-blue-800 dark:text-blue-300">
                                        <PiggyBank size={16} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Saving Balance</span>
                                    </div>
                                    <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                                        SAR {Number(customer.savingBalance || 0).toLocaleString()}
                                    </p>
                                </div>
                                <div className="text-xs text-blue-600/80 dark:text-blue-400/80 bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded-md font-medium">
                                    Customer Savings
                                </div>
                            </div>
                        </div>

                        {/* Contact Information */}
                        <div>
                            <h3 className="text-sm font-bold uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Contact Information
                            </h3>
                            <div className="space-y-2">
                                {customer.phone && (
                                    <div className="flex items-center gap-3">
                                        <Phone size={16} style={{ color: 'var(--color-text-muted)' }} />
                                        <span style={{ color: 'var(--color-text-secondary)' }}>{customer.phone}</span>
                                    </div>
                                )}
                                {customer.email && (
                                    <div className="flex items-center gap-3">
                                        <Mail size={16} style={{ color: 'var(--color-text-muted)' }} />
                                        <span style={{ color: 'var(--color-text-secondary)' }}>{customer.email}</span>
                                    </div>
                                )}
                                {customer.vatNumber && (
                                    <div className="flex items-center gap-3">
                                        <FileText size={16} style={{ color: 'var(--color-text-muted)' }} />
                                        <span style={{ color: 'var(--color-text-secondary)' }}>VAT: {customer.vatNumber}</span>
                                    </div>
                                )}
                                {customer.address && (
                                    <div className="flex items-start gap-3">
                                        <MapPin size={16} style={{ color: 'var(--color-text-muted)' }} />
                                        <span style={{ color: 'var(--color-text-secondary)' }}>
                                            {[customer.address.street, customer.address.city, customer.address.country]
                                                .filter(Boolean)
                                                .join(', ')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Credit Settings */}
                        <div>
                            <h3 className="text-sm font-bold uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Credit Settings
                            </h3>
                            <div className="flex items-center gap-4">
                                <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                                    customer.allowCreditSales !== false 
                                        ? 'bg-green-100 text-green-700' 
                                        : 'bg-red-100 text-red-700'
                                }`}>
                                    {customer.allowCreditSales !== false ? 'Credit Allowed' : 'Credit Blocked'}
                                </div>
                                {customer.priceGroup && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Price Group:</span>
                                        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                            {customer.priceGroup.name}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tags */}
                        {customer.tags && customer.tags.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                    Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {customer.tags.map((tag, idx) => (
                                        <span
                                            key={idx}
                                            className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100"
                                            style={{ background: 'var(--color-bg-subtle)', color: 'var(--color-accent)' }}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {customer.notes && (
                            <div>
                                <h3 className="text-sm font-bold uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                    Notes
                                </h3>
                                <p className="text-sm p-3 rounded-lg bg-background-subtle" style={{ color: 'var(--color-text-secondary)' }}>
                                    {customer.notes}
                                </p>
                            </div>
                        )}

                        {/* Recent Invoices */}
                        {customer.recentInvoices && customer.recentInvoices.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                    Recent Invoices
                                </h3>
                                <div className="space-y-2">
                                    {customer.recentInvoices.slice(0, 5).map((invoice: any) => (
                                        <div
                                            key={invoice.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-background-subtle"
                                        >
                                            <div className="flex items-center gap-3">
                                                <FileText size={16} style={{ color: 'var(--color-text-muted)' }} />
                                                <div>
                                                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                                        {invoice.invoiceNo}
                                                    </p>
                                                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                        {new Date(invoice.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                                    SAR {Number(invoice.grandTotal).toLocaleString()}
                                                </p>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                    invoice.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                                    invoice.status === 'CREDIT' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {invoice.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity Log */}
                        {/* <div className="pt-4 border-t border-border">
                            <CustomerActivityLog customerId={customerId} />
                        </div> */}
                    </div>
                ) : (
                    <div className="p-12 text-center">
                        <p style={{ color: 'var(--color-text-secondary)' }}>Customer not found</p>
                    </div>
                )}
            </div>
        </div>
    );
}
