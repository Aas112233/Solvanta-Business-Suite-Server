import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Search, ShieldCheck, Wallet } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../lib/api';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import Pagination from '../../components/ui/Pagination';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../../components/ui/AppDropdown';
import { DEFAULT_CURRENCY } from '../../lib/constants';

type CustomerRow = {
    id: string;
    customerCode: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    creditLimit: number;
    allowCreditSales?: boolean;
    notes?: string | null;
    updatedAt?: string;
};

type PaginatedResponse<T> = {
    data: T[];
    meta?: {
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
            totalItems?: number;
        };
    };
};

type DraftRow = {
    creditLimit: string;
    allowCreditSales: boolean;
    terms: string;
};

export default function CreditLimitsTerms() {
    const queryClient = useQueryClient();
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'allowed' | 'blocked'>('all');
    const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['customers-credit-terms', page, limit, search],
        queryFn: () =>
            api
                .get<PaginatedResponse<CustomerRow>>('/customers', {
                    params: { page, limit, search: search || undefined },
                })
                .then((r) => r.data),
    });

    const rows = data?.data || [];
    const pagination = data?.meta?.pagination;

    const saveMut = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: any }) => api.patch(`/customers/${id}`, payload),
    });

    const getDraft = (row: CustomerRow): DraftRow =>
        drafts[row.id] || {
            creditLimit: String(Number(row.creditLimit || 0)),
            allowCreditSales: row.allowCreditSales !== false,
            terms: String(row.notes || ''),
        };

    const setDraftValue = <K extends keyof DraftRow>(row: CustomerRow, key: K, value: DraftRow[K]) => {
        setDrafts((prev) => {
            const existing = prev[row.id] || getDraft(row);
            return {
                ...prev,
                [row.id]: {
                    ...existing,
                    [key]: value,
                },
            };
        });
    };

    const isDirty = (row: CustomerRow) => {
        const draft = getDraft(row);
        const draftLimit = Number(draft.creditLimit || 0);
        return (
            Number.isFinite(draftLimit) &&
            (
                draftLimit !== Number(row.creditLimit || 0) ||
                draft.allowCreditSales !== (row.allowCreditSales !== false) ||
                draft.terms !== String(row.notes || '')
            )
        );
    };

    const filteredRows = useMemo(() => {
        return rows.filter((row) => {
            if (statusFilter === 'allowed') return row.allowCreditSales !== false;
            if (statusFilter === 'blocked') return row.allowCreditSales === false;
            return true;
        });
    }, [rows, statusFilter]);

    const summary = useMemo(() => {
        const allowedCount = filteredRows.filter((r) => r.allowCreditSales !== false).length;
        const blockedCount = filteredRows.length - allowedCount;
        const totalLimit = filteredRows.reduce((sum, r) => sum + Number(r.creditLimit || 0), 0);
        return { allowedCount, blockedCount, totalLimit };
    }, [filteredRows]);

    const applySearch = () => {
        setPage(1);
        setSearch(searchInput.trim());
    };

    const saveRow = async (row: CustomerRow) => {
        const draft = getDraft(row);
        const creditLimit = Number(draft.creditLimit || 0);
        if (!Number.isFinite(creditLimit) || creditLimit < 0) {
            toast.error('Credit limit must be 0 or greater');
            return;
        }

        setSavingId(row.id);
        try {
            await saveMut.mutateAsync({
                id: row.id,
                payload: {
                    creditLimit,
                    allowCreditSales: draft.allowCreditSales,
                    notes: draft.terms.trim() || null,
                },
            });
            toast.success(`Updated ${row.name}`);
            setDrafts((prev) => {
                const next = { ...prev };
                delete next[row.id];
                return next;
            });
            queryClient.invalidateQueries({ queryKey: ['customers-credit-terms'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (err: any) {
            toast.error(err.response?.data?.error?.message || 'Failed to update customer');
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Credit Limits and Terms</h1>
                    <p className="text-sm text-gray-500">Manage customer credit eligibility, limits, and payment terms</p>
                </div>
                <ModuleRefreshButton queryKeys={[['customers-credit-terms'], ['customers']]} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-blue-600"><ShieldCheck size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Credit Enabled</p>
                    <p className="text-xl font-semibold text-gray-900">{summary.allowedCount}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-rose-600"><ShieldCheck size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Credit Blocked</p>
                    <p className="text-xl font-semibold text-gray-900">{summary.blockedCount}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-emerald-600"><Wallet size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Credit Limit (Shown)</p>
                    <p className="text-xl font-semibold text-gray-900">{summary.totalLimit.toLocaleString()} {currency}</p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                            placeholder="Search customer by name, code, phone, or email"
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                        />
                    </div>
                    <AppDropdown
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v as 'all' | 'allowed' | 'blocked')}
                        options={[{ value: 'all', label: 'All Customers' }, { value: 'allowed', label: 'Credit Allowed' }, { value: 'blocked', label: 'Credit Blocked' }]}
                        placeholder='All Customers'
                    />
                    <button
                        type="button"
                        onClick={applySearch}
                        className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        Apply
                    </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">`Credit terms` in this module are saved in customer notes.</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-[1100px] w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Credit Sale</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Credit Limit</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Credit Terms</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(isLoading || isFetching) && rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                                        <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                                        Loading credit terms...
                                    </td>
                                </tr>
                            ) : filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                                        No customers found for this filter.
                                    </td>
                                </tr>
                            ) : filteredRows.map((row) => {
                                const draft = getDraft(row);
                                const saving = savingId === row.id;
                                return (
                                    <tr key={row.id} className="border-t border-gray-100">
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                                            <p className="text-xs text-gray-500 font-mono">{row.customerCode}</p>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            <p>{row.phone || '-'}</p>
                                            <p className="text-xs">{row.email || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={draft.allowCreditSales}
                                                    onChange={(e) => setDraftValue(row, 'allowCreditSales', e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                {draft.allowCreditSales ? 'Allowed' : 'Blocked'}
                                            </label>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    value={draft.creditLimit}
                                                    onChange={(e) => setDraftValue(row, 'creditLimit', e.target.value)}
                                                    className="w-36 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                                />
                                                <span className="text-xs text-gray-500">{currency}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                value={draft.terms}
                                                onChange={(e) => setDraftValue(row, 'terms', e.target.value)}
                                                placeholder="Net 30, monthly settlement, etc."
                                                className="w-full min-w-[260px] rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => saveRow(row)}
                                                disabled={!isDirty(row) || saving}
                                                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                                Save
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {pagination && (
                    <Pagination
                        currentPage={pagination.page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems || pagination.total}
                        itemsPerPage={pagination.limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>
        </div>
    );
}

