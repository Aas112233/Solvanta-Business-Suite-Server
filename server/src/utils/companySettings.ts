export interface CompanyRegionalSettings {
    timezone: string;
    dateFormat: string;
    timeFormat: '12H' | '24H';
    language: string;
}

export interface CompanyDocumentSettings {
    invoicePrefix: string;
    quotationPrefix: string;
    salesOrderPrefix: string;
}

export const DEFAULT_COMPANY_CURRENCY = 'SAR';

export const DEFAULT_COMPANY_REGIONAL_SETTINGS: CompanyRegionalSettings = {
    timezone: 'Asia/Riyadh',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24H',
    language: 'en',
};

export const DEFAULT_COMPANY_DOCUMENT_SETTINGS: CompanyDocumentSettings = {
    invoicePrefix: 'INV',
    quotationPrefix: 'QUO',
    salesOrderPrefix: 'SO',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

export function resolveCompanyRegionalSettings(settings: unknown): CompanyRegionalSettings {
    const safeSettings = isRecord(settings) ? settings : {};
    const regionalSettings = isRecord(safeSettings.regional) ? safeSettings.regional : {};
    const timeFormat = regionalSettings.timeFormat === '12H' ? '12H' : '24H';

    return {
        timezone: normalizeString(regionalSettings.timezone, DEFAULT_COMPANY_REGIONAL_SETTINGS.timezone),
        dateFormat: normalizeString(regionalSettings.dateFormat, DEFAULT_COMPANY_REGIONAL_SETTINGS.dateFormat),
        timeFormat,
        language: normalizeString(regionalSettings.language, DEFAULT_COMPANY_REGIONAL_SETTINGS.language),
    };
}

export function resolveCompanyDocumentSettings(settings: unknown): CompanyDocumentSettings {
    const safeSettings = isRecord(settings) ? settings : {};
    const documentSettings = isRecord(safeSettings.documents) ? safeSettings.documents : {};

    return {
        invoicePrefix: normalizeString(documentSettings.invoicePrefix, DEFAULT_COMPANY_DOCUMENT_SETTINGS.invoicePrefix),
        quotationPrefix: normalizeString(documentSettings.quotationPrefix, DEFAULT_COMPANY_DOCUMENT_SETTINGS.quotationPrefix),
        salesOrderPrefix: normalizeString(documentSettings.salesOrderPrefix, DEFAULT_COMPANY_DOCUMENT_SETTINGS.salesOrderPrefix),
    };
}
