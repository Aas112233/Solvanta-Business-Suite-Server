import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { FETCH_ALL_LIMIT } from '../../lib/constants';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { formatCompanyDate, resolveCompanyCurrency, toDateInputValue } from '../../lib/companySettings';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

type DatePreset = 'all' | 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';
type ColumnKey =
    | 'purchaseNo'
    | 'date'
    | 'supplier'
    | 'warehouse'
    | 'grandTotal'
    | 'taxTotal'
    | 'createdBy'
    | 'itemCode'
    | 'itemName'
    | 'itemUnitName'
    | 'itemUnitCode'
    | 'itemUnitFraction'
    | 'itemPurchaseQty'
    | 'itemPrice'
    | 'itemTotal';

const columns: { key: ColumnKey; label: string; detailOnly?: boolean }[] = [
    { key: 'purchaseNo', label: 'Purchase No' },
    { key: 'date', label: 'Date' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'warehouse', label: 'Warehouse / Branch' },
    { key: 'grandTotal', label: 'Grand Total' },
    { key: 'taxTotal', label: 'Tax Total' },
    { key: 'createdBy', label: 'Created By' },
    { key: 'itemCode', label: 'Item Code', detailOnly: true },
    { key: 'itemName', label: 'Item Name', detailOnly: true },
    { key: 'itemUnitName', label: 'Unit Name', detailOnly: true },
    { key: 'itemUnitCode', label: 'Unit Code', detailOnly: true },
    { key: 'itemUnitFraction', label: 'Unit Fraction (pcs in unit)', detailOnly: true },
    { key: 'itemPurchaseQty', label: 'Purchase Quantity', detailOnly: true },
    { key: 'itemPrice', label: 'Unit Price', detailOnly: true },
    { key: 'itemTotal', label: 'Line Total', detailOnly: true },
];

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

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

export default function PurchaseInvoicesReport() {
    const company = useAuthStore((s) => s.user?.company);
    const currency = resolveCompanyCurrency(company);
    const [localBranchId, setLocalBranchId] = useState('');
    const [localSupplierId, setLocalSupplierId] = useState('');
    const [localProductId, setLocalProductId] = useState('');
    const [localGroupId, setLocalGroupId] = useState('');
    const [localCategoryId, setLocalCategoryId] = useState('');
    const [localBrandId, setLocalBrandId] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [showItems, setShowItems] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<Record<ColumnKey, boolean>>({
        purchaseNo: true,
        date: true,
        supplier: true,
        warehouse: true,
        grandTotal: true,
        taxTotal: true,
        createdBy: true,
        itemCode: true,
        itemName: true,
        itemUnitName: true,
        itemUnitCode: true,
        itemUnitFraction: true,
        itemPurchaseQty: true,
        itemPrice: true,
        itemTotal: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-purchase-invoices'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });
    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers-report-purchase-invoices'],
        queryFn: () => api.get('/suppliers', { params: { limit: FETCH_ALL_LIMIT } }).then((r) => r.data.data as { id: string; name: string }[]),
    });
    const { data: filterMasterData } = useQuery({
        queryKey: ['purchase-invoices-filter-master-data'],
        queryFn: () => api.get('/reports/purchase-invoices-filter-options').then((r) => r.data.data as ReportFilterMasterData),
    });
    const { data: reportData, isLoading } = useQuery({
        queryKey: ['report-purchase-invoices', localBranchId, localSupplierId, localProductId, localGroupId, localCategoryId, localBrandId, dateFrom, dateTo],
        queryFn: () =>
            api
                .get('/reports/purchase-invoices-report', {
                    params: {
                        branchId: localBranchId || undefined,
                        supplierId: localSupplierId || undefined,
                        productId: localProductId || undefined,
                        itemGroupId: localGroupId || undefined,
                        categoryId: localCategoryId || undefined,
                        brandId: localBrandId || undefined,
                        dateFrom: dateFrom || undefined,
                        dateTo: dateTo || undefined,
                    },
                })
                .then((r) => r.data.data),
    });

    const exportCols = useMemo(() => columns.filter((c) => !c.detailOnly || showItems), [showItems]);
    const selectedColCount = exportCols.filter((c) => selectedColumns[c.key]).length;
    const previewRows = (reportData?.invoices || []).slice(0, 8);
    const itemFiltersCount = [localProductId, localGroupId, localCategoryId, localBrandId].filter(Boolean).length;
    const activeFilterCount = [localBranchId, localSupplierId, localProductId, localGroupId, localCategoryId, localBrandId, dateFrom || dateTo, showItems ? '1' : ''].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === localBranchId)?.name || 'All Warehouses';
    const supplierName = suppliers.find((s) => s.id === localSupplierId)?.name || 'All Suppliers';
    const formatRangeDate = (value: string) => (value ? formatCompanyDate(value, company) : 'Any');
    const dateLabel = dateFrom || dateTo ? `${formatRangeDate(dateFrom)} to ${formatRangeDate(dateTo)}` : 'All Time';
    const selectedProductName = filterMasterData?.products?.find((p) => p.id === localProductId)?.name || 'All Items';
    const selectedGroupName = filterMasterData?.groups?.find((g) => g.id === localGroupId)?.name || 'All Item Groups';
    const selectedCategoryName = filterMasterData?.categories?.find((c) => c.id === localCategoryId)?.name || 'All Categories';
    const selectedBrandName = filterMasterData?.brands?.find((b) => b.id === localBrandId)?.name || 'All Brands';
    const allProducts = filterMasterData?.products || [];
    const productsForItemOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!localGroupId || p.itemGroupId === localGroupId)
                && (!localCategoryId || p.categoryId === localCategoryId)
                && (!localBrandId || p.brandId === localBrandId)
            ),
        [allProducts, localGroupId, localCategoryId, localBrandId]
    );
    const productsForGroupOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!localProductId || p.id === localProductId)
                && (!localCategoryId || p.categoryId === localCategoryId)
                && (!localBrandId || p.brandId === localBrandId)
            ),
        [allProducts, localProductId, localCategoryId, localBrandId]
    );
    const productsForCategoryOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!localProductId || p.id === localProductId)
                && (!localGroupId || p.itemGroupId === localGroupId)
                && (!localBrandId || p.brandId === localBrandId)
            ),
        [allProducts, localProductId, localGroupId, localBrandId]
    );
    const productsForBrandOptions = useMemo(
        () =>
            allProducts.filter((p) =>
                (!localProductId || p.id === localProductId)
                && (!localGroupId || p.itemGroupId === localGroupId)
                && (!localCategoryId || p.categoryId === localCategoryId)
            ),
        [allProducts, localProductId, localGroupId, localCategoryId]
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
        if (localProductId && !productOptions.some((o) => o.value === localProductId)) {
            setLocalProductId('');
        }
    }, [localProductId, productOptions]);

    useEffect(() => {
        if (localGroupId && !groupOptions.some((o) => o.value === localGroupId)) {
            setLocalGroupId('');
        }
    }, [localGroupId, groupOptions]);

    useEffect(() => {
        if (localCategoryId && !categoryOptions.some((o) => o.value === localCategoryId)) {
            setLocalCategoryId('');
        }
    }, [localCategoryId, categoryOptions]);

    useEffect(() => {
        if (localBrandId && !brandOptions.some((o) => o.value === localBrandId)) {
            setLocalBrandId('');
        }
    }, [localBrandId, brandOptions]);

    const applyPreset = (preset: DatePreset) => {
        const now = new Date();
        const today = toDateInputValue(now, company);
        setDatePreset(preset);
        if (preset === 'all') {
            setDateFrom('');
            setDateTo('');
            return;
        }
        if (preset === 'today') {
            setDateFrom(today);
            setDateTo(today);
            return;
        }
        if (preset === 'last7') {
            const start = new Date(now);
            start.setDate(start.getDate() - 6);
            setDateFrom(toDateInputValue(start, company));
            setDateTo(today);
            return;
        }
        if (preset === 'thisMonth') {
            setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1), company));
            setDateTo(today);
            return;
        }
        if (preset === 'lastMonth') {
            setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 1, 1), company));
            setDateTo(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 0), company));
            return;
        }
    };

    const toggleColumn = (key: ColumnKey) => setSelectedColumns((p) => ({ ...p, [key]: !p[key] }));
    const setAllColumns = (value: boolean) =>
        setSelectedColumns((prev) => {
            const next = { ...prev };
            exportCols.forEach((col) => {
                next[col.key] = value;
            });
            return next;
        });

    const handleExport = async () => {
        if (!reportData) return;
        setIsExporting(true);
        try {
            const excelCols: ExcelColumn[] = [];
            if (selectedColumns.purchaseNo) excelCols.push({ key: 'purchaseNo', header: 'Purchase No', width: 22 });
            if (selectedColumns.date) excelCols.push({ key: 'date', header: 'Date', width: 20 });
            if (selectedColumns.supplier) excelCols.push({ key: 'supplier', header: 'Supplier', width: 35 });
            if (selectedColumns.warehouse) excelCols.push({ key: 'warehouse', header: 'Warehouse / Branch', width: 22 });
            if (showItems) {
                if (selectedColumns.itemCode) excelCols.push({ key: 'itemCode', header: 'Item Code', width: 18 });
                if (selectedColumns.itemName) excelCols.push({ key: 'itemName', header: 'Item Name', width: 30 });
                if (selectedColumns.itemUnitName) excelCols.push({ key: 'itemUnitName', header: 'Unit Name', width: 18 });
                if (selectedColumns.itemUnitCode) excelCols.push({ key: 'itemUnitCode', header: 'Unit Code', width: 16 });
                if (selectedColumns.itemUnitFraction) excelCols.push({ key: 'itemUnitFraction', header: 'Unit Fraction (pcs in unit)', width: 24 });
                if (selectedColumns.itemPurchaseQty) excelCols.push({ key: 'itemPurchaseQty', header: 'Purchase Quantity', type: 'number', width: 16 });
                if (selectedColumns.itemPrice) excelCols.push({ key: 'itemPrice', header: 'Unit Price', type: 'currency', width: 14 });
                if (selectedColumns.itemTotal) excelCols.push({ key: 'itemTotal', header: 'Line Total', type: 'currency', width: 16 });
            }
            if (selectedColumns.grandTotal) excelCols.push({ key: 'grandTotal', header: 'Inv Grand Total', type: 'currency', width: 18 });
            if (selectedColumns.taxTotal) excelCols.push({ key: 'taxTotal', header: 'Inv Tax Total', type: 'currency', width: 18 });
            if (selectedColumns.createdBy) excelCols.push({ key: 'createdBy', header: 'Created By', width: 22 });

            const rows: Record<string, any>[] = [];
            (reportData.invoices || []).forEach((inv: any) => {
                const base: Record<string, any> = {};
                if (selectedColumns.purchaseNo) base.purchaseNo = inv.purchaseNo || '';
                if (selectedColumns.date) base.date = inv.createdAt ? formatCompanyDate(inv.createdAt, company) : '';
                if (selectedColumns.supplier) base.supplier = inv.supplier?.name || '';
                if (selectedColumns.warehouse) base.warehouse = inv.branch?.name || '';
                if (selectedColumns.grandTotal) base.grandTotal = Number(inv.grandTotal || 0);
                if (selectedColumns.taxTotal) base.taxTotal = Number(inv.taxTotal || 0);
                if (selectedColumns.createdBy) base.createdBy = inv.createdBy?.name || '';
                if (showItems && inv.items?.length > 0) {
                    inv.items.forEach((item: any) => {
                        const row: Record<string, any> = { ...base };
                        const matchedUnit = item.product?.units?.find((u: any) =>
                            String(u?.unitCode || '').toLowerCase() === String(item?.unitCode || '').toLowerCase()
                        );
                        const baseUnit = item.product?.units?.find((u: any) => Boolean(u?.isBase));
                        const unitFactor = Number(matchedUnit?.qtyInBaseUnit || 0);
                        const unitFactorDisplay = Number.isInteger(unitFactor)
                            ? String(unitFactor)
                            : String(Number(unitFactor.toFixed(3)));
                        const baseUnitLabel = String(baseUnit?.unitName || baseUnit?.unitCode || 'pcs').toLowerCase();
                        const purchaseUnitLabel = String(
                            matchedUnit?.unitName || item?.unitName || item?.unitCode || matchedUnit?.unitCode || ''
                        ).toLowerCase();
                        const unitFactorText = unitFactor > 0
                            ? `${unitFactorDisplay} ${baseUnitLabel} in ${purchaseUnitLabel}`
                            : '-';
                        if (selectedColumns.itemCode) row.itemCode = item.product?.itemCode || '-';
                        if (selectedColumns.itemName) row.itemName = item.product?.name || '-';
                        if (selectedColumns.itemUnitName) row.itemUnitName = matchedUnit?.unitName || item.unitCode || '-';
                        if (selectedColumns.itemUnitCode) row.itemUnitCode = item.unitCode || matchedUnit?.unitCode || '-';
                        if (selectedColumns.itemUnitFraction) row.itemUnitFraction = unitFactorText;
                        if (selectedColumns.itemPurchaseQty) row.itemPurchaseQty = Number(item.qty || 0);
                        if (selectedColumns.itemPrice) row.itemPrice = Number(item.unitCost ?? item.unitPrice ?? 0);
                        if (selectedColumns.itemTotal) row.itemTotal = Number(item.lineTotal || 0);
                        rows.push(row);
                    });
                } else {
                    rows.push(base);
                }
            });

            await exportExcel({
                fileName: `purchase-invoices-${showItems ? 'with-items-' : ''}${toDateInputValue(undefined, company)}.xlsx`,
                sheetName: 'Purchase Invoices',
                title: showItems ? 'Purchase Invoices (Detailed Items) Report' : 'Purchase Invoices Report',
                filters: {
                    'Branch': branchName,
                    'Supplier': supplierName,
                    'Item': selectedProductName,
                    'Item Group': selectedGroupName,
                    'Item Category': selectedCategoryName,
                    'Brand': selectedBrandName,
                    'Date Range': dateLabel,
                    'Detailed Items': showItems ? 'YES' : 'NO',
                    'Active Filters': String(activeFilterCount),
                    'Currency': currency,
                },
                columns: excelCols,
                rows,
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <PageTemplate
            title="Purchase Invoices Report"
            subtitle="Chip-based filters inspired by modern productivity dashboards."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Purchase Invoices Report' },
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
                            value={localBranchId}
                            onChange={(e) => setLocalBranchId(e.target.value)}
                            placeholder="Warehouse"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
                            value={localSupplierId}
                            onChange={(e) => setLocalSupplierId(e.target.value)}
                            placeholder="Supplier"
                            className="min-w-[180px]"
                        />
                        <div className="flex items-center gap-1">
                            {(['all', 'today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
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
                                checked={showItems}
                                onChange={(e) => setShowItems(e.target.checked)}
                                className="rounded border-border text-brand focus:ring-brand-200"
                            />
                            Show Items
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                        <Select
                            options={[{ value: '', label: 'All Items' }, ...productOptions]}
                            value={localProductId}
                            onChange={(e) => setLocalProductId(e.target.value)}
                            placeholder="Item"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Item Groups' }, ...groupOptions]}
                            value={localGroupId}
                            onChange={(e) => setLocalGroupId(e.target.value)}
                            placeholder="Item Group"
                            className="min-w-[160px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Categories' }, ...categoryOptions]}
                            value={localCategoryId}
                            onChange={(e) => setLocalCategoryId(e.target.value)}
                            placeholder="Category"
                            className="min-w-[160px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Brands' }, ...brandOptions]}
                            value={localBrandId}
                            onChange={(e) => setLocalBrandId(e.target.value)}
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
                        {exportCols.map((col) => (
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <KpiCard label="Total Invoices" value={Number(reportData?.summary?.count || 0).toLocaleString()} />
                    <KpiCard label="Total Amount" value={money(Number(reportData?.summary?.totalAmount || 0), currency)} />
                    <KpiCard label="Total Tax" value={money(Number(reportData?.summary?.totalTax || 0), currency)} />
                </div>

                {/* Preview Table */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                <tr>
                                    <th className="px-4 py-3 text-left">Purchase No</th>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Supplier</th>
                                    <th className="px-4 py-3 text-left">Warehouse</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3 text-right">Tax</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">No data for selected filters.</td></tr>}
                                {previewRows.map((inv: any) => (
                                    <tr key={inv.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{inv.purchaseNo || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{inv.createdAt ? formatCompanyDate(inv.createdAt, company) : '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{inv.supplier?.name || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{inv.branch?.name || '-'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(Number(inv.grandTotal || 0), currency)}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{money(Number(inv.taxTotal || 0), currency)}</td>
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
