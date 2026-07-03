import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import AppLoader from '../../../components/ui/AppLoader';
import {
    Warehouse,
    Package,
    ArrowLeft,
    TrendingUp,
    AlertTriangle,
    History,
    ArrowUpRight,
    ArrowDownLeft,
    RotateCcw,
    ChevronRight,
    MapPin,
    BarChart3,
    Layers,
    Loader2
} from 'lucide-react';
import ModuleRefreshButton from '../../../components/ModuleRefreshButton';
import { DEFAULT_CURRENCY } from '../../../lib/constants';

export default function WarehouseDashboard() {
    const { id } = useParams();
    const navigate = useNavigate();
    const currency = useAuthStore((s) => s.user?.company?.currency) || DEFAULT_CURRENCY;

    const { data: warehouse, isLoading: warehouseLoading } = useQuery({
        queryKey: ['warehouse', id],
        queryFn: () => api.get(`/branches/${id}`).then((r) => r.data.data),
    });

    const { data: stockReport, isLoading: stockLoading } = useQuery({
        queryKey: ['report-stock', id],
        queryFn: () => api.get('/reports/stock', { params: { branchId: id } }).then((r) => r.data.data),
    });



    const { data: movements, isLoading: movementsLoading } = useQuery({
        queryKey: ['stock-movements', id],
        queryFn: () => api.get('/inventory/movements', { params: { branchId: id, limit: 5 } }).then((r) => r.data),
    });

    const getMovementIcon = (type: string) => {
        switch (type) {
            case 'PURCHASE_RECEIPT': return <ArrowDownLeft className="text-green-600" size={16} />;
            case 'SALE_INVOICE': return <ArrowUpRight className="text-red-500" size={16} />;
            case 'TRANSFER_IN': return <ArrowDownLeft className="text-blue-600" size={16} />;
            case 'TRANSFER_OUT': return <ArrowUpRight className="text-orange-600" size={16} />;
            case 'ADJUSTMENT': return <RotateCcw className="text-purple-600" size={16} />;
            default: return <History className="text-gray-400" size={16} />;
        }
    };

    if (warehouseLoading) return <AppLoader />;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Breadcrumbs & Header */}
            <div className="flex flex-col gap-4">
                <button
                    onClick={() => navigate('/inventory/warehouses')}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors w-fit"
                >
                    <ArrowLeft size={16} /> Back to Warehouses
                </button>
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                                <Warehouse className="text-blue-600" size={32} />
                                {warehouse?.name}
                            </h1>
                            <ModuleRefreshButton queryKeys={[['warehouse', id], ['report-stock', id], ['stock-movements', id]]} />
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded font-mono text-xs uppercase tracking-wider text-gray-700">
                                {warehouse?.code}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <MapPin size={14} /> {warehouse?.location || 'Unspecified Location'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                        <TrendingUp size={20} />
                    </div>
                    <p className="text-sm font-medium text-gray-500">Stock Valuation</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                        {stockLoading ? '...' : `${currency} ${Number(stockReport?.summary?.totalValuation || 0).toLocaleString()}`}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                        <Package size={20} />
                    </div>
                    <p className="text-sm font-medium text-gray-500">Total Items</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                        {stockLoading ? '...' : stockReport?.summary?.totalItems || 0}
                    </p>
                </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Movements */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-gray-900">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold flex items-center gap-2">
                                <History size={18} className="text-gray-400" /> Recent Movements
                            </h3>
                            <Link
                                to={id ? `/reports/running-stock-ledger?branchId=${id}` : '/reports/running-stock-ledger'}
                                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                            >
                                View All <ChevronRight size={14} />
                            </Link>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {movementsLoading ? (
                                <div className="p-10 text-center text-gray-400 italic">Loading ledger...</div>
                            ) : movements?.data?.length === 0 ? (
                                <div className="p-10 text-center text-gray-400">No movements recorded yet</div>
                            ) : (
                                movements?.data?.map((m: any) => (
                                    <div key={m.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                                                {getMovementIcon(m.type)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">{m.product?.name}</div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-2">
                                                    <span className="font-black uppercase">{m.type.replace('_', ' ')}</span>
                                                    <span>•</span>
                                                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`text-sm font-black ${m.qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {m.qty > 0 ? '+' : ''}{m.qty}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Info & Navigation */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-gray-900">
                        <h3 className="font-bold flex items-center gap-2 mb-4">
                            <BarChart3 size={18} className="text-gray-400" /> Quick Actions
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                            <Link
                                to="/inventory/transfers/new"
                                className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-100 transition-colors font-medium text-sm"
                            >
                                <div className="flex items-center gap-3">
                                    <ArrowUpRight size={18} /> New Stock Transfer
                                </div>
                                <ChevronRight size={16} />
                            </Link>
                            <Link
                                to="/inventory/stock"
                                className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 transition-colors font-medium text-sm"
                            >
                                <div className="flex items-center gap-3">
                                    <Layers size={18} /> Adjust Inventory
                                </div>
                                <ChevronRight size={16} />
                            </Link>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-slate-800 p-6 rounded-2xl shadow-lg text-white">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                                <MapPin size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold">Location Info</h3>
                                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Warehouse Details</p>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed mb-4">
                            {warehouse?.address || 'No specific address information provided for this warehouse.'}
                        </p>
                        <div className="text-xs text-gray-400 italic">
                            Created {new Date(warehouse?.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
