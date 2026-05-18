import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Eye, FileSpreadsheet, Plus, Printer, Users } from 'lucide-react';
import { format } from 'date-fns';
import toast from '@/lib/toast';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../lib/api';
import { downloadPdfFromComponent, exportExcel, printPdfFromComponent } from '../../lib/fileExport';
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
import {
    getSalesCustomerDisplay,
    getSalesCustomerExportText,
    getSalesInvoiceDiscountBreakdown,
} from '../../lib/salesCustomerDisplay';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';

const getCreditInvoiceStatusVariant = (
    status: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' => {
    switch (status) {
        case 'PAID':
            return 'success';
        case 'UNPOSTED':
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

export default function CreditInvoices() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);
    const [viewingInvoice, setViewingInvoice] = useState<any>(null);
    const [isExporting, setIsExporting] = useState(false);

    const [dateRangeInput, setDateRangeInput] = useState({
        startDate: '',
        endDate: '',
    });
    const [searchInput, setSearchInput] = useState('');

    const [queryParams, setQueryParams] = useState({
        search: '',
        startDate: '',
        endDate: '',
    });

    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';
    const activeBranchId = useAuthStore((s) => s.activeBranchId);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['credit-invoices', activeBranchId, queryParams, page, limit],
        queryFn: async () => {
            const res = await api.get('/sales/invoices', {
                params: {
                    search: queryParams.search.trim() || undefined,
                    paymentMethod: 'CREDIT',
                    page,
                    limit,
                    startDate: queryParams.startDate || undefined,
                    endDate: queryParams.endDate || undefined,
                },
            });
            return res.data;
        },
    });

    const { data: summary } = useQuery({
        queryKey: ['credit-sales-summary', activeBranchId, queryParams],
        queryFn: async () => {
            const res = await api.get('/sales/summary', {
                params: {
                    startDate: queryParams.startDate || undefined,
                    endDate: queryParams.endDate || undefined,
                    paymentMethod: 'CREDIT',
                },
            });
            return res.data.data;
        },
    });

    const invoices = data?.data || [];
    const averageInvoiceValue =
        summary?.totalInvoices && Number(summary.totalInvoices) > 0
            ? Number(summary.totalRevenue || 0) / Number(summary.totalInvoices)
            : 0;

    const handleApplyFilters = () => {
        setPage(1);
        setQueryParams({
            search: searchInput,
            startDate: dateRangeInput.startDate,
            endDate: dateRangeInput.endDate,
        });
    };

    const handleResetFilters = () => {
        setPage(1);
        setSearchInput('');
        setDateRangeInput({ startDate: '', endDate: '' });
        setQueryParams({
            search: '',
            startDate: '',
            endDate: '',
        });
    };

    const handleViewInvoice = async (invoiceId: string) => {
        try {
            const response = await api.get(`/sales/invoices/${invoiceId}`);
            setViewingInvoice(response.data.data);
        } catch (error) {
            console.error('Failed to load credit invoice details:', error);
            toast.error('Failed to load invoice details');
        }
    };

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const exportLimit = 1000;
            let exportPage = 1;
            let totalPages = 1;
            const exportRows: any[] = [];

            do {
                const response = await api.get('/sales/invoices', {
                    params: {
                        search: queryParams.search.trim() || undefined,
                        paymentMethod: 'CREDIT',
                        page: exportPage,
                        limit: exportLimit,
                        startDate: queryParams.startDate || undefined,
                        endDate: queryParams.endDate || undefined,
                    },
                });

                exportRows.push(...(response.data?.data || []));
                totalPages = response.data?.meta?.pagination?.totalPages || 1;
                exportPage += 1;
            } while (exportPage <= totalPages);

            if (exportRows.length === 0) {
                toast.error('No credit invoices available to export');
                return;
            }

            await exportExcel({
                fileName: `Credit_Invoices_${queryParams.startDate || 'all'}_${queryParams.endDate || 'all'}`,
                sheetName: 'Credit Invoices',
                title: 'Credit Sales Register',
                filters: {
                    'Period Start': queryParams.startDate || 'All',
                    'Period End': queryParams.endDate || 'All',
                    Search: queryParams.search || 'None',
                    'Branch Context': activeBranchId ? `Branch ID: ${activeBranchId}` : 'All Branches',
                },
                columns: [
                    { key: 'invoiceNo', header: 'Invoice #', width: 22 },
                    { key: 'date', header: 'Transaction', width: 18, type: 'datetime', split: true },
                    { key: 'customer', header: 'Customer', width: 28 },
                    { key: 'branch', header: 'Branch', width: 18 },
                    { key: 'status', header: 'Status', width: 14 },
                    { key: 'items', header: 'Items', width: 10, type: 'number' },
                    { key: 'discount', header: 'Discount', width: 16, type: 'currency' },
                    { key: 'loyaltyDiscount', header: 'Loyalty Discount', width: 18, type: 'currency' },
                    { key: 'total', header: 'Credit Total', width: 18, type: 'currency' },
                ],
                rows: exportRows.map((invoice: any) => ({
                    invoiceNo: invoice.invoiceNo,
                    date: invoice.createdAt,
                    customer: getSalesCustomerExportText(invoice),
                    branch: invoice.branch?.name || '-',
                    status: invoice.status,
                    items: invoice._count?.items ?? invoice.items?.length ?? 0,
                    discount: Number(invoice.discountTotal || 0),
                    loyaltyDiscount: getSalesInvoiceDiscountBreakdown(invoice).loyaltyDiscount,
                    total: Number(invoice.grandTotal || 0),
                })),
            });

            toast.success('Credit invoice report exported');
        } catch (error) {
            console.error('Credit export failed:', error);
            toast.error('Failed to export credit invoices');
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrintInvoiceA4 = async (invoice: any) => {
        if (!invoice) return;

        try {
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
                `Credit-Invoice-${invoice.invoiceNo}.pdf`,
                <InvoicePdfTemplate invoice={invoice} companyName={companyName} currency={currency} />
            );
        } catch (err) {
            console.error('PDF download failed:', err);
            toast.error('Failed to download PDF');
        }
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Credit Invoices"
                subtitle="Manage receivable sales using the same reusable filters, tables, and preview flows as the rest of the suite."
                action={
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            icon={<FileSpreadsheet size={16} />}
                            loading={isExporting}
                            onClick={handleExportExcel}
                        >
                            {isExporting ? 'Exporting...' : 'Export Credit Report'}
                        </Button>
                        <Button
                            type="button"
                            icon={<Plus size={16} />}
                            onClick={() => navigate('/sales/invoices/new')}
                        >
                            New Credit Sale
                        </Button>
                    </div>
                }
            />

            <StatsGrid columns={4}>
                <StatCard
                    label="Posted Credit Revenue"
                    value={`${Number(summary?.totalRevenue || 0).toLocaleString()} ${currency}`}
                    sub="Posted credit invoices in the selected period"
                    icon={<CreditCard size={20} />}
                />
                <StatCard
                    label="Invoice Count"
                    value={summary?.totalInvoices || 0}
                    sub="Credit invoices matching the current period"
                    icon={<Users size={20} />}
                />
                <StatCard
                    label="Pending Posting"
                    value={summary?.pendingPost || 0}
                    sub="Credit invoices waiting to post"
                    icon={<Printer size={20} />}
                />
                <StatCard
                    label="Average Value"
                    value={`${averageInvoiceValue.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })} ${currency}`}
                    sub="Average value per credit invoice"
                    icon={<FileSpreadsheet size={20} />}
                />
            </StatsGrid>

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchInput}
                        onChange={setSearchInput}
                        placeholder="Search customer, invoice, or branch"
                    />
                </div>
                <DateRangeFilter
                    startDate={dateRangeInput.startDate}
                    endDate={dateRangeInput.endDate}
                    onChange={(start, end) => setDateRangeInput({ startDate: start, endDate: end })}
                    onClear={() => setDateRangeInput({ startDate: '', endDate: '' })}
                />
                <Button type="button" onClick={handleApplyFilters}>
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
                            <TableHead align="center">Branch</TableHead>
                            <TableHead align="right">Balance Amount</TableHead>
                            <TableHead align="center">Status</TableHead>
                            <TableHead align="center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={7} message="Loading credit invoices..." />
                        ) : invoices.length === 0 ? (
                            <TableEmpty
                                colSpan={7}
                                message={
                                    queryParams.search || queryParams.startDate || queryParams.endDate
                                        ? 'No credit invoices match the current filters.'
                                        : 'No credit invoices have been created yet.'
                                }
                                icon={<CreditCard size={40} className="text-text-tertiary" />}
                            />
                        ) : (
                            invoices.map((invoice: any) => {
                                const customerDisplay = getSalesCustomerDisplay(invoice);
                                const discountBreakdown = getSalesInvoiceDiscountBreakdown(invoice);

                                return (
                                    <TableRow key={invoice.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-semibold text-text-primary">{invoice.invoiceNo}</p>
                                                <p className="text-xs text-text-tertiary">Credit account</p>
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
                                            <Badge size="sm">{invoice.branch?.code || 'MAIN'}</Badge>
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
                                            <Badge
                                                variant={getCreditInvoiceStatusVariant(invoice.status)}
                                                size="sm"
                                                dot
                                            >
                                                {invoice.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell align="center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-8 px-0"
                                                    icon={<Eye size={16} />}
                                                    aria-label={`Preview credit invoice ${invoice.invoiceNo}`}
                                                    onClick={() => handleViewInvoice(invoice.id)}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-8 px-0"
                                                    icon={<Printer size={16} />}
                                                    aria-label={`Print credit invoice ${invoice.invoiceNo}`}
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

            <DocumentPreviewModal
                isOpen={!!viewingInvoice}
                onClose={() => setViewingInvoice(null)}
                title="Credit Invoice Review"
                documentNo={viewingInvoice?.invoiceNo}
                document={viewingInvoice}
                currency={currency}
                customerDisplay={
                    viewingInvoice
                        ? {
                            title: getSalesCustomerDisplay(viewingInvoice).title,
                            detail: getSalesCustomerDisplay(viewingInvoice).isWalkInLoyalty
                                ? getSalesCustomerDisplay(viewingInvoice).detail
                                : viewingInvoice.customer?.phone || viewingInvoice.loyaltyCustomer?.phone || 'No contact details',
                        }
                        : undefined
                }
                metaDetails={[
                    {
                        label: 'Ledger',
                        value: <span className="font-semibold text-text-primary">Accounts Receivable</span>,
                    },
                    {
                        label: 'Payment Method',
                        value: <span className="font-semibold text-brand">Credit</span>,
                    },
                    {
                        label: 'Status',
                        value: (
                            <span className="font-semibold uppercase text-text-primary">
                                {viewingInvoice?.status || '-'}
                            </span>
                        ),
                    },
                    {
                        label: 'Branch',
                        value: (
                            <span className="font-semibold text-text-primary">
                                {viewingInvoice?.branch?.name || '-'}
                            </span>
                        ),
                    },
                ]}
                columns={[
                    {
                        key: 'description',
                        label: 'Line Description',
                        render: (item) => (
                            <div>
                                <p className="font-semibold text-text-primary">
                                    {item.product?.name || 'Unnamed item'}
                                </p>
                                <p className="mt-0.5 text-[10px] font-mono uppercase text-text-tertiary">
                                    {item.product?.itemCode || 'No item code'}
                                </p>
                            </div>
                        ),
                    },
                    {
                        key: 'unitCode',
                        label: 'Unit',
                        align: 'center',
                        render: (item) => (
                            <span className="text-xs font-semibold text-text-secondary">
                                {item.unitCode || '-'}
                            </span>
                        ),
                    },
                    {
                        key: 'unitPrice',
                        label: 'Unit Rate',
                        align: 'right',
                        render: (item) => (
                            <span className="font-medium text-text-secondary">
                                {Number(item.unitPrice || 0).toLocaleString()}
                            </span>
                        ),
                    },
                    {
                        key: 'qty',
                        label: 'Quantity',
                        align: 'center',
                        render: (item) => (
                            <span className="font-semibold text-text-primary">{item.qty}</span>
                        ),
                    },
                    {
                        key: 'lineTotal',
                        label: 'Total Value',
                        align: 'right',
                        render: (item) => (
                            <span className="font-semibold text-text-primary">
                                {Number(item.lineTotal || 0).toLocaleString()}
                            </span>
                        ),
                    },
                ]}
                items={viewingInvoice?.items || []}
                grandTotal={viewingInvoice?.grandTotal || 0}
                discountDetails={
                    viewingInvoice
                        ? [
                            {
                                label: 'Discount',
                                amount: getSalesInvoiceDiscountBreakdown(viewingInvoice).standardDiscount,
                            },
                            {
                                label: 'Loyalty Discount',
                                amount: getSalesInvoiceDiscountBreakdown(viewingInvoice).loyaltyDiscount,
                            },
                            {
                                label: 'Total Discount',
                                amount: getSalesInvoiceDiscountBreakdown(viewingInvoice).totalDiscount,
                            },
                        ]
                        : []
                }
                onPrint={handlePrintInvoiceA4}
                onDownload={handleDownloadInvoicePdfA4}
                icon={<CreditCard size={24} />}
            />
        </PageLayout>
    );
}
