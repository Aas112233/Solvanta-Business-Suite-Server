import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import {
    Building2,
    Calculator,
    CalendarRange,
    CheckSquare,
    Download,
    Filter,
    Loader2,
    Square,
    X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import AppDropdown from '../ui/AppDropdown';

type FilterPanel = 'date' | 'branch' | 'options' | 'columns' | null;
type ColumnKey =
    | 'source'
    | 'docNo'
    | 'date'
    | 'party'
    | 'partyCode'
    | 'branchName'
    | 'taxableAmount'
    | 'vatAmount'
    | 'grossAmount'
    | 'effectiveRate'
    | 'status'
    | 'isPosted';

type VatEntry = {
    id: string;
    source: 'SALES' | 'PURCHASE';
    docNo: string;
    date: string;
    party: string;
    partyCode: string;
    branchName: string;
    taxableAmount: number;
    vatAmount: number;
    grossAmount: number;
    effectiveRate: number;
    status: string;
    isPosted: boolean;
};

type VatRateRow = {
    rate: number;
    taxableAmount: number;
    vatAmount: number;
    grossAmount: number;
};

type VatData = {
    summary?: {
        outputVAT?: number;
        inputVAT?: number;
        netVAT?: number;
        netStatus?: 'PAYABLE' | 'REFUNDABLE';
        taxableSales?: number;
        taxablePurchases?: number;
        totalSales?: number;
        totalPurchases?: number;
        salesDocuments?: number;
        purchaseDocuments?: number;
        totalDocuments?: number;
        dateFrom?: string;
        dateTo?: string;
        postedOnly?: boolean;
    };
    entries?: VatEntry[];
    byRate?: {
        sales?: VatRateRow[];
        purchases?: VatRateRow[];
    };
};

const columns: { key: ColumnKey; label: string }[] = [
    { key: 'source', label: 'Source' },
    { key: 'docNo', label: 'Document No' },
    { key: 'date', label: 'Date' },
    { key: 'party', label: 'Party' },
    { key: 'partyCode', label: 'Party Code' },
    { key: 'branchName', label: 'Warehouse / Branch' },
    { key: 'taxableAmount', label: 'Taxable Amount' },
    { key: 'vatAmount', label: 'VAT Amount' },
    { key: 'grossAmount', label: 'Gross Amount' },
    { key: 'effectiveRate', label: 'Effective VAT %' },
    { key: 'status', label: 'Status' },
    { key: 'isPosted', label: 'Posted' },
];

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function money(value: number, currency: string) {
    return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function formatDate(value: string | Date) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toISOString().slice(0, 10);
}

export default function VATReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const [panel, setPanel] = useState<FilterPanel>(null);
    const [dateFrom, setDateFrom] = useState(monthStartISO());
    const [dateTo, setDateTo] = useState(todayISO());
    const [branchId, setBranchId] = useState('');
    const [postedOnly, setPostedOnly] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [selectedColumns, setSelectedColumns] = useState<Record<ColumnKey, boolean>>({
        source: true,
        docNo: true,
        date: true,
        party: true,
        partyCode: true,
        branchName: true,
        taxableAmount: true,
        vatAmount: true,
        grossAmount: true,
        effectiveRate: true,
        status: true,
        isPosted: true,
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['branches-report-vat'],
        queryFn: () => api.get('/branches').then((r) => r.data.data as { id: string; name: string }[]),
    });

    const { data: vatData, isLoading } = useQuery({
        queryKey: ['report-vat', dateFrom, dateTo, branchId, postedOnly],
        queryFn: () =>
            api.get('/reports/vat', {
                params: {
                    dateFrom,
                    dateTo,
                    branchId: branchId || undefined,
                    postedOnly,
                },
            }).then((r) => r.data.data as VatData),
        enabled: !!dateFrom && !!dateTo,
    });

    const entries = vatData?.entries || [];
    const previewRows = entries.slice(0, 12);
    const summary = vatData?.summary || {};
    const branchName = branches.find((b) => b.id === branchId)?.name || 'All Warehouses';
    const selectedColCount = columns.filter((col) => selectedColumns[col.key]).length;
    const activeFilterCount = [branchId, postedOnly ? 'posted' : '', dateFrom, dateTo].filter(Boolean).length;

    const mergedRates = useMemo(() => {
        const sales = vatData?.byRate?.sales || [];
        const purchases = vatData?.byRate?.purchases || [];
        const map = new Map<number, {
            rate: number;
            salesTaxable: number;
            salesVAT: number;
            purchasesTaxable: number;
            purchasesVAT: number;
        }>();

        sales.forEach((row) => {
            const existing = map.get(row.rate) || {
                rate: row.rate,
                salesTaxable: 0,
                salesVAT: 0,
                purchasesTaxable: 0,
                purchasesVAT: 0,
            };
            existing.salesTaxable += Number(row.taxableAmount || 0);
            existing.salesVAT += Number(row.vatAmount || 0);
            map.set(row.rate, existing);
        });
        purchases.forEach((row) => {
            const existing = map.get(row.rate) || {
                rate: row.rate,
                salesTaxable: 0,
                salesVAT: 0,
                purchasesTaxable: 0,
                purchasesVAT: 0,
            };
            existing.purchasesTaxable += Number(row.taxableAmount || 0);
            existing.purchasesVAT += Number(row.vatAmount || 0);
            map.set(row.rate, existing);
        });

        return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
    }, [vatData]);

    const toggleColumn = (key: ColumnKey) => setSelectedColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    const setAllColumns = (value: boolean) => {
        setSelectedColumns((prev) => {
            const next = { ...prev };
            columns.forEach((col) => { next[col.key] = value; });
            return next;
        });
    };

    const handleExport = async () => {
        if (entries.length === 0) return;
        setIsExporting(true);
        try {
            const excelCols: ExcelColumn[] = [];
            if (selectedColumns.source) excelCols.push({ key: 'source', header: 'Source', width: 12 });
            if (selectedColumns.docNo) excelCols.push({ key: 'docNo', header: 'Document No', width: 18 });
            if (selectedColumns.date) excelCols.push({ key: 'date', header: 'Date', width: 14 });
            if (selectedColumns.party) excelCols.push({ key: 'party', header: 'Party', width: 24 });
            if (selectedColumns.partyCode) excelCols.push({ key: 'partyCode', header: 'Party Code', width: 16 });
            if (selectedColumns.branchName) excelCols.push({ key: 'branchName', header: 'Warehouse / Branch', width: 20 });
            if (selectedColumns.taxableAmount) excelCols.push({ key: 'taxableAmount', header: 'Taxable Amount', type: 'currency', width: 16 });
            if (selectedColumns.vatAmount) excelCols.push({ key: 'vatAmount', header: 'VAT Amount', type: 'currency', width: 14 });
            if (selectedColumns.grossAmount) excelCols.push({ key: 'grossAmount', header: 'Gross Amount', type: 'currency', width: 16 });
            if (selectedColumns.effectiveRate) excelCols.push({ key: 'effectiveRate', header: 'Effective VAT %', type: 'number', width: 14 });
            if (selectedColumns.status) excelCols.push({ key: 'status', header: 'Status', width: 14 });
            if (selectedColumns.isPosted) excelCols.push({ key: 'isPosted', header: 'Posted', width: 10 });

            const exportRows = entries.map((row) => {
                const out: Record<string, any> = {};
                if (selectedColumns.source) out.source = row.source;
                if (selectedColumns.docNo) out.docNo = row.docNo;
                if (selectedColumns.date) out.date = formatDate(row.date);
                if (selectedColumns.party) out.party = row.party;
                if (selectedColumns.partyCode) out.partyCode = row.partyCode;
                if (selectedColumns.branchName) out.branchName = row.branchName;
                if (selectedColumns.taxableAmount) out.taxableAmount = Number(row.taxableAmount || 0);
                if (selectedColumns.vatAmount) out.vatAmount = Number(row.vatAmount || 0);
                if (selectedColumns.grossAmount) out.grossAmount = Number(row.grossAmount || 0);
                if (selectedColumns.effectiveRate) out.effectiveRate = Number(row.effectiveRate || 0);
                if (selectedColumns.status) out.status = row.status;
                if (selectedColumns.isPosted) out.isPosted = row.isPosted ? 'Yes' : 'No';
                return out;
            });

            await exportExcel({
                fileName: `vat-report-${dateFrom}-to-${dateTo}.xlsx`,
                sheetName: 'VAT Report',
                title: 'VAT Report',
                filters: {
                    'Date Range': `${dateFrom} to ${dateTo}`,
                    'Branch': branchName,
                    'Posted Only': postedOnly ? 'Yes' : 'No',
                    'Output VAT': money(Number(summary.outputVAT || 0), currency),
                    'Input VAT': money(Number(summary.inputVAT || 0), currency),
                    'Net VAT': money(Number(summary.netVAT || 0), currency),
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
                        <div className="rounded-xl bg-blue-600 p-2.5 text-white"><Calculator size={18} /></div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">VAT Report</h2>
                            <p className="text-sm text-slate-600">Output/Input VAT summary with invoice-level drilldown and VAT rate analysis.</p>
                        </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{activeFilterCount} active</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setPanel(panel === 'date' ? null : 'date')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarRange size={15} /> {dateFrom} to {dateTo}</button>
                        <button type="button" onClick={() => setPanel(panel === 'branch' ? null : 'branch')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 size={15} /> {branchName}</button>
                        <button type="button" onClick={() => setPanel(panel === 'options' ? null : 'options')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> {postedOnly ? 'Posted Only' : 'All Invoices'}</button>
                        <button type="button" onClick={() => setPanel(panel === 'columns' ? null : 'columns')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Filter size={15} /> Columns {selectedColCount}</button>
                    </div>

                    {panel && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-600">{panel} filter</p>
                                <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-slate-300 bg-white p-1 text-slate-500 hover:bg-slate-100"><X size={13} /></button>
                            </div>

                            {panel === 'date' && (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Date From</p>
                                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={todayISO()} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Date To</p>
                                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} max={todayISO()} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                    </div>
                                </div>
                            )}

                            {panel === 'branch' && (
                                <AppDropdown
                                    value={branchId}
                                    onChange={setBranchId}
                                    options={[{ value: '', label: 'All Warehouses' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                                    placeholder="Select warehouse"
                                    searchable
                                />
                            )}

                            {panel === 'options' && (
                                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={postedOnly}
                                        onChange={(e) => setPostedOnly(e.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Include only posted sales invoices
                                </label>
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Output VAT (Sales)</p><p className="mt-2 text-3xl font-black text-rose-600">{money(Number(summary.outputVAT || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Input VAT (Purchases)</p><p className="mt-2 text-3xl font-black text-blue-700">{money(Number(summary.inputVAT || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net VAT ({summary.netStatus || 'PAYABLE'})</p><p className={`mt-2 text-3xl font-black ${Number(summary.netVAT || 0) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(Number(summary.netVAT || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Taxable Sales</p><p className="mt-2 text-3xl font-black text-slate-900">{money(Number(summary.taxableSales || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Taxable Purchases</p><p className="mt-2 text-3xl font-black text-slate-900">{money(Number(summary.taxablePurchases || 0), currency)}</p></div>
                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Documents</p><p className="mt-2 text-3xl font-black text-slate-900">{Number(summary.totalDocuments || 0).toLocaleString()}</p></div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">VAT by Effective Rate</div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">VAT %</th>
                                        <th className="px-4 py-3 text-right">Sales Taxable</th>
                                        <th className="px-4 py-3 text-right">Sales VAT</th>
                                        <th className="px-4 py-3 text-right">Purchase Taxable</th>
                                        <th className="px-4 py-3 text-right">Purchase VAT</th>
                                        <th className="px-4 py-3 text-right">Net VAT</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {mergedRates.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No VAT rate rows for selected filters.</td></tr>}
                                    {mergedRates.map((row) => (
                                        <tr key={row.rate} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{row.rate.toFixed(2)}%</td>
                                            <td className="px-4 py-3 text-right text-slate-700">{money(row.salesTaxable, currency)}</td>
                                            <td className="px-4 py-3 text-right text-rose-700">{money(row.salesVAT, currency)}</td>
                                            <td className="px-4 py-3 text-right text-slate-700">{money(row.purchasesTaxable, currency)}</td>
                                            <td className="px-4 py-3 text-right text-blue-700">{money(row.purchasesVAT, currency)}</td>
                                            <td className={`px-4 py-3 text-right font-semibold ${row.salesVAT - row.purchasesVAT >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{money(row.salesVAT - row.purchasesVAT, currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-700">Live Preview ({previewRows.length})</div>
                            <button type="button" onClick={handleExport} disabled={isExporting || entries.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                                {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                {isExporting ? 'Generating...' : 'Export Excel'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Type</th>
                                        <th className="px-4 py-3 text-left">Doc No</th>
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Party</th>
                                        <th className="px-4 py-3 text-left">Branch</th>
                                        <th className="px-4 py-3 text-right">Taxable</th>
                                        <th className="px-4 py-3 text-right">VAT</th>
                                        <th className="px-4 py-3 text-right">Gross</th>
                                        <th className="px-4 py-3 text-right">VAT %</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {previewRows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No VAT entries for selected filters.</td></tr>}
                                    {previewRows.map((row) => (
                                        <tr key={`${row.source}-${row.id}`} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-semibold text-slate-800">{row.source === 'SALES' ? 'Sales' : 'Purchase'}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.docNo}</td>
                                            <td className="px-4 py-3 text-slate-700">{formatDate(row.date)}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.party || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{row.branchName || '-'}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{money(row.taxableAmount, currency)}</td>
                                            <td className={`px-4 py-3 text-right font-semibold ${row.source === 'SALES' ? 'text-rose-700' : 'text-blue-700'}`}>{money(row.vatAmount, currency)}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{money(row.grossAmount, currency)}</td>
                                            <td className="px-4 py-3 text-right text-slate-800">{Number(row.effectiveRate || 0).toFixed(2)}%</td>
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
