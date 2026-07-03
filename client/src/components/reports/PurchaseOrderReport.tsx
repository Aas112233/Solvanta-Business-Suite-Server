import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FETCH_ALL_LIMIT } from '../../lib/constants';
import api from '../../lib/api';
import type { ExcelColumn } from '../../lib/excelReport';
import { exportExcel } from '../../lib/fileExport';
import { formatCompanyDate, resolveCompanyCurrency, toDateInputValue } from '../../lib/companySettings';
import { useAuthStore } from '../../stores/authStore';
import { Download, Loader2 } from 'lucide-react';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

type DatePreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';
type ColumnKey = 'itemCode' | 'itemName' | 'supplier' | 'supplierCode' | 'baseUnitCode' | 'baseUnitName' | 'soldQty' | 'currentStock' | 'requiredQty' | 'suggestedOrderQty' | 'unitPurchasePriceExVat' | 'unitPurchasePriceIncVat' | 'requiredValueExVat' | 'requiredValueIncVat' | 'lastPurchasedAt';

type ReportFilterMasterData = {
    products: { id: string; itemCode?: string | null; name?: string | null; categoryId?: string | null; itemGroupId?: string | null; brandId?: string | null }[];
    categories: { id: string; name: string }[];
    groups: { id: string; name: string }[];
    brands: { id: string; name: string }[];
};

type PurchaseOrderItemRow = {
    productId: string;
    itemCode: string;
    supplierName: string | null;
    supplierCode: string | null;
    itemName: string;
    baseUnitCode: string;
    baseUnitName: string;
    soldQty: number;
    currentStock: number;
    requiredQty: number;
    suggestedOrderQty: number;
    unitPurchasePriceExVat: number;
    unitPurchasePriceIncVat: number;
    lastPurchasedAt: string | null;
};

type PurchaseOrderReportResponse = {
    summary: {
        analyzedItems: number;
        reportItems: number;
        requiredItems: number;
        totalRequiredQty: number;
        totalRequiredValueIncVat: number;
        periodDays: number;
    };
    items: PurchaseOrderItemRow[];
};

const columnDefs: { key: ColumnKey; label: string }[] = [
    { key: 'itemCode', label: 'Item Code' },
    { key: 'itemName', label: 'Item Name' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'supplierCode', label: 'Supplier Code' },
    { key: 'baseUnitCode', label: 'Unit Code' },
    { key: 'baseUnitName', label: 'Unit Name' },
    { key: 'soldQty', label: 'Sold Qty' },
    { key: 'currentStock', label: 'Current Stock' },
    { key: 'requiredQty', label: 'Required Qty' },
    { key: 'suggestedOrderQty', label: 'Suggested PO Qty' },
    { key: 'unitPurchasePriceExVat', label: 'Unit Price (Ex VAT)' },
    { key: 'unitPurchasePriceIncVat', label: 'Unit Price (Inc VAT)' },
    { key: 'requiredValueExVat', label: 'Required Value (Ex VAT)' },
    { key: 'requiredValueIncVat', label: 'Required Value (Inc VAT)' },
    { key: 'lastPurchasedAt', label: 'Last Purchased At' },
];

function money(value: number, currency: string) { return `${currency} ${Number(value || 0).toLocaleString()}`; }
function defaultRange(source?: unknown) {
    const now = new Date();
    return {
        from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1), source),
        to: toDateInputValue(now, source),
    };
}

export default function PurchaseOrderReport() {
    const company = useAuthStore((s) => s.user?.company);
    const currency = resolveCompanyCurrency(company);
    const defaults = defaultRange(company);
    const [branchId, setBranchId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [dateFrom, setDateFrom] = useState(defaults.from);
    const [dateTo, setDateTo] = useState(defaults.to);
    const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
    const [includeZeroRequired, setIncludeZeroRequired] = useState(false);
    const [productId, setProductId] = useState('');
    const [groupId, setGroupId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [brandId, setBrandId] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<Record<ColumnKey, boolean>>(Object.fromEntries(columnDefs.map((c) => [c.key, true])) as Record<ColumnKey, boolean>);

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-purchase-order'],
        queryFn: () => api.get('/branches').then((res) => res.data.data as { id: string; name: string }[]),
    });
    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers-report-purchase-order'],
        queryFn: () => api.get('/suppliers', { params: { limit: FETCH_ALL_LIMIT } }).then((res) => res.data.data as { id: string; name: string }[]),
    });
    const { data: master } = useQuery({
        queryKey: ['purchase-order-filter-master-data'],
        queryFn: () => api.get('/reports/purchase-invoices-filter-options').then((r) => r.data.data as ReportFilterMasterData),
    });

    const allProducts = master?.products || [];
    const productsForItem = useMemo(() => allProducts.filter((p) => (!groupId || p.itemGroupId === groupId) && (!categoryId || p.categoryId === categoryId) && (!brandId || p.brandId === brandId)), [allProducts, groupId, categoryId, brandId]);
    const productsForGroup = useMemo(() => allProducts.filter((p) => (!productId || p.id === productId) && (!categoryId || p.categoryId === categoryId) && (!brandId || p.brandId === brandId)), [allProducts, productId, categoryId, brandId]);
    const productsForCategory = useMemo(() => allProducts.filter((p) => (!productId || p.id === productId) && (!groupId || p.itemGroupId === groupId) && (!brandId || p.brandId === brandId)), [allProducts, productId, groupId, brandId]);
    const productsForBrand = useMemo(() => allProducts.filter((p) => (!productId || p.id === productId) && (!groupId || p.itemGroupId === groupId) && (!categoryId || p.categoryId === categoryId)), [allProducts, productId, groupId, categoryId]);

    const productOptions = useMemo(() => productsForItem.map((p) => ({ value: p.id, label: `${p.itemCode || '-'} - ${p.name || 'Unnamed Item'}` })), [productsForItem]);
    const groupOptions = useMemo(() => (master?.groups || []).filter((g) => new Set(productsForGroup.map((p) => p.itemGroupId).filter(Boolean)).has(g.id)).map((g) => ({ value: g.id, label: g.name })), [master, productsForGroup]);
    const categoryOptions = useMemo(() => (master?.categories || []).filter((c) => new Set(productsForCategory.map((p) => p.categoryId).filter(Boolean)).has(c.id)).map((c) => ({ value: c.id, label: c.name })), [master, productsForCategory]);
    const brandOptions = useMemo(() => (master?.brands || []).filter((b) => new Set(productsForBrand.map((p) => p.brandId).filter(Boolean)).has(b.id)).map((b) => ({ value: b.id, label: b.name })), [master, productsForBrand]);

    useEffect(() => { if (productId && !productOptions.some((o) => o.value === productId)) setProductId(''); }, [productId, productOptions]);
    useEffect(() => { if (groupId && !groupOptions.some((o) => o.value === groupId)) setGroupId(''); }, [groupId, groupOptions]);
    useEffect(() => { if (categoryId && !categoryOptions.some((o) => o.value === categoryId)) setCategoryId(''); }, [categoryId, categoryOptions]);
    useEffect(() => { if (brandId && !brandOptions.some((o) => o.value === brandId)) setBrandId(''); }, [brandId, brandOptions]);

    const { data: reportData, isLoading } = useQuery({
        queryKey: ['report-purchase-order', branchId, supplierId, dateFrom, dateTo, includeZeroRequired, productId, groupId, categoryId, brandId],
        queryFn: () =>
            api.get('/reports/purchase-order-report', {
                params: {
                    dateFrom: dateFrom || undefined,
                    dateTo: dateTo || undefined,
                    branchId: branchId || undefined,
                    supplierId: supplierId || undefined,
                    includeZeroRequired: includeZeroRequired || undefined,
                    productId: productId || undefined,
                    itemGroupId: groupId || undefined,
                    categoryId: categoryId || undefined,
                    brandId: brandId || undefined,
                },
            }).then((res) => res.data.data as PurchaseOrderReportResponse),
        enabled: Boolean(dateFrom && dateTo),
    });

    const rows = reportData?.items || [];
    const previewRows = rows.slice(0, 12);
    const selectedColCount = columnDefs.filter((c) => selectedColumns[c.key]).length;
    const itemFiltersCount = [productId, groupId, categoryId, brandId].filter(Boolean).length;
    const activeFilterCount = [branchId, supplierId, includeZeroRequired ? '1' : '', dateFrom || dateTo, productId, groupId, categoryId, brandId].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || 'All Suppliers';
    const formatRangeDate = (value: string) => (value ? formatCompanyDate(value, company) : 'Any');
    const dateLabel = `${formatRangeDate(dateFrom)} to ${formatRangeDate(dateTo)}`;
    const selectedProductName = master?.products?.find((p) => p.id === productId)?.name || 'All Items';
    const selectedGroupName = master?.groups?.find((g) => g.id === groupId)?.name || 'All Item Groups';
    const selectedCategoryName = master?.categories?.find((c) => c.id === categoryId)?.name || 'All Categories';
    const selectedBrandName = master?.brands?.find((b) => b.id === brandId)?.name || 'All Brands';

    const applyPreset = (preset: DatePreset) => {
        const now = new Date();
        const today = toDateInputValue(now, company);
        setDatePreset(preset);
        if (preset === 'today') { setDateFrom(today); setDateTo(today); return; }
        if (preset === 'last7') { const start = new Date(now); start.setDate(start.getDate() - 6); setDateFrom(toDateInputValue(start, company)); setDateTo(today); return; }
        if (preset === 'thisMonth') { setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1), company)); setDateTo(today); return; }
        if (preset === 'lastMonth') { setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 1, 1), company)); setDateTo(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 0), company)); }
    };

    const setAllColumns = (value: boolean) => setSelectedColumns((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, value])) as Record<ColumnKey, boolean>);
    const toggleColumn = (key: ColumnKey) => setSelectedColumns((prev) => ({ ...prev, [key]: !prev[key] }));

    const handleExport = async () => {
        if (!reportData) return;
        setIsExporting(true);
        try {
            const excelMap: Record<ColumnKey, { col: ExcelColumn; val: (r: PurchaseOrderItemRow) => any }> = {
                itemCode: { col: { key: 'itemCode', header: 'Item Code', width: 16 }, val: (r) => r.itemCode || '' },
                itemName: { col: { key: 'itemName', header: 'Item Name', width: 30 }, val: (r) => r.itemName || '' },
                supplier: { col: { key: 'supplier', header: 'Supplier', width: 30 }, val: (r) => r.supplierName || '' },
                supplierCode: { col: { key: 'supplierCode', header: 'Supplier Code', width: 18 }, val: (r) => r.supplierCode || '' },
                baseUnitCode: { col: { key: 'baseUnitCode', header: 'Unit Code', width: 14 }, val: (r) => r.baseUnitCode || '' },
                baseUnitName: { col: { key: 'baseUnitName', header: 'Unit Name', width: 16 }, val: (r) => r.baseUnitName || '' },
                soldQty: { col: { key: 'soldQty', header: 'Sold Qty', type: 'number', width: 14 }, val: (r) => Number(r.soldQty || 0) },
                currentStock: { col: { key: 'currentStock', header: 'Current Stock', type: 'number', width: 16 }, val: (r) => Number(r.currentStock || 0) },
                requiredQty: { col: { key: 'requiredQty', header: 'Required Qty', type: 'number', width: 16 }, val: (r) => Number(r.requiredQty || 0) },
                suggestedOrderQty: { col: { key: 'suggestedOrderQty', header: 'Suggested PO Qty', type: 'number', width: 18 }, val: (r) => Number(r.suggestedOrderQty || 0) },
                unitPurchasePriceExVat: { col: { key: 'unitPurchasePriceExVat', header: 'Unit Price Ex VAT', type: 'currency', width: 18 }, val: (r) => Number(r.unitPurchasePriceExVat || 0) },
                unitPurchasePriceIncVat: { col: { key: 'unitPurchasePriceIncVat', header: 'Unit Price Inc VAT', type: 'currency', width: 18 }, val: (r) => Number(r.unitPurchasePriceIncVat || 0) },
                requiredValueExVat: { col: { key: 'requiredValueExVat', header: 'Required Value Ex VAT', type: 'currency', width: 20 }, val: (r) => Number(r.requiredQty || 0) * Number(r.unitPurchasePriceExVat || 0) },
                requiredValueIncVat: { col: { key: 'requiredValueIncVat', header: 'Required Value Inc VAT', type: 'currency', width: 20 }, val: (r) => Number(r.requiredQty || 0) * Number(r.unitPurchasePriceIncVat || 0) },
                lastPurchasedAt: { col: { key: 'lastPurchasedAt', header: 'Last Purchased At', width: 18 }, val: (r) => (r.lastPurchasedAt ? formatCompanyDate(r.lastPurchasedAt, company) : '') },
            };
            const selectedKeys = columnDefs.map((c) => c.key).filter((k) => selectedColumns[k]);
            const exportRows = rows.map((r) => Object.fromEntries(selectedKeys.map((k) => [k, excelMap[k].val(r)])));
            await exportExcel({
                fileName: `purchase-order-report-${toDateInputValue(undefined, company)}.xlsx`,
                sheetName: 'Purchase Order Report',
                title: 'Purchase Order Suggestion Report',
                filters: {
                    'Branch': branchName,
                    'Supplier': supplierName,
                    'Item': selectedProductName,
                    'Item Group': selectedGroupName,
                    'Item Category': selectedCategoryName,
                    'Brand': selectedBrandName,
                    'Date Range': dateLabel,
                    'Include Zero Required': includeZeroRequired ? 'Yes' : 'No',
                    'Active Filters': String(activeFilterCount),
                    'Currency': currency,
                },
                columns: selectedKeys.map((k) => excelMap[k].col),
                rows: exportRows,
            });
        } finally { setIsExporting(false); }
    };

    return (
        <PageTemplate
            title="Purchase Order Report"
            subtitle="Auto-generated purchase suggestions from sold quantity versus current stock."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Purchase Order Report' },
            ]}
            action={
                <Button
                    variant="primary"
                    size="sm"
                    icon={isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    onClick={handleExport}
                    disabled={isExporting || !reportData}
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
                            options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
                            value={supplierId}
                            onChange={(e) => setSupplierId(e.target.value)}
                            placeholder="Supplier"
                            className="min-w-[180px]"
                        />
                        <div className="flex items-center gap-1">
                            {(['today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className={`rounded-lg border px-2 py-1.5 text-xs font-bold uppercase ${datePreset === preset ? 'border-brand bg-brand text-white' : 'border-border bg-background-card text-text-secondary hover:bg-background-subtle'}`}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                            />
                            <span className="text-text-tertiary text-sm">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeZeroRequired}
                                onChange={(e) => setIncludeZeroRequired(e.target.checked)}
                                className="rounded border-border text-brand focus:ring-brand-200"
                            />
                            Include Zero Required
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
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
                            className="min-w-[160px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Categories' }, ...categoryOptions]}
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            placeholder="Category"
                            className="min-w-[160px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Brands' }, ...brandOptions]}
                            value={brandId}
                            onChange={(e) => setBrandId(e.target.value)}
                            placeholder="Brand"
                            className="min-w-[160px]"
                        />
                    </div>
                    <span className="text-xs text-text-tertiary ml-auto">{activeFilterCount} active filters</span>
                </FilterBar>

                {/* Column Toggles */}
                <Section variant="card" title="Export Columns" headerBorder>
                    <div className="flex items-center gap-2 mb-3">
                        <Button size="sm" variant="ghost" onClick={() => setAllColumns(true)}>Select All</Button>
                        <Button size="sm" variant="ghost" onClick={() => setAllColumns(false)}>Clear All</Button>
                        <span className="text-xs text-text-tertiary ml-auto">{selectedColCount} selected</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {columnDefs.map((col) => (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <KpiCard label="Analyzed Items" value={Number(reportData?.summary?.analyzedItems || 0).toLocaleString()} />
                    <KpiCard label="Report Items" value={Number(reportData?.summary?.reportItems || 0).toLocaleString()} />
                    <KpiCard label="Required Items" value={Number(reportData?.summary?.requiredItems || 0).toLocaleString()} />
                    <KpiCard label="Total Required Qty" value={Number(reportData?.summary?.totalRequiredQty || 0).toLocaleString()} />
                    <KpiCard label="Required Value (Inc VAT)" value={money(Number(reportData?.summary?.totalRequiredValueIncVat || 0), currency)} />
                </div>

                {/* Preview Table */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                <tr>
                                    <th className="px-4 py-3 text-left">Item Code</th>
                                    <th className="px-4 py-3 text-left">Item Name</th>
                                    <th className="px-4 py-3 text-left">Supplier</th>
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <th className="px-4 py-3 text-right">Sold</th>
                                    <th className="px-4 py-3 text-right">Stock</th>
                                    <th className="px-4 py-3 text-right">Required</th>
                                    <th className="px-4 py-3 text-right">Suggested PO</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-text-tertiary">No items found for selected filters.</td></tr>}
                                {previewRows.map((row) => (
                                    <tr key={row.productId} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.itemCode || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.itemName || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.supplierName || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.baseUnitCode || '-'} {row.baseUnitName ? `(${row.baseUnitName})` : ''}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{Number(row.soldQty || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{Number(row.currentStock || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-danger">{Number(row.requiredQty || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-brand">{Number(row.suggestedOrderQty || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                {/* Period info */}
                <div className="rounded-xl border border-border bg-background-subtle p-4 text-sm text-text-secondary">
                    This report compares sales in {Number(reportData?.summary?.periodDays || 0)} day(s) against current stock to suggest purchase quantities.
                </div>
            </div>
        </PageTemplate>
    );
}
