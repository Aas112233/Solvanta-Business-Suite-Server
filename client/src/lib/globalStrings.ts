export type GlobalStringRecord = {
    value: string;
    systemKey?: string | null;
    isActive?: boolean | null;
};

export type GlobalStringOption = {
    value: string;
    label: string;
};

export const GLOBAL_STRING_GROUPS = {
    salePaymentMethods: 'SALE_PAYMENT_METHOD',
    purchasePaymentMethods: 'PURCHASE_PAYMENT_METHOD',
} as const;

export const PAYMENT_METHOD_ORDER = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'MOBILE', 'MOBILE_2', 'MOBILE_3', 'MOBILE_4', 'MOBILE_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'MIXED',
    'INSTALLMENT',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5',
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_ORDER)[number];

type PaymentMethodDefinition = {
    value: PaymentMethodKey;
    label: string;
    color: string;
};

const PAYMENT_METHOD_DEFINITIONS: PaymentMethodDefinition[] = [
    { value: 'CASH', label: 'Cash', color: '#10b981' },
    { value: 'CASH_2', label: 'Cash 2', color: '#10b981' },
    { value: 'CASH_3', label: 'Cash 3', color: '#10b981' },
    { value: 'CASH_4', label: 'Cash 4', color: '#10b981' },
    { value: 'CASH_5', label: 'Cash 5', color: '#10b981' },

    { value: 'CARD', label: 'Card', color: '#3b82f6' },
    { value: 'CARD_2', label: 'Card 2', color: '#3b82f6' },
    { value: 'CARD_3', label: 'Card 3', color: '#3b82f6' },
    { value: 'CARD_4', label: 'Card 4', color: '#3b82f6' },
    { value: 'CARD_5', label: 'Card 5', color: '#3b82f6' },

    { value: 'MOBILE', label: 'Mobile Pay', color: '#8b5cf6' },
    { value: 'MOBILE_2', label: 'Mobile Pay 2', color: '#8b5cf6' },
    { value: 'MOBILE_3', label: 'Mobile Pay 3', color: '#8b5cf6' },
    { value: 'MOBILE_4', label: 'Mobile Pay 4', color: '#8b5cf6' },
    { value: 'MOBILE_5', label: 'Mobile Pay 5', color: '#8b5cf6' },

    { value: 'BANK_TRANSFER', label: 'Bank Transfer', color: '#6b7280' },
    { value: 'BANK_2', label: 'Bank 2', color: '#6b7280' },
    { value: 'BANK_3', label: 'Bank 3', color: '#6b7280' },
    { value: 'BANK_4', label: 'Bank 4', color: '#6b7280' },
    { value: 'BANK_5', label: 'Bank 5', color: '#6b7280' },

    { value: 'MIXED', label: 'Split Pay', color: '#ec4899' },
    { value: 'INSTALLMENT', label: 'Installments', color: '#f59e0b' },

    { value: 'CREDIT', label: 'Credit', color: '#ef4444' },
    { value: 'CREDIT_2', label: 'Credit 2', color: '#ef4444' },
    { value: 'CREDIT_3', label: 'Credit 3', color: '#ef4444' },
    { value: 'CREDIT_4', label: 'Credit 4', color: '#ef4444' },
    { value: 'CREDIT_5', label: 'Credit 5', color: '#ef4444' },
];

export const SALE_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'MOBILE', 'MOBILE_2', 'MOBILE_3', 'MOBILE_4', 'MOBILE_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'MIXED',
    'INSTALLMENT',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5'
] as const;
export const SALE_INVOICE_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5',
    'MIXED'
] as const;
export const SALE_RECEIPT_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'STC_PAY'
] as const;
export const PURCHASE_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5'
] as const;
export const PURCHASE_SETTLEMENT_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5'
] as const;
export const EXPENSE_PURCHASE_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5'
] as const;
export const POS_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'MIXED',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5'
] as const;
export const SERVICE_INVOICE_PAYMENT_METHOD_KEYS = [
    'CASH', 'CASH_2', 'CASH_3', 'CASH_4', 'CASH_5',
    'CARD', 'CARD_2', 'CARD_3', 'CARD_4', 'CARD_5',
    'BANK_TRANSFER', 'BANK_2', 'BANK_3', 'BANK_4', 'BANK_5',
    'MOBILE', 'MOBILE_2', 'MOBILE_3', 'MOBILE_4', 'MOBILE_5',
    'CREDIT', 'CREDIT_2', 'CREDIT_3', 'CREDIT_4', 'CREDIT_5'
] as const;

export function normalizePaymentMethodKey(value: unknown, fallback = '') {
    const normalized = String(value || fallback).trim().toUpperCase();
    return normalized === 'BANK' ? 'BANK_TRANSFER' : normalized;
}

// ════════════ Accounting Type Helpers ════════════
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

function buildDefaultPaymentMethodOptions(keys: readonly string[]): GlobalStringOption[] {
    return PAYMENT_METHOD_DEFINITIONS
        .filter((definition) => keys.includes(definition.value))
        .map((definition) => ({ value: definition.value, label: definition.label }));
}

function buildDefaultPaymentMethodGlobalStrings(keys: readonly string[]) {
    return PAYMENT_METHOD_DEFINITIONS
        .filter((definition) => keys.includes(definition.value))
        .map((definition) => ({
            value: definition.label,
            systemKey: definition.value,
            color: definition.color,
        }));
}

export const DEFAULT_SALE_PAYMENT_METHOD_OPTIONS: GlobalStringOption[] = buildDefaultPaymentMethodOptions(SALE_PAYMENT_METHOD_KEYS);
export const DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS: GlobalStringOption[] = buildDefaultPaymentMethodOptions(PURCHASE_PAYMENT_METHOD_KEYS);
export const DEFAULT_SALE_PAYMENT_METHOD_GLOBAL_STRINGS = buildDefaultPaymentMethodGlobalStrings(SALE_PAYMENT_METHOD_KEYS);
export const DEFAULT_PURCHASE_PAYMENT_METHOD_GLOBAL_STRINGS = buildDefaultPaymentMethodGlobalStrings(PURCHASE_PAYMENT_METHOD_KEYS);

type BuildGlobalStringOptionsParams = {
    blankLabel?: string;
    allowedKeys?: readonly string[];
    excludeKeys?: readonly string[];
};

function sortPaymentOptions(options: GlobalStringOption[]): GlobalStringOption[] {
    return [...options].sort((a, b) => {
        const aIndex = PAYMENT_METHOD_ORDER.indexOf(a.value as (typeof PAYMENT_METHOD_ORDER)[number]);
        const bIndex = PAYMENT_METHOD_ORDER.indexOf(b.value as (typeof PAYMENT_METHOD_ORDER)[number]);

        if (aIndex !== -1 || bIndex !== -1) {
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            if (aIndex !== bIndex) return aIndex - bIndex;
        }

        return a.label.localeCompare(b.label);
    });
}

function dedupeOptions(options: GlobalStringOption[]): GlobalStringOption[] {
    const seen = new Set<string>();
    const deduped: GlobalStringOption[] = [];

    for (const option of options) {
        if (seen.has(option.value)) continue;
        seen.add(option.value);
        deduped.push(option);
    }

    return deduped;
}

export function buildPaymentMethodOptions(
    rows: GlobalStringRecord[] | undefined,
    fallbackOptions: GlobalStringOption[],
    params: BuildGlobalStringOptionsParams = {},
): GlobalStringOption[] {
    const allowedKeys = new Set((params.allowedKeys || []).map((key) => normalizePaymentMethodKey(key)));
    const excludeKeys = new Set((params.excludeKeys || []).map((key) => key.toUpperCase()));

    const filterAndSortOptions = (options: GlobalStringOption[]) =>
        dedupeOptions(
            sortPaymentOptions(
                options
                    .filter((option) => (allowedKeys.size === 0 ? true : allowedKeys.has(option.value)))
                    .filter((option) => !excludeKeys.has(option.value)),
            ),
        );

    const mappedGlobalOptions = filterAndSortOptions(
        (rows || [])
            .map((entry) => {
                if (entry.isActive === false) return null;

                const value = normalizePaymentMethodKey(entry.systemKey || entry.value || '');
                const label = String(entry.value || '').trim();

                if (!value || !label) return null;

                return { value, label };
            })
            .filter((option): option is GlobalStringOption => Boolean(option)),
    );

    const resolvedOptions =
        mappedGlobalOptions.length > 0
            ? mappedGlobalOptions
            : filterAndSortOptions(
                  fallbackOptions
                      .map((entry) => {
                          const value = String(entry.value || '').trim().toUpperCase();
                          const label = String(entry.label || '').trim();

                          if (!value || !label) return null;

                          return { value, label };
                      })
                      .filter((option): option is GlobalStringOption => Boolean(option)),
              );

    if (params.blankLabel) {
        return [{ value: '', label: params.blankLabel }, ...resolvedOptions];
    }

    return resolvedOptions;
}
