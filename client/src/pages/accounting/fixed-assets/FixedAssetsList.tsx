import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Calculator,
  DollarSign,
  TrendingDown,
  Building2,
  Eye,
  Loader2,
  Settings,
  HelpCircle
} from 'lucide-react';

import {
  PageTemplate,
  Section,
  Select,
  Input,
  FormField,
} from '@/components/system';
import { KpiCard, FilterBar } from '@/components/ui';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api';

interface Branch {
  id: string;
  name: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
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
  assetAccount: { code: string; name: string };
  accumDepAccount: { code: string; name: string };
  depExpAccount: { code: string; name: string };
  branch?: { name: string };
}

export default function FixedAssetsList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Filters and Search State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  // Modal states
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isBatchDepModalOpen, setIsBatchDepModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [batchError, setBatchError] = useState('');

  // Registration Form State
  const [formData, setFormData] = useState({
    name: '',
    assetCode: '',
    description: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseCost: '',
    salvageValue: '0',
    usefulLifeMonths: '60',
    depreciationMethod: 'STRAIGHT_LINE',
    assetAccountId: '',
    accumDepAccountId: '',
    depExpAccountId: '',
    branchId: ''
  });

  // Batch Depreciation Form State
  const [depreciationDate, setDepreciationDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)
  );

  // Queries
  const { data: assetsRes, isLoading } = useQuery({
    queryKey: ['fixedAssets', search, statusFilter, branchFilter],
    queryFn: async () => {
      const res = await api.get('/fixed-assets', {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
          branchId: branchFilter || undefined,
          take: 100
        }
      });
      return res.data.data as FixedAsset[];
    }
  });

  const assets = assetsRes || [];

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches-lite'],
    queryFn: async () => {
      const res = await api.get('/branches');
      return res.data.data;
    }
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-lite'],
    queryFn: async () => {
      const res = await api.get('/accounting/accounts');
      return res.data.data;
    }
  });

  // Mutations
  const registerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/fixed-assets', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixedAssets'] });
      setIsRegisterModalOpen(false);
      resetRegisterForm();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error?.message || 'Failed to register asset');
    }
  });

  const batchDeprecateMutation = useMutation({
    mutationFn: async (date: string) => {
      const res = await api.post('/fixed-assets/depreciate-all', { depreciationDate: date });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fixedAssets'] });
      setIsBatchDepModalOpen(false);
      alert(data.message || 'Batch depreciation run finished successfully');
    },
    onError: (err: any) => {
      setBatchError(err.response?.data?.error?.message || 'Batch depreciation run failed');
    }
  });

  const resetRegisterForm = () => {
    setFormData({
      name: '',
      assetCode: '',
      description: '',
      purchaseDate: new Date().toISOString().slice(0, 10),
      purchaseCost: '',
      salvageValue: '0',
      usefulLifeMonths: '60',
      depreciationMethod: 'STRAIGHT_LINE',
      assetAccountId: '',
      accumDepAccountId: '',
      depExpAccountId: '',
      branchId: ''
    });
    setFormError('');
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) return setFormError('Asset name is required');
    if (!formData.purchaseCost || Number(formData.purchaseCost) <= 0) return setFormError('Purchase cost must be a positive number');
    if (Number(formData.salvageValue) < 0) return setFormError('Salvage value must be non-negative');
    if (!formData.usefulLifeMonths || Number(formData.usefulLifeMonths) <= 0) return setFormError('Useful life must be a positive integer');
    if (!formData.assetAccountId) return setFormError('Asset Account mapping is required');
    if (!formData.accumDepAccountId) return setFormError('Accumulated Depreciation Account is required');
    if (!formData.depExpAccountId) return setFormError('Depreciation Expense Account is required');

    registerMutation.mutate({
      name: formData.name,
      assetCode: formData.assetCode || undefined,
      description: formData.description || undefined,
      purchaseDate: formData.purchaseDate,
      purchaseCost: Number(formData.purchaseCost),
      salvageValue: Number(formData.salvageValue),
      usefulLifeMonths: parseInt(formData.usefulLifeMonths, 10),
      depreciationMethod: formData.depreciationMethod,
      assetAccountId: formData.assetAccountId,
      accumDepAccountId: formData.accumDepAccountId,
      depExpAccountId: formData.depExpAccountId,
      branchId: formData.branchId || undefined
    });
  };

  const handleBatchDepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBatchError('');
    if (!depreciationDate) return setBatchError('Depreciation date is required');
    batchDeprecateMutation.mutate(depreciationDate);
  };

  // Derived Statistics
  const activeAssets = assets.filter(a => a.status !== 'DISPOSED');
  const totalAssetsVal = activeAssets.reduce((sum, a) => sum + a.purchaseCost, 0);
  const totalAccumDepVal = activeAssets.reduce((sum, a) => sum + a.currentAccumDepreciation, 0);
  const netBookVal = totalAssetsVal - totalAccumDepVal;
  const totalCount = assets.length;

  // Filter GL Accounts for different types if applicable
  const assetAccountsOptions = accounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name} (${a.type})` }));

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'FULLY_DEPRECIATED', label: 'Fully Depreciated' },
    { value: 'DISPOSED', label: 'Disposed' },
  ];

  const branchOptions = [
    { value: '', label: 'All Branches' },
    ...branches.map(b => ({ value: b.id, label: b.name })),
  ];

  const formatCurrency = (value: number) =>
    '$' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <PageTemplate
      title="Fixed Assets Register"
      subtitle="Register company fixed assets, automate month-end depreciation runs, and track disposals."
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Accounting', href: '/accounting' },
        { label: 'Fixed Assets' },
      ]}
      action={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            icon={<Calculator size={16} />}
            onClick={() => setIsBatchDepModalOpen(true)}
          >
            Run Depreciation
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={18} />}
            onClick={() => setIsRegisterModalOpen(true)}
          >
            New Asset
          </Button>
        </div>
      }
      loading={isLoading}
      maxWidth="full"
    >
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Count"
          value={`${totalCount} Assets`}
          icon={<Building2 className="w-6 h-6 text-text-brand" />}
        />
        <KpiCard
          label="Original Cost"
          value={formatCurrency(totalAssetsVal)}
          icon={<DollarSign className="w-6 h-6 text-text-brand" />}
        />
        <KpiCard
          label="Accum. Depreciation"
          value={formatCurrency(totalAccumDepVal)}
          icon={<TrendingDown className="w-6 h-6 text-text-brand" />}
        />
        <KpiCard
          label="Net Book Value"
          value={formatCurrency(netBookVal)}
          icon={<DollarSign className="w-6 h-6 text-text-brand" />}
        />
      </div>

      {/* Filters and Table */}
      <Section variant="card" headerBorder>
        {/* Filters */}
        <FilterBar>
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search by code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions}
            fullWidth={false}
          />
          <Select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            options={branchOptions}
            fullWidth={false}
          />
        </FilterBar>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background-subtle border-b border-border">
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">Asset Code</th>
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">Branch</th>
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">Cost</th>
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">Net Book Value</th>
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">Depreciation Progress</th>
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-text-tertiary uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <Settings className="w-12 h-12 mx-auto text-text-tertiary mb-4 opacity-40" />
                    <p className="text-base font-semibold text-text-primary">No fixed assets registered</p>
                    <p className="text-sm text-text-tertiary mt-1">Get started by clicking the "New Asset" button above.</p>
                  </td>
                </tr>
              ) : (
                assets.map((asset) => {
                  const percent = Math.min(
                    100,
                    Math.round((asset.currentAccumDepreciation / (asset.purchaseCost - asset.salvageValue || 1)) * 100)
                  );
                  const nbv = asset.purchaseCost - asset.currentAccumDepreciation;

                  return (
                    <tr key={asset.id} className="hover:bg-background-subtle transition-colors">
                      <td className="px-6 py-4 font-semibold text-sm text-text-brand">
                        <Link to={`/accounting/fixed-assets/${asset.id}`} className="hover:underline flex items-center gap-1">
                          {asset.assetCode}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-text-primary">{asset.name}</div>
                        {asset.description && (
                          <div className="text-xs text-text-tertiary truncate max-w-xs mt-0.5">{asset.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-tertiary">
                        {asset.branch?.name || <span className="italic">None</span>}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-text-primary">
                        ${asset.purchaseCost.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-success">
                        ${nbv.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 max-w-[150px]">
                          <div className="flex-1 bg-background-subtle rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${percent >= 100 ? 'bg-brand' : 'bg-brand'}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-text-tertiary">{percent}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                          asset.status === 'ACTIVE'
                            ? 'bg-success-soft text-success'
                            : asset.status === 'FULLY_DEPRECIATED'
                            ? 'bg-brand-50 text-text-brand'
                            : 'bg-danger-soft text-danger'
                        }`}>
                          {asset.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => navigate(`/accounting/fixed-assets/${asset.id}`)}
                          className="p-1.5 bg-background-subtle hover:bg-border text-text-tertiary hover:text-text-brand rounded-lg transition"
                          title="View Asset Details"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Modal: Register Fixed Asset */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => {
          setIsRegisterModalOpen(false);
          resetRegisterForm();
        }}
        title="Register Fixed Asset"
        maxWidth="2xl"
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 text-sm text-danger bg-danger-soft rounded-lg border border-danger/20">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Asset Name" required>
              <Input
                type="text"
                placeholder="e.g. Server Rack Dell R740"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                fullWidth
              />
            </FormField>

            <FormField label="Asset Code">
              <Input
                type="text"
                placeholder="Leave blank for auto-generation"
                value={formData.assetCode}
                onChange={(e) => setFormData(p => ({ ...p, assetCode: e.target.value }))}
                fullWidth
              />
            </FormField>
          </div>

          <FormField label="Description">
            <textarea
              placeholder="Write details about the asset condition, serial numbers, location, etc."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background-card text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand"
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Purchase Date" required>
              <Input
                type="date"
                value={formData.purchaseDate}
                onChange={(e) => setFormData(p => ({ ...p, purchaseDate: e.target.value }))}
                fullWidth
              />
            </FormField>

            <FormField label="Purchase Cost ($)" required>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.purchaseCost}
                onChange={(e) => setFormData(p => ({ ...p, purchaseCost: e.target.value }))}
                fullWidth
              />
            </FormField>

            <FormField label="Salvage Value ($)">
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.salvageValue}
                onChange={(e) => setFormData(p => ({ ...p, salvageValue: e.target.value }))}
                fullWidth
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Useful Life (Months)" required>
              <Input
                type="number"
                placeholder="e.g. 60"
                value={formData.usefulLifeMonths}
                onChange={(e) => setFormData(p => ({ ...p, usefulLifeMonths: e.target.value }))}
                fullWidth
              />
            </FormField>

            <FormField label="Deprec. Method" required>
              <select
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background-card text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand"
                value={formData.depreciationMethod}
                onChange={(e) => setFormData(p => ({ ...p, depreciationMethod: e.target.value }))}
              >
                <option value="STRAIGHT_LINE">Straight Line</option>
                <option value="DOUBLE_DECLINING">Double Declining Balance</option>
              </select>
            </FormField>

            <FormField label="Branch Context">
              <select
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background-card text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand"
                value={formData.branchId}
                onChange={(e) => setFormData(p => ({ ...p, branchId: e.target.value }))}
              >
                <option value="">Global / No Branch</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </FormField>
          </div>

          <hr className="border-border my-2" />
          <h4 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-2">GL General Ledger Accounts</h4>

          <div className="space-y-3">
            <FormField label="Asset GL Account" required>
              <Select
                value={formData.assetAccountId}
                onChange={(e) => setFormData(p => ({ ...p, assetAccountId: e.target.value }))}
                options={assetAccountsOptions}
                placeholder="Select asset account (e.g. Machinery, Vehicles)"
                fullWidth
              />
            </FormField>

            <FormField label="Accumulated Depreciation GL Account" required>
              <Select
                value={formData.accumDepAccountId}
                onChange={(e) => setFormData(p => ({ ...p, accumDepAccountId: e.target.value }))}
                options={assetAccountsOptions}
                placeholder="Select Contra-Asset account"
                fullWidth
              />
            </FormField>

            <FormField label="Depreciation Expense GL Account" required>
              <Select
                value={formData.depExpAccountId}
                onChange={(e) => setFormData(p => ({ ...p, depExpAccountId: e.target.value }))}
                options={assetAccountsOptions}
                placeholder="Select Expense account"
                fullWidth
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                setIsRegisterModalOpen(false);
                resetRegisterForm();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={registerMutation.isPending}>
              {registerMutation.isPending ? 'Registering...' : 'Register Asset'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Batch Depreciation Run */}
      <Modal
        isOpen={isBatchDepModalOpen}
        onClose={() => setIsBatchDepModalOpen(false)}
        title="Batch Depreciation Run"
        maxWidth="md"
      >
        <form onSubmit={handleBatchDepSubmit} className="space-y-4">
          {batchError && (
            <div className="p-3 text-sm text-danger bg-danger-soft rounded-lg border border-danger/20">
              {batchError}
            </div>
          )}

          <FormField label="Depreciation Posting Date" required>
            <Input
              type="date"
              value={depreciationDate}
              onChange={(e) => setDepreciationDate(e.target.value)}
              fullWidth
            />
          </FormField>

          <p className="text-xs text-text-tertiary -mt-2">
            Usually the last day of the fiscal month. Only active assets that haven't been depreciated in this calendar month will be processed.
          </p>

          <div className="p-4 bg-warning-soft rounded-lg border border-warning/20 text-xs text-warning flex gap-3">
            <HelpCircle size={18} className="shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Important Double-Entry Postings:</span> This will create a balancing Journal Entry for each depreciated asset:
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                <li><span className="font-semibold">Debit:</span> Depreciation Expense account</li>
                <li><span className="font-semibold">Credit:</span> Accumulated Depreciation account</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsBatchDepModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={batchDeprecateMutation.isPending}>
              {batchDeprecateMutation.isPending ? 'Processing...' : 'Run Depreciation'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageTemplate>
  );
}
