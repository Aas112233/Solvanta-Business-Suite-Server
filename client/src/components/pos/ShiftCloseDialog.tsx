import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle, DollarSign, Loader2, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { printHtmlDocument } from '../../lib/fileExport';
import type { PosReceiptSettings } from '../../lib/posReceiptTemplates';
import { buildShiftCloseReceiptDocument } from '../../lib/posShiftCloseReceipt';

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.25];

type Props = {
    shiftId: string;
    terminalCode: string;
    openingCash: number;
    currentUserEmail?: string;
    onClose: () => void;
    onClosed: (closedShift?: any) => void;
};

export default function ShiftCloseDialog({ shiftId, terminalCode, openingCash, currentUserEmail = '', onClose, onClosed }: Props) {
    const qc = useQueryClient();
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const [counts, setCounts] = useState<Record<string, number>>(() => {
        const init: Record<string, number> = {};
        DENOMINATIONS.forEach((d) => (init[String(d)] = 0));
        return init;
    });
    const [notes, setNotes] = useState('');
    const [isOverride, setIsOverride] = useState(false);
    const [authEmail, setAuthEmail] = useState(currentUserEmail);
    const [authPassword, setAuthPassword] = useState('');

    // Fetch shift summary to show expected values
    const { data: shiftData } = useQuery({
        queryKey: ['pos-shift-detail', shiftId],
        queryFn: () => api.get(`/pos-terminals/shifts/${shiftId}`).then((r) => r.data.data),
        enabled: !!shiftId,
    });
    const { data: receiptSettings } = useQuery({
        queryKey: ['pos-receipt-settings'],
        queryFn: () => api.get('/pos/receipt-settings').then((r) => r.data.data as PosReceiptSettings),
    });

    const actualCash = useMemo(() => {
        return DENOMINATIONS.reduce((sum, d) => sum + d * (counts[String(d)] || 0), 0);
    }, [counts]);

    const summary = shiftData?.summary || {};
    const expectedCash = Number(summary?.cash?.expectedCash ?? shiftData?.expectedCash ?? openingCash);
    const variance = actualCash - expectedCash;

    const closeMut = useMutation({
        mutationFn: () =>
            api.post(`/pos-terminals/shifts/${shiftId}/close`, {
                actualCash,
                denominations: counts,
                notes: notes.trim() || undefined,
                authEmail: isOverride ? authEmail : undefined,
                authPassword: isOverride ? authPassword : undefined,
            }),
        onSuccess: async (res: any) => {
            const closed = res?.data?.data;
            const summary = closed?.summary || {};
            const paymentBreakdownObj = summary?.paymentBreakdown || {};
            const paymentRows = Object.entries(paymentBreakdownObj).map(([method, v]: any) => ({
                method,
                count: Number(v?.count || 0),
                total: Number(v?.total || 0),
            }));
            const { html, styles } = buildShiftCloseReceiptDocument({
                data: {
                    shiftId: closed?.id || shiftId,
                    terminalCode: closed?.terminal?.code || terminalCode,
                    terminalName: closed?.terminal?.name || '',
                    openedAt: closed?.openedAt,
                    closedAt: closed?.closedAt || summary?.closedAt,
                    openedBy: closed?.user?.name || '',
                    closedBy: summary?.closedBy?.name || '',
                    grossSales: Number(summary?.grossSales || 0),
                    unpostedSales: Number(summary?.unpostedSales || 0),
                    unpostedCount: Number(summary?.unpostedCount || 0),
                    totalReturns: Number(summary?.totalReturns || 0),
                    netSales: Number(summary?.netSales || 0),
                    totalInvoices: Number(summary?.totalInvoices || closed?.totalTransactions || 0),
                    totalReturnsCount: Number(summary?.totalReturnsCount || 0),
                    firstInvoiceNo: summary?.invoiceRange?.firstInvoiceNo || '',
                    lastInvoiceNo: summary?.invoiceRange?.lastInvoiceNo || '',
                    paymentRows,
                    cashSales: Number(summary?.paymentTotals?.cashSales || 0),
                    cardSales: Number(summary?.paymentTotals?.cardSales || 0),
                    mixedSales: Number(summary?.paymentTotals?.mixedSales || 0),
                    mixedCashPart: Number(summary?.paymentTotals?.mixedCashPart || 0),
                    mixedCardPart: Number(summary?.paymentTotals?.mixedCardPart || 0),
                    creditSales: Number(summary?.paymentTotals?.creditSales || 0),
                    totalExpectedAllSalesTypes: Number(summary?.paymentTotals?.totalExpectedAllSalesTypes || 0),
                    openingCash: Number(summary?.cash?.openingCash ?? openingCash),
                    cashIn: Number(summary?.cash?.cashIn || 0),
                    cashOutReturns: Number(summary?.cash?.cashOutReturns || 0),
                    expectedCash: Number(summary?.cash?.expectedCash ?? closed?.expectedCash ?? 0),
                    actualCash: Number(summary?.cash?.actualCash ?? closed?.actualCash ?? 0),
                    variance: Number(summary?.cash?.variance ?? closed?.variance ?? 0),
                    notes: closed?.notes || '',
                },
                settings: receiptSettings,
                companyName,
                currency,
            });

            try {
                if (window.electronPOS?.isElectron && window.electronPOS?.printHtml) {
                    const result = await window.electronPOS.printHtml({
                        documentTitle: `SHIFT-${closed?.terminal?.code || terminalCode}-${String(closed?.id || shiftId).slice(-6)}`,
                        html,
                        styles,
                        deviceName: receiptSettings?.defaultPrinter || undefined,
                        silent: Boolean(receiptSettings?.defaultPrinter) || Boolean(receiptSettings?.silentPrint),
                        copies: Number(receiptSettings?.printCopies || 1),
                    });
                    if (!result?.ok) {
                        toast.error(result?.error || 'Shift receipt print failed');
                    }
                } else {
                    printHtmlDocument({
                        documentTitle: `SHIFT-${closed?.terminal?.code || terminalCode}`,
                        html,
                        styles,
                    });
                }
            } catch {
                toast.error('Shift closed, but receipt print failed');
            }

            toast.success('Shift closed successfully');
            qc.invalidateQueries({ queryKey: ['pos-terminals'] });
            qc.invalidateQueries({ queryKey: ['pos-shifts'] });
            qc.invalidateQueries({ queryKey: ['pos-shift-detail'] });
            onClosed(closed);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to close shift'),
    });

    function handleCount(denom: string, value: string) {
        const n = parseInt(value) || 0;
        setCounts((prev) => ({ ...prev, [denom]: Math.max(0, n) }));
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Close Shift</h2>
                        <p className="text-sm text-gray-500">Terminal: <span className="font-mono font-semibold">{terminalCode}</span></p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-6">
                    {/* Shift Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Opening Cash</div>
                            <div className="text-lg font-semibold text-gray-900">{openingCash.toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Gross Sales</div>
                            <div className="text-lg font-semibold text-gray-900">{Number(summary?.grossSales || shiftData?.totalSales || 0).toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Transactions</div>
                            <div className="text-lg font-semibold text-gray-900">{Number(summary?.totalInvoices || shiftData?.totalTransactions || 0)}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                            <div className="text-xs text-gray-500 mb-1">Returns</div>
                            <div className="text-lg font-semibold text-gray-900">{Number(summary?.totalReturns || shiftData?.totalRefunds || 0).toFixed(2)}</div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-gray-700">Sales Consolidation</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-gray-500">Net Sales</div>
                            <div className="text-right font-semibold text-gray-900">{Number(summary?.netSales || 0).toFixed(2)} SAR</div>
                            <div className="text-gray-500">Unposted Sales</div>
                            <div className="text-right font-semibold text-gray-900">{Number(summary?.unpostedSales || 0).toFixed(2)} SAR ({Number(summary?.unpostedCount || 0)})</div>
                            <div className="text-gray-500">Invoice Range</div>
                            <div className="text-right font-semibold text-gray-900">
                                {summary?.invoiceRange?.firstInvoiceNo || '-'} to {summary?.invoiceRange?.lastInvoiceNo || '-'}
                            </div>
                            <div className="text-gray-500">Cash Sales</div>
                            <div className="text-right font-semibold text-gray-900">{Number(summary?.paymentTotals?.cashSales || 0).toFixed(2)} SAR</div>
                            <div className="text-gray-500">Card Sales</div>
                            <div className="text-right font-semibold text-gray-900">{Number(summary?.paymentTotals?.cardSales || 0).toFixed(2)} SAR</div>
                            <div className="text-gray-500">Mixed Sales</div>
                            <div className="text-right font-semibold text-gray-900">{Number(summary?.paymentTotals?.mixedSales || 0).toFixed(2)} SAR</div>
                            <div className="text-gray-500">Mixed Split (Cash/Card)</div>
                            <div className="text-right font-semibold text-gray-900">
                                {Number(summary?.paymentTotals?.mixedCashPart || 0).toFixed(2)} / {Number(summary?.paymentTotals?.mixedCardPart || 0).toFixed(2)} SAR
                            </div>
                            <div className="text-gray-500">Credit Sales</div>
                            <div className="text-right font-semibold text-gray-900">{Number(summary?.paymentTotals?.creditSales || 0).toFixed(2)} SAR</div>
                            <div className="text-gray-500">Expected All Sales Types</div>
                            <div className="text-right font-bold text-gray-900">{Number(summary?.paymentTotals?.totalExpectedAllSalesTypes || 0).toFixed(2)} SAR</div>
                        </div>
                    </div>

                    {/* Denomination Grid */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Cash Denomination Count</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {DENOMINATIONS.map((d) => {
                                const key = String(d);
                                const count = counts[key] || 0;
                                const subtotal = d * count;
                                return (
                                    <div key={d} className="rounded-lg border border-gray-200 p-3 text-center space-y-1">
                                        <div className="text-sm font-semibold text-gray-700">{d >= 1 ? d : d} SAR</div>
                                        <input
                                            type="number"
                                            min={0}
                                            value={count || ''}
                                            onChange={(e) => handleCount(key, e.target.value)}
                                            className="w-full text-center px-2 py-1.5 border border-gray-200 rounded text-sm font-medium"
                                            placeholder="0"
                                        />
                                        <div className="text-xs text-gray-400">{subtotal > 0 ? subtotal.toFixed(2) : '—'}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="rounded-xl border-2 border-gray-200 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Counted Cash Total</span>
                            <span className="text-xl font-bold text-gray-900">{actualCash.toFixed(2)} SAR</span>
                        </div>
                        <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                            <span className="text-sm text-gray-600">Expected Cash Total</span>
                            <span className="text-sm font-medium text-gray-700">{(openingCash + expectedCash).toFixed(2)} SAR</span>
                        </div>
                        <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">Variance</span>
                            <div className="flex items-center gap-2">
                                {variance === 0 ? (
                                    <CheckCircle size={16} className="text-emerald-500" />
                                ) : (
                                    <AlertTriangle size={16} className={variance > 0 ? 'text-amber-500' : 'text-red-500'} />
                                )}
                                <span className={`text-lg font-bold ${variance === 0 ? 'text-emerald-600' : variance > 0 ? 'text-amber-600' : 'text-red-600'
                                    }`}>
                                    {variance >= 0 ? '+' : ''}{variance.toFixed(2)} SAR
                                </span>
                            </div>
                        </div>
                        {variance !== 0 && (
                            <div className={`text-xs rounded-lg p-2 ${variance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                                {variance > 0 ? 'Cash over — more cash than expected in drawer' : 'Cash short — less cash than expected in drawer'}
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Shift Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Optional notes for this shift..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                        />
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                        <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            id="overrideCheckbox"
                            checked={isOverride}
                            onChange={(e) => setIsOverride(e.target.checked)}
                        />
                        <label htmlFor="overrideCheckbox" className="text-sm font-medium text-gray-700">Override Authentication (Close for another user)</label>
                    </div>

                    {isOverride && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Auth Email</label>
                                <input
                                    type="email"
                                    value={authEmail}
                                    onChange={(e) => setAuthEmail(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                    placeholder="admin@company.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Auth Password</label>
                                <input
                                    type="password"
                                    value={authPassword}
                                    onChange={(e) => setAuthPassword(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                    placeholder="********"
                                />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                if (actualCash === 0 && !confirm('Actual cash is 0. Are you sure you want to close this shift?')) return;
                                if (isOverride && (!authEmail.trim() || !authPassword.trim())) {
                                    toast.error('Email and password are required for override');
                                    return;
                                }
                                closeMut.mutate();
                            }}
                            disabled={closeMut.isPending}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                            {closeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                            Close Shift
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
