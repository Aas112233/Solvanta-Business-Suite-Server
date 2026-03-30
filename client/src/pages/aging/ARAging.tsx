import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  ArrowUpRight, 
  ArrowDownRight, 
  AlertCircle,
  FileText,
  Calendar,
  Download,
  Eye
} from 'lucide-react';
import { clsx } from 'clsx';

// Unified Component System
import {
  PageTemplate,
  Section,
  DataTable,
  FormField,
  Input,
  Select,
  useNotification,
} from '@/components/system';

// Existing UI components
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import api, { getApiErrorMessage } from '@/lib/api';

// Types
interface ARAgingSummary {
  summary: {
    current: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    total: number;
  };
  asOfDate: string;
  totalCustomers: number;
  customers: CustomerAging[];
}

interface CustomerAging {
  customer: {
    id: string;
    name: string;
    customerCode: string;
    creditLimit: number;
    phone?: string;
    email?: string;
  };
  current: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
  invoices: InvoiceAging[];
}

interface InvoiceAging {
  id: string;
  invoiceNo: string;
  date: string;
  dueDate?: string;
  daysOld: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
}

export default function ARAging() {
  const navigate = useNavigate();
  const notify = useNotification();

  // State
  const [data, setData] = useState<ARAgingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAging | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch data
  useEffect(() => {
    fetchAgingData();
  }, [asOfDate]);

  const fetchAgingData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/aging/ar', { params: { asOfDate } });
      const result = response.data;

      if (result.success) {
        setData(result.data);
      } else {
        notify.error('Failed to load AR aging data');
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Error loading AR aging'));
    } finally {
      setLoading(false);
    }
  };

  // Calculate percentages
  const percentages = useMemo(() => {
    if (!data) return null;
    const total = data.summary.total || 1;
    return {
      current: (data.summary.current / total) * 100,
      days31to60: (data.summary.days31to60 / total) * 100,
      days61to90: (data.summary.days61to90 / total) * 100,
      over90: (data.summary.over90 / total) * 100,
    };
  }, [data]);

  // Aging buckets config
  const agingBuckets = [
    { 
      key: 'current', 
      label: 'Current (0-30)', 
      color: 'green',
      icon: ArrowUpRight 
    },
    { 
      key: 'days31to60', 
      label: '31-60 Days', 
      color: 'yellow',
      icon: AlertCircle 
    },
    { 
      key: 'days61to90', 
      label: '61-90 Days', 
      color: 'orange',
      icon: AlertCircle 
    },
    { 
      key: 'over90', 
      label: 'Over 90 Days', 
      color: 'red',
      icon: AlertCircle 
    },
  ];

  // Table columns
  const columns = useMemo(() => [
    {
      key: 'customer',
      header: 'Customer',
      render: (row: CustomerAging) => (
        <div>
          <div className="font-medium text-slate-900">{row.customer.name}</div>
          <div className="text-sm text-slate-500">{row.customer.customerCode}</div>
        </div>
      ),
    },
    {
      key: 'current',
      header: 'Current',
      align: 'right' as const,
      render: (row: CustomerAging) => (
        <div className="text-right text-green-600">
          {row.current > 0 ? row.current.toLocaleString('en-US', {
            style: 'currency',
            currency: 'SAR',
          }) : '-'}
        </div>
      ),
    },
    {
      key: 'days31to60',
      header: '31-60 Days',
      align: 'right' as const,
      render: (row: CustomerAging) => (
        <div className="text-right text-yellow-600">
          {row.days31to60 > 0 ? row.days31to60.toLocaleString('en-US', {
            style: 'currency',
            currency: 'SAR',
          }) : '-'}
        </div>
      ),
    },
    {
      key: 'days61to90',
      header: '61-90 Days',
      align: 'right' as const,
      render: (row: CustomerAging) => (
        <div className="text-right text-orange-600">
          {row.days61to90 > 0 ? row.days61to90.toLocaleString('en-US', {
            style: 'currency',
            currency: 'SAR',
          }) : '-'}
        </div>
      ),
    },
    {
      key: 'over90',
      header: 'Over 90 Days',
      align: 'right' as const,
      render: (row: CustomerAging) => (
        <div className="text-right text-red-600">
          {row.over90 > 0 ? row.over90.toLocaleString('en-US', {
            style: 'currency',
            currency: 'SAR',
          }) : '-'}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total Balance',
      align: 'right' as const,
      render: (row: CustomerAging) => (
        <div className="text-right font-semibold text-slate-900">
          {row.total.toLocaleString('en-US', {
            style: 'currency',
            currency: 'SAR',
          })}
        </div>
      ),
    },
    {
      key: 'credit',
      header: 'Credit Status',
      render: (row: CustomerAging) => {
        const utilization = row.customer.creditLimit > 0 
          ? (row.total / row.customer.creditLimit) * 100 
          : 0;
        
        return (
          <div className="flex flex-col gap-1">
            {row.customer.creditLimit > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden w-20">
                    <div 
                      className={clsx(
                        'h-full rounded-full',
                        utilization > 90 ? 'bg-red-500' : 
                        utilization > 70 ? 'bg-yellow-500' : 'bg-green-500'
                      )}
                      style={{ width: `${Math.min(utilization, 100)}%` }}
                    />
                  </div>
                  <span className={clsx(
                    'text-xs',
                    utilization > 90 ? 'text-red-600' : 
                    utilization > 70 ? 'text-yellow-600' : 'text-green-600'
                  )}>
                    {utilization.toFixed(0)}%
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {row.total.toLocaleString('en-US', { style: 'currency', currency: 'SAR' })} / {' '}
                  {row.customer.creditLimit.toLocaleString('en-US', { style: 'currency', currency: 'SAR' })}
                </div>
              </>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row: CustomerAging) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setSelectedCustomer(row);
              setShowDetailModal(true);
            }}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye size={18} />
          </button>
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              navigate(`/customers/${row.customer.id}`);
            }}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Customer Profile"
          >
            <FileText size={18} />
          </button>
        </div>
      ),
    },
  ], [navigate]);

  // Invoice columns for detail modal
  const invoiceColumns = useMemo(() => [
    {
      key: 'invoiceNo',
      header: 'Invoice #',
      render: (inv: InvoiceAging) => (
        <div className="font-medium text-slate-900">{inv.invoiceNo}</div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (inv: InvoiceAging) => (
        <div className="text-sm">
          {new Date(inv.date).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'daysOld',
      header: 'Days Old',
      render: (inv: InvoiceAging) => (
        <Badge 
          variant={inv.daysOld > 90 ? 'danger' : inv.daysOld > 60 ? 'warning' : 'default'}
          size="sm"
        >
          {inv.daysOld} days
        </Badge>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right' as const,
      render: (inv: InvoiceAging) => (
        <div className="text-right font-medium">
          {inv.balance.toLocaleString('en-US', {
            style: 'currency',
            currency: 'SAR',
          })}
        </div>
      ),
    },
  ], []);

  const handleExport = () => {
    if (!data) return;
    
    // Create CSV content
    const headers = ['Customer Code', 'Customer Name', 'Current', '31-60 Days', '61-90 Days', 'Over 90', 'Total'];
    const rows = data.customers.map(c => [
      c.customer.customerCode,
      c.customer.name,
      c.current,
      c.days31to60,
      c.days61to90,
      c.over90,
      c.total
    ]);
    
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ar-aging-${asOfDate}.csv`;
    a.click();
    
    notify.success('Report exported successfully');
  };

  return (
    <PageTemplate
      title="Accounts Receivable Aging"
      subtitle="Analyze outstanding customer balances by age"
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Accounting', href: '/accounting' },
        { label: 'AR Aging' },
      ]}
      action={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            icon={<Download size={18} />}
            onClick={handleExport}
            disabled={!data || data.customers.length === 0}
          >
            Export CSV
          </Button>
        </div>
      }
      loading={loading}
    >
      {/* Filters */}
      <Section className="mb-6">
        <div className="flex items-center gap-4">
          <FormField label="As of Date" className="w-48">
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </FormField>
          <div className="pt-6">
            <Button variant="outline" onClick={fetchAgingData}>
              Refresh
            </Button>
          </div>
        </div>
      </Section>

      {/* Summary Cards */}
      {data && (
        <Section className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {agingBuckets.map((bucket) => {
              const amount = data.summary[bucket.key as keyof typeof data.summary] as number;
              const percentage = percentages?.[bucket.key as keyof typeof percentages] || 0;
              
              return (
                <div 
                  key={bucket.key}
                  className={clsx(
                    'p-4 rounded-xl border',
                    bucket.color === 'green' && 'bg-green-50 border-green-200',
                    bucket.color === 'yellow' && 'bg-yellow-50 border-yellow-200',
                    bucket.color === 'orange' && 'bg-orange-50 border-orange-200',
                    bucket.color === 'red' && 'bg-red-50 border-red-200',
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <bucket.icon size={16} className={clsx(
                      bucket.color === 'green' && 'text-green-600',
                      bucket.color === 'yellow' && 'text-yellow-600',
                      bucket.color === 'orange' && 'text-orange-600',
                      bucket.color === 'red' && 'text-red-600',
                    )} />
                    <span className={clsx(
                      'text-sm font-medium',
                      bucket.color === 'green' && 'text-green-700',
                      bucket.color === 'yellow' && 'text-yellow-700',
                      bucket.color === 'orange' && 'text-orange-700',
                      bucket.color === 'red' && 'text-red-700',
                    )}>
                      {bucket.label}
                    </span>
                  </div>
                  <div className={clsx(
                    'text-2xl font-bold',
                    bucket.color === 'green' && 'text-green-900',
                    bucket.color === 'yellow' && 'text-yellow-900',
                    bucket.color === 'orange' && 'text-orange-900',
                    bucket.color === 'red' && 'text-red-900',
                  )}>
                    {amount.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'SAR',
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className={clsx(
                    'text-sm mt-1',
                    bucket.color === 'green' && 'text-green-600',
                    bucket.color === 'yellow' && 'text-yellow-600',
                    bucket.color === 'orange' && 'text-orange-600',
                    bucket.color === 'red' && 'text-red-600',
                  )}>
                    {percentage.toFixed(1)}% of total
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total Summary */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Total Receivable</div>
                  <div className="text-2xl font-bold text-slate-900">
                    {data.summary.total.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'SAR',
                    })}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Active Customers</div>
                <div className="text-2xl font-bold text-slate-900">
                  {data.totalCustomers}
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Customers Table */}
      <Section title="Customer Aging Detail">
        <DataTable
          columns={columns}
          data={data?.customers || []}
          keyAccessor={(row: CustomerAging) => row.customer.id}
          emptyState={{
            title: 'No outstanding receivables',
            description: 'All customer invoices are paid up to date',
          }}
        />
      </Section>

      {/* Customer Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedCustomer?.customer.name || 'Customer Details'}
        maxWidth="xl"
      >
        {selectedCustomer && (
          <div className="space-y-6">
            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
              <div>
                <div className="text-sm text-slate-500">Customer Code</div>
                <div className="font-medium">{selectedCustomer.customer.customerCode}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Credit Limit</div>
                <div className="font-medium">
                  {selectedCustomer.customer.creditLimit.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'SAR',
                  })}
                </div>
              </div>
              {selectedCustomer.customer.phone && (
                <div>
                  <div className="text-sm text-slate-500">Phone</div>
                  <div className="font-medium">{selectedCustomer.customer.phone}</div>
                </div>
              )}
              {selectedCustomer.customer.email && (
                <div>
                  <div className="text-sm text-slate-500">Email</div>
                  <div className="font-medium">{selectedCustomer.customer.email}</div>
                </div>
              )}
            </div>

            {/* Aging Summary */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <div className="text-sm text-green-600">Current</div>
                <div className="font-semibold text-green-900">
                  {selectedCustomer.current.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'SAR',
                  })}
                </div>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg text-center">
                <div className="text-sm text-yellow-600">31-60 Days</div>
                <div className="font-semibold text-yellow-900">
                  {selectedCustomer.days31to60.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'SAR',
                  })}
                </div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg text-center">
                <div className="text-sm text-orange-600">61-90 Days</div>
                <div className="font-semibold text-orange-900">
                  {selectedCustomer.days61to90.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'SAR',
                  })}
                </div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <div className="text-sm text-red-600">Over 90</div>
                <div className="font-semibold text-red-900">
                  {selectedCustomer.over90.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'SAR',
                  })}
                </div>
              </div>
            </div>

            {/* Invoices Table */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                Outstanding Invoices ({selectedCustomer.invoices.length})
              </h4>
              <DataTable
                columns={invoiceColumns}
                data={selectedCustomer.invoices}
                keyAccessor={(inv: InvoiceAging) => inv.id}
              />
            </div>

            {/* Total */}
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-slate-500">Total Outstanding</div>
              <div className="text-2xl font-bold text-slate-900">
                {selectedCustomer.total.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'SAR',
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageTemplate>
  );
}
