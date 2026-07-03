import { useState } from 'react';
import { isCashType, isBankType, isCreditType, isMixedType } from '../../lib/globalStrings';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, DollarSign, Eye, FileSpreadsheet, Package, Plus, Printer } from 'lucide-react';
import { format } from 'date-fns';
import toast from '@/lib/toast';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../lib/api';
import { downloadPdfFromComponent, exportExcel, exportPdfFromHtml, printPdfFromComponent } from '../../lib/fileExport';
import {
    Badge,
    Button,
    Card,
    DateRangeFilter,
    FilterBar,
    PageHeader,
    PageLayout,
    Pagination,
    SearchInput,
    Select,
    StatCard,
    StatsGrid,
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableLoading,
    TableRow,
} from '../../components/ui';
import { InvoicePdfTemplate } from '../../components/sales/InvoicePdfTemplate';
import { getSalesCustomerDisplay, getSalesCustomerExportText, getSalesInvoiceDiscountBreakdown } from '../../lib/salesCustomerDisplay';
import InvoicePreviewModal from '../../components/sales/InvoicePreviewModal';
import { DEFAULT_CURRENCY } from '../../lib/constants';

const salesStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'PAID', label: 'Paid' },
    { value: 'UNPOSTED', label: 'Unposted' },
    { value: 'CREDIT', label: 'Credit' },
    { value: 'PARTIAL', label: 'Partial' },
    { value: 'VOID', label: 'Voided' },
    { value: 'REFUNDED', label: 'Refunded' },
];

const getInvoiceStatusVariant = (
    status: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' => {
    switch (status) {
        case 'PAID':
            return 'success';
        case 'UNPOSTED':
        case 'PARTIAL':
            return 'warning';
        case 'CREDIT':
            return 'brand';
        case 'VOID':
        case 'REFUNDED':
            return 'danger';
        default:
            return 'default';
    }
};

export default function SalesList() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);
    const [viewingInvoice, setViewingInvoice] = useState<any>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Filter inputs (not applied yet)
    const [dateRangeInput, setDateRangeInput] = useState({
        startDate: '',
        endDate: ''
    });
    const [searchInput, setSearchInput] = useState('');
    const [statusInput, setStatusInput] = useState('');

    // Applied queries
    const [queryParams, setQueryParams] = useState({
        search: '',
        startDate: '',
        endDate: '',
        status: ''
    });

    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';
    const activeBranchId = useAuthStore(s => s.activeBranchId);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-invoices', activeBranchId, queryParams, page, limit],
        queryFn: async () => {
            const res = await api.get('/sales/invoices', {
                params: {
                    search: queryParams.search.trim() || undefined,
                    status: queryParams.status || undefined,
                    page,
                    limit,
                    startDate: queryParams.startDate || undefined,
                    endDate: queryParams.endDate || undefined
                }
            });
            return res.data;
        }
    });

    const { data: summary } = useQuery({
        queryKey: ['sales-summary', activeBranchId, queryParams], // Use applied filter for summary too
        queryFn: async () => {
            const res = await api.get('/sales/summary', {
                params: {
                    startDate: queryParams.startDate || undefined,
                    endDate: queryParams.endDate || undefined
                }
            });
            return res.data.data;
        }
    });

    const filteredInvoices = data?.data || [];

    const handleApplyFilters = () => {
        setPage(1);
        setQueryParams({
            search: searchInput,
            startDate: dateRangeInput.startDate,
            endDate: dateRangeInput.endDate,
            status: statusInput
        });
    };

    const handleResetFilters = () => {
        setPage(1);
        setSearchInput('');
        setStatusInput('');
        setDateRangeInput({ startDate: '', endDate: '' });
        setQueryParams({
            search: '',
            startDate: '',
            endDate: '',
            status: '',
        });
    };

    const handleViewInvoice = async (invoiceId: string) => {
        try {
            const response = await api.get(`/sales/invoices/${invoiceId}`);
            setViewingInvoice(response.data.data);
        } catch (error) {
            console.error('Failed to load invoice details:', error);
            toast.error('Failed to load invoice details');
        }
    };

    const handleFocusUnposted = () => {
        setPage(1);
        setStatusInput('UNPOSTED');
        setQueryParams((previous) => ({ ...previous, status: 'UNPOSTED' }));
    };

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const exportLimit = 1000;
            let exportPage = 1;
            let totalPages = 1;
            const exportData: any[] = [];

            do {
                const res = await api.get('/sales/invoices', {
                    params: {
                        search: queryParams.search.trim() || undefined,
                        startDate: queryParams.startDate || undefined,
                        endDate: queryParams.endDate || undefined,
                        status: queryParams.status || undefined,
                        page: exportPage,
                        limit: exportLimit
                    }
                });

                const chunk = res.data?.data || [];
                exportData.push(...chunk);
                totalPages = res.data?.meta?.pagination?.totalPages || 1;
                exportPage += 1;
            } while (exportPage <= totalPages);

            if (exportData.length === 0) {
                toast.error('No data available to export for the selected period');
                return;
            }

            await exportExcel({
                fileName: `Sales_Report_${queryParams.startDate || 'all'}_${queryParams.endDate || 'all'}`,
                sheetName: 'Sales Journal',
                title: 'Sales Transaction Register',
                filters: {
                    'Period Start': queryParams.startDate || 'All',
                    'Period End': queryParams.endDate || 'All',
                    'Branch Context': activeBranchId ? `Branch ID: ${activeBranchId}` : 'All Branches',
                    'Search Filter': queryParams.search || 'None',
                    Status: queryParams.status || 'All'
                },
                columns: [
                    { key: 'invoiceNo', header: 'Invoice #', width: 22 },
                    { key: 'date', header: 'Transaction', width: 18, type: 'datetime', split: true },
                    { key: 'customer', header: 'Customer Entity', width: 30 },
                    { key: 'branch', header: 'Warehouse Outlet', width: 22 },
                    { key: 'paymentMethod', header: 'Pay Mode', width: 15 },
                    { key: 'status', header: 'Settlement', width: 15 },
                    { key: 'items', header: 'SKU Count', width: 12, type: 'number' },
                    { key: 'subtotal', header: 'Net Subtotal', width: 18, type: 'currency' },
                    { key: 'tax', header: 'VAT Total', width: 15, type: 'currency' },
                    { key: 'discount', header: 'Disc Total', width: 15, type: 'currency' },
                    { key: 'loyaltyDiscount', header: 'Loyalty Disc', width: 15, type: 'currency' },
                    { key: 'total', header: 'Invoice Total', width: 20, type: 'currency' }
                ],
                rows: exportData.map((inv: any) => ({
                    invoiceNo: inv.invoiceNo,
                    date: inv.createdAt, // Send date string/object
                    customer: getSalesCustomerExportText(inv),
                    branch: inv.branch?.name || '-',
                    paymentMethod: inv.paymentMethod,
                    status: inv.status,
                    items: inv._count?.items ?? inv.items?.length ?? 0,
                    subtotal: Number(inv.subtotal || 0),
                    tax: Number(inv.taxTotal || 0),
                    discount: Number(inv.discountTotal || 0),
                    loyaltyDiscount: getSalesInvoiceDiscountBreakdown(inv).loyaltyDiscount,
                    total: Number(inv.grandTotal || 0)
                }))
            });

            toast.success('Excel report downloaded successfully');
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to export data');
        } finally {
            setIsExporting(false);
        }
    };

    const esc = (value: any) =>
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const buildInvoiceRowsHtml = (invoice: any) =>
        (invoice.items || []).map((item: any) => {
            const qty = Number(item.qty || 0);
            const unitPriceExVat = Number(item.unitPrice || 0);
            const discount = Number(item.discount || 0);
            const grossExVat = Number((item.lineTotal ?? (qty * unitPriceExVat - discount)) || 0);
            const vatAmount = Number(item.taxAmount || 0);
            const totalInclVat = grossExVat + vatAmount;
            const unitMeta = item.product?.units?.find((u: any) => String(u.unitCode) === String(item.unitCode));
            const itemName = esc(item.product?.name || '-');
            const itemNameArabic = esc(item.product?.nameArabic || '');
            const itemNameHtml = itemNameArabic
                ? `<div style="font-weight:700;">${itemName}</div><div dir="rtl" style="font-size:11px;color:#0f172a;margin-top:2px;">${itemNameArabic}</div><div style="font-size:10px;color:#6b7280;">${esc(item.product?.itemCode || '')}</div>`
                : `<div style="font-weight:700;">${itemName}</div><div style="font-size:10px;color:#6b7280;">${esc(item.product?.itemCode || '')}</div>`;
            return `
                <tr>
                    <td>${itemNameHtml}</td>
                    <td style="text-align:center;">${esc(item.unitCode || '-')}</td>
                    <td style="text-align:center;">${esc(unitMeta?.unitName || '-')}</td>
                    <td style="text-align:center;">${qty}</td>
                    <td style="text-align:right;">${unitPriceExVat.toFixed(2)}</td>
                    <td style="text-align:right;">${grossExVat.toFixed(2)}</td>
                    <td style="text-align:right;">${vatAmount.toFixed(2)}</td>
                    <td style="text-align:right;">${totalInclVat.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

    const invoiceA4Styles = `
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Tahoma, 'Segoe UI', sans-serif; color: #0f172a; margin:0; }
        .sheet { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
        .header { display:flex; justify-content:space-between; align-items:flex-start; gap: 16px; margin-bottom:14px; }
        .title { font-size:24px; font-weight:800; margin:0; letter-spacing:0.4px; }
        .badge { padding:4px 8px; border:1px solid #cbd5e1; border-radius: 999px; font-size:11px; font-weight:700; display:inline-block; margin-top:4px; }
        .muted { color:#64748b; font-size:12px; }
        .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:12px 0; }
        .card { border:1px solid #e2e8f0; border-radius:10px; padding:10px; min-height:88px; }
        .card h4 { margin:0 0 6px; font-size:11px; text-transform:uppercase; color:#64748b; letter-spacing:0.08em; }
        .card p { margin:2px 0; font-size:12px; }
        table { width:100%; border-collapse:collapse; margin-top:8px; table-layout: fixed; }
        th, td { border:1px solid #e2e8f0; padding:6px; font-size:11px; vertical-align:top; white-space: normal; word-break: break-word; overflow-wrap: anywhere; }
        th { background:#f8fafc; text-align:left; font-weight:700; }
        .right { text-align:right; }
        .center { text-align:center; }
        .totals-wrap { display:grid; grid-template-columns:1fr 320px; gap:12px; margin-top:10px; }
        .totals { border:1px solid #e2e8f0; border-radius:10px; padding:10px; }
        .totals .row { display:flex; justify-content:space-between; padding:3px 0; font-size:12px; }
        .totals .grand { font-size:16px; font-weight:800; border-top:1px solid #e2e8f0; margin-top:6px; padding-top:7px; }
        .footnote { margin-top:8px; font-size:10px; color:#64748b; text-align:center; }
    `;

    const buildInvoiceDocumentHtml = (invoice: any) => {
        const netCash = Number(invoice.cashReceived || 0) - Number(invoice.changeGiven || 0);
        const cardApplied = invoice.paymentMethod === 'CARD'
            ? Number(invoice.grandTotal || 0)
            : invoice.paymentMethod === 'MIXED'
                ? Math.max(0, Number(invoice.grandTotal || 0) - Math.max(0, netCash))
                : 0;
        const customerDisplay = getSalesCustomerDisplay(invoice);
        const discountBreakdown = getSalesInvoiceDiscountBreakdown(invoice);

        return `
            <div class="sheet">
                <div class="header">
                    <div>
                        <h1 class="title">${esc(companyName)}</h1>
                        <div class="muted">Tax Invoice / Sales Invoice</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:18px;font-weight:800;">#${esc(invoice.invoiceNo)}</div>
                        <div class="muted">${esc(format(new Date(invoice.createdAt), 'MMM dd, yyyy HH:mm'))}</div>
                        <div class="badge">${esc(invoice.status || 'PAID')}</div>
                    </div>
                </div>
                <div class="meta-grid">
                    <div class="card">
                        <h4>Customer Details</h4>
                        <p><strong>Name:</strong> ${esc(customerDisplay.title)}</p>
                        <p><strong>Phone:</strong> ${esc(customerDisplay.isWalkInLoyalty ? customerDisplay.detail : (customerDisplay.detail || '-'))}</p>
                        <p><strong>Email:</strong> ${esc(invoice.customer?.email || '-')}</p>
                    </div>
                    <div class="card">
                        <h4>Invoice Details</h4>
                        <p><strong>Branch:</strong> ${esc(invoice.branch?.name || '-')} (${esc(invoice.branch?.code || '-')})</p>
                        <p><strong>Cashier:</strong> ${esc(invoice.createdBy?.name || '-')}</p>
                        <p><strong>Payment Method:</strong> ${esc(invoice.paymentMethod || '-')}</p>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width:24%">Item Name</th>
                            <th style="width:12%" class="center">Unit Code</th>
                            <th style="width:14%" class="center">Unit Name</th>
                            <th style="width:8%" class="center">Qty</th>
                            <th style="width:12%" class="right">Unit Price<br/>(Ex VAT)</th>
                            <th style="width:12%" class="right">Gross<br/>(Ex VAT)</th>
                            <th style="width:9%" class="right">VAT Amount</th>
                            <th style="width:9%" class="right">Total<br/>(Incl VAT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${buildInvoiceRowsHtml(invoice)}
                    </tbody>
                </table>
                <div class="totals-wrap">
                    <div class="card">
                        <h4>Payment Breakdown</h4>
                        <p><strong>Cash Received:</strong> ${Number(invoice.cashReceived || 0).toFixed(2)} ${esc(currency)}</p>
                        <p><strong>Card Applied:</strong> ${cardApplied.toFixed(2)} ${esc(currency)}</p>
                        <p><strong>Change Given:</strong> ${Number(invoice.changeGiven || 0).toFixed(2)} ${esc(currency)}</p>
                    </div>
                    <div class="totals">
                        <div class="row"><span>Subtotal (Ex VAT)</span><span>${Number(invoice.subtotal || 0).toFixed(2)} ${esc(currency)}</span></div>
                        ${discountBreakdown.standardDiscount > 0 ? `<div class="row"><span>Discount</span><span>-${discountBreakdown.standardDiscount.toFixed(2)} ${esc(currency)}</span></div>` : ''}
                        ${discountBreakdown.loyaltyDiscount > 0 ? `<div class="row"><span>Loyalty Discount</span><span>-${discountBreakdown.loyaltyDiscount.toFixed(2)} ${esc(currency)}</span></div>` : ''}
                        ${discountBreakdown.totalDiscount > 0 ? `<div class="row"><span>Total Discount</span><span>-${discountBreakdown.totalDiscount.toFixed(2)} ${esc(currency)}</span></div>` : ''}
                        <div class="row"><span>VAT</span><span>${Number(invoice.taxTotal || 0).toFixed(2)} ${esc(currency)}</span></div>
                        <div class="row grand"><span>Grand Total (Incl VAT)</span><span>${Number(invoice.grandTotal || 0).toFixed(2)} ${esc(currency)}</span></div>
                    </div>
                </div>
                <div class="footnote">
                    Generated by ${esc(companyName)} • ${esc(format(new Date(), 'MMM dd, yyyy HH:mm'))}
                </div>
            </div>
        `;
    };

    const handlePrintInvoiceA4 = async (invoice: any) => {
        if (!invoice) return;
        try {
            // If the invoice object doesn't have items (e.g. from list view), fetch details first
            let fullInvoice = invoice;
            if (!invoice.items || invoice.items.length === 0) {
                const res = await api.get(`/sales/invoices/${invoice.id}`);
                fullInvoice = res.data.data;
            }

            await printPdfFromComponent(
                <InvoicePdfTemplate invoice={fullInvoice} companyName={companyName} currency={currency} />
            );
        } catch (err) {
            console.error('Print failed:', err);
            toast.error('Failed to print invoice');
        }
    };

    const handleDownloadInvoicePdfA4 = async (invoice: any) => {
        if (!invoice) return;
        try {
            await downloadPdfFromComponent(
                `Invoice-${invoice.invoiceNo}.pdf`,
                <InvoicePdfTemplate invoice={invoice} companyName={companyName} currency={currency} />
            );
        } catch (err) {
            console.error('Vector PDF failed, falling back to raster', err);
            // Fallback to the previous method if something goes wrong
            await exportPdfFromHtml({
                fileName: `Invoice-${invoice.invoiceNo}.pdf`,
                documentTitle: `Invoice ${esc(invoice.invoiceNo)}`,
                styles: invoiceA4Styles,
                html: buildInvoiceDocumentHtml(invoice),
            });
        }
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Sales Invoices"
                subtitle="Track daily sales, preview invoice activity, and keep exports consistent across branches."
                action={
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            icon={<FileSpreadsheet size={16} />}
                            loading={isExporting}
                            onClick={handleExportExcel}
                        >
                            {isExporting ? 'Exporting...' : 'Export Excel'}
                        </Button>
                        <Button type="button" variant="outline" icon={<Printer size={16} />}>
                            Print Daily Report
                        </Button>
                        <Button
                            type="button"
                            icon={<Plus size={16} />}
                            onClick={() => navigate('/sales/invoices/new')}
                        >
                            New Invoice
                        </Button>
                    </div>
                }
            />

            <StatsGrid columns={3}>
                <StatCard
                    label="Total Revenue"
                    value={`${Number(summary?.totalRevenue || 0).toLocaleString()} ${currency}`}
                    sub="Revenue in the selected period"
                    icon={<DollarSign size={20} />}
                />
                <StatCard
                    label="Invoice Count"
                    value={summary?.totalInvoices || 0}
                    sub="Invoices returned by the current period"
                    icon={<FileSpreadsheet size={20} />}
                />
                <button type="button" className="text-left" onClick={handleFocusUnposted}>
                    <Card hoverable selected={queryParams.status === 'UNPOSTED'} className="h-full">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                    Pending Posting
                                </p>
                                <p className="mt-2 text-2xl font-bold tracking-tight text-text-primary">
                                    {summary?.unpostedInvoices || 0}
                                </p>
                                <p className="mt-1 text-xs text-text-tertiary">
                                    Tap to focus unposted invoices
                                </p>
                            </div>
                            <div className="rounded-lg bg-warning-soft p-3 text-warning">
                                <CalendarClock size={20} />
                            </div>
                        </div>
                    </Card>
                </button>
            </StatsGrid>

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchInput}
                        onChange={setSearchInput}
                        placeholder="Search by invoice number or customer"
                    />
                </div>
                <Select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value)}
                    options={salesStatusOptions}
                    placeholder=""
                    className="min-w-[180px]"
                />
                <DateRangeFilter
                    startDate={dateRangeInput.startDate}
                    endDate={dateRangeInput.endDate}
                    onChange={(start: string, end: string) => setDateRangeInput({ startDate: start, endDate: end })}
                    onClear={() => setDateRangeInput({ startDate: '', endDate: '' })}
                />
                <Button
                    type="button"
                    onClick={handleApplyFilters}
                    loading={isFetching}
                    icon={<Package size={16} />}
                >
                    Apply Filters
                </Button>
                <Button type="button" variant="ghost" onClick={handleResetFilters}>
                    Reset
                </Button>
            </FilterBar>

            <Card padding="none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead align="center">Method</TableHead>
                            <TableHead align="center">Status</TableHead>
                            <TableHead align="right">Total Amount</TableHead>
                            <TableHead align="center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={7} message="Loading invoices..." />
                        ) : filteredInvoices.length === 0 ? (
                            <TableEmpty
                                colSpan={7}
                                message={
                                    queryParams.search || queryParams.status || queryParams.startDate || queryParams.endDate
                                        ? 'No invoices match the current filters.'
                                        : 'No invoices have been created yet.'
                                }
                                icon={<Package size={40} className="text-text-tertiary" />}
                            />
                        ) : (
                            filteredInvoices.map((invoice: any) => {
                                const customerDisplay = getSalesCustomerDisplay(invoice);
                                const discountBreakdown = getSalesInvoiceDiscountBreakdown(invoice);

                                return (
                                    <TableRow key={invoice.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-semibold text-text-primary">{invoice.invoiceNo}</p>
                                                <p className="text-xs text-text-tertiary">
                                                    {invoice.branch?.name || 'No branch'}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium text-text-primary">
                                                    {format(new Date(invoice.createdAt), 'MMM dd, yyyy')}
                                                </p>
                                                <p className="text-xs text-text-tertiary">
                                                    {format(new Date(invoice.createdAt), 'HH:mm')}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium text-text-primary">
                                                    {customerDisplay.title}
                                                </p>
                                                {customerDisplay.detail && (
                                                    <p className="text-xs text-text-tertiary">
                                                        {customerDisplay.detail}
                                                    </p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Badge size="sm">{invoice.paymentMethod}</Badge>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Badge
                                                size="sm"
                                                variant={getInvoiceStatusVariant(invoice.status)}
                                                dot
                                            >
                                                {invoice.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell align="right">
                                            <div className="space-y-1">
                                                <p className="font-semibold text-text-primary">
                                                    {Number(invoice.grandTotal || 0).toLocaleString()} {currency}
                                                </p>
                                                {discountBreakdown.standardDiscount > 0 && (
                                                    <p className="text-xs text-warning">
                                                        Discount -{discountBreakdown.standardDiscount.toFixed(2)} {currency}
                                                    </p>
                                                )}
                                                {discountBreakdown.loyaltyDiscount > 0 && (
                                                    <p className="text-xs text-brand">
                                                        Loyalty -{discountBreakdown.loyaltyDiscount.toFixed(2)} {currency}
                                                    </p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell align="center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-8 px-0"
                                                    icon={<Eye size={16} />}
                                                    aria-label={`Preview invoice ${invoice.invoiceNo}`}
                                                    onClick={() => handleViewInvoice(invoice.id)}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-8 px-0"
                                                    icon={<Printer size={16} />}
                                                    aria-label={`Print invoice ${invoice.invoiceNo}`}
                                                    onClick={() => handlePrintInvoiceA4(invoice)}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>

                {data?.meta?.pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={data.meta.pagination.totalPages}
                        totalItems={data.meta.pagination.totalItems}
                        itemsPerPage={limit}
                        onPageChange={setPage}
                        onItemsPerPageChange={(value) => {
                            setLimit(value);
                            setPage(1);
                        }}
                        isLoading={isFetching}
                    />
                )}
            </Card>

            <InvoicePreviewModal
                isOpen={!!viewingInvoice}
                onClose={() => setViewingInvoice(null)}
                invoice={viewingInvoice}
                currency={currency}
                onPrint={handlePrintInvoiceA4}
                onDownload={handleDownloadInvoicePdfA4}
            />
        </PageLayout>
    );
}
