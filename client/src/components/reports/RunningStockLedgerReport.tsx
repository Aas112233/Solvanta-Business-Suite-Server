import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
    ArrowDownLeft,
    ArrowLeftRight,
    ArrowUpRight,
    Building2,
    CalendarRange,
    Download,
    Filter,
    History,
    Loader2,
    RotateCcw,
    ShoppingCart,
    X,
} from 'lucide-react';
import api from '../../lib/api';
import type { ExcelColumn } from '../../lib/excelReport';
import { exportExcel } from '../../lib/fileExport';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'date' | 'branch' | 'item' | 'type' | null;
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

type MovementRow = {
    id: string;
    createdAt: string;
    type: string;
    qty: number;
    runningQty: number;
    referenceType?: string | null;
    referenceId?: string | null;
    product?: {
        id: string;
        itemCode?: string | null;
        name?: string | null;
    } | null;
    branch?: {
        id: string;
        name?: string | null;
    } | null;
    createdBy?: {
        name?: string | null;
    } | null;
};

function toISODate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function defaultRange() {
    const now = new Date();
    return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
}

const movementTypeOptions = [
    { value: '', label: 'All Movement Types' },
    { value: 'PURCHASE_RECEIPT', label: 'Purchase Receipt' },
    { value: 'POS_SALE', label: 'Sales / POS' },
    { value: 'TRANSFER_IN', label: 'Transfer In' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out' },
    { value: 'ADJUSTMENT', label: 'Adjustment' },
    { value: 'DAMAGE', label: 'Damage' },
    { value: 'RETURN', label: 'Return' },
];

const movementTypeLabelMap = new Map<string, string>(movementTypeOptions.map((x) => [x.value, x.label]));

function getMovementIcon(type: string) {
    switch (type) {
        case 'PURCHASE_RECEIPT': return <ShoppingCart size={14} className="text-emerald-600" />;
        case 'POS_SALE': return <ArrowUpRight size={14} className="text-rose-600" />;
        case 'TRANSFER_IN': return <ArrowDownLeft size={14} className="text-blue-600" />;
        case 'TRANSFER_OUT': return <ArrowUpRight size={14} className="text-amber-600" />;
        case 'ADJUSTMENT': return <RotateCcw size={14} className="text-violet-600" />;
        default: return <ArrowLeftRight size={14} className="text-slate-500" />;
    }
}

export default function RunningStockLedgerReport() {
    const defaults = defaultRange();
    const [searchParams] = useSearchParams();
    const initialBranchId = searchParams.get('branchId') || '';
    const initialDateFrom = searchParams.get('dateFrom') || defaults.from;
    const initialDateTo = searchParams.get('dateTo') || defaults.to;
    const initialType = searchParams.get('type') || '';
    const initialProductId = searchParams.get('productId') || '';
    const initialGroupId = searchParams.get('groupId') || '';
    const initialCategoryId = searchParams.get('categoryId') || '';
    const initialBrandId = searchParams.get('brandId') || '';

    const [panel, setPanel] = useState<FilterPanel>(null);
    const [branchId, setBranchId] = useState(initialBranchId);
    const [dateFrom, setDateFrom] = useState(initialDateFrom);
    const [dateTo, setDateTo] = useState(initialDateTo);
    const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
    const [productId, setProductId] = useState(initialProductId);
    const [groupId, setGroupId] = useState(initialGroupId);
    const [categoryId, setCategoryId] = useState(initialCategoryId);
    const [brandId, setBrandId] = useState(initialBrandId);
    const [appliedItemFilters, setAppliedItemFilters] = useState({
        productId: initialProductId,
        groupId: initialGroupId,
        categoryId: initialCategoryId,
        brandId: initialBrandId,
    });
    const [movementType, setMovementType] = useState(initialType);
    const [isExporting, setIsExporting] = useState(false);

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-running-stock-ledger'],
        queryFn: () => api.get('/branches').then((res) => res.data.data as { id: string; name: string }[]),
    });

    const { data: master } = useQuery({
        queryKey: ['running-stock-ledger-filter-master-data'],
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
        () => productsForItem.map((p) => ({ value: p.id, label: `${p.itemCode || '-'} - ${p.name || 'Unnamed Item'}` })),
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

    const isDateRangeValid = !dateFrom || !dateTo || dateFrom <= dateTo;
    const selectedTypeLabel = movementTypeLabelMap.get(movementType) || 'All Movement Types';
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const dateLabel = `${dateFrom || 'Any'} to ${dateTo || 'Any'}`;
    const activeFilterCount = [
        branchId,
        movementType,
        appliedItemFilters.productId,
        appliedItemFilters.groupId,
        appliedItemFilters.categoryId,
        appliedItemFilters.brandId,
        dateFrom || dateTo,
    ].filter(Boolean).length;
    const itemFiltersCount = [
        appliedItemFilters.productId,
        appliedItemFilters.groupId,
        appliedItemFilters.categoryId,
        appliedItemFilters.brandId,
    ].filter(Boolean).length;
    const isItemFiltersDirty =
        productId !== appliedItemFilters.productId
        || groupId !== appliedItemFilters.groupId
        || categoryId !== appliedItemFilters.categoryId
        || brandId !== appliedItemFilters.brandId;

    const { data: rows = [], isLoading } = useQuery({
        queryKey: [
            'report-running-stock-ledger',
            branchId,
            movementType,
            appliedItemFilters.productId,
            appliedItemFilters.groupId,
            appliedItemFilters.categoryId,
            appliedItemFilters.brandId,
            dateFrom,
            dateTo,
        ],
        queryFn: async () => {
            const allRows: MovementRow[] = [];
            const pageSize = 500;
            let page = 1;
            let totalPages = 1;

            do {
                const res = await api.get('/inventory/movements', {
                    params: {
                        page,
                        limit: pageSize,
                        branchId: branchId || undefined,
                        type: movementType || undefined,
                        productId: appliedItemFilters.productId || undefined,
                        itemGroupId: appliedItemFilters.groupId || undefined,
                        categoryId: appliedItemFilters.categoryId || undefined,
                        brandId: appliedItemFilters.brandId || undefined,
                        dateFrom: dateFrom || undefined,
                        dateTo: dateTo || undefined,
                    },
                });
                const chunk = (res.data?.data || []) as MovementRow[];
                allRows.push(...chunk);
                totalPages = Number(res.data?.meta?.pagination?.totalPages || 1);
                page += 1;
            } while (page <= totalPages);

            return allRows;
        },
        enabled: isDateRangeValid,
    });

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

    const previewRows = rows.slice(0, 20);
    const summary = useMemo(() => {
        let totalIn = 0;
        let totalOut = 0;
        const productSet = new Set<string>();
        const referenceSet = new Set<string>();

        rows.forEach((row) => {
            const q = Number(row.qty || 0);
            if (q > 0) totalIn += q;
            if (q < 0) totalOut += Math.abs(q);
            if (row.product?.id) productSet.add(row.product.id);
            if (row.referenceId) referenceSet.add(String(row.referenceId));
        });

        return {
            totalMovements: rows.length,
            totalIn,
            totalOut,
            netChange: totalIn - totalOut,
            uniqueProducts: productSet.size,
            uniqueReferences: referenceSet.size,
        };
    }, [rows]);

    const applyPreset = (preset: DatePreset) => {
        const now = new Date();
        const today = toISODate(now);
        setDatePreset(preset);
        if (preset === 'today') { setDateFrom(today); setDateTo(today); return; }
        if (preset === 'last7') { const start = new Date(now); start.setDate(start.getDate() - 6); setDateFrom(toISODate(start)); setDateTo(today); return; }
        if (preset === 'thisMonth') { setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth(), 1))); setDateTo(today); return; }
        if (preset === 'lastMonth') {
            setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setDateTo(toISODate(new Date(now.getFullYear(), now.getMonth(), 0)));
        }
    };

    const handleExport = async () => {
        if (!rows.length) return;
        setIsExporting(true);
        try {
            const columns: ExcelColumn[] = [
                { key: 'date', header: 'Date', type: 'datetime', split: true, width: 20 },
                { key: 'movementType', header: 'Movement Type', width: 18 },
                { key: 'warehouse', header: 'Warehouse', width: 20 },
                { key: 'itemCode', header: 'Item Code', width: 16 },
                { key: 'itemName', header: 'Item Name', width: 30 },
                { key: 'qtyChange', header: 'Qty Change', type: 'number', width: 14 },
                { key: 'runningQty', header: 'Running Qty', type: 'number', width: 14 },
                { key: 'referenceType', header: 'Reference Type', width: 18 },
                { key: 'referenceId', header: 'Reference ID', width: 24 },
                { key: 'operator', header: 'Operator', width: 18 },
            ];

            const exportRows = rows.map((row) => ({
                date: row.createdAt,
                movementType: movementTypeLabelMap.get(row.type) || row.type,
                warehouse: row.branch?.name || '',
                itemCode: row.product?.itemCode || '',
                itemName: row.product?.name || '',
                qtyChange: Number(row.qty || 0),
                runningQty: Number(row.runningQty || 0),
                referenceType: row.referenceType || '',
                referenceId: row.referenceId || '',
                operator: row.createdBy?.name || '',
            }));

            await exportExcel({
                fileName: `running-stock-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Running Stock Ledger',
                title: 'Running Stock Ledger',
                filters: {
                    'Branch': branchName,
                    'Date Range': dateLabel,
                    'Movement Type': selectedTypeLabel,
                    'Active Filters': String(activeFilterCount),
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
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><History size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Running Stock Ledger</h2>
                            <p className="text-sm text-slate-600">Chronological stock movement log with running balances and references.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'date' ? null : 'date')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarRange size={15} /> {dateLabel}</button>
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'type' ? null : 'type')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> {selectedTypeLabel}</button>
                        <button type="button" onClick={openItemPanel} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Items Filter {itemFiltersCount > 0 ? `(${itemFiltersCount})` : ''}</button>
                    </div>

                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p>
                                <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button>
                            </div>

                            {panel === 'date' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                                        {(['today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
                                            <button key={preset} type="button" onClick={() => applyPreset(preset)} className={`rounded-lg border px-2 py-1.5 text-xs font-bold uppercase ${datePreset === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{preset}</button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <input type="date" value={dateFrom} onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                        <input type="date" value={dateTo} onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                    </div>
                                    {!isDateRangeValid && <p className="text-xs font-semibold text-rose-600">`dateFrom` cannot be greater than `dateTo`.</p>}
                                </div>
                            )}

                            {panel === 'branch' && (
                                <AppDropdown
                                    value={branchId}
                                    onChange={setBranchId}
                                    options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                                    placeholder="Select warehouse"
                                    searchable
                                />
                            )}

                            {panel === 'type' && (
                                <AppDropdown
                                    value={movementType}
                                    onChange={setMovementType}
                                    options={movementTypeOptions}
                                    placeholder="Select movement type"
                                />
                            )}

                            {panel === 'item' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item</p><AppDropdown value={productId} onChange={setProductId} options={[{ value: '', label: 'All Items' }, ...productOptions]} placeholder="Select item" searchable /></div>
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Group</p><AppDropdown value={groupId} onChange={setGroupId} options={[{ value: '', label: 'All Item Groups' }, ...groupOptions]} placeholder="Select item group" searchable /></div>
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Item Category</p><AppDropdown value={categoryId} onChange={setCategoryId} options={[{ value: '', label: 'All Categories' }, ...categoryOptions]} placeholder="Select category" searchable /></div>
                                        <div className="space-y-1"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Brand</p><AppDropdown value={brandId} onChange={setBrandId} options={[{ value: '', label: 'All Brands' }, ...brandOptions]} placeholder="Select brand" searchable /></div>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <button type="button" onClick={() => { setProductId(''); setGroupId(''); setCategoryId(''); setBrandId(''); }} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Clear Item Filters</button>
                                        <button type="button" onClick={applyItemFilters} disabled={!isItemFiltersDirty} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Apply Item Filters</button>
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Movements</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(summary.totalMovements || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock In</p><p className="mt-2 text-3xl font-black text-emerald-600">{Number(summary.totalIn || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Out</p><p className="mt-2 text-3xl font-black text-rose-600">{Number(summary.totalOut || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net Change</p><p className={`mt-2 text-3xl font-black ${summary.netChange >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{summary.netChange >= 0 ? '+' : ''}{Number(summary.netChange || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Unique Items</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(summary.uniqueProducts || 0).toLocaleString()}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">References</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(summary.uniqueReferences || 0).toLocaleString()}</p></div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">Live Preview ({previewRows.length})</div>
                            <button type="button" onClick={handleExport} disabled={isExporting || rows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                                {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                {isExporting ? 'Generating...' : 'Export Excel'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Type</th>
                                        <th className="px-4 py-3 text-left">Warehouse</th>
                                        <th className="px-4 py-3 text-left">Item</th>
                                        <th className="px-4 py-3 text-right">Qty Change</th>
                                        <th className="px-4 py-3 text-right">Running Qty</th>
                                        <th className="px-4 py-3 text-left">Reference</th>
                                        <th className="px-4 py-3 text-left">Operator</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No movement rows found for selected filters.</td>
                                        </tr>
                                    )}
                                    {previewRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-slate-700">
                                                <div className="font-semibold">{new Date(row.createdAt).toLocaleDateString()}</div>
                                                <div className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleTimeString()}</div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">
                                                <div className="flex items-center gap-2">
                                                    {getMovementIcon(row.type)}
                                                    <span>{movementTypeLabelMap.get(row.type) || row.type}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">{row.branch?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">
                                                <div className="font-semibold">{row.product?.name || '-'}</div>
                                                <div className="text-xs text-slate-500">{row.product?.itemCode || '-'}</div>
                                            </td>
                                            <td className={`px-4 py-3 text-right font-semibold ${Number(row.qty || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{Number(row.qty || 0) >= 0 ? '+' : ''}{Number(row.qty || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{Number(row.runningQty || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-slate-700">
                                                <div>{row.referenceType || '-'}</div>
                                                <div className="text-xs text-slate-500">{row.referenceId || '-'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700">{row.createdBy?.name || '-'}</td>
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
