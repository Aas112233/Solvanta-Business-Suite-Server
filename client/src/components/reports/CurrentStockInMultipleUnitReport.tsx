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
    Layers,
    Loader2,
    Square,
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
    | 'warehouse'
    | 'baseUnit'
    | 'unitName'
    | 'unitCode'
    | 'unitFraction'
    | 'baseQty'
    | 'qtyInUnit'
    | 'unitCost'
    | 'valuation';

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

type MultiUnitRow = {
    id: string;
    itemCode: string;
    itemName: string;
    itemGroup: string;
    itemCategory: string;
    itemBrand: string;
    warehouse: string;
    baseUnit: string;
    unitName: string;
    unitCode: string;
    unitFraction: string;
    baseQty: number;
    qtyInUnit: string;
    unitCost: number;
    valuation: number;
};

const columns: { key: ColumnKey; label: string }[] = [
    { key: 'itemCode', label: 'Item Code' },
    { key: 'itemName', label: 'Item Name' },
    { key: 'itemGroup', label: 'Item Group' },
    { key: 'itemCategory', label: 'Item Category' },
    { key: 'itemBrand', label: 'Brand' },
    { key: 'warehouse', label: 'Warehouse / Branch' },
    { key: 'baseUnit', label: 'Base Unit' },
    { key: 'unitName', label: 'Unit Name' },
    { key: 'unitCode', label: 'Unit Code' },
    { key: 'unitFraction', label: 'Unit Fraction (pcs in unit)' },
    { key: 'baseQty', label: 'Base Qty' },
    { key: 'qtyInUnit', label: 'Qty in Unit' },
    { key: 'unitCost', label: 'Unit Cost' },
    { key: 'valuation', label: 'Valuation' },
];

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function fractionLabel(factor: number, baseLabel: string, unitLabel: string) {
    const f = Number.isInteger(factor) ? String(factor) : String(Number(factor.toFixed(3)));
    return `${f} ${baseLabel.toLowerCase()} in ${unitLabel.toLowerCase()}`;
}

function formatQty(value: number) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function mixedQtyLabel(baseQty: number, factor: number, unitLabel: string, baseLabel: string) {
    if (factor <= 1) {
        return `${formatQty(baseQty)} ${unitLabel}`;
    }
    const wholeUnits = Math.floor(baseQty / factor);
    const remainderRaw = baseQty - (wholeUnits * factor);
    const remainder = Math.abs(remainderRaw) < 0.000001 ? 0 : remainderRaw;
    if (wholeUnits <= 0) {
        return `${formatQty(remainder || baseQty)} ${baseLabel}`;
    }
    if (remainder <= 0) {
        return `${wholeUnits} ${unitLabel}`;
    }
    return `${wholeUnits} ${unitLabel} and ${formatQty(remainder)} ${baseLabel}`;
}

export default function CurrentStockInMultipleUnitReport() {
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
        warehouse: true,
        baseUnit: true,
        unitName: true,
        unitCode: true,
        unitFraction: true,
        baseQty: true,
        qtyInUnit: true,
        unitCost: true,
        valuation: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-stock-multiple-unit'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: filterMasterData } = useQuery({
        queryKey: ['stock-multiple-unit-filter-master-data'],
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
            'report-stock-multiple-unit',
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

    const rows = useMemo(() => {
        const stocks = stockData?.stocks || [];
        const multiRows: MultiUnitRow[] = [];

        stocks.forEach((stock) => {
            const units = stock.product?.units || [];
            const baseUnit = units.find((u) => Boolean(u.isBase));
            const baseUnitCode = baseUnit?.unitCode || stock.unitCode || '-';
            const baseUnitName = baseUnit?.unitName || baseUnitCode;
            const baseQty = Number(stock.qtyOnHand || 0);
            const valuation = Number(stock.valuation || 0);

            if (units.length === 0) {
                multiRows.push({
                    id: `${stock.id}::${baseUnitCode}`,
                    itemCode: stock.product?.itemCode || '-',
                    itemName: stock.product?.name || '-',
                    itemGroup: stock.product?.itemGroup?.name || '-',
                    itemCategory: stock.product?.category?.name || '-',
                    itemBrand: stock.product?.brand?.name || '-',
                    warehouse: stock.branch?.name || '-',
                    baseUnit: baseUnitName,
                    unitName: baseUnitName,
                    unitCode: baseUnitCode,
                    unitFraction: '1',
                    baseQty,
                    qtyInUnit: `${formatQty(baseQty)} ${baseUnitName}`,
                    unitCost: Number(stock.avgCost || 0),
                    valuation,
                });
                return;
            }

            units.forEach((u) => {
                const factor = Number(u.qtyInBaseUnit || 0) || 1;
                const qtyInUnit = baseQty / factor;
                const unitCost = Number(stock.avgCost || 0) * factor;
                const unitLabel = u.unitName || u.unitCode;
                multiRows.push({
                    id: `${stock.id}::${u.unitCode}`,
                    itemCode: stock.product?.itemCode || '-',
                    itemName: stock.product?.name || '-',
                    itemGroup: stock.product?.itemGroup?.name || '-',
                    itemCategory: stock.product?.category?.name || '-',
                    itemBrand: stock.product?.brand?.name || '-',
                    warehouse: stock.branch?.name || '-',
                    baseUnit: baseUnitName,
                    unitName: unitLabel,
                    unitCode: u.unitCode,
                    unitFraction: fractionLabel(factor, baseUnitName, unitLabel),
                    baseQty,
                    qtyInUnit: mixedQtyLabel(baseQty, factor, unitLabel, baseUnitName),
                    unitCost,
                    valuation,
                });
            });
        });

        return multiRows;
    }, [stockData]);

    const previewRows = rows.slice(0, 12);
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
            if (selectedColumns.warehouse) excelCols.push({ key: 'warehouse', header: 'Warehouse / Branch', width: 22 });
            if (selectedColumns.baseUnit) excelCols.push({ key: 'baseUnit', header: 'Base Unit', width: 14 });
            if (selectedColumns.unitName) excelCols.push({ key: 'unitName', header: 'Unit Name', width: 14 });
            if (selectedColumns.unitCode) excelCols.push({ key: 'unitCode', header: 'Unit Code', width: 14 });
            if (selectedColumns.unitFraction) excelCols.push({ key: 'unitFraction', header: 'Unit Fraction (pcs in unit)', width: 24 });
            if (selectedColumns.baseQty) excelCols.push({ key: 'baseQty', header: 'Base Qty', type: 'number', width: 14 });
            if (selectedColumns.qtyInUnit) excelCols.push({ key: 'qtyInUnit', header: 'Qty in Unit', width: 20 });
            if (selectedColumns.unitCost) excelCols.push({ key: 'unitCost', header: 'Unit Cost', type: 'currency', width: 14 });
            if (selectedColumns.valuation) excelCols.push({ key: 'valuation', header: 'Valuation', type: 'currency', width: 16 });

            const exportRows = rows.map((row) => {
                const out: Record<string, any> = {};
                if (selectedColumns.itemCode) out.itemCode = row.itemCode;
                if (selectedColumns.itemName) out.itemName = row.itemName;
                if (selectedColumns.itemGroup) out.itemGroup = row.itemGroup;
                if (selectedColumns.itemCategory) out.itemCategory = row.itemCategory;
                if (selectedColumns.itemBrand) out.itemBrand = row.itemBrand;
                if (selectedColumns.warehouse) out.warehouse = row.warehouse;
                if (selectedColumns.baseUnit) out.baseUnit = row.baseUnit;
                if (selectedColumns.unitName) out.unitName = row.unitName;
                if (selectedColumns.unitCode) out.unitCode = row.unitCode;
                if (selectedColumns.unitFraction) out.unitFraction = row.unitFraction;
                if (selectedColumns.baseQty) out.baseQty = Number(row.baseQty || 0);
                if (selectedColumns.qtyInUnit) out.qtyInUnit = row.qtyInUnit;
                if (selectedColumns.unitCost) out.unitCost = Number(row.unitCost || 0);
                if (selectedColumns.valuation) out.valuation = Number(row.valuation || 0);
                return out;
            });

            await exportExcel({
                fileName: `stock-multiple-unit-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Stock Multiple Unit',
                title: 'Current Stock in Multiple Units',
                filters: {
                    'Branch': branchName,
                    'Active Filters': String(activeFilterCount),
                    'Stock Lines': String(Number(stockData.summary?.totalItems || 0)),
                    'Products': String(Number(stockData.summary?.totalProducts || 0)),
                    'Multi-Unit Rows': String(rows.length),
                    'Total Valuation': money(Number(stockData.summary?.totalValuation || 0), currency),
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
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><Layers size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Stock in Multiple Unit Report</h2>
                            <p className="text-sm text-slate-600">View current stock converted across all configured product units.</p>
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
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Lines</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(stockData?.summary?.totalItems || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Products</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(stockData?.summary?.totalProducts || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Converted Rows</p><p className="mt-2 text-3xl font-black text-blue-700">{rows.length.toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Valuation</p><p className="mt-2 text-3xl font-black text-emerald-600">{money(Number(stockData?.summary?.totalValuation || 0), currency)}</p></div>
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
                                        <th className="px-4 py-3 text-left">Warehouse</th>
                                        <th className="px-4 py-3 text-left">Base Unit</th>
                                        <th className="px-4 py-3 text-left">Unit</th>
                                        <th className="px-4 py-3 text-left">Unit Fraction</th>
                                        <th className="px-4 py-3 text-right">Qty in Unit</th>
                                        <th className="px-4 py-3 text-right">Unit Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No stock found for selected filters.</td></tr>}
                                    {previewRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{row.itemCode}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.itemName}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.warehouse}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.baseUnit}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.unitName}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.unitFraction}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{row.qtyInUnit}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(Number(row.unitCost || 0), currency)}</td>
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
