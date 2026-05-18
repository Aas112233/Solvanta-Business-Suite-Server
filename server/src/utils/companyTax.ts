export interface CompanyTaxSettings {
    label: string;
    defaultRate: number;
    inclusivePricing: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTaxLabel(value: unknown) {
    if (typeof value !== 'string') return 'Tax';
    const trimmed = value.trim();
    return trimmed || 'Tax';
}

function normalizeTaxRate(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0;
    return parsed;
}

export function resolveCompanyTaxSettings(settings: unknown): CompanyTaxSettings {
    const safeSettings = isRecord(settings) ? settings : {};
    const taxSettings = isRecord(safeSettings.tax) ? safeSettings.tax : {};

    return {
        label: normalizeTaxLabel(taxSettings.label),
        defaultRate: normalizeTaxRate(taxSettings.defaultRate),
        inclusivePricing: Boolean(taxSettings.inclusivePricing),
    };
}
