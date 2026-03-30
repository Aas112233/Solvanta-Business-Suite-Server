type MaybeString = string | null | undefined;

const clean = (value: MaybeString) => {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : '';
};

export type SalesCustomerDisplay = {
    title: string;
    detail: string;
    isWalkInLoyalty: boolean;
};

export const getSalesCustomerDisplay = (invoice: any): SalesCustomerDisplay => {
    const directName = clean(invoice?.customer?.name) || clean(invoice?.customerName);
    const directPhone = clean(invoice?.customer?.phone);
    const loyaltyName = clean(invoice?.loyaltyCustomer?.name);
    const loyaltyPhone = clean(invoice?.loyaltyCustomer?.phone);

    const isWalkInLoyalty = !directName && (!!loyaltyName || !!loyaltyPhone);
    if (isWalkInLoyalty) {
        const detail = `${loyaltyName || '-'}-${loyaltyPhone || '-'}`;
        return {
            title: 'Walk-in Customer',
            detail,
            isWalkInLoyalty: true,
        };
    }

    return {
        title: directName || 'Walk-in Customer',
        detail: directPhone || '',
        isWalkInLoyalty: false,
    };
};

export const getSalesCustomerExportText = (invoice: any) => {
    const display = getSalesCustomerDisplay(invoice);
    if (!display.isWalkInLoyalty) return display.title;
    return `${display.title}\n${display.detail}`;
};

export type SalesInvoiceDiscountBreakdown = {
    standardDiscount: number;
    loyaltyDiscount: number;
    totalDiscount: number;
    hasDiscount: boolean;
};

export const getSalesInvoiceDiscountBreakdown = (invoice: any): SalesInvoiceDiscountBreakdown => {
    const standardDiscount = Number(invoice?.discountTotal || 0);
    const loyaltyDiscount = Number(
        invoice?.loyaltyDiscountValue
        ?? (Number(invoice?.loyaltyPointsRedeemed || 0) * 0.005)
        ?? 0
    );
    const totalDiscount = standardDiscount + loyaltyDiscount;

    return {
        standardDiscount,
        loyaltyDiscount,
        totalDiscount,
        hasDiscount: totalDiscount > 0,
    };
};
