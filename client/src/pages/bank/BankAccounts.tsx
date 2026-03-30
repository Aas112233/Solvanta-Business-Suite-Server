import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Wallet, RefreshCcw, ArrowRightLeft, Trash2, Edit2, Landmark } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

// Unified Component System
import {
  PageTemplate,
  Section,
  DataTable,
  FormField,
  Input,
  Select,
  useNotification,
  Skeleton,
} from '@/components/system';

// Existing UI components
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import api, { getApiErrorMessage } from '@/lib/api';

// Types
interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  branchName?: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'CASH' | 'CREDIT_CARD' | 'LOAN' | 'INVESTMENT';
  currency: string;
  currentBalance: number;
  openingBalance: number;
  isActive: boolean;
  isDefault: boolean;
  unreconciledCount: number;
  branch?: { name: string; code: string };
  glAccount?: { code: string; name: string };
}

const accountTypeOptions = [
  { value: 'CHECKING', label: 'Checking Account' },
  { value: 'SAVINGS', label: 'Savings Account' },
  { value: 'CASH', label: 'Cash on Hand' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'LOAN', label: 'Loan Account' },
  { value: 'INVESTMENT', label: 'Investment' },
];

const currencyOptions = [
  { value: 'SAR', label: 'SAR - Saudi Riyal' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'AED', label: 'AED - UAE Dirham' },
];

export default function BankAccounts() {
  const navigate = useNavigate();
  const notify = useNotification();
  
  // State
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formData, setFormData] = useState({
    accountName: '',
    accountNumber: '',
    bankName: '',
    branchName: '',
    accountType: 'CHECKING',
    currency: 'SAR',
    openingBalance: '',
    notes: '',
    isDefault: false,
  });

  // Fetch accounts
  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bank/accounts');
      const result = response.data;
      
      if (result.success) {
        setAccounts(result.data);
      } else {
        notify.error('Failed to load bank accounts');
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Error loading bank accounts'));
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
    const totalUnreconciled = accounts.reduce((sum, acc) => sum + acc.unreconciledCount, 0);
    const activeAccounts = accounts.filter(acc => acc.isActive).length;
    
    return { totalBalance, totalUnreconciled, activeAccounts };
  }, [accounts]);

  // Table columns
  const columns = useMemo(() => [
    {
      key: 'accountName',
      header: 'Account',
      render: (account: BankAccount) => (
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            account.isDefault ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
          )}>
            <Landmark size={20} />
          </div>
          <div>
            <div className="font-medium text-slate-900">{account.accountName}</div>
            <div className="text-sm text-slate-500">{account.bankName}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'accountNumber',
      header: 'Account Number',
      render: (account: BankAccount) => (
        <div className="font-mono text-sm">{account.accountNumber}</div>
      ),
    },
    {
      key: 'accountType',
      header: 'Type',
      render: (account: BankAccount) => {
        const typeLabels: Record<string, string> = {
          CHECKING: 'Checking',
          SAVINGS: 'Savings',
          CASH: 'Cash',
          CREDIT_CARD: 'Credit Card',
          LOAN: 'Loan',
          INVESTMENT: 'Investment',
        };
        return (
          <Badge variant="default" size="sm">
            {typeLabels[account.accountType] || account.accountType}
          </Badge>
        );
      },
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right' as const,
      render: (account: BankAccount) => (
        <div className="text-right">
          <div className={clsx(
            'font-medium',
            account.currentBalance >= 0 ? 'text-slate-900' : 'text-red-600'
          )}>
            {account.currentBalance.toLocaleString('en-US', {
              style: 'currency',
              currency: account.currency,
            })}
          </div>
          <div className="text-sm text-slate-500">
            {account.currency}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (account: BankAccount) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {account.isDefault && (
              <Badge variant="brand" size="sm">Default</Badge>
            )}
            {!account.isActive && (
              <Badge variant="danger" size="sm">Inactive</Badge>
            )}
          </div>
          {account.unreconciledCount > 0 && (
            <div className="text-sm text-amber-600">
              {account.unreconciledCount} unreconciled
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (account: BankAccount) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              navigate(`/bank/transactions?accountId=${account.id}`);
            }}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Transactions"
          >
            <ArrowRightLeft size={18} />
          </button>
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              navigate(`/bank/reconcile?accountId=${account.id}`);
            }}
            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Reconcile"
          >
            <RefreshCcw size={18} />
          </button>
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleEdit(account);
            }}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Edit"
          >
            <Edit2 size={18} />
          </button>
          {!account.isDefault && (
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleDelete(account);
              }}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      ),
    },
  ], [navigate]);

  const handleEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setFormData({
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      branchName: account.branchName || '',
      accountType: account.accountType,
      currency: account.currency,
      openingBalance: account.openingBalance.toString(),
      notes: '',
      isDefault: account.isDefault,
    });
    setShowModal(true);
  };

  const handleDelete = async (account: BankAccount) => {
    if (!confirm(`Are you sure you want to delete "${account.accountName}"?`)) {
      return;
    }

    try {
      await api.delete(`/bank/accounts/${account.id}`);
      notify.success('Bank account deleted successfully');
      fetchAccounts();
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Error deleting bank account'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      ...formData,
      openingBalance: parseFloat(formData.openingBalance) || 0,
    };

    try {
      if (editingAccount) {
        await api.put(`/bank/accounts/${editingAccount.id}`, payload);
      } else {
        await api.post('/bank/accounts', payload);
      }

      notify.success(
        editingAccount 
          ? 'Bank account updated successfully' 
          : 'Bank account created successfully'
      );
      setShowModal(false);
      setEditingAccount(null);
      resetForm();
      fetchAccounts();
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Error saving bank account'));
    }
  };

  const resetForm = () => {
    setFormData({
      accountName: '',
      accountNumber: '',
      bankName: '',
      branchName: '',
      accountType: 'CHECKING',
      currency: 'SAR',
      openingBalance: '',
      notes: '',
      isDefault: false,
    });
  };

  const handleRowClick = (account: BankAccount) => {
    navigate(`/bank/transactions?accountId=${account.id}`);
  };

  // Stats cards
  const statsCards = [
    {
      label: 'Total Balance',
      value: stats.totalBalance.toLocaleString('en-US', {
        style: 'currency',
        currency: 'SAR',
      }),
      icon: Wallet,
      color: 'blue',
    },
    {
      label: 'Active Accounts',
      value: stats.activeAccounts.toString(),
      icon: Building2,
      color: 'green',
    },
    {
      label: 'Unreconciled',
      value: stats.totalUnreconciled.toString(),
      icon: RefreshCcw,
      color: stats.totalUnreconciled > 0 ? 'amber' : 'slate',
    },
  ];

  return (
    <PageTemplate
      title="Bank Accounts"
      subtitle="Manage your bank accounts and track balances"
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Banking', href: '/bank' },
        { label: 'Accounts' },
      ]}
      action={
        <Button
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => {
            setEditingAccount(null);
            resetForm();
            setShowModal(true);
          }}
        >
          Add Account
        </Button>
      }
      loading={loading}
    >
      {/* Stats Cards */}
      <Section className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statsCards.map((stat) => (
            <div
              key={stat.label}
              className={clsx(
                'p-4 rounded-xl border',
                stat.color === 'blue' && 'bg-blue-50 border-blue-200',
                stat.color === 'green' && 'bg-green-50 border-green-200',
                stat.color === 'amber' && 'bg-amber-50 border-amber-200',
                stat.color === 'slate' && 'bg-slate-50 border-slate-200',
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  stat.color === 'blue' && 'bg-blue-100 text-blue-600',
                  stat.color === 'green' && 'bg-green-100 text-green-600',
                  stat.color === 'amber' && 'bg-amber-100 text-amber-600',
                  stat.color === 'slate' && 'bg-slate-100 text-slate-600',
                )}>
                  <stat.icon size={20} />
                </div>
                <div>
                  <div className="text-sm text-slate-500">{stat.label}</div>
                  <div className="text-xl font-semibold text-slate-900">
                    {stat.value}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Accounts Table */}
      <Section title="All Accounts">
        <DataTable
          columns={columns}
          data={accounts}
          keyAccessor={(account: BankAccount) => account.id}
          onRowClick={handleRowClick}
          emptyState={{
            title: 'No bank accounts yet',
            description: 'Add your first bank account to start tracking transactions',
            action: (
              <Button
                variant="primary"
                icon={<Plus size={18} />}
                onClick={() => setShowModal(true)}
              >
                Add Account
              </Button>
            ),
          }}
        />
      </Section>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingAccount ? 'Edit Bank Account' : 'Add Bank Account'}
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Account Name" required>
              <Input
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                placeholder="e.g., Main Checking Account"
                fullWidth
              />
            </FormField>

            <FormField label="Bank Name" required>
              <Input
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="e.g., National Bank"
                fullWidth
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Account Number" required>
              <Input
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                placeholder="Account number"
                fullWidth
              />
            </FormField>

            <FormField label="Branch Name">
              <Input
                value={formData.branchName}
                onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                placeholder="Branch location"
                fullWidth
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Account Type" required>
              <Select
                value={formData.accountType}
                onChange={(e) => setFormData({ ...formData, accountType: e.target.value })}
                options={accountTypeOptions}
                fullWidth
              />
            </FormField>

            <FormField label="Currency" required>
              <Select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                options={currencyOptions}
                fullWidth
              />
            </FormField>
          </div>

          {!editingAccount && (
            <FormField label="Opening Balance">
              <Input
                type="number"
                value={formData.openingBalance}
                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                placeholder="0.00"
                fullWidth
              />
            </FormField>
          )}

          <FormField label="Notes">
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional information..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </FormField>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={formData.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isDefault" className="text-sm text-slate-700">
              Set as default account
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingAccount ? 'Update Account' : 'Create Account'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageTemplate>
  );
}
