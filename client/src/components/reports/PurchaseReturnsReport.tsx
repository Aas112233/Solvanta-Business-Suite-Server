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
    | 'returnNo'
    | 'returnDate'
    | 'supplier'
    | 'invoiceNo'
    | 'warehouse'
    | 'amount'
    | 'taxTotal'
    | 'status'
    | 'itemCount'
    | 'reason'
    | 'createdBy';

const columns: { key: ColumnKey; label: string }[] = [
    { key: 'returnNo', label: 'Return No' },
    { key: 'returnDate', label: 'Return Date' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'invoiceNo', label: 'Linked Invoice' },
    { key: 'warehouse', label: 'Warehouse / Branch' },
    { key: 'amount', label: 'Return Amount' },
    { key: 'taxTotal', label: 'Tax Amount' },
    { key: 'status', label: 'Status' },
    { key: 'itemCount', label: 'Items Count' },
    { key: 'reason', label: 'Reason' },
    { key: 'createdBy', label: 'Created By' },
];

type PurchaseReturnRow = {
    id: string;
    returnNo: string;
    createdAt?: string;
    grandTotal: number;
    taxTotal: number;
    reason?: string | null;
    notes?: string | null;
    status?: string;
    supplierId?: string;
    purchaseInvoiceId?: string;
    purchaseInvoice?: { id: string; purchaseNo?: string } | null;
    supplier?: { id: string; name: string; supplierCode?: string } | null;
    branch?: { id: string; name: string; code?: string } | null;
    createdBy?: { id: string; name: string } | null;
    _count?: { items?: number };
};

type PurchaseReturnsData = {
    summary?: {
        count?: number;
        totalAmount?: number;
        totalTax?: number;
        averageAmount?: number;
        uniqueSuppliers?: number;
        uniqueInvoices?: number;
    };
    returns?: PurchaseReturnRow[];
};

type PurchaseReturnsFilterOptions = {
    invoices: {
        id: string;
        purchaseNo: string;
        supplierName: string;
        branchName: string;
    }[];
    statuses: string[];
};

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function statusLabel(value: string) {
    if (value === 'POSTED') return 'Posted';
    if (value === 'CANCELLED') return 'Cancelled';
    if (value === 'DRAFT') return 'Draft';
    if (value === 'ALL') return 'All Statuses';
    return value;
}

export default function PurchaseReturnsReport() {
    const company = useAuthStore((s) => s.user?.company);
    const currency = resolveCompanyCurrency(company);

    const [branchId, setBranchId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [purchaseInvoiceId, setPurchaseInvoiceId] = useState('');
    const [status, setStatus] = useState('POSTED');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [search, setSearch] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<Record<ColumnKey, boolean>>({
        returnNo: true,
        returnDate: true,
        supplier: true,
        invoiceNo: true,
        warehouse: true,
        amount: true,
        taxTotal: true,
        status: true,
        itemCount: true,
        reason: true,
        createdBy: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-purchase-returns'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers-report-purchase-returns'],
        queryFn: () => api.get('/suppliers', { params: { limit: FETCH_ALL_LIMIT } }).then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: filterOptions } = useQuery({
        queryKey: ['purchase-returns-filter-options', branchId, supplierId],
        queryFn: () =>
            api
                .get('/reports/purchase-returns-filter-options', {
                    params: {
                        branchId: branchId || undefined,
                        supplierId: supplierId || undefined,
                    },
                })
                .then((r) => r.data.data as PurchaseReturnsFilterOptions),
    });

    const { data: reportData, isLoading } = useQuery({
        queryKey: ['report-purchase-returns', branchId, supplierId, purchaseInvoiceId, status, dateFrom, dateTo, search],
        queryFn: () =>
            api
                .get('/reports/purchase-returns-report', {
                    params: {
                        branchId: branchId || undefined,
                        supplierId: supplierId || undefined,
                        purchaseInvoiceId: purchaseInvoiceId || undefined,
                        status: status || undefined,
                        dateFrom: dateFrom || undefined,
                        dateTo: dateTo || undefined,
                        search: search.trim() || undefined,
                    },
                })
                .then((r) => r.data.data as PurchaseReturnsData),
    });

    const invoiceOptions = useMemo(
        () =>
            (filterOptions?.invoices || []).map((inv) => ({
                value: inv.id,
                label: `${inv.purchaseNo} - ${inv.supplierName || 'Unknown Supplier'}`,
            })),
        [filterOptions]
    );

    const statusOptions = useMemo(
        () =>
            (filterOptions?.statuses || ['POSTED', 'CANCELLED', 'DRAFT', 'ALL']).map((s) => ({
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
        if (status && !statusOptions.some((o) => o.value === status)) {
            setStatus('POSTED');
        }
    }, [status, statusOptions]);

    const rows = reportData?.returns || [];
    const previewRows = rows.slice(0, 12);
    const selectedColCount = columns.filter((c) => selectedColumns[c.key]).length;
    const activeFilterCount = [branchId, supplierId, purchaseInvoiceId, status, dateFrom || dateTo, search.trim()].filter(Boolean).length;
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || 'All Suppliers';
    const invoiceName = invoiceOptions.find((o) => o.value === purchaseInvoiceId)?.label || 'All Invoices';
    const statusName = statusLabel(status || 'POSTED');
    const formatRangeDate = (value: string) => (value ? formatCompanyDate(value, company) : 'Any');
    const dateLabel = dateFrom || dateTo ? `${formatRangeDate(dateFrom)} to ${formatRangeDate(dateTo)}` : 'All Time';

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
            if (selectedColumns.returnNo) excelCols.push({ key: 'returnNo', header: 'Return No', width: 20 });
            if (selectedColumns.returnDate) excelCols.push({ key: 'returnDate', header: 'Return Date', width: 18 });
            if (selectedColumns.supplier) excelCols.push({ key: 'supplier', header: 'Supplier', width: 30 });
            if (selectedColumns.invoiceNo) excelCols.push({ key: 'invoiceNo', header: 'Linked Invoice', width: 20 });
            if (selectedColumns.warehouse) excelCols.push({ key: 'warehouse', header: 'Warehouse / Branch', width: 22 });
            if (selectedColumns.amount) excelCols.push({ key: 'amount', header: 'Return Amount', type: 'currency', width: 16 });
            if (selectedColumns.taxTotal) excelCols.push({ key: 'taxTotal', header: 'Tax Amount', type: 'currency', width: 16 });
            if (selectedColumns.status) excelCols.push({ key: 'status', header: 'Status', width: 14 });
            if (selectedColumns.itemCount) excelCols.push({ key: 'itemCount', header: 'Items Count', type: 'number', width: 14 });
            if (selectedColumns.reason) excelCols.push({ key: 'reason', header: 'Reason', width: 30 });
            if (selectedColumns.createdBy) excelCols.push({ key: 'createdBy', header: 'Created By', width: 22 });

            const exportRows = rows.map((r) => {
                const row: Record<string, any> = {};
                if (selectedColumns.returnNo) row.returnNo = r.returnNo || '';
                if (selectedColumns.returnDate) row.returnDate = r.createdAt ? formatCompanyDate(r.createdAt, company) : '';
                if (selectedColumns.supplier) row.supplier = r.supplier?.name || '';
                if (selectedColumns.invoiceNo) row.invoiceNo = r.purchaseInvoice?.purchaseNo || '';
                if (selectedColumns.warehouse) row.warehouse = r.branch?.name || '';
                if (selectedColumns.amount) row.amount = Number(r.grandTotal || 0);
                if (selectedColumns.taxTotal) row.taxTotal = Number(r.taxTotal || 0);
                if (selectedColumns.status) row.status = r.status || '';
                if (selectedColumns.itemCount) row.itemCount = Number(r._count?.items || 0);
                if (selectedColumns.reason) row.reason = r.reason || r.notes || '';
                if (selectedColumns.createdBy) row.createdBy = r.createdBy?.name || '';
                return row;
            });

            await exportExcel({
                fileName: `purchase-returns-${toDateInputValue(undefined, company)}.xlsx`,
                sheetName: 'Purchase Returns',
                title: 'Purchase Returns Report',
                filters: {
                    'Branch': branchName,
                    'Supplier': supplierName,
                    'Invoice': invoiceName,
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
            title="Purchase Returns Report"
            subtitle="Unified report layout with advanced filters and column-based export."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'Purchase Returns Report' },
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
                            options={[{ value: '', label: 'All Invoices' }, ...invoiceOptions]}
                            value={purchaseInvoiceId}
                            onChange={(e) => setPurchaseInvoiceId(e.target.value)}
                            placeholder="Invoice"
                            className="min-w-[200px]"
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
                                placeholder="Search return no, supplier, invoice no, reason..."
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
                    <KpiCard label="Total Returns" value={Number(reportData?.summary?.count || 0)} />
                    <KpiCard label="Return Amount" value={money(Number(reportData?.summary?.totalAmount || 0), currency)} />
                    <KpiCard label="Tax Amount" value={money(Number(reportData?.summary?.totalTax || 0), currency)} />
                    <KpiCard label="Suppliers" value={Number(reportData?.summary?.uniqueSuppliers || 0)} />
                    <KpiCard label="Invoices" value={Number(reportData?.summary?.uniqueInvoices || 0)} />
                </div>

                {/* Preview Table */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                <tr>
                                    <th className="px-4 py-3 text-left">Return No</th>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Supplier</th>
                                    <th className="px-4 py-3 text-left">Invoice</th>
                                    <th className="px-4 py-3 text-left">Warehouse</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">No returns found for selected filters.</td></tr>}
                                {previewRows.map((r) => (
                                    <tr key={r.id} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{r.returnNo || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{r.createdAt ? formatCompanyDate(r.createdAt, company) : '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{r.supplier?.name || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{r.purchaseInvoice?.purchaseNo || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{r.branch?.name || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{statusLabel(r.status || '') || '-'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(Number(r.grandTotal || 0), currency)}</td>
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
