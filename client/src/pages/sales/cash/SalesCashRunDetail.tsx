import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import api from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import { cashStatusColor, formatMoney } from './utils';
import AppLoader from '../../../components/ui/AppLoader';

export default function SalesCashRunDetail() {
    const { id = '' } = useParams();
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';

    const { data, isLoading } = useQuery({
        queryKey: ['sales-cash-run-detail', id],
        queryFn: () => api.get(`/sales/cash/runs/${id}`).then((r) => r.data.data),
        enabled: Boolean(id),
    });

    if (isLoading) { return <AppLoader />; }

    if (!data) {
        return <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Run not found.</div>;
    }

    const totalDeclared = (data.bags || []).reduce((sum: number, b: any) => sum + Number(b.declaredAmount || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{data.runNo}</h1>
                    <p className="text-sm text-gray-500">Created {new Date(data.createdAt).toLocaleString()} by {data.createdBy?.name || 'System'}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${cashStatusColor(data.status)}`}>{data.status}</span>
                    <Link to="/sales/cash/runs" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Back</Link>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Collector</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{data.collector?.name || 'Unassigned'}</p>
                    <p className="text-xs text-gray-500">{data.collector?.email || '-'}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Total Bags</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{(data.bags || []).length}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Declared Amount</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{formatMoney(totalDeclared, currency)}</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Bag List</h2>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-4 py-3">Bag</th>
                            <th className="px-4 py-3">Branch</th>
                            <th className="px-4 py-3 text-right">Declared</th>
                            <th className="px-4 py-3 text-right">Collected</th>
                            <th className="px-4 py-3 text-right">Vault</th>
                            <th className="px-4 py-3 text-right">Deposited</th>
                            <th className="px-4 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data.bags || []).map((bag: any) => (
                            <tr key={bag.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 font-semibold text-gray-900">{bag.bagCode}</td>
                                <td className="px-4 py-3 text-gray-700">{bag.branch?.name} ({bag.branch?.code})</td>
                                <td className="px-4 py-3 text-right text-gray-900">{formatMoney(Number(bag.declaredAmount || 0), currency)}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{formatMoney(Number(bag.collectedAmount || 0), currency)}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{formatMoney(Number(bag.vaultAmount || 0), currency)}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{formatMoney(Number(bag.depositedAmount || 0), currency)}</td>
                                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cashStatusColor(bag.status)}`}>{bag.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">Activity Timeline</h2>
                <div className="space-y-2">
                    {(data.events || []).length === 0 ? (
                        <p className="text-sm text-gray-500">No timeline events yet.</p>
                    ) : (data.events || []).map((ev: any) => (
                        <div key={ev.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-gray-800">{ev.eventType}</span>
                                <span className="text-xs text-gray-500">{new Date(ev.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-gray-600">By {ev.actor?.name || 'System'} {ev.bagId ? `· Bag ${ev.bag?.bagCode || '-'}` : ''}</p>
                            {ev.notes && <p className="mt-1 text-xs text-gray-700">{ev.notes}</p>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
