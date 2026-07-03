import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Calendar, CheckCircle2, ClipboardList, Package, Plus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../lib/api';
import { DEFAULT_CURRENCY } from '../../lib/constants';
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

const purchaseStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'ORDERED', label: 'Ordered' },
    { value: 'PARTIAL', label: 'Partial' },
    { value: 'RECEIVED', label: 'Received' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

const getStatusVariant = (
    status: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand' => {
    switch (status) {
        case 'RECEIVED':
            return 'success';
        case 'ORDERED':
            return 'info';
        case 'PENDING':
        case 'PARTIAL':
            return 'warning';
        case 'CANCELLED':
            return 'danger';
        default:
            return 'default';
    }
};

export default function PurchaseOrders() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['purchase-orders', activeBranchId, page, limit, status, search, dateRange],
        queryFn: () =>
            api
                .get('/purchases/orders', {
                    params: {
                        page,
                        limit,
                        status: status || undefined,
                        search: search || undefined,
                        startDate: dateRange.startDate || undefined,
                        endDate: dateRange.endDate || undefined,
                    },
                })
                .then((r: any) => r.data),
    });

    const pagination = data?.meta?.pagination;
    const orders = data?.data || [];
    const pendingReceiptCount = orders.filter(
        (order: any) => order.status === 'ORDERED' || order.status === 'PENDING' || order.status === 'PARTIAL'
    ).length;
    const completedCount = orders.filter((order: any) => order.status === 'RECEIVED').length;

    const handleRefresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Purchase Orders"
                subtitle="Track procurement activity with the same shared filters, tables, and status patterns used across the app."
                action={
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            icon={<RefreshCw size={16} />}
                            loading={isFetching}
                            onClick={handleRefresh}
                        >
                            Refresh
                        </Button>
                        <Button
                            type="button"
                            icon={<Plus size={16} />}
                            onClick={() => navigate('/purchases/orders/new')}
                        >
                            Create Purchase Order
                        </Button>
                    </div>
                }
            />

            <StatsGrid columns={3}>
                <StatCard
                    label="Total Orders"
                    value={pagination?.totalItems || pagination?.total || 0}
                    sub="Orders in the current branch and filter set"
                    icon={<ClipboardList size={20} />}
                />
                <StatCard
                    label="Pending Receipt"
                    value={pendingReceiptCount}
                    sub="Draft, pending, ordered, or partially received"
                    icon={<Calendar size={20} />}
                />
                <StatCard
                    label="Completed"
                    value={completedCount}
                    sub="Orders already received"
                    icon={<CheckCircle2 size={20} />}
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
                        placeholder="Search PO number or supplier"
                    />
                </div>
                <Select
                    value={status}
                    onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                    }}
                    options={purchaseStatusOptions}
                    placeholder=""
                    className="min-w-[180px]"
                />
                <DateRangeFilter
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={(start, end) => {
                        setDateRange({ startDate: start, endDate: end });
                        setPage(1);
                    }}
                    onClear={() => {
                        setDateRange({ startDate: '', endDate: '' });
                        setPage(1);
                    }}
                />
            </FilterBar>

            <Card padding="none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Expected Date</TableHead>
                            <TableHead align="center">Items</TableHead>
                            <TableHead align="right">Total</TableHead>
                            <TableHead align="center">Status</TableHead>
                            <TableHead align="center">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={8} message="Loading purchase orders..." />
                        ) : orders.length === 0 ? (
                            <TableEmpty
                                colSpan={8}
                                message={
                                    search || status || dateRange.startDate || dateRange.endDate
                                        ? 'No purchase orders match the current filters.'
                                        : 'No purchase orders have been created yet.'
                                }
                                icon={<Package size={40} className="text-text-tertiary" />}
                            />
                        ) : (
                            orders.map((order: any) => (
                                <TableRow key={order.id}>
                                    <TableCell>
                                        <div>
                                            <p className="font-semibold text-text-primary">{order.poNo}</p>
                                            <p className="text-xs text-text-tertiary">
                                                {order.referenceNo || 'No reference'}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {format(new Date(order.date), 'dd MMM yyyy')}
                                            </p>
                                            <p className="text-xs text-text-tertiary">Created date</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {order.supplier?.name || 'Unknown supplier'}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {order.supplier?.supplierCode || 'No supplier code'}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {order.expectedDate ? (
                                            <div>
                                                <p className="font-medium text-text-primary">
                                                    {format(new Date(order.expectedDate), 'dd MMM yyyy')}
                                                </p>
                                                <p className="text-xs text-text-tertiary">Expected delivery</p>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-text-tertiary">Not set</span>
                                        )}
                                    </TableCell>
                                    <TableCell align="center">
                                        {order._count?.items || 0} lines
                                    </TableCell>
                                    <TableCell align="right">
                                        <span className="font-semibold text-text-primary">
                                            {Number(order.grandTotal || 0).toLocaleString()} {currency}
                                        </span>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Badge variant={getStatusVariant(order.status)} size="sm" dot>
                                            {order.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="w-8 px-0"
                                            icon={<ArrowRight size={16} />}
                                            aria-label={`Open purchase order ${order.poNo}`}
                                            onClick={() => navigate(`/purchases/orders/${order.id}`)}
                                        />
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
        </PageLayout>
    );
}
