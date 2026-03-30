import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import {
    AlertTriangle,
    Building2,
    CalendarRange,
    CheckSquare,
    Download,
    FileText,
    Filter,
    Loader2,
    Search,
    Square,
    Truck,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'branch' | 'supplier' | 'date' | 'invoice' | 'status' | 'search' | 'columns' | null;
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

function toISODate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

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
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';

    const [panel, setPanel] = useState<FilterPanel>(null);
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
        queryFn: () => api.get('/suppliers', { params: { limit: 1000 } }).then((r) => r.data.data as { id: string; name: string }[]),
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
    const dateLabel = dateFrom || dateTo ? `${dateFrom || 'Any'} to ${dateTo || 'Any'}` : 'All Time';

    const applyPreset = (preset: DatePreset) => {
        const now = new Date();
        const today = toISODate(now);
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
            setDateFrom(toISODate(start));
            setDateTo(today);
            return;
        }
        if (preset === 'thisMonth') {
            setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
            setDateTo(today);
            return;
        }
        if (preset === 'lastMonth') {
            setDateFrom(toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setDateTo(toISODate(new Date(now.getFullYear(), now.getMonth(), 0)));
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
                if (selectedColumns.returnDate) row.returnDate = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
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
                fileName: `purchase-returns-${new Date().toISOString().slice(0, 10)}.xlsx`,
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
        <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><AlertTriangle size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Purchase Returns Report</h2>
                            <p className="text-sm text-slate-600">Unified report layout with advanced filters and column-based export.</p>
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
                                    options={[{ value: '', label: 'All Invoices' }, ...invoiceOptions]}
                                    placeholder="Select linked invoice"
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
                                        placeholder="Search return no, supplier, invoice no, reason..."
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
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Returns</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(reportData?.summary?.count || 0)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Return Amount</p><p className="mt-2 text-3xl font-black text-rose-600">{money(Number(reportData?.summary?.totalAmount || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tax Amount</p><p className="mt-2 text-3xl font-black text-amber-600">{money(Number(reportData?.summary?.totalTax || 0), currency)}</p></div>
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
                                        <th className="px-4 py-3 text-left">Return No</th>
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Supplier</th>
                                        <th className="px-4 py-3 text-left">Invoice</th>
                                        <th className="px-4 py-3 text-left">Warehouse</th>
                                        <th className="px-4 py-3 text-left">Status</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No returns found for selected filters.</td></tr>}
                                    {previewRows.map((r) => (
                                        <tr key={r.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{r.returnNo || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{r.supplier?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{r.purchaseInvoice?.purchaseNo || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{r.branch?.name || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{statusLabel(r.status || '') || '-'}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(Number(r.grandTotal || 0), currency)}</td>
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
