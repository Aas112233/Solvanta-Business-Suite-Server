import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Edit, FileText, Package, Plus, Printer, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { printPdfFromComponent } from '../../lib/fileExport';
import { SalesOrderPdfTemplate } from '../../components/sales/SalesOrderPdfTemplate';
import {
    Badge,
    Button,
    Card,
    ConfirmActionModal,
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

const orderStateOptions = [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'all', label: 'All Orders' },
];

const getStatusVariant = (
    status: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' => {
    switch (status) {
        case 'DELIVERED':
            return 'success';
        case 'INVOICED':
            return 'brand';
        case 'SHIPPED':
        case 'PROCESSING':
            return 'info';
        case 'CONFIRMED':
            return 'warning';
        case 'CANCELLED':
            return 'danger';
        default:
            return 'default';
    }
};

export default function SalesOrders() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [search, setSearch] = useState('');
    const [state, setState] = useState<'active' | 'completed' | 'cancelled' | 'all'>('active');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';

    const { data: qData, isLoading, isFetching } = useQuery({
        queryKey: ['sales-orders', page, limit, search, state, startDate, endDate],
        queryFn: () =>
            api
                .get('/sales/orders', {
                    params: {
                        page,
                        limit,
                        search: search || undefined,
                        state,
                        startDate: startDate || undefined,
                        endDate: endDate || undefined,
                    },
                })
                .then((r) => r.data),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/sales/orders/${id}`),
        onSuccess: () => {
            toast.success('Sales order deleted successfully');
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
            setDeletingId(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to delete order');
            setDeletingId(null);
        },
    });

    const orders = qData?.data || [];
    const total = qData?.meta?.total || qData?.meta?.pagination?.totalItems || 0;
    const totalPages = qData?.meta?.pagination?.totalPages || Math.max(1, Math.ceil(total / limit));
    const readyToInvoiceCount = orders.filter(
        (order: any) => order.status !== 'INVOICED' && order.status !== 'CANCELLED'
    ).length;
    const completedCount = orders.filter(
        (order: any) => order.status === 'DELIVERED' || order.status === 'INVOICED'
    ).length;

    const handlePrint = async (order: any) => {
        try {
            await printPdfFromComponent(
                <SalesOrderPdfTemplate order={order} companyName={companyName} currency={currency} />
            );
        } catch (error) {
            console.error('Print failed:', error);
            toast.error('Failed to print order');
        }
    };

    const confirmDelete = () => {
        if (deletingId) {
            deleteMutation.mutate(deletingId);
        }
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Sales Orders"
                subtitle="Manage customer orders, fulfillment status, and invoice conversion from one shared workflow."
                action={
                    <Button
                        type="button"
                        icon={<Plus size={16} />}
                        onClick={() => navigate('/sales/orders/new')}
                    >
                        Create Order
                    </Button>
                }
            />

            <StatsGrid columns={3}>
                <StatCard
                    label="Total Orders"
                    value={total}
                    sub="Matching the current search and date range"
                    icon={<FileText size={20} />}
                />
                <StatCard
                    label="Ready to Invoice"
                    value={readyToInvoiceCount}
                    sub="Orders that can still be converted"
                    icon={<ArrowRight size={20} />}
                />
                <StatCard
                    label="Completed"
                    value={completedCount}
                    sub="Delivered or already invoiced orders"
                    icon={<Package size={20} />}
                />
            </StatsGrid>

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={search}
                        onChange={(value) => {
                            setSearch(value);
                            setPage(1);
                        }}
                        placeholder="Search by order number or customer"
                    />
                </div>
                <Select
                    value={state}
                    onChange={(e) => {
                        setState(e.target.value as typeof state);
                        setPage(1);
                    }}
                    options={orderStateOptions}
                    placeholder=""
                    className="min-w-[180px]"
                />
                <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(start, end) => {
                        setStartDate(start);
                        setEndDate(end);
                        setPage(1);
                    }}
                    onClear={() => {
                        setStartDate('');
                        setEndDate('');
                        setPage(1);
                    }}
                />
            </FilterBar>

            <Card padding="none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Delivery</TableHead>
                            <TableHead align="center">Status</TableHead>
                            <TableHead align="right">Total</TableHead>
                            <TableHead align="center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={7} message="Loading sales orders..." />
                        ) : orders.length === 0 ? (
                            <TableEmpty
                                colSpan={7}
                                message={
                                    search || startDate || endDate || state !== 'active'
                                        ? 'No sales orders match the current filters.'
                                        : 'No sales orders have been created yet.'
                                }
                                icon={<Package size={40} className="text-text-tertiary" />}
                            />
                        ) : (
                            orders.map((order: any) => (
                                <TableRow key={order.id}>
                                    <TableCell>
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/sales/orders/convert?id=${order.id}`)}
                                                className="text-left font-semibold text-text-primary hover:text-brand"
                                            >
                                                {order.orderNo}
                                            </button>
                                            <p className="text-xs text-text-tertiary">
                                                {order.referenceNo || 'No external reference'}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {order.customer?.name || order.customerName || 'Walk-in Customer'}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {order.customer?.phone || order.customer?.email || 'No contact info'}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {format(new Date(order.createdAt), 'dd MMM yyyy')}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {format(new Date(order.createdAt), 'HH:mm')}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {order.deliveryDate ? (
                                            <div>
                                                <p className="font-medium text-text-primary">
                                                    {format(new Date(order.deliveryDate), 'dd MMM yyyy')}
                                                </p>
                                                <p className="text-xs text-text-tertiary">Scheduled delivery</p>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-text-tertiary">Not scheduled</span>
                                        )}
                                    </TableCell>
                                    <TableCell align="center">
                                        <Badge variant={getStatusVariant(order.status)} size="sm" dot>
                                            {order.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell align="right">
                                        <span className="font-semibold text-text-primary">
                                            {Number(order.grandTotal || 0).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            {currency}
                                        </span>
                                    </TableCell>
                                    <TableCell align="center">
                                        <div className="flex items-center justify-center gap-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="w-8 px-0"
                                                icon={<Printer size={16} />}
                                                aria-label={`Print order ${order.orderNo}`}
                                                onClick={() => handlePrint(order)}
                                            />
                                            {order.status !== 'INVOICED' && order.status !== 'CANCELLED' && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-8 px-0"
                                                        icon={<Edit size={16} />}
                                                        aria-label={`Edit order ${order.orderNo}`}
                                                        onClick={() => navigate(`/sales/orders/${order.id}/edit`)}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        icon={<ArrowRight size={16} />}
                                                        onClick={() => navigate(`/sales/orders/convert?id=${order.id}`)}
                                                    >
                                                        Convert
                                                    </Button>
                                                </>
                                            )}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="w-8 px-0 text-danger hover:bg-danger-soft"
                                                icon={<Trash2 size={16} />}
                                                aria-label={`Delete order ${order.orderNo}`}
                                                onClick={() => setDeletingId(order.id)}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {total > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalItems={total}
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

            <ConfirmActionModal
                isOpen={!!deletingId}
                onClose={() => setDeletingId(null)}
                onConfirm={confirmDelete}
                title="Delete Order?"
                message="Are you sure you want to delete this order? This action cannot be undone."
                confirmText="Delete"
                variant="danger"
                isPending={deleteMutation.isPending}
            />
        </PageLayout>
    );
}
