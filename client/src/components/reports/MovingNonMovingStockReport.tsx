import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Loader2, Download } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_CURRENCY } from '../../lib/constants';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

export default function MovingNonMovingStockReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

    const [localBranchId, setLocalBranchId] = useState<string>('');
    const [itemQuery, setItemQuery] = useState<string>('');
    const [days, setDays] = useState<number>(30);
    const [statusFilter, setStatusFilter] = useState<'all' | 'moving' | 'non-moving'>('all');

    const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({
        itemCode: true,
        itemName: true,
        warehouse: true,
        status: true,
        recentMovementQty: true,
        qtyOnHand: true,
        avgCost: true,
        valuation: true,
    });

    const [isExporting, setIsExporting] = useState(false);

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-moving'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    const { data: stockData, isLoading: stockLoading } = useQuery({
        queryKey: ['report-moving-stock', localBranchId, days],
        queryFn: () => api.get('/reports/moving-stock', { params: { branchId: localBranchId || undefined, days } }).then((r) => r.data.data),
        enabled: days > 0
    });

    const toggleColumn = (key: string) => {
        setSelectedColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleExport = async () => {
        if (!stockData) return;
        setIsExporting(true);
        try {
            let combinedStocks: any[] = [];

            if (statusFilter === 'all' || statusFilter === 'moving') {
                const movingWithStatus = (stockData.moving || []).map((s: any) => ({ ...s, movingStatus: 'Moving' }));
                combinedStocks.push(...movingWithStatus);
            }
            if (statusFilter === 'all' || statusFilter === 'non-moving') {
                const nonMovingWithStatus = (stockData.nonMoving || []).map((s: any) => ({ ...s, movingStatus: 'Non-Moving' }));
                combinedStocks.push(...nonMovingWithStatus);
            }

            if (selectedColumns.itemName && itemQuery) {
                combinedStocks = combinedStocks.filter((s: any) =>
                    s.product?.name?.toLowerCase().includes(itemQuery.toLowerCase()) ||
                    s.product?.itemCode?.toLowerCase().includes(itemQuery.toLowerCase())
                );
            }

            const excelCols: ExcelColumn[] = [];
            if (selectedColumns.itemCode) excelCols.push({ key: 'itemCode', header: 'SKU/Code', width: 18 });
            if (selectedColumns.itemName) excelCols.push({ key: 'itemName', header: 'Product Description', width: 35 });
            if (selectedColumns.warehouse) excelCols.push({ key: 'warehouse', header: 'Warehouse', width: 22 });
            if (selectedColumns.status) excelCols.push({ key: 'status', header: 'Status', width: 15 });
            if (selectedColumns.recentMovementQty) excelCols.push({ key: 'recentMovementQty', header: `Outbound Qty (Last ${days} days)`, type: 'number', width: 22 });
            if (selectedColumns.qtyOnHand) excelCols.push({ key: 'qtyOnHand', header: 'Current Stock Qty', type: 'number', width: 20 });
            if (selectedColumns.avgCost) excelCols.push({ key: 'avgCost', header: 'Unit Cost', type: 'currency', width: 14 });
            if (selectedColumns.valuation) excelCols.push({ key: 'valuation', header: 'Current Stock Value', type: 'currency', width: 22 });

            const rows = combinedStocks.map((s: any) => {
                const row: any = {};
                if (selectedColumns.itemCode) row.itemCode = s.product?.itemCode || '';
                if (selectedColumns.itemName) row.itemName = s.product?.name || '';
                if (selectedColumns.warehouse) row.warehouse = s.branch?.name || '';
                if (selectedColumns.status) row.status = s.movingStatus;
                if (selectedColumns.recentMovementQty) row.recentMovementQty = Number(s.recentOutboundQty || 0);
                if (selectedColumns.qtyOnHand) row.qtyOnHand = Number(s.qtyOnHand || 0);
                if (selectedColumns.avgCost) row.avgCost = Number(s.avgCost || 0);
                if (selectedColumns.valuation) row.valuation = Number(s.valuation || 0);
                return row;
            });

            await exportExcel({
                fileName: `moving-non-moving-stock-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Movement Report',
                title: `Moving & Non-Moving Stock Report (Last ${days} days)`,
                filters: {
                    'Selected Branch': selectedColumns.warehouse ? (branches?.find((b: any) => b.id === localBranchId)?.name || 'All Warehouses') : 'N/A',
                    'Time Period': `Last ${days} Days`,
                    'Status Filter': statusFilter === 'all' ? 'All' : statusFilter === 'moving' ? 'Moving Only' : 'Non-Moving Only',
                    'Moving Items Count': stockData.moving?.length || 0,
                    'Non-Moving Items Count': stockData.nonMoving?.length || 0,
                    'Currency': currency
                },
                columns: excelCols,
                rows
            });

        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export the report. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const columns = [
        { key: 'itemCode', label: 'SKU/Code' },
        { key: 'itemName', label: 'Product Name' },
        { key: 'warehouse', label: 'Warehouse / Branch' },
        { key: 'status', label: 'Movement Status' },
        { key: 'recentMovementQty', label: 'Recent Outbound Qty' },
        { key: 'qtyOnHand', label: 'Current Stock Qty' },
        { key: 'avgCost', label: 'Unit Cost' },
        { key: 'valuation', label: 'Stock Valuation' }
    ];

    const selectedColCount = columns.filter((col) => selectedColumns[col.key]).length;
    const activeFilterCount = [localBranchId, itemQuery, days !== 30 ? days : '', statusFilter !== 'all' ? statusFilter : ''].filter(Boolean).length;

    return (
        <PageTemplate
            title="Moving & Non-Moving Stock Report"
            subtitle="Identify inventory items that are actively moving or stagnant within a specified time period."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Moving & Non-Moving Stock' },
            ]}
            action={
                <Button
                    variant="primary"
                    size="sm"
                    icon={isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    onClick={handleExport}
                    disabled={isExporting || !stockData || stockLoading}
                    loading={isExporting}
                >
                    {isExporting ? 'Generating...' : 'Export Excel'}
                </Button>
            }
            loading={stockLoading}
            maxWidth="full"
        >
            <div className="space-y-6">
                {/* Filters */}
                <FilterBar>
                    <div className="flex flex-wrap items-center gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary mb-1 uppercase">Time Period (Days)</label>
                            <input
                                type="number"
                                value={days}
                                onChange={(e) => setDays(parseInt(e.target.value) || 30)}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary w-32"
                                min={1}
                                max={3650}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-secondary mb-1 uppercase">Filter By Status</label>
                            <div className="flex bg-background-subtle p-1 rounded-lg border border-border">
                                {['all', 'moving', 'non-moving'].map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => setStatusFilter(opt as any)}
                                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                            statusFilter === opt
                                                ? 'bg-background-card text-text-primary shadow-sm border border-border'
                                                : 'text-text-secondary hover:text-text-primary'
                                        }`}
                                    >
                                        {opt.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Select
                            options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b: any) => ({ value: b.id, label: b.name }))]}
                            value={localBranchId}
                            onChange={(e) => setLocalBranchId(e.target.value)}
                            placeholder="Warehouse"
                            className="min-w-[180px]"
                        />
                        <input
                            type="text"
                            placeholder="Search by Product Name/Code..."
                            value={itemQuery}
                            onChange={(e) => setItemQuery(e.target.value)}
                            className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary min-w-[200px]"
                        />
                        <span className="text-xs text-text-tertiary ml-auto">{activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}</span>
                    </div>
                </FilterBar>

                {/* KPI Summary */}
                {stockData && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <KpiCard label="Moving Items" value={stockData.moving?.length || 0} sub={`Had outbound movements in last ${days} days`} />
                        <KpiCard label="Non-Moving Items" value={stockData.nonMoving?.length || 0} sub={`Stagnant stock during the last ${days} days`} />
                    </div>
                )}

                {/* Column Toggles */}
                <Section variant="card" title="Export Columns" headerBorder>
                    <div className="flex items-center gap-2 mb-3">
                        <Button size="sm" variant="ghost" onClick={() => {
                            const next: Record<string, boolean> = {};
                            columns.forEach((col) => { next[col.key] = true; });
                            setSelectedColumns(next);
                        }}>Select All</Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                            const next: Record<string, boolean> = {};
                            columns.forEach((col) => { next[col.key] = false; });
                            setSelectedColumns(next);
                        }}>Clear All</Button>
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
                                    checked={selectedColumns[col.key] !== false}
                                    onChange={() => toggleColumn(col.key)}
                                    className="rounded border-border text-brand focus:ring-brand-200"
                                />
                                {col.label}
                            </label>
                        ))}
                    </div>
                </Section>
            </div>
        </PageTemplate>
    );
}
