import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';

type UnitMaster = {
    id: string;
    name: string;
    defaultQtyInBaseUnit?: number | null;
};

type UnitMasterPayload = {
    name: string;
    defaultQtyInBaseUnit: number | null;
};

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

export default function UnitManagement() {
    const qc = useQueryClient();
    const { hasPermission } = useAuthStore();

    const canEditMaster = hasPermission('product.edit') || hasPermission('product.editMaster');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<UnitMaster | null>(null);

    const { data: units, isLoading } = useQuery({
        queryKey: ['unit-management'],
        queryFn: async () => {
            const res = await api.get('/unit-management');
            return (res.data.data || []) as UnitMaster[];
        },
    });

    const saveMut = useMutation({
        mutationFn: async (payload: UnitMasterPayload) => {
            if (editing?.id) {
                return api.patch(`/unit-management/${editing.id}`, payload);
            }
            return api.post('/unit-management', payload);
        },
        onSuccess: () => {
            toast.success(editing ? 'Unit updated' : 'Unit created');
            setShowForm(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['unit-management'] });
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.error?.message || 'Failed to save unit');
        },
    });

    const deleteMut = useMutation({
        mutationFn: async (id: string) => api.delete(`/unit-management/${id}`),
        onSuccess: () => {
            toast.success('Unit deleted');
            qc.invalidateQueries({ queryKey: ['unit-management'] });
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.error?.message || 'Failed to delete unit');
        },
    });

    const filteredUnits = useMemo(() => {
        const key = search.trim().toLowerCase();
        if (!key) return units || [];
        return (units || []).filter((unit) => unit.name.toLowerCase().includes(key));
    }, [search, units]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get('name') || '').trim();
        const defaultQtyInBaseUnit = parseOptionalNumber(form.get('defaultQtyInBaseUnit'));

        if (!name) {
            toast.error('Unit name is required');
            return;
        }
        if (defaultQtyInBaseUnit !== null && defaultQtyInBaseUnit <= 0) {
            toast.error('Default quantity must be greater than 0');
            return;
        }

        saveMut.mutate({ name, defaultQtyInBaseUnit });
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Unit Management</h1>
                        <ModuleRefreshButton queryKeys={[['unit-management']]} />
                    </div>
                    <p className="text-sm text-gray-500">Create reusable unit templates for item unit setup.</p>
                </div>
                <button
                    type="button"
                    disabled={!canEditMaster}
                    onClick={() => {
                        setEditing(null);
                        setShowForm(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Plus size={17} />
                    Add Unit
                </button>
            </div>

            <div className="relative max-w-sm">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search units..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                        <tr>
                            <th className="px-5 py-3 font-semibold">Unit Name</th>
                            <th className="px-5 py-3 font-semibold">Default Quantity In Unit</th>
                            <th className="px-5 py-3 text-right font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading && (
                            <tr>
                                <td colSpan={3} className="px-5 py-10 text-center text-gray-500">
                                    <Loader2 size={18} className="mx-auto animate-spin" />
                                </td>
                            </tr>
                        )}
                        {!isLoading && filteredUnits.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-5 py-10 text-center text-gray-500">
                                    No units found
                                </td>
                            </tr>
                        )}
                        {!isLoading && filteredUnits.map((unit) => (
                            <tr key={unit.id} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-medium text-gray-900">{unit.name}</td>
                                <td className="px-5 py-3 text-gray-700">
                                    {unit.defaultQtyInBaseUnit != null ? unit.defaultQtyInBaseUnit : '-'}
                                </td>
                                <td className="px-5 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            type="button"
                                            disabled={!canEditMaster}
                                            onClick={() => {
                                                setEditing(unit);
                                                setShowForm(true);
                                            }}
                                            className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                            title="Edit unit"
                                        >
                                            <Edit2 size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!canEditMaster || deleteMut.isPending}
                                            onClick={() => {
                                                if (window.confirm(`Delete "${unit.name}"?`)) {
                                                    deleteMut.mutate(unit.id);
                                                }
                                            }}
                                            className="rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                            title="Delete unit"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {editing ? 'Edit Unit' : 'Add Unit'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditing(null);
                                }}
                                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-700">Unit Name *</label>
                                <input
                                    name="name"
                                    defaultValue={editing?.name || ''}
                                    required
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder="e.g. Box"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-700">
                                    Default Quantity In Unit (Optional)
                                </label>
                                <input
                                    name="defaultQtyInBaseUnit"
                                    type="number"
                                    min="0.0001"
                                    step="0.0001"
                                    defaultValue={editing?.defaultQtyInBaseUnit ?? ''}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Leave empty to allow custom fraction"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    If provided, item form fraction will be locked to this value.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        setEditing(null);
                                    }}
                                    className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saveMut.isPending}
                                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {saveMut.isPending ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
