import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import toast from '@/lib/toast';
import { ArrowLeft, Plus, Save, Trash, Pencil, Search, FileDown, Loader2, FileSpreadsheet } from 'lucide-react';
import { z } from 'zod';
import api from '@/lib/api';
import ItemSelectorModal from '@/components/inventory/ItemSelectorModal';
import SupplierCreateModal from '@/components/suppliers/SupplierCreateModal';
import PurchaseImportModal from './PurchaseImportModal';
import AppDropdown from '../../components/ui/AppDropdown';
import AppLoader from '../../components/ui/AppLoader';
import {
    buildPaymentMethodOptions,
    DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS,
    GLOBAL_STRING_GROUPS,
    PURCHASE_PAYMENT_METHOD_KEYS,
} from '../../lib/globalStrings';
import { formatTaxLabel, resolveEffectiveTaxRate, useCompanyTaxSettings } from '../../lib/tax';

type PurchaseFormItem = {
    id?: string;
    productId: string;
    productName?: string;
    unitCode: string;
    qty: number;
    unitCost: number;
    lineTotal: number;
    taxRate?: number;
    product?: any;
};

type PurchaseFormErrors = Partial<Record<'supplierId' | 'branchId' | 'paymentMethod' | 'invoiceNoSupplier' | 'notes' | 'items', string>>;

function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

function mapPurchaseIssues(issues: z.ZodIssue[]) {
    const nextErrors: PurchaseFormErrors = {};
    issues.forEach((issue) => {
        const root = issue.path[0];
        if (root === 'items') {
            nextErrors.items ??= issue.message;
            return;
        }
        if (
            root === 'supplierId' ||
            root === 'branchId' ||
            root === 'paymentMethod' ||
            root === 'invoiceNoSupplier' ||
            root === 'notes'
        ) {
            nextErrors[root] ??= issue.message;
        }
    });
    return nextErrors;
}

const purchaseFormItemSchema = z.object({
    productId: z.string().trim().min(1, 'Each line must include a product'),
    unitCode: z.string().trim().min(1, 'Each line must include a unit'),
    qty: z.number().positive('Quantity must be greater than zero'),
    unitCost: z.number().min(0, 'Unit cost cannot be negative'),
    lineTotal: z.number().min(0, 'Line total cannot be negative'),
    taxRate: z.number().min(0).optional(),
}).superRefine((item, ctx) => {
    const expectedLineTotal = Number(item.qty) * Number(item.unitCost);
    if (!Number.isFinite(expectedLineTotal) || expectedLineTotal < 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lineTotal'],
            message: 'Line total is invalid',
        });
    }
});

const purchaseFormSchema = z.object({
    supplierId: z.preprocess(normalizeOptionalString, z.string().min(1, 'Supplier is required')),
    branchId: z.preprocess(normalizeOptionalString, z.string().min(1, 'Warehouse is required')),
    paymentMethod: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(PURCHASE_PAYMENT_METHOD_KEYS, { message: 'Select a valid payment method' })
    ),
    invoiceNoSupplier: z.preprocess(normalizeOptionalString, z.string().max(120, 'Invoice number must be 120 characters or less').optional()),
    notes: z.preprocess(normalizeOptionalString, z.string().max(1000, 'Notes must be 1000 characters or less').optional()),
    items: z.array(purchaseFormItemSchema).min(1, 'Add at least one item'),
});

export default function PurchaseForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id && id !== 'new');
    const queryClient = useQueryClient();
    const companyTax = useCompanyTaxSettings();
    const [supplierId, setSupplierId] = useState('');
    const [branchId, setBranchId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [invoiceNoSupplier, setInvoiceNoSupplier] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<PurchaseFormItem[]>([]);
    const [showItemSelector, setShowItemSelector] = useState(false);
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const canAddItems = Boolean(supplierId && branchId);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [searchPO, setSearchPO] = useState('');
    const [isSearchingPO, setIsSearchingPO] = useState(false);
    const [formErrors, setFormErrors] = useState<PurchaseFormErrors>({});
    const [showExcelImport, setShowExcelImport] = useState(false);

    const {
        data: suppliers,
        refetch: refetchSuppliers,
        isFetching: isFetchingSuppliers,
    } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => api.get('/suppliers', { params: { page: 1, limit: 1000 } }).then(r => r.data.data)
    });

    const { data: branches, refetch: refetchBranches, isFetching: isFetchingBranches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then(r => r.data.data)
    });

    const { data: globalPaymentMethods, refetch: refetchPaymentMethods, isFetching: isFetchingPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', GLOBAL_STRING_GROUPS.purchasePaymentMethods],
        queryFn: async () => {
            const res = await api.get(`/global-strings?group=${GLOBAL_STRING_GROUPS.purchasePaymentMethods}`);
            return res.data.data;
        },
    });

    const paymentMethodOptions = useMemo(
        () =>
            buildPaymentMethodOptions(globalPaymentMethods, DEFAULT_PURCHASE_PAYMENT_METHOD_OPTIONS, {
                blankLabel: 'Select Method',
                allowedKeys: PURCHASE_PAYMENT_METHOD_KEYS,
            }),
        [globalPaymentMethods]
    );

    const { data: purchaseData, isLoading: isLoadingPurchase } = useQuery({
        queryKey: ['purchase', id],
        queryFn: () => api.get(`/purchases/${id}`).then((r: any) => r.data.data),
        enabled: isEdit,
    });

    useEffect(() => {
        if (!isEdit || !purchaseData) return;
        setSupplierId(purchaseData.supplierId || '');
        setBranchId(purchaseData.branchId || '');
        setPaymentMethod(purchaseData.paymentMethod || '');
        setInvoiceNoSupplier(purchaseData.invoiceNoSupplier || '');
        setNotes(purchaseData.notes || '');

        if (purchaseData.items && items.length === 0) {
            setItems(purchaseData.items.map((i: any) => ({
                id: i.id,
                productId: i.productId,
                productName: i.product?.name,
                unitCode: i.unitCode,
                qty: i.qty,
                unitCost: i.unitCost,
                lineTotal: i.lineTotal,
                taxRate: resolveEffectiveTaxRate([i.taxRate, i.product?.tax?.rate, i.product?.taxRate], companyTax),
                product: i.product,
            })));
        }
    }, [isEdit, purchaseData]);

    const handleCloseItemSelector = () => {
        setShowItemSelector(false);
        setEditingIndex(null);
    };

    const addItemFromModal = (item: any) => {
        if (editingIndex !== null) {
            setItems(prev => prev.map((row, i) => i === editingIndex ? item : row));
            toast.success(`Updated ${item.productName || item.name}`);
            // Let the modal handle closing if needed, or close it here
        } else {
            setItems(prev => [...prev, item]);
            toast.success(`Added ${item.productName || item.name}`);
        }
        setFormErrors((current) => ({ ...current, items: undefined }));
    };

    const handleOpenAddItem = () => {
        if (!canAddItems) {
            setFormErrors((current) => ({
                ...current,
                supplierId: supplierId ? undefined : 'Supplier is required before adding items',
                branchId: branchId ? undefined : 'Warehouse is required before adding items',
            }));
            toast.error('Select supplier and warehouse first');
            return;
        }
        setShowItemSelector(true);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
        setFormErrors((current) => ({ ...current, items: undefined }));
    };

    const importItemsFromExcel = (importedItems: PurchaseFormItem[]) => {
        setItems((prev) => [...prev, ...importedItems]);
        setFormErrors((current) => ({ ...current, items: undefined }));
        toast.success(`Imported ${importedItems.length} purchase line${importedItems.length === 1 ? '' : 's'} from Excel`);
    };

    const startEditItem = (idx: number) => {
        setEditingIndex(idx);
        setShowItemSelector(true);
    };

    const handleImportPO = async () => {
        if (!searchPO) return;
        setIsSearchingPO(true);
        try {
            const res = await api.get(`/purchases/orders/lookup/${searchPO.trim()}`);
            const po = res.data.data;
            setSupplierId(po.supplierId);
            setBranchId(po.branchId);
            setNotes(`Imported from PO: ${po.poNo}${po.notes ? '\n' + po.notes : ''}`);
            setItems(po.items.map((i: any) => ({
                productId: i.productId,
                productName: i.product?.name,
                unitCode: i.unitCode,
                qty: i.qty,
                unitCost: i.unitCost,
                lineTotal: i.lineTotal,
                taxRate: resolveEffectiveTaxRate([i.taxRate, i.product?.tax?.rate, i.product?.taxRate], companyTax),
                product: i.product,
            })));
            setSearchPO('');
            setFormErrors({});
            toast.success(`Imported PO: ${po.poNo}`);
        } catch (err: any) {
            toast.error(err.response?.data?.error?.message || 'Purchase Order not found');
        } finally {
            setIsSearchingPO(false);
        }
    };

    const totals = useMemo(() => {
        const subtotal = items.reduce((sum, i) => sum + (i.lineTotal || 0), 0);
        const taxTotal = items.reduce((sum, i) => sum + ((i.lineTotal || 0) * resolveEffectiveTaxRate([i.taxRate, i.product?.tax?.rate, i.product?.taxRate], companyTax)), 0);
        return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
    }, [companyTax, items]);

    const saveMut = useMutation({
        mutationFn: (payload: any) => isEdit ? api.put(`/purchases/${id}`, payload) : api.post('/purchases', payload),
        onSuccess: () => {
            toast.success(`Purchase invoice ${isEdit ? 'updated' : 'recorded'}`);
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            if (isEdit) queryClient.invalidateQueries({ queryKey: ['purchase', id] });
            navigate('/purchases/invoices');
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed')
    });

    const handleSubmit = () => {
        const parsed = purchaseFormSchema.safeParse({
            supplierId,
            branchId,
            paymentMethod,
            invoiceNoSupplier,
            notes,
            items,
        });
        if (!parsed.success) {
            setFormErrors(mapPurchaseIssues(parsed.error.issues));
            toast.error('Please fix the highlighted fields');
            return;
        }

        setFormErrors({});

        saveMut.mutate({
            supplierId: parsed.data.supplierId,
            branchId: parsed.data.branchId,
            paymentMethod: parsed.data.paymentMethod,
            invoiceNoSupplier: parsed.data.invoiceNoSupplier,
            notes: parsed.data.notes,
            items: parsed.data.items.map((i, index) => ({
                ...items[index],
                ...i,
                qty: Number(i.qty),
                unitCost: Number(i.unitCost),
                taxAmount: (i.lineTotal || 0) * resolveEffectiveTaxRate([i.taxRate, items[index]?.product?.tax?.rate, items[index]?.product?.taxRate], companyTax)
            }))
        });
    };

    if (isEdit && isLoadingPurchase) return <AppLoader />;

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-[1500px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/purchases/invoices')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Purchase Invoice' : 'Record Purchase Invoice'}</h1>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Import PO (Number)..."
                            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm w-48 md:w-64 bg-white shadow-sm"
                            value={searchPO}
                            onChange={(e) => setSearchPO(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleImportPO()}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleImportPO}
                        disabled={!searchPO || isSearchingPO}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg hover:bg-blue-100 disabled:opacity-50 font-bold text-xs whitespace-nowrap"
                    >
                        {isSearchingPO ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                        Import PO
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Supplier</label>
                                    <button type="button" onClick={() => setShowSupplierModal(true)} className="text-[10px] font-bold text-blue-600 uppercase hover:underline">New</button>
                                </div>
                                <AppDropdown
                                    value={supplierId}
                                    onChange={(v) => {
                                        setSupplierId(v);
                                        setFormErrors((current) => ({ ...current, supplierId: undefined }));
                                    }}
                                    options={[{ value: '', label: 'Select Supplier' }, ...(suppliers || []).map((s: any) => ({ value: s.id, label: `${s.name} (${s.supplierCode})` }))]}
                                    placeholder='Select Supplier'
                                    searchable
                                    onRefresh={() => refetchSuppliers()}
                                    refreshing={isFetchingSuppliers}
                                    refreshLabel="Refresh suppliers"
                                />
                                {formErrors.supplierId && <p className="mt-1 text-xs text-red-600">{formErrors.supplierId}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
                                <AppDropdown
                                    value={branchId}
                                    onChange={(v) => {
                                        setBranchId(v);
                                        setFormErrors((current) => ({ ...current, branchId: undefined }));
                                    }}
                                    options={[{ value: '', label: 'Select Warehouse' }, ...(branches || []).map((b: any) => ({ value: b.id, label: `${b.name} (${b.code})` }))]}
                                    placeholder='Select Warehouse'
                                    searchable
                                    onRefresh={() => refetchBranches()}
                                    refreshing={isFetchingBranches}
                                    refreshLabel="Refresh warehouses"
                                />
                                {formErrors.branchId && <p className="mt-1 text-xs text-red-600">{formErrors.branchId}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice No</label>
                                <input
                                    type="text"
                                    placeholder="e.g. INV-001"
                                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${formErrors.invoiceNoSupplier ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                                    value={invoiceNoSupplier}
                                    onChange={(e) => {
                                        setInvoiceNoSupplier(e.target.value);
                                        setFormErrors((current) => ({ ...current, invoiceNoSupplier: undefined }));
                                    }}
                                />
                                {formErrors.invoiceNoSupplier && <p className="mt-1 text-xs text-red-600">{formErrors.invoiceNoSupplier}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment</label>
                                <AppDropdown
                                    value={paymentMethod}
                                    onChange={(v) => {
                                        setPaymentMethod(v);
                                        setFormErrors((current) => ({ ...current, paymentMethod: undefined }));
                                    }}
                                    options={paymentMethodOptions}
                                    placeholder='Select Method'
                                    onRefresh={() => refetchPaymentMethods()}
                                    refreshing={isFetchingPaymentMethods}
                                    refreshLabel="Refresh methods"
                                />
                                {formErrors.paymentMethod && <p className="mt-1 text-xs text-red-600">{formErrors.paymentMethod}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Inventory Items</h3>
                                <p className="text-xs text-gray-500">Add products received from supplier</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowExcelImport(true)}
                                    type="button"
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg hover:bg-emerald-100 transition-all text-xs font-bold"
                                >
                                    <FileSpreadsheet size={16} /> Import Excel
                                </button>
                                <button
                                    onClick={handleOpenAddItem}
                                    type="button"
                                    disabled={!canAddItems}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                                    title={!canAddItems ? 'Select supplier and warehouse first' : 'Add item'}
                                >
                                    <Plus size={16} /> Add Item
                                </button>
                            </div>
                        </div>

                        <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-left text-sm table-fixed">
                                <thead className="bg-gray-50 font-bold text-xs uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 w-[260px]">Product</th>
                                        <th className="px-4 py-3 w-28 text-right">Qty</th>
                                        <th className="px-4 py-3 w-32 text-right">Cost</th>
                                        <th className="px-4 py-3 w-32 text-right">Total</th>
                                        <th className="px-4 py-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 ? (
                                        <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400 italic">No items added yet. Click 'Add Item' or import a PO.</td></tr>
                                    ) : (
                                        items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900 truncate">{item.productName}</p>
                                                    <p className="text-[10px] text-gray-500 uppercase truncate">{item.unitCode}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-700">{item.qty}</td>
                                                <td className="px-4 py-3 text-right text-gray-700">{item.unitCost?.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-bold text-gray-900">{item.lineTotal?.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button type="button" onClick={() => startEditItem(idx)} className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                                                        <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500"><Trash size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {formErrors.items && <p className="text-sm text-red-600">{formErrors.items}</p>}
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                        <textarea
                            rows={3}
                            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm ${formErrors.notes ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="Add any internal remarks..."
                            value={notes}
                            onChange={(e) => {
                                setNotes(e.target.value);
                                setFormErrors((current) => ({ ...current, notes: undefined }));
                            }}
                        />
                        {formErrors.notes && <p className="mt-1 text-xs text-red-600">{formErrors.notes}</p>}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm sticky top-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-6 font-mono uppercase tracking-tighter text-center">Summary</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">{totals.subtotal.toLocaleString()} SAR</span></div>
                            <div className="flex justify-between text-sm"><span className="text-gray-500">{formatTaxLabel(companyTax)}</span><span className="font-medium">{totals.taxTotal.toLocaleString()} SAR</span></div>
                            <div className="pt-4 border-t border-dashed flex justify-between items-center"><span className="font-bold text-gray-900">Grand Total</span><span className="text-xl font-black text-blue-600">{totals.grandTotal.toLocaleString()} SAR</span></div>
                        </div>
                        <button onClick={handleSubmit} disabled={saveMut.isPending || items.length === 0 || !supplierId || !branchId} className="w-full mt-8 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-blue-200">
                            <Save size={18} /> {saveMut.isPending ? 'Processing...' : (isEdit ? 'Save Changes' : 'Complete Purchase')}
                        </button>
                    </div>
                </div>
            </div>

            <ItemSelectorModal
                isOpen={showItemSelector}
                onClose={handleCloseItemSelector}
                onAdd={addItemFromModal}
                mode="PURCHASE"
                branchId={branchId}
                initialItem={editingIndex !== null ? items[editingIndex] : undefined}
                allowAddNext={editingIndex === null}
                confirmLabel={editingIndex !== null ? "Save Changes" : undefined}
            />

            <SupplierCreateModal
                isOpen={showSupplierModal}
                onClose={() => setShowSupplierModal(false)}
                onSupplierCreated={(supplier) => {
                    setSupplierId(supplier.id);
                    void refetchSuppliers();
                }}
            />

            {showExcelImport && (
                <PurchaseImportModal
                    onClose={() => setShowExcelImport(false)}
                    onImport={importItemsFromExcel}
                />
            )}
        </div>
    );
}
