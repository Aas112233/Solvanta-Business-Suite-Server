
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import {
    Building2,
    CalendarRange,
    CheckSquare,
    Download,
    Filter,
    Layers,
    Loader2,
    Package,
    Search,
    Square,
    Truck,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { formatCompanyDate, resolveCompanyCurrency, toDateInputValue } from '../../lib/companySettings';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'date' | 'branch' | 'supplier' | 'item' | 'search' | 'columns' | null;

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
    const [panel, setPanel] = useState<FilterPanel>(null);
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
        queryFn: () => api.get('/suppliers', { params: { limit: 1000 } }).then((r) => r.data.data as { id: string; name: string }[]),
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
        <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><Package size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Purchases on Date Report</h2>
                            <p className="text-sm text-slate-600">Line-level purchase analytics for a selected date with drill-down filters.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'date' ? null : 'date')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarRange size={15} /> {targetDateLabel}</button>
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'supplier' ? null : 'supplier')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Truck size={15} /> {supplierName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'item' ? null : 'item')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Layers size={15} /> Item Filters {itemFiltersCount > 0 ? `(${itemFiltersCount})` : ''}</button>
                        <button type="button" onClick={() => setPanel(panel === 'search' ? null : 'search')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Search size={15} /> {searchLabel}</button>
                        <button type="button" onClick={() => setPanel(panel === 'columns' ? null : 'columns')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Columns {selectedColCount}</button>
                    </div>

                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p>
                                <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button>
                            </div>

                            {panel === 'date' && (
                                <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                            )}

                            {panel === 'branch' && (
                                <AppDropdown value={branchId} onChange={setBranchId} options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} placeholder="Select warehouse" searchable />
                            )}

                            {panel === 'supplier' && (
                                <AppDropdown value={supplierId} onChange={setSupplierId} options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} placeholder="Select supplier" searchable />
                            )}

                            {panel === 'search' && (
                                <div className="relative">
                                    <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search purchase no, supplier, item name/code..."
                                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm"
                                    />
                                </div>
                            )}

                            {panel === 'item' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item</p>
                                            <AppDropdown value={productId} onChange={setProductId} options={[{ value: '', label: 'All Items' }, ...itemOptions]} placeholder="Select item" searchable />
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Purchase Invoices</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.invoiceCount || 0)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Line Items</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.lineCount || 0)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Quantity</p><p className="mt-2 text-3xl font-black text-blue-700">{Number(reportData?.summary?.totalQty || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Amount</p><p className="mt-2 text-3xl font-black text-emerald-600">{money(Number(reportData?.summary?.totalAmount || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Tax</p><p className="mt-2 text-3xl font-black text-rose-600">{money(Number(reportData?.summary?.totalTax || 0), currency)}</p></div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">Live Preview ({previewRows.length})</div>
                            <button type="button" onClick={handleExport} disabled={isExporting || !reportData} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                                {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                {isExporting ? 'Generating...' : 'Export Excel'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
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
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No purchases found for selected filters.</td></tr>}
                                    {previewRows.map((line) => (
                                        <tr key={line.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{line.invoice?.purchaseNo || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600">{line.invoice?.createdAt ? formatCompanyDate(line.invoice.createdAt, company) : '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{line.invoice?.supplier?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{line.invoice?.branch?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">
                                                <div className="font-semibold text-slate-800">{line.product?.name || '-'}</div>
                                                <div className="text-xs text-slate-500">{line.product?.itemCode || '-'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">{line.unitCode || '-'}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{Number(line.qty || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(Number(line.lineTotal || 0), currency)}</td>
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
