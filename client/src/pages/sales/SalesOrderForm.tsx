import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Plus, Save, Trash, X, Package } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import ItemSelectorModal from '@/components/inventory/ItemSelectorModal';
import Modal from '@/components/ui/Modal';
import AppDropdown from '../../components/ui/AppDropdown';

type OrderItem = {
    productId: string;
    description: string;
    unitCode: string;
    qty: number;
    unitPrice: number;
    discount: number;
    taxAmount: number;
};

export default function SalesOrderForm() {
    const { id } = useParams();
    const isEdit = !!id;
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const activeBranchId = useAuthStore(s => s.activeBranchId);
    const currency = useAuthStore(s => s.user?.company?.currency) || 'SAR';

    const [customerId, setCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [deliveryDate, setDeliveryDate] = useState('');
    const [notes, setNotes] = useState('');
    const [terms, setTerms] = useState('');
    const [items, setItems] = useState<OrderItem[]>([]);
    const [showItemSelector, setShowItemSelector] = useState(false);

    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<OrderItem | null>(null);

    const {
        data: customers,
        refetch: refetchCustomers,
        isFetching: isFetchingCustomers,
    } = useQuery({
        queryKey: ['customers-order-form'],
        queryFn: () => api.get('/customers', { params: { page: 1, limit: 1000 } }).then((r) => r.data.data),
    });

    const selectedCustomer = (customers || []).find((c: any) => String(c.id) === String(customerId));
    const priceGroupId: string | undefined = selectedCustomer?.priceGroupId || undefined;

    const { data: existingOrder, isLoading: isLoadingOrder } = useQuery({
        queryKey: ['sales-order', id],
        queryFn: () => api.get(`/sales/orders/${id}`).then((r) => r.data.data),
        enabled: isEdit
    });

    useEffect(() => {
        if (existingOrder) {
            setCustomerId(existingOrder.customerId || '');
            setCustomerName(existingOrder.customerName || '');
            setDate(existingOrder.date ? new Date(existingOrder.date).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA'));
            setDeliveryDate(existingOrder.deliveryDate ? new Date(existingOrder.deliveryDate).toLocaleDateString('en-CA') : '');
            setNotes(existingOrder.notes || '');
            setTerms(existingOrder.terms || '');
            setItems(existingOrder.items?.map((i: any) => ({
                productId: i.productId || '',
                description: i.description || i.product?.name || '',
                unitCode: i.unitCode || 'UNIT',
                qty: Number(i.qty),
                unitPrice: Number(i.unitPrice),
                discount: Number(i.discount || 0),
                taxAmount: Number(i.taxAmount || 0),
            })) || []);
        }
    }, [existingOrder]);

    const totals = useMemo(() => {
        const subtotal = items.reduce((sum, i) => sum + (Number(i.qty || 0) * Number(i.unitPrice || 0) - Number(i.discount || 0)), 0);
        const taxTotal = items.reduce((sum, i) => sum + Number(i.taxAmount || 0), 0);
        return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
    }, [items]);

    const createMut = useMutation({
        mutationFn: (payload: any) => api.post('/sales/orders', payload),
        onSuccess: () => {
            toast.success('Sales order created');
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
            navigate('/sales/orders');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create order'),
    });

    const updateMut = useMutation({
        mutationFn: (payload: any) => api.patch(`/sales/orders/${id}`, payload),
        onSuccess: () => {
            toast.success('Sales order updated');
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
            queryClient.invalidateQueries({ queryKey: ['sales-order', id] });
            navigate('/sales/orders');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to update order'),
    });

    const addItemFromModal = (item: any) => {
        const row: OrderItem = {
            productId: String(item.productId || ''),
            description: String(item.productName || item.name || ''),
            unitCode: String(item.unitCode || 'UNIT'),
            qty: Number(item.qty || 1),
            // item.unitPrice is already channel-aware (resolved inside ItemSelectorModal)
            unitPrice: Number(item.unitPrice || item.unitCost || 0),
            discount: 0,
            taxAmount: 0,
        };
        setItems((prev) => [...prev, row]);
        toast.success(`Added ${row.description}`);
    };

    const removeItem = (idx: number) => {
        setItems((prev) => prev.filter((_, i) => i !== idx));
    };

    const startEditItem = (idx: number) => {
        setEditingIndex(idx);
        setEditForm({ ...items[idx] });
    };

    const cancelEditItem = () => {
        setEditingIndex(null);
        setEditForm(null);
    };

    const saveEditItem = () => {
        if (editingIndex === null || !editForm) return;
        if (!editForm.description.trim()) return toast.error('Item description is required');
        if (Number(editForm.qty) <= 0) return toast.error('Quantity must be greater than zero');
        if (Number(editForm.unitPrice) < 0) return toast.error('Unit price cannot be negative');
        if (Number(editForm.discount) < 0) return toast.error('Discount cannot be negative');
        if (Number(editForm.taxAmount) < 0) return toast.error('Tax cannot be negative');

        setItems((prev) => prev.map((row, i) => (i === editingIndex ? editForm : row)));
        setEditingIndex(null);
        setEditForm(null);
    };

    const handleSubmit = () => {
        if (!customerId && !customerName.trim()) return toast.error('Select customer or enter customer name');
        if (items.length === 0) return toast.error('Add at least one item');
        if (items.some((i) => !i.description.trim() || Number(i.qty) <= 0)) return toast.error('Please complete all item rows');

        const payload = {
            customerId: customerId || undefined,
            customerName: customerId ? undefined : customerName.trim(),
            date: date || undefined,
            deliveryDate: deliveryDate || undefined,
            notes: notes || undefined,
            terms: terms || undefined,
            items: items.map((i) => ({
                productId: i.productId || undefined,
                description: i.description,
                unitCode: i.unitCode,
                qty: Number(i.qty),
                unitPrice: Number(i.unitPrice),
                discount: Number(i.discount || 0),
                taxAmount: Number(i.taxAmount || 0),
            })),
        };

        if (isEdit) {
            updateMut.mutate(payload);
        } else {
            createMut.mutate(payload);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-[1500px] mx-auto">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/sales/orders')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Sales Order' : 'Create Sales Order'}</h1>
                {isEdit && existingOrder && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-mono font-bold rounded-lg border border-blue-200">
                        {existingOrder.orderNo}
                    </span>
                )}
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
                                    options={[{ value: '', label: 'Select Customer' }, ...(customers || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.customerCode || '-'})` }))]}
                                    placeholder='Select Customer'
                                    searchable
                                    onRefresh={refetchCustomers}
                                    refreshing={isFetchingCustomers}
                                    refreshLabel="Refresh customers"
                                    onRefresh={() => refetchCustomers()}
                                    refreshing={isFetchingCustomers}
                                    refreshLabel="Refresh customers"
                                />
                                {priceGroupId && (
                                    <p className="mt-1 text-[11px] text-emerald-600 font-medium">✓ Price channel active</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Walk-in Customer Name</label>
                                <input
                                    value={customerName}
                                    onChange={(e) => {
                                        setCustomerName(e.target.value);
                                        if (e.target.value.trim()) setCustomerId('');
                                    }}
                                    disabled={!!customerId}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-50"
                                    placeholder="Optional if customer selected"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Order Date</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery</label>
                                <input
                                    type="date"
                                    value={deliveryDate}
                                    onChange={(e) => setDeliveryDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Order Items</h3>
                                <p className="text-xs text-gray-500">Add products and quantities</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowItemSelector(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-all text-xs font-bold"
                                >
                                    <Package size={16} /> Browse Catalog
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newItem: OrderItem = {
                                            productId: '',
                                            description: '',
                                            unitCode: 'UNIT',
                                            qty: 1,
                                            unitPrice: 0,
                                            discount: 0,
                                            taxAmount: 0,
                                        };
                                        setItems([...items, newItem]);
                                        setEditingIndex(items.length);
                                        setEditForm(newItem);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs font-bold"
                                >
                                    <Plus size={16} /> Add Manual Line
                                </button>
                            </div>
                        </div>

                        <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-left text-sm table-fixed">
                                <thead className="bg-gray-50 font-bold text-xs uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 w-[260px]">Product / Description</th>
                                        <th className="px-4 py-3 w-28">Unit</th>
                                        <th className="px-4 py-3 w-20 text-right">Qty</th>
                                        <th className="px-4 py-3 w-28 text-right">Unit Price</th>
                                        <th className="px-4 py-3 w-24 text-right">Discount</th>
                                        <th className="px-4 py-3 w-24 text-right">Tax</th>
                                        <th className="px-4 py-3 w-28 text-right">Total</th>
                                        <th className="px-4 py-3 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-12 text-center text-gray-400 italic">
                                                No items added yet. Click 'Add Item' to start.
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item, idx) => {
                                            const lineTotal = Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0);
                                            return (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-gray-900 truncate">{item.description}</p>
                                                        <p className="text-[10px] text-gray-500 uppercase truncate">{item.unitCode}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">{item.unitCode}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{item.qty}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{Number(item.unitPrice || 0).toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{Number(item.discount || 0).toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{Number(item.taxAmount || 0).toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-gray-900">{lineTotal.toFixed(2)}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button type="button" onClick={() => startEditItem(idx)} className="text-blue-500 hover:text-blue-700">
                                                                <Pencil size={16} />
                                                            </button>
                                                            <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500">
                                                                <Trash size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                placeholder="Add any external notes..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                placeholder="Payment terms, delivery notes..."
                                value={terms}
                                onChange={(e) => setTerms(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm sticky top-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-6 font-mono uppercase tracking-tighter">Order Summary</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-medium">{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Tax Total</span>
                                <span className="font-medium">{totals.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
                            </div>
                            <div className="pt-4 border-t border-dashed flex justify-between items-center">
                                <span className="font-bold text-gray-900">Grand Total</span>
                                <span className="text-xl font-black text-blue-600">{totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={createMut.isPending || updateMut.isPending || items.length === 0 || (!customerId && !customerName.trim())}
                            className="w-full mt-8 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-blue-200"
                        >
                            <Save size={18} /> {createMut.isPending || updateMut.isPending ? 'Saving...' : (isEdit ? 'Update Order' : 'Save Order')}
                        </button>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={editingIndex !== null && !!editForm}
                onClose={cancelEditItem}
                title="Edit Item"
                maxWidth="md"
            >
                {editForm && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Description</label>
                            <input
                                value={editForm.description}
                                onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, description: e.target.value }) : prev)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Qty</label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={editForm.qty}
                                    onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, qty: Number(e.target.value) }) : prev)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Unit Price</label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={editForm.unitPrice}
                                    onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, unitPrice: Number(e.target.value) }) : prev)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Discount</label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={editForm.discount}
                                    onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, discount: Number(e.target.value) }) : prev)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tax</label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={editForm.taxAmount}
                                    onChange={(e) => setEditForm((prev) => prev ? ({ ...prev, taxAmount: Number(e.target.value) }) : prev)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm flex justify-between">
                            <span className="text-gray-500">Total</span>
                            <span className="font-semibold text-gray-900">
                                {(Number(editForm.qty || 0) * Number(editForm.unitPrice || 0) - Number(editForm.discount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-6">
                            <button type="button" onClick={cancelEditItem} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm">Cancel</button>
                            <button type="button" onClick={saveEditItem} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">Save Changes</button>
                        </div>
                    </div>
                )}
            </Modal>
            <ItemSelectorModal
                isOpen={showItemSelector}
                onClose={() => setShowItemSelector(false)}
                onAdd={addItemFromModal}
                mode="SALE"
                branchId={activeBranchId || undefined}
                priceGroupId={priceGroupId}
            />
        </div>
    );
}
