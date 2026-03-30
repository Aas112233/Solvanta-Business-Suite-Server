import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import {
    Building2,
    CheckSquare,
    Download,
    Filter,
    Loader2,
    Square,
    Warehouse,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'branch' | 'item' | 'columns' | null;
type ColumnKey =
    | 'itemCode'
    | 'itemName'
    | 'itemGroup'
    | 'itemCategory'
    | 'itemBrand'
    | 'baseUnit'
    | 'warehousesCount'
    | 'warehouseBreakdown'
    | 'totalQty'
    | 'totalValuation';

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

type StockRow = {
    id: string;
    productId: string;
    unitCode?: string;
    qtyOnHand: number;
    avgCost: number;
    valuation: number;
    product?: {
        id: string;
        itemCode?: string | null;
        name?: string | null;
        categoryId?: string | null;
        itemGroupId?: string | null;
        brandId?: string | null;
        category?: { id: string; name: string } | null;
        itemGroup?: { id: string; name: string } | null;
        brand?: { id: string; name: string } | null;
        units?: { unitCode: string; unitName: string; qtyInBaseUnit: number; isBase: boolean }[];
    } | null;
    branch?: { id: string; name: string; code?: string } | null;
};

type StockReportData = {
    summary?: {
        totalItems?: number;
        totalProducts?: number;
        totalQty?: number;
        totalValuation?: number;
    };
    stocks?: StockRow[];
};

type WarehouseLine = {
    warehouseId: string;
    warehouseName: string;
    qty: number;
};

type AggregatedRow = {
    id: string;
    productId: string;
    itemCode: string;
    itemName: string;
    itemGroup: string;
    itemCategory: string;
    itemBrand: string;
    baseUnit: string;
    warehousesCount: number;
    warehouseBreakdown: string;
    totalQty: number;
    totalValuation: number;
};

const columns: { key: ColumnKey; label: string }[] = [
    { key: 'itemCode', label: 'Item Code' },
    { key: 'itemName', label: 'Item Name' },
    { key: 'itemGroup', label: 'Item Group' },
    { key: 'itemCategory', label: 'Item Category' },
    { key: 'itemBrand', label: 'Brand' },
    { key: 'baseUnit', label: 'Base Unit' },
    { key: 'warehousesCount', label: 'Warehouses Count' },
    { key: 'warehouseBreakdown', label: 'Warehouse Breakdown' },
    { key: 'totalQty', label: 'Total Qty (Base Unit)' },
    { key: 'totalValuation', label: 'Total Valuation' },
];

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function qtyLabel(value: number) {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(3)));
}

function toBaseQty(stock: StockRow) {
    const units = stock.product?.units || [];
    const matchedUnit = units.find((u) => String(u.unitCode || '').toLowerCase() === String(stock.unitCode || '').toLowerCase());
    const factor = Number(matchedUnit?.qtyInBaseUnit || 0) || 1;
    return Number(stock.qtyOnHand || 0) * factor;
}

function baseUnitLabel(stock: StockRow) {
    const units = stock.product?.units || [];
    const base = units.find((u) => Boolean(u.isBase));
    return base?.unitName || base?.unitCode || stock.unitCode || 'pcs';
}

export default function CurrentStockInWarehousesReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const [panel, setPanel] = useState<FilterPanel>(null);
    const [branchId, setBranchId] = useState('');
    const [productId, setProductId] = useState('');
    const [groupId, setGroupId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [brandId, setBrandId] = useState('');
    const [appliedItemFilters, setAppliedItemFilters] = useState({
        productId: '',
        groupId: '',
        categoryId: '',
        brandId: '',
    });
    const [isExporting, setIsExporting] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<Record<ColumnKey, boolean>>({
        itemCode: true,
        itemName: true,
        itemGroup: true,
        itemCategory: true,
        itemBrand: true,
        baseUnit: true,
        warehousesCount: true,
        warehouseBreakdown: true,
        totalQty: true,
        totalValuation: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-stock-in-warehouses'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: filterMasterData } = useQuery({
        queryKey: ['stock-in-warehouses-filter-master-data'],
        queryFn: () => api.get('/reports/purchase-invoices-filter-options').then((r) => r.data.data as ReportFilterMasterData),
    });

    const allProducts = filterMasterData?.products || [];
    const productsForItemOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!groupId || p.itemGroupId === groupId)
                && (!categoryId || p.categoryId === categoryId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, groupId, categoryId, brandId]
    );
    const productsForGroupOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!categoryId || p.categoryId === categoryId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, productId, categoryId, brandId]
    );
    const productsForCategoryOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, productId, groupId, brandId]
    );
    const productsForBrandOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!categoryId || p.categoryId === categoryId)
            ),
        [allProducts, productId, groupId, categoryId]
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

    const { data: stockData, isLoading } = useQuery({
        queryKey: [
            'report-stock-in-warehouses',
            branchId,
            appliedItemFilters.productId,
            appliedItemFilters.groupId,
            appliedItemFilters.categoryId,
            appliedItemFilters.brandId,
        ],
        queryFn: () =>
            api
                .get('/reports/stock', {
                    params: {
                        branchId: branchId || undefined,
                        productId: appliedItemFilters.productId || undefined,
                        itemGroupId: appliedItemFilters.groupId || undefined,
                        categoryId: appliedItemFilters.categoryId || undefined,
                        brandId: appliedItemFilters.brandId || undefined,
                    },
                })
                .then((r) => r.data.data as StockReportData),
    });

    const aggregatedRows = useMemo(() => {
        const stocks = stockData?.stocks || [];
        const grouped = new Map<string, {
            row: Omit<AggregatedRow, 'warehousesCount' | 'warehouseBreakdown'>;
            warehouses: Map<string, WarehouseLine>;
        }>();

        stocks.forEach((stock) => {
            const p = stock.product;
            if (!p?.id) return;
            const key = p.id;
            const totalQtyInBase = toBaseQty(stock);
            const value = Number(stock.valuation || (Number(stock.qtyOnHand || 0) * Number(stock.avgCost || 0)));
            const warehouseId = stock.branch?.id || stock.branch?.name || 'unknown';
            const warehouseName = stock.branch?.name || 'Unknown Warehouse';
            const unit = baseUnitLabel(stock);

            if (!grouped.has(key)) {
                grouped.set(key, {
                    row: {
                        id: key,
                        productId: key,
                        itemCode: p.itemCode || '-',
                        itemName: p.name || '-',
                        itemGroup: p.itemGroup?.name || '-',
                        itemCategory: p.category?.name || '-',
                        itemBrand: p.brand?.name || '-',
                        baseUnit: unit,
                        totalQty: 0,
                        totalValuation: 0,
                    },
                    warehouses: new Map<string, WarehouseLine>(),
                });
            }

            const existing = grouped.get(key)!;
            existing.row.totalQty += totalQtyInBase;
            existing.row.totalValuation += value;
            const wh = existing.warehouses.get(warehouseId);
            if (wh) {
                wh.qty += totalQtyInBase;
            } else {
                existing.warehouses.set(warehouseId, {
                    warehouseId,
                    warehouseName,
                    qty: totalQtyInBase,
                });
            }
        });

        return Array.from(grouped.values())
            .map(({ row, warehouses }) => {
                const warehouseLines = Array.from(warehouses.values())
                    .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
                const warehouseBreakdown = warehouseLines
                    .map((line) => `${line.warehouseName}: ${qtyLabel(line.qty)} ${row.baseUnit}`)
                    .join(', ');
                return {
                    ...row,
                    warehousesCount: warehouseLines.length,
                    warehouseBreakdown,
                } as AggregatedRow;
            })
            .sort((a, b) => a.itemName.localeCompare(b.itemName));
    }, [stockData]);

    const previewRows = aggregatedRows.slice(0, 12);
    const selectedColCount = columns.filter((c) => selectedColumns[c.key]).length;
    const itemFiltersCount = [
        appliedItemFilters.productId,
        appliedItemFilters.groupId,
        appliedItemFilters.categoryId,
        appliedItemFilters.brandId,
    ].filter(Boolean).length;
    const activeFilterCount = [
        branchId,
        appliedItemFilters.productId,
        appliedItemFilters.groupId,
        appliedItemFilters.categoryId,
        appliedItemFilters.brandId,
    ].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const isItemFiltersDirty =
        productId !== appliedItemFilters.productId
        || groupId !== appliedItemFilters.groupId
        || categoryId !== appliedItemFilters.categoryId
        || brandId !== appliedItemFilters.brandId;

    const openItemPanel = () => {
        if (panel === 'item') {
            setPanel(null);
            return;
        }
        setProductId(appliedItemFilters.productId);
        setGroupId(appliedItemFilters.groupId);
        setCategoryId(appliedItemFilters.categoryId);
        setBrandId(appliedItemFilters.brandId);
        setPanel('item');
    };

    const applyItemFilters = () => {
        setAppliedItemFilters({
            productId,
            groupId,
            categoryId,
            brandId,
        });
        setPanel(null);
    };
    const stockLines = Number(stockData?.summary?.totalItems || 0);
    const totalQty = aggregatedRows.reduce((sum, row) => sum + Number(row.totalQty || 0), 0);
    const totalValuation = aggregatedRows.reduce((sum, row) => sum + Number(row.totalValuation || 0), 0);
    const uniqueWarehouses = useMemo(
        () => new Set((stockData?.stocks || []).map((row) => row.branch?.id).filter(Boolean)).size,
        [stockData]
    );

    const toggleColumn = (key: ColumnKey) => setSelectedColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    const setAllColumns = (value: boolean) => {
        setSelectedColumns((prev) => {
            const next = { ...prev };
            columns.forEach((c) => { next[c.key] = value; });
            return next;
        });
    };

    const handleExport = async () => {
        if (!stockData) return;
        setIsExporting(true);
        try {
            const excelCols: ExcelColumn[] = [];
            if (selectedColumns.itemCode) excelCols.push({ key: 'itemCode', header: 'Item Code', width: 16 });
            if (selectedColumns.itemName) excelCols.push({ key: 'itemName', header: 'Item Name', width: 30 });
            if (selectedColumns.itemGroup) excelCols.push({ key: 'itemGroup', header: 'Item Group', width: 18 });
            if (selectedColumns.itemCategory) excelCols.push({ key: 'itemCategory', header: 'Item Category', width: 18 });
            if (selectedColumns.itemBrand) excelCols.push({ key: 'itemBrand', header: 'Brand', width: 18 });
            if (selectedColumns.baseUnit) excelCols.push({ key: 'baseUnit', header: 'Base Unit', width: 14 });
            if (selectedColumns.warehousesCount) excelCols.push({ key: 'warehousesCount', header: 'Warehouses Count', type: 'number', width: 16 });
            if (selectedColumns.warehouseBreakdown) excelCols.push({ key: 'warehouseBreakdown', header: 'Warehouse Breakdown', width: 48 });
            if (selectedColumns.totalQty) excelCols.push({ key: 'totalQty', header: 'Total Qty (Base Unit)', type: 'number', width: 18 });
            if (selectedColumns.totalValuation) excelCols.push({ key: 'totalValuation', header: 'Total Valuation', type: 'currency', width: 16 });

            const exportRows = aggregatedRows.map((row) => {
                const out: Record<string, any> = {};
                if (selectedColumns.itemCode) out.itemCode = row.itemCode;
                if (selectedColumns.itemName) out.itemName = row.itemName;
                if (selectedColumns.itemGroup) out.itemGroup = row.itemGroup;
                if (selectedColumns.itemCategory) out.itemCategory = row.itemCategory;
                if (selectedColumns.itemBrand) out.itemBrand = row.itemBrand;
                if (selectedColumns.baseUnit) out.baseUnit = row.baseUnit;
                if (selectedColumns.warehousesCount) out.warehousesCount = Number(row.warehousesCount || 0);
                if (selectedColumns.warehouseBreakdown) out.warehouseBreakdown = row.warehouseBreakdown;
                if (selectedColumns.totalQty) out.totalQty = Number(row.totalQty || 0);
                if (selectedColumns.totalValuation) out.totalValuation = Number(row.totalValuation || 0);
                return out;
            });

            await exportExcel({
                fileName: `stock-in-warehouses-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Stock in Warehouses',
                title: 'Stock in Warehouses Report',
                filters: {
                    'Branch': branchName,
                    'Active Filters': String(activeFilterCount),
                    'Stock Lines': String(stockLines),
                    'Products': String(aggregatedRows.length),
                    'Warehouses': String(uniqueWarehouses),
                    'Total Quantity': qtyLabel(totalQty),
                    'Total Valuation': money(totalValuation, currency),
                },
                columns: excelCols,
                rows: exportRows,
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><Warehouse size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Stock in Warehouses Report</h2>
                            <p className="text-sm text-slate-600">View item stock distribution across warehouses with dependent item filters.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={openItemPanel} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Items Filter {itemFiltersCount > 0 ? `(${itemFiltersCount})` : ''}</button>
                        <button type="button" onClick={() => setPanel(panel === 'columns' ? null : 'columns')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Columns {selectedColCount}</button>
                    </div>

                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p>
                                <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button>
                            </div>

                            {panel === 'branch' && (
                                <AppDropdown
                                    value={branchId}
                                    onChange={setBranchId}
                                    options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                                    placeholder="Select warehouse"
                                    searchable
                                />
                            )}

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
                                    <div className="flex flex-wrap justify-end gap-2">
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
                                        <button
                                            type="button"
                                            onClick={applyItemFilters}
                                            disabled={!isItemFiltersDirty}
                                            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Apply Item Filters
                                        </button>
                                    </div>
                                </div>
                            )}

                            {panel === 'columns' && (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setAllColumns(true)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Select all</button>
                                        <button type="button" onClick={() => setAllColumns(false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Clear all</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                        {columns.map((col) => {
                                            const active = selectedColumns[col.key];
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

            {isLoading ? (
                <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-10"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Lines</p><p className="mt-2 text-3xl font-black text-slate-900">{stockLines.toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Products</p><p className="mt-2 text-3xl font-black text-slate-900">{aggregatedRows.length.toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Warehouses in Result</p><p className="mt-2 text-3xl font-black text-blue-700">{uniqueWarehouses.toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Valuation</p><p className="mt-2 text-3xl font-black text-emerald-600">{money(totalValuation, currency)}</p></div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">Live Preview ({previewRows.length})</div>
                            <button type="button" onClick={handleExport} disabled={isExporting || !stockData} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
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
                                        <th className="px-4 py-3 text-left">Base Unit</th>
                                        <th className="px-4 py-3 text-right">Warehouses</th>
                                        <th className="px-4 py-3 text-right">Total Qty</th>
                                        <th className="px-4 py-3 text-left">Warehouse Breakdown</th>
                                        <th className="px-4 py-3 text-right">Valuation</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No stock found for selected filters.</td></tr>}
                                    {previewRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{row.itemCode}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.itemName}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.baseUnit}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{row.warehousesCount.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{qtyLabel(row.totalQty)}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.warehouseBreakdown || '-'}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(row.totalValuation, currency)}</td>
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
