import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Search } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import ModuleRefreshButton from '../../../components/ModuleRefreshButton';
import Pagination from '../../../components/ui/Pagination';
import { cashStatusColor, formatMoney } from './utils';
import AppDropdown from '../../../components/ui/AppDropdown';
import { DEFAULT_CURRENCY } from '../../../lib/constants';

export default function SalesCashRuns() {
    const queryClient = useQueryClient();
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [status, setStatus] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const [form, setForm] = useState({
        scheduledAt: '',
        collectorId: '',
        notes: '',
        bags: [{ branchId: '', declaredAmount: '0', notes: '' }],
    });

    const { data: lookupData } = useQuery({
        queryKey: ['sales-cash-lookups', activeBranchId],
        queryFn: () => api.get('/sales/cash/lookups').then((r) => r.data.data),
    });

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-cash-runs', activeBranchId, page, limit, status, search],
        queryFn: () => api.get('/sales/cash/runs', {
            params: {
                page,
                limit,
                status: status || undefined,
                search: search || undefined,
            },
        }).then((r) => r.data),
    });

    const createMut = useMutation({
        mutationFn: (payload: any) => api.post('/sales/cash/runs', payload),
        onSuccess: () => {
            toast.success('Collection run created');
            setShowCreate(false);
            setForm({ scheduledAt: '', collectorId: '', notes: '', bags: [{ branchId: '', declaredAmount: '0', notes: '' }] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-runs'] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-dashboard'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to create run');
        },
    });

    const runs = data?.data || [];
    const pagination = data?.meta?.pagination;
    const branches = lookupData?.branches || [];
    const collectors = lookupData?.collectors || [];

    const totalDeclaredDraft = useMemo(
        () => form.bags.reduce((sum, b) => sum + Number(b.declaredAmount || 0), 0),
        [form.bags]
    );

    const submitCreate = () => {
        if (form.bags.length === 0) return toast.error('Add at least one branch bag');
        const invalid = form.bags.some((b) => !b.branchId || Number(b.declaredAmount) < 0);
        if (invalid) return toast.error('Please complete all bag rows');

        createMut.mutate({
            scheduledAt: form.scheduledAt || undefined,
            collectorId: form.collectorId || undefined,
            notes: form.notes || undefined,
            bags: form.bags.map((b) => ({
                branchId: b.branchId,
                declaredAmount: Number(b.declaredAmount || 0),
                notes: b.notes || undefined,
            })),
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Collection Runs</h1>
                        <ModuleRefreshButton queryKeys={[['sales-cash-runs', activeBranchId]]} />
                    </div>
                    <p className="text-sm text-gray-500">Plan and monitor branch cash pickup routes</p>
                </div>
                <button
                    onClick={() => setShowCreate((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                    <Plus size={16} />
                    {showCreate ? 'Close Form' : 'New Run'}
                </button>
            </div>

            {showCreate && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-900">Create Collection Run</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scheduled Date</label>
                            <input
                                type="date"
                                value={form.scheduledAt}
                                onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Collector</label>
                            <AppDropdown
                                value={form.collectorId}
                                onChange={(v) => setForm(prev => ({ ...prev, collectorId: v }))}
                                options={[{ value: '', label: 'Auto / Unassigned' }, ...collectors.map((u: any) => ({ value: u.id, label: `${u.name} (${u.email})` }))]}
                                placeholder='Auto / Unassigned'
                                searchable
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Run Notes</label>
                            <input
                                value={form.notes}
                                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Optional notes"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Branch Bags</p>
                            <button
                                onClick={() => setForm((p) => ({ ...p, bags: [...p.bags, { branchId: '', declaredAmount: '0', notes: '' }] }))}
                                className="text-xs font-semibold text-blue-700"
                            >
                                + Add Bag
                            </button>
                        </div>
                        {form.bags.map((bag, index) => (
                            <div key={`bag-row-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 md:grid-cols-12">
                                <AppDropdown
                                    value={bag.branchId}
                                    onChange={(v) => setForm(p => ({ ...p, bags: p.bags.map((row, i) => i === index ? { ...row, branchId: v } : row) }))}
                                    options={[{ value: '', label: 'Select branch' }, ...branches.map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))]}
                                    placeholder='Select branch'
                                    searchable
                                />
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={bag.declaredAmount}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setForm((p) => ({
                                            ...p,
                                            bags: p.bags.map((row, i) => (i === index ? { ...row, declaredAmount: value } : row)),
                                        }));
                                    }}
                                    className="md:col-span-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Declared"
                                />
                                <input
                                    value={bag.notes}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setForm((p) => ({
                                            ...p,
                                            bags: p.bags.map((row, i) => (i === index ? { ...row, notes: value } : row)),
                                        }));
                                    }}
                                    className="md:col-span-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Bag note"
                                />
                                <button
                                    onClick={() => setForm((p) => ({ ...p, bags: p.bags.filter((_, i) => i !== index) }))}
                                    disabled={form.bags.length === 1}
                                    className="md:col-span-1 rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-700">Total declared: {formatMoney(totalDeclaredDraft, currency)}</p>
                        <button
                            onClick={submitCreate}
                            disabled={createMut.isPending}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {createMut.isPending ? 'Creating...' : 'Create Run'}
                        </button>
                    </div>
                </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setPage(1);
                                    setSearch(searchInput.trim());
                                }
                            }}
                            placeholder="Search run number or notes"
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                        />
                    </div>
                    <AppDropdown
                        value={status}
                        onChange={(v) => setStatus(v)}
                        options={[{ value: '', label: 'All statuses' }, { value: 'IN_PROGRESS', label: 'In Progress' }, { value: 'CLOSED', label: 'Closed' }, { value: 'CANCELLED', label: 'Cancelled' }]}
                        placeholder='All statuses'
                    />
                    <button
                        onClick={() => {
                            setPage(1);
                            setSearch(searchInput.trim());
                        }}
                        className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Search
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-4 py-3">Run</th>
                            <th className="px-4 py-3">Created</th>
                            <th className="px-4 py-3">Collector</th>
                            <th className="px-4 py-3 text-right">Bags</th>
                            <th className="px-4 py-3 text-right">Declared</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(isLoading || isFetching) && runs.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                                    <Loader2 className="mx-auto mb-2 animate-spin" size={18} />
                                    Loading runs...
                                </td>
                            </tr>
                        ) : runs.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">No collection runs found.</td>
                            </tr>
                        ) : runs.map((row: any) => (
                            <tr key={row.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 font-semibold text-gray-900">{row.runNo}</td>
                                <td className="px-4 py-3 text-gray-600">{new Date(row.createdAt).toLocaleString()}</td>
                                <td className="px-4 py-3 text-gray-700">{row.collector?.name || 'Unassigned'}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{Number(row.totalBags || 0)}</td>
                                <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(Number(row.totalDeclared || 0), currency)}</td>
                                <td className="px-4 py-3">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cashStatusColor(row.status)}`}>
                                        {row.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <Link to={`/sales/cash/runs/${row.id}`} className="text-blue-600 hover:underline">View</Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.total}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>
        </div>
    );
}
