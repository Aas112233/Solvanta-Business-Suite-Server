import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Loader2, CheckCircle2, Search, Filter, Plus, Eye, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import PurchaseReturnDeleteDialog from '../../components/purchases/PurchaseReturnDeleteDialog';

export default function PurchaseReturns() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['purchase-returns', page, search],
        queryFn: async () => {
            const res = await api.get('/purchases/returns', {
                params: { page, limit: 15, search: search || undefined }
            });
            return res.data;
        }
    });

    const returns = data?.data || [];
    const pagination = data?.meta?.pagination;
    const { data: deletePreview, isLoading: isDeletePreviewLoading } = useQuery({
        queryKey: ['purchase-return', deleteTarget?.id],
        queryFn: () => api.get(`/purchases/returns/${deleteTarget.id}`).then((r) => r.data.data),
        enabled: !!deleteTarget?.id,
    });

    const cancelMut = useMutation({
        mutationFn: (id: string) => api.delete(`/purchases/returns/${id}`),
        onSuccess: (res: any) => {
            toast.success(res?.data?.data?.message || 'Purchase return cancelled');
            queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
            setDeleteTarget(null);
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message || 'Failed to cancel purchase return');
        },
    });

    const handleCancel = (ret: any) => {
        if (ret.status === 'CANCELLED') {
            toast('Return is already cancelled');
            return;
        }
        setDeleteTarget(ret);
    };

    const confirmCancel = () => {
        if (!deleteTarget?.id) return;
        cancelMut.mutate(deleteTarget.id);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Purchase Returns</h1>
                    <p className="text-gray-500">Manage returns to suppliers </p>
                </div>
                <Link
                    to="/purchases/returns/new"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus size={18} />
                    New Return
                </Link>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search returns..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 font-medium">
                    <Filter size={18} />
                    Filters
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-gray-900">Return #</th>
                            <th className="px-6 py-4 font-semibold text-gray-900">Date</th>
                            <th className="px-6 py-4 font-semibold text-gray-900">Orig. Invoice</th>
                            <th className="px-6 py-4 font-semibold text-gray-900">Supplier</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 text-right">Items</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 text-right">Amount</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 text-center">Status</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading || isFetching ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="animate-spin" size={20} />
                                        Loading...
                                    </div>
                                </td>
                            </tr>
                        ) : returns.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                    No purchase returns found
                                </td>
                            </tr>
                        ) : (
                            returns.map((ret: any) => (
                                <tr
                                    key={ret.id}
                                    className="hover:bg-gray-50/50 cursor-pointer"
                                    onClick={() => navigate(`/purchases/returns/${ret.id}`)}
                                >
                                    <td className="px-6 py-4 font-medium text-blue-600">{ret.returnNo}</td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {format(new Date(ret.createdAt), 'MMM dd, yyyy HH:mm')}
                                    </td>
                                    <td className="px-6 py-4 text-gray-900 font-medium font-mono">{ret.purchaseInvoice?.purchaseNo}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{ret.supplier?.name}</div>
                                        <div className="text-xs text-gray-500 font-mono">{ret.supplier?.supplierCode}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-900">{ret._count?.items || 0}</td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                                        {ret.grandTotal.toLocaleString()} SAR
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wide
                                            ${ret.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : ret.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-gray-100 text-gray-600'}`}>
                                            {ret.status === 'POSTED' && <CheckCircle2 size={12} />}
                                            {ret.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/purchases/returns/${ret.id}`);
                                                }}
                                                className="p-2 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                                title="View"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/purchases/returns/${ret.id}/edit`);
                                                }}
                                                disabled={ret.status === 'CANCELLED'}
                                                className="p-2 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                title="Edit"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCancel(ret);
                                                }}
                                                disabled={ret.status === 'CANCELLED' || cancelMut.isPending}
                                                className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                title="Delete / Cancel"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-center gap-2">
                <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
                >
                    Previous
                </button>
                <span className="text-sm text-gray-600">
                    Page {pagination?.page || page} of {pagination?.totalPages || 1}
                </span>
                <button
                    type="button"
                    onClick={() => setPage((p) => Math.min((pagination?.totalPages || 1), p + 1))}
                    disabled={page >= (pagination?.totalPages || 1)}
                    className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
                >
                    Next
                </button>
            </div>

            <PurchaseReturnDeleteDialog
                isOpen={!!deleteTarget}
                returnData={deletePreview || deleteTarget}
                isLoading={isDeletePreviewLoading}
                isSubmitting={cancelMut.isPending}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmCancel}
            />
        </div>
    );
}
