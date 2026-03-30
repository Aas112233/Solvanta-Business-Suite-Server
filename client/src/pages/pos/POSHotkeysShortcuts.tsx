import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard, Save, Loader2, Search, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import AppLoader from '../../components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';

type HotkeyId =
    | 'checkout'
    | 'holdSale'
    | 'clearCart'
    | 'focusBarcode'
    | 'searchItems'
    | 'customerLookup'
    | 'paymentCash'
    | 'paymentCard'
    | 'reprintReceipt'
    | 'toggleCatalog';

type HotkeyBinding = {
    id: HotkeyId;
    label: string;
    combo: string;
    enabled: boolean;
};

type ShortcutItem = {
    id: string;
    productId: string;
    productName: string;
    itemCode: string;
    unitCode: string;
    label: string;
    color: string;
};

type HotkeyShortcutSettings = {
    hotkeys: HotkeyBinding[];
    shortcutItems: ShortcutItem[];
};

const DEFAULT_SETTINGS: HotkeyShortcutSettings = {
    hotkeys: [
        { id: 'focusBarcode', label: 'Scanner / Item Input', combo: 'F2', enabled: true },
        { id: 'searchItems', label: 'Find/Search Items', combo: 'F3', enabled: true },
        { id: 'customerLookup', label: 'Lookup Customer', combo: 'F4', enabled: true },
        { id: 'paymentCash', label: 'Payment Method (Toggle) / Cash', combo: 'F8', enabled: true },
        { id: 'holdSale', label: 'Hold/Resume Cart', combo: 'F9', enabled: true },
        { id: 'checkout', label: 'Complete Transaction', combo: 'F12', enabled: true },
    ],
    shortcutItems: [],
};

function normalizeCombo(input: string): string {
    return String(input || '')
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/CONTROL/g, 'CTRL')
        .replace(/COMMAND/g, 'CMD');
}

export default function POSHotkeysShortcuts() {
    const queryClient = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const canEdit = hasPermission('pos.manageTerminals');

    const [form, setForm] = useState<HotkeyShortcutSettings>(DEFAULT_SETTINGS);
    const [productSearch, setProductSearch] = useState('');
    const [unitDraftByProduct, setUnitDraftByProduct] = useState<Record<string, string>>({});

    const { data, isLoading } = useQuery({
        queryKey: ['pos-hotkeys-shortcuts'],
        queryFn: () => api.get('/pos/hotkeys-shortcuts').then((r) => r.data.data as HotkeyShortcutSettings),
    });

    useEffect(() => {
        if (!data) return;
        setForm({
            hotkeys: Array.isArray(data.hotkeys) ? data.hotkeys : DEFAULT_SETTINGS.hotkeys,
            shortcutItems: Array.isArray(data.shortcutItems) ? data.shortcutItems : [],
        });
    }, [data]);

    const { data: products = [], isFetching: isSearchingProducts } = useQuery({
        queryKey: ['products', 'shortcut-search', productSearch],
        queryFn: async () => {
            try {
                const res = await api.get('/products', {
                    params: {
                        page: 1,
                        limit: 20,
                        search: productSearch.trim(),
                    },
                });
                return res.data.data || [];
            } catch {
                return [];
            }
        },
        enabled: productSearch.trim().length >= 2 && canEdit,
    });

    const saveMut = useMutation({
        mutationFn: (payload: HotkeyShortcutSettings) => api.patch('/pos/hotkeys-shortcuts', payload),
        onSuccess: () => {
            toast.success('Hotkeys and shortcut items saved');
            queryClient.invalidateQueries({ queryKey: ['pos-hotkeys-shortcuts'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to save POS shortcut settings');
        },
    });

    const duplicateCombos = useMemo(() => {
        const enabledRows = form.hotkeys.filter((h) => h.enabled).map((h) => normalizeCombo(h.combo)).filter(Boolean);
        const counts = new Map<string, number>();
        for (const combo of enabledRows) {
            counts.set(combo, (counts.get(combo) || 0) + 1);
        }
        return Array.from(counts.entries())
            .filter(([, count]) => count > 1)
            .map(([combo]) => combo);
    }, [form.hotkeys]);

    const updateHotkey = (id: HotkeyId, patch: Partial<HotkeyBinding>) => {
        setForm((prev) => ({
            ...prev,
            hotkeys: prev.hotkeys.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        }));
    };

    const addShortcut = (product: any, unitCode: string) => {
        const key = `${product.id}:${unitCode}`;
        const exists = form.shortcutItems.some((s) => s.productId === product.id && s.unitCode === unitCode);
        if (exists) {
            toast.error('This product unit is already in shortcuts');
            return;
        }
        const next: ShortcutItem = {
            id: key,
            productId: product.id,
            productName: product.name || '',
            itemCode: product.itemCode || '',
            unitCode,
            label: product.name || 'Shortcut',
            color: '#2563EB',
        };
        setForm((prev) => ({ ...prev, shortcutItems: [...prev.shortcutItems, next] }));
        toast.success('Shortcut item added');
    };

    const removeShortcut = (id: string) => {
        setForm((prev) => ({ ...prev, shortcutItems: prev.shortcutItems.filter((x) => x.id !== id) }));
    };

    const moveShortcut = (index: number, direction: 'UP' | 'DOWN') => {
        setForm((prev) => {
            const arr = [...prev.shortcutItems];
            const target = direction === 'UP' ? index - 1 : index + 1;
            if (target < 0 || target >= arr.length) return prev;
            const temp = arr[index];
            arr[index] = arr[target];
            arr[target] = temp;
            return { ...prev, shortcutItems: arr };
        });
    };

    const save = () => {
        if (duplicateCombos.length > 0) {
            toast.error(`Duplicate hotkey combos found: ${duplicateCombos.join(', ')}`);
            return;
        }
        const payload: HotkeyShortcutSettings = {
            hotkeys: form.hotkeys.map((h) => ({
                ...h,
                combo: normalizeCombo(h.combo),
                label: String(h.label || '').trim() || h.id,
            })),
            shortcutItems: form.shortcutItems.map((s) => ({
                ...s,
                id: s.id || `${s.productId}:${s.unitCode}`,
                label: String(s.label || '').trim() || s.productName,
                color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.color || '') ? s.color : '#2563EB',
            })),
        };
        saveMut.mutate(payload);
    };

    if (isLoading) { return <AppLoader />; }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">POS Hotkeys and Shortcut Items</h1>
                    <p className="text-sm text-gray-500">Configure keyboard actions and one-tap product shortcuts for faster checkout.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setForm(DEFAULT_SETTINGS)}
                        disabled={!canEdit || saveMut.isPending}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RotateCcw size={15} />
                        Reset Defaults
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!canEdit || saveMut.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saveMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save
                    </button>
                </div>
            </div>

            {!canEdit && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    You can view this setup, but only <code>pos.manageTerminals</code> can save changes.
                </div>
            )}

            {duplicateCombos.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Duplicate enabled hotkeys: <span className="font-semibold">{duplicateCombos.join(', ')}</span>. Make each combo unique.
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <section className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <Keyboard size={16} className="text-blue-600" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800">Keyboard Hotkeys</h2>
                        </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {form.hotkeys.map((row) => (
                            <div key={row.id} className="px-5 py-3 grid grid-cols-1 md:grid-cols-[1fr_180px_90px] gap-3 items-center">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                                    <p className="text-xs text-gray-500">{row.id}</p>
                                </div>
                                <input
                                    value={row.combo}
                                    disabled={!canEdit}
                                    onChange={(e) => updateHotkey(row.id, { combo: normalizeCombo(e.target.value) })}
                                    placeholder="e.g. CTRL+ENTER"
                                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase disabled:bg-gray-50"
                                />
                                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={row.enabled}
                                        disabled={!canEdit}
                                        onChange={(e) => updateHotkey(row.id, { enabled: e.target.checked })}
                                    />
                                    Enabled
                                </label>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-100 rounded-2xl p-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900">Shortcut Pad Preview</h2>
                    <p className="text-xs text-blue-700 mt-1">This simulates how quick items can appear in POS.</p>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        {form.shortcutItems.slice(0, 8).map((item, idx) => (
                            <div
                                key={item.id}
                                className="rounded-xl p-2.5 text-white min-h-[74px] flex flex-col justify-between shadow-sm"
                                style={{ background: item.color || '#2563EB' }}
                            >
                                <div className="text-[10px] font-black opacity-80">#{idx + 1}</div>
                                <div>
                                    <p className="text-xs font-bold leading-tight line-clamp-2">{item.label || item.productName}</p>
                                    <p className="text-[10px] opacity-85">{item.unitCode}</p>
                                </div>
                            </div>
                        ))}
                        {form.shortcutItems.length === 0 && (
                            <div className="col-span-2 rounded-xl border border-dashed border-blue-200 bg-white/70 p-4 text-xs text-blue-700">
                                No shortcut items yet.
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800">Shortcut Items</h2>
                        <p className="text-xs text-gray-500 mt-1">Add frequently sold products for one-click billing from POS.</p>
                    </div>
                    <div className="relative w-full md:w-[340px]">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <input
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            disabled={!canEdit}
                            placeholder="Search product name or code..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                        />
                    </div>
                </div>

                {canEdit && productSearch.trim().length >= 2 && (
                    <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/60">
                        <div className="text-xs font-semibold text-gray-600 mb-2">Search Results</div>
                        {isSearchingProducts ? (
                            <div className="py-4 text-sm text-gray-500 flex items-center gap-2">
                                <Loader2 size={16} className="animate-spin" />
                                Searching products...
                            </div>
                        ) : products.length === 0 ? (
                            <div className="py-4 text-sm text-gray-500">No products found.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                                {products.map((product: any) => {
                                    const firstUnit = product.units?.[0]?.unitCode || 'UNIT';
                                    const pickedUnit = unitDraftByProduct[product.id] || firstUnit;
                                    return (
                                        <div key={product.id} className="rounded-lg border border-gray-200 bg-white p-2.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{product.name}</p>
                                                    <p className="text-xs text-gray-500 font-mono">{product.itemCode}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => addShortcut(product, pickedUnit)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                                                >
                                                    <Plus size={12} />
                                                    Add
                                                </button>
                                            </div>
                                            <div className="mt-2">
                                                <label className="text-[11px] text-gray-500">Unit</label>
                                                <AppDropdown
                                                    value={pickedUnit}
                                                    onChange={(v) => setUnitDraftByProduct(prev => ({ ...prev, [product.id]: v }))}
                                                    options={(product.units || []).map((u: any) => ({ value: u.unitCode, label: u.unitCode }))}
                                                    placeholder='UNIT'
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    {form.shortcutItems.length === 0 ? (
                        <div className="py-8 text-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl">
                            No shortcut items configured.
                        </div>
                    ) : (
                        form.shortcutItems.map((item, idx) => (
                            <div key={item.id} className="rounded-xl border border-gray-200 p-3 grid grid-cols-1 md:grid-cols-[40px_1fr_140px_100px_100px] gap-3 items-center">
                                <div className="text-xs font-black text-gray-400">#{idx + 1}</div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">{item.productName || item.label}</p>
                                    <p className="text-xs text-gray-500 font-mono">{item.itemCode} · {item.unitCode}</p>
                                </div>
                                <input
                                    value={item.label}
                                    disabled={!canEdit}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setForm((prev) => ({
                                            ...prev,
                                            shortcutItems: prev.shortcutItems.map((row) => (row.id === item.id ? { ...row, label: v } : row)),
                                        }));
                                    }}
                                    placeholder="Button label"
                                    className="px-2.5 py-2 border border-gray-200 rounded-lg text-xs disabled:bg-gray-50"
                                />
                                <input
                                    type="color"
                                    value={item.color || '#2563EB'}
                                    disabled={!canEdit}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setForm((prev) => ({
                                            ...prev,
                                            shortcutItems: prev.shortcutItems.map((row) => (row.id === item.id ? { ...row, color: v } : row)),
                                        }));
                                    }}
                                    className="w-full h-9 border border-gray-200 rounded-lg disabled:opacity-60"
                                />
                                <div className="flex items-center justify-end gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => moveShortcut(idx, 'UP')}
                                        disabled={!canEdit || idx === 0}
                                        className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                        title="Move up"
                                    >
                                        <ArrowUp size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => moveShortcut(idx, 'DOWN')}
                                        disabled={!canEdit || idx === form.shortcutItems.length - 1}
                                        className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                        title="Move down"
                                    >
                                        <ArrowDown size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeShortcut(item.id)}
                                        disabled={!canEdit}
                                        className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
                                        title="Remove shortcut"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
