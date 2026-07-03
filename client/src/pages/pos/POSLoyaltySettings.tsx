import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Smile } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { DEFAULT_CURRENCY } from '../../lib/constants';
import AppLoader from '../../components/ui/AppLoader';

type LoyaltySettings = {
    pointsPerCurrencyUnit: number;
    redemptionPointsPerUnit: number;
    redemptionCurrencyValue: number;
    allowFractionalPoints: boolean;
};

const DEFAULT_SETTINGS: LoyaltySettings = {
    pointsPerCurrencyUnit: 1,
    redemptionPointsPerUnit: 100,
    redemptionCurrencyValue: 0.5,
    allowFractionalPoints: false,
};

export default function POSLoyaltySettings() {
    const queryClient = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const canEdit = hasPermission('pos.manageTerminals');

    const [form, setForm] = useState<LoyaltySettings>(DEFAULT_SETTINGS);

    const { data, isLoading } = useQuery({
        queryKey: ['pos-loyalty-settings'],
        queryFn: () => api.get('/pos/loyalty-settings').then((r) => r.data.data as LoyaltySettings),
    });

    useEffect(() => {
        if (!data) return;
        setForm({ ...DEFAULT_SETTINGS, ...data });
    }, [data]);

    const saveMut = useMutation({
        mutationFn: (payload: LoyaltySettings) => api.patch('/pos/loyalty-settings', payload),
        onSuccess: () => {
            toast.success('Loyalty settings saved');
            queryClient.invalidateQueries({ queryKey: ['pos-loyalty-settings'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save loyalty settings'),
    });

    const valuePerPoint = useMemo(() => {
        const points = Number(form.redemptionPointsPerUnit || 0);
        const value = Number(form.redemptionCurrencyValue || 0);
        if (!Number.isFinite(points) || points <= 0 || !Number.isFinite(value) || value <= 0) return 0;
        return value / points;
    }, [form.redemptionPointsPerUnit, form.redemptionCurrencyValue]);

    const sampleEarned = useMemo(() => {
        const raw = 100 * Number(form.pointsPerCurrencyUnit || 0);
        return form.allowFractionalPoints ? Number(raw.toFixed(2)) : Math.round(raw);
    }, [form.pointsPerCurrencyUnit, form.allowFractionalPoints]);

    const sampleValue = useMemo(() => Number((100 * valuePerPoint).toFixed(2)), [valuePerPoint]);

    if (isLoading) { return <AppLoader />; }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Happiness Price Settings</h1>
                    <p className="text-sm text-gray-500">Configure loyalty point accrual and redemption rules for POS walk-in customers.</p>
                </div>
                <button
                    type="button"
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
                    You can view this setup, but only <code>pos.manageTerminals</code> can save changes.
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <section className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Point Rules</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Points Per 1 {currency}</label>
                            <input
                                type="number"
                                min={0.0001}
                                step="0.01"
                                value={form.pointsPerCurrencyUnit}
                                disabled={!canEdit}
                                onChange={(e) => setForm((prev) => ({ ...prev, pointsPerCurrencyUnit: Math.max(0.0001, Number(e.target.value) || 1) }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Redeem Value ({currency})</label>
                            <input
                                type="number"
                                min={0.01}
                                step="0.01"
                                value={form.redemptionCurrencyValue}
                                disabled={!canEdit}
                                onChange={(e) => setForm((prev) => ({ ...prev, redemptionCurrencyValue: Math.max(0.01, Number(e.target.value) || 0.5) }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Redeem Points Required</label>
                            <input
                                type="number"
                                min={1}
                                step="1"
                                value={form.redemptionPointsPerUnit}
                                disabled={!canEdit}
                                onChange={(e) => setForm((prev) => ({ ...prev, redemptionPointsPerUnit: Math.max(1, Number(e.target.value) || 100) }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                        </div>

                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={form.allowFractionalPoints}
                                    disabled={!canEdit}
                                    onChange={(e) => setForm((prev) => ({ ...prev, allowFractionalPoints: e.target.checked }))}
                                />
                                Allow fractional points
                            </label>
                            <p className="text-xs text-gray-500 mt-2">If disabled, earned and redeemed points are rounded to whole numbers.</p>
                        </div>
                    </div>
                </section>

                <section className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2 text-pink-700">
                        <Smile size={16} />
                        <h2 className="text-sm font-bold uppercase tracking-wider">Live Preview</h2>
                    </div>

                    <div className="rounded-xl bg-white/80 border border-pink-100 p-3 text-sm text-gray-700 space-y-2">
                        <div className="flex justify-between">
                            <span>100 {currency} Sale</span>
                            <span className="font-bold">+{sampleEarned} pts</span>
                        </div>
                        <div className="flex justify-between">
                            <span>100 Points</span>
                            <span className="font-bold">{sampleValue.toFixed(2)} {currency}</span>
                        </div>
                        <div className="text-xs text-gray-500 pt-2 border-t border-pink-100">
                            1 point = {valuePerPoint.toFixed(5)} {currency}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
