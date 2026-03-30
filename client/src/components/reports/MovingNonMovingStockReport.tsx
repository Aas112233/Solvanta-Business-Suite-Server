import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Loader2, Download, CheckSquare, Square, ShoppingBag } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../ui/AppDropdown';

export default function MovingNonMovingStockReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';

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
            let combinedStocks = [];

            if (statusFilter === 'all' || statusFilter === 'moving') {
                const movingWithStatus = (stockData.moving || []).map((s: any) => ({ ...s, movingStatus: 'Moving' }));
                combinedStocks.push(...movingWithStatus);
            }
            if (statusFilter === 'all' || statusFilter === 'non-moving') {
                const nonMovingWithStatus = (stockData.nonMoving || []).map((s: any) => ({ ...s, movingStatus: 'Non-Moving' }));
                combinedStocks.push(...nonMovingWithStatus);
            }

            // Apply frontend-level filtering for exact local searches
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

    const baseCols = [
        { key: 'itemCode', label: 'SKU/Code' },
        { key: 'itemName', label: 'Product Name', type: 'text', state: itemQuery, onChange: (e: any) => setItemQuery(e.target.value), placeholder: 'Search by Product Name/Code...' },
        {
            key: 'warehouse', label: 'Warehouse / Branch', type: 'select', state: localBranchId, onChange: (e: any) => setLocalBranchId(e.target.value),
            options: [{ value: '', label: 'All Warehouses' }, ...branches.map((b: any) => ({ value: b.id, label: b.name }))]
        },
        { key: 'status', label: 'Movement Status' },
        { key: 'recentMovementQty', label: 'Recent Outbound Qty' },
        { key: 'qtyOnHand', label: 'Current Stock Qty' },
        { key: 'avgCost', label: 'Unit Cost' },
        { key: 'valuation', label: 'Stock Valuation' }
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white p-5 rounded-xl border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center gap-6 shadow-sm">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Time Period (Days)</label>
                    <input
                        type="number"
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value) || 30)}
                        className="rounded-lg border-gray-300 p-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm w-32"
                        min={1}
                        max={3650}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">Filter By Status</label>
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                        {['all', 'moving', 'non-moving'].map(opt => (
                            <button
                                key={opt}
                                onClick={() => setStatusFilter(opt as any)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === opt
                                        ? 'bg-white text-blue-600 shadow-sm border border-gray-200'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                {opt.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {stockLoading ? (
                <div className="flex justify-center p-10"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
            ) : stockData && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Moving Items</p>
                            <p className="text-2xl font-bold mt-1 text-green-600">{stockData.moving?.length || 0}</p>
                            <p className="text-xs text-gray-500 mt-1">Had outbound movements in last {days} days</p>
                        </div>
                        <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Non-Moving Items</p>
                            <p className="text-2xl font-bold mt-1 text-red-600">{stockData.nonMoving?.length || 0}</p>
                            <p className="text-xs text-gray-500 mt-1">Stagnant stock during the last {days} days</p>
                        </div>
                    </div>
                </>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mt-8">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                            <ShoppingBag size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Configure & Download Export</h2>
                            <p className="text-sm text-gray-500">Toggle fields below to include them in the export or apply specific filters.</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-6 bg-gray-50/50 p-5 rounded-lg border border-gray-100">
                    <div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {baseCols.map(col => {
                                const isSelected = selectedColumns[col.key] !== false;
                                return (
                                    <div
                                        key={col.key}
                                        className={`flex flex-col transition-all rounded-xl border overflow-hidden ${isSelected
                                            ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500/20'
                                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                            }`}
                                    >
                                        <button
                                            onClick={() => toggleColumn(col.key)}
                                            className="flex items-center gap-3 text-sm transition-all text-left p-3"
                                        >
                                            {isSelected ? (
                                                <CheckSquare size={18} className="text-blue-600 flex-shrink-0" />
                                            ) : (
                                                <Square size={18} className="text-gray-300 flex-shrink-0" />
                                            )}
                                            <span className={`font-medium ${isSelected ? 'text-blue-800' : 'text-gray-700'}`}>{col.label}</span>
                                        </button>

                                        {isSelected && col.type === 'select' && (
                                            <div className="px-3 pb-3">
                                                                                                <AppDropdown
                                                    value={col.state || ''}
                                                    onChange={(v) => col.onChange?.({ target: { value: v } } as any)}
                                                    options={[...(col.options || []).map((opt: any) => ({ value: opt.value, label: opt.label }))]}
                                                    placeholder='Select'
                                                    searchable
                                                />
                                            </div>
                                        )}

                                        {isSelected && col.type === 'text' && (
                                            <div className="px-3 pb-3">
                                                <input
                                                    type="text"
                                                    placeholder={col.placeholder || 'Search...'}
                                                    value={col.state || ''}
                                                    onChange={(v) => col.onChange?.({ target: { value: v } } as any)}
                                                    className="w-full text-xs rounded-lg border-gray-300 p-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pt-6 mt-4 border-t border-gray-200 flex justify-end">
                        <button
                            onClick={handleExport}
                            disabled={isExporting || !stockData || stockLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-blue-100 disabled:opacity-50 disabled:shadow-none"
                        >
                            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            {isExporting ? 'Generating Excel...' : 'Generate & Download Excel'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
