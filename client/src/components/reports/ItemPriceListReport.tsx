import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import {
    Check,
    CheckSquare,
    ChevronDown,
    DollarSign,
    Download,
    Filter,
    Loader2,
    Search,
    Square,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'item' | 'priceGroup' | 'columns' | null;

type ReportFilterMasterData = {
    products: {
        id: string;
        itemCode?: string | null;
        name?: string | null;
        categoryId?: string | null;
        itemGroupId?: string | null;
        brandId?: string | null;
    }[];
    categories: { id: string; name: string }[];
    groups: { id: string; name: string }[];
    brands: { id: string; name: string }[];
};

type PriceGroup = {
    id: string;
    name: string;
    isDefault?: boolean;
};

type ProductUnit = {
    unitCode: string;
    unitName?: string | null;
    qtyInBaseUnit?: number | null;
    salePrice?: number | null;
    costPrice?: number | null;
    isBase?: boolean;
};

type ProductPriceGroupPrice = {
    priceGroupId: string;
    unitCode: string;
    salePrice: number | null;
};

type ProductRow = {
    id: string;
    itemCode?: string | null;
    name?: string | null;
    categoryId?: string | null;
    itemGroupId?: string | null;
    brandId?: string | null;
    category?: { id: string; name: string } | null;
    itemGroup?: { id: string; name: string } | null;
    brand?: { id: string; name: string } | null;
    units?: ProductUnit[];
    priceGroupPrices?: ProductPriceGroupPrice[];
};

type ReportRow = {
    id: string;
    productId: string;
    itemCode: string;
    itemName: string;
    itemGroup: string;
    itemCategory: string;
    itemBrand: string;
    unitName: string;
    unitCode: string;
    unitFraction: string;
    costPrice: number;
    baseSalePrice: number;
    [key: string]: string | number | null;
};

type MultiSelectOption = {
    value: string;
    label: string;
};

const baseColumns: { key: string; label: string; type?: 'currency' | 'number' | 'text'; width?: number }[] = [
    { key: 'itemCode', label: 'Item Code', type: 'text', width: 16 },
    { key: 'itemName', label: 'Item Name', type: 'text', width: 30 },
    { key: 'itemGroup', label: 'Item Group', type: 'text', width: 18 },
    { key: 'itemCategory', label: 'Item Category', type: 'text', width: 18 },
    { key: 'itemBrand', label: 'Brand', type: 'text', width: 18 },
    { key: 'unitName', label: 'Unit Name', type: 'text', width: 14 },
    { key: 'unitCode', label: 'Unit Code', type: 'text', width: 14 },
    { key: 'unitFraction', label: 'Unit Fraction (pcs in unit)', type: 'text', width: 24 },
    { key: 'costPrice', label: 'Cost Price', type: 'currency', width: 14 },
    { key: 'baseSalePrice', label: 'Base Sale Price', type: 'currency', width: 16 },
];

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function fractionLabel(factor: number, baseLabel: string, unitLabel: string) {
    const f = Number.isInteger(factor) ? String(factor) : String(Number(factor.toFixed(3)));
    return `${f} ${String(baseLabel || 'pcs').toLowerCase()} in ${String(unitLabel || '-').toLowerCase()}`;
}

async function fetchAllProducts(params: Record<string, string | undefined>) {
    const limit = 1000;
    let page = 1;
    let keepFetching = true;
    const allRows: ProductRow[] = [];

    while (keepFetching) {
        const response = await api.get('/products', {
            params: {
                page,
                limit,
                includePricing: 'true',
                ...params,
            },
        });
        const rows = (response.data?.data || []) as ProductRow[];
        allRows.push(...rows);
        if (rows.length < limit) {
            keepFetching = false;
        } else {
            page += 1;
        }
    }

    return allRows;
}

function MultiSelectDropdown({
    options,
    selectedValues,
    onChange,
    placeholder,
}: {
    options: MultiSelectOption[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    placeholder: string;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const filteredOptions = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return options;
        return options.filter((option) => option.label.toLowerCase().includes(s));
    }, [options, search]);

    const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

    const selectedLabel = useMemo(() => {
        if (selectedValues.length === 0) return 'No Price Groups';
        if (selectedValues.length === options.length && options.length > 0) return 'All Price Groups';
        if (selectedValues.length === 1) return options.find((o) => o.value === selectedValues[0])?.label || placeholder;
        return `${selectedValues.length} Price Groups`;
    }, [selectedValues, options, placeholder]);

    const toggleValue = (value: string) => {
        if (selectedSet.has(value)) {
            onChange(selectedValues.filter((v) => v !== value));
        } else {
            onChange([...selectedValues, value]);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${open ? 'ring-2 ring-orange-200 border-orange-400' : 'border-gray-300 hover:border-gray-400'} bg-white text-gray-800`}
            >
                <span className={selectedValues.length > 0 ? 'text-gray-800' : 'text-gray-500'}>{selectedValues.length > 0 ? selectedLabel : placeholder}</span>
                <ChevronDown size={16} className={`text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-300 bg-white shadow-lg">
                    <div className="border-b border-gray-100 p-2">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search price groups..."
                                className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                            />
                        </div>
                        <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => onChange(options.map((o) => o.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Select all</button>
                            <button type="button" onClick={() => onChange([])} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Clear</button>
                        </div>
                    </div>

                    <div className="max-h-60 overflow-auto py-1">
                        {filteredOptions.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No price groups found</div>}
                        {filteredOptions.map((option) => {
                            const checked = selectedSet.has(option.value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleValue(option.value)}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left ${checked ? 'bg-orange-50 text-orange-700' : 'text-gray-800 hover:bg-orange-50'}`}
                                >
                                    <span>{option.label}</span>
                                    {checked && <Check size={14} className="text-orange-500" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ItemPriceListReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';

    const [panel, setPanel] = useState<FilterPanel>(null);
    const [productId, setProductId] = useState('');
    const [groupId, setGroupId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [brandId, setBrandId] = useState('');
    const [selectedPriceGroupIds, setSelectedPriceGroupIds] = useState<string[]>([]);
    const [isExporting, setIsExporting] = useState(false);
    const priceGroupInitRef = useRef(false);

    const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({
        itemCode: true,
        itemName: true,
        itemGroup: true,
        itemCategory: true,
        itemBrand: true,
        unitName: true,
        unitCode: true,
        unitFraction: true,
        costPrice: true,
        baseSalePrice: true,
    });

    const { data: filterMasterData } = useQuery({
        queryKey: ['item-price-list-filter-master-data'],
        queryFn: () => api.get('/reports/purchase-invoices-filter-options').then((r) => r.data.data as ReportFilterMasterData),
    });

    const { data: priceGroups = [], isLoading: priceGroupsLoading } = useQuery({
        queryKey: ['sales-pricing-price-lists-report'],
        queryFn: async () => {
            try {
                const response = await api.get('/sales/pricing/price-lists');
                return response.data.data as PriceGroup[];
            } catch {
                const response = await api.get('/products/meta/price-groups');
                return response.data.data as PriceGroup[];
            }
        },
    });

    useEffect(() => {
        if (priceGroups.length === 0) return;
        const validSet = new Set(priceGroups.map((pg) => pg.id));
        setSelectedPriceGroupIds((prev) => {
            if (!priceGroupInitRef.current) {
                priceGroupInitRef.current = true;
                return priceGroups.map((pg) => pg.id);
            }
            return prev.filter((id) => validSet.has(id));
        });
    }, [priceGroups]);

    useEffect(() => {
        if (priceGroups.length === 0) return;
        setSelectedColumns((prev) => {
            const next = { ...prev };
            let changed = false;
            priceGroups.forEach((pg) => {
                const key = `pg_${pg.id}`;
                if (typeof next[key] === 'undefined') {
                    next[key] = true;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [priceGroups]);

    const allProductsMeta = filterMasterData?.products || [];
    const productsForItemOptions = useMemo(
        () =>
            allProductsMeta.filter((p) =>
                (!groupId || p.itemGroupId === groupId)
                && (!categoryId || p.categoryId === categoryId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProductsMeta, groupId, categoryId, brandId]
    );
    const productsForGroupOptions = useMemo(
        () =>
            allProductsMeta.filter((p) =>
                (!productId || p.id === productId)
                && (!categoryId || p.categoryId === categoryId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProductsMeta, productId, categoryId, brandId]
    );
    const productsForCategoryOptions = useMemo(
        () =>
            allProductsMeta.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProductsMeta, productId, groupId, brandId]
    );
    const productsForBrandOptions = useMemo(
        () =>
            allProductsMeta.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!categoryId || p.categoryId === categoryId)
            ),
        [allProductsMeta, productId, groupId, categoryId]
    );

    const groupIdSet = useMemo(() => new Set(productsForGroupOptions.map((p) => p.itemGroupId).filter(Boolean)), [productsForGroupOptions]);
    const categoryIdSet = useMemo(() => new Set(productsForCategoryOptions.map((p) => p.categoryId).filter(Boolean)), [productsForCategoryOptions]);
    const brandIdSet = useMemo(() => new Set(productsForBrandOptions.map((p) => p.brandId).filter(Boolean)), [productsForBrandOptions]);

    const productOptions = useMemo(
        () =>
            productsForItemOptions.map((p) => ({
                value: p.id,
                label: `${p.itemCode || '-'} - ${p.name || 'Unnamed Item'}`,
            })),
        [productsForItemOptions]
    );
    const groupOptions = useMemo(
        () => (filterMasterData?.groups || []).filter((g) => groupIdSet.has(g.id)).map((g) => ({ value: g.id, label: g.name })),
        [filterMasterData, groupIdSet]
    );
    const categoryOptions = useMemo(
        () => (filterMasterData?.categories || []).filter((c) => categoryIdSet.has(c.id)).map((c) => ({ value: c.id, label: c.name })),
        [filterMasterData, categoryIdSet]
    );
    const brandOptions = useMemo(
        () => (filterMasterData?.brands || []).filter((b) => brandIdSet.has(b.id)).map((b) => ({ value: b.id, label: b.name })),
        [filterMasterData, brandIdSet]
    );
    const priceGroupOptions = useMemo(
        () => priceGroups.map((pg) => ({ value: pg.id, label: pg.name })),
        [priceGroups]
    );

    useEffect(() => {
        if (productId && !productOptions.some((o) => o.value === productId)) setProductId('');
    }, [productId, productOptions]);
    useEffect(() => {
        if (groupId && !groupOptions.some((o) => o.value === groupId)) setGroupId('');
    }, [groupId, groupOptions]);
    useEffect(() => {
        if (categoryId && !categoryOptions.some((o) => o.value === categoryId)) setCategoryId('');
    }, [categoryId, categoryOptions]);
    useEffect(() => {
        if (brandId && !brandOptions.some((o) => o.value === brandId)) setBrandId('');
    }, [brandId, brandOptions]);

    const { data: products = [], isLoading: productsLoading } = useQuery({
        queryKey: ['report-item-price-list-products', groupId, categoryId, brandId],
        queryFn: () =>
            fetchAllProducts({
                itemGroupId: groupId || undefined,
                categoryId: categoryId || undefined,
                brandId: brandId || undefined,
            }),
    });

    const filteredProducts = useMemo(
        () => (productId ? products.filter((p) => p.id === productId) : products),
        [products, productId]
    );

    const selectedPriceGroups = useMemo(
        () => priceGroups.filter((pg) => selectedPriceGroupIds.includes(pg.id)),
        [priceGroups, selectedPriceGroupIds]
    );

    const { data: endpointPriceMap = {}, isLoading: endpointPriceLoading } = useQuery({
        queryKey: [
            'report-item-price-list-endpoint-prices',
            productId,
            groupId,
            categoryId,
            brandId,
            selectedPriceGroupIds.slice().sort().join(','),
            filteredProducts.length,
        ],
        enabled: selectedPriceGroups.length > 0 && filteredProducts.length > 0,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const tasks: { productId: string; unitCode: string; priceGroupId: string; key: string }[] = [];
            filteredProducts.forEach((product) => {
                (product.units || []).forEach((unit) => {
                    const unitCode = String(unit.unitCode || '').toUpperCase();
                    if (!unitCode) return;
                    selectedPriceGroups.forEach((priceGroup) => {
                        tasks.push({
                            productId: product.id,
                            unitCode,
                            priceGroupId: priceGroup.id,
                            key: `${product.id}::${unitCode}::${priceGroup.id}`,
                        });
                    });
                });
            });

            const map: Record<string, number> = {};
            if (tasks.length === 0) return map;

            let cursor = 0;
            const workers = Math.min(14, tasks.length);

            try {
                const first = tasks[0];
                const firstResponse = await api.get('/sales/pricing/price-lists/price', {
                    params: {
                        productId: first.productId,
                        unitCode: first.unitCode,
                        priceGroupId: first.priceGroupId,
                    },
                });
                map[first.key] = Number(firstResponse.data?.data?.salePrice || 0);
                cursor = 1;
            } catch {
                return map;
            }

            await Promise.all(Array.from({ length: workers }, async () => {
                while (cursor < tasks.length) {
                    const index = cursor;
                    cursor += 1;
                    const task = tasks[index];
                    try {
                        const response = await api.get('/sales/pricing/price-lists/price', {
                            params: {
                                productId: task.productId,
                                unitCode: task.unitCode,
                                priceGroupId: task.priceGroupId,
                            },
                        });
                        map[task.key] = Number(response.data?.data?.salePrice || 0);
                    } catch {
                        // Keep fallback from local pricing data.
                    }
                }
            }));

            return map;
        },
    });

    const rows = useMemo(() => {
        const list: ReportRow[] = [];

        filteredProducts.forEach((product) => {
            const units = product.units || [];
            const baseUnit = units.find((u) => Boolean(u.isBase)) || units[0];
            const baseLabel = baseUnit?.unitName || baseUnit?.unitCode || 'pcs';

            units.forEach((unit) => {
                const factor = Number(unit.qtyInBaseUnit || 0) || 1;
                const unitName = unit.unitName || unit.unitCode || '-';
                const unitCode = String(unit.unitCode || '-').toUpperCase();

                const row: ReportRow = {
                    id: `${product.id}::${unitCode}`,
                    productId: product.id,
                    itemCode: product.itemCode || '-',
                    itemName: product.name || '-',
                    itemGroup: product.itemGroup?.name || '-',
                    itemCategory: product.category?.name || '-',
                    itemBrand: product.brand?.name || '-',
                    unitName,
                    unitCode,
                    unitFraction: fractionLabel(factor, baseLabel, unitName),
                    costPrice: Number(unit.costPrice || 0),
                    baseSalePrice: Number(unit.salePrice || 0),
                };

                selectedPriceGroups.forEach((pg) => {
                    const key = `pg_${pg.id}`;
                    const endpointKey = `${product.id}::${unitCode}::${pg.id}`;
                    const endpointPrice = endpointPriceMap[endpointKey];
                    if (typeof endpointPrice === 'number') {
                        row[key] = endpointPrice;
                        return;
                    }
                    const pgPrice = (product.priceGroupPrices || []).find(
                        (p) => p.priceGroupId === pg.id && String(p.unitCode || '').toUpperCase() === unitCode
                    );
                    if (pgPrice && pgPrice.salePrice !== null) {
                        row[key] = Number(pgPrice.salePrice);
                    } else {
                        row[key] = Number(unit.salePrice || 0);
                    }
                });

                list.push(row);
            });
        });

        return list.sort((a, b) => {
            const itemCmp = String(a.itemName || '').localeCompare(String(b.itemName || ''));
            if (itemCmp !== 0) return itemCmp;
            return String(a.unitName || '').localeCompare(String(b.unitName || ''));
        });
    }, [filteredProducts, selectedPriceGroups, endpointPriceMap]);

    const previewRows = rows.slice(0, 12);
    const priceGroupFilterActive = selectedPriceGroupIds.length > 0 && selectedPriceGroupIds.length !== priceGroups.length;
    const activeFilterCount = [productId, groupId, categoryId, brandId, priceGroupFilterActive ? 'priceGroups' : ''].filter(Boolean).length;
    const itemFiltersCount = [productId, groupId, categoryId, brandId].filter(Boolean).length;

    const dynamicPriceColumns = useMemo(
        () => selectedPriceGroups.map((pg) => ({ key: `pg_${pg.id}`, label: `${pg.name} Price`, type: 'currency' as const, width: 18 })),
        [selectedPriceGroups]
    );

    const allColumns = useMemo(
        () => [...baseColumns, ...dynamicPriceColumns],
        [dynamicPriceColumns]
    );

    const selectedColCount = useMemo(
        () => allColumns.filter((col) => selectedColumns[col.key] !== false).length,
        [allColumns, selectedColumns]
    );

    const toggleColumn = (key: string) => setSelectedColumns((prev) => ({ ...prev, [key]: prev[key] === false }));
    const setAllColumns = (value: boolean) => {
        setSelectedColumns((prev) => {
            const next = { ...prev };
            allColumns.forEach((col) => { next[col.key] = value; });
            return next;
        });
    };

    const avgCost = rows.length > 0 ? rows.reduce((sum, row) => sum + Number(row.costPrice || 0), 0) / rows.length : 0;
    const avgSale = rows.length > 0 ? rows.reduce((sum, row) => sum + Number(row.baseSalePrice || 0), 0) / rows.length : 0;

    const handleExport = async () => {
        if (rows.length === 0) return;
        setIsExporting(true);
        try {
            const excelCols: ExcelColumn[] = allColumns
                .filter((col) => selectedColumns[col.key] !== false)
                .map((col) => ({
                    key: col.key,
                    header: col.label,
                    type: col.type,
                    width: col.width,
                }));

            const exportRows = rows.map((row) => {
                const out: Record<string, string | number | null> = {};
                allColumns.forEach((col) => {
                    if (selectedColumns[col.key] !== false) {
                        out[col.key] = row[col.key] ?? null;
                    }
                });
                return out;
            });

            await exportExcel({
                fileName: `item-price-list-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Item Price List',
                title: 'Item Price List Report',
                filters: {
                    'Active Filters': String(activeFilterCount),
                    'Products': String(filteredProducts.length),
                    'Unit Price Rows': String(rows.length),
                    'Selected Price Groups': `${selectedPriceGroupIds.length}/${priceGroups.length}`,
                    'Currency': currency,
                },
                columns: excelCols,
                rows: exportRows,
            });
        } finally {
            setIsExporting(false);
        }
    };

    const loading = priceGroupsLoading || productsLoading || endpointPriceLoading;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><DollarSign size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Item Price List Report</h2>
                            <p className="text-sm text-slate-600">Unit-wise item price list with selectable price groups, filters, and configurable columns.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'item' ? null : 'item')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Items Filter {itemFiltersCount > 0 ? `(${itemFiltersCount})` : ''}</button>
                        <button type="button" onClick={() => setPanel(panel === 'priceGroup' ? null : 'priceGroup')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Price Groups {selectedPriceGroupIds.length}/{priceGroups.length}</button>
                        <button type="button" onClick={() => setPanel(panel === 'columns' ? null : 'columns')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Columns {selectedColCount}</button>
                    </div>

                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p>
                                <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button>
                            </div>

                            {panel === 'item' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item</p>
                                            <AppDropdown value={productId} onChange={setProductId} options={[{ value: '', label: 'All Items' }, ...productOptions]} placeholder="Select item" searchable />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Group</p>
                                            <AppDropdown value={groupId} onChange={setGroupId} options={[{ value: '', label: 'All Item Groups' }, ...groupOptions]} placeholder="Select item group" searchable />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Category</p>
                                            <AppDropdown value={categoryId} onChange={setCategoryId} options={[{ value: '', label: 'All Categories' }, ...categoryOptions]} placeholder="Select category" searchable />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Brand</p>
                                            <AppDropdown value={brandId} onChange={setBrandId} options={[{ value: '', label: 'All Brands' }, ...brandOptions]} placeholder="Select brand" searchable />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setProductId('');
                                                setGroupId('');
                                                setCategoryId('');
                                                setBrandId('');
                                            }}
                                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                        >
                                            Clear Item Filters
                                        </button>
                                    </div>
                                </div>
                            )}

                            {panel === 'priceGroup' && (
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Price Groups</p>
                                        <MultiSelectDropdown
                                            options={priceGroupOptions}
                                            selectedValues={selectedPriceGroupIds}
                                            onChange={setSelectedPriceGroupIds}
                                            placeholder="Select price groups"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Prices are resolved using <span className="font-semibold">GET /sales/pricing/price-lists/price</span> for selected groups.
                                    </p>
                                </div>
                            )}

                            {panel === 'columns' && (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setAllColumns(true)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Select all</button>
                                        <button type="button" onClick={() => setAllColumns(false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Clear all</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                        {allColumns.map((col) => {
                                            const active = selectedColumns[col.key] !== false;
                                            return (
                                                <button key={col.key} type="button" onClick={() => toggleColumn(col.key)} className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-xs font-semibold ${active ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                                                    {active ? <CheckSquare size={13} /> : <Square size={13} />}
                                                    {col.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-10"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Products</p><p className="mt-2 text-3xl font-black text-slate-900">{filteredProducts.length.toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Unit Price Rows</p><p className="mt-2 text-3xl font-black text-slate-900">{rows.length.toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Cost</p><p className="mt-2 text-3xl font-black text-blue-700">{money(avgCost, currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Base Sale</p><p className="mt-2 text-3xl font-black text-emerald-600">{money(avgSale, currency)}</p></div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">Live Preview ({previewRows.length})</div>
                            <button type="button" onClick={handleExport} disabled={isExporting || rows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                                {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                {isExporting ? 'Generating...' : 'Export Excel'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Item Code</th>
                                        <th className="px-4 py-3 text-left">Item Name</th>
                                        <th className="px-4 py-3 text-left">Unit</th>
                                        <th className="px-4 py-3 text-left">Unit Fraction</th>
                                        <th className="px-4 py-3 text-right">Cost Price</th>
                                        <th className="px-4 py-3 text-right">Base Sale Price</th>
                                        {selectedPriceGroups.map((pg) => (
                                            <th key={pg.id} className="px-4 py-3 text-right">{pg.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={6 + selectedPriceGroups.length} className="px-4 py-8 text-center text-slate-500">No items found for selected filters.</td></tr>}
                                    {previewRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{row.itemCode}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.itemName}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.unitName}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.unitFraction}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{money(Number(row.costPrice || 0), currency)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(Number(row.baseSalePrice || 0), currency)}</td>
                                            {selectedPriceGroups.map((pg) => {
                                                const key = `pg_${pg.id}`;
                                                return <td key={key} className="px-4 py-3 text-right text-slate-800">{money(Number(row[key] || 0), currency)}</td>;
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
