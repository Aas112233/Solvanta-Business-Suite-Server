import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { exportExcel } from '../../lib/fileExport';
import type { ExcelColumn } from '../../lib/excelReport';
import { Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_CURRENCY } from '../../lib/constants';
import { PageTemplate, Section, KpiCard, Button, FilterBar, Select } from '../ui';

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
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
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
        <PageTemplate
            title="VAT Report"
            subtitle="Output/Input VAT summary with invoice-level drilldown and VAT rate analysis."
            breadcrumb={[
                { label: 'Home', href: '/' },
                { label: 'Reports', href: '/reports' },
                { label: 'VAT Report' },
            ]}
            action={
                <Button
                    variant="primary"
                    size="sm"
                    icon={isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    onClick={handleExport}
                    disabled={isExporting || entries.length === 0}
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
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                max={todayISO()}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                            />
                            <span className="text-text-tertiary text-sm">to</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                max={todayISO()}
                                className="h-10 rounded-lg border border-border bg-background-card px-3 text-sm text-text-primary"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                            <input
                                type="checkbox"
                                checked={postedOnly}
                                onChange={(e) => setPostedOnly(e.target.checked)}
                                className="rounded border-border text-brand focus:ring-brand-200"
                            />
                            Posted Only
                        </label>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <KpiCard label="Output VAT (Sales)" value={money(Number(summary.outputVAT || 0), currency)} />
                    <KpiCard label="Input VAT (Purchases)" value={money(Number(summary.inputVAT || 0), currency)} />
                    <KpiCard label={`Net VAT (${summary.netStatus || 'PAYABLE'})`} value={money(Number(summary.netVAT || 0), currency)} />
                    <KpiCard label="Taxable Sales" value={money(Number(summary.taxableSales || 0), currency)} />
                    <KpiCard label="Taxable Purchases" value={money(Number(summary.taxablePurchases || 0), currency)} />
                    <KpiCard label="Documents" value={Number(summary.totalDocuments || 0).toLocaleString()} />
                </div>

                {/* VAT by Rate Table */}
                <Section title="VAT by Effective Rate" variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
                                <tr>
                                    <th className="px-4 py-3 text-left">VAT %</th>
                                    <th className="px-4 py-3 text-right">Sales Taxable</th>
                                    <th className="px-4 py-3 text-right">Sales VAT</th>
                                    <th className="px-4 py-3 text-right">Purchase Taxable</th>
                                    <th className="px-4 py-3 text-right">Purchase VAT</th>
                                    <th className="px-4 py-3 text-right">Net VAT</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {mergedRates.length === 0 && (
                                    <tr><td colSpan={6} className="px-4 py-8 text-center text-text-tertiary">No VAT rate rows for selected filters.</td></tr>
                                )}
                                {mergedRates.map((row) => (
                                    <tr key={row.rate} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.rate.toFixed(2)}%</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{money(row.salesTaxable, currency)}</td>
                                        <td className="px-4 py-3 text-right text-danger">{money(row.salesVAT, currency)}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{money(row.purchasesTaxable, currency)}</td>
                                        <td className="px-4 py-3 text-right text-text-brand">{money(row.purchasesVAT, currency)}</td>
                                        <td className={`px-4 py-3 text-right font-semibold ${row.salesVAT - row.purchasesVAT >= 0 ? 'text-danger' : 'text-success'}`}>
                                            {money(row.salesVAT - row.purchasesVAT, currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                {/* Entries Preview */}
                <Section title={`Live Preview (${previewRows.length})`} variant="card" headerBorder>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-background-subtle text-xs uppercase tracking-wider text-text-tertiary">
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
                            <tbody className="divide-y divide-border">
                                {previewRows.length === 0 && (
                                    <tr><td colSpan={9} className="px-4 py-8 text-center text-text-tertiary">No VAT entries for selected filters.</td></tr>
                                )}
                                {previewRows.map((row) => (
                                    <tr key={`${row.source}-${row.id}`} className="hover:bg-background-subtle transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-primary">{row.source === 'SALES' ? 'Sales' : 'Purchase'}</td>
                                        <td className="px-4 py-3 text-text-primary">{row.docNo}</td>
                                        <td className="px-4 py-3 text-text-secondary">{formatDate(row.date)}</td>
                                        <td className="px-4 py-3 text-text-primary">{row.party || '-'}</td>
                                        <td className="px-4 py-3 text-text-secondary">{row.branchName || '-'}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{money(row.taxableAmount, currency)}</td>
                                        <td className={`px-4 py-3 text-right font-semibold ${row.source === 'SALES' ? 'text-danger' : 'text-text-brand'}`}>
                                            {money(row.vatAmount, currency)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-text-primary">{money(row.grossAmount, currency)}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary">{Number(row.effectiveRate || 0).toFixed(2)}%</td>
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
