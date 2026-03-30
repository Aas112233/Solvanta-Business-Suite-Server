import { useState, useEffect, useRef } from 'react';
import { Search, X, Plus, Package, Calendar, Hash, Check, CornerDownRight, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { format } from 'date-fns';
import AppDropdown from '../ui/AppDropdown';
import { calculateTotalBaseQty, formatDecomposedQty } from '../../lib/inventoryUtils';

interface ItemSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (item: any) => void;
    mode: 'PURCHASE' | 'TRANSFER' | 'ADJUSTMENT' | 'AUDIT' | 'SALE';
    branchId?: string;
    priceGroupId?: string;  // Price channel to resolve sale prices from
    initialItem?: any;
    confirmLabel?: string;
    allowAddNext?: boolean;
}

export default function ItemSelectorModal({ isOpen, onClose, onAdd, mode, branchId, priceGroupId, initialItem, confirmLabel, allowAddNext = true }: ItemSelectorModalProps) {

    /** Resolve effective sale price for a unit:
     *  1. Check priceGroupPrices for a matching override
     *  2. Fall back to base salePrice
     */
    const getEffectivePrice = (product: any, unit: any, pgId?: string): number => {
        if (pgId && Array.isArray(product?.priceGroupPrices)) {
            const override = product.priceGroupPrices.find(
                (r: any) => r.priceGroupId === pgId &&
                    String(r.unitCode).toUpperCase() === String(unit.unitCode).toUpperCase()
            );
            if (override && Number(override.salePrice) > 0) return Number(override.salePrice);
        }
        return Number(unit?.salePrice || 0);
    };

    const [search, setSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [isResolvingCode, setIsResolvingCode] = useState(false);
    const [formData, setFormData] = useState({
        qty: 1,
        unitCode: '',
        unitCost: 0,
        taxRate: 0.15
    });
    const [error, setError] = useState<string | null>(null);
    const [showAllBranchesStock, setShowAllBranchesStock] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase();

    const { data: productResults, isLoading: isSearching } = useQuery({
        queryKey: ['product-search-modal', search, priceGroupId],
        queryFn: () => api.get('/products', {
            params: {
                search,
                limit: 5,
                ...(priceGroupId ? { includePricing: true, priceGroupId } : {}),
            }
        }).then((r: any) => r.data.data),
        enabled: search.length >= 2,
    });

    const { data: purchaseInsights, isLoading: isLoadingInsights } = useQuery({
        queryKey: ['purchase-product-insights', selectedProduct?.id, formData.unitCode, branchId],
        queryFn: () => api.get('/purchases/product-insights', {
            params: {
                productId: selectedProduct.id,
                unitCode: formData.unitCode || undefined,
                branchId: branchId || undefined,
            }
        }).then((r: any) => r.data.data),
        enabled: !!selectedProduct && !!formData.unitCode && mode === 'PURCHASE',
    });

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            setSearch('');
            setSelectedProduct(initialItem?.product || null);
            setFormData({
                qty: Number(initialItem?.qty ?? 1),
                unitCode: String(initialItem?.unitCode || ''),
                unitCost: Number(initialItem?.unitPrice ?? initialItem?.unitCost ?? 0),
                taxRate: Number(initialItem?.taxRate ?? initialItem?.product?.tax?.rate ?? initialItem?.product?.taxRate ?? 0.15),
            });
            setError(null);
            setShowAllBranchesStock(false);
            setTimeout(() => searchInputRef.current?.focus(), 100);
            window.addEventListener('keydown', handleEsc);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose, initialItem]);

    const handleUnitChange = (unitCode: string) => {
        const unit = selectedProduct?.units?.find((u: any) => u.unitCode === unitCode);
        if (!unit) return;

        const price = mode === 'SALE'
            ? getEffectivePrice(selectedProduct, unit, priceGroupId)
            : (unit.costPrice || 0);

        setFormData(prev => ({
            ...prev,
            unitCode,
            // Only update cost if we are in SALE/PURCHASE mode
            unitCost: (mode === 'SALE' || mode === 'PURCHASE') ? price : prev.unitCost
        }));
    };

    const handleSelectProduct = (product: any, forcedUnitCode?: string) => {
        const query = normalizeCode(forcedUnitCode || search);

        // Find unit that matches barcode or unitCode exactly
        const matchedUnit = product.units?.find((u: any) =>
            normalizeCode(u.unitCode) === query ||
            (u.barcode && normalizeCode(u.barcode) === query)
        ) || product.units?.find((u: any) => u.isBase) || product.units?.[0];

        const price = mode === 'SALE'
            ? getEffectivePrice(product, matchedUnit, priceGroupId)
            : (matchedUnit?.costPrice || 0);

        setSelectedProduct(product);
        setSearch('');
        setFormData({
            qty: 1,
            unitCode: matchedUnit?.unitCode || 'PCS',
            unitCost: price,
            taxRate: product.tax?.rate ?? product.taxRate ?? 0.15
        });
    };

    const resolveProductByCode = async () => {
        const raw = search.trim();
        if (!raw) return;

        try {
            setIsResolvingCode(true);
            setError(null);
            const res = await api.get(`/products/barcode/${encodeURIComponent(raw)}`);
            const payload = res?.data?.data;
            const product = payload?.product;
            const matchedUnit = payload?.matchedUnit;
            if (!product) return;

            handleSelectProduct(product, matchedUnit?.unitCode || raw);
        } catch (err: any) {
            const message = err?.response?.data?.error?.message;
            if (message) {
                setError(message);
            }
        } finally {
            setIsResolvingCode(false);
        }
    };

    // Fetch stock for selected product and branch
    const { data: stockRecords } = useQuery({
        queryKey: ['product-stock', selectedProduct?.id, branchId],
        queryFn: () => api.get('/inventory/stock', {
            params: {
                productId: selectedProduct.id,
                branchId,
                limit: 100
            }
        }).then((r: any) => r.data.data),
        enabled: !!selectedProduct && !!branchId,
    });

    // Fetch global stock for selected product across all branches
    const { data: globalStockRecords, isLoading: isLoadingGlobal } = useQuery({
        queryKey: ['product-stock-global', selectedProduct?.id],
        queryFn: () => api.get('/inventory/stock', {
            params: {
                productId: selectedProduct.id,
                limit: 100
            }
        }).then((r: any) => r.data.data),
        enabled: !!selectedProduct && showAllBranchesStock,
    });

    const totalBaseStock = calculateTotalBaseQty(Array.isArray(stockRecords) ? stockRecords : []);
    const currentStock = (() => {
        const u = selectedProduct?.units?.find((u: any) => u.unitCode === formData.unitCode);
        const factor = Number(u?.qtyInBaseUnit || 1);
        return totalBaseStock / factor;
    })();

    const selectedUnit = selectedProduct?.units?.find((u: any) => u.unitCode === formData.unitCode);
    const selectedUnitLabel = selectedUnit?.unitName || selectedUnit?.unitCode || formData.unitCode;
    const getUnitLabel = (unitCode?: string) =>
        selectedProduct?.units?.find((u: any) => String(u.unitCode) === String(unitCode))?.unitName || unitCode || '-';

    const effectiveQty = Number(formData.qty || 0);
    const effectiveUnitCost = Number(formData.unitCost || 0);
    const lineSubtotal = effectiveQty * effectiveUnitCost;
    const lineTaxAmount = lineSubtotal * Number(formData.taxRate || 0);
    const lineGrandTotal = lineSubtotal + lineTaxAmount;

    const handleAdd = (keepOpen: boolean) => {
        if (!selectedProduct || formData.qty < 0) return;

        if ((mode === 'TRANSFER' || mode === 'SALE') && branchId && formData.qty > currentStock) {
            setError(`Insufficient stock. Available: ${currentStock}`);
            return;
        }

        setError(null);
        const itemToAdd = {
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            itemCode: selectedProduct.itemCode,
            unitName: selectedUnit?.unitName || '',
            unitFraction: Number(selectedUnit?.qtyInBaseUnit || 1),
            stockOnHand: currentStock,
            ...formData,
            unitPrice: formData.unitCost, // Map to unitPrice for sales
            countedQty: formData.qty,
            lineTotal: (mode === 'PURCHASE' || mode === 'SALE') ? formData.qty * formData.unitCost : 0,
            product: selectedProduct
        };

        onAdd(itemToAdd);

        if (keepOpen) {
            setSelectedProduct(null);
            setSearch('');
            setFormData({ qty: 1, unitCode: '', unitCost: 0, taxRate: 0.15 });
            setTimeout(() => searchInputRef.current?.focus(), 50);
        } else {
            onClose();
        }
    };

    if (!isOpen) return null;

    const title = initialItem
        ? `Edit Item in ${mode.charAt(0) + mode.slice(1).toLowerCase()}`
        : mode === 'AUDIT'
            ? 'Scan for Audit'
            : `Add Item to ${mode.charAt(0) + mode.slice(1).toLowerCase()}`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px] p-4">
            <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6">
                    {!selectedProduct ? (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 ${isSearching || isResolvingCode ? 'animate-spin' : ''}`} size={18} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Search by name, code or barcode..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:bg-white outline-none transition-all text-sm"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setError(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void resolveProductByCode();
                                        }
                                    }}
                                />
                            </div>
                            {error && (
                                <div className="text-[11px] font-semibold text-red-600">{error}</div>
                            )}

                            {productResults && productResults.length > 0 && (
                                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                    {productResults.map((p: any) => (
                                        <div
                                            key={p.id}
                                            onClick={() => handleSelectProduct(p)}
                                            className="flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-all"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-900">{p.name}</span>
                                                <span className="text-[11px] text-gray-500 font-mono">{p.itemCode}</span>
                                                <div className="flex gap-1 mt-1 flex-wrap">
                                                    {p.units?.map((u: any) => (
                                                        <span key={u.id || u.unitCode} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                                            <span className="font-bold">{u.unitCode}</span>
                                                            {u.qtyInBaseUnit > 1 && <span className="text-[9px] opacity-80">x{u.qtyInBaseUnit}</span>}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <span className="text-[11px] font-semibold text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">
                                                {p.units?.[0]?.unitCode || 'PCS'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div>
                                    <div className="text-sm font-bold text-gray-900 leading-tight">{selectedProduct.name}</div>
                                    <div className="text-[11px] font-mono text-gray-500 mt-1">{selectedProduct.itemCode}</div>
                                    {selectedProduct.nameArabic && (
                                        <div dir="rtl" className="text-[11px] text-gray-600 mt-1">{selectedProduct.nameArabic}</div>
                                    )}
                                </div>
                                <button
                                    onClick={() => setSelectedProduct(null)}
                                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                                >
                                    Change
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">
                                        {mode === 'AUDIT' ? 'Counted Qty' : 'Quantity'}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className={`w-full px-3 py-2 border rounded-lg focus:ring-1 outline-none text-sm font-medium ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'}`}
                                        value={formData.qty}
                                        onChange={(e) => {
                                            setFormData({ ...formData, qty: Number(e.target.value) });
                                            setError(null);
                                        }}
                                        autoFocus
                                    />
                                    {error && <p className="text-[10px] text-red-500 font-semibold mt-1">{error}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">Unit</label>
                                    <AppDropdown
                                        value={formData.unitCode}
                                        onChange={handleUnitChange}
                                        options={[...selectedProduct.units?.map((u: any) => ({ value: u.unitCode, label: `${u.unitCode} (${u.unitName}) - x${u.qtyInBaseUnit || 1}` }))]}
                                        placeholder='Select'
                                        searchable
                                    />
                                </div>

                                {branchId && (
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">System Stock</label>
                                            <button
                                                onClick={() => setShowAllBranchesStock(true)}
                                                className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                                                title="View in all warehouses"
                                            >
                                                <Eye size={14} />
                                            </button>
                                        </div>
                                        <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-blue-600">
                                            {currentStock.toFixed(2)} {getUnitLabel(formData.unitCode)}
                                        </div>
                                    </div>
                                )}

                                {(mode === 'PURCHASE' || mode === 'SALE') && (
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">
                                            {mode === 'SALE' ? 'Sale Price' : 'Cost Price'}
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm font-medium"
                                            value={formData.unitCost}
                                            onChange={(e) => setFormData({ ...formData, unitCost: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Unit & Stock Breakdown</div>
                                    <div className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                        Total: {formatDecomposedQty(totalBaseStock, selectedProduct?.units || [])}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {selectedProduct?.units?.map((u: any) => (
                                        <div
                                            key={u.unitCode}
                                            onClick={() => handleUnitChange(u.unitCode)}
                                            className={`p-2.5 rounded-lg border transition-all cursor-pointer group hover:shadow-sm ${u.unitCode === formData.unitCode ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500/20' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className={`text-[10px] uppercase font-bold transition-colors ${u.unitCode === formData.unitCode ? 'text-blue-700' : 'text-gray-500 group-hover:text-blue-600'}`}>
                                                    {u.unitName}
                                                </div>
                                                <div className="text-[9px] text-gray-400 font-mono">x{u.qtyInBaseUnit}</div>
                                            </div>
                                            <div className="text-xs font-black text-gray-900 mt-1 font-mono">
                                                {(totalBaseStock / u.qtyInBaseUnit).toFixed(2)}
                                            </div>
                                            <div className="text-[9px] text-gray-400 mt-0.5 flex justify-between">
                                                <span>{u.unitCode}</span>
                                                {mode === 'SALE' ? (() => {
                                                    const effectiveP = getEffectivePrice(selectedProduct, u, priceGroupId);
                                                    const hasOverride = priceGroupId && effectiveP !== Number(u.salePrice || 0);
                                                    return (
                                                        <span className={`font-bold ${hasOverride ? 'text-emerald-600' : 'text-gray-500'}`}>
                                                            @{effectiveP.toFixed(2)}
                                                            {hasOverride && <span className="ml-0.5 text-[8px] bg-emerald-100 text-emerald-700 rounded px-0.5">CH</span>}
                                                        </span>
                                                    );
                                                })() : (
                                                    <span className="font-bold text-gray-500">@{Number(u.salePrice || 0).toFixed(2)}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {(mode === 'PURCHASE' || mode === 'SALE') && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Subtotal</div>
                                            <div className="text-base font-black text-gray-900 mt-1">{lineSubtotal.toFixed(2)}</div>
                                        </div>
                                        <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tax ({(Number(formData.taxRate || 0) * 100).toFixed(0)}%)</div>
                                            <div className="text-base font-black text-amber-600 mt-1">{lineTaxAmount.toFixed(2)}</div>
                                        </div>
                                        <div className="p-3 rounded-lg border border-gray-200 bg-blue-50">
                                            <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Total Amount</div>
                                            <div className="text-base font-black text-blue-700 mt-1">{lineGrandTotal.toFixed(2)}</div>
                                        </div>
                                    </div>

                                    <div className={`grid grid-cols-1 gap-3 ${mode === 'PURCHASE' ? 'md:grid-cols-2' : ''}`}>
                                        <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Unit Info</div>
                                            <div className="text-xs text-gray-700">
                                                <span className="font-semibold">{selectedUnit?.unitCode || formData.unitCode}</span>
                                                <span className="text-gray-400"> • </span>
                                                <span>{selectedUnit?.unitName || '-'}</span>
                                                <span className="text-gray-400"> • </span>
                                                <span>Factor x{selectedUnit?.qtyInBaseUnit || 1}</span>
                                            </div>
                                        </div>
                                        {mode === 'PURCHASE' && (
                                            <div className="p-3 rounded-lg border border-gray-200 bg-white">
                                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Stock Cost Context</div>
                                                <div className="text-xs text-gray-700">
                                                    Avg Cost in Stock: {
                                                        Number(
                                                            (purchaseInsights?.stockContext || [])
                                                                .find((s: any) => s.unitCode === formData.unitCode)?.avgCost || 0
                                                        ).toFixed(2)
                                                    }
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {mode === 'PURCHASE' && (
                                        <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Last Purchase Insight</div>
                                                {isLoadingInsights && <span className="text-[10px] text-gray-500">Loading...</span>}
                                            </div>
                                            {purchaseInsights?.lastPurchase ? (
                                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700">
                                                    <div>
                                                        <span className="text-gray-500">Last Cost:</span> <span className="font-bold">{Number(purchaseInsights.lastPurchase.unitCost || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Date:</span> <span className="font-bold">{purchaseInsights.lastPurchase.createdAt ? format(new Date(purchaseInsights.lastPurchase.createdAt), 'MMM dd, yyyy') : '-'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Supplier:</span> <span className="font-bold">{purchaseInsights.lastPurchase.supplier?.name || '-'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">PO:</span> <span className="font-bold">{purchaseInsights.lastPurchase.purchaseNo || '-'}</span>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <span className="text-gray-500">Recent Range:</span> <span className="font-bold">{Number(purchaseInsights?.costStats?.minRecentCost || 0).toFixed(2)} - {Number(purchaseInsights?.costStats?.maxRecentCost || 0).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mt-2 text-xs text-gray-500">No previous purchase found for this item/unit.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-wrap items-center justify-end gap-2 text-sm font-medium">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        Cancel
                    </button>

                    {selectedProduct && allowAddNext && (
                        <button
                            onClick={() => handleAdd(true)}
                            className="px-4 py-2 text-blue-600 border border-blue-200 bg-white rounded-lg hover:bg-blue-50 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                            <CornerDownRight size={14} />
                            Add & Next
                        </button>
                    )}
                    <button
                        disabled={!selectedProduct}
                        onClick={() => handleAdd(false)}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 shadow-sm"
                    >
                        {selectedProduct ? (confirmLabel || 'Confirm') : 'Select Product'}
                    </button>
                </div>
            </div>

            {showAllBranchesStock && (
                <div
                    className="absolute inset-0 z-[110] bg-gray-900/35 backdrop-blur-[1px] flex items-center justify-center p-4"
                    onClick={() => setShowAllBranchesStock(false)}
                >
                    <div
                        className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Stock in All Warehouses</h3>
                                <p className="text-[10px] text-gray-500 uppercase tracking-tight font-semibold mt-0.5">
                                    {selectedProduct?.name} ({selectedUnitLabel})
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAllBranchesStock(false)}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="max-h-[65vh] overflow-auto p-4">
                            {isLoadingGlobal ? (
                                <div className="h-44 flex items-center justify-center space-x-2 text-gray-400">
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs font-medium uppercase tracking-widest">Checking stock...</span>
                                </div>
                            ) : (
                                <table className="w-full text-left border-separate border-spacing-y-2">
                                    <thead>
                                        <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            <th className="px-3 pb-1">Warehouse / Branch</th>
                                            <th className="px-3 pb-1 text-right">Available Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {globalStockRecords?.map((s: any) => {
                                            const totalBase = calculateTotalBaseQty([s]);
                                            const u = selectedProduct?.units?.find((u: any) => u.unitCode === formData.unitCode) || selectedProduct?.units?.[0];
                                            const factor = Number(u?.qtyInBaseUnit || 1);

                                            return (
                                                <tr key={s.id} className="bg-white border-y border-gray-100 group">
                                                    <td className="px-3 py-3 rounded-l-lg border-y border-l border-gray-100">
                                                        <div className="text-xs font-bold text-gray-900">{s.branch?.name}</div>
                                                    </td>
                                                    <td className="px-3 py-3 rounded-r-lg border-y border-r border-gray-100 text-right">
                                                        <span className={`text-xs font-black ${totalBase > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                                                            {(totalBase / factor).toFixed(2)}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 ml-1 font-medium">{u?.unitName || u?.unitCode}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {(!globalStockRecords || globalStockRecords.length === 0) && (
                                            <tr>
                                                <td colSpan={2} className="px-3 py-8 text-center text-xs text-gray-400 font-medium italic">
                                                    No stock found in any warehouse
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="px-5 py-3 bg-gray-50/70 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setShowAllBranchesStock(false)}
                                className="px-5 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-black transition-all"
                            >
                                Close View
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
