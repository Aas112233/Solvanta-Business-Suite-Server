import JsBarcode from 'jsbarcode';

export type PosInvoiceTemplate =
    | 'THERMAL_CLASSIC'
    | 'THERMAL_COMPACT'
    | 'A4_INVOICE'
    | 'THERMAL_MINIMAL'
    | 'THERMAL_BOLD'
    | 'THERMAL_GRID'
    | 'THERMAL_RESTAURANT'
    | 'THERMAL_PHARMACY'
    | 'THERMAL_GROCERY';

export type PosReceiptSettings = {
    defaultPrinter: string;
    invoiceTemplate: PosInvoiceTemplate;
    paperWidth: '58MM' | '80MM';
    autoShowPreview: boolean;
    autoPrintOnComplete: boolean;
    printCopies: number;
    silentPrint: boolean;
    openCashDrawerAfterPrint: boolean;
    printLogo: boolean;
    showCashier: boolean;
    showCustomer: boolean;
    showTaxBreakdown: boolean;
    showFooterNote: boolean;
    footerNote: string;
    knownPrinters: string[];
    // Granular Font Sizing
    fontSizeBase: number;
    fontSizeItemName: number;
    fontSizeItemMeta: number;
    fontSizePrices: number;
    fontSizeTitle: number;
};

export interface PosReceiptItem {
    name: string;
    unitCode: string;
    unitName: string;
    qty: number;
    unitPrice: number;
    discount: number;
    taxAmount: number;
    lineTotal: number;
}

export interface PosReceiptData {
    invoiceNo: string;
    createdAt: string;
    status: string;
    paymentMethod: string;
    cashReceived: number;
    cardReceived: number;
    changeGiven: number;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
    terminalCode: string;
    branchName: string;
    cashierName: string;
    customerName: string;
    loyaltyPointsEarned?: number;
    loyaltyPointsRedeemed?: number;
    loyaltyRedemptionValue?: number;
    items: PosReceiptItem[];
}

export const DEFAULT_POS_RECEIPT_SETTINGS: PosReceiptSettings = {
    defaultPrinter: '',
    invoiceTemplate: 'THERMAL_CLASSIC',
    paperWidth: '80MM',
    autoShowPreview: true,
    autoPrintOnComplete: false,
    printCopies: 1,
    silentPrint: false,
    openCashDrawerAfterPrint: false,
    printLogo: false,
    showCashier: true,
    showCustomer: true,
    showTaxBreakdown: true,
    showFooterNote: true,
    footerNote: 'Thank you',
    knownPrinters: [],
    fontSizeBase: 12,
    fontSizeItemName: 12,
    fontSizeItemMeta: 10,
    fontSizePrices: 12,
    fontSizeTitle: 16,
};

export const PREVIEW_RECEIPT_DATA: PosReceiptData = {
    invoiceNo: 'INV-000123',
    createdAt: new Date().toISOString(),
    status: 'PAID',
    paymentMethod: 'CASH',
    cashReceived: 50.00,
    cardReceived: 0,
    changeGiven: 17.50,
    subtotal: 28.26,
    discountTotal: 0,
    taxTotal: 4.24,
    grandTotal: 32.50,
    terminalCode: 'POS-01',
    branchName: 'Main Store',
    cashierName: 'John Doe',
    customerName: 'Guest Customer',
    loyaltyPointsEarned: 32,
    loyaltyPointsRedeemed: 0,
    loyaltyRedemptionValue: 0,
    items: [
        { name: 'Fresh Milk 1L', unitCode: 'PCS', unitName: 'Pcs', qty: 2, unitPrice: 7.50, discount: 0, taxAmount: 2.25, lineTotal: 15.00 },
        { name: 'Organic Bread', unitCode: 'PCS', unitName: 'Pcs', qty: 1, unitPrice: 12.00, discount: 0, taxAmount: 1.80, lineTotal: 12.00 },
        { name: 'Paper Bags', unitCode: 'BOX', unitName: 'Box', qty: 5, unitPrice: 0.25, discount: 0, taxAmount: 0.19, lineTotal: 1.25 },
    ],
};

const formatMoney = (value: number) => Number(value || 0).toFixed(2);
const escapeHtml = (value: string) =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const buildInvoiceBarcodeImage = (invoiceNo: string, paperWidth: '58MM' | '80MM'): string => {
    try {
        const canvas = document.createElement('canvas');
        const is58mm = paperWidth === '58MM';
        JsBarcode(canvas, String(invoiceNo || ''), {
            format: 'CODE128',
            displayValue: false,
            margin: 2,
            width: is58mm ? 1.7 : 2.0,
            height: is58mm ? 42 : 48,
            background: '#ffffff',
            lineColor: '#000000',
        });
        return canvas.toDataURL('image/png');
    } catch {
        return '';
    }
};

const buildReceiptHtml = (
    receipt: PosReceiptData,
    settings: PosReceiptSettings,
    companyName: string,
    currency: string
) => {
    const template = settings.invoiceTemplate || 'THERMAL_CLASSIC';
    const templateClass = `tpl-${String(template).toLowerCase().replace(/_/g, '-')}`;
    const headerLabel = template === 'THERMAL_RESTAURANT'
        ? 'Kitchen/Guest Receipt'
        : template === 'THERMAL_PHARMACY'
            ? 'Dispense Receipt'
            : template === 'THERMAL_GROCERY'
                ? 'Checkout Receipt'
                : template === 'THERMAL_GRID'
                    ? 'Grid Receipt'
                    : template === 'THERMAL_BOLD'
                        ? 'Counter Receipt'
                        : template === 'THERMAL_MINIMAL'
                            ? 'Simple Receipt'
                            : 'POS Receipt';
    const barcodeImage = buildInvoiceBarcodeImage(receipt.invoiceNo, settings.paperWidth);
    const itemCount = receipt.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const isCompactLike = template === 'THERMAL_COMPACT' || template === 'THERMAL_MINIMAL';
    const isGridLike = template === 'THERMAL_GRID';
    const isRestaurant = template === 'THERMAL_RESTAURANT';
    const isPharmacy = template === 'THERMAL_PHARMACY';
    const isGrocery = template === 'THERMAL_GROCERY';
    const standardDiscount = Number(receipt.discountTotal || 0);
    const loyaltyDiscount = Number(receipt.loyaltyRedemptionValue || 0);
    const totalDiscount = standardDiscount + loyaltyDiscount;

    const itemsHeaderHtml = isGridLike || isRestaurant || isPharmacy
        ? `
            <div class="items-head">
                <span>${isPharmacy ? 'Item / Unit' : 'Item'}</span>
                <span>${isPharmacy ? 'Amt' : 'Total'}</span>
            </div>
        `
        : '';

    const itemsHtml = receipt.items.map((item, idx) => {
        const lineTotalWithTax = Number(item.lineTotal || 0) + Number(item.taxAmount || 0);
        const taxedUnitPrice = Number(item.unitPrice || 0) + (Number(item.taxAmount || 0) / Math.max(Number(item.qty || 1), 1));

        const itemMetaHtml = `
            <div class="item-meta">
                ${item.qty} ${escapeHtml(item.unitName || item.unitCode)} @ ${formatMoney(item.unitPrice)} (Untaxed)
                <br/>
                incl. Tax: ${formatMoney(taxedUnitPrice)}
            </div>
        `;

        if (isRestaurant) {
            return `
                <div class="item item-restaurant">
                    <div class="item-top">
                        <div class="qty-circle">${item.qty}</div>
                        <div class="name">${escapeHtml(item.name)}</div>
                        <div class="amount">${formatMoney(lineTotalWithTax)}</div>
                    </div>
                </div>
            `;
        }

        if (isPharmacy) {
            return `
                <div class="item item-pharmacy">
                    <div class="item-top">
                        <div class="name">${escapeHtml(item.name)}</div>
                        <div class="amount">${formatMoney(lineTotalWithTax)}</div>
                    </div>
                    <div class="item-details">
                        <span>P: ${formatMoney(item.unitPrice)} (+Tax: ${formatMoney(taxedUnitPrice)})</span>
                        <span>Qty: ${item.qty} ${escapeHtml(item.unitName || item.unitCode)}</span>
                    </div>
                </div>
            `;
        }

        if (isGridLike) {
            return `
                <div class="item item-grid">
                    <div class="grid-row">
                        <div class="name">${escapeHtml(item.name)}</div>
                        <div class="qty">${item.qty}</div>
                        <div class="amount">${formatMoney(lineTotalWithTax)}</div>
                    </div>
                    <div class="item-meta">Unit: ${escapeHtml(item.unitName || item.unitCode)} | Price: ${formatMoney(item.unitPrice)} / ${formatMoney(taxedUnitPrice)}</div>
                </div>
            `;
        }

        if (isGrocery) {
            return `
                <div class="item item-grocery">
                    <div class="item-main">
                        <span class="idx">${idx + 1}.</span>
                        <span class="name">${escapeHtml(item.name)}</span>
                    </div>
                    <div class="item-sub">
                        <span>${item.qty} ${escapeHtml(item.unitName || item.unitCode)} x ${formatMoney(item.unitPrice)} (${formatMoney(taxedUnitPrice)})</span>
                        <span class="line-total">${formatMoney(lineTotalWithTax)}</span>
                    </div>
                </div>
            `;
        }

        if (isCompactLike) {
            return `
                <div class="item item-compact">
                    <div class="item-line">
                        <span class="name">${escapeHtml(item.name)}</span>
                        <span class="qty">x${item.qty}</span>
                        <span class="amount">${formatMoney(lineTotalWithTax)}</span>
                    </div>
                    <div class="item-meta">${escapeHtml(item.unitName || item.unitCode)}: ${formatMoney(item.unitPrice)} / ${formatMoney(taxedUnitPrice)}</div>
                </div>
            `;
        }

        return `
            <div class="item">
                <div class="item-top">
                    <div class="name">${escapeHtml(item.name)}</div>
                    <div class="amount">${formatMoney(lineTotalWithTax)}</div>
                </div>
                ${itemMetaHtml}
            </div>
        `;
    }).join('');

    const headerContent = `
        <div class="header-section">
            <div class="center title">${escapeHtml(companyName)}</div>
            <div class="center template-label">${escapeHtml(headerLabel)}</div>
            <div class="divider"></div>
        </div>
    `;

    const infoSection = `
        <div class="info-section">
            <div class="row"><span>Invoice</span><span class="bold">${escapeHtml(receipt.invoiceNo)}</span></div>
            <div class="row"><span>Date</span><span>${new Date(receipt.createdAt).toLocaleString()}</span></div>
            <div class="row"><span>Terminal</span><span>${escapeHtml(receipt.terminalCode)}</span></div>
            <div class="row"><span>Branch</span><span>${escapeHtml(receipt.branchName)}</span></div>
            ${settings.showCashier === false ? '' : `<div class="row"><span>Cashier</span><span>${escapeHtml(receipt.cashierName)}</span></div>`}
            ${settings.showCustomer === false ? '' : `<div class="row"><span>Customer</span><span>${escapeHtml(receipt.customerName).replace(/\n/g, '<br/>')}</span></div>`}
        </div>
    `;

    const summarySection = `
        <div class="summary-section">
            <div class="divider"></div>
            <div class="row"><span>Subtotal</span><span>${formatMoney(receipt.subtotal)}</span></div>
            ${standardDiscount > 0 ? `<div class="row"><span>Discount</span><span>-${formatMoney(standardDiscount)}</span></div>` : ''}
            ${settings.showTaxBreakdown === false ? '' : `<div class="row"><span>Tax Total</span><span>${formatMoney(receipt.taxTotal)}</span></div>`}
            ${(loyaltyDiscount > 0 || Number(receipt.loyaltyPointsRedeemed || 0) > 0)
            ? `<div class="row"><span>Loyalty Redeem${Number(receipt.loyaltyPointsRedeemed || 0) > 0 ? ` (${formatMoney(Number(receipt.loyaltyPointsRedeemed || 0))} pts)` : ''}</span><span>-${formatMoney(receipt.loyaltyRedemptionValue || 0)}</span></div>`
            : ''}
            ${totalDiscount > 0 ? `<div class="row"><span>Total Discount</span><span>-${formatMoney(totalDiscount)}</span></div>` : ''}
            <div class="row grand-total"><span>TOTAL</span><span>${formatMoney(receipt.grandTotal)} ${escapeHtml(currency)}</span></div>
            <div class="divider"></div>
            <div class="row"><span>Payment</span><span>${escapeHtml(receipt.paymentMethod)}</span></div>
            ${receipt.cashReceived > 0 ? `<div class="row"><span>Received</span><span>${formatMoney(receipt.cashReceived)}</span></div>` : ''}
            ${receipt.changeGiven > 0 ? `<div class="row"><span>Change</span><span>${formatMoney(receipt.changeGiven)}</span></div>` : ''}
            ${Number(receipt.loyaltyPointsEarned || 0) > 0 ? `<div class="row"><span>Points Earned</span><span>${formatMoney(receipt.loyaltyPointsEarned || 0)}</span></div>` : ''}
        </div>
    `;

    return `
        <div class="receipt ${templateClass}">
            ${headerContent}
            ${infoSection}
            <div class="divider"></div>
            ${isGrocery ? `<div class="row"><span>Total Items</span><span>${itemCount}</span></div><div class="divider thin"></div>` : ''}
            <div class="items-list">
                ${itemsHeaderHtml}
                ${itemsHtml}
            </div>
            ${summarySection}
            <div class="footer-section">
                <div class="divider"></div>
                ${barcodeImage ? `<div class="barcode-wrap"><img src="${barcodeImage}" alt="Barcode" /></div>` : ''}
                <div class="barcode-label">${escapeHtml(receipt.invoiceNo)}</div>
                ${settings.showFooterNote === false ? '' : `<div class="center footer-note">${escapeHtml(settings.footerNote || 'Thank you').replace(/\n/g, '<br/>')}</div>`}
            </div>
        </div>
    `;
};

const buildReceiptStyles = (settings: PosReceiptSettings) => `
    @page { size: ${settings.paperWidth === '58MM' ? '58mm' : '80mm'} auto; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${settings.paperWidth === '58MM' ? '58mm' : '80mm'}; font-family: "Courier New", monospace; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    
    .receipt { 
        box-sizing: border-box; 
        width: ${settings.paperWidth === '58MM' ? '50mm' : '70mm'}; 
        margin: 0 0 0 ${settings.paperWidth === '58MM' ? '2mm' : '3mm'}; 
        padding: 5mm 1mm;
        font-size: ${settings.fontSizeBase}px; 
        line-height: 1.25; 
        color: #000;
        font-weight: 600; /* Bolder default for thermal printers */
    }
    
    .center { text-align: center; }
    .bold { font-weight: 800; }
    .title { font-weight: 900; font-size: ${settings.fontSizeTitle}px; margin-bottom: 4px; }
    .template-label { font-size: ${Math.max(8, settings.fontSizeBase - 4)}px; text-transform: uppercase; color: #000; letter-spacing: 1px; font-weight: 800; }
    
    .divider { border-top: 1.5px dashed #000; margin: 8px 0; }
    .divider.thin { border-top-width: 1px; border-top-style: dotted; }
    
    .row { display: flex; justify-content: space-between; gap: 4px; margin: 3px 0; }
    .row > span:first-child { flex: 1; }
    .row > span:last-child { text-align: right; font-weight: 800; font-size: ${settings.fontSizePrices}px; }
    
    .grand-total { font-weight: 900; font-size: ${settings.fontSizePrices + 2}px; margin-top: 4px; border-top: 1.5px solid #000; padding-top: 4px; }
    
    .items-head { display: flex; justify-content: space-between; font-weight: 800; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 4px; font-size: ${Math.max(8, settings.fontSizeBase - 2)}px; }
    .item { margin-bottom: 8px; }
    .item-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .name { flex: 1; font-weight: 700; padding-right: 4px; line-height: 1.2; font-size: ${settings.fontSizeItemName}px; }
    .amount { text-align: right; font-weight: 800; font-size: ${settings.fontSizePrices}px; }
    .item-meta { font-size: ${settings.fontSizeItemMeta}px; color: #000; margin-top: 1px; font-weight: 600; }
    
    .barcode-wrap { margin: 10px auto 4px; text-align: center; }
    .barcode-wrap img { max-width: 100%; height: 40px; }
    .barcode-label { text-align: center; font-size: 10px; font-weight: 800; margin-bottom: 8px; }
    .footer-note { font-size: ${Math.max(8, settings.fontSizeBase - 2)}px; font-weight: 700; }

    /* --- THERMAL COMPACT --- */
    .tpl-thermal-compact { font-size: ${Math.max(8, settings.fontSizeBase - 2)}px; line-height: 1.2; }
    .tpl-thermal-compact .divider { margin: 4px 0; }
    .tpl-thermal-compact .item { margin-bottom: 2px; }
    .tpl-thermal-compact .item-line { display: flex; justify-content: space-between; }
    .tpl-thermal-compact .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; font-size: ${settings.fontSizeItemName}px; }

    /* --- THERMAL MINIMAL --- */
    .tpl-thermal-minimal .divider { border-top: none; height: 10px; }
    .tpl-thermal-minimal .title { font-weight: 400; font-family: sans-serif; letter-spacing: 2px; font-size: ${settings.fontSizeTitle}px; }
    .tpl-thermal-minimal .items-head { border-bottom: 0.5px solid #ccc; font-weight: 400; font-size: ${Math.max(8, settings.fontSizeBase - 2)}px; }
    .tpl-thermal-minimal .grand-total { border-top: 0.5px solid #ccc; font-size: ${settings.fontSizePrices + 1}px; }

    /* --- THERMAL BOLD --- */
    .tpl-thermal-bold .title { background: #000; color: #fff; padding: 4px 0; font-size: ${settings.fontSizeTitle + 2}px; }
    .tpl-thermal-bold .divider { border-top: 2px solid #000; }
    .tpl-thermal-bold .grand-total { border: 2px solid #000; padding: 4px; margin: 6px 0; font-size: ${settings.fontSizePrices + 4}px; }
    .tpl-thermal-bold .name { font-weight: 900; font-size: ${settings.fontSizeItemName + 1}px; }

    /* --- THERMAL GRID --- */
    .tpl-thermal-grid .item { border-bottom: 0.5px solid #eee; padding-bottom: 4px; }
    .tpl-thermal-grid .grid-row { display: grid; grid-template-columns: 1fr 40px 60px; align-items: center; }
    .tpl-thermal-grid .grid-row .qty { text-align: center; border-left: 0.5px solid #eee; border-right: 0.5px solid #eee; font-size: ${settings.fontSizeBase - 1}px; }
    .tpl-thermal-grid .grid-row .amount { text-align: right; font-size: ${settings.fontSizePrices}px; }

    /* --- THERMAL RESTAURANT --- */
    .tpl-thermal-restaurant .qty-circle { width: 22px; height: 22px; border: 1.5px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${Math.max(10, settings.fontSizeBase - 1)}px; margin-right: 6px; font-weight: 900; flex-shrink: 0; }
    .tpl-thermal-restaurant .item-top { align-items: center; border-bottom: 1px dotted #ccc; padding: 4px 0; }
    .tpl-thermal-restaurant .divider { border-top-style: double; border-top-width: 3px; }

    /* --- THERMAL PHARMACY --- */
    .tpl-thermal-pharmacy { background: #fdfdfd; }
    .tpl-thermal-pharmacy .title { color: #000; text-decoration: underline; font-size: ${settings.fontSizeTitle}px; }
    .tpl-thermal-pharmacy .item { border: 1.5px solid #000; padding: 4px; border-radius: 2px; }
    .tpl-thermal-pharmacy .item-details { display: flex; justify-content: space-between; font-size: ${settings.fontSizeItemMeta}px; margin-top: 2px; border-top: 1px solid #eee; padding-top: 2px; }

    /* --- THERMAL GROCERY --- */
    .tpl-thermal-grocery .item-main { display: flex; gap: 4px; font-weight: 700; font-size: ${settings.fontSizeItemName}px; }
    .tpl-thermal-grocery .item-sub { display: flex; justify-content: space-between; font-size: ${settings.fontSizeItemMeta}px; padding-left: 18px; }
    .tpl-thermal-grocery .idx { min-width: 14px; }
    .tpl-thermal-grocery .divider { border-top-style: solid; border-top-width: 1px; }

    /* --- A4 INVOICE (MIMIC) --- */
    .tpl-a4-invoice { border: 1px solid #000; padding: 10mm 4mm; width: ${settings.paperWidth === '58MM' ? '46mm' : '66mm'} !important; margin: 2mm auto !important; }
    .tpl-a4-invoice .title { font-size: ${settings.fontSizeTitle + 4}px; border-bottom: 2px solid #000; margin-bottom: 10px; }
    .tpl-a4-invoice .header-section { margin-bottom: 15px; }
    .tpl-a4-invoice .grand-total { font-size: ${settings.fontSizePrices + 4}px; background: #eee; padding: 4px; }
`;

export function buildPosReceiptPrintDocument(options: {
    receipt: PosReceiptData;
    settings?: Partial<PosReceiptSettings> | null;
    companyName: string;
    currency: string;
}): { html: string; styles: string } {
    const settings: PosReceiptSettings = {
        ...DEFAULT_POS_RECEIPT_SETTINGS,
        ...(options.settings || {}),
    };

    return {
        html: buildReceiptHtml(options.receipt, settings, options.companyName, options.currency),
        styles: buildReceiptStyles(settings),
    };
}
