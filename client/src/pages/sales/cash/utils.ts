export const cashStatusColor = (status?: string) => {
    const key = String(status || '').toUpperCase();
    if (key === 'RECONCILED') return 'bg-emerald-100 text-emerald-700';
    if (key === 'DEPOSITED') return 'bg-blue-100 text-blue-700';
    if (key === 'VAULT_RECEIVED') return 'bg-indigo-100 text-indigo-700';
    if (key === 'PICKED_UP' || key === 'IN_TRANSIT') return 'bg-cyan-100 text-cyan-700';
    if (key === 'PICKUP_ASSIGNED' || key === 'DECLARED') return 'bg-amber-100 text-amber-700';
    if (key === 'SHORT' || key === 'LOST') return 'bg-rose-100 text-rose-700';
    if (key === 'EXCESS') return 'bg-violet-100 text-violet-700';
    if (key === 'CANCELLED') return 'bg-gray-100 text-gray-700';
    return 'bg-slate-100 text-slate-700';
};

export const formatMoney = (value: number, currency: string) =>
    `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
