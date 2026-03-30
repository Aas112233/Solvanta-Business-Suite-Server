import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, Fingerprint, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    FilterBar,
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

type EmployeeOption = {
    id: string;
    firstName?: string;
    lastName?: string;
    employeeNo?: string;
};

type AttendanceRecord = {
    id: string;
    date: string;
    checkIn?: string | null;
    checkOut?: string | null;
    workHours?: number | null;
    status?: string | null;
    employee?: {
        firstName?: string | null;
        lastName?: string | null;
        employeeNo?: string | null;
    } | null;
};

const attendanceStatusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    PRESENT: 'success',
    LATE: 'warning',
    ABSENT: 'danger',
    HALF_DAY: 'warning',
};

const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString() : '-';

const formatTime = (value?: string | null) =>
    value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

export function Attendance() {
    const queryClient = useQueryClient();
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const { data: attendance = [], isLoading } = useQuery<AttendanceRecord[]>({
        queryKey: ['hr-attendance'],
        queryFn: async () => {
            const res = await api.get('/hr/attendance');
            return res.data?.data || [];
        },
    });

    const { data: employees = [] } = useQuery<EmployeeOption[]>({
        queryKey: ['hr-employees-attendance'],
        queryFn: async () => {
            const res = await api.get('/hr/employees');
            return res.data?.data || [];
        },
    });

    const checkInMutation = useMutation({
        mutationFn: (data: { employeeId: string; timestamp: string; method: string }) =>
            api.post('/hr/attendance/check-in', data),
        onSuccess: () => {
            toast.success('Punched in successfully');
            queryClient.invalidateQueries({ queryKey: ['hr-attendance'] });
            setSelectedEmployeeId('');
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to punch in'),
    });

    const checkOutMutation = useMutation({
        mutationFn: (data: { employeeId: string; timestamp: string; method: string }) =>
            api.post('/hr/attendance/check-out', data),
        onSuccess: () => {
            toast.success('Punched out successfully');
            queryClient.invalidateQueries({ queryKey: ['hr-attendance'] });
            setSelectedEmployeeId('');
        },
        onError: (error: any) =>
            toast.error(error.response?.data?.error?.message || 'Failed to punch out'),
    });

    const visibleAttendance = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) {
            return attendance;
        }

        return attendance.filter((record) =>
            [
                record.employee?.firstName,
                record.employee?.lastName,
                record.employee?.employeeNo,
                record.status,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(term)
        );
    }, [attendance, searchTerm]);

    const activeShiftCount = attendance.filter((record) => record.checkIn && !record.checkOut).length;
    const completedShiftCount = attendance.filter((record) => record.checkOut).length;
    const averageHours =
        attendance.length > 0
            ? attendance.reduce((sum, record) => sum + Number(record.workHours || 0), 0) / attendance.length
            : 0;

    const handleCheckIn = () => {
        if (!selectedEmployeeId) {
            toast.error('Please select an employee');
            return;
        }

        checkInMutation.mutate({
            employeeId: selectedEmployeeId,
            timestamp: new Date().toISOString(),
            method: 'WEB',
        });
    };

    const handleCheckOut = () => {
        if (!selectedEmployeeId) {
            toast.error('Please select an employee');
            return;
        }

        checkOutMutation.mutate({
            employeeId: selectedEmployeeId,
            timestamp: new Date().toISOString(),
            method: 'WEB',
        });
    };

    return (
        <PageLayout className="gap-6">
            <PageHeader
                title="Attendance Tracker"
                subtitle={`Monitor live check-ins, shift completions, and attendance records for ${employees.length} employees.`}
            />

            <StatsGrid columns={3}>
                <StatCard
                    label="Records Loaded"
                    value={attendance.length}
                    sub="Latest 100 attendance entries"
                    icon={<Fingerprint size={18} />}
                />
                <StatCard
                    label="Active Shifts"
                    value={activeShiftCount}
                    sub="Checked in, awaiting checkout"
                    icon={<Clock size={18} />}
                />
                <StatCard
                    label="Average Hours"
                    value={averageHours.toFixed(1)}
                    sub={`${completedShiftCount} completed shifts`}
                    icon={<CheckCircle size={18} />}
                />
            </StatsGrid>

            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Manual Punch Setup</CardTitle>
                        <CardDescription>
                            Select an employee to record a web-based check-in or check-out.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end">
                    <div className="min-w-[260px] flex-1">
                        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                            Select Employee
                        </label>
                        <Select
                            value={selectedEmployeeId}
                            onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            options={employees.map((employee) => ({
                                value: employee.id,
                                label:
                                    `${employee.firstName || ''} ${employee.lastName || ''}`.trim() +
                                        (employee.employeeNo ? ` (${employee.employeeNo})` : '') ||
                                    'Unnamed Employee',
                            }))}
                            placeholder="Choose employee"
                            fullWidth
                        />
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            type="button"
                            variant="success"
                            icon={<CheckCircle size={16} />}
                            onClick={handleCheckIn}
                            loading={checkInMutation.isPending}
                            disabled={!selectedEmployeeId || checkOutMutation.isPending}
                        >
                            Check In
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            icon={<LogOut size={16} />}
                            onClick={handleCheckOut}
                            loading={checkOutMutation.isPending}
                            disabled={!selectedEmployeeId || checkInMutation.isPending}
                            className="border-warning text-warning hover:bg-warning-soft"
                        >
                            Check Out
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <FilterBar>
                <div className="min-w-[240px] flex-1">
                    <SearchInput
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Search by employee number, name, or status"
                    />
                </div>
            </FilterBar>

            <Card padding="none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Employee</TableHead>
                            <TableHead>Check In</TableHead>
                            <TableHead>Check Out</TableHead>
                            <TableHead>Work Hours</TableHead>
                            <TableHead align="center">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableLoading colSpan={6} message="Loading attendance records..." />
                        ) : visibleAttendance.length === 0 ? (
                            <TableEmpty colSpan={6} message="No attendance records found." />
                        ) : (
                            visibleAttendance.map((record) => (
                                <TableRow key={record.id}>
                                    <TableCell className="font-medium text-text-primary">
                                        {formatDate(record.date)}
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <div className="font-medium text-text-primary">
                                                {record.employee?.firstName} {record.employee?.lastName}
                                            </div>
                                            <div className="text-xs text-text-tertiary">
                                                {record.employee?.employeeNo || 'No employee number'}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium text-success">
                                        {formatTime(record.checkIn)}
                                    </TableCell>
                                    <TableCell className="font-medium text-warning">
                                        {formatTime(record.checkOut)}
                                    </TableCell>
                                    <TableCell>
                                        {record.workHours ? `${Number(record.workHours).toFixed(2)} hrs` : '-'}
                                    </TableCell>
                                    <TableCell align="center">
                                        <Badge
                                            size="sm"
                                            variant={attendanceStatusVariant[record.status || ''] || 'default'}
                                        >
                                            {record.status || 'UNKNOWN'}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>
        </PageLayout>
    );
}
