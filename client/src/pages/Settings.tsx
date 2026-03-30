import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Building2, Loader2, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import { useAuthStore } from '../stores/authStore';
import AppLoader from '../components/ui/AppLoader';
import AppDropdown from '../components/ui/AppDropdown';

type CompanyResponse = {
    id: string;
    name: string;
    vatNumber?: string | null;
    currency: string;
    logoUrl?: string | null;
    settings?: Record<string, any>;
};

type SettingsForm = {
    name: string;
    vatNumber: string;
    currency: string;
    logoUrl: string;
    contactPhone: string;
    contactEmail: string;
    website: string;
    address: string;
    timezone: string;
    dateFormat: string;
    timeFormat: '12H' | '24H';
    language: string;
    lowStockThreshold: number;
    invoicePrefix: string;
    quotationPrefix: string;
    salesOrderPrefix: string;
};

const currencyOptions = ['SAR', 'USD', 'EUR', 'GBP', 'AED', 'PKR', 'INR', 'KWD', 'QAR'];
const dateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const timezoneOptions = [
    'Asia/Riyadh',
    'Asia/Dubai',
    'UTC',
    'Europe/London',
    'America/New_York',
    'Asia/Karachi',
];

const emptyForm: SettingsForm = {
    name: '',
    vatNumber: '',
    currency: 'SAR',
    logoUrl: '',
    contactPhone: '',
    contactEmail: '',
    website: '',
    address: '',
    timezone: 'Asia/Riyadh',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24H',
    language: 'en',
    lowStockThreshold: 10,
    invoicePrefix: 'INV',
    quotationPrefix: 'QUO',
    salesOrderPrefix: 'SO',
};

function parseForm(company?: CompanyResponse): { form: SettingsForm; rawSettings: Record<string, any> } {
    if (!company) return { form: emptyForm, rawSettings: {} };

    const settings = (company.settings && typeof company.settings === 'object' && !Array.isArray(company.settings))
        ? company.settings
        : {};

    const inventory = settings.inventory || {};
    const documents = settings.documents || {};
    const contact = settings.contact || {};
    const regional = settings.regional || {};

    return {
        rawSettings: settings,
        form: {
            name: String(company.name || ''),
            vatNumber: String(company.vatNumber || ''),
            currency: String(company.currency || 'SAR'),
            logoUrl: String(company.logoUrl || ''),
            contactPhone: String(contact.phone || ''),
            contactEmail: String(contact.email || ''),
            website: String(contact.website || ''),
            address: String(contact.address || ''),
            timezone: String(regional.timezone || 'Asia/Riyadh'),
            dateFormat: String(regional.dateFormat || 'DD/MM/YYYY'),
            timeFormat: regional.timeFormat === '12H' ? '12H' : '24H',
            language: String(regional.language || 'en'),
            lowStockThreshold: Number(inventory.lowStockThreshold ?? settings.lowStockThreshold ?? 10),
            invoicePrefix: String(documents.invoicePrefix || settings.invoicePrefix || 'INV'),
            quotationPrefix: String(documents.quotationPrefix || 'QUO'),
            salesOrderPrefix: String(documents.salesOrderPrefix || 'SO'),
        },
    };
}

export default function Settings() {
    const qc = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const canEdit = hasPermission('admin.manageSettings');
    const authUser = useAuthStore((s) => s.user);
    const setUser = useAuthStore((s) => s.setUser);

    const [form, setForm] = useState<SettingsForm>(emptyForm);
    const [rawSettings, setRawSettings] = useState<Record<string, any>>({});

    const { data: company, isLoading, refetch } = useQuery({
        queryKey: ['company-settings'],
        queryFn: () => api.get('/companies/me').then((r) => r.data.data as CompanyResponse),
    });

    useEffect(() => {
        const parsed = parseForm(company);
        setForm(parsed.form);
        setRawSettings(parsed.rawSettings);
    }, [company]);

    const initialSnapshot = useMemo(() => JSON.stringify(parseForm(company).form), [company]);
    const currentSnapshot = useMemo(() => JSON.stringify(form), [form]);
    const hasUnsavedChanges = initialSnapshot !== currentSnapshot;

    const updateMut = useMutation({
        mutationFn: async (next: SettingsForm) => {
            const payload = {
                name: next.name.trim(),
                vatNumber: next.vatNumber.trim() || null,
                currency: next.currency,
                logoUrl: next.logoUrl.trim() || null,
                settings: {
                    ...rawSettings,
                    contact: {
                        ...(rawSettings.contact || {}),
                        phone: next.contactPhone.trim(),
                        email: next.contactEmail.trim(),
                        website: next.website.trim(),
                        address: next.address.trim(),
                    },
                    regional: {
                        ...(rawSettings.regional || {}),
                        timezone: next.timezone,
                        dateFormat: next.dateFormat,
                        timeFormat: next.timeFormat,
                        language: next.language.trim() || 'en',
                    },
                    inventory: {
                        ...(rawSettings.inventory || {}),
                        lowStockThreshold: Number(next.lowStockThreshold || 0),
                    },
                    documents: {
                        ...(rawSettings.documents || {}),
                        invoicePrefix: next.invoicePrefix.trim() || 'INV',
                        quotationPrefix: next.quotationPrefix.trim() || 'QUO',
                        salesOrderPrefix: next.salesOrderPrefix.trim() || 'SO',
                    },
                },
            };
            const res = await api.patch('/companies/me', payload);
            return res.data.data as CompanyResponse;
        },
        onSuccess: (saved) => {
            toast.success('Global settings saved');
            qc.invalidateQueries({ queryKey: ['company-settings'] });
            qc.invalidateQueries({ queryKey: ['company'] });
            if (authUser) {
                setUser({
                    ...authUser,
                    company: {
                        ...authUser.company,
                        name: saved.name || authUser.company.name,
                        currency: saved.currency || authUser.company.currency,
                        logoUrl: saved.logoUrl ?? authUser.company.logoUrl,
                    },
                });
            }
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save settings'),
    });

    function setField<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    if (isLoading) { return <AppLoader />; }

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Global Settings</h1>
                        <ModuleRefreshButton queryKeys={[['company-settings']]} />
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Configure company profile, tax defaults, inventory thresholds, and document preferences.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                    <RefreshCw size={14} /> Reload
                </button>
            </div>

            {!canEdit && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
                    <ShieldAlert size={16} className="mt-0.5" />
                    You can view settings, but only users with `admin.manageSettings` can update them.
                </div>
            )}

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!canEdit) return;
                    updateMut.mutate(form);
                }}
                className="space-y-6"
            >
                <section className="rounded-xl p-6 space-y-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl gradient-accent flex items-center justify-center">
                            <Building2 size={20} className="text-white" />
                        </div>
                        <div>
                            <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Company Profile</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Base identity and public contact details</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Company Name</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.name} onChange={(e) => setField('name', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">VAT Number</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.vatNumber} onChange={(e) => setField('vatNumber', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Currency</label>
                            <AppDropdown
                                value={form.currency}
                                onChange={(v) => setField('currency', v)}
                                options={currencyOptions.map((c) => ({ value: c, label: c }))}
                                placeholder="Select Currency"
                                disabled={!canEdit}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Logo URL</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.logoUrl} onChange={(e) => setField('logoUrl', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Phone</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Email</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.contactEmail} onChange={(e) => setField('contactEmail', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Website</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.website} onChange={(e) => setField('website', e.target.value)} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Address</label>
                            <textarea className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200 resize-none" rows={2} disabled={!canEdit} value={form.address} onChange={(e) => setField('address', e.target.value)} />
                        </div>
                    </div>
                </section>

                <section className="rounded-xl p-6 space-y-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Regional Defaults</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Timezone</label>
                            <AppDropdown
                                value={form.timezone}
                                onChange={(v) => setField('timezone', v)}
                                options={timezoneOptions.map((z) => ({ value: z, label: z }))}
                                placeholder="Select Timezone"
                                disabled={!canEdit}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Date Format</label>
                            <AppDropdown
                                value={form.dateFormat}
                                onChange={(v) => setField('dateFormat', v)}
                                options={dateFormats.map((f) => ({ value: f, label: f }))}
                                placeholder="Select Date Format"
                                disabled={!canEdit}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Time Format</label>
                            <AppDropdown
                                value={form.timeFormat}
                                onChange={(v) => setField('timeFormat', v as '12H' | '24H')}
                                options={[{ value: '24H', label: '24 Hours' }, { value: '12H', label: '12 Hours' }]}
                                placeholder="Select Time Format"
                                disabled={!canEdit}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Language</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.language} onChange={(e) => setField('language', e.target.value)} />
                        </div>
                    </div>
                </section>

                <section className="rounded-xl p-6 space-y-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Operational Defaults</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Sales Order Prefix</label>
                            <input className="w-full rounded-lg px-3 py-2.5 text-sm border border-gray-200" disabled={!canEdit} value={form.salesOrderPrefix} onChange={(e) => setField('salesOrderPrefix', e.target.value)} />
                        </div>
                    </div>
                </section>

                <div className="flex items-center justify-between rounded-xl p-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {hasUnsavedChanges ? 'You have unsaved changes.' : 'All settings are up to date.'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                const parsed = parseForm(company);
                                setForm(parsed.form);
                                setRawSettings(parsed.rawSettings);
                            }}
                            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                        >
                            Reset
                        </button>
                        <button
                            type="submit"
                            disabled={updateMut.isPending || !hasUnsavedChanges}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                        >
                            {updateMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {updateMut.isPending ? 'Saving...' : 'Save Global Settings'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
