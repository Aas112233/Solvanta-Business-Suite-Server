export const PAYMENT_METHOD_ORDER = [
    'CASH',
    'CARD',
    'STC_PAY',
    'BANK_TRANSFER',
    'MIXED',
    'INSTALLMENT',
    'CREDIT',
] as const;

export const SALE_PAYMENT_METHODS = [
    'CASH',
    'CARD',
    'STC_PAY',
    'BANK_TRANSFER',
    'MIXED',
    'INSTALLMENT',
    'CREDIT',
] as const;

export const SALES_INVOICE_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'MIXED'] as const;
export const SALES_RECEIPT_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'STC_PAY'] as const;
export const PURCHASE_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT'] as const;
export const PURCHASE_SETTLEMENT_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER'] as const;
export const EXPENSE_PURCHASE_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CREDIT'] as const;
export const SERVICE_INVOICE_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'STC_PAY', 'CREDIT'] as const;
export const POS_PAYMENT_METHODS = ['CASH', 'CARD', 'MIXED', 'CREDIT', 'BANK_TRANSFER'] as const;

const LEGACY_PAYMENT_METHOD_ALIASES: Record<string, string> = {
    BANK: 'BANK_TRANSFER',
};

export function normalizePaymentMethodKey(value: unknown, fallback = '') {
    const normalized = String(value || fallback).trim().toUpperCase();
    return LEGACY_PAYMENT_METHOD_ALIASES[normalized] || normalized;
}
