import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { X, Save, Loader2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface WarehouseFormModalProps {
    warehouse?: any;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function WarehouseFormModal({ warehouse, isOpen, onClose, onSuccess }: WarehouseFormModalProps) {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        phone: '',
        isActive: true
    });

    useEffect(() => {
        if (warehouse) {
            setFormData({
                name: warehouse.name || '',
                code: warehouse.code || '',
                address: warehouse.address || '',
                phone: warehouse.phone || '',
                isActive: warehouse.isActive ?? true
            });
        }
    }, [warehouse]);

    const mutation = useMutation({
        mutationFn: (data: any) => {
            if (warehouse?.id) {
                return api.patch(`/branches/${warehouse.id}`, data);
            }
            return api.post('/branches', data);
        },
        onSuccess: () => {
            toast.success(`Warehouse ${warehouse ? 'updated' : 'created'} successfully`);
            queryClient.invalidateQueries({ queryKey: ['warehouses'] });
            onSuccess();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Something went wrong');
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate(formData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Building2 size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">
                            {warehouse ? 'Edit Warehouse' : 'Add New Warehouse'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1 space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Warehouse Name</label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm bg-gray-50/50"
                                placeholder="e.g. Main Warehouse"
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1 space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Warehouse Code</label>
                            <input
                                required
                                type="text"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm bg-gray-50/50"
                                placeholder="e.g. WH-001"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                        <input
                            type="text"
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm bg-gray-50/50"
                            placeholder="e.g. +1 234 567 890"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-700">Address / Location</label>
                        <textarea
                            rows={3}
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm bg-gray-50/50 resize-none"
                            placeholder="Full address of the warehouse"
                        />
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={formData.isActive}
                            onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-blue-900">
                            Active and available for transactions
                        </label>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={mutation.isPending}
                            className="inline-flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 text-sm font-bold"
                        >
                            {mutation.isPending ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Save size={18} />
                            )}
                            {warehouse ? 'Update Warehouse' : 'Save Warehouse'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
