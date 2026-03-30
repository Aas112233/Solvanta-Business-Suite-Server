/**
 * EXAMPLE: Customers Page using the Component System
 * 
 * This file demonstrates how to use the SOLVANTA Component System
 * to build a complete, production-ready page.
 * 
 * Copy this pattern for new pages in your application.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Mail, Phone } from 'lucide-react';
import { clsx } from 'clsx';

// Import from the component system
import {
  PageTemplate,
  Section,
  DataTable,
  FormField,
  Input,
  Select,
  useNotification,
  useFormValidation,
} from './index';

// Import your existing UI components (Button from existing system)
import Button from '../ui/Button';

// ============================================================================
// Types
// ============================================================================

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive';
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// Mock Data
// ============================================================================

const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'Acme Corporation',
    email: 'contact@acme.com',
    phone: '+1 555-0123',
    status: 'active',
    totalOrders: 45,
    totalSpent: 125000,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'TechStart Inc',
    email: 'info@techstart.io',
    phone: '+1 555-0456',
    status: 'active',
    totalOrders: 23,
    totalSpent: 67000,
    createdAt: '2024-02-20',
  },
  {
    id: '3',
    name: 'Global Solutions',
    email: 'hello@globalsolutions.com',
    phone: '+1 555-0789',
    status: 'inactive',
    totalOrders: 12,
    totalSpent: 34000,
    createdAt: '2024-03-10',
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function CustomersPageExample() {
  const navigate = useNavigate();
  const notify = useNotification();

  // State
  const [customers] = useState<Customer[]>(mockCustomers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('asc');

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.email.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Apply sorting
    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        const aVal = (a as any)[sortColumn];
        const bVal = (b as any)[sortColumn];
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [customers, search, statusFilter, sortColumn, sortDirection]);

  // Pagination
  const limit = 10;
  const pagination: PaginationInfo = {
    page,
    limit,
    total: filteredCustomers.length,
    totalPages: Math.ceil(filteredCustomers.length / limit),
  };

  const paginatedCustomers = filteredCustomers.slice(
    (page - 1) * limit,
    page * limit
  );

  // Handlers
  const handleSort = (column: string, direction: 'asc' | 'desc' | null) => {
    setSortColumn(column);
    setSortDirection(direction);
  };

  const handleRowClick = (customer: Customer) => {
    navigate(`/customers/${customer.id}`);
  };

  const handleDelete = (customer: Customer) => {
    notify.warning(
      `Delete ${customer.name}?`,
      'This action cannot be undone.',
      {
        duration: 5000,
      }
    );
  };

  // Table columns definition
  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Customer Name',
        sortable: true,
        render: (customer: Customer) => (
          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              {customer.name}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(customer.createdAt)}
            </div>
          </div>
        ),
      },
      {
        key: 'contact',
        header: 'Contact',
        render: (customer: Customer) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Mail className="w-4 h-4" />
              {customer.email}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Phone className="w-4 h-4" />
              {customer.phone}
            </div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (customer: Customer) => (
          <span
            className={clsx(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              customer.status === 'active'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
            )}
          >
            <span
              className={clsx(
                'w-1.5 h-1.5 rounded-full mr-1.5',
                customer.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
              )}
            />
            {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
          </span>
        ),
      },
      {
        key: 'orders',
        header: 'Orders',
        align: 'right' as const,
        sortable: true,
        render: (customer: Customer) => (
          <div className="text-right">
            <div className="font-medium">{customer.totalOrders}</div>
            <div className="text-sm text-gray-500">
              {formatCurrency(customer.totalSpent)}
            </div>
          </div>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'right' as const,
        render: (customer: Customer) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Edit2 className="w-4 h-4" />}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                navigate(`/customers/${customer.id}/edit`);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleDelete(customer);
              }}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [navigate]
  );

  // Filter options
  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  return (
    <PageTemplate
      title="Customers"
      subtitle={`Manage your ${customers.length} customer relationships`}
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Customers' },
      ]}
      action={
        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => navigate('/customers/new')}
        >
          Add Customer
        </Button>
      }
      loading={loading}
      error={error}
      onRetry={() => setError(null)}
      maxWidth="full"
    >
      <div className="space-y-6">
        {/* Filters Section */}
        <Section variant="flat" headerBorder={false}>
          <div className="flex flex-col sm:flex-row gap-4">
            <FormField className="flex-1 max-w-md">
              <Input
                icon={<Search className="w-5 h-5 text-gray-400" />}
                placeholder="Search customers by name or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                fullWidth
              />
            </FormField>

            <FormField>
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-40"
              />
            </FormField>
          </div>
        </Section>

        {/* Results Summary */}
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredCustomers.length} of {customers.length} customers
          {search && ` matching "${search}"`}
          {statusFilter !== 'all' && ` with status "${statusFilter}"`}
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={paginatedCustomers}
          keyAccessor={(customer) => customer.id}
          loading={loading}
          pagination={pagination}
          onPageChange={setPage}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onRowClick={handleRowClick}
          emptyState={{
            title: 'No customers found',
            description: search
              ? `No customers match your search for "${search}"`
              : 'Get started by adding your first customer',
            action: !search && (
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => navigate('/customers/new')}
              >
                Add Customer
              </Button>
            ),
          }}
        />
      </div>
    </PageTemplate>
  );
}

// ============================================================================
// Form Example
// ============================================================================

export function CustomerFormExample() {
  const navigate = useNavigate();
  const notify = useNotification();

  const form = useFormValidation({
    initialValues: {
      name: '',
      email: '',
      phone: '',
      status: 'active',
    },
    validationRules: {
      name: {
        required: 'Customer name is required',
        minLength: { value: 2, message: 'Name must be at least 2 characters' },
      },
      email: {
        required: 'Email address is required',
        pattern: {
          value: /\S+@\S+\.\S+/,
          message: 'Please enter a valid email address',
        },
      },
      phone: {
        required: 'Phone number is required',
      },
    },
    onSubmit: async (values) => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      notify.success('Customer created successfully!');
      navigate('/customers');
    },
  });

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  return (
    <PageTemplate
      title="Add Customer"
      subtitle="Create a new customer record"
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Customers', href: '/customers' },
        { label: 'Add Customer' },
      ]}
      maxWidth="lg"
    >
      <form onSubmit={form.handleSubmit} className="space-y-6">
        <Section
          title="Customer Information"
          description="Enter the basic details for this customer"
          variant="card"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              label="Customer Name"
              error={form.errors.name}
              required
            >
              <Input
                value={form.values.name}
                onChange={(e) => form.setValue('name', e.target.value)}
                onBlur={() => form.setTouched('name')}
                placeholder="Enter company or individual name"
                fullWidth
              />
            </FormField>

            <FormField
              label="Email Address"
              error={form.errors.email}
              required
            >
              <Input
                type="email"
                value={form.values.email}
                onChange={(e) => form.setValue('email', e.target.value)}
                onBlur={() => form.setTouched('email')}
                placeholder="email@example.com"
                fullWidth
              />
            </FormField>

            <FormField
              label="Phone Number"
              error={form.errors.phone}
              required
            >
              <Input
                value={form.values.phone}
                onChange={(e) => form.setValue('phone', e.target.value)}
                onBlur={() => form.setTouched('phone')}
                placeholder="+1 555-0000"
                fullWidth
              />
            </FormField>

            <FormField label="Status">
              <Select
                options={statusOptions}
                value={form.values.status}
                onChange={(e) => form.setValue('status', e.target.value)}
                fullWidth
              />
            </FormField>
          </div>
        </Section>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/customers')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={form.isSubmitting}
            disabled={!form.isDirty}
          >
            Create Customer
          </Button>
        </div>
      </form>
    </PageTemplate>
  );
}
