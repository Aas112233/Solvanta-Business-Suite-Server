import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import AppDropdown from '../../components/ui/AppDropdown';
import { calculateTotalBaseQty, formatDecomposedQty } from '../../lib/inventoryUtils';

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function StockAdjustmentModal({ isOpen, onClose, onSuccess }: StockAdjustmentModalProps) {
    const [search, setSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [selectedUnit, setSelectedUnit] = useState<any>(null);
    const [formData, setFormData] = useState({
        branchId: '',
        type: 'ADJUSTMENT',
        qty: 0
    });
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const queryClient = useQueryClient();

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch Products
    const { data: products } = useQuery({
        queryKey: ['products', debouncedSearch],
        queryFn: () => api.get('/products', { params: { search: debouncedSearch, limit: 10 } }).then((r: any) => r.data.data),
        enabled: debouncedSearch.length > 1
    });

    // Fetch Branches
    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r: any) => r.data.data)
    });

    // Fetch Stock for selected product and branch
    const { data: stockRecords } = useQuery({
        queryKey: ['stock-adjustment', selectedProduct?.id, formData.branchId],
        queryFn: () => api.get('/inventory/stock', {
            params: { productId: selectedProduct?.id, branchId: formData.branchId }
        }).then((r: any) => r.data.data),
        enabled: !!selectedProduct && !!formData.branchId
    });

    const totalBaseStock = stockRecords ? calculateTotalBaseQty(stockRecords) : 0;


    const adjustMut = useMutation({
        mutationFn: (data: any) => api.post('/inventory/adjust', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            onSuccess();
            onClose();
        }
    });

    const getUnitDisplayLabel = (unit: any) => {
        const barcode = String(unit?.barcode || unit?.unitCode || '').trim();
        const unitName = String(unit?.unitName || unit?.unitCode || '').trim();
        const fraction = Number(unit?.qtyInBaseUnit || 1);
        return `${barcode} - ${unitName} - x${fraction}`;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !formData.branchId || !selectedUnit) return;

        adjustMut.mutate({
            ...formData,
            productId: selectedProduct.id,
            unitCode: selectedUnit.unitCode
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">Stock Adjustment</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Product Search */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Search product..."
                                value={selectedProduct ? selectedProduct.name : search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setSelectedProduct(null);
                                    setSelectedUnit(null);
                                }}
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />

                            {/* Dropdown */}
                            {search && !selectedProduct && products && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {products.map((p: any) => (
                                        <div
                                            key={p.id}
                                            className="px-4 py-2 hover:bg-gray-50 cursor-pointer"
                                            onClick={() => {
                                                setSelectedProduct(p);
                                                setSearch('');
                                                // Default to base unit
                                                if (p.units?.length) {
                                                    setSelectedUnit(p.units.find((u: any) => u.isBase) || p.units[0]);
                                                }
                                            }}
                                        >
                                            <div className="text-sm font-medium text-gray-900">{p.name}</div>
                                            <div className="text-xs text-gray-500">{p.itemCode}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Unit Selection */}
                    {selectedProduct && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                            <AppDropdown
                                value={selectedUnit?.unitCode || ''}
                                onChange={(v) => { const u = selectedProduct?.units?.find((u: any) => u.unitCode === v); if (u) setSelectedUnit(u); }}
                                options={[...selectedProduct.units.map((u: any) => ({ value: u.unitCode, label: getUnitDisplayLabel(u) }))]}
                                placeholder='Select'
                                searchable
                            />
                        </div>
                    )}

                    {/* Branch */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                        <AppDropdown
                            value={formData.branchId}
                            onChange={(v) => setFormData(prev => ({ ...prev, branchId: v }))}
                            options={[{ value: '', label: 'Select Branch' }, ...(branches || []).map((b: any) => ({ value: b.id, label: b.name }))]}
                            placeholder='Select Branch'
                            searchable
                        />
                    </div>

                    {/* Stock Display */}
                    {selectedProduct && formData.branchId && (
                        <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100/50">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Available Stock</span>
                                <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded">
                                    Total: {totalBaseStock}
                                </span>
                            </div>
                            <p className="text-sm font-black text-blue-900 uppercase">
                                {formatDecomposedQty(totalBaseStock, selectedProduct.units)}
                            </p>
                        </div>
                    )}


                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment Type</label>
                            <AppDropdown
                                value={formData.type}
                                onChange={(v) => setFormData(prev => ({ ...prev, type: v }))}
                                options={[{ value: 'ADJUSTMENT', label: 'Adjustment (+/-)' }, { value: 'DAMAGE', label: 'Damage (-)' }, { value: 'RETURN', label: 'Return (+)' }]}
                                placeholder='Adjustment (+/-)'
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                            <input
                                type="number"
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                                value={formData.qty}
                                onChange={(e) => setFormData({ ...formData, qty: Number(e.target.value) || 0 })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Use negative for reduction if Type is Adjustment</p>
                        </div>
                    </div>



                    {adjustMut.isError && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                            {(adjustMut.error as any)?.response?.data?.error?.message || 'Failed to adjust stock'}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
                        <button
                            onClick={handleSubmit}
                            disabled={adjustMut.isPending || !selectedProduct || !formData.branchId}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {adjustMut.isPending ? 'Saving...' : 'Save Adjustment'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
