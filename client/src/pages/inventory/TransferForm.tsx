import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash, Save } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../lib/api';
import ItemSelectorModal from '../../components/inventory/ItemSelectorModal';
import AppDropdown from '../../components/ui/AppDropdown';

export default function TransferForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const queryClient = useQueryClient();
    const isEdit = id && id !== 'new';

    const [fromBranchId, setFromBranchId] = useState('');
    const [toBranchId, setToBranchId] = useState('');
    const [items, setItems] = useState<any[]>([]);

    const [showItemSelector, setShowItemSelector] = useState(false);

    // Fetch Branches
    const { data: branches, refetch: refetchBranches, isFetching: isFetchingBranches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r: any) => r.data.data)
    });

    // Fetch Transfer if edit
    const { data: transferData } = useQuery({
        queryKey: ['transfer', id],
        queryFn: () => api.get(`/inventory/transfers/${id}`).then((r: any) => r.data.data),
        enabled: !!isEdit,
    });

    useEffect(() => {
        if (!isEdit || !transferData) return;

        setFromBranchId(transferData.fromBranchId || '');
        setToBranchId(transferData.toBranchId || '');
        setItems(
            (transferData.items || []).map((item: any) => ({
                productId: item.productId,
                productName: item.product?.name,
                itemCode: item.product?.itemCode,
                unitCode: item.unitCode,
                unitName: item.unitName || item.unit?.unitName || '',
                unitFraction: Number(item.unitFraction || item.unit?.qtyInBaseUnit || 1),
                qty: item.qty,


            }))
        );
    }, [isEdit, transferData]);

    // Removed manual search query logic in favor of centralized ItemSelectorModal

    const createMut = useMutation({
        mutationFn: (data: any) => api.post('/inventory/transfers', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            navigate('/inventory/transfers');
        },
        onError: (err: any) => {
            const apiMessage =
                err?.response?.data?.error?.message ||
                err?.response?.data?.message ||
                'Failed to create transfer';
            toast.error(apiMessage);
        }
    });

    const addItemFromModal = (newItem: any) => {
        setItems(prev => [...prev, newItem]);
    };

    const updateItem = (index: number, field: string, value: any) => {
        setItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        if (!fromBranchId || !toBranchId) {
            toast.error('Please select both Origin and Destination branches');
            return;
        }
        if (fromBranchId === toBranchId) {
            toast.error('Source and destination branches must be different');
            return;
        }
        if (items.length === 0) {
            toast.error('Please add at least one item to transfer');
            return;
        }

        const normalizedItems = items.map((i) => {
            const qty = Number(i.qty);


            return {
                productId: i.productId,
                unitCode: i.unitCode,
                qty,


                stockOnHand: i.stockOnHand,
                productName: i.productName
            };
        });

        const invalidQtyItem = normalizedItems.find(i => !i.productId || !i.unitCode || !Number.isFinite(i.qty) || i.qty <= 0);
        if (invalidQtyItem) {
            toast.error(`Invalid item row for ${invalidQtyItem.productName || 'selected product'}. Quantity must be greater than 0.`);
            return;
        }

        const invalidItem = normalizedItems.find(i => Number.isFinite(Number(i.stockOnHand)) && i.qty > Number(i.stockOnHand));
        if (invalidItem) {
            toast.error(`Insufficient stock for item: ${invalidItem.productName}`);
            return;
        }

        createMut.mutate({
            fromBranchId,
            toBranchId,
            items: normalizedItems.map(i => ({
                productId: i.productId,
                unitCode: i.unitCode,
                qty: i.qty,


            }))
        });
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/inventory/transfers')} className="p-2 hover:bg-gray-100 rounded-full">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'View Transfer' : 'New Transfer'}</h1>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">From Branch</label>
                        <AppDropdown
                            value={fromBranchId}
                            onChange={(v) => setFromBranchId(v)}
                            options={[{ value: '', label: 'Select Origin Branch' }, ...(branches || []).map((b: any) => ({ value: b.id, label: b.name }))]}
                            placeholder='Select Origin Branch'
                            searchable
                            onRefresh={refetchBranches}
                            refreshing={isFetchingBranches}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">To Branch</label>
                        <AppDropdown
                            value={toBranchId}
                            onChange={(v) => setToBranchId(v)}
                            options={[
                                { value: '', label: 'Select Destination Branch' },
                                ...(branches || [])
                                    .filter((b: any) => b.id !== fromBranchId)
                                    .map((b: any) => ({ value: b.id, label: b.name }))
                            ]}
                            onRefresh={refetchBranches}
                            refreshing={isFetchingBranches}
                            placeholder='Select Destination Branch'
                            searchable
                        />
                    </div>
                </div>

                {!isEdit && (
                    <div className="flex items-center justify-between py-2 px-1">
                        <div className="flex-1">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Transfer Items</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Ensure stock is available in origin branch</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <button
                                onClick={() => setShowItemSelector(true)}
                                disabled={!fromBranchId || !toBranchId}
                                className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-bold text-sm shadow-xl shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus size={18} />
                                Add Items
                            </button>
                            {(!fromBranchId || !toBranchId) && (
                                <p className="text-[10px] text-red-500 font-medium">
                                    * Select branches to enable item selection
                                </p>
                            )}
                        </div>

                        <ItemSelectorModal
                            isOpen={showItemSelector}
                            onClose={() => setShowItemSelector(false)}
                            onAdd={addItemFromModal}
                            mode="TRANSFER"
                            branchId={fromBranchId}
                        />
                    </div>
                )}

                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="w-[54%] px-4 py-3 text-xs font-bold tracking-wide uppercase text-gray-500">Product</th>
                                <th className="w-[30%] px-4 py-3 text-xs font-bold tracking-wide uppercase text-gray-500">Unit</th>
                                <th className="w-[12%] px-4 py-3 text-xs font-bold tracking-wide uppercase text-gray-500">Qty</th>
                                {!isEdit && <th className="w-[4%] px-4 py-3"></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.length === 0 ? (
                                <tr><td colSpan={isEdit ? 3 : 4} className="px-4 py-8 text-center text-gray-500">No items added</td></tr>
                            ) : (
                                items.map((item, idx) => {
                                    const qty = Number(item.qty || 0);
                                    const stockOnHand = Number(item.stockOnHand || 0);
                                    const hasInsufficientStock = item.stockOnHand !== undefined && qty > stockOnHand;

                                    return (
                                        <tr key={idx}>
                                            <td className="px-4 py-3 align-top">
                                                <div className="text-sm font-semibold text-gray-900">{item.productName}</div>
                                                <div className="text-xs text-gray-500 mt-1">{item.itemCode}</div>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="space-y-0.5 leading-tight">
                                                    <div className="text-sm font-bold text-gray-900">{item.unitName || '-'}</div>
                                                    <div className="text-xs text-gray-500">Code: {item.unitCode || '-'}</div>
                                                    <div className="text-xs text-gray-500">Fraction: x{Number(item.unitFraction || 1)}</div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        className={`w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-1 ${hasInsufficientStock ? 'border-red-500 focus:ring-red-500 ring-1 ring-red-200' : 'focus:ring-blue-500'}`}
                                                        value={item.qty}
                                                        onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))}
                                                        disabled={!!isEdit}
                                                    />
                                                    {hasInsufficientStock && (
                                                        <p className="absolute -bottom-4 left-0 text-[9px] text-red-600 font-bold whitespace-nowrap bg-white px-1">
                                                            Max: {stockOnHand}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                            {!isEdit && (
                                                <td className="px-4 py-2 text-center">
                                                    <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                                                        <Trash size={16} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {!isEdit && (
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleSubmit}
                            disabled={createMut.isPending || items.length === 0}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Save size={18} /> {createMut.isPending ? 'Creating Draft...' : 'Create Draft'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
