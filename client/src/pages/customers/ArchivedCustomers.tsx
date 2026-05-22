import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { Archive, RotateCcw, Search, Trash2, Users, FileText, Eye } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import Table, { TableHeader, TableBody, TableHead, TableRow, TableCell, TableEmpty, TableLoading } from '../../components/ui/Table';
import Input from '../../components/ui/Input';
import Pagination from '../../components/ui/Pagination';
import { Badge } from '../../components/ui/Badge';

interface ArchivedCustomer {
    id: string;
    customerCode: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    creditLimit: number;
    openingBalance: number;
    priceGroup?: { id: string; name: string } | null;
    deletedAt: string;
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

export default function ArchivedCustomers() {
    const [search, setSearch] = useState('');
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['customers', 'archived', search, page, limit],
        queryFn: () =>
            api
                .get<PaginatedResponse<ArchivedCustomer>>('/customers/archived', {
                    params: {
                        search: search.trim() || undefined,
                        page,
                        limit,
                    }
                })
                .then((r) => r.data),
    });

    const restoreMutation = useMutation({
        mutationFn: (id: string) => api.post(`/customers/${id}/restore`),
        onSuccess: () => {
            toast.success('Customer restored');
            queryClient.invalidateQueries({ queryKey: ['customers', 'archived'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to restore customer'),
    });

    const bulkRestoreMutation = useMutation({
        mutationFn: () => api.post('/customers/bulk-restore', { customerIds: selectedCustomers }),
        onSuccess: (result) => {
            const count = result.data?.count || selectedCustomers.length;
            toast.success(`${count} customer(s) restored`);
            queryClient.invalidateQueries({ queryKey: ['customers', 'archived'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomers([]);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to restore customers'),
    });

    const permanentDeleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/customers/${id}/permanent`),
        onSuccess: () => {
            toast.success('Customer permanently deleted');
            queryClient.invalidateQueries({ queryKey: ['customers', 'archived'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to permanently delete customer'),
    });

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedCustomers(data?.data.map(c => c.id) || []);
        } else {
            setSelectedCustomers([]);
        }
    };

    const handleSelectCustomer = (customerId: string, checked: boolean) => {
        if (checked) {
            setSelectedCustomers(prev => [...prev, customerId]);
        } else {
            setSelectedCustomers(prev => prev.filter(id => id !== customerId));
        }
    };

    const pagination = data?.meta?.pagination;
    const customers = data?.data || [];

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                            Archived Customers
                        </h1>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        View and restore archived customers
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => navigate('/customers')}
                >
                    Back to Customers
                </Button>
            </div>

            {/* Summary Card */}
            <Card>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-orange-100" style={{ background: 'var(--color-bg-subtle)' }}>
                            <Archive size={24} style={{ color: 'var(--color-accent)' }} />
                        </div>
                        <div>
                            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Total Archived Customers</p>
                            <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                {pagination?.totalItems || 0}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Search */}
            <div className="rounded-xl bg-background-card border border-border p-5">
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Search Archived Customers</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Find archived customers by code, name, phone or email
                </p>
                <div className="mt-4">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                        <Input
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Search by code, name, phone or email..."
                            className="pl-11"
                        />
                    </div>
                </div>
            </div>

            {/* Bulk Actions */}
            {selectedCustomers.length > 0 && (
                <Card>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                {selectedCustomers.length} customer(s) selected
                            </p>
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    icon={<RotateCcw size={16} />}
                                    onClick={() => bulkRestoreMutation.mutate()}
                                    loading={bulkRestoreMutation.isPending}
                                >
                                    Restore Selected
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedCustomers([])}
                                >
                                    Clear Selection
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Data Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Archived Customers List</CardTitle>
                    <CardDescription>
                        {pagination?.total || 0} archived customers found
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table striped hoverable>
                        <TableHeader>
                            <TableRow>
                                <TableHead width="50px">
                                    <input
                                        type="checkbox"
                                        checked={selectedCustomers.length === customers.length && customers.length > 0}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        aria-label="Select all customers"
                                    />
                                </TableHead>
                                <TableHead>Customer Code</TableHead>
                                <TableHead>Customer Name</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>Credit Limit</TableHead>
                                <TableHead>Opening Balance</TableHead>
                                <TableHead>Archived Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && !isFetching ? (
                                <TableLoading colSpan={8} message="Loading archived customers..." />
                            ) : customers.length === 0 ? (
                                <TableEmpty
                                    colSpan={8}
                                    message={search ? "No archived customers found matching your search" : "No archived customers"}
                                    icon={<Archive size={48} />}
                                />
                            ) : (
                                customers.map((customer) => (
                                    <TableRow key={customer.id}>
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                checked={selectedCustomers.includes(customer.id)}
                                                onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                                                aria-label={`Select ${customer.name}`}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono text-sm" style={{ color: 'var(--color-accent)' }}>
                                                {customer.customerCode}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                                    {customer.name}
                                                </p>
                                                {customer.priceGroup && (
                                                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                                        {customer.priceGroup.name}
                                                    </p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                                <p>{customer.phone || 'No phone'}</p>
                                                <p className="text-xs">{customer.email || 'No email'}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                                SAR {Number(customer.creditLimit || 0).toLocaleString()}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                                SAR {Number(customer.openingBalance || 0).toLocaleString()}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="default" size="sm">
                                                {formatDate(customer.deletedAt)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => navigate(`/customers/ledger?id=${customer.id}`)}
                                                    className="p-1.5 rounded-md transition-colors hover:bg-blue-50"
                                                    style={{ color: 'var(--color-accent)' }}
                                                    title="View Ledger"
                                                    aria-label={`View ledger for ${customer.name}`}
                                                >
                                                    <FileText size={15} />
                                                </button>
                                                <button
                                                    onClick={() => restoreMutation.mutate(customer.id)}
                                                    className="p-1.5 rounded-md transition-colors hover:bg-green-50"
                                                    style={{ color: 'var(--color-success)' }}
                                                    title="Restore customer"
                                                    aria-label={`Restore ${customer.name}`}
                                                >
                                                    <RotateCcw size={15} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Permanently delete ${customer.name}? This cannot be undone.`)) {
                                                            permanentDeleteMutation.mutate(customer.id);
                                                        }
                                                    }}
                                                    className="p-1.5 rounded-md transition-colors hover:bg-red-50"
                                                    style={{ color: 'var(--color-danger)' }}
                                                    title="Permanently delete"
                                                    aria-label={`Permanently delete ${customer.name}`}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {pagination && (
                        <div className="mt-4">
                            <Pagination
                                currentPage={page}
                                totalPages={pagination.totalPages}
                                totalItems={pagination.totalItems || pagination.total}
                                itemsPerPage={limit}
                                onPageChange={setPage}
                                onItemsPerPageChange={setLimit}
                                isLoading={isFetching}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
