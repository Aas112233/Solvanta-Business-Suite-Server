import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';

export interface CompanyTaxSettings {
    label: string;
    defaultRate: number;
    inclusivePricing: boolean;
}

export const DEFAULT_COMPANY_TAX_SETTINGS: CompanyTaxSettings = {
    label: 'Tax',
    defaultRate: 0,
    inclusivePricing: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeTaxRate(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0;
    return parsed;
}

function normalizeTaxLabel(value: unknown) {
    if (typeof value !== 'string') return DEFAULT_COMPANY_TAX_SETTINGS.label;
    const trimmed = value.trim();
    return trimmed || DEFAULT_COMPANY_TAX_SETTINGS.label;
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

export function resolveEffectiveTaxRate(candidates: unknown[], companyTax?: Partial<CompanyTaxSettings> | null) {
    for (const candidate of candidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
            return parsed;
        }
    }

    return normalizeTaxRate(companyTax?.defaultRate);
}

export function formatTaxLabel(labelOrSettings?: string | Partial<CompanyTaxSettings> | null, rate?: number) {
    const settings = typeof labelOrSettings === 'string' || !labelOrSettings
        ? null
        : labelOrSettings;
    const label = typeof labelOrSettings === 'string'
        ? normalizeTaxLabel(labelOrSettings)
        : normalizeTaxLabel(settings?.label);
    const effectiveRate = normalizeTaxRate(rate ?? settings?.defaultRate);

    return `${label} (${(effectiveRate * 100).toFixed(0)}%)`;
}

export function useCompanyTaxSettings() {
    const company = useAuthStore((state) => state.user?.company);
    return useMemo(() => resolveCompanyTaxSettings(company), [company]);
}
