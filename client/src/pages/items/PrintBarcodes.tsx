import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Trash2, Printer, Settings2, Download, Check } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import ItemSelectorModal from '../../components/inventory/ItemSelectorModal';
import { useAuthStore } from '../../stores/authStore';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import AppDropdown from '../../components/ui/AppDropdown';

function BarcodeSVG({ value, format = 'CODE128', width = 1.5, height = 40, displayValue = true }: { value: string, format?: string, width?: number, height?: number, displayValue?: boolean }) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (svgRef.current && value) {
            try {
                JsBarcode(svgRef.current, value, {
                    format,
                    width,
                    height,
                    displayValue,
                    margin: 2,
                    fontSize: 12,
                });
            } catch (err) {
                console.error('Barcode generation error', err);
            }
        }
    }, [value, format, width, height, displayValue]);

    return <svg ref={svgRef} className="max-w-full" />;
}

export default function PrintBarcodes() {
    const { user } = useAuthStore();
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [globalQty, setGlobalQty] = useState<number | ''>('');

    // Bulk Import State
    const [bulkType, setBulkType] = useState<'category' | 'itemGroup' | 'brand' | ''>('');
    const [bulkId, setBulkId] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/products/meta/categories').then(r => r.data.data) });
    const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/products/meta/groups').then(r => r.data.data) });
    const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => api.get('/products/meta/brands').then(r => r.data.data) });

    // Items selected for printing
    const [itemsToPrint, setItemsToPrint] = useState<Array<{
        id: string; // unique internal id
        productId: string;
        name: string;
        code: string;
        price: number;
        qtyToPrint: number;
        unit: string;
    }>>([]);

    // Configuration for label
    const [config, setConfig] = useState({
        labelWidth: 50, // mm
        labelHeight: 25, // mm
        showName: true,
        showPrice: true,
        showCodeText: true,
        currencySymbol: 'SAR',
        barcodeFormat: 'CODE128',

        // Advanced layout
        layoutMode: 'roll' as 'roll' | 'sheet',
        sheetColumns: 3,
        sheetRows: 8,
        sheetMarginTop: 10,
        sheetMarginLeft: 10,
        gapX: 2,
        gapY: 2,
    });

    const handleAddItem = (item: any) => {
        const barcodeValue = item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.barcode || item.itemCode || item.productId;
        setItemsToPrint(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            productId: item.productId,
            name: item.productName,
            code: barcodeValue,
            price: item.unitCost || item.unitPrice || 0,
            qtyToPrint: item.qty || 1,
            unit: item.unitCode || 'PCS'
        }]);
    };

    const handleBulkImport = async () => {
        if (!bulkType || !bulkId) return;
        setIsImporting(true);
        try {
            const res = await api.get('/products', { params: { [`${bulkType}Id`]: bulkId, limit: 1000 } });
            const products = res.data.data || [];
            if (products.length > 0) {
                const newItems = products.map((p: any) => {
                    const baseUnit = p.units?.find((u: any) => u.isBase) || p.units?.[0];
                    const barcodeValue = baseUnit?.barcode || p.itemCode || p.id;
                    const price = baseUnit?.salePrice || 0;
                    return {
                        id: Math.random().toString(36).substr(2, 9),
                        productId: p.id,
                        name: p.name,
                        code: barcodeValue,
                        price: price,
                        qtyToPrint: 1,
                        unit: baseUnit?.unitCode || 'PCS'
                    };
                });
                setItemsToPrint(prev => [...prev, ...newItems]);
            } else {
                alert('No products found in this selection.');
            }
        } catch (error) {
            console.error('Bulk import failed', error);
            alert('Failed to import products.');
        } finally {
            setIsImporting(false);
            setBulkType('');
            setBulkId('');
        }
    };

    const applyGlobalQty = () => {
        if (typeof globalQty === 'number' && globalQty > 0) {
            setItemsToPrint(prev => prev.map(i => ({ ...i, qtyToPrint: globalQty })));
        }
    };

    const updateItemQty = (id: string, qty: number) => {
        setItemsToPrint(prev => prev.map(i => i.id === id ? { ...i, qtyToPrint: Math.max(1, qty) } : i));
    };

    const removeItem = (id: string) => {
        setItemsToPrint(prev => prev.filter(i => i.id !== id));
    };

    const clearAll = () => {
        if (window.confirm('Are you sure you want to clear all items?')) {
            setItemsToPrint([]);
        }
    }

    const handlePrint = () => {
        window.print();
    };

    // Prepare labels to render flat (unrolled by qty)
    const labelsToRender = itemsToPrint.flatMap(item =>
        Array.from({ length: item.qtyToPrint }).map((_, idx) => ({
            ...item,
            uniqueKey: `${item.id}-${idx}`
        }))
    );

    return (
        <div className="flex flex-col h-full bg-background-app">
            <ItemSelectorModal
                isOpen={isSelectorOpen}
                onClose={() => setIsSelectorOpen(false)}
                onAdd={handleAddItem}
                mode="AUDIT"
                allowAddNext={true}
                confirmLabel="Add to Print List"
            />

            {/* Header (Hidden when printing) */}
            <div className="flex items-center justify-between mb-4 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Print Barcodes</h1>
                    <p className="text-sm text-text-tertiary">Generate and print custom barcode labels for items</p>
                </div>
                <button
                    onClick={handlePrint}
                    disabled={itemsToPrint.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-brand text-white rounded-lg font-medium shadow-md shadow-brand-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    <Printer size={18} />
                    Print {labelsToRender.length} Labels
                </button>
            </div>

            {/* Main Content (Hidden when printing) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 print:hidden pb-10">
                {/* Left Column: Items and Import */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Bulk Import Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-border p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Download size={18} className="text-brand-500" />
                            <h2 className="text-lg font-bold text-text-primary">Bulk Import</h2>
                        </div>
                        <div className="flex items-end gap-3">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-text-secondary mb-1">Filter Type</label>
                                <AppDropdown
                                    value={bulkType}
                                    onChange={(v) => setBulkType(v as '' | 'category' | 'itemGroup' | 'brand')}
                                    options={[{ value: '', label: 'Select Type...' }, { value: 'category', label: 'Category' }, { value: 'itemGroup', label: 'Item Group' }, { value: 'brand', label: 'Brand' }]}
                                    placeholder='Select Type...'
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-text-secondary mb-1">Select Group/Category</label>
                                <AppDropdown
                                    value={bulkId}
                                    onChange={(v) => setBulkId(v)}
                                    options={[
                                        { value: '', label: 'Select...' },
                                        ...(bulkType === 'category' ? (categories || []).map((c: any) => ({ value: c.id, label: c.name })) : []),
                                        ...(bulkType === 'itemGroup' ? (groups || []).map((g: any) => ({ value: g.id, label: g.name })) : []),
                                        ...(bulkType === 'brand' ? (brands || []).map((b: any) => ({ value: b.id, label: b.name })) : []),
                                    ]}
                                    placeholder='Select...'
                                    searchable
                                />
                            </div>
                            <button
                                onClick={handleBulkImport}
                                disabled={!bulkType || !bulkId || isImporting}
                                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                            >
                                {isImporting ? 'Importing...' : 'Load Items'}
                            </button>
                        </div>
                    </div>

                    {/* Items List Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-border p-5">
                        <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                            <h2 className="text-lg font-bold text-text-primary">Selected Items ({itemsToPrint.length})</h2>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center border border-border rounded-lg overflow-hidden h-8">
                                    <input
                                        type="number"
                                        placeholder="Set all to..."
                                        value={globalQty}
                                        onChange={e => setGlobalQty(e.target.value ? parseInt(e.target.value) : '')}
                                        className="w-24 px-2 py-1 text-sm outline-none"
                                    />
                                    <button onClick={applyGlobalQty} className="bg-slate-100 px-2 h-full hover:bg-slate-200 text-text-secondary border-l border-border transition-colors">
                                        <Check size={16} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => setIsSelectorOpen(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Plus size={16} />
                                    Add Manual
                                </button>
                                {itemsToPrint.length > 0 && (
                                    <button onClick={clearAll} className="flex items-center gap-2 px-3 py-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors">
                                        Clear All
                                    </button>
                                )}
                            </div>
                        </div>

                        {itemsToPrint.length === 0 ? (
                            <div className="py-10 text-center border-2 border-dashed border-border rounded-xl">
                                <Search className="mx-auto text-slate-300 mb-2" size={32} />
                                <p className="text-text-secondary font-medium">No items added</p>
                                <p className="text-xs text-text-tertiary mt-1">Click 'Add Manual' or use Bulk Import.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left border-separate border-spacing-y-2">
                                    <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-border">
                                        <tr className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
                                            <th className="px-3 pb-2 pt-2">Item Name</th>
                                            <th className="px-3 pb-2 pt-2">Code / Barcode</th>
                                            <th className="px-3 pb-2 pt-2 w-24">Price</th>
                                            <th className="px-3 pb-2 pt-2 w-28">Labels</th>
                                            <th className="px-3 pb-2 pt-2 w-12 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itemsToPrint.map((item) => (
                                            <tr key={item.id} className="bg-slate-50">
                                                <td className="px-3 py-2 rounded-l-lg border-y border-l border-border-subtle">
                                                    <div className="text-sm font-bold text-text-primary">{item.name}</div>
                                                    <div className="text-xs text-text-tertiary">{item.unit}</div>
                                                </td>
                                                <td className="px-3 py-2 border-y border-border-subtle font-mono text-sm max-w-[120px] truncate" title={item.code}>
                                                    {item.code}
                                                </td>
                                                <td className="px-3 py-2 border-y border-border-subtle">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1.5 text-xs text-text-tertiary">{config.currencySymbol}</span>
                                                        <input
                                                            type="number"
                                                            value={item.price}
                                                            onChange={e => setItemsToPrint(prev => prev.map(i => i.id === item.id ? { ...i, price: Number(e.target.value) } : i))}
                                                            className="w-full pl-8 pr-2 py-1 bg-white border border-border rounded text-sm outline-none focus:ring-1 focus:ring-brand-500"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 border-y border-border-subtle">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.qtyToPrint}
                                                        onChange={(e) => updateItemQty(item.id, parseInt(e.target.value) || 1)}
                                                        className="w-full px-2 py-1 bg-white border border-border rounded text-sm outline-none focus:ring-1 focus:ring-brand-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 rounded-r-lg border-y border-r border-border-subtle text-right">
                                                    <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Settings & Live Preview */}
                <div className="flex flex-col gap-6">
                    {/* Settings Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-border p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings2 size={18} className="text-brand-500" />
                            <h2 className="text-lg font-bold text-text-primary">Layout Setup</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-4 mb-2">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="layoutMode"
                                        checked={config.layoutMode === 'roll'}
                                        onChange={() => setConfig({ ...config, layoutMode: 'roll' })}
                                        className="text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm font-medium">Continuous Roll</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="layoutMode"
                                        checked={config.layoutMode === 'sheet'}
                                        onChange={() => setConfig({ ...config, layoutMode: 'sheet' })}
                                        className="text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm font-medium">A4 / Sheet Grid</span>
                                </label>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary mb-1">Label Width (mm)</label>
                                    <input
                                        type="number"
                                        value={config.labelWidth}
                                        onChange={e => setConfig({ ...config, labelWidth: Number(e.target.value) })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary mb-1">Label Height (mm)</label>
                                    <input
                                        type="number"
                                        value={config.labelHeight}
                                        onChange={e => setConfig({ ...config, labelHeight: Number(e.target.value) })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                    />
                                </div>
                            </div>

                            {config.layoutMode === 'sheet' && (
                                <div className="grid grid-cols-2 gap-3 bg-brand-50 p-3 rounded-lg border border-brand-100">
                                    <div>
                                        <label className="block text-xs font-semibold text-brand-800 mb-1">Columns</label>
                                        <input
                                            type="number"
                                            value={config.sheetColumns}
                                            onChange={e => setConfig({ ...config, sheetColumns: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-brand-800 mb-1">Rows per page</label>
                                        <input
                                            type="number"
                                            value={config.sheetRows}
                                            onChange={e => setConfig({ ...config, sheetRows: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-brand-800 mb-1">Gap X (mm)</label>
                                        <input
                                            type="number"
                                            value={config.gapX}
                                            onChange={e => setConfig({ ...config, gapX: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-brand-800 mb-1">Page Top Margin</label>
                                        <input
                                            type="number"
                                            value={config.sheetMarginTop}
                                            onChange={e => setConfig({ ...config, sheetMarginTop: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-brand-800 mb-1">Gap Y (mm)</label>
                                        <input
                                            type="number"
                                            value={config.gapY}
                                            onChange={e => setConfig({ ...config, gapY: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-brand-800 mb-1">Page Left Margin</label>
                                        <input
                                            type="number"
                                            value={config.sheetMarginLeft}
                                            onChange={e => setConfig({ ...config, sheetMarginLeft: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 pt-2 border-t border-border-subtle">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={config.showName}
                                        onChange={e => setConfig({ ...config, showName: e.target.checked })}
                                        className="w-4 h-4 rounded border-border text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm font-medium text-text-secondary">Show Item Name</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={config.showPrice}
                                        onChange={e => setConfig({ ...config, showPrice: e.target.checked })}
                                        className="w-4 h-4 rounded border-border text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm font-medium text-text-secondary">Show Price</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={config.showCodeText}
                                        onChange={e => setConfig({ ...config, showCodeText: e.target.checked })}
                                        className="w-4 h-4 rounded border-border text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm font-medium text-text-secondary">Show Code Text in Barcode</span>
                                </label>
                            </div>

                            <div className="pt-2 border-t border-border-subtle">
                                <label className="block text-xs font-semibold text-text-secondary mb-1">Currency Symbol</label>
                                <input
                                    type="text"
                                    value={config.currencySymbol}
                                    onChange={e => setConfig({ ...config, currencySymbol: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-border rounded-lg text-sm outline-none focus:border-brand-500"
                                    placeholder="e.g. $, SAR, AED"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Live Preview Container (Visual only, not printed) */}
                    <div className="bg-slate-100 rounded-xl border border-border p-5 flex flex-col items-center justify-center min-h-[350px] overflow-hidden relative">
                        <div className="w-full flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
                                Preview ({config.layoutMode === 'sheet' ? 'A4 Sheet' : 'Roll'})
                            </h3>
                            <span className="text-xs text-text-tertiary bg-white px-2 py-1 rounded shadow-sm">Scaled down</span>
                        </div>

                        {labelsToRender.length > 0 ? (
                            <div className="w-full h-full relative flex justify-center bg-slate-200/50 rounded rounded-xl p-4 overflow-auto max-h-[600px] custom-scrollbar">
                                <div
                                    className="bg-white shadow-md border border-slate-300"
                                    style={{
                                        display: config.layoutMode === 'sheet' ? 'grid' : 'flex',
                                        gridTemplateColumns: config.layoutMode === 'sheet' ? `repeat(${config.sheetColumns}, ${config.labelWidth}mm)` : undefined,
                                        gridTemplateRows: config.layoutMode === 'sheet' && config.sheetRows ? `repeat(${config.sheetRows}, ${config.labelHeight}mm)` : undefined,
                                        gap: `${config.gapY}mm ${config.gapX}mm`,
                                        flexWrap: config.layoutMode === 'roll' ? 'wrap' : undefined,
                                        alignContent: 'start',
                                        justifyContent: config.layoutMode === 'sheet' ? 'start' : 'center',
                                        paddingTop: config.layoutMode === 'sheet' ? `${config.sheetMarginTop}mm` : '5mm',
                                        paddingLeft: config.layoutMode === 'sheet' ? `${config.sheetMarginLeft}mm` : '0',
                                        paddingBottom: config.layoutMode === 'roll' ? '5mm' : '0',
                                        width: config.layoutMode === 'sheet' ? '210mm' : 'auto',         // A4 width approx 210mm
                                        minHeight: config.layoutMode === 'sheet' ? '297mm' : 'auto',     // A4 height
                                        maxWidth: config.layoutMode === 'roll' ? '120mm' : undefined,
                                        boxSizing: 'border-box',
                                        transformOrigin: 'top center',
                                        zoom: config.layoutMode === 'sheet' ? '0.45' : '0.8',
                                    }}
                                >
                                    {labelsToRender.map((item, idx) => (
                                        <div
                                            key={`${item.uniqueKey}-preview`}
                                            style={{
                                                width: `${config.labelWidth}mm`,
                                                height: `${config.labelHeight}mm`,
                                                padding: '2mm',
                                                boxSizing: 'border-box',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden',
                                                backgroundColor: 'white',
                                                border: config.layoutMode === 'sheet' ? '1px dashed #e2e8f0' : '1px solid #e2e8f0',
                                                borderRadius: config.layoutMode === 'roll' ? '4px' : '0'
                                            }}
                                        >
                                            {config.showName && (
                                                <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: '1.2', textAlign: 'center', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.name.substring(0, 25)}
                                                </div>
                                            )}
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, width: '100%' }}>
                                                <BarcodeSVG
                                                    value={item.code}
                                                    format={config.barcodeFormat}
                                                    displayValue={config.showCodeText}
                                                    height={25}
                                                    width={1.2}
                                                />
                                            </div>
                                            {config.showPrice && item.price > 0 && (
                                                <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: '1', textAlign: 'center', marginTop: '1mm' }}>
                                                    {config.currencySymbol} {Number(item.price).toFixed(2)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-text-tertiary my-auto">Add an item to see preview</div>
                        )}
                        <p className="mt-4 text-[10px] text-text-tertiary text-center max-w-[200px]">Preview size relies on screen DPI. Result may vary slightly when printed.</p>
                    </div>
                </div>
            </div>

            {/* Print Only Container */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { 
                        margin: ${config.layoutMode === 'sheet' ? `${config.sheetMarginTop}mm ${config.sheetMarginLeft}mm 0 0` : '0'}; 
                        ${config.layoutMode === 'sheet' ? 'size: A4 portrait;' : 'size: auto;'}
                    }
                    body { background: white; margin: 0; padding: 0; }
                    /* Hide everything inside the root app layout to avoid structural scrolling issues */
                    #root { display: none !important; }
                    
                    #print-layer { 
                        display: ${config.layoutMode === 'sheet' ? 'grid' : 'flex'} !important; 
                        position: absolute; left: 0; top: 0; width: 100%;
                        background: white;
                        z-index: 999999;
                        ${config.layoutMode === 'sheet' ? `grid-template-columns: repeat(${config.sheetColumns}, ${config.labelWidth}mm);` : 'flex-wrap: wrap;'}
                        ${config.layoutMode === 'sheet' && config.sheetRows ? `grid-template-rows: repeat(${config.sheetRows}, ${config.labelHeight}mm);` : ''}
                        gap: ${config.gapY}mm ${config.gapX}mm;
                        align-content: start;
                        justify-content: start;
                    }
                    
                    .print-label {
                        page-break-inside: avoid;
                        break-inside: avoid;
                    }
                }
            `}} />

            {typeof document !== 'undefined' && document.body && createPortal(
                <div id="print-layer" className="hidden print:block text-black">
                    {labelsToRender.map((item, index) => (
                        <div
                            key={item.uniqueKey}
                            className="print-label"
                            style={{
                                width: `${config.labelWidth}mm`,
                                height: `${config.labelHeight}mm`,
                                padding: '2mm',
                                boxSizing: 'border-box',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                backgroundColor: 'white',
                            }}
                        >
                            {config.showName && (
                                <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: '1.2', textAlign: 'center', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.name.substring(0, 25)}
                                </div>
                            )}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, width: '100%' }}>
                                <BarcodeSVG
                                    value={item.code}
                                    format={config.barcodeFormat}
                                    displayValue={config.showCodeText}
                                    height={25}
                                    width={1.2}
                                />
                            </div>
                            {config.showPrice && item.price > 0 && (
                                <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: '1', textAlign: 'center', marginTop: '1mm' }}>
                                    {config.currencySymbol} {Number(item.price).toFixed(2)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>,
                document.body
            )}

        </div>
    );
}
