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
import { useAuthStore } from '@/stores/authStore';

type PurchaseFormItem = {
    id?: string;
    productId: string;
    productName?: string;
    unitCode: string;
    qty: number;
    unitCost: number;
    discountType?: 'PERCENTAGE' | 'AMOUNT';
    discountValue?: number;
    discountAmount?: number;
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
    unitCost: z.number().positive('Unit cost must be greater than zero'),
    discountType: z.enum(['PERCENTAGE', 'AMOUNT']).optional().default('AMOUNT'),
    discountValue: z.number().min(0).optional().default(0),
    lineTotal: z.number().min(0, 'Line total cannot be negative'),
    taxRate: z.number().min(0).optional(),
}).superRefine((item, ctx) => {
    const qty = Number(item.qty || 0);
    const unitCost = Number(item.unitCost || 0);
    const gross = qty * unitCost;
    const discountType = item.discountType || 'AMOUNT';
    const discountValue = Number(item.discountValue || 0);
    let discountAmount = 0;
    if (discountType === 'PERCENTAGE') {
        discountAmount = Math.round((gross * (discountValue / 100) + Number.EPSILON) * 100) / 100;
    } else {
        discountAmount = discountValue;
    }
    const expectedLineTotal = Math.max(0, Math.round((gross - discountAmount + Number.EPSILON) * 100) / 100);
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

function getUnitName(item: PurchaseFormItem) {
    if (item.product?.units && Array.isArray(item.product.units)) {
        const u = item.product.units.find((unit: any) => String(unit.unitCode).toUpperCase() === String(item.unitCode).toUpperCase());
        if (u?.unitName) return u.unitName;
    }
    return item.unitCode;
}

export default function PurchaseForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id && id !== 'new');
    const queryClient = useQueryClient();
    const companyTax = useCompanyTaxSettings();
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
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
                discountType: i.discountType || 'AMOUNT',
                discountValue: i.discountValue || 0,
                discountAmount: i.discountAmount || 0,
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
                discountType: i.discountType || 'AMOUNT',
                discountValue: i.discountValue || 0,
                discountAmount: i.discountAmount || 0,
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
        const grossSubtotal = items.reduce((sum, i) => sum + ((i.qty || 0) * (i.unitCost || 0)), 0);

        const discountTotal = items.reduce((sum, i) => {
            const qty = i.qty || 0;
            const cost = i.unitCost || 0;
            const gross = qty * cost;
            const val = i.discountValue || 0;
            if (i.discountType === 'PERCENTAGE') {
                return sum + Math.round((gross * (val / 100) + Number.EPSILON) * 100) / 100;
            } else {
                return sum + val;
            }
        }, 0);

        const netSubtotal = grossSubtotal - discountTotal;

        const taxTotal = items.reduce((sum, i) => {
            const qty = i.qty || 0;
            const cost = i.unitCost || 0;
            const gross = qty * cost;
            const val = i.discountValue || 0;
            let discountAmount = 0;
            if (i.discountType === 'PERCENTAGE') {
                discountAmount = Math.round((gross * (val / 100) + Number.EPSILON) * 100) / 100;
            } else {
                discountAmount = val;
            }
            const lineTotal = Math.max(0, Math.round((gross - discountAmount + Number.EPSILON) * 100) / 100);
            const lineTax = Math.round((lineTotal * resolveEffectiveTaxRate([i.taxRate, i.product?.tax?.rate, i.product?.taxRate], companyTax) + Number.EPSILON) * 100) / 100;
            return sum + lineTax;
        }, 0);

        return {
            subtotal: grossSubtotal,
            discountTotal,
            netSubtotal,
            taxTotal,
            grandTotal: netSubtotal + taxTotal
        };
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
            items: parsed.data.items.map((i, index) => {
                const qty = Number(i.qty);
                const cost = Number(i.unitCost);
                const gross = qty * cost;
                const discountType = i.discountType || 'AMOUNT';
                const discountValue = Number(i.discountValue || 0);

                let discountAmount = 0;
                if (discountType === 'PERCENTAGE') {
                    discountAmount = Math.round((gross * (discountValue / 100) + Number.EPSILON) * 100) / 100;
                } else {
                    discountAmount = discountValue;
                }

                const lineTotal = Math.max(0, Math.round((gross - discountAmount + Number.EPSILON) * 100) / 100);
                const taxRate = resolveEffectiveTaxRate([i.taxRate, items[index]?.product?.tax?.rate, items[index]?.product?.taxRate], companyTax);
                const taxAmount = Math.round((lineTotal * taxRate + Number.EPSILON) * 100) / 100;

                return {
                    productId: i.productId,
                    unitCode: i.unitCode,
                    qty,
                    unitCost: cost,
                    discountType,
                    discountValue,
                    discountAmount,
                    taxAmount,
                    lineTotal,
                };
            })
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

                        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-full text-left text-sm border-collapse table-auto">
                                    <thead className="bg-gray-50 font-bold text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap">
                                        <tr>
                                            <th className="px-3 py-3 text-center border-r border-gray-200">#</th>
                                            <th className="px-4 py-3 border-r border-gray-200 w-full min-w-[250px] whitespace-normal">Item Name</th>
                                            <th className="px-3 py-3 text-center border-r border-gray-200">Unit Code</th>
                                            <th className="px-3 py-3 text-center border-r border-gray-200">Unit Name</th>
                                            <th className="px-3 py-3 text-right border-r border-gray-200">Qty</th>
                                            <th className="px-3 py-3 text-right border-r border-gray-200">Price</th>
                                            <th className="px-3 py-3 text-right border-r border-gray-200">Discount</th>
                                            <th className="px-3 py-3 text-right border-r border-gray-200">Tax Amt</th>
                                            <th className="px-3 py-3 text-right border-r border-gray-200">Untaxed Total</th>
                                            <th className="px-3 py-3 text-right border-r border-gray-200 bg-blue-50/10">Total (Tax Incl)</th>
                                            <th className="px-3 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {items.length === 0 ? (
                                            <tr>
                                                <td colSpan={11} className="px-4 py-12 text-center text-gray-400 italic">
                                                    No items added yet. Click 'Add Item' or import a PO.
                                                </td>
                                            </tr>
                                        ) : (
                                            items.map((item, idx) => {
                                                const gross = item.qty * item.unitCost;
                                                const discountAmt = item.discountType === 'PERCENTAGE'
                                                    ? Math.round((gross * ((item.discountValue || 0) / 100) + Number.EPSILON) * 100) / 100
                                                    : (item.discountValue || 0);
                                                const lineTotal = Math.max(0, Math.round((gross - discountAmt + Number.EPSILON) * 100) / 100);
                                                const taxRate = resolveEffectiveTaxRate([item.taxRate, item.product?.tax?.rate, item.product?.taxRate], companyTax);
                                                const lineTax = Math.round((lineTotal * taxRate + Number.EPSILON) * 100) / 100;
                                                const grandTotal = lineTotal + lineTax;

                                                return (
                                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-3 py-3 text-center font-medium text-gray-400 border-r border-gray-200 bg-gray-50/50 whitespace-nowrap">{idx + 1}</td>
                                                        <td className="px-4 py-3 border-r border-gray-200 whitespace-normal min-w-[250px] break-words">
                                                            <p className="font-semibold text-gray-900" title={item.productName}>{item.productName}</p>
                                                            {item.product?.itemCode && (
                                                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">{item.product.itemCode}</p>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-center font-mono text-xs text-gray-600 border-r border-gray-200 whitespace-nowrap">{item.unitCode}</td>
                                                        <td className="px-3 py-3 text-center text-gray-600 border-r border-gray-200 whitespace-nowrap">{getUnitName(item)}</td>
                                                        <td className="px-3 py-3 text-right text-gray-700 font-medium border-r border-gray-200 whitespace-nowrap">{item.qty}</td>
                                                        <td className="px-3 py-3 text-right text-gray-700 font-medium border-r border-gray-200 whitespace-nowrap">
                                                            {item.unitCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-3 py-3 text-right border-r border-gray-200 whitespace-nowrap">
                                                            {item.discountValue && item.discountValue > 0 ? (
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                                        -{item.discountType === 'PERCENTAGE' 
                                                                            ? `${item.discountValue}%` 
                                                                            : `${item.discountValue.toFixed(2)}`}
                                                                    </span>
                                                                    {item.discountType === 'PERCENTAGE' && (
                                                                        <span className="text-[9px] text-gray-400 mt-0.5">
                                                                            -{discountAmt.toFixed(2)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-right text-amber-600 font-medium border-r border-gray-200 whitespace-nowrap">
                                                            {lineTax > 0 ? lineTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-gray-400">0.00</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-right text-gray-900 font-semibold border-r border-gray-200 whitespace-nowrap">
                                                            {lineTotal?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-bold text-blue-600 border-r border-gray-200 bg-blue-50/10 whitespace-nowrap">
                                                            {grandTotal?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-3 py-3 text-center whitespace-nowrap">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button type="button" onClick={() => startEditItem(idx)} className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded transition-colors" title="Edit"><Pencil size={15} /></button>
                                                                <button type="button" onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash size={15} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
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
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Gross Subtotal</span>
                                <span className="font-medium">{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                            </div>
                            {totals.discountTotal > 0 && (
                                <div className="flex justify-between text-sm text-red-600">
                                    <span className="font-medium">Discount</span>
                                    <span className="font-medium">-{totals.discountTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                                </div>
                            )}
                            {totals.discountTotal > 0 && (
                                <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                                    <span className="text-gray-500">Net Subtotal</span>
                                    <span className="font-medium">{totals.netSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">{formatTaxLabel(companyTax)}</span>
                                <span className="font-medium">{totals.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                            </div>
                            <div className="pt-4 border-t border-dashed flex justify-between items-center">
                                <span className="font-bold text-gray-900">Grand Total</span>
                                <span className="text-xl font-black text-blue-600">{totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                            </div>
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
