export const PAYMENT_METHOD_ORDER = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'MOBILE', 'MOBILE_2', 'MOBILE_3', 'MOBILE_4', 'MOBILE_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'MIXED',
    'INSTALLMENT',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5',
] as const;

export const SALE_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'MOBILE', 'MOBILE_2', 'MOBILE_3', 'MOBILE_4', 'MOBILE_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'MIXED',
    'INSTALLMENT',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5',
] as const;

export const SALES_INVOICE_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5',
    'MIXED'
] as const;

export const SALES_RECEIPT_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'STC_PAY'
] as const;

export const PURCHASE_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5'
] as const;

export const PURCHASE_SETTLEMENT_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5'
] as const;

export const EXPENSE_PURCHASE_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5'
] as const;

export const SERVICE_INVOICE_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'MOBILE', 'MOBILE_2', 'MOBILE_3', 'MOBILE_4', 'MOBILE_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5'
] as const;

export const POS_PAYMENT_METHODS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'MIXED',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5'
] as const;

const LEGACY_PAYMENT_METHOD_ALIASES: Record<string, string> = {
    BANK: 'BANK_TRANSFER',
};

export function normalizePaymentMethodKey(value: unknown, fallback = '') {
    const normalized = String(value || fallback).trim().toUpperCase();
    return LEGACY_PAYMENT_METHOD_ALIASES[normalized] || normalized;
}

// ════════════ Accounting Type Helpers ════════════
// These resolve any payment method variant (e.g. CASH_2, BANK_3) to its parent accounting type.

export function isCashType(method: string): boolean {
    const m = String(method || '').trim().toUpperCase();
    return m === 'CASH' || m.startsWith('CASH_');
}

export function isBankType(method: string): boolean {
    const m = String(method || '').trim().toUpperCase();
    return m === 'CARD' || m.startsWith('CARD_')
        || m === 'BANK_TRANSFER' || m.startsWith('BANK_')
        || m === 'MOBILE' || m.startsWith('MOBILE_');
}

export function isCreditType(method: string): boolean {
    const m = String(method || '').trim().toUpperCase();
    return m === 'CREDIT' || m.startsWith('CREDIT_') || m === 'INSTALLMENT';
}

export function isMixedType(method: string): boolean {
    return String(method || '').trim().toUpperCase() === 'MIXED';
}

export type AccountingPaymentType = 'CASH' | 'BANK' | 'CREDIT' | 'MIXED';

export function resolveAccountingType(method: string): AccountingPaymentType {
    if (isMixedType(method)) return 'MIXED';
    if (isCreditType(method)) return 'CREDIT';
    if (isBankType(method)) return 'BANK';
    return 'CASH'; // CASH is the safe default
}
