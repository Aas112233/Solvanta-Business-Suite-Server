import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    Search, Filter, Download, Plus, AlertTriangle,
    ArrowUpRight, ArrowDownLeft, RefreshCcw, Package, Printer, Loader2
} from 'lucide-react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import StockAdjustmentModal from './StockAdjustmentModal';
import LabelPrintModal from './LabelPrintModal';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import { exportExcel } from '../../lib/fileExport';
import toast from 'react-hot-toast';
import Pagination from '../../components/ui/Pagination';
import AppDropdown from '../../components/ui/AppDropdown';
import { formatDecomposedQty } from '../../lib/inventoryUtils';

export default function StockOverview() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // UI State (Inputs)
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const [branchInput, setBranchInput] = useState(searchParams.get('branchId') || '');
    const [lowStockInput, setLowStockInput] = useState(false);

    // Query State (Applied Filters)
    const [queryParams, setQueryParams] = useState({
        search: '',
        branchId: searchParams.get('branchId') || '',
        lowStockOnly: false
    });

    const [modalState, setModalState] = useState({
        adjust: false,
        print: false
    });
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Fetch Branches
    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r: any) => r.data.data)
    });

    // Fetch Stock Data
    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['inventory', queryParams, page, limit],
        queryFn: () => api.get('/inventory/stock', {
            params: {
                search: queryParams.search || undefined,
                page,
                limit,
                branchId: queryParams.branchId || undefined,
                lowStock: queryParams.lowStockOnly || undefined
            }
        }).then((r: any) => r.data)
    });
    const pagination = data?.meta?.pagination;

    // Analytics & Alerts
    const { data: analytics } = useQuery({
        queryKey: ['inventory-analytics-summary', queryParams.branchId],
        queryFn: () => api.get('/inventory/analytics', { params: { branchId: queryParams.branchId || undefined } }).then((r: any) => r.data.data)
    });

    const { data: alerts, refetch: refetchAlerts } = useQuery({
        queryKey: ['inventory-alerts', queryParams.branchId],
        queryFn: () => api.get('/inventory/alerts', { params: { branchId: queryParams.branchId || undefined } }).then((r: any) => r.data.data)
    });

    const handleApplyFilters = () => {
        setPage(1);
        setQueryParams({
            search: searchInput,
            branchId: branchInput,
            lowStockOnly: lowStockInput
        });
    };

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const res = await api.get('/inventory/stock', {
                params: {
                    search: queryParams.search || undefined,
                    branchId: queryParams.branchId || undefined,
                    lowStock: queryParams.lowStockOnly || undefined,
                    limit: 10000 // Fetch up to 10k records
                }
            });

            const selectedBranch = queryParams.branchId ? branches?.find((b: any) => b.id === queryParams.branchId) : null;

            const rows = (res.data.data || []).map((stock: any) => {
                const unitInfo = stock.product?.units?.find((u: any) => u.unitCode === stock.unitCode);
                return {
                    itemCode: stock.product?.itemCode || '',
                    product: stock.product?.name || '',
                    branch: stock.branch?.name || '',
                    unit: stock.unitCode,
                    unitName: unitInfo?.unitName || '-',
                    fraction: unitInfo?.qtyInBaseUnit || 1,
                    qtyOnHand: Number(stock.qtyOnHand || 0),
                    avgCost: Number(stock.avgCost || 0),
                    value: Number(stock.qtyOnHand || 0) * Number(stock.avgCost || 0),
                };
            });

            if (rows.length === 0) {
                toast.error('No data to export');
                return;
            }

            await exportExcel({
                fileName: `Stock_Overview_${new Date().toISOString().split('T')[0]}`,
                sheetName: 'Stock Status',
                title: 'Current Inventory Status',
                companyName: 'SOLVANTA ERP',
                branchName: selectedBranch?.name || 'All Warehouses',
                branchCode: selectedBranch?.code,
                filters: {
                    'Search Query': queryParams.search || 'None',
                    'Low Stock Policy': queryParams.lowStockOnly ? 'Filtered (Active)' : 'Unfiltered',
                    'Export Context': 'Full Inventory Dump'
                },
                columns: [
                    { key: 'itemCode', header: 'SKU/Item Code', width: 20 },
                    { key: 'product', header: 'Product Description', width: 40 },
                    { key: 'branch', header: 'Warehouse / Location', width: 25 },
                    { key: 'unit', header: 'Unit Code', width: 12 },
                    { key: 'unitName', header: 'Unit Name', width: 18 },
                    { key: 'fraction', header: 'Fraction (Base)', width: 16, type: 'number' },
                    { key: 'qtyOnHand', header: 'In-Hand Qty', type: 'number', width: 16 },
                    { key: 'avgCost', header: 'Avg Unit Cost', type: 'currency', width: 16 },
                    { key: 'value', header: 'Inventory Value', type: 'currency', width: 18 },
                ],
                rows,
            });
            toast.success('Export completed');
        } catch (error) {
            console.error(error);
            toast.error('Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Stock Overview</h1>
                        <ModuleRefreshButton queryKeys={[['inventory'], ['inventory-alerts'], ['inventory-analytics-summary']]} />
                    </div>
                    <p className="text-gray-500">Manage real-time inventory across all branches</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setModalState(p => ({ ...p, adjust: true }))} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
                        <RefreshCcw size={18} /> Adjust
                    </button>
                    <button onClick={() => navigate('/inventory/transfers')} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
                        <ArrowUpRight size={18} /> Transfer
                    </button>
                    <button onClick={() => navigate('/purchases/new')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 text-white">
                        <ArrowDownLeft size={18} /> Receive (GRN)
                    </button>
                </div>
            </div>

            <StockAdjustmentModal
                isOpen={modalState.adjust}
                onClose={() => setModalState(p => ({ ...p, adjust: false }))}
                onSuccess={() => {
                    refetch();
                    refetchAlerts();
                }}
            />

            {/* Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Total Items */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                        <Package size={20} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total Items</p>
                        <p className="text-xl font-bold">{pagination?.total || 0}</p>
                    </div>
                </div>
                {/* Low Stock */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-yellow-50 text-yellow-600 rounded-lg flex items-center justify-center">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Low Stock Alerts</p>
                        <p className="text-xl font-bold">{alerts?.lowStockCount || 0}</p>
                    </div>
                </div>
                {/* Valuation */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Plus size={20} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total Valuation</p>
                        <p className="text-xl font-bold">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(analytics?.totalValuation || 0)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col xl:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search products by name, code or barcode..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <AppDropdown
                        value={branchInput}
                        onChange={(v) => setBranchInput(v)}
                        options={[{ value: '', label: 'All Branches' }, ...(branches || []).map((b: any) => ({ value: b.id, label: b.name }))]}
                        placeholder='All Branches'
                        searchable
                    />

                    <button
                        onClick={() => setLowStockInput(!lowStockInput)}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${lowStockInput ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
                    >
                        <Filter size={18} /> {lowStockInput ? 'Low Stock Only' : 'Low Stock'}
                    </button>

                    <button
                        onClick={handleApplyFilters}
                        disabled={isFetching}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm whitespace-nowrap"
                    >
                        {isFetching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                        {isFetching ? 'Loading...' : 'Apply Filter'}
                    </button>

                    <div className="w-px h-full bg-gray-200 hidden sm:block mx-1"></div>

                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={18} className="animate-spin text-emerald-600" /> : <Download size={18} />}
                        {isExporting ? 'Exporting...' : 'Export Excel'}
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative min-h-[400px]">
                {/* Loading Overlay */}
                {(isLoading || isFetching) && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-blue-600">
                        <Loader2 size={40} className="animate-spin mb-3" />
                        <span className="text-sm font-bold animate-pulse">Updating inventory...</span>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Item Code</th>
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Product Name</th>
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Branch</th>
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-center">Unit</th>
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-right">Available Qty</th>
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-right">Avg Cost</th>
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-right">Value</th>
                                <th className="py-3 px-4 text-sm font-semibold text-gray-600 text-center">Print</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(() => {
                                // Group by Product + Branch
                                const grouped = data?.data?.reduce((acc: any[], stock: any) => {
                                    const key = `${stock.productId}-${stock.branchId}`;
                                    let group = acc.find(g => g.key === key);
                                    if (!group) {
                                        group = {
                                            key,
                                            product: stock.product,
                                            branch: stock.branch,
                                            totalBaseQty: 0,
                                            avgCost: 0,
                                            stocks: []
                                        };
                                        acc.push(group);
                                    }

                                    const unit = stock.product?.units?.find((u: any) => u.unitCode === stock.unitCode);
                                    const multiplier = Number(unit?.qtyInBaseUnit || 1);
                                    group.totalBaseQty += Number(stock.qtyOnHand) * multiplier;

                                    // Weighted average cost (simplified)
                                    group.avgCost = Number(stock.avgCost); // Usually avgCost is already normalized to base in the DB, but here we take the last one seen or we could weighted average it
                                    group.stocks.push(stock);
                                    return acc;
                                }, []) || [];

                                if (grouped.length === 0) {
                                    return <tr><td colSpan={8} className="py-20 text-center text-gray-500">No stock records found matching filters</td></tr>;
                                }

                                return grouped.map((group: any) => {
                                    const baseUnit = group.product?.units?.find((u: any) => u.isBase) || group.product?.units?.[0];
                                    const decomposed = formatDecomposedQty(group.totalBaseQty, group.product?.units || []);

                                    return (
                                        <tr key={group.key} className="hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-4 text-sm font-medium text-gray-900 font-mono">{group.product?.itemCode}</td>
                                            <td className="py-3 px-4 text-sm text-gray-700">
                                                <Link to={`/items/${group.product?.id}`} className="font-bold text-blue-600 hover:underline">
                                                    {group.product?.name}
                                                </Link>
                                                {group.product?.barcodes?.length > 0 && (
                                                    <div className="text-xs text-gray-400 font-mono tracking-tighter">{group.product.barcodes[0]}</div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-600">{group.branch?.name}</td>
                                            <td className="py-3 px-4 text-sm text-gray-600 text-center">
                                                <span className="font-semibold text-gray-800">{baseUnit?.unitName || '-'}</span>
                                                <div className="text-[10px] text-gray-400 font-mono">Normalized to Base</div>
                                            </td>
                                            <td className={`py-3 px-4 text-sm font-semibold text-right ${group.totalBaseQty <= 5 ? 'text-red-600' : 'text-gray-900'}`}>
                                                <div className="flex flex-col items-end">
                                                    <span>{group.totalBaseQty}</span>
                                                    <span className="text-[10px] text-blue-600 font-normal">{decomposed}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-600 text-right">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(group.avgCost)}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-900 text-right font-medium">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(group.totalBaseQty * group.avgCost)}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-center">
                                                <button
                                                    onClick={() => {
                                                        setSelectedProduct(group.product);
                                                        setModalState(p => ({ ...p, print: true }));
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Printer size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
                {/* Pagination */}
                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>
            <LabelPrintModal
                isOpen={modalState.print}
                onClose={() => {
                    setModalState(p => ({ ...p, print: false }));
                    setSelectedProduct(null);
                }}
                product={selectedProduct}
            />
        </div>
    );
}
