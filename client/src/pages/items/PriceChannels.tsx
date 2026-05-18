import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from '@/lib/toast';
import AppLoader from '../../components/ui/AppLoader';
import { Edit2, Loader2, Plus, Save, Search, Trash2, Users, X } from 'lucide-react';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';

type PriceGroup = {
    id: string;
    name: string;
    code?: string | null;
    isDefault: boolean;
    _count?: {
        customers: number;
        productPriceGroups: number;
    };
};

export default function PriceChannels() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [editingGroup, setEditingGroup] = useState<Partial<PriceGroup> | null>(null);
    const [showForm, setShowForm] = useState(false);

    // Customer panel state
    const [customerSearch, setCustomerSearch] = useState('');
    const [assignedCustomers, setAssignedCustomers] = useState<string[]>([]);

    // Pricing matrix state
    const [matrixProducts, setMatrixProducts] = useState<any[]>([]); // products added to matrix
    const [pricingDraft, setPricingDraft] = useState<Record<string, string>>({});
    const [productSearch, setProductSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // ── Queries ────────────────────────────────────────────────────────────
    const { data: groupsData, isLoading: groupsLoading } = useQuery({
        queryKey: ['priceChannels'],
        queryFn: () => api.get('/products/meta/price-groups').then((r) => r.data.data as PriceGroup[]),
    });
    const groups = groupsData || [];
    const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

    const { data: groupDetail } = useQuery({
        queryKey: ['priceChannel-detail', selectedGroupId],
        queryFn: () => api.get(`/products/meta/price-groups/${selectedGroupId}`).then((r) => r.data.data),
        enabled: !!selectedGroupId,
    });

    const { data: customersData } = useQuery({
        queryKey: ['priceChannel-customers', customerSearch],
        queryFn: () =>
            api.get('/customers', { params: { page: 1, limit: 500, search: customerSearch || undefined } }).then((r) => r.data.data),
    });
    const customers = customersData || [];

    // Products with existing overrides for this group — auto-loaded when group changes
    const { data: existingOverridesData } = useQuery({
        queryKey: ['priceChannel-existing', selectedGroupId],
        queryFn: () =>
            api.get('/products', {
                params: { page: 1, limit: 200, includePricing: true, priceGroupId: selectedGroupId },
            }).then((r) => r.data.data),
        enabled: !!selectedGroupId,
    });

    // Product search dropdown — only fires when user types
    const { data: searchResultsData, isFetching: searchFetching } = useQuery({
        queryKey: ['priceChannel-productSearch', productSearch],
        queryFn: () =>
            api.get('/products', {
                params: { page: 1, limit: 20, search: productSearch, includePricing: true, priceGroupId: selectedGroupId },
            }).then((r) => r.data.data),
        enabled: productSearch.trim().length >= 1,
    });
    const searchResults: any[] = searchResultsData || [];

    // ── Effects ───────────────────────────────────────────────────────────

    // When group changes: seed matrix with products that already have overrides
    useEffect(() => {
        if (!selectedGroupId) return;
        setMatrixProducts([]);
        setPricingDraft({});
    }, [selectedGroupId]);

    useEffect(() => {
        if (!existingOverridesData || !selectedGroupId) return;
        const withOverrides = (existingOverridesData as any[]).filter(
            (p) => (p.priceGroupPrices || []).some((r: any) => r.priceGroupId === selectedGroupId)
        );
        if (withOverrides.length === 0) return;

        setMatrixProducts((prev) => {
            const existingIds = new Set(prev.map((p: any) => p.id));
            const toAdd = withOverrides.filter((p: any) => !existingIds.has(p.id));
            return [...prev, ...toAdd];
        });

        setPricingDraft((prev) => {
            const next = { ...prev };
            for (const product of withOverrides) {
                for (const unit of product.units || []) {
                    const override = (product.priceGroupPrices || []).find(
                        (row: any) =>
                            row.priceGroupId === selectedGroupId &&
                            String(row.unitCode).toUpperCase() === String(unit.unitCode).toUpperCase()
                    );
                    const key = `${product.id}__${String(unit.unitCode).toUpperCase()}`;
                    if (!(key in next)) {
                        next[key] = override ? String(Number(override.salePrice || 0)) : '';
                    }
                }
            }
            return next;
        });
    }, [existingOverridesData, selectedGroupId]);

    // Customer assignment sync
    useEffect(() => {
        if (!selectedGroupId) return;
        const ids = customers.filter((c: any) => c.priceGroupId === selectedGroupId).map((c: any) => c.id);
        setAssignedCustomers(ids);
    }, [selectedGroupId, customers]);

    // Auto-select first group
    useEffect(() => {
        if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id);
    }, [groups, selectedGroupId]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Helpers ───────────────────────────────────────────────────────────
    const filteredGroups = groups.filter((g) => {
        const text = `${g.name} ${g.code || ''}`.toLowerCase();
        return text.includes(search.toLowerCase());
    });

    const addProductToMatrix = (product: any) => {
        setMatrixProducts((prev) => {
            if (prev.find((p) => p.id === product.id)) return prev;
            return [...prev, product];
        });
        setPricingDraft((prev) => {
            const next = { ...prev };
            for (const unit of product.units || []) {
                const override = (product.priceGroupPrices || []).find(
                    (row: any) =>
                        row.priceGroupId === selectedGroupId &&
                        String(row.unitCode).toUpperCase() === String(unit.unitCode).toUpperCase()
                );
                const key = `${product.id}__${String(unit.unitCode).toUpperCase()}`;
                if (!(key in next)) {
                    next[key] = override ? String(Number(override.salePrice || 0)) : '';
                }
            }
            return next;
        });
        setProductSearch('');
        setShowDropdown(false);
    };

    const removeProductFromMatrix = (productId: string) => {
        setMatrixProducts((prev) => prev.filter((p) => p.id !== productId));
    };

    // ── Mutations ─────────────────────────────────────────────────────────
    const saveGroupMut = useMutation({
        mutationFn: async (payload: any) => {
            if (editingGroup?.id) return api.patch(`/products/meta/price-groups/${editingGroup.id}`, payload);
            return api.post('/products/meta/price-groups', payload);
        },
        onSuccess: () => {
            toast.success('Price channel saved');
            setShowForm(false);
            setEditingGroup(null);
            qc.invalidateQueries({ queryKey: ['priceChannels'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save price channel'),
    });

    const deleteGroupMut = useMutation({
        mutationFn: (id: string) => api.delete(`/products/meta/price-groups/${id}`),
        onSuccess: () => {
            toast.success('Price channel removed');
            setSelectedGroupId('');
            qc.invalidateQueries({ queryKey: ['priceChannels'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to delete price channel'),
    });

    const saveCustomersMut = useMutation({
        mutationFn: () =>
            api.put(`/products/meta/price-groups/${selectedGroupId}/customers`, { customerIds: assignedCustomers }),
        onSuccess: () => {
            toast.success('Customer assignments updated');
            qc.invalidateQueries({ queryKey: ['priceChannel-customers'] });
            qc.invalidateQueries({ queryKey: ['customers'] });
            qc.invalidateQueries({ queryKey: ['priceChannels'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save customer assignments'),
    });

    const savePricingMut = useMutation({
        mutationFn: () => {
            const prices: Array<{ productId: string; unitCode: string; salePrice: number | null }> = [];
            for (const product of matrixProducts) {
                for (const unit of product.units || []) {
                    const key = `${product.id}__${String(unit.unitCode).toUpperCase()}`;
                    const raw = pricingDraft[key];
                    if (raw === undefined) continue;
                    if (raw === '') {
                        prices.push({ productId: product.id, unitCode: unit.unitCode, salePrice: null });
                        continue;
                    }
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed) || parsed < 0) continue;
                    prices.push({ productId: product.id, unitCode: unit.unitCode, salePrice: parsed });
                }
            }
            return api.put(`/products/meta/price-groups/${selectedGroupId}/pricing`, { prices });
        },
        onSuccess: () => {
            toast.success('Pricing matrix updated');
            qc.invalidateQueries({ queryKey: ['priceChannel-products'] });
            qc.invalidateQueries({ queryKey: ['priceChannel-existing'] });
            qc.invalidateQueries({ queryKey: ['product'] });
            qc.invalidateQueries({ queryKey: ['pos-products'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save pricing matrix'),
    });

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold text-gray-900">Price Channels</h1>
                        <ModuleRefreshButton queryKeys={[['priceChannels'], ['priceChannel-customers'], ['priceChannel-existing']]} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Customer assignments and product-level price overrides.</p>
                </div>
                <button
                    type="button"
                    onClick={() => { setEditingGroup({ name: '', code: '', isDefault: false }); setShowForm(true); }}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus size={15} /> New Channel
                </button>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

                {/* Col 1 – Channel List */}
                <aside className="xl:col-span-3 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search channels..."
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                        />
                    </div>
                    {groupsLoading ? (
                        <AppLoader />
                    ) : filteredGroups.length === 0 ? (
                        <div className="py-10 text-center text-sm text-gray-500">No channels found.</div>
                    ) : (
                        <div className="space-y-2">
                            {filteredGroups.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => setSelectedGroupId(group.id)}
                                    className={`w-full rounded-lg border p-3 text-left ${selectedGroupId === group.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{group.name}</p>
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

                {/* Col 2 + 3 */}
                {!selectedGroup ? (
                    <div className="xl:col-span-9 rounded-xl border border-gray-200 bg-white py-20 text-center text-sm text-gray-500">
                        Select a channel to continue.
                    </div>
                ) : (
                    <div className="xl:col-span-9 space-y-4">
                        {/* Channel header */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">{selectedGroup.name}</h2>
                                <p className="text-xs text-gray-500">
                                    {selectedGroup.code || 'NO-CODE'} · {selectedGroup.isDefault ? 'Default' : 'Non-default'} · {groupDetail?._count?.customers || 0} customers
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setEditingGroup(selectedGroup); setShowForm(true); }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                                >
                                    <Edit2 size={14} /> Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { if (confirm('Delete this price channel?')) deleteGroupMut.mutate(selectedGroup.id); }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"
                                >
                                    <Trash2 size={14} /> Delete
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                            {/* Col 2 – Assigned Customers */}
                            <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                                <div className="flex items-center justify-between shrink-0">
                                    <h3 className="text-sm font-semibold text-gray-900">Assigned Customers</h3>
                                    <button
                                        type="button"
                                        onClick={() => saveCustomersMut.mutate()}
                                        disabled={saveCustomersMut.isPending}
                                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                                    >
                                        {saveCustomersMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                                        Save
                                    </button>
                                </div>
                                <input
                                    value={customerSearch}
                                    onChange={(e) => setCustomerSearch(e.target.value)}
                                    placeholder="Search customers..."
                                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm shrink-0"
                                />
                                <div className="overflow-y-auto space-y-2" style={{ maxHeight: '60vh' }}>
                                    {customers.map((c: any) => (
                                        <label key={c.id} className="flex items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
                                            <span className="text-gray-700">{c.name} <span className="text-xs text-gray-500">({c.customerCode})</span></span>
                                            <input
                                                type="checkbox"
                                                checked={assignedCustomers.includes(c.id)}
                                                onChange={(e) => {
                                                    setAssignedCustomers((prev) =>
                                                        e.target.checked ? Array.from(new Set([...prev, c.id])) : prev.filter((id) => id !== c.id)
                                                    );
                                                }}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Col 3 – Product Pricing Matrix */}
                            <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                                <div className="flex items-center justify-between shrink-0">
                                    <h3 className="text-sm font-semibold text-gray-900">Product Pricing Matrix</h3>
                                    <button
                                        type="button"
                                        onClick={() => savePricingMut.mutate()}
                                        disabled={savePricingMut.isPending || matrixProducts.length === 0}
                                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                                    >
                                        {savePricingMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                        Save
                                    </button>
                                </div>

                                {/* Search-to-add product */}
                                <div className="relative shrink-0" ref={dropdownRef}>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                                        <input
                                            value={productSearch}
                                            onChange={(e) => { setProductSearch(e.target.value); setShowDropdown(true); }}
                                            onFocus={() => { if (productSearch.trim()) setShowDropdown(true); }}
                                            placeholder="Search and add product..."
                                            className="w-full rounded border border-gray-200 pl-8 pr-3 py-2 text-sm"
                                        />
                                        {searchFetching && (
                                            <Loader2 size={13} className="absolute right-3 top-2.5 text-gray-400 animate-spin" />
                                        )}
                                    </div>
                                    {showDropdown && productSearch.trim().length >= 1 && (
                                        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                                            {searchResults.length === 0 && !searchFetching ? (
                                                <div className="px-3 py-3 text-sm text-gray-500">No products found.</div>
                                            ) : (
                                                searchResults.map((p: any) => {
                                                    const alreadyAdded = matrixProducts.some((mp) => mp.id === p.id);
                                                    return (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            disabled={alreadyAdded}
                                                            onClick={() => addProductToMatrix(p)}
                                                            className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${alreadyAdded ? 'text-gray-400 cursor-not-allowed bg-gray-50' : 'hover:bg-blue-50 text-gray-800'}`}
                                                        >
                                                            <div>
                                                                <span className="font-medium">{p.name}</span>
                                                                <span className="ml-2 text-xs text-gray-500 font-mono">{p.itemCode}</span>
                                                            </div>
                                                            {alreadyAdded && <span className="text-xs text-gray-400">Added</span>}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Matrix rows */}
                                <div className="overflow-y-auto space-y-3" style={{ maxHeight: '60vh' }}>
                                    {matrixProducts.length === 0 ? (
                                        <p className="py-8 text-center text-sm text-gray-400">
                                            Search and add products above to set price overrides.
                                        </p>
                                    ) : (
                                        matrixProducts.map((p: any) => (
                                            <div key={p.id} className="space-y-2 rounded border border-gray-100 p-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">{p.name}</div>
                                                        <div className="font-mono text-xs text-gray-500">{p.itemCode}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeProductFromMatrix(p.id)}
                                                        className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
                                                        title="Remove from matrix"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {(p.units || []).map((u: any) => {
                                                        const key = `${p.id}__${String(u.unitCode).toUpperCase()}`;
                                                        return (
                                                            <div key={key} className="grid grid-cols-12 items-center gap-2 text-xs">
                                                                <div className="col-span-3 font-semibold text-gray-600">
                                                                    {u.unitName && <span className="text-gray-800">{u.unitName}</span>}
                                                                    <span className="ml-1 text-gray-400 font-mono text-[11px]">· {u.unitCode}</span>
                                                                </div>
                                                                <div className="col-span-4 text-gray-500">Base Price: {Number(u.salePrice || 0).toFixed(2)}</div>
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
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-5 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900">{editingGroup?.id ? 'Edit Price Channel' : 'New Price Channel'}</h3>
                        <div className="space-y-3">
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
                                Set as default channel
                            </label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { setShowForm(false); setEditingGroup(null); }}
                                className="rounded border border-gray-300 px-3 py-2 text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    saveGroupMut.mutate({
                                        name: String(editingGroup?.name || '').trim(),
                                        code: String(editingGroup?.code || '').trim() || null,
                                        isDefault: Boolean(editingGroup?.isDefault),
                                    })
                                }
                                disabled={saveGroupMut.isPending || !String(editingGroup?.name || '').trim()}
                                className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                            >
                                {saveGroupMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
