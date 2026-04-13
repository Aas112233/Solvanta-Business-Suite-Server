import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import ModuleRefreshButton from '../components/ModuleRefreshButton';
import ShiftCloseDialog from '../components/pos/ShiftCloseDialog';
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, Loader2, Barcode, User, MapPin, Calendar, Info, MoreHorizontal } from 'lucide-react';
import { printHtmlDocument } from '../lib/fileExport';
import {
    buildPosReceiptPrintDocument,
    PosReceiptData,
    PosReceiptSettings,
    DEFAULT_POS_RECEIPT_SETTINGS,
} from '../lib/posReceiptTemplates';
import { buildShiftCloseReceiptDocument } from '../lib/posShiftCloseReceipt';
import ReceiptPreview from '../components/pos/ReceiptPreview';
import AppDropdown from '../components/ui/AppDropdown';
import {
    buildScanIndex,
    getCachedProducts,
    getMetaValue,
    PosCachedProduct,
    removeCachedProducts,
    setMetaValue,
    upsertCachedProducts,
} from '../lib/posProductCache';

interface CartItem {
    productId: string;
    name: string;
    itemCode: string;
    unitCode: string;
    unitPrice: number;
    qty: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    product: any; // Keep reference to calculate pricing on unit change
}

type PosLoyaltySettings = {
    pointsPerCurrencyUnit: number;
    redemptionPointsPerUnit: number;
    redemptionCurrencyValue: number;
    allowFractionalPoints: boolean;
};

type PosLoyaltyCustomer = {
    id: string;
    name: string;
    phone: string;
    pointsBalance: number;
};

const DEFAULT_LOYALTY_SETTINGS: PosLoyaltySettings = {
    pointsPerCurrencyUnit: 1,
    redemptionPointsPerUnit: 100,
    redemptionCurrencyValue: 0.5,
    allowFractionalPoints: false,
};

export default function POS() {
    const POS_CACHE_SCHEMA_VERSION = 'v3';
    const [cart, setCart] = useState<CartItem[]>([]);
    const [viewMode, setViewMode] = useState<'BILL' | 'CATALOG'>('BILL');
    const [barcodeInput, setBarcodeInput] = useState('');
    const [isBarcodeFocused, setIsBarcodeFocused] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const currentUser = useAuthStore((s) => s.user);
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const logout = useAuthStore((s) => s.logout);
    const activeBranchId = useAuthStore(s => s.activeBranchId);
    const [branchId, setBranchId] = useState(activeBranchId || '');
    const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
    const [cashReceived, setCashReceived] = useState(0);
    const [cardReceived, setCardReceived] = useState(0);
    const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);
    const [scanWarning, setScanWarning] = useState<{ title: string; message: string } | null>(null);
    const barcodeRef = useRef<HTMLInputElement>(null);
    const warningCardRef = useRef<HTMLDivElement>(null);
    const warningCloseBtnRef = useRef<HTMLButtonElement>(null);
    const scanCacheRef = useRef<Map<string, { product: any; matchedUnit: any; cachedAt: number }>>(new Map());
    const localScanIndexRef = useRef<Map<string, { product: PosCachedProduct; unitCode: string | null }>>(new Map());
    const activeBucketRef = useRef<string>('default');
    const qc = useQueryClient();
    const currency = useAuthStore((s) => s.user?.company?.currency) || 'SAR';
    const companyName = useAuthStore((s) => s.user?.company?.name) || 'SOLVANTA ERP';

    // ─── Terminal / Shift state ─────────────────
    const [selectedTerminalId, setSelectedTerminalId] = useState<string>('');
    const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
    const [showCloseShift, setShowCloseShift] = useState(false);
    const [openingCashInput, setOpeningCashInput] = useState(0);
    const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showReprintModal, setShowReprintModal] = useState(false);
    const [showShiftsModal, setShowShiftsModal] = useState(false);
    const [selectedShiftViewId, setSelectedShiftViewId] = useState<string>('');
    const [reprintInvoiceNo, setReprintInvoiceNo] = useState('');
    const [openShiftAuthEmail, setOpenShiftAuthEmail] = useState(currentUser?.email || '');
    const [openShiftAuthPassword, setOpenShiftAuthPassword] = useState('');
    const [openShiftOverride, setOpenShiftOverride] = useState(false);
    const [showPosLogin, setShowPosLogin] = useState(false);
    const [posLoginTerminalId, setPosLoginTerminalId] = useState('');
    const [posPolicy, setPosPolicy] = useState<any>(null);
    const [terminalPriceGroupId, setTerminalPriceGroupId] = useState<string | null>(null);
    const [receiptPreview, setReceiptPreview] = useState<PosReceiptData | null>(null);
    const checkoutReceiptSnapshotRef = useRef<Omit<PosReceiptData, 'invoiceNo' | 'createdAt' | 'status'> | null>(null);

    // Customer Selection State
    const [customerSearchInput, setCustomerSearchInput] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
    const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', email: '', vatNumber: '', street: '', city: 'Riyadh' });
    const customerSearchRef = useRef<HTMLDivElement>(null);
    const canViewCustomers = hasPermission('crm.view');
    const [showLoyaltyModal, setShowLoyaltyModal] = useState(false);
    const [loyaltySearchInput, setLoyaltySearchInput] = useState('');
    const [loyaltyLookupTerm, setLoyaltyLookupTerm] = useState('');
    const [selectedLoyaltyCustomer, setSelectedLoyaltyCustomer] = useState<PosLoyaltyCustomer | null>(null);
    const [loyaltyPointsRedeemed, setLoyaltyPointsRedeemed] = useState(0);
    const [newLoyaltyCustomer, setNewLoyaltyCustomer] = useState({ name: '', phone: '' });
    const [showLoyaltyQuickAdd, setShowLoyaltyQuickAdd] = useState(false);
    const [checkoutAwaitingLoyaltySelection, setCheckoutAwaitingLoyaltySelection] = useState(false);
    const [showLoyaltyPostConfirmModal, setShowLoyaltyPostConfirmModal] = useState(false);
    const [pendingLoyaltyCustomer, setPendingLoyaltyCustomer] = useState<PosLoyaltyCustomer | null>(null);
    const [pendingLoyaltyPointsRedeemed, setPendingLoyaltyPointsRedeemed] = useState(0);

    const allowedPaymentMethods = (posPolicy?.allowedPaymentMethods || ['CASH', 'CARD', 'MIXED', 'CREDIT', 'BANK_TRANSFER']).map((m: string) => String(m).toUpperCase());
    const canViewShifts = hasPermission('pos.viewShifts') || hasPermission('pos.viewOwnShifts') || hasPermission('pos.access');
    const canViewAllShifts = hasPermission('pos.viewShifts') || hasPermission('pos.access');
    const selectedPriceGroupId = useMemo(() => {
        const customerGroup = selectedCustomer?.priceGroupId || null;
        if (posPolicy?.pricePriority === 'TERMINAL_FIRST') return terminalPriceGroupId || customerGroup;
        return customerGroup || terminalPriceGroupId || null;
    }, [selectedCustomer?.priceGroupId, terminalPriceGroupId, posPolicy?.pricePriority]);

    const { data: branches, refetch: refetchBranches, isFetching: isFetchingBranches } = useQuery({
        queryKey: ['branches'],
        queryFn: () => api.get('/branches').then((r) => r.data.data),
    });

    // Terminals query
    const { data: posTerminals = [], refetch: refetchTerminals, isFetching: isFetchingTerminals } = useQuery({
        queryKey: ['pos-terminals'],
        queryFn: () => api.get('/pos-terminals').then((r) => r.data.data),
    });

    const { data: posSession, refetch: refetchPosSession } = useQuery({
        queryKey: ['pos-session-me'],
        queryFn: () => api.get('/pos/session/me').then((r) => r.data.data),
        enabled: !!sessionStorage.getItem('posSessionToken'),
        retry: false,
    });

    // Active shift query
    const { data: activeShiftData, refetch: refetchShift } = useQuery({
        queryKey: ['pos-active-shift', selectedTerminalId],
        queryFn: () => api.get(`/pos-terminals/${selectedTerminalId}/active-shift`).then((r) => r.data.data),
        enabled: !!selectedTerminalId,
    });

    useEffect(() => {
        if (activeShiftData?.id) {
            setActiveShiftId(activeShiftData.id);
        } else {
            setActiveShiftId(null);
        }
    }, [activeShiftData]);

    useEffect(() => {
        if (!posSession) return;
        setSelectedTerminalId(posSession.terminalId);
        setBranchId(posSession.branchId);
        setPosPolicy(posSession.policy || null);
        setTerminalPriceGroupId(posSession.terminal?.priceGroupId || null);
        setShowPosLogin(false);
    }, [posSession]);

    const selectedTerminal = posTerminals.find((t: any) => t.id === selectedTerminalId) || null;

    const posBootstrapMut = useMutation({
        mutationFn: (payload: { terminalId?: string }) => api.post('/pos/session/bootstrap', payload),
        onSuccess: async (res) => {
            const data = res.data.data;
            sessionStorage.setItem('posSessionToken', data.token);
            setSelectedTerminalId(data.terminal.id);
            setBranchId(data.terminal.branchId);
            setPosPolicy(data.policy || null);
            setTerminalPriceGroupId(data.terminal.priceGroupId || null);
            setShowPosLogin(false);
            await refetchPosSession();
            toast.success('POS session started');
        },
        onError: (err: any) => {
            setShowPosLogin(true);
            toast.error(err.response?.data?.error?.message || 'POS session failed');
        },
    });

    useEffect(() => {
        if (sessionStorage.getItem('posSessionToken')) return;
        if (!currentUser?.id) return;
        posBootstrapMut.mutate({});
    }, [currentUser?.id]);

    const openShiftMut = useMutation({
        mutationFn: (payload: { openingCash: number; authEmail?: string; authPassword?: string }) =>
            api.post(`/pos-terminals/${selectedTerminalId}/open-shift`, payload),
        onSuccess: (res) => {
            toast.success('Shift opened');
            setActiveShiftId(res.data.data.id);
            setShowOpenShiftModal(false);
            setOpenShiftAuthPassword('');
            refetchShift();
            qc.invalidateQueries({ queryKey: ['pos-terminals'] });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to open shift'),
    });

    const createCustomerMut = useMutation({
        mutationFn: (data: any) => api.post('/customers', {
            ...data,
            address: { street: data.street, city: data.city, country: 'Saudi Arabia' }
        }),
        onSuccess: (res) => {
            toast.success('Customer created!');
            const newCustomer = res.data.data;
            qc.invalidateQueries({ queryKey: ['pos-customers'] });
            setSelectedCustomer(newCustomer);
            setShowCreateCustomerModal(false);
            setNewCustomerData({ name: '', phone: '', email: '', vatNumber: '', street: '', city: 'Riyadh' });
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create customer'),
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
                setShowCustomerDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);



    useEffect(() => {
        barcodeRef.current?.focus();
    }, []);

    useEffect(() => {
        if (scanWarning) {
            warningCloseBtnRef.current?.focus();
        }
    }, [scanWarning]);

    useEffect(() => {
        let cancelled = false;
        const bucket = POS_CACHE_SCHEMA_VERSION;
        activeBucketRef.current = bucket;
        scanCacheRef.current.clear();

        const run = async () => {
            try {
                const cached = await getCachedProducts(bucket);
                if (!cancelled && activeBucketRef.current === bucket) {
                    localScanIndexRef.current = buildScanIndex(cached);
                }

                const syncMetaKey = `pos:lastSyncAt:${bucket}`;
                const since = await getMetaValue(syncMetaKey);
                let page = 1;
                let hasMore = true;
                let serverTime = '';

                while (hasMore && !cancelled) {
                    const res = await api.get('/products/pos-sync', {
                        params: {
                            since: since || undefined,
                            page,
                            limit: 500,
                        },
                    });
                    const payload = res.data.data || {};
                    const items = (payload.items || []) as PosCachedProduct[];
                    hasMore = Boolean(payload.hasMore);
                    serverTime = payload.serverTime || serverTime;
                    page += 1;

                    if (!items.length) continue;

                    const toUpsert: PosCachedProduct[] = [];
                    const toRemove: string[] = [];
                    for (const item of items) {
                        if (item.deletedAt || item.status !== 'ACTIVE') {
                            toRemove.push(item.id);
                        } else {
                            toUpsert.push(item);
                        }
                    }

                    await upsertCachedProducts(bucket, toUpsert);
                    await removeCachedProducts(bucket, toRemove);
                }

                if (serverTime) {
                    await setMetaValue(syncMetaKey, serverTime);
                }

                const latest = await getCachedProducts(bucket);
                if (!cancelled && activeBucketRef.current === bucket) {
                    localScanIndexRef.current = buildScanIndex(latest);
                }
            } catch {
                // Silent fallback: scanner still uses API path when cache/sync fails.
            }
        };

        void run();
        return () => { cancelled = true; };
    }, []);

    const { data: products } = useQuery({
        queryKey: ['pos-products', activeBranchId, search],
        queryFn: () => api.get('/products', {
            params: {
                search,
                limit: 20,
                includePricing: true,
            }
        }).then((r) => r.data.data),
        enabled: search.length > 1,
    });

    const { data: globalPaymentMethods } = useQuery<any[]>({
        queryKey: ['global-strings', 'SALE_PAYMENT_METHOD'],
        queryFn: async () => {
            const res = await api.get('/global-strings?group=SALE_PAYMENT_METHOD');
            return res.data.data;
        },
    });

    const { data: customers } = useQuery({
        queryKey: ['pos-customers', activeBranchId],
        queryFn: async () => {
            const res = await api.get('/customers');
            return res.data.data;
        },
        enabled: canViewCustomers,
    });

    const filteredCustomers = useMemo(() => {
        if (!customerSearchInput.trim()) return (customers || []).slice(0, 5);
        const q = customerSearchInput.toLowerCase();
        return (customers || []).filter((c: any) =>
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.customerCode && c.customerCode.toLowerCase().includes(q)) ||
            (c.vatNumber && c.vatNumber.toLowerCase().includes(q))
        ).slice(0, 10);
    }, [customers, customerSearchInput]);
    const formatWalkInCustomerLabel = (loyaltyCustomer?: { name?: string | null; phone?: string | null } | null) => {
        if (!loyaltyCustomer) return 'Walk-in Customer';
        const loyaltyName = String(loyaltyCustomer.name || '').trim() || '-';
        const loyaltyPhone = String(loyaltyCustomer.phone || '').trim() || '-';
        return `Walk-in Customer\n${loyaltyName}-${loyaltyPhone}`;
    };

    const { data: loyaltySettings = DEFAULT_LOYALTY_SETTINGS } = useQuery({
        queryKey: ['pos-loyalty-settings'],
        queryFn: () => api.get('/pos/loyalty-settings').then((r) => (r.data.data || DEFAULT_LOYALTY_SETTINGS) as PosLoyaltySettings),
    });

    const { data: loyaltyCustomers = [], isFetching: isFetchingLoyaltyCustomers } = useQuery({
        queryKey: ['pos-loyalty-customers', loyaltyLookupTerm],
        queryFn: () =>
            api.get('/pos/loyalty-customers', {
                params: {
                    q: loyaltyLookupTerm || undefined,
                },
            }).then((r) => r.data.data as PosLoyaltyCustomer[]),
        enabled: showLoyaltyModal && loyaltyLookupTerm.length > 0,
    });
    const loyaltySearchTerm = loyaltySearchInput.trim();
    const hasLoyaltyLookup = loyaltyLookupTerm.length > 0;
    const noLoyaltyMatch = hasLoyaltyLookup && !isFetchingLoyaltyCustomers && loyaltyCustomers.length === 0;
    const computeLoyaltyDiscountValue = (invoice: any, fallbackPoints = 0, fallbackValue = 0) => {
        const direct = Number(
            invoice?.loyaltyRedemptionValue
            ?? invoice?.loyaltyDiscountValue
            ?? 0
        );
        if (direct > 0) return Number(direct.toFixed(2));

        const subtotalValue = Number(invoice?.subtotal);
        const taxValue = Number(invoice?.taxTotal);
        const grandValue = Number(invoice?.grandTotal);
        if (Number.isFinite(subtotalValue) && Number.isFinite(taxValue) && Number.isFinite(grandValue)) {
            const byTotals = Number(Math.max(0, subtotalValue + taxValue - grandValue).toFixed(2));
            if (byTotals > 0) return byTotals;
        }

        const points = Number(invoice?.loyaltyPointsRedeemed ?? fallbackPoints ?? 0);
        if (points > 0) {
            const rate = Number(loyaltySettings.redemptionCurrencyValue || 0) / Math.max(1, Number(loyaltySettings.redemptionPointsPerUnit || 1));
            const byPoints = Number((points * rate).toFixed(2));
            if (byPoints > 0) return byPoints;
        }

        return Number(fallbackValue || 0);
    };

    const createLoyaltyCustomerMut = useMutation({
        mutationFn: (payload: { name: string; phone: string }) => api.post('/pos/loyalty-customers', payload),
        onSuccess: (res) => {
            const customer = res.data.data as PosLoyaltyCustomer;
            setSelectedLoyaltyCustomer(customer);
            setShowLoyaltyModal(false);
            setLoyaltySearchInput('');
            setLoyaltyLookupTerm('');
            setNewLoyaltyCustomer({ name: '', phone: '' });
            setLoyaltyPointsRedeemed(0);
            setShowLoyaltyQuickAdd(false);
            qc.invalidateQueries({ queryKey: ['pos-loyalty-customers'] });
            toast.success('Loyalty customer linked to this sale');
            if (checkoutAwaitingLoyaltySelection) {
                setCheckoutAwaitingLoyaltySelection(false);
                const preview = buildLoyaltyCheckoutPreview(customer, getDefaultRedeemPoints(customer));
                setPendingLoyaltyCustomer(customer);
                setPendingLoyaltyPointsRedeemed(preview.pointsRedeemed);
                setShowLoyaltyPostConfirmModal(true);
            }
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create loyalty customer'),
    });

    useEffect(() => {
        if (noLoyaltyMatch) return;
        setShowLoyaltyQuickAdd(false);
    }, [noLoyaltyMatch]);

    const { data: receiptSettings } = useQuery({
        queryKey: ['pos-receipt-settings'],
        queryFn: () => api.get('/pos/receipt-settings').then((r) => r.data.data as PosReceiptSettings),
    });

    const { data: recentShifts = [] } = useQuery({
        queryKey: ['pos-shifts-recent', currentUser?.id, canViewAllShifts],
        queryFn: async () => {
            const now = new Date();
            const from = new Date(now);
            from.setMonth(from.getMonth() - 1);
            const params: any = {
                page: 1,
                limit: 100,
                dateFrom: from.toISOString(),
                dateTo: now.toISOString(),
            };
            if (!canViewAllShifts && currentUser?.id) params.userId = currentUser.id;
            const res = await api.get('/pos-terminals/shifts/list', { params });
            return res.data.data || [];
        },
        enabled: showShiftsModal && canViewShifts,
    });

    const { data: selectedShiftDetail } = useQuery({
        queryKey: ['pos-shift-view-detail', selectedShiftViewId],
        queryFn: () => api.get(`/pos-terminals/shifts/${selectedShiftViewId}`).then((r) => r.data.data),
        enabled: showShiftsModal && !!selectedShiftViewId && canViewShifts,
    });

    useEffect(() => {
        if (!showShiftsModal) return;
        if (!selectedShiftViewId && recentShifts.length > 0) {
            setSelectedShiftViewId(recentShifts[0].id);
        }
    }, [showShiftsModal, recentShifts, selectedShiftViewId]);

    const reprintMut = useMutation({
        mutationFn: async (invoiceNo: string) => {
            const res = await api.get(`/pos/invoices/by-no/${encodeURIComponent(invoiceNo)}`);
            return res.data.data;
        },
        onSuccess: async (invoice: any) => {
            const cardReceivedComputed = String(invoice.paymentMethod || '').toUpperCase() === 'CARD'
                ? Number(invoice.grandTotal || 0)
                : String(invoice.paymentMethod || '').toUpperCase() === 'MIXED'
                    ? Math.max(0, Number(invoice.grandTotal || 0) - Math.max(0, Number(invoice.cashReceived || 0) - Number(invoice.changeGiven || 0)))
                    : 0;

            const receipt: PosReceiptData = {
                invoiceNo: invoice.invoiceNo,
                createdAt: invoice.createdAt,
                status: invoice.status || 'PAID',
                paymentMethod: invoice.paymentMethod || '-',
                cashReceived: Number(invoice.cashReceived || 0),
                cardReceived: cardReceivedComputed,
                changeGiven: Number(invoice.changeGiven || 0),
                subtotal: Number(invoice.subtotal || 0),
                discountTotal: Number(invoice.discountTotal || 0),
                taxTotal: Number(invoice.taxTotal || 0),
                grandTotal: Number(invoice.grandTotal || 0),
                terminalCode: selectedTerminal?.code || 'N/A',
                branchName: invoice.branch?.name || 'Branch',
                cashierName: invoice.createdBy?.name || 'Cashier',
                customerName: invoice.customer?.name || formatWalkInCustomerLabel(invoice.loyaltyCustomer),
                loyaltyPointsEarned: Number(invoice.loyaltyPointsEarned || 0),
                loyaltyPointsRedeemed: Number(invoice.loyaltyPointsRedeemed || 0),
                loyaltyRedemptionValue: computeLoyaltyDiscountValue(invoice),
                items: (invoice.items || []).map((it: any) => ({
                    name: it.product?.name || '-',
                    unitCode: it.unitCode || '-',
                    unitName: it.product?.units?.find((u: any) => u.unitCode === it.unitCode)?.unitName || it.unitCode || '-',
                    qty: Number(it.qty || 0),
                    unitPrice: Number(it.unitPrice || 0),
                    discount: Number(it.discount || 0),
                    taxAmount: Number(it.taxAmount || 0),
                    lineTotal: Number(it.lineTotal || 0),
                })),
            };

            await printReceipt80mm(receipt, true);
            toast.success(`Receipt re-printed: ${invoice.invoiceNo}`);
            setShowReprintModal(false);
            setReprintInvoiceNo('');
            setShowMoreMenu(false);
        },
        onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Invoice not found'),
    });

    const submitMut = useMutation({
        mutationFn: (invoice: any) => api.post('/pos/invoices', invoice),
        onSuccess: (res) => {
            const invoice = res.data.data;
            const snapshot = checkoutReceiptSnapshotRef.current;
            if (snapshot) {
                const preparedReceipt = {
                    ...snapshot,
                    invoiceNo: invoice.invoiceNo,
                    createdAt: invoice.createdAt || new Date().toISOString(),
                    status: invoice.status,
                    subtotal: Number(invoice.subtotal ?? snapshot.subtotal ?? 0),
                    discountTotal: Number(invoice.discountTotal ?? snapshot.discountTotal ?? 0),
                    taxTotal: Number(invoice.taxTotal ?? snapshot.taxTotal ?? 0),
                    grandTotal: Number(invoice.grandTotal ?? snapshot.grandTotal ?? 0),
                    loyaltyPointsEarned: Number(invoice.loyaltyPointsEarned || snapshot.loyaltyPointsEarned || 0),
                    loyaltyPointsRedeemed: Number(invoice.loyaltyPointsRedeemed || snapshot.loyaltyPointsRedeemed || 0),
                    loyaltyRedemptionValue: computeLoyaltyDiscountValue(
                        invoice,
                        Number(snapshot.loyaltyPointsRedeemed || 0),
                        Number(snapshot.loyaltyRedemptionValue || 0)
                    ),
                };
                if (receiptSettings?.autoPrintOnComplete) {
                    void printReceipt80mm(preparedReceipt, true);
                } else {
                    setReceiptPreview(preparedReceipt);
                }
            }
            checkoutReceiptSnapshotRef.current = null;
            if (invoice.status === 'UNPOSTED') {
                toast.success(`Invoice ${invoice.invoiceNo} saved as UNPOSTED (Stock Shortage)`);
            } else {
                toast.success(`Invoice ${invoice.invoiceNo} created!`);
            }
            setCart([]);
            setCashReceived(0);
            setCardReceived(0);
            setSelectedCustomer(null);
            setSelectedLoyaltyCustomer(null);
            setLoyaltyPointsRedeemed(0);
            setLoyaltySearchInput('');
            setLoyaltyLookupTerm('');
            setShowLoyaltyPostConfirmModal(false);
            setPendingLoyaltyCustomer(null);
            setPendingLoyaltyPointsRedeemed(0);
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            qc.invalidateQueries({ queryKey: ['inventory'] });
            qc.invalidateQueries({ queryKey: ['pos-loyalty-customers'] });
            barcodeRef.current?.focus();
        },
        onError: (err: any) => {
            checkoutReceiptSnapshotRef.current = null;
            toast.error(err.response?.data?.error?.message || 'Failed to create invoice');
        },
    });

    // Calculations
    const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.qty - item.discount, 0);
    const taxTotal = cart.reduce((sum, item) => sum + item.taxAmount, 0);
    const discountTotal = cart.reduce((sum, item) => sum + item.discount, 0);
    const preLoyaltyGrandTotal = subtotal + taxTotal;
    const redemptionValuePerPoint = Number(loyaltySettings.redemptionCurrencyValue || 0) / Math.max(1, Number(loyaltySettings.redemptionPointsPerUnit || 1));
    const availableLoyaltyPoints = Number(selectedLoyaltyCustomer?.pointsBalance || 0);
    const maxRedeemableByTotal = redemptionValuePerPoint > 0
        ? (loyaltySettings.allowFractionalPoints
            ? Number((preLoyaltyGrandTotal / redemptionValuePerPoint).toFixed(2))
            : Math.floor(preLoyaltyGrandTotal / redemptionValuePerPoint))
        : 0;
    const safeRequestedRedeem = Number.isFinite(loyaltyPointsRedeemed) ? Math.max(0, Number(loyaltyPointsRedeemed)) : 0;
    const normalizedLoyaltyPointsRedeemed = selectedLoyaltyCustomer
        ? Math.min(
            loyaltySettings.allowFractionalPoints ? Number(safeRequestedRedeem.toFixed(2)) : Math.floor(safeRequestedRedeem),
            loyaltySettings.allowFractionalPoints ? Number(availableLoyaltyPoints.toFixed(2)) : Math.floor(availableLoyaltyPoints),
            maxRedeemableByTotal
        )
        : 0;
    const loyaltyRedemptionValue = Number((normalizedLoyaltyPointsRedeemed * redemptionValuePerPoint).toFixed(2));
    const grandTotal = Number(Math.max(0, preLoyaltyGrandTotal - loyaltyRedemptionValue).toFixed(2));
    const pointsEarnedPreviewRaw = grandTotal * Number(loyaltySettings.pointsPerCurrencyUnit || 1);
    const pointsEarnedPreview = selectedLoyaltyCustomer
        ? (loyaltySettings.allowFractionalPoints ? Number(pointsEarnedPreviewRaw.toFixed(2)) : Math.round(pointsEarnedPreviewRaw))
        : 0;
    const change = Math.max(0, cashReceived - grandTotal);
    const mixedTotalPaid = cashReceived + cardReceived;
    const mixedChange = Math.max(0, mixedTotalPaid - grandTotal);
    const mixedDue = Math.max(0, grandTotal - mixedTotalPaid);
    const isCashReady = paymentMethod !== 'CASH' || cashReceived >= grandTotal;
    const isMixedReady =
        paymentMethod !== 'MIXED' ||
        (cashReceived > 0 && cardReceived > 0 && mixedTotalPaid >= grandTotal && mixedChange <= cashReceived);
    const isPaymentAllowed = allowedPaymentMethods.includes(String(paymentMethod || '').toUpperCase());
    const isCustomerCreditAllowed = Boolean(selectedCustomer && selectedCustomer.allowCreditSales !== false);
    const isCreditAllowed = String(paymentMethod).toUpperCase() !== 'CREDIT'
        || (posPolicy?.allowCreditSales !== false && isCustomerCreditAllowed);
    const canCompleteTransaction = !submitMut.isPending
        && cart.length > 0
        && isCashReady
        && isMixedReady
        && isPaymentAllowed
        && isCreditAllowed
        && !!selectedTerminalId
        && (posPolicy?.requireShiftForSale === false || !!activeShiftId);
    const hasEnteredSaleInfo =
        cart.length > 0 ||
        !!selectedCustomer ||
        !!selectedLoyaltyCustomer ||
        Number(loyaltyPointsRedeemed || 0) > 0 ||
        Number(cashReceived || 0) > 0 ||
        Number(cardReceived || 0) > 0 ||
        !!customerSearchInput.trim() ||
        !!loyaltySearchInput.trim() ||
        !!pendingLoyaltyCustomer ||
        Number(pendingLoyaltyPointsRedeemed || 0) > 0;

    const buildLoyaltyCheckoutPreview = (customer: PosLoyaltyCustomer | null, requestedPoints: number) => {
        if (!customer) {
            return {
                pointsRedeemed: 0,
                discountValue: 0,
                grandTotalAfterDiscount: preLoyaltyGrandTotal,
                pointsEarned: 0,
            };
        }
        const availablePoints = Number(customer.pointsBalance || 0);
        const normalizedRequested = Number.isFinite(requestedPoints) ? Math.max(0, Number(requestedPoints)) : 0;
        const normalizedPoints = Math.min(
            loyaltySettings.allowFractionalPoints ? Number(normalizedRequested.toFixed(2)) : Math.floor(normalizedRequested),
            loyaltySettings.allowFractionalPoints ? Number(availablePoints.toFixed(2)) : Math.floor(availablePoints),
            maxRedeemableByTotal
        );
        const discountValue = Number((normalizedPoints * redemptionValuePerPoint).toFixed(2));
        const grandTotalAfterDiscount = Number(Math.max(0, preLoyaltyGrandTotal - discountValue).toFixed(2));
        const pointsEarnedRaw = grandTotalAfterDiscount * Number(loyaltySettings.pointsPerCurrencyUnit || 1);
        const pointsEarned = loyaltySettings.allowFractionalPoints
            ? Number(pointsEarnedRaw.toFixed(2))
            : Math.round(pointsEarnedRaw);
        return {
            pointsRedeemed: normalizedPoints,
            discountValue,
            grandTotalAfterDiscount,
            pointsEarned,
        };
    };
    const pendingLoyaltyPreview = useMemo(
        () => buildLoyaltyCheckoutPreview(pendingLoyaltyCustomer, pendingLoyaltyPointsRedeemed),
        [pendingLoyaltyCustomer, pendingLoyaltyPointsRedeemed, preLoyaltyGrandTotal, redemptionValuePerPoint, maxRedeemableByTotal, loyaltySettings.allowFractionalPoints, loyaltySettings.pointsPerCurrencyUnit]
    );
    const getDefaultRedeemPoints = (customer: PosLoyaltyCustomer | null) => {
        if (!customer) return 0;
        const available = Number(customer.pointsBalance || 0);
        if (!Number.isFinite(available) || available <= 0) return 0;
        const normalizedAvailable = loyaltySettings.allowFractionalPoints
            ? Number(available.toFixed(2))
            : Math.floor(available);
        return Math.min(normalizedAvailable, maxRedeemableByTotal);
    };

    useEffect(() => {
        if (!selectedLoyaltyCustomer && loyaltyPointsRedeemed !== 0) {
            setLoyaltyPointsRedeemed(0);
            return;
        }
        if (loyaltyPointsRedeemed !== normalizedLoyaltyPointsRedeemed) {
            setLoyaltyPointsRedeemed(normalizedLoyaltyPointsRedeemed);
        }
    }, [
        selectedLoyaltyCustomer?.id,
        selectedLoyaltyCustomer?.pointsBalance,
        loyaltyPointsRedeemed,
        normalizedLoyaltyPointsRedeemed,
    ]);

    useEffect(() => {
        if (!allowedPaymentMethods.includes(String(paymentMethod).toUpperCase())) {
            setPaymentMethod(allowedPaymentMethods[0] || 'CASH');
        }
    }, [allowedPaymentMethods.join(','), paymentMethod]);

    useEffect(() => {
        if (String(paymentMethod).toUpperCase() !== 'CREDIT') return;
        if (selectedCustomer && selectedCustomer.allowCreditSales !== false) return;
        const nextMethod = allowedPaymentMethods.includes('CASH') ? 'CASH' : (allowedPaymentMethods[0] || 'CASH');
        setPaymentMethod(nextMethod);
        toast.error('Credit sale is only available for credit-enabled customers');
    }, [paymentMethod, selectedCustomer?.id, selectedCustomer?.allowCreditSales, allowedPaymentMethods.join(',')]);

    const resolveUnitPrice = (product: any, unitCode: string): number => {
        const unit = product.units?.find((u: any) => String(u.unitCode).toUpperCase() === String(unitCode).toUpperCase());
        const basePrice = Number(unit?.salePrice || 0);
        if (!selectedPriceGroupId) return basePrice;

        const override = (product.priceGroupPrices || []).find((p: any) =>
            p.priceGroupId === selectedPriceGroupId &&
            String(p.unitCode).toUpperCase() === String(unitCode).toUpperCase()
        );
        return override ? Number(override.salePrice || 0) : basePrice;
    };

    const resolveMinPrice = (product: any, unitCode: string): number | null => {
        const unit = product.units?.find((u: any) => String(u.unitCode).toUpperCase() === String(unitCode).toUpperCase());
        const baseMin = unit?.minimumNegotiationPrice !== undefined && unit?.minimumNegotiationPrice !== null ? Number(unit.minimumNegotiationPrice) : null;
        if (!selectedPriceGroupId) return baseMin;

        const override = (product.priceGroupPrices || []).find((p: any) =>
            p.priceGroupId === selectedPriceGroupId &&
            String(p.unitCode).toUpperCase() === String(unitCode).toUpperCase()
        );
        if (override && override.minimumNegotiationPrice !== undefined && override.minimumNegotiationPrice !== null) {
            return Number(override.minimumNegotiationPrice);
        }
        return baseMin;
    };

    const formatUnitFactor = (qtyInBaseUnit: any): string => {
        const n = Number(qtyInBaseUnit);
        if (!Number.isFinite(n) || n <= 0) return '1x';
        return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, '')}x`;
    };

    const showScanWarning = (title: string, message: string) => {
        setScanWarning({ title, message });
    };

    const nudgeWarningDialog = () => {
        const el = warningCardRef.current;
        if (!el) return;
        void el.animate(
            [
                { transform: 'translateX(0)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(-6px)' },
                { transform: 'translateX(6px)' },
                { transform: 'translateX(0)' },
            ],
            { duration: 260, easing: 'ease-in-out' }
        );
    };

    const addToCart = (product: any, preferredUnitCode?: string | null) => {
        const preferredUnit = preferredUnitCode
            ? product.units?.find((u: any) => String(u.unitCode).toUpperCase() === String(preferredUnitCode).toUpperCase())
            : null;
        const unit = preferredUnit || product.units?.[0];
        if (!unit) {
            showScanWarning('Cannot Add Item', 'This product has no sale unit configured. Please update item units and try again.');
            return;
        }
        const scanKey = `${product.id}::${unit.unitCode}`;
        const effectiveUnitPrice = resolveUnitPrice(product, unit.unitCode);
        if (effectiveUnitPrice <= 0) {
            showScanWarning('Price Cannot Be Zero', `${product.name} (${unit.unitCode}) has zero price. Please set a valid selling price before scanning.`);
            return;
        }

        const productTaxRate = product.tax?.rate ?? product.taxRate ?? 0.15;

        setCart((prev) => {
            const existing = prev.find((c) => c.productId === product.id && c.unitCode === unit.unitCode);
            if (existing) {
                return prev.map((c) =>
                    c.productId === product.id && c.unitCode === unit.unitCode
                        ? { ...c, qty: c.qty + 1, taxAmount: (c.qty + 1) * effectiveUnitPrice * productTaxRate, lineTotal: (c.qty + 1) * effectiveUnitPrice, unitPrice: effectiveUnitPrice }
                        : c
                );
            }
            const price = effectiveUnitPrice;
            return [...prev, {
                productId: product.id,
                name: product.name,
                itemCode: product.itemCode,
                unitCode: unit.unitCode,
                unitPrice: price,
                qty: 1,
                discount: 0,
                taxRate: productTaxRate,
                taxAmount: price * productTaxRate,
                lineTotal: price,
                product: product, // Store product for unit selection
            }];
        });
        setLastScannedKey(scanKey);
        setSearch('');
        if (viewMode === 'CATALOG') setViewMode('BILL');
        barcodeRef.current?.focus();
    };

    const handleBarcodeScan = async (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' || !barcodeInput.trim()) return;
        e.preventDefault();
        const scanCode = barcodeInput.trim();

        if (scanWarning) {
            setBarcodeInput('');
            nudgeWarningDialog();
            return;
        }

        setBarcodeInput('');
        const normalizedCode = scanCode.toUpperCase();

        const localHit = localScanIndexRef.current.get(normalizedCode);
        if (localHit) {
            addToCart(localHit.product, localHit.unitCode);
            return;
        }

        const cacheKey = `${normalizedCode}`;
        const now = Date.now();
        const cached = scanCacheRef.current.get(cacheKey);
        if (cached && now - cached.cachedAt < 2 * 60 * 1000) {
            addToCart(cached.product, cached.matchedUnit?.unitCode || null);
            return;
        }

        try {
            const res = await api.get(`/products/barcode/${encodeURIComponent(scanCode)}`);
            const payload = res.data.data;
            scanCacheRef.current.set(cacheKey, { ...payload, cachedAt: now });
            addToCart(payload.product, payload.matchedUnit?.unitCode || null);
            setSearch('');
        } catch (err: any) {
            const message = err?.response?.data?.error?.message || 'Product not found for scanned barcode.';
            showScanWarning('Barcode Scan Failed', message);
        }
    };

    const handleSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || !search.trim()) return;
        const query = search.trim().toUpperCase();
        const exact = (products || []).find((p: any) =>
            String(p.itemCode || '').toUpperCase() === query ||
            String(p.name || '').toUpperCase() === query ||
            p.units?.some((u: any) => String(u.barcode || '').toUpperCase() === query || String(u.unitCode || '').toUpperCase() === query)
        );
        if (exact) {
            const matchedUnit = exact.units?.find((u: any) =>
                String(u.barcode || '').toUpperCase() === query ||
                String(u.unitCode || '').toUpperCase() === query
            );
            addToCart(exact, matchedUnit?.unitCode);
            setSearch('');
        }
    };

    const updateQty = (idx: number, delta: number) => {
        setCart(cart.map((c, i) => {
            if (i !== idx) return c;
            const newQty = Math.max(1, c.qty + delta);
            return {
                ...c,
                qty: newQty,
                taxAmount: newQty * c.unitPrice * c.taxRate,
                lineTotal: newQty * c.unitPrice,
            };
        }));
    };

    const removeItem = (idx: number) => setCart(cart.filter((_, i) => i !== idx));

    const clearScannedItems = () => {
        if (!hasEnteredSaleInfo) {
            toast.error('No sale data to clear');
            return;
        }
        const confirmed = confirm('Clear current sale and all entered details?');
        if (!confirmed) return;

        setCart([]);
        setLastScannedKey(null);
        setBarcodeInput('');
        setSearch('');
        setScanWarning(null);
        setCashReceived(0);
        setCardReceived(0);
        setPaymentMethod(allowedPaymentMethods.includes('CASH') ? 'CASH' : (allowedPaymentMethods[0] || 'CASH'));
        setSelectedCustomer(null);
        setCustomerSearchInput('');
        setShowCustomerDropdown(false);
        setShowCreateCustomerModal(false);
        setSelectedLoyaltyCustomer(null);
        setLoyaltyPointsRedeemed(0);
        setShowLoyaltyModal(false);
        setLoyaltySearchInput('');
        setLoyaltyLookupTerm('');
        setShowLoyaltyQuickAdd(false);
        setNewLoyaltyCustomer({ name: '', phone: '' });
        setCheckoutAwaitingLoyaltySelection(false);
        setShowLoyaltyPostConfirmModal(false);
        setPendingLoyaltyCustomer(null);
        setPendingLoyaltyPointsRedeemed(0);
        setReceiptPreview(null);
        checkoutReceiptSnapshotRef.current = null;
        barcodeRef.current?.focus();
        toast.success('Current sale cleared');
    };

    const updateUnit = (idx: number, unitCode: string) => {
        setCart(cart.map((c, i) => {
            if (i !== idx) return c;
            const unit = c.product.units?.find((u: any) => u.unitCode === unitCode);
            if (!unit) return c;

            const price = resolveUnitPrice(c.product, unit.unitCode);
            return {
                ...c,
                unitCode: unit.unitCode,
                unitPrice: price,
                taxAmount: price * c.qty * c.taxRate,
                lineTotal: price * c.qty,
            };
        }));
    };

    useEffect(() => {
        setCart((prev) =>
            prev.map((item) => {
                const unitPrice = resolveUnitPrice(item.product, item.unitCode);
                return {
                    ...item,
                    unitPrice,
                    taxAmount: unitPrice * item.qty * item.taxRate,
                    lineTotal: unitPrice * item.qty,
                };
            })
        );
    }, [selectedPriceGroupId]);

    const performCheckout = (options?: { loyaltyCustomer?: PosLoyaltyCustomer | null; pointsRedeemed?: number }) => {
        const activeLoyaltyCustomer = options?.loyaltyCustomer ?? selectedLoyaltyCustomer;
        const activePointsRedeemed = Number.isFinite(options?.pointsRedeemed as number)
            ? Number(options?.pointsRedeemed)
            : normalizedLoyaltyPointsRedeemed;
        const activeRedemptionValue = Number((activePointsRedeemed * redemptionValuePerPoint).toFixed(2));
        const checkoutGrandTotal = Number(Math.max(0, preLoyaltyGrandTotal - activeRedemptionValue).toFixed(2));
        const checkoutPointsEarnedRaw = checkoutGrandTotal * Number(loyaltySettings.pointsPerCurrencyUnit || 1);
        const checkoutPointsEarned = activeLoyaltyCustomer
            ? (loyaltySettings.allowFractionalPoints ? Number(checkoutPointsEarnedRaw.toFixed(2)) : Math.round(checkoutPointsEarnedRaw))
            : 0;
        const checkoutChange = Math.max(0, cashReceived - checkoutGrandTotal);
        const checkoutMixedTotalPaid = cashReceived + cardReceived;
        const checkoutMixedChange = Math.max(0, checkoutMixedTotalPaid - checkoutGrandTotal);

        if (cart.length === 0) return toast.error('Cart is empty');
        if (!selectedTerminalId) return toast.error('POS terminal is required');
        if (!branchId) return toast.error('Terminal warehouse is missing');
        if (posPolicy?.requireShiftForSale !== false && !activeShiftId) return toast.error('Open shift is required');
        if (!allowedPaymentMethods.includes(String(paymentMethod).toUpperCase())) return toast.error('Payment method is not allowed for this POS');
        if (String(paymentMethod).toUpperCase() === 'CREDIT' && posPolicy?.allowCreditSales === false) return toast.error('Credit sales are disabled for this POS');
        if (paymentMethod === 'CREDIT' && !selectedCustomer) return toast.error('Select a customer for credit sale');
        if (paymentMethod === 'CREDIT' && selectedCustomer?.allowCreditSales === false) return toast.error('Selected customer is not allowed for credit sales');

        checkoutReceiptSnapshotRef.current = {
            paymentMethod,
            cashReceived: paymentMethod === 'CASH' || paymentMethod === 'MIXED' ? cashReceived : 0,
            cardReceived: paymentMethod === 'MIXED' ? cardReceived : paymentMethod === 'CARD' ? checkoutGrandTotal : 0,
            changeGiven: paymentMethod === 'CASH' ? checkoutChange : paymentMethod === 'MIXED' ? checkoutMixedChange : 0,
            subtotal,
            discountTotal,
            taxTotal,
            grandTotal: checkoutGrandTotal,
            terminalCode: selectedTerminal?.code || '-',
            branchName: branches?.find((b: any) => b.id === branchId)?.name || 'Branch',
            cashierName: currentUser?.name || 'Cashier',
            customerName: selectedCustomer?.name || formatWalkInCustomerLabel(activeLoyaltyCustomer),
            loyaltyPointsEarned: checkoutPointsEarned,
            loyaltyPointsRedeemed: activePointsRedeemed,
            loyaltyRedemptionValue: activeRedemptionValue,
            items: cart.map((c) => ({
                name: c.name,
                unitCode: c.unitCode,
                unitName: c.product?.units?.find((u: any) => u.unitCode === c.unitCode)?.unitName || c.unitCode,
                qty: c.qty,
                unitPrice: c.unitPrice,
                discount: c.discount,
                taxAmount: c.taxAmount,
                lineTotal: c.lineTotal,
            })),
        };

        submitMut.mutate({
            branchId,
            customerId: selectedCustomer?.id || null,
            posTerminalId: selectedTerminalId || null,
            posShiftId: activeShiftId || null,
            items: cart.map((c) => ({
                productId: c.productId,
                unitCode: c.unitCode,
                unitName: c.product?.units?.find((u: any) => u.unitCode === c.unitCode)?.unitName || c.unitCode,
                qty: c.qty,
                unitPrice: c.unitPrice,
                discount: c.discount,
                taxAmount: c.taxAmount,
                lineTotal: c.lineTotal,
            })),
            subtotal,
            discountTotal,
            taxTotal,
            grandTotal: checkoutGrandTotal,
            paymentMethod,
            cashReceived: paymentMethod === 'CASH' || paymentMethod === 'MIXED' ? cashReceived : 0,
            cardReceived: paymentMethod === 'MIXED' ? cardReceived : paymentMethod === 'CARD' ? checkoutGrandTotal : 0,
            changeGiven: paymentMethod === 'CASH' ? checkoutChange : paymentMethod === 'MIXED' ? checkoutMixedChange : 0,
            loyaltyCustomerId: activeLoyaltyCustomer?.id || null,
            loyaltyPointsRedeemed: activePointsRedeemed,
        });
    };

    const handleCheckout = () => {
        if (!selectedLoyaltyCustomer) {
            setCheckoutAwaitingLoyaltySelection(true);
            setShowLoyaltyQuickAdd(false);
            setLoyaltyLookupTerm('');
            setShowLoyaltyModal(true);
            return;
        }
        setCheckoutAwaitingLoyaltySelection(false);
        const requestedPoints = Number(loyaltyPointsRedeemed || 0) > 0
            ? Number(loyaltyPointsRedeemed)
            : getDefaultRedeemPoints(selectedLoyaltyCustomer);
        const preview = buildLoyaltyCheckoutPreview(selectedLoyaltyCustomer, requestedPoints);
        setPendingLoyaltyCustomer(selectedLoyaltyCustomer);
        setPendingLoyaltyPointsRedeemed(preview.pointsRedeemed);
        setShowLoyaltyPostConfirmModal(true);
    };

    const formatMoney = (value: number) => Number(value || 0).toFixed(2);

    const printReceipt80mm = async (receipt: PosReceiptData | null = receiptPreview, closeAfter = true) => {
        if (!receipt) return;
        const { html, styles } = buildPosReceiptPrintDocument({
            receipt,
            settings: receiptSettings,
            companyName,
            currency,
        });
        try {
            if (window.electronPOS?.isElectron && window.electronPOS?.printHtml) {
                const forceSilentForDefaultPrinter = Boolean(receiptSettings?.defaultPrinter);
                const result = await window.electronPOS.printHtml({
                    documentTitle: `POS-${receipt.invoiceNo}`,
                    html,
                    styles,
                    deviceName: receiptSettings?.defaultPrinter || undefined,
                    silent: forceSilentForDefaultPrinter || Boolean(receiptSettings?.silentPrint),
                    copies: Number(receiptSettings?.printCopies || 1),
                });
                if (!result?.ok) {
                    toast.error(result?.error || 'Failed to print receipt');
                    return;
                }
            } else {
                printHtmlDocument({
                    documentTitle: `POS-${receipt.invoiceNo}`,
                    html,
                    styles,
                });
            }
        } catch {
            toast.error('Popup blocked. Allow popups to print receipt.');
            return;
        }
        if (closeAfter) {
            setReceiptPreview(null);
        }
    };

    const printShiftReport = async () => {
        if (!selectedShiftDetail) return;
        const summary = selectedShiftDetail.summary || {};
        const breakdown = summary?.paymentBreakdown || {};
        const paymentRows = Object.entries(breakdown).map(([method, v]: any) => ({
            method,
            count: Number(v?.count || 0),
            total: Number(v?.total || 0),
        }));
        const { html, styles } = buildShiftCloseReceiptDocument({
            data: {
                shiftId: selectedShiftDetail.id,
                terminalCode: selectedShiftDetail.terminal?.code || '-',
                terminalName: selectedShiftDetail.terminal?.name || '',
                openedAt: selectedShiftDetail.openedAt,
                closedAt: selectedShiftDetail.closedAt || summary?.closedAt,
                openedBy: selectedShiftDetail.user?.name || '',
                closedBy: summary?.closedBy?.name || '',
                grossSales: Number(summary?.grossSales || selectedShiftDetail.totalSales || 0),
                unpostedSales: Number(summary?.unpostedSales || 0),
                unpostedCount: Number(summary?.unpostedCount || 0),
                totalReturns: Number(summary?.totalReturns || selectedShiftDetail.totalRefunds || 0),
                netSales: Number(summary?.netSales || 0),
                totalInvoices: Number(summary?.totalInvoices || selectedShiftDetail.totalTransactions || 0),
                totalReturnsCount: Number(summary?.totalReturnsCount || 0),
                firstInvoiceNo: summary?.invoiceRange?.firstInvoiceNo || '',
                lastInvoiceNo: summary?.invoiceRange?.lastInvoiceNo || '',
                paymentRows,
                cashSales: Number(summary?.paymentTotals?.cashSales || 0),
                cardSales: Number(summary?.paymentTotals?.cardSales || 0),
                mixedSales: Number(summary?.paymentTotals?.mixedSales || 0),
                mixedCashPart: Number(summary?.paymentTotals?.mixedCashPart || 0),
                mixedCardPart: Number(summary?.paymentTotals?.mixedCardPart || 0),
                creditSales: Number(summary?.paymentTotals?.creditSales || 0),
                totalExpectedAllSalesTypes: Number(summary?.paymentTotals?.totalExpectedAllSalesTypes || 0),
                openingCash: Number(summary?.cash?.openingCash ?? selectedShiftDetail.openingCash ?? 0),
                cashIn: Number(summary?.cash?.cashIn || 0),
                cashOutReturns: Number(summary?.cash?.cashOutReturns || 0),
                expectedCash: Number(summary?.cash?.expectedCash ?? selectedShiftDetail.expectedCash ?? 0),
                actualCash: Number(summary?.cash?.actualCash ?? selectedShiftDetail.actualCash ?? 0),
                variance: Number(summary?.cash?.variance ?? selectedShiftDetail.variance ?? 0),
                notes: selectedShiftDetail.notes || '',
            },
            settings: receiptSettings,
            companyName,
            currency,
        });
        try {
            if (window.electronPOS?.isElectron && window.electronPOS?.printHtml) {
                const result = await window.electronPOS.printHtml({
                    documentTitle: `SHIFT-${selectedShiftDetail.terminal?.code || 'POS'}-${String(selectedShiftDetail.id).slice(-6)}`,
                    html,
                    styles,
                    deviceName: receiptSettings?.defaultPrinter || undefined,
                    silent: Boolean(receiptSettings?.defaultPrinter) || Boolean(receiptSettings?.silentPrint),
                    copies: Number(receiptSettings?.printCopies || 1),
                });
                if (!result?.ok) {
                    toast.error(result?.error || 'Failed to print shift report');
                    return;
                }
            } else {
                printHtmlDocument({
                    documentTitle: `SHIFT-${selectedShiftDetail.terminal?.code || 'POS'}`,
                    html,
                    styles,
                });
            }
            toast.success('Shift report printed');
        } catch {
            toast.error('Failed to print shift report');
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] -m-4">
            {/* Top Navigation */}
            <div className="flex items-center gap-2 px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-center gap-3 mr-6">
                    <h1 className="text-xl font-black text-gray-900 tracking-tight">POS.TERMINAL</h1>
                    <ModuleRefreshButton queryKeys={[['pos-products'], ['pos-customers'], ['pos-loyalty-customers'], ['branches'], ['pos-terminals']]} />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode('BILL')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border-2 ${viewMode === 'BILL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-900'}`}
                    >
                        Scan Barcode
                    </button>
                    <button
                        onClick={() => setViewMode('CATALOG')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border-2 ${viewMode === 'CATALOG' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-900'}`}
                    >
                        Catalog
                    </button>
                </div>

                <div className="ml-auto flex items-center gap-3">
                    <div className="relative">
                        <button
                            onClick={() => setShowMoreMenu((v) => !v)}
                            className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-200 inline-flex items-center gap-1.5"
                        >
                            <MoreHorizontal size={14} />
                            More
                        </button>
                        {showMoreMenu && (
                            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-gray-200 bg-white shadow-xl z-30 p-1">
                                {canViewShifts && (
                                    <button
                                        onClick={() => {
                                            setShowShiftsModal(true);
                                            setShowMoreMenu(false);
                                        }}
                                        className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        View Shifts
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setShowReprintModal(true);
                                        setShowMoreMenu(false);
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Re-Print Receipt
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700">
                        {selectedTerminal ? `${selectedTerminal.code} — ${selectedTerminal.name}` : 'No POS Session'}
                    </div>
                    <button
                        onClick={() => {
                            sessionStorage.removeItem('posSessionToken');
                            setShowPosLogin(true);
                            setPosLoginTerminalId('');
                            setSelectedTerminalId('');
                            setActiveShiftId(null);
                            setPosPolicy(null);
                            setTerminalPriceGroupId(null);
                        }}
                        className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-black"
                    >
                        POS Re-Login
                    </button>

                    {/* Shift Indicator */}
                    {selectedTerminalId && (
                        activeShiftId ? (
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">
                                    🟢 Shift Active
                                </span>
                                <button
                                    onClick={() => setShowCloseShift(true)}
                                    className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-200 hover:bg-red-100"
                                >
                                    Close Shift
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    setOpeningCashInput(0);
                                    setOpenShiftAuthEmail(currentUser?.email || '');
                                    setOpenShiftAuthPassword('');
                                    setShowOpenShiftModal(true);
                                }}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
                            >
                                Open Shift
                            </button>
                        )
                    )}

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                        <MapPin size={14} className="text-gray-500" />
                        <span className="text-xs font-bold text-gray-700">
                            {branches?.find((b: any) => b.id === branchId)?.name || 'Terminal Warehouse'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden px-4 md:px-6 pb-4 md:pb-6 pt-2 md:pt-3 gap-6 flex-col xl:flex-row">
                {/* Main Area: Detailed List / Search */}
                <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">
                    {/* Search Controls */}
                    <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className={`relative min-w-0 rounded-xl transition-all ${isBarcodeFocused ? 'ring-2 ring-emerald-300/70 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]' : ''}`}>
                                {isBarcodeFocused && (
                                    <div className="pointer-events-none absolute left-1 top-1 bottom-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                )}
                                <Barcode
                                    size={18}
                                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${isBarcodeFocused ? 'text-emerald-600' : 'text-gray-400'}`}
                                />
                                <input
                                    ref={barcodeRef}
                                    value={barcodeInput}
                                    onChange={(e) => setBarcodeInput(e.target.value)}
                                    onKeyDown={handleBarcodeScan}
                                    onFocus={() => setIsBarcodeFocused(true)}
                                    onBlur={() => setIsBarcodeFocused(false)}
                                    placeholder="Scan items (F2)..."
                                    className={`w-full h-11 bg-gray-50 border rounded-xl outline-none text-sm transition-all ${isBarcodeFocused
                                        ? 'pl-11 pr-8 border-emerald-300 bg-emerald-50/40 focus:ring-2 focus:ring-emerald-500'
                                        : 'pl-10 pr-4 border-gray-200 focus:ring-2 focus:ring-blue-500 focus:bg-white'
                                        }`}
                                />
                                {isBarcodeFocused && (
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 text-lg font-black leading-none animate-bounce">|</span>
                                )}
                            </div>
                            <div className="relative min-w-0">
                                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={handleSearchEnter}
                                    placeholder="Search products..."
                                    className="w-full h-11 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-sm transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Content View */}
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {viewMode === 'CATALOG' ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 p-1">
                                {(products || []).map((p: any) => {
                                    const unit = p.units?.[0];
                                    const effectivePrice = unit ? resolveUnitPrice(p, unit.unitCode) : 0;
                                    const hasChannelPrice = selectedPriceGroupId && unit && effectivePrice !== Number(unit.salePrice || 0);
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => addToCart(p)}
                                            className="p-4 rounded-xl text-left bg-white border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all group relative"
                                        >
                                            {hasChannelPrice && (
                                                <span className="absolute top-2 right-2 text-[9px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">CH</span>
                                            )}
                                            <p className="text-sm font-bold truncate text-gray-900 group-hover:text-blue-600">{p.name}</p>
                                            <p className="text-[10px] font-mono mt-1 text-gray-500 tracking-tighter">{p.itemCode}</p>
                                            {unit && (
                                                <div className="mt-3 flex items-baseline gap-1 flex-wrap">
                                                    <span className="text-xs font-bold text-gray-400">{currency}</span>
                                                    <span className={`text-base font-black ${hasChannelPrice ? 'text-emerald-600' : 'text-emerald-600'}`}>{effectivePrice.toFixed(2)}</span>
                                                    {hasChannelPrice && (
                                                        <span className="text-[9px] line-through text-gray-400">{Number(unit.salePrice || 0).toFixed(2)}</span>
                                                    )}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            /* Detailed Scanned Items List */
                            <div className="space-y-3 p-1">
                                {cart.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-3xl">
                                        <Barcode size={48} strokeWidth={1} className="mb-4 opacity-20" />
                                        <p className="font-bold uppercase tracking-widest text-xs">No Items Scanned Yet</p>
                                        <p className="text-[11px] mt-1">Start scanning or use search to build invoice</p>
                                    </div>
                                ) : (
                                    cart.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={`rounded-2xl p-4 shadow-sm transition-all ${lastScannedKey === `${item.productId}::${item.unitCode}`
                                                ? 'bg-amber-50 border border-amber-300 hover:border-amber-400'
                                                : 'bg-white border border-gray-100 hover:border-blue-200'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                {/* Product Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">#{idx + 1}</span>
                                                        <h4 className="text-base font-bold text-gray-900 truncate">{item.name}</h4>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">{item.itemCode}</span>
                                                        <div className="h-3 w-[1px] bg-gray-200" />
                                                        <AppDropdown
                                                            value={item.unitCode}
                                                            onChange={(v) => updateUnit(idx, v)}
                                                            options={[...(item.product.units || []).map((u: any) => ({ value: u.unitCode, label: `${u.unitCode} - ${u.unitName} (${formatUnitFactor(u.qtyInBaseUnit)})` }))]}
                                                            placeholder='Select'
                                                            searchable
                                                        />
                                                    </div>
                                                </div>

                                                {/* Price & Quantity Controls */}
                                                <div className="flex items-center gap-8">
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Unit Price</p>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="flex items-center gap-1 justify-end">
                                                                <span className="text-xs font-bold text-gray-400">{currency}</span>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step="0.01"
                                                                    value={item.unitPrice === 0 ? '' : Number(item.unitPrice).toString()}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setCart(cart.map((c, i) => {
                                                                            if (i !== idx) return c;
                                                                            const newPrice = Number(val);
                                                                            return {
                                                                                ...c,
                                                                                unitPrice: isNaN(newPrice) ? 0 : newPrice,
                                                                                taxAmount: (isNaN(newPrice) ? 0 : newPrice) * c.qty * c.taxRate,
                                                                                lineTotal: (isNaN(newPrice) ? 0 : newPrice) * c.qty,
                                                                            };
                                                                        }));
                                                                    }}
                                                                    onBlur={(e) => {
                                                                        const newPrice = Number(e.target.value);
                                                                        const minPrice = resolveMinPrice(item.product, item.unitCode);
                                                                        const isManager = currentUser?.role?.name?.toLowerCase().includes('admin') || currentUser?.role?.name?.toLowerCase().includes('manager');
                                                                        if (minPrice != null && newPrice < minPrice && !isManager) {
                                                                            toast.error(`Cannot set price below ${minPrice} ${currency}`);
                                                                            setCart(cart.map((c, i) => {
                                                                                if (i !== idx) return c;
                                                                                return {
                                                                                    ...c,
                                                                                    unitPrice: minPrice,
                                                                                    taxAmount: minPrice * c.qty * c.taxRate,
                                                                                    lineTotal: minPrice * c.qty,
                                                                                };
                                                                            }));
                                                                        }
                                                                    }}
                                                                    className={`w-20 text-sm font-bold text-gray-900 bg-gray-50 border rounded-md px-2 py-1 outline-none text-right transition-colors ${
                                                                        resolveMinPrice(item.product, item.unitCode) != null && item.unitPrice < (resolveMinPrice(item.product, item.unitCode) || 0) && !(currentUser?.role?.name?.toLowerCase().includes('admin') || currentUser?.role?.name?.toLowerCase().includes('manager'))
                                                                            ? 'border-red-500 ring-1 ring-red-500'
                                                                            : 'border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                                                    }`}
                                                                />
                                                                {(() => {
                                                                    const baseUnit = item.product?.units?.find((u: any) => u.unitCode === item.unitCode);
                                                                    const isChannelPrice = selectedPriceGroupId && baseUnit && item.unitPrice !== Number(baseUnit.salePrice || 0);
                                                                    return isChannelPrice ? (
                                                                        <span className="text-[9px] font-black bg-emerald-500 text-white px-1 py-0.5 rounded-full">CH</span>
                                                                    ) : null;
                                                                })()}
                                                            </div>
                                                            {(() => {
                                                                const minPrice = resolveMinPrice(item.product, item.unitCode);
                                                                return minPrice != null ? (
                                                                    <span className="text-[9px] font-bold text-gray-500">Min: {minPrice} {currency}</span>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                                                        <button onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-gray-200 text-gray-600 shadow-sm hover:bg-gray-50"><Minus size={14} /></button>
                                                        <span className="text-sm font-black w-8 text-center text-gray-900">{item.qty}</span>
                                                        <button onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-900 text-white shadow-lg hover:bg-black transition-transform active:scale-90"><Plus size={14} /></button>
                                                    </div>

                                                    <div className="text-right min-w-[220px]">
                                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none mb-1">Subtotal</p>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Excl VAT</p>
                                                                <p className="text-sm font-black text-gray-900">{(item.lineTotal).toFixed(2)}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Incl VAT</p>
                                                                <p className="text-sm font-black text-emerald-700">{(item.lineTotal + item.taxAmount).toFixed(2)}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button onClick={() => removeItem(idx)} className="p-2 text-gray-300 hover:text-rose-500 transition-colors">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar: Checkout Summary */}
                <div className="w-full xl:w-[400px] xl:min-w-[380px] flex flex-col gap-4 overflow-hidden">

                    {/* Customer Selector */}
                    <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-4 relative z-20" ref={customerSearchRef}>
                        {selectedCustomer ? (
                            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-2xl p-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
                                        {selectedCustomer.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 truncate">{selectedCustomer.name}</p>
                                        <p className="text-[10px] text-blue-700 font-mono flex items-center gap-2">
                                            <span>{selectedCustomer.customerCode}</span>
                                            {selectedCustomer.phone && <span>• {selectedCustomer.phone}</span>}
                                        </p>
                                        {selectedCustomer.priceGroupId && (
                                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                                ✓ Price Channel Active
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedCustomer(null)}
                                    className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            value={customerSearchInput}
                                            onChange={(e) => {
                                                setCustomerSearchInput(e.target.value);
                                                setShowCustomerDropdown(true);
                                            }}
                                            onFocus={() => setShowCustomerDropdown(true)}
                                            placeholder="Select Customer (Code, Phone, Tax ID)..."
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => setShowCreateCustomerModal(true)}
                                        className="w-12 flex items-center justify-center bg-gray-900 text-white rounded-xl hover:bg-black transition-colors"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>

                                {showCustomerDropdown && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto py-1 z-30">
                                        {filteredCustomers.length === 0 ? (
                                            <div className="p-4 text-center text-gray-400 text-xs">No customers found</div>
                                        ) : (
                                            filteredCustomers.map((c: any) => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => {
                                                        setSelectedCustomer(c);
                                                        setShowCustomerDropdown(false);
                                                        setCustomerSearchInput('');
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between group border-b border-gray-50 last:border-0"
                                                >
                                                    <div>
                                                        <p className="font-bold text-gray-900 text-sm">{c.name}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                                            {c.customerCode} {c.phone ? `• ${c.phone}` : ''} {c.vatNumber ? `• TAX: ${c.vatNumber}` : ''}
                                                        </p>
                                                    </div>
                                                    {c.currentBalance > 0 && (
                                                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md">
                                                            Due: {c.currentBalance}
                                                        </span>
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShoppingCart size={20} className="text-blue-600" />
                                <span className="text-sm font-black text-gray-900 uppercase tracking-wider">Order Summary</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white">{cart.length}</span>
                                <button
                                    type="button"
                                    onClick={clearScannedItems}
                                    disabled={!hasEnteredSaleInfo}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Clear current sale"
                                >
                                    <Trash2 size={13} />
                                    Clear
                                </button>
                            </div>
                        </div>

                        {/* Financial Totals */}
                        <div className="p-6 bg-gray-50/50 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-bold text-gray-500">
                                    <span>SUBTOTAL</span>
                                    <span>{subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold text-gray-500">
                                    <span>VAT (15%)</span>
                                    <span>{taxTotal.toFixed(2)}</span>
                                </div>
                                {discountTotal > 0 && (
                                    <div className="flex justify-between text-xs font-bold text-rose-500">
                                        <span>DISCOUNT</span>
                                        <span>-{discountTotal.toFixed(2)}</span>
                                    </div>
                                )}
                                {selectedLoyaltyCustomer && loyaltyRedemptionValue > 0 && (
                                    <div className="flex justify-between text-xs font-bold text-pink-600">
                                        <span>LOYALTY REDEEM ({normalizedLoyaltyPointsRedeemed.toLocaleString()} pts)</span>
                                        <span>-{loyaltyRedemptionValue.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="pt-4 border-t border-gray-200 flex justify-between items-baseline">
                                <span className="text-sm font-black text-gray-900 uppercase">Grand Total</span>
                                <div className="text-right">
                                    <span className="text-xs font-bold text-gray-400 mr-2">{currency}</span>
                                    <span className="text-3xl font-black text-gray-900">{grandTotal.toFixed(2)}</span>
                                </div>
                            </div>
                            {selectedLoyaltyCustomer && (
                                <div className="rounded-xl border border-pink-100 bg-pink-50 px-3 py-2 text-xs flex items-center justify-between">
                                    <span className="font-bold text-pink-700">Points to Earn</span>
                                    <span className="font-black text-pink-900">+{pointsEarnedPreview.toLocaleString()} pts</span>
                                </div>
                            )}
                        </div>

                        {/* Payment Selection */}
                        <div className="p-6 border-t border-gray-100 bg-white space-y-4">
                            {selectedLoyaltyCustomer && (
                                <div className="rounded-2xl border border-pink-100 bg-pink-50 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-pink-700 uppercase tracking-wider">Redeem Points</span>
                                        <span className="text-[10px] font-bold text-pink-700">
                                            Available: {Math.floor(availableLoyaltyPoints).toLocaleString()} pts
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-[1fr_auto] gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            step={loyaltySettings.allowFractionalPoints ? '0.01' : '1'}
                                            value={loyaltyPointsRedeemed || ''}
                                            onChange={(e) => setLoyaltyPointsRedeemed(Number(e.target.value))}
                                            className="w-full text-sm font-semibold bg-white border border-pink-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-pink-500 outline-none"
                                            placeholder="0"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setLoyaltyPointsRedeemed(Math.floor(Math.min(availableLoyaltyPoints, maxRedeemableByTotal)))}
                                            className="px-3 py-2 rounded-xl border border-pink-200 bg-white text-pink-700 text-xs font-bold hover:bg-pink-100"
                                        >
                                            Max
                                        </button>
                                    </div>
                                    <div className="text-[11px] font-bold text-pink-700">
                                        Discount: {currency} {loyaltyRedemptionValue.toFixed(2)}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-4 gap-2">
                                {(globalPaymentMethods && globalPaymentMethods.length > 0
                                    ? globalPaymentMethods.filter(m => m.isActive !== false).map(m => ({
                                        key: m.systemKey || m.value,
                                        label: m.value,
                                        icon: (m.systemKey || m.value).includes('CASH') ? Banknote :
                                            (m.systemKey || m.value).includes('CARD') ? CreditCard :
                                                (m.systemKey || m.value).includes('STC') ? ShoppingCart :
                                                    (m.systemKey || m.value).includes('INSTALLMENT') ? Calendar :
                                                        (m.systemKey || m.value).includes('MIXED') ? Info :
                                                            (m.systemKey || m.value).includes('CREDIT') ? User : Banknote
                                    }))
                                    : [
                                        { key: 'CASH', icon: Banknote, label: 'Cash' },
                                        { key: 'CARD', icon: CreditCard, label: 'Card' },
                                        { key: 'STC_PAY', icon: ShoppingCart, label: 'STC Pay' },
                                        { key: 'CREDIT', icon: User, label: 'Credit' },
                                    ]
                                )
                                    .filter((pm) => allowedPaymentMethods.includes(String(pm.key).toUpperCase()))
                                    .filter((pm) => String(pm.key).toUpperCase() !== 'CREDIT' || (selectedCustomer && selectedCustomer.allowCreditSales !== false))
                                    .map((pm) => (
                                        <button
                                            key={pm.key}
                                            onClick={() => setPaymentMethod(pm.key)}
                                            className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-wide transition-all ${paymentMethod === pm.key
                                                ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20 ring-2 ring-blue-600 ring-offset-2'
                                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                                }`}
                                        >
                                            <pm.icon size={20} />
                                            {pm.label}
                                        </button>
                                    ))}
                            </div>

                            {paymentMethod === 'CASH' && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Cash Received</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={cashReceived || ''}
                                        onChange={(e) => setCashReceived(Number(e.target.value))}
                                        className="w-full text-2xl font-black text-center bg-gray-50 border-none rounded-2xl py-3 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                                        placeholder="0.00"
                                    />
                                    {change > 0 && (
                                        <div className="mt-3 flex items-center justify-between px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl">
                                            <span className="text-[10px] font-black uppercase">Give Change:</span>
                                            <span className="text-sm font-black">{currency} {change.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {paymentMethod === 'MIXED' && (
                                <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                                <Banknote size={14} className="text-emerald-600" />
                                                Cash Part
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                value={cashReceived || ''}
                                                onChange={(e) => setCashReceived(Number(e.target.value))}
                                                className="w-full text-lg font-black text-center bg-gray-50 border-none rounded-2xl py-3 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                                <CreditCard size={14} className="text-blue-600" />
                                                Card/Other Part
                                            </label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                value={cardReceived || ''}
                                                onChange={(e) => setCardReceived(Number(e.target.value))}
                                                className="w-full text-lg font-black text-center bg-gray-50 border-none rounded-2xl py-3 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                                        <div className="flex items-center justify-between text-sm font-black text-gray-700 uppercase">
                                            <span>Required Total</span>
                                            <span className="text-base">{currency} {grandTotal.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-base font-black text-gray-800">
                                            <span>Sum of Received</span>
                                            <span className="text-lg">{currency} {mixedTotalPaid.toFixed(2)}</span>
                                        </div>
                                        {mixedDue > 0 && (
                                            <div className="flex items-center justify-between text-xs font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                                                <span>Still Owed</span>
                                                <span>{currency} {mixedDue.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {mixedChange > 0 && (
                                            <div className="flex items-center justify-between text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                                <span>Return Change</span>
                                                <span>{currency} {mixedChange.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {paymentMethod === 'INSTALLMENT' && (
                                <div className="animate-in fade-in slide-in-from-top-2 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
                                    <Calendar className="text-blue-500" size={24} />
                                    <div className="text-[11px] font-medium text-blue-700">
                                        This sale will be recorded as an <b>Installment</b>. Ensure the customer accounts are configured to track future payments.
                                    </div>
                                </div>
                            )}

                            <button
                                id="checkout-btn"
                                onClick={handleCheckout}
                                disabled={!canCompleteTransaction}
                                className="w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] text-white bg-gray-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all shadow-2xl shadow-gray-200 active:scale-95"
                            >
                                {submitMut.isPending ? <Loader2 size={20} className="animate-spin" /> : <ShoppingCart size={20} />}
                                {submitMut.isPending ? 'Complete Transaction' : `Complete Transaction`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {receiptPreview && (
                <div className="fixed inset-0 z-[240] bg-black/50 backdrop-blur-[1px] flex items-center justify-center p-4">
                    <div className="w-full max-w-4xl max-h-[86vh] rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Print Receipt</h3>
                                <p className="text-sm text-gray-500">Do you want to print this 80mm receipt?</p>
                            </div>
                            <button
                                onClick={() => setReceiptPreview(null)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50"
                            >
                                Skip
                            </button>
                        </div>
                        <div className="p-5 bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-y-auto min-h-0">
                            <ReceiptPreview
                                receipt={receiptPreview}
                                settings={receiptSettings || DEFAULT_POS_RECEIPT_SETTINGS}
                                height="620px"
                            />
                        </div>
                        <div className="p-4 flex justify-end gap-2">
                            <button
                                onClick={() => setReceiptPreview(null)}
                                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium"
                            >
                                No, Close
                            </button>
                            <button
                                onClick={() => { void printReceipt80mm(); }}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                            >
                                Print 80mm Receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLoyaltyPostConfirmModal && (
                <div className="fixed inset-0 z-[276] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-pink-100 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-pink-100 bg-pink-50">
                            <h3 className="text-lg font-black text-gray-900">Confirm Loyalty Discount</h3>
                            <p className="text-xs text-gray-600 mt-1">Review loyalty deduction before posting sale.</p>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Member</div>
                                        <div className="text-sm font-bold text-gray-900 mt-1">
                                            {pendingLoyaltyCustomer?.name || '-'}
                                        </div>
                                        <div className="text-xs text-gray-500 font-mono">
                                            {pendingLoyaltyCustomer?.phone || '-'}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Available Points</div>
                                        <div className="text-base font-black text-pink-700 mt-1">
                                            {(Number(pendingLoyaltyCustomer?.pointsBalance || 0)).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-100 p-3 space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Subtotal + VAT</span>
                                    <span className="font-bold">{currency} {preLoyaltyGrandTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm text-pink-700">
                                    <span>Loyalty Discount ({pendingLoyaltyPreview.pointsRedeemed.toLocaleString()} pts)</span>
                                    <span className="font-bold">- {currency} {pendingLoyaltyPreview.discountValue.toFixed(2)}</span>
                                </div>
                                <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-base font-black text-gray-900">
                                    <span>Amount to Pay</span>
                                    <span>{currency} {pendingLoyaltyPreview.grandTotalAfterDiscount.toFixed(2)}</span>
                                </div>
                                <div className="text-xs text-pink-700 font-semibold">
                                    Points to earn after sale: +{pendingLoyaltyPreview.pointsEarned.toLocaleString()}
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 bg-white flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowLoyaltyPostConfirmModal(false);
                                    setCheckoutAwaitingLoyaltySelection(true);
                                    setShowLoyaltyModal(true);
                                }}
                                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Change Customer
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const customer = pendingLoyaltyCustomer;
                                    const points = pendingLoyaltyPreview.pointsRedeemed;
                                    setShowLoyaltyPostConfirmModal(false);
                                    setPendingLoyaltyCustomer(null);
                                    setPendingLoyaltyPointsRedeemed(0);
                                    performCheckout({ loyaltyCustomer: customer, pointsRedeemed: points });
                                }}
                                className="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold"
                            >
                                Confirm & Post Sale
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLoyaltyModal && (
                <div className="fixed inset-0 z-[275] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-xl rounded-2xl bg-white border border-pink-100 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-pink-100 bg-pink-50 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Walk-in Loyalty</h3>
                                <p className="text-xs text-gray-600">Link customer for Happiness Price points before checkout.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowLoyaltyModal(false);
                                    setCheckoutAwaitingLoyaltySelection(false);
                                    setShowLoyaltyQuickAdd(false);
                                    setLoyaltyLookupTerm('');
                                    setLoyaltySearchInput('');
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-pink-200 text-pink-700 hover:bg-pink-100"
                            >
                                Close
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Search Member</label>
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={loyaltySearchInput}
                                        onChange={(e) => {
                                            setLoyaltySearchInput(e.target.value);
                                            setLoyaltyLookupTerm('');
                                            setShowLoyaltyQuickAdd(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Enter') return;
                                            e.preventDefault();
                                            const value = loyaltySearchInput.trim();
                                            const digits = value.replace(/\D/g, '');
                                            if (digits.length < 5) {
                                                toast.error('Enter full customer number, then press Enter');
                                                return;
                                            }
                                            setLoyaltyLookupTerm(value);
                                        }}
                                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                                        placeholder="Enter customer number and press Enter"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-100 max-h-52 overflow-y-auto">
                                {isFetchingLoyaltyCustomers ? (
                                    <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
                                        <Loader2 size={14} className="animate-spin" />
                                        Searching...
                                    </div>
                                ) : !hasLoyaltyLookup ? (
                                    <div className="p-4 text-xs text-gray-500">Type full customer number and press Enter to search.</div>
                                ) : loyaltyCustomers.length === 0 ? (
                                    <div className="p-4 text-xs text-gray-500">No loyalty customers found.</div>
                                ) : (
                                    loyaltyCustomers.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedLoyaltyCustomer(c);
                                                setShowLoyaltyModal(false);
                                                setLoyaltyPointsRedeemed(0);
                                                setLoyaltySearchInput('');
                                                setLoyaltyLookupTerm('');
                                                setShowLoyaltyQuickAdd(false);
                                                if (checkoutAwaitingLoyaltySelection) {
                                                    setCheckoutAwaitingLoyaltySelection(false);
                                                    const preview = buildLoyaltyCheckoutPreview(c, getDefaultRedeemPoints(c));
                                                    setPendingLoyaltyCustomer(c);
                                                    setPendingLoyaltyPointsRedeemed(preview.pointsRedeemed);
                                                    setShowLoyaltyPostConfirmModal(true);
                                                }
                                            }}
                                            className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-pink-50 flex items-center justify-between"
                                        >
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{c.name}</p>
                                                <p className="text-[11px] text-gray-500 font-mono">{c.phone}</p>
                                            </div>
                                            <span className="text-xs font-bold text-pink-700">{Number(c.pointsBalance || 0).toLocaleString()} pts</span>
                                        </button>
                                    ))
                                )}
                            </div>

                            {noLoyaltyMatch && !showLoyaltyQuickAdd && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const value = loyaltySearchTerm;
                                        const digitsOnly = value.replace(/\D/g, '');
                                        const looksPhone = digitsOnly.length >= 5;
                                        setNewLoyaltyCustomer({
                                            name: looksPhone ? '' : value,
                                            phone: looksPhone ? value : '',
                                        });
                                        setShowLoyaltyQuickAdd(true);
                                    }}
                                    className="w-full py-2.5 rounded-xl border border-pink-200 bg-pink-50 text-pink-700 text-sm font-bold hover:bg-pink-100"
                                >
                                    Quick Add Member
                                </button>
                            )}

                            {showLoyaltyQuickAdd && (
                                <div className="rounded-xl border border-pink-100 bg-pink-50 p-3 space-y-3">
                                    <p className="text-xs font-black text-pink-700 uppercase">Quick Create</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <input
                                            value={newLoyaltyCustomer.name}
                                            onChange={(e) => setNewLoyaltyCustomer((prev) => ({ ...prev, name: e.target.value }))}
                                            className="px-3 py-2 rounded-lg border border-pink-200 text-sm bg-white"
                                            placeholder="Customer name"
                                        />
                                        <input
                                            value={newLoyaltyCustomer.phone}
                                            onChange={(e) => setNewLoyaltyCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                                            className="px-3 py-2 rounded-lg border border-pink-200 text-sm bg-white"
                                            placeholder="Phone"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowLoyaltyQuickAdd(false)}
                                            className="flex-1 py-2 rounded-lg border border-pink-200 bg-white text-pink-700 text-sm font-bold hover:bg-pink-100"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!newLoyaltyCustomer.name.trim() || !newLoyaltyCustomer.phone.trim()) {
                                                    toast.error('Name and phone are required');
                                                    return;
                                                }
                                                createLoyaltyCustomerMut.mutate({
                                                    name: newLoyaltyCustomer.name.trim(),
                                                    phone: newLoyaltyCustomer.phone.trim(),
                                                });
                                            }}
                                            disabled={createLoyaltyCustomerMut.isPending}
                                            className="flex-1 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold disabled:opacity-50"
                                        >
                                            {createLoyaltyCustomerMut.isPending ? 'Saving...' : 'Create and Use'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 bg-white flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedLoyaltyCustomer(null);
                                    setLoyaltyPointsRedeemed(0);
                                    setShowLoyaltyModal(false);
                                    setCheckoutAwaitingLoyaltySelection(false);
                                    setShowLoyaltyQuickAdd(false);
                                    setLoyaltySearchInput('');
                                    setLoyaltyLookupTerm('');
                                    performCheckout();
                                }}
                                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                Skip This Sale
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCreateCustomerModal && (
                <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 border border-gray-200 shadow-2xl space-y-5">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                            <h3 className="text-xl font-black text-gray-900">Create New Customer</h3>
                            <button onClick={() => setShowCreateCustomerModal(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><Trash2 size={16} className="text-gray-500 rotate-45" /></button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                                <input
                                    value={newCustomerData.name}
                                    onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold"
                                    placeholder="Customer Name"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number *</label>
                                <input
                                    value={newCustomerData.phone}
                                    onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                                    placeholder="05xxxxxxxx"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">VAT / Tax ID</label>
                                <input
                                    value={newCustomerData.vatNumber}
                                    onChange={(e) => setNewCustomerData({ ...newCustomerData, vatNumber: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                                    placeholder="3xxxxxxxxxxxxx"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email (Optional)</label>
                                <input
                                    value={newCustomerData.email}
                                    onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
                                <AppDropdown
                                    value={newCustomerData.city}
                                    onChange={(v) => setNewCustomerData(prev => ({ ...prev, city: v }))}
                                    options={[{ value: 'Riyadh', label: 'Riyadh' }, { value: 'Jeddah', label: 'Jeddah' }, { value: 'Dammam', label: 'Dammam' }, { value: 'Mecca', label: 'Mecca' }, { value: 'Medina', label: 'Medina' }, { value: 'Other', label: 'Other' }]}
                                    placeholder='Riyadh'
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Street Address</label>
                                <input
                                    value={newCustomerData.street}
                                    onChange={(e) => setNewCustomerData({ ...newCustomerData, street: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    placeholder="Building No, Street"
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4 flex gap-3">
                            <button
                                onClick={() => setShowCreateCustomerModal(false)}
                                className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (!newCustomerData.name) return toast.error('Name is required');
                                    if (!newCustomerData.phone) return toast.error('Phone is required');
                                    createCustomerMut.mutate(newCustomerData);
                                }}
                                disabled={createCustomerMut.isPending}
                                className="flex-1 py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-black disabled:opacity-50"
                            >
                                {createCustomerMut.isPending ? 'Creating...' : 'Create Customer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Scan Warning */}
            {scanWarning && (
                <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[1px] flex items-center justify-center p-4">
                    <div
                        ref={warningCardRef}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="scan-warning-title"
                        className="w-full max-w-md rounded-2xl bg-white border border-amber-200 shadow-2xl overflow-hidden"
                    >
                        <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
                            <h3 id="scan-warning-title" className="text-sm font-black tracking-wide text-amber-900 uppercase">
                                {scanWarning.title}
                            </h3>
                        </div>
                        <div className="px-5 py-4">
                            <p className="text-sm text-gray-700">{scanWarning.message}</p>
                            <p className="text-xs text-gray-500 mt-3">
                                Close this warning to continue scanning.
                            </p>
                        </div>
                        <div className="px-5 pb-5">
                            <button
                                ref={warningCloseBtnRef}
                                onClick={() => {
                                    setScanWarning(null);
                                    setBarcodeInput('');
                                    barcodeRef.current?.focus();
                                }}
                                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-black uppercase tracking-wider"
                            >
                                OK, Continue Scanning
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Open Shift Modal */}
            {showOpenShiftModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 space-y-4 shadow-xl">
                        <h3 className="text-lg font-semibold text-gray-900">Open Shift</h3>
                        <p className="text-sm text-gray-500">Terminal: <span className="font-mono font-semibold">{selectedTerminal?.code}</span></p>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Opening Cash (SAR)</label>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={openingCashInput}
                                onChange={(e) => setOpeningCashInput(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Auth Email</label>
                            <input
                                type="email"
                                value={openShiftAuthEmail}
                                onChange={(e) => setOpenShiftAuthEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                placeholder="user@company.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Auth Password</label>
                            <input
                                type="password"
                                value={openShiftAuthPassword}
                                onChange={(e) => setOpenShiftAuthPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                placeholder="********"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowOpenShiftModal(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Cancel</button>
                            <button
                                onClick={() => {
                                    if (openShiftOverride && (!openShiftAuthEmail.trim() || !openShiftAuthPassword.trim())) {
                                        toast.error('Email and password are required for override');
                                        return;
                                    }
                                    openShiftMut.mutate({ openingCash: openingCashInput, authEmail: openShiftOverride ? openShiftAuthEmail : undefined, authPassword: openShiftOverride ? openShiftAuthPassword : undefined });
                                }}
                                disabled={openShiftMut.isPending}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                                {openShiftMut.isPending ? 'Opening...' : 'Open Shift'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close Shift Dialog */}
            {showCloseShift && activeShiftId && selectedTerminal && (
                <ShiftCloseDialog
                    shiftId={activeShiftId}
                    terminalCode={selectedTerminal.code}
                    openingCash={activeShiftData?.openingCash || 0}
                    currentUserEmail={currentUser?.email || ''}
                    onClose={() => setShowCloseShift(false)}
                    onClosed={() => {
                        setShowCloseShift(false);
                        setActiveShiftId(null);
                        refetchShift();
                    }}
                />
            )}

            {showReprintModal && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl p-6 space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Re-Print Receipt</h3>
                        <p className="text-sm text-gray-500">Enter invoice number to print receipt again.</p>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const invoiceNo = reprintInvoiceNo.trim();
                                if (!invoiceNo) {
                                    toast.error('Invoice number is required');
                                    return;
                                }
                                reprintMut.mutate(invoiceNo);
                            }}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Number</label>
                                <input
                                    value={reprintInvoiceNo}
                                    onChange={(e) => setReprintInvoiceNo(e.target.value)}
                                    placeholder="e.g. MW-000008"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowReprintModal(false);
                                        setReprintInvoiceNo('');
                                    }}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={reprintMut.isPending}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {reprintMut.isPending ? 'Printing...' : 'Print Receipt'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showShiftsModal && (
                <div className="fixed inset-0 z-[255] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-5xl h-[82vh] rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">My Shifts (Last 1 Month)</h3>
                                <p className="text-xs text-gray-500">View consolidation details and print selected shift closing report.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowShiftsModal(false);
                                    setSelectedShiftViewId('');
                                }}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
                            >
                                Close
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
                            <div className="border-r border-gray-100 overflow-y-auto">
                                {recentShifts.length === 0 ? (
                                    <div className="p-4 text-sm text-gray-500">No shifts in the last month.</div>
                                ) : (
                                    recentShifts.map((s: any) => (
                                        <button
                                            key={s.id}
                                            onClick={() => setSelectedShiftViewId(s.id)}
                                            className={`w-full text-left p-3 border-b border-gray-100 ${selectedShiftViewId === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                        >
                                            <div className="text-sm font-semibold text-gray-900">{s.terminal?.code || 'POS'} • {s.status}</div>
                                            <div className="text-xs text-gray-500 mt-1">{new Date(s.openedAt).toLocaleString()}</div>
                                            <div className="text-xs text-gray-500">{s.closedAt ? `Closed: ${new Date(s.closedAt).toLocaleString()}` : 'Open shift'}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                            <div className="p-4 overflow-y-auto">
                                {!selectedShiftDetail ? (
                                    <div className="text-sm text-gray-500">Select a shift to view details.</div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-base font-bold text-gray-900">
                                                    {selectedShiftDetail.terminal?.code} - {selectedShiftDetail.terminal?.name}
                                                </h4>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(selectedShiftDetail.openedAt).toLocaleString()} {selectedShiftDetail.closedAt ? `to ${new Date(selectedShiftDetail.closedAt).toLocaleString()}` : '(Open)'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => { void printShiftReport(); }}
                                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                                            >
                                                Print Shift Report
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="rounded-xl border border-gray-200 p-3"><div className="text-[11px] text-gray-500">Gross Sales</div><div className="text-lg font-bold">{Number(selectedShiftDetail.summary?.grossSales || 0).toFixed(2)}</div></div>
                                            <div className="rounded-xl border border-gray-200 p-3"><div className="text-[11px] text-gray-500">Unposted</div><div className="text-lg font-bold">{Number(selectedShiftDetail.summary?.unpostedSales || 0).toFixed(2)}</div></div>
                                            <div className="rounded-xl border border-gray-200 p-3"><div className="text-[11px] text-gray-500">Returns</div><div className="text-lg font-bold">{Number(selectedShiftDetail.summary?.totalReturns || 0).toFixed(2)}</div></div>
                                            <div className="rounded-xl border border-gray-200 p-3"><div className="text-[11px] text-gray-500">Net Sales</div><div className="text-lg font-bold">{Number(selectedShiftDetail.summary?.netSales || 0).toFixed(2)}</div></div>
                                        </div>
                                        <div className="rounded-xl border border-gray-200 p-3 text-sm">
                                            <div className="font-semibold mb-2">Invoice Range</div>
                                            <div>{selectedShiftDetail.summary?.invoiceRange?.firstInvoiceNo || '-'} to {selectedShiftDetail.summary?.invoiceRange?.lastInvoiceNo || '-'}</div>
                                        </div>
                                        <div className="rounded-xl border border-gray-200 p-3 text-sm space-y-1">
                                            <div className="font-semibold mb-2">Expected Totals</div>
                                            <div className="flex justify-between"><span>Opening Cash</span><span>{Number(selectedShiftDetail.summary?.cash?.openingCash || 0).toFixed(2)} {currency}</span></div>
                                            <div className="flex justify-between"><span>Cash In</span><span>{Number(selectedShiftDetail.summary?.cash?.cashIn || 0).toFixed(2)} {currency}</span></div>
                                            <div className="flex justify-between"><span>Cash Out (Returns)</span><span>{Number(selectedShiftDetail.summary?.cash?.cashOutReturns || 0).toFixed(2)} {currency}</span></div>
                                            <div className="flex justify-between font-bold"><span>Expected Cash</span><span>{Number(selectedShiftDetail.summary?.cash?.expectedCash || 0).toFixed(2)} {currency}</span></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showPosLogin && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 border border-gray-200 shadow-2xl space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Start POS Session</h3>
                        <p className="text-sm text-gray-500">Your app login is used for POS. Select terminal if needed.</p>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Terminal</label>
                            <AppDropdown
                                value={posLoginTerminalId}
                                onChange={(v) => setPosLoginTerminalId(v)}
                                options={[{ value: '', label: 'Select Terminal' }, ...posTerminals.map((t: any) => ({ value: t.id, label: `${t.code} — ${t.name}` }))]}
                                placeholder='Select Terminal'
                                searchable
                            />
                        </div>
                        {posTerminals.length === 0 && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                No terminals available for your assigned branches/user. Configure terminal assignment in POS Terminals.
                            </p>
                        )}
                        <button
                            onClick={() => {
                                posBootstrapMut.mutate({
                                    terminalId: posLoginTerminalId || undefined,
                                });
                            }}
                            disabled={posBootstrapMut.isPending}
                            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50"
                        >
                            {posBootstrapMut.isPending ? 'Starting...' : 'Start POS Session'}
                        </button>
                        <button
                            onClick={() => {
                                window.location.href = '/';
                            }}
                            className="w-full py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold"
                        >
                            Back to Dashboard
                        </button>
                        <button
                            onClick={() => {
                                sessionStorage.removeItem('posSessionToken');
                                logout();
                                window.location.href = '/login';
                            }}
                            className="w-full py-2.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold"
                        >
                            Back To Login
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

