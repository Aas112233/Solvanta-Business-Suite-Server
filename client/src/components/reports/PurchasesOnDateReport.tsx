import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { FETCH_ALL_LIMIT } from '../../lib/constants';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Download, Loader2, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { formatCompanyDate, resolveCompanyCurrency, toDateInputValue } from '../../lib/companySettings';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

type ColumnKey =
    | 'purchaseNo'
    | 'date'
    | 'supplier'
    | 'warehouse'
    | 'itemCode'
    | 'itemName'
    | 'itemGroup'
    | 'itemCategory'
    | 'itemBrand'
    | 'unitName'
    | 'unitCode'
    | 'unitFraction'
    | 'qty'
    | 'unitCost'
    | 'lineTotal'
    | 'taxAmount'
    | 'createdBy';

const columns: { key: ColumnKey; label: string }[] = [
    { key: 'purchaseNo', label: 'Purchase No' },
    { key: 'date', label: 'Date' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'warehouse', label: 'Warehouse / Branch' },
    { key: 'itemCode', label: 'Item Code' },
    { key: 'itemName', label: 'Item Name' },
    { key: 'itemGroup', label: 'Item Group' },
    { key: 'itemCategory', label: 'Item Category' },
    { key: 'itemBrand', label: 'Brand' },
    { key: 'unitName', label: 'Unit Name' },
    { key: 'unitCode', label: 'Unit Code' },
    { key: 'unitFraction', label: 'Unit Fraction (pcs in unit)' },
    { key: 'qty', label: 'Purchase Quantity' },
    { key: 'unitCost', label: 'Unit Cost' },
    { key: 'lineTotal', label: 'Line Total' },
    { key: 'taxAmount', label: 'Tax Amount' },
    { key: 'createdBy', label: 'Created By' },
];

type FilterMasterData = {
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

type PurchasesOnDateLine = {
    id: string;
    qty: number;
    unitCode: string;
    unitCost: number;
    lineTotal: number;
    taxAmount: number;
    invoice?: {
        id: string;
        purchaseNo?: string;
        createdAt?: string;
        supplier?: { id: string; name: string } | null;
        branch?: { id: string; name: string } | null;
        createdBy?: { id: string; name: string } | null;
    } | null;
    product?: {
        id: string;
        itemCode?: string | null;
        name?: string | null;
        category?: { id: string; name: string } | null;
        itemGroup?: { id: string; name: string } | null;
        brand?: { id: string; name: string } | null;
        units?: { unitCode: string; unitName: string; qtyInBaseUnit: number; isBase: boolean }[];
    } | null;
};

type PurchasesOnDateData = {
    summary?: {
        lineCount?: number;
        invoiceCount?: number;
        totalQty?: number;
        totalAmount?: number;
        totalTax?: number;
    };
    items?: PurchasesOnDateLine[];
};

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function formatUnitFraction(line: PurchasesOnDateLine) {
    const matched = line.product?.units?.find((u) => String(u.unitCode || '').toLowerCase() === String(line.unitCode || '').toLowerCase());
    const base = line.product?.units?.find((u) => Boolean(u.isBase));
    const factor = Number(matched?.qtyInBaseUnit || 0);
    if (!factor) return '-';
    const factorText = Number.isInteger(factor) ? String(factor) : String(Number(factor.toFixed(3)));
    const baseLabel = base?.unitName || base?.unitCode || 'pcs';
    const purchaseLabel = matched?.unitName || line.unitCode || matched?.unitCode || '-';
    return `${factorText} ${baseLabel} in ${purchaseLabel}`;
}

export default function PurchasesOnDateReport() {
    const company = useAuthStore((s) => s.user?.company);
    const currency = resolveCompanyCurrency(company);
    const [targetDate, setTargetDate] = useState(() => toDateInputValue(undefined, company));
    const [branchId, setBranchId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [productId, setProductId] = useState('');
    const [groupId, setGroupId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [brandId, setBrandId] = useState('');
    const [search, setSearch] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<Record<ColumnKey, boolean>>({
        purchaseNo: true,
        date: true,
        supplier: true,
        warehouse: true,
        itemCode: true,
        itemName: true,
        itemGroup: true,
        itemCategory: true,
        itemBrand: true,
        unitName: true,
        unitCode: true,
        unitFraction: true,
        qty: true,
        unitCost: true,
        lineTotal: true,
        taxAmount: true,
        createdBy: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-purchases-on-date'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });
    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers-report-purchases-on-date'],
        queryFn: () => api.get('/suppliers', { params: { limit: FETCH_ALL_LIMIT } }).then((r) => r.data.data as { id: string; name: string }[]),
    });
    const { data: master } = useQuery({
        queryKey: ['purchase-on-date-filter-master-data'],
        queryFn: () => api.get('/reports/purchase-invoices-filter-options').then((r) => r.data.data as FilterMasterData),
    });

    const allProducts = master?.products || [];
    const productsForItem = useMemo(
        () =>
            allProducts.filter((p) =>
                (!groupId || p.itemGroupId === groupId)
                && (!categoryId || p.categoryId === categoryId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, groupId, categoryId, brandId]
    );
    const productsForGroups = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!categoryId || p.categoryId === categoryId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, productId, categoryId, brandId]
    );
    const productsForCategories = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, productId, groupId, brandId]
    );
    const productsForBrands = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!categoryId || p.categoryId === categoryId)
            ),
        [allProducts, productId, groupId, categoryId]
    );

    const groupIds = useMemo(() => new Set(productsForGroups.map((p) => p.itemGroupId).filter(Boolean)), [productsForGroups]);
    const categoryIds = useMemo(() => new Set(productsForCategories.map((p) => p.categoryId).filter(Boolean)), [productsForCategories]);
    const brandIds = useMemo(() => new Set(productsForBrands.map((p) => p.brandId).filter(Boolean)), [productsForBrands]);

    const itemOptions = useMemo(() => productsForItem.map((p) => ({ value: p.id, label: `${p.itemCode || '-'} - ${p.name || 'Unnamed Item'}` })), [productsForItem]);
    const groupOptions = useMemo(() => (master?.groups || []).filter((g) => groupIds.has(g.id)).map((g) => ({ value: g.id, label: g.name })), [master, groupIds]);
    const categoryOptions = useMemo(() => (master?.categories || []).filter((c) => categoryIds.has(c.id)).map((c) => ({ value: c.id, label: c.name })), [master, categoryIds]);
    const brandOptions = useMemo(() => (master?.brands || []).filter((b) => brandIds.has(b.id)).map((b) => ({ value: b.id, label: b.name })), [master, brandIds]);

    useEffect(() => {
        if (productId && !itemOptions.some((o) => o.value === productId)) setProductId('');
    }, [productId, itemOptions]);
    useEffect(() => {
        if (groupId && !groupOptions.some((o) => o.value === groupId)) setGroupId('');
    }, [groupId, groupOptions]);
    useEffect(() => {
        if (categoryId && !categoryOptions.some((o) => o.value === categoryId)) setCategoryId('');
    }, [categoryId, categoryOptions]);
    useEffect(() => {
        if (brandId && !brandOptions.some((o) => o.value === brandId)) setBrandId('');
    }, [brandId, brandOptions]);

    const { data: reportData, isLoading } = useQuery({
        queryKey: ['report-purchases-on-date', targetDate, branchId, supplierId, productId, groupId, categoryId, brandId, search],
        queryFn: () =>
            api
                .get('/reports/purchases-on-date', {
                    params: {
                        date: targetDate,
                        branchId: branchId || undefined,
                        supplierId: supplierId || undefined,
                        productId: productId || undefined,
                        itemGroupId: groupId || undefined,
                        categoryId: categoryId || undefined,
                        brandId: brandId || undefined,
                        search: search.trim() || undefined,
                    },
                })
                .then((r) => r.data.data as PurchasesOnDateData),
        enabled: !!targetDate,
    });

    const rows = reportData?.items || [];
    const previewRows = rows.slice(0, 12);
    const selectedColCount = columns.filter((c) => selectedColumns[c.key]).length;
    const itemFiltersCount = [productId, groupId, categoryId, brandId].filter(Boolean).length;
    const activeFilterCount = [targetDate, branchId, supplierId, productId, groupId, categoryId, brandId, search.trim()].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || 'All Suppliers';
    const searchLabel = search.trim() ? `Search: ${search.trim()}` : 'No Search';
    const targetDateLabel = targetDate ? formatCompanyDate(targetDate, company) : 'Select Date';

    const toggleColumn = (key: ColumnKey) => setSelectedColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    const setAllColumns = (value: boolean) => {
        setSelectedColumns((prev) => {
            const next = { ...prev };
            columns.forEach((c) => {
                next[c.key] = value;
            });
            return next;
        });
    };

    const handleExport = async () => {
        if (!reportData) return;
        setIsExporting(true);
        try {
            const excelCols: ExcelColumn[] = [];
            if (selectedColumns.purchaseNo) excelCols.push({ key: 'purchaseNo', header: 'Purchase No', width: 20 });
            if (selectedColumns.date) excelCols.push({ key: 'date', header: 'Date', width: 18 });
            if (selectedColumns.supplier) excelCols.push({ key: 'supplier', header: 'Supplier', width: 28 });
            if (selectedColumns.warehouse) excelCols.push({ key: 'warehouse', header: 'Warehouse / Branch', width: 22 });
            if (selectedColumns.itemCode) excelCols.push({ key: 'itemCode', header: 'Item Code', width: 18 });
            if (selectedColumns.itemName) excelCols.push({ key: 'itemName', header: 'Item Name', width: 30 });
            if (selectedColumns.itemGroup) excelCols.push({ key: 'itemGroup', header: 'Item Group', width: 20 });
            if (selectedColumns.itemCategory) excelCols.push({ key: 'itemCategory', header: 'Item Category', width: 20 });
            if (selectedColumns.itemBrand) excelCols.push({ key: 'itemBrand', header: 'Brand', width: 18 });
            if (selectedColumns.unitName) excelCols.push({ key: 'unitName', header: 'Unit Name', width: 16 });
            if (selectedColumns.unitCode) excelCols.push({ key: 'unitCode', header: 'Unit Code', width: 16 });
            if (selectedColumns.unitFraction) excelCols.push({ key: 'unitFraction', header: 'Unit Fraction (pcs in unit)', width: 24 });
            if (selectedColumns.qty) excelCols.push({ key: 'qty', header: 'Purchase Quantity', type: 'number', width: 16 });
            if (selectedColumns.unitCost) excelCols.push({ key: 'unitCost', header: 'Unit Cost', type: 'currency', width: 16 });
            if (selectedColumns.lineTotal) excelCols.push({ key: 'lineTotal', header: 'Line Total', type: 'currency', width: 16 });
            if (selectedColumns.taxAmount) excelCols.push({ key: 'taxAmount', header: 'Tax Amount', type: 'currency', width: 16 });
            if (selectedColumns.createdBy) excelCols.push({ key: 'createdBy', header: 'Created By', width: 20 });

            const exportRows = rows.map((line) => {
                const matchedUnit = line.product?.units?.find((u) => String(u.unitCode || '').toLowerCase() === String(line.unitCode || '').toLowerCase());
                const row: Record<string, any> = {};
                if (selectedColumns.purchaseNo) row.purchaseNo = line.invoice?.purchaseNo || '';
                if (selectedColumns.date) row.date = line.invoice?.createdAt ? formatCompanyDate(line.invoice.createdAt, company) : '';
                if (selectedColumns.supplier) row.supplier = line.invoice?.supplier?.name || '';
                if (selectedColumns.warehouse) row.warehouse = line.invoice?.branch?.name || '';
                if (selectedColumns.itemCode) row.itemCode = line.product?.itemCode || '';
                if (selectedColumns.itemName) row.itemName = line.product?.name || '';
                if (selectedColumns.itemGroup) row.itemGroup = line.product?.itemGroup?.name || '';
                if (selectedColumns.itemCategory) row.itemCategory = line.product?.category?.name || '';
                if (selectedColumns.itemBrand) row.itemBrand = line.product?.brand?.name || '';
                if (selectedColumns.unitName) row.unitName = matchedUnit?.unitName || line.unitCode || '';
                if (selectedColumns.unitCode) row.unitCode = line.unitCode || matchedUnit?.unitCode || '';
                if (selectedColumns.unitFraction) row.unitFraction = formatUnitFraction(line);
                if (selectedColumns.qty) row.qty = Number(line.qty || 0);
                if (selectedColumns.unitCost) row.unitCost = Number(line.unitCost || 0);
                if (selectedColumns.lineTotal) row.lineTotal = Number(line.lineTotal || 0);
                if (selectedColumns.taxAmount) row.taxAmount = Number(line.taxAmount || 0);
                if (selectedColumns.createdBy) row.createdBy = line.invoice?.createdBy?.name || '';
                return row;
            });

            await exportExcel({
                fileName: `purchases-on-date-${targetDate}.xlsx`,
                sheetName: 'Purchases On Date',
                title: `Purchases On Date Report (${targetDateLabel})`,
                filters: {
                    'Date': targetDateLabel,
                    'Branch': branchName,
                    'Supplier': supplierName,
                    'Search': search.trim() || 'None',
                    'Active Filters': String(activeFilterCount),
                    'Currency': currency,
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
            title="Purchases on Date Report"
            subtitle="Line-level purchase analytics for a selected date with drill-down filters."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Purchases on Date Report' },
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
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-text-secondary whitespace-nowrap">Date:</label>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                            />
                        </div>
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
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                        <Select
                            options={[{ value: '', label: 'All Items' }, ...itemOptions]}
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
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search size={15} className="absolute left-3 top-2.5 text-text-tertiary" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search purchase no, supplier, item name/code..."
                                className="w-full h-10 rounded-lg border border-border bg-background-card pl-9 pr-3 text-sm text-text-primary"
                            />
                        </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <KpiCard label="Purchase Invoices" value={Number(reportData?.summary?.invoiceCount || 0)} />
                    <KpiCard label="Line Items" value={Number(reportData?.summary?.lineCount || 0)} />
                    <KpiCard label="Total Quantity" value={Number(reportData?.summary?.totalQty || 0).toLocaleString()} />
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
                                    <th className="px-4 py-3 text-left">Item</th>
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <th className="px-4 py-3 text-right">Qty</th>
                                    <th className="px-4 py-3 text-right">Line Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-text-tertiary">No purchases found for selected filters.</td></tr>}
                                {previewRows.map((line) => (
                                    <tr key={line.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{line.invoice?.purchaseNo || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{line.invoice?.createdAt ? formatCompanyDate(line.invoice.createdAt, company) : '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{line.invoice?.supplier?.name || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{line.invoice?.branch?.name || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">
                                            <div className="font-semibold text-text-primary">{line.product?.name || '-'}</div>
                                            <div className="text-xs text-text-tertiary">{line.product?.itemCode || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary">{line.unitCode || '-'}</td>
                                        <td className="px-4 py-3 text-right text-text-primary">{Number(line.qty || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(Number(line.lineTotal || 0), currency)}</td>
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
