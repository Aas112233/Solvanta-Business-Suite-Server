import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Plus, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
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

type EmployeeRecord = {
    id: string;
    branchId?: string;
    employeeNo?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    departmentId?: string;
    positionId?: string;
    managerId?: string;
    hireDate?: string;
    employmentType?: string;
    status?: string;
    salary?: number;
    currency?: string;
    branch?: { id: string; name: string };
    department?: { id: string; name: string };
    position?: { id: string; title: string };
};

type SelectItem = {
    id: string;
    name?: string;
    title?: string;
};

type EmployeeFormState = {
    branchId: string;
    employeeNo: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    departmentId: string;
    positionId: string;
    managerId: string;
    hireDate: string;
    employmentType: string;
    status: string;
    salary: number;
    currency: string;
};

const createInitialFormData = (): EmployeeFormState => ({
    branchId: '',
    employeeNo: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    departmentId: '',
    positionId: '',
    managerId: '',
    hireDate: '',
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    salary: 0,
    currency: 'SAR',
});

const statusVariantMap: Record<string, 'success' | 'default' | 'warning'> = {
    ACTIVE: 'success',
    INACTIVE: 'default',
    ON_LEAVE: 'warning',
};

export function Employees() {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [branchFilter, setBranchFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [formData, setFormData] = useState<EmployeeFormState>(createInitialFormData());

    const { data: employees = [], isLoading } = useQuery<EmployeeRecord[]>({
        queryKey: ['hr-employees'],
        queryFn: async () => {
            const res = await api.get('/hr/employees');
            return res.data?.data || [];
        },
    });

    const { data: departments = [] } = useQuery<SelectItem[]>({
        queryKey: ['hr-departments'],
        queryFn: async () => {
            const res = await api.get('/hr/departments');
            return res.data?.data || [];
        },
    });

    const { data: positions = [] } = useQuery<SelectItem[]>({
        queryKey: ['hr-positions'],
        queryFn: async () => {
            const res = await api.get('/hr/positions');
            return res.data?.data || [];
        },
    });

    const { data: branches = [] } = useQuery<SelectItem[]>({
        queryKey: ['branches'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data?.data || [];
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: EmployeeFormState) => api.post('/hr/employees', data),
        onSuccess: () => {
            toast.success('Employee created');
            queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
            handleCancel();
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to create employee'),
    });

    const updateMutation = useMutation({
        mutationFn: (data: EmployeeFormState & { id: string }) => api.put(`/hr/employees/${data.id}`, data),
        onSuccess: () => {
            toast.success('Employee updated');
            queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
            handleCancel();
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to update employee'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/hr/employees/${id}`),
        onSuccess: () => {
            toast.success('Employee deleted');
            queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to delete employee'),
    });

    const visibleEmployees = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        return employees.filter((employee) => {
            const matchesSearch =
                !term ||
                [
                    employee.employeeNo,
                    employee.firstName,
                    employee.lastName,
                    employee.email,
                    employee.phone,
                    employee.department?.name,
                    employee.position?.title,
                    employee.branch?.name,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(term);

            const matchesBranch = !branchFilter || employee.branchId === branchFilter;
            const matchesStatus = !statusFilter || employee.status === statusFilter;

            return matchesSearch && matchesBranch && matchesStatus;
        });
    }, [branchFilter, employees, searchTerm, statusFilter]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const payload = { ...formData };
        if (!payload.departmentId) payload.departmentId = null as any;
        if (!payload.positionId) payload.positionId = null as any;
        if (!payload.managerId) payload.managerId = null as any;
        if (!payload.email) payload.email = null as any;
        if (!payload.phone) payload.phone = null as any;

        if (editingEmployee) {
            updateMutation.mutate({ ...payload, id: editingEmployee.id });
        } else {
            createMutation.mutate(payload);
        }
    };

    const handleEdit = (employee: EmployeeRecord) => {
        setEditingEmployee(employee);
        setFormData({
            branchId: employee.branchId || '',
            employeeNo: employee.employeeNo || '',
            firstName: employee.firstName || '',
            lastName: employee.lastName || '',
            email: employee.email || '',
            phone: employee.phone || '',
            departmentId: employee.departmentId || '',
            positionId: employee.positionId || '',
            managerId: employee.managerId || '',
            hireDate: employee.hireDate ? `${new Date(employee.hireDate).toISOString().split('T')[0]}T00:00:00Z` : '',
            employmentType: employee.employmentType || 'FULL_TIME',
            status: employee.status || 'ACTIVE',
            salary: employee.salary || 0,
            currency: employee.currency || 'SAR',
        });
        setIsAdding(true);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this employee?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleOpenCreate = () => {
        setEditingEmployee(null);
        setFormData(createInitialFormData());
        setIsAdding(true);
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingEmployee(null);
        setFormData(createInitialFormData());
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Employee Directory"
                subtitle={
                    isLoading
                        ? 'Loading employee records...'
                        : `${employees.length} employee${employees.length === 1 ? '' : 's'} across your organization`
                }
                action={
                    <Button icon={<Plus size={16} />} onClick={handleOpenCreate}>
                        Add Employee
                    </Button>
                }
            />

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Search employees, email, phone, or department"
                    />
                </div>
                <Select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    options={[
                        { value: '', label: 'All Branches' },
                        ...branches.map((branch) => ({
                            value: branch.id,
                            label: branch.name || 'Unnamed Branch',
                        })),
                    ]}
                    placeholder=""
                    className="min-w-[220px]"
                />
                <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                        { value: '', label: 'All Statuses' },
                        { value: 'ACTIVE', label: 'Active' },
                        { value: 'INACTIVE', label: 'Inactive' },
                    ]}
                    placeholder=""
                    className="min-w-[180px]"
                />
            </FilterBar>

            {!isLoading && employees.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Users size={48} />}
                        title="No employees yet"
                        description="Add your first employee record to start managing staff details in one place."
                        action={
                            <Button icon={<Plus size={16} />} onClick={handleOpenCreate}>
                                Add Employee
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <Card padding="none">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Emp No.</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Branch</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Position</TableHead>
                                <TableHead align="center">Status</TableHead>
                                <TableHead align="right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableLoading colSpan={7} message="Loading employees..." />
                            ) : visibleEmployees.length === 0 ? (
                                <TableEmpty
                                    colSpan={7}
                                    message="No employees match the current filters."
                                />
                            ) : (
                                visibleEmployees.map((employee) => (
                                    <TableRow key={employee.id}>
                                        <TableCell className="font-medium text-text-primary">
                                            {employee.employeeNo || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium text-text-primary">
                                                    {employee.firstName} {employee.lastName}
                                                </div>
                                                <div className="text-xs text-text-tertiary">
                                                    {[employee.email, employee.phone]
                                                        .filter(Boolean)
                                                        .join(' • ') || 'No contact details'}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{employee.branch?.name || '-'}</TableCell>
                                        <TableCell>{employee.department?.name || '-'}</TableCell>
                                        <TableCell>{employee.position?.title || '-'}</TableCell>
                                        <TableCell align="center">
                                            <Badge
                                                size="sm"
                                                variant={statusVariantMap[employee.status || ''] || 'default'}
                                            >
                                                {employee.status || 'UNKNOWN'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell align="right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Edit2 size={14} />}
                                                    onClick={() => handleEdit(employee)}
                                                    aria-label={`Edit ${employee.firstName || 'employee'} ${employee.lastName || ''}`.trim()}
                                                    title="Edit employee"
                                                    className="px-2"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Trash2 size={14} />}
                                                    onClick={() => handleDelete(employee.id)}
                                                    aria-label={`Delete ${employee.firstName || 'employee'} ${employee.lastName || ''}`.trim()}
                                                    title="Delete employee"
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
                title={editingEmployee ? 'Edit Employee' : 'New Employee'}
                maxWidth="4xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <FormField label="Employee Number" required>
                            <Input
                                value={formData.employeeNo}
                                onChange={(e) => setFormData({ ...formData, employeeNo: e.target.value })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="First Name" required>
                            <Input
                                value={formData.firstName}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Last Name" required>
                            <Input
                                value={formData.lastName}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Email Address">
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Phone Number">
                            <Input
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Branch" required>
                            <Select
                                value={formData.branchId}
                                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                                options={branches.map((branch) => ({
                                    value: branch.id,
                                    label: branch.name || 'Unnamed Branch',
                                }))}
                                placeholder="Select branch"
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

                        <FormField label="Position">
                            <Select
                                value={formData.positionId}
                                onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
                                options={[
                                    { value: '', label: 'No position' },
                                    ...positions.map((position) => ({
                                        value: position.id,
                                        label: position.title || position.name || 'Untitled Position',
                                    })),
                                ]}
                                placeholder=""
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Manager">
                            <Select
                                value={formData.managerId}
                                onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                                options={[
                                    { value: '', label: 'No manager' },
                                    ...employees
                                        .filter((employee) => employee.id !== editingEmployee?.id)
                                        .map((employee) => ({
                                            value: employee.id,
                                            label: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.employeeNo || 'Unnamed Employee',
                                        })),
                                ]}
                                placeholder=""
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Hire Date" required>
                            <Input
                                type="date"
                                value={formData.hireDate ? formData.hireDate.split('T')[0] : ''}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setFormData({
                                        ...formData,
                                        hireDate: value ? `${value}T00:00:00Z` : '',
                                    });
                                }}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Status">
                            <Select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                options={[
                                    { value: 'ACTIVE', label: 'Active' },
                                    { value: 'INACTIVE', label: 'Inactive' },
                                ]}
                                placeholder=""
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Salary">
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.salary}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        salary: e.target.value === '' ? 0 : Number(e.target.value),
                                    })
                                }
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Currency">
                            <Input
                                value={formData.currency}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        currency: e.target.value.toUpperCase(),
                                    })
                                }
                                fullWidth
                                maxLength={3}
                            />
                        </FormField>
                    </div>

                    <FormActions className="border-t border-border-subtle pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancel}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            loading={createMutation.isPending || updateMutation.isPending}
                        >
                            {editingEmployee ? 'Save Changes' : 'Create Employee'}
                        </Button>
                    </FormActions>
                </form>
            </Modal>
        </PageLayout>
    );
}
