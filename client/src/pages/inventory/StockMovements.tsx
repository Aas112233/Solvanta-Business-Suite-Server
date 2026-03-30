import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    Search, ArrowUpRight, ArrowDownLeft,
    ArrowLeftRight, RotateCcw, History,
    ShoppingCart, Receipt, Loader2, Download, Filter
} from 'lucide-react';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import { exportExcel } from '../../lib/fileExport';
import toast from 'react-hot-toast';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import AppDropdown from '../../components/ui/AppDropdown';

export default function StockMovements() {
    // UI State (Inputs)
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [typeInput, setTypeInput] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [dateFromInput, setDateFromInput] = useState('');
    const [dateToInput, setDateToInput] = useState('');

    // Query State (Applied Filters)
    const [queryParams, setQueryParams] = useState({
        type: '',
        search: '',
        dateFrom: '',
        dateTo: ''
    });

    const [isExporting, setIsExporting] = useState(false);

    // Fetch Data
    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['stock-movements', page, limit, queryParams],
        queryFn: () => api.get('/inventory/movements', {
            params: {
                page,
                limit,
                type: queryParams.type || undefined,
                search: queryParams.search || undefined,
                dateFrom: queryParams.dateFrom || undefined,
                dateTo: queryParams.dateTo || undefined
            }
        }).then((r: any) => r.data)
    });
    const pagination = data?.meta?.pagination;

    const handleApplyFilters = () => {
        setPage(1);
        setQueryParams({
            type: typeInput,
            search: searchInput,
            dateFrom: dateFromInput,
            dateTo: dateToInput
        });
    };

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const exportLimit = 1000;
            let exportPage = 1;
            let totalPages = 1;
            const allRows: any[] = [];

            do {
                const res = await api.get('/inventory/movements', {
                    params: {
                        type: queryParams.type || undefined,
                        search: queryParams.search || undefined,
                        dateFrom: queryParams.dateFrom || undefined,
                        dateTo: queryParams.dateTo || undefined,
                        page: exportPage,
                        limit: exportLimit
                    }
                });
                const chunk = res.data?.data || [];
                allRows.push(...chunk);
                totalPages = res.data?.meta?.pagination?.totalPages || 1;
                exportPage += 1;
            } while (exportPage <= totalPages);

            const rows = allRows.map((m: any) => ({
                date: m.createdAt,
                type: m.type.replace('_', ' '),
                product: m.product?.name || '',
                itemCode: m.product?.itemCode || '',
                qty: Number(m.qty || 0),
                runningQty: Number(m.runningQty || 0),
                
                referenceType: m.referenceType || '',
                referenceId: m.referenceId || '',
                operator: m.createdBy?.name || '',
            }));

            if (rows.length === 0) {
                toast.error('No movements to export');
                return;
            }

            await exportExcel({
                fileName: `Stock_Movements_${new Date().toISOString().split('T')[0]}`,
                sheetName: 'Movements',
                title: 'Inventory Movement Ledger',
                filters: {
                    'Movement Category': queryParams.type || 'All Movements',
                    'Search Query': queryParams.search || 'None',
                    'Date Range': `${queryParams.dateFrom || 'Earliest'} to ${queryParams.dateTo || 'Latest'}`
                },
                columns: [
                    { key: 'date', header: 'Movement', type: 'datetime', split: true },
                    { key: 'type', header: 'Type', width: 18 },
                    { key: 'product', header: 'Product Description', width: 35 },
                    { key: 'itemCode', header: 'SKU/Code', width: 18 },
                    { key: 'qty', header: 'Qty Change', type: 'number', width: 14 },
                    { key: 'runningQty', header: 'Running Stock', type: 'number', width: 16 },
                    
                    { key: 'referenceType', header: 'Reference', width: 18 },
                    { key: 'referenceId', header: 'Doc ID', width: 24 },
                    { key: 'operator', header: 'Authorized By', width: 20 },
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

    const getMovementIcon = (type: string) => {
        switch (type) {
            case 'PURCHASE_RECEIPT': return <ShoppingCart className="text-green-600" size={16} />;
            case 'POS_SALE': return <Receipt className="text-red-600" size={16} />;
            case 'TRANSFER_IN': return <ArrowDownLeft className="text-blue-600" size={16} />;
            case 'TRANSFER_OUT': return <ArrowUpRight className="text-orange-600" size={16} />;
            case 'ADJUSTMENT': return <RotateCcw className="text-purple-600" size={16} />;
            default: return <ArrowLeftRight className="text-gray-600" size={16} />;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <History className="text-blue-600" /> Stock Ledger
                    </h1>
                    <ModuleRefreshButton queryKeys={[['stock-movements']]} />
                </div>
                <p className="text-gray-500 text-sm">Historical movement of inventory items including sales, purchases, and transfers</p>
            </div>

            {/* Filters */}
            <div className="flex flex-col xl:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search product name or reference..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                                        <AppDropdown
                        value={typeInput}
    onChange={(v) => setTypeInput(v)}
                        options={[{ value: '', label: 'All Movement Types' }, { value: 'PURCHASE_RECEIPT', label: 'Purchases' }, { value: 'POS_SALE', label: 'Sales / POS' }, { value: 'TRANSFER_IN', label: 'Transfers IN' }, { value: 'TRANSFER_OUT', label: 'Transfers OUT' }, { value: 'ADJUSTMENT', label: 'Adjustments' }]}
                        placeholder='All Movement Types'
                    />

                    <DateRangeFilter
                        startDate={dateFromInput}
                        endDate={dateToInput}
                        onChange={(start: string, end: string) => {
                            setDateFromInput(start);
                            setDateToInput(end); }}
                        onClear={() => {
                            setDateFromInput('');
                            setDateToInput('');
                        }}
                    />

                    <button
                        onClick={handleApplyFilters}
                        disabled={isFetching}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm whitespace-nowrap"
                    >
                        {isFetching ? <Loader2 size={18} className="animate-spin" /> : <Filter size={18} />}
                        {isFetching ? 'Loading...' : 'Apply Filter'}
                    </button>

                    <div className="w-px h-full bg-gray-200 hidden sm:block mx-1"></div>

                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50 whitespace-nowrap"
                    >
                        {isExporting ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Download size={18} />}
                        {isExporting ? 'Exporting...' : 'Export Excel'}
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden relative min-h-[400px]">
                {/* Loading Overlay */}
                {(isLoading || isFetching) && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center text-blue-600">
                        <Loader2 size={40} className="animate-spin mb-3" />
                        <span className="text-sm font-bold animate-pulse">Updating ledger...</span>
                    </div>
                )}

                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="py-3 px-6 font-bold text-gray-500 text-[10px] uppercase tracking-widest">Date & Time</th>
                            <th className="py-3 px-6 font-bold text-gray-500 text-[10px] uppercase tracking-widest">Type</th>
                            <th className="py-3 px-6 font-bold text-gray-500 text-[10px] uppercase tracking-widest">Product</th>
                            <th className="py-3 px-6 font-bold text-gray-500 text-[10px] uppercase tracking-widest text-right">Qty Change</th>
                            <th className="py-3 px-6 font-bold text-gray-500 text-[10px] uppercase tracking-widest text-right">Running Stock</th>
                            <th className="py-3 px-6 font-bold text-gray-500 text-[10px] uppercase tracking-widest">Reference</th>
                            <th className="py-3 px-6 font-bold text-gray-500 text-[10px] uppercase tracking-widest">Operator</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data?.data?.length === 0 ? (
                            <tr><td colSpan={7} className="py-20 text-center text-gray-400">No movements recorded matching filters</td></tr>
                        ) : (
                            data?.data?.map((m: any) => (
                                <tr key={m.id} className="hover:bg-blue-50/20 transition-colors">
                                    <td className="py-4 px-6">
                                        <div className="text-xs font-bold text-gray-900">{new Date(m.createdAt).toLocaleDateString()}</div>
                                        <div className="text-[10px] text-gray-400">{new Date(m.createdAt).toLocaleTimeString()}</div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-2">
                                            {getMovementIcon(m.type)}
                                            <span className="text-[10px] font-black uppercase text-gray-600">{m.type.replace('_', ' ')}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="text-sm font-black text-gray-800 tracking-tight">{m.product?.name}</div>
                                        <div className="text-[10px] text-gray-400 font-bold">{m.product?.itemCode}</div>
                                    </td>
                                    <td className="py-4 px-6 text-right font-black">
                                        <span className={m.qty > 0 ? 'text-green-600' : 'text-red-500'}>
                                            {m.qty > 0 ? '+' : ''}{m.qty}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6 text-right font-black text-gray-800">
                                        {Number(m.runningQty || 0)}
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="text-[10px] font-bold text-blue-600 uppercase underline cursor-pointer hover:text-blue-800">
                                            {m.referenceId ? m.referenceId.substring(Math.max(0, m.referenceId.length - 8)).toUpperCase() : 'N/A'}
                                        </div>
                                        <div className="text-[9px] text-gray-400 uppercase">{m.referenceType}</div>
                                    </td>
                                    <td className="py-4 px-6 text-gray-500 text-xs font-medium">
                                        {m.createdBy?.name || 'System Auth'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

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
        </div>
    );
}
