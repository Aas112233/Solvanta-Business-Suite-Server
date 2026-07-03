import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Plus, Search, Building2, Lock, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTemplate, Section, Button, Select, Modal } from '../../components/ui';

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
    'ASSET': { label: 'Assets', bg: 'bg-success-soft', text: 'text-success' },
    'LIABILITY': { label: 'Liabilities', bg: 'bg-danger-soft', text: 'text-danger' },
    'EQUITY': { label: 'Equity', bg: 'bg-background-subtle', text: 'text-text-primary' },
    'REVENUE': { label: 'Revenue', bg: 'bg-brand-50', text: 'text-text-brand' },
    'EXPENSE': { label: 'Expenses', bg: 'bg-warning-soft', text: 'text-warning' },
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

    const allGroupsEmpty = Object.keys(groupedAccounts).every(k => groupedAccounts[k].length === 0);

    return (
        <PageTemplate
            title="Chart of Accounts"
            subtitle="Manage standard general ledger accounts and map classifications."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Accounting', href: '/accounting' },
                { label: 'Chart of Accounts' }
            ]}
            action={
                <Button
                    variant="primary"
                    icon={<Plus size={18} />}
                    onClick={() => setIsModalOpen(true)}
                >
                    New Account
                </Button>
            }
            loading={isLoading}
            maxWidth="full"
        >
            <div className="space-y-6">
                {/* Search */}
                {!isLoading && (
                    <div className="flex items-center gap-3">
                        <div className="relative w-full md:w-72">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                            <input
                                type="text"
                                placeholder="Search by code or name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand bg-background-card text-text-primary placeholder:text-text-tertiary"
                            />
                        </div>
                    </div>
                )}

                {/* Table */}
                <Section variant="card" title="All Accounts" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                <tr className="border-b border-border">
                                    <th className="px-6 py-4 font-semibold w-32">Code</th>
                                    <th className="px-6 py-4 font-semibold">Account Name</th>
                                    <th className="px-6 py-4 font-semibold w-40">Status</th>
                                    <th className="px-6 py-4 font-semibold text-right w-32">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {allGroupsEmpty ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-16 text-center text-text-tertiary">
                                            <Building2 className="w-12 h-12 mx-auto text-text-tertiary mb-4" />
                                            <p className="text-base font-medium text-text-primary">No accounts found</p>
                                            <p className="text-sm mt-1">Adjust your search or add a new account.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    ACCOUNT_ORDER.map((type) => {
                                        const accs = groupedAccounts[type];
                                        if (!accs || accs.length === 0) return null;
                                        const config = TYPE_CONFIG[type] || { label: type, bg: 'bg-background-subtle', text: 'text-text-secondary' };

                                        return (
                                            <React.Fragment key={type}>
                                                {/* Group Header */}
                                                <tr
                                                    className="bg-background-subtle cursor-pointer hover:bg-background-subtle"
                                                    onClick={() => toggleGroup(type)}
                                                >
                                                    <td colSpan={4} className="px-6 py-3 border-t border-border">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-text-tertiary transition-transform">
                                                                {expandedGroups[type] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                            </span>
                                                            <span className={clsx("px-2.5 py-1 rounded-md text-xs font-bold tracking-wide uppercase", config.bg, config.text)}>
                                                                {config.label}
                                                            </span>
                                                            <span className="text-xs font-medium text-text-tertiary ml-2">
                                                                ({accs.length} accounts)
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Group Accounts */}
                                                {expandedGroups[type] && accs.map((account) => (
                                                    <tr key={account.id} className="hover:bg-background-subtle transition-colors group">
                                                        <td className="px-6 py-3.5">
                                                            <span className="font-mono text-sm font-semibold text-text-secondary group-hover:text-text-primary transition-colors">
                                                                {account.code}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3.5">
                                                            <span className="text-sm font-medium text-text-primary">
                                                                {account.name}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3.5">
                                                            <div className="flex items-center gap-1.5">
                                                                {account.isSystem ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-background-subtle text-text-secondary">
                                                                        <Lock size={12} /> System
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-success-soft text-success">
                                                                        <CheckCircle2 size={12} /> Active
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3.5 text-right">
                                                            <button
                                                                className="text-sm font-medium text-text-brand hover:text-brand disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                </Section>

                {/* Create Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title="Create New Account"
                >
                    <form onSubmit={handleCreateSubmit} className="space-y-4">
                        {formError && (
                            <div className="p-3 text-sm text-danger bg-danger-soft rounded-lg border border-danger/20">
                                {formError}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Account Type</label>
                            <Select
                                value={formData.type}
                                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                                options={ACCOUNT_ORDER.map(type => ({ value: type, label: type }))}
                                placeholder="Select"
                                fullWidth
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Account Code <span className="text-text-tertiary font-normal text-xs ml-1">(Optional)</span></label>
                            <input
                                type="text"
                                placeholder="Leave blank to auto-generate"
                                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand bg-background-card text-text-primary placeholder:text-text-tertiary"
                                value={formData.code}
                                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Account Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Cash Equivalent"
                                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand bg-background-card text-text-primary placeholder:text-text-tertiary"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
                            <Button
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                                type="button"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                loading={createMutation.isPending}
                            >
                                {createMutation.isPending ? 'Saving...' : 'Create Account'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            </div>
        </PageTemplate>
    );
}
