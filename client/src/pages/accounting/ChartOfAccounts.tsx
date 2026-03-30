import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Plus, Search, Building2, Lock, CheckCircle2, ChevronRight, ChevronDown, X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import AppDropdown from '../../components/ui/AppDropdown';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
    isSystem: boolean;
    parentId?: string | null;
}

const ACCOUNT_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

const TYPE_CONFIG: Record<string, { label: string, bg: string, text: string }> = {
    'ASSET': { label: 'Assets', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
    'LIABILITY': { label: 'Liabilities', bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400' },
    'EQUITY': { label: 'Equity', bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400' },
    'REVENUE': { label: 'Revenue', bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400' },
    'EXPENSE': { label: 'Expenses', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400' },
};

export default function ChartOfAccounts() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // New Account Form State
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        type: 'ASSET',
    });
    const [formError, setFormError] = useState('');

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        ASSET: true,
        LIABILITY: true,
        EQUITY: true,
        REVENUE: true,
        EXPENSE: true
    });

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const { data: accounts = [], isLoading } = useQuery<Account[]>({
        queryKey: ['accounts'],
        queryFn: async () => {
            const res = await api.get('/accounting/accounts');
            return res.data.data;
        }
    });

    const createMutation = useMutation({
        mutationFn: async (newAccount: Omit<Account, 'id' | 'isSystem'>) => {
            const res = await api.post('/accounting/accounts', newAccount);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setIsModalOpen(false);
            setFormData({ code: '', name: '', type: 'ASSET' });
            setFormError('');
        },
        onError: (error: any) => {
            setFormError(error.response?.data?.error?.message || 'Failed to create account');
        }
    });

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!formData.name || !formData.type) {
            setFormError('Account Name and Type are required.');
            return;
        }
        createMutation.mutate(formData);
    };

    // Group and filter
    const groupedAccounts = useMemo(() => {
        const filtered = accounts.filter(acc =>
            acc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            acc.type.toLowerCase().includes(searchQuery.toLowerCase())
        );

        const groups: Record<string, Account[]> = {};
        ACCOUNT_ORDER.forEach(type => groups[type] = []);

        filtered.forEach(acc => {
            if (!groups[acc.type]) groups[acc.type] = [];
            groups[acc.type].push(acc);
        });

        return groups;
    }, [accounts, searchQuery]);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Chart of Accounts</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Manage standard general ledger accounts and map classifications.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-full md:w-72">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by code or name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                        />
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" />
                        New Account
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Code</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account Name</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right w-32">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">Loading chart of accounts...</td>
                                </tr>
                            ) : Object.keys(groupedAccounts).every(k => groupedAccounts[k].length === 0) ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-16 text-center text-gray-500">
                                        <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                                        <p className="text-base font-medium text-gray-900 dark:text-white">No accounts found</p>
                                        <p className="text-sm mt-1">Adjust your search or add a new account.</p>
                                    </td>
                                </tr>
                            ) : (
                                ACCOUNT_ORDER.map((type) => {
                                    const accs = groupedAccounts[type];
                                    if (!accs || accs.length === 0) return null;
                                    const config = TYPE_CONFIG[type] || { label: type, bg: 'bg-gray-100', text: 'text-gray-700' };

                                    return (
                                        <React.Fragment key={type}>
                                            {/* Group Header */}
                                            <tr
                                                className="bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-800"
                                                onClick={() => toggleGroup(type)}
                                            >
                                                <td colSpan={4} className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-400 transition-transform">
                                                            {expandedGroups[type] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                        </span>
                                                        <span className={clsx("px-2.5 py-1 rounded-md text-xs font-bold tracking-wide uppercase", config.bg, config.text)}>
                                                            {config.label}
                                                        </span>
                                                        <span className="text-xs font-medium text-gray-400 ml-2">
                                                            ({accs.length} accounts)
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Group Accounts */}
                                            {expandedGroups[type] && accs.map((account) => (
                                                <tr key={account.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group">
                                                    <td className="px-6 py-3.5">
                                                        <span className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                                                            {account.code}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                            {account.name}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                        <div className="flex items-center gap-1.5">
                                                            {account.isSystem ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                                    <Lock size={12} /> System
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                                                    <CheckCircle2 size={12} /> Active
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3.5 text-right">
                                                        <button
                                                            className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            disabled={account.isSystem}
                                                        >
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create New Account</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                            {formError && (
                                <div className="p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-lg border border-rose-100 dark:border-rose-500/20">
                                    {formError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Type</label>
                                <AppDropdown
                                    value={formData.type}
                                    onChange={(v) => setFormData(prev => ({ ...prev, type: v }))}
                                    options={ACCOUNT_ORDER.map(type => ({ value: type, label: type }))}
                                    placeholder='Select'
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Code <span className="text-gray-400 font-normal text-xs ml-1">(Optional)</span></label>
                                <input
                                    type="text"
                                    placeholder="Leave blank to auto-generate"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white placeholder:text-gray-400"
                                    value={formData.code}
                                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Cash Equivalent"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createMutation.isPending}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {createMutation.isPending ? 'Saving...' : 'Create Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
