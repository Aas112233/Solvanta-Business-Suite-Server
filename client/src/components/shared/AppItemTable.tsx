import React from 'react';
import { Trash, Pencil, ShieldAlert } from 'lucide-react';

export type AppItemTableColumn =
    | 'product'
    | 'qty'
    | 'systemQty'
    | 'countedQty'
    | 'unitPrice'
    | 'unitCost'
    | 'salePrice'
    | 'tax'
    | 'discount'
    | 'lineTotal'
    | 'saleVal'
    | 'variance'
    | 'actions';

export interface AppItemTableProps {
    items: any[];
    columns: AppItemTableColumn[];
    onUpdateItem?: (index: number, field: string, value: any) => void;
    onRemoveItem?: (index: number) => void;
    onEditItem?: (index: number) => void;
    readOnly?: boolean;
}

export default function AppItemTable({
    items,
    columns,
    onUpdateItem,
    onRemoveItem,
    onEditItem,
    readOnly = false
}: AppItemTableProps) {

    // Helper to format currency
    const formatMoney = (val: number | undefined | null) => {
        if (typeof val !== 'number') return '0.00';
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const renderHeaderCell = (col: AppItemTableColumn) => {
        switch (col) {
            case 'product': return <th key={col} className="px-4 py-3 w-[280px]">Product / Item</th>;
            case 'qty': return <th key={col} className="px-4 py-3 w-32 text-right">Quantity</th>;
            case 'systemQty': return <th key={col} className="px-4 py-3 w-28 text-right">System Qty</th>;
            case 'countedQty': return <th key={col} className="px-4 py-3 w-32 text-right">Counted Qty</th>;
            case 'unitPrice': return <th key={col} className="px-4 py-3 w-32 text-right">Unit Price</th>;
            case 'unitCost': return <th key={col} className="px-4 py-3 w-32 text-right">Unit Cost</th>;
            case 'salePrice': return <th key={col} className="px-4 py-3 w-32 text-right">Sale Price</th>;
            case 'tax': return <th key={col} className="px-4 py-3 w-24 text-right">Tax</th>;
            case 'discount': return <th key={col} className="px-4 py-3 w-28 text-right">Discount</th>;
            case 'lineTotal': return <th key={col} className="px-4 py-3 w-32 text-right">Total</th>;
            case 'saleVal': return <th key={col} className="px-4 py-3 w-32 text-right">Sale Val</th>;
            case 'variance': return <th key={col} className="px-4 py-3 w-28 text-right">Variance</th>;
            case 'actions': return <th key={col} className="px-4 py-3 w-16 text-center"></th>;
            default: return null;
        }
    };

    const renderBodyCell = (col: AppItemTableColumn, item: any, index: number) => {
        const productName = item.productName || item.name || 'Unknown Item';
        const itemCode = item.itemCode || item.product?.itemCode || '-';
        const unitName = item.unitName || item.unitCode || '-';
        const unitCode = item.unitCode || 'PCS';

        // Handlers for inline editing
        const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onUpdateItem && !readOnly) {
                const val = Number(e.target.value) || 0;
                onUpdateItem(index, 'qty', val);
            }
        };

        const handleCountedQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onUpdateItem && !readOnly) {
                const val = Number(e.target.value) || 0;
                onUpdateItem(index, 'countedQty', val);
            }
        };

        const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onUpdateItem && !readOnly) {
                const val = Number(e.target.value) || 0;
                onUpdateItem(index, 'unitPrice', val);
            }
        };

        const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onUpdateItem && !readOnly) {
                const val = Number(e.target.value) || 0;
                onUpdateItem(index, 'discount', val);
            }
        };

        switch (col) {
            case 'product':
                return (
                    <td key={col} className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate max-w-[260px]" title={productName}>{productName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                            <span className="font-mono text-gray-400">{itemCode}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                            <span className="truncate max-w-[100px]">{unitName}</span>
                            <span className="uppercase font-bold bg-gray-100 px-1 py-0.5 rounded">{unitCode}</span>
                        </div>
                    </td>
                );
            case 'qty':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        {readOnly ? (
                            <span className="text-gray-900 font-medium">{item.qty}</span>
                        ) : (
                            <input
                                type="number"
                                min="0"
                                value={item.qty ?? ''}
                                onChange={handleQtyChange}
                                className="w-20 px-2 py-1.5 text-right bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                            />
                        )}
                    </td>
                );
            case 'systemQty':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        <span className="text-gray-500 font-medium">{item.systemQty || 0}</span>
                    </td>
                );
            case 'countedQty':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        {readOnly ? (
                            <span className="text-gray-900 font-bold">{item.countedQty || 0}</span>
                        ) : (
                            <input
                                type="number"
                                min="0"
                                value={item.countedQty ?? ''}
                                onChange={handleCountedQtyChange}
                                className="w-20 px-2 py-1.5 text-right bg-white border border-gray-200 rounded-lg focus:border-blue-500 font-black outline-none shadow-sm text-sm"
                            />
                        )}
                    </td>
                );
            case 'unitPrice':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        {readOnly ? (
                            <span className="text-gray-700">{formatMoney(item.unitPrice)}</span>
                        ) : (
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.unitPrice ?? ''}
                                onChange={handlePriceChange}
                                className="w-24 px-2 py-1.5 text-right bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all text-gray-700"
                            />
                        )}
                    </td>
                );
            case 'unitCost':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        <span className="text-gray-700 font-mono">{formatMoney(item.unitCost || item.avgCost)}</span>
                    </td>
                );
            case 'salePrice':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        <span className="font-bold text-blue-600 font-mono">{formatMoney(item.salePrice)}</span>
                    </td>
                );
            case 'tax':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        <div className="text-xs text-gray-700">{(Number(item.taxRate || 0) * 100).toFixed(0)}%</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{formatMoney(item.taxAmount)}</div>
                    </td>
                );
            case 'discount':
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        {readOnly ? (
                            <span className="text-gray-700">{formatMoney(item.discount)}</span>
                        ) : (
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.discount ?? ''}
                                onChange={handleDiscountChange}
                                className="w-20 px-2 py-1.5 text-right bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all text-red-600 font-medium"
                            />
                        )}
                    </td>
                );
            case 'lineTotal':
                return (
                    <td key={col} className="px-4 py-3 text-right font-black text-gray-900 font-mono">
                        {formatMoney(item.lineTotal)}
                    </td>
                );
            case 'saleVal':
                const saleVal = (item.countedQty || 0) * (item.salePrice || 0);
                return (
                    <td key={col} className="px-4 py-3 text-right">
                        <span className="font-black text-emerald-600 font-mono">{formatMoney(saleVal)}</span>
                    </td>
                );
            case 'variance':
                const sysQty = item.systemQty || 0;
                const countQty = item.countedQty || 0;
                const varianceQty = countQty - sysQty;
                const variancePercent = sysQty !== 0 ? (varianceQty / sysQty) * 100 : 0;
                const isMatch = varianceQty === 0;
                const isPositive = varianceQty > 0;

                return (
                    <td key={col} className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                            <div className={`text-sm font-black font-mono leading-none ${isMatch ? 'text-gray-300' : isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isPositive ? '+' : ''}{varianceQty}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                                <div className={`text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded ${isMatch ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                    {isMatch ? 'Match' : 'Deviated'}
                                </div>
                                {!isMatch && (
                                    <div className="text-[9px] text-gray-400 font-bold font-mono">
                                        {variancePercent.toFixed(1)}%
                                    </div>
                                )}
                            </div>
                        </div>
                    </td>
                );
            case 'actions':
                return (
                    <td key={col} className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                            {!readOnly && onEditItem && (
                                <button type="button" onClick={() => onEditItem(index)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                                    <Pencil size={14} />
                                </button>
                            )}
                            {!readOnly && onRemoveItem && (
                                <button type="button" onClick={() => onRemoveItem(index)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash size={14} />
                                </button>
                            )}
                        </div>
                    </td>
                );
            default:
                return null;
        }
    };

    return (
        <div className="border border-gray-200 rounded-xl overflow-x-auto shadow-sm bg-white">
            <table className="w-full text-left text-sm table-fixed">
                <thead className="bg-gray-50/80 font-bold text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    <tr>
                        {columns.map(renderHeaderCell)}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {items.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="px-4 py-12 text-center">
                                <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                                    <ShieldAlert size={32} className="opacity-20" />
                                    <span className="italic text-sm">No items added yet. Search or click 'Add Item'.</span>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        items.map((item, idx) => (
                            <tr key={item.id || item.productId || idx} className="hover:bg-gray-50/50 transition-colors group">
                                {columns.map((col) => renderBodyCell(col, item, idx))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
