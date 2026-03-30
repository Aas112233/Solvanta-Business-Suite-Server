import { PosReceiptSettings } from './posReceiptTemplates';

type PaymentRow = { method: string; count: number; total: number };

export type ShiftCloseReceiptData = {
    shiftId: string;
    terminalCode: string;
    terminalName?: string;
    openedAt?: string;
    closedAt?: string;
    openedBy?: string;
    closedBy?: string;
    grossSales: number;
    totalReturns: number;
    netSales: number;
    totalInvoices: number;
    unpostedSales?: number;
    unpostedCount?: number;
    totalReturnsCount: number;
    firstInvoiceNo?: string;
    lastInvoiceNo?: string;
    paymentRows: PaymentRow[];
    cashSales?: number;
    cardSales?: number;
    mixedSales?: number;
    mixedCashPart?: number;
    mixedCardPart?: number;
    creditSales?: number;
    totalExpectedAllSalesTypes?: number;
    openingCash: number;
    cashIn: number;
    cashOutReturns: number;
    expectedCash: number;
    actualCash: number;
    variance: number;
    notes?: string;
};

const escapeHtml = (value: string) =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const money = (n: number) => Number(n || 0).toFixed(2);

export function buildShiftCloseReceiptDocument(options: {
    data: ShiftCloseReceiptData;
    settings?: Partial<PosReceiptSettings> | null;
    companyName: string;
    currency: string;
}): { html: string; styles: string } {
    const s = options.settings || {};
    const paperWidth = s.paperWidth === '58MM' ? '58MM' : '80MM';
    const receiptWidth = paperWidth === '58MM' ? '47.5mm' : '67mm';
    const leftInset = paperWidth === '58MM' ? '0.8mm' : '1.2mm';
    const barcodeSafeWidth = paperWidth === '58MM' ? '40mm' : '58mm';
    const fontBase = paperWidth === '58MM' ? '11.4px' : '12.2px';
    const d = options.data;

    const paymentRowsHtml = d.paymentRows
        .map((r) => `
            <div class="row">
                <span>${escapeHtml(r.method)} (${r.count})</span>
                <span>${money(r.total)}</span>
            </div>
        `)
        .join('');

    const html = `
        <div class="receipt">
            <div class="center title">${escapeHtml(options.companyName)}</div>
            <div class="center tiny">Shift Closing Report</div>
            <div class="divider"></div>

            <div class="row"><span>Shift ID</span><span>${escapeHtml(d.shiftId)}</span></div>
            <div class="row"><span>Terminal</span><span>${escapeHtml(d.terminalCode)}${d.terminalName ? ` - ${escapeHtml(d.terminalName)}` : ''}</span></div>
            ${d.openedAt ? `<div class="row"><span>Opened</span><span>${new Date(d.openedAt).toLocaleString()}</span></div>` : ''}
            ${d.closedAt ? `<div class="row"><span>Closed</span><span>${new Date(d.closedAt).toLocaleString()}</span></div>` : ''}
            ${d.openedBy ? `<div class="row"><span>Opened By</span><span>${escapeHtml(d.openedBy)}</span></div>` : ''}
            ${d.closedBy ? `<div class="row"><span>Closed By</span><span>${escapeHtml(d.closedBy)}</span></div>` : ''}

            <div class="divider"></div>
            <div class="section">Sales Consolidation</div>
            <div class="row"><span>Gross Sales</span><span>${money(d.grossSales)}</span></div>
            <div class="row"><span>Returns</span><span>- ${money(d.totalReturns)}</span></div>
            <div class="row"><span>Net Sales</span><span>${money(d.netSales)}</span></div>
            <div class="row"><span>Invoices</span><span>${d.totalInvoices}</span></div>
            <div class="row"><span>Return Count</span><span>${d.totalReturnsCount}</span></div>
            ${d.unpostedSales ? `<div class="row"><span>Unposted Sales</span><span>${money(d.unpostedSales)} (${Number(d.unpostedCount || 0)})</span></div>` : ''}
            ${(d.firstInvoiceNo || d.lastInvoiceNo) ? `<div class="row"><span>Invoice Range</span><span>${escapeHtml(d.firstInvoiceNo || '-')} to ${escapeHtml(d.lastInvoiceNo || '-')}</span></div>` : ''}

            <div class="divider"></div>
            <div class="section">Payment Breakdown</div>
            ${paymentRowsHtml || '<div class="tiny center">No transactions</div>'}
            ${typeof d.cashSales === 'number' ? `<div class="row"><span>Cash Sales</span><span>${money(d.cashSales)}</span></div>` : ''}
            ${typeof d.cardSales === 'number' ? `<div class="row"><span>Card Sales</span><span>${money(d.cardSales)}</span></div>` : ''}
            ${typeof d.mixedSales === 'number' ? `<div class="row"><span>Mixed Sales</span><span>${money(d.mixedSales)}</span></div>` : ''}
            ${(typeof d.mixedCashPart === 'number' || typeof d.mixedCardPart === 'number') ? `<div class="row"><span>Mixed Split C/Card</span><span>${money(d.mixedCashPart || 0)} / ${money(d.mixedCardPart || 0)}</span></div>` : ''}
            ${typeof d.creditSales === 'number' ? `<div class="row"><span>Credit Sales</span><span>${money(d.creditSales)}</span></div>` : ''}
            ${typeof d.totalExpectedAllSalesTypes === 'number' ? `<div class="row"><span>All Sales Types</span><span>${money(d.totalExpectedAllSalesTypes)}</span></div>` : ''}

            <div class="divider"></div>
            <div class="section">Cash Settlement</div>
            <div class="row"><span>Opening Cash</span><span>${money(d.openingCash)}</span></div>
            <div class="row"><span>Cash In</span><span>${money(d.cashIn)}</span></div>
            <div class="row"><span>Cash Out (Returns)</span><span>- ${money(d.cashOutReturns)}</span></div>
            <div class="row"><span>Expected Cash</span><span>${money(d.expectedCash)}</span></div>
            <div class="row"><span>Actual Cash</span><span>${money(d.actualCash)}</span></div>
            <div class="row total"><span>Variance</span><span>${d.variance >= 0 ? '+' : ''}${money(d.variance)} ${escapeHtml(options.currency)}</span></div>

            ${d.notes ? `<div class="divider"></div><div class="tiny">Notes: ${escapeHtml(d.notes)}</div>` : ''}
            <div class="divider"></div>
            <div class="center tiny">Generated by POS Terminal</div>
        </div>
    `;

    const styles = `
        @page { size: ${paperWidth === '58MM' ? '58mm' : '80mm'} auto; margin: 0; }
        html, body { margin: 0; padding: 0; width: ${paperWidth === '58MM' ? '58mm' : '80mm'}; font-family: "Courier New", monospace; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .receipt { box-sizing: border-box; width: ${receiptWidth}; margin: 0 0 0 ${leftInset}; padding: 2mm 2.2mm 4mm 0.4mm; font-size: ${fontBase}; color: #111827; line-height: 1.32; }
        .center { text-align: center; }
        .title { font-weight: 900; font-size: ${paperWidth === '58MM' ? '13px' : '14.2px'}; letter-spacing: 0.02em; }
        .tiny { font-size: ${paperWidth === '58MM' ? '10px' : '11px'}; color: #4b5563; }
        .section { font-weight: 900; text-transform: uppercase; font-size: ${paperWidth === '58MM' ? '10.6px' : '11.6px'}; color: #111827; margin-bottom: 4px; letter-spacing: 0.04em; }
        .divider { border-top: 1px dashed #9ca3af; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin: 3px 0; }
        .row > span:first-child { max-width: 56%; font-weight: 700; color: #374151; }
        .row > span:last-child { max-width: 42%; text-align: right; font-weight: 800; word-break: break-word; overflow-wrap: anywhere; }
        .total { font-size: ${paperWidth === '58MM' ? '12.5px' : '13.3px'}; }
        .total > span:last-child { color: #111827; }
        img { max-width: ${barcodeSafeWidth}; }
    `;

    return { html, styles };
}
