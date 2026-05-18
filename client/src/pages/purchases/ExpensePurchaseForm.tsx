import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import toast from '@/lib/toast';
import { ArrowLeft, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import AppLoader from '../../components/ui/AppLoader';
import AppDropdown from '../../components/ui/AppDropdown';
import { toDateInputValue, useCompanyRegionalSettings } from '../../lib/companySettings';
import {
    buildPaymentMethodOptions,
    DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS,
    EXPENSE_PURCHASE_PAYMENT_METHOD_KEYS,
    GLOBAL_STRING_GROUPS,
    normalizePaymentMethodKey,
} from '../../lib/globalStrings';

interface ExpensePurchaseItem {
    description: string;
    expenseAccountId: string;
    amount: number;
    quantity: number;
}

interface ExpensePurchaseForm {
    vendorName: string;
    invoiceNo?: string;
    date: string;
   paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CREDIT';
    branchId: string;
    notes?: string;
    items: ExpensePurchaseItem[];
}

export default function ExpensePurchaseForm() {
   const navigate = useNavigate();
   const { id} = useParams<{ id: string }>();
   const queryClient = useQueryClient();
   const isEditMode = Boolean(id);
   const regionalSettings = useCompanyRegionalSettings();

   const [form, setForm] = useState<ExpensePurchaseForm>({
        vendorName: '',
        invoiceNo: '',
        date: toDateInputValue(undefined, regionalSettings),
       paymentMethod: 'CASH',
        branchId: '',
        notes: '',
        items: [{ description: '', expenseAccountId: '', amount: 0, quantity: 1 }],
    });

    // Fetch branches
   const { data: branchesData } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then(r => r.data.data),
    });

    // Fetch expense accounts (Chart of Accounts - Expense type)
   const { data: accountsData } = useQuery({
        queryKey: ['expense-accounts'],
        queryFn: () => api.get('/accounting/accounts', {
           params: { accountType: 'EXPENSE' }
        }).then(r => r.data.data),
    });

    const { data: globalPaymentMethods, refetch: refetchPaymentMethods, isFetching: isFetchingPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.purchasePaymentMethods],
        queryFn: () => api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.purchasePaymentMethods}`).then((r) => r.data.data),
    });

    const resolvedPaymentMethodOptions = buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS, {
        blankLabel: 'Select payment method',
        allowedKeys: EXPENSE_PURCHASE_PAYMENT_METHOD_KEYS,
    });

    // Fetch existing data if editing
   const { data: existingData, isLoading: isFetching } = useQuery({
        queryKey: ['expense-purchase', id],
        queryFn: () => api.get(`/purchases/expense-purchases/${id}`).then(r => r.data.data),
        enabled: isEditMode,
    });

    // Populate form when editing
    useEffect(() => {
        if (existingData) {
            setForm({
                vendorName: existingData.vendorName || '',
                invoiceNo: existingData.invoiceNo || '',
                date: toDateInputValue(existingData.date, regionalSettings),
               paymentMethod: normalizePaymentMethodKey(existingData.paymentMethod, 'CASH') as ExpensePurchaseForm['paymentMethod'],
                branchId: existingData.branchId || '',
                notes: existingData.notes || '',
                items: existingData.items?.length > 0 
                    ? existingData.items.map((item: any) => ({
                        description: item.description,
                        expenseAccountId: item.expenseAccountId,
                        amount: Number(item.amount),
                        quantity: Number(item.quantity || 1),
                    }))
                    : [{ description: '', expenseAccountId: '', amount: 0, quantity: 1 }],
            });
        }
    }, [existingData, regionalSettings]);

    // Create/Update mutation
   const mutation = useMutation({
        mutationFn: async (data: ExpensePurchaseForm) => {
            if (isEditMode) {
                // Note: You'll need to add PUT endpoint for update
                throw new Error('Update not implemented yet');
            } else {
                return api.post('/purchases/expense-purchases', data);
            }
        },
        onSuccess: () => {
           toast.success(isEditMode ? 'Expense purchase updated' : 'Expense purchase created');
            queryClient.invalidateQueries({ queryKey: ['expense-purchases'] });
            navigate('/purchases/expense');
        },
        onError: (error: any) => {
           toast.error(error.response?.data?.message || 'Failed to save expense purchase');
        },
    });

   const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validation
        if (!form.vendorName.trim()) {
           toast.error('Vendor name is required');
            return;
        }
        if (!form.branchId) {
           toast.error('Branch is required');
            return;
        }
        if (form.items.length === 0) {
           toast.error('At least one item is required');
            return;
        }
        if (form.items.some(item => !item.description || !item.expenseAccountId || item.amount <= 0)) {
           toast.error('Please fill all item fields correctly');
            return;
        }

        mutation.mutate(form);
    };

   const addItem = () => {
        setForm(prev => ({
            ...prev,
            items: [...prev.items, { description: '', expenseAccountId: '', amount: 0, quantity: 1 }],
        }));
    };

   const removeItem = (index: number) => {
        if (form.items.length === 1) {
           toast.error('At least one item is required');
            return;
        }
        setForm(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }));
    };

   const updateItem = (index: number, field: keyof ExpensePurchaseItem, value: any) => {
        setForm(prev => ({
            ...prev,
            items: prev.items.map((item, i) => 
                i === index ? { ...item, [field]: value } : item
            ),
        }));
    };

   const calculateTotal = () => {
        return form.items.reduce((sum, item) => sum + (item.amount* item.quantity), 0);
    };

    if (isFetching) return <AppLoader />;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/purchases/expense')}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {isEditMode ? 'Edit Expense Purchase' : 'New Expense Purchase'}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Record non-stock purchases and expenses
                    </p>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Main Info Card */}
                <div className="bg-white rounded-lg shadow p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-gray-800">Basic Information</h2>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Vendor Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.vendorName}
                                onChange={(e) => setForm(prev => ({ ...prev, vendorName: e.target.value }))}
                               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter vendor name"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Invoice Number
                            </label>
                            <input
                                type="text"
                                value={form.invoiceNo}
                                onChange={(e) => setForm(prev => ({ ...prev, invoiceNo: e.target.value }))}
                               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Invoice number(optional)"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={form.date}
                                onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                               className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Payment Method <span className="text-red-500">*</span>
                            </label>
                            <AppDropdown
                                value={form.paymentMethod}
                                onChange={(value) => setForm(prev => ({ ...prev, paymentMethod: value as any }))}
                                options={resolvedPaymentMethodOptions}
                                placeholder="Select payment method"
                                onRefresh={() => refetchPaymentMethods()}
                                refreshing={isFetchingPaymentMethods}
                                refreshLabel="Refresh methods"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Branch <span className="text-red-500">*</span>
                            </label>
                            <AppDropdown
                                value={form.branchId}
                                onChange={(value) => setForm(prev => ({ ...prev, branchId: value }))}
                                options={[
                                    { value: '', label: 'Select Branch' },
                                    ...(branchesData?.map((branch: any) => ({ value: branch.id, label: branch.name })) || [])
                                ]}
                                placeholder="Select branch"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                           className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            rows={3}
                            placeholder="Additional notes (optional)"
                        />
                    </div>
                </div>

                {/* Items Card */}
                <div className="bg-white rounded-lg shadow p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-800">Expense Items</h2>
                        <button
                            type="button"
                            onClick={addItem}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            <Plus size={16} />
                            Add Item
                        </button>
                    </div>

                    <div className="space-y-3">
                        {form.items.map((item, index) => (
                            <div key={index} className="flex gap-3 items-start p-4 bg-gray-50 rounded-lg">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Description <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                        placeholder="Item description"
                                    />
                                </div>

                                <div className="w-48">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Expense Account <span className="text-red-500">*</span>
                                    </label>
                                    <AppDropdown
                                        value={item.expenseAccountId}
                                        onChange={(value) => updateItem(index, 'expenseAccountId', value)}
                                        options={[
                                            { value: '', label: 'Select Account' },
                                            ...(accountsData?.map((account: any) => ({ value: account.id, label: `${account.name} (${account.accountCode})` })) || [])
                                        ]}
                                        placeholder="Select account"
                                    />
                                </div>

                                <div className="w-32">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Amount <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.amount}
                                        onChange={(e) => updateItem(index, 'amount', parseFloat(e.target.value) || 0)}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    />
                                </div>

                                <div className="w-24">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Qty
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    />
                                </div>

                                <div className="pt-6">
                                    <button
                                        type="button"
                                        onClick={() => removeItem(index)}
                                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                       title="Remove item"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Total */}
                    <div className="flex justify-end pt-4 border-t">
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Total Amount:</p>
                            <p className="text-2xl font-bold text-gray-900">
                                SAR {calculateTotal().toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/purchases/expense')}
                      className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm shadow-lg shadow-blue-500/20"
                    >
                        {mutation.isPending ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={16} />
                                {isEditMode ? 'Update' : 'Create'} Expense Purchase
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
