import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import ModuleRefreshButton from '../../components/ModuleRefreshButton';
import toast from 'react-hot-toast';
import PurchaseReturnDeleteDialog from '../../components/purchases/PurchaseReturnDeleteDialog';
import { printPdfFromComponent } from '../../lib/fileExport';
import { PurchaseReturnPdf } from '../../components/purchases/PurchaseReturnPdf';
import { useAuthStore } from '../../stores/authStore';
import { Printer } from 'lucide-react';
import AppLoader from '../../components/ui/AppLoader';

export default function PurchaseReturnDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const user = useAuthStore((s: any) => s.user);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['purchase-return', id],
        queryFn: () => api.get(`/purchases/returns/${id}`).then((r) => r.data.data),
        enabled: !!id,
    });

    const cancelMut = useMutation({
        mutationFn: () => api.delete(`/purchases/returns/${id}`),
        onSuccess: (res: any) => {
            toast.success(res?.data?.data?.message || 'Purchase return cancelled');
            queryClient.invalidateQueries({ queryKey: ['purchase-return', id] });
            queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
            navigate('/purchases/returns');
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message || 'Failed to cancel return');
        },
    });

    const onCancelReturn = () => {
        if (!data || data.status === 'CANCELLED') return;
        setDeleteDialogOpen(true);
    };

    const handlePrint = async () => {
        if (!data) return;
        await printPdfFromComponent(
            <PurchaseReturnPdf
                data={data}
                companyName={user?.company?.name || 'SOLVANTA ERP'}
                currency="SAR"
            />
        );
    };

    if (isLoading) return <AppLoader />;
    if (!data) return <div className="py-10 text-center text-sm text-gray-500">Purchase return not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">{data.returnNo}</h1>
                        <ModuleRefreshButton queryKeys={[['purchase-return', id]]} />
                    </div>
                    <p className="text-sm text-gray-500">Purchase {data.purchaseInvoice?.purchaseNo} · {data.supplier?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg flex items-center gap-2 hover:bg-gray-50"
                    >
                        <Printer size={16} /> Print
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(`/purchases/returns/${data.id}/edit`)}
                        disabled={data.status === 'CANCELLED'}
                        className="px-3 py-2 text-sm border border-amber-300 text-amber-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        onClick={onCancelReturn}
                        disabled={data.status === 'CANCELLED' || cancelMut.isPending}
                        className="px-3 py-2 text-sm border border-red-300 text-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {cancelMut.isPending ? 'Deleting...' : 'Delete'}
                    </button>
                    <button type="button" onClick={() => navigate('/purchases/returns')} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
                        Back
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Subtotal</p>
                    <p className="text-lg font-semibold text-gray-900">{Number(data.subtotal || 0).toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Tax</p>
                    <p className="text-lg font-semibold text-gray-900">{Number(data.taxTotal || 0).toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Grand Total</p>
                    <p className="text-lg font-semibold text-gray-900">{Number(data.grandTotal || 0).toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Status</p>
                    <p className="text-lg font-semibold text-gray-900">{data.status}</p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            {['Product', 'Unit', 'Qty', 'Unit Cost', 'Tax', 'Total'].map((h) => (
                                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(data.items || []).map((item: any) => (
                            <tr key={item.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 text-sm text-gray-900">
                                    {item.product?.name}
                                    <div className="text-xs text-gray-500">{item.product?.itemCode}</div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-900">
                                            {item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.unitName || item.unitCode}
                                        </span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[10px] text-gray-400 font-mono">{item.unitCode}</span>
                                            {item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit > 1 && (
                                                <span className="text-[10px] text-blue-600 bg-blue-50 px-1 border border-blue-100 rounded font-bold">
                                                    x{item.product?.units?.find((u: any) => u.unitCode === item.unitCode)?.qtyInBaseUnit}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">{Number(item.qty || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{Number(item.unitCost || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{Number(item.taxAmount || 0).toFixed(2)}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{Number(item.lineTotal || 0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data.reason && (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Reason</p>
                    <p className="text-sm text-gray-800 mt-1">{data.reason}</p>
                </div>
            )}
            {data.notes && (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Notes</p>
                    <p className="text-sm text-gray-800 mt-1">{data.notes}</p>
                </div>
            )}

            <PurchaseReturnDeleteDialog
                isOpen={deleteDialogOpen}
                returnData={data}
                isSubmitting={cancelMut.isPending}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={() => cancelMut.mutate()}
            />
        </div>
    );
}
