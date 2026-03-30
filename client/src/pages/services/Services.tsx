import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Search, Wrench, DollarSign, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
    PageLayout,
    PageHeader,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Button,
    Input,
    Modal,
    FormField,
    FormGroup,
    FormActions,
    Select,
    Badge,
    StatusBadge,
    SearchInput,
    EmptyState,
} from '@/components/ui';

interface ServiceMaster {
    id: string;
    code: string;
    name: string;
    description?: string;
    category?: string;
    standardRate: number;
    costRate?: number;
    duration?: number;
    isLabor: boolean;
    isActive: boolean;
}

export function Services() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<ServiceMaster | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const { data: services = [], isLoading } = useQuery({
        queryKey: ['services', { search: searchTerm, category: filterCategory, isActive: filterStatus }],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchTerm) params.set('search', searchTerm);
            if (filterCategory) params.set('category', filterCategory);
            if (filterStatus) params.set('isActive', filterStatus);
            const res = await api.get(`/services?${params}`);
            return res.data?.data || [];
        },
    });

    const { data: categories = [] } = useQuery({
        queryKey: ['service-categories'],
        queryFn: async () => {
            const res = await api.get('/services/categories');
            return res.data?.data || [];
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => api.post('/services', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
            toast.success('Sales service created successfully');
            setIsModalOpen(false);
            setEditingService(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to create sales service');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/services/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
            toast.success('Sales service updated successfully');
            setIsModalOpen(false);
            setEditingService(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to update sales service');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/services/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
            toast.success('Sales service deleted successfully');
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to delete sales service');
        },
    });

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {
            code: formData.get('code') as string,
            name: formData.get('name') as string,
            description: formData.get('description') as string || undefined,
            category: formData.get('category') as string || undefined,
            standardRate: Number(formData.get('standardRate')),
            costRate: formData.get('costRate') ? Number(formData.get('costRate')) : undefined,
            duration: formData.get('duration') ? Number(formData.get('duration')) : undefined,
            isLabor: formData.get('isLabor') === 'on',
        };

        if (editingService) {
            updateMutation.mutate({ id: editingService.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleEdit = (service: ServiceMaster) => {
        setEditingService(service);
        setIsModalOpen(true);
    };

    const handleDelete = (service: ServiceMaster) => {
        if (window.confirm(`Are you sure you want to delete "${service.name}"? This sales service will be removed from all future invoices.`)) {
            deleteMutation.mutate(service.id);
        }
    };

    const handleNew = () => {
        setEditingService(null);
        setIsModalOpen(true);
    };

    return (
        <PageLayout>
            <PageHeader
                title="Sales Services"
                subtitle="Manage non-inventory services (repairs, installations, consulting, etc.)"
                action={
                    <Button variant="primary" icon={<Plus size={16} />} onClick={handleNew}>
                        New Sales Service
                    </Button>
                }
            />

            {/* Filters */}
            <Card className="mb-4">
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <SearchInput
                                value={searchTerm}
                                onChange={setSearchTerm}
                                placeholder="Search services..."
                            />
                        </div>
                        <Select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            options={[
                                { value: '', label: 'All Categories' },
                                ...categories.map((c: any) => ({ value: c.category, label: `${c.category} (${c.count})` })),
                            ]}
                            placeholder="Filter by category"
                            className="w-[200px]"
                        />
                        <Select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            options={[
                                { value: '', label: 'All Status' },
                                { value: 'true', label: 'Active' },
                                { value: 'false', label: 'Inactive' },
                            ]}
                            placeholder="Filter by status"
                            className="w-[150px]"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Services Table */}
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Service Name</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Standard Rate</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead align="right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={8}>
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : services.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8}>
                                    <EmptyState
                                        icon={<Wrench size={48} />}
                                        title="No sales services yet"
                                        description="Create your first sales service to offer non-inventory items"
                                        action={
                                            <Button size="sm" icon={<Plus size={14} />} onClick={handleNew}>
                                                New Sales Service
                                            </Button>
                                        }
                                    />
                                </TableCell>
                            </TableRow>
                        ) : (
                            services.map((service: ServiceMaster) => (
                                <TableRow key={service.id}>
                                    <TableCell className="font-mono text-sm">{service.code}</TableCell>
                                    <TableCell>
                                        <div>
                                            <div className="font-medium">{service.name}</div>
                                            {service.description && (
                                                <div className="text-xs text-text-tertiary">{service.description}</div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {service.category ? (
                                            <Badge variant="info">{service.category}</Badge>
                                        ) : (
                                            <span className="text-text-tertiary">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">${service.standardRate.toFixed(2)}</div>
                                        {service.costRate && (
                                            <div className="text-xs text-text-tertiary">Cost: ${service.costRate.toFixed(2)}</div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {service.duration ? (
                                            <div className="flex items-center gap-1 text-sm">
                                                <Clock size={14} />
                                                {service.duration} min
                                            </div>
                                        ) : (
                                            <span className="text-text-tertiary">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {service.isLabor ? (
                                            <Badge variant="warning">Labor</Badge>
                                        ) : (
                                            <Badge variant="default">Service</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={service.isActive ? 'active' : 'inactive'} />
                                    </TableCell>
                                    <TableCell align="right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={<Edit2 size={16} />}
                                                onClick={() => handleEdit(service)}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={<Trash2 size={16} />}
                                                onClick={() => handleDelete(service)}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* Service Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingService(null);
                }}
                title={editingService ? 'Edit Sales Service' : 'New Sales Service'}
                maxWidth="lg"
            >
                <form onSubmit={handleSubmit}>
                    <FormGroup>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Service Code" required>
                                <Input
                                    name="code"
                                    defaultValue={editingService?.code}
                                    placeholder="e.g., SVC-001"
                                    fullWidth
                                    required
                                />
                            </FormField>
                            <FormField label="Service Name" required>
                                <Input
                                    name="name"
                                    defaultValue={editingService?.name}
                                    placeholder="e.g., PC Repair"
                                    fullWidth
                                    required
                                />
                            </FormField>
                        </div>

                        <FormField label="Description">
                            <Input
                                name="description"
                                defaultValue={editingService?.description}
                                placeholder="Brief description of the service"
                                fullWidth
                            />
                        </FormField>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Category">
                                <Input
                                    name="category"
                                    defaultValue={editingService?.category}
                                    placeholder="e.g., Repair, Installation, Maintenance"
                                    fullWidth
                                />
                            </FormField>
                            <FormField label="Duration (minutes)">
                                <Input
                                    name="duration"
                                    type="number"
                                    defaultValue={editingService?.duration}
                                    placeholder="Estimated time"
                                    fullWidth
                                />
                            </FormField>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Standard Rate ($)" required>
                                <Input
                                    name="standardRate"
                                    type="number"
                                    step="0.01"
                                    defaultValue={editingService?.standardRate}
                                    placeholder="0.00"
                                    fullWidth
                                    required
                                />
                            </FormField>
                            <FormField label="Cost Rate ($)">
                                <Input
                                    name="costRate"
                                    type="number"
                                    step="0.01"
                                    defaultValue={editingService?.costRate}
                                    placeholder="Your cost (optional)"
                                    fullWidth
                                />
                            </FormField>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                name="isLabor"
                                id="isLabor"
                                defaultChecked={editingService?.isLabor}
                                className="rounded border-gray-300"
                            />
                            <label htmlFor="isLabor" className="text-sm font-medium">
                                This is a labor-only service
                            </label>
                        </div>
                    </FormGroup>

                    <FormActions className="mt-6">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsModalOpen(false)}
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={createMutation.isPending || updateMutation.isPending}
                        >
                            {editingService ? 'Update Sales Service' : 'Create Sales Service'}
                        </Button>
                    </FormActions>
                </form>
            </Modal>
        </PageLayout>
    );
}
