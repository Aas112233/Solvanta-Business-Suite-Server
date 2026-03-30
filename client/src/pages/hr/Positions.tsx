import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, Edit2, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
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

type DepartmentOption = {
    id: string;
    name?: string;
};

type PositionRecord = {
    id: string;
    title: string;
    code: string;
    level: number;
    minSalary?: number | null;
    maxSalary?: number | null;
    departmentId?: string | null;
    department?: {
        id: string;
        name?: string | null;
    } | null;
    _count?: {
        employees?: number;
    };
};

type PositionFormState = {
    title: string;
    code: string;
    level: number;
    minSalary: number;
    maxSalary: number;
    departmentId: string;
};

const createInitialForm = (): PositionFormState => ({
    title: '',
    code: '',
    level: 1,
    minSalary: 0,
    maxSalary: 0,
    departmentId: '',
});

export function Positions() {
    const queryClient = useQueryClient();
    const currency = useAuthStore((state) => state.user?.company?.currency || 'SAR');
    const [isAdding, setIsAdding] = useState(false);
    const [editingPosition, setEditingPosition] = useState<PositionRecord | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [formData, setFormData] = useState<PositionFormState>(createInitialForm());

    const salaryFormatter = useMemo(
        () =>
            new Intl.NumberFormat(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }),
        []
    );

    const formatSalary = (value: number) => `${currency} ${salaryFormatter.format(value)}`;

    const { data: positions = [], isLoading } = useQuery<PositionRecord[]>({
        queryKey: ['hr-positions'],
        queryFn: async () => {
            const res = await api.get('/hr/positions');
            return res.data?.data || [];
        },
    });

    const { data: departments = [] } = useQuery<DepartmentOption[]>({
        queryKey: ['hr-departments'],
        queryFn: async () => {
            const res = await api.get('/hr/departments');
            return res.data?.data || [];
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: PositionFormState) =>
            api.post('/hr/positions', {
                ...data,
                departmentId: data.departmentId || null,
                level: Number(data.level),
                minSalary: Number(data.minSalary),
                maxSalary: Number(data.maxSalary),
            }),
        onSuccess: () => {
            toast.success('Position created');
            queryClient.invalidateQueries({ queryKey: ['hr-positions'] });
            handleCancel();
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to create position'),
    });

    const updateMutation = useMutation({
        mutationFn: (data: PositionFormState & { id: string }) =>
            api.put(`/hr/positions/${data.id}`, {
                ...data,
                departmentId: data.departmentId || null,
                level: Number(data.level),
                minSalary: Number(data.minSalary),
                maxSalary: Number(data.maxSalary),
            }),
        onSuccess: () => {
            toast.success('Position updated');
            queryClient.invalidateQueries({ queryKey: ['hr-positions'] });
            handleCancel();
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to update position'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/hr/positions/${id}`),
        onSuccess: () => {
            toast.success('Position deleted');
            queryClient.invalidateQueries({ queryKey: ['hr-positions'] });
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to delete position'),
    });

    const visiblePositions = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        return positions.filter((position) => {
            const matchesSearch =
                !term ||
                [
                    position.title,
                    position.code,
                    position.department?.name,
                    position.level,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(term);

            const matchesDepartment = !departmentFilter || position.departmentId === departmentFilter;

            return matchesSearch && matchesDepartment;
        });
    }, [departmentFilter, positions, searchTerm]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const submitData = {
            ...formData,
            departmentId: formData.departmentId || '',
        };

        if (editingPosition) {
            updateMutation.mutate({ ...submitData, id: editingPosition.id });
        } else {
            createMutation.mutate(submitData);
        }
    };

    const handleEdit = (position: PositionRecord) => {
        setEditingPosition(position);
        setFormData({
            title: position.title,
            code: position.code,
            level: position.level,
            minSalary: Number(position.minSalary || 0),
            maxSalary: Number(position.maxSalary || 0),
            departmentId: position.departmentId || '',
        });
        setIsAdding(true);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this position?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleOpenCreate = () => {
        setEditingPosition(null);
        setFormData(createInitialForm());
        setIsAdding(true);
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingPosition(null);
        setFormData(createInitialForm());
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Positions"
                subtitle={`${positions.length} role${positions.length === 1 ? '' : 's'} defined across departments`}
                action={
                    <Button icon={<Plus size={16} />} onClick={handleOpenCreate}>
                        Add Position
                    </Button>
                }
            />

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Search title, code, level, or department"
                    />
                </div>
                <Select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    options={[
                        { value: '', label: 'All Departments' },
                        ...departments.map((department) => ({
                            value: department.id,
                            label: department.name || 'Unnamed Department',
                        })),
                    ]}
                    placeholder=""
                    className="min-w-[220px]"
                />
            </FilterBar>

            {!isLoading && positions.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<BriefcaseBusiness size={48} />}
                        title="No positions yet"
                        description="Create positions to standardize job levels, salary ranges, and department assignments."
                        action={
                            <Button icon={<Plus size={16} />} onClick={handleOpenCreate}>
                                Add Position
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <Card padding="none">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead align="center">Level</TableHead>
                                <TableHead>Salary Range</TableHead>
                                <TableHead align="center">Employees</TableHead>
                                <TableHead align="right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableLoading colSpan={7} message="Loading positions..." />
                            ) : visiblePositions.length === 0 ? (
                                <TableEmpty colSpan={7} message="No positions match the current filters." />
                            ) : (
                                visiblePositions.map((position) => (
                                    <TableRow key={position.id}>
                                        <TableCell className="font-medium text-text-primary">
                                            {position.title}
                                        </TableCell>
                                        <TableCell>{position.code}</TableCell>
                                        <TableCell>{position.department?.name || '-'}</TableCell>
                                        <TableCell align="center">
                                            <Badge size="sm" variant="brand">
                                                L{position.level}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {formatSalary(Number(position.minSalary || 0))} -{' '}
                                            {formatSalary(Number(position.maxSalary || 0))}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Badge size="sm" variant="default">
                                                {position._count?.employees || 0}
                                            </Badge>
                                        </TableCell>
                                        <TableCell align="right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Edit2 size={14} />}
                                                    onClick={() => handleEdit(position)}
                                                    aria-label={`Edit ${position.title}`}
                                                    title="Edit position"
                                                    className="px-2"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Trash2 size={14} />}
                                                    onClick={() => handleDelete(position.id)}
                                                    aria-label={`Delete ${position.title}`}
                                                    title="Delete position"
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
                title={editingPosition ? 'Edit Position' : 'New Position'}
                maxWidth="3xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="Job Title" required>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Position Code" required>
                            <Input
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Department">
                            <Select
                                value={formData.departmentId}
                                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                options={[
                                    { value: '', label: 'No department' },
                                    ...departments.map((department) => ({
                                        value: department.id,
                                        label: department.name || 'Unnamed Department',
                                    })),
                                ]}
                                placeholder=""
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Job Level">
                            <Input
                                type="number"
                                min="1"
                                value={formData.level}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        level: e.target.value === '' ? 1 : Number(e.target.value),
                                    })
                                }
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Minimum Salary">
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                value={formData.minSalary}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        minSalary: e.target.value === '' ? 0 : Number(e.target.value),
                                    })
                                }
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Maximum Salary">
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                value={formData.maxSalary}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        maxSalary: e.target.value === '' ? 0 : Number(e.target.value),
                                    })
                                }
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
                            {editingPosition ? 'Save Changes' : 'Create Position'}
                        </Button>
                    </FormActions>
                </form>
            </Modal>
        </PageLayout>
    );
}
