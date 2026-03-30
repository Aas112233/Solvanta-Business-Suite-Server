import {
    Button,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardFooter,
    StatCard,
    StatsGrid,
    Input,
    Select,
    FormField,
    FormGroup,
    Badge,
    StatusBadge,
    PageHeader,
    SearchInput,
    Tabs,
    TabPanel,
    toast,
    useToast,
    EmptyState,
    Skeleton,
    SkeletonText,
    SkeletonCard,
    Avatar,
    AvatarGroup,
    ProgressBar,
    CircularProgress,
    Stepper,
    DatePicker,
    LanguageSwitcher,
    useAppTranslation,
} from '@/components/ui';
import { DollarSign, Users, Package, TrendingUp, Plus, Edit2, Trash2, Search, Calendar, Upload } from 'lucide-react';
import { useState } from 'react';

export default function DesignSystemShowcase() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('active');
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const { success, error } = useToast();
    const { t } = useAppTranslation();

    const handleShowToast = (type: 'success' | 'error' | 'warning' | 'info') => {
        toast[type](`${type} Toast`, `This is a ${type} notification message`);
    };

    const sampleTableData = [
        { id: 1, code: 'CUST-001', name: 'Acme Corp', email: 'contact@acme.com', status: 'active' as const },
        { id: 2, code: 'CUST-002', name: 'TechStart Inc', email: 'hello@techstart.com', status: 'pending' as const },
        { id: 3, code: 'CUST-003', name: 'Global Ltd', email: 'info@global.com', status: 'inactive' as const },
    ];

    return (
        <div className="p-8 space-y-8">
            <PageHeader
                title="Design System Showcase"
                subtitle="Preview of all unified design components"
                action={
                    <Button variant="primary" icon={<Plus size={16} />}>
                        New Item
                    </Button>
                }
            />

            {/* Buttons Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Buttons</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <Button variant="primary">Primary</Button>
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="outline">Outline</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="danger">Danger</Button>
                        <Button variant="success">Success</Button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Button size="sm" variant="primary">Small</Button>
                        <Button size="md" variant="primary">Medium</Button>
                        <Button size="lg" variant="primary">Large</Button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Button variant="primary" icon={<Plus size={16} />}>With Icon</Button>
                        <Button variant="primary" loading>Loading</Button>
                        <Button variant="primary" disabled>Disabled</Button>
                    </div>
                </CardContent>
            </Card>

            {/* Badges Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Badges</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <Badge variant="default">Default</Badge>
                        <Badge variant="success">Success</Badge>
                        <Badge variant="warning">Warning</Badge>
                        <Badge variant="danger">Danger</Badge>
                        <Badge variant="info">Info</Badge>
                        <Badge variant="brand">Brand</Badge>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <StatusBadge status="active" />
                        <StatusBadge status="pending" />
                        <StatusBadge status="inactive" />
                        <StatusBadge status="completed" />
                        <StatusBadge status="cancelled" />
                    </div>
                </CardContent>
            </Card>

            {/* Stats Grid Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Stats Cards</CardTitle>
                </CardHeader>
                <CardContent>
                    <StatsGrid columns={4}>
                        <StatCard
                            label="Total Revenue"
                            value="$45,231"
                            sub="+20.1% from last month"
                            icon={<DollarSign size={20} />}
                            trend="+20.1%"
                            trendDirection="up"
                        />
                        <StatCard
                            label="Total Customers"
                            value="2,345"
                            sub="+180 new this month"
                            icon={<Users size={20} />}
                            trend="+12.5%"
                            trendDirection="up"
                        />
                        <StatCard
                            label="Total Products"
                            value="1,234"
                            sub="56 low stock items"
                            icon={<Package size={20} />}
                            trend="-2.3%"
                            trendDirection="down"
                        />
                        <StatCard
                            label="Growth Rate"
                            value="18.2%"
                            sub="Average monthly growth"
                            icon={<TrendingUp size={20} />}
                            trend="+4.3%"
                            trendDirection="up"
                        />
                    </StatsGrid>
                </CardContent>
            </Card>

            {/* Forms Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Form Inputs</CardTitle>
                </CardHeader>
                <CardContent>
                    <FormGroup>
                        <FormField label="Search" hint="This is a hint text">
                            <SearchInput
                                value={searchTerm}
                                onChange={setSearchTerm}
                                placeholder="Search..."
                            />
                        </FormField>
                        <FormField label="Text Input" required>
                            <Input placeholder="Enter text" fullWidth />
                        </FormField>
                        <FormField label="Select Dropdown">
                            <Select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                options={[
                                    { value: 'active', label: 'Active' },
                                    { value: 'pending', label: 'Pending' },
                                    { value: 'inactive', label: 'Inactive' },
                                ]}
                                fullWidth
                            />
                        </FormField>
                        <FormField label="Input with Error" error="This field is required">
                            <Input placeholder="Error state" fullWidth error />
                        </FormField>
                    </FormGroup>
                </CardContent>
            </Card>

            {/* Table Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Data Table</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead align="right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sampleTableData.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{item.code}</TableCell>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{item.email}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={item.status} />
                                    </TableCell>
                                    <TableCell align="right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={<Edit2 size={16} />}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={<Trash2 size={16} />}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardFooter>
                    <div className="text-sm text-text-tertiary">
                        Showing 3 of 150 customers
                    </div>
                </CardFooter>
            </Card>

            {/* Tabs Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Tabs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Tabs
                        tabs={[
                            { value: 'overview', label: 'Overview' },
                            { value: 'analytics', label: 'Analytics' },
                            { value: 'settings', label: 'Settings' },
                        ]}
                        activeTab={activeTab}
                        onChange={setActiveTab}
                        variant="default"
                    />
                    <TabPanel activeTab={activeTab} tabValue="overview">
                        <p className="text-text-secondary">Overview content here</p>
                    </TabPanel>
                    <TabPanel activeTab={activeTab} tabValue="analytics">
                        <p className="text-text-secondary">Analytics content here</p>
                    </TabPanel>
                    <TabPanel activeTab={activeTab} tabValue="settings">
                        <p className="text-text-secondary">Settings content here</p>
                    </TabPanel>
                </CardContent>
            </Card>

            {/* Toast Notifications Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Toast Notifications</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <Button variant="success" onClick={() => handleShowToast('success')}>
                            Show Success
                        </Button>
                        <Button variant="danger" onClick={() => handleShowToast('error')}>
                            Show Error
                        </Button>
                        <Button variant="secondary" onClick={() => handleShowToast('warning')}>
                            Show Warning
                        </Button>
                        <Button variant="primary" onClick={() => handleShowToast('info')}>
                            Show Info
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Empty States Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Empty States</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                    <EmptyState
                        title="No items yet"
                        description="Get started by adding your first item"
                        action={<Button size="sm" icon={<Plus size={14} />}>Add Item</Button>}
                    />
                    <EmptyState
                        variant="search"
                        title="No results found"
                        description="Try adjusting your search or filters"
                    />
                </CardContent>
            </Card>

            {/* Skeleton Loaders Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Skeleton Loaders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Skeleton variant="circular" width={40} height={40} />
                        <div className="space-y-2">
                            <SkeletonText lines={1} />
                            <SkeletonText lines={2} spacing="sm" />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <SkeletonCard showImage showTitle showDescription />
                        <SkeletonCard showImage showTitle showDescription />
                        <SkeletonCard showImage showTitle showDescription />
                    </div>
                </CardContent>
            </Card>

            {/* Avatar Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Avatars</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <Avatar name="John Doe" size="md" />
                        <Avatar name="Jane Smith" size="md" status="online" />
                        <Avatar name="Bob Wilson" src="/invalid.jpg" size="md" status="busy" />
                        <AvatarGroup
                            avatars={[
                                { name: 'John Doe', status: 'online' },
                                { name: 'Jane Smith', status: 'busy' },
                                { name: 'Bob Wilson' },
                                { name: 'Alice Brown', status: 'away' },
                            ]}
                            max={3}
                            size="md"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Progress Indicators Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Progress Indicators</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <ProgressBar value={25} showLabel label="Basic Progress" />
                        <ProgressBar value={50} variant="success" showLabel label="Success Progress" />
                        <ProgressBar value={75} variant="warning" size="lg" showLabel label="Warning Progress" />
                        <ProgressBar value={100} variant="brand" animated showLabel />
                    </div>
                    <div className="flex items-center gap-8">
                        <CircularProgress value={30} size="md" showLabel label="Loading" />
                        <CircularProgress value={60} variant="success" size="lg" showLabel label="Complete" />
                        <CircularProgress value={90} variant="brand" size="xl" showLabel />
                    </div>
                </CardContent>
            </Card>

            {/* Stepper Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Stepper</CardTitle>
                </CardHeader>
                <CardContent>
                    <Stepper
                        steps={[
                            { id: '1', label: 'Basic Info', description: 'Enter company details' },
                            { id: '2', label: 'Users', description: 'Add team members' },
                            { id: '3', label: 'Review', description: 'Confirm and submit' },
                        ]}
                        currentStep={1}
                        orientation="horizontal"
                    />
                </CardContent>
            </Card>

            {/* Date Picker Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Date Picker</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="max-w-xs">
                        <FormField label="Select Date">
                            <DatePicker
                                value={selectedDate}
                                onChange={setSelectedDate}
                                fullWidth
                            />
                        </FormField>
                    </div>
                </CardContent>
            </Card>

            {/* Multilanguage Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Multilanguage Support (বাংলা)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <LanguageSwitcher />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-text-tertiary">Common Translations:</h4>
                            <div className="space-y-1 text-sm">
                                <p><strong>Dashboard:</strong> {t('dashboard.title')}</p>
                                <p><strong>Sales:</strong> {t('sales.title')}</p>
                                <p><strong>Customers:</strong> {t('customers.title')}</p>
                                <p><strong>Settings:</strong> {t('settings.title')}</p>
                                <p><strong>Save:</strong> {t('app.save')}</p>
                                <p><strong>Cancel:</strong> {t('app.cancel')}</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-text-tertiary">HR Module:</h4>
                            <div className="space-y-1 text-sm">
                                <p><strong>Employees:</strong> {t('hr.employees')}</p>
                                <p><strong>Departments:</strong> {t('hr.departments')}</p>
                                <p><strong>Attendance:</strong> {t('hr.attendance')}</p>
                                <p><strong>Leave Type:</strong> {t('hr.leaveType')}</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-brand-50 rounded-lg">
                        <p className="text-sm text-text-secondary">
                            🌐 Use the language switcher above to toggle between English and বাংলা (Bangla).
                            The translations will update instantly across the entire application.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
