import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import {
    Building2,
    CalendarRange,
    CheckSquare,
    CreditCard,
    Download,
    FileText,
    Filter,
    Loader2,
    ReceiptText,
    Search,
    Square,
    Truck,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { formatCompanyDate, resolveCompanyCurrency, toDateInputValue } from '../../lib/companySettings';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'branch' | 'supplier' | 'date' | 'invoice' | 'method' | 'status' | 'search' | 'columns' | null;
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

    const [panel, setPanel] = useState<FilterPanel>(null);
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
        queryFn: () => api.get('/suppliers', { params: { limit: 1000 } }).then((r) => r.data.data as { id: string; name: string }[]),
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
        <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><ReceiptText size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Purchase Payments Report</h2>
                            <p className="text-sm text-slate-600">Unified report layout with chip-based filters and export-ready columns.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'supplier' ? null : 'supplier')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Truck size={15} /> {supplierName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'date' ? null : 'date')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarRange size={15} /> {dateLabel}</button>
                        <button type="button" onClick={() => setPanel(panel === 'invoice' ? null : 'invoice')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileText size={15} /> {invoiceName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'method' ? null : 'method')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CreditCard size={15} /> {methodName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'status' ? null : 'status')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> {statusName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'search' ? null : 'search')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Search size={15} /> {search.trim() ? `Search: ${search.trim()}` : 'No Search'}</button>
                        <button type="button" onClick={() => setPanel(panel === 'columns' ? null : 'columns')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Columns {selectedColCount}</button>
                    </div>

                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p>
                                <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button>
                            </div>

                            {panel === 'branch' && (
                                <AppDropdown
                                    value={branchId}
                                    onChange={setBranchId}
                                    options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                                    placeholder="Select warehouse"
                                    searchable
                                />
                            )}

                            {panel === 'supplier' && (
                                <AppDropdown
                                    value={supplierId}
                                    onChange={setSupplierId}
                                    options={[{ value: '', label: 'All Suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
                                    placeholder="Select supplier"
                                    searchable
                                />
                            )}

                            {panel === 'date' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                                        {(['all', 'today', 'last7', 'thisMonth', 'lastMonth'] as DatePreset[]).map((preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => applyPreset(preset)}
                                                className={`rounded-lg border px-2 py-1.5 text-xs font-bold uppercase ${datePreset === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                                            >
                                                {preset}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => {
                                                setDatePreset('custom');
                                                setDateFrom(e.target.value);
                                            }}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                        />
                                        <input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => {
                                                setDatePreset('custom');
                                                setDateTo(e.target.value);
                                            }}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                        />
                                    </div>
                                </div>
                            )}

                            {panel === 'invoice' && (
                                <AppDropdown
                                    value={purchaseInvoiceId}
                                    onChange={setPurchaseInvoiceId}
                                    options={[{ value: '', label: 'All Purchase Invoices' }, ...invoiceOptions]}
                                    placeholder="Select purchase invoice"
                                    searchable
                                />
                            )}

                            {panel === 'method' && (
                                <AppDropdown
                                    value={paymentMethod}
                                    onChange={setPaymentMethod}
                                    options={[{ value: '', label: 'All Methods' }, ...paymentMethodOptions]}
                                    placeholder="Select payment method"
                                    searchable
                                />
                            )}

                            {panel === 'status' && (
                                <AppDropdown
                                    value={status}
                                    onChange={setStatus}
                                    options={statusOptions}
                                    placeholder="Select status"
                                />
                            )}

                            {panel === 'search' && (
                                <div className="relative">
                                    <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search payment no, reference no, supplier, invoice..."
                                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm"
                                    />
                                </div>
                            )}

                            {panel === 'columns' && (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setAllColumns(true)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Select all</button>
                                        <button type="button" onClick={() => setAllColumns(false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Clear all</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                        {columns.map((col) => {
                                            const active = selectedColumns[col.key];
                                            return (
                                                <button key={col.key} type="button" onClick={() => toggleColumn(col.key)} className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-xs font-semibold ${active ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                                                    {active ? <CheckSquare size={13} /> : <Square size={13} />}
                                                    {col.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-10"><Loader2 size={24} className="animate-spin text-blue-600" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Payments</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.count || 0)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Amount</p><p className="mt-2 text-3xl font-black text-emerald-600">{money(Number(reportData?.summary?.totalAmount || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Payment</p><p className="mt-2 text-3xl font-black text-blue-700">{money(Number(reportData?.summary?.averageAmount || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Suppliers</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.uniqueSuppliers || 0)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Invoices</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.uniqueInvoices || 0)}</p></div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">Live Preview ({previewRows.length})</div>
                            <button type="button" onClick={handleExport} disabled={isExporting || !reportData} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                                {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                {isExporting ? 'Generating...' : 'Export Excel'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
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
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No payments found for selected filters.</td></tr>}
                                    {previewRows.map((p) => (
                                        <tr key={p.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{p.paymentNo || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600">{p.paymentDate ? formatCompanyDate(p.paymentDate, company) : '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{p.supplier?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{p.purchaseInvoice?.purchaseNo || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{p.branch?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{methodLabel(p.paymentMethod) || '-'}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(Number(p.amount || 0), currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
