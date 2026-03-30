import { AlertTriangle, Loader2 } from 'lucide-react';

type PurchaseReturnLike = {
    returnNo?: string;
    status?: string;
    grandTotal?: number;
    _count?: { items?: number };
    items?: Array<{ qty?: number }>;
    purchaseInvoice?: { purchaseNo?: string };
    supplier?: { name?: string };
};

interface PurchaseReturnDeleteDialogProps {
    isOpen: boolean;
    returnData?: PurchaseReturnLike | null;
    isLoading?: boolean;
    isSubmitting?: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export default function PurchaseReturnDeleteDialog({
    isOpen,
    returnData,
    isLoading = false,
    isSubmitting = false,
    onClose,
    onConfirm,
}: PurchaseReturnDeleteDialogProps) {
    if (!isOpen) return null;

    const lineCount = Number(returnData?._count?.items || returnData?.items?.length || 0);
    const qtyToRestore = (returnData?.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const hasQtyBreakdown = Boolean(returnData?.items?.length);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Delete Purchase Return?</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                This will cancel <span className="font-semibold text-gray-900">{returnData?.returnNo || 'this return'}</span> and reverse its stock impact.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-5 space-y-3">
                    {isLoading ? (
                        <div className="py-5 text-sm text-gray-500 flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Loading impact details...
                        </div>
                    ) : (
                        <>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Impact Preview</p>
                                <div className="mt-2 space-y-1.5 text-sm text-gray-700">
                                    <p><span className="font-medium text-gray-900">Status:</span> {returnData?.status || 'POSTED'} to CANCELLED</p>
                                    <p><span className="font-medium text-gray-900">Inventory:</span> Returned products will be added back to stock.</p>
                                    <p>
                                        <span className="font-medium text-gray-900">Lines affected:</span> {lineCount || 'All'}
                                        {hasQtyBreakdown ? ` (${qtyToRestore.toFixed(2)} total qty restored)` : ''}
                                    </p>
                                    <p><span className="font-medium text-gray-900">Return amount:</span> {Number(returnData?.grandTotal || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
                                </div>
                            </div>

                            <div className="text-xs text-gray-500">
                                {returnData?.purchaseInvoice?.purchaseNo ? `Invoice: ${returnData.purchaseInvoice.purchaseNo}` : ''}
                                {returnData?.supplier?.name ? `  |  Supplier: ${returnData.supplier.name}` : ''}
                            </div>
                        </>
                    )}
                </div>

                <div className="p-5 pt-0 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Keep Return
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 disabled:opacity-60 inline-flex items-center gap-2"
                    >
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                        {isSubmitting ? 'Deleting...' : 'Delete Return'}
                    </button>
                </div>
            </div>
        </div>
    );
}
