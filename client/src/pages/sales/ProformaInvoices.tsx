import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Eye, FileSpreadsheet, FileText, Plus, Printer, TrendingUp } from 'lucide-react';
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
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import { DEFAULT_CURRENCY } from '../../lib/constants';

const quotationStateOptions = [
    { value: 'all', label: 'All Documents' },
    { value: 'active', label: 'Active Only' },
    { value: 'converted', label: 'Converted Only' },
];

const getProformaStatusVariant = (
    status: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' => {
    switch (status) {
        case 'ACCEPTED':
            return 'success';
        case 'CONVERTED':
            return 'brand';
        case 'SENT':
        case 'EXPIRED':
            return 'warning';
        case 'REJECTED':
        case 'CANCELLED':
            return 'danger';
        default:
            return 'default';
    }
};

export default function ProformaInvoices() {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);
    const [viewingProforma, setViewingProforma] = useState<any>(null);
    const [isExporting, setIsExporting] = useState(false);

    const [searchInput, setSearchInput] = useState('');
    const [stateInput, setStateInput] = useState<'active' | 'converted' | 'all'>('all');
    const [dateRangeInput, setDateRangeInput] = useState({
        startDate: '',
        endDate: '',
    });

    const [queryParams, setQueryParams] = useState({
        search: '',
        state: 'all' as 'active' | 'converted' | 'all',
        startDate: '',
        endDate: '',
    });

    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';
    const activeBranchId = useAuthStore((s) => s.activeBranchId);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['proforma-invoices', activeBranchId, queryParams, page, limit],
        queryFn: async () => {
            const res = await api.get('/sales/quotations', {
                params: {
                    search: queryParams.search.trim() || undefined,
                    state: queryParams.state,
                    page,
                    limit,
                    startDate: queryParams.startDate || undefined,
                    endDate: queryParams.endDate || undefined,
                },
            });
            return res.data;
        },
    });

    const proformas = data?.data || [];
    const pagination = data?.meta?.pagination;
    const visibleValue = proformas.reduce(
        (sum: number, doc: any) => sum + Number(doc.grandTotal || 0),
        0
    );
    const acceptedCount = proformas.filter((doc: any) => doc.status === 'ACCEPTED').length;
    const awaitingResponseCount = proformas.filter((doc: any) => doc.status === 'SENT').length;

    const handleApplyFilters = () => {
        setPage(1);
        setQueryParams({
            search: searchInput,
            state: stateInput,
            startDate: dateRangeInput.startDate,
            endDate: dateRangeInput.endDate,
        });
    };

    const handleResetFilters = () => {
        setPage(1);
        setSearchInput('');
        setStateInput('all');
        setDateRangeInput({ startDate: '', endDate: '' });
        setQueryParams({
            search: '',
            state: 'all',
            startDate: '',
            endDate: '',
        });
    };

    const handleViewProforma = async (quotationId: string) => {
        try {
            const response = await api.get(`/sales/quotations/${quotationId}`);
            setViewingProforma(response.data.data);
        } catch (error) {
            console.error('Failed to load proforma details:', error);
            toast.error('Failed to load proforma details');
        }
    };

    const mapProformaToInvoiceShape = (doc: any) => ({
        ...doc,
        invoiceNo: doc.quotationNo,
        status: 'PROFORMA',
    });

    const handlePrintProforma = async (doc: any) => {
        if (!doc) return;

        try {
            let fullDoc = doc;
            if (!doc.items || doc.items.length === 0) {
                const res = await api.get(`/sales/quotations/${doc.id}`);
                fullDoc = res.data.data;
            }

            await printPdfFromComponent(
                <InvoicePdfTemplate
                    invoice={mapProformaToInvoiceShape(fullDoc)}
                    companyName={companyName}
                    currency={currency}
                />
            );
        } catch (err) {
            console.error('Print failed:', err);
            toast.error('Failed to print document');
        }
    };

    const handleDownloadProforma = async (doc: any) => {
        if (!doc) return;

        try {
            await downloadPdfFromComponent(
                `Proforma-${doc.quotationNo}.pdf`,
                <InvoicePdfTemplate
                    invoice={mapProformaToInvoiceShape(doc)}
                    companyName={companyName}
                    currency={currency}
                />
            );
        } catch (err) {
            console.error('Download failed:', err);
            toast.error('Failed to download document');
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
                const response = await api.get('/sales/quotations', {
                    params: {
                        search: queryParams.search.trim() || undefined,
                        state: queryParams.state,
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
                toast.error('No proforma invoices available to export');
                return;
            }

            await exportExcel({
                fileName: `Proforma_Invoices_${queryParams.startDate || 'all'}_${queryParams.endDate || 'all'}`,
                sheetName: 'Proformas',
                title: 'Proforma Invoice Register',
                filters: {
                    'Period Start': queryParams.startDate || 'All',
                    'Period End': queryParams.endDate || 'All',
                    Search: queryParams.search || 'None',
                    State: queryParams.state,
                    'Branch Context': activeBranchId ? `Branch ID: ${activeBranchId}` : 'All Branches',
                },
                columns: [
                    { key: 'quotationNo', header: 'Proforma #', width: 22 },
                    { key: 'date', header: 'Created', width: 18, type: 'datetime', split: true },
                    { key: 'customer', header: 'Customer', width: 28 },
                    { key: 'status', header: 'Status', width: 14 },
                    { key: 'validUntil', header: 'Valid Until', width: 18 },
                    { key: 'items', header: 'Items', width: 10, type: 'number' },
                    { key: 'total', header: 'Estimated Total', width: 18, type: 'currency' },
                ],
                rows: exportRows.map((doc: any) => ({
                    quotationNo: doc.quotationNo,
                    date: doc.createdAt,
                    customer: doc.customer?.name || doc.customerName || 'Walk-in Customer',
                    status: doc.status,
                    validUntil: doc.validUntil ? format(new Date(doc.validUntil), 'yyyy-MM-dd') : '-',
                    items: doc._count?.items ?? doc.items?.length ?? 0,
                    total: Number(doc.grandTotal || 0),
                })),
            });

            toast.success('Proforma register exported');
        } catch (error) {
            console.error('Proforma export failed:', error);
            toast.error('Failed to export proformas');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Proforma Invoices"
                subtitle="Manage preliminary billing documents in the same shared flow as orders and invoices."
                action={
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            icon={<FileSpreadsheet size={16} />}
                            loading={isExporting}
                            onClick={handleExportExcel}
                        >
                            {isExporting ? 'Exporting...' : 'Export Proformas'}
                        </Button>
                        <Button
                            type="button"
                            icon={<Plus size={16} />}
                            onClick={() => navigate('/sales/quotations/new')}
                        >
                            New Proforma
                        </Button>
                    </div>
                }
            />

            <StatsGrid columns={4}>
                <StatCard
                    label="Total Documents"
                    value={pagination?.totalItems || 0}
                    sub="Documents matching the current filters"
                    icon={<FileText size={20} />}
                />
                <StatCard
                    label="Visible Pipeline Value"
                    value={`${visibleValue.toLocaleString()} ${currency}`}
                    sub="Combined value of documents on this page"
                    icon={<TrendingUp size={20} />}
                />
                <StatCard
                    label="Accepted on Page"
                    value={acceptedCount}
                    sub="Accepted documents currently visible"
                    icon={<ArrowRight size={20} />}
                />
                <StatCard
                    label="Awaiting Response"
                    value={awaitingResponseCount}
                    sub="Sent documents on the current page"
                    icon={<Printer size={20} />}
                />
            </StatsGrid>

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchInput}
                        onChange={setSearchInput}
                        placeholder="Search by proforma number, customer, or reference"
                    />
                </div>
                <Select
                    value={stateInput}
                    onChange={(e) => setStateInput(e.target.value as 'active' | 'converted' | 'all')}
                    options={quotationStateOptions}
                    placeholder=""
                    className="min-w-[180px]"
                />
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
                            <TableHead>Document</TableHead>
                            <TableHead>Submission Date</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Valid Until</TableHead>
                            <TableHead align="right">Estimated Value</TableHead>
                            <TableHead align="center">Status</TableHead>
                            <TableHead align="center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={7} message="Loading proforma invoices..." />
                        ) : proformas.length === 0 ? (
                            <TableEmpty
                                colSpan={7}
                                message={
                                    queryParams.search || queryParams.startDate || queryParams.endDate || queryParams.state !== 'all'
                                        ? 'No proformas match the current filters.'
                                        : 'No proforma invoices have been created yet.'
                                }
                                icon={<FileText size={40} className="text-text-tertiary" />}
                            />
                        ) : (
                            proformas.map((doc: any) => (
                                <TableRow key={doc.id}>
                                    <TableCell>
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/sales/quotations/${doc.id}`)}
                                                className="text-left font-semibold text-text-primary hover:text-brand"
                                            >
                                                {doc.quotationNo}
                                            </button>
                                            <p className="text-xs text-text-tertiary">Proforma document</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {format(new Date(doc.createdAt), 'MMM dd, yyyy')}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {format(new Date(doc.createdAt), 'hh:mm a')}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {doc.customer?.name || doc.customerName || 'Walk-in Customer'}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {doc.customer?.customerCode || 'No customer code'}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {doc.validUntil ? (
                                            <div>
                                                <p className="font-medium text-text-primary">
                                                    {format(new Date(doc.validUntil), 'dd MMM yyyy')}
                                                </p>
                                                <p className="text-xs text-text-tertiary">Quotation validity</p>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-text-tertiary">Not set</span>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <span className="font-semibold text-text-primary">
                                            {Number(doc.grandTotal || 0).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            {currency}
                                        </span>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Badge
                                            variant={getProformaStatusVariant(doc.status)}
                                            size="sm"
                                            dot
                                        >
                                            {doc.status}
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
                                                aria-label={`Preview proforma ${doc.quotationNo}`}
                                                onClick={() => handleViewProforma(doc.id)}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="w-8 px-0"
                                                icon={<Printer size={16} />}
                                                aria-label={`Print proforma ${doc.quotationNo}`}
                                                onClick={() => handlePrintProforma(doc)}
                                            />
                                            {doc.status !== 'CONVERTED' && doc.status !== 'CANCELLED' && (
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    icon={<ArrowRight size={16} />}
                                                    onClick={() => navigate(`/sales/quotations/convert?id=${doc.id}`)}
                                                >
                                                    Convert
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {pagination && (
                    <Pagination
                        currentPage={page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems}
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
                isOpen={!!viewingProforma}
                onClose={() => setViewingProforma(null)}
                title="Proforma Preview"
                documentNo={viewingProforma?.quotationNo}
                document={viewingProforma}
                currency={currency}
                customerDisplay={
                    viewingProforma
                        ? {
                            title: viewingProforma.customer?.name || viewingProforma.customerName || 'Walk-in Client',
                            detail: viewingProforma.customer?.phone || viewingProforma.customer?.email || 'No contact details',
                        }
                        : undefined
                }
                metaDetails={[
                    {
                        label: 'Status',
                        value: (
                            <span className="font-semibold uppercase text-text-primary">
                                {viewingProforma?.status || '-'}
                            </span>
                        ),
                    },
                    {
                        label: 'Created By',
                        value: (
                            <span className="font-semibold text-text-primary">
                                {viewingProforma?.createdBy?.name || '-'}
                            </span>
                        ),
                    },
                    {
                        label: 'Valid Until',
                        value: (
                            <span className="font-semibold text-text-primary">
                                {viewingProforma?.validUntil
                                    ? format(new Date(viewingProforma.validUntil), 'dd MMM yyyy')
                                    : '-'}
                            </span>
                        ),
                    },
                    {
                        label: 'Document Type',
                        value: <span className="font-semibold text-brand">Proforma Invoice</span>,
                    },
                ]}
                columns={[
                    {
                        key: 'description',
                        label: 'Line Item',
                        render: (item) => (
                            <div>
                                <p className="font-semibold text-text-primary">
                                    {item.description || item.product?.name || 'Untitled item'}
                                </p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase text-text-tertiary">
                                    {item.product?.itemCode || 'Service'}
                                </p>
                            </div>
                        ),
                    },
                    {
                        key: 'qty',
                        label: 'Qty',
                        align: 'right',
                        render: (item) => (
                            <span className="font-semibold text-text-secondary">
                                {item.qty} {item.unitCode}
                            </span>
                        ),
                    },
                    {
                        key: 'lineTotal',
                        label: 'Total',
                        align: 'right',
                        render: (item) => (
                            <span className="font-semibold text-text-primary">
                                {Number(item.lineTotal || 0).toLocaleString()}
                            </span>
                        ),
                    },
                ]}
                items={viewingProforma?.items || []}
                grandTotal={viewingProforma?.grandTotal || 0}
                onPrint={handlePrintProforma}
                onDownload={handleDownloadProforma}
                icon={<FileText size={24} />}
            />
        </PageLayout>
    );
}
