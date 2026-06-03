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

export function resolveCompanyTaxSettings(source?: unknown): CompanyTaxSettings {
    const sourceRecord = isRecord(source) ? source : null;
    const taxSettings = sourceRecord && isRecord(sourceRecord.taxSettings)
        ? sourceRecord.taxSettings
        : null;

    if (taxSettings) {
        return {
            label: normalizeTaxLabel(taxSettings.label),
            defaultRate: normalizeTaxRate(taxSettings.defaultRate),
            inclusivePricing: Boolean(taxSettings.inclusivePricing),
        };
    }

    const settings = sourceRecord && 'settings' in sourceRecord
        ? sourceRecord.settings
        : source;
    const settingsRecord = isRecord(settings) ? settings : null;
    const tax = settingsRecord && isRecord(settingsRecord.tax) ? settingsRecord.tax : null;

    return {
        label: normalizeTaxLabel(tax?.label),
        defaultRate: normalizeTaxRate(tax?.defaultRate),
        inclusivePricing: Boolean(tax?.inclusivePricing),
    };
}
