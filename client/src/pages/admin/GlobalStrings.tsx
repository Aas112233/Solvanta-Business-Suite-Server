import { useState, useMemo } from 'react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { useAuthStore } from '../../stores/authStore';
import {
    Tags, Plus, Trash2, Search, Loader2,
    CreditCard, ShoppingCart, Truck, Package, Info,
    AlertCircle, User, Building2, ExternalLink, Palette,
    Type, Save, Pencil, ToggleLeft, ToggleRight, XCircle,
    RefreshCw, Settings, Sparkles, GripVertical, Eye, EyeOff,
    ChevronRight, Hash, Globe, Layers
} from 'lucide-react';
import AppDropdown from '../../components/ui/AppDropdown';
import {
    DEFAULT_PURCHASE_PAYMENT_METHOD_GLOBAL_STRINGS,
    DEFAULT_SALE_PAYMENT_METHOD_GLOBAL_STRINGS,
} from '../../lib/globalStrings';

// ── Types ───────────────────────────────────────────────────────
interface GlobalString {
    id: string;
    group: string;
    value: string;
    systemKey?: string;
    link?: string;
    color?: string;
    description?: string;
    isActive: boolean;
}

// ── Group Definitions ───────────────────────────────────────────
const GROUPS = [
    { id: 'SALE_PAYMENT_METHOD', label: 'Sale Payment Methods', icon: ShoppingCart, hasColor: true, accent: 'blue' },
    { id: 'PURCHASE_PAYMENT_METHOD', label: 'Purchase Payment Methods', icon: Truck, hasColor: true, accent: 'emerald' },
    { id: 'EXPENSE_CATEGORY', label: 'Expense Categories', icon: CreditCard, accent: 'violet' },
    { id: 'ORDER_TAG', label: 'Order Tags', icon: Tags, hasColor: true, accent: 'amber' },
    { id: 'ITEM_TAG', label: 'Product Tags', icon: Package, hasColor: true, accent: 'pink' },
    { id: 'CUSTOMER_GROUP', label: 'Customer Groups', icon: User, accent: 'cyan' },
    { id: 'APP_LINKS', label: 'External App Links', icon: Globe, hasLink: true, accent: 'indigo' },
    { id: 'COMPANY_SETTINGS', label: 'Advanced Settings', icon: Settings, accent: 'gray' },
];

const PAYMENT_METHOD_GROUPS = new Set(['SALE_PAYMENT_METHOD', 'PURCHASE_PAYMENT_METHOD']);

// ── Default Values ──────────────────────────────────────────────
const GROUP_DEFAULTS: Record<string, Omit<GlobalString, 'id' | 'group' | 'isActive'>[]> = {

    SALE_PAYMENT_METHOD: [
        ...DEFAULT_SALE_PAYMENT_METHOD_GLOBAL_STRINGS,
    ],
    PURCHASE_PAYMENT_METHOD: [
        ...DEFAULT_PURCHASE_PAYMENT_METHOD_GLOBAL_STRINGS,
    ],
    EXPENSE_CATEGORY: [
        { value: 'Rent' }, { value: 'Utilities' }, { value: 'Salaries' },
        { value: 'Marketing' }, { value: 'Supplies' },
    ],
    ORDER_TAG: [
        { value: 'Urgent', color: '#ef4444' },
        { value: 'VIP', color: '#f59e0b' },
        { value: 'Follow Up', color: '#3b82f6' },
    ],
    ITEM_TAG: [
        { value: 'New', color: '#10b981' },
        { value: 'Seasonal', color: '#8b5cf6' },
        { value: 'Promo', color: '#ec4899' },
    ],
    CUSTOMER_GROUP: [
        { value: 'Retail' }, { value: 'Wholesale' }, { value: 'Loyalty' },
    ],
    APP_LINKS: [
        { value: 'Official Documentation', link: 'https://docs.SOLVANTA-erp.com' },
        { value: 'Support Portal', link: 'https://support.SOLVANTA-erp.com' },
    ],
};

// ═════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════
export default function GlobalStrings() {
    const queryClient = useQueryClient();
    const { user, hasPermission } = useAuthStore();

    const roleName = (user?.role?.name || '').toUpperCase();
    const canManage = roleName.includes('ADMIN') || hasPermission('admin.manageStrings');

    // ── State ───────────────────────────────────────────────────
    const [selectedGroup, setSelectedGroup] = useState(GROUPS[0].id);
    const [editingItem, setEditingItem] = useState<GlobalString | null>(null);
    const [formValue, setFormValue] = useState('');
    const [formSystemKey, setFormSystemKey] = useState('');
    const [formColor, setFormColor] = useState('#3b82f6');
    const [formLink, setFormLink] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [search, setSearch] = useState('');
    const [loadingDefaults, setLoadingDefaults] = useState(false);
    const [showForm, setShowForm] = useState(false);


    const currentGroup = GROUPS.find(g => g.id === selectedGroup)!;

    // ── Query ───────────────────────────────────────────────────
    const { data: strings = [], isLoading } = useQuery<GlobalString[]>({
        queryKey: ['global-strings', selectedGroup],
        queryFn: async () => {
            const res = await api.get(`/global-strings?group=${selectedGroup}`);
            return res.data.data;
        },
    });

    // ── Mutations ───────────────────────────────────────────────
    const createMutation = useMutation({
        mutationFn: (payload: any) => api.post('/global-strings', payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-strings'] });
            resetForm();
            toast.success('Added successfully');
        },
        onError: () => toast.error('Failed to add'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, ...payload }: any) => api.put(`/global-strings/${id}`, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-strings'] });
            resetForm();
            toast.success('Updated successfully');
        },
        onError: () => toast.error('Failed to update'),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            api.put(`/global-strings/${id}`, { isActive }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-strings'] });
        },
        onError: () => toast.error('Failed to update status'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/global-strings/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-strings'] });
            toast.success('Removed');
        },
        onError: () => toast.error('Failed to delete'),
    });

    // ── Form Helpers ────────────────────────────────────────────
    const resetForm = () => {
        setEditingItem(null);
        setFormValue('');
        setFormSystemKey('');
        setFormColor('#3b82f6');
        setFormLink('');
        setFormDescription('');
        setShowForm(false);
    };

    const startEdit = (item: GlobalString) => {
        setEditingItem(item);
        setFormValue(item.value);
        setFormSystemKey(item.systemKey || '');
        setFormColor(item.color || '#3b82f6');
        setFormLink(item.link || '');
        setFormDescription(item.description || '');
        setShowForm(true);
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedValue = formValue.trim();
        if (!trimmedValue) return;

        const isPaymentGroup = PAYMENT_METHOD_GROUPS.has(selectedGroup);
        const trimmedSystemKey = formSystemKey.trim().toUpperCase();
        if (isPaymentGroup && !trimmedSystemKey) {
            toast.error('Payment methods require a code (systemKey)');
            return;
        }

        if (editingItem) {
            updateMutation.mutate({
                id: editingItem.id,
                value: trimmedValue,
                systemKey: isPaymentGroup ? trimmedSystemKey : undefined,
                color: formColor.trim() || undefined,
                link: formLink.trim() || undefined,
                description: formDescription.trim() || undefined,
            });
        } else {
            createMutation.mutate({
                group: selectedGroup,
                value: trimmedValue,
                systemKey: isPaymentGroup ? trimmedSystemKey : undefined,
                color: formColor.trim() || undefined,
                link: formLink.trim() || undefined,
                description: formDescription.trim() || undefined,
            });
        }
    };


    // ── Load Defaults ───────────────────────────────────────────
    const loadDefaults = async () => {
        const defaults = GROUP_DEFAULTS[selectedGroup] || [];
        if (defaults.length === 0) {
            toast.error('No defaults for this category');
            return;
        }
        setLoadingDefaults(true);
        let created = 0;
        for (const item of defaults) {
            try {
                const res = await api.post('/global-strings', { group: selectedGroup, ...item });
                if (res.status === 201) created++;
            } catch { /* skip duplicates */ }
        }
        queryClient.invalidateQueries({ queryKey: ['global-strings'] });
        setLoadingDefaults(false);
        toast.success(created > 0 ? `Added ${created} new items` : 'All defaults already loaded');
    };

    // ── Filtered List ───────────────────────────────────────────
    const filteredStrings = strings.filter(s =>
        s.value.toLowerCase().includes(search.toLowerCase())
    );
    const activeCount = strings.filter(s => s.isActive).length;
    const inactiveCount = strings.filter(s => !s.isActive).length;
    const isBusy = createMutation.isPending || updateMutation.isPending;

    const paymentSystemKeyOptions = useMemo(() => {
        const defaults = GROUP_DEFAULTS[selectedGroup] || [];
        const options = defaults
            .filter((d) => d.systemKey)
            .map((d) => ({ value: String(d.systemKey), label: `${d.systemKey} — ${d.value}` }));
        return options;
    }, [selectedGroup]);

    // ═════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════

    return (
        <div className="space-y-8">
            {/* ── Page Header ────────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 bg-gradient-brand rounded-2xl flex items-center justify-center shadow-lg shadow-brand-200">
                            <Layers size={20} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">App Setup & Global Strings</h1>
                            <p className="text-sm text-text-tertiary font-medium">Configure drop-down values and global labels for your company</p>
                        </div>
                    </div>
                </div>
                {canManage && strings.length > 0 && (
                    <button
                        onClick={loadDefaults}
                        disabled={loadingDefaults}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border-subtle rounded-xl text-xs font-bold text-text-secondary hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                    >
                        {loadingDefaults ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Sync Defaults
                    </button>
                )}
            </div>

            {!canManage && (
                <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 text-sm font-medium shadow-sm">
                    <AlertCircle size={20} />
                    <span>You do not have permission to manage global settings. <b>Log out and log back in</b> to sync your permissions.</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* ── Sidebar ────────────────────────────────────────── */}
                <div className="lg:col-span-3 space-y-2">
                    <p className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.15em] px-3 mb-3">Categories</p>
                    {GROUPS.map((group) => {
                        const isActive = selectedGroup === group.id;
                        return (
                            <button
                                key={group.id}
                                onClick={() => { setSelectedGroup(group.id); resetForm(); setSearch(''); }}
                                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 group ${isActive
                                    ? 'bg-gradient-brand text-white shadow-lg shadow-brand-200/60 scale-[1.02]'
                                    : 'bg-white text-text-secondary hover:bg-slate-50 hover:text-text-primary hover:shadow-sm border border-transparent hover:border-border-subtle'
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isActive
                                    ? 'bg-white/20'
                                    : 'bg-slate-100 group-hover:bg-slate-200'
                                    }`}>
                                    <group.icon size={16} />
                                </div>
                                <span className="truncate flex-1 text-left">{group.label}</span>
                                {isActive && <ChevronRight size={16} className="opacity-60" />}
                            </button>
                        );
                    })}
                </div>

                {/* ── Main Panel ──────────────────────────────────────── */}
                <div className="lg:col-span-9 space-y-5">

                    {/* ── Stats Bar ───────────────────────────────────── */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-6 flex-1">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-xs font-bold text-text-tertiary">{activeCount} <span className="text-text-secondary">Active</span></span>
                            </div>
                            {inactiveCount > 0 && (
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                                    <span className="text-xs font-bold text-text-tertiary">{inactiveCount} <span className="text-text-secondary">Hidden</span></span>
                                </div>
                            )}
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-48 pl-9 pr-4 py-2 bg-white border border-border-subtle rounded-xl focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 outline-none text-xs font-medium text-text-primary transition-all"
                            />
                        </div>

                        {/* Add Button */}
                        {canManage && (
                            <button
                                onClick={() => { resetForm(); setShowForm(!showForm); }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${showForm
                                    ? 'bg-slate-100 text-text-tertiary hover:bg-slate-200'
                                    : 'bg-gradient-brand text-white hover:shadow-lg hover:shadow-brand-200/50 hover:scale-[1.02]'
                                    }`}
                            >
                                <Plus size={14} />
                                {showForm ? 'Cancel' : 'Add New'}
                            </button>
                        )}
                    </div>

                    {/* ── Collapsible Add/Edit Form ───────────────────── */}
                    {(showForm || editingItem) && canManage && (
                        <div className="bg-white border border-border-subtle rounded-3xl overflow-hidden shadow-lg shadow-slate-100/50 animate-in">
                            <div className="px-6 py-4 border-b border-border-subtle bg-gradient-to-r from-slate-50 to-white">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={16} className="text-brand-500" />
                                    <h3 className="text-sm font-bold text-text-primary">
                                        {editingItem ? `Editing "${editingItem.value}"` : `Add to ${currentGroup.label}`}
                                    </h3>
                                </div>
                            </div>
                            <form onSubmit={handleSubmit} className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Label */}
                                    <div>
                                        <label className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.12em] mb-2 block">Label / Value</label>
                                        <div className="relative">
                                            <Type size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                                            <input
                                                type="text"
                                                value={formValue}
                                                onChange={(e) => setFormValue(e.target.value)}
                                                autoFocus
                                                placeholder="e.g. Gift Card, mada, Apple Pay..."
                                                className="w-full pl-10 pr-4 py-3 border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-100 focus:border-brand-300 bg-white outline-none transition-all text-sm font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* systemKey for payment method groups */}
                                    {PAYMENT_METHOD_GROUPS.has(selectedGroup) && (
                                        <div>
                                            <label className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.12em] mb-2 block">Code (systemKey)</label>
                                            <AppDropdown
                                                value={formSystemKey}
                                                onChange={setFormSystemKey}
                                                options={[{ value: '', label: 'Select a code' }, ...paymentSystemKeyOptions]}
                                                placeholder="Select a code"
                                                className="w-full"
                                            />
                                            <p className="mt-1 text-[11px] text-text-tertiary">Required for payment methods; must match the transaction code.</p>
                                        </div>
                                    )}


                                    {/* Color */}
                                    {currentGroup.hasColor && (

                                        <div>
                                            <label className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.12em] mb-2 block">Theme Color</label>
                                            <div className="flex gap-2 items-center">
                                                <div className="relative flex-1">
                                                    <Palette size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                                                    <input
                                                        type="text"
                                                        value={formColor}
                                                        onChange={(e) => setFormColor(e.target.value)}
                                                        placeholder="#3b82f6"
                                                        className="w-full pl-10 pr-4 py-3 border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-100 focus:border-brand-300 bg-white outline-none text-sm font-medium font-mono"
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="color"
                                                        value={formColor.startsWith('#') && formColor.length === 7 ? formColor : '#3b82f6'}
                                                        onChange={(e) => setFormColor(e.target.value.toUpperCase())}
                                                        className="w-[46px] h-[46px] rounded-xl border-2 border-border-subtle cursor-pointer p-1 bg-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Link */}
                                    {currentGroup.hasLink && (
                                        <div className="md:col-span-2">
                                            <label className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.12em] mb-2 block">Reference Link</label>
                                            <div className="relative">
                                                <ExternalLink size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                                                <input
                                                    type="url"
                                                    value={formLink}
                                                    onChange={(e) => setFormLink(e.target.value)}
                                                    placeholder="https://..."
                                                    className="w-full pl-10 pr-4 py-3 border border-border-subtle rounded-xl focus:ring-2 focus:ring-brand-100 focus:border-brand-300 bg-white outline-none text-sm font-medium"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Submit Row */}
                                <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border-subtle">
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="px-5 py-2.5 text-text-secondary rounded-xl font-bold text-sm hover:bg-slate-50 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isBusy || !formValue.trim()}
                                        className="px-6 py-2.5 bg-gradient-brand text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-brand-200/50 disabled:opacity-40 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none transition-all flex items-center gap-2"
                                    >
                                        {isBusy ? <Loader2 size={15} className="animate-spin" /> : editingItem ? <Save size={15} /> : <Plus size={15} />}
                                        {editingItem ? 'Save Changes' : 'Add Item'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* ── Cards List ──────────────────────────────────── */}
                    <div className="bg-white border border-border-subtle rounded-3xl overflow-hidden shadow-sm">
                        {isLoading ? (
                            <div className="flex flex-col items-center py-16 text-text-tertiary">
                                <Loader2 size={36} className="animate-spin mb-4 text-brand-400" />
                                <p className="text-sm font-semibold text-text-tertiary">Loading items...</p>
                            </div>
                        ) : filteredStrings.length === 0 ? (
                            <div className="text-center py-16 px-6">
                                <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                                    <Hash size={28} className="text-text-tertiary" />
                                </div>
                                <p className="text-text-secondary font-bold text-base">No values yet</p>
                                <p className="text-text-tertiary text-xs mt-1.5 max-w-xs mx-auto">
                                    {search ? 'No items match your search.' : 'Add your first item or load the recommended defaults.'}
                                </p>
                                {canManage && !search && (
                                    <button
                                        onClick={loadDefaults}
                                        disabled={loadingDefaults}
                                        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-brand text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-brand-200/50 transition-all"
                                    >
                                        {loadingDefaults ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                        Load Recommended Defaults
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="divide-y divide-border-subtle">
                                {filteredStrings.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        className={`group flex items-center gap-4 px-6 py-4 transition-all duration-150 hover:bg-brand-50/30 ${!item.isActive ? 'opacity-50 bg-slate-50/40' : ''
                                            }`}
                                    >
                                        {/* Color Dot */}
                                        <div className="flex-shrink-0">
                                            {item.color ? (
                                                <div
                                                    className="w-5 h-5 rounded-lg shadow-sm border border-white ring-1 ring-border-subtle"
                                                    style={{ backgroundColor: item.color }}
                                                />
                                            ) : (
                                                <div className="w-5 h-5 rounded-lg bg-slate-100 border border-border-subtle" />
                                            )}
                                        </div>

                                        {/* Label & Meta */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold text-sm ${item.isActive ? 'text-text-primary' : 'text-text-tertiary line-through'}`}>
                                                    {item.value}
                                                </span>
                                                {item.systemKey && (
                                                    <span className="text-[9px] font-black bg-slate-100 text-text-tertiary px-1.5 py-0.5 rounded-md tracking-tight uppercase">
                                                        {item.systemKey}
                                                    </span>
                                                )}
                                                {!item.isActive && (
                                                    <span className="text-[9px] font-black bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-amber-100">
                                                        <EyeOff size={9} /> Hidden
                                                    </span>
                                                )}
                                            </div>
                                            {item.link && (
                                                <a
                                                    href={item.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:underline mt-0.5"
                                                >
                                                    <ExternalLink size={10} />
                                                    <span className="truncate max-w-[200px]">{item.link}</span>
                                                </a>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        {canManage && (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                {/* Toggle */}
                                                <button
                                                    onClick={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}
                                                    title={item.isActive ? 'Hide from menus' : 'Show in menus'}
                                                    className={`p-2 rounded-lg transition-all ${item.isActive
                                                        ? 'text-emerald-500 hover:bg-emerald-50'
                                                        : 'text-text-tertiary hover:bg-slate-100'
                                                        }`}
                                                >
                                                    {item.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                                                </button>

                                                {/* Edit */}
                                                <button
                                                    onClick={() => startEdit(item)}
                                                    title="Edit"
                                                    className="p-2 text-text-tertiary hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                                                >
                                                    <Pencil size={15} />
                                                </button>

                                                {/* Delete */}
                                                {!item.systemKey && (
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm(`Delete "${item.value}"?`)) deleteMutation.mutate(item.id);
                                                        }}
                                                        title="Delete"
                                                        className="p-2 text-text-tertiary hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Info Footer ─────────────────────────────────── */}
                    <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-amber-50 to-orange-50/50 rounded-2xl border border-amber-100/80">
                        <Info size={18} className="text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-700 leading-relaxed">
                            <b>Tip:</b> Deleting a value won't remove it from existing records. Use the <b>visibility toggle</b> (eye icon) to temporarily hide options from menus without losing data.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
