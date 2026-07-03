import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import AppLoader from '../../components/ui/AppLoader';
import Modal from '../../components/ui/Modal';
import { DEFAULT_CURRENCY } from '../../lib/constants';

type PriceGroup = {
    id: string;
    name: string;
    code?: string | null;
    isDefault: boolean;
    _count?: { customers: number; productPriceGroups: number };
};

export default function SalesPriceLists() {
    const queryClient = useQueryClient();
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [search, setSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [pricingDraft, setPricingDraft] = useState<Record<string, string>>({});

    const [showForm, setShowForm] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Partial<PriceGroup> | null>(null);

    const { data: groups = [], isLoading: groupsLoading } = useQuery<PriceGroup[]>({
        queryKey: ['sales-pricing-groups'],
        queryFn: () => api.get('/sales/pricing/price-groups').then((r) => r.data.data),
    });

    const filteredGroups = useMemo(() => {
        const key = search.trim().toLowerCase();
        if (!key) return groups;
        return groups.filter((g) => `${g.name} ${g.code || ''}`.toLowerCase().includes(key));
    }, [groups, search]);

    const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

    const { data: productsResp } = useQuery({
        queryKey: ['sales-pricing-products', selectedGroupId, productSearch],
        queryFn: () => api.get('/sales/pricing/products', {
            params: { page: 1, limit: 50, groupId: selectedGroupId, search: productSearch || undefined },
        }).then((r) => r.data),
        enabled: !!selectedGroupId,
    });

    const products = productsResp?.data || [];

    useEffect(() => {
        if (!selectedGroupId) return;
        const nextDraft: Record<string, string> = {};
        for (const product of products) {
            for (const unit of product.units || []) {
                const key = `${product.id}__${String(unit.unitCode).toUpperCase()}`;
                const row = (product.priceGroupPrices || []).find((x: any) => String(x.unitCode).toUpperCase() === String(unit.unitCode).toUpperCase());
                nextDraft[key] = row ? String(Number(row.salePrice || 0)) : '';
            }
        }
        setPricingDraft(nextDraft);
    }, [products, selectedGroupId]);

    useEffect(() => {
        if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id);
    }, [groups, selectedGroupId]);

    const createMut = useMutation({
        mutationFn: (payload: any) => api.post('/sales/pricing/price-groups', payload),
        onSuccess: () => {
            toast.success('Price list created');
            queryClient.invalidateQueries({ queryKey: ['sales-pricing-groups'] });
            setShowForm(false);
            setEditingGroup(null);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create'),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...payload }: any) => api.patch(`/sales/pricing/price-groups/${id}`, payload),
        onSuccess: () => {
            toast.success('Price list updated');
            queryClient.invalidateQueries({ queryKey: ['sales-pricing-groups'] });
            setShowForm(false);
            setEditingGroup(null);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to update'),
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => api.delete(`/sales/pricing/price-groups/${id}`),
        onSuccess: () => {
            toast.success('Price list deleted');
            queryClient.invalidateQueries({ queryKey: ['sales-pricing-groups'] });
            setSelectedGroupId('');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to delete'),
    });

    const savePricingMut = useMutation({
        mutationFn: () => {
            const prices: Array<{ productId: string; unitCode: string; salePrice: number | null }> = [];
            for (const p of products) {
                for (const u of p.units || []) {
                    const key = `${p.id}__${String(u.unitCode).toUpperCase()}`;
                    const raw = pricingDraft[key];
                    if (raw === undefined) continue;
                    if (raw === '') prices.push({ productId: p.id, unitCode: u.unitCode, salePrice: null });
                    else {
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed) && parsed >= 0) prices.push({ productId: p.id, unitCode: u.unitCode, salePrice: parsed });
                    }
                }
            }
            return api.put(`/sales/pricing/price-groups/${selectedGroupId}/pricing`, { prices });
        },
        onSuccess: () => {
            toast.success('Pricing matrix updated');
            queryClient.invalidateQueries({ queryKey: ['sales-pricing-products'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save pricing'),
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Price Lists</h1>
                        <ModuleRefreshButton queryKeys={[["sales-pricing-groups"], ["sales-pricing-products"]]} />
                    </div>
                    <p className="text-sm text-gray-500">Manage sales price lists and unit-level overrides</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setEditingGroup({ name: '', code: '', isDefault: false });
                        setShowForm(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                    <Plus size={16} />
                    New Price List
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <aside className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 xl:col-span-4">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search price lists..."
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                        />
                    </div>
                    {groupsLoading ? (
                        <AppLoader />
                    ) : filteredGroups.length === 0 ? (
                        <div className="py-10 text-center text-sm text-gray-500">No price lists found</div>
                    ) : (
                        <div className="space-y-2">
                            {filteredGroups.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => setSelectedGroupId(group.id)}
                                    className={`w-full rounded-lg border p-3 text-left ${selectedGroupId === group.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{group.name}</p>
                                            <p className="text-xs text-gray-500">{group.code || 'NO-CODE'} {group.isDefault ? '· DEFAULT' : ''}</p>
                                        </div>
                                        <div className="text-right text-xs text-gray-500">
                                            <p>{group._count?.customers || 0} customers</p>
                                            <p>{group._count?.productPriceGroups || 0} overrides</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 xl:col-span-8">
                    {!selectedGroup ? (
                        <div className="py-20 text-center text-sm text-gray-500">Select a price list</div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">{selectedGroup.name}</h2>
                                    <p className="text-xs text-gray-500">{selectedGroup.code || 'NO-CODE'} · {selectedGroup.isDefault ? 'Default' : 'Non-default'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingGroup(selectedGroup);
                                            setShowForm(true);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                                    >
                                        <Pencil size={14} /> Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm('Delete this price list?')) deleteMut.mutate(selectedGroup.id);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-sm font-semibold text-gray-900">Product Pricing Matrix</h3>
                                    <button
                                        type="button"
                                        onClick={() => savePricingMut.mutate()}
                                        disabled={savePricingMut.isPending}
                                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                                    >
                                        {savePricingMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Matrix
                                    </button>
                                </div>
                                <input
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    placeholder="Search products..."
                                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                                />
                                <div className="max-h-[560px] space-y-3 overflow-y-auto">
                                    {products.map((product: any) => (
                                        <div key={product.id} className="space-y-2 rounded border border-gray-100 p-3">
                                            <div className="text-sm font-semibold text-gray-900">{product.name}</div>
                                            <div className="text-xs font-mono text-gray-500">{product.itemCode}</div>
                                            <div className="space-y-2">
                                                {(product.units || []).map((unit: any) => {
                                                    const key = `${product.id}__${String(unit.unitCode).toUpperCase()}`;
                                                    return (
                                                        <div key={key} className="grid grid-cols-12 items-center gap-2 text-xs">
                                                            <div className="col-span-3 font-semibold text-gray-600">{unit.unitCode} ({unit.unitName})</div>
                                                            <div className="col-span-4 text-gray-500">Base: {Number(unit.salePrice || 0).toFixed(2)} {currency}</div>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={pricingDraft[key] ?? ''}
                                                                onChange={(e) => setPricingDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                                                                placeholder="Override"
                                                                className="col-span-5 rounded border border-gray-200 px-2 py-1"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    {products.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No products found</p>}
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>

            <Modal
                isOpen={showForm}
                onClose={() => {
                    setShowForm(false);
                    setEditingGroup(null);
                }}
                title={editingGroup?.id ? 'Edit Price List' : 'New Price List'}
                maxWidth="sm"
            >
                <div className="space-y-4">
                    <input
                        value={String(editingGroup?.name || '')}
                        onChange={(e) => setEditingGroup((prev) => ({ ...(prev || {}), name: e.target.value }))}
                        placeholder="Name"
                        className="w-full rounded border border-gray-200 px-3 py-2"
                    />
                    <input
                        value={String(editingGroup?.code || '')}
                        onChange={(e) => setEditingGroup((prev) => ({ ...(prev || {}), code: e.target.value }))}
                        placeholder="Code"
                        className="w-full rounded border border-gray-200 px-3 py-2"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={Boolean(editingGroup?.isDefault)}
                            onChange={(e) => setEditingGroup((prev) => ({ ...(prev || {}), isDefault: e.target.checked }))}
                        />
                        Set as default
                    </label>
                    <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => {
                                setShowForm(false);
                                setEditingGroup(null);
                            }}
                            className="rounded border border-gray-300 px-3 py-2 text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const payload = {
                                    name: String(editingGroup?.name || '').trim(),
                                    code: String(editingGroup?.code || '').trim() || null,
                                    isDefault: Boolean(editingGroup?.isDefault),
                                };
                                if (!payload.name) return toast.error('Name is required');
                                if (editingGroup?.id) updateMut.mutate({ id: editingGroup.id, ...payload });
                                else createMut.mutate(payload);
                            }}
                            className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white"
                        >
                            {(createMut.isPending || updateMut.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
