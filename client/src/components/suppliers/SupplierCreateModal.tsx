import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Modal from '../ui/Modal';
import { useAuthStore } from '@/stores/authStore';

interface SupplierCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSupplierCreated?: (supplier: any) => void;
    initialData?: {
        name?: string;
    };
}

export default function SupplierCreateModal({
    isOpen,
    onClose,
    onSupplierCreated,
    initialData
}: SupplierCreateModalProps) {
    const queryClient = useQueryClient();
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';

    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        phone: '',
        vatNumber: '',
        address: '',
        city: '',
        country: '',
        openingBalance: '0',
    });

    const createSupplierMut = useMutation({
        mutationFn: (data: any) => api.post('/suppliers', data).then(r => r.data),
        onSuccess: (res) => {
            const newSupplier = res.data || res;
            toast.success('Supplier created successfully!');
            queryClient.setQueryData(['suppliers'], (current: any[] | undefined) => {
                if (!Array.isArray(current)) return current;
                const alreadyExists = current.some((supplier) => supplier?.id === newSupplier?.id);
                return alreadyExists ? current : [newSupplier, ...current];
            });
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            queryClient.invalidateQueries({ queryKey: ['suppliers-stats'] });

            if (onSupplierCreated) {
                onSupplierCreated(newSupplier);
            }
            onClose();
            // Reset form
            setFormData({
                name: '',
                phone: '',
                vatNumber: '',
                address: '',
                city: '',
                country: '',
                openingBalance: '0',
            });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to create supplier');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            return toast.error('Corporate Name is required');
        }

        createSupplierMut.mutate({
            ...formData,
            openingBalance: Number(formData.openingBalance) || 0,
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={createSupplierMut.isPending ? () => { } : onClose}
            title="Establish Partnership (New Supplier)"
            maxWidth="xl"
            closeOnOutsideClick={!createSupplierMut.isPending}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-1">
                        <label className="text-sm font-semibold text-gray-700 mb-1.5 flex justify-between">
                            Unique Vendor Code
                            <span className="text-[10px] text-gray-400 font-normal mt-0.5">(Auto-generated)</span>
                        </label>
                        <input
                            placeholder="Auto-generated"
                            disabled
                            className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 font-mono text-gray-500 outline-none transition-all"
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Tax / VAT ID</label>
                        <input
                            value={formData.vatNumber}
                            onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                            placeholder="VAT-12345"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Corporate Name *</label>
                        <input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Global Logistics Ltd"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-lg font-bold"
                            autoFocus
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Primary Phone</label>
                        <input
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+1 234 567 890"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Opening Balance ({currency})</label>
                        <input
                            type="number"
                            step="0.01"
                            value={formData.openingBalance}
                            onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                            placeholder="0.00"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest pt-2">Location Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Street Address</label>
                            <input
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                placeholder="123 Supply Ave, Suite 500"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">City</label>
                            <input
                                value={formData.city}
                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                placeholder="New York"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Country</label>
                            <input
                                value={formData.country}
                                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                placeholder="USA"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-gray-50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={createSupplierMut.isPending}
                        className="flex-1 py-3.5 px-6 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold transition-all border border-gray-100 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={createSupplierMut.isPending}
                        className="flex-1 py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                        {createSupplierMut.isPending ? <Loader2 className="animate-spin" size={20} /> : 'Create Supplier'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
