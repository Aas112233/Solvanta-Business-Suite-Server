import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Modal from '../ui/Modal';
import AppDropdown from '../ui/AppDropdown';

interface CustomerCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCustomerCreated?: (customer: any) => void;
    initialData?: {
        name?: string;
        phone?: string;
    };
}

export default function CustomerCreateModal({
    isOpen,
    onClose,
    onCustomerCreated,
    initialData
}: CustomerCreateModalProps) {
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        phone: initialData?.phone || '',
        email: '',
        vatNumber: '',
        city: '',
        street: '',
    });

    const createCustomerMut = useMutation({
        mutationFn: (data: any) => api.post('/customers', data).then(r => r.data),
        onSuccess: (res) => {
            toast.success('Customer created successfully!');
            queryClient.invalidateQueries({ queryKey: ['customers'] });

            if (onCustomerCreated) {
                // Pass back the created customer from API response
                // Support both typical response structures
                const newCustomer = res.data || res;
                onCustomerCreated(newCustomer);
            }
            onClose();
            // Reset form
            setFormData({
                name: '',
                phone: '',
                email: '',
                vatNumber: '',
                city: '',
                street: '',
            });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to create customer');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            return toast.error('Name is required');
        }
        if (!formData.phone.trim()) {
            return toast.error('Phone number is required');
        }

        createCustomerMut.mutate(formData);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={createCustomerMut.isPending ? () => { } : onClose}
            title="Create New Customer"
            maxWidth="md"
            closeOnOutsideClick={!createCustomerMut.isPending}
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                        <input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold"
                            placeholder="Customer Name"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number *</label>
                        <input
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                            placeholder="05xxxxxxxx"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">VAT / Tax ID</label>
                        <input
                            value={formData.vatNumber}
                            onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                            placeholder="3xxxxxxxxxxxxx"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email (Optional)</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            placeholder="email@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
                                                <AppDropdown
                            value={formData.city}
    onChange={(v) => setFormData(prev => ({ ...prev, city: v }))}
                            options={[{ value: '', label: 'Select City' }, { value: 'Riyadh', label: 'Riyadh' }, { value: 'Jeddah', label: 'Jeddah' }, { value: 'Dammam', label: 'Dammam' }, { value: 'Mecca', label: 'Mecca' }, { value: 'Medina', label: 'Medina' }, { value: 'Other', label: 'Other' }]}
                            placeholder='Select City'
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Street Address</label>
                        <input
                            value={formData.street}
                            onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            placeholder="Building No, Street"
                        />
                    </div>
                </div>

                <div className="pt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={createCustomerMut.isPending}
                        className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={createCustomerMut.isPending}
                        className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-black disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                        {createCustomerMut.isPending ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Saving...
                            </>
                        ) : 'Create Customer'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
