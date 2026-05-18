import { useAuthStore } from '../stores/authStore';

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

function resolveNestedSettings(source?: unknown) {
    const sourceRecord = isRecord(source) ? source : null;
    return sourceRecord && isRecord(sourceRecord.settings)
        ? sourceRecord.settings
        : source;
}

function getDatePartsFromDate(date: Date, timezone?: string) {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const parts = formatter.formatToParts(date);
        const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return {
            year: map.year || String(date.getFullYear()),
            month: map.month || String(date.getMonth() + 1).padStart(2, '0'),
            day: map.day || String(date.getDate()).padStart(2, '0'),
        };
    } catch {
        return {
            year: String(date.getFullYear()),
            month: String(date.getMonth() + 1).padStart(2, '0'),
            day: String(date.getDate()).padStart(2, '0'),
        };
    }
}

function getDateParts(value: unknown, timezone?: string) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return {
                year: match[1],
                month: match[2],
                day: match[3],
            };
        }
    }

    const date = value instanceof Date ? value : new Date(String(value || ''));
    if (Number.isNaN(date.getTime())) return null;
    return getDatePartsFromDate(date, timezone);
}

export function resolveCompanyCurrency(source?: unknown) {
    const sourceRecord = isRecord(source) ? source : null;
    return normalizeString(sourceRecord?.currency, DEFAULT_COMPANY_CURRENCY).toUpperCase();
}

export function resolveCompanyRegionalSettings(source?: unknown): CompanyRegionalSettings {
    const sourceRecord = isRecord(source) ? source : null;
    const normalizedSettings = sourceRecord && isRecord(sourceRecord.regionalSettings)
        ? sourceRecord.regionalSettings
        : resolveNestedSettings(source);
    const settingsRecord = isRecord(normalizedSettings) ? normalizedSettings : {};
    const regional = isRecord(settingsRecord.regional) ? settingsRecord.regional : settingsRecord;
    const timeFormat = regional.timeFormat === '12H' ? '12H' : '24H';

    return {
        timezone: normalizeString(regional.timezone, DEFAULT_COMPANY_REGIONAL_SETTINGS.timezone),
        dateFormat: normalizeString(regional.dateFormat, DEFAULT_COMPANY_REGIONAL_SETTINGS.dateFormat),
        timeFormat,
        language: normalizeString(regional.language, DEFAULT_COMPANY_REGIONAL_SETTINGS.language),
    };
}

export function resolveCompanyDocumentSettings(source?: unknown): CompanyDocumentSettings {
    const sourceRecord = isRecord(source) ? source : null;
    const normalizedSettings = sourceRecord && isRecord(sourceRecord.documentSettings)
        ? sourceRecord.documentSettings
        : resolveNestedSettings(source);
    const settingsRecord = isRecord(normalizedSettings) ? normalizedSettings : {};
    const documents = isRecord(settingsRecord.documents) ? settingsRecord.documents : settingsRecord;

    return {
        invoicePrefix: normalizeString(documents.invoicePrefix, DEFAULT_COMPANY_DOCUMENT_SETTINGS.invoicePrefix),
        quotationPrefix: normalizeString(documents.quotationPrefix, DEFAULT_COMPANY_DOCUMENT_SETTINGS.quotationPrefix),
        salesOrderPrefix: normalizeString(documents.salesOrderPrefix, DEFAULT_COMPANY_DOCUMENT_SETTINGS.salesOrderPrefix),
    };
}

export function formatDateWithPattern(value: unknown, pattern = DEFAULT_COMPANY_REGIONAL_SETTINGS.dateFormat, timezone?: string) {
    const parts = getDateParts(value, timezone);
    if (!parts) return '';

    if (pattern === 'MM/DD/YYYY') return `${parts.month}/${parts.day}/${parts.year}`;
    if (pattern === 'YYYY-MM-DD') return `${parts.year}-${parts.month}-${parts.day}`;
    return `${parts.day}/${parts.month}/${parts.year}`;
}

export function parseDateWithPattern(value: string, pattern = DEFAULT_COMPANY_REGIONAL_SETTINGS.dateFormat) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const parsed = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!slashMatch) {
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const [, first, second, year] = slashMatch;
    const month = pattern === 'MM/DD/YYYY' ? first : second;
    const day = pattern === 'MM/DD/YYYY' ? second : first;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCompanyDate(value: unknown, source?: unknown) {
    const regional = resolveCompanyRegionalSettings(source);
    return formatDateWithPattern(value, regional.dateFormat, regional.timezone);
}

export function formatCompanyDateTime(value: unknown, source?: unknown) {
    const regional = resolveCompanyRegionalSettings(source);
    const date = value instanceof Date ? value : new Date(String(value || ''));
    if (Number.isNaN(date.getTime())) return '';

    const datePart = formatDateWithPattern(date, regional.dateFormat, regional.timezone);

    try {
        const timePart = new Intl.DateTimeFormat('en-US', {
            timeZone: regional.timezone,
            hour: '2-digit',
            minute: '2-digit',
            ...(regional.timeFormat === '12H' ? { hour12: true } : { hour12: false }),
        }).format(date);
        return `${datePart}, ${timePart}`;
    } catch {
        const fallback = new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            ...(regional.timeFormat === '12H' ? { hour12: true } : { hour12: false }),
        }).format(date);
        return `${datePart}, ${fallback}`;
    }
}

export function toDateInputValue(value?: unknown, source?: unknown) {
    if (!value) {
        return formatDateWithPattern(new Date(), 'YYYY-MM-DD', resolveCompanyRegionalSettings(source).timezone);
    }

    return formatDateWithPattern(value, 'YYYY-MM-DD', resolveCompanyRegionalSettings(source).timezone);
}

export function formatCurrencyAmount(value: number, currency: string) {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
        }).format(value);
    } catch {
        return `${currency} ${Number(value || 0).toFixed(2)}`;
    }
}

export function useCompanyCurrency() {
    return useAuthStore((state) => resolveCompanyCurrency(state.user?.company));
}

export function useCompanyRegionalSettings() {
    return useAuthStore((state) => resolveCompanyRegionalSettings(state.user?.company));
}

export function useCompanyDocumentSettings() {
    return useAuthStore((state) => resolveCompanyDocumentSettings(state.user?.company));
}
