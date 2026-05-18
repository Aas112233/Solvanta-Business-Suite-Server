import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { ArrowLeft, Loader2 } from 'lucide-react';
import AppDropdown from '../../components/ui/AppDropdown';

interface CustomerAddress {
    street?: string;
    city?: string;
    country?: string;
}

interface Customer {
    id: string;
    customerCode: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    vatNumber?: string | null;
    creditLimit: number;
    allowCreditSales?: boolean;
    openingBalance: number;
    priceGroupId?: string | null;
    tags?: string[];
    notes?: string | null;
    address?: CustomerAddress | null;
}

const emptyForm = {
    customerCode: '',
    name: '',
    phone: '',
    email: '',
    vatNumber: '',
    creditLimit: '0',
    allowCreditSales: true,
    openingBalance: '0',
    priceGroupId: '',
    tags: '',
    notes: '',
    addressStreet: '',
    addressCity: '',
    addressCountry: '',
};

type FormErrors = Partial<Record<
    | 'customerCode'
    | 'name'
    | 'phone'
    | 'email'
    | 'vatNumber'
    | 'creditLimit'
    | 'openingBalance'
    | 'addressStreet'
    | 'addressCity'
    | 'addressCountry'
    | 'tags'
    | 'notes',
    string
>>;

const phoneRegex = /^[+0-9()\- ]{7,20}$/;

export default function CustomerForm() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [errors, setErrors] = useState<FormErrors>({});
    const [tagsValue, setTagsValue] = useState('');
    const [groupSuggestion, setGroupSuggestion] = useState('');
    const [formPriceGroupId, setFormPriceGroupId] = useState('');

    const { data: customerData, isLoading: isCustomerLoading } = useQuery({
        queryKey: ['customer', id],
        enabled: isEdit,
        queryFn: () => api.get(`/customers/${id}`).then((r) => r.data.data as Customer),
    });

    const { data: priceGroups, refetch: refetchPriceGroups, isFetching: isFetchingPriceGroups } = useQuery({
        queryKey: ['priceGroups'],
        queryFn: () => api.get('/products/meta/price-groups').then((r) => r.data.data),
    });

    const { data: globalCustomerGroups, refetch: refetchCustomerGroups, isFetching: isFetchingCustomerGroups } = useQuery<any[]>({
        queryKey: ['global-strings', 'CUSTOMER_GROUP'],
        queryFn: async () => {
            const res = await api.get('/global-strings?group=CUSTOMER_GROUP');
            return res.data.data;
        },
    });

    const saveMutation = useMutation({
        mutationFn: (payload: any) => (isEdit ? api.patch(`/customers/${id}`, payload) : api.post('/customers', payload)),
        onSuccess: () => {
            toast.success(isEdit ? 'Customer updated' : 'Customer created');
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            if (id) queryClient.invalidateQueries({ queryKey: ['customer', id] });
            navigate('/customers');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to save customer'),
    });

    const formDefaults = useMemo(() => {
        if (!customerData) return emptyForm;
        return {
            customerCode: customerData.customerCode || '',
            name: customerData.name || '',
            phone: customerData.phone || '',
            email: customerData.email || '',
            vatNumber: customerData.vatNumber || '',
            creditLimit: String(customerData.creditLimit ?? 0),
            allowCreditSales: customerData.allowCreditSales !== false,
            openingBalance: String(customerData.openingBalance ?? 0),
            priceGroupId: customerData.priceGroupId || '',
            tags: (customerData.tags || []).join(', '),
            notes: customerData.notes || '',
            addressStreet: customerData.address?.street || '',
            addressCity: customerData.address?.city || '',
            addressCountry: customerData.address?.country || '',
        };
    }, [customerData]);

    useEffect(() => {
        setTagsValue(formDefaults.tags || '');
        setFormPriceGroupId(formDefaults.priceGroupId || '');
    }, [formDefaults.tags, formDefaults.priceGroupId]);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const tagsInput = tagsValue;
        const nextErrors: FormErrors = {};

        const customerCode = String(fd.get('customerCode') || '').trim();
        const name = String(fd.get('name') || '').trim();
        const phone = String(fd.get('phone') || '').trim();
        const email = String(fd.get('email') || '').trim();
        const vatNumber = String(fd.get('vatNumber') || '').trim();
        const creditLimit = Number(fd.get('creditLimit') || 0);
        const allowCreditSales = fd.get('allowCreditSales') === 'on';
        const openingBalance = Number(fd.get('openingBalance') || 0);
        const notes = String(fd.get('notes') || '').trim();
        const addressStreet = String(fd.get('addressStreet') || '').trim();
        const addressCity = String(fd.get('addressCity') || '').trim();
        const addressCountry = String(fd.get('addressCountry') || '').trim();
        const tags = tagsInput
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);

        if (isEdit && !customerCode) nextErrors.customerCode = 'Customer code is required';
        if (customerCode && !/^[A-Za-z0-9_-]{2,30}$/.test(customerCode)) {
            nextErrors.customerCode = 'Use 2-30 chars: letters, numbers, _ or -';
        }
        if (!name) nextErrors.name = 'Customer name is required';
        if (name && (name.length < 2 || name.length > 120)) nextErrors.name = 'Name must be 2-120 characters';
        if (phone && !phoneRegex.test(phone)) nextErrors.phone = 'Phone must be 7-20 characters';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email';
        if (vatNumber && vatNumber.length > 50) nextErrors.vatNumber = 'VAT Number must be 50 characters or less';
        if (!Number.isFinite(creditLimit) || creditLimit < 0) nextErrors.creditLimit = 'Credit limit must be 0 or greater';
        if (!Number.isFinite(openingBalance)) nextErrors.openingBalance = 'Opening balance is invalid';
        if (addressStreet.length > 250) nextErrors.addressStreet = 'Max 250 characters';
        if (addressCity.length > 120) nextErrors.addressCity = 'Max 120 characters';
        if (addressCountry.length > 120) nextErrors.addressCountry = 'Max 120 characters';
        if (notes.length > 1000) nextErrors.notes = 'Max 1000 characters';
        if (tags.length > 20) nextErrors.tags = 'Maximum 20 tags';
        if (tags.some((t) => t.length > 40)) nextErrors.tags = 'Each tag must be 40 characters or less';

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            toast.error('Please fix the highlighted fields');
            return;
        }

        saveMutation.mutate({
            ...((isEdit || customerCode) && {
                customerCode,
            }),
            name,
            phone,
            email,
            vatNumber: vatNumber || null,
            creditLimit,
            allowCreditSales,
            openingBalance,
            priceGroupId: String(fd.get('priceGroupId') || '').trim() || null,
            tags,
            notes,
            address: {
                street: addressStreet,
                city: addressCity,
                country: addressCountry,
            },
        });
    };

    if (isEdit && isCustomerLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        {isEdit ? 'Edit Customer' : 'Add Customer'}
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        {isEdit ? 'Update customer details' : 'Create a new customer profile'}
                    </p>
                </div>
                <button
                    onClick={() => navigate('/customers')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                >
                    <ArrowLeft size={16} /> Back
                </button>
            </div>

            <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    <div className="pb-4 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-800">Customer Information</h2>
                        <p className="text-xs text-gray-500 mt-1">Fields marked with * are required</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Code {isEdit ? '*' : ''}</label>
                            <input
                                name="customerCode"
                                defaultValue={formDefaults.customerCode}
                                required={isEdit}
                                readOnly={!isEdit}
                                placeholder={isEdit ? 'C001' : 'Auto-generated'}
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.customerCode ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.customerCode && <p className="text-xs text-red-600 mt-1">{errors.customerCode}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Name *</label>
                            <input
                                name="name"
                                defaultValue={formDefaults.name}
                                required
                                placeholder="Customer name"
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.name ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Phone</label>
                            <input
                                name="phone"
                                defaultValue={formDefaults.phone}
                                placeholder="+966-5..."
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.phone ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Email</label>
                            <input
                                name="email"
                                type="email"
                                defaultValue={formDefaults.email}
                                placeholder="email@example.com"
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.email ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Tax ID / VAT Number</label>
                            <input
                                name="vatNumber"
                                defaultValue={formDefaults.vatNumber}
                                placeholder="VAT Number"
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.vatNumber ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.vatNumber && <p className="text-xs text-red-600 mt-1">{errors.vatNumber}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Credit Limit</label>
                            <input
                                name="creditLimit"
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={formDefaults.creditLimit}
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.creditLimit ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.creditLimit && <p className="text-xs text-red-600 mt-1">{errors.creditLimit}</p>}
                        </div>
                        <div className="sm:pt-7">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    name="allowCreditSales"
                                    type="checkbox"
                                    defaultChecked={Boolean(formDefaults.allowCreditSales)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Allow credit sales
                            </label>
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Opening Balance</label>
                            <input
                                name="openingBalance"
                                type="number"
                                step="0.01"
                                defaultValue={formDefaults.openingBalance}
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.openingBalance ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.openingBalance && <p className="text-xs text-red-600 mt-1">{errors.openingBalance}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Price Group</label>
                            <input type="hidden" name="priceGroupId" value={formPriceGroupId} />
                            <AppDropdown
                                value={formPriceGroupId}
                                onChange={(v) => setFormPriceGroupId(v)}
                                options={[{ value: '', label: 'Default' }, ...(priceGroups || []).map((pg: any) => ({ value: pg.id, label: pg.name }))]}
                                placeholder="Default"
                                searchable
                                onRefresh={() => refetchPriceGroups()}
                                refreshing={isFetchingPriceGroups}
                                refreshLabel="Refresh price groups"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Address</label>
                            <input
                                name="addressStreet"
                                defaultValue={formDefaults.addressStreet}
                                placeholder="Street address"
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.addressStreet ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.addressStreet && <p className="text-xs text-red-600 mt-1">{errors.addressStreet}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">City</label>
                            <input
                                name="addressCity"
                                defaultValue={formDefaults.addressCity}
                                placeholder="City"
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.addressCity ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.addressCity && <p className="text-xs text-red-600 mt-1">{errors.addressCity}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-medium mb-1.5 block text-gray-600">Country</label>
                            <input
                                name="addressCountry"
                                defaultValue={formDefaults.addressCountry}
                                placeholder="Country"
                                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.addressCountry ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                            />
                            {errors.addressCountry && <p className="text-xs text-red-600 mt-1">{errors.addressCountry}</p>}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-medium mb-1.5 block text-gray-600">Tags (comma separated)</label>
                        <input
                            name="tags"
                            value={tagsValue}
                            onChange={(e) => setTagsValue(e.target.value)}
                            placeholder="retail, vip, wholesale"
                            className={`w-full rounded-lg px-3.5 py-2.5 text-sm border ${errors.tags ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                        />
                        <div className="mt-2">
                            <AppDropdown
                                value={groupSuggestion}
                                onChange={(value) => {
                                    setGroupSuggestion(value);
                                    if (!value) return;
                                    const current = tagsValue
                                        .split(',')
                                        .map((tag) => tag.trim())
                                        .filter(Boolean);
                                    if (!current.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
                                        const next = [...current, value].join(', ');
                                        setTagsValue(next);
                                    }
                                }}
                                options={[
                                    { value: '', label: 'Quick add customer group...' },
                                    ...((globalCustomerGroups || []).map((g: any) => ({ value: String(g.value), label: String(g.value) }))),
                                ]}
                                placeholder="Quick add customer group..."
                                searchable
                                onRefresh={() => refetchCustomerGroups()}
                                refreshing={isFetchingCustomerGroups}
                                refreshLabel="Refresh groups"
                            />
                        </div>
                        {errors.tags && <p className="text-xs text-red-600 mt-1">{errors.tags}</p>}
                    </div>

                    <div>
                        <label className="text-xs font-medium mb-1.5 block text-gray-600">Notes</label>
                        <textarea
                            name="notes"
                            defaultValue={formDefaults.notes}
                            rows={3}
                            className={`w-full rounded-lg px-3.5 py-2.5 text-sm resize-none border ${errors.notes ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                        />
                        {errors.notes && <p className="text-xs text-red-600 mt-1">{errors.notes}</p>}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => navigate('/customers')}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saveMutation.isPending}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saveMutation.isPending ? 'Saving...' : 'Save Customer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
