import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { DEFAULT_CURRENCY, FETCH_ALL_LIMIT } from '../../lib/constants';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Loader2, Download } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getSalesCustomerExportText } from '../../lib/salesCustomerDisplay';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
} from '../../lib/globalStrings';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

interface SalesReportProps {
    branches: any[];
}

export default function SalesReport({ branches }: SalesReportProps) {
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

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
            let allInvoices: any[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const r = await api.get('/sales/invoices', {
                    params: {
                        limit: FETCH_ALL_LIMIT,
                        page,
                        startDate: selectedColumns.date ? (dateFrom || undefined) : undefined,
                        endDate: selectedColumns.date ? (dateTo || undefined) : undefined,
                        paymentMethod: selectedColumns.paymentMethod ? (paymentMethod || undefined) : undefined,
                    }
                });

                const fetchedInvoices = r.data?.data || [];
                allInvoices = [...allInvoices, ...fetchedInvoices];

                if (fetchedInvoices.length < FETCH_ALL_LIMIT) {
                    hasMore = false;
                } else {
                    page++;
                }
            }

            let finalInvoices = allInvoices.length > 0 ? allInvoices : (salesData?.invoices || []);

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

    const columns = [
        { key: 'invoiceNo', label: 'Invoice Number' },
        { key: 'date', label: 'Transaction Date' },
        { key: 'branch', label: 'Warehouse / Branch' },
        { key: 'customer', label: 'Customer Details' },
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'createdBy', label: 'Created By' },
        { key: 'subtotal', label: 'Subtotal' },
        { key: 'discountTotal', label: 'Discount Amount' },
        { key: 'taxTotal', label: 'Tax Amount' },
        { key: 'grandTotal', label: 'Grand Total' }
    ];

    const selectedColCount = columns.filter((col) => selectedColumns[col.key]).length;
    const activeFilterCount = [localBranchId, dateFrom, dateTo, paymentMethod, customerQuery, invoiceNoQuery, createdByQuery].filter(Boolean).length;

    return (
        <PageTemplate
            title="Sales Report"
            subtitle="Sales performance summary with invoice-level drilldown and payment analysis."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Sales Report' },
            ]}
            action={
                <Button
                    variant="primary"
                    size="sm"
                    icon={isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    onClick={handleExport}
                    disabled={isExporting}
                    loading={isExporting}
                >
                    {isExporting ? 'Generating...' : 'Export Excel'}
                </Button>
            }
            loading={salesLoading}
            maxWidth="full"
        >
            <div className="space-y-6">
                {/* KPI Summary */}
                {salesData && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <KpiCard label="Total Sales" value={`${currency} ${Number(salesData.summary.totalSales).toLocaleString()}`} />
                        <KpiCard label="Total Tax" value={`${currency} ${Number(salesData.summary.totalTax).toLocaleString()}`} />
                        <KpiCard label="Invoices" value={Number(salesData.summary.invoiceCount || 0).toLocaleString()} />
                    </div>
                )}

                {/* Filters */}
                <FilterBar>
                    <div className="flex flex-wrap items-center gap-3">
                        <Select
                            options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b: any) => ({ value: b.id, label: b.name }))]}
                            value={localBranchId}
                            onChange={(e) => setLocalBranchId(e.target.value)}
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
                            options={salesPaymentMethodOptions}
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            placeholder="Payment Method"
                            className="min-w-[180px]"
                        />
                        <input
                            type="text"
                            placeholder="Search by Invoice No..."
                            value={invoiceNoQuery}
                            onChange={(e) => setInvoiceNoQuery(e.target.value)}
                            className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary min-w-[180px]"
                        />
                        <input
                            type="text"
                            placeholder="Search by Customer..."
                            value={customerQuery}
                            onChange={(e) => setCustomerQuery(e.target.value)}
                            className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary min-w-[180px]"
                        />
                        <input
                            type="text"
                            placeholder="Search by Employee..."
                            value={createdByQuery}
                            onChange={(e) => setCreatedByQuery(e.target.value)}
                            className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary min-w-[180px]"
                        />
                    </div>
                    <span className="text-xs text-text-tertiary ml-auto">{activeFilterCount} active filters</span>
                </FilterBar>

                {/* Column Toggles */}
                <Section variant="card" title="Export Columns" headerBorder>
                    <div className="flex items-center gap-2 mb-3">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedColumns((prev) => {
                            const next = { ...prev };
                            columns.forEach((col) => { next[col.key] = true; });
                            return next;
                        })}>Select All</Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedColumns((prev) => {
                            const next = { ...prev };
                            columns.forEach((col) => { next[col.key] = false; });
                            return next;
                        })}>Clear All</Button>
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
                                    checked={selectedColumns[col.key]}
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
