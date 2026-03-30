import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  Save,
  Calculator,
  FileUp,
  Download
} from 'lucide-react';
import { clsx } from 'clsx';

// Unified Component System
import {
  PageTemplate,
  Section,
  DataTable,
  FormField,
  Input,
  useNotification,
  Skeleton,
} from '@/components/system';

// Existing UI components
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';

// Types
interface BankAccount {
  id: string;
  accountName: string;
  bankName: string;
  currentBalance: number;
  currency: string;
}

interface BankTransaction {
  id: string;
  transactionDate: string;
  description: string;
  reference?: string;
  transactionType: string;
  amount: number;
  isReconciled: boolean;
}

interface Reconciliation {
  id: string;
  statementDate: string;
  statementNumber?: string;
  openingBalance: number;
  closingBalance: number;
  statementBalance: number;
  systemBalance: number;
  difference: number;
  status: 'UNRECONCILED' | 'PARTIAL' | 'RECONCILED';
  totalTransactions: number;
  reconciledCount: number;
}

export default function BankReconciliation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const notify = useNotification();
  
  const accountId = searchParams.get('accountId');

  // State
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeReconciliation, setActiveReconciliation] = useState<Reconciliation | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState({
    statementDate: new Date().toISOString().split('T')[0],
    statementNumber: '',
    closingBalance: '',
    openingBalance: '',
  });

  // Load data
  useEffect(() => {
    fetchAccounts();
    fetchReconciliations();
  }, []);

  useEffect(() => {
    if (accountId && accounts.length > 0) {
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        setSelectedAccount(account);
        setFormData(prev => ({
          ...prev,
          openingBalance: account.currentBalance.toString(),
        }));
      }
    }
  }, [accountId, accounts]);

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/bank/accounts');
      const result = await response.json();
      if (result.success) {
        setAccounts(result.data);
      }
    } catch (error) {
      notify.error('Failed to load accounts');
    }
  };

  const fetchReconciliations = async () => {
    try {
      setLoading(true);
      const url = accountId 
        ? `/api/bank/reconciliations?bankAccountId=${accountId}`
        : '/api/bank/reconciliations';
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setReconciliations(result.data);
      }
    } catch (error) {
      notify.error('Failed to load reconciliations');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreconciledTransactions = async (accountId: string, recId: string) => {
    try {
      const response = await fetch(
        `/api/bank/transactions?bankAccountId=${accountId}&isReconciled=false`
      );
      const result = await response.json();
      
      if (result.success) {
        setTransactions(result.data.data);
      }
    } catch (error) {
      notify.error('Failed to load transactions');
    }
  };

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAccount) {
      notify.error('Please select a bank account');
      return;
    }

    try {
      const response = await fetch('/api/bank/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: selectedAccount.id,
          statementDate: formData.statementDate,
          statementNumber: formData.statementNumber,
          closingBalance: parseFloat(formData.closingBalance),
          openingBalance: parseFloat(formData.openingBalance) || selectedAccount.currentBalance,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        notify.success('Reconciliation created successfully');
        setShowNewModal(false);
        setActiveReconciliation(result.data);
        fetchUnreconciledTransactions(selectedAccount.id, result.data.id);
        fetchReconciliations();
      } else {
        const error = await response.json();
        notify.error(error.error?.message || 'Failed to create reconciliation');
      }
    } catch (error) {
      notify.error('Error creating reconciliation');
    }
  };

  const handleMatchTransactions = async () => {
    if (!activeReconciliation || selectedTransactions.size === 0) return;

    try {
      const response = await fetch(`/api/bank/reconciliations/${activeReconciliation.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: Array.from(selectedTransactions),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        notify.success(`${selectedTransactions.size} transactions matched`);
        setActiveReconciliation(result.data);
        setSelectedTransactions(new Set());
        
        // Refresh transactions
        if (selectedAccount) {
          fetchUnreconciledTransactions(selectedAccount.id, activeReconciliation.id);
        }
        fetchReconciliations();
      } else {
        notify.error('Failed to match transactions');
      }
    } catch (error) {
      notify.error('Error matching transactions');
    }
  };

  const handleCompleteReconciliation = async () => {
    if (!activeReconciliation) return;

    try {
      const response = await fetch(`/api/bank/reconciliations/${activeReconciliation.id}/complete`, {
        method: 'POST',
      });

      if (response.ok) {
        notify.success('Reconciliation completed successfully');
        setActiveReconciliation(null);
        fetchReconciliations();
      } else {
        const error = await response.json();
        notify.error(error.error?.message || 'Failed to complete reconciliation');
      }
    } catch (error) {
      notify.error('Error completing reconciliation');
    }
  };

  const toggleTransactionSelection = (id: string) => {
    const newSelection = new Set(selectedTransactions);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedTransactions(newSelection);
  };

  const selectAllTransactions = () => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(transactions.map(t => t.id)));
    }
  };

  // Calculations
  const selectedTotal = useMemo(() => {
    return transactions
      .filter(t => selectedTransactions.has(t.id))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, selectedTransactions]);

  const difference = activeReconciliation 
    ? activeReconciliation.closingBalance - (activeReconciliation.systemBalance - selectedTotal)
    : 0;

  // Table columns for transactions
  const transactionColumns = useMemo(() => [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={transactions.length > 0 && selectedTransactions.size === transactions.length}
          onChange={selectAllTransactions}
          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
        />
      ),
      cell: (transaction: BankTransaction) => (
        <input
          type="checkbox"
          checked={selectedTransactions.has(transaction.id)}
          onChange={() => toggleTransactionSelection(transaction.id)}
          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
        />
      ),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (transaction: BankTransaction) => (
        <div className="text-sm">
          {new Date(transaction.transactionDate).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      cell: (transaction: BankTransaction) => (
        <div>
          <div className="font-medium text-slate-900">{transaction.description}</div>
          {transaction.reference && (
            <div className="text-sm text-slate-500">Ref: {transaction.reference}</div>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (transaction: BankTransaction) => (
        <Badge variant="secondary" size="sm">
          {transaction.transactionType.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      cell: (transaction: BankTransaction) => (
        <div className={clsx(
          'font-medium text-right',
          transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
        )}>
          {transaction.amount >= 0 ? '+' : ''}
          {Math.abs(transaction.amount).toLocaleString('en-US', {
            style: 'currency',
            currency: selectedAccount?.currency || 'SAR',
          })}
        </div>
      ),
    },
  ], [transactions, selectedTransactions, selectedAccount]);

  // Table columns for reconciliations list
  const reconciliationColumns = useMemo(() => [
    {
      key: 'date',
      header: 'Statement Date',
      cell: (rec: Reconciliation) => (
        <div className="font-medium">
          {new Date(rec.statementDate).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'account',
      header: 'Account',
      cell: (rec: Reconciliation) => (
        <div>
          <div className="font-medium">{rec.bankAccount?.accountName}</div>
          <div className="text-sm text-slate-500">{rec.bankAccount?.bankName}</div>
        </div>
      ),
    },
    {
      key: 'statementNumber',
      header: 'Statement #',
      cell: (rec: Reconciliation) => rec.statementNumber || '-',
    },
    {
      key: 'closingBalance',
      header: 'Closing Balance',
      align: 'right' as const,
      cell: (rec: Reconciliation) => (
        <div className="text-right font-medium">
          {rec.closingBalance.toLocaleString('en-US', {
            style: 'currency',
            currency: rec.bankAccount?.currency || 'SAR',
          })}
        </div>
      ),
    },
    {
      key: 'difference',
      header: 'Difference',
      align: 'right' as const,
      cell: (rec: Reconciliation) => (
        <div className={clsx(
          'text-right font-medium',
          Math.abs(rec.difference) < 0.01 ? 'text-green-600' : 'text-red-600'
        )}>
          {rec.difference.toLocaleString('en-US', {
            style: 'currency',
            currency: rec.bankAccount?.currency || 'SAR',
          })}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (rec: Reconciliation) => {
        const statusConfig = {
          UNRECONCILED: { variant: 'warning' as const, label: 'Unreconciled' },
          PARTIAL: { variant: 'primary' as const, label: 'In Progress' },
          RECONCILED: { variant: 'success' as const, label: 'Reconciled' },
        };
        const config = statusConfig[rec.status];
        return <Badge variant={config.variant}>{config.label}</Badge>;
      },
    },
    {
      key: 'progress',
      header: 'Progress',
      cell: (rec: Reconciliation) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${(rec.reconciledCount / rec.totalTransactions) * 100}%` }}
            />
          </div>
          <span className="text-sm text-slate-500">
            {rec.reconciledCount}/{rec.totalTransactions}
          </span>
        </div>
      ),
    },
  ], []);

  // If in active reconciliation mode
  if (activeReconciliation) {
    return (
      <PageTemplate
        title={`Reconciling: ${selectedAccount?.accountName}`}
        subtitle={`Statement Date: ${new Date(activeReconciliation.statementDate).toLocaleDateString()}`}
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Banking', href: '/bank' },
          { label: 'Reconciliation', href: '/bank/reconcile' },
          { label: 'Active' },
        ]}
        action={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              icon={<ArrowLeft size={18} />}
              onClick={() => setActiveReconciliation(null)}
            >
              Back to List
            </Button>
          </div>
        }
      >
        {/* Reconciliation Summary */}
        <Section className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-sm text-slate-500 mb-1">Opening Balance</div>
              <div className="text-xl font-semibold text-slate-900">
                {activeReconciliation.openingBalance.toLocaleString('en-US', {
                  style: 'currency',
                  currency: selectedAccount?.currency || 'SAR',
                })}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-sm text-slate-500 mb-1">Statement Closing</div>
              <div className="text-xl font-semibold text-slate-900">
                {activeReconciliation.closingBalance.toLocaleString('en-US', {
                  style: 'currency',
                  currency: selectedAccount?.currency || 'SAR',
                })}
              </div>
            </div>
            
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="text-sm text-blue-600 mb-1">Selected for Match</div>
              <div className="text-xl font-semibold text-blue-700">
                {selectedTotal.toLocaleString('en-US', {
                  style: 'currency',
                  currency: selectedAccount?.currency || 'SAR',
                })}
              </div>
              <div className="text-sm text-blue-600">
                {selectedTransactions.size} transactions
              </div>
            </div>
            
            <div className={clsx(
              'p-4 rounded-xl border',
              Math.abs(difference) < 0.01 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            )}>
              <div className={clsx(
                'text-sm mb-1',
                Math.abs(difference) < 0.01 ? 'text-green-600' : 'text-red-600'
              )}>
                Difference
              </div>
              <div className={clsx(
                'text-xl font-semibold',
                Math.abs(difference) < 0.01 ? 'text-green-700' : 'text-red-700'
              )}>
                {difference.toLocaleString('en-US', {
                  style: 'currency',
                  currency: selectedAccount?.currency || 'SAR',
                })}
              </div>
            </div>
          </div>
        </Section>

        {/* Actions */}
        <Section className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                icon={<CheckCircle2 size={18} />}
                onClick={handleMatchTransactions}
                disabled={selectedTransactions.size === 0}
              >
                Match Selected ({selectedTransactions.size})
              </Button>
              <Button
                variant="outline"
                icon={<FileUp size={18} />}
                onClick={() => setShowImportModal(true)}
              >
                Import Statement
              </Button>
            </div>
            
            {Math.abs(difference) < 0.01 && (
              <Button
                variant="success"
                icon={<Save size={18} />}
                onClick={handleCompleteReconciliation}
              >
                Complete Reconciliation
              </Button>
            )}
          </div>
        </Section>

        {/* Unreconciled Transactions */}
        <Section 
          title="Unreconciled Transactions"
          subtitle={`${transactions.length} transactions waiting to be matched`}
        >
          <DataTable
            columns={transactionColumns}
            data={transactions}
            keyExtractor={(t) => t.id}
          />
        </Section>
      </PageTemplate>
    );
  }

  // Default view - reconciliations list
  return (
    <PageTemplate
      title="Bank Reconciliation"
      subtitle="Match your bank statements with system transactions"
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Banking', href: '/bank' },
        { label: 'Reconciliation' },
      ]}
      action={
        <Button
          variant="primary"
          icon={<RefreshCcw size={18} />}
          onClick={() => setShowNewModal(true)}
        >
          New Reconciliation
        </Button>
      }
      loading={loading}
    >
      {/* Reconciliations Table */}
      <Section>
        <DataTable
          columns={reconciliationColumns}
          data={reconciliations}
          keyExtractor={(rec) => rec.id}
          onRowClick={(rec) => {
            if (rec.status !== 'RECONCILED') {
              setActiveReconciliation(rec);
              const account = accounts.find(a => a.id === rec.bankAccountId);
              if (account) {
                setSelectedAccount(account);
                fetchUnreconciledTransactions(account.id, rec.id);
              }
            }
          }}
          emptyState={{
            icon: <RefreshCcw size={48} className="text-slate-300" />,
            title: 'No reconciliations yet',
            description: 'Start a new reconciliation to match your bank statement',
            action: (
              <Button
                variant="primary"
                icon={<RefreshCcw size={18} />}
                onClick={() => setShowNewModal(true)}
              >
                Start Reconciliation
              </Button>
            ),
          }}
        />
      </Section>

      {/* New Reconciliation Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Bank Reconciliation"
        size="lg"
      >
        <form onSubmit={handleCreateReconciliation} className="space-y-4">
          <FormField label="Bank Account" required>
            <Select
              value={selectedAccount?.id || ''}
              onChange={(value) => {
                const account = accounts.find(a => a.id === value);
                setSelectedAccount(account || null);
                if (account) {
                  setFormData(prev => ({
                    ...prev,
                    openingBalance: account.currentBalance.toString(),
                  }));
                }
              }}
              options={accounts.map(acc => ({
                value: acc.id,
                label: `${acc.bankName} - ${acc.accountName}`,
              }))}
              placeholder="Select bank account"
              fullWidth
            />
          </FormField>

          {selectedAccount && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-700">
                Current Balance: {' '}
                <span className="font-semibold">
                  {selectedAccount.currentBalance.toLocaleString('en-US', {
                    style: 'currency',
                    currency: selectedAccount.currency,
                  })}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Statement Date" required>
              <Input
                type="date"
                value={formData.statementDate}
                onChange={(e) => setFormData({ ...formData, statementDate: e.target.value })}
                fullWidth
              />
            </FormField>

            <FormField label="Statement Number">
              <Input
                value={formData.statementNumber}
                onChange={(e) => setFormData({ ...formData, statementNumber: e.target.value })}
                placeholder="e.g., STMT-001"
                fullWidth
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Opening Balance">
              <Input
                type="number"
                value={formData.openingBalance}
                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                placeholder="0.00"
                fullWidth
              />
            </FormField>

            <FormField label="Closing Balance (from statement)" required>
              <Input
                type="number"
                value={formData.closingBalance}
                onChange={(e) => setFormData({ ...formData, closingBalance: e.target.value })}
                placeholder="0.00"
                fullWidth
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowNewModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              type="submit"
              disabled={!selectedAccount || !formData.closingBalance}
            >
              Start Reconciliation
            </Button>
          </div>
        </form>
      </Modal>
    </PageTemplate>
  );
}

// Import Select component
function Select({ 
  value, 
  onChange, 
  options, 
  placeholder,
  fullWidth 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  options: { value: string; label: string }[];
  placeholder?: string;
  fullWidth?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500',
        'disabled:bg-slate-50 disabled:text-slate-400',
        fullWidth && 'w-full'
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
