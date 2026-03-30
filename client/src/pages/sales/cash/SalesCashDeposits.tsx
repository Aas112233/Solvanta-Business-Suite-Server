import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import ModuleRefreshButton from '../../../components/ModuleRefreshButton';
import { cashStatusColor, formatMoney } from './utils';

export default function SalesCashDeposits() {
    const queryClient = useQueryClient();
    const activeBranchId = useAuthStore((s) => s.activeBranchId);
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [savingId, setSavingId] = useState('');

    const { data: pendingData, isLoading: pendingLoading } = useQuery({
        queryKey: ['sales-cash-pending-deposit', activeBranchId],
        queryFn: () => api.get('/sales/cash/bags', {
            params: { status: 'VAULT_RECEIVED,SHORT,EXCESS', page: 1, limit: 200 },
        }).then((r) => r.data),
    });

    const { data: depositData, isLoading: depositLoading, isFetching: depositFetching } = useQuery({
        queryKey: ['sales-cash-deposits', activeBranchId, search],
        queryFn: () => api.get('/sales/cash/deposits', {
            params: { page: 1, limit: 200, search: search || undefined },
        }).then((r) => r.data),
    });

    const depositMut = useMutation({
        mutationFn: (payload: any) => api.post(`/sales/cash/bags/${payload.bagId}/deposit`, payload.body),
        onSuccess: () => {
            toast.success('Deposit posted');
            queryClient.invalidateQueries({ queryKey: ['sales-cash-pending-deposit'] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-deposits'] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['sales-cash-runs'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to post deposit'),
        onSettled: () => setSavingId(''),
    });

    const pending = pendingData?.data || [];
    const deposits = depositData?.data || [];
    const depositSummary = depositData?.meta?.summary;

    const handleDeposit = (bag: any) => {
        const bankAccount = window.prompt('Bank account name/reference', 'Main Bank Account');
        if (!bankAccount) return;
        const slipNo = window.prompt('Deposit slip number', `SLIP-${Date.now().toString().slice(-6)}`);
        if (!slipNo) return;
        const defaultAmount = Number((bag.vaultAmount ?? bag.collectedAmount ?? bag.declaredAmount) || 0);
        const rawAmount = window.prompt('Deposit amount', String(defaultAmount));
        if (rawAmount === null) return;
        const amount = Number(rawAmount);
        if (!Number.isFinite(amount) || amount < 0) return toast.error('Invalid amount');

        setSavingId(bag.id);
        depositMut.mutate({
            bagId: bag.id,
            body: {
                bankAccount,
                depositSlipNo: slipNo,
                amount,
                depositDate: new Date().toISOString().slice(0, 10),
            },
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bank Deposits</h1>
                    <p className="text-sm text-gray-500">Deposit vaulted branch collections and track deposit slips</p>
                </div>
                <ModuleRefreshButton queryKeys={[['sales-cash-pending-deposit', activeBranchId], ['sales-cash-deposits', activeBranchId]]} />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-900">Pending Deposit Bags</h2>
                    <span className="text-xs text-gray-500">Count: {pending.length}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="py-2 pr-3">Bag</th>
                                <th className="py-2 pr-3">Run</th>
                                <th className="py-2 pr-3">Branch</th>
                                <th className="py-2 pr-3 text-right">Vault Amount</th>
                                <th className="py-2 pr-3">Status</th>
                                <th className="py-2">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingLoading ? (
                                <tr><td colSpan={6} className="py-6 text-center text-gray-500"><Loader2 className="mx-auto animate-spin" size={16} /></td></tr>
                            ) : pending.length === 0 ? (
                                <tr><td colSpan={6} className="py-6 text-center text-gray-500">No bags waiting for deposit.</td></tr>
                            ) : pending.map((bag: any) => (
                                <tr key={bag.id} className="border-t border-gray-100">
                                    <td className="py-2 pr-3 font-semibold text-gray-900">{bag.bagCode}</td>
                                    <td className="py-2 pr-3 text-gray-600">{bag.run?.runNo}</td>
                                    <td className="py-2 pr-3 text-gray-700">{bag.branch?.name}</td>
                                    <td className="py-2 pr-3 text-right text-gray-900">{formatMoney(Number((bag.vaultAmount ?? bag.collectedAmount ?? bag.declaredAmount) || 0), currency)}</td>
                                    <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cashStatusColor(bag.status)}`}>{bag.status}</span></td>
                                    <td className="py-2">
                                        <button
                                            onClick={() => handleDeposit(bag)}
                                            disabled={savingId === bag.id}
                                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                        >
                                            {savingId === bag.id ? 'Saving...' : 'Deposit'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-sm font-semibold text-gray-900">Deposit History</h2>
                    <div className="relative w-full md:w-80">
                        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') setSearch(searchInput.trim());
                            }}
                            placeholder="Search slip/account/deposit no"
                            className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm"
                        />
                    </div>
                </div>
                <p className="text-xs text-gray-500">Total deposited: {formatMoney(Number(depositSummary?.totalAmount || 0), currency)}</p>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="py-2 pr-3">Deposit No</th>
                                <th className="py-2 pr-3">Date</th>
                                <th className="py-2 pr-3">Bag</th>
                                <th className="py-2 pr-3">Branch</th>
                                <th className="py-2 pr-3">Slip</th>
                                <th className="py-2 pr-3">Bank</th>
                                <th className="py-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(depositLoading || depositFetching) && deposits.length === 0 ? (
                                <tr><td colSpan={7} className="py-6 text-center text-gray-500"><Loader2 className="mx-auto animate-spin" size={16} /></td></tr>
                            ) : deposits.length === 0 ? (
                                <tr><td colSpan={7} className="py-6 text-center text-gray-500">No deposits found.</td></tr>
                            ) : deposits.map((row: any) => (
                                <tr key={row.id} className="border-t border-gray-100">
                                    <td className="py-2 pr-3 font-semibold text-gray-900">{row.depositNo}</td>
                                    <td className="py-2 pr-3 text-gray-600">{new Date(row.depositDate).toLocaleDateString()}</td>
                                    <td className="py-2 pr-3 text-gray-700">{row.bag?.bagCode}</td>
                                    <td className="py-2 pr-3 text-gray-700">{row.bag?.branch?.name}</td>
                                    <td className="py-2 pr-3 text-gray-700">{row.depositSlipNo}</td>
                                    <td className="py-2 pr-3 text-gray-700">{row.bankAccount}</td>
                                    <td className="py-2 text-right font-semibold text-gray-900">{formatMoney(Number(row.amount || 0), currency)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
