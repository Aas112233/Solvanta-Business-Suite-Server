import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from '@/lib/toast';
import api from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import AppLoader from '../../components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';
import { useCompanyTaxSettings } from '../../lib/tax';

type Tax = {
    id: string;
    name: string;
    rate: number;
    type: 'SALES' | 'PURCHASE' | 'BOTH';
    isActive: boolean;
    isDefault: boolean;
};

const taxSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    rate: z.number().min(0, 'Rate must be 0 or greater').max(1, 'Rate must be 1 (100%) or less'),
    type: z.enum(['SALES', 'PURCHASE', 'BOTH']),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
});

type TaxFormValues = z.infer<typeof taxSchema>;

export default function Taxes() {
    const qc = useQueryClient();
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const canManageSettings = hasPermission('admin.manageSettings');
    const companyTax = useCompanyTaxSettings();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTax, setEditingTax] = useState<Tax | null>(null);

    const { data: taxes = [], isLoading } = useQuery({
        queryKey: ['taxes'],
        queryFn: async () => {
            const res = await api.get('/taxes');
            return res.data.data as Tax[];
        }
    });

    const { register, handleSubmit, reset, control, formState: { errors } } = useForm<TaxFormValues>({
        resolver: zodResolver(taxSchema),
        defaultValues: {
            name: '',
            rate: companyTax.defaultRate,
            type: 'BOTH',
            isActive: true,
            isDefault: false
        }
    });

    const createMut = useMutation({
        mutationFn: async (data: TaxFormValues) => {
            const res = await api.post('/taxes', data);
            return res.data;
        },
        onSuccess: () => {
            toast.success('Tax created successfully');
            qc.invalidateQueries({ queryKey: ['taxes'] });
            closeModal();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to create tax');
        }
    });

    const updateMut = useMutation({
        mutationFn: async (data: { id: string } & Partial<TaxFormValues>) => {
            const res = await api.patch(`/taxes/${data.id}`, data);
            return res.data;
        },
        onSuccess: () => {
            toast.success('Tax updated successfully');
            qc.invalidateQueries({ queryKey: ['taxes'] });
            closeModal();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to update tax');
        }
    });

    const deleteMut = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/taxes/${id}`);
        },
        onSuccess: () => {
            toast.success('Tax deleted successfully');
            qc.invalidateQueries({ queryKey: ['taxes'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error?.message || 'Failed to delete tax');
        }
    });

    const openModal = (tax?: Tax) => {
        if (tax) {
            setEditingTax(tax);
            reset({
                name: tax.name,
                rate: tax.rate,
                type: tax.type,
                isActive: tax.isActive,
                isDefault: tax.isDefault
            });
        } else {
            setEditingTax(null);
            reset({ name: '', rate: companyTax.defaultRate, type: 'BOTH', isActive: true, isDefault: false });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingTax(null);
        reset();
    };

    const onSubmit = (data: TaxFormValues) => {
        if (editingTax) {
            updateMut.mutate({ id: editingTax.id, ...data });
        } else {
            createMut.mutate(data);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Tax Management</h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Configure tax rates for sales and purchases
                    </p>
                </div>
                {canManageSettings && (
                    <button
                        onClick={() => openModal()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm font-medium"
                    >
                        <Plus size={16} />
                        Add Tax
                    </button>
                )}
            </div>

            {!canManageSettings && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
                    <ShieldAlert size={16} className="mt-0.5" />
                    You can view taxes, but only users with `admin.manageSettings` can manage them.
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <AppLoader />
                ) : taxes.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">
                        No taxes configured. Click "Add Tax" to create one.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Name</th>
                                    <th className="px-6 py-4">Rate (%)</th>
                                    <th className="px-6 py-4">Type</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-center">Default</th>
                                    {canManageSettings && <th className="px-6 py-4 text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {taxes.map((tax) => (
                                    <tr key={tax.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900">{tax.name}</td>
                                        <td className="px-6 py-4">{(tax.rate * 100).toFixed(2)}%</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                                                {tax.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {tax.isActive ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700">Valid</span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500">Inactive</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {tax.isDefault ? (
                                                <span className="inline-flex items-center text-emerald-500" title="Default Tax">
                                                    <CheckCircle2 size={16} />
                                                </span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        {canManageSettings && (
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button
                                                    onClick={() => openModal(tax)}
                                                    className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                                                    title="Edit Tax"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm('Are you sure you want to delete this tax?')) {
                                                            deleteMut.mutate(tax.id);
                                                        }
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    title="Delete Tax"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal for Add / Edit */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-900">
                                {editingTax ? 'Edit Tax' : 'Add New Tax'}
                            </h2>
                            <button type="button" onClick={closeModal} className="p-1.5 text-gray-400 hover:bg-white hover:text-gray-600 rounded-full transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tax Name</label>
                                <input
                                    {...register('name')}
                                    type="text"
                                    placeholder="e.g. VAT 15%"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                                />
                                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Rate (%)</label>
                                <Controller
                                    name="rate"
                                    control={control}
                                    render={({ field: { value, onChange } }) => (
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="100"
                                            value={+(value * 100).toFixed(4)}
                                            onChange={(e) => onChange(parseFloat(e.target.value) / 100)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                                        />
                                    )}
                                />
                                {errors.rate && <p className="text-xs text-red-500 mt-1">{errors.rate.message}</p>}
                                <p className="text-[11px] text-slate-500 mt-1">Enter the percentage value, e.g. 15 for 15%</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Application Type</label>
                                <Controller
                                    name="type"
                                    control={control}
                                    render={({ field }) => (
                                        <AppDropdown
                                            value={field.value}
                                            onChange={(v) => field.onChange(v)}
                                            options={[
                                                { value: 'BOTH', label: 'Sales & Purchases' },
                                                { value: 'SALES', label: 'Sales Only' },
                                                { value: 'PURCHASE', label: 'Purchases Only' },
                                            ]}
                                            placeholder="Select Type"
                                        />
                                    )}
                                />
                                {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type.message}</p>}
                            </div>

                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 select-none">
                                    <input
                                        type="checkbox"
                                        {...register('isActive')}
                                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm text-slate-700 font-medium">Active</span>
                                </label>

                                <label className="flex items-center gap-2 select-none">
                                    <input
                                        type="checkbox"
                                        {...register('isDefault')}
                                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                    />
                                    <span className="text-sm text-slate-700 font-medium">Default Tax</span>
                                </label>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createMut.isPending || updateMut.isPending}
                                    className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
                                >
                                    {createMut.isPending || updateMut.isPending ? 'Saving...' : 'Save Tax'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
