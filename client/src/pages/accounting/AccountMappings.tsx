import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Save, GitMerge, Plus, X, Loader2, Trash2 } from 'lucide-react';
import AppDropdown from '../../components/ui/AppDropdown';

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
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Automation Mappings</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Configure automatic account resolution rules for transactional modules.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" />
                    New Rule
                </button>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mapping Type</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Scope (Entity)</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target Account</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">Loading mappings...</td>
                                </tr>
                            ) : mappings.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-gray-500">
                                        <GitMerge className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                                        <p className="text-base font-medium text-gray-900 dark:text-white">No map rules defined</p>
                                        <p className="text-sm mt-1">Financial posts may fail without proper resolutions.</p>
                                    </td>
                                </tr>
                            ) : (
                                mappings.map((mapping) => (
                                    <tr key={mapping.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                {mapping.mappingType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 flex flex-col">
                                            <span className="font-medium text-gray-800 dark:text-gray-200">{mapping.entityType}</span>
                                            {mapping.entityId && (
                                                <span className="text-xs mt-0.5 opacity-80 shrink-0 break-all max-w-[200px]">ID: {mapping.entityId}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 text-sm font-medium">
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
                                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2"
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
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg overflow-visible animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Save Resolution Rule</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
                            {formError && (
                                <div className="p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-lg border border-rose-100 dark:border-rose-500/20">
                                    {formError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mapping Type</label>
                                <AppDropdown
                                    value={formData.mappingType}
                                    onChange={(v) => setFormData(prev => ({ ...prev, mappingType: v }))}
                                    options={MAPPING_TYPES.map(type => ({ value: type, label: type.replace(/_/g, ' ') }))}
                                    placeholder='Select'
                                    searchable
                                />
                                <p className="text-xs text-gray-500 mt-1">The system event this rule triggers for.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scope Level</label>
                                    <AppDropdown
                                        value={formData.entityType}
                                        onChange={(v) => setFormData(prev => ({ ...prev, entityType: v }))}
                                        options={ENTITY_TYPES.map(type => ({ value: type, label: type }))}
                                        placeholder='Select'
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 text-slate-400">Target Entity ID</label>
                                    <input
                                        type="text"
                                        placeholder="ObjectId..."
                                        disabled={formData.entityType === 'GLOBAL'}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800/50"
                                        value={formData.entityId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, entityId: e.target.value }))}
                                        required={formData.entityType !== 'GLOBAL'}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Account (Chart of Accounts)</label>
                                <AppDropdown
                                    value={formData.accountId}
                                    onChange={(v) => setFormData(prev => ({ ...prev, accountId: v }))}
                                    options={[{ value: '', label: 'Select an account...' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))]}
                                    placeholder='Select an account...'
                                    searchable
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saveMutation.isPending}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm"
                                >
                                    {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {saveMutation.isPending ? 'Saving...' : 'Save Mapping'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
