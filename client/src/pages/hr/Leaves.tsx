import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Plane, Plus, XCircle } from 'lucide-react';
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

type LeaveRecord = {
    id: string;
    employee?: {
        firstName?: string | null;
        lastName?: string | null;
        employeeNo?: string | null;
    } | null;
    leaveType?: {
        id: string;
        name?: string | null;
        code?: string | null;
    } | null;
    startDate: string;
    endDate: string;
    days?: number | null;
    reason?: string | null;
    status?: string | null;
    approvedBy?: {
        name?: string | null;
    } | null;
};

type LeaveType = {
    id: string;
    name?: string;
    code?: string;
};

type EmployeeOption = {
    id: string;
    firstName?: string;
    lastName?: string;
    employeeNo?: string;
};

type LeaveFormState = {
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
};

const createInitialForm = (): LeaveFormState => ({
    employeeId: '',
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
});

const leaveStatusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    APPROVED: 'success',
    PENDING: 'warning',
    REJECTED: 'danger',
    CANCELLED: 'default',
};

const formatDateRange = (startDate: string, endDate: string) =>
    `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;

export function Leaves() {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [formData, setFormData] = useState<LeaveFormState>(createInitialForm());

    const { data: leaves = [], isLoading } = useQuery<LeaveRecord[]>({
        queryKey: ['hr-leaves'],
        queryFn: async () => {
            const res = await api.get('/hr/leaves');
            return res.data?.data || [];
        },
    });

    const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
        queryKey: ['hr-leave-types'],
        queryFn: async () => {
            const res = await api.get('/hr/leave-types');
            return res.data?.data || [];
        },
    });

    const { data: employees = [] } = useQuery<EmployeeOption[]>({
        queryKey: ['hr-employees-leaves'],
        queryFn: async () => {
            const res = await api.get('/hr/employees');
            return res.data?.data || [];
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: LeaveFormState) => api.post('/hr/leaves', data),
        onSuccess: () => {
            toast.success('Leave requested successfully');
            queryClient.invalidateQueries({ queryKey: ['hr-leaves'] });
            handleCancel();
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to request leave'),
    });

    const approveMutation = useMutation({
        mutationFn: (id: string) => api.patch(`/hr/leaves/${id}/status`, { status: 'APPROVED' }),
        onSuccess: () => {
            toast.success('Leave approved');
            queryClient.invalidateQueries({ queryKey: ['hr-leaves'] });
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to approve leave'),
    });

    const rejectMutation = useMutation({
        mutationFn: (id: string) => api.patch(`/hr/leaves/${id}/status`, { status: 'REJECTED' }),
        onSuccess: () => {
            toast.success('Leave rejected');
            queryClient.invalidateQueries({ queryKey: ['hr-leaves'] });
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to reject leave'),
    });

    const visibleLeaves = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        return leaves.filter((leave) => {
            const matchesSearch =
                !term ||
                [
                    leave.employee?.firstName,
                    leave.employee?.lastName,
                    leave.employee?.employeeNo,
                    leave.leaveType?.name,
                    leave.leaveType?.code,
                    leave.reason,
                    leave.status,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase()
                    .includes(term);

            const matchesStatus = !statusFilter || leave.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [leaves, searchTerm, statusFilter]);

    const pendingCount = leaves.filter((leave) => leave.status === 'PENDING').length;
    const approvedCount = leaves.filter((leave) => leave.status === 'APPROVED').length;
    const rejectedCount = leaves.filter((leave) => leave.status === 'REJECTED').length;

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!formData.employeeId || !formData.leaveTypeId || !formData.startDate || !formData.endDate) {
            toast.error('Please fill all required fields');
            return;
        }

        createMutation.mutate({
            ...formData,
            startDate: new Date(formData.startDate).toISOString(),
            endDate: new Date(formData.endDate).toISOString(),
        });
    };

    const handleCancel = () => {
        setIsAdding(false);
        setFormData(createInitialForm());
    };

    const handleApprove = (id: string) => {
        if (window.confirm('Are you sure you want to approve this leave request?')) {
            approveMutation.mutate(id);
        }
    };

    const handleReject = (id: string) => {
        if (window.confirm('Are you sure you want to reject this leave request?')) {
            rejectMutation.mutate(id);
        }
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Leave Management"
                subtitle={`${leaves.length} leave request${leaves.length === 1 ? '' : 's'} tracked across your workforce`}
                action={
                    <Button icon={<Plus size={16} />} onClick={() => setIsAdding(true)}>
                        Request Leave
                    </Button>
                }
            />

            <StatsGrid columns={3}>
                <StatCard
                    label="Pending Requests"
                    value={pendingCount}
                    sub="Awaiting review"
                    icon={<Plane size={18} />}
                />
                <StatCard
                    label="Approved"
                    value={approvedCount}
                    sub="Confirmed leave plans"
                    icon={<CheckCircle size={18} />}
                />
                <StatCard
                    label="Rejected"
                    value={rejectedCount}
                    sub="Requests declined"
                    icon={<XCircle size={18} />}
                />
            </StatsGrid>

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Search employee, leave type, reason, or status"
                    />
                </div>
                <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                        { value: '', label: 'All Statuses' },
                        { value: 'PENDING', label: 'Pending' },
                        { value: 'APPROVED', label: 'Approved' },
                        { value: 'REJECTED', label: 'Rejected' },
                        { value: 'CANCELLED', label: 'Cancelled' },
                    ]}
                    placeholder=""
                    className="min-w-[180px]"
                />
            </FilterBar>

            {!isLoading && leaves.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Plane size={48} />}
                        title="No leave requests yet"
                        description="Create the first leave request to start tracking approvals, absences, and time away."
                        action={
                            <Button icon={<Plus size={16} />} onClick={() => setIsAdding(true)}>
                                Request Leave
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <Card padding="none">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Leave Type</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead align="right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableLoading colSpan={5} message="Loading leave records..." />
                            ) : visibleLeaves.length === 0 ? (
                                <TableEmpty colSpan={5} message="No leave requests match the current filters." />
                            ) : (
                                visibleLeaves.map((leave) => (
                                    <TableRow key={leave.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium text-text-primary">
                                                    {leave.employee?.firstName} {leave.employee?.lastName}
                                                </div>
                                                <div className="text-xs text-text-tertiary">
                                                    {leave.employee?.employeeNo || 'No employee number'}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium text-text-primary">
                                                    {leave.leaveType?.name || '-'}
                                                </div>
                                                <div className="text-xs text-text-tertiary">
                                                    {(leave.leaveType?.code || '-') + ` • ${leave.days || 0} day(s)`}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-text-secondary">
                                                {formatDateRange(leave.startDate, leave.endDate)}
                                            </div>
                                            <div className="text-xs text-text-tertiary">
                                                {leave.reason || 'No reason provided'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                size="sm"
                                                variant={leaveStatusVariant[leave.status || ''] || 'default'}
                                            >
                                                {leave.status || 'UNKNOWN'}
                                            </Badge>
                                            {leave.approvedBy?.name ? (
                                                <div className="mt-1 text-xs text-text-tertiary">
                                                    Approved by {leave.approvedBy.name}
                                                </div>
                                            ) : null}
                                        </TableCell>
                                        <TableCell align="right">
                                            {leave.status === 'PENDING' ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        icon={<CheckCircle size={16} />}
                                                        onClick={() => handleApprove(leave.id)}
                                                        aria-label={`Approve leave request for ${leave.employee?.firstName || 'employee'}`}
                                                        title="Approve leave request"
                                                        className="px-2 text-success hover:text-success"
                                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        icon={<XCircle size={16} />}
                                                        onClick={() => handleReject(leave.id)}
                                                        aria-label={`Reject leave request for ${leave.employee?.firstName || 'employee'}`}
                                                        title="Reject leave request"
                                                        className="px-2 text-danger hover:text-danger"
                                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-sm text-text-tertiary">No actions</span>
                                            )}
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
                title="New Leave Request"
                maxWidth="3xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <FormField label="Employee" required>
                            <Select
                                value={formData.employeeId}
                                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                                options={employees.map((employee) => ({
                                    value: employee.id,
                                    label:
                                        `${employee.firstName || ''} ${employee.lastName || ''}`.trim() +
                                            (employee.employeeNo ? ` (${employee.employeeNo})` : '') ||
                                        'Unnamed Employee',
                                }))}
                                placeholder="Select employee"
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Leave Type" required>
                            <Select
                                value={formData.leaveTypeId}
                                onChange={(e) => setFormData({ ...formData, leaveTypeId: e.target.value })}
                                options={leaveTypes.map((type) => ({
                                    value: type.id,
                                    label: `${type.name || 'Unnamed Type'}${type.code ? ` (${type.code})` : ''}`,
                                }))}
                                placeholder="Select leave type"
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="Reason">
                            <Input
                                value={formData.reason}
                                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                placeholder="Medical issue, vacation, personal leave..."
                                fullWidth
                            />
                        </FormField>

                        <FormField label="Start Date" required>
                            <Input
                                type="date"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                fullWidth
                                required
                            />
                        </FormField>

                        <FormField label="End Date" required>
                            <Input
                                type="date"
                                value={formData.endDate}
                                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                fullWidth
                                required
                            />
                        </FormField>
                    </div>

                    <FormActions className="border-t border-border-subtle pt-4">
                        <Button type="button" variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={createMutation.isPending}>
                            Submit Request
                        </Button>
                    </FormActions>
                </form>
            </Modal>
        </PageLayout>
    );
}
