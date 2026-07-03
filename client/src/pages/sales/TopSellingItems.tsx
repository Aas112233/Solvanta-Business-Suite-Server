import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BarChart3, Boxes, Filter, Loader2, Search, TrendingUp } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import AppDropdown from '../../components/ui/AppDropdown';
import { DEFAULT_CURRENCY } from '../../lib/constants';

type SortBy = 'qty' | 'revenue' | 'invoices';

export default function TopSellingItems() {
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const today = format(new Date(), 'yyyy-MM-dd');

    const [dateRangeInput, setDateRangeInput] = useState({ startDate: today, endDate: today });
    const [searchInput, setSearchInput] = useState('');
    const [queryParams, setQueryParams] = useState({
        startDate: today,
        endDate: today,
        search: '',
        sortBy: 'qty' as SortBy,
        limit: 20,
    });

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['top-selling-items', activeBranchId, queryParams],
        queryFn: async () => {
            const res = await api.get('/sales/top-selling-items', { params: queryParams });
            return res.data.data;
        },
    });

    const rows = data?.items || [];
    const totals = useMemo(() => {
        return rows.reduce((acc: any, row: any) => {
            acc.qty += Number(row.qty || 0);
            acc.revenue += Number(row.revenue || 0);
            acc.invoiceCount += Number(row.invoiceCount || 0);
            return acc;
        }, { qty: 0, revenue: 0, invoiceCount: 0 });
    }, [rows]);

    const applyFilters = () => {
        setQueryParams((prev) => ({
            ...prev,
            startDate: dateRangeInput.startDate,
            endDate: dateRangeInput.endDate,
            search: searchInput.trim(),
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Top Selling Items</h1>
                    <p className="text-sm text-gray-500">Best selling products for the selected period</p>
                </div>
                <ModuleRefreshButton queryKeys={[['top-selling-items', activeBranchId, queryParams]]} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-blue-600"><Boxes size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Ranked Items</p>
                    <p className="text-xl font-semibold text-gray-900">{rows.length}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-emerald-600"><TrendingUp size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Quantity</p>
                    <p className="text-xl font-semibold text-gray-900">{totals.qty.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-violet-600"><BarChart3 size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Net Sales</p>
                    <p className="text-xl font-semibold text-gray-900">{totals.revenue.toLocaleString()} {currency}</p>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search item name or code..."
                            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
                        />
                    </div>

                    <DateRangeFilter
                        startDate={dateRangeInput.startDate}
                        endDate={dateRangeInput.endDate}
                        onChange={(start: string, end: string) => setDateRangeInput({ startDate: start, endDate: end })}
                        onClear={() => setDateRangeInput({ startDate: '', endDate: '' })}
                    />

                    <AppDropdown
                        value={queryParams.sortBy}
                        onChange={(v) => setQueryParams(prev => ({ ...prev, sortBy: v as SortBy }))}
                        options={[{ value: 'qty', label: 'Sort: Quantity' }, { value: 'revenue', label: 'Sort: Revenue' }, { value: 'invoices', label: 'Sort: Invoices' }]}
                        placeholder='Sort: Quantity'
                    />

                    <AppDropdown
                        value={String(queryParams.limit)}
                        onChange={(v) => setQueryParams(prev => ({ ...prev, limit: Number(v) }))}
                        options={[{ value: '10', label: 'Top 10' }, { value: '20', label: 'Top 20' }, { value: '50', label: 'Top 50' }, { value: '100', label: 'Top 100' }]}
                        placeholder='Top 20'
                    />

                    <button
                        onClick={applyFilters}
                        disabled={isFetching}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
                    >
                        {isFetching ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
                        {isFetching ? 'Loading...' : 'Apply'}
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                <th className="px-4 py-3">#</th>
                                <th className="px-4 py-3">Item</th>
                                <th className="px-4 py-3">Code</th>
                                <th className="px-4 py-3 text-right">Qty Sold</th>
                                <th className="px-4 py-3 text-right">Net Sales</th>
                                <th className="px-4 py-3 text-right">VAT</th>
                                <th className="px-4 py-3 text-right">Gross Sales</th>
                                <th className="px-4 py-3 text-right">Invoices</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                                        <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                                        Loading top-selling items...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                                        No sales item data found for the selected period.
                                    </td>
                                </tr>
                            ) : rows.map((row: any, index: number) => (
                                <tr key={row.productId} className="border-b border-gray-50">
                                    <td className="px-4 py-3 font-semibold text-gray-700">{index + 1}</td>
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-gray-900">{row.name}</p>
                                        {row.nameArabic && <p className="text-xs text-gray-500">{row.nameArabic}</p>}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.itemCode}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(row.qty || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-gray-900">{Number(row.revenue || 0).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{Number(row.tax || 0).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(row.total || 0).toLocaleString()} {currency}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{Number(row.invoiceCount || 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
