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
    const activeFilterCount = [branchId, productId, groupId, categoryId, brandId].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';

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
        <PageTemplate
            title="Stock in Multiple Unit Report"
            subtitle="View current stock converted across all configured product units."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Stock in Multiple Unit Report' },
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
                    <KpiCard label="Stock Lines" value={Number(stockData?.summary?.totalItems || 0).toLocaleString()} />
                    <KpiCard label="Products" value={Number(stockData?.summary?.totalProducts || 0).toLocaleString()} />
                    <KpiCard label="Converted Rows" value={rows.length.toLocaleString()} />
                    <KpiCard label="Total Valuation" value={money(Number(stockData?.summary?.totalValuation || 0), currency)} />
                </div>

                {/* Table Preview */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
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
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && (
                                    <tr><td colSpan={8} className="px-4 py-8 text-center text-text-tertiary">No stock found for selected filters.</td></tr>
                                )}
                                {previewRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.itemCode}</td>
                                        <td className="px-4 py-3 text-text-primary">{row.itemName}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.warehouse}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.baseUnit}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.unitName}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.unitFraction}</td>
                                        <td className="px-4 py-3 text-right text-text-primary">{row.qtyInUnit}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(Number(row.unitCost || 0), currency)}</td>
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
