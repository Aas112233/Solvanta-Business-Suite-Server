import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { TrendingUp, Package, DollarSign, PieChart as PieIcon, Layers } from 'lucide-react';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import AppLoader from '../../components/ui/AppLoader';
import { formatCurrencyAmount, useCompanyCurrency } from '../../lib/companySettings';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function InventoryAnalytics() {
    const currency = useCompanyCurrency();
    const { data: analytics, isLoading } = useQuery({
        queryKey: ['inventory-analytics'],
        queryFn: () => api.get('/inventory/analytics').then((r: any) => r.data.data)
    });

    if (isLoading) return <AppLoader />;

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3 uppercase tracking-tight">
                        <TrendingUp className="text-blue-600" /> Inventory Intelligence
                    </h1>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Advanced Stock Data Analysis</p>
                </div>
                <ModuleRefreshButton queryKeys={[['inventory-analytics']]} />
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-fit mb-4"><DollarSign size={24} /></div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Valuation</p>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tighter">
                        {formatCurrencyAmount(analytics?.totalValuation || 0, currency)}
                    </h2>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-fit mb-4"><Package size={24} /></div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Inventory Health</p>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tighter">Target Optimized</h2>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-fit mb-4"><PieIcon size={24} /></div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Stock Turn Rate</p>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tighter">High Yield</h2>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Valuation by Category */}
                <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-2xl shadow-gray-200/50">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-gray-50 rounded-xl"><Layers size={20} className="text-gray-900" /></div>
                        <h3 className="font-black text-gray-900 uppercase tracking-tight">Valuation by Category</h3>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={analytics?.categoryValuation || []}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {analytics?.categoryValuation.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: any) => formatCurrencyAmount(Number(value || 0), currency)}
                                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Products by Value */}
                <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-2xl shadow-gray-200/50">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-gray-50 rounded-xl"><Package size={20} className="text-gray-900" /></div>
                        <h3 className="font-black text-gray-900 uppercase tracking-tight">Top Assets by Value</h3>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics?.topByValue || []} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    width={100}
                                    fontSize={10}
                                    fontWeight="bold"
                                    tickFormatter={(v) => v.length > 15 ? v.substring(0, 12) + '...' : v}
                                />
                                <Tooltip
                                    formatter={(value: any) => formatCurrencyAmount(Number(value || 0), currency)}
                                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="value" fill="#3b82f6" radius={[0, 10, 10, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Movement Trend */}
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-2xl shadow-gray-200/50">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-gray-50 rounded-xl"><TrendingUp size={20} className="text-gray-900" /></div>
                    <h3 className="font-black text-gray-900 uppercase tracking-tight">Inventory Movement Trend (6 Months)</h3>
                </div>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics?.movementTrend || []}>
                            <defs>
                                <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="month" fontSize={12} fontWeight="bold" stroke="#94a3b8" />
                            <YAxis fontSize={12} fontWeight="bold" stroke="#94a3b8" />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="inQty" name="In Qty" stroke="#10b981" strokeWidth={2} fillOpacity={0} />
                            <Area type="monotone" dataKey="outQty" name="Out Qty" stroke="#ef4444" strokeWidth={2} fillOpacity={0} />
                            <Area type="monotone" dataKey="netQty" name="Net Qty" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
