import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Edit2, Loader2, Plus, Search, Trash2, FileText } from 'lucide-react';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import Pagination from '../components/ui/Pagination';

interface Customer {
    id: string;
    customerCode: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    creditLimit: number;
    allowCreditSales?: boolean;
    openingBalance: number;
    priceGroup?: { id: string; name: string } | null;
    tags?: string[];
}

interface PaginatedResponse<T> {
    data: T[];
    meta?: {
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            totalItems: number;
        };
    };
}

export default function Customers() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['customers', search, page, limit],
        queryFn: () =>
            api
                .get<PaginatedResponse<Customer>>('/customers', {
                    params: { search: search.trim() || undefined, page, limit },
                })
                .then((r) => r.data),
    });

    const { data: summary } = useQuery({
        queryKey: ['customers', 'summary'],
        queryFn: () => api.get('/customers/summary/stats').then((r) => r.data.data),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/customers/${id}`),
        onSuccess: () => {
            toast.success('Customer archived');
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to archive customer'),
    });

    const toggleCreditMutation = useMutation({
        mutationFn: ({ id, allowCreditSales }: { id: string; allowCreditSales: boolean }) =>
            api.patch(`/customers/${id}`, { allowCreditSales }),
        onSuccess: () => {
            toast.success('Credit sale setting updated');
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to update credit setting'),
    });

    const pagination = data?.meta?.pagination;
    const customers = data?.data || [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryCard label="Active Customers" value={summary?.activeCustomers ?? 0} />
                <SummaryCard label="Total Receivable" value={`SAR ${Number(summary?.totalReceivable ?? 0).toLocaleString()}`} />
                <SummaryCard label="Credit Invoices" value={summary?.totalCreditInvoices ?? 0} />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                            Customers
                        </h1>
                        <ModuleRefreshButton queryKeys={[['customers'], ['customers', 'summary']]} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        {pagination?.total || 0} total customers
                    </p>
                </div>
                <button
                    onClick={() => navigate('/customers/new')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-gradient-brand transition-all hover:opacity-90 shadow-lg shadow-brand-500/20"
                >
                    <Plus size={18} /> Add Customer
                </button>
            </div>

            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                <input
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);}}
                    placeholder="Search by code, name, phone or email..."
                    className="pl-11"
                />
            </div>

            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="overflow-x-auto relative min-h-[400px]">
                    {(isLoading || isFetching) && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-[1px]" style={{ background: 'rgba(255,255,255,0.5)' }}>
                            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                        </div>
                    )}
                    <table className="w-full min-w-[900px]">
                        <thead>
                            <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Code</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Name</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Contact</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Price Group</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Credit Limit</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Credit Sale</th>
                                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Opening Balance</th>
                                <th className="text-right px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && !isFetching ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12" />
                                </tr>
                            ) : customers.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                        <div className="flex flex-col items-center gap-3">
                                            <p>No customers found</p>
                                            <button
                                                onClick={() => navigate('/customers/new')}
                                                className="text-brand-600 font-bold hover:underline"
                                            >
                                                Create new customer
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                customers.map((customer) => (
                                    <tr key={customer.id} className="transition-colors" style={{ borderTop: '1px solid var(--color-border)' }}>
                                        <td className="px-5 py-3.5 text-sm font-mono" style={{ color: 'var(--color-accent)' }}>{customer.customerCode}</td>
                                        <td className="px-5 py-3.5">
                                            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{customer.name}</p>
                                            {customer.tags && customer.tags.length > 0 && (
                                                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{customer.tags.join(', ')}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                            <p>{customer.phone || 'No phone'}</p>
                                            <p className="text-xs">{customer.email || 'No email'}</p>
                                        </td>
                                        <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{customer.priceGroup?.name || 'Default'}</td>
                                        <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>SAR {Number(customer.creditLimit || 0).toLocaleString()}</td>
                                        <td className="px-5 py-3.5 text-sm">
                                            <button
                                                type="button"
                                                onClick={() => toggleCreditMutation.mutate({ id: customer.id, allowCreditSales: !(customer.allowCreditSales !== false) })}
                                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${customer.allowCreditSales !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                                                disabled={toggleCreditMutation.isPending}
                                                title="Toggle credit sale permission"
                                            >
                                                {customer.allowCreditSales !== false ? 'Allowed' : 'Blocked'}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>SAR {Number(customer.openingBalance || 0).toLocaleString()}</td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => navigate(`/customers/ledger?id=${customer.id}`)}
                                                    className="p-1.5 rounded-md transition-colors hover:bg-blue-50"
                                                    style={{ color: 'var(--color-accent)' }}
                                                    title="View Ledger"
                                                >
                                                    <FileText size={15} />
                                                </button>
                                                <button
                                                    onClick={() => navigate(`/customers/${customer.id}`)}
                                                    className="p-1.5 rounded-md transition-colors"
                                                    style={{ color: 'var(--color-accent)' }}
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                                <button
                                                    onClick={() => deleteMutation.mutate(customer.id)}
                                                    className="p-1.5 rounded-md transition-colors"
                                                    style={{ color: 'var(--color-danger)' }}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems || pagination.total} // API might return total or totalItems
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>
        </div>
    );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
            <p className="mt-2 text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
        </div>
    );
}
