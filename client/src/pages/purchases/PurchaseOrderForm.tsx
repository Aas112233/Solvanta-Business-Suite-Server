import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Save, Trash, Pencil, X, Calendar } from 'lucide-react';
import api from '@/lib/api';
import ItemSelectorModal from '@/components/inventory/ItemSelectorModal';
import AppLoader from '@/components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';

export default function PurchaseOrderForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [supplierId, setSupplierId] = useState('');
    const [branchId, setBranchId] = useState('');
    const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [showItemSelector, setShowItemSelector] = useState(false);
    const canAddItems = Boolean(supplierId && branchId);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<any | null>(null);

    const isEdit = !!id;

    const { data: suppliers } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => api.get('/suppliers', { params: { page: 1, limit: 1000 } }).then(r => r.data.data)
    });

    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then(r => r.data.data)
    });

    const { data: poData, isLoading: isLoadingPO } = useQuery({
        queryKey: ['purchase-orders', id],
        queryFn: () => api.get(`/purchases/orders/${id}`).then(r => r.data.data),
        enabled: isEdit
    });

    useMemo(() => {
        if (poData) {
            setSupplierId(poData.supplierId);
            setBranchId(poData.branchId);
            setDate(new Date(poData.date).toLocaleDateString('en-CA'));
            setExpectedDate(poData.expectedDate ? new Date(poData.expectedDate).toLocaleDateString('en-CA') : '');
            setNotes(poData.notes || '');
            setItems(poData.items.map((i: any) => ({
                ...i,
                productName: i.product?.name,
                taxRate: i.taxRate ?? i.product?.tax?.rate ?? i.product?.taxRate ?? 0.15,
            })));
        }
    }, [poData]);

    const addItemFromModal = (item: any) => {
        setItems(prev => [...prev, item]);
        toast.success(`Added ${item.productName || item.name}`);
    };

    const handleOpenAddItem = () => {
        if (!canAddItems) {
            toast.error('Select supplier and warehouse first');
            return;
        }
        setShowItemSelector(true);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const startEditItem = (idx: number) => {
        setEditingIndex(idx);
        setEditForm({ ...items[idx] });
    };

    const saveEditItem = () => {
        if (editingIndex === null || !editForm) return;
        if (Number(editForm.qty) < 0) return toast.error('Quantity cannot be negative');
        if (Number(editForm.unitCost) < 0) return toast.error('Cost cannot be negative');
        const updated = {
            ...editForm,
            qty: Number(editForm.qty),
            unitCost: Number(editForm.unitCost),
            lineTotal: Number(editForm.qty) * Number(editForm.unitCost),
        };
        setItems((prev) => prev.map((row, i) => (i === editingIndex ? updated : row)));
        setEditingIndex(null);
        setEditForm(null);
    };

    const cancelEditItem = () => {
        setEditingIndex(null);
        setEditForm(null);
    };

    const totals = useMemo(() => {
        const subtotal = items.reduce((sum, i) => sum + (i.lineTotal || 0), 0);
        const taxTotal = items.reduce((sum, i) => sum + ((i.lineTotal || 0) * (i.taxRate ?? i.product?.tax?.rate ?? i.product?.taxRate ?? 0.15)), 0);
        return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
    }, [items]);

    const createMut = useMutation({
        mutationFn: (payload: any) => isEdit ? api.put(`/purchases/orders/${id}`, payload) : api.post('/purchases/orders', payload),
        onSuccess: () => {
            toast.success(isEdit ? 'Purchase order updated' : 'Purchase order created');
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            navigate('/purchases/orders');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed')
    });

    const handleSubmit = () => {
        if (!supplierId || !branchId) return toast.error('Missing required header info');
        if (items.length === 0) return toast.error('No items added');

        createMut.mutate({
            supplierId,
            branchId,
            date,
            expectedDate: expectedDate || null,
            notes,
            items: items.map(i => ({
                productId: i.productId,
                unitCode: i.unitCode,
                qty: Number(i.qty),
                unitCost: Number(i.unitCost),
                taxAmount: (i.lineTotal || 0) * (i.taxRate ?? i.product?.tax?.rate ?? i.product?.taxRate ?? 0.15),
                lineTotal: i.lineTotal
            }))
        });
    };

    if (isEdit && isLoadingPO) return <AppLoader />;

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-[1500px] mx-auto">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/purchases/orders')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Purchase Order' : 'Create Purchase Order'}</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                                <AppDropdown
                                    value={supplierId}
                                    onChange={(v) => setSupplierId(v)}
                                    options={[{ value: '', label: 'Select Supplier' }, ...(suppliers || []).map((s: any) => ({ value: s.id, label: `${s.name} (${s.supplierCode})` }))]}
                                    placeholder='Select Supplier'
                                    searchable
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
                                <AppDropdown
                                    value={branchId}
                                    onChange={(v) => setBranchId(v)}
                                    options={[{ value: '', label: 'Select Warehouse' }, ...(branches || []).map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))]}
                                    placeholder='Select Warehouse'
                                    searchable
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Order Date</label>
                                <input
                                    type="date"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Receipt</label>
                                <input
                                    type="date"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    value={expectedDate}
                                    onChange={(e) => setExpectedDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Order Items</h3>
                                <p className="text-xs text-gray-500">Add products you plan to purchase</p>
                            </div>
                            <button
                                onClick={handleOpenAddItem}
                                type="button"
                                disabled={!canAddItems}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                                title={!canAddItems ? 'Select supplier and warehouse first' : 'Add item'}
                            >
                                <Plus size={16} /> Add Item
                            </button>
                        </div>

                        <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-left text-sm table-fixed">
                                <thead className="bg-gray-50 font-bold text-xs uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 w-[260px]">Product</th>
                                        <th className="px-4 py-3 w-28 text-right">Qty</th>
                                        <th className="px-4 py-3 w-32 text-right">Estimated Cost</th>
                                        <th className="px-4 py-3 w-32 text-right">Total</th>
                                        <th className="px-4 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-12 text-center text-gray-400 italic">
                                                No items added yet. Click 'Add Item' to start.
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900 truncate">{item.productName}</p>
                                                    <p className="text-[10px] text-gray-500 uppercase truncate">{item.unitCode}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-700 font-medium">
                                                    {item.qty}
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-700 font-medium">
                                                    {item.unitCost?.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-gray-900">
                                                    {item.lineTotal?.toLocaleString()}
                                                </td>
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
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                        <textarea
                            rows={3}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            placeholder="Add any internal remarks or terms..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm sticky top-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-6 font-mono uppercase tracking-tighter">Order Summary</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Subtotal</span>
                                <span className="font-medium">{totals.subtotal.toLocaleString()} SAR</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Tax Total (15%)</span>
                                <span className="font-medium">{totals.taxTotal.toLocaleString()} SAR</span>
                            </div>
                            <div className="pt-4 border-t border-dashed flex justify-between items-center">
                                <span className="font-bold text-gray-900">Grand Total</span>
                                <span className="text-xl font-black text-blue-600">{totals.grandTotal.toLocaleString()} SAR</span>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={createMut.isPending || items.length === 0 || !supplierId || !branchId}
                            className="w-full mt-8 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-blue-200"
                        >
                            <Save size={18} /> {createMut.isPending ? 'Saving...' : (isEdit ? 'Update Order' : 'Save Order')}
                        </button>
                    </div>
                </div>
            </div>

            <ItemSelectorModal
                isOpen={showItemSelector}
                onClose={() => setShowItemSelector(false)}
                onAdd={addItemFromModal}
                mode="PURCHASE"
            />

            {editingIndex !== null && editForm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900">Edit Item</h3>
                                <p className="text-xs text-gray-500 mt-0.5">{editForm.productName}</p>
                            </div>
                            <button onClick={cancelEditItem} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Qty</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={editForm.qty}
                                        onChange={(e) => setEditForm((prev: any) => ({ ...prev, qty: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cost</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={editForm.unitCost}
                                        onChange={(e) => setEditForm((prev: any) => ({ ...prev, unitCost: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                            </div>
                            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm flex justify-between">
                                <span className="text-gray-500">Total</span>
                                <span className="font-semibold text-gray-900">
                                    {(Number(editForm.qty || 0) * Number(editForm.unitCost || 0)).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
                            <button type="button" onClick={cancelEditItem} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm">Cancel</button>
                            <button type="button" onClick={saveEditItem} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
