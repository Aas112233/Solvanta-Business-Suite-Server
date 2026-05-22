import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import {
    ArrowLeft,
    Calendar,
    Calculator,
    DollarSign,
    Clock,
    TrendingDown,
    Building2,
    CheckCircle,
    XCircle,
    Trash2,
    Loader2,
    X,
    ExternalLink,
    HelpCircle,
    BookOpen
} from 'lucide-react';
import AppDropdown from '../../../components/ui/AppDropdown';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
}

interface DepreciationLog {
    id: string;
    depreciationDate: string;
    amount: number;
    journalEntryId?: string;
    journalEntry?: {
        id: string;
        entryNo: string;
        date: string;
    };
}

interface FixedAsset {
    id: string;
    assetCode: string;
    name: string;
    description?: string;
    purchaseDate: string;
    purchaseCost: number;
    salvageValue: number;
    usefulLifeMonths: number;
    depreciationMethod: 'STRAIGHT_LINE' | 'DOUBLE_DECLINING';
    status: 'ACTIVE' | 'FULLY_DEPRECIATED' | 'DISPOSED';
    currentAccumDepreciation: number;
    assetAccountId: string;
    accumDepAccountId: string;
    depExpAccountId: string;
    assetAccount: { code: string; name: string };
    accumDepAccount: { code: string; name: string };
    depExpAccount: { code: string; name: string };
    branch?: { name: string };
    disposalDate?: string;
    disposalAmount?: number;
    disposalMemo?: string;
    disposalJournalId?: string;
    depreciationLogs: DepreciationLog[];
}

export default function FixedAssetDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Modal states
    const [isDepreciateModalOpen, setIsDepreciateModalOpen] = useState(false);
    const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
    const [depError, setDepError] = useState('');
    const [disposalError, setDisposalError] = useState('');

    // Action Form states
    const [depreciationDate, setDepreciationDate] = useState(new Date().toISOString().slice(0, 10));
    const [disposalData, setDisposalData] = useState({
        disposalDate: new Date().toISOString().slice(0, 10),
        disposalAmount: '0',
        disposalMemo: '',
        settlementAccountId: '',
        gainLossAccountId: ''
    });

    // Queries
    const { data: asset, isLoading, error } = useQuery<FixedAsset>({
        queryKey: ['fixedAsset', id],
        queryFn: async () => {
            const res = await api.get(`/fixed-assets/${id}`);
            return res.data.data;
        },
        enabled: !!id
    });

    const { data: accounts = [] } = useQuery<Account[]>({
        queryKey: ['accounts-lite'],
        queryFn: async () => {
            const res = await api.get('/accounting/accounts');
            return res.data.data;
        }
    });

    // Mutations
    const depreciateMutation = useMutation({
        mutationFn: async (date: string) => {
            const res = await api.post(`/fixed-assets/${id}/depreciate`, { depreciationDate: date });
            return res.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['fixedAsset', id] });
            setIsDepreciateModalOpen(false);
            setDepError('');
            alert(data.message || 'Depreciation logged and posted successfully');
        },
        onError: (err: any) => {
            setDepError(err.response?.data?.error?.message || 'Failed to run depreciation');
        }
    });

    const disposeMutation = useMutation({
        mutationFn: async (payload: any) => {
            const res = await api.post(`/fixed-assets/${id}/dispose`, payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['fixedAsset', id] });
            setIsDisposeModalOpen(false);
            setDisposalError('');
            alert('Asset disposed and posted successfully');
        },
        onError: (err: any) => {
            setDisposalError(err.response?.data?.error?.message || 'Failed to dispose asset');
        }
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                <p className="text-sm font-medium">Loading asset details...</p>
            </div>
        );
    }

    if (error || !asset) {
        return (
            <div className="p-6 max-w-lg mx-auto text-center space-y-4">
                <XCircle className="w-16 h-16 text-rose-500 mx-auto" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Fixed Asset Not Found</h3>
                <p className="text-gray-500">The asset you are looking for might have been removed or does not exist.</p>
                <Link
                    to="/accounting/fixed-assets"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-205 rounded-xl text-sm font-semibold transition"
                >
                    <ArrowLeft size={16} /> Back to Register
                </Link>
            </div>
        );
    }

    const handleDepreciateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setDepError('');
        depreciateMutation.mutate(depreciationDate);
    };

    const handleDisposeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setDisposalError('');

        if (!disposalData.disposalDate) return setDisposalError('Disposal date is required');
        if (Number(disposalData.disposalAmount) < 0) return setDisposalError('Disposal proceeds must be non-negative');
        if (!disposalData.settlementAccountId) return setDisposalError('Bank/Settlement account is required');
        if (!disposalData.gainLossAccountId) return setDisposalError('Gain/Loss write-off account is required');

        disposeMutation.mutate({
            disposalDate: disposalData.disposalDate,
            disposalAmount: Number(disposalData.disposalAmount),
            disposalMemo: disposalData.disposalMemo || undefined,
            settlementAccountId: disposalData.settlementAccountId,
            gainLossAccountId: disposalData.gainLossAccountId
        });
    };

    // Calculations
    const nbv = asset.purchaseCost - asset.currentAccumDepreciation;
    const progressPercent = Math.min(
        100,
        Math.round((asset.currentAccumDepreciation / (asset.purchaseCost - asset.salvageValue || 1)) * 100)
    );

    // Remaining useful life estimation
    const monthsDepreciated = asset.depreciationLogs.length;
    const remainingMonths = Math.max(0, asset.usefulLifeMonths - monthsDepreciated);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Breadcrumbs and Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <Link
                        to="/accounting/fixed-assets"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition"
                    >
                        <ArrowLeft size={14} /> Back to Fixed Assets
                    </Link>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                            {asset.name}
                        </h1>
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                            asset.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                : asset.status === 'FULLY_DEPRECIATED'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                        }`}>
                            {asset.status.replace(/_/g, ' ')}
                        </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">ID: {asset.assetCode}</p>
                </div>

                {asset.status === 'ACTIVE' && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsDisposeModalOpen(true)}
                            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 text-sm font-semibold rounded-xl transition"
                        >
                            Dispose Asset
                        </button>
                        <button
                            onClick={() => setIsDepreciateModalOpen(true)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition flex items-center gap-2"
                        >
                            <Calculator className="w-4 h-4" />
                            Log Depreciation
                        </button>
                    </div>
                )}
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left panel: Info and Logs */}
                <div className="lg:col-span-2 space-y-6">
                    {/* General Specs */}
                    <div className="p-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-150 dark:border-gray-800 shadow-sm space-y-5">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Asset Parameters</h3>

                        {asset.description && (
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl text-sm text-gray-600 dark:text-gray-300">
                                <span className="font-semibold block text-xs text-gray-450 uppercase mb-1">Description</span>
                                {asset.description}
                            </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded-lg text-gray-500">
                                    <Calendar size={18} />
                                </div>
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-400 uppercase">Purchase Date</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                        {new Date(asset.purchaseDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded-lg text-gray-500">
                                    <Clock size={18} />
                                </div>
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-400 uppercase">Useful Life</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{asset.usefulLifeMonths} Months</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded-lg text-gray-500">
                                    <BookOpen size={18} />
                                </div>
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-400 uppercase">Method</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                        {asset.depreciationMethod === 'STRAIGHT_LINE' ? 'Straight Line' : 'Double Declining'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded-lg text-gray-500">
                                    <DollarSign size={18} />
                                </div>
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-400 uppercase">Original Cost</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">${asset.purchaseCost.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded-lg text-gray-500">
                                    <TrendingDown size={18} />
                                </div>
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-400 uppercase">Salvage Value</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">${asset.salvageValue.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded-lg text-gray-500">
                                    <Building2 size={18} />
                                </div>
                                <div>
                                    <span className="block text-[11px] font-semibold text-gray-400 uppercase">Branch Context</span>
                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{asset.branch?.name || 'Global'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Depreciation Logs */}
                    <div className="p-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-150 dark:border-gray-800 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Depreciation History</h3>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-150 dark:border-gray-850">
                                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Linked Journal Entry</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-sm">
                                    {asset.depreciationLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-450 italic">
                                                No depreciation runs logged yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        asset.depreciationLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-gray-55/30 dark:hover:bg-gray-800/10">
                                                <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                                                    {new Date(log.depreciationDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-rose-600 dark:text-rose-400">
                                                    -${log.amount.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {log.journalEntry ? (
                                                        <Link
                                                            to={`/accounting/journals?search=${log.journalEntry.entryNo}`}
                                                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                                        >
                                                            {log.journalEntry.entryNo}
                                                            <ExternalLink size={12} />
                                                        </Link>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 italic">None</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right panel: Net book value, Mappings, Disposal */}
                <div className="space-y-6">
                    {/* Net Book Value Card */}
                    <div className="p-6 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-3xl shadow-md space-y-4">
                        <div>
                            <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest block">Net Book Value</span>
                            <h2 className="text-3xl font-extrabold mt-1">
                                ${nbv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </h2>
                        </div>

                        <div className="space-y-2 text-sm text-indigo-100 border-t border-indigo-500/30 pt-3">
                            <div className="flex justify-between">
                                <span>Asset Cost:</span>
                                <span className="font-semibold">${asset.purchaseCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Accum. Depreciation:</span>
                                <span className="font-semibold">-${asset.currentAccumDepreciation.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Progress */}
                        <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between text-xs text-indigo-200">
                                <span>Depreciation Progress</span>
                                <span className="font-bold">{progressPercent}%</span>
                            </div>
                            <div className="bg-white/10 rounded-full h-2 overflow-hidden w-full">
                                <div className="bg-white h-full" style={{ width: `${progressPercent}%` }} />
                            </div>
                        </div>

                        {/* Life estimations */}
                        <div className="text-xs text-indigo-200 border-t border-indigo-500/30 pt-3 flex justify-between">
                            <span>Remaining Months:</span>
                            <span className="font-bold text-white">{remainingMonths} / {asset.usefulLifeMonths} Months</span>
                        </div>
                    </div>

                    {/* Linked Accounts Mapping */}
                    <div className="p-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-150 dark:border-gray-800 shadow-sm space-y-4">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">GL Integrations</h4>
                        <div className="space-y-3">
                            <div className="p-3 bg-gray-50 dark:bg-gray-850 rounded-2xl">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase">Asset GL Account</span>
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    {asset.assetAccount.code} - {asset.assetAccount.name}
                                </span>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-850 rounded-2xl">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase">Contra-Asset Account (Acc. Dep.)</span>
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    {asset.accumDepAccount.code} - {asset.accumDepAccount.name}
                                </span>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-850 rounded-2xl">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase">Depreciation Expense Account</span>
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    {asset.depExpAccount.code} - {asset.depExpAccount.name}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Disposal Details (If Disposed) */}
                    {asset.status === 'DISPOSED' && (
                        <div className="p-6 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-3xl shadow-sm space-y-4">
                            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-450">
                                <XCircle size={22} className="shrink-0" />
                                <h4 className="text-sm font-bold uppercase tracking-wider">Asset Disposed</h4>
                            </div>

                            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                <div>
                                    <span className="block text-[10px] font-bold text-gray-450 uppercase">Disposal Date</span>
                                    <span className="font-semibold text-gray-800 dark:text-gray-100">
                                        {asset.disposalDate ? new Date(asset.disposalDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold text-gray-450 uppercase">Proceeds (Salvage Proceeds)</span>
                                    <span className="font-bold text-gray-800 dark:text-gray-100">
                                        ${asset.disposalAmount?.toFixed(2) || '0.00'}
                                    </span>
                                </div>
                                {asset.disposalMemo && (
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-450 uppercase">Disposal Notes</span>
                                        <span className="italic block mt-0.5 text-xs">{asset.disposalMemo}</span>
                                    </div>
                                )}
                                {asset.disposalJournalId && (
                                    <div className="pt-2 border-t border-rose-200/50 dark:border-rose-500/10">
                                        <Link
                                            to={`/accounting/journals?id=${asset.disposalJournalId}`}
                                            className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-400 hover:underline"
                                        >
                                            View Disposal Journal Entry
                                            <ExternalLink size={12} />
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: Log Depreciation */}
            {isDepreciateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Depreciate Asset</h3>
                                <p className="text-xs text-gray-500">Run depreciation and post to the general journal.</p>
                            </div>
                            <button
                                onClick={() => setIsDepreciateModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <form onSubmit={handleDepreciateSubmit} className="p-6 space-y-4">
                            {depError && (
                                <div className="p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-500/20">
                                    {depError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Depreciation Date *</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={depreciationDate}
                                    onChange={(e) => setDepreciationDate(e.target.value)}
                                    required
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    The system will calculate the monthly amount and automatically post a journal entry.
                                </p>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => setIsDepreciateModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={depreciateMutation.isPending}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {depreciateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {depreciateMutation.isPending ? 'Logging...' : 'Post Depreciation'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Dispose Asset */}
            {isDisposeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 my-8">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Dispose Fixed Asset</h3>
                                <p className="text-xs text-gray-500">Post disposal and write off book value.</p>
                            </div>
                            <button
                                onClick={() => setIsDisposeModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <form onSubmit={handleDisposeSubmit} className="p-6 space-y-4">
                            {disposalError && (
                                <div className="p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-500/20">
                                    {disposalError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Disposal Date *</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={disposalData.disposalDate}
                                        onChange={(e) => setDisposalData(p => ({ ...p, disposalDate: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Disposal proceeds ($) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={disposalData.disposalAmount}
                                        onChange={(e) => setDisposalData(p => ({ ...p, disposalAmount: e.target.value }))}
                                        required
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Amount received for the asset. Enter 0 if discarded/scrapped.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Settlement/Bank GL Account *</label>
                                <AppDropdown
                                    value={disposalData.settlementAccountId}
                                    onChange={(val) => setDisposalData(p => ({ ...p, settlementAccountId: val }))}
                                    options={accounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name} (${a.type})` }))}
                                    placeholder="Select bank or receivables account"
                                    searchable
                                />
                                <p className="text-[10px] text-gray-400 mt-1">The account where proceeds will be deposited (Debit entry).</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Gain/Loss on Disposal GL Account *</label>
                                <AppDropdown
                                    value={disposalData.gainLossAccountId}
                                    onChange={(val) => setDisposalData(p => ({ ...p, gainLossAccountId: val }))}
                                    options={accounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name} (${a.type})` }))}
                                    placeholder="Select Gain/Loss on Disposal account"
                                    searchable
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Account to balance gains/losses between NBV and proceeds.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Disposal Notes / Memo</label>
                                <textarea
                                    placeholder="Reason for disposal, customer or buyer name, receipt references..."
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={disposalData.disposalMemo}
                                    onChange={(e) => setDisposalData(p => ({ ...p, disposalMemo: e.target.value }))}
                                />
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => setIsDisposeModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={disposeMutation.isPending}
                                    className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {disposeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {disposeMutation.isPending ? 'Processing...' : 'Post Disposal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
