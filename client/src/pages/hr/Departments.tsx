import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Edit2, Plus, Trash2 } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../lib/api';
import {
    Badge,
    Button,
    Card,
    EmptyState,
    FilterBar,
    FormActions,
    FormField,
    Input,
    Modal,
    PageHeader,
    PageLayout,
    SearchInput,
    Select,
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableLoading,
    TableRow,
} from '../../components/ui';

type DepartmentRecord = {
    id: string;
    name: string;
    code: string;
    description?: string | null;
    parentId?: string | null;
    parent?: { id: string; name: string } | null;
    _count?: { employees?: number };
};

type DepartmentFormState = {
    name: string;
    code: string;
    description: string;
    parentId: string;
};

type DepartmentPayload = {
    name: string;
    code: string;
    description?: string;
    parentId?: string;
};

const createInitialForm = (): DepartmentFormState => ({
    name: '',
    code: '',
    description: '',
    parentId: '',
});

export function Departments() {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<DepartmentRecord | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState<DepartmentFormState>(createInitialForm());

    const { data: departments = [], isLoading } = useQuery<DepartmentRecord[]>({
        queryKey: ['hr-departments'],
        queryFn: async () => {
            const res = await api.get('/hr/departments');
            return res.data?.data || [];
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: DepartmentPayload) => api.post('/hr/departments', data),
        onSuccess: () => {
            toast.success('Department created');
            queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
            handleCancel();
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to create department'),
    });

    const updateMutation = useMutation({
        mutationFn: (data: DepartmentPayload & { id: string }) =>
            api.put(`/hr/departments/${data.id}`, data),
        onSuccess: () => {
            toast.success('Department updated');
            queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
            handleCancel();
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to update department'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/hr/departments/${id}`),
        onSuccess: () => {
            toast.success('Department deleted');
            queryClient.invalidateQueries({ queryKey: ['hr-departments'] });
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to delete department'),
    });

    const visibleDepartments = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) {
            return departments;
        }

        return departments.filter((department) =>
            [
                department.code,
                department.name,
                department.description,
                department.parent?.name,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(term)
        );
    }, [departments, searchTerm]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const payload = {
            ...formData,
            parentId: formData.parentId || undefined,
            description: formData.description || undefined,
        };

        if (editingDepartment) {
            updateMutation.mutate({ ...payload, id: editingDepartment.id });
        } else {
            createMutation.mutate(payload);
        }
    };

    const handleEdit = (department: DepartmentRecord) => {
        setEditingDepartment(department);
        setFormData({
            name: department.name,
            code: department.code,
            description: department.description || '',
            parentId: department.parentId || '',
        });
        setIsAdding(true);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this department?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleOpenCreate = () => {
        setEditingDepartment(null);
        setFormData(createInitialForm());
        setIsAdding(true);
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingDepartment(null);
        setFormData(createInitialForm());
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Departments"
                subtitle={`${departments.length} department${departments.length === 1 ? '' : 's'} configured for your organization`}
                action={
                    <Button icon={<Plus size={16} />} onClick={handleOpenCreate}>
                        Add Department
                    </Button>
                }
            />

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Search by code, name, parent, or description"
                    />
                </div>
            </FilterBar>

            {!isLoading && departments.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Building2 size={48} />}
                        title="No departments yet"
                        description="Create your first department to organize teams, positions, and employee assignments."
                        action={
                            <Button icon={<Plus size={16} />} onClick={handleOpenCreate}>
                                Add Department
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <Card padding="none">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Parent</TableHead>
                                <TableHead align="center">Employees</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead align="right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableLoading colSpan={6} message="Loading departments..." />
                            ) : visibleDepartments.length === 0 ? (
                                <TableEmpty colSpan={6} message="No departments match the current search." />
                            ) : (
                                visibleDepartments.map((department) => (
                                    <TableRow key={department.id}>
                                        <TableCell className="font-medium text-text-primary">
                                            {department.code}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium text-text-primary">
                                                {department.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>{department.parent?.name || '-'}</TableCell>
                                        <TableCell align="center">
                                            <Badge size="sm" variant="brand">
                                                {department._count?.employees || 0}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{department.description || '-'}</TableCell>
                                        <TableCell align="right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Edit2 size={14} />}
                                                    onClick={() => handleEdit(department)}
                                                    aria-label={`Edit ${department.name}`}
                                                    title="Edit department"
                                                    className="px-2"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Trash2 size={14} />}
                                                    onClick={() => handleDelete(department.id)}
                                                    aria-label={`Delete ${department.name}`}
                                                    title="Delete department"
                                                    className="px-2 text-danger hover:text-danger"
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>
            )}

            <Modal
                isOpen={isAdding}
                onClose={handleCancel}
                title={editingDepartment ? 'Edit Department' : 'New Department'}
                maxWidth="2xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="Department Name" required>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Department Code" required>
                            <Input
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Parent Department">
                            <Select
                                value={formData.parentId}
                                onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                                options={[
                                    { value: '', label: 'No parent department' },
                                    ...departments
                                        .filter((department) => department.id !== editingDepartment?.id)
                                        .map((department) => ({
                                            value: department.id,
                                            label: `${department.code} - ${department.name}`,
                                        })),
                                ]}
                                placeholder=""
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Description">
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                fullWidth
                            />
                        </FormField>
                    </div>

                    <FormActions className="border-t border-border-subtle pt-4">
                        <Button type="button" variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            loading={createMutation.isPending || updateMutation.isPending}
                        >
                            {editingDepartment ? 'Save Changes' : 'Create Department'}
                        </Button>
                    </FormActions>
                </form>
            </Modal>
        </PageLayout>
    );
}
