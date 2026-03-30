import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    ArrowLeft, Edit2, Package, Hash, Tag, Layers,
    Smartphone, Globe, Layout, History, BarChart3,
    ArrowRightLeft, ShoppingCart, Loader2, AlertCircle,
    TrendingUp, MapPin, Box, Calendar
} from 'lucide-react';
import { format } from 'date-fns';

export default function ItemDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');

    // Fetch Item Details
    const { data: item, isLoading, isError } = useQuery({
        queryKey: ['product', id],
        queryFn: () => api.get(`/products/${id}`).then(r => r.data.data),
    });

    // Fetch Stock Status
    const { data: stockData } = useQuery({
        queryKey: ['inventory-product-stock', id],
        queryFn: () => api.get('/inventory/stock', { params: { productId: id } }).then(r => r.data.data),
        enabled: !!id
    });

    // Fetch Movements (Asset History)
    const { data: movementsData } = useQuery({
        queryKey: ['inventory-movements', id],
        queryFn: () => api.get('/inventory/movements', { params: { productId: id, limit: 10 } }).then(r => r.data.data),
        enabled: activeTab === 'activity' && !!id
    });

    if (isLoading) return (
        <div className="flex flex-col h-96 items-center justify-center gap-4 text-gray-500">
            <Loader2 className="animate-spin text-blue-600" size={32} />
            <p className="font-medium animate-pulse">Retrieving item profile...</p>
        </div>
    );

    if (isError || !item) return (
        <div className="flex flex-col h-96 items-center justify-center gap-4 text-gray-500">
            <AlertCircle className="text-rose-500" size={48} />
            <p className="text-xl font-bold text-gray-900">Item Not Found</p>
            <button onClick={() => navigate('/items')} className="text-blue-600 hover:underline">Back to catalog</button>
        </div>
    );

    const defaultUnit = item.units?.[0];
    const totalQty = (stockData || []).reduce((sum: number, s: any) => sum + Number(s.qtyOnHand), 0);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header / Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/items')}
                        className="p-2.5 hover:bg-white bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-200"
                    >
                        <ArrowLeft size={20} className="text-gray-600" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-gray-900">{item.name}</h1>
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${item.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                {item.status}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 font-mono tracking-wider">{item.itemCode}</p>
                    </div>
                </div>
                <button
                    onClick={() => navigate(`/items/${item.id}/edit`)}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg active:scale-95"
                >
                    <Edit2 size={18} />
                    Edit Profile
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Package size={20} /></div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Inventory</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-gray-900">{totalQty}</span>
                        <span className="text-xs font-bold text-gray-500">{defaultUnit?.unitCode}</span>
                    </div>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Tag size={20} /></div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sale Price</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-gray-900">{(defaultUnit?.salePrice || 0).toLocaleString()}</span>
                        <span className="text-xs font-bold text-gray-500">SAR</span>
                    </div>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><TrendingUp size={20} /></div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Unit Margin</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-emerald-600">
                            {defaultUnit?.salePrice && defaultUnit?.costPrice
                                ? (((defaultUnit.salePrice - defaultUnit.costPrice) / defaultUnit.salePrice) * 100).toFixed(0)
                                : '0'}%
                        </span>
                        <span className="text-xs font-bold text-gray-500">Gros Profit</span>
                    </div>
                </div>
                <div className="p-4 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl shadow-lg shadow-indigo-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white/20 text-white rounded-xl"><BarChart3 size={20} /></div>
                        <span className="text-xs font-bold text-white/60 uppercase tracking-widest">Growth Role</span>
                    </div>
                    <div className="text-2xl font-black text-white">Top 10%</div>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit">
                {[
                    { id: 'overview', label: 'Item Overview', icon: Layout },
                    { id: 'inventory', label: 'Stock Status', icon: Box },
                    { id: 'pricing', label: 'Pricing Channels', icon: ArrowRightLeft },
                    { id: 'activity', label: 'Recent Activity', icon: History },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === tab.id
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
                {activeTab === 'overview' && (
                    <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="space-y-8">
                            <section>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Identity & Naming</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                                        <span className="text-sm font-medium text-gray-500 flex items-center gap-2"><Smartphone size={16} /> Primary Name</span>
                                        <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                                        <span className="text-sm font-medium text-gray-500 flex items-center gap-2"><Globe size={16} /> Second Language</span>
                                        <span className="text-sm font-bold text-gray-900 font-arabic" dir="rtl">{item.nameArabic || 'Not Set'}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-gray-50">
                                        <span className="text-sm font-medium text-gray-500 flex items-center gap-2"><Layers size={16} /> Category</span>
                                        <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{item.category?.name || 'Uncategorized'}</span>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Technical Details</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Tax Rate</p>
                                        <p className="text-lg font-black text-gray-900">{((item.tax?.rate ?? item.taxRate ?? 0) * 100).toFixed(0)}%</p>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Item Group</p>
                                        <p className="text-lg font-black text-indigo-600">{item.itemGroup?.name || 'Not Set'}</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="space-y-8">
                            <section>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Barcodes & SKUs</h3>
                                <div className="p-6 bg-gray-900 rounded-3xl text-white space-y-4">
                                    {item.barcodes?.length ? item.barcodes.map((b: string, i: number) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <Hash size={18} className="text-indigo-400" />
                                            <span className="font-mono text-lg font-bold tracking-widest">{b}</span>
                                        </div>
                                    )) : (
                                        <div className="text-white/40 italic flex items-center gap-2">
                                            <AlertCircle size={16} /> No master barcodes assigned
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Unit Conversions</h3>
                                <div className="space-y-3">
                                    {item.units?.map((u: any) => (
                                        <div key={u.id} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900">{u.unitName}</span>
                                                    <span className="text-[10px] font-bold bg-gray-100 px-1.5 py-0.5 rounded uppercase">{u.unitCode}</span>
                                                    {u.isBase && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">BASE</span>}
                                                </div>
                                                <p className="text-xs text-gray-500">1 {u.unitCode} = {u.qtyInBaseUnit} Base Units</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-gray-900">SAR {u.salePrice.toLocaleString()}</p>
                                                <p className="text-[10px] font-bold text-gray-400">Sale Price</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <div className="p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-bold text-gray-900">Stock Deployment</h2>
                            <button
                                onClick={() => navigate(`/purchases/new`)}
                                className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all"
                            >
                                Replenish Stock
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(stockData || []).length === 0 ? (
                                <div className="col-span-2 py-20 bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400 italic">
                                    <Package size={48} strokeWidth={1} className="mb-4" />
                                    No stock records found for this item across any branch.
                                </div>
                            ) : stockData.map((s: any) => (
                                <div key={s.id} className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md transition-all group">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                <MapPin size={24} />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-gray-900">{s.branch?.name}</h4>
                                                <p className="text-xs text-gray-500">Active Supply Hub</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-2xl font-black ${Number(s.qtyOnHand) <= 10 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {Number(s.qtyOnHand).toLocaleString()}
                                            </p>
                                            <p className="text-xs font-bold text-gray-400">{s.unitCode} ON HAND</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-50">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Avg Cost</p>
                                            <p className="text-sm font-bold text-gray-700">{Number(s.avgCost).toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Value</p>
                                            <p className="text-sm font-bold text-gray-700">{(Number(s.qtyOnHand) * Number(s.avgCost)).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Unit</p>
                                            <p className="text-sm font-bold text-rose-500">
                                                {s.unitCode}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'pricing' && (
                    <div className="p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-bold text-gray-900">Unit Pricing Matrix</h2>
                            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold ring-1 ring-amber-100">
                                <AlertCircle size={14} /> VAT 15% Inclusive
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="py-4 px-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Code</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ratio</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cost Price</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Sale Price</th>
                                        <th className="py-4 px-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Margin (%)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {item.units?.map((u: any) => {
                                        const margin = u.salePrice > 0 ? ((u.salePrice - u.costPrice) / u.salePrice * 100).toFixed(1) : 0;
                                        return (
                                            <tr key={u.id} className="group hover:bg-gray-50/50 transition-colors">
                                                <td className="py-4 px-2">
                                                    <div className="flex items-center gap-2">
                                                        {u.isBase && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600"></div>}
                                                        <span className="font-bold text-gray-900">{u.unitCode}</span>
                                                        <span className="text-[10px] text-gray-400 font-medium">{u.unitName}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-2 text-right font-mono text-sm text-gray-500">
                                                    1:{u.qtyInBaseUnit}
                                                </td>
                                                <td className="py-4 px-2 text-right font-bold text-gray-600">
                                                    {Number(u.costPrice).toFixed(2)}
                                                </td>
                                                <td className="py-4 px-2 text-right">
                                                    <span className="text-lg font-black text-indigo-600">{Number(u.salePrice).toFixed(2)}</span>
                                                    <span className="text-[10px] text-gray-400 ml-1">SAR</span>
                                                </td>
                                                <td className="py-4 px-2 text-right">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-black ${Number(margin) > 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                                        }`}>
                                                        {margin}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-12 p-6 bg-gray-900 rounded-3xl text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <h4 className="text-lg font-black mb-2">Multichannel Pricing</h4>
                                <p className="text-sm text-gray-400 max-w-sm mb-6 uppercase tracking-tight font-bold">Standardize your distribution strategy across B2B and Retail streams.</p>
                                <button
                                    onClick={() => navigate(`/items/${item.id}/edit`)}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 transition-colors rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-500/20"
                                >
                                    Configure Pricing Channels
                                </button>
                            </div>
                            <div className="absolute right-[-20px] bottom-[-20px] opacity-10 rotate-12">
                                <TrendingUp size={200} strokeWidth={4} />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="p-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-8">Asset History</h2>
                        <div className="space-y-6">
                            {(!movementsData || movementsData.length === 0) ? (
                                <div className="py-20 bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400 italic">
                                    <History size={48} strokeWidth={1} className="mb-4" />
                                    No activity records found for this item.
                                </div>
                            ) : movementsData.map((m: any, i: number) => (
                                <div key={m.id} className="flex gap-4 relative">
                                    {i < movementsData.length - 1 && <div className="absolute left-[23px] top-[48px] w-0.5 h-[calc(100%-24px)] bg-gray-100"></div>}
                                    <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center shrink-0 ${m.type.includes('IN') || m.type === 'ADJUSTMENT' && m.qty > 0
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                        : 'bg-rose-50 border-rose-100 text-rose-600'
                                        }`}>
                                        {m.type.includes('IN') ? <ShoppingCart size={20} /> : <ArrowRightLeft size={20} />}
                                    </div>
                                    <div className="flex-1 pb-6">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="font-bold text-gray-900 capitalize">{m.type.replace(/_/g, ' ')}</h4>
                                            <span className="text-xs font-medium text-gray-400">{format(new Date(m.createdAt), 'MMM dd, HH:mm')}</span>
                                        </div>
                                        <p className="text-sm text-gray-500 mb-2">
                                            <span className={`font-bold ${m.qty > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {m.qty > 0 ? '+' : ''}{m.qty}
                                            </span> {m.unitCode} moved in <span className="font-bold text-gray-700">{m.branch?.name}</span>.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase truncate max-w-[150px]">
                                                BY: {m.createdBy?.name}
                                            </span>
                                            {m.referenceId && (
                                                <Link to={`/inventory/${m.referenceType === 'PURCHASE' ? 'purchases' : 'transfers'}/${m.referenceId}`} className="text-[10px] font-bold text-gray-400 hover:text-indigo-600 transition-colors underline uppercase">
                                                    SOURCE: {m.referenceType}
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

