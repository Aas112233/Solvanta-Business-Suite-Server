import React from 'react';
import { format } from 'date-fns';
import { Building2, User, Printer, Download, X, FileText } from 'lucide-react';
import { DEFAULT_CURRENCY } from '../../lib/constants';
import Modal from '../ui/Modal';

export interface DocumentPreviewColumn {
    key: string;
    label: string;
    align?: 'left' | 'center' | 'right';
    render?: (item: any) => React.ReactNode;
}

export interface DocumentPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    documentNo: string;
    document: any;
    currency?: string;
    customerDisplay?: {
        title: string;
        detail?: string;
        isWalkInLoyalty?: boolean;
    };
    metaDetails: { label: string; value: React.ReactNode }[];
    columns: DocumentPreviewColumn[];
    items: any[];
    subtotal?: number;
    taxTotal?: number;
    grandTotal: number;
    discountDetails?: { label: string; amount: number }[];
    onPrint?: (doc: any) => void;
    onDownload?: (doc: any) => void;
    footerActions?: React.ReactNode;
    icon?: React.ReactNode;
}

export default function DocumentPreviewModal({
    isOpen,
    onClose,
    title,
    documentNo,
    document,
    currency = DEFAULT_CURRENCY,
    customerDisplay,
    metaDetails,
    columns,
    items,
    subtotal,
    taxTotal,
    grandTotal,
    discountDetails,
    onPrint,
    onDownload,
    footerActions,
    icon = <FileText size={20} />
}: DocumentPreviewModalProps) {
    if (!document) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md">
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 leading-none">{title}</h3>
                        <p className="text-gray-400 font-mono text-xs mt-1">#{documentNo}</p>
                    </div>
                </div>
            }
            maxWidth="4xl"
        >
            <div className="flex flex-col h-[80vh] md:h-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50/50 border-b border-gray-100 flex-shrink-0">
                    {/* Entity Info */}
                    {customerDisplay && (
                        <div className="space-y-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Entity Info</h4>
                            <div className="space-y-2">
                                <p className="text-lg font-black text-gray-900">{customerDisplay.title || 'Walk-in'}</p>
                                <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                                    <User size={14} />
                                    {customerDisplay.detail || 'No Contact Details'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Document Info */}
                    <div className={`space-y-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm ${!customerDisplay ? 'md:col-span-2' : ''}`}>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Document Info</h4>
                        <div className="grid grid-cols-2 gap-4">
                            {metaDetails.map((meta, idx) => (
                                <div key={idx}>
                                    <p className="text-[10px] font-black text-gray-400 uppercase">{meta.label}</p>
                                    <div className="text-sm font-bold text-gray-900">{meta.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-white">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white shadow-sm z-10">
                            <tr className="text-gray-400 font-black uppercase text-[10px] tracking-widest border-b border-gray-100">
                                {columns.map((col, idx) => (
                                    <th key={idx} className={`pb-3 pt-2 text-${col.align || 'left'}`}>{col.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {items?.map((item: any, idx: number) => (
                                <tr key={idx} className="group hover:bg-gray-50/50">
                                    {columns.map((col, cIdx) => (
                                        <td key={cIdx} className={`py-3 text-${col.align || 'left'}`}>
                                            {col.render ? col.render(item) : item[col.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {(!items || items.length === 0) && (
                                <tr>
                                    <td colSpan={columns.length} className="py-8 text-center text-gray-400 italic">
                                        No items available.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
                    <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                        {onPrint && (
                            <button
                                onClick={() => onPrint(document)}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-black text-gray-600 hover:bg-gray-100 transition-all shadow-sm"
                            >
                                <Printer size={16} /> Print
                            </button>
                        )}
                        {onDownload && (
                            <button
                                onClick={() => onDownload(document)}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-black text-gray-600 hover:bg-gray-100 transition-all shadow-sm"
                            >
                                <Download size={16} /> Download
                            </button>
                        )}
                        {footerActions}
                    </div>
                    <div className="text-right w-full sm:w-auto space-y-1">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Document Total</p>
                        <p className="text-3xl font-black text-blue-600">
                            {Number(grandTotal || 0).toLocaleString()} <span className="text-base">{currency}</span>
                        </p>
                        {discountDetails?.map((d, i) => d.amount > 0 && (
                            <p key={i} className="text-xs font-bold text-orange-600">
                                {d.label}: -{Number(d.amount).toFixed(2)} {currency}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
