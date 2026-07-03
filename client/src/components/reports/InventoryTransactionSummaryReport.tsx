import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import type { ExcelColumn } from '../../lib/excelReport';
import { exportExcel } from '../../lib/fileExport';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

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
    const [branchId, setBranchId] = useState('');
    const [dateFrom, setDateFrom] = useState(defaults.from);
    const [dateTo, setDateTo] = useState(defaults.to);
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
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const isItemFiltersDirty =
        productId !== appliedItemFilters.productId
        || groupId !== appliedItemFilters.groupId
        || categoryId !== appliedItemFilters.categoryId
        || brandId !== appliedItemFilters.brandId;

    const applyItemFilters = () => {
        setAppliedItemFilters({
            productId,
            groupId,
            categoryId,
            brandId,
        });
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
                    'Date Range': `${dateFrom || 'Any'} to ${dateTo || 'Any'}`,
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
        <PageTemplate
            title="Inventory Transaction Summary"
            subtitle="Opening, closing, and all stock transaction quantities by selected filters."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Inventory Transaction Summary' },
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
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                            />
                            <span className="text-text-tertiary text-sm">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                            />
                        </div>
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
                            className="min-w-[150px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Categories' }, ...categoryOptions]}
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            placeholder="Category"
                            className="min-w-[150px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Brands' }, ...brandOptions]}
                            value={brandId}
                            onChange={(e) => setBrandId(e.target.value)}
                            placeholder="Brand"
                            className="min-w-[150px]"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={applyItemFilters}
                            disabled={!isItemFiltersDirty}
                        >
                            Apply Item Filters
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setProductId(''); setGroupId(''); setCategoryId(''); setBrandId(''); }}
                        >
                            Clear
                        </Button>
                    </div>
                    <span className="text-xs text-text-tertiary ml-auto">{activeFilterCount} active filters</span>
                </FilterBar>

                {/* KPI Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                    <KpiCard label="Rows" value={Number(reportData?.summary?.rowCount || 0).toLocaleString()} />
                    <KpiCard label="Opening Stock" value={qty(Number(reportData?.summary?.totalOpeningStock || 0))} />
                    <KpiCard label="Purchase" value={qty(Number(reportData?.summary?.totalPurchase || 0))} />
                    <KpiCard label="Sales" value={qty(Number(reportData?.summary?.totalSales || 0))} />
                    <KpiCard label="Transfers (In / Out)" value={`${qty(Number(reportData?.summary?.totalTransferIn || 0))} / ${qty(Number(reportData?.summary?.totalTransferOut || 0))}`} />
                    <KpiCard label="Closing Stock" value={qty(Number(reportData?.summary?.totalClosingStock || 0))} />
                </div>

                {/* Live Preview Table */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
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
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && (
                                    <tr>
                                        <td colSpan={13} className="px-4 py-8 text-center text-text-tertiary">No transactions found for selected filters.</td>
                                    </tr>
                                )}
                                {previewRows.map((row) => (
                                    <tr key={`${row.branchId}-${row.productId}`} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 text-text-secondary">{row.branchName || '-'}</td>
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.itemCode || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.itemName || '-'}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{qty(row.openingStock)}</td>
                                        <td className="px-4 py-3 text-right text-success">{qty(row.purchase)}</td>
                                        <td className="px-4 py-3 text-right text-danger">{qty(row.sales)}</td>
                                        <td className="px-4 py-3 text-right text-text-brand">{qty(row.transferIn)}</td>
                                        <td className="px-4 py-3 text-right text-amber-600">{qty(row.transferOut)}</td>
                                        <td className="px-4 py-3 text-right text-danger">{qty(row.stockDamaged)}</td>
                                        <td className="px-4 py-3 text-right text-amber-600">{qty(row.purchaseReturn)}</td>
                                        <td className="px-4 py-3 text-right text-success">{qty(row.salesReturn)}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{qty(row.internalUse)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{qty(row.closingStock)}</td>
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
