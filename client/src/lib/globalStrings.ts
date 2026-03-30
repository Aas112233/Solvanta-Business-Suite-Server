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

const PAYMENT_METHOD_ORDER = [
    'CASH',
    'CARD',
    'STC_PAY',
    'BANK_TRANSFER',
    'MIXED',
    'INSTALLMENT',
    'CREDIT',
] as const;

export const DEFAULT_SALE_PAYMENT_METHOD_OPTIONS: GlobalStringOption[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'CARD', label: 'Card' },
    { value: 'STC_PAY', label: 'STC Pay' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'MIXED', label: 'Split Pay' },
    { value: 'INSTALLMENT', label: 'Installments' },
    { value: 'CREDIT', label: 'Credit' },
];

export const DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS: GlobalStringOption[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'CARD', label: 'Card' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'CREDIT', label: 'Credit' },
];

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
    const allowedKeys = new Set((params.allowedKeys || []).map((key) => key.toUpperCase()));
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

                const value = String(entry.systemKey || entry.value || '').trim().toUpperCase();
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
