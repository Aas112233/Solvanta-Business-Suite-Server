import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
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

type CustomerModalErrors = Partial<Record<'name' | 'phone' | 'email' | 'vatNumber' | 'city' | 'street', string>>;

const phoneRegex = /^[+0-9()\- ]{7,20}$/;

const customerCreateSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
    phone: z.string().trim().min(1, 'Phone number is required').max(50, 'Phone number is too long').regex(phoneRegex, 'Enter a valid phone number'),
    email: z.union([
        z.literal(''),
        z.string().trim().email('Enter a valid email').max(200, 'Email must be 200 characters or less'),
    ]),
    vatNumber: z.string().trim().max(50, 'VAT / Tax ID must be 50 characters or less'),
    city: z.string().trim().max(120, 'City must be 120 characters or less'),
    street: z.string().trim().max(250, 'Street address must be 250 characters or less'),
});

export default function CustomerCreateModal({
    isOpen,
    onClose,
    onCustomerCreated,
    initialData
}: CustomerCreateModalProps) {
    const queryClient = useQueryClient();

    const [errors, setErrors] = useState<CustomerModalErrors>({});
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        phone: initialData?.phone || '',
        email: '',
        vatNumber: '',
        city: '',
        street: '',
    });

    useEffect(() => {
        if (!isOpen) return;
        setFormData({
            name: initialData?.name || '',
            phone: initialData?.phone || '',
            email: '',
            vatNumber: '',
            city: '',
            street: '',
        });
        setErrors({});
    }, [initialData?.name, initialData?.phone, isOpen]);

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
            setErrors({});
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to create customer');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = customerCreateSchema.safeParse(formData);
        if (!parsed.success) {
            const nextErrors: CustomerModalErrors = {};
            parsed.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (
                    field === 'name' ||
                    field === 'phone' ||
                    field === 'email' ||
                    field === 'vatNumber' ||
                    field === 'city' ||
                    field === 'street'
                ) {
                    nextErrors[field] ??= issue.message;
                }
            });
            setErrors(nextErrors);
            toast.error('Please fix the highlighted fields');
            return;
        }

        setErrors({});
        createCustomerMut.mutate({
            ...parsed.data,
            email: parsed.data.email || '',
            vatNumber: parsed.data.vatNumber || '',
            city: parsed.data.city || '',
            street: parsed.data.street || '',
        });
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
                            onChange={(e) => {
                                setFormData({ ...formData, name: e.target.value });
                                setErrors((current) => ({ ...current, name: undefined }));
                            }}
                            className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold ${errors.name ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="Customer Name"
                            autoFocus
                        />
                        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number *</label>
                        <input
                            value={formData.phone}
                            onChange={(e) => {
                                setFormData({ ...formData, phone: e.target.value });
                                setErrors((current) => ({ ...current, phone: undefined }));
                            }}
                            className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono ${errors.phone ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="05xxxxxxxx"
                        />
                        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">VAT / Tax ID</label>
                        <input
                            value={formData.vatNumber}
                            onChange={(e) => {
                                setFormData({ ...formData, vatNumber: e.target.value });
                                setErrors((current) => ({ ...current, vatNumber: undefined }));
                            }}
                            className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono ${errors.vatNumber ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="3xxxxxxxxxxxxx"
                        />
                        {errors.vatNumber && <p className="mt-1 text-xs text-red-600">{errors.vatNumber}</p>}
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email (Optional)</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => {
                                setFormData({ ...formData, email: e.target.value });
                                setErrors((current) => ({ ...current, email: undefined }));
                            }}
                            className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm ${errors.email ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="email@example.com"
                        />
                        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
                        <AppDropdown
                            value={formData.city}
                            onChange={(v) => {
                                setFormData(prev => ({ ...prev, city: v }));
                                setErrors((current) => ({ ...current, city: undefined }));
                            }}
                            options={[{ value: '', label: 'Select City' }, { value: 'Riyadh', label: 'Riyadh' }, { value: 'Jeddah', label: 'Jeddah' }, { value: 'Dammam', label: 'Dammam' }, { value: 'Mecca', label: 'Mecca' }, { value: 'Medina', label: 'Medina' }, { value: 'Other', label: 'Other' }]}
                            placeholder='Select City'
                        />
                        {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Street Address</label>
                        <input
                            value={formData.street}
                            onChange={(e) => {
                                setFormData({ ...formData, street: e.target.value });
                                setErrors((current) => ({ ...current, street: undefined }));
                            }}
                            className={`w-full px-4 py-2.5 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm ${errors.street ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="Building No, Street"
                        />
                        {errors.street && <p className="mt-1 text-xs text-red-600">{errors.street}</p>}
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
