import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Building2,
    CalendarRange,
    Download,
    Filter,
    Loader2,
    ScrollText,
    X,
} from 'lucide-react';
import api from '../../lib/api';
import type { ExcelColumn } from '../../lib/excelReport';
import { exportExcel } from '../../lib/fileExport';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'branch' | 'date' | 'item' | null;
type DatePreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';

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

type InventoryTransactionSummaryRow = {
    branchId: string;
    branchName: string;
    branchCode?: string | null;
    productId: string;
    itemCode?: string | null;
    itemName?: string | null;
    itemGroup?: string | null;
    itemCategory?: string | null;
    itemBrand?: string | null;
    openingStock: number;
    closingStock: number;
    purchase: number;
    sales: number;
    transferIn: number;
    transferOut: number;
    stockDamaged: number;
    purchaseReturn: number;
    salesReturn: number;
    internalUse: number;
};

type InventoryTransactionSummaryResponse = {
    summary: {
        rowCount: number;
        totalOpeningStock: number;
        totalClosingStock: number;
        totalPurchase: number;
        totalSales: number;
        totalTransferIn: number;
        totalTransferOut: number;
        totalStockDamaged: number;
        totalPurchaseReturn: number;
        totalSalesReturn: number;
        totalInternalUse: number;
        periodFrom: string;
        periodTo: string;
    };
    items: InventoryTransactionSummaryRow[];
};

function toISODate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function defaultRange() {
    const now = new Date();
    return {
        from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toISODate(now),
    };
}

function qty(value: number) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default function InventoryTransactionSummaryReport() {
    const defaults = defaultRange();
    const [panel, setPanel] = useState<FilterPanel>(null);
    const [branchId, setBranchId] = useState('');
    const [dateFrom, setDateFrom] = useState(defaults.from);
    const [dateTo, setDateTo] = useState(defaults.to);
    const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
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

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-inventory-transaction-summary'],
        queryFn: () => api.get('/branches').then((res) => res.data.data as { id: string; name: string }[]),
    });

    const { data: master } = useQuery({
        queryKey: ['inventory-transaction-summary-filter-master-data'],
        queryFn: () => api.get('/reports/purchase-invoices-filter-options').then((r) => r.data.data as ReportFilterMasterData),
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
    const productsForGroup = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!categoryId || p.categoryId === categoryId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, productId, categoryId, brandId]
    );
    const productsForCategory = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!brandId || p.brandId === brandId)
            ),
        [allProducts, productId, groupId, brandId]
    );
    const productsForBrand = useMemo(
        () =>
            allProducts.filter((p) =>
                (!productId || p.id === productId)
                && (!groupId || p.itemGroupId === groupId)
                && (!categoryId || p.categoryId === categoryId)
            ),
        [allProducts, productId, groupId, categoryId]
    );

    const productOptions = useMemo(
        () =>
            productsForItem.map((p) => ({
                value: p.id,
                label: `${p.itemCode || '-'} - ${p.name || 'Unnamed Item'}`,
            })),
        [productsForItem]
    );
    const groupOptions = useMemo(
        () => (master?.groups || [])
            .filter((g) => new Set(productsForGroup.map((p) => p.itemGroupId).filter(Boolean)).has(g.id))
            .map((g) => ({ value: g.id, label: g.name })),
        [master, productsForGroup]
    );
    const categoryOptions = useMemo(
        () => (master?.categories || [])
            .filter((c) => new Set(productsForCategory.map((p) => p.categoryId).filter(Boolean)).has(c.id))
            .map((c) => ({ value: c.id, label: c.name })),
        [master, productsForCategory]
    );
    const brandOptions = useMemo(
        () => (master?.brands || [])
            .filter((b) => new Set(productsForBrand.map((p) => p.brandId).filter(Boolean)).has(b.id))
            .map((b) => ({ value: b.id, label: b.name })),
        [master, productsForBrand]
    );

    useEffect(() => { if (productId && !productOptions.some((o) => o.value === productId)) setProductId(''); }, [productId, productOptions]);
    useEffect(() => { if (groupId && !groupOptions.some((o) => o.value === groupId)) setGroupId(''); }, [groupId, groupOptions]);
    useEffect(() => { if (categoryId && !categoryOptions.some((o) => o.value === categoryId)) setCategoryId(''); }, [categoryId, categoryOptions]);
    useEffect(() => { if (brandId && !brandOptions.some((o) => o.value === brandId)) setBrandId(''); }, [brandId, brandOptions]);

    const { data: reportData, isLoading } = useQuery({
        queryKey: [
            'report-inventory-transaction-summary',
            branchId,
            dateFrom,
            dateTo,
            appliedItemFilters.productId,
            appliedItemFilters.groupId,
            appliedItemFilters.categoryId,
            appliedItemFilters.brandId,
        ],
        queryFn: () =>
            api.get('/reports/inventory-transaction-summary', {
                params: {
                    branchId: branchId || undefined,
                    dateFrom: dateFrom || undefined,
                    dateTo: dateTo || undefined,
                    productId: appliedItemFilters.productId || undefined,
                    itemGroupId: appliedItemFilters.groupId || undefined,
                    categoryId: appliedItemFilters.categoryId || undefined,
                    brandId: appliedItemFilters.brandId || undefined,
                },
            }).then((res) => res.data.data as InventoryTransactionSummaryResponse),
        enabled: Boolean(dateFrom && dateTo),
    });

    const rows = reportData?.items || [];
    const previewRows = rows.slice(0, 20);
    const activeFilterCount = [
        branchId,
        dateFrom || dateTo,
        appliedItemFilters.productId,
        appliedItemFilters.groupId,
        appliedItemFilters.categoryId,
        appliedItemFilters.brandId,
    ].filter(Boolean).length;
    const itemFiltersCount = [
        appliedItemFilters.productId,
        appliedItemFilters.groupId,
        appliedItemFilters.categoryId,
        appliedItemFilters.brandId,
    ].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const dateLabel = `${dateFrom || 'Any'} to ${dateTo || 'Any'}`;
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

    const applyPreset = (preset: DatePreset) => {
        const now = new Date();
        const today = toISODate(now);
        setDatePreset(preset);
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
        }
    };

    const handleExport = async () => {
        if (!reportData) return;
        setIsExporting(true);
        try {
            const columns: ExcelColumn[] = [
                { key: 'warehouse', header: 'Warehouse', width: 24 },
                { key: 'itemCode', header: 'Item Code', width: 16 },
                { key: 'itemName', header: 'Item Name', width: 30 },
                { key: 'itemGroup', header: 'Item Group', width: 18 },
                { key: 'itemCategory', header: 'Item Category', width: 18 },
                { key: 'itemBrand', header: 'Brand', width: 18 },
                { key: 'openingStock', header: 'Opening Stock', type: 'number', width: 16 },
                { key: 'purchase', header: 'Purchase', type: 'number', width: 14 },
                { key: 'sales', header: 'Sales', type: 'number', width: 14 },
                { key: 'transferIn', header: 'Transfers In', type: 'number', width: 14 },
                { key: 'transferOut', header: 'Transfers Out', type: 'number', width: 14 },
                { key: 'stockDamaged', header: 'Stock Damaged', type: 'number', width: 14 },
                { key: 'purchaseReturn', header: 'Purchase Return', type: 'number', width: 16 },
                { key: 'salesReturn', header: 'Sales Return', type: 'number', width: 14 },
                { key: 'internalUse', header: 'Internal Use', type: 'number', width: 14 },
                { key: 'closingStock', header: 'Closing Stock', type: 'number', width: 16 },
            ];

            const exportRows = rows.map((row) => ({
                warehouse: row.branchName || '',
                itemCode: row.itemCode || '',
                itemName: row.itemName || '',
                itemGroup: row.itemGroup || '',
                itemCategory: row.itemCategory || '',
                itemBrand: row.itemBrand || '',
                openingStock: Number(row.openingStock || 0),
                purchase: Number(row.purchase || 0),
                sales: Number(row.sales || 0),
                transferIn: Number(row.transferIn || 0),
                transferOut: Number(row.transferOut || 0),
                stockDamaged: Number(row.stockDamaged || 0),
                purchaseReturn: Number(row.purchaseReturn || 0),
                salesReturn: Number(row.salesReturn || 0),
                internalUse: Number(row.internalUse || 0),
                closingStock: Number(row.closingStock || 0),
            }));

            await exportExcel({
                fileName: `inventory-transaction-summary-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Inventory Transactions',
                title: 'Inventory Transaction Summary',
                filters: {
                    'Branch': branchName,
                    'Date Range': dateLabel,
                    'Active Filters': String(activeFilterCount),
                    'Rows': String(Number(reportData.summary?.rowCount || 0)),
                },
                columns,
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
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><ScrollText size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Inventory Transaction Summary</h2>
                            <p className="text-sm text-slate-600">Opening, closing, and all stock transaction quantities by selected filters.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'date' ? null : 'date')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarRange size={15} /> {dateLabel}</button>
                        <button type="button" onClick={openItemPanel} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Items Filter {itemFiltersCount > 0 ? `(${itemFiltersCount})` : ''}</button>
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

                            {panel === 'date' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                                        {(['today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => applyPreset(preset)}
                                                className={`rounded-lg border px-2 py-1.5 text-xs font-bold uppercase ${datePreset === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                                            >
                                                {preset}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <input type="date" value={dateFrom} onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                        <input type="date" value={dateTo} onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                    </div>
                                </div>
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
                                            onClick={() => { setProductId(''); setGroupId(''); setCategoryId(''); setBrandId(''); }}
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
                        </div>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-10">
                    <Loader2 size={24} className="animate-spin text-blue-600" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Rows</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.rowCount || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Opening Stock</p><p className="mt-2 text-3xl font-black text-slate-900">{qty(Number(reportData?.summary?.totalOpeningStock || 0))}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Purchase</p><p className="mt-2 text-3xl font-black text-emerald-600">{qty(Number(reportData?.summary?.totalPurchase || 0))}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sales</p><p className="mt-2 text-3xl font-black text-rose-600">{qty(Number(reportData?.summary?.totalSales || 0))}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Transfers (In / Out)</p><p className="mt-2 text-3xl font-black text-blue-700">{qty(Number(reportData?.summary?.totalTransferIn || 0))} / {qty(Number(reportData?.summary?.totalTransferOut || 0))}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Closing Stock</p><p className="mt-2 text-3xl font-black text-slate-900">{qty(Number(reportData?.summary?.totalClosingStock || 0))}</p></div>
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
                                        <th className="px-4 py-3 text-left">Warehouse</th>
                                        <th className="px-4 py-3 text-left">Item Code</th>
                                        <th className="px-4 py-3 text-left">Item Name</th>
                                        <th className="px-4 py-3 text-right">Opening</th>
                                        <th className="px-4 py-3 text-right">Purchase</th>
                                        <th className="px-4 py-3 text-right">Sales</th>
                                        <th className="px-4 py-3 text-right">Transfer In</th>
                                        <th className="px-4 py-3 text-right">Transfer Out</th>
                                        <th className="px-4 py-3 text-right">Damaged</th>
                                        <th className="px-4 py-3 text-right">Purchase Return</th>
                                        <th className="px-4 py-3 text-right">Sales Return</th>
                                        <th className="px-4 py-3 text-right">Internal Use</th>
                                        <th className="px-4 py-3 text-right">Closing</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && (
                                        <tr>
                                            <td colSpan={13} className="px-4 py-8 text-center text-slate-500">No transactions found for selected filters.</td>
                                        </tr>
                                    )}
                                    {previewRows.map((row) => (
                                        <tr key={`${row.branchId}-${row.productId}`} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-slate-700">{row.branchName || '-'}</td>
                                            <td className="px-4 py-3 font-semibold text-slate-800">{row.itemCode || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.itemName || '-'}</td>
                                            <td className="px-4 py-3 text-right text-slate-700">{qty(row.openingStock)}</td>
                                            <td className="px-4 py-3 text-right text-emerald-700">{qty(row.purchase)}</td>
                                            <td className="px-4 py-3 text-right text-rose-700">{qty(row.sales)}</td>
                                            <td className="px-4 py-3 text-right text-blue-700">{qty(row.transferIn)}</td>
                                            <td className="px-4 py-3 text-right text-amber-700">{qty(row.transferOut)}</td>
                                            <td className="px-4 py-3 text-right text-rose-700">{qty(row.stockDamaged)}</td>
                                            <td className="px-4 py-3 text-right text-amber-700">{qty(row.purchaseReturn)}</td>
                                            <td className="px-4 py-3 text-right text-emerald-700">{qty(row.salesReturn)}</td>
                                            <td className="px-4 py-3 text-right text-slate-700">{qty(row.internalUse)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{qty(row.closingStock)}</td>
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
