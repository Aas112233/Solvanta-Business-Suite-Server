import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, Save, Plus, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

type InvoiceTemplate =
    | 'THERMAL_CLASSIC'
    | 'THERMAL_COMPACT'
    | 'A4_INVOICE'
    | 'THERMAL_MINIMAL'
    | 'THERMAL_BOLD'
    | 'THERMAL_GRID'
    | 'THERMAL_RESTAURANT'
    | 'THERMAL_PHARMACY'
    | 'THERMAL_GROCERY';
type PaperWidth = '58MM' | '80MM';

type ReceiptSettings = {
    defaultPrinter: string;
    knownPrinters: string[];
    invoiceTemplate: InvoiceTemplate;
    paperWidth: PaperWidth;
    autoShowPreview: boolean;
    autoPrintOnComplete: boolean;
    printCopies: number;
    silentPrint: boolean;
    openCashDrawerAfterPrint: boolean;
    printLogo: boolean;
    showCashier: boolean;
    showCustomer: boolean;
    showTaxBreakdown: boolean;
    showFooterNote: boolean;
    footerNote: string;
    fontSizeBase: number;
    fontSizeItemName: number;
    fontSizeItemMeta: number;
    fontSizePrices: number;
    fontSizeTitle: number;
};

const DEFAULT_SETTINGS: ReceiptSettings = {
    defaultPrinter: '',
    knownPrinters: [],
    invoiceTemplate: 'THERMAL_CLASSIC',
    paperWidth: '80MM',
    autoShowPreview: true,
    autoPrintOnComplete: false,
    printCopies: 1,
    silentPrint: false,
    openCashDrawerAfterPrint: false,
    printLogo: false,
    showCashier: true,
    showCustomer: true,
    showTaxBreakdown: true,
    showFooterNote: true,
    footerNote: 'Thank you for shopping with us.',
    fontSizeBase: 12,
    fontSizeItemName: 12,
    fontSizeItemMeta: 10,
    fontSizePrices: 12,
    fontSizeTitle: 16,
};

import { DEFAULT_POS_RECEIPT_SETTINGS, PREVIEW_RECEIPT_DATA } from '../../lib/posReceiptTemplates';
import ReceiptPreview from '../../components/pos/ReceiptPreview';
import AppLoader from '../../components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';

export default function ReceiptPrintingSettings() {
    const queryClient = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const canEdit = hasPermission('pos.manageTerminals');
    const [form, setForm] = useState<ReceiptSettings>(DEFAULT_SETTINGS);
    const [newPrinter, setNewPrinter] = useState('');
    const [devicePrinters, setDevicePrinters] = useState<ElectronPrinterInfo[]>([]);
    const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
    const [isPrintersExpanded, setIsPrintersExpanded] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['pos-receipt-settings'],
        queryFn: () => api.get('/pos/receipt-settings').then((r) => r.data.data as ReceiptSettings),
    });

    useEffect(() => {
        if (!data) return;
        setForm({
            ...DEFAULT_SETTINGS,
            ...data,
            knownPrinters: Array.isArray(data.knownPrinters) ? data.knownPrinters : [],
        });
    }, [data]);

    const isElectronRuntime = Boolean(window.electronPOS?.isElectron);

    const loadDevicePrinters = async () => {
        if (!window.electronPOS?.getPrinters) return;
        setIsLoadingPrinters(true);
        try {
            const printers = await window.electronPOS.getPrinters();
            setDevicePrinters(printers || []);
            if (printers?.length) {
                const names = printers.map((p) => p.name).filter(Boolean);
                const defaultDevice = printers.find((p) => p.isDefault)?.name || '';
                setForm((prev) => {
                    const mergedKnown = Array.from(new Set([...(prev.knownPrinters || []), ...names]));
                    const nextDefault = prev.defaultPrinter || defaultDevice;
                    return {
                        ...prev,
                        knownPrinters: mergedKnown,
                        defaultPrinter: nextDefault,
                    };
                });
            }
        } catch {
            toast.error('Failed to load system printers from Electron');
        } finally {
            setIsLoadingPrinters(false);
        }
    };

    useEffect(() => {
        if (!isElectronRuntime) return;
        void loadDevicePrinters();
    }, [isElectronRuntime]);

    const saveMut = useMutation({
        mutationFn: (payload: ReceiptSettings) => api.patch('/pos/receipt-settings', payload),
        onSuccess: () => {
            toast.success('Receipt settings saved');
            queryClient.invalidateQueries({ queryKey: ['pos-receipt-settings'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save settings'),
    });

    const visiblePrinters = useMemo(
        () => Array.from(new Set((form.knownPrinters || []).map((p) => p.trim()).filter(Boolean))),
        [form.knownPrinters]
    );

    if (isLoading) { return <AppLoader />; }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Receipt Printing Settings</h1>
                    <p className="text-sm text-gray-500">Set default printer, invoice template, and POS receipt behavior.</p>
                </div>
                <button
                    onClick={() => saveMut.mutate(form)}
                    disabled={!canEdit || saveMut.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                    {saveMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Settings
                </button>
            </div>

            {!canEdit && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    You can view settings, but only users with <code>pos.manageTerminals</code> can edit.
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Printer Setup</h2>
                        {isElectronRuntime && (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                <p className="text-xs text-blue-700">
                                    Electron printer integration is active. Select from connected system printers.
                                </p>
                                <button
                                    onClick={() => void loadDevicePrinters()}
                                    disabled={isLoadingPrinters}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-blue-200 text-blue-700 text-xs font-semibold disabled:opacity-50"
                                >
                                    {isLoadingPrinters ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                    Refresh
                                </button>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Default Printer</label>
                                <AppDropdown
                                    value={form.defaultPrinter}
                                    onChange={(v) => setForm(prev => ({ ...prev, defaultPrinter: v }))}
                                    options={[{ value: '', label: 'Select Printer' }, ...visiblePrinters.map((p: any) => ({ value: p, label: p }))]}
                                    placeholder='Select Printer'
                                    searchable
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Print Copies</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={5}
                                    value={form.printCopies}
                                    onChange={(e) => setForm((p) => ({ ...p, printCopies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) }))}
                                    disabled={!canEdit}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                />
                            </div>
                        </div>
                        <div className="pt-2 border-t border-gray-100">
                            <button
                                onClick={() => setIsPrintersExpanded(!isPrintersExpanded)}
                                className="flex items-center gap-2 w-full text-left group"
                            >
                                <div className="p-1 rounded bg-gray-50 text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-600 transition-colors">
                                    {isPrintersExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer">Known Printers</label>
                                <span className="ml-auto text-[10px] font-bold text-gray-400">
                                    {visiblePrinters.length} configured
                                </span>
                            </button>

                            {isPrintersExpanded && (
                                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex gap-2">
                                        <input
                                            value={newPrinter}
                                            onChange={(e) => setNewPrinter(e.target.value)}
                                            disabled={!canEdit}
                                            placeholder="Add printer name (e.g., EPSON TM-T82)"
                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                        />
                                        <button
                                            disabled={!canEdit}
                                            onClick={() => {
                                                const name = newPrinter.trim();
                                                if (!name) return;
                                                setForm((p) => ({
                                                    ...p,
                                                    knownPrinters: Array.from(new Set([...(p.knownPrinters || []), name])),
                                                    defaultPrinter: p.defaultPrinter || name,
                                                }));
                                                setNewPrinter('');
                                            }}
                                            className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {visiblePrinters.length === 0 && <p className="text-xs text-gray-500">No printers added yet.</p>}
                                        {visiblePrinters.map((p) => (
                                            <div key={p} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm text-gray-700 truncate">{p}</div>
                                                    {isElectronRuntime && devicePrinters.some((d) => d.name === p && d.isDefault) && (
                                                        <div className="text-[10px] text-blue-600 font-semibold">System Default</div>
                                                    )}
                                                </div>
                                                <button
                                                    disabled={!canEdit}
                                                    onClick={() => {
                                                        setForm((prev) => ({
                                                            ...prev,
                                                            knownPrinters: prev.knownPrinters.filter((x) => x !== p),
                                                            defaultPrinter: prev.defaultPrinter === p ? '' : prev.defaultPrinter,
                                                        }));
                                                    }}
                                                    className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {isElectronRuntime
                                            ? 'Loaded from your machine via Electron. You can still add custom aliases manually.'
                                            : 'Web browsers cannot read system printer list directly. Add printer names manually.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Template & Paper</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Template</label>
                                <AppDropdown
                                    value={form.invoiceTemplate}
                                    onChange={(v) => setForm(prev => ({ ...prev, invoiceTemplate: v as InvoiceTemplate }))}
                                    options={[{ value: 'THERMAL_CLASSIC', label: 'Thermal Classic' }, { value: 'THERMAL_COMPACT', label: 'Thermal Compact' }, { value: 'A4_INVOICE', label: 'A4 Invoice' }, { value: 'THERMAL_MINIMAL', label: 'Thermal Minimal' }, { value: 'THERMAL_BOLD', label: 'Thermal Bold' }, { value: 'THERMAL_GRID', label: 'Thermal Grid' }, { value: 'THERMAL_RESTAURANT', label: 'Restaurant Style' }, { value: 'THERMAL_PHARMACY', label: 'Pharmacy Style' }, { value: 'THERMAL_GROCERY', label: 'Grocery Style' }]}
                                    placeholder='Thermal Classic'
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Paper Width</label>
                                <AppDropdown
                                    value={form.paperWidth}
                                    onChange={(v) => setForm(prev => ({ ...prev, paperWidth: v as PaperWidth }))}
                                    options={[{ value: '80MM', label: '80mm Thermal' }, { value: '58MM', label: '58mm Thermal' }]}
                                    placeholder='80mm Thermal'
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Footer Note</label>
                            <textarea
                                value={form.footerNote}
                                onChange={(e) => setForm((p) => ({ ...p, footerNote: e.target.value }))}
                                disabled={!canEdit}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm min-h-[80px]"
                                placeholder="Lines support (Enter for new line)"
                            />
                        </div>
                    </section>

                    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Font Customization (px)</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            {[
                                { key: 'fontSizeBase', label: 'Base Text Size' },
                                { key: 'fontSizeItemName', label: 'Item Name Size' },
                                { key: 'fontSizeItemMeta', label: 'Unit/Meta Size' },
                                { key: 'fontSizePrices', label: 'Price Size' },
                                { key: 'fontSizeTitle', label: 'Company Title Size' },
                            ].map((f) => (
                                <div key={f.key}>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-xs font-semibold text-gray-600">{f.label}</label>
                                        <span className="text-xs font-bold text-blue-600">{(form as any)[f.key]}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="8"
                                        max="30"
                                        value={(form as any)[f.key] || 12}
                                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: parseInt(e.target.value) } as ReceiptSettings))}
                                        disabled={!canEdit}
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Behavior Rules</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                ['autoShowPreview', 'Show print popup after sale'],
                                ['autoPrintOnComplete', 'Auto print after sale'],
                                ['silentPrint', 'Silent print (Electron only)'],
                                ['openCashDrawerAfterPrint', 'Open cash drawer after print'],
                                ['printLogo', 'Print company logo'],
                                ['showCashier', 'Show cashier name'],
                                ['showCustomer', 'Show customer name'],
                                ['showTaxBreakdown', 'Show tax details'],
                                ['showFooterNote', 'Show footer note'],
                            ].map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={Boolean((form as any)[key])}
                                        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked } as ReceiptSettings))}
                                        disabled={!canEdit}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </section>
                </div>

                <aside className="space-y-4">
                    <section className="bg-white border border-gray-200 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Printer size={16} className="text-gray-500" />
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Preview</h3>
                        </div>
                        <div className="bg-gray-100 rounded-xl p-4 overflow-auto min-h-[ 800px] flex justify-center items-start">
                            <ReceiptPreview
                                receipt={PREVIEW_RECEIPT_DATA}
                                settings={{
                                    ...DEFAULT_POS_RECEIPT_SETTINGS,
                                    ...form,
                                }}
                            />
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
