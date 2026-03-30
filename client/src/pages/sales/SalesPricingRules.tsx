import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import AppLoader from '../../components/ui/AppLoader';

type RuleRow = {
    id: string;
    value: string;
    description?: string | null;
    color?: string;
    isActive: boolean;
};

export default function SalesPricingRules({
    title,
    description,
    endpoint,
}: {
    title: string;
    description: string;
    endpoint: 'promotions' | 'discount-rules';
}) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<RuleRow | null>(null);
    const [value, setValue] = useState('');
    const [ruleDescription, setRuleDescription] = useState('');
    const [color, setColor] = useState('#2563eb');
    const [isActive, setIsActive] = useState(true);

    const queryKey = ['sales-pricing-rules', endpoint];
    const { data: rows = [], isLoading } = useQuery<RuleRow[]>({
        queryKey,
        queryFn: () => api.get(`/sales/pricing/${endpoint}`).then((r) => r.data.data),
    });

    const createMut = useMutation({
        mutationFn: (payload: any) => api.post(`/sales/pricing/${endpoint}`, payload),
        onSuccess: () => {
            toast.success('Saved');
            queryClient.invalidateQueries({ queryKey });
            resetForm();
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save'),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...payload }: any) => api.put(`/sales/pricing/${endpoint}/${id}`, payload),
        onSuccess: () => {
            toast.success('Updated');
            queryClient.invalidateQueries({ queryKey });
            resetForm();
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to update'),
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => api.delete(`/sales/pricing/${endpoint}/${id}`),
        onSuccess: () => {
            toast.success('Deleted');
            queryClient.invalidateQueries({ queryKey });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to delete'),
    });

    const filtered = rows.filter((row) => `${row.value} ${row.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()));

    const resetForm = () => {
        setShowForm(false);
        setEditing(null);
        setValue('');
        setRuleDescription('');
        setColor('#2563eb');
        setIsActive(true);
    };

    const startEdit = (row: RuleRow) => {
        setEditing(row);
        setShowForm(true);
        setValue(row.value);
        setRuleDescription(row.description || '');
        setColor(row.color || '#2563eb');
        setIsActive(row.isActive !== false);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                        <ModuleRefreshButton queryKeys={[queryKey]} />
                    </div>
                    <p className="text-sm text-gray-500">{description}</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setShowForm(true);
                        setEditing(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                    <Plus size={16} /> New
                </button>
            </div>

            {showForm && (
                <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-gray-900">{editing ? 'Edit' : 'Create'} {title.slice(0, -1)}</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold text-gray-500">Name</label>
                            <input value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500">Color</label>
                            <input value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500">Description</label>
                        <textarea value={ruleDescription} onChange={(e) => setRuleDescription(e.target.value)} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                        Active
                    </label>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={resetForm} className="rounded border border-gray-300 px-3 py-2 text-sm">Cancel</button>
                        <button
                            type="button"
                            onClick={() => {
                                const payload = { value: value.trim(), description: ruleDescription.trim() || undefined, color: color.trim() || undefined, isActive };
                                if (!payload.value) return toast.error('Name is required');
                                if (editing) updateMut.mutate({ id: editing.id, ...payload });
                                else createMut.mutate(payload);
                            }}
                            className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white"
                        >
                            {(createMut.isPending || updateMut.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={`Search ${title.toLowerCase()}...`}
                        className="w-full rounded border border-gray-200 py-2 pl-9 pr-3 text-sm"
                    />
                </div>
                {isLoading ? (
                    <AppLoader />
                ) : filtered.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">No records found</div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((row) => (
                            <div key={row.id} className="flex items-center justify-between gap-3 rounded border border-gray-100 p-3 hover:bg-gray-50">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded" style={{ backgroundColor: row.color || '#2563eb' }} />
                                        <p className="text-sm font-semibold text-gray-900">{row.value}</p>
                                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${row.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{row.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                                    </div>
                                    {row.description && <p className="mt-1 text-xs text-gray-500">{row.description}</p>}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => startEdit(row)} className="rounded p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-700"><Pencil size={15} /></button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm('Delete this record?')) deleteMut.mutate(row.id);
                                        }}
                                        className="rounded p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
