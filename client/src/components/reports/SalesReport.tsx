import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Loader2, Download, CheckSquare, Square, PieChart as PieChartIcon } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getSalesCustomerExportText } from '../../lib/salesCustomerDisplay';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import AppDropdown from '../ui/AppDropdown';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
} from '../../lib/globalStrings';

interface SalesReportProps {
    branches: any[];
}

export default function SalesReport({ branches }: SalesReportProps) {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';

    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<string>('');
    const [localBranchId, setLocalBranchId] = useState<string>('');
    const [customerQuery, setCustomerQuery] = useState<string>('');
    const [invoiceNoQuery, setInvoiceNoQuery] = useState<string>('');
    const [createdByQuery, setCreatedByQuery] = useState<string>('');

    const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({
        invoiceNo: false,
        date: false,
        branch: false,
        customer: false,
        paymentMethod: false,
        subtotal: true,
        taxTotal: true,
        discountTotal: true,
        grandTotal: true,
        createdBy: false
    });

    const [isExporting, setIsExporting] = useState(false);

    const { data: globalPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.salePaymentMethods],
        queryFn: () => api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.salePaymentMethods}`).then((r) => r.data.data),
    });

    const salesPaymentMethodOptions = buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_SALE_PAYMENT_METHOD_OPTIONS, {
        blankLabel: 'All Payment Methods',
    });

    // Using the aggregated reports endpoint for summary and chart
    // We only pass the filters the backend truly supports for real-time aggregate changes
    const { data: salesData, isLoading: salesLoading } = useQuery({
        queryKey: ['report-sales', localBranchId, dateFrom, dateTo],
        queryFn: () => api.get('/reports/sales', {
            params: { branchId: localBranchId, dateFrom, dateTo }
        }).then((r) => r.data.data),
    });

    const toggleColumn = (key: string) => {
        setSelectedColumns(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            // Fetch all invoices matching criteria (handling pagination bypass)
            let allInvoices: any[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const r = await api.get('/sales/invoices', {
                    params: {
                        limit: 1000,
                        page,
                        startDate: selectedColumns.date ? (dateFrom || undefined) : undefined,
                        endDate: selectedColumns.date ? (dateTo || undefined) : undefined,
                        paymentMethod: selectedColumns.paymentMethod ? (paymentMethod || undefined) : undefined,
                        // Note: Backend might rely on active branch context header, so it won't reliably fetch cross-branch unless requested correctly,
                        // meaning fallback to salesData is very important.
                    }
                });

                const fetchedInvoices = r.data?.data || [];
                allInvoices = [...allInvoices, ...fetchedInvoices];

                if (fetchedInvoices.length < 1000) {
                    hasMore = false;
                } else {
                    page++;
                }
            }

            // If we didn't get any from endpoint, fallback to salesData.invoices
            let finalInvoices = allInvoices.length > 0 ? allInvoices : (salesData?.invoices || []);

            // Apply frontend-level filtering for exact local searches
            if (selectedColumns.paymentMethod && paymentMethod) {
                finalInvoices = finalInvoices.filter((i: any) => i.paymentMethod === paymentMethod);
            }
            if (selectedColumns.invoiceNo && invoiceNoQuery) {
                finalInvoices = finalInvoices.filter((i: any) => i.invoiceNo?.toLowerCase().includes(invoiceNoQuery.toLowerCase()));
            }
            if (selectedColumns.customer && customerQuery) {
                finalInvoices = finalInvoices.filter((i: any) => getSalesCustomerExportText(i).toLowerCase().includes(customerQuery.toLowerCase()));
            }
            if (selectedColumns.createdBy && createdByQuery) {
                finalInvoices = finalInvoices.filter((i: any) => i.createdBy?.name?.toLowerCase().includes(createdByQuery.toLowerCase()));
            }

            const excelCols: ExcelColumn[] = [];
            if (selectedColumns.invoiceNo) excelCols.push({ key: 'invoiceNo', header: 'Invoice #', width: 20 });
            if (selectedColumns.date) excelCols.push({ key: 'date', header: 'Transaction Date', type: 'datetime', width: 20 });
            if (selectedColumns.branch) excelCols.push({ key: 'branch', header: 'Warehouse', width: 20 });
            if (selectedColumns.customer) excelCols.push({ key: 'customer', header: 'Customer', width: 24 });
            if (selectedColumns.paymentMethod) excelCols.push({ key: 'paymentMethod', header: 'Payment Mode', width: 16 });
            if (selectedColumns.createdBy) excelCols.push({ key: 'createdBy', header: 'Created By', width: 20 });
            if (selectedColumns.subtotal) excelCols.push({ key: 'subtotal', header: 'Subtotal', type: 'currency', width: 16 });
            if (selectedColumns.discountTotal) excelCols.push({ key: 'discountTotal', header: 'Discount', type: 'currency', width: 14 });
            if (selectedColumns.taxTotal) excelCols.push({ key: 'taxTotal', header: 'Tax Amt', type: 'currency', width: 14 });
            if (selectedColumns.grandTotal) excelCols.push({ key: 'grandTotal', header: 'Grand Total', type: 'currency', width: 16 });

            const rows = finalInvoices.map((inv: any) => {
                const row: any = {};
                if (selectedColumns.invoiceNo) row.invoiceNo = inv.invoiceNo;
                if (selectedColumns.date) row.date = inv.createdAt;
                if (selectedColumns.branch) row.branch = inv.branch?.name || '';
                if (selectedColumns.customer) row.customer = getSalesCustomerExportText(inv);
                if (selectedColumns.paymentMethod) row.paymentMethod = inv.paymentMethod || '';
                if (selectedColumns.createdBy) row.createdBy = inv.createdBy?.name || '';
                if (selectedColumns.subtotal) row.subtotal = Number(inv.subtotal || 0);
                if (selectedColumns.discountTotal) row.discountTotal = Number(inv.discountTotal || 0);
                if (selectedColumns.taxTotal) row.taxTotal = Number(inv.taxTotal || 0);
                if (selectedColumns.grandTotal) row.grandTotal = Number(inv.grandTotal || 0);
                return row;
            });

            await exportExcel({
                fileName: `sales - report - ${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Sales Report',
                title: 'Sales Performance Report',
                filters: {
                    'Selected Branch': selectedColumns.branch ? (branches?.find((b: any) => b.id === localBranchId)?.name || 'All Warehouses') : 'N/A',
                    'Date From': selectedColumns.date ? (dateFrom || 'Start of Time') : 'N/A',
                    'Date To': selectedColumns.date ? (dateTo || 'Present') : 'N/A',
                    'Payment Method': selectedColumns.paymentMethod ? (paymentMethod || 'All') : 'N/A',
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
        { key: 'invoiceNo', label: 'Invoice Number', type: 'text', state: invoiceNoQuery, onChange: (e: any) => setInvoiceNoQuery(e.target.value), placeholder: 'Search by Invoice No...' },
        { key: 'date', label: 'Transaction Date', type: 'dateRange', fromState: dateFrom, onFromChange: (e: any) => setDateFrom(e.target.value), toState: dateTo, onToChange: (e: any) => setDateTo(e.target.value) },
        {
            key: 'branch', label: 'Warehouse / Branch', type: 'select', state: localBranchId, onChange: (e: any) => setLocalBranchId(e.target.value),
            options: [{ value: '', label: 'All Warehouses' }, ...branches.map(b => ({ value: b.id, label: b.name }))]
        },
        { key: 'customer', label: 'Customer Details', type: 'text', state: customerQuery, onChange: (e: any) => setCustomerQuery(e.target.value), placeholder: 'Search by Customer Name/Phone...' },
        {
            key: 'paymentMethod', label: 'Payment Method', type: 'select', state: paymentMethod, onChange: (e: any) => setPaymentMethod(e.target.value),
            options: salesPaymentMethodOptions
        },
        { key: 'createdBy', label: 'Created By', type: 'text', state: createdByQuery, onChange: (e: any) => setCreatedByQuery(e.target.value), placeholder: 'Search by Employee Name...' },
        { key: 'subtotal', label: 'Subtotal' },
        { key: 'discountTotal', label: 'Discount Amount' },
        { key: 'taxTotal', label: 'Tax Amount' },
        { key: 'grandTotal', label: 'Grand Total' }
    ];

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    return (
        <div className="space-y-6">
            {salesLoading ? (
                <div className="flex justify-center p-10"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
            ) : salesData && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {[
                            { label: 'Total Sales', value: `${currency} ${Number(salesData.summary.totalSales).toLocaleString()} `, color: 'var(--color-success)' },
                            { label: 'Total Tax', value: `${currency} ${Number(salesData.summary.totalTax).toLocaleString()} `, color: 'var(--color-warning)' },
                            { label: 'Invoices', value: salesData.summary.invoiceCount.toLocaleString(), color: 'var(--color-accent)' },
                        ].map((s, i) => (
                            <div key={i} className="rounded-xl p-5" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                                <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                                <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mt-8">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                            <PieChartIcon size={20} />
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

                                        {isSelected && col.type === 'dateRange' && (
                                            <div className="px-3 pb-3 flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] uppercase font-bold text-blue-700 w-10">From</span>
                                                    <input
                                                        type="date"
                                                        value={col.fromState}
                                                        onChange={col.onFromChange}
                                                        className="w-full text-xs rounded-lg border-gray-300 py-1.5 px-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] uppercase font-bold text-blue-700 w-10">To</span>
                                                    <input
                                                        type="date"
                                                        value={col.toState}
                                                        onChange={col.onToChange}
                                                        className="w-full text-xs rounded-lg border-gray-300 py-1.5 px-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                    />
                                                </div>
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
                            disabled={isExporting}
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
