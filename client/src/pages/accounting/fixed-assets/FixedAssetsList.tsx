import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../../lib/api';
import {
    Plus,
    Search,
    Calendar,
    Calculator,
    DollarSign,
    TrendingDown,
    Building2,
    Eye,
    ChevronRight,
    Loader2,
    X,
    Settings,
    FileSpreadsheet,
    HelpCircle
} from 'lucide-react';
import AppDropdown from '../../../components/ui/AppDropdown';

interface Branch {
    id: string;
    name: string;
}

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
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
    assetAccount: { code: string; name: string };
    accumDepAccount: { code: string; name: string };
    depExpAccount: { code: string; name: string };
    branch?: { name: string };
}

export default function FixedAssetsList() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Filters and Search State
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState('');

    // Modal states
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isBatchDepModalOpen, setIsBatchDepModalOpen] = useState(false);
    const [formError, setFormError] = useState('');
    const [batchError, setBatchError] = useState('');

    // Registration Form State
    const [formData, setFormData] = useState({
        name: '',
        assetCode: '',
        description: '',
        purchaseDate: new Date().toISOString().slice(0, 10),
        purchaseCost: '',
        salvageValue: '0',
        usefulLifeMonths: '60',
        depreciationMethod: 'STRAIGHT_LINE',
        assetAccountId: '',
        accumDepAccountId: '',
        depExpAccountId: '',
        branchId: ''
    });

    // Batch Depreciation Form State
    const [depreciationDate, setDepreciationDate] = useState(
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)
    );

    // Queries
    const { data: assetsRes, isLoading } = useQuery({
        queryKey: ['fixedAssets', search, statusFilter, branchFilter],
        queryFn: async () => {
            const res = await api.get('/fixed-assets', {
                params: {
                    search: search || undefined,
                    status: statusFilter || undefined,
                    branchId: branchFilter || undefined,
                    take: 100
                }
            });
            return res.data.data as FixedAsset[];
        }
    });

    const assets = assetsRes || [];

    const { data: branches = [] } = useQuery<Branch[]>({
        queryKey: ['branches-lite'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data.data;
        }
    });

    const { data: accounts = [] } = useQuery<Account[]>({
        queryKey: ['accounts-lite'],
        queryFn: async () => {
            const res = await api.get('/accounting/accounts');
            return res.data.data;
        }
    });

    // Mutations
    const registerMutation = useMutation({
        mutationFn: async (payload: any) => {
            const res = await api.post('/fixed-assets', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['fixedAssets'] });
            setIsRegisterModalOpen(false);
            resetRegisterForm();
        },
        onError: (err: any) => {
            setFormError(err.response?.data?.error?.message || 'Failed to register asset');
        }
    });

    const batchDeprecateMutation = useMutation({
        mutationFn: async (date: string) => {
            const res = await api.post('/fixed-assets/depreciate-all', { depreciationDate: date });
            return res.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['fixedAssets'] });
            setIsBatchDepModalOpen(false);
            alert(data.message || 'Batch depreciation run finished successfully');
        },
        onError: (err: any) => {
            setBatchError(err.response?.data?.error?.message || 'Batch depreciation run failed');
        }
    });

    const resetRegisterForm = () => {
        setFormData({
            name: '',
            assetCode: '',
            description: '',
            purchaseDate: new Date().toISOString().slice(0, 10),
            purchaseCost: '',
            salvageValue: '0',
            usefulLifeMonths: '60',
            depreciationMethod: 'STRAIGHT_LINE',
            assetAccountId: '',
            accumDepAccountId: '',
            depExpAccountId: '',
            branchId: ''
        });
        setFormError('');
    };

    const handleRegisterSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        if (!formData.name.trim()) return setFormError('Asset name is required');
        if (!formData.purchaseCost || Number(formData.purchaseCost) <= 0) return setFormError('Purchase cost must be a positive number');
        if (Number(formData.salvageValue) < 0) return setFormError('Salvage value must be non-negative');
        if (!formData.usefulLifeMonths || Number(formData.usefulLifeMonths) <= 0) return setFormError('Useful life must be a positive integer');
        if (!formData.assetAccountId) return setFormError('Asset Account mapping is required');
        if (!formData.accumDepAccountId) return setFormError('Accumulated Depreciation Account is required');
        if (!formData.depExpAccountId) return setFormError('Depreciation Expense Account is required');

        registerMutation.mutate({
            name: formData.name,
            assetCode: formData.assetCode || undefined,
            description: formData.description || undefined,
            purchaseDate: formData.purchaseDate,
            purchaseCost: Number(formData.purchaseCost),
            salvageValue: Number(formData.salvageValue),
            usefulLifeMonths: parseInt(formData.usefulLifeMonths, 10),
            depreciationMethod: formData.depreciationMethod,
            assetAccountId: formData.assetAccountId,
            accumDepAccountId: formData.accumDepAccountId,
            depExpAccountId: formData.depExpAccountId,
            branchId: formData.branchId || undefined
        });
    };

    const handleBatchDepSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setBatchError('');
        if (!depreciationDate) return setBatchError('Depreciation date is required');
        batchDeprecateMutation.mutate(depreciationDate);
    };

    // Derived Statistics
    const activeAssets = assets.filter(a => a.status !== 'DISPOSED');
    const totalAssetsVal = activeAssets.reduce((sum, a) => sum + a.purchaseCost, 0);
    const totalAccumDepVal = activeAssets.reduce((sum, a) => sum + a.currentAccumDepreciation, 0);
    const netBookVal = totalAssetsVal - totalAccumDepVal;
    const totalCount = assets.length;

    // Filter GL Accounts for different types if applicable
    const assetAccountsOptions = accounts.map(a => ({ value: a.id, label: `${a.code} - ${a.name} (${a.type})` }));

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Fixed Assets Register</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                        Register company fixed assets, automate month-end depreciation runs, and track disposals.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsBatchDepModalOpen(true)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition flex items-center gap-2"
                    >
                        <Calculator className="w-4 h-4" />
                        Run Depreciation
                    </button>
                    <button
                        onClick={() => setIsRegisterModalOpen(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        New Asset
                    </button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-150 dark:border-gray-800 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400">
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Count</p>
                        <h4 className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{totalCount} Assets</h4>
                    </div>
                </div>

                <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-150 dark:border-gray-800 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
                        <DollarSign className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Original Cost</p>
                        <h4 className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                            ${totalAssetsVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h4>
                    </div>
                </div>

                <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-150 dark:border-gray-800 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-400">
                        <TrendingDown className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Accum. Depreciation</p>
                        <h4 className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">
                            ${totalAccumDepVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h4>
                    </div>
                </div>

                <div className="p-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl text-white">
                        <DollarSign className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">Net Book Value</p>
                        <h4 className="text-2xl font-bold mt-1 text-white">
                            ${netBookVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h4>
                    </div>
                </div>
            </div>

            {/* Filter and Table Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-150 dark:border-gray-800 shadow-sm overflow-hidden">
                {/* Filters */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-80">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                        <input
                            type="text"
                            placeholder="Search by code or name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-255 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-255 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none"
                        >
                            <option value="">All Statuses</option>
                            <option value="ACTIVE">Active</option>
                            <option value="FULLY_DEPRECIATED">Fully Depreciated</option>
                            <option value="DISPOSED">Disposed</option>
                        </select>
                        <select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-255 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none"
                        >
                            <option value="">All Branches</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-150 dark:border-gray-850">
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Asset Code</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Branch</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Cost</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Net Book Value</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Depreciation Progress</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-3" />
                                        Loading assets...
                                    </td>
                                </tr>
                            ) : assets.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-16 text-center">
                                        <Settings className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                                        <p className="text-base font-semibold text-gray-900 dark:text-white">No fixed assets registered</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Get started by clicking the "New Asset" button above.</p>
                                    </td>
                                </tr>
                            ) : (
                                assets.map((asset) => {
                                    const percent = Math.min(
                                        100,
                                        Math.round((asset.currentAccumDepreciation / (asset.purchaseCost - asset.salvageValue || 1)) * 100)
                                    );
                                    const nbv = asset.purchaseCost - asset.currentAccumDepreciation;

                                    return (
                                        <tr key={asset.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                                            <td className="px-6 py-4 font-semibold text-sm text-blue-600 dark:text-blue-400">
                                                <Link to={`/accounting/fixed-assets/${asset.id}`} className="hover:underline flex items-center gap-1">
                                                    {asset.assetCode}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{asset.name}</div>
                                                {asset.description && (
                                                    <div className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{asset.description}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                {asset.branch?.name || <span className="text-gray-400 italic">None</span>}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                                                ${asset.purchaseCost.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                                ${nbv.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 max-w-[150px]">
                                                    <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${percent >= 100 ? 'bg-indigo-500' : 'bg-blue-600'}`}
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-500">{percent}%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                                                    asset.status === 'ACTIVE'
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                        : asset.status === 'FULLY_DEPRECIATED'
                                                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                                                        : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                                                }`}>
                                                    {asset.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => navigate(`/accounting/fixed-assets/${asset.id}`)}
                                                    className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition"
                                                    title="View Asset Details"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Register Fixed Asset */}
            {isRegisterModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Register Fixed Asset</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Add asset parameters and link corresponding GL accounts.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsRegisterModalOpen(false);
                                    resetRegisterForm();
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <form onSubmit={handleRegisterSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                            {formError && (
                                <div className="p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-500/20">
                                    {formError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Asset Name *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Server Rack Dell R740"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.name}
                                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Asset Code</label>
                                    <input
                                        type="text"
                                        placeholder="Leave blank for auto-generation"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.assetCode}
                                        onChange={(e) => setFormData(p => ({ ...p, assetCode: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                <textarea
                                    placeholder="Write details about the asset condition, serial numbers, location, etc."
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.description}
                                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Purchase Date *</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.purchaseDate}
                                        onChange={(e) => setFormData(p => ({ ...p, purchaseDate: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Purchase Cost ($) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.purchaseCost}
                                        onChange={(e) => setFormData(p => ({ ...p, purchaseCost: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Salvage Value ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.salvageValue}
                                        onChange={(e) => setFormData(p => ({ ...p, salvageValue: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Useful Life (Months) *</label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 60"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.usefulLifeMonths}
                                        onChange={(e) => setFormData(p => ({ ...p, usefulLifeMonths: e.target.value }))}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Deprec. Method *</label>
                                    <select
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:outline-none"
                                        value={formData.depreciationMethod}
                                        onChange={(e) => setFormData(p => ({ ...p, depreciationMethod: e.target.value }))}
                                    >
                                        <option value="STRAIGHT_LINE">Straight Line</option>
                                        <option value="DOUBLE_DECLINING">Double Declining Balance</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Branch Context</label>
                                    <select
                                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:outline-none"
                                        value={formData.branchId}
                                        onChange={(e) => setFormData(p => ({ ...p, branchId: e.target.value }))}
                                    >
                                        <option value="">Global / No Branch</option>
                                        {branches.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <hr className="border-gray-100 dark:border-gray-800 my-2" />
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">GL General Ledger Accounts</h4>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Asset GL Account *</label>
                                    <AppDropdown
                                        value={formData.assetAccountId}
                                        onChange={(val) => setFormData(p => ({ ...p, assetAccountId: val }))}
                                        options={assetAccountsOptions}
                                        placeholder="Select asset account (e.g. Machinery, Vehicles)"
                                        searchable
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Accumulated Depreciation GL Account *</label>
                                    <AppDropdown
                                        value={formData.accumDepAccountId}
                                        onChange={(val) => setFormData(p => ({ ...p, accumDepAccountId: val }))}
                                        options={assetAccountsOptions}
                                        placeholder="Select Contra-Asset account"
                                        searchable
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Depreciation Expense GL Account *</label>
                                    <AppDropdown
                                        value={formData.depExpAccountId}
                                        onChange={(val) => setFormData(p => ({ ...p, depExpAccountId: val }))}
                                        options={assetAccountsOptions}
                                        placeholder="Select Expense account"
                                        searchable
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsRegisterModalOpen(false);
                                        resetRegisterForm();
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={registerMutation.isPending}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {registerMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {registerMutation.isPending ? 'Registering...' : 'Register Asset'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Batch Depreciation Run */}
            {isBatchDepModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Batch Depreciation Run</h3>
                                <p className="text-xs text-gray-500">Post monthly depreciation entries for all active assets.</p>
                            </div>
                            <button
                                onClick={() => setIsBatchDepModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <form onSubmit={handleBatchDepSubmit} className="p-6 space-y-4">
                            {batchError && (
                                <div className="p-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-500/20">
                                    {batchError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Depreciation Posting Date *</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={depreciationDate}
                                    onChange={(e) => setDepreciationDate(e.target.value)}
                                    required
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Usually the last day of the fiscal month. Only active assets that haven't been depreciated in this calendar month will be processed.
                                </p>
                            </div>

                            <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-100 dark:border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex gap-3">
                                <HelpCircle size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold">Important Double-Entry Postings:</span> This will create a balancing Journal Entry for each depreciated asset:
                                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                        <li><span className="font-semibold">Debit:</span> Depreciation Expense account</li>
                                        <li><span className="font-semibold">Credit:</span> Accumulated Depreciation account</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => setIsBatchDepModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={batchDeprecateMutation.isPending}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {batchDeprecateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {batchDeprecateMutation.isPending ? 'Processing...' : 'Run Depreciation'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
