import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { FileText, Plus, X, Trash2, Loader2, Filter, RotateCcw } from 'lucide-react';
import toast from '@/lib/toast';
import AppDropdown from '../../components/ui/AppDropdown';
import { formatCompanyDate, toDateInputValue } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';

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
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">General Journal</h1>
                    <p className="text-gray-500 mt-1">Review and post double-entry ledgers</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    New Journal Entry
                </button>
            </div>

            {/* Filter Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Filters</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={filters.startDate}
                            onChange={(e) => setFilters(p => ({ ...p, startDate: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={filters.endDate}
                            onChange={(e) => setFilters(p => ({ ...p, endDate: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                        <AppDropdown
                            value={filters.branchId}
                            onChange={(v) => setFilters(p => ({ ...p, branchId: v }))}
                            options={[{ value: '', label: 'All Branches' }, ...branches.map((b: any) => ({ value: b.id, label: b.name }))]}
                            placeholder="Select Branch"
                        />
                    </div>
                    <div className="flex items-end gap-2">
                        <button
                            onClick={() => {
                                setHasSearched(true);
                                refetch();
                            }}
                            disabled={!hasActiveFilters}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Apply Filters
                        </button>
                        <button
                            onClick={() => {
                                setFilters({ startDate: '', endDate: '', branchId: '' });
                                setHasSearched(false);
                            }}
                            className="px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
                            title="Clear filters"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Entry No.</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Accounts / Memo</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Debit</th>
                                <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {!hasSearched ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-gray-500">
                                        <Filter className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                        <p className="text-lg font-medium text-gray-700 mb-1">No filters applied</p>
                                        <p className="text-sm">Please select date range and/or branch to view journal entries.</p>
                                    </td>
                                </tr>
                            ) : isLoading ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading journal entries...</td></tr>
                            ) : entries.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                        <p>No journal entries found for the selected filters.</p>
                                    </td>
                                </tr>
                            ) : (
                                entries.map((entry) => (
                                    <React.Fragment key={entry.id}>
                                        <tr className="bg-gray-50/50">
                                            <td className="px-6 py-3 text-sm text-gray-900 border-l-4 border-blue-500 font-medium whitespace-nowrap">
                                                {formatCompanyDate(entry.date, company)}
                                            </td>
                                            <td className="px-6 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                                                {entry.entryNo}
                                                {entry.sourceType && <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">{entry.sourceType}</span>}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-500 italic" colSpan={3}>
                                                Memo: {entry.memo || 'Auto-generated ledger entry'}
                                            </td>
                                        </tr>
                                        {entry.lines.map((line) => (
                                            <tr key={line.id} className="hover:bg-gray-50">
                                                <td colSpan={2}></td>
                                                <td className={`px-6 py-2 text-sm ${Number(line.credit) > 0 ? 'pl-10 text-gray-700' : 'font-medium text-gray-900'}`}>
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
            </div>

            {/* Create Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <h3 className="text-lg font-bold text-gray-900">Post Manual Journal Entry</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto grow">
                            {formError && (
                                <div className="mb-4 p-3 text-sm text-rose-600 bg-rose-50 rounded-lg border border-rose-100">
                                    {formError}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                    <input
                                        id="je-date" type="date"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.date}
                                        onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Memo</label>
                                    <input
                                        type="text"
                                        placeholder="Description of the transaction"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.memo}
                                        onChange={(e) => setFormData(p => ({ ...p, memo: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-1">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr>
                                            <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-1/2">Account</th>
                                            <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Debit</th>
                                            <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Credit</th>
                                            <th className="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {formData.lines.map((line, index) => (
                                            <tr key={line.id}>
                                                <td className="p-1">
                                                    <AppDropdown
                                                        value={line.accountId}
                                                        onChange={(v) => updateLine(index, 'accountId', v)}
                                                        options={[{ value: '', label: 'Select Account' }, ...accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))]}
                                                        placeholder='Select Account'
                                                        searchable
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                                        value={line.debit}
                                                        onChange={(e) => updateLine(index, 'debit', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                                        value={line.credit}
                                                        onChange={(e) => updateLine(index, 'credit', e.target.value)}
                                                    />
                                                </td>
                                                <td className="p-1 text-center">
                                                    <button
                                                        onClick={() => removeLine(index)}
                                                        disabled={formData.lines.length <= 2}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors rounded-md"
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
                                                <button
                                                    onClick={addLine}
                                                    className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                >
                                                    <Plus size={16} /> Add Line
                                                </button>
                                            </td>
                                            <td className={`p-2 text-right font-mono font-bold ${Math.abs(totalDebitPreview - totalCreditPreview) > 0.01 ? 'text-rose-600' : 'text-gray-900'}`}>{totalDebitPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td className={`p-2 text-right font-mono font-bold ${Math.abs(totalDebitPreview - totalCreditPreview) > 0.01 ? 'text-rose-600' : 'text-gray-900'}`}>{totalCreditPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateSubmit}
                                disabled={createMutation.isPending}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                {createMutation.isPending ? 'Posting...' : 'Post Journal Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
