import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { FETCH_ALL_LIMIT } from '../../lib/constants';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Download, Loader2, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { formatCompanyDate, resolveCompanyCurrency, toDateInputValue } from '../../lib/companySettings';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

type DatePreset = 'all' | 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';
type ColumnKey =
    | 'paymentNo'
    | 'paymentDate'
    | 'supplier'
    | 'invoiceNo'
    | 'warehouse'
    | 'amount'
    | 'paymentMethod'
    | 'referenceNo'
    | 'status'
    | 'createdBy';

const columns: { key: ColumnKey; label: string }[] = [
    { key: 'paymentNo', label: 'Payment No' },
    { key: 'paymentDate', label: 'Payment Date' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'invoiceNo', label: 'Purchase Invoice' },
    { key: 'warehouse', label: 'Warehouse / Branch' },
    { key: 'amount', label: 'Amount' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'referenceNo', label: 'Reference No' },
    { key: 'status', label: 'Status' },
    { key: 'createdBy', label: 'Created By' },
];

type PurchasePaymentRow = {
    id: string;
    paymentNo: string;
    paymentDate?: string;
    amount: number;
    paymentMethod?: string;
    referenceNo?: string | null;
    status?: string;
    supplierId?: string;
    purchaseInvoiceId?: string;
    purchaseInvoice?: { id: string; purchaseNo?: string; grandTotal?: number } | null;
    supplier?: { id: string; name: string; supplierCode?: string } | null;
    branch?: { id: string; name: string; code?: string } | null;
    createdBy?: { id: string; name: string } | null;
};

type PurchasePaymentsData = {
    summary?: {
        count?: number;
        totalAmount?: number;
        averageAmount?: number;
        uniqueSuppliers?: number;
        uniqueInvoices?: number;
    };
    payments?: PurchasePaymentRow[];
};

type PurchasePaymentsFilterOptions = {
    invoices: {
        id: string;
        purchaseNo: string;
        supplierId: string;
        branchId: string;
        createdAt: string;
        supplier?: { id: string; name: string } | null;
        branch?: { id: string; name: string } | null;
    }[];
    paymentMethods: string[];
    statuses: string[];
};

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function methodLabel(method?: string | null) {
    const clean = String(method || '').trim();
    if (!clean) return '';
    return clean.replace(/_/g, ' ');
}

function statusLabel(value: string) {
    if (value === 'POSTED') return 'Posted';
    if (value === 'VOID') return 'Void';
    if (value === 'ALL') return 'All Statuses';
    return value;
}

export default function PurchasePaymentsReport() {
    const company = useAuthStore((s) => s.user?.company);
    const currency = resolveCompanyCurrency(company);

    const [branchId, setBranchId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [purchaseInvoiceId, setPurchaseInvoiceId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [status, setStatus] = useState('POSTED');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [search, setSearch] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<Record<ColumnKey, boolean>>({
        paymentNo: true,
        paymentDate: true,
        supplier: true,
        invoiceNo: true,
        warehouse: true,
        amount: true,
        paymentMethod: true,
        referenceNo: true,
        status: true,
        createdBy: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-purchase-payments'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers-report-purchase-payments'],
        queryFn: () => api.get('/suppliers', { params: { limit: FETCH_ALL_LIMIT } }).then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: filterOptions } = useQuery({
        queryKey: ['purchase-payments-filter-options', branchId, supplierId],
        queryFn: () =>
            api
                .get('/reports/purchase-payments-filter-options', {
                    params: {
                        branchId: branchId || undefined,
                        supplierId: supplierId || undefined,
                    },
                })
                .then((r) => r.data.data as PurchasePaymentsFilterOptions),
    });

    const { data: reportData, isLoading } = useQuery({
        queryKey: ['report-purchase-payments', branchId, supplierId, purchaseInvoiceId, paymentMethod, status, dateFrom, dateTo, search],
        queryFn: () =>
            api
                .get('/reports/purchase-payments-report', {
                    params: {
                        branchId: branchId || undefined,
                        supplierId: supplierId || undefined,
                        purchaseInvoiceId: purchaseInvoiceId || undefined,
                        paymentMethod: paymentMethod || undefined,
                        status: status || undefined,
                        dateFrom: dateFrom || undefined,
                        dateTo: dateTo || undefined,
                        search: search.trim() || undefined,
                    },
                })
                .then((r) => r.data.data as PurchasePaymentsData),
    });

    const invoiceOptions = useMemo(
        () =>
            (filterOptions?.invoices || []).map((inv) => ({
                value: inv.id,
                label: `${inv.purchaseNo} - ${inv.supplier?.name || 'Unknown Supplier'}`,
            })),
        [filterOptions]
    );

    const paymentMethodOptions = useMemo(
        () =>
            (filterOptions?.paymentMethods || []).map((method) => ({
                value: method,
                label: methodLabel(method) || method,
            })),
        [filterOptions]
    );

    const statusOptions = useMemo(
        () =>
            (filterOptions?.statuses || ['POSTED', 'VOID', 'ALL']).map((s) => ({
                value: s,
                label: statusLabel(s),
            })),
        [filterOptions]
    );

    useEffect(() => {
        if (purchaseInvoiceId && !invoiceOptions.some((o) => o.value === purchaseInvoiceId)) {
            setPurchaseInvoiceId('');
        }
    }, [purchaseInvoiceId, invoiceOptions]);

    useEffect(() => {
        if (paymentMethod && !paymentMethodOptions.some((o) => o.value === paymentMethod)) {
            setPaymentMethod('');
        }
    }, [paymentMethod, paymentMethodOptions]);

    useEffect(() => {
        if (status && !statusOptions.some((o) => o.value === status)) {
            setStatus('POSTED');
        }
    }, [status, statusOptions]);

    const rows = reportData?.payments || [];
    const previewRows = rows.slice(0, 12);
    const selectedColCount = columns.filter((c) => selectedColumns[c.key]).length;
    const activeFilterCount = [branchId, supplierId, purchaseInvoiceId, paymentMethod, status, dateFrom || dateTo, search.trim()].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || 'All Suppliers';
    const invoiceName = invoiceOptions.find((o) => o.value === purchaseInvoiceId)?.label || 'All Purchase Invoices';
    const methodName = paymentMethodOptions.find((o) => o.value === paymentMethod)?.label || 'All Methods';
    const formatRangeDate = (value: string) => (value ? formatCompanyDate(value, company) : 'Any');
    const dateLabel = dateFrom || dateTo ? `${formatRangeDate(dateFrom)} to ${formatRangeDate(dateTo)}` : 'All Time';
    const statusName = statusLabel(status || 'POSTED');

    const applyPreset = (preset: DatePreset) => {
        const now = new Date();
        const today = toDateInputValue(now, company);
        setDatePreset(preset);
        if (preset === 'all') {
            setDateFrom('');
            setDateTo('');
            return;
        }
        if (preset === 'today') {
            setDateFrom(today);
            setDateTo(today);
            return;
        }
        if (preset === 'last7') {
            const start = new Date(now);
            start.setDate(start.getDate() - 6);
            setDateFrom(toDateInputValue(start, company));
            setDateTo(today);
            return;
        }
        if (preset === 'thisMonth') {
            setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1), company));
            setDateTo(today);
            return;
        }
        if (preset === 'lastMonth') {
            setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 1, 1), company));
            setDateTo(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 0), company));
            return;
        }
    };

    const toggleColumn = (key: ColumnKey) => setSelectedColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    const setAllColumns = (value: boolean) =>
        setSelectedColumns((prev) => {
            const next = { ...prev };
            columns.forEach((col) => {
                next[col.key] = value;
            });
            return next;
        });

    const handleExport = async () => {
        if (!reportData) return;
        setIsExporting(true);
        try {
            const excelCols: ExcelColumn[] = [];
            if (selectedColumns.paymentNo) excelCols.push({ key: 'paymentNo', header: 'Payment No', width: 20 });
            if (selectedColumns.paymentDate) excelCols.push({ key: 'paymentDate', header: 'Payment Date', width: 18 });
            if (selectedColumns.supplier) excelCols.push({ key: 'supplier', header: 'Supplier', width: 30 });
            if (selectedColumns.invoiceNo) excelCols.push({ key: 'invoiceNo', header: 'Purchase Invoice', width: 22 });
            if (selectedColumns.warehouse) excelCols.push({ key: 'warehouse', header: 'Warehouse / Branch', width: 22 });
            if (selectedColumns.amount) excelCols.push({ key: 'amount', header: 'Amount', type: 'currency', width: 16 });
            if (selectedColumns.paymentMethod) excelCols.push({ key: 'paymentMethod', header: 'Payment Method', width: 20 });
            if (selectedColumns.referenceNo) excelCols.push({ key: 'referenceNo', header: 'Reference No', width: 20 });
            if (selectedColumns.status) excelCols.push({ key: 'status', header: 'Status', width: 14 });
            if (selectedColumns.createdBy) excelCols.push({ key: 'createdBy', header: 'Created By', width: 22 });

            const exportRows = rows.map((p) => {
                const row: Record<string, any> = {};
                if (selectedColumns.paymentNo) row.paymentNo = p.paymentNo || '';
                if (selectedColumns.paymentDate) row.paymentDate = p.paymentDate ? formatCompanyDate(p.paymentDate, company) : '';
                if (selectedColumns.supplier) row.supplier = p.supplier?.name || '';
                if (selectedColumns.invoiceNo) row.invoiceNo = p.purchaseInvoice?.purchaseNo || '';
                if (selectedColumns.warehouse) row.warehouse = p.branch?.name || '';
                if (selectedColumns.amount) row.amount = Number(p.amount || 0);
                if (selectedColumns.paymentMethod) row.paymentMethod = methodLabel(p.paymentMethod) || '';
                if (selectedColumns.referenceNo) row.referenceNo = p.referenceNo || '';
                if (selectedColumns.status) row.status = p.status || '';
                if (selectedColumns.createdBy) row.createdBy = p.createdBy?.name || '';
                return row;
            });

            await exportExcel({
                fileName: `purchase-payments-${toDateInputValue(undefined, company)}.xlsx`,
                sheetName: 'Purchase Payments',
                title: 'Purchase Payments Report',
                filters: {
                    'Branch': branchName,
                    'Supplier': supplierName,
                    'Purchase Invoice': invoiceName,
                    'Payment Method': methodName,
                    'Status': statusName,
                    'Date Range': dateLabel,
                    'Search': search.trim() || 'None',
                    'Active Filters': String(activeFilterCount),
                    'Currency': currency,
                },
                columns: excelCols,
                rows: exportRows,
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <PageTemplate
            title="Purchase Payments Report"
            subtitle="Unified report layout with chip-based filters and export-ready columns."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Purchase Payments Report' },
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
                        <Select
                            options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
                            value={supplierId}
                            onChange={(e) => setSupplierId(e.target.value)}
                            placeholder="Supplier"
                            className="min-w-[180px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Purchase Invoices' }, ...invoiceOptions]}
                            value={purchaseInvoiceId}
                            onChange={(e) => setPurchaseInvoiceId(e.target.value)}
                            placeholder="Invoice"
                            className="min-w-[200px]"
                        />
                        <Select
                            options={[{ value: '', label: 'All Methods' }, ...paymentMethodOptions]}
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            placeholder="Payment Method"
                            className="min-w-[160px]"
                        />
                        <Select
                            options={statusOptions}
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            placeholder="Status"
                            className="min-w-[140px]"
                        />
                        <div className="flex items-center gap-1">
                            {(['all', 'today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className={`rounded-lg border px-2 py-1.5 text-xs font-bold uppercase ${datePreset === preset ? 'border-brand bg-brand text-white' : 'border-border bg-background-card text-text-secondary hover:bg-background-subtle'}`}
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
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search size={15} className="absolute left-3 top-2.5 text-text-tertiary" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search payment no, reference no, supplier, invoice..."
                                className="w-full h-10 rounded-lg border border-border bg-background-card pl-9 pr-3 text-sm text-text-primary"
                            />
                        </div>
                    </div>
                    <span className="text-xs text-text-tertiary ml-auto">{activeFilterCount} active filters</span>
                </FilterBar>

                {/* Column Toggles */}
                <Section variant="card" title="Export Columns" headerBorder>
                    <div className="flex items-center gap-2 mb-3">
                        <Button size="sm" variant="ghost" onClick={() => setAllColumns(true)}>Select All</Button>
                        <Button size="sm" variant="ghost" onClick={() => setAllColumns(false)}>Clear All</Button>
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

                {/* KPI Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <KpiCard label="Total Payments" value={Number(reportData?.summary?.count || 0)} />
                    <KpiCard label="Total Amount" value={money(Number(reportData?.summary?.totalAmount || 0), currency)} />
                    <KpiCard label="Average Payment" value={money(Number(reportData?.summary?.averageAmount || 0), currency)} />
                    <KpiCard label="Suppliers" value={Number(reportData?.summary?.uniqueSuppliers || 0)} />
                    <KpiCard label="Invoices" value={Number(reportData?.summary?.uniqueInvoices || 0)} />
                </div>

                {/* Preview Table */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                <tr>
                                    <th className="px-4 py-3 text-left">Payment No</th>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Supplier</th>
                                    <th className="px-4 py-3 text-left">Invoice</th>
                                    <th className="px-4 py-3 text-left">Warehouse</th>
                                    <th className="px-4 py-3 text-left">Method</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">No payments found for selected filters.</td></tr>}
                                {previewRows.map((p) => (
                                    <tr key={p.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{p.paymentNo || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{p.paymentDate ? formatCompanyDate(p.paymentDate, company) : '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{p.supplier?.name || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{p.purchaseInvoice?.purchaseNo || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{p.branch?.name || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{methodLabel(p.paymentMethod) || '-'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(Number(p.amount || 0), currency)}</td>
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
