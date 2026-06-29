import { useEffect, useMemo, useState } from 'react';
import { isCashType, isBankType, isCreditType, isMixedType } from '../../lib/globalStrings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from '@/lib/toast';
import { ArrowLeft, Plus, Save, Trash, Pencil } from 'lucide-react';
import api from '@/lib/api';
import ItemSelectorModal from '@/components/inventory/ItemSelectorModal';
import { useAuthStore } from '@/stores/authStore';
import AppDropdown from '../../components/ui/AppDropdown';
import AppItemTable, { AppItemTableColumn } from '../../components/shared/AppItemTable';
import {
    buildPaymentMethodOptions,
    DEFAULT_SALE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
    SALE_INVOICE_PAYMENT_METHOD_KEYS,
} from '../../lib/globalStrings';
import { resolveEffectiveTaxRate, useCompanyTaxSettings } from '../../lib/tax';

type SalesItem = {
    productId: string;
    productName: string;
    unitName: string;
    unitCode: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    taxRate: number;
    discount: number;
    taxAmount: number;
    product?: any;


};

export default function SalesInvoiceForm() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const companyTax = useCompanyTaxSettings();

    const [customerId, setCustomerId] = useState('');
    const [branchId, setBranchId] = useState(activeBranchId || '');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<SalesItem[]>([]);
    const [showItemSelector, setShowItemSelector] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const canAddItems = Boolean(branchId && paymentMethod);

    const {
        data: customers,
        refetch: refetchCustomers,
        isFetching: isFetchingCustomers,
    } = useQuery({
        queryKey: ['customers'],
        queryFn: () => api.get('/customers', { params: { page: 1, limit: 1000 } }).then((r) => r.data.data),
    });

    const { data: branches, refetch: refetchBranches, isFetching: isFetchingBranches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    const { data: globalPaymentMethods, refetch: refetchPaymentMethods, isFetching: isFetchingPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.salePaymentMethods],
        queryFn: () => api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.salePaymentMethods}`).then((r) => r.data.data),
    });

    const selectedCustomer = useMemo(
        () => (customers || []).find((c: any) => String(c.id) === String(customerId)),
        [customers, customerId]
    );
    const creditAllowedForCustomer = Boolean(customerId && selectedCustomer && selectedCustomer.allowCreditSales !== false);
    // Resolve price group from selected customer
    const priceGroupId: string | undefined = selectedCustomer?.priceGroupId || undefined;

    const paymentOptions = useMemo(() => {
        const base = buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_SALE_PAYMENT_METHOD_OPTIONS, {
            allowedKeys: SALE_INVOICE_PAYMENT_METHOD_KEYS,
        });
        return base.filter((opt) => opt.value !== 'CREDIT' || creditAllowedForCustomer);
    }, [globalPaymentMethods, creditAllowedForCustomer]);

    useEffect(() => {
        if (paymentMethod !== 'CREDIT') return;
        if (!creditAllowedForCustomer) {
            setPaymentMethod('');
            toast.error('Credit is only allowed for selected credit-enabled customers');
        }
    }, [paymentMethod, creditAllowedForCustomer]);

    const addItemFromModal = (item: any) => {
        const unitMeta = (item?.product?.units || []).find((u: any) => String(u.unitCode).toUpperCase() === String(item.unitCode).toUpperCase());
        // Resolve effective price: check price group override first, then base salePrice
        let unitPrice = Number(unitMeta?.salePrice ?? item.unitPrice ?? item.unitCost ?? 0);
        if (priceGroupId && Array.isArray(unitMeta?.priceGroupPrices)) {
            const override = unitMeta.priceGroupPrices.find(
                (r: any) => r.priceGroupId === priceGroupId &&
                    String(r.unitCode).toUpperCase() === String(item.unitCode).toUpperCase()
            );
            if (override && Number(override.salePrice) > 0) unitPrice = Number(override.salePrice);
        }
        // Also try the unitPrice already resolved by the modal (already channel-aware)
        if (item.unitPrice && item.unitPrice !== unitMeta?.salePrice) unitPrice = Number(item.unitPrice);
        const qty = Number(item.qty || 1);
        const taxRate = resolveEffectiveTaxRate([item?.taxRate, item?.product?.tax?.rate, item?.product?.taxRate], companyTax);
        const existing = editingIndex !== null ? items[editingIndex] : null;
        const discount = Number(existing?.discount || 0);
        const lineTotal = qty * unitPrice - discount;

        const mappedItem: SalesItem = {
            productId: String(item.productId || ''),
            productName: String(item.productName || item.name || 'Item'),
            unitName: String(item.unitName || ''),
            unitCode: String(item.unitCode || 'UNIT'),
            qty,
            unitPrice,
            lineTotal,
            taxRate,
            discount,
            taxAmount: lineTotal * taxRate,
            product: item.product,


        };

        if (editingIndex !== null) {
            setItems((prev) => prev.map((row, idx) => (idx === editingIndex ? mappedItem : row)));
            setEditingIndex(null);
            toast.success(`Updated ${item.productName || item.name}`);
            return;
        }

        setItems((prev) => [...prev, mappedItem]);
        toast.success(`Added ${item.productName || item.name}`);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const startEditItem = (idx: number) => {
        setEditingIndex(idx);
        setShowItemSelector(true);
    };

    const handleOpenAddItem = () => {
        if (!canAddItems) {
            toast.error('Select warehouse and payment first');
            return;
        }
        setEditingIndex(null);
        setShowItemSelector(true);
    };

    const handleUpdateItem = (idx: number, field: string, value: any) => {
        setItems((prev) => {
            const next = [...prev];
            const item = { ...next[idx], [field]: value };

            // Recalculate totals if qty, price, or discount changed
            if (['qty', 'unitPrice', 'discount'].includes(field)) {
                const qty = Number(item.qty || 0);
                const price = Number(item.unitPrice || 0);
                const discount = Number(item.discount || 0);
                const lineTotal = (qty * price) - discount;

                item.lineTotal = lineTotal > 0 ? lineTotal : 0;
                item.taxAmount = item.lineTotal * Number(item.taxRate || 0);
            }

            next[idx] = item;
            return next;
        });
    };

    const tableColumns: AppItemTableColumn[] = [
        'product', 'qty', 'unitPrice', 'discount', 'tax', 'lineTotal', 'actions'
    ];

    const totals = useMemo(() => {
        const subtotal = items.reduce((sum, i) => sum + (i.lineTotal || 0), 0);
        const discountTotal = items.reduce((sum, i) => sum + Number(i.discount || 0), 0);
        const taxTotal = items.reduce((sum, i) => sum + (i.taxAmount || 0), 0);
        return { subtotal, discountTotal, taxTotal, grandTotal: subtotal + taxTotal };
    }, [items]);

    const createMut = useMutation({
        mutationFn: (payload: any) => api.post('/pos/invoices', payload),
        onSuccess: () => {
            toast.success('Sales invoice created');
            queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['sales-summary'] });
            navigate('/sales/invoices');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed'),
    });

    const handleSubmit = () => {
        if (!branchId) return toast.error('Missing branch');
        if (!paymentMethod) return toast.error('Select payment method');
        if (items.length === 0) return toast.error('No items added');
        if (isCreditType(paymentMethod) && !customerId) return toast.error('Customer is required for credit invoice');
        if (isCreditType(paymentMethod) && !creditAllowedForCustomer) return toast.error('Selected customer is not allowed for credit sales');
        if (isMixedType(paymentMethod)) return toast.error('MIXED is not supported from this form yet');

        const payload: any = {
            branchId,
            customerId: customerId || null,
            paymentMethod,
            notes,
            items: items.map((i) => ({
                productId: i.productId,
                unitCode: i.unitCode,
                qty: Number(i.qty),
                unitPrice: Number(i.unitPrice),
                discount: Number(i.discount || 0),
                taxAmount: Number(i.taxAmount || 0),
                lineTotal: Number(i.lineTotal || 0),
            })),
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            taxTotal: totals.taxTotal,
            grandTotal: totals.grandTotal,
        };

        if (paymentMethod === 'CASH') {
            payload.cashReceived = totals.grandTotal;
            payload.changeGiven = 0;
        } else if (paymentMethod === 'CARD') {
            payload.cardReceived = totals.grandTotal;
        } else if (paymentMethod === 'CREDIT') {
            payload.cashReceived = 0;
            payload.changeGiven = 0;
        }

        createMut.mutate(payload);
    };

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-[1500px] mx-auto">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/sales/invoices')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-gray-900">Record Sales Invoice</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                                <AppDropdown
                                    value={customerId}
                                    onChange={(v) => setCustomerId(v)}
                                    options={[{ value: '', label: 'Walk-in Customer' }, ...(customers || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.customerCode || '-'})` }))]}
                                    placeholder='Walk-in Customer'
                                    searchable
                                    onRefresh={() => refetchCustomers()}
                                    refreshing={isFetchingCustomers}
                                    refreshLabel="Refresh customers"
                                />
                                {priceGroupId && (
                                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">✓ Price channel active</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
                                <AppDropdown
                                    value={branchId}
                                    onChange={(v) => setBranchId(v)}
                                    options={[{ value: '', label: 'Select Warehouse' }, ...(branches || []).map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))]}
                                    placeholder='Select Warehouse'
                                    searchable
                                    onRefresh={refetchBranches}
                                    refreshing={isFetchingBranches}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment</label>
                                <AppDropdown
                                    value={paymentMethod}
                                    onChange={(v) => setPaymentMethod(v)}
                                    options={[{ value: '', label: 'Select Method' }, ...paymentOptions]}
                                    placeholder='Select Method'
                                    searchable
                                    onRefresh={() => refetchPaymentMethods()}
                                    refreshing={isFetchingPaymentMethods}
                                    refreshLabel="Refresh methods"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Sales Items</h3>
                                <p className="text-xs text-gray-500">Add products for this sales invoice</p>
                            </div>
                            <button
                                onClick={handleOpenAddItem}
                                type="button"
                                disabled={!canAddItems}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                                title={!canAddItems ? 'Select warehouse and payment first' : 'Add item'}
                            >
                                <Plus size={16} /> Add Item
                            </button>
                        </div>

                        <AppItemTable
                            items={items}
                            columns={tableColumns}
                            onUpdateItem={handleUpdateItem}
                            onRemoveItem={removeItem}
                            onEditItem={startEditItem}
                        />
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                        <textarea rows={3} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Add any internal remarks..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm sticky top-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-6 font-mono uppercase tracking-tighter text-center">Summary</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">{totals.subtotal.toLocaleString()} SAR</span></div>
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Tax Total</span><span className="font-medium">{totals.taxTotal.toLocaleString()} SAR</span></div>
                            <div className="pt-4 border-t border-dashed flex justify-between items-center"><span className="font-bold text-gray-900">Grand Total</span><span className="text-xl font-black text-blue-600">{totals.grandTotal.toLocaleString()} SAR</span></div>
                        </div>
                        <button onClick={handleSubmit} disabled={createMut.isPending || items.length === 0 || !branchId || !paymentMethod} className="w-full mt-8 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-blue-200">
                            <Save size={18} /> {createMut.isPending ? 'Processing...' : 'Complete Sale'}
                        </button>
                    </div>
                </div>
            </div>

            <ItemSelectorModal
                isOpen={showItemSelector}
                onClose={() => {
                    setShowItemSelector(false);
                    setEditingIndex(null);
                }}
                onAdd={addItemFromModal}
                mode="SALE"
                branchId={branchId || undefined}
                priceGroupId={priceGroupId}
                initialItem={editingIndex !== null ? items[editingIndex] : undefined}
                confirmLabel={editingIndex !== null ? 'Save Changes' : 'Confirm'}
                allowAddNext={editingIndex === null}
            />
        </div>
    );
}
