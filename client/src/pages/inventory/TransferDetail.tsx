import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Send, CheckCircle2, Package,
    Calendar, MapPin, User, Hash, AlertCircle
} from 'lucide-react';
import api from '../../lib/api';
import AppLoader from '../../components/ui/AppLoader';

export default function TransferDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: transfer, isLoading, isError } = useQuery({
        queryKey: ['transfer', id],
        queryFn: () => api.get(`/inventory/transfers/${id}`).then((r: any) => r.data.data)
    });

    const sendMut = useMutation({
        mutationFn: () => api.post(`/inventory/transfers/${id}/send`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfer', id] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
        }
    });

    const receiveMut = useMutation({
        mutationFn: () => api.post(`/inventory/transfers/${id}/receive`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transfer', id] });
            queryClient.invalidateQueries({ queryKey: ['transfers'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }
    });

    if (isLoading) return <AppLoader />;
    if (isError || !transfer) return <div className="p-8 text-center text-red-500">Transfer not found</div>;

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700';
            case 'SENT': return 'bg-blue-50 text-blue-700';
            case 'RECEIVED': return 'bg-green-50 text-green-700';
            case 'CANCELLED': return 'bg-red-50 text-red-700';
            default: return 'bg-gray-50 text-gray-600';
        }
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/inventory/transfers')} className="p-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{transfer.transferNo}</h1>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(transfer.status)}`}>
                                {transfer.status}
                            </span>
                            • Created on {new Date(transfer.createdAt).toLocaleString()}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {transfer.status === 'DRAFT' && (
                        <button
                            onClick={() => sendMut.mutate()}
                            disabled={sendMut.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Send size={18} /> {sendMut.isPending ? 'Sending...' : 'Mark as Sent'}
                        </button>
                    )}
                    {transfer.status === 'SENT' && (
                        <button
                            onClick={() => receiveMut.mutate()}
                            disabled={receiveMut.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                            <CheckCircle2 size={18} /> {receiveMut.isPending ? 'Receiving...' : 'Mark as Received'}
                        </button>
                    )}
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">From Branch</h3>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-50 text-red-600 rounded-lg"><MapPin size={20} /></div>
                        <div>
                            <p className="font-bold text-gray-900">{transfer.fromBranch?.name}</p>
                            <p className="text-sm text-gray-500">Source of stock</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">To Branch</h3>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg"><MapPin size={20} /></div>
                        <div>
                            <p className="font-bold text-gray-900">{transfer.toBranch?.name}</p>
                            <p className="text-sm text-gray-500">Destination for stock</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Created By</h3>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><User size={20} /></div>
                        <div>
                            <p className="font-bold text-gray-900">{transfer.createdBy?.name}</p>
                            <p className="text-sm text-gray-500">System Administrator</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Workflow Timeline */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Transfer Timeline</h3>
                <div className="flex flex-col sm:flex-row justify-between items-center relative">
                    <div className="flex-1 flex flex-col items-center z-10">
                        <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center mb-2">1</div>
                        <p className="font-medium text-sm">Created</p>
                        <p className="text-xs text-gray-400">{new Date(transfer.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className={`flex-1 h-1 hidden sm:block ${transfer.sentAt ? 'bg-blue-600' : 'bg-gray-100'}`}></div>
                    <div className="flex-1 flex flex-col items-center z-10">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${transfer.sentAt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>2</div>
                        <p className={`font-medium text-sm ${transfer.sentAt ? 'text-gray-900' : 'text-gray-400'}`}>Sent</p>
                        {transfer.sentAt && <p className="text-xs text-gray-400">{new Date(transfer.sentAt).toLocaleDateString()}</p>}
                    </div>
                    <div className={`flex-1 h-1 hidden sm:block ${transfer.receivedAt ? 'bg-blue-600' : 'bg-gray-100'}`}></div>
                    <div className="flex-1 flex flex-col items-center z-10">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${transfer.receivedAt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>3</div>
                        <p className={`font-medium text-sm ${transfer.receivedAt ? 'text-gray-900' : 'text-gray-400'}`}>Received</p>
                        {transfer.receivedAt && <p className="text-xs text-gray-400">{new Date(transfer.receivedAt).toLocaleDateString()}</p>}
                    </div>
                </div>
            </div>

            {/* Items Table */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Package size={20} className="text-gray-400" /> Items List
                    </h3>
                    <span className="text-sm text-gray-500">{transfer.items?.length || 0} items</span>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-white border-b border-gray-100">
                        <tr>
                            <th className="py-3 px-6 text-sm font-semibold text-gray-600">Product</th>
                            <th className="py-3 px-6 text-sm font-semibold text-gray-600">Unit</th>
                            <th className="py-3 px-6 text-sm font-semibold text-gray-600 text-right">Quantity</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {transfer.items?.map((item: any) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                <td className="py-4 px-6">
                                    <div className="text-sm font-medium text-gray-900">{item.product?.name}</div>
                                    <div className="text-xs text-gray-500">{item.product?.itemCode}</div>
                                </td>
                                <td className="py-4 px-6 text-sm text-gray-600">{item.unitCode}</td>
                                <td className="py-4 px-6 text-sm font-bold text-right text-gray-900">{item.qty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Summary/Notes */}
            {transfer.notes && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex gap-3">
                    <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-yellow-800 uppercase tracking-wider">Internal Notes</p>
                        <p className="text-yellow-700">{transfer.notes}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
