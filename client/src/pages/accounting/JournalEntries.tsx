import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { FileText, Plus, Trash2, Filter, RotateCcw } from 'lucide-react';
import toast from '@/lib/toast';
import { formatCompanyDate, toDateInputValue } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';
import { PageTemplate, Section, Button, FilterBar, Select, Modal } from '../../components/ui';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
}

interface JournalEntry {
    id: string;
    entryNo: string;
    date: string;
    memo: string;
    sourceType: string;
    lines: {
        id: string;
        accountId: string;
        account: { code: string; name: string };
        debit: string;
        credit: string;
    }[];
}

function createInitialFormData(source?: unknown) {
    return {
        date: toDateInputValue(undefined, source),
        memo: '',
        lines: [
            { id: Math.random().toString(36).substr(2, 9), accountId: '', debit: '', credit: '' },
            { id: Math.random().toString(36).substr(2, 9), accountId: '', debit: '', credit: '' }
        ]
    };
}

export default function JournalEntries() {
    const company = useAuthStore((s) => s.user?.company);
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        branchId: ''
    });
    const [hasSearched, setHasSearched] = useState(false);

    const [formData, setFormData] = useState(() => createInitialFormData(company));
    const [formError, setFormError] = useState('');

    const { data: branches = [] } = useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data.data || [];
        }
    });

    const hasActiveFilters = filters.startDate || filters.endDate || filters.branchId;

    const { data: entriesData, isLoading, refetch } = useQuery({
        queryKey: ['journalEntries', filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);
            if (filters.branchId) params.append('branchId', filters.branchId);
            const res = await api.get(`/accounting/journal-entries?${params.toString()}`);
            return res.data;
        },
        enabled: false,
        retry: false
    });

    const { data: accounts = [] } = useQuery<Account[]>({
        queryKey: ['accounts-lite'],
        queryFn: async () => {
            const res = await api.get('/accounting/accounts');
            return res.data.data;
        }
    });

    const entries = ((entriesData?.data as any)?.data || entriesData?.data || []) as JournalEntry[];


    const createMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            const res = await api.post('/accounting/journal-entries', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
            setIsModalOpen(false);
            setFormData(createInitialFormData(company));
            setFormError('');
            toast.success('Journal entry posted successfully.');
        },
        onError: (error: any) => {
            setFormError(error.response?.data?.error?.message || 'Failed to create journal entry');
        }
    });

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        // Validate debits and credits match locally before sending
        let totalDebit = 0;
        let totalCredit = 0;
        let hasEmptyAccount = false;

        formData.lines.forEach(line => {
            if (!line.accountId) hasEmptyAccount = true;
            totalDebit += Number(line.debit) || 0;
            totalCredit += Number(line.credit) || 0;
        });

        if (hasEmptyAccount) {
            setFormError('All lines must have an account selected.');
            return;
        }

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            setFormError(`Debits (${totalDebit}) must equal credits (${totalCredit}). Difference: ${Math.abs(totalDebit - totalCredit)}`);
            return;
        }

        if (totalDebit <= 0) {
            setFormError('Journal entry must have a non-zero value.');
            return;
        }

        createMutation.mutate(formData);
    };

    const addLine = () => {
        setFormData(prev => ({
            ...prev,
            lines: [...prev.lines, { id: Math.random().toString(36).substr(2, 9), accountId: '', debit: '', credit: '' }]
        }));
    };

    const removeLine = (index: number) => {
        if (formData.lines.length <= 2) return; // Keep at least 2
        setFormData(prev => ({
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index)
        }));
    };

    const updateLine = (index: number, field: 'accountId' | 'debit' | 'credit', value: string) => {
        const newLines = [...formData.lines];

        if (field === 'debit' && value) newLines[index].credit = ''; // Mutually exclusive
        if (field === 'credit' && value) newLines[index].debit = '';

        newLines[index][field] = value;
        setFormData(prev => ({ ...prev, lines: newLines }));
    };

    const totalDebitPreview = formData.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const totalCreditPreview = formData.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

    return (
        <PageTemplate
            title="General Journal"
            subtitle="Review and post double-entry ledgers"
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Accounting', href: '/accounting' },
                { label: 'Journal Entries' }
            ]}
            action={
                <Button
                    variant="primary"
                    icon={<Plus size={18} />}
                    onClick={() => setIsModalOpen(true)}
                >
                    New Journal Entry
                </Button>
            }
            loading={isLoading && hasSearched}
            maxWidth="full"
        >
            <div className="space-y-6">
                {/* Filter Section */}
                <FilterBar>
                    <div className="flex items-center gap-2 w-full">
                        <Filter className="w-4 h-4 text-text-tertiary" />
                        <span className="text-sm font-medium text-text-secondary">Filters</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Start Date</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none bg-background-card text-text-primary"
                                value={filters.startDate}
                                onChange={(e) => setFilters(p => ({ ...p, startDate: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">End Date</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none bg-background-card text-text-primary"
                                value={filters.endDate}
                                onChange={(e) => setFilters(p => ({ ...p, endDate: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Branch</label>
                            <Select
                                value={filters.branchId}
                                onChange={(e) => setFilters(p => ({ ...p, branchId: e.target.value }))}
                                options={[{ value: '', label: 'All Branches' }, ...branches.map((b: any) => ({ value: b.id, label: b.name }))]}
                                placeholder="Select Branch"
                                fullWidth
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <Button
                                onClick={() => {
                                    setHasSearched(true);
                                    refetch();
                                }}
                                disabled={!hasActiveFilters}
                            >
                                Apply Filters
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setFilters({ startDate: '', endDate: '', branchId: '' });
                                    setHasSearched(false);
                                }}
                                icon={<RotateCcw size={16} />}
                            />
                        </div>
                    </div>
                </FilterBar>

                {/* Entries Table */}
                <Section variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                <tr className="border-b border-border">
                                    <th className="px-6 py-3 font-semibold">Date</th>
                                    <th className="px-6 py-3 font-semibold">Entry No.</th>
                                    <th className="px-6 py-3 font-semibold">Accounts / Memo</th>
                                    <th className="px-6 py-3 font-semibold text-right">Debit</th>
                                    <th className="px-6 py-3 font-semibold text-right">Credit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {!hasSearched ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-16 text-center text-text-tertiary">
                                            <Filter className="w-12 h-12 mx-auto text-text-tertiary mb-3" />
                                            <p className="text-lg font-medium text-text-primary mb-1">No filters applied</p>
                                            <p className="text-sm">Please select date range and/or branch to view journal entries.</p>
                                        </td>
                                    </tr>
                                ) : isLoading ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-text-tertiary">Loading journal entries...</td></tr>
                                ) : entries.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-text-tertiary">
                                            <FileText className="w-12 h-12 mx-auto text-text-tertiary mb-3" />
                                            <p>No journal entries found for the selected filters.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    entries.map((entry) => (
                                        <React.Fragment key={entry.id}>
                                            <tr className="bg-background-subtle">
                                                <td className="px-6 py-3 text-sm text-text-primary border-l-4 border-brand font-medium whitespace-nowrap">
                                                    {formatCompanyDate(entry.date, company)}
                                                </td>
                                                <td className="px-6 py-3 text-sm font-mono text-text-secondary whitespace-nowrap">
                                                    {entry.entryNo}
                                                    {entry.sourceType && <span className="ml-2 text-xs bg-background-subtle px-2 py-0.5 rounded text-text-tertiary">{entry.sourceType}</span>}
                                                </td>
                                                <td className="px-6 py-3 text-sm text-text-tertiary italic" colSpan={3}>
                                                    Memo: {entry.memo || 'Auto-generated ledger entry'}
                                                </td>
                                            </tr>
                                            {entry.lines.map((line) => (
                                                <tr key={line.id} className="hover:bg-background-subtle">
                                                    <td colSpan={2}></td>
                                                    <td className={`px-6 py-2 text-sm ${Number(line.credit) > 0 ? 'pl-10 text-text-secondary' : 'font-medium text-text-primary'}`}>
                                                        {line.account.code} - {line.account.name}
                                                    </td>
                                                    <td className="px-6 py-2 text-sm text-right font-mono">
                                                        {Number(line.debit) > 0 ? Number(line.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                    </td>
                                                    <td className="px-6 py-2 text-sm text-right font-mono">
                                                        {Number(line.credit) > 0 ? Number(line.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Section>
            </div>

            {/* Create Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Post Manual Journal Entry"
                maxWidth="3xl"
            >
                <form onSubmit={handleCreateSubmit}>
                    {formError && (
                        <div className="mb-4 p-3 text-sm text-danger bg-danger-soft rounded-lg border border-danger/20">
                            {formError}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Date</label>
                            <input
                                id="je-date" type="date"
                                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none bg-background-card text-text-primary"
                                value={formData.date}
                                onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Memo</label>
                            <input
                                type="text"
                                placeholder="Description of the transaction"
                                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none bg-background-card text-text-primary placeholder:text-text-tertiary"
                                value={formData.memo}
                                onChange={(e) => setFormData(p => ({ ...p, memo: e.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    <div className="bg-background-subtle border border-border rounded-lg p-1">
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    <th className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase w-1/2">Account</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase">Debit</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase">Credit</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {formData.lines.map((line, index) => (
                                    <tr key={line.id}>
                                        <td className="p-1">
                                            <Select
                                                value={line.accountId}
                                                onChange={(e) => updateLine(index, 'accountId', e.target.value)}
                                                options={[{ value: '', label: 'Select Account' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))]}
                                                placeholder="Select Account"
                                                fullWidth
                                            />
                                        </td>
                                        <td className="p-1">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:ring-1 focus:ring-brand outline-none bg-background-card text-text-primary placeholder:text-text-tertiary"
                                                value={line.debit}
                                                onChange={(e) => updateLine(index, 'debit', e.target.value)}
                                            />
                                        </td>
                                        <td className="p-1">
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:ring-1 focus:ring-brand outline-none bg-background-card text-text-primary placeholder:text-text-tertiary"
                                                value={line.credit}
                                                onChange={(e) => updateLine(index, 'credit', e.target.value)}
                                            />
                                        </td>
                                        <td className="p-1 text-center">
                                            <button
                                                onClick={() => removeLine(index)}
                                                disabled={formData.lines.length <= 2}
                                                className="p-1.5 text-text-tertiary hover:text-danger disabled:opacity-30 transition-colors rounded-md"
                                                type="button"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td className="p-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            icon={<Plus size={16} />}
                                            onClick={addLine}
                                            type="button"
                                        >
                                            Add Line
                                        </Button>
                                    </td>
                                    <td className={`p-2 text-right font-mono font-bold ${Math.abs(totalDebitPreview - totalCreditPreview) > 0.01 ? 'text-danger' : 'text-text-primary'}`}>{totalDebitPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className={`p-2 text-right font-mono font-bold ${Math.abs(totalDebitPreview - totalCreditPreview) > 0.01 ? 'text-danger' : 'text-text-primary'}`}>{totalCreditPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="pt-4 mt-4 flex items-center justify-end gap-3 border-t border-border">
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
                            {createMutation.isPending ? 'Posting...' : 'Post Journal Entry'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </PageTemplate>
    );
}
