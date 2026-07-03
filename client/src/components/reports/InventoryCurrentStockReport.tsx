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
    | 'unitName'
    | 'unitCode'
    | 'unitFraction'
    | 'warehouse'
    | 'qty'
    | 'avgCost'
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

const columns: { key: ColumnKey; label: string }[] = [
    { key: 'itemCode', label: 'Item Code' },
    { key: 'itemName', label: 'Item Name' },
    { key: 'itemGroup', label: 'Item Group' },
    { key: 'itemCategory', label: 'Item Category' },
    { key: 'itemBrand', label: 'Brand' },
    { key: 'unitName', label: 'Unit Name' },
    { key: 'unitCode', label: 'Unit Code' },
    { key: 'unitFraction', label: 'Unit Fraction (pcs in unit)' },
    { key: 'warehouse', label: 'Warehouse / Branch' },
    { key: 'qty', label: 'Stock Qty' },
    { key: 'avgCost', label: 'Avg Cost' },
    { key: 'valuation', label: 'Valuation' },
];

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function formatUnitFraction(stock: StockRow) {
    const matched = stock.product?.units?.find((u) => String(u.unitCode || '').toLowerCase() === String(stock.unitCode || '').toLowerCase());
    const base = stock.product?.units?.find((u) => Boolean(u.isBase));
    const factor = Number(matched?.qtyInBaseUnit || 0);
    if (!factor) return '-';
    const factorText = Number.isInteger(factor) ? String(factor) : String(Number(factor.toFixed(3)));
    const baseLabel = String(base?.unitName || base?.unitCode || 'pcs').toLowerCase();
    const currentLabel = String(matched?.unitName || stock.unitCode || matched?.unitCode || '-').toLowerCase();
    return `${factorText} ${baseLabel} in ${currentLabel}`;
}

export default function InventoryCurrentStockReport() {
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
        unitName: true,
        unitCode: true,
        unitFraction: true,
        warehouse: true,
        qty: true,
        avgCost: true,
        valuation: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-stock-current'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: filterMasterData } = useQuery({
        queryKey: ['stock-current-filter-master-data'],
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
            'report-stock-current',
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

    const rows = stockData?.stocks || [];
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
            if (selectedColumns.unitName) excelCols.push({ key: 'unitName', header: 'Unit Name', width: 14 });
            if (selectedColumns.unitCode) excelCols.push({ key: 'unitCode', header: 'Unit Code', width: 14 });
            if (selectedColumns.unitFraction) excelCols.push({ key: 'unitFraction', header: 'Unit Fraction (pcs in unit)', width: 24 });
            if (selectedColumns.warehouse) excelCols.push({ key: 'warehouse', header: 'Warehouse / Branch', width: 22 });
            if (selectedColumns.qty) excelCols.push({ key: 'qty', header: 'Stock Qty', type: 'number', width: 14 });
            if (selectedColumns.avgCost) excelCols.push({ key: 'avgCost', header: 'Avg Cost', type: 'currency', width: 14 });
            if (selectedColumns.valuation) excelCols.push({ key: 'valuation', header: 'Valuation', type: 'currency', width: 16 });

            const exportRows = rows.map((row) => {
                const matchedUnit = row.product?.units?.find((u) => String(u.unitCode || '').toLowerCase() === String(row.unitCode || '').toLowerCase());
                const out: Record<string, any> = {};
                if (selectedColumns.itemCode) out.itemCode = row.product?.itemCode || '';
                if (selectedColumns.itemName) out.itemName = row.product?.name || '';
                if (selectedColumns.itemGroup) out.itemGroup = row.product?.itemGroup?.name || '';
                if (selectedColumns.itemCategory) out.itemCategory = row.product?.category?.name || '';
                if (selectedColumns.itemBrand) out.itemBrand = row.product?.brand?.name || '';
                if (selectedColumns.unitName) out.unitName = matchedUnit?.unitName || row.unitCode || '';
                if (selectedColumns.unitCode) out.unitCode = row.unitCode || matchedUnit?.unitCode || '';
                if (selectedColumns.unitFraction) out.unitFraction = formatUnitFraction(row);
                if (selectedColumns.warehouse) out.warehouse = row.branch?.name || '';
                if (selectedColumns.qty) out.qty = Number(row.qtyOnHand || 0);
                if (selectedColumns.avgCost) out.avgCost = Number(row.avgCost || 0);
                if (selectedColumns.valuation) out.valuation = Number(row.valuation || 0);
                return out;
            });

            await exportExcel({
                fileName: `inventory-current-stock-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Inventory Current Stock',
                title: 'Inventory Current Stock Report',
                filters: {
                    'Branch': branchName,
                    'Active Filters': String(activeFilterCount),
                    'Total Stock Lines': String(Number(stockData.summary?.totalItems || 0)),
                    'Total Products': String(Number(stockData.summary?.totalProducts || 0)),
                    'Total Quantity': String(Number(stockData.summary?.totalQty || 0).toLocaleString()),
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
            title="Inventory Current Stock"
            subtitle="Live stock snapshot with item-level filters and export controls."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Inventory Current Stock' },
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
                    <KpiCard label="Total Quantity" value={Number(stockData?.summary?.totalQty || 0).toLocaleString()} />
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
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <th className="px-4 py-3 text-left">Warehouse</th>
                                    <th className="px-4 py-3 text-right">Stock Qty</th>
                                    <th className="px-4 py-3 text-right">Avg Cost</th>
                                    <th className="px-4 py-3 text-right">Valuation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">No stock found for selected filters.</td></tr>
                                )}
                                {previewRows.map((row) => {
                                    const matchedUnit = row.product?.units?.find((u) => String(u.unitCode || '').toLowerCase() === String(row.unitCode || '').toLowerCase());
                                    return (
                                        <tr key={row.id} className="hover:bg-background-subtle transition-colors">
                                            <td className="px-4 py-3 font-semibold text-text-primary">{row.product?.itemCode || '-'}</td>
                                            <td className="px-4 py-3 text-text-primary">{row.product?.name || '-'}</td>
                                            <td className="px-4 py-3 text-text-secondary">{matchedUnit?.unitName || row.unitCode || '-'}</td>
                                            <td className="px-4 py-3 text-text-secondary">{row.branch?.name || '-'}</td>
                                            <td className="px-4 py-3 text-right text-text-primary">{Number(row.qtyOnHand || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-text-secondary">{money(Number(row.avgCost || 0), currency)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(Number(row.valuation || 0), currency)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Section>
            </div>
        </PageTemplate>
    );
}
