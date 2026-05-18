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
    'CASH',
    'CARD',
    'STC_PAY',
    'BANK_TRANSFER',
    'MIXED',
    'INSTALLMENT',
    'CREDIT',
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_ORDER)[number];

type PaymentMethodDefinition = {
    value: PaymentMethodKey;
    label: string;
    color: string;
};

const PAYMENT_METHOD_DEFINITIONS: PaymentMethodDefinition[] = [
    { value: 'CASH', label: 'Cash', color: '#10b981' },
    { value: 'CARD', label: 'Card', color: '#3b82f6' },
    { value: 'STC_PAY', label: 'STC Pay', color: '#8b5cf6' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer', color: '#6b7280' },
    { value: 'MIXED', label: 'Split Pay', color: '#ec4899' },
    { value: 'INSTALLMENT', label: 'Installments', color: '#f59e0b' },
    { value: 'CREDIT', label: 'Credit', color: '#ef4444' },
];

export const SALE_PAYMENT_METHOD_KEYS = ['CASH', 'CARD', 'STC_PAY', 'BANK_TRANSFER', 'MIXED', 'INSTALLMENT', 'CREDIT'] as const;
export const SALE_INVOICE_PAYMENT_METHOD_KEYS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'MIXED'] as const;
export const SALE_RECEIPT_PAYMENT_METHOD_KEYS = ['CASH', 'CARD', 'BANK_TRANSFER', 'STC_PAY'] as const;
export const PURCHASE_PAYMENT_METHOD_KEYS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT'] as const;
export const PURCHASE_SETTLEMENT_PAYMENT_METHOD_KEYS = ['CASH', 'CARD', 'BANK_TRANSFER'] as const;
export const EXPENSE_PURCHASE_PAYMENT_METHOD_KEYS = ['CASH', 'BANK_TRANSFER', 'CREDIT'] as const;
export const POS_PAYMENT_METHOD_KEYS = ['CASH', 'CARD', 'MIXED', 'CREDIT', 'BANK_TRANSFER'] as const;
export const SERVICE_INVOICE_PAYMENT_METHOD_KEYS = ['CASH', 'CARD', 'BANK_TRANSFER', 'STC_PAY', 'CREDIT'] as const;

export function normalizePaymentMethodKey(value: unknown, fallback = '') {
    const normalized = String(value || fallback).trim().toUpperCase();
    return normalized === 'BANK' ? 'BANK_TRANSFER' : normalized;
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
