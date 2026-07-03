import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import toast from '@/lib/toast';
import api from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import ModuleRefreshButton from '../../../components/ModuleRefreshButton';
import { cashStatusColor, formatMoney } from './utils';
import { DEFAULT_CURRENCY } from '../../../lib/constants';

export default function SalesCashReconciliation() {
    const queryClient = useQueryClient();
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;
    const [savingId, setSavingId] = useState('');

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['sales-cash-reconciliation-bags', activeBranchId],
        queryFn: () => api.get('/sales/cash/bags', {
            params: { status: 'DEPOSITED', page: 1, limit: 200 },
        }).then((r) => r.data),
    });

    const reconcileMut = useMutation({
        mutationFn: ({ bagId, reconciledAmount }: { bagId: string; reconciledAmount: number }) =>
            api.post(`/sales/cash/bags/${bagId}/reconcile`, { reconciledAmount }),
        onSuccess: () => {
            toast.success('Bag reconciled');
            queryClient.invalidateQueries({ queryKey: ['sales-cash-reconciliation-bags'] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-deposits'] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-runs'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to reconcile bag'),
        onSettled: () => setSavingId(''),
    });

    const bags = data?.data || [];

    const handleReconcile = (bag: any) => {
        const baseline = Number((bag.vaultAmount ?? bag.collectedAmount ?? bag.declaredAmount) || 0);
        const defaultAmount = Number(bag.depositedAmount ?? baseline);
        const raw = window.prompt(`Reconciled amount for bag ${bag.bagCode}`, String(defaultAmount));
        if (raw === null) return;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) return toast.error('Invalid amount');

        setSavingId(bag.id);
        reconcileMut.mutate({ bagId: bag.id, reconciledAmount: value });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reconciliation</h1>
                    <p className="text-sm text-gray-500">Finalize deposited cash and post short/excess variance</p>
                </div>
                <ModuleRefreshButton queryKeys={[['sales-cash-reconciliation-bags', activeBranchId]]} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-4 py-3">Bag</th>
                            <th className="px-4 py-3">Run</th>
                            <th className="px-4 py-3">Branch</th>
                            <th className="px-4 py-3 text-right">Baseline</th>
                            <th className="px-4 py-3 text-right">Deposited</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(isLoading || isFetching) && bags.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                                    <Loader2 className="mx-auto mb-2 animate-spin" size={18} />
                                    Loading reconciliation queue...
                                </td>
                            </tr>
                        ) : bags.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No deposit records pending reconciliation.</td></tr>
                        ) : bags.map((bag: any) => {
                            const baseline = Number((bag.vaultAmount ?? bag.collectedAmount ?? bag.declaredAmount) || 0);
                            return (
                                <tr key={bag.id} className="border-t border-gray-100">
                                    <td className="px-4 py-3 font-semibold text-gray-900">{bag.bagCode}</td>
                                    <td className="px-4 py-3 text-gray-600">{bag.run?.runNo}</td>
                                    <td className="px-4 py-3 text-gray-700">{bag.branch?.name}</td>
                                    <td className="px-4 py-3 text-right text-gray-900">{formatMoney(baseline, currency)}</td>
                                    <td className="px-4 py-3 text-right text-gray-900">{formatMoney(Number(bag.depositedAmount || 0), currency)}</td>
                                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cashStatusColor(bag.status)}`}>{bag.status}</span></td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleReconcile(bag)}
                                            disabled={savingId === bag.id}
                                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                        >
                                            {savingId === bag.id ? 'Saving...' : 'Reconcile'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
