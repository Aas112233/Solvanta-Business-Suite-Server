import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, ArrowLeft, Wrench, Search } from 'lucide-react';
import toast from '@/lib/toast';
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
    SearchInput,
    EmptyState,
    AppDropdown,
} from '@/components/ui';

interface ServiceMaster {
    id: string;
    code: string;
    name: string;
    standardRate: number;
    duration?: number;
    category?: string;
}

interface ServiceInvoiceItem {
    id: string; // unique ID for each line item
    serviceName: string;
    serviceCode?: string;
    qty: number;
    unitPrice: number;
    discount: number;
    discountType: 'amount' | 'percent';
    taxRate: number;
    lineTotal: number;
}

export function ServiceSalesInvoice() {
    const queryClient = useQueryClient();
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [invoiceItems, setInvoiceItems] = useState<ServiceInvoiceItem[]>([]);
    const [formData, setFormData] = useState({
        customerId: '',
        customerName: '',
        isWalkIn: false,
        walkInCustomerName: '',
        walkInPhone: '',
        invoiceDate: new Date().toISOString().split('T')[0],
        notes: '',
    });

    // Manual service entry form state
    const [manualService, setManualService] = useState({
        serviceName: '',
        serviceCode: '',
        qty: 1,
        unitPrice: 0,
        discount: 0,
        discountType: 'amount' as 'amount' | 'percent',
    });

    // Fetch active sales tax from settings
    const { data: activeTax } = useQuery({
        queryKey: ['pos-sales-tax'],
        queryFn: async () => {
            const res = await api.get('/taxes?isActive=true&type=SALES');
            const taxes = res.data?.data || [];
            // Get default tax or first active sales tax
            return taxes.find((t: any) => t.isDefault) || taxes[0] || null;
        },
    });

    // Fetch customers
    const { data: customers = [] } = useQuery({
        queryKey: ['customers-list'],
        queryFn: async () => {
            const res = await api.get('/customers?isActive=true');
            return res.data?.data || [];
        },
    });

    // Fetch user's branches for branch selector
    const { data: branches = [] } = useQuery({
        queryKey: ['user-branches'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data?.data || [];
        },
    });

    const [selectedBranchId, setSelectedBranchId] = useState('');

    // Set default branch when branches load
    useEffect(() => {
        if (branches && branches.length > 0 && !selectedBranchId) {
            setSelectedBranchId(branches[0].id);
        }
    }, [branches]);

    const createInvoiceMutation = useMutation({
        mutationFn: (data: any) => api.post('/service-invoices', data),
        onSuccess: () => {
            toast.success('Service sales invoice created successfully');
            queryClient.invalidateQueries({ queryKey: ['service-invoices'] });
            // Reset form
            setInvoiceItems([]);
            setFormData({
                customerId: '',
                customerName: '',
                isWalkIn: false,
                walkInCustomerName: '',
                walkInPhone: '',
                invoiceDate: new Date().toISOString().split('T')[0],
                notes: '',
            });
        },
        onError: (err: any) => {
            const message = err?.response?.data?.error?.message || err?.message || 'Failed to create invoice';
            console.error('Service invoice error:', message);
            toast.error(message);
        },
    });

    const handleAddService = () => {
        if (!manualService.serviceName.trim()) {
            toast.error('Please enter a service name');
            return;
        }

        const discountValue = manualService.discountType === 'percent'
            ? (manualService.qty * manualService.unitPrice) * (manualService.discount / 100)
            : manualService.discount;

        const lineSubtotal = (manualService.qty * manualService.unitPrice) - discountValue;
        const taxRate = activeTax?.rate || 0;
        const taxAmount = lineSubtotal * taxRate;
        const lineTotal = lineSubtotal;

        const newItem: ServiceInvoiceItem = {
            id: Math.random().toString(36).substr(2, 9),
            serviceName: manualService.serviceName,
            serviceCode: manualService.serviceCode || undefined,
            qty: manualService.qty,
            unitPrice: manualService.unitPrice,
            discount: discountValue,
            discountType: manualService.discountType,
            taxRate: taxRate * 100, // Store as percentage for display
            lineTotal,
        };

        setInvoiceItems([...invoiceItems, newItem]);

        // Reset form
        setManualService({
            serviceName: '',
            serviceCode: '',
            qty: 1,
            unitPrice: 0,
            discount: 0,
            discountType: 'amount',
        });

        setIsServiceModalOpen(false);
    };

    const handleRemoveItem = (index: number) => {
        setInvoiceItems(items => items.filter((_, i) => i !== index));
    };

    const handleUpdateItem = (index: number, field: keyof ServiceInvoiceItem, value: any) => {
        setInvoiceItems(items => {
            const newItems = [...items];
            const item = { ...newItems[index], [field]: value };

            // Recalculate line total
            if (field === 'qty' || field === 'unitPrice' || field === 'discount') {
                const subtotal = item.qty * item.unitPrice;
                item.lineTotal = subtotal - item.discount;
            }

            newItems[index] = item;
            return newItems;
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (invoiceItems.length === 0) {
            toast.error('Please add at least one service');
            return;
        }

        if (!formData.customerId && !formData.isWalkIn) {
            toast.error('Please select a customer or use walk-in option');
            return;
        }

        if (!selectedBranchId) {
            toast.error('Please select a branch');
            return;
        }

        const subtotal = invoiceItems.reduce((sum, item) => {
            const lineSubtotal = (item.qty * item.unitPrice) - item.discount;
            return sum + lineSubtotal;
        }, 0);

        const taxTotal = invoiceItems.reduce((sum, item) => {
            const lineSubtotal = (item.qty * item.unitPrice) - item.discount;
            return sum + (lineSubtotal * (item.taxRate / 100));
        }, 0);

        const grandTotal = subtotal + taxTotal;

        const invoiceData = {
            branchId: selectedBranchId,
            customerId: formData.isWalkIn ? null : formData.customerId,
            walkInCustomerName: formData.isWalkIn ? formData.walkInCustomerName : null,
            walkInPhone: formData.isWalkIn ? formData.walkInPhone : null,
            invoiceDate: formData.invoiceDate,
            paymentMethod: 'CASH',
            notes: formData.notes,
            items: invoiceItems.map(item => ({
                serviceId: undefined,
                serviceName: item.serviceName,
                unitCode: 'SERVICE',
                qty: item.qty,
                unitPrice: item.unitPrice,
                discount: item.discount,
                taxAmount: (item.qty * item.unitPrice - item.discount) * (item.taxRate / 100),
                lineTotal: (item.qty * item.unitPrice - item.discount),
            })),
            subtotal,
            taxTotal,
            grandTotal,
        };

        createInvoiceMutation.mutate(invoiceData);
    };

    const subtotal = invoiceItems.reduce((sum, item) => {
        const lineSubtotal = (item.qty * item.unitPrice) - item.discount;
        return sum + lineSubtotal;
    }, 0);

    const taxTotal = invoiceItems.reduce((sum, item) => {
        const lineSubtotal = (item.qty * item.unitPrice) - item.discount;
        return sum + (lineSubtotal * (item.taxRate / 100));
    }, 0);

    const grandTotal = subtotal + taxTotal;

    return (
        <PageLayout>
            <PageHeader
                title="Service Sales Invoice"
                subtitle="Create invoice for non-inventory services"
                action={
                    <Button
                        variant="outline"
                        icon={<ArrowLeft size={16} />}
                        onClick={() => window.history.back()}
                    >
                        Back
                    </Button>
                }
            />

            <div className="grid gap-4 lg:grid-cols-3">
                {/* Left: Invoice Form */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Customer & Date */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Invoice Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isWalkIn"
                                        checked={formData.isWalkIn}
                                        onChange={(e) => {
                                            const isWalkIn = e.target.checked;
                                            setFormData({
                                                ...formData,
                                                isWalkIn,
                                                customerId: '',
                                                customerName: isWalkIn ? formData.walkInCustomerName : '',
                                            });
                                        }}
                                        className="rounded border-gray-300"
                                    />
                                    <label htmlFor="isWalkIn" className="text-sm font-medium">
                                        Walk-in Customer (No customer record required)
                                    </label>
                                </div>
                            </div>

                            {formData.isWalkIn ? (
                                <div className="grid grid-cols-2 gap-4 p-4 bg-brand-50 rounded-lg border border-brand-200">
                                    <FormField label="Customer Name" required>
                                        <Input
                                            value={formData.walkInCustomerName}
                                            onChange={(e) => {
                                                setFormData({ ...formData, walkInCustomerName: e.target.value, customerName: e.target.value });
                                            }}
                                            placeholder="Enter walk-in customer name"
                                            fullWidth
                                            required
                                        />
                                    </FormField>
                                    <FormField label="Phone Number">
                                        <Input
                                            value={formData.walkInPhone}
                                            onChange={(e) => setFormData({ ...formData, walkInPhone: e.target.value })}
                                            placeholder="Enter phone number"
                                            fullWidth
                                        />
                                    </FormField>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField label="Customer" required>
                                        <AppDropdown
                                            value={formData.customerId}
                                            onChange={(value) => {
                                                const customer = customers.find((c: any) => c.id === value);
                                                setFormData({
                                                    ...formData,
                                                    customerId: value,
                                                    customerName: customer?.name || '',
                                                });
                                            }}
                                            options={[
                                                { value: '', label: 'Select Customer' },
                                                ...customers.map((c: any) => ({
                                                    value: c.id,
                                                    label: c.name,
                                                })),
                                            ]}
                                            placeholder="Select customer"
                                            searchable
                                            className="w-full"
                                        />
                                    </FormField>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Branch" required>
                                    <AppDropdown
                                        value={selectedBranchId}
                                        onChange={setSelectedBranchId}
                                        options={[
                                            { value: '', label: 'Select Branch' },
                                            ...branches.map((b: any) => ({
                                                value: b.id,
                                                label: b.name,
                                            })),
                                        ]}
                                        placeholder="Select branch"
                                        searchable
                                        className="w-full"
                                    />
                                </FormField>
                                <FormField label="Invoice Date" required>
                                    <Input
                                        type="date"
                                        value={formData.invoiceDate}
                                        onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                                        fullWidth
                                        required
                                    />
                                </FormField>
                            </div>

                            {!formData.isWalkIn && (
                                <FormField label="Notes">
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full rounded-md border border-border bg-background-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                                        rows={2}
                                        placeholder="Additional notes (optional)"
                                    />
                                </FormField>
                            )}
                        </CardContent>
                    </Card>

                    {/* Services Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Services</CardTitle>
                            <Button
                                variant="primary"
                                size="sm"
                                icon={<Plus size={16} />}
                                onClick={() => setIsServiceModalOpen(true)}
                            >
                                Add Service
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {invoiceItems.length === 0 ? (
                                <EmptyState
                                    icon={<Wrench size={48} />}
                                    title="No services added"
                                    description="Click 'Add Service' to add services to this invoice"
                                />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Service Name</TableHead>
                                            <TableHead>Code</TableHead>
                                            <TableHead>Qty</TableHead>
                                            <TableHead>Unit Price</TableHead>
                                            <TableHead>Discount</TableHead>
                                            <TableHead>Tax</TableHead>
                                            <TableHead align="right">Total</TableHead>
                                            <TableHead align="right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoiceItems.map((item, index) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.serviceName}</TableCell>
                                                <TableCell className="font-mono text-sm">
                                                    {item.serviceCode || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        value={item.qty}
                                                        onChange={(e) =>
                                                            handleUpdateItem(index, 'qty', Number(e.target.value))
                                                        }
                                                        className="w-20"
                                                        min={1}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        value={item.unitPrice}
                                                        onChange={(e) =>
                                                            handleUpdateItem(index, 'unitPrice', Number(e.target.value))
                                                        }
                                                        className="w-24"
                                                        min={0}
                                                        step={0.01}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm text-text-tertiary">
                                                        ${item.discount.toFixed(2)}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm text-text-tertiary">
                                                        ${((item.qty * item.unitPrice - item.discount) * (item.taxRate / 100)).toFixed(2)}
                                                        <div className="text-xs">({item.taxRate.toFixed(2)}%)</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell align="right" className="font-medium">
                                                    ${item.lineTotal.toFixed(2)}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        icon={<Trash2 size={16} />}
                                                        onClick={() => handleRemoveItem(index)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Summary */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Invoice Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-text-tertiary">Subtotal</span>
                                <span className="font-medium">${subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-tertiary">Discount</span>
                                <span className="font-medium text-danger">
                                    -${invoiceItems.reduce((sum, item) => sum + item.discount, 0).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-tertiary">
                                    Tax {activeTax && `(${activeTax.name} ${(activeTax.rate * 100).toFixed(2)}%)`}
                                </span>
                                <span className="font-medium">${taxTotal.toFixed(2)}</span>
                            </div>
                            <div className="border-t border-border-subtle pt-3">
                                <div className="flex justify-between text-base font-bold">
                                    <span>Grand Total</span>
                                    <span className="text-brand">${grandTotal.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="mt-6 space-y-3">
                                <Button
                                    variant="primary"
                                    fullWidth
                                    icon={<Save size={16} />}
                                    onClick={handleSubmit}
                                    loading={createInvoiceMutation.isPending}
                                    disabled={
                                        invoiceItems.length === 0
                                        || !selectedBranchId
                                        || (!formData.isWalkIn && !formData.customerId)
                                        || (formData.isWalkIn && !formData.walkInCustomerName.trim())
                                    }
                                >
                                    Create Invoice
                                </Button>
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => {
                                        setInvoiceItems([]);
                                        setFormData({
                                            customerId: '',
                                            customerName: '',
                                            isWalkIn: false,
                                            walkInCustomerName: '',
                                            walkInPhone: '',
                                            invoiceDate: new Date().toISOString().split('T')[0],
                                            notes: '',
                                        });
                                        if (branches && branches.length > 0) {
                                            setSelectedBranchId(branches[0].id);
                                        }
                                    }}
                                >
                                    Clear Invoice
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Service Entry Modal */}
            <Modal
                isOpen={isServiceModalOpen}
                onClose={() => {
                    setIsServiceModalOpen(false);
                    setManualService({
                        serviceName: '',
                        serviceCode: '',
                        qty: 1,
                        unitPrice: 0,
                        discount: 0,
                        discountType: 'amount',
                    });
                }}
                title="Add Service (Manual Entry)"
                maxWidth="lg"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Service Name" required>
                            <Input
                                value={manualService.serviceName}
                                onChange={(e) => setManualService({ ...manualService, serviceName: e.target.value })}
                                placeholder="e.g., PC Repair, Installation"
                                fullWidth
                            />
                        </FormField>
                        <FormField label="Service Code (Optional)">
                            <Input
                                value={manualService.serviceCode}
                                onChange={(e) => setManualService({ ...manualService, serviceCode: e.target.value })}
                                placeholder="e.g., SVC-001"
                                fullWidth
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Quantity" required>
                            <Input
                                type="number"
                                value={manualService.qty}
                                onChange={(e) => setManualService({ ...manualService, qty: Number(e.target.value) })}
                                min={1}
                                fullWidth
                            />
                        </FormField>
                        <FormField label="Unit Price ($)" required>
                            <Input
                                type="number"
                                value={manualService.unitPrice}
                                onChange={(e) => setManualService({ ...manualService, unitPrice: Number(e.target.value) })}
                                min={0}
                                step={0.01}
                                fullWidth
                            />
                        </FormField>
                    </div>

                    {activeTax && (
                        <div className="p-3 bg-brand-50 rounded-lg border border-brand-200">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-text-tertiary">📋 Sales Tax:</span>
                                <span className="font-semibold text-brand">
                                    {activeTax.name} ({(activeTax.rate * 100).toFixed(2)}%)
                                </span>
                                <span className="text-text-tertiary">(Auto-applied)</span>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Discount">
                            <Input
                                type="number"
                                value={manualService.discount}
                                onChange={(e) => setManualService({ ...manualService, discount: Number(e.target.value) })}
                                min={0}
                                step={0.01}
                                fullWidth
                            />
                        </FormField>
                        <FormField label="Discount Type">
                            <AppDropdown
                                value={manualService.discountType}
                                onChange={(value) => setManualService({ ...manualService, discountType: value as 'amount' | 'percent' })}
                                options={[
                                    { value: 'amount', label: 'Fixed Amount ($)' },
                                    { value: 'percent', label: 'Percentage (%)' },
                                ]}
                                placeholder="Select discount type"
                                className="w-full"
                            />
                        </FormField>
                    </div>

                    {/* Live Preview */}
                    <Card className="bg-background-subtle">
                        <CardContent className="py-4">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-text-tertiary">Subtotal:</span>
                                    <span className="font-medium">
                                        ${(manualService.qty * manualService.unitPrice).toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-text-tertiary">Discount:</span>
                                    <span className="font-medium text-danger">
                                        -${((manualService.discountType === 'percent'
                                            ? (manualService.qty * manualService.unitPrice) * (manualService.discount / 100)
                                            : manualService.discount
                                        )).toFixed(2)}
                                        {manualService.discountType === 'percent' && ` (${manualService.discount}%)`}
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-border pt-2">
                                    <span className="font-semibold">Line Subtotal:</span>
                                    <span className="font-bold">
                                        ${(
                                            (manualService.qty * manualService.unitPrice) -
                                            (manualService.discountType === 'percent'
                                                ? (manualService.qty * manualService.unitPrice) * (manualService.discount / 100)
                                                : manualService.discount
                                            )
                                        ).toFixed(2)}
                                    </span>
                                </div>
                                {activeTax && (
                                    <div className="flex justify-between">
                                        <span className="text-text-tertiary">
                                            Tax ({activeTax.name} {(activeTax.rate * 100).toFixed(2)}%):
                                        </span>
                                        <span className="font-medium">
                                            ${((
                                                (manualService.qty * manualService.unitPrice) -
                                                (manualService.discountType === 'percent'
                                                    ? (manualService.qty * manualService.unitPrice) * (manualService.discount / 100)
                                                    : manualService.discount
                                                )
                                            ) * activeTax.rate).toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between border-t border-border pt-2">
                                    <span className="font-semibold">Total:</span>
                                    <span className="font-bold text-brand">
                                        ${(
                                            ((manualService.qty * manualService.unitPrice) -
                                            (manualService.discountType === 'percent'
                                                ? (manualService.qty * manualService.unitPrice) * (manualService.discount / 100)
                                                : manualService.discount
                                            )) * (1 + (activeTax?.rate || 0))
                                        ).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <FormActions className="mt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setIsServiceModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleAddService}
                            disabled={!manualService.serviceName.trim()}
                        >
                            Add to Invoice
                        </Button>
                    </FormActions>
                </div>
            </Modal>
        </PageLayout>
    );
}

export default ServiceSalesInvoice;
