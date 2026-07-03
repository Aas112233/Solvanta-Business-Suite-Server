import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Calculator,
  DollarSign,
  Clock,
  TrendingDown,
  Building2,
  XCircle,
  Loader2,
  ExternalLink,
  BookOpen
} from 'lucide-react';

import {
  PageTemplate,
  Section,
  Select,
  FormField,
  Input,
} from '@/components/system';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface DepreciationLog {
  id: string;
  depreciationDate: string;
  amount: number;
  journalEntryId?: string;
  journalEntry?: {
    id: string;
    entryNo: string;
    date: string;
  };
}

interface FixedAsset {
  id: string;
  assetCode: string;
  name: string;
  description?: string;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: 'STRAIGHT_LINE' | 'DOUBLE_DECLINING';
  status: 'ACTIVE' | 'FULLY_DEPRECIATED' | 'DISPOSED';
  currentAccumDepreciation: number;
  assetAccountId: string;
  accumDepAccountId: string;
  depExpAccountId: string;
  assetAccount: { code: string; name: string };
  accumDepAccount: { code: string; name: string };
  depExpAccount: { code: string; name: string };
  branch?: { name: string };
  disposalDate?: string;
  disposalAmount?: number;
  disposalMemo?: string;
  disposalJournalId?: string;
  depreciationLogs: DepreciationLog[];
}

export default function FixedAssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Modal states
  const [isDepreciateModalOpen, setIsDepreciateModalOpen] = useState(false);
  const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
  const [depError, setDepError] = useState('');
  const [disposalError, setDisposalError] = useState('');

  // Action Form states
  const [depreciationDate, setDepreciationDate] = useState(new Date().toISOString().slice(0, 10));
  const [disposalData, setDisposalData] = useState({
    disposalDate: new Date().toISOString().slice(0, 10),
    disposalAmount: '0',
    disposalMemo: '',
    settlementAccountId: '',
    gainLossAccountId: ''
  });

  // Queries
  const { data: asset, isLoading, error } = useQuery<FixedAsset>({
    queryKey: ['fixedAsset', id],
    queryFn: async () => {
      const res = await api.get(`/fixed-assets/${id}`);
      return res.data.data;
    },
    enabled: !!id
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-lite'],
    queryFn: async () => {
      const res = await api.get('/accounting/accounts');
      return res.data.data;
    }
  });

  // Mutations
  const depreciateMutation = useMutation({
    mutationFn: async (date: string) => {
      const res = await api.post(`/fixed-assets/${id}/depreciate`, { depreciationDate: date });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fixedAsset', id] });
      setIsDepreciateModalOpen(false);
      setDepError('');
      alert(data.message || 'Depreciation logged and posted successfully');
    },
    onError: (err: any) => {
      setDepError(err.response?.data?.error?.message || 'Failed to run depreciation');
    }
  });

  const disposeMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post(`/fixed-assets/${id}/dispose`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixedAsset', id] });
      setIsDisposeModalOpen(false);
      setDisposalError('');
      alert('Asset disposed and posted successfully');
    },
    onError: (err: any) => {
      setDisposalError(err.response?.data?.error?.message || 'Failed to dispose asset');
    }
  });

  if (isLoading) {
    return (
      <PageTemplate
        title="Fixed Asset"
        loading={true}
        maxWidth="full"
      >
        <div />
      </PageTemplate>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-4">
        <XCircle className="w-16 h-16 text-danger mx-auto" />
        <h3 className="text-xl font-bold text-text-primary">Fixed Asset Not Found</h3>
        <p className="text-text-tertiary">The asset you are looking for might have been removed or does not exist.</p>
        <Button
          variant="outline"
          icon={<ArrowLeft size={16} />}
          onClick={() => navigate('/accounting/fixed-assets')}
        >
          Back to Register
        </Button>
      </div>
    );
  }

  const handleDepreciateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDepError('');
    depreciateMutation.mutate(depreciationDate);
  };

  const handleDisposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDisposalError('');

    if (!disposalData.disposalDate) return setDisposalError('Disposal date is required');
    if (Number(disposalData.disposalAmount) < 0) return setDisposalError('Disposal proceeds must be non-negative');
    if (!disposalData.settlementAccountId) return setDisposalError('Bank/Settlement account is required');
    if (!disposalData.gainLossAccountId) return setDisposalError('Gain/Loss write-off account is required');

    disposeMutation.mutate({
      disposalDate: disposalData.disposalDate,
      disposalAmount: Number(disposalData.disposalAmount),
      disposalMemo: disposalData.disposalMemo || undefined,
      settlementAccountId: disposalData.settlementAccountId,
      gainLossAccountId: disposalData.gainLossAccountId
    });
  };

  // Calculations
  const nbv = asset.purchaseCost - asset.currentAccumDepreciation;
  const progressPercent = Math.min(
    100,
    Math.round((asset.currentAccumDepreciation / (asset.purchaseCost - asset.salvageValue || 1)) * 100)
  );

  // Remaining useful life estimation
  const monthsDepreciated = asset.depreciationLogs.length;
  const remainingMonths = Math.max(0, asset.usefulLifeMonths - monthsDepreciated);

  return (
    <PageTemplate
      title={asset.name}
      subtitle={`ID: ${asset.assetCode}`}
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Accounting', href: '/accounting' },
        { label: 'Fixed Assets', href: '/accounting/fixed-assets' },
        { label: asset.name },
      ]}
      action={
        asset.status === 'ACTIVE' ? (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="text-danger border-danger/30 hover:bg-danger-soft"
              onClick={() => setIsDisposeModalOpen(true)}
            >
              Dispose Asset
            </Button>
            <Button
              variant="primary"
              icon={<Calculator size={16} />}
              onClick={() => setIsDepreciateModalOpen(true)}
            >
              Log Depreciation
            </Button>
          </div>
        ) : undefined
      }
      maxWidth="full"
    >
      {/* Status badge */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
          asset.status === 'ACTIVE'
            ? 'bg-success-soft text-success'
            : asset.status === 'FULLY_DEPRECIATED'
            ? 'bg-brand-50 text-text-brand'
            : 'bg-danger-soft text-danger'
        }`}>
          {asset.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel: Info and Logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* General Specs */}
          <Section variant="card" title="Asset Parameters">
            {asset.description && (
              <div className="p-4 bg-background-subtle rounded-lg text-sm text-text-secondary mb-4">
                <span className="font-semibold block text-xs text-text-tertiary uppercase mb-1">Description</span>
                {asset.description}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-background-subtle rounded-lg text-text-tertiary">
                  <Calendar size={18} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-text-tertiary uppercase">Purchase Date</span>
                  <span className="text-sm font-bold text-text-primary">
                    {new Date(asset.purchaseDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-background-subtle rounded-lg text-text-tertiary">
                  <Clock size={18} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-text-tertiary uppercase">Useful Life</span>
                  <span className="text-sm font-bold text-text-primary">{asset.usefulLifeMonths} Months</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-background-subtle rounded-lg text-text-tertiary">
                  <BookOpen size={18} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-text-tertiary uppercase">Method</span>
                  <span className="text-sm font-bold text-text-primary">
                    {asset.depreciationMethod === 'STRAIGHT_LINE' ? 'Straight Line' : 'Double Declining'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-background-subtle rounded-lg text-text-tertiary">
                  <DollarSign size={18} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-text-tertiary uppercase">Original Cost</span>
                  <span className="text-sm font-bold text-text-primary">${asset.purchaseCost.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-background-subtle rounded-lg text-text-tertiary">
                  <TrendingDown size={18} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-text-tertiary uppercase">Salvage Value</span>
                  <span className="text-sm font-bold text-text-primary">${asset.salvageValue.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-background-subtle rounded-lg text-text-tertiary">
                  <Building2 size={18} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-text-tertiary uppercase">Branch Context</span>
                  <span className="text-sm font-bold text-text-primary">{asset.branch?.name || 'Global'}</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Depreciation Logs */}
          <Section variant="card" title="Depreciation History">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background-subtle border-b border-border">
                    <th className="px-4 py-3 text-xs font-bold text-text-tertiary uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-tertiary uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-tertiary uppercase tracking-wider">Linked Journal Entry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {asset.depreciationLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-text-tertiary italic">
                        No depreciation runs logged yet.
                      </td>
                    </tr>
                  ) : (
                    asset.depreciationLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-background-subtle/30">
                        <td className="px-4 py-3 text-text-primary">
                          {new Date(log.depreciationDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-danger">
                          -${log.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          {log.journalEntry ? (
                            <Link
                              to={`/accounting/journals?search=${log.journalEntry.entryNo}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-text-brand hover:underline"
                            >
                              {log.journalEntry.entryNo}
                              <ExternalLink size={12} />
                            </Link>
                          ) : (
                            <span className="text-xs text-text-tertiary italic">None</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {/* Right panel: Net book value, Mappings, Disposal */}
        <div className="space-y-6">
          {/* Net Book Value Card */}
          <div className="p-6 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-xl shadow-md space-y-4">
            <div>
              <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest block">Net Book Value</span>
              <h2 className="text-3xl font-extrabold mt-1">
                ${nbv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>

            <div className="space-y-2 text-sm text-indigo-100 border-t border-indigo-500/30 pt-3">
              <div className="flex justify-between">
                <span>Asset Cost:</span>
                <span className="font-semibold">${asset.purchaseCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Accum. Depreciation:</span>
                <span className="font-semibold">-${asset.currentAccumDepreciation.toFixed(2)}</span>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-indigo-200">
                <span>Depreciation Progress</span>
                <span className="font-bold">{progressPercent}%</span>
              </div>
              <div className="bg-white/10 rounded-full h-2 overflow-hidden w-full">
                <div className="bg-white h-full" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {/* Life estimations */}
            <div className="text-xs text-indigo-200 border-t border-indigo-500/30 pt-3 flex justify-between">
              <span>Remaining Months:</span>
              <span className="font-bold text-white">{remainingMonths} / {asset.usefulLifeMonths} Months</span>
            </div>
          </div>

          {/* Linked Accounts Mapping */}
          <Section variant="card">
            <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-4">GL Integrations</h4>
            <div className="space-y-3">
              <div className="p-3 bg-background-subtle rounded-lg">
                <span className="block text-[10px] font-bold text-text-tertiary uppercase">Asset GL Account</span>
                <span className="text-sm font-semibold text-text-primary">
                  {asset.assetAccount.code} - {asset.assetAccount.name}
                </span>
              </div>
              <div className="p-3 bg-background-subtle rounded-lg">
                <span className="block text-[10px] font-bold text-text-tertiary uppercase">Contra-Asset Account (Acc. Dep.)</span>
                <span className="text-sm font-semibold text-text-primary">
                  {asset.accumDepAccount.code} - {asset.accumDepAccount.name}
                </span>
              </div>
              <div className="p-3 bg-background-subtle rounded-lg">
                <span className="block text-[10px] font-bold text-text-tertiary uppercase">Depreciation Expense Account</span>
                <span className="text-sm font-semibold text-text-primary">
                  {asset.depExpAccount.code} - {asset.depExpAccount.name}
                </span>
              </div>
            </div>
          </Section>

          {/* Disposal Details (If Disposed) */}
          {asset.status === 'DISPOSED' && (
            <div className="p-6 bg-danger-soft border border-danger/20 rounded-xl space-y-4">
              <div className="flex items-center gap-2 text-danger">
                <XCircle size={22} className="shrink-0" />
                <h4 className="text-sm font-bold uppercase tracking-wider">Asset Disposed</h4>
              </div>

              <div className="space-y-2 text-sm text-text-secondary">
                <div>
                  <span className="block text-[10px] font-bold text-text-tertiary uppercase">Disposal Date</span>
                  <span className="font-semibold text-text-primary">
                    {asset.disposalDate ? new Date(asset.disposalDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-text-tertiary uppercase">Proceeds (Salvage Proceeds)</span>
                  <span className="font-bold text-text-primary">
                    ${asset.disposalAmount?.toFixed(2) || '0.00'}
                  </span>
                </div>
                {asset.disposalMemo && (
                  <div>
                    <span className="block text-[10px] font-bold text-text-tertiary uppercase">Disposal Notes</span>
                    <span className="italic block mt-0.5 text-xs">{asset.disposalMemo}</span>
                  </div>
                )}
                {asset.disposalJournalId && (
                  <div className="pt-2 border-t border-danger/10">
                    <Link
                      to={`/accounting/journals?id=${asset.disposalJournalId}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-danger hover:underline"
                    >
                      View Disposal Journal Entry
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Log Depreciation */}
      <Modal
        isOpen={isDepreciateModalOpen}
        onClose={() => setIsDepreciateModalOpen(false)}
        title="Depreciate Asset"
        maxWidth="md"
      >
        <form onSubmit={handleDepreciateSubmit} className="space-y-4">
          {depError && (
            <div className="p-3 text-sm text-danger bg-danger-soft rounded-lg border border-danger/20">
              {depError}
            </div>
          )}

          <FormField label="Depreciation Date" required>
            <Input
              type="date"
              value={depreciationDate}
              onChange={(e) => setDepreciationDate(e.target.value)}
              fullWidth
            />
          </FormField>

          <p className="text-xs text-text-tertiary">
            The system will calculate the monthly amount and automatically post a journal entry.
          </p>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsDepreciateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={depreciateMutation.isPending}>
              {depreciateMutation.isPending ? 'Logging...' : 'Post Depreciation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Dispose Asset */}
      <Modal
        isOpen={isDisposeModalOpen}
        onClose={() => setIsDisposeModalOpen(false)}
        title="Dispose Fixed Asset"
        maxWidth="lg"
      >
        <form onSubmit={handleDisposeSubmit} className="space-y-4">
          {disposalError && (
            <div className="p-3 text-sm text-danger bg-danger-soft rounded-lg border border-danger/20">
              {disposalError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Disposal Date" required>
              <Input
                type="date"
                value={disposalData.disposalDate}
                onChange={(e) => setDisposalData(p => ({ ...p, disposalDate: e.target.value }))}
                fullWidth
              />
            </FormField>

            <FormField label="Disposal proceeds ($)" required>
              <Input
                type="number"
                step="0.01"
                value={disposalData.disposalAmount}
                onChange={(e) => setDisposalData(p => ({ ...p, disposalAmount: e.target.value }))}
                fullWidth
              />
            </FormField>
          </div>

          <FormField label="Settlement/Bank GL Account" required>
            <Select
              value={disposalData.settlementAccountId}
              onChange={(e) => setDisposalData(p => ({ ...p, settlementAccountId: e.target.value }))}
              options={accounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name} (${a.type})` }))}
              placeholder="Select bank or receivables account"
              fullWidth
            />
          </FormField>

          <p className="text-xs text-text-tertiary -mt-2">The account where proceeds will be deposited (Debit entry).</p>

          <FormField label="Gain/Loss on Disposal GL Account" required>
            <Select
              value={disposalData.gainLossAccountId}
              onChange={(e) => setDisposalData(p => ({ ...p, gainLossAccountId: e.target.value }))}
              options={accounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name} (${a.type})` }))}
              placeholder="Select Gain/Loss on Disposal account"
              fullWidth
            />
          </FormField>

          <p className="text-xs text-text-tertiary -mt-2">Account to balance gains/losses between NBV and proceeds.</p>

          <FormField label="Disposal Notes / Memo">
            <textarea
              placeholder="Reason for disposal, customer or buyer name, receipt references..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background-card text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand"
              value={disposalData.disposalMemo}
              onChange={(e) => setDisposalData(p => ({ ...p, disposalMemo: e.target.value }))}
            />
          </FormField>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsDisposeModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" loading={disposeMutation.isPending}>
              {disposeMutation.isPending ? 'Processing...' : 'Post Disposal'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageTemplate>
  );
}
