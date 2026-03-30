import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckSquare, FileSpreadsheet, FileText, Filter, Loader2, Search, Square, Warehouse } from 'lucide-react';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import Pagination from '../ui/Pagination';
import DateRangeFilter from '../ui/DateRangeFilter';
import { getSalesCustomerDisplay } from '../../lib/salesCustomerDisplay';
import { exportExcel, exportPdfFromHtml } from '../../lib/fileExport';
import toast from 'react-hot-toast';
import AppDropdown from '../ui/AppDropdown';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
} from '../../lib/globalStrings';

type InvoiceSelectionMode = 'all' | 'single' | 'multiple';
type PostedFilterMode = 'all' | 'posted';

interface ReportFilters {
    search: string;
    startDate: string;
    endDate: string;
    branchId: string;
    paymentMethod: string;
    postedOnly: PostedFilterMode;
    mode: InvoiceSelectionMode;
    selectedInvoiceIds: string[];
}

interface BranchOption {
    id: string;
    name: string;
    code?: string | null;
}

interface InvoiceOption {
    id: string;
    invoiceNo: string;
    createdAt: string;
    grandTotal: number;
    paymentMethod?: string | null;
    isPosted: boolean;
    branch?: { id: string; name: string; code?: string | null } | null;
    customer?: { id: string; name?: string | null; phone?: string | null } | null;
    loyaltyCustomer?: { id: string; name?: string | null; phone?: string | null } | null;
}

interface InvoiceItemRow {
    id: string;
    invoiceNo: string;
    invoiceDate: string;
    paymentMethod?: string | null;
    invoiceStatus?: string | null;
    invoicePosted: boolean;
    branch?: { id: string; name: string; code?: string | null } | null;
    customer?: { id: string; name?: string | null; phone?: string | null } | null;
    loyaltyCustomer?: { id: string; name?: string | null; phone?: string | null } | null;
    product?: { id: string; itemCode?: string | null; name?: string | null; nameArabic?: string | null } | null;
    unitCode: string;
    qty: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    taxAmount: number;
    grandTotal: number;
}

interface ReportSummary {
    lineCount: number;
    totalQty: number;
    subtotal: number;
    taxTotal: number;
    grandTotal: number;
}

interface ReportPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface ReportResponse {
    data: InvoiceItemRow[];
    meta?: {
        summary?: ReportSummary;
        pagination?: ReportPagination;
    };
}

const createDefaultFilters = (): ReportFilters => {
    const today = new Date().toISOString().slice(0, 10);
    return {
        search: '',
        startDate: '',
        endDate: today,
        branchId: '',
        paymentMethod: '',
        postedOnly: 'all',
        mode: 'all',
        selectedInvoiceIds: [],
    };
};

const normalizeFilters = (filters: ReportFilters): ReportFilters => {
    let selectedIds = filters.selectedInvoiceIds;
    if (filters.mode === 'all') selectedIds = [];
    if (filters.mode === 'single') selectedIds = selectedIds.length > 0 ? [selectedIds[0]] : [];

    return {
        ...filters,
        search: filters.search.trim(),
        selectedInvoiceIds: selectedIds,
    };
};

export default function SalesInvoiceItemsReport() {
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
    const [invoiceLookupSearch, setInvoiceLookupSearch] = useState('');
    const [draftFilters, setDraftFilters] = useState<ReportFilters>(createDefaultFilters);
    const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(createDefaultFilters);

    const { data: branches = [] } = useQuery<BranchOption[]>({
        queryKey: ['branches-sales-invoice-items-report'],
        queryFn: () => api.get('/branches').then((res) => res.data.data),
    });

    const { data: globalPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.salePaymentMethods],
        queryFn: () => api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.salePaymentMethods}`).then((r) => r.data.data),
    });

    const paymentMethodOptions = useMemo(
        () => buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_SALE_PAYMENT_METHOD_OPTIONS, { blankLabel: 'All Methods' }),
        [globalPaymentMethods]
    );

    const { data: invoiceOptions = [], isFetching: isFetchingInvoiceOptions } = useQuery<InvoiceOption[]>({
        queryKey: [
            'report-sales-invoice-options',
            draftFilters.branchId,
            draftFilters.startDate,
            draftFilters.endDate,
            invoiceLookupSearch,
            draftFilters.mode,
        ],
        queryFn: () => api.get('/reports/sales-invoice-options', {
            params: {
                branchId: draftFilters.branchId || undefined,
                dateFrom: draftFilters.startDate || undefined,
                dateTo: draftFilters.endDate || undefined,
                search: invoiceLookupSearch.trim() || undefined,
                limit: 120,
            },
        }).then((res) => res.data.data),
        enabled: draftFilters.mode !== 'all',
    });

    const { data, isLoading, isFetching } = useQuery<ReportResponse>({
        queryKey: ['report-sales-invoice-items', hasAppliedFilters, page, limit, appliedFilters],
        queryFn: () => api.get('/reports/sales-invoice-items', {
            params: {
                page,
                limit,
                search: appliedFilters.search || undefined,
                dateFrom: appliedFilters.startDate || undefined,
                dateTo: appliedFilters.endDate || undefined,
                branchId: appliedFilters.branchId || undefined,
                paymentMethod: appliedFilters.paymentMethod || undefined,
                postedOnly: appliedFilters.postedOnly === 'posted' ? true : undefined,
                invoiceIds: appliedFilters.selectedInvoiceIds.length > 0
                    ? appliedFilters.selectedInvoiceIds.join(',')
                    : undefined,
            },
        }).then((res) => res.data),
        enabled: hasAppliedFilters,
    });

    const rows = data?.data || [];
    const summary = data?.meta?.summary;
    const pagination = data?.meta?.pagination;

    const applyFilters = () => {
        setPage(1);
        setAppliedFilters(normalizeFilters(draftFilters));
        setHasAppliedFilters(true);
    };

    const onModeChange = (mode: InvoiceSelectionMode) => {
        setDraftFilters((prev) => {
            if (mode === 'all') return { ...prev, mode, selectedInvoiceIds: [] };
            if (mode === 'single') return { ...prev, mode, selectedInvoiceIds: prev.selectedInvoiceIds.slice(0, 1) };
            return { ...prev, mode };
        });
    };

    const toggleInvoiceSelection = (invoiceId: string) => {
        setDraftFilters((prev) => {
            if (prev.mode === 'single') {
                return { ...prev, selectedInvoiceIds: [invoiceId] };
            }
            const already = prev.selectedInvoiceIds.includes(invoiceId);
            return {
                ...prev,
                selectedInvoiceIds: already
                    ? prev.selectedInvoiceIds.filter((id) => id !== invoiceId)
                    : [...prev.selectedInvoiceIds, invoiceId],
            };
        });
    };

    const visibleInvoiceIds = useMemo(
        () => invoiceOptions.map((inv) => inv.id),
        [invoiceOptions]
    );

    const selectAllVisibleInvoices = () => {
        setDraftFilters((prev) => ({
            ...prev,
            selectedInvoiceIds: Array.from(new Set([...prev.selectedInvoiceIds, ...visibleInvoiceIds])),
        }));
    };

    const clearSelectedInvoices = () => {
        setDraftFilters((prev) => ({ ...prev, selectedInvoiceIds: [] }));
    };

    const buildReportParams = (filters: ReportFilters, exportPage: number, exportLimit: number) => ({
        page: exportPage,
        limit: exportLimit,
        search: filters.search || undefined,
        dateFrom: filters.startDate || undefined,
        dateTo: filters.endDate || undefined,
        branchId: filters.branchId || undefined,
        paymentMethod: filters.paymentMethod || undefined,
        postedOnly: filters.postedOnly === 'posted' ? true : undefined,
        invoiceIds: filters.selectedInvoiceIds.length > 0
            ? filters.selectedInvoiceIds.join(',')
            : undefined,
    });

    const fetchAllRowsForExport = async (): Promise<InvoiceItemRow[]> => {
        const exportLimit = 200;
        let exportPage = 1;
        let totalPages = 1;
        const collected: InvoiceItemRow[] = [];

        do {
            const response = await api.get('/reports/sales-invoice-items', {
                params: buildReportParams(appliedFilters, exportPage, exportLimit),
            });
            const payload: ReportResponse = response.data;
            collected.push(...(payload.data || []));
            totalPages = payload?.meta?.pagination?.totalPages || 1;
            exportPage += 1;
        } while (exportPage <= totalPages);

        return collected;
    };

    const exportFilterSummary = () => {
        const branchLabel = branches.find((branch) => branch.id === appliedFilters.branchId)?.name || 'All Warehouses';
        const invoiceScope = appliedFilters.mode === 'all'
            ? 'All Invoices'
            : appliedFilters.mode === 'single'
                ? 'Single Invoice'
                : `Multiple Invoices (${appliedFilters.selectedInvoiceIds.length})`;

        return {
            'Warehouse': branchLabel,
            'Period Start': appliedFilters.startDate || 'Not Set',
            'Period End': appliedFilters.endDate || 'Not Set',
            'Invoice Scope': invoiceScope,
            'Payment Method': appliedFilters.paymentMethod || 'All Methods',
            'Invoice State': appliedFilters.postedOnly === 'posted' ? 'Posted Only' : 'All',
            'Search': appliedFilters.search || 'None',
            'Currency': currency,
        };
    };

    const handleExportExcel = async () => {
        if (!hasAppliedFilters) {
            toast.error('Apply filters first to generate report export');
            return;
        }
        try {
            setIsExportingExcel(true);
            const exportRows = await fetchAllRowsForExport();
            if (exportRows.length === 0) {
                toast.error('No data available to export for current filters');
                return;
            }

            await exportExcel({
                fileName: `sales-invoice-items-${new Date().toISOString().slice(0, 10)}.xlsx`,
                sheetName: 'Sales Invoice Items',
                title: 'Sales Invoice Items Report',
                companyName,
                filters: exportFilterSummary(),
                columns: [
                    { key: 'invoiceNo', header: 'Invoice #', width: 20 },
                    { key: 'invoiceDate', header: 'Date', type: 'datetime', width: 20, split: true },
                    { key: 'warehouse', header: 'Warehouse', width: 24 },
                    { key: 'customer', header: 'Customer', width: 30 },
                    { key: 'itemCode', header: 'Item Code', width: 20 },
                    { key: 'itemName', header: 'Item Name', width: 32 },
                    { key: 'unitCode', header: 'Unit', width: 14 },
                    { key: 'qty', header: 'Qty', type: 'number', width: 12 },
                    { key: 'unitPrice', header: 'Unit Price', type: 'currency', width: 14 },
                    { key: 'lineTotal', header: 'Net', type: 'currency', width: 14 },
                    { key: 'taxAmount', header: 'Tax', type: 'currency', width: 14 },
                    { key: 'grandTotal', header: 'Total', type: 'currency', width: 14 },
                ],
                rows: exportRows.map((row) => ({
                    invoiceNo: row.invoiceNo,
                    invoiceDate: row.invoiceDate,
                    warehouse: row.branch?.name || '-',
                    customer: getSalesCustomerDisplay(row).title,
                    itemCode: row.product?.itemCode || '',
                    itemName: row.product?.name || 'Unnamed Item',
                    unitCode: row.unitCode || '',
                    qty: Number(row.qty || 0),
                    unitPrice: Number(row.unitPrice || 0),
                    lineTotal: Number(row.lineTotal || 0),
                    taxAmount: Number(row.taxAmount || 0),
                    grandTotal: Number(row.grandTotal || 0),
                })),
            });

            toast.success('Excel report downloaded');
        } catch (error) {
            console.error('Failed to export excel', error);
            toast.error('Failed to export Excel report');
        } finally {
            setIsExportingExcel(false);
        }
    };

    const escapeHtml = (value: unknown) =>
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const handleExportPdf = async () => {
        if (!hasAppliedFilters) {
            toast.error('Apply filters first to generate report export');
            return;
        }
        try {
            setIsExportingPdf(true);
            const exportRows = await fetchAllRowsForExport();
            if (exportRows.length === 0) {
                toast.error('No data available to export for current filters');
                return;
            }

            const totals = exportRows.reduce(
                (acc, row) => {
                    acc.qty += Number(row.qty || 0);
                    acc.net += Number(row.lineTotal || 0);
                    acc.tax += Number(row.taxAmount || 0);
                    acc.total += Number(row.grandTotal || 0);
                    return acc;
                },
                { qty: 0, net: 0, tax: 0, total: 0 }
            );

            const filterSummary = exportFilterSummary();
            const filterRowsHtml = Object.entries(filterSummary)
                .map(([key, value]) => `
                    <tr>
                        <td class="meta-key">${escapeHtml(key)}</td>
                        <td class="meta-val">${escapeHtml(value)}</td>
                    </tr>
                `)
                .join('');

            const lineCardsHtml = exportRows.map((row, index) => {
                const customer = getSalesCustomerDisplay(row);
                const invoiceDate = row.invoiceDate ? format(new Date(row.invoiceDate), 'dd/MM/yyyy') : '-';
                return `
                    <article class="line-card">
                        <div class="line-head">
                            <div class="line-badge">Line ${index + 1}</div>
                            <div class="line-title">${escapeHtml(row.invoiceNo)}</div>
                            <div class="line-date">${escapeHtml(invoiceDate)}</div>
                        </div>
                        <div class="line-grid">
                            <div class="line-cell">
                                <div class="cell-k">Item</div>
                                <div class="cell-v">${escapeHtml(row.product?.name || 'Unnamed Item')}</div>
                                <div class="cell-sub">${escapeHtml(row.product?.itemCode || '-')}</div>
                            </div>
                            <div class="line-cell">
                                <div class="cell-k">Warehouse</div>
                                <div class="cell-v">${escapeHtml(row.branch?.name || '-')}</div>
                            </div>
                            <div class="line-cell">
                                <div class="cell-k">Customer</div>
                                <div class="cell-v">${escapeHtml(customer.title)}</div>
                            </div>
                            <div class="line-cell">
                                <div class="cell-k">Unit</div>
                                <div class="cell-v">${escapeHtml(row.unitCode || '-')}</div>
                            </div>
                        </div>
                        <table class="amount-table">
                            <thead>
                                <tr>
                                    <th>Qty</th>
                                    <th>Unit Price</th>
                                    <th>Net</th>
                                    <th>Tax</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="num">${Number(row.qty || 0).toLocaleString()}</td>
                                    <td class="num">${Number(row.unitPrice || 0).toLocaleString()} ${escapeHtml(currency)}</td>
                                    <td class="num">${Number(row.lineTotal || 0).toLocaleString()} ${escapeHtml(currency)}</td>
                                    <td class="num">${Number(row.taxAmount || 0).toLocaleString()} ${escapeHtml(currency)}</td>
                                    <td class="num total">${Number(row.grandTotal || 0).toLocaleString()} ${escapeHtml(currency)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div class="line-foot">${escapeHtml(row.paymentMethod || '-')} • ${row.invoicePosted ? 'Posted' : 'Unposted'}</div>
                    </article>
                `;
            }).join('');

            const styles = `
                @page { size: A4 portrait; margin: 10mm; }
                * { box-sizing: border-box; }
                body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; font-size: 10px; }
                .wrap { width: 100%; padding: 0; }
                .header { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 8px; }
                .title-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
                h1 { margin: 0; font-size: 15px; font-weight: 700; }
                .company { color: #475569; font-size: 9px; }
                .generated { font-size: 9px; color: #64748b; }
                .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
                .meta-table td { border: 1px solid #e2e8f0; padding: 4px 6px; font-size: 8.5px; }
                .meta-key { width: 34%; font-weight: 700; background: #f8fafc; }
                .meta-val { color: #334155; }
                .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
                .summary-table td { border: 1px solid #e2e8f0; padding: 6px; }
                .summary-label { font-size: 8px; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px; }
                .summary-value { font-size: 12px; font-weight: 700; color: #0f172a; }
                .lines { display: block; }
                .line-card { border: 1px solid #dbe3ee; border-radius: 8px; margin-bottom: 8px; padding: 7px; page-break-inside: avoid; break-inside: avoid; }
                .line-head { display: grid; grid-template-columns: 78px 1fr auto; gap: 8px; align-items: center; margin-bottom: 6px; }
                .line-badge { font-size: 8px; text-transform: uppercase; font-weight: 700; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 999px; padding: 2px 6px; text-align: center; }
                .line-title { font-weight: 700; font-size: 10px; }
                .line-date { font-size: 9px; color: #475569; }
                .line-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; }
                .line-cell { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; min-height: 44px; }
                .cell-k { font-size: 7.8px; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
                .cell-v { font-size: 9.3px; font-weight: 700; line-height: 1.25; }
                .cell-sub { font-size: 8px; color: #64748b; margin-top: 2px; }
                .amount-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 5px; }
                .amount-table th, .amount-table td { border: 1px solid #e2e8f0; padding: 4px 5px; font-size: 8.3px; }
                .amount-table th { text-transform: uppercase; font-size: 7.6px; letter-spacing: 0.03em; background: #f8fafc; text-align: left; }
                .num { text-align: right; }
                .total { font-weight: 700; color: #1d4ed8; }
                .line-foot { font-size: 8px; color: #64748b; text-align: right; }
            `;

            const html = `
                <div class="wrap">
                    <div class="header">
                        <div class="title-row">
                            <h1>Sales Invoice Items Report</h1>
                            <div class="generated">Generated: ${escapeHtml(format(new Date(), 'dd/MM/yyyy HH:mm'))}</div>
                        </div>
                        <div class="company">${escapeHtml(companyName)}</div>
                    </div>

                    <table class="meta-table">
                        <tbody>${filterRowsHtml}</tbody>
                    </table>

                    <table class="summary-table">
                        <tbody>
                            <tr>
                                <td><span class="summary-label">Lines</span><span class="summary-value">${exportRows.length.toLocaleString()}</span></td>
                                <td><span class="summary-label">Total Qty</span><span class="summary-value">${totals.qty.toLocaleString()}</span></td>
                                <td><span class="summary-label">Subtotal</span><span class="summary-value">${totals.net.toLocaleString()} ${escapeHtml(currency)}</span></td>
                                <td><span class="summary-label">Grand Total</span><span class="summary-value">${totals.total.toLocaleString()} ${escapeHtml(currency)}</span></td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="lines">${lineCardsHtml}</div>
                </div>
            `;

            await exportPdfFromHtml({
                fileName: `sales-invoice-items-${new Date().toISOString().slice(0, 10)}.pdf`,
                documentTitle: 'Sales Invoice Items Report',
                orientation: 'portrait',
                format: 'a4',
                styles,
                html,
                scale: 1,
                marginMm: 10,
            });

            toast.success('PDF report downloaded');
        } catch (error) {
            console.error('Failed to export pdf', error);
            toast.error('Failed to export PDF report');
        } finally {
            setIsExportingPdf(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Sales Invoice Items</h1>
                    <p className="text-sm text-gray-500">Invoice-level item report with period, warehouse, and invoice selection filters.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Item Lines</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary?.lineCount || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Qty</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary?.totalQty || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Subtotal</p>
                    <p className="text-xl font-semibold text-gray-900">{Number(summary?.subtotal || 0).toLocaleString()} {currency}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Grand Total</p>
                    <p className="text-xl font-semibold text-blue-700">{Number(summary?.grandTotal || 0).toLocaleString()} {currency}</p>
                </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            value={draftFilters.search}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, search: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                            placeholder="Search invoice, item, customer, phone..."
                            className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
                        />
                    </div>

                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <Warehouse size={14} className="text-gray-500" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Warehouse</span>
                        <AppDropdown
                            value={draftFilters.branchId}
                            onChange={(v) => setDraftFilters(prev => ({ ...prev, branchId: v }))}
                            options={[{ value: '', label: 'All Warehouses' }, ...branches.map((branch: any) => ({ value: branch.id, label: branch.name }))]}
                            placeholder='All Warehouses'
                            searchable
                        />
                    </div>

                    <DateRangeFilter
                        startDate={draftFilters.startDate}
                        endDate={draftFilters.endDate}
                        onChange={(start, end) => setDraftFilters((prev) => ({ ...prev, startDate: start, endDate: end }))}
                        onClear={() => setDraftFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))}
                    />
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice Selection</p>
                        <AppDropdown
                            value={draftFilters.mode}
                            onChange={(v) => setDraftFilters(prev => ({ ...prev, mode: v as InvoiceSelectionMode }))}
                            options={[{ value: 'all', label: 'All Invoices' }, { value: 'single', label: 'Single Invoice' }, { value: 'multiple', label: 'Multiple Invoices' }]}
                            placeholder='All Invoices'
                        />
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Method</p>
                        <AppDropdown
                            value={draftFilters.paymentMethod}
                            onChange={(v) => setDraftFilters(prev => ({ ...prev, paymentMethod: v }))}
                            options={paymentMethodOptions}
                            placeholder='All Methods'
                        />
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice State</p>
                        <AppDropdown
                            value={draftFilters.postedOnly}
                            onChange={(v) => setDraftFilters(prev => ({ ...prev, postedOnly: v as PostedFilterMode }))}
                            options={[{ value: 'all', label: 'All' }, { value: 'posted', label: 'Posted Only' }]}
                            placeholder='All'
                        />
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={applyFilters}
                            disabled={isFetching}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
                        >
                            {isFetching ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
                            {isFetching ? 'Loading...' : 'Apply Filters'}
                        </button>
                    </div>
                </div>

                {draftFilters.mode !== 'all' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">
                                    {draftFilters.mode === 'single' ? 'Select Single Invoice' : 'Select Multiple Invoices'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Available invoices are filtered by selected period and warehouse.
                                </p>
                            </div>
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    value={invoiceLookupSearch}
                                    onChange={(e) => setInvoiceLookupSearch(e.target.value)}
                                    placeholder="Search invoice options..."
                                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        {draftFilters.mode === 'single' ? (
                            <AppDropdown
                                value={draftFilters.selectedInvoiceIds[0] || ''}
                                onChange={(v) => { if (v) toggleInvoiceSelection(v); }}
                                options={[{ value: '', label: 'Select an invoice' }, ...invoiceOptions.map((inv: any) => ({ value: inv.id, label: `${inv.invoiceNo} • ${format(new Date(inv.createdAt), 'dd/MM/yyyy')} • ${Number(inv.grandTotal || 0).toLocaleString()} ${currency}` }))]}
                                placeholder='Select an invoice'
                                searchable
                            />
                        ) : (
                            <>
                                <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                                    <span>{draftFilters.selectedInvoiceIds.length} invoice(s) selected</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={selectAllVisibleInvoices}
                                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                        >
                                            Select Visible
                                        </button>
                                        <button
                                            type="button"
                                            onClick={clearSelectedInvoices}
                                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white">
                                    {isFetchingInvoiceOptions ? (
                                        <div className="px-3 py-8 text-center text-sm text-gray-500">
                                            <Loader2 size={16} className="mx-auto mb-2 animate-spin" />
                                            Loading invoice options...
                                        </div>
                                    ) : invoiceOptions.length === 0 ? (
                                        <div className="px-3 py-8 text-center text-sm text-gray-500">
                                            No invoices found for selected filters.
                                        </div>
                                    ) : (
                                        invoiceOptions.map((inv) => {
                                            const checked = draftFilters.selectedInvoiceIds.includes(inv.id);
                                            const customerLabel = getSalesCustomerDisplay(inv).title;
                                            return (
                                                <button
                                                    key={inv.id}
                                                    type="button"
                                                    onClick={() => toggleInvoiceSelection(inv.id)}
                                                    className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2 text-left hover:bg-blue-50"
                                                >
                                                    {checked ? (
                                                        <CheckSquare size={16} className="text-blue-600" />
                                                    ) : (
                                                        <Square size={16} className="text-gray-300" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-gray-900">
                                                            {inv.invoiceNo} • {customerLabel}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {format(new Date(inv.createdAt), 'dd/MM/yyyy')} • {inv.branch?.name || '-'} • {Number(inv.grandTotal || 0).toLocaleString()} {currency}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-gray-900">Download Report</p>
                        <p className="text-xs text-gray-500">Export this report with current applied filters as Excel or PDF.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            disabled={!hasAppliedFilters || isExportingExcel || isExportingPdf || isLoading || isFetching}
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isExportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                            {isExportingExcel ? 'Exporting Excel...' : 'Download Excel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleExportPdf}
                            disabled={!hasAppliedFilters || isExportingPdf || isExportingExcel || isLoading || isFetching}
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isExportingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                            {isExportingPdf ? 'Exporting PDF...' : 'Download PDF'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                <th className="px-4 py-3">Invoice</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Warehouse</th>
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3">Item</th>
                                <th className="px-4 py-3">Unit</th>
                                <th className="px-4 py-3 text-right">Qty</th>
                                <th className="px-4 py-3 text-right">Unit Price</th>
                                <th className="px-4 py-3 text-right">Net</th>
                                <th className="px-4 py-3 text-right">Tax</th>
                                <th className="px-4 py-3 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(isLoading || isFetching) && rows.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                                        <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                                        Loading sales invoice item report...
                                    </td>
                                </tr>
                            ) : !hasAppliedFilters ? (
                                <tr>
                                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                                        Apply filters to load sales invoice items report data.
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                                        No invoice items found for the selected filters.
                                    </td>
                                </tr>
                            ) : rows.map((row) => {
                                const customer = getSalesCustomerDisplay(row);
                                return (
                                    <tr key={row.id} className="border-b border-gray-50">
                                        <td className="px-4 py-3">
                                            <p className="font-mono text-xs font-semibold text-gray-900">{row.invoiceNo}</p>
                                            <p className="text-[11px] text-gray-500">{row.paymentMethod || '-'} • {row.invoicePosted ? 'Posted' : 'Unposted'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {row.invoiceDate ? format(new Date(row.invoiceDate), 'MMM dd, yyyy') : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{row.branch?.name || '-'}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-gray-900">{customer.title}</p>
                                            <p className="text-xs text-gray-500">{customer.detail || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-gray-900">{row.product?.name || 'Unnamed Item'}</p>
                                            <p className="text-xs text-gray-500">{row.product?.itemCode || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">{row.unitCode || '-'}</td>
                                        <td className="px-4 py-3 text-right text-gray-900">{Number(row.qty || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-gray-900">{Number(row.unitPrice || 0).toLocaleString()} {currency}</td>
                                        <td className="px-4 py-3 text-right text-gray-900">{Number(row.lineTotal || 0).toLocaleString()} {currency}</td>
                                        <td className="px-4 py-3 text-right text-gray-900">{Number(row.taxAmount || 0).toLocaleString()} {currency}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-blue-700">{Number(row.grandTotal || 0).toLocaleString()} {currency}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {hasAppliedFilters && pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.total}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={setLimit}
                        isLoading={isFetching}
                    />
                )}
            </div>
        </div >
    );
}
