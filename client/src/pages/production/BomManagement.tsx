import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Edit2, Package, Plus, RefreshCw } from 'lucide-react';
import toast from '@/lib/toast';
import { format } from 'date-fns';
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

type BomStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

interface ProductUnit {
    unitCode: string;
    unitName: string;
    isBase?: boolean;
}

interface ProductSummary {
    id: string;
    name: string;
    itemCode: string;
    kind?: string;
    units: ProductUnit[];
}

interface BomItemForm {
    productId: string;
    unitCode: string;
    qtyRequired: string;
    scrapPercent: string;
    notes: string;
}

interface BomListItem {
    id: string;
    name: string;
    version: string;
    status: BomStatus;
    outputQty: number;
    outputUnitCode: string;
    updatedAt: string;
    notes?: string | null;
    product: {
        id: string;
        name: string;
        itemCode: string;
        kind?: string;
    };
    _count?: {
        items: number;
        orders: number;
    };
}

interface BomDetail extends BomListItem {
    items: Array<{
        id: string;
        productId: string;
        unitCode: string;
        qtyRequired: number;
        scrapPercent: number;
        notes?: string | null;
        product: {
            id: string;
            name: string;
            itemCode: string;
            kind?: string;
        };
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

interface BomFormState {
    productId: string;
    name: string;
    version: string;
    outputQty: string;
    outputUnitCode: string;
    notes: string;
    items: BomItemForm[];
}

const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ARCHIVED', label: 'Archived' },
];

const createEmptyBomItem = (): BomItemForm => ({
    productId: '',
    unitCode: '',
    qtyRequired: '1',
    scrapPercent: '0',
    notes: '',
});

const createInitialForm = (): BomFormState => ({
    productId: '',
    name: '',
    version: '1.0',
    outputQty: '1',
    outputUnitCode: '',
    notes: '',
    items: [createEmptyBomItem()],
});

function getStatusVariant(status: BomStatus): 'default' | 'success' | 'warning' | 'danger' {
    switch (status) {
        case 'ACTIVE':
            return 'success';
        case 'DRAFT':
            return 'warning';
        case 'ARCHIVED':
            return 'danger';
        default:
            return 'default';
    }
}

function formatProductLabel(product: ProductSummary | { name: string; itemCode: string; kind?: string }) {
    const kind = product.kind ? ` • ${product.kind.replace(/_/g, ' ')}` : '';
    return `${product.name} (${product.itemCode})${kind}`;
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
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-border bg-background-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:border-brand"
            />
        </div>
    );
}

export default function BomManagement() {
    const queryClient = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBomId, setEditingBomId] = useState<string | null>(null);
    const [isLoadingBom, setIsLoadingBom] = useState(false);
    const [form, setForm] = useState<BomFormState>(createInitialForm);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['boms', page, limit, search, status],
        queryFn: async () => {
            const response = await api.get('/bom', {
                params: {
                    page,
                    limit,
                    search: search || undefined,
                    status: status || undefined,
                },
            });
            return response.data as PaginatedResponse<BomListItem>;
        },
    });

    const { data: products = [] } = useQuery({
        queryKey: ['bom-products'],
        queryFn: async () => {
            const response = await api.get('/products', {
                params: { page: 1, limit: 500, status: 'ACTIVE' },
            });
            return (response.data?.data || []) as ProductSummary[];
        },
    });

    const productMap = useMemo(
        () => new Map(products.map((product) => [product.id, product])),
        [products]
    );

    const boms = data?.data || [];
    const pagination = data?.meta?.pagination;
    const activeCount = boms.filter((bom) => bom.status === 'ACTIVE').length;
    const draftCount = boms.filter((bom) => bom.status === 'DRAFT').length;

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingBomId(null);
        setIsLoadingBom(false);
        setForm(createInitialForm());
    };

    const createMutation = useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.post('/bom', payload),
        onSuccess: () => {
            toast.success('Recipe created successfully');
            void queryClient.invalidateQueries({ queryKey: ['boms'] });
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to create recipe');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ bomId, payload }: { bomId: string; payload: Record<string, unknown> }) =>
            api.patch(`/bom/${bomId}`, payload),
        onSuccess: () => {
            toast.success('Recipe updated successfully');
            void queryClient.invalidateQueries({ queryKey: ['boms'] });
            closeModal();
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to update recipe');
        },
    });

    const activateMutation = useMutation({
        mutationFn: (bomId: string) => api.post(`/bom/${bomId}/activate`),
        onSuccess: () => {
            toast.success('Recipe activated successfully');
            void queryClient.invalidateQueries({ queryKey: ['boms'] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error?.message || 'Failed to activate recipe');
        },
    });

    const refreshList = async () => {
        await queryClient.invalidateQueries({ queryKey: ['boms'] });
    };

    const openCreateModal = () => {
        setEditingBomId(null);
        setForm(createInitialForm());
        setIsModalOpen(true);
    };

    const openEditModal = async (bomId: string) => {
        try {
            setIsLoadingBom(true);
            setEditingBomId(bomId);
            setIsModalOpen(true);
            const response = await api.get(`/bom/${bomId}`);
            const bom = response.data?.data as BomDetail;
            setForm({
                productId: bom.product.id,
                name: bom.name,
                version: bom.version,
                outputQty: String(bom.outputQty),
                outputUnitCode: bom.outputUnitCode,
                notes: bom.notes || '',
                items: (bom.items || []).map((item) => ({
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyRequired: String(item.qtyRequired),
                    scrapPercent: String(item.scrapPercent ?? 0),
                    notes: item.notes || '',
                })),
            });
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || 'Failed to load recipe details');
            closeModal();
        } finally {
            setIsLoadingBom(false);
        }
    };

    const runValidation = async (bomId: string) => {
        try {
            const response = await api.post(`/bom/${bomId}/validate`);
            const result = response.data?.data as { valid: boolean; issues: string[]; itemCount: number };
            if (result.valid) {
                toast.success(`Recipe is valid with ${result.itemCount} material lines`);
                return;
            }
            toast.error(result.issues[0] || 'Recipe validation failed');
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || 'Failed to validate recipe');
        }
    };

    const setFinishedGood = (productId: string) => {
        const product = productMap.get(productId);
        const nextUnitCode = product?.units.find((unit) => unit.isBase)?.unitCode || product?.units[0]?.unitCode || '';
        setForm((prev) => ({
            ...prev,
            productId,
            outputUnitCode: nextUnitCode,
        }));
    };

    const updateItem = (index: number, patch: Partial<BomItemForm>) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
        }));
    };

    const setItemProduct = (index: number, productId: string) => {
        const product = productMap.get(productId);
        const nextUnitCode = product?.units.find((unit) => unit.isBase)?.unitCode || product?.units[0]?.unitCode || '';
        updateItem(index, { productId, unitCode: nextUnitCode });
    };

    const addItem = () => {
        setForm((prev) => ({ ...prev, items: [...prev.items, createEmptyBomItem()] }));
    };

    const removeItem = (index: number) => {
        setForm((prev) => ({
            ...prev,
            items: prev.items.length === 1 ? prev.items : prev.items.filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!form.productId) {
            toast.error('Select a finished good');
            return;
        }

        if (!form.outputUnitCode) {
            toast.error('Select an output unit');
            return;
        }

        const validItems = form.items.filter((item) => item.productId && item.unitCode && Number(item.qtyRequired) > 0);
        if (validItems.length === 0) {
            toast.error('Add at least one recipe component');
            return;
        }

        const payload = {
            productId: form.productId,
            name: form.name.trim(),
            version: form.version.trim() || '1.0',
            outputQty: Number(form.outputQty || 1),
            outputUnitCode: form.outputUnitCode,
            notes: form.notes.trim() || undefined,
            items: validItems.map((item) => ({
                productId: item.productId,
                unitCode: item.unitCode,
                qtyRequired: Number(item.qtyRequired),
                scrapPercent: Number(item.scrapPercent || 0),
                notes: item.notes.trim() || undefined,
            })),
        };

        if (!payload.name) {
            toast.error('Enter a recipe name');
            return;
        }

        if (editingBomId) {
            updateMutation.mutate({ bomId: editingBomId, payload });
            return;
        }

        createMutation.mutate(payload);
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Production Recipes"
                subtitle="Define finished-good recipes and keep the active version ready for production orders."
                action={
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            icon={<RefreshCw size={16} />}
                            loading={isFetching}
                            onClick={() => {
                                void refreshList();
                            }}
                        >
                            Refresh
                        </Button>
                        {hasPermission('bom.create') && (
                            <Button type="button" icon={<Plus size={16} />} onClick={openCreateModal}>
                                New Recipe
                            </Button>
                        )}
                    </div>
                }
            />

            <StatsGrid columns={3}>
                <StatCard
                    label="Recipe Records"
                    value={pagination?.total || 0}
                    sub="Recipes in the current company"
                    icon={<ClipboardList size={20} />}
                />
                <StatCard
                    label="Active Versions"
                    value={activeCount}
                    sub="Currently selected for production use"
                    icon={<CheckCircle2 size={20} />}
                />
                <StatCard
                    label="Drafts"
                    value={draftCount}
                    sub="Pending review or activation"
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
                        placeholder="Search recipe name, version, or item code"
                    />
                </div>
                <Select
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                    }}
                    options={statusOptions}
                    placeholder=""
                    className="min-w-[180px]"
                />
            </FilterBar>

            <Card padding="none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Finished Good</TableHead>
                            <TableHead>Recipe</TableHead>
                            <TableHead align="center">Output</TableHead>
                            <TableHead align="center">Components</TableHead>
                            <TableHead align="center">Orders</TableHead>
                            <TableHead align="center">Status</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead align="center">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={8} message="Loading recipe records..." />
                        ) : boms.length === 0 ? (
                            <TableEmpty
                                colSpan={8}
                                message={
                                    search || status
                                        ? 'No recipe records match the current filters.'
                                        : 'No recipe records have been created yet.'
                                }
                            />
                        ) : (
                            boms.map((bom) => (
                                <TableRow key={bom.id}>
                                    <TableCell>
                                        <div>
                                            <p className="font-semibold text-text-primary">{bom.product.name}</p>
                                            <p className="text-xs text-text-tertiary">{bom.product.itemCode}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-semibold text-text-primary">{bom.name}</p>
                                            <p className="text-xs text-text-tertiary">Version {bom.version}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell align="center">
                                        <span className="font-medium text-text-primary">
                                            {Number(bom.outputQty || 0).toLocaleString()} {bom.outputUnitCode}
                                        </span>
                                    </TableCell>
                                    <TableCell align="center">{bom._count?.items || 0}</TableCell>
                                    <TableCell align="center">{bom._count?.orders || 0}</TableCell>
                                    <TableCell align="center">
                                        <Badge variant={getStatusVariant(bom.status)} size="sm" dot>
                                            {bom.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {format(new Date(bom.updatedAt), 'dd MMM yyyy')}
                                            </p>
                                            <p className="text-xs text-text-tertiary">
                                                {format(new Date(bom.updatedAt), 'hh:mm a')}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell align="center">
                                        <div className="flex flex-wrap items-center justify-center gap-2">
                                            {hasPermission('bom.view') && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        void runValidation(bom.id);
                                                    }}
                                                >
                                                    Validate
                                                </Button>
                                            )}
                                            {hasPermission('bom.edit') && bom.status !== 'ACTIVE' && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    icon={<Edit2 size={14} />}
                                                    onClick={() => {
                                                        void openEditModal(bom.id);
                                                    }}
                                                >
                                                    Edit
                                                </Button>
                                            )}
                                            {hasPermission('bom.activate') && bom.status !== 'ACTIVE' && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    loading={activateMutation.isPending}
                                                    onClick={() => activateMutation.mutate(bom.id)}
                                                >
                                                    Activate
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
                isOpen={isModalOpen}
                onClose={closeModal}
                title={editingBomId ? 'Edit Recipe' : 'Create Recipe'}
                maxWidth="5xl"
            >
                {isLoadingBom ? (
                    <div className="py-12 text-center text-sm text-text-tertiary">Loading recipe details...</div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <FormGroup>
                            <div className="grid gap-4 md:grid-cols-2">
                                <FormField label="Finished Good" required>
                                    <Select
                                        value={form.productId}
                                        onChange={(event) => setFinishedGood(event.target.value)}
                                        options={[
                                            { value: '', label: 'Select finished good' },
                                            ...products.map((product) => ({
                                                value: product.id,
                                                label: formatProductLabel(product),
                                            })),
                                        ]}
                                        placeholder=""
                                        fullWidth
                                    />
                                </FormField>
                                <FormField label="Recipe Name" required>
                                    <Input
                                        value={form.name}
                                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                        placeholder="e.g. Chocolate Cake 1kg"
                                        fullWidth
                                        required
                                    />
                                </FormField>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <FormField label="Version" required>
                                    <Input
                                        value={form.version}
                                        onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))}
                                        placeholder="1.0"
                                        fullWidth
                                        required
                                    />
                                </FormField>
                                <FormField label="Output Quantity" required>
                                    <Input
                                        type="number"
                                        min="0.0001"
                                        step="0.0001"
                                        value={form.outputQty}
                                        onChange={(event) => setForm((prev) => ({ ...prev, outputQty: event.target.value }))}
                                        fullWidth
                                        required
                                    />
                                </FormField>
                                <FormField label="Output Unit" required>
                                    <Select
                                        value={form.outputUnitCode}
                                        onChange={(event) =>
                                            setForm((prev) => ({ ...prev, outputUnitCode: event.target.value }))
                                        }
                                        options={[
                                            { value: '', label: 'Select unit' },
                                            ...((productMap.get(form.productId)?.units || []).map((unit) => ({
                                                value: unit.unitCode,
                                                label: `${unit.unitName} (${unit.unitCode})`,
                                            }))),
                                        ]}
                                        placeholder=""
                                        fullWidth
                                    />
                                </FormField>
                            </div>

                            <TextareaField
                                label="Notes"
                                value={form.notes}
                                onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))}
                                placeholder="Optional production notes for this recipe"
                            />
                        </FormGroup>
                        <Card>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-text-primary">Components</h3>
                                    <p className="text-sm text-text-secondary">
                                        Define the raw materials consumed to produce the finished good.
                                    </p>
                                </div>
                                <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                                    Add Component
                                </Button>
                            </div>

                            <div className="mt-4 space-y-4">
                                {form.items.map((item, index) => {
                                    const selectedProduct = productMap.get(item.productId);
                                    return (
                                        <div key={`bom-item-${index}`} className="rounded-lg border border-border-subtle p-4">
                                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                                <FormField label="Component" required>
                                                    <Select
                                                        value={item.productId}
                                                        onChange={(event) => setItemProduct(index, event.target.value)}
                                                        options={[
                                                            { value: '', label: 'Select component' },
                                                            ...products.map((product) => ({
                                                                value: product.id,
                                                                label: formatProductLabel(product),
                                                            })),
                                                        ]}
                                                        placeholder=""
                                                        fullWidth
                                                    />
                                                </FormField>
                                                <FormField label="Unit" required>
                                                    <Select
                                                        value={item.unitCode}
                                                        onChange={(event) =>
                                                            updateItem(index, { unitCode: event.target.value })
                                                        }
                                                        options={[
                                                            { value: '', label: 'Select unit' },
                                                            ...((selectedProduct?.units || []).map((unit) => ({
                                                                value: unit.unitCode,
                                                                label: `${unit.unitName} (${unit.unitCode})`,
                                                            }))),
                                                        ]}
                                                        placeholder=""
                                                        fullWidth
                                                    />
                                                </FormField>
                                                <FormField label="Qty Required" required>
                                                    <Input
                                                        type="number"
                                                        min="0.0001"
                                                        step="0.0001"
                                                        value={item.qtyRequired}
                                                        onChange={(event) =>
                                                            updateItem(index, { qtyRequired: event.target.value })
                                                        }
                                                        fullWidth
                                                        required
                                                    />
                                                </FormField>
                                                <FormField label="Scrap %" required>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.scrapPercent}
                                                        onChange={(event) =>
                                                            updateItem(index, { scrapPercent: event.target.value })
                                                        }
                                                        fullWidth
                                                        required
                                                    />
                                                </FormField>
                                                <div className="flex items-end">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full"
                                                        disabled={form.items.length === 1}
                                                        onClick={() => removeItem(index)}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="mt-4">
                                                <TextareaField
                                                    label="Line Notes"
                                                    value={item.notes}
                                                    onChange={(value) => updateItem(index, { notes: value })}
                                                    placeholder="Optional component note"
                                                    rows={2}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        <FormActions>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={closeModal}
                                disabled={createMutation.isPending || updateMutation.isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                loading={createMutation.isPending || updateMutation.isPending}
                            >
                                {editingBomId ? 'Save Changes' : 'Create Recipe'}
                            </Button>
                        </FormActions>
                    </form>
                )}
            </Modal>
        </PageLayout>
    );
}
