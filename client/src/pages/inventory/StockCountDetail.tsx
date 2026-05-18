import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, ClipboardCheck, CheckCircle2, AlertTriangle,
    Calendar, Building, User, Info, CheckCheck, FileText
} from 'lucide-react';
import api from '../../lib/api';
import toast from '@/lib/toast';
import AppLoader from '../../components/ui/AppLoader';

export default function StockCountDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: count, isLoading } = useQuery({
        queryKey: ['stock-count', id],
        queryFn: () => api.get(`/inventory/stock-counts/${id}`).then((r: any) => r.data.data)
    });

    const commitMutation = useMutation({
        mutationFn: () => api.post(`/inventory/stock-counts/${id}/commit`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            toast.success('Inventory adjusted successfully');
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Commit failed');
        }
    });

    if (isLoading) return <AppLoader />;
    if (!count) return <div className="p-8 text-center text-red-500 font-bold uppercase tracking-tight">Count session expired or not found</div>;

    const totalVariance = count.items?.reduce((acc: number, i: any) => acc + Math.abs(i.variance), 0) || 0;
    const itemsWithVariance = count.items?.filter((i: any) => i.variance !== 0).length || 0;

    const totalCostValue = count.items?.reduce((sum: number, item: any) => sum + (item.countedQty * item.avgCost), 0) || 0;
    const totalSalesValue = count.items?.reduce((sum: number, item: any) => sum + (item.countedQty * item.salePrice), 0) || 0;

    // Detailed Variance Analysis
    const surplusItems = count.items?.filter((i: any) => i.variance > 0) || [];
    const shortageItems = count.items?.filter((i: any) => i.variance < 0) || [];

    const surplusQty = surplusItems.reduce((sum: number, i: any) => sum + i.variance, 0);
    const surplusCost = surplusItems.reduce((sum: number, i: any) => sum + (i.variance * i.avgCost), 0);
    const surplusSales = surplusItems.reduce((sum: number, i: any) => sum + (i.variance * i.salePrice), 0);

    const shortageQty = shortageItems.reduce((sum: number, i: any) => sum + Math.abs(i.variance), 0);
    const shortageCost = shortageItems.reduce((sum: number, i: any) => sum + (Math.abs(i.variance) * i.avgCost), 0);
    const shortageSales = shortageItems.reduce((sum: number, i: any) => sum + (Math.abs(i.variance) * i.salePrice), 0);

    const netVarianceCost = surplusCost - shortageCost;
    const netVarianceSales = surplusSales - shortageSales;

    return (
        <div className="max-w-[1700px] mx-auto space-y-6 animate-fade-in">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/inventory/stock-counts')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900 uppercase">{count.countNo}</h1>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                            {count.notes || 'Routine Reconciliation'} {count.priceGroup && `· Valuation: ${count.priceGroup.name}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${count.status === 'COMMITTED' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                        {count.status}
                    </span>
                    {count.status === 'DRAFT' && (
                        <>
                            <button
                                onClick={() => navigate(`/inventory/stock-counts/${id}/edit`)}
                                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 bg-white rounded-xl hover:bg-gray-50 font-bold uppercase tracking-widest text-xs transition-all shadow-sm"
                            >
                                <FileText size={16} /> Edit Draft
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('Commit this count? Inventory quantities will be updated immediately.')) {
                                        commitMutation.mutate();
                                    }
                                }}
                                disabled={commitMutation.isPending}
                                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-blue-200"
                            >
                                <CheckCheck size={16} /> Commit Count
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Building size={80} /></div>
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg w-fit mb-4"><Building size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Count Location</p>
                    <p className="font-black text-gray-900 uppercase tracking-tight truncate">{count.branch?.name}</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><CheckCircle2 size={80} /></div>
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg w-fit mb-4"><CheckCircle2 size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Count Scope</p>
                    <p className="font-black text-gray-900 tracking-tight">{count.items?.length} Unique Lines</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><FileText size={80} /></div>
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg w-fit mb-4"><FileText size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Count Valuation (Cost)</p>
                    <p className="font-black text-amber-900 tracking-tight font-mono text-lg">{totalCostValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><CheckCheck size={80} /></div>
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg w-fit mb-4"><CheckCheck size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Count Valuation (Retail)</p>
                    <p className="font-black text-emerald-900 tracking-tight font-mono text-lg">{totalSalesValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>

                <div className={`bg-white p-6 rounded-2xl border shadow-sm relative overflow-hidden group lg:col-span-2 xl:col-span-1 transition-all ${(netVarianceCost < 0 || (netVarianceCost === 0 && shortageQty > surplusQty))
                        ? 'border-rose-100 bg-rose-50/10'
                        : (netVarianceCost > 0 || (netVarianceCost === 0 && surplusQty > shortageQty))
                            ? 'border-emerald-100 bg-emerald-50/10'
                            : 'border-gray-100'
                    }`}>
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><AlertTriangle size={80} /></div>
                    <div className={`p-2 rounded-lg w-fit mb-4 ${(netVarianceCost < 0 || (netVarianceCost === 0 && shortageQty > surplusQty))
                            ? 'bg-rose-50 text-rose-600'
                            : (netVarianceCost > 0 || (netVarianceCost === 0 && surplusQty > shortageQty))
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-gray-50 text-gray-400'
                        }`}>
                        <AlertTriangle size={20} />
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Count Variance</p>
                    <p className={`font-black tracking-tight font-mono text-lg ${(netVarianceCost < 0 || (netVarianceCost === 0 && shortageQty > surplusQty))
                            ? 'text-rose-600'
                            : (netVarianceCost > 0 || (netVarianceCost === 0 && surplusQty > shortageQty))
                                ? 'text-emerald-600'
                                : 'text-gray-900'
                        }`}>
                        {netVarianceCost > 0 ? '+' : ''}{netVarianceCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* Detailed Variance Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Surplus Card */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 bg-emerald-50/50 border-b border-emerald-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <h3 className="text-xs font-black text-emerald-900 uppercase tracking-widest">Surplus Analysis (+)</h3>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-100">{surplusItems.length} Products</span>
                    </div>
                    <div className="p-6 grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Total Units (+)</p>
                            <p className="text-xl font-black text-emerald-600 leading-none">{surplusQty}</p>
                        </div>
                        <div className="space-y-1 border-x border-gray-100 px-4">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Cost Impact</p>
                            <p className="text-sm font-black text-gray-900 font-mono">{surplusCost > 0 ? '+' : ''}{surplusCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Sales Impact</p>
                            <p className="text-sm font-black text-gray-900 font-mono">{surplusSales > 0 ? '+' : ''}{surplusSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>

                {/* Shortage Card */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 bg-rose-50/50 border-b border-rose-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                            <h3 className="text-xs font-black text-rose-900 uppercase tracking-widest">Shortage Analysis (-)</h3>
                        </div>
                        <span className="text-[10px] font-bold text-rose-600 bg-white px-2 py-0.5 rounded-full border border-rose-100">{shortageItems.length} Products</span>
                    </div>
                    <div className="p-6 grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Total Units (-)</p>
                            <p className="text-xl font-black text-rose-600 leading-none">{shortageQty}</p>
                        </div>
                        <div className="space-y-1 border-x border-gray-100 px-4">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Cost Impact</p>
                            <p className="text-sm font-black text-gray-900 font-mono">{shortageCost > 0 ? '-' : ''}{shortageCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Sales Impact</p>
                            <p className="text-sm font-black text-gray-900 font-mono">{shortageSales > 0 ? '-' : ''}{shortageSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden min-h-[400px]">
                <div className="px-6 py-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-gray-100"><ClipboardCheck size={20} className="text-blue-600" /></div>
                        <h3 className="font-black text-gray-900 uppercase tracking-tight">Count Line Items</h3>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white border-b border-gray-100">
                            <tr>
                                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Product / SKU</th>
                                <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Sys Qty</th>
                                <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cnt Qty</th>
                                <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Unit Cost</th>
                                <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cost Val</th>
                                <th className="py-4 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Sale Val</th>
                                <th className="py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Variance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {count.items?.map((item: any) => (
                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-5 px-6">
                                        <div className="text-sm font-black text-gray-900 uppercase tracking-tighter">{item.product?.name}</div>
                                        <div className="text-[10px] text-gray-400 font-bold mt-0.5">{item.product?.itemCode}</div>
                                    </td>

                                    <td className="py-5 px-4 text-xs font-bold text-right text-gray-400 font-mono">{item.systemQty}</td>
                                    <td className="py-5 px-4 text-xs font-black text-right text-gray-900 font-mono">{item.countedQty}</td>
                                    <td className="py-5 px-4 text-xs font-bold text-right text-gray-500 font-mono">{item.avgCost?.toFixed(2)}</td>
                                    <td className="py-5 px-4 text-xs font-black text-right text-gray-900 font-mono">{(item.countedQty * item.avgCost).toFixed(2)}</td>
                                    <td className="py-5 px-4 text-xs font-black text-right text-green-700 font-mono">{(item.countedQty * item.salePrice).toFixed(2)}</td>
                                    <td className="py-5 px-6">
                                        <div className="flex flex-col">
                                            <div className={`text-xs font-black font-mono ${item.variance === 0 ? 'text-gray-300' : item.variance > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                {item.variance > 0 ? '+' : ''}{item.variance}
                                            </div>
                                            {item.variance === 0 ? (
                                                <span className="text-[8px] font-black text-green-600 uppercase tracking-widest flex items-center gap-1 mt-1"><CheckCircle2 size={8} /> Match</span>
                                            ) : (
                                                <span className="text-[8px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 mt-1"><AlertTriangle size={8} /> Deviated</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {count.status === 'COMMITTED' && (
                <div className="bg-green-50 border border-green-100 p-6 rounded-3xl flex gap-4 shadow-sm items-center">
                    <div className="p-3 bg-green-500 text-white rounded-full"><CheckCheck size={24} /></div>
                    <div>
                        <p className="text-[10px] font-black text-green-800 uppercase tracking-widest">Count Finalized</p>
                        <p className="text-green-700 text-sm font-bold">This count session has been committed by {count.committedBy?.name}. Inventory levels have been adjusted and movement logs generated.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
