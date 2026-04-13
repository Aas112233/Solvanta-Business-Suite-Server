import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Plus, Trash2, Save, ArrowLeft,
    ClipboardCheck, Building, Package, AlertCircle
} from 'lucide-react';
import api from '../../lib/api';
import ItemSelectorModal from '../../components/inventory/ItemSelectorModal';
import toast from 'react-hot-toast';
import AppDropdown from '../../components/ui/AppDropdown';
import { calculateTotalBaseQty } from '../../lib/inventoryUtils';
import AppItemTable, { AppItemTableColumn } from '../../components/shared/AppItemTable';
export default function StockCountForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [branchId, setBranchId] = useState('');
    const [priceGroupId, setPriceGroupId] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [showItemSelector, setShowItemSelector] = useState(false);

    // Fetch Price Groups
    const { data: priceGroups, refetch: refetchPriceGroups, isFetching: isFetchingPriceGroups } = useQuery({
        queryKey: ['price-groups'],
        queryFn: () => api.get('/sales/pricing/price-lists').then((r: any) => r.data.data)
    });

    // Fetch existing if editing
    const { data: existingCount, isLoading: isLoadingExisting } = useQuery({
        queryKey: ['stock-count', id],
        queryFn: () => api.get(`/inventory/stock-counts/${id}`).then((r: any) => r.data.data),
        enabled: !!id
    });

    useEffect(() => {
        if (!existingCount) return;

        let cancelled = false;
        const hydrateDraftItems = async () => {
            setBranchId(existingCount.branchId);
            setPriceGroupId(existingCount.priceGroupId || '');
            setNotes(existingCount.notes || '');

            const baseItems = (existingCount.items || []).map((i: any) => ({
                productId: i.productId,
                name: i.product?.name,
                itemCode: i.product?.itemCode,
                unitCode: i.unitCode,
                systemQty: Number(i.systemQty || 0),
                countedQty: Number(i.countedQty || 0),
                avgCost: Number(i.avgCost || 0),
                salePrice: Number(i.salePrice || 0)
            }));

            const needsHydration = baseItems.some((item: any) => Number(item.avgCost || 0) <= 0 || Number(item.salePrice || 0) <= 0);
            if (!needsHydration) {
                setItems(baseItems);
                return;
            }

            const hydratedItems = await Promise.all(baseItems.map(async (item: any) => {
                if (Number(item.avgCost || 0) > 0 && Number(item.salePrice || 0) > 0) return item;
                try {
                    const stockRes = await api.get('/inventory/stock', {
                        params: { productId: item.productId, branchId: existingCount.branchId, limit: 1 }
                    });
                    const stockRecord = stockRes.data.data?.[0];
                    const baseUnit = stockRecord?.product?.units?.find((u: any) => Boolean(u.isBase));
                    const liveAvgCost = Number(stockRecord?.avgCost || 0);
                    const liveSalePrice = Number(baseUnit?.salePrice || 0);

                    return {
                        ...item,
                        avgCost: Number(item.avgCost || 0) > 0 ? Number(item.avgCost) : liveAvgCost,
                        salePrice: Number(item.salePrice || 0) > 0 ? Number(item.salePrice) : liveSalePrice,
                    };
                } catch {
                    return item;
                }
            }));

            if (!cancelled) setItems(hydratedItems);
        };

        hydrateDraftItems();
        return () => { cancelled = true; };
    }, [existingCount]);

    // Fetch Branches
    const { data: branches, refetch: refetchBranches, isFetching: isFetchingBranches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r: any) => r.data.data)
    });

    const addProductFromModal = async (modalItem: any) => {
        if (!branchId) {
            toast.error('Select branch first');
            return;
        }

        const { product, countedQty } = modalItem;

        // 1. Fetch system quantity and cost from current stock bucket
        const stockRes = await api.get('/inventory/stock', {
            params: { productId: product.id, branchId, limit: 1 }
        });
        const stockRecord = stockRes.data.data?.[0];
        const totalSystemQty = stockRecord?.qtyOnHand || 0;
        const baseUnitFromProduct = product.units?.find((u: any) => u.isBase);
        const baseUnitFromStock = stockRecord?.product?.units?.find((u: any) => Boolean(u.isBase));
        const avgCost = Number(stockRecord?.avgCost || baseUnitFromProduct?.costPrice || baseUnitFromStock?.costPrice || 0);

        // 2. Fetch Sales Price based on Price Group
        let salePrice = 0;
        const baseUnitCode = baseUnitFromProduct?.unitCode || baseUnitFromStock?.unitCode || 'PCS';

        if (priceGroupId) {
            try {
                const priceRes = await api.get(`/sales/pricing/price-lists/price`, {
                    params: { productId: product.id, priceGroupId, unitCode: baseUnitCode }
                });
                salePrice = priceRes.data.data?.salePrice || 0;
            } catch (e) {
                // Fallback to default unit price if price group lookup fails
                salePrice = Number(baseUnitFromProduct?.salePrice || baseUnitFromStock?.salePrice || 0);
            }
        } else {
            salePrice = Number(baseUnitFromProduct?.salePrice || baseUnitFromStock?.salePrice || 0);
        }

        const newItem = {
            productId: product.id,
            name: product.name,
            itemCode: product.itemCode,
            unitCode: baseUnitCode,
            systemQty: totalSystemQty,
            countedQty: countedQty || 0,
            avgCost: avgCost,
            salePrice: salePrice
        };

        setItems(prev => [...prev, newItem]);
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    // Refresh all sale prices when price group changes
    useEffect(() => {
        if (!priceGroupId && items.length > 0) {
            // Revert to product base unit price if no price group
            setItems(prev => prev.map(item => ({ ...item, salePrice: item.salePrice || 0 }))); // Actually need better logic here if we wanted to revert
            return;
        }

        const refreshPrices = async () => {
            const updatedItems = await Promise.all(items.map(async (item) => {
                try {
                    const priceRes = await api.get(`/sales/pricing/price-lists/price`, {
                        params: { productId: item.productId, priceGroupId, unitCode: item.unitCode }
                    });
                    return { ...item, salePrice: priceRes.data.data?.salePrice || item.salePrice };
                } catch (e) {
                    return item;
                }
            }));
            setItems(updatedItems);
        };

        if (priceGroupId && items.length > 0) {
            refreshPrices();
        }
    }, [priceGroupId]);

    const mutation = useMutation({
        mutationFn: (data: any) => id ? api.put(`/inventory/stock-counts/${id}`, data) : api.post('/inventory/stock-counts', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
            if (id) queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
            toast.success(id ? 'Draft count session updated' : 'Draft count session saved');
            navigate(id ? `/inventory/stock-counts/${id}` : '/inventory/stock-counts');
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to save count session');
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!branchId) return toast.error('Branch is required');
        if (items.length === 0) return toast.error('Add at least one item');
        mutation.mutate({ branchId, priceGroupId, notes, items });
    };

    // Detailed Variance Analysis for the form
    const surplusItems = items.filter(i => (i.countedQty - i.systemQty) > 0);
    const shortageItems = items.filter(i => (i.countedQty - i.systemQty) < 0);

    const surplusQty = surplusItems.reduce((sum, i) => sum + (i.countedQty - i.systemQty), 0);
    const surplusCost = surplusItems.reduce((sum, i) => sum + ((i.countedQty - i.systemQty) * i.avgCost), 0);
    const surplusSales = surplusItems.reduce((sum, i) => sum + ((i.countedQty - i.systemQty) * i.salePrice), 0);

    const shortageQty = shortageItems.reduce((sum, i) => sum + Math.abs(i.countedQty - i.systemQty), 0);
    const shortageCost = shortageItems.reduce((sum, i) => sum + (Math.abs(i.countedQty - i.systemQty) * i.avgCost), 0);
    const shortageSales = shortageItems.reduce((sum, i) => sum + (Math.abs(i.countedQty - i.systemQty) * i.salePrice), 0);

    const netVarianceCost = surplusCost - shortageCost;
    const netVarianceSales = surplusSales - shortageSales;

    if (id && isLoadingExisting) return <div className="p-8 text-center text-gray-400 font-bold uppercase tracking-widest animate-pulse">Loading Draft...</div>;

    return (
        <div className="max-w-[1700px] mx-auto space-y-6 animate-fade-in">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(id ? `/inventory/stock-counts/${id}` : '/inventory/stock-counts')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                            {id ? `Edit Count: ${existingCount?.countNo || 'Draft'}` : 'New Stock Count'}
                        </h1>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Physical Inventory Reconciliation</p>
                    </div>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={mutation.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                    <Save size={16} /> {id ? 'Update Draft Changes' : 'Save Draft Session'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-3 space-y-4">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Building size={14} /> Count Parameters
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Location / Branch</label>
                                <AppDropdown
                                    value={branchId}
                                    onChange={(v) => setBranchId(v)}
                                    options={[{ value: '', label: 'Select Target Branch' }, ...(branches || []).map((b: any) => ({ value: b.id, label: b.name }))]}
                                    placeholder='Select Target Branch'
                                    searchable
                                    onRefresh={refetchBranches}
                                    refreshing={isFetchingBranches}
                                    refreshLabel="Refresh branches"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Valuation Price Group (Sale)</label>
                                <AppDropdown
                                    value={priceGroupId}
                                    onChange={(v) => setPriceGroupId(v)}
                                    options={[{ value: '', label: 'Default Sale Prices' }, ...(priceGroups || []).map((pg: any) => ({ value: pg.id, label: pg.name }))]}
                                    placeholder='Target Price Group'
                                    searchable
                                    onRefresh={refetchPriceGroups}
                                    refreshing={isFetchingPriceGroups}
                                    refreshLabel="Refresh price groups"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1 ml-1">Internal Reference / Notes</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="e.g., Annual Stocktake 2025"
                                    className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-medium h-24"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4 font-sans">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <ClipboardCheck size={14} /> Live Count Summary
                        </h3>

                        <div className="grid grid-cols-1 gap-2">
                            {/* Base Totals */}
                            <div className="flex justify-between items-end p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Entry Scope</p>
                                    <p className="text-lg font-black text-gray-900 leading-none mt-1">{items.length} <span className="text-[10px] text-gray-400">Lines</span></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Valuation</p>
                                    <p className="text-sm font-black text-blue-600 font-mono mt-1">{items.reduce((sum, i) => sum + (i.countedQty * i.avgCost), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>

                            {/* Surplus Section */}
                            <div className="p-3 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Total Surplus (+)</p>
                                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">+{surplusQty} Units</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <div>
                                        <p className="text-[8px] font-bold text-emerald-500/80 uppercase">Cost Val</p>
                                        <p className="text-[11px] font-black text-emerald-900 font-mono">{surplusCost > 0 ? '+' : ''}{surplusCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] font-bold text-emerald-500/80 uppercase">Sale Val</p>
                                        <p className="text-[11px] font-black text-emerald-900 font-mono">{surplusSales > 0 ? '+' : ''}{surplusSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Shortage Section */}
                            <div className="p-3 bg-rose-50/30 rounded-xl border border-rose-100/50">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Total Shortage (-)</p>
                                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded-md">-{shortageQty} Units</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <div>
                                        <p className="text-[8px] font-bold text-rose-500/80 uppercase">Cost Val</p>
                                        <p className="text-[11px] font-black text-rose-900 font-mono">{shortageCost > 0 ? '-' : ''}{shortageCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[8px] font-bold text-rose-500/80 uppercase">Sale Val</p>
                                        <p className="text-[11px] font-black text-rose-900 font-mono">{shortageSales > 0 ? '-' : ''}{shortageSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Net Impact */}
                            <div className={`p-4 rounded-xl border shadow-sm transition-colors ${(netVarianceCost < 0 || (netVarianceCost === 0 && shortageQty > surplusQty))
                                ? 'bg-rose-600 border-rose-700'
                                : (netVarianceCost > 0 || (netVarianceCost === 0 && surplusQty > shortageQty))
                                    ? 'bg-emerald-600 border-emerald-700'
                                    : 'bg-blue-600 border-blue-700'
                                }`}>
                                <p className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-1">Net Count Variance (Cost)</p>
                                <div className="flex justify-between items-baseline">
                                    <p className="text-xl font-black text-white font-mono leading-none">
                                        {netVarianceCost > 0 ? '+' : ''}{netVarianceCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                    <div className="text-right">
                                        <p className="text-[8px] font-bold text-white/40 uppercase">Net Sales Impact</p>
                                        <p className="text-[10px] font-black text-white/80 font-mono">{netVarianceSales > 0 ? '+' : ''}{netVarianceSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-9 space-y-4">
                    <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden min-h-[500px]">
                        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-gray-900 uppercase">Itemized Entry</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Define physical count for reconciliation</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (!branchId) return toast.error('Please select a branch first');
                                    setShowItemSelector(true);
                                }}
                                type="button"
                                className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-gray-200"
                            >
                                <Plus size={16} />
                                Scan/Add Product
                            </button>

                            <ItemSelectorModal
                                isOpen={showItemSelector}
                                onClose={() => setShowItemSelector(false)}
                                onAdd={addProductFromModal}
                                mode="AUDIT"
                                branchId={branchId}
                            />
                        </div>

                        <div className="overflow-x-auto">
                            <AppItemTable
                                items={items}
                                columns={['product', 'countedQty', 'unitCost', 'salePrice', 'saleVal', 'variance', 'actions']}
                                onUpdateItem={updateItem}
                                onRemoveItem={removeItem}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
