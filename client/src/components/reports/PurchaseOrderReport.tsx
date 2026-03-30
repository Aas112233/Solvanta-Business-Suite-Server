import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Building2,
    CalendarRange,
    CheckSquare,
    Download,
    Filter,
    Layers,
    Loader2,
    ShoppingCart,
    Square,
    Truck,
    X,
} from 'lucide-react';
import api from '../../lib/api';
import type { ExcelColumn } from '../../lib/excelReport';
import { exportExcel } from '../../lib/fileExport';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'branch' | 'supplier' | 'date' | 'item' | 'options' | 'columns' | null;
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

function toISODate(date: Date) { return date.toISOString().slice(0, 10); }
function money(value: number, currency: string) { return `${currency} ${Number(value || 0).toLocaleString()}`; }
function defaultRange() {
    const now = new Date();
    return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
}

export default function PurchaseOrderReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const defaults = defaultRange();
    const [panel, setPanel] = useState<FilterPanel>(null);
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
        queryFn: () => api.get('/suppliers', { params: { limit: 1000 } }).then((res) => res.data.data as { id: string; name: string }[]),
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
    const dateLabel = `${dateFrom || 'Any'} to ${dateTo || 'Any'}`;
    const selectedProductName = master?.products?.find((p) => p.id === productId)?.name || 'All Items';
    const selectedGroupName = master?.groups?.find((g) => g.id === groupId)?.name || 'All Item Groups';
    const selectedCategoryName = master?.categories?.find((c) => c.id === categoryId)?.name || 'All Categories';
    const selectedBrandName = master?.brands?.find((b) => b.id === brandId)?.name || 'All Brands';

    const applyPreset = (preset: DatePreset) => {
        const now = new Date();
        const today = toISODate(now);
        setDatePreset(preset);
        if (preset === 'today') { setDateFrom(today); setDateTo(today); return; }
        if (preset === 'last7') { const start = new Date(now); start.setDate(start.getDate() - 6); setDateFrom(toISODate(start)); setDateTo(today); return; }
        if (preset === 'thisMonth') { setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth(), 1))); setDateTo(today); return; }
        if (preset === 'lastMonth') { setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1))); setDateTo(toISODate(new Date(now.getFullYear(), now.getMonth(), 0))); }
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
                lastPurchasedAt: { col: { key: 'lastPurchasedAt', header: 'Last Purchased At', width: 18 }, val: (r) => (r.lastPurchasedAt ? new Date(r.lastPurchasedAt).toLocaleDateString() : '') },
            };
            const selectedKeys = columnDefs.map((c) => c.key).filter((k) => selectedColumns[k]);
            const exportRows = rows.map((r) => Object.fromEntries(selectedKeys.map((k) => [k, excelMap[k].val(r)])));
            await exportExcel({
                fileName: `purchase-order-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
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
        <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><ShoppingCart size={18} /></div>
                        <div><h2 className="text-lg font-black text-slate-900">Purchase Order Report</h2><p className="text-sm text-slate-600">Auto-generated purchase suggestions from sold quantity versus current stock.</p></div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'supplier' ? null : 'supplier')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Truck size={15} /> {supplierName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'date' ? null : 'date')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarRange size={15} /> {dateLabel}</button>
                        <button type="button" onClick={() => setPanel(panel === 'options' ? null : 'options')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Layers size={15} /> {includeZeroRequired ? 'Include Zero: On' : 'Include Zero: Off'}</button>
                        <button type="button" onClick={() => setPanel(panel === 'item' ? null : 'item')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Items Filter {itemFiltersCount > 0 ? `(${itemFiltersCount})` : ''}</button>
                        <button type="button" onClick={() => setPanel(panel === 'columns' ? null : 'columns')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Columns {selectedColCount}</button>
                    </div>
                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p><button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button></div>
                            {panel === 'branch' && <AppDropdown value={branchId} onChange={setBranchId} options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} placeholder="Select warehouse" searchable />}
                            {panel === 'supplier' && <AppDropdown value={supplierId} onChange={setSupplierId} options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} placeholder="Select supplier" searchable />}
                            {panel === 'date' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{(['today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => <button key={preset} type="button" onClick={() => applyPreset(preset)} className={`rounded-lg border px-2 py-1.5 text-xs font-bold uppercase ${datePreset === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{preset}</button>)}</div>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <input type="date" value={dateFrom} onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                        <input type="date" value={dateTo} onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                    </div>
                                </div>
                            )}
                            {panel === 'item' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item</p><AppDropdown value={productId} onChange={setProductId} options={[{ value: '', label: 'All Items' }, ...productOptions]} placeholder="Select item" searchable /></div>
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Group</p><AppDropdown value={groupId} onChange={setGroupId} options={[{ value: '', label: 'All Item Groups' }, ...groupOptions]} placeholder="Select item group" searchable /></div>
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Category</p><AppDropdown value={categoryId} onChange={setCategoryId} options={[{ value: '', label: 'All Categories' }, ...categoryOptions]} placeholder="Select category" searchable /></div>
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Brand</p><AppDropdown value={brandId} onChange={setBrandId} options={[{ value: '', label: 'All Brands' }, ...brandOptions]} placeholder="Select brand" searchable /></div>
                                    </div>
                                    <div className="flex justify-end"><button type="button" onClick={() => { setProductId(''); setGroupId(''); setCategoryId(''); setBrandId(''); }} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Clear Item Filters</button></div>
                                </div>
                            )}
                            {panel === 'options' && <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={includeZeroRequired} onChange={(e) => setIncludeZeroRequired(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />Include items with zero required quantity</label>}
                            {panel === 'columns' && (
                                <div className="space-y-3">
                                    <div className="flex gap-2"><button type="button" onClick={() => setAllColumns(true)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Select all</button><button type="button" onClick={() => setAllColumns(false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Clear all</button></div>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{columnDefs.map((col) => { const active = selectedColumns[col.key]; return <button key={col.key} type="button" onClick={() => toggleColumn(col.key)} className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-xs font-semibold ${active ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{active ? <CheckSquare size={13} /> : <Square size={13} />}{col.label}</button>; })}</div>
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
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Analyzed Items</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.analyzedItems || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Report Items</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.reportItems || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Required Items</p><p className="mt-2 text-3xl font-black text-rose-600">{Number(reportData?.summary?.requiredItems || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Required Qty</p><p className="mt-2 text-3xl font-black text-blue-700">{Number(reportData?.summary?.totalRequiredQty || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Required Value (Inc VAT)</p><p className="mt-2 text-3xl font-black text-emerald-600">{money(Number(reportData?.summary?.totalRequiredValueIncVat || 0), currency)}</p></div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">Live Preview ({previewRows.length})</div>
                            <button type="button" onClick={handleExport} disabled={isExporting || !reportData} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{isExporting ? 'Generating...' : 'Export Excel'}</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3 text-left">Item Code</th><th className="px-4 py-3 text-left">Item Name</th><th className="px-4 py-3 text-left">Supplier</th><th className="px-4 py-3 text-left">Unit</th><th className="px-4 py-3 text-right">Sold</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Required</th><th className="px-4 py-3 text-right">Suggested PO</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No items found for selected filters.</td></tr>}
                                    {previewRows.map((row) => <tr key={row.productId} className="hover:bg-slate-50"><td className="px-4 py-3 font-semibold text-slate-800">{row.itemCode || '-'}</td><td className="px-4 py-3 text-slate-700">{row.itemName || '-'}</td><td className="px-4 py-3 text-slate-700">{row.supplierName || '-'}</td><td className="px-4 py-3 text-slate-700">{row.baseUnitCode || '-'} {row.baseUnitName ? `(${row.baseUnitName})` : ''}</td><td className="px-4 py-3 text-right text-slate-700">{Number(row.soldQty || 0).toLocaleString()}</td><td className="px-4 py-3 text-right text-slate-700">{Number(row.currentStock || 0).toLocaleString()}</td><td className="px-4 py-3 text-right font-semibold text-rose-700">{Number(row.requiredQty || 0).toLocaleString()}</td><td className="px-4 py-3 text-right font-semibold text-blue-700">{Number(row.suggestedOrderQty || 0).toLocaleString()}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">This report compares sales in {Number(reportData?.summary?.periodDays || 0)} day(s) against current stock to suggest purchase quantities.</div>
                </>
            )}
        </div>
    );
}
