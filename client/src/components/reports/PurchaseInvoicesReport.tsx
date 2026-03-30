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
    Receipt,
    Square,
    Truck,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'branch' | 'supplier' | 'date' | 'item' | 'columns' | null;
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

function toISODate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

export default function PurchaseInvoicesReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const [panel, setPanel] = useState<FilterPanel>(null);
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
        queryFn: () => api.get('/suppliers', { params: { limit: 1000 } }).then((r) => r.data.data as { id: string; name: string }[]),
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
        const today = toISODate(now);
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
            setDateFrom(toISODate(start));
            setDateTo(today);
            return;
        }
        if (preset === 'thisMonth') {
            setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
            setDateTo(today);
            return;
        }
        if (preset === 'lastMonth') {
            setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setDateTo(toISODate(new Date(now.getFullYear(), now.getMonth(), 0)));
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
                if (selectedColumns.date) base.date = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '';
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
                fileName: `purchase-invoices-${showItems ? 'with-items-' : ''}${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Purchase Invoices',
                title: showItems ? 'Purchase Invoices (Detailed Items) Report' : 'Purchase Invoices Report',
                filters: {
                    'Branch': branchName,
                    'Supplier': supplierName,
                    'Item': selectedProductName,
                    'Item Group': selectedGroupName,
                    'Item Category': selectedCategoryName,
                    'Brand': selectedBrandName,
                    'Date Range': dateFrom || dateTo ? `${dateFrom || 'Any'} to ${dateTo || 'Any'}` : 'All Time',
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
        <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><Receipt size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Purchase Invoices Report</h2>
                            <p className="text-sm text-slate-600">Chip-based filters inspired by modern productivity dashboards.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'supplier' ? null : 'supplier')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Truck size={15} /> {supplierName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'date' ? null : 'date')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarRange size={15} /> {dateFrom || dateTo ? `${dateFrom || 'Any'} to ${dateTo || 'Any'}` : 'All Time'}</button>
                        <button type="button" onClick={() => setPanel(panel === 'item' ? null : 'item')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Items Filter {itemFiltersCount > 0 ? `(${itemFiltersCount})` : ''}</button>
                        <button type="button" onClick={() => setPanel(panel === 'columns' ? null : 'columns')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Columns {selectedColCount}</button>
                        <button type="button" onClick={() => setShowItems((s) => !s)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${showItems ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><Layers size={15} /> Items {showItems ? 'On' : 'Off'}</button>
                    </div>

                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p>
                                <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button>
                            </div>
                            {panel === 'branch' && <AppDropdown value={localBranchId} onChange={setLocalBranchId} options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} placeholder="Select warehouse" searchable />}
                            {panel === 'supplier' && <AppDropdown value={localSupplierId} onChange={setLocalSupplierId} options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} placeholder="Select supplier" searchable />}
                            {panel === 'date' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                                        {(['all', 'today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
                                            <button key={preset} type="button" onClick={() => applyPreset(preset)} className={`rounded-lg border px-2 py-1.5 text-xs font-bold uppercase ${datePreset === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{preset}</button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <input type="date" value={dateFrom} onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                        <input type="date" value={dateTo} onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                    </div>
                                </div>
                            )}
                            {panel === 'item' && (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item</p>
                                        <AppDropdown
                                            value={localProductId}
                                            onChange={setLocalProductId}
                                            options={[{ value: '', label: 'All Items' }, ...productOptions]}
                                            placeholder="Select item"
                                            searchable
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Group</p>
                                        <AppDropdown
                                            value={localGroupId}
                                            onChange={setLocalGroupId}
                                            options={[{ value: '', label: 'All Item Groups' }, ...groupOptions]}
                                            placeholder="Select item group"
                                            searchable
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Category</p>
                                        <AppDropdown
                                            value={localCategoryId}
                                            onChange={setLocalCategoryId}
                                            options={[{ value: '', label: 'All Categories' }, ...categoryOptions]}
                                            placeholder="Select category"
                                            searchable
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Brand</p>
                                        <AppDropdown
                                            value={localBrandId}
                                            onChange={setLocalBrandId}
                                            options={[{ value: '', label: 'All Brands' }, ...brandOptions]}
                                            placeholder="Select brand"
                                            searchable
                                        />
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
                                        {exportCols.map((col) => {
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Invoices</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.count || 0)}</p></div>
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
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3 text-left">Purchase No</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Supplier</th><th className="px-4 py-3 text-left">Warehouse</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Tax</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No data for selected filters.</td></tr>}
                                    {previewRows.map((inv: any) => (
                                        <tr key={inv.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{inv.purchaseNo || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{inv.supplier?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{inv.branch?.name || '-'}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(Number(inv.grandTotal || 0), currency)}</td>
                                            <td className="px-4 py-3 text-right text-slate-700">{money(Number(inv.taxTotal || 0), currency)}</td>
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
