import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_CURRENCY } from '../../lib/constants';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

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
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const [branchId, setBranchId] = useState('');
    const [productId, setProductId] = useState('');
    const [groupId, setGroupId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [brandId, setBrandId] = useState('');
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
            productId,
            groupId,
            categoryId,
            brandId,
        ],
        queryFn: () =>
            api
                .get('/reports/stock', {
                    params: {
                        branchId: branchId || undefined,
                        productId: productId || undefined,
                        itemGroupId: groupId || undefined,
                        categoryId: categoryId || undefined,
                        brandId: brandId || undefined,
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
    const activeFilterCount = [branchId, productId, groupId, categoryId, brandId].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
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
        <PageTemplate
            title="Stock in Warehouses Report"
            subtitle="View item stock distribution across warehouses with dependent item filters."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Stock in Warehouses Report' },
            ]}
            action={
                <Button
                    variant="primary"
                    size="sm"
                    icon={isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    onClick={handleExport}
                    disabled={isExporting || !stockData}
                    loading={isExporting}
                >
                    {isExporting ? 'Generating...' : 'Export Excel'}
                </Button>
            }
            loading={isLoading}
            maxWidth="full"
        >
            <div className="space-y-6">
                {/* Filters */}
                <FilterBar>
                    <div className="flex flex-wrap items-center gap-3">
                        <Select
                            options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            placeholder="Warehouse"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Items' }, ...productOptions]}
                            value={productId}
                            onChange={(e) => setProductId(e.target.value)}
                            placeholder="Item"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Item Groups' }, ...groupOptions]}
                            value={groupId}
                            onChange={(e) => setGroupId(e.target.value)}
                            placeholder="Item Group"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Categories' }, ...categoryOptions]}
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            placeholder="Category"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Brands' }, ...brandOptions]}
                            value={brandId}
                            onChange={(e) => setBrandId(e.target.value)}
                            placeholder="Brand"
                            className="min-w-[180px]"
                        />
                    </div>
                    <span className="text-xs text-text-tertiary ml-auto">{activeFilterCount} active filters</span>
                </FilterBar>

                {/* Export Columns */}
                <Section variant="card" title="Export Columns" headerBorder>
                    <div className="flex items-center gap-2 mb-3">
                        <Button size="sm" variant="ghost" onClick={() => setAllColumns(true)}>Select All</Button>
                        <Button size="sm" variant="ghost" onClick={() => setAllColumns(false)}>Clear All</Button>
                        <span className="text-xs text-text-tertiary ml-auto">{selectedColCount} selected</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {columns.map((col) => (
                            <label
                                key={col.key}
                                className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedColumns[col.key]}
                                    onChange={() => toggleColumn(col.key)}
                                    className="rounded border-border text-brand focus:ring-brand-200"
                                />
                                {col.label}
                            </label>
                        ))}
                    </div>
                </Section>

                {/* KPI Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard label="Stock Lines" value={stockLines.toLocaleString()} />
                    <KpiCard label="Products" value={aggregatedRows.length.toLocaleString()} />
                    <KpiCard label="Warehouses in Result" value={uniqueWarehouses.toLocaleString()} />
                    <KpiCard label="Total Valuation" value={money(totalValuation, currency)} />
                </div>

                {/* Table Preview */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
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
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">No stock found for selected filters.</td></tr>
                                )}
                                {previewRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.itemCode}</td>
                                        <td className="px-4 py-3 text-text-primary">{row.itemName}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.baseUnit}</td>
                                        <td className="px-4 py-3 text-right text-text-primary">{row.warehousesCount.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-text-primary">{qtyLabel(row.totalQty)}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.warehouseBreakdown || '-'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(row.totalValuation, currency)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            </div>
        </PageTemplate>
    );
}
