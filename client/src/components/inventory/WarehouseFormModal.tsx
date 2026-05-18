import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { X, Save, Loader2, Building2, AlertCircle } from 'lucide-react';
import toast from '@/lib/toast';

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
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (warehouse) {
            setFormData({
                name: warehouse.name || '',
                code: warehouse.code || '',
                address: warehouse.address || '',
                phone: warehouse.phone || '',
                isActive: warehouse.isActive ?? true
            });
        } else {
            // Auto-generate code for new warehouse
            const generatedCode = `WH-${Date.now().toString().slice(-6)}`;
            setFormData({
                name: '',
                code: generatedCode,
                address: '',
                phone: '',
                isActive: true
            });
        }
    }, [warehouse, isOpen]);

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
            const errorMessage = err.response?.data?.error?.message || 'Something went wrong';

            // Check if it's a validation error with field details
            if (err.response?.data?.error?.details) {
                const validationErrors: Record<string, string> = {};
                err.response.data.error.details.forEach((detail: any) => {
                    const field = detail.path?.[0] || detail.field;
                    if (field) {
                        validationErrors[field] = detail.message;
                    }
                });
                setErrors(validationErrors);
                toast.error('Please fix the errors below');
            } else {
                toast.error(errorMessage);
            }
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({}); // Clear previous errors
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
                                onChange={e => {
                                    setFormData({ ...formData, name: e.target.value });
                                    if (errors.name) setErrors({ ...errors, name: '' });
                                }}
                                className={`w-full px-4 py-2.5 rounded-xl border transition-all outline-none text-sm bg-gray-50/50 ${errors.name
                                    ? 'border-red-500 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                                    : 'border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                    }`}
                                placeholder="e.g. Main Warehouse"
                            />
                            {errors.name && (
                                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                                    <AlertCircle size={12} />
                                    {errors.name}
                                </p>
                            )}
                        </div>
                        <div className="col-span-2 sm:col-span-1 space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Warehouse Code</label>
                            <input
                                required
                                type="text"
                                value={formData.code}
                                readOnly
                                className={`w-full px-4 py-2.5 rounded-xl border bg-gray-100 text-gray-600 cursor-not-allowed text-sm ${errors.code ? 'border-red-500' : 'border-gray-200'
                                    }`}
                                title="Warehouse code is auto-generated and cannot be edited"
                            />
                            {errors.code && (
                                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                                    <AlertCircle size={12} />
                                    {errors.code}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                        <input
                            type="text"
                            value={formData.phone}
                            onChange={e => {
                                setFormData({ ...formData, phone: e.target.value });
                                if (errors.phone) setErrors({ ...errors, phone: '' });
                            }}
                            className={`w-full px-4 py-2.5 rounded-xl border transition-all outline-none text-sm bg-gray-50/50 ${errors.phone
                                    ? 'border-red-500 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                                    : 'border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                }`}
                            placeholder="e.g. +1 234 567 890"
                        />
                        {errors.phone && (
                            <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                                <AlertCircle size={12} />
                                {errors.phone}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-gray-700">Address / Location</label>
                        <textarea
                            rows={3}
                            value={formData.address}
                            onChange={e => {
                                setFormData({ ...formData, address: e.target.value });
                                if (errors.address) setErrors({ ...errors, address: '' });
                            }}
                            className={`w-full px-4 py-2.5 rounded-xl border transition-all outline-none text-sm bg-gray-50/50 resize-none ${errors.address
                                    ? 'border-red-500 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                                    : 'border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                                }`}
                            placeholder="Full address of the warehouse"
                        />
                        {errors.address && (
                            <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                                <AlertCircle size={12} />
                                {errors.address}
                            </p>
                        )}
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
