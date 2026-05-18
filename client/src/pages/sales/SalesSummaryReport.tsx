import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CreditCard, Filter, Loader2, Receipt, Search, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import DateRangeFilter from '@/components/ui/DateRangeFilter';
import ModuleRefreshButton from '@/components/ModuleRefreshButton';
import { getSalesCustomerDisplay } from '@/lib/salesCustomerDisplay';
import AppDropdown from '../../components/ui/AppDropdown';
import { toDateInputValue } from '@/lib/companySettings';

export default function SalesSummaryReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const today = toDateInputValue();

    const [branchId, setBranchId] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [dateInput, setDateInput] = useState({ startDate: '', endDate: today });
    const [queryParams, setQueryParams] = useState({
        branchId: '',
        search: '',
        dateFrom: '',
        dateTo: today,
    });

    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-summary-report', queryParams],
        queryFn: () =>
            api.get('/reports/sales', {
                params: {
                    branchId: queryParams.branchId || undefined,
                    dateFrom: queryParams.dateFrom || undefined,
                    dateTo: queryParams.dateTo || undefined,
                },
            }).then((r) => r.data.data),
    });

    const invoices = useMemo(() => {
        const source = data?.invoices || [];
        const key = searchInput.trim().toLowerCase();
        if (!key) return source;
        return source.filter((row: any) =>
            String(getSalesCustomerDisplay(row).title || '').toLowerCase().includes(key) ||
            String(getSalesCustomerDisplay(row).detail || '').toLowerCase().includes(key) ||
            String(row.invoiceNo || '').toLowerCase().includes(key) ||
            String(row.paymentMethod || '').toLowerCase().includes(key),
        );
    }, [data?.invoices, searchInput]);

    const applyFilters = () => {
        setQueryParams({
            branchId,
            search: searchInput.trim(),
            dateFrom: dateInput.startDate,
            dateTo: dateInput.endDate,
        });
    };

    const summary = data?.summary || {};
    const paymentRows = data?.byPaymentMethod || [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales Summary Report</h1>
                    <p className="text-sm text-gray-500">Sales totals, payment mix, and recent invoices</p>
                </div>
                <ModuleRefreshButton queryKeys={[['sales-summary-report'], ['report-sales']]} />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-gray-400" />
                        <AppDropdown
                            value={branchId}
                            onChange={(v) => setBranchId(v)}
                            options={[{ value: '', label: 'All Warehouses' }, ...(branches || []).map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))]}
                            placeholder='All Warehouses'
                            searchable
                        />
                    </div>
                    <DateRangeFilter
                        startDate={dateInput.startDate}
                        endDate={dateInput.endDate}
                        onChange={(start: string, end: string) => setDateInput({ startDate: start, endDate: end })}
                        onClear={() => setDateInput({ startDate: '', endDate: '' })}
                    />
                    <button
                        onClick={applyFilters}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        Apply
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-emerald-600"><Wallet size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Sales</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary.totalSales || 0).toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-amber-600"><Receipt size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Tax</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary.totalTax || 0).toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-blue-600"><BarChart3 size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Invoices</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary.invoiceCount || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 text-rose-600"><CreditCard size={18} /></div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Discount</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary.totalDiscount || 0).toLocaleString()} {currency}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">By Payment Method</div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-4 py-3">Method</th>
                                    <th className="px-4 py-3 text-right">Invoices</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paymentRows.length === 0 ? (
                                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No data</td></tr>
                                ) : paymentRows.map((row: any) => (
                                    <tr key={row.paymentMethod} className="border-b border-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{row.paymentMethod || '-'}</td>
                                        <td className="px-4 py-3 text-right text-gray-700">{Number(row._count || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(row._sum?.grandTotal || 0).toLocaleString()} {currency}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Recent Invoices (Max 100)</div>
                    <div className="p-3 border-b border-gray-100">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                            <input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Filter invoice/customer/payment..."
                                className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[420px]">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <th className="px-4 py-3">Invoice</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Customer</th>
                                    <th className="px-4 py-3">Payment</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(isLoading || isFetching) ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                                            <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                                            Loading report...
                                        </td>
                                    </tr>
                                ) : invoices.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No invoices found</td></tr>
                                ) : invoices.map((row: any) => (
                                    <tr key={row.id} className="border-b border-gray-50">
                                        <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{row.invoiceNo}</td>
                                        <td className="px-4 py-3 text-gray-700">{format(new Date(row.createdAt), 'MMM dd, yyyy')}</td>
                                        <td className="px-4 py-3 text-gray-700">
                                            <div className="flex flex-col leading-tight">
                                                <span>{getSalesCustomerDisplay(row).title}</span>
                                                {getSalesCustomerDisplay(row).isWalkInLoyalty && (
                                                    <span className="text-[11px] text-gray-500">{getSalesCustomerDisplay(row).detail}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{row.paymentMethod || '-'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(row.grandTotal || 0).toLocaleString()} {currency}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}
