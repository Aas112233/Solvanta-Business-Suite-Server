import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { Save, ArrowLeft, Plus, Trash2, Loader2, RefreshCw, Lock } from 'lucide-react';
import AppDropdown from '../../components/ui/AppDropdown';
import { useAuthStore } from '../../stores/authStore';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import AppLoader from '../../components/ui/AppLoader';

type Tax = {
    id: string;
    name: string;
    rate: number;
    type: 'SALES' | 'PURCHASE' | 'BOTH';
    isActive: boolean;
    isDefault: boolean;
};

const itemFormSchema = z.object({
    itemCode: z.string().regex(/^\d{1,32}$/, 'Item Code must be between 1 and 32 digits'),
    name: z.string().min(1, 'Name is required'),
    nameArabic: z.string().optional(),
    categoryId: z.string().min(1, 'Category is required'),
    itemGroupId: z.string().min(1, 'Group is required'),
    brandId: z.string().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    taxId: z.string().optional().nullable(),
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

const PRICE_EPSILON = 0.000001;
const roundDerivedPrice = (value: number) => Number(value.toFixed(6));
const arePricesEqual = (left: number, right: number) => Math.abs(Number(left || 0) - Number(right || 0)) < PRICE_EPSILON;
const calculateRecommendedSalePrice = (costPrice: number, marginPct: number) =>
    roundDerivedPrice(Math.max(0, Number(costPrice || 0)) * (1 + (Math.max(0, Number(marginPct || 0)) / 100)));

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
    const [newCategoryMarginPct, setNewCategoryMarginPct] = useState('0');
    const [newBrandName, setNewBrandName] = useState('');
    const [formData, setFormData] = useState<any>({
        itemCode: '', name: '', nameArabic: '', categoryId: '', itemGroupId: '', brandId: '',
        status: 'ACTIVE',
        barcodes: [],
        taxId: ''
    });
    const [units, setUnits] = useState<any[]>([
        { unitName: 'Piece', unitCode: 'PCS', qtyInBaseUnit: 1, isBase: true, salePrice: 0, costPrice: 0, minimumNegotiationPrice: '', status: 'ACTIVE', barcodes: [] }
    ]);
    const [pricingOverrides, setPricingOverrides] = useState<Record<string, string>>({});
    const [priceMinOverrides, setPriceMinOverrides] = useState<Record<string, string>>({});
    const [unitErrors, setUnitErrors] = useState<Record<number, string[]>>({});
    const [autoCalcPrice, setAutoCalcPrice] = useState(isNew);
    const [auditSearch, setAuditSearch] = useState('');
    const [auditTypeFilter, setAuditTypeFilter] = useState<'ALL' | 'SYSTEM' | 'PRICING' | 'PURCHASE' | 'SALE'>('ALL');
    const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

    const toggleEventExpand = (eventId: string) => {
        setExpandedEvents(prev => ({ ...prev, [eventId]: !prev[eventId] }));
    };

    const getProductDiff = (before: any, after: any) => {
        if (!before || !after) return [];
        const diffs: { field: string; from: any; to: any }[] = [];
        const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
        
        const resolveName = (key: string, val: any) => {
            if (!val) return 'None';
            if (key === 'categoryId') {
                return (cats || []).find((c: any) => String(c.id) === String(val))?.name || val;
            }
            if (key === 'itemGroupId') {
                return (groups || []).find((g: any) => String(g.id) === String(val))?.name || val;
            }
            if (key === 'brandId') {
                return (brands || []).find((b: any) => String(b.id) === String(val))?.name || val;
            }
            if (key === 'taxId') {
                return (taxes || []).find((t: any) => String(t.id) === String(val))?.name || val;
            }
            return String(val);
        };

        for (const k of keys) {
            if (['updatedAt', 'createdAt', 'deletedAt', 'companyId', 'id'].includes(k)) continue;
            const bVal = before[k];
            const aVal = after[k];
            
            if (k === 'units') {
                const bUnits = Array.isArray(bVal) ? bVal : [];
                const aUnits = Array.isArray(aVal) ? aVal : [];
                const bMap = new Map(bUnits.map(u => [String(u.unitCode).toUpperCase(), u]));
                const aMap = new Map(aUnits.map(u => [String(u.unitCode).toUpperCase(), u]));
                const allCodes = Array.from(new Set([...bMap.keys(), ...aMap.keys()]));
                
                for (const code of allCodes) {
                    const bu = bMap.get(code);
                    const au = aMap.get(code);
                    
                    if (bu && au) {
                        if (Number(bu.salePrice || 0) !== Number(au.salePrice || 0)) {
                            diffs.push({
                                field: `Unit "${code}" Sale Price`,
                                from: Number(bu.salePrice || 0).toFixed(2),
                                to: Number(au.salePrice || 0).toFixed(2)
                            });
                        }
                        if (Number(bu.costPrice || 0) !== Number(au.costPrice || 0)) {
                            diffs.push({
                                field: `Unit "${code}" Cost Price`,
                                from: Number(bu.costPrice || 0).toFixed(2),
                                to: Number(au.costPrice || 0).toFixed(2)
                            });
                        }
                        if (bu.minimumNegotiationPrice !== au.minimumNegotiationPrice) {
                            diffs.push({
                                field: `Unit "${code}" Min Negotiation Price`,
                                from: bu.minimumNegotiationPrice != null ? Number(bu.minimumNegotiationPrice).toFixed(2) : 'None',
                                to: au.minimumNegotiationPrice != null ? Number(au.minimumNegotiationPrice).toFixed(2) : 'None'
                            });
                        }
                        if (bu.unitName !== au.unitName) {
                            diffs.push({
                                field: `Unit "${code}" Name`,
                                from: bu.unitName,
                                to: au.unitName
                            });
                        }
                    } else if (au) {
                        diffs.push({
                            field: `Unit "${code}" Added`,
                            from: 'None',
                            to: `${au.unitName} (Price: ${Number(au.salePrice || 0).toFixed(2)})`
                        });
                    } else if (bu) {
                        diffs.push({
                            field: `Unit "${code}" Removed`,
                            from: bu.unitName,
                            to: 'None'
                        });
                    }
                }
                continue;
            }

            if (k === 'barcodes') {
                const bArr = Array.isArray(bVal) ? bVal : [];
                const aArr = Array.isArray(aVal) ? aVal : [];
                const added = aArr.filter(x => !bArr.includes(x));
                const removed = bArr.filter(x => !aArr.includes(x));
                
                if (added.length > 0) {
                    diffs.push({
                        field: 'Barcodes Added',
                        from: 'None',
                        to: added.join(', ')
                    });
                }
                if (removed.length > 0) {
                    diffs.push({
                        field: 'Barcodes Removed',
                        from: removed.join(', '),
                        to: 'None'
                    });
                }
                continue;
            }

            const bStr = typeof bVal === 'object' && bVal !== null ? JSON.stringify(bVal) : String(bVal ?? '');
            const aStr = typeof aVal === 'object' && aVal !== null ? JSON.stringify(aVal) : String(aVal ?? '');
            
            if (bStr !== aStr) {
                let label = k;
                if (k === 'taxId') label = 'Tax Rule';
                else if (k === 'categoryId') label = 'Category';
                else if (k === 'itemGroupId') label = 'Item Group';
                else if (k === 'brandId') label = 'Brand';
                else if (k === 'minimumNegotiationPrice') label = 'Min Negotiation Price';

                diffs.push({
                    field: label,
                    from: resolveName(k, bVal),
                    to: resolveName(k, aVal),
                });
            }
        }
        return diffs;
    };

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
            taxId: '',
        },
    });

    // Fetch Meta
    const { data: cats, refetch: refetchCategories, isFetching: isFetchingCategories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/products/meta/categories').then(r => r.data.data) });
    const { data: groups, refetch: refetchGroups, isFetching: isFetchingGroups } = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/products/meta/groups').then(r => r.data.data) });
    const { data: brands, refetch: refetchBrands, isFetching: isFetchingBrands } = useQuery({ queryKey: ['brands'], queryFn: () => api.get('/products/meta/brands').then(r => r.data.data) });
    const { data: priceGroups, refetch: refetchPriceGroups, isFetching: isFetchingPriceGroups } = useQuery({ queryKey: ['priceGroups'], queryFn: () => api.get('/products/meta/price-groups').then(r => r.data.data) });
    const { data: taxes = [] } = useQuery<Tax[]>({
        queryKey: ['taxes'],
        queryFn: () => api.get('/taxes').then(r => r.data.data as Tax[]),
    });

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
            const res = await api.post('/products/meta/categories', {
                name: newCategoryName.trim(),
                defaultProfitMarginPct: Number(newCategoryMarginPct || 0),
            });
            return res.data.data;
        },
        onSuccess: (created) => {
            qc.invalidateQueries({ queryKey: ['categories'] });
            if (created?.id) {
                setFormData((prev: any) => ({ ...prev, categoryId: created.id }));
                setValue('categoryId', created.id);
            }
            setNewCategoryName('');
            setNewCategoryMarginPct('0');
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
                status: item.status,
                barcodes: item.barcodes || [],
                taxId: item.taxId || ''
            });
            setValue('itemCode', item.itemCode);
            setValue('name', item.name);
            setValue('nameArabic', item.nameArabic || '');
            setValue('categoryId', item.categoryId || '');
            setValue('itemGroupId', item.itemGroupId || '');
            setValue('brandId', item.brandId || '');
            setValue('status', item.status);
            setValue('taxId', item.taxId || '');
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

    const selectedCategory = useMemo(
        () => (cats || []).find((category: any) => String(category.id) === String(formData.categoryId || '')),
        [cats, formData.categoryId]
    );
    const categoryProfitMarginPct = Number(selectedCategory?.defaultProfitMarginPct || 0);
    const recommendedBaseSalePrice = useMemo(
        () => calculateRecommendedSalePrice(Number(units[0]?.costPrice || 0), categoryProfitMarginPct),
        [categoryProfitMarginPct, units]
    );

    const syncDerivedUnitPricing = (draftUnits: any[]) => {
        if (draftUnits.length <= 1) return draftUnits;
        const baseSalePrice = Number(draftUnits[0]?.salePrice || 0);
        const baseCostPrice = Number(draftUnits[0]?.costPrice || 0);

        return draftUnits.map((unit, index) => {
            if (index === 0) return unit;
            const fraction = Number(unit.qtyInBaseUnit || 0);
            if (!Number.isFinite(fraction) || fraction <= 0) return unit;
            return {
                ...unit,
                salePrice: roundDerivedPrice(baseSalePrice * fraction),
                costPrice: roundDerivedPrice(baseCostPrice * fraction),
            };
        });
    };

    useEffect(() => {
        if (!autoCalcPrice || units.length === 0) return;

        setUnits((currentUnits) => {
            if (currentUnits.length === 0) return currentUnits;
            const currentBaseSalePrice = Number(currentUnits[0]?.salePrice || 0);
            if (arePricesEqual(currentBaseSalePrice, recommendedBaseSalePrice)) return currentUnits;

            const nextUnits = [...currentUnits];
            nextUnits[0] = { ...nextUnits[0], salePrice: recommendedBaseSalePrice };
            return syncDerivedUnitPricing(nextUnits);
        });
    }, [autoCalcPrice, recommendedBaseSalePrice]);

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
                taxId: payloadData.taxId || null,
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
            if (id && id !== 'new') {
                qc.invalidateQueries({ queryKey: ['product', id] });
            }
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
        const baseSalePrice = Number(units[0]?.salePrice || 0);
        const baseCostPrice = Number(units[0]?.costPrice || 0);
        setUnits([...units, { unitName: '', unitCode: '', qtyInBaseUnit: 1, isBase: false, salePrice: baseSalePrice, costPrice: baseCostPrice, barcodes: [] }]);
    };
    const removeUnit = (idx: number) => {
        if (idx === 0) return toast.error('Cannot remove Base Unit');
        setUnits(units.filter((_, i) => i !== idx));
    };
    const updateUnit = (idx: number, field: string, val: any) => {
        const newUnits = [...units];
        newUnits[idx] = { ...newUnits[idx], [field]: val };

        if (idx === 0 && field === 'salePrice') {
            setAutoCalcPrice(false);
            setUnits(syncDerivedUnitPricing(newUnits));
            return;
        }

        if ((idx === 0 && field === 'costPrice') || (idx > 0 && field === 'qtyInBaseUnit')) {
            setUnits(syncDerivedUnitPricing(newUnits));
            return;
        }

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
                {['general', 'units', 'pricing', 'tax', 'audit'].map(t => (
                    <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t === 'tax' ? 'Tax Setup' : t}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-6 shadow-sm min-h-[400px]">
                {activeTab === 'general' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Item Code (1-32 digits) *</label>
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
                                                maxLength={32}
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
                                    <p className="mt-1 text-[11px] text-gray-500">
                                        Default profit margin: <span className="font-semibold text-emerald-600">{categoryProfitMarginPct.toFixed(2)}%</span>
                                    </p>
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
                                            {idx === 0 && selectedCategory && (
                                                <div className="mt-1 space-y-1">
                                                    <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={autoCalcPrice}
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setAutoCalcPrice(checked);
                                                                if (checked) {
                                                                    setUnits(prev => {
                                                                        const next = [...prev];
                                                                        next[0] = { ...next[0], salePrice: recommendedBaseSalePrice };
                                                                        return syncDerivedUnitPricing(next);
                                                                    });
                                                                }
                                                            }}
                                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span>Auto-calculate from category margin ({categoryProfitMarginPct.toFixed(2)}%)</span>
                                                    </label>
                                                    <div className="text-[9px] text-gray-500">
                                                        Recommended: <span className="font-semibold text-emerald-600">{recommendedBaseSalePrice.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            )}
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

                {activeTab === 'tax' && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-base font-semibold text-gray-900 font-bold">Tax Setup</h3>
                            <p className="text-xs text-gray-500">Configure item-level tax rules for sales and purchase transactions.</p>
                        </div>

                        <div className="max-w-md">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Item Tax Rule</label>
                            <Controller
                                name="taxId"
                                control={control}
                                render={({ field }) => (
                                    <AppDropdown
                                        value={field.value || ''}
                                        onChange={(value) => {
                                            field.onChange(value);
                                            setFormData((prev: any) => ({ ...prev, taxId: value }));
                                        }}
                                        options={[
                                            { value: '', label: 'No Tax Rule (Use company defaults)' },
                                            ...(taxes || [])
                                                .filter((t) => t.isActive)
                                                .map((t) => ({
                                                    value: t.id,
                                                    label: `${t.name} (${(t.rate * 100).toFixed(0)}%) - ${
                                                        t.type === 'BOTH' ? 'Inward & Outward' : t.type === 'SALES' ? 'Outward Only' : 'Inward Only'
                                                    }`,
                                                })),
                                        ]}
                                        placeholder="Select Tax Rule"
                                    />
                                )}
                            />
                        </div>

                        {/* Tax Applicability Previews */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-gray-100">
                            {/* Outward Tax Preview */}
                            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex items-start gap-4 shadow-sm">
                                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-semibold text-gray-900 text-sm">Outward Transactions (Sales)</h4>
                                    {(() => {
                                        const selectedTaxId = getValues('taxId');
                                        const selectedTax = (taxes || []).find((t) => t.id === selectedTaxId);
                                        const defaultSalesTax = (taxes || []).find((t) => t.isDefault && (t.type === 'SALES' || t.type === 'BOTH')) || (taxes || []).find((t) => t.type === 'SALES' || t.type === 'BOTH');

                                        let resolvedTax = null;
                                        let source = 'Company Default';

                                        if (selectedTax) {
                                            if (selectedTax.type === 'SALES' || selectedTax.type === 'BOTH') {
                                                resolvedTax = selectedTax;
                                                source = 'Product Tax Rule';
                                            } else {
                                                resolvedTax = defaultSalesTax;
                                                source = 'Company Default (Selected rule applies to Inward only)';
                                            }
                                        } else {
                                            resolvedTax = defaultSalesTax;
                                        }

                                        return (
                                            <>
                                                <p className="text-xl font-bold text-gray-800">
                                                    {resolvedTax ? `${resolvedTax.name} (${(resolvedTax.rate * 100).toFixed(0)}%)` : 'No Tax (0%)'}
                                                </p>
                                                <p className="text-xs text-gray-500">Source: <span className="font-medium text-gray-700">{source}</span></p>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Inward Tax Preview */}
                            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex items-start gap-4 shadow-sm">
                                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
                                    </svg>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-semibold text-gray-900 text-sm">Inward Transactions (Purchase)</h4>
                                    {(() => {
                                        const selectedTaxId = getValues('taxId');
                                        const selectedTax = (taxes || []).find((t) => t.id === selectedTaxId);
                                        const defaultPurchaseTax = (taxes || []).find((t) => t.isDefault && (t.type === 'PURCHASE' || t.type === 'BOTH')) || (taxes || []).find((t) => t.type === 'PURCHASE' || t.type === 'BOTH');

                                        let resolvedTax = null;
                                        let source = 'Company Default';

                                        if (selectedTax) {
                                            if (selectedTax.type === 'PURCHASE' || selectedTax.type === 'BOTH') {
                                                resolvedTax = selectedTax;
                                                source = 'Product Tax Rule';
                                            } else {
                                                resolvedTax = defaultPurchaseTax;
                                                source = 'Company Default (Selected rule applies to Outward only)';
                                            }
                                        } else {
                                            resolvedTax = defaultPurchaseTax;
                                        }

                                        return (
                                            <>
                                                <p className="text-xl font-bold text-gray-800">
                                                    {resolvedTax ? `${resolvedTax.name} (${(resolvedTax.rate * 100).toFixed(0)}%)` : 'No Tax (0%)'}
                                                </p>
                                                <p className="text-xs text-gray-500">Source: <span className="font-medium text-gray-700">{source}</span></p>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'audit' && (
                    <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Product Lifecycle & Activity Ledger</h3>
                                <p className="text-xs text-gray-500">Track edits, price channel overrides, purchases, and sales in real-time.</p>
                            </div>
                            
                            {/* Filter Buttons */}
                            <div className="flex flex-wrap gap-1.5">
                                {(
                                    [
                                        { key: 'ALL', label: 'All Activity' },
                                        { key: 'SYSTEM', label: 'Info Updates' },
                                        { key: 'PRICING', label: 'Price Changes' },
                                        { key: 'PURCHASE', label: 'Purchases' },
                                        { key: 'SALE', label: 'Sales' },
                                    ] as const
                                ).map(item => (
                                    <button
                                        type="button"
                                        key={item.key}
                                        onClick={() => setAuditTypeFilter(item.key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                            auditTypeFilter === item.key
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search Input */}
                        <div className="max-w-md">
                            <input
                                value={auditSearch}
                                onChange={e => setAuditSearch(e.target.value)}
                                placeholder="Search by description or editor name..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                        </div>

                        {isNew ? (
                            <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
                                Save the item first to view its audit timeline and transaction history.
                            </div>
                        ) : (() => {
                            // Filter logic
                            const filtered = (auditTimeline || []).filter((e: any) => {
                                // 1. Type Filter
                                if (auditTypeFilter === 'SYSTEM' && !['CREATE', 'UPDATE'].includes(e.type)) return false;
                                if (auditTypeFilter === 'PRICING' && e.type !== 'PRICE_CHANGE') return false;
                                if (auditTypeFilter === 'PURCHASE' && e.type !== 'PURCHASE') return false;
                                if (auditTypeFilter === 'SALE' && e.type !== 'SALE') return false;

                                // 2. Search text filter
                                if (auditSearch) {
                                    const searchLower = auditSearch.toLowerCase();
                                    const matchDesc = String(e.description || '').toLowerCase().includes(searchLower);
                                    const matchUser = String(e.user?.name || e.user?.email || '').toLowerCase().includes(searchLower);
                                    const matchInvoice = String(e.details?.invoiceNo || '').toLowerCase().includes(searchLower);
                                    
                                    // Search inside UPDATE property diffs
                                    let matchDiff = false;
                                    if (e.type === 'UPDATE' && e.details?.before && e.details?.after) {
                                        const diffs = getProductDiff(e.details.before, e.details.after);
                                        matchDiff = diffs.some(d => 
                                            d.field.toLowerCase().includes(searchLower) ||
                                            String(d.from).toLowerCase().includes(searchLower) ||
                                            String(d.to).toLowerCase().includes(searchLower)
                                        );
                                    }

                                    // Search inside PRICE_CHANGE details
                                    let matchPricing = false;
                                    if (e.type === 'PRICE_CHANGE' && e.details?.after) {
                                        matchPricing = (e.details.after || []).some((over: any) => 
                                            over.unitCode.toLowerCase().includes(searchLower) ||
                                            String(over.salePrice).toLowerCase().includes(searchLower)
                                        );
                                    }

                                    if (!matchDesc && !matchUser && !matchInvoice && !matchDiff && !matchPricing) return false;
                                }

                                return true;
                            });

                            if (filtered.length === 0) {
                                return (
                                    <div className="text-sm text-gray-500 italic p-8 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
                                        No matching events found in this period.
                                    </div>
                                );
                            }

                            return (
                                <div className="space-y-6 relative pl-12 before:absolute before:left-[24px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-200">
                                    {filtered.map((e: any) => {
                                        const isExpanded = !!expandedEvents[e.id];
                                        
                                        // Styling based on type
                                        let badgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
                                        let iconBg = 'bg-gray-100 text-gray-600';
                                        let iconSvg = (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                            </svg>
                                        );

                                        if (e.type === 'CREATE') {
                                            badgeColor = 'bg-teal-50 border-teal-200 text-teal-800';
                                            iconBg = 'bg-teal-100 text-teal-600';
                                            iconSvg = (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                            );
                                        } else if (e.type === 'UPDATE') {
                                            badgeColor = 'bg-orange-50 border-orange-200 text-orange-800';
                                            iconBg = 'bg-orange-100 text-orange-600';
                                            iconSvg = (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            );
                                        } else if (e.type === 'PRICE_CHANGE') {
                                            badgeColor = 'bg-indigo-50 border-indigo-200 text-indigo-800';
                                            iconBg = 'bg-indigo-100 text-indigo-600';
                                            iconSvg = (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2zM9 16V8l5 4-5 4z" />
                                                </svg>
                                            );
                                        } else if (e.type === 'PURCHASE') {
                                            badgeColor = 'bg-blue-50 border-blue-200 text-blue-800';
                                            iconBg = 'bg-blue-100 text-blue-600';
                                            iconSvg = (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                                </svg>
                                            );
                                        } else if (e.type === 'SALE') {
                                            badgeColor = 'bg-emerald-50 border-emerald-200 text-emerald-800';
                                            iconBg = 'bg-emerald-100 text-emerald-600';
                                            iconSvg = (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                                </svg>
                                            );
                                        }

                                        return (
                                            <div key={e.id} className="relative group">
                                                {/* Timeline Icon Node */}
                                                <div
                                                    style={{ left: '-24px', transform: 'translateX(-50%)' }}
                                                    className={`absolute top-0.5 w-9 h-9 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 ${iconBg}`}
                                                >
                                                    {iconSvg}
                                                </div>

                                                {/* Card Wrapper */}
                                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${badgeColor}`}>
                                                                    {e.type}
                                                                </span>
                                                                <p className="text-sm font-semibold text-gray-900">{e.description}</p>
                                                            </div>
                                                            <p className="text-xs text-gray-500">
                                                                {new Date(e.timestamp).toLocaleString()}
                                                                {e.user && (
                                                                    <span> · by <span className="font-medium text-gray-700">{e.user.name || e.user.email}</span></span>
                                                                )}
                                                            </p>
                                                        </div>

                                                        {/* Details Expand Action Button */}
                                                        {e.details && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleEventExpand(e.id)}
                                                                className="px-2.5 py-1 text-xs font-semibold border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                                                            >
                                                                {isExpanded ? 'Hide Details' : 'Show Details'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Expanded Diffs or Transaction details */}
                                                    {isExpanded && e.details && (
                                                        <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in text-xs space-y-3">
                                                            {/* Update Event Diff rendering */}
                                                            {e.type === 'UPDATE' && (() => {
                                                                const diffs = getProductDiff(e.details.before, e.details.after);
                                                                if (diffs.length === 0) return <p className="text-gray-500 italic">No significant properties modified.</p>;
                                                                return (
                                                                    <div className="grid grid-cols-1 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                                        {diffs.map((d: any, di: number) => (
                                                                            <div key={di} className="flex flex-wrap gap-x-2 text-gray-700 py-0.5 border-b border-dashed border-gray-200 last:border-0">
                                                                                <span className="font-semibold text-gray-900 w-36 capitalize">{d.field}:</span>
                                                                                <span className="text-red-600 font-mono line-through">{String(d.from)}</span>
                                                                                <span className="text-gray-400">→</span>
                                                                                <span className="text-emerald-700 font-semibold font-mono">{String(d.to)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Pricing Channel changes */}
                                                            {e.type === 'PRICE_CHANGE' && (
                                                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-2">
                                                                    <p className="font-semibold text-gray-900">Updated Price Overrides:</p>
                                                                    <div className="grid grid-cols-1 gap-1">
                                                                        {(e.details.after || []).map((over: any, idx: number) => {
                                                                            const prevPrice = (e.details.before || []).find((b: any) => b.priceGroupId === over.priceGroupId && b.unitCode === over.unitCode)?.salePrice;
                                                                            const channelName = (priceGroups || []).find((pg: any) => pg.id === over.priceGroupId)?.name || over.priceGroupId.substring(0, 8);
                                                                            return (
                                                                                <div key={idx} className="flex items-center gap-x-2 text-gray-600">
                                                                                    <span className="font-mono bg-indigo-50 border border-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded text-[10px]">
                                                                                        {over.unitCode} (Channel: {channelName})
                                                                                    </span>
                                                                                    <span>Price: {prevPrice !== undefined ? Number(prevPrice).toFixed(2) : 'Base'} → <span className="font-semibold text-emerald-600">{Number(over.salePrice).toFixed(2)}</span></span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Sale Event Details */}
                                                            {e.type === 'SALE' && (
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-emerald-900">
                                                                    <div>
                                                                        <span className="block text-[10px] text-emerald-600 uppercase font-bold">Invoice No</span>
                                                                        <span className="font-mono font-bold">{e.details.invoiceNo}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="block text-[10px] text-emerald-600 uppercase font-bold">Qty Sold</span>
                                                                        <span className="font-semibold">{e.details.qty}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="block text-[10px] text-emerald-600 uppercase font-bold">Unit Price</span>
                                                                        <span>{Number(e.details.unitPrice || 0).toFixed(2)}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="block text-[10px] text-emerald-600 uppercase font-bold">Line Total</span>
                                                                        <span className="font-bold text-emerald-700">{Number(e.details.lineTotal || 0).toFixed(2)}</span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Purchase Event Details */}
                                                            {e.type === 'PURCHASE' && (
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-blue-900">
                                                                    <div>
                                                                        <span className="block text-[10px] text-blue-600 uppercase font-bold">Reference No</span>
                                                                        <span className="font-mono font-bold">{e.details.invoiceNo}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="block text-[10px] text-blue-600 uppercase font-bold">Qty Purchased</span>
                                                                        <span className="font-semibold">{e.details.qty}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="block text-[10px] text-blue-600 uppercase font-bold">Unit Cost</span>
                                                                        <span>{Number(e.details.unitCost || 0).toFixed(2)}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="block text-[10px] text-blue-600 uppercase font-bold">Line Total</span>
                                                                        <span className="font-bold text-blue-700">{Number(e.details.lineTotal || 0).toFixed(2)}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
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
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Default Profit %</label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={newCategoryMarginPct}
                                    onChange={(e) => setNewCategoryMarginPct(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. 15"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); setNewCategoryMarginPct('0'); }}
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
