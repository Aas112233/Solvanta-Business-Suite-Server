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
} from 'lucide-react';
import api from '../../lib/api';
import type { ExcelColumn } from '../../lib/excelReport';
import { exportExcel } from '../../lib/fileExport';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

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
        case 'PURCHASE_RECEIPT': return <ShoppingCart size={14} className="text-success" />;
        case 'POS_SALE': return <ArrowUpRight size={14} className="text-danger" />;
        case 'TRANSFER_IN': return <ArrowDownLeft size={14} className="text-brand" />;
        case 'TRANSFER_OUT': return <ArrowUpRight size={14} className="text-warning" />;
        case 'ADJUSTMENT': return <RotateCcw size={14} className="text-text-brand" />;
        default: return <ArrowLeftRight size={14} className="text-text-tertiary" />;
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

    const [branchId, setBranchId] = useState(initialBranchId);
    const [dateFrom, setDateFrom] = useState(initialDateFrom);
    const [dateTo, setDateTo] = useState(initialDateTo);
    const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
    const [productId, setProductId] = useState(initialProductId);
    const [groupId, setGroupId] = useState(initialGroupId);
    const [categoryId, setCategoryId] = useState(initialCategoryId);
    const [brandId, setBrandId] = useState(initialBrandId);
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
        productId,
        groupId,
        categoryId,
        brandId,
        dateFrom || dateTo,
    ].filter(Boolean).length;
    const itemFiltersCount = [productId, groupId, categoryId, brandId].filter(Boolean).length;

    const { data: rows = [], isLoading } = useQuery({
        queryKey: [
            'report-running-stock-ledger',
            branchId,
            movementType,
            productId,
            groupId,
            categoryId,
            brandId,
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
                        productId: productId || undefined,
                        itemGroupId: groupId || undefined,
                        categoryId: categoryId || undefined,
                        brandId: brandId || undefined,
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

    const clearItemFilters = () => {
        setProductId('');
        setGroupId('');
        setCategoryId('');
        setBrandId('');
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
        <PageTemplate
            title="Running Stock Ledger"
            subtitle="Chronological stock movement log with running balances and references."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Running Stock Ledger' },
            ]}
            action={
                <Button
                    variant="primary"
                    size="sm"
                    icon={isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    onClick={handleExport}
                    disabled={isExporting || rows.length === 0}
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
                    <div className="flex flex-wrap items-center gap-3 w-full">
                        <div className="flex items-center gap-1">
                            {(['today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
                                        datePreset === preset
                                            ? 'border-brand bg-brand text-white'
                                            : 'border-border bg-background-card text-text-secondary hover:bg-background-subtle'
                                    }`}
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
                        {!isDateRangeValid && (
                            <span className="text-xs font-semibold text-danger">DateFrom cannot be greater than DateTo.</span>
                        )}
                        <Select
                            options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                            value={branchId}
                            onChange={(e) => setBranchId(e.target.value)}
                            placeholder="Warehouse"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={movementTypeOptions}
                            value={movementType}
                            onChange={(e) => setMovementType(e.target.value)}
                            placeholder="Movement Type"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Items' }, ...productOptions]}
                            value={productId}
                            onChange={(e) => setProductId(e.target.value)}
                            placeholder="Item"
                            className="min-w-[200px]"
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
                        {itemFiltersCount > 0 && (
                            <Button size="sm" variant="ghost" onClick={clearItemFilters}>
                                Clear Items
                            </Button>
                        )}
                        <span className="text-xs text-text-tertiary ml-auto">{activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}</span>
                    </div>
                </FilterBar>

                {/* KPI Summary */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                    <KpiCard label="Movements" value={Number(summary.totalMovements || 0).toLocaleString()} />
                    <KpiCard label="Stock In" value={Number(summary.totalIn || 0).toLocaleString()} />
                    <KpiCard label="Stock Out" value={Number(summary.totalOut || 0).toLocaleString()} />
                    <KpiCard label="Net Change" value={`${summary.netChange >= 0 ? '+' : ''}${Number(summary.netChange || 0).toLocaleString()}`} />
                    <KpiCard label="Unique Items" value={Number(summary.uniqueProducts || 0).toLocaleString()} />
                    <KpiCard label="References" value={Number(summary.uniqueReferences || 0).toLocaleString()} />
                </div>

                {/* Table */}
                <Section variant="card" headerBorder>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="text-sm font-semibold text-text-primary">Live Preview ({previewRows.length})</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
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
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-text-tertiary">No movement rows found for selected filters.</td>
                                    </tr>
                                )}
                                {previewRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 text-text-secondary">
                                            <div className="font-semibold text-text-primary">{new Date(row.createdAt).toLocaleDateString()}</div>
                                            <div className="text-xs text-text-tertiary">{new Date(row.createdAt).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 text-text-secondary">
                                                {getMovementIcon(row.type)}
                                                <span>{movementTypeLabelMap.get(row.type) || row.type}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary">{row.branch?.name || '-'}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-text-primary">{row.product?.name || '-'}</div>
                                            <div className="text-xs text-text-tertiary">{row.product?.itemCode || '-'}</div>
                                        </td>
                                        <td className={`px-4 py-3 text-right font-semibold ${Number(row.qty || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {Number(row.qty || 0) >= 0 ? '+' : ''}{Number(row.qty || 0).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">
                                            {Number(row.runningQty || 0).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary">
                                            <div>{row.referenceType || '-'}</div>
                                            <div className="text-xs text-text-tertiary">{row.referenceId || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary">{row.createdBy?.name || '-'}</td>
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
