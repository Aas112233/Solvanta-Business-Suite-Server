import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, ClipboardList, Play, Plus, RefreshCw, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import toast from '@/lib/toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import {
    Badge,
    Button,
    Card,
    FilterBar,
    FormActions,
    FormField,
    FormGroup,
    Input,
    Modal,
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

type ProductionOrderStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface BranchOption {
    id: string;
    name: string;
    code: string;
}

interface ProductSummary {
    id: string;
    name: string;
    itemCode: string;
    kind?: string;
}

interface BomOption {
    id: string;
    name: string;
    version: string;
    outputQty: number;
    outputUnitCode: string;
    product: ProductSummary;
}

interface ProductionOrderListItem {
    id: string;
    productionNo: string;
    createdAt: string;
    status: ProductionOrderStatus;
    plannedQty: number;
    plannedUnitCode: string;
    completedQty: number;
    scrapQty: number;
    branch: BranchOption;
    bom: {
        id: string;
        name: string;
        version: string;
    };
    product: ProductSummary;
    _count?: {
        materials: number;
        consumptions: number;
        completions: number;
    };
}

interface ProductionOrderDetail extends ProductionOrderListItem {
    notes?: string | null;
    plannedStartDate?: string | null;
    plannedEndDate?: string | null;
    actualStartDate?: string | null;
    actualEndDate?: string | null;
    materials: Array<{
        id: string;
        productId: string;
        unitCode: string;
        plannedQty: number;
        issuedQty: number;
        varianceQty: number;
        product: ProductSummary;
    }>;
    consumptions: Array<{
        id: string;
        productId: string;
        unitCode: string;
        qtyConsumed: number;
        cost: number;
        batchNo?: string | null;
        notes?: string | null;
        createdAt: string;
    }>;
    completions: Array<{
        id: string;
        qtyCompleted: number;
        unitCode: string;
        unitCost: number;
        notes?: string | null;
        createdAt: string;
    }>;
}

interface PaginatedResponse<T> {
    data: T[];
    meta?: {
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    };
}

interface CreateOrderFormState {
    branchId: string;
    bomId: string;
    plannedQty: string;
    plannedUnitCode: string;
    plannedStartDate: string;
    plannedEndDate: string;
    notes: string;
}

interface ConsumeDraftItem {
    productId: string;
    productName: string;
    unitCode: string;
    plannedQty: number;
    issuedQty: number;
    qtyConsumed: string;
    batchNo: string;
    notes: string;
}

interface CompletionFormState {
    qtyCompleted: string;
    unitCode: string;
    scrapQty: string;
    notes: string;
}

const orderStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

const createInitialOrderForm = (): CreateOrderFormState => ({
    branchId: '',
    bomId: '',
    plannedQty: '1',
    plannedUnitCode: '',
    plannedStartDate: '',
    plannedEndDate: '',
    notes: '',
});

const createInitialCompletionForm = (): CompletionFormState => ({
    qtyCompleted: '',
    unitCode: '',
    scrapQty: '0',
    notes: '',
});

function getStatusVariant(status: ProductionOrderStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
    switch (status) {
        case 'COMPLETED':
            return 'success';
        case 'IN_PROGRESS':
            return 'info';
        case 'PLANNED':
        case 'DRAFT':
            return 'warning';
        case 'CANCELLED':
            return 'danger';
        default:
            return 'default';
    }
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Not set';
    return format(new Date(value), 'dd MMM yyyy, hh:mm a');
}

function TextareaField({
    label,
    value,
    onChange,
    placeholder,
    rows = 3,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
}) {
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-secondary">{label}</label>
            <textarea
                value={value}
                rows={rows}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-border bg-background-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:border-brand"
            />
        </div>
    );
}

export default function ProductionOrders() {
    const queryClient = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [branchId, setBranchId] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [isConsumeModalOpen, setIsConsumeModalOpen] = useState(false);
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState<CreateOrderFormState>(createInitialOrderForm);
    const [consumeDraft, setConsumeDraft] = useState<ConsumeDraftItem[]>([]);
    const [completionForm, setCompletionForm] = useState<CompletionFormState>(createInitialCompletionForm);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['production-orders', page, limit, search, status, branchId],
        queryFn: async () => {
            const response = await api.get('/production/orders', {
                params: {
                    page,
                    limit,
                    search: search || undefined,
                    status: status || undefined,
                    branchId: branchId || undefined,
                },
            });
            return response.data as PaginatedResponse<ProductionOrderListItem>;
        },
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['production-branches'],
        queryFn: async () => {
            const response = await api.get('/branches');
            return (response.data?.data || []) as BranchOption[];
        },
    });

    const { data: bomOptions = [] } = useQuery({
        queryKey: ['production-boms'],
        queryFn: async () => {
            const response = await api.get('/bom', {
                params: { page: 1, limit: 300, status: 'ACTIVE' },
            });
            return (response.data?.data || []) as BomOption[];
        },
    });

    const {
        data: selectedOrderResponse,
        isFetching: isFetchingOrder,
    } = useQuery({
        queryKey: ['production-order', selectedOrderId],
        queryFn: async () => {
            const response = await api.get(`/production/orders/${selectedOrderId}`);
            return response.data as { data: ProductionOrderDetail };
        },
        enabled: Boolean(selectedOrderId),
    });

    const orders = data?.data || [];
    const pagination = data?.meta?.pagination;
    const selectedOrder = selectedOrderResponse?.data || null;
    const inProgressCount = orders.filter((order) => order.status === 'IN_PROGRESS').length;
    const completedCount = orders.filter((order) => order.status === 'COMPLETED').length;

    const bomMap = useMemo(
        () => new Map(bomOptions.map((bom) => [bom.id, bom])),
        [bomOptions]
    );

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.post('/production/orders', payload),
        onSuccess: () => {
            toast.success('Production order created successfully');
            void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
            setIsCreateModalOpen(false);
            setCreateForm(createInitialOrderForm());
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to create production order');
        },
    });

    const startMutation = useMutation({
        mutationFn: (orderId: string) => api.post(`/production/orders/${orderId}/start`),
        onSuccess: () => {
            toast.success('Production started');
            void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
            void queryClient.invalidateQueries({ queryKey: ['production-order', selectedOrderId] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to start production');
        },
    });

    const consumeMutation = useMutation({
        mutationFn: ({ orderId, payload }: { orderId: string; payload: Record<string, unknown> }) =>
            api.post(`/production/orders/${orderId}/consume`, payload),
        onSuccess: () => {
            toast.success('Material consumption recorded');
            void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
            void queryClient.invalidateQueries({ queryKey: ['production-order', selectedOrderId] });
            setIsConsumeModalOpen(false);
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to record material consumption');
        },
    });

    const completeMutation = useMutation({
        mutationFn: ({ orderId, payload }: { orderId: string; payload: Record<string, unknown> }) =>
            api.post(`/production/orders/${orderId}/complete`, payload),
        onSuccess: () => {
            toast.success('Production completion recorded');
            void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
            void queryClient.invalidateQueries({ queryKey: ['production-order', selectedOrderId] });
            setIsCompleteModalOpen(false);
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to complete production order');
        },
    });

    const cancelMutation = useMutation({
        mutationFn: (orderId: string) => api.post(`/production/orders/${orderId}/cancel`),
        onSuccess: () => {
            toast.success('Production order cancelled');
            void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
            void queryClient.invalidateQueries({ queryKey: ['production-order', selectedOrderId] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to cancel production order');
        },
    });

    const refreshOrders = async () => {
        await queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    };

    const openCreateModal = () => {
        const defaultBranch = branchId || activeBranchId || branches[0]?.id || '';
        setCreateForm({
            ...createInitialOrderForm(),
            branchId: defaultBranch,
        });
        setIsCreateModalOpen(true);
    };

    const openOrderDetail = (orderId: string) => {
        setSelectedOrderId(orderId);
    };

    const closeOrderDetail = () => {
        setSelectedOrderId(null);
        setIsConsumeModalOpen(false);
        setIsCompleteModalOpen(false);
        setConsumeDraft([]);
        setCompletionForm(createInitialCompletionForm());
    };

    const handleSelectBom = (bomId: string) => {
        const bom = bomMap.get(bomId);
        setCreateForm((prev) => ({
            ...prev,
            bomId,
            plannedUnitCode: bom?.outputUnitCode || '',
        }));
    };

    const handleCreateOrder = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!createForm.branchId) {
            toast.error('Select a production branch');
            return;
        }
        if (!createForm.bomId) {
            toast.error('Select an active recipe');
            return;
        }

        createMutation.mutate({
            branchId: createForm.branchId,
            bomId: createForm.bomId,
            plannedQty: Number(createForm.plannedQty || 0),
            plannedUnitCode: createForm.plannedUnitCode,
            plannedStartDate: createForm.plannedStartDate || undefined,
            plannedEndDate: createForm.plannedEndDate || undefined,
            notes: createForm.notes.trim() || undefined,
        });
    };

    const openConsumeModal = () => {
        if (!selectedOrder) return;
        setConsumeDraft(
            (selectedOrder.materials || []).map((material) => ({
                productId: material.productId,
                productName: material.product.name,
                unitCode: material.unitCode,
                plannedQty: material.plannedQty,
                issuedQty: material.issuedQty,
                qtyConsumed: String(Math.max(0, material.plannedQty - material.issuedQty)),
                batchNo: '',
                notes: '',
            }))
        );
        setIsConsumeModalOpen(true);
    };

    const handleConsume = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedOrderId) return;
        const items = consumeDraft
            .filter((item) => Number(item.qtyConsumed || 0) > 0)
            .map((item) => ({
                productId: item.productId,
                unitCode: item.unitCode,
                qtyConsumed: Number(item.qtyConsumed),
                batchNo: item.batchNo.trim() || undefined,
                notes: item.notes.trim() || undefined,
            }));

        if (items.length === 0) {
            toast.error('Enter at least one consumed quantity');
            return;
        }

        consumeMutation.mutate({ orderId: selectedOrderId, payload: { items } });
    };

    const openCompleteModal = () => {
        if (!selectedOrder) return;
        const remainingQty = Math.max(
            0,
            Number(selectedOrder.plannedQty || 0) - Number(selectedOrder.completedQty || 0) - Number(selectedOrder.scrapQty || 0)
        );
        setCompletionForm({
            qtyCompleted: remainingQty > 0 ? String(remainingQty) : '',
            unitCode: selectedOrder.plannedUnitCode,
            scrapQty: '0',
            notes: '',
        });
        setIsCompleteModalOpen(true);
    };

    const handleComplete = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedOrderId) return;
        completeMutation.mutate({
            orderId: selectedOrderId,
            payload: {
                qtyCompleted: Number(completionForm.qtyCompleted || 0),
                unitCode: completionForm.unitCode,
                scrapQty: Number(completionForm.scrapQty || 0),
                notes: completionForm.notes.trim() || undefined,
            },
        });
    };

    const handleCancel = () => {
        if (!selectedOrderId) return;
        if (!window.confirm('Cancel this production order? This is only allowed before any transactions exist.')) {
            return;
        }
        cancelMutation.mutate(selectedOrderId);
    };

    const canStart =
        selectedOrder &&
        (selectedOrder.status === 'PLANNED' || selectedOrder.status === 'DRAFT') &&
        hasPermission('production.edit');
    const canConsume =
        selectedOrder &&
        selectedOrder.status !== 'COMPLETED' &&
        selectedOrder.status !== 'CANCELLED' &&
        hasPermission('production.consume');
    const canComplete =
        selectedOrder &&
        selectedOrder.status !== 'COMPLETED' &&
        selectedOrder.status !== 'CANCELLED' &&
        hasPermission('production.complete');
    const canCancel =
        selectedOrder &&
        selectedOrder.status !== 'COMPLETED' &&
        selectedOrder.status !== 'CANCELLED' &&
        hasPermission('production.cancel');

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Production Orders"
                subtitle="Launch manufacturing work, issue materials, and record finished goods receipt from a single production flow."
                action={
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            icon={<RefreshCw size={16} />}
                            loading={isFetching}
                            onClick={() => {
                                void refreshOrders();
                            }}
                        >
                            Refresh
                        </Button>
                        {hasPermission('production.create') && (
                            <Button type="button" icon={<Plus size={16} />} onClick={openCreateModal}>
                                New Production Order
                            </Button>
                        )}
                    </div>
                }
            />

            <StatsGrid columns={3}>
                <StatCard
                    label="Orders"
                    value={pagination?.total || 0}
                    sub="Production orders in the current filter set"
                    icon={<ClipboardList size={20} />}
                />
                <StatCard
                    label="In Progress"
                    value={inProgressCount}
                    sub="Orders currently consuming or producing stock"
                    icon={<Play size={20} />}
                />
                <StatCard
                    label="Completed"
                    value={completedCount}
                    sub="Orders fully received into finished goods"
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
                        placeholder="Search production number, recipe, or product"
                    />
                </div>
                <Select
                    value={branchId}
                    onChange={(event) => {
                        setBranchId(event.target.value);
                        setPage(1);
                    }}
                    options={[
                        { value: '', label: 'All Branches' },
                        ...branches.map((branch) => ({
                            value: branch.id,
                            label: `${branch.name} (${branch.code})`,
                        })),
                    ]}
                    placeholder=""
                    className="min-w-[200px]"
                />
                <Select
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                    }}
                    options={orderStatusOptions}
                    placeholder=""
                    className="min-w-[180px]"
                />
            </FilterBar>

            <Card padding="none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Production No</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Finished Good</TableHead>
                            <TableHead>Recipe</TableHead>
                            <TableHead align="center">Planned</TableHead>
                            <TableHead align="center">Completed</TableHead>
                            <TableHead align="center">Status</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead align="center">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={9} message="Loading production orders..." />
                        ) : orders.length === 0 ? (
                            <TableEmpty
                                colSpan={9}
                                message={
                                    search || status || branchId
                                        ? 'No production orders match the current filters.'
                                        : 'No production orders have been created yet.'
                                }
                            />
                        ) : (
                            orders.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell>
                                        <div>
                                            <p className="font-semibold text-text-primary">{order.productionNo}</p>
                                            <p className="text-xs text-text-tertiary">
                                                {order._count?.materials || 0} material lines
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">{order.branch.name}</p>
                                            <p className="text-xs text-text-tertiary">{order.branch.code}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">{order.product.name}</p>
                                            <p className="text-xs text-text-tertiary">{order.product.itemCode}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">{order.bom.name}</p>
                                            <p className="text-xs text-text-tertiary">Version {order.bom.version}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell align="center">
                                        {Number(order.plannedQty || 0).toLocaleString()} {order.plannedUnitCode}
                                    </TableCell>
                                    <TableCell align="center">
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {Number(order.completedQty || 0).toLocaleString()} {order.plannedUnitCode}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                Scrap {Number(order.scrapQty || 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Badge variant={getStatusVariant(order.status)} size="sm" dot>
                                            {order.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {format(new Date(order.createdAt), 'dd MMM yyyy')}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {format(new Date(order.createdAt), 'hh:mm a')}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="w-8 px-0"
                                            icon={<ArrowRight size={16} />}
                                            onClick={() => openOrderDetail(order.id)}
                                            aria-label={`Open production order ${order.productionNo}`}
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
                        totalItems={pagination.total}
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

            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create Production Order"
                maxWidth="2xl"
            >
                <form onSubmit={handleCreateOrder} className="space-y-6">
                    <FormGroup>
                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField label="Branch" required>
                                <Select
                                    value={createForm.branchId}
                                    onChange={(event) =>
                                        setCreateForm((prev) => ({ ...prev, branchId: event.target.value }))
                                    }
                                    options={[
                                        { value: '', label: 'Select branch' },
                                        ...branches.map((branch) => ({
                                            value: branch.id,
                                            label: `${branch.name} (${branch.code})`,
                                        })),
                                    ]}
                                    placeholder=""
                                    fullWidth
                                />
                            </FormField>
                            <FormField label="Active Recipe" required>
                                <Select
                                    value={createForm.bomId}
                                    onChange={(event) => handleSelectBom(event.target.value)}
                                    options={[
                                        { value: '', label: 'Select recipe' },
                                        ...bomOptions.map((bom) => ({
                                            value: bom.id,
                                            label: `${bom.name} • ${bom.product.name} • v${bom.version}`,
                                        })),
                                    ]}
                                    placeholder=""
                                    fullWidth
                                />
                            </FormField>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <FormField label="Planned Quantity" required>
                                <Input
                                    type="number"
                                    min="0.0001"
                                    step="0.0001"
                                    value={createForm.plannedQty}
                                    onChange={(event) =>
                                        setCreateForm((prev) => ({ ...prev, plannedQty: event.target.value }))
                                    }
                                    fullWidth
                                    required
                                />
                            </FormField>
                            <FormField label="Unit" required>
                                <Input value={createForm.plannedUnitCode} readOnly fullWidth />
                            </FormField>
                            <div className="rounded-lg border border-border-subtle bg-background-subtle px-3 py-2.5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                                    Recipe Output
                                </p>
                                <p className="mt-1 text-sm font-medium text-text-primary">
                                    {createForm.bomId
                                        ? `${bomMap.get(createForm.bomId)?.outputQty || 0} ${bomMap.get(createForm.bomId)?.outputUnitCode || ''}`
                                        : 'Select a recipe'}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField label="Planned Start Date">
                                <Input
                                    type="date"
                                    value={createForm.plannedStartDate}
                                    onChange={(event) =>
                                        setCreateForm((prev) => ({ ...prev, plannedStartDate: event.target.value }))
                                    }
                                    fullWidth
                                />
                            </FormField>
                            <FormField label="Planned End Date">
                                <Input
                                    type="date"
                                    value={createForm.plannedEndDate}
                                    onChange={(event) =>
                                        setCreateForm((prev) => ({ ...prev, plannedEndDate: event.target.value }))
                                    }
                                    fullWidth
                                />
                            </FormField>
                        </div>

                        <TextareaField
                            label="Notes"
                            value={createForm.notes}
                            onChange={(value) => setCreateForm((prev) => ({ ...prev, notes: value }))}
                            placeholder="Optional production notes"
                        />
                    </FormGroup>

                    <FormActions>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsCreateModalOpen(false)}
                            disabled={createMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={createMutation.isPending}>
                            Create Order
                        </Button>
                    </FormActions>
                </form>
            </Modal>
            <Modal
                isOpen={Boolean(selectedOrderId)}
                onClose={closeOrderDetail}
                title={selectedOrder ? selectedOrder.productionNo : 'Production Order'}
                maxWidth="5xl"
            >
                {isFetchingOrder || !selectedOrder ? (
                    <div className="py-12 text-center text-sm text-text-tertiary">Loading production order details...</div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 flex-1">
                                <div className="rounded-lg border border-border-subtle bg-background-subtle px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Status</p>
                                    <div className="mt-2">
                                        <Badge variant={getStatusVariant(selectedOrder.status)} dot>
                                            {selectedOrder.status}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-border-subtle bg-background-subtle px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Planned</p>
                                    <p className="mt-2 text-base font-semibold text-text-primary">
                                        {Number(selectedOrder.plannedQty || 0).toLocaleString()} {selectedOrder.plannedUnitCode}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-border-subtle bg-background-subtle px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Completed</p>
                                    <p className="mt-2 text-base font-semibold text-text-primary">
                                        {Number(selectedOrder.completedQty || 0).toLocaleString()} {selectedOrder.plannedUnitCode}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-border-subtle bg-background-subtle px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Scrap</p>
                                    <p className="mt-2 text-base font-semibold text-text-primary">
                                        {Number(selectedOrder.scrapQty || 0).toLocaleString()} {selectedOrder.plannedUnitCode}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {canStart && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        icon={<Play size={16} />}
                                        loading={startMutation.isPending}
                                        onClick={() => selectedOrderId && startMutation.mutate(selectedOrderId)}
                                    >
                                        Start
                                    </Button>
                                )}
                                {canConsume && (
                                    <Button type="button" variant="secondary" onClick={openConsumeModal}>
                                        Consume Materials
                                    </Button>
                                )}
                                {canComplete && (
                                    <Button type="button" onClick={openCompleteModal}>
                                        Complete
                                    </Button>
                                )}
                                {canCancel && (
                                    <Button
                                        type="button"
                                        variant="danger"
                                        icon={<XCircle size={16} />}
                                        loading={cancelMutation.isPending}
                                        onClick={handleCancel}
                                    >
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <Card>
                                <h3 className="text-lg font-bold text-text-primary">Order Summary</h3>
                                <div className="mt-4 space-y-3 text-sm">
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Branch</span>
                                        <span className="font-medium text-text-primary">
                                            {selectedOrder.branch.name} ({selectedOrder.branch.code})
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Finished Good</span>
                                        <span className="font-medium text-text-primary">
                                            {selectedOrder.product.name} ({selectedOrder.product.itemCode})
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Recipe</span>
                                        <span className="font-medium text-text-primary">
                                            {selectedOrder.bom.name} • v{selectedOrder.bom.version}
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Created</span>
                                        <span className="font-medium text-text-primary">{formatDateTime(selectedOrder.createdAt)}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Planned Start</span>
                                        <span className="font-medium text-text-primary">{formatDateTime(selectedOrder.plannedStartDate)}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Planned End</span>
                                        <span className="font-medium text-text-primary">{formatDateTime(selectedOrder.plannedEndDate)}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Actual Start</span>
                                        <span className="font-medium text-text-primary">{formatDateTime(selectedOrder.actualStartDate)}</span>
                                    </div>
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-text-tertiary">Actual End</span>
                                        <span className="font-medium text-text-primary">{formatDateTime(selectedOrder.actualEndDate)}</span>
                                    </div>
                                    <div className="rounded-lg border border-border-subtle bg-background-subtle px-3 py-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Notes</p>
                                        <p className="mt-1 text-sm text-text-primary">
                                            {selectedOrder.notes?.trim() || 'No notes added'}
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            <Card>
                                <h3 className="text-lg font-bold text-text-primary">Material Plan</h3>
                                <Table className="mt-4">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Material</TableHead>
                                            <TableHead align="center">Planned</TableHead>
                                            <TableHead align="center">Issued</TableHead>
                                            <TableHead align="center">Variance</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(selectedOrder.materials || []).length === 0 ? (
                                            <TableEmpty colSpan={4} message="No material lines found." />
                                        ) : (
                                            selectedOrder.materials.map((material) => (
                                                <TableRow key={material.id}>
                                                    <TableCell>
                                                        <div>
                                                            <p className="font-medium text-text-primary">{material.product.name}</p>
                                                            <p className="text-xs text-text-tertiary">{material.product.itemCode}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {Number(material.plannedQty || 0).toLocaleString()} {material.unitCode}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {Number(material.issuedQty || 0).toLocaleString()} {material.unitCode}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {Number(material.varianceQty || 0).toLocaleString()} {material.unitCode}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </Card>
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            <Card>
                                <h3 className="text-lg font-bold text-text-primary">Material Consumption History</h3>
                                <Table className="mt-4">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Material</TableHead>
                                            <TableHead align="center">Qty</TableHead>
                                            <TableHead align="center">Unit Cost</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(selectedOrder.consumptions || []).length === 0 ? (
                                            <TableEmpty colSpan={4} message="No material consumption has been recorded yet." />
                                        ) : (
                                            selectedOrder.consumptions.map((entry) => {
                                                const material = selectedOrder.materials.find(
                                                    (item) => item.productId === entry.productId && item.unitCode === entry.unitCode
                                                );
                                                return (
                                                    <TableRow key={entry.id}>
                                                        <TableCell>
                                                            <div>
                                                                <p className="font-medium text-text-primary">
                                                                    {material?.product.name || entry.productId}
                                                                </p>
                                                                <p className="text-xs text-text-tertiary">
                                                                    {entry.batchNo || 'No batch'}{entry.notes ? ` • ${entry.notes}` : ''}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            {Number(entry.qtyConsumed || 0).toLocaleString()} {entry.unitCode}
                                                        </TableCell>
                                                        <TableCell align="center">{Number(entry.cost || 0).toFixed(4)}</TableCell>
                                                        <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </Card>

                            <Card>
                                <h3 className="text-lg font-bold text-text-primary">Completion History</h3>
                                <Table className="mt-4">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Receipt</TableHead>
                                            <TableHead align="center">Qty</TableHead>
                                            <TableHead align="center">Unit Cost</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(selectedOrder.completions || []).length === 0 ? (
                                            <TableEmpty colSpan={4} message="No finished goods receipt has been recorded yet." />
                                        ) : (
                                            selectedOrder.completions.map((entry) => (
                                                <TableRow key={entry.id}>
                                                    <TableCell>
                                                        <div>
                                                            <p className="font-medium text-text-primary">{selectedOrder.product.name}</p>
                                                            <p className="text-xs text-text-tertiary">
                                                                {entry.notes?.trim() || 'No notes'}
                                                            </p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {Number(entry.qtyCompleted || 0).toLocaleString()} {entry.unitCode}
                                                    </TableCell>
                                                    <TableCell align="center">{Number(entry.unitCost || 0).toFixed(4)}</TableCell>
                                                    <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </Card>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={isConsumeModalOpen}
                onClose={() => setIsConsumeModalOpen(false)}
                title="Consume Materials"
                maxWidth="4xl"
            >
                <form onSubmit={handleConsume} className="space-y-4">
                    {consumeDraft.map((item, index) => (
                        <div key={`${item.productId}-${item.unitCode}`} className="rounded-lg border border-border-subtle p-4">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                <div className="xl:col-span-2">
                                    <p className="text-sm font-semibold text-text-primary">{item.productName}</p>
                                    <p className="text-xs text-text-tertiary">
                                        Planned {Number(item.plannedQty || 0).toLocaleString()} {item.unitCode} • Already issued{' '}
                                        {Number(item.issuedQty || 0).toLocaleString()} {item.unitCode}
                                    </p>
                                </div>
                                <FormField label="Qty Consumed" required>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={item.qtyConsumed}
                                        onChange={(event) =>
                                            setConsumeDraft((prev) =>
                                                prev.map((draft, draftIndex) =>
                                                    draftIndex === index ? { ...draft, qtyConsumed: event.target.value } : draft
                                                )
                                            )
                                        }
                                        fullWidth
                                    />
                                </FormField>
                                <FormField label="Batch No">
                                    <Input
                                        value={item.batchNo}
                                        onChange={(event) =>
                                            setConsumeDraft((prev) =>
                                                prev.map((draft, draftIndex) =>
                                                    draftIndex === index ? { ...draft, batchNo: event.target.value } : draft
                                                )
                                            )
                                        }
                                        placeholder="Optional"
                                        fullWidth
                                    />
                                </FormField>
                                <FormField label="Notes">
                                    <Input
                                        value={item.notes}
                                        onChange={(event) =>
                                            setConsumeDraft((prev) =>
                                                prev.map((draft, draftIndex) =>
                                                    draftIndex === index ? { ...draft, notes: event.target.value } : draft
                                                )
                                            )
                                        }
                                        placeholder="Optional"
                                        fullWidth
                                    />
                                </FormField>
                            </div>
                        </div>
                    ))}

                    <FormActions>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsConsumeModalOpen(false)}
                            disabled={consumeMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={consumeMutation.isPending}>
                            Save Consumption
                        </Button>
                    </FormActions>
                </form>
            </Modal>
            <Modal
                isOpen={isCompleteModalOpen}
                onClose={() => setIsCompleteModalOpen(false)}
                title="Complete Production Order"
                maxWidth="xl"
            >
                <form onSubmit={handleComplete} className="space-y-6">
                    <FormGroup>
                        <div className="grid gap-4 md:grid-cols-3">
                            <FormField label="Qty Completed" required>
                                <Input
                                    type="number"
                                    min="0.0001"
                                    step="0.0001"
                                    value={completionForm.qtyCompleted}
                                    onChange={(event) =>
                                        setCompletionForm((prev) => ({ ...prev, qtyCompleted: event.target.value }))
                                    }
                                    fullWidth
                                    required
                                />
                            </FormField>
                            <FormField label="Unit" required>
                                <Input value={completionForm.unitCode} readOnly fullWidth />
                            </FormField>
                            <FormField label="Scrap Qty">
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={completionForm.scrapQty}
                                    onChange={(event) =>
                                        setCompletionForm((prev) => ({ ...prev, scrapQty: event.target.value }))
                                    }
                                    fullWidth
                                />
                            </FormField>
                        </div>

                        <TextareaField
                            label="Completion Notes"
                            value={completionForm.notes}
                            onChange={(value) => setCompletionForm((prev) => ({ ...prev, notes: value }))}
                            placeholder="Optional completion note"
                        />
                    </FormGroup>

                    <FormActions>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsCompleteModalOpen(false)}
                            disabled={completeMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={completeMutation.isPending}>
                            Record Completion
                        </Button>
                    </FormActions>
                </form>
            </Modal>
        </PageLayout>
    );
}
