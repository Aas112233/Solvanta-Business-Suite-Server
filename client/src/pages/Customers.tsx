import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from '@/lib/toast';
import { Edit2, Loader2, Plus, Search, Trash2, FileText, Download, Filter, MoreHorizontal, Users, DollarSign, CreditCard, TrendingUp, Upload, Archive, Eye } from 'lucide-react';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardTitle, CardDescription, CardContent, StatCard } from '../components/ui/Card';
import Table, { TableHeader, TableBody, TableHead, TableRow, TableCell, TableEmpty, TableLoading } from '../components/ui/Table';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import CustomerQuickViewModal from '../components/customers/CustomerQuickViewModal';

interface Customer {
    id: string;
    customerCode: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    creditLimit: number;
    allowCreditSales?: boolean;
    openingBalance: number;
    creditBalance?: number;
    savingBalance?: number;
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

type SortField = 'name' | 'customerCode' | 'creditLimit' | 'openingBalance';
type SortDirection = 'asc' | 'desc';

interface Filters {
    status: string;
    priceGroup: string;
    creditStatus: string;
}

export default function Customers() {
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [filters, setFilters] = useState<Filters>({
        status: 'all',
        priceGroup: 'all',
        creditStatus: 'all'
    });
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [viewCustomerId, setViewCustomerId] = useState<string | null>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['customers', search, page, limit, sortField, sortDirection, filters],
        queryFn: () =>
            api
                .get<PaginatedResponse<Customer>>('/customers', {
                    params: { 
                        search: search.trim() || undefined, 
                        page, 
                        limit,
                        sortBy: sortField,
                        sortOrder: sortDirection,
                        ...Object.fromEntries(
                            Object.entries(filters).map(([key, value]) => [
                                key === 'status' ? 'isActive' : key,
                                value !== 'all' ? value : undefined
                            ]).filter(([, value]) => value !== undefined)
                        )
                    }
                })
                .then((r) => r.data),
    });

    const { data: summary } = useQuery({
        queryKey: ['customers', 'summary'],
        queryFn: () => api.get('/customers/summary/stats').then((r) => r.data.data),
    });

    const { data: priceGroups } = useQuery({
        queryKey: ['price-groups'],
        queryFn: () => api.get('/products/meta/price-groups').then((r) => r.data.data),
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

    const exportMutation = useMutation({
        mutationFn: (format: 'csv' | 'excel') => api.post(`/customers/export`, { format }, { responseType: 'blob' }),
        onSuccess: (response, format) => {
            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `customers_${new Date().toISOString().split('T')[0]}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Export completed successfully');
        },
        onError: () => toast.error('Failed to export customers'),
    });

    const importMutation = useMutation({
        mutationFn: (customers: any[]) => api.post('/customers/import', { customers }),
        onSuccess: (result) => {
            const { created, updated, failed, errors } = result.data;
            if (failed > 0) {
                toast.error(`Import completed with ${failed} failures. ${created} created, ${updated} updated.`);
                console.error('Import errors:', errors);
            } else {
                toast.success(`Import successful! ${created} created, ${updated} updated.`);
            }
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to import customers'),
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

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

    const bulkArchive = useMutation({
        mutationFn: () => api.post('/customers/bulk-archive', { customerIds: selectedCustomers }),
        onSuccess: () => {
            toast.success(`${selectedCustomers.length} customer(s) archived`);
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            setSelectedCustomers([]);
        },
        onError: () => toast.error('Failed to archive customers'),
    });

    const pagination = data?.meta?.pagination;
    const customers = data?.data || [];

    const columns = [
        {
            header: 'Customer Code',
            accessor: 'customerCode',
            sortable: true,
            render: (customer: Customer) => (
                <span className="font-mono text-sm" style={{ color: 'var(--color-accent)' }}>
                    {customer.customerCode}
                </span>
            )
        },
        {
            header: 'Customer Name',
            accessor: 'name',
            sortable: true,
            render: (customer: Customer) => (
                <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {customer.name}
                    </p>
                    {customer.tags && customer.tags.length > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {customer.tags.join(', ')}
                        </p>
                    )}
                </div>
            )
        },
        {
            header: 'Contact Information',
            accessor: 'contact',
            render: (customer: Customer) => (
                <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <p>{customer.phone || 'No phone'}</p>
                    <p className="text-xs">{customer.email || 'No email'}</p>
                </div>
            )
        },
        {
            header: 'Price Group',
            accessor: 'priceGroup',
            render: (customer: Customer) => (
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {customer.priceGroup?.name || 'Default'}
                </span>
            )
        },
        {
            header: 'Credit Limit',
            accessor: 'creditLimit',
            sortable: true,
            render: (customer: Customer) => (
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    SAR {Number(customer.creditLimit || 0).toLocaleString()}
                </span>
            )
        },
        {
            header: 'Credit Status',
            accessor: 'creditStatus',
            render: (customer: Customer) => (
                <Badge 
                    variant={customer.allowCreditSales !== false ? 'success' : 'danger'} 
                    size="sm"
                >
                    {customer.allowCreditSales !== false ? 'Allowed' : 'Blocked'}
                </Badge>
            )
        },
        {
            header: 'Opening Balance',
            accessor: 'openingBalance',
            sortable: true,
            render: (customer: Customer) => (
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    SAR {Number(customer.openingBalance || 0).toLocaleString()}
                </span>
            )
        },
        {
            header: 'Credit Balance',
            accessor: 'creditBalance',
            render: (customer: Customer) => (
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    SAR {Number(customer.creditBalance || 0).toLocaleString()}
                </span>
            )
        },
        {
            header: 'Saving Balance',
            accessor: 'savingBalance',
            render: (customer: Customer) => (
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    SAR {Number(customer.savingBalance || 0).toLocaleString()}
                </span>
            )
        },
        {
            header: 'Actions',
            accessor: 'actions',
            render: (customer: Customer) => (
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={() => setViewCustomerId(customer.id)}
                        className="p-1.5 rounded-md transition-colors hover:bg-blue-50"
                        style={{ color: 'var(--color-accent)' }}
                        title="Quick View"
                        aria-label={`Quick view ${customer.name}`}
                    >
                        <Eye size={15} />
                    </button>
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
                        onClick={() => navigate(`/customers/${customer.id}`)}
                        className="p-1.5 rounded-md transition-colors hover:bg-background-subtle"
                        style={{ color: 'var(--color-accent)' }}
                        title="Edit customer"
                        aria-label={`Edit ${customer.name}`}
                    >
                        <Edit2 size={15} />
                    </button>
                    <button
                        onClick={() => deleteMutation.mutate(customer.id)}
                        className="p-1.5 rounded-md transition-colors hover:bg-red-50"
                        style={{ color: 'var(--color-danger)' }}
                        title="Delete customer"
                        aria-label={`Delete ${customer.name}`}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                            Customers
                        </h1>
                        <ModuleRefreshButton queryKeys={[['customers'], ['customers', 'summary']]} />
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Manage your customer relationships and credit settings
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        variant="outline"
                        icon={<Archive size={16} />}
                        onClick={() => navigate('/customers/archived')}
                    >
                        Archived
                    </Button>
                    <div className="relative">
                        <Button
                            variant="outline"
                            icon={<Download size={16} />}
                            onClick={() => setShowExportMenu(!showExportMenu)}
                        >
                            Export
                        </Button>
                        {showExportMenu && (
                            <>
                                <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setShowExportMenu(false)}
                                />
                                <div className="absolute right-0 mt-1 w-40 bg-background-card border border-border rounded-lg shadow-lg z-20">
                                    <button
                                        onClick={() => {
                                            exportMutation.mutate('csv');
                                            setShowExportMenu(false);
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-background-subtle rounded-t-lg"
                                        style={{ color: 'var(--color-text-primary)' }}
                                    >
                                        Export CSV
                                    </button>
                                    <button
                                        onClick={() => {
                                            exportMutation.mutate('excel');
                                            setShowExportMenu(false);
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-background-subtle rounded-b-lg"
                                        style={{ color: 'var(--color-text-primary)' }}
                                    >
                                        Export Excel
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        icon={<Upload size={16} />}
                        onClick={() => setShowImportModal(true)}
                    >
                        Import
                    </Button>
                    <Button
                        variant="primary"
                        icon={<Plus size={16} />}
                        onClick={() => navigate('/customers/new')}
                    >
                        Add Customer
                    </Button>
                </div>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Active Customers"
                    value={summary?.activeCustomers ?? 0}
                    icon={<Users size={24} />}
                    trend="+12%"
                    trendDirection="up"
                />
                <StatCard
                    label="Total Receivable"
                    value={`SAR ${Number(summary?.totalReceivable ?? 0).toLocaleString()}`}
                    icon={<DollarSign size={24} />}
                    sub="Outstanding invoices"
                />
                <StatCard
                    label="Credit Invoices"
                    value={summary?.totalCreditInvoices ?? 0}
                    icon={<CreditCard size={24} />}
                    trend="-3%"
                    trendDirection="down"
                />
                <StatCard
                    label="Avg. Credit Limit"
                    value={`SAR ${Number(summary?.averageCreditLimit ?? 0).toLocaleString()}`}
                    icon={<TrendingUp size={24} />}
                />
            </div>

            {/* Filters and Search */}
            <div className="rounded-xl bg-background-card border border-border p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Filters & Search</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Find customers quickly with advanced filtering options
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
                    <Select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        options={[
                            { value: 'all', label: 'All Status' },
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' }
                        ]}
                    />
                    <Select
                        value={filters.priceGroup}
                        onChange={(e) => setFilters(prev => ({ ...prev, priceGroup: e.target.value }))}
                        options={[
                            { value: 'all', label: 'All Price Groups' },
                            ...(priceGroups?.map((group: any) => ({
                                value: group.id,
                                label: group.name
                            })) || [])
                        ]}
                    />
                    <Select
                        value={filters.creditStatus}
                        onChange={(e) => setFilters(prev => ({ ...prev, creditStatus: e.target.value }))}
                        options={[
                            { value: 'all', label: 'All Credit Status' },
                            { value: 'allowed', label: 'Credit Allowed' },
                            { value: 'blocked', label: 'Credit Blocked' }
                        ]}
                    />
                </div>
            </div>

            {/* Data Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Customer Directory</CardTitle>
                    <CardDescription>
                        {pagination?.total || 0} customers found
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
                                {columns.slice(0, -1).map((column) => (
                                    <TableHead
                                        key={column.accessor}
                                        sortable={column.sortable}
                                        sortDirection={sortField === column.accessor ? sortDirection : null}
                                        onSort={() => handleSort(column.accessor as SortField)}
                                    >
                                        {column.header}
                                    </TableHead>
                                ))}
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && !isFetching ? (
                                <TableLoading colSpan={columns.length + 1} message="Loading customers..." />
                            ) : customers.length === 0 ? (
                                <TableEmpty 
                                    colSpan={columns.length + 1} 
                                    message="No customers found matching your criteria"
                                    icon={<Users size={48} />}
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
                                        {columns.slice(0, -1).map((column) => (
                                            <TableCell key={column.accessor}>
                                                {column.render(customer)}
                                            </TableCell>
                                        ))}
                                        <TableCell className="text-right">
                                            {columns[columns.length - 1].render(customer)}
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
                                    variant="danger"
                                    size="sm"
                                    onClick={() => bulkArchive.mutate()}
                                    loading={bulkArchive.isPending}
                                >
                                    Archive Selected
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

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-background-card border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                Import Customers
                            </h2>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Upload customers from CSV or Excel file
                            </p>
                        </div>
                        <div className="p-6">
                            <div className="mb-4 p-4 bg-background-subtle rounded-lg border border-border">
                                <h3 className="font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Required Columns:</h3>
                                <ul className="text-sm list-disc list-inside space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
                                    <li><strong>name</strong> - Customer name (required)</li>
                                    <li>customerCode - Customer code (optional, auto-generated if not provided)</li>
                                    <li>phone - Phone number</li>
                                    <li>email - Email address</li>
                                    <li>vatNumber - VAT/Tax number</li>
                                    <li>creditLimit - Credit limit (default: 0)</li>
                                    <li>allowCreditSales - Allow credit sales (true/false, default: true)</li>
                                    <li>openingBalance - Opening balance (default: 0)</li>
                                    <li>tags - Comma-separated tags</li>
                                    <li>notes - Additional notes</li>
                                    <li>street, city, country - Address fields</li>
                                </ul>
                            </div>
                            <input
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    const reader = new FileReader();
                                    reader.onload = async (event) => {
                                        try {
                                            const text = event.target?.result as string;
                                            let customers: any[] = [];

                                            if (file.name.endsWith('.csv')) {
                                                // Parse CSV
                                                const lines = text.split('\n').map(l => l.trim()).filter(l => l);
                                                const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

                                                for (let i = 1; i < lines.length; i++) {
                                                    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                                                    const customer: any = {};
                                                    headers.forEach((header, idx) => {
                                                        customer[header] = values[idx] || '';
                                                    });
                                                    // Parse boolean
                                                    if (customer.allowCreditSales) {
                                                        customer.allowCreditSales = customer.allowCreditSales.toLowerCase() === 'yes' || customer.allowCreditSales === 'true';
                                                    }
                                                    // Parse numbers
                                                    if (customer.creditLimit) customer.creditLimit = Number(customer.creditLimit);
                                                    if (customer.openingBalance) customer.openingBalance = Number(customer.openingBalance);
                                                    customers.push(customer);
                                                }
                                            } else {
                                                // For Excel files, show error - would need xlsx library
                                                toast.error('Excel import requires additional setup. Please use CSV format.');
                                                return;
                                            }

                                            if (customers.length === 0) {
                                                toast.error('No customer data found in file');
                                                return;
                                            }

                                            importMutation.mutate(customers);
                                            setShowImportModal(false);
                                        } catch (err: any) {
                                            toast.error(`Failed to parse file: ${err.message}`);
                                        }
                                    };
                                    reader.readAsText(file);
                                }}
                                className="block w-full text-sm text-gray-500
                                    file:mr-4 file:py-2.5 file:px-4
                                    file:rounded-lg file:border-0
                                    file:text-sm file:font-semibold
                                    file:bg-blue-50 file:text-blue-700
                                    hover:file:bg-blue-100
                                    mb-4"
                            />
                            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                <p className="mb-2"><strong>Note:</strong> If a customer code already exists, the customer will be updated instead of created.</p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-border flex justify-end gap-3">
                            <button
                                onClick={() => setShowImportModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-background-subtle"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick View Modal */}
            {viewCustomerId && (
                <CustomerQuickViewModal
                    customerId={viewCustomerId}
                    onClose={() => setViewCustomerId(null)}
                />
            )}
        </div>
    );
}
