import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Eye, FileText, Search, Calendar, User, DollarSign, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
    SearchInput,
    EmptyState,
    Badge,
    StatusBadge,
} from '@/components/ui';

interface ServiceInvoice {
    id: string;
    invoiceNo: string;
    customerId?: string;
    walkInCustomerName?: string;
    walkInPhone?: string;
    customer?: { name: string; phone: string };
    branch: { name: string; code: string };
    subtotal: number;
    taxTotal: number;
    grandTotal: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
    items: Array<{
        serviceName: string;
        qty: number;
        unitPrice: number;
        lineTotal: number;
    }>;
}

export default function ServiceInvoicesList() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [printingId, setPrintingId] = useState<string | null>(null);

    const { data: invoices = [], isLoading } = useQuery({
        queryKey: ['service-invoices', { branchId: selectedBranch }],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (selectedBranch) params.set('branchId', selectedBranch);
            const res = await api.get(`/service-invoices?${params}`);
            return res.data?.data || [];
        },
    });

    const { data: branches = [] } = useQuery({
        queryKey: ['user-branches'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data?.data || [];
        },
    });

    const handlePrint = async (invoiceId: string) => {
        setPrintingId(invoiceId);
        try {
            // Open invoice in new window for printing
            const printWindow = window.open(`/sales/invoices/service/${invoiceId}`, '_blank');
            if (printWindow) {
                // Wait for page to load then print
                printWindow.onload = () => {
                    setTimeout(() => {
                        printWindow.print();
                        setPrintingId(null);
                    }, 500);
                };
            }
        } catch (error) {
            console.error('Print failed:', error);
            setPrintingId(null);
        }
    };

    const filteredInvoices = invoices.filter((invoice: ServiceInvoice) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            invoice.invoiceNo.toLowerCase().includes(search) ||
            invoice.customer?.name.toLowerCase().includes(search) ||
            invoice.walkInCustomerName?.toLowerCase().includes(search) ||
            invoice.branch.name.toLowerCase().includes(search)
        );
    });

    const getStatusBadge = (status: string) => {
        const statusMap: Record<string, 'active' | 'inactive' | 'pending' | 'completed' | 'cancelled' | 'draft' | 'published'> = {
            PAID: 'completed',
            PARTIAL: 'pending',
            CREDIT: 'pending',
            VOID: 'cancelled',
            REFUNDED: 'cancelled',
            UNPOSTED: 'draft',
        };
        const badgeStatus = statusMap[status] || 'pending';
        return <StatusBadge status={badgeStatus} />;
    };

    return (
        <PageLayout>
            <PageHeader
                title="Service Sales Invoices"
                subtitle="Manage service invoices for non-inventory services"
                action={
                    <Button
                        variant="primary"
                        icon={<Plus size={16} />}
                        onClick={() => navigate('/sales/invoices/service')}
                    >
                        New Service Invoice
                    </Button>
                }
            />

            {/* Filters */}
            <Card className="mb-4">
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[250px]">
                            <SearchInput
                                value={searchTerm}
                                onChange={setSearchTerm}
                                placeholder="Search by invoice no, customer, or branch..."
                            />
                        </div>
                        {branches.length > 0 && (
                            <select
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                className="h-10 rounded-md border border-border bg-background-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                            >
                                <option value="">All Branches</option>
                                {branches.map((b: any) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Invoices Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Service Invoices</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
                        </div>
                    ) : filteredInvoices.length === 0 ? (
                        <EmptyState
                            icon={<FileText size={48} />}
                            title="No service invoices yet"
                            description="Create your first service sales invoice"
                            action={
                                <Button
                                    size="sm"
                                    icon={<Plus size={14} />}
                                    onClick={() => navigate('/sales/invoices/service')}
                                >
                                    New Service Invoice
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice No</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Branch</TableHead>
                                    <TableHead>Services</TableHead>
                                    <TableHead align="right">Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead align="right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInvoices.map((invoice: ServiceInvoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell className="font-mono font-medium">
                                            {invoice.invoiceNo}
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">
                                                    {invoice.customer?.name || invoice.walkInCustomerName || 'Walk-in Customer'}
                                                </div>
                                                {invoice.walkInPhone && (
                                                    <div className="text-xs text-text-tertiary">
                                                        {invoice.walkInPhone}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {invoice.branch.name}
                                                <div className="text-xs text-text-tertiary">
                                                    {invoice.branch.code}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {invoice.items.length} item(s)
                                                <div className="text-xs text-text-tertiary truncate max-w-[200px]">
                                                    {invoice.items.map(i => i.serviceName).join(', ')}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell align="right">
                                            <div className="font-medium">
                                                ${invoice.grandTotal.toFixed(2)}
                                            </div>
                                            <div className="text-xs text-text-tertiary">
                                                Subtotal: ${invoice.subtotal.toFixed(2)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {getStatusBadge(invoice.status)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-sm">
                                                <Calendar size={14} className="text-text-tertiary" />
                                                {new Date(invoice.createdAt).toLocaleDateString()}
                                            </div>
                                        </TableCell>
                                        <TableCell align="right">
                                            <div className="flex justify-end gap-2 print:hidden">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Eye size={16} />}
                                                    onClick={() => navigate(`/sales/invoices/service/${invoice.id}`)}
                                                >
                                                    View
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={<Printer size={16} />}
                                                    onClick={() => handlePrint(invoice.id)}
                                                    loading={printingId === invoice.id}
                                                >
                                                    Print
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </PageLayout>
    );
}
