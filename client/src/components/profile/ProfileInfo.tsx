import type { ReactNode } from 'react';

interface ProfileSectionProps {
    title: string;
    subtitle?: string;
    children: ReactNode;
}

interface ProfileFieldProps {
    label: string;
    value: ReactNode;
}

interface ProfileUsageMeterProps {
    label: string;
    count: number;
    limit: number | null;
}

const STORAGE_STATUS_STYLES = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    breached: 'border-red-200 bg-red-50 text-red-700',
} as const;

const STORAGE_STATUS_LABELS = {
    ok: 'Healthy',
    warning: 'Warning',
    breached: 'Breached',
} as const;

export function ProfileSection({ title, subtitle, children }: ProfileSectionProps) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
                {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {children}
        </section>
    );
}

export function ProfileField({ label, value }: ProfileFieldProps) {
    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
        </div>
    );
}

export function StorageStatusBadge({ status }: { status: keyof typeof STORAGE_STATUS_STYLES }) {
    return (
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STORAGE_STATUS_STYLES[status]}`}>
            {STORAGE_STATUS_LABELS[status]}
        </span>
    );
}

export function ProfileUsageMeter({ label, count, limit }: ProfileUsageMeterProps) {
    const percent = limit && limit > 0 ? Math.min(Math.round((count / limit) * 100), 100) : null;
    const barClass = percent === null
        ? 'bg-slate-300'
        : percent >= 100
            ? 'bg-red-500'
            : percent >= 80
                ? 'bg-amber-500'
                : 'bg-emerald-500';

    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{count.toLocaleString()}</p>
                </div>
                <p className="text-xs font-medium text-slate-500">
                    {limit === null ? 'Unlimited' : `${limit.toLocaleString()} max`}
                </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                    className={`h-full rounded-full transition-all duration-300 ${barClass}`}
                    style={{ width: `${percent ?? 100}%` }}
                />
            </div>
            <p className="mt-2 text-xs text-slate-500">
                {percent === null ? 'No configured limit' : `${percent}% of allowance used`}
            </p>
        </div>
    );
}
