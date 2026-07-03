import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Plus, Search, Building2, Lock, CheckCircle2, ChevronRight, ChevronDown, BookOpen, LayoutTemplate, Store, Wrench, Coffee, ShoppingCart, HardHat, AlertTriangle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTemplate, Section, Button, Select, Modal } from '../../components/ui';
import { toast } from 'react-hot-toast';

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

    // ── Template State ──
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false);

    const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
        '🛒': <Store size={20} />,
        '🏭': <Wrench size={20} />,
        '💼': <BookOpen size={20} />,
        '🍽️': <Coffee size={20} />,
        '📦': <ShoppingCart size={20} />,
        '🏗️': <HardHat size={20} />,
    };

    const { data: templates = [], isLoading: templatesLoading } = useQuery({
        queryKey: ['coa-templates'],
        queryFn: async () => {
            const res = await api.get('/accounting/templates');
            return (res.data.data || []) as Array<{
                id: string; name: string; nameArabic: string;
                description: string; icon: string;
                accountCount: number; mappingCount: number;
            }>;
        },
        enabled: isTemplateModalOpen,
    });

    const templateDetailQuery = useQuery({
        queryKey: ['coa-template', selectedTemplateId],
        queryFn: async () => {
            const res = await api.get(`/accounting/templates/${selectedTemplateId}`);
            return res.data.data as any;
        },
        enabled: !!selectedTemplateId && templateConfirmOpen,
    });

    const seedMutation = useMutation({
        mutationFn: async (templateId: string) => {
            const res = await api.post('/accounting/seed-template', { templateId });
            return res.data;
        },
        onSuccess: (data: any) => {
            toast.success(data.message || 'Chart of Accounts seeded successfully!');
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setTemplateConfirmOpen(false);
            setIsTemplateModalOpen(false);
            setSelectedTemplateId(null);
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to seed COA');
        },
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
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        icon={<LayoutTemplate size={18} />}
                        onClick={() => setIsTemplateModalOpen(true)}
                        disabled={accounts.length > 0}
                        title={accounts.length > 0 ? 'Templates can only be loaded into an empty Chart of Accounts' : 'Load a pre-built COA template'}
                    >
                        Load Template
                    </Button>
                    <Button
                        variant="primary"
                        icon={<Plus size={18} />}
                        onClick={() => setIsModalOpen(true)}
                    >
                        New Account
                    </Button>
                </div>
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

                {/* ── Template Selection Modal ── */}
                <Modal
                    isOpen={isTemplateModalOpen}
                    onClose={() => { setIsTemplateModalOpen(false); setSelectedTemplateId(null); }}
                    title="Load Chart of Accounts Template"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-text-secondary">
                            Choose a pre-built Chart of Accounts template for your industry. This will create all necessary accounts and default mappings automatically.
                        </p>

                        {templatesLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 size={24} className="animate-spin text-brand" />
                            </div>
                        ) : (
                            <div className="grid gap-3 max-h-96 overflow-y-auto">
                                {templates.map((tpl) => (
                                    <button
                                        key={tpl.id}
                                        type="button"
                                        onClick={() => { setSelectedTemplateId(tpl.id); setTemplateConfirmOpen(true); }}
                                        className={clsx(
                                            'flex items-start gap-4 p-4 rounded-xl border text-left transition-all',
                                            'hover:border-brand hover:shadow-sm',
                                            selectedTemplateId === tpl.id ? 'border-brand bg-brand-50/30' : 'border-border'
                                        )}
                                    >
                                        <span className="text-2xl mt-0.5">{tpl.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold text-text-primary">{tpl.name}</h4>
                                                <span className="text-xs text-text-tertiary font-arabic">{tpl.nameArabic}</span>
                                            </div>
                                            <p className="text-xs text-text-tertiary mt-0.5">{tpl.description}</p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <span className="text-[11px] text-text-tertiary bg-background-subtle px-2 py-0.5 rounded">
                                                    {tpl.accountCount} accounts
                                                </span>
                                                <span className="text-[11px] text-text-tertiary bg-background-subtle px-2 py-0.5 rounded">
                                                    {tpl.mappingCount} mappings
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
                            <Button variant="outline" onClick={() => setIsTemplateModalOpen(false)} type="button">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Modal>

                {/* ── Template Confirm Modal ── */}
                <Modal
                    isOpen={templateConfirmOpen}
                    onClose={() => { setTemplateConfirmOpen(false); setSelectedTemplateId(null); }}
                    title="Confirm Template Installation"
                >
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-4 bg-warning-soft rounded-lg border border-warning/20">
                            <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-warning">This will replace your existing configuration</p>
                                <p className="text-xs text-text-tertiary mt-1">
                                    Loading a template will create all accounts and default mappings. Your existing Chart of Accounts must be empty first. This action cannot be easily undone.
                                </p>
                            </div>
                        </div>

                        {templateDetailQuery.isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 size={24} className="animate-spin text-brand" />
                            </div>
                        ) : templateDetailQuery.data ? (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-text-primary">
                                    Template: {templateDetailQuery.data.name} {templateDetailQuery.data.icon}
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-xs text-text-tertiary">
                                    <span>{(templateDetailQuery.data.accounts || []).reduce((s: number, a: any) => s + 1 + (a.children?.length || 0), 0)} accounts</span>
                                    <span>{(templateDetailQuery.data.mappings || []).length} auto-mappings</span>
                                </div>
                            </div>
                        ) : null}

                        <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
                            <Button
                                variant="outline"
                                onClick={() => { setTemplateConfirmOpen(false); setSelectedTemplateId(null); }}
                                type="button"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => selectedTemplateId && seedMutation.mutate(selectedTemplateId)}
                                loading={seedMutation.isPending}
                                type="button"
                            >
                                {seedMutation.isPending ? 'Installing...' : 'Install Template'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </PageTemplate>
    );
}
