import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { Save, ArrowLeft, Plus, Trash2, Loader2, RefreshCw, Lock } from 'lucide-react';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import AppLoader from '../../components/ui/AppLoader';

const itemFormSchema = z.object({
    itemCode: z.string().regex(/^\d{16}$/, 'Item Code must be exactly 16 digits'),
    name: z.string().min(1, 'Name is required'),
    nameArabic: z.string().optional(),
    categoryId: z.string().min(1, 'Category is required'),
    itemGroupId: z.string().min(1, 'Group is required'),
    brandId: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

const unitSchema = z.object({
    unitName: z.string().min(1, 'Unit name is required'),
    unitCode: z.string().min(1, 'Barcode/Unit code is required'),
    qtyInBaseUnit: z.number().positive('Fraction must be greater than 0'),
    salePrice: z.number().min(0, 'Sale price cannot be negative'),
    costPrice: z.number().min(0, 'Cost price cannot be negative'),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    minimumNegotiationPrice: z.number().nullable().optional(),
});

type ItemFormValues = z.infer<typeof itemFormSchema>;

/** Small inline component to type & confirm a new flavor barcode */
function UnitBarcodeInput({ onAdd }: { onAdd: (bc: string) => void | Promise<void> }) {
    const [val, setVal] = useState('');
    const [loading, setLoading] = useState(false);
    const submit = async () => {
        const trimmed = val.trim();
        if (!trimmed || loading) return;
        setLoading(true);
        try {
            await onAdd(trimmed);
            setVal('');
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="inline-flex items-center gap-1">
            <input
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                disabled={loading}
                className="px-2 py-1 text-xs border border-dashed border-blue-300 rounded font-mono w-36 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                placeholder="Add barcode…"
            />
            <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >{loading ? '…' : '+ Add'}</button>
        </div>
    );
}

export default function ItemForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isNew = !id || id === 'new';
    const qc = useQueryClient();
    const { hasPermission } = useAuthStore();

    const [activeTab, setActiveTab] = useState('general');
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showBrandModal, setShowBrandModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newBrandName, setNewBrandName] = useState('');
    const [formData, setFormData] = useState<any>({
        itemCode: '', name: '', nameArabic: '', categoryId: '', itemGroupId: '', brandId: '',
        taxRate: 0.15, status: 'ACTIVE',
        barcodes: []
    });
    const [units, setUnits] = useState<any[]>([
        { unitName: 'Piece', unitCode: 'PCS', qtyInBaseUnit: 1, isBase: true, salePrice: 0, costPrice: 0, minimumNegotiationPrice: '', status: 'ACTIVE', barcodes: [] }
    ]);
    const [pricingOverrides, setPricingOverrides] = useState<Record<string, string>>({});
    const [priceMinOverrides, setPriceMinOverrides] = useState<Record<string, string>>({});
    const [unitErrors, setUnitErrors] = useState<Record<number, string[]>>({});

    const canEditItem = hasPermission('product.edit') || hasPermission('product.editItem');
    const canEditPricing = hasPermission('product.edit') || hasPermission('product.editPricing');
    const canEditMaster = hasPermission('product.edit') || hasPermission('product.editMaster');

    const {
        control,
        setValue,
        getValues,
        trigger,
        formState: { errors },
    } = useForm<ItemFormValues>({
        resolver: zodResolver(itemFormSchema),
        defaultValues: {
            itemCode: '',
            name: '',
            nameArabic: '',
            categoryId: '',
            itemGroupId: '',
            brandId: '',
            status: 'ACTIVE',
        },
    });

    // Fetch Meta
    const { data: cats, refetch: refetchCategories, isFetching: isFetchingCategories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/products/meta/categories').then(r => r.data.data) });
    const { data: groups, refetch: refetchGroups, isFetching: isFetchingGroups } = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/products/meta/groups').then(r => r.data.data) });
    const { data: brands, refetch: refetchBrands, isFetching: isFetchingBrands } = useQuery({ queryKey: ['brands'], queryFn: () => api.get('/products/meta/brands').then(r => r.data.data) });
    const { data: priceGroups, refetch: refetchPriceGroups, isFetching: isFetchingPriceGroups } = useQuery({ queryKey: ['priceGroups'], queryFn: () => api.get('/products/meta/price-groups').then(r => r.data.data) });

    // Fetch Item Detais
    const { data: item, isLoading } = useQuery({
        queryKey: ['product', id],
        queryFn: () => api.get(`/products/${id}`).then(r => r.data.data),
        enabled: !isNew
    });
    const { data: auditTimeline } = useQuery({
        queryKey: ['product-audit', id],
        queryFn: () => api.get(`/products/${id}/audit`).then((r) => r.data.data),
        enabled: !isNew && !!id,
    });

    const createGroupMut = useMutation({
        mutationFn: async () => {
            const res = await api.post('/products/meta/groups', { name: newGroupName.trim() });
            return res.data.data;
        },
        onSuccess: (created) => {
            qc.invalidateQueries({ queryKey: ['groups'] });
            if (created?.id) {
                setFormData((prev: any) => ({ ...prev, itemGroupId: created.id }));
            }
            setNewGroupName('');
            setShowGroupModal(false);
            toast.success('Group added');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to add group'),
    });

    const createCategoryMut = useMutation({
        mutationFn: async () => {
            const res = await api.post('/products/meta/categories', { name: newCategoryName.trim() });
            return res.data.data;
        },
        onSuccess: (created) => {
            qc.invalidateQueries({ queryKey: ['categories'] });
            if (created?.id) {
                setFormData((prev: any) => ({ ...prev, categoryId: created.id }));
            }
            setNewCategoryName('');
            setShowCategoryModal(false);
            toast.success('Category added');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to add category'),
    });

    const createBrandMut = useMutation({
        mutationFn: async () => {
            const res = await api.post('/products/meta/brands', { name: newBrandName.trim() });
            return res.data.data;
        },
        onSuccess: (created) => {
            qc.invalidateQueries({ queryKey: ['brands'] });
            if (created?.id) {
                setFormData((prev: any) => ({ ...prev, brandId: created.id }));
                setValue('brandId', created.id);
            }
            setNewBrandName('');
            setShowBrandModal(false);
            toast.success('Brand added');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to add brand'),
    });

    const generateCode = () => {
        // Generate 16 digit numeric code
        let code = '';
        for (let i = 0; i < 16; i++) {
            code += Math.floor(Math.random() * 10).toString();
        }
        setFormData((prev: any) => ({ ...prev, itemCode: code }));
        setValue('itemCode', code, { shouldValidate: true });
    };

    useEffect(() => {
        if (isNew && !formData.itemCode) {
            generateCode();
        }
    }, [isNew]);

    useEffect(() => {
        if (item) {
            setFormData({
                itemCode: item.itemCode,
                name: item.name,
                nameArabic: item.nameArabic || '',
                categoryId: item.categoryId || '',
                itemGroupId: item.itemGroupId || '',
                brandId: item.brandId || '',
                taxRate: item.taxRate,
                status: item.status,
                barcodes: item.barcodes || []
            });
            setValue('itemCode', item.itemCode);
            setValue('name', item.name);
            setValue('nameArabic', item.nameArabic || '');
            setValue('categoryId', item.categoryId || '');
            setValue('itemGroupId', item.itemGroupId || '');
            setValue('brandId', item.brandId || '');
            setValue('status', item.status);
            if (item.units?.length) setUnits(item.units.map((u: any) => ({
                ...u,
                status: u.status || 'ACTIVE',
                minimumNegotiationPrice: u.minimumNegotiationPrice != null ? u.minimumNegotiationPrice : '',
                // Support new barcodes[] array, fall back to legacy barcode string
                barcodes: u.barcodes?.length ? u.barcodes : (u.barcode ? [u.barcode] : [])
            })));
            const nextOverrides: Record<string, string> = {};
            const nextMinOverrides: Record<string, string> = {};
            for (const row of item.priceGroupPrices || []) {
                const key = `${row.priceGroupId}__${String(row.unitCode).toUpperCase()}`;
                nextOverrides[key] = String(Number(row.salePrice || 0));
                if (row.minimumNegotiationPrice != null) {
                    nextMinOverrides[key] = String(Number(row.minimumNegotiationPrice));
                }
            }
            setPricingOverrides(nextOverrides);
            setPriceMinOverrides(nextMinOverrides);
        }
    }, [item, setValue]);

    // Mutation
    const saveMut = useMutation({
        mutationFn: async (payloadData: any) => {
            const normalizedUnits = units.map((u, i) => {
                const code = String(u.unitCode || '').trim().toUpperCase();
                // Merge in extra barcodes the user provided, ensuring unitCode is always first
                const extraBarcodes = (u.barcodes || []).map((b: string) => String(b).trim().toUpperCase()).filter(Boolean);
                const mergedBarcodes = Array.from(new Set([code, ...extraBarcodes]));
                return {
                    ...u,
                    unitCode: code,
                    barcodes: mergedBarcodes,
                    isBase: i === 0,
                    qtyInBaseUnit: i === 0 ? 1 : u.qtyInBaseUnit,
                    minimumNegotiationPrice: u.minimumNegotiationPrice === '' || u.minimumNegotiationPrice == null ? null : parseFloat(u.minimumNegotiationPrice)
                };
            });

            // Build product-level barcodes from all unit barcodes
            const productBarcodes = Array.from(new Set(normalizedUnits.flatMap((u: any) => u.barcodes || []).filter(Boolean)));

            const payload = {
                ...payloadData,
                brandId: payloadData.brandId || null,
                units: normalizedUnits,
                barcodes: productBarcodes, // Product level barcodes sync with unit codes
            };
            if (!isNew) {
                return api.patch(`/products/${id}`, payload);
            }
            return api.post('/products', payload);
        },
        onSuccess: () => {
            toast.success('Saved successfully');
            qc.removeQueries({ queryKey: ['products'] });
            navigate('/items');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed')
    });

    const savePricingMut = useMutation({
        mutationFn: async () => {
            if (isNew || !id) throw new Error('Item must be saved first');
            const prices: Array<{ priceGroupId: string; unitCode: string; salePrice: number; minimumNegotiationPrice?: number | null }> = [];
            for (const group of (priceGroups || [])) {
                for (const unit of units) {
                    const key = `${group.id}__${String(unit.unitCode).toUpperCase()}`;
                    const raw = pricingOverrides[key];
                    if (raw === undefined || raw === '') continue;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed) || parsed < 0) continue;
                    
                    let parsedMin: number | null = null;
                    const rawMin = priceMinOverrides[key];
                    if (rawMin !== undefined && rawMin !== '') {
                        const minVal = Number(rawMin);
                        if (Number.isFinite(minVal) && minVal >= 0) {
                            parsedMin = minVal;
                        }
                    }
                    
                    prices.push({
                        priceGroupId: group.id,
                        unitCode: String(unit.unitCode).toUpperCase(),
                        salePrice: parsed,
                        minimumNegotiationPrice: parsedMin
                    });
                }
            }
            return api.put(`/products/${id}/pricing`, { prices });
        },
        onSuccess: () => {
            toast.success('Price channel overrides saved');
            qc.invalidateQueries({ queryKey: ['product', id] });
            qc.invalidateQueries({ queryKey: ['products'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save pricing'),
    });

    // Helper for Units
    const addUnit = () => {
        setUnits([...units, { unitName: '', unitCode: '', qtyInBaseUnit: 1, isBase: false, salePrice: 0, costPrice: 0, barcodes: [] }]);
    };
    const removeUnit = (idx: number) => {
        if (idx === 0) return toast.error('Cannot remove Base Unit');
        setUnits(units.filter((_, i) => i !== idx));
    };
    const updateUnit = (idx: number, field: string, val: any) => {
        const newUnits = [...units];
        newUnits[idx] = { ...newUnits[idx], [field]: val };
        setUnits(newUnits);
    };

    const duplicateUnitCodes = useMemo(() => {
        const counts = new Map<string, number>();
        for (const u of units) {
            const code = String(u.unitCode || '').trim().toUpperCase();
            if (!code) continue;
            counts.set(code, (counts.get(code) || 0) + 1);
        }
        return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([code]) => code));
    }, [units]);

    const validateUnitCode = async (idx: number, code: string) => {
        if (!code.trim()) return;
        const normalized = code.trim().toUpperCase();

        // 1. Check for duplicates within the form
        const duplicateIdx = units.findIndex((u, i) => i !== idx && u.unitCode.trim().toUpperCase() === normalized);
        if (duplicateIdx !== -1) {
            toast.error(`Unit code "${normalized}" is already used in this item`);
            return;
        }

        // 2. Check for global uniqueness via API
        try {
            const res = await api.get('/products/validate-unit-code', {
                params: { code: normalized, productId: isNew ? undefined : id }
            });
            if (!res.data.data.available) {
                toast.error(`Unit code "${normalized}" is already taken by another product`);
            }
        } catch (err) {
            console.error('Validation failed', err);
        }
    };

    /**
     * Validates a candidate flavor barcode against:
     * - The product item code
     * - All unit codes in the current form
     * - All flavor barcodes already present on any unit (cross-unit)
     * - The server-side global uniqueness check (API)
     * Returns an error message string, or null if valid.
     */
    const validateFlavorBarcode = async (candidate: string, excludeUnitIdx: number): Promise<string | null> => {
        const normalized = candidate.trim().toUpperCase();
        if (!normalized) return 'Barcode cannot be empty';

        // 1. Must not match item code
        const currentItemCode = String(formData.itemCode || '').trim().toUpperCase();
        if (normalized === currentItemCode) {
            return `Barcode "${normalized}" conflicts with this item's Item Code`;
        }

        // 2. Must not match any unit code in the form
        for (const u of units) {
            const uc = String(u.unitCode || '').trim().toUpperCase();
            if (uc && uc === normalized) {
                return `Barcode "${normalized}" conflicts with existing Unit Code`;
            }
        }

        // 3. Must not already appear in any unit's barcodes array (including same unit)
        for (let i = 0; i < units.length; i++) {
            const uBarcodes: string[] = (units[i].barcodes || []).map((b: string) => String(b).trim().toUpperCase());
            if (uBarcodes.includes(normalized)) {
                if (i === excludeUnitIdx) {
                    return `Barcode "${normalized}" is already added to this unit`;
                }
                return `Barcode "${normalized}" is already used by another unit in this item`;
            }
        }

        // 4. Global API uniqueness check
        try {
            const res = await api.get('/products/validate-unit-code', {
                params: { code: normalized, productId: isNew ? undefined : id }
            });
            if (!res.data.data.available) {
                return `Barcode "${normalized}" is already used by another product`;
            }
        } catch (err) {
            console.error('Barcode validation failed', err);
        }

        return null; // Valid
    };

    const handleSave = () => {
        if (!canEditItem) return;

        trigger().then((isValid) => {
            if (!isValid) {
                setActiveTab('general');
                return;
            }

            const nextUnitErrors: Record<number, string[]> = {};
            let hasUnitError = false;

            if (duplicateUnitCodes.size > 0) {
                hasUnitError = true;
            }

            units.forEach((u, i) => {
                const parsed = unitSchema.safeParse({
                    ...u,
                    unitCode: String(u.unitCode || '').trim().toUpperCase(),
                    qtyInBaseUnit: Number(u.qtyInBaseUnit),
                    salePrice: Number(u.salePrice),
                    costPrice: Number(u.costPrice),
                    status: u.status || 'ACTIVE',
                    minimumNegotiationPrice: u.minimumNegotiationPrice === '' || u.minimumNegotiationPrice == null ? null : Number(u.minimumNegotiationPrice),
                });
                const errs: string[] = [];
                if (!parsed.success) {
                    errs.push(...parsed.error.issues.map((x) => x.message));
                }
                if (i === 0 && Number(u.qtyInBaseUnit) !== 1) {
                    errs.push('Base unit fraction must be 1');
                }
                if (duplicateUnitCodes.has(String(u.unitCode || '').trim().toUpperCase())) {
                    errs.push('Duplicate barcode/unit code');
                }
                if (errs.length) {
                    hasUnitError = true;
                    nextUnitErrors[i] = errs;
                }
            });

            setUnitErrors(nextUnitErrors);
            if (hasUnitError) {
                setActiveTab('units');
                toast.error('Please fix unit validation errors');
                return;
            }

            const values = getValues();
            const payload = {
                ...formData,
                ...values,
                brandId: values.brandId || null,
            };
            setFormData((prev: any) => ({ ...prev, ...payload }));
            saveMut.mutate(payload);
        });
    };

    if (isLoading) return <AppLoader />;

    return (
        <div className="space-y-6 w-full max-w-[1400px] mx-auto pb-20 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-gray-100 z-10 py-4 border-b border-gray-200">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/items')} className="p-2 hover:bg-white rounded-full transition-colors"><ArrowLeft size={20} /></button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'New Item' : 'Edit Item'}</h1>
                        <p className="text-sm text-gray-500">{formData.itemCode || 'Draft'}</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saveMut.isPending || !canEditItem}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} /> {saveMut.isPending ? 'Saving...' : 'Save Item'}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-2">
                {['general', 'units', 'pricing', 'audit'].map(t => (
                    <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-6 shadow-sm min-h-[400px]">
                {activeTab === 'general' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Item Code (16 digits) *</label>
                                <div className="flex gap-2">
                                    <Controller
                                        name="itemCode"
                                        control={control}
                                        render={({ field }) => (
                                            <input
                                                {...field}
                                                value={field.value || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    field.onChange(value);
                                                    setFormData({ ...formData, itemCode: value });
                                                }}
                                                className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono ${errors.itemCode ? 'border-red-400' : 'border-gray-300'}`}
                                                placeholder="0000000000000000"
                                                maxLength={16}
                                                readOnly={!isNew}
                                            />
                                        )}
                                    />
                                    {isNew && (
                                        <button
                                            onClick={generateCode}
                                            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                                            title="Generate Code"
                                        >
                                            <RefreshCw size={20} />
                                        </button>
                                    )}
                                </div>
                                {errors.itemCode && <p className="mt-1 text-xs text-red-600">{errors.itemCode.message}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name (English) *</label>
                                <Controller
                                    name="name"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            {...field}
                                            value={field.value || ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                field.onChange(value);
                                                setFormData({ ...formData, name: value });
                                            }}
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
                                        />
                                    )}
                                />
                                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name (Second Language)</label>
                                <Controller
                                    name="nameArabic"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            {...field}
                                            value={field.value || ''}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                field.onChange(value);
                                                setFormData({ ...formData, nameArabic: value });
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-right"
                                            dir="rtl"
                                        />
                                    )}
                                />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-gray-700">Group *</label>
                                        <button
                                            type="button"
                                            onClick={() => setShowGroupModal(true)}
                                            disabled={!canEditMaster}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                        >
                                            <Plus size={14} /> New
                                        </button>
                                    </div>
                                    <Controller
                                        name="itemGroupId"
                                        control={control}
                                        render={({ field }) => (
                                            <AppDropdown
                                                value={field.value || ''}
                                                onChange={(value) => {
                                                    field.onChange(value);
                                                    setFormData({ ...formData, itemGroupId: value });
                                                }}
                                                options={(groups || []).map((g: any) => ({ value: g.id, label: g.name }))}
                                                placeholder="Select Group"
                                                searchable
                                                onRefresh={refetchGroups}
                                                refreshing={isFetchingGroups}
                                            />
                                        )}
                                    />
                                    {errors.itemGroupId && <p className="mt-1 text-xs text-red-600">{errors.itemGroupId.message}</p>}
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-gray-700">Category *</label>
                                        <button
                                            type="button"
                                            onClick={() => setShowCategoryModal(true)}
                                            disabled={!canEditMaster}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                        >
                                            <Plus size={14} /> New
                                        </button>
                                    </div>
                                    <Controller
                                        name="categoryId"
                                        control={control}
                                        render={({ field }) => (
                                            <AppDropdown
                                                value={field.value || ''}
                                                onChange={(value) => {
                                                    field.onChange(value);
                                                    setFormData({ ...formData, categoryId: value });
                                                }}
                                                options={(cats || []).map((c: any) => ({ value: c.id, label: c.name }))}
                                                placeholder="Select Category"
                                                searchable
                                                onRefresh={refetchCategories}
                                                refreshing={isFetchingCategories}
                                            />
                                        )}
                                    />
                                    {errors.categoryId && <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Brand</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowBrandModal(true)}
                                        disabled={!canEditMaster}
                                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                    >
                                        <Plus size={14} /> New
                                    </button>
                                </div>
                                <Controller
                                    name="brandId"
                                    control={control}
                                    render={({ field }) => (
                                        <AppDropdown
                                            value={field.value || ''}
                                            onChange={(value) => {
                                                field.onChange(value);
                                                setFormData({ ...formData, brandId: value });
                                            }}
                                            options={[
                                                { value: '', label: 'No Brand' },
                                                ...((brands || []).map((b: any) => ({ value: b.id, label: b.name }))),
                                            ]}
                                            placeholder="Select Brand"
                                            searchable
                                            onRefresh={refetchBrands}
                                            refreshing={isFetchingBrands}
                                        />
                                    )}
                                />
                            </div>
                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">Product Status</label>
                                <Controller
                                    name="status"
                                    control={control}
                                    render={({ field }) => (
                                        <AppDropdown
                                            value={field.value || 'ACTIVE'}
                                            onChange={(val) => {
                                                field.onChange(val);
                                                setFormData({ ...formData, status: val });
                                            }}
                                            options={[
                                                { value: 'ACTIVE', label: 'ACTIVE' },
                                                { value: 'INACTIVE', label: 'INACTIVE' },
                                            ]}
                                            placeholder="Select Status"
                                        />
                                    )}
                                />
                                <p className="text-[10px] text-gray-500 mt-1">Inactive items cannot be used in sales, purchases or transfers.</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'units' && (
                    <div className="space-y-4">
                        {duplicateUnitCodes.size > 0 && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                Duplicate barcode/unit codes detected: {Array.from(duplicateUnitCodes).join(', ')}.
                            </div>
                        )}
                        <div className="space-y-3">
                            {units.map((u, idx) => (
                                <div key={idx} className={`border rounded-lg overflow-hidden ${unitErrors[idx]?.length ? 'border-red-300' : 'border-gray-200'}`}>
                                    {/* Main unit fields row */}
                                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-start bg-white px-4 py-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Unit Name</label>
                                            <input
                                                value={u.unitName} onChange={e => updateUnit(idx, 'unitName', e.target.value)}
                                                disabled={!canEditItem}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                placeholder="e.g. Box"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Unit Code (Primary Barcode)</label>
                                            <input
                                                value={u.unitCode}
                                                onChange={e => updateUnit(idx, 'unitCode', e.target.value)}
                                                onBlur={e => validateUnitCode(idx, e.target.value)}
                                                disabled={!canEditItem}
                                                className={`w-full px-2 py-1.5 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm ${duplicateUnitCodes.has(String(u.unitCode || '').trim().toUpperCase()) ? 'border-red-400' : 'border-gray-300'}`}
                                                placeholder="Primary barcode"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Fraction (of Base)</label>
                                            <input
                                                type="number" min={idx === 0 ? 1 : 0.0001} step="0.0001"
                                                value={u.qtyInBaseUnit} onChange={e => updateUnit(idx, 'qtyInBaseUnit', Number(e.target.value))}
                                                disabled={idx === 0 || !canEditItem}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500 text-sm"
                                            />
                                            {idx === 0 && (
                                                <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-gray-500">
                                                    <Lock size={10} /> Base unit
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Sale Price</label>
                                            <input
                                                type="number" min={0} step="0.01"
                                                value={u.salePrice} onChange={e => updateUnit(idx, 'salePrice', Number(e.target.value))}
                                                disabled={!canEditItem}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Cost Price</label>
                                            <input
                                                type="number" min={0} step="0.01"
                                                value={u.costPrice} onChange={e => updateUnit(idx, 'costPrice', Number(e.target.value))}
                                                disabled={!canEditItem}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1" title="Absolute floor price">Min Neg. Price</label>
                                            <input
                                                type="number" min={0} step="0.01"
                                                value={u.minimumNegotiationPrice ?? ''} onChange={e => updateUnit(idx, 'minimumNegotiationPrice', e.target.value === '' ? '' : Number(e.target.value))}
                                                disabled={!canEditItem}
                                                className="w-full px-2 py-1.5 border border-amber-200 bg-amber-50 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm placeholder-gray-400"
                                                placeholder="No Limit"
                                            />
                                        </div>
                                        <div className="pt-5">
                                            {idx !== 0 && (
                                                <button disabled={!canEditItem} onClick={() => removeUnit(idx)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Flavor Barcodes section */}
                                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                                        <label className="block text-xs font-semibold text-blue-700 mb-2">🏷️ Flavor / Variant Barcodes <span className="font-normal text-gray-500">(scan any of these to select this unit)</span></label>
                                        <div className="flex flex-wrap gap-2">
                                            {(u.barcodes || []).filter((b: string) => b !== String(u.unitCode || '').trim().toUpperCase() || !u.unitCode).map((bc: string, bi: number) => (
                                                <div key={bi} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-mono px-2 py-1 rounded-md">
                                                    <span>{bc}</span>
                                                    {canEditItem && (
                                                        <button
                                                            onClick={() => {
                                                                const newBarcodes = (u.barcodes || []).filter((_: string, i: number) => i !== bi);
                                                                updateUnit(idx, 'barcodes', newBarcodes);
                                                            }}
                                                            className="text-blue-400 hover:text-red-500 ml-1"
                                                            title="Remove barcode"
                                                        >×</button>
                                                    )}
                                                </div>
                                            ))}
                                            {canEditItem && (
                                                <UnitBarcodeInput
                                                    onAdd={async (newBc) => {
                                                        const error = await validateFlavorBarcode(newBc, idx);
                                                        if (error) {
                                                            toast.error(error);
                                                            return;
                                                        }
                                                        const normalized = newBc.trim().toUpperCase();
                                                        updateUnit(idx, 'barcodes', [...(u.barcodes || []), normalized]);
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {unitErrors[idx]?.length > 0 && (
                                        <div className="px-4 py-2 bg-red-50 text-xs text-red-700">
                                            {unitErrors[idx].join(' · ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button disabled={!canEditItem} onClick={addUnit} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 px-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Plus size={16} /> Add Unit
                        </button>
                    </div>
                )}

                {activeTab === 'pricing' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900">Price Channel Matrix</h3>
                                <p className="text-xs text-gray-500">Leave blank to use item base sale price for that unit.</p>
                                {isNew && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        You can configure now. Channel pricing will be saved after item creation.
                                    </p>
                                )}
                                {!canEditPricing && (
                                    <p className="text-xs text-red-600 mt-1">You do not have pricing edit permission.</p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => savePricingMut.mutate()}
                                disabled={savePricingMut.isPending || isNew || !canEditPricing}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                                {savePricingMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                Save Channel Pricing
                            </button>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Channel</th>
                                        {units.map((u, idx) => (
                                            <th key={`${u.unitCode}-${idx}`} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                                {u.unitCode}
                                                <span className="ml-2 text-[10px] normal-case text-gray-400">Base: {Number(u.salePrice || 0).toFixed(2)}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(priceGroups || []).length === 0 ? (
                                        <tr>
                                            <td colSpan={Math.max(2, units.length + 1)} className="px-4 py-8 text-center text-gray-500">
                                                No price channels available. Create channels from Items &gt; Price Channels.
                                            </td>
                                        </tr>
                                    ) : (priceGroups || []).map((group: any) => (
                                        <tr key={group.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-gray-900">{group.name}</div>
                                                <div className="text-[10px] text-gray-500">{group.code || 'NO-CODE'} {group.isDefault ? '· DEFAULT' : ''}</div>
                                            </td>
                                            {units.map((u, idx) => {
                                                const key = `${group.id}__${String(u.unitCode).toUpperCase()}`;
                                                return (
                                                    <td key={`${group.id}-${u.unitCode}-${idx}`} className="px-3 py-2">
                                                        <div className="flex flex-col gap-1">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={pricingOverrides[key] ?? ''}
                                                                onChange={(e) => setPricingOverrides((prev) => ({ ...prev, [key]: e.target.value }))}
                                                                placeholder={`Price: ${Number(u.salePrice || 0).toFixed(2)}`}
                                                                disabled={!canEditPricing}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                                                            />
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={priceMinOverrides[key] ?? ''}
                                                                onChange={(e) => setPriceMinOverrides((prev) => ({ ...prev, [key]: e.target.value }))}
                                                                placeholder="Min Neg. Lmt"
                                                                disabled={!canEditPricing}
                                                                className="w-full px-2 py-1 border border-amber-200 bg-amber-50 rounded focus:ring-2 focus:ring-amber-500 outline-none text-xs placeholder-gray-400"
                                                            />
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'audit' && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500 italic">Real timeline of created, edited, and price changes.</p>
                        {isNew ? (
                            <div className="text-sm text-gray-500">Save item first to view audit timeline.</div>
                        ) : (auditTimeline || []).length === 0 ? (
                            <div className="text-sm text-gray-500">No audit history found.</div>
                        ) : (
                            <div className="space-y-3">
                                {(auditTimeline || []).map((row: any) => (
                                    <div key={row.id} className="border-l-2 border-blue-200 pl-4 py-2 relative">
                                        <div className="absolute -left-[5px] top-3 w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {row.action} · {row.entity}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {new Date(row.createdAt).toLocaleString()} · by {row.user?.name || row.user?.email || 'System'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Quick Create Group */}
            {showGroupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-gray-900">Add New Group</h3>
                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
                                <input
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. Beverages"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowGroupModal(false); setNewGroupName(''); }}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!newGroupName.trim() || createGroupMut.isPending}
                                    onClick={() => createGroupMut.mutate()}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {createGroupMut.isPending ? 'Saving...' : 'Save Group'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Create Category */}
            {showCategoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-gray-900">Add New Category</h3>
                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category Name *</label>
                                <input
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. Snacks"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); }}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!newCategoryName.trim() || createCategoryMut.isPending}
                                    onClick={() => createCategoryMut.mutate()}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {createCategoryMut.isPending ? 'Saving...' : 'Save Category'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Create Brand */}
            {showBrandModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-gray-900">Add New Brand</h3>
                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name *</label>
                                <input
                                    value={newBrandName}
                                    onChange={(e) => setNewBrandName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. Samsung"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowBrandModal(false); setNewBrandName(''); }}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!newBrandName.trim() || createBrandMut.isPending}
                                    onClick={() => createBrandMut.mutate()}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {createBrandMut.isPending ? 'Saving...' : 'Save Brand'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
