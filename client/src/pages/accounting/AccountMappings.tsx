import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Plus, Trash2, Loader2 } from 'lucide-react';

import {
  PageTemplate,
  Section,
  Select,
} from '@/components/system';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Mapping {
  id: string;
  mappingType: string;
  entityType: string;
  entityId: string | null;
  accountId: string;
  account?: { code: string; name: string };
}

const MAPPING_TYPES = [
  'INVENTORY_ASSET',
  'COGS_EXPENSE',
  'SALES_REVENUE',
  'SALES_RETURN',
  'OUTPUT_TAX',
  'INPUT_TAX',
  'CASH',
  'BANK',
  'ACCOUNT_PAYABLE',
  'ACCOUNT_RECEIVABLE',
  'PURCHASE_RETURN',
  'EXPENSE',
  'DISCOUNT_GIVEN',
  'DISCOUNT_RECEIVED',
  'SHRINKAGE_EXPENSE',
  'DAMAGED_GOODS_EXPENSE',
  'TRANSFER_IN_TRANSIT'
];

const ENTITY_TYPES = [
  'GLOBAL',
  'BRANCH',
  'PRODUCT',
  'CATEGORY',
  'CUSTOMER',
  'SUPPLIER'
];

export default function AccountMappings() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    mappingType: MAPPING_TYPES[0],
    entityType: 'GLOBAL',
    entityId: '',
    accountId: ''
  });
  const [formError, setFormError] = useState('');

  const { data: mappings = [], isLoading } = useQuery<Mapping[]>({
    queryKey: ['accountMappings'],
    queryFn: async () => {
      const res = await api.get('/accounting/mappings');
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

  const saveMutation = useMutation({
    mutationFn: async (newMapping: Omit<Mapping, 'id' | 'account'>) => {
      const res = await api.post('/accounting/mappings', newMapping);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountMappings'] });
      setIsModalOpen(false);
      setFormData({ mappingType: MAPPING_TYPES[0], entityType: 'GLOBAL', entityId: '', accountId: '' });
      setFormError('');
    },
    onError: (error: any) => {
      setFormError(error.response?.data?.error?.message || 'Failed to save mapping');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/accounting/mappings/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountMappings'] });
    }
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.accountId) {
      setFormError('Target Account is required.');
      return;
    }

    const payload: any = {
      mappingType: formData.mappingType,
      entityType: formData.entityType,
      accountId: formData.accountId,
    };

    if (formData.entityType !== 'GLOBAL') {
      if (!formData.entityId) {
        setFormError(`Entity ID is required for scope ${formData.entityType}`);
        return;
      }
      payload.entityId = formData.entityId;
    } else {
      payload.entityId = null;
    }

    saveMutation.mutate(payload);
  };

  return (
    <PageTemplate
      title="Automation Mappings"
      subtitle="Configure automatic account resolution rules for transactional modules."
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Accounting', href: '/accounting' },
        { label: 'Mappings' },
      ]}
      action={
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setIsModalOpen(true)}>
          New Rule
        </Button>
      }
      loading={isLoading}
      maxWidth="full"
    >
      <Section variant="card" headerBorder>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background-subtle border-b border-border">
                <th className="px-6 py-4 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Mapping Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Scope (Entity)</th>
                <th className="px-6 py-4 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Target Account</th>
                <th className="px-6 py-4 text-xs font-semibold text-text-tertiary uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-text-tertiary">
                    <GitMerge className="w-12 h-12 mx-auto text-text-tertiary mb-4 opacity-40" />
                    <p className="text-base font-medium text-text-primary">No map rules defined</p>
                    <p className="text-sm mt-1 text-text-tertiary">Financial posts may fail without proper resolutions.</p>
                  </td>
                </tr>
              ) : (
                mappings.map((mapping) => (
                  <tr key={mapping.id} className="hover:bg-background-subtle transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-semibold text-text-secondary">
                        {mapping.mappingType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-tertiary">
                      <span className="font-medium text-text-primary">{mapping.entityType}</span>
                      {mapping.entityId && (
                        <span className="text-xs mt-0.5 opacity-80 block break-all max-w-[200px]">ID: {mapping.entityId}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-brand-50 text-text-brand text-sm font-medium">
                        {mapping.account ? `${mapping.account.code} - ${mapping.account.name}` : mapping.accountId}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to remove this mapping?')) {
                            deleteMutation.mutate(mapping.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="text-text-tertiary hover:text-danger transition-colors p-2"
                        title="Delete Rule"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Save Resolution Rule"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-5">
          {formError && (
            <div className="p-3 text-sm text-danger bg-danger-soft rounded-lg border border-danger/20">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Mapping Type</label>
            <Select
              value={formData.mappingType}
              onChange={(e) => setFormData(prev => ({ ...prev, mappingType: e.target.value }))}
              options={MAPPING_TYPES.map(type => ({ value: type, label: type.replace(/_/g, ' ') }))}
              placeholder="Select"
              fullWidth
            />
            <p className="text-xs text-text-tertiary mt-1">The system event this rule triggers for.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Scope Level</label>
              <Select
                value={formData.entityType}
                onChange={(e) => setFormData(prev => ({ ...prev, entityType: e.target.value }))}
                options={ENTITY_TYPES.map(type => ({ value: type, label: type }))}
                placeholder="Select"
                fullWidth
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Target Entity ID</label>
              <input
                type="text"
                placeholder="ObjectId..."
                disabled={formData.entityType === 'GLOBAL'}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background-card text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand disabled:opacity-50 disabled:bg-background-subtle"
                value={formData.entityId}
                onChange={(e) => setFormData(prev => ({ ...prev, entityId: e.target.value }))}
                required={formData.entityType !== 'GLOBAL'}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Target Account (Chart of Accounts)</label>
            <Select
              value={formData.accountId}
              onChange={(e) => setFormData(prev => ({ ...prev, accountId: e.target.value }))}
              options={accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))}
              placeholder="Select an account..."
              fullWidth
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Mapping'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageTemplate>
  );
}
