import { useState, useEffect } from 'react';
import AppLoader from '../components/ui/AppLoader';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import AppDropdown from '../components/ui/AppDropdown';
import {
    Building2, Globe, Receipt, Landmark, CreditCard, CheckCircle2,
    ChevronRight, ChevronLeft, Loader2, Sparkles, ArrowRight, Check,
    Wallet, BookOpen, Zap, ShieldCheck, Settings2, ChevronDown, ChevronUp,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

type CompanyResponse = {
    id: string;
    name: string;
    vatNumber?: string | null;
    currency: string;
    logoUrl?: string | null;
    settings?: Record<string, any>;
};

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

interface SeedResult {
    accountsCreated: number;
    accountsExisted: number;
    totalAccounts: number;
    mappingsCreated: number;
    accounts: Array<{ id: string; code: string; name: string; type: AccountType }>;
    mappings: Array<{ mappingType: string; code: string; name: string }>;
}

const DEFAULT_SEED_ACCOUNTS: Array<{ code: string; name: string; type: AccountType }> = [
    { code: '1000', name: 'Cash', type: 'ASSET' },
    { code: '1010', name: 'Bank', type: 'ASSET' },
    { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
    { code: '1300', name: 'Inventory Asset', type: 'ASSET' },
    { code: '1400', name: 'Input Tax (VAT)', type: 'ASSET' },
    { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
    { code: '2100', name: 'Output Tax (VAT)', type: 'LIABILITY' },
    { code: '3000', name: 'Owner Equity', type: 'EQUITY' },
    { code: '3100', name: 'Retained Earnings', type: 'EQUITY' },
    { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
    { code: '4100', name: 'Sales Returns', type: 'REVENUE' },
    { code: '4200', name: 'Discount Given', type: 'REVENUE' },
    { code: '5000', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE' },
    { code: '5100', name: 'Purchase Returns', type: 'EXPENSE' },
    { code: '5200', name: 'Discount Received', type: 'EXPENSE' },
    { code: '5300', name: 'Damaged Goods', type: 'EXPENSE' },
    { code: '5400', name: 'Shrinkage', type: 'EXPENSE' },
    { code: '6000', name: 'General Expenses', type: 'EXPENSE' },
];

const AUTO_MAPPING_RULES: Record<string, string> = {
    '1000': 'CASH',
    '1010': 'BANK',
    '1200': 'ACCOUNT_RECEIVABLE',
    '1300': 'INVENTORY_ASSET',
    '1400': 'INPUT_TAX',
    '2000': 'ACCOUNT_PAYABLE',
    '2100': 'OUTPUT_TAX',
    '4000': 'SALES_REVENUE',
    '4100': 'SALES_RETURN',
    '5000': 'COGS_EXPENSE',
    '5200': 'DISCOUNT_RECEIVED',
    '4200': 'DISCOUNT_GIVEN',
    '5300': 'DAMAGED_GOODS_EXPENSE',
    '5400': 'SHRINKAGE_EXPENSE',
};

async function seedAccountsViaAccountingRoutes(): Promise<SeedResult> {
    const existingAccounts = await api.get('/accounting/accounts').then((r) => r.data.data as SeedResult['accounts']);
    const existingCodes = new Set(existingAccounts.map((account) => account.code));

    let accountsCreated = 0;
    for (const account of DEFAULT_SEED_ACCOUNTS) {
        if (existingCodes.has(account.code)) continue;
        await api.post('/accounting/accounts', account);
        accountsCreated += 1;
    }

    const allAccounts = await api.get('/accounting/accounts').then((r) => r.data.data as SeedResult['accounts']);
    const accountByCode = new Map(allAccounts.map((account) => [account.code, account]));
    const existingMappings = await api.get('/accounting/mappings').then((r) => r.data.data as Array<{
        mappingType: string;
        entityType: string;
        entityId?: string | null;
    }>);

    const existingGlobalMappings = new Set(
        existingMappings
            .filter((mapping) => mapping.entityType === 'GLOBAL' && !mapping.entityId)
            .map((mapping) => mapping.mappingType)
    );

    const mappings: SeedResult['mappings'] = [];
    for (const [code, mappingType] of Object.entries(AUTO_MAPPING_RULES)) {
        const account = accountByCode.get(code);
        if (!account || existingGlobalMappings.has(mappingType)) continue;

        await api.post('/accounting/mappings', {
            mappingType,
            entityType: 'GLOBAL',
            entityId: null,
            accountId: account.id,
        });
        mappings.push({ mappingType, code, name: account.name });
    }

    return {
        accountsCreated,
        accountsExisted: existingAccounts.length,
        totalAccounts: allAccounts.length,
        mappingsCreated: mappings.length,
        accounts: allAccounts,
        mappings,
    };
}

const MAPPING_TYPE_LABELS: Record<string, { label: string; icon: typeof Wallet }> = {
    CASH: { label: 'Cash', icon: Wallet },
    BANK: { label: 'Bank', icon: Landmark },
    ACCOUNT_RECEIVABLE: { label: 'Accounts Receivable', icon: ArrowRight },
    ACCOUNT_PAYABLE: { label: 'Accounts Payable', icon: CreditCard },
    INVENTORY_ASSET: { label: 'Inventory Asset', icon: BookOpen },
    COGS_EXPENSE: { label: 'Cost of Goods Sold', icon: Receipt },
    SALES_REVENUE: { label: 'Sales Revenue', icon: Sparkles },
    SALES_RETURN: { label: 'Sales Return', icon: Receipt },
    OUTPUT_TAX: { label: 'Output Tax (VAT)', icon: Receipt },
    INPUT_TAX: { label: 'Input Tax (VAT)', icon: Receipt },
    DISCOUNT_GIVEN: { label: 'Discount Given', icon: Receipt },
    DISCOUNT_RECEIVED: { label: 'Discount Received', icon: Receipt },
    DAMAGED_GOODS_EXPENSE: { label: 'Damaged Goods', icon: Receipt },
    SHRINKAGE_EXPENSE: { label: 'Shrinkage', icon: Receipt },
};

const currencyOptions = ['SAR', 'USD', 'EUR', 'GBP', 'AED', 'BDT', 'PKR', 'INR', 'KWD', 'QAR'];
const dateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const timezoneOptions = [
    'Asia/Riyadh', 'Asia/Dubai', 'UTC', 'Europe/London',
    'America/New_York', 'Asia/Karachi',
];

// ──────────────────────────────────────────────────────────────
// Wizard Steps Definition (5 steps — merged accounts+mappings)
// ──────────────────────────────────────────────────────────────

const STEPS = [
    { id: 'welcome', label: 'Welcome', icon: Sparkles },
    { id: 'profile', label: 'Company Profile', icon: Building2 },
    { id: 'regional', label: 'Regional & Tax', icon: Globe },
    { id: 'accounts', label: 'Accounts & Mappings', icon: Landmark },
    { id: 'review', label: 'Review & Finish', icon: CheckCircle2 },
];

// ──────────────────────────────────────────────────────────────
// Account type badge colors
// ──────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<AccountType, { bg: string; text: string }> = {
    ASSET: { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
    LIABILITY: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
    EQUITY: { bg: 'rgba(168,85,247,0.12)', text: '#a855f7' },
    REVENUE: { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' },
    EXPENSE: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
};

// ──────────────────────────────────────────────────────────────
// Main Wizard Component
// ──────────────────────────────────────────────────────────────

export default function SetupWizard() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const authUser = useAuthStore((s) => s.user);
    const setUser = useAuthStore((s) => s.setUser);
    const companyName = authUser?.company?.name || 'Your Company';

    const [step, setStep] = useState(0);
    const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
    const [showMappingDetails, setShowMappingDetails] = useState(false);
    const [showAccountDetails, setShowAccountDetails] = useState(false);

    // Company profile form state
    const [profile, setProfile] = useState({
        name: '', vatNumber: '', currency: 'SAR', logoUrl: '',
        contactPhone: '', contactEmail: '', website: '', address: '',
    });

    // Regional & Tax form state
    const [regional, setRegional] = useState({
        timezone: 'Asia/Riyadh', dateFormat: 'DD/MM/YYYY', timeFormat: '24H' as '12H' | '24H',
        language: 'en', taxLabel: 'VAT', defaultTaxRate: 0.15,
    });

    // Operational defaults
    const [operational, setOperational] = useState({
        lowStockThreshold: 10, invoicePrefix: 'INV',
        quotationPrefix: 'QUO', salesOrderPrefix: 'SO',
    });

    // ── Fetch company data ──
    const { data: company, isLoading } = useQuery({
        queryKey: ['company-settings'],
        queryFn: () => api.get('/companies/me').then((r) => r.data.data as CompanyResponse),
        retry: 1,
    });

    // ── Fetch existing accounts to check initial state ──
    const { data: existingAccounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: () => api.get('/accounting/accounts').then((r) => r.data.data as any[]),
        retry: false,
    });

    // Initialize form from fetched company data
    useEffect(() => {
        if (!company) return;
        const s = company.settings || {};
        const contact = s.contact || {};
        const reg = s.regional || {};
        const tax = s.tax || {};
        const inv = s.inventory || {};
        const docs = s.documents || {};

        setProfile({
            name: company.name || '',
            vatNumber: company.vatNumber || '',
            currency: company.currency || 'SAR',
            logoUrl: company.logoUrl || '',
            contactPhone: contact.phone || '',
            contactEmail: contact.email || '',
            website: contact.website || '',
            address: contact.address || '',
        });
        setRegional({
            timezone: reg.timezone || 'Asia/Riyadh',
            dateFormat: reg.dateFormat || 'DD/MM/YYYY',
            timeFormat: reg.timeFormat || '24H',
            language: reg.language || 'en',
            taxLabel: tax.label || 'VAT',
            defaultTaxRate: tax.defaultRate ?? 0.15,
        });
        setOperational({
            lowStockThreshold: inv.lowStockThreshold ?? 10,
            invoicePrefix: docs.invoicePrefix || 'INV',
            quotationPrefix: docs.quotationPrefix || 'QUO',
            salesOrderPrefix: docs.salesOrderPrefix || 'SO',
        });
    }, [company]);

    // Check if accounts have been seeded previously
    useEffect(() => {
        if (existingAccounts && existingAccounts.length > 5 && !seedResult) {
            setSeedResult({
                accountsCreated: 0,
                accountsExisted: existingAccounts.length,
                totalAccounts: existingAccounts.length,
                mappingsCreated: 0,
                accounts: existingAccounts,
                mappings: [],
            });
        }
    }, [existingAccounts, seedResult]);

    // ── Save profile + regional/tax + operational via PATCH /companies/me ──
    const saveMut = useMutation({
        mutationFn: async () => {
            const payload = {
                name: profile.name.trim(),
                vatNumber: profile.vatNumber.trim() || null,
                currency: profile.currency,
                logoUrl: profile.logoUrl.trim() || null,
                settings: {
                    contact: {
                        phone: profile.contactPhone.trim(),
                        email: profile.contactEmail.trim(),
                        website: profile.website.trim(),
                        address: profile.address.trim(),
                    },
                    regional: {
                        timezone: regional.timezone,
                        dateFormat: regional.dateFormat,
                        timeFormat: regional.timeFormat,
                        language: regional.language.trim() || 'en',
                    },
                    tax: {
                        label: regional.taxLabel.trim() || 'VAT',
                        defaultRate: Number(regional.defaultTaxRate || 0),
                    },
                    inventory: {
                        lowStockThreshold: Number(operational.lowStockThreshold || 0),
                    },
                    documents: {
                        invoicePrefix: operational.invoicePrefix.trim() || 'INV',
                        quotationPrefix: operational.quotationPrefix.trim() || 'QUO',
                        salesOrderPrefix: operational.salesOrderPrefix.trim() || 'SO',
                    },
                },
            };
            await api.patch('/companies/me', payload);
        },
    });

    // ── One-click Smart Setup: Seed accounts + Auto-map ──
    const seedMut = useMutation({
        mutationFn: async () => {
            return seedAccountsViaAccountingRoutes();
        },
        onSuccess: (data) => {
            setSeedResult(data);
            qc.invalidateQueries({ queryKey: ['accounts'] });
            const total = data.accountsCreated + data.mappingsCreated;
            if (total > 0) {
                toast.success(`✨ Created ${data.accountsCreated} accounts & ${data.mappingsCreated} mappings automatically!`);
            } else {
                toast.success('Accounts & mappings are already set up!');
            }
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to set up accounts');
        },
    });

    // ── Complete Setup ──
    const completeMut = useMutation({
        mutationFn: async () => {
            // Save settings first
            await saveMut.mutateAsync();
            // Mark as completed
            await api.patch('/companies/me/setup-complete');
        },
        onSuccess: () => {
            toast.success('🎉 Setup completed! Welcome to your dashboard.');
            qc.invalidateQueries({ queryKey: ['company-settings'] });
            if (authUser) {
                setUser({
                    ...authUser,
                    company: {
                        ...authUser.company,
                        name: profile.name || authUser.company.name,
                        currency: profile.currency || authUser.company.currency,
                        setupCompleted: true,
                    },
                });
            }
            navigate('/');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to complete setup'),
    });

    // ── Step navigation ──
    const goNext = () => {
        if (step === STEPS.length - 1) {
            completeMut.mutate();
            return;
        }
        // Auto-save on leaving profile or regional step
        if (step === 1 || step === 2) {
            saveMut.mutate();
        }
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const goBack = () => setStep((s) => Math.max(s - 1, 0));

    if (isLoading) { return <AppLoader />; }

    // ──────────────────────────────────────────────────────────────
    // Step Components
    // ──────────────────────────────────────────────────────────────

    const StepWelcome = (
        <div className="text-center py-8 space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                <Sparkles size={36} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                Welcome, {authUser?.name || 'Admin'}! 🎉
            </h2>
            <p className="text-lg max-w-lg mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                Let's set up <strong>{companyName}</strong> for operations. This wizard will guide you through configuring your company profile, regional settings, and accounting system.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-8">
                {[
                    { icon: Building2, title: 'Company Profile', desc: 'Name, contact, currency' },
                    { icon: Globe, title: 'Regional Setup', desc: 'Timezone, tax defaults' },
                    { icon: Zap, title: 'Smart Accounts', desc: 'One-click account setup' },
                ].map((item) => (
                    <div key={item.title} className="rounded-xl p-4 space-y-2" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <item.icon size={24} style={{ color: 'var(--color-accent)' }} />
                        <p className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{item.title}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );

    const StepProfile = (
        <div className="space-y-5">
            <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Company Profile</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Basic identity and contact information</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                    ['Company Name', 'name', 'text'],
                    ['VAT Number', 'vatNumber', 'text'],
                    ['Phone', 'contactPhone', 'text'],
                    ['Email', 'contactEmail', 'email'],
                    ['Website', 'website', 'text'],
                    ['Logo URL', 'logoUrl', 'text'],
                ] as const).map(([label, key, type]) => (
                    <div key={key}>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
                        <input
                            type={type}
                            className="w-full rounded-lg px-3 py-2.5 text-sm"
                            style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
                            value={(profile as any)[key]}
                            onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                        />
                    </div>
                ))}
                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Currency</label>
                    <AppDropdown
                        value={profile.currency}
                        onChange={(v) => setProfile(prev => ({ ...prev, currency: v }))}
                        options={[...currencyOptions.map((c: any) => ({ value: c, label: c }))]}
                        placeholder='Select'
                        searchable
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Address</label>
                    <textarea
                        rows={2}
                        className="w-full rounded-lg px-3 py-2.5 text-sm resize-none"
                        style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
                        value={profile.address}
                        onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
                    />
                </div>
            </div>
        </div>
    );

    const StepRegional = (
        <div className="space-y-5">
            <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Regional & Tax Defaults</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Timezone, date formats, and tax configuration</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Timezone</label>
                    <AppDropdown
                        value={regional.timezone}
                        onChange={(v) => setRegional(prev => ({ ...prev, timezone: v }))}
                        options={[...timezoneOptions.map((z: any) => ({ value: z, label: z }))]}
                        placeholder='Select'
                        searchable
                    />
                </div>
                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Date Format</label>
                    <AppDropdown
                        value={regional.dateFormat}
                        onChange={(v) => setRegional(prev => ({ ...prev, dateFormat: v }))}
                        options={[...dateFormats.map((f: any) => ({ value: f, label: f }))]}
                        placeholder='Select'
                        searchable
                    />
                </div>
                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Time Format</label>
                    <AppDropdown
                        value={regional.timeFormat}
                        onChange={(v) => setRegional(prev => ({ ...prev, timeFormat: v as '12H' | '24H' }))}
                        options={[{ value: '24H', label: '24 Hours' }, { value: '12H', label: '12 Hours' }]}
                        placeholder='24 Hours'
                    />
                </div>
                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Language</label>
                    <input className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }} value={regional.language} onChange={(e) => setRegional((r) => ({ ...r, language: e.target.value }))} />
                </div>
                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Tax Label</label>
                    <input className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }} value={regional.taxLabel} onChange={(e) => setRegional((r) => ({ ...r, taxLabel: e.target.value }))} />
                </div>
                <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Default Tax Rate (0-1)</label>
                    <input type="number" step="0.01" min={0} max={1} className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }} value={regional.defaultTaxRate} onChange={(e) => setRegional((r) => ({ ...r, defaultTaxRate: Number(e.target.value) }))} />
                </div>
            </div>
            <div className="mt-4">
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>Document Prefixes</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Invoice Prefix</label>
                        <input className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }} value={operational.invoicePrefix} onChange={(e) => setOperational((o) => ({ ...o, invoicePrefix: e.target.value }))} />
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Quotation Prefix</label>
                        <input className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }} value={operational.quotationPrefix} onChange={(e) => setOperational((o) => ({ ...o, quotationPrefix: e.target.value }))} />
                    </div>
                    <div>
                        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>Sales Order Prefix</label>
                        <input className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }} value={operational.salesOrderPrefix} onChange={(e) => setOperational((o) => ({ ...o, salesOrderPrefix: e.target.value }))} />
                    </div>
                </div>
            </div>
        </div>
    );

    // ──────────────────────────────────────────────────────────────
    // UNIFIED Accounts & Mappings Step (replaces old Steps 4 + 5)
    // ──────────────────────────────────────────────────────────────

    const StepAccounts = (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Accounts & Mappings</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Set up your chart of accounts and payment mappings with one click. The system will create 18 essential accounts and automatically map them for sales, purchases, inventory, and tax processing.
                </p>
            </div>

            {seedResult ? (
                /* ── SUCCESS STATE ── */
                <div className="space-y-4">
                    {/* Summary Banner */}
                    <div className="rounded-xl p-6 space-y-4" style={{
                        background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(59,130,246,0.08))',
                        border: '1px solid rgba(34,197,94,0.25)',
                    }}>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            }}>
                                <ShieldCheck size={24} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                                    Accounting System Ready!
                                </p>
                                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                    {seedResult.totalAccounts} accounts configured · {seedResult.mappingsCreated > 0
                                        ? `${seedResult.mappingsCreated} mappings auto-configured`
                                        : 'All mappings in place'}
                                </p>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'Total Accounts', value: seedResult.totalAccounts, color: '#3b82f6' },
                                { label: 'Auto-Mapped', value: seedResult.mappingsCreated > 0 ? seedResult.mappingsCreated : '14', color: '#22c55e' },
                                { label: 'Account Types', value: '5', color: '#a855f7' },
                            ].map((stat) => (
                                <div key={stat.label} className="rounded-lg p-3 text-center" style={{
                                    background: 'var(--color-bg-card)',
                                    border: '1px solid var(--color-border)',
                                }}>
                                    <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Auto-Mapped Accounts — Collapsible */}
                    <div className="rounded-xl overflow-hidden" style={{
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <button
                            onClick={() => setShowMappingDetails(!showMappingDetails)}
                            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                            style={{ borderBottom: showMappingDetails ? '1px solid var(--color-border)' : 'none' }}
                        >
                            <div className="flex items-center gap-2">
                                <CreditCard size={16} style={{ color: 'var(--color-accent)' }} />
                                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                    Auto-Mapped Payment Accounts
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{
                                    background: 'rgba(34,197,94,0.12)',
                                    color: '#22c55e',
                                }}>
                                    14 mapped
                                </span>
                            </div>
                            {showMappingDetails ? <ChevronUp size={16} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />}
                        </button>
                        {showMappingDetails && (
                            <div className="px-5 py-4 space-y-2">
                                {Object.entries(MAPPING_TYPE_LABELS).map(([key, meta]) => {
                                    const mapped = seedResult.mappings.find((m) => m.mappingType === key);
                                    const account = seedResult.accounts.find((a) => {
                                        // Match by the auto-mapping rules
                                        const codeMap: Record<string, string> = {
                                            CASH: '1000', BANK: '1010', ACCOUNT_RECEIVABLE: '1200',
                                            ACCOUNT_PAYABLE: '2000', INVENTORY_ASSET: '1300', COGS_EXPENSE: '5000',
                                            SALES_REVENUE: '4000', SALES_RETURN: '4100', OUTPUT_TAX: '2100', INPUT_TAX: '1400',
                                            DISCOUNT_GIVEN: '4200', DISCOUNT_RECEIVED: '5200',
                                            DAMAGED_GOODS_EXPENSE: '5300', SHRINKAGE_EXPENSE: '5400',
                                        };
                                        return a.code === codeMap[key];
                                    });
                                    const IconComponent = meta.icon;
                                    return (
                                        <div key={key} className="flex items-center gap-3 py-1.5">
                                            <IconComponent size={14} style={{ color: 'var(--color-accent)' }} />
                                            <span className="text-xs font-medium w-44" style={{ color: 'var(--color-text-secondary)' }}>
                                                {meta.label}
                                            </span>
                                            <ArrowRight size={12} style={{ color: 'var(--color-text-muted)' }} />
                                            <span className="text-xs font-mono" style={{ color: 'var(--color-accent)' }}>
                                                {account?.code || mapped?.code || '—'}
                                            </span>
                                            <span className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                                                {account?.name || mapped?.name || 'Not mapped'}
                                            </span>
                                            <Check size={12} className="ml-auto" style={{ color: '#22c55e' }} />
                                        </div>
                                    );
                                })}
                                <p className="text-xs pt-2" style={{ color: 'var(--color-text-muted)' }}>
                                    You can customize mappings anytime from Settings → Accounting.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Chart of Accounts — Collapsible */}
                    <div className="rounded-xl overflow-hidden" style={{
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <button
                            onClick={() => setShowAccountDetails(!showAccountDetails)}
                            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                            style={{ borderBottom: showAccountDetails ? '1px solid var(--color-border)' : 'none' }}
                        >
                            <div className="flex items-center gap-2">
                                <Landmark size={16} style={{ color: 'var(--color-accent)' }} />
                                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                    Chart of Accounts
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{
                                    background: 'rgba(59,130,246,0.12)',
                                    color: '#3b82f6',
                                }}>
                                    {seedResult.totalAccounts} accounts
                                </span>
                            </div>
                            {showAccountDetails ? <ChevronUp size={16} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />}
                        </button>
                        {showAccountDetails && (
                            <div className="px-5 py-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {seedResult.accounts
                                        .sort((a, b) => a.code.localeCompare(b.code))
                                        .map((acc) => {
                                            const typeColor = TYPE_COLORS[acc.type] || { bg: 'var(--color-bg-primary)', text: 'var(--color-text-muted)' };
                                            return (
                                                <div key={acc.id || acc.code} className="flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={{
                                                    background: 'var(--color-bg-primary)',
                                                    border: '1px solid var(--color-border)',
                                                }}>
                                                    <span className="font-mono font-bold" style={{ color: 'var(--color-accent)' }}>{acc.code}</span>
                                                    <span className="flex-1" style={{ color: 'var(--color-text-primary)' }}>{acc.name}</span>
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{
                                                        background: typeColor.bg,
                                                        color: typeColor.text,
                                                    }}>
                                                        {acc.type}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                </div>
                                <p className="text-xs pt-3" style={{ color: 'var(--color-text-muted)' }}>
                                    You can add, edit, or rearrange accounts anytime from the Accounting module.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* ── INITIAL STATE — One-click setup ── */
                <div className="rounded-xl p-8 space-y-6 text-center" style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                }}>
                    <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    }}>
                        <Zap size={32} className="text-white" />
                    </div>

                    <div className="space-y-2">
                        <h4 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                            Smart Account Setup
                        </h4>
                        <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                            One click creates <strong>18 essential accounts</strong> covering assets, liabilities, equity, revenue, and expenses — then <strong>automatically maps 14 payment types</strong> so your accounting system is ready to use instantly.
                        </p>
                    </div>

                    {/* Preview what will be created */}
                    <div className="grid grid-cols-5 gap-2 max-w-md mx-auto">
                        {([
                            { type: 'ASSET' as AccountType, count: 5 },
                            { type: 'LIABILITY' as AccountType, count: 2 },
                            { type: 'EQUITY' as AccountType, count: 2 },
                            { type: 'REVENUE' as AccountType, count: 3 },
                            { type: 'EXPENSE' as AccountType, count: 6 },
                        ]).map((item) => {
                            const typeColor = TYPE_COLORS[item.type];
                            return (
                                <div key={item.type} className="rounded-lg p-2 text-center" style={{
                                    background: typeColor.bg,
                                    border: `1px solid ${typeColor.text}25`,
                                }}>
                                    <p className="text-lg font-bold" style={{ color: typeColor.text }}>{item.count}</p>
                                    <p className="text-[10px] font-medium" style={{ color: typeColor.text }}>{item.type}</p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-center gap-3 pt-2">
                        <button
                            onClick={() => seedMut.mutate()}
                            disabled={seedMut.isPending}
                            className="flex items-center gap-2.5 px-8 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                            style={{
                                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                            }}
                        >
                            {seedMut.isPending ? (
                                <><Loader2 size={18} className="animate-spin" /> Setting up...</>
                            ) : (
                                <><Zap size={18} /> Set Up Everything</>
                            )}
                        </button>
                    </div>

                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        <Settings2 size={11} className="inline mr-1" />
                        You can customize everything later from the Accounting module
                    </p>
                </div>
            )}
        </div>
    );

    const StepReview = (
        <div className="space-y-5">
            <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Review & Complete</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Review your setup and click "Complete Setup" to start using the system.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                        <Building2 size={18} style={{ color: 'var(--color-accent)' }} />
                        <h4 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>Company Profile</h4>
                    </div>
                    <dl className="space-y-1 text-xs">
                        {([
                            ['Name', profile.name], ['VAT', profile.vatNumber || '—'], ['Currency', profile.currency],
                            ['Phone', profile.contactPhone || '—'], ['Email', profile.contactEmail || '—'],
                        ] as const).map(([label, val]) => (
                            <div key={label} className="flex justify-between">
                                <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
                                <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{val}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                        <Globe size={18} style={{ color: 'var(--color-accent)' }} />
                        <h4 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>Regional & Tax</h4>
                    </div>
                    <dl className="space-y-1 text-xs">
                        {([
                            ['Timezone', regional.timezone], ['Date Format', regional.dateFormat], ['Time', regional.timeFormat],
                            ['Tax Label', regional.taxLabel], ['Tax Rate', `${(regional.defaultTaxRate * 100).toFixed(0)}%`],
                        ] as const).map(([label, val]) => (
                            <div key={label} className="flex justify-between">
                                <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
                                <dd className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{val}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                        <Landmark size={18} style={{ color: 'var(--color-accent)' }} />
                        <h4 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>Chart of Accounts</h4>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {seedResult ? (
                            <span className="flex items-center gap-1.5">
                                <Check size={12} style={{ color: '#22c55e' }} />
                                {seedResult.totalAccounts} accounts configured
                            </span>
                        ) : 'Not configured (can set up later)'}
                    </p>
                </div>
                <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                        <CreditCard size={18} style={{ color: 'var(--color-accent)' }} />
                        <h4 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>Account Mappings</h4>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {seedResult ? (
                            <span className="flex items-center gap-1.5">
                                <Check size={12} style={{ color: '#22c55e' }} />
                                14 payment mappings auto-configured
                            </span>
                        ) : 'Not configured (can set up later)'}
                    </p>
                </div>
            </div>
        </div>
    );

    const stepContent = [StepWelcome, StepProfile, StepRegional, StepAccounts, StepReview];

    // ──────────────────────────────────────────────────────────────
    // Render
    // ──────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-primary)' }}>
            {/* Header Bar */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                        <Building2 size={18} className="text-white" />
                    </div>
                    <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Setup Wizard</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{companyName}</p>
                    </div>
                </div>
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    Step {step + 1} of {STEPS.length}
                </p>
            </div>

            {/* Progress Bar */}
            <div className="px-6 py-3" style={{ background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-1 max-w-3xl mx-auto">
                    {STEPS.map((s, i) => {
                        const isCompleted = i < step;
                        const isCurrent = i === step;
                        return (
                            <div key={s.id} className="flex-1 flex items-center gap-1">
                                <button
                                    onClick={() => i <= step && setStep(i)}
                                    className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg transition-all"
                                    style={{
                                        color: isCurrent ? 'var(--color-accent)' : isCompleted ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                        background: isCurrent ? 'var(--color-accent-light, rgba(99,102,241,0.1))' : 'transparent',
                                        cursor: i <= step ? 'pointer' : 'default',
                                    }}
                                    disabled={i > step}
                                >
                                    {isCompleted ? <Check size={12} /> : <s.icon size={12} />}
                                    <span className="hidden sm:inline">{s.label}</span>
                                </button>
                                {i < STEPS.length - 1 && (
                                    <div className="flex-1 h-0.5 rounded-full" style={{ background: isCompleted ? 'var(--color-accent)' : 'var(--color-border)' }} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-3xl mx-auto px-6 py-8">
                    {stepContent[step]}
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                <button
                    onClick={goBack}
                    disabled={step === 0}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-30"
                    style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                >
                    <ChevronLeft size={16} /> Back
                </button>
                <button
                    onClick={goNext}
                    disabled={completeMut.isPending || saveMut.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                    {completeMut.isPending ? (
                        <><Loader2 size={16} className="animate-spin" /> Completing...</>
                    ) : step === STEPS.length - 1 ? (
                        <><CheckCircle2 size={16} /> Complete Setup</>
                    ) : (
                        <>Next <ChevronRight size={16} /></>
                    )}
                </button>
            </div>
        </div>
    );
}
