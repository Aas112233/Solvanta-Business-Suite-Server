import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import api, { refreshSessionTokens } from './lib/api';
import Layout from './components/Layout';
import {
    AccountMappings,
    BalanceSheet,
    Brands,
    CashInvoices,
    Categories,
    ChartOfAccounts,
    CreditInvoices,
    CreditLimitsTerms,
    CustomerForm,
    CustomerLedger,
    Customers,
    Dashboard,
    GeneralLedger,
    GlobalStrings,
    GoodsReceiptNotes,
    Groups,
    InventoryAnalytics,
    InventoryReports,
    ItemDetail,
    ItemForm,
    ItemsList,
    JournalEntries,
    Login,
    LoyaltyCustomers,
    OverdueInvoices,
    PendingPayments,
    POS,
    POSHotkeysShortcuts,
    POSLoyaltySettings,
    POSTerminals,
    ProductionOrders,
    BomManagement,
    PriceChannels,
    ProfitAndLoss,
    ProformaInvoices,
    PurchaseControl,
    PurchaseDetail,
    PurchaseForm,
    PurchaseOrderDetail,
    PurchaseOrderForm,
    PurchaseOrders,
    PurchasePaymentForm,
    PurchasePayments,
    PurchaseReports,
    PurchaseRequisitions,
    ExpensePurchaseList,
    ExpensePurchaseForm,
    ExpensePurchaseDetail,
    PurchaseReturnDetail,
    PurchaseReturnForm,
    PurchaseReturns,
    Purchases,
    ReceiptPrintingSettings,
    ReceiveSalesPayment,
    Reports,
    RequestForQuotation,
    Roles,
    SalesAnalytics,
    SalesCashAudit,
    SalesCashDashboard,
    SalesCashDeposits,
    SalesCashReconciliation,
    SalesCashRunDetail,
    SalesCashRuns,
    SalesCashVault,
    SalesCreditControl,
    SalesCustomerGroupPricing,
    SalesDiscountRules,
    SalesInvoiceForm,
    ServiceSalesInvoice,
    ServiceInvoicesList,
    ServiceInvoiceView,
    SalesList,
    SalesOrderConvert,
    SalesOrderForm,
    SalesOrders,
    SalesPayments,
    SalesPriceLists,
    SalesPromotions,
    SalesQuotationConvert,
    SalesQuotationDetail,
    SalesQuotationForm,
    SalesQuotations,
    SalesReturn,
    SalesSummaryReport,
    Settings,
    ShiftHistory,
    StockCountDetail,
    StockCountForm,
    StockCounts,
    StockOverview,
    StockPurchases,
    StockTransfers,
    SupplierLedger,
    Suppliers,
    SuperAdminAudit,
    SuperAdminBroadcasts,
    SuperAdminCompanies,
    SuperAdminCompanyProfile,
    SuperAdminDashboard,
    SuperAdminModules,
    SuperAdminShell,
    Taxes,
    TodaySalesSummary,
    TopSellingItems,
    TransferDetail,
    TransferForm,
    TrialBalance,
    UnitManagement,
    UnpostedInvoices,
    Users,
    WarehouseDashboard,
    WarehouseList,
    Departments,
    Positions,
    Employees,
    Attendance,
    Leaves,
    Services,
    BankAccounts,
    BankReconciliation,
    ARAging,
    APAging,
} from './pages/lazy';
import ModulePlaceholder from './pages/placeholders/ModulePlaceholder';
import AppLoader from './components/ui/AppLoader';
import { ToastContainer } from './components/ui';

const INACTIVITY_WARNING_AFTER_MS = 5 * 60 * 1000;
const INACTIVITY_COUNTDOWN_SECONDS = 60;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const token = useAuthStore((s) => s.token);
    const hasHydrated = useAuthStore((s) => s.hasHydrated);
    if (!hasHydrated) return null;
    if (!isAuthenticated && !token) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

function PermissionRoute({
    permission,
    children,
    title,
}: {
    permission?: string;
    children: React.ReactNode;
    title: string;
}) {
    const hasPermission = useAuthStore((s) => s.hasPermission);
    if (!permission || hasPermission(permission)) return <>{children}</>;
    return (
        <ModulePlaceholder
            title={`Access denied: ${title}`}
            description={`Missing permission: ${permission}`}
        />
    );
}

function LandingRoute() {
    const hasPermission = useAuthStore((s) => s.hasPermission);

    if (hasPermission('dashboard.view')) {
        return <Dashboard />;
    }

    const fallbackPath =
        ([
            ['sales.view', '/sales/dashboard'],
            ['sales.cashView', '/sales/cash'],
            ['pos.terminalOnly', '/pos'],
            ['pos.access', '/pos'],
            ['inventory.view', '/inventory/stock'],
            ['product.view', '/items'],
            ['production.view', '/production/orders'],
            ['bom.view', '/production/bom'],
            ['crm.view', '/customers'],
            ['purchase.view', '/purchases'],
            ['accounting.view', '/accounting'],
            ['reports.view', '/reports'],
            ['admin.manageUsers', '/users'],
            ['admin.manageRoles', '/roles'],
            ['admin.manageSettings', '/settings'],
        ] as const).find(([perm]) => hasPermission(perm))?.[1] || null;

    if (fallbackPath) {
        return <Navigate to={fallbackPath} replace />;
    }

    return (
        <ModulePlaceholder
            title="No accessible module"
            description="Your role has no module access. Contact administrator."
        />
    );
}

function DynamicTitle() {
    const location = useLocation();

    useEffect(() => {
        const path = location.pathname;
        let suffix = '';

        if (path.startsWith('/pos/sh')) suffix = 'POS Shifts';
        else if (path.startsWith('/pos/term')) suffix = 'POS Terminals';
        else if (path.startsWith('/pos')) suffix = 'POS';
        else if (path.startsWith('/sales/invoices/new')) suffix = 'Create Sales Invoice';
        else if (path.startsWith('/sales/invoices/cash')) suffix = 'Cash Sales Invoice';
        else if (path.startsWith('/sales/invoices/credit')) suffix = 'Credit Sales Invoice';
        else if (path.startsWith('/sales/invoices/proforma')) suffix = 'Proforma Invoice';
        else if (path.startsWith('/sales/invoices')) suffix = 'Sales Invoices';
        else if (path.startsWith('/sales/quotations/new')) suffix = 'Create Quotation';
        else if (path.startsWith('/sales/quotations')) suffix = 'Sales Quotations';
        else if (path.startsWith('/sales/orders/new')) suffix = 'Create Sales Order';
        else if (path.startsWith('/sales/orders')) suffix = 'Sales Orders';
        else if (path.startsWith('/sales/returns')) suffix = 'Sales Returns';
        else if (path.startsWith('/sales/payments')) suffix = 'Sales Payments';
        else if (path.startsWith('/sales/cash')) suffix = 'Sales Cash Management';
        else if (path.startsWith('/sales/dashboard')) suffix = 'Sales Dashboard';
        else if (path.startsWith('/sales')) suffix = 'Sales';
        else if (path.startsWith('/purchases/invoices') || path.startsWith('/inventory/purchases')) suffix = 'Purchase Invoices';
        else if (path.startsWith('/purchases/new') || path.match(/\/inventory\/purchases\/new/)) suffix = 'Create Purchase Invoice';
        else if (path.startsWith('/purchases/orders/new')) suffix = 'Create Purchase Order';
        else if (path.startsWith('/purchases/orders')) suffix = 'Purchase Orders';
        else if (path.startsWith('/purchases/returns')) suffix = 'Purchase Returns';
        else if (path.startsWith('/purchases/payments')) suffix = 'Purchase Payments';
        else if (path.startsWith('/purchases/rfq')) suffix = 'Request for Quotation';
        else if (path.startsWith('/purchases')) suffix = 'Purchases';
        else if (path.startsWith('/inventory/stock-counts')) suffix = 'Stock Counts';
        else if (path.startsWith('/inventory/transfers')) suffix = 'Stock Transfers';
        else if (path.startsWith('/inventory/stock')) suffix = 'Stock Overview';
        else if (path.startsWith('/inventory/warehouses')) suffix = 'Warehouses';
        else if (path.startsWith('/inventory/reports')) suffix = 'Inventory Reports';
        else if (path.startsWith('/inventory/analytics')) suffix = 'Inventory Analytics';
        else if (path.startsWith('/inventory')) suffix = 'Inventory';
        else if (path.startsWith('/production/bom')) suffix = 'Production Recipes';
        else if (path.startsWith('/production/orders')) suffix = 'Production Orders';
        else if (path.startsWith('/production')) suffix = 'Production';
        else if (path.startsWith('/items/new')) suffix = 'Create Item';
        else if (path.startsWith('/items/categories')) suffix = 'Item Categories';
        else if (path.startsWith('/items/brands')) suffix = 'Brands';
        else if (path.startsWith('/items/groups')) suffix = 'Item Groups';
        else if (path.startsWith('/items/price-channels')) suffix = 'Price Channels';
        else if (path.startsWith('/items')) suffix = 'Items';
        else if (path.startsWith('/customers/new')) suffix = 'Create Customer';
        else if (path.startsWith('/customers/ledger')) suffix = 'Customer Ledger';
        else if (path.startsWith('/customers/credit-terms')) suffix = 'Credit Terms';
        else if (path.startsWith('/customers')) suffix = 'Customers';
        else if (path.startsWith('/suppliers/ledger')) suffix = 'Supplier Ledger';
        else if (path.startsWith('/suppliers')) suffix = 'Suppliers';
        else if (path.startsWith('/accounting/coa')) suffix = 'Chart of Accounts';
        else if (path.startsWith('/accounting/journals')) suffix = 'Journal Entries';
        else if (path.startsWith('/accounting/reports/general-ledger')) suffix = 'General Ledger';
        else if (path.startsWith('/accounting/reports/trial-balance')) suffix = 'Trial Balance';
        else if (path.startsWith('/accounting/reports/pl')) suffix = 'Profit & Loss';
        else if (path.startsWith('/accounting/reports/balance-sheet')) suffix = 'Balance Sheet';
        else if (path.startsWith('/accounting/mappings')) suffix = 'Account Mappings';
        else if (path.startsWith('/accounting')) suffix = 'Accounting';
        else if (path.startsWith('/hr/employees')) suffix = 'Employees';
        else if (path.startsWith('/hr/departments')) suffix = 'Departments';
        else if (path.startsWith('/hr/positions')) suffix = 'Positions';
        else if (path.startsWith('/hr/attendance')) suffix = 'Attendance';
        else if (path.startsWith('/hr/leaves')) suffix = 'Leave Management';
        else if (path.startsWith('/hr')) suffix = 'Human Resources';
        else if (path.startsWith('/reports')) suffix = 'Reports';
        else if (path.startsWith('/settings/taxes')) suffix = 'Taxes';
        else if (path.startsWith('/settings/global-strings')) suffix = 'Global Strings';
        else if (path.startsWith('/settings')) suffix = 'Settings';
        else if (path.startsWith('/users')) suffix = 'Users';
        else if (path.startsWith('/roles')) suffix = 'Roles';
        else if (path.startsWith('/super-admin/dashboard')) suffix = 'Admin Dashboard';
        else if (path.startsWith('/super-admin/companies')) suffix = 'Admin Companies';
        else if (path.startsWith('/super-admin')) suffix = 'Super Admin';
        else if (path.startsWith('/login')) suffix = 'Login';

        document.title = suffix ? `Solvanta - ${suffix}` : 'Solvanta Business Suite';
    }, [location.pathname]);

    return null;
}

export default function App() {
    const token = useAuthStore((s) => s.token);
    const hasHydrated = useAuthStore((s) => s.hasHydrated);
    const setUser = useAuthStore((s) => s.setUser);
    const logout = useAuthStore((s) => s.logout);
    const [isRestoringSession, setIsRestoringSession] = useState(false);
    const [showIdleWarning, setShowIdleWarning] = useState(false);
    const [idleCountdownSeconds, setIdleCountdownSeconds] = useState(INACTIVITY_COUNTDOWN_SECONDS);
    const [isKeepingSessionAlive, setIsKeepingSessionAlive] = useState(false);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const showIdleWarningRef = useRef(false);

    useEffect(() => {
        showIdleWarningRef.current = showIdleWarning;
    }, [showIdleWarning]);

    const clearIdleTimers = useCallback(() => {
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
        }
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    }, []);

    const logoutForInactivity = useCallback(async () => {
        clearIdleTimers();
        setShowIdleWarning(false);
        setIdleCountdownSeconds(INACTIVITY_COUNTDOWN_SECONDS);
        setIsKeepingSessionAlive(false);

        try {
            await api.post('/auth/logout');
        } catch {
            // Ignore logout API failure; clear local auth state anyway.
        }

        logout();
        window.location.href = '/login';
    }, [clearIdleTimers, logout]);

    const openIdleWarning = useCallback(() => {
        clearIdleTimers();
        setShowIdleWarning(true);
        setIdleCountdownSeconds(INACTIVITY_COUNTDOWN_SECONDS);

        countdownTimerRef.current = setInterval(() => {
            setIdleCountdownSeconds((prev) => {
                if (prev <= 1) {
                    void logoutForInactivity();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [clearIdleTimers, logoutForInactivity]);

    const scheduleIdleWarning = useCallback(() => {
        if (!hasHydrated || !token) return;
        clearIdleTimers();
        inactivityTimerRef.current = setTimeout(() => {
            openIdleWarning();
        }, INACTIVITY_WARNING_AFTER_MS);
    }, [clearIdleTimers, hasHydrated, openIdleWarning, token]);

    const keepSessionAlive = useCallback(async () => {
        if (isKeepingSessionAlive) return;
        setIsKeepingSessionAlive(true);

        const ok = await refreshSessionTokens();
        if (!ok) {
            await logoutForInactivity();
            return;
        }

        setShowIdleWarning(false);
        setIdleCountdownSeconds(INACTIVITY_COUNTDOWN_SECONDS);
        setIsKeepingSessionAlive(false);
        scheduleIdleWarning();
    }, [isKeepingSessionAlive, logoutForInactivity, scheduleIdleWarning]);

    useEffect(() => {
        if (!hasHydrated || !token) return;

        let isMounted = true;
        setIsRestoringSession(true);

        api.get('/users/me')
            .then((res) => {
                if (!isMounted) return;
                setUser(res.data.data);
            })
            .catch(() => {
                if (!isMounted) return;
                logout();
            })
            .finally(() => {
                if (!isMounted) return;
                setIsRestoringSession(false);
            });

        return () => {
            isMounted = false;
        };
    }, [hasHydrated, token, setUser, logout]);

    useEffect(() => {
        if (!hasHydrated || !token) {
            clearIdleTimers();
            setShowIdleWarning(false);
            setIdleCountdownSeconds(INACTIVITY_COUNTDOWN_SECONDS);
            setIsKeepingSessionAlive(false);
            return;
        }

        const handleActivity = () => {
            if (showIdleWarningRef.current) return;
            scheduleIdleWarning();
        };

        const handleVisibilityChange = () => {
            if (document.hidden || showIdleWarningRef.current) return;
            scheduleIdleWarning();
        };

        const activityEvents: Array<keyof WindowEventMap> = [
            'mousemove',
            'mousedown',
            'keydown',
            'scroll',
            'touchstart',
            'pointerdown',
        ];

        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, handleActivity, { passive: true });
        });
        document.addEventListener('visibilitychange', handleVisibilityChange);

        scheduleIdleWarning();

        return () => {
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, handleActivity);
            });
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearIdleTimers();
        };
    }, [hasHydrated, token, clearIdleTimers, scheduleIdleWarning]);

    if (!hasHydrated) {
        return <AppLoader />;
    }

    const idleMinutes = String(Math.floor(idleCountdownSeconds / 60)).padStart(2, '0');
    const idleSeconds = String(idleCountdownSeconds % 60).padStart(2, '0');

    return (
        <>
            <DynamicTitle />
            <ToastContainer />
            <Suspense fallback={<AppLoader />}>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/*"
                        element={
                            <ProtectedRoute>
                                <Layout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<LandingRoute />} />
                        <Route path="customers" element={<Customers />} />
                        <Route path="customers/new" element={<CustomerForm />} />
                        <Route path="customers/:id" element={<CustomerForm />} />
                        <Route path="suppliers" element={<PermissionRoute permission="supplier.view" title="Supplier List"><Suppliers /></PermissionRoute>} />
                        <Route path="suppliers/ledger" element={<PermissionRoute permission="supplier.view" title="Supplier Ledger"><SupplierLedger /></PermissionRoute>} />

                        {/* Items Module */}
                        <Route path="items" element={<ItemsList />} />
                        <Route path="items/new" element={<ItemForm />} />
                        <Route path="items/categories" element={<Categories />} />
                        <Route path="items/groups" element={<Groups />} />
                        <Route path="items/brands" element={<Brands />} />
                        <Route path="items/unit-management" element={<UnitManagement />} />
                        <Route path="items/price-channels" element={<PriceChannels />} />
                        <Route path="items/:id" element={<ItemDetail />} />
                        <Route path="items/:id/edit" element={<ItemForm />} />

                        <Route path="inventory" element={<Navigate to="inventory/stock" replace />} />
                        <Route path="inventory/stock" element={<StockOverview />} />
                        <Route path="inventory/warehouses" element={<WarehouseList />} />
                        <Route path="inventory/warehouses/:id" element={<WarehouseDashboard />} />
                        <Route path="inventory/transfers" element={<StockTransfers />} />
                        <Route path="inventory/transfers/new" element={<TransferForm />} />
                        <Route path="inventory/transfers/:id" element={<TransferDetail />} />
                        <Route path="inventory/transfers/:id/edit" element={<TransferForm />} />
                        {/* Legacy purchase routes kept for backward compatibility */}
                        <Route path="inventory/purchases" element={<StockPurchases />} />
                        <Route path="inventory/purchases/new" element={<PurchaseForm />} />
                        <Route path="inventory/purchases/:id" element={<PurchaseDetail />} />
                        <Route path="inventory/reports" element={<InventoryReports />} />
                        <Route path="inventory/movements" element={<Navigate to="/reports/running-stock-ledger" replace />} />
                        <Route path="inventory/stock-counts" element={<StockCounts />} />
                        <Route path="inventory/stock-counts/new" element={<StockCountForm />} />
                        <Route path="inventory/stock-counts/:id" element={<StockCountDetail />} />
                        <Route path="inventory/stock-counts/:id/edit" element={<StockCountForm />} />
                        <Route path="inventory/analytics" element={<InventoryAnalytics />} />
                        <Route path="production" element={<Navigate to="/production/orders" replace />} />
                        <Route path="production/bom" element={<PermissionRoute permission="bom.view" title="Production Recipes"><BomManagement /></PermissionRoute>} />
                        <Route path="production/orders" element={<PermissionRoute permission="production.view" title="Production Orders"><ProductionOrders /></PermissionRoute>} />
                        <Route path="pos" element={<POS />} />
                        <Route path="pos/unposted" element={<UnpostedInvoices />} />
                        <Route path="pos/terminals" element={<POSTerminals />} />
                        <Route path="pos/shifts" element={<ShiftHistory />} />
                        <Route path="pos/hotkeys-shortcuts" element={<PermissionRoute permission="pos.sell" title="POS Hotkeys and Shortcuts"><POSHotkeysShortcuts /></PermissionRoute>} />
                        <Route path="pos/hold-resume" element={<PermissionRoute permission="pos.sell" title="Hold and Resume Sale"><ModulePlaceholder title="Hold and Resume Sale" /></PermissionRoute>} />
                        <Route path="pos/receipt-print" element={<PermissionRoute permission="pos.access" title="Print Receipt"><ReceiptPrintingSettings /></PermissionRoute>} />
                        <Route path="pos/loyalty-settings" element={<PermissionRoute permission="pos.access" title="Happiness Price Settings"><POSLoyaltySettings /></PermissionRoute>} />
                        <Route path="pos/loyalty-customers" element={<PermissionRoute permission="pos.access" title="Walk-in Customers"><LoyaltyCustomers /></PermissionRoute>} />

                        {/* Accounting */}
                        <Route path="accounting" element={<Navigate to="/accounting/coa" replace />} />
                        <Route path="accounting/coa" element={<PermissionRoute permission="accounting.view" title="Chart of Accounts"><ChartOfAccounts /></PermissionRoute>} />
                        <Route path="accounting/mappings" element={<PermissionRoute permission="accounting.view" title="Account Mappings"><AccountMappings /></PermissionRoute>} />
                        <Route path="accounting/journals" element={<PermissionRoute permission="accounting.view" title="Journal Entries"><JournalEntries /></PermissionRoute>} />
                        <Route path="accounting/reports/general-ledger" element={<PermissionRoute permission="accounting.view" title="General Ledger"><GeneralLedger /></PermissionRoute>} />
                        <Route path="accounting/reports/trial-balance" element={<PermissionRoute permission="accounting.view" title="Trial Balance"><TrialBalance /></PermissionRoute>} />
                        <Route path="accounting/reports/pl" element={<PermissionRoute permission="accounting.view" title="Profit & Loss"><ProfitAndLoss /></PermissionRoute>} />
                        <Route path="accounting/reports/balance-sheet" element={<PermissionRoute permission="accounting.view" title="Balance Sheet"><BalanceSheet /></PermissionRoute>} />

                        {/* Banking */}
                        <Route path="bank" element={<Navigate to="/bank/accounts" replace />} />
                        <Route path="bank/accounts" element={<PermissionRoute permission="accounting.view" title="Bank Accounts"><BankAccounts /></PermissionRoute>} />
                        <Route path="bank/reconcile" element={<PermissionRoute permission="accounting.view" title="Bank Reconciliation"><BankReconciliation /></PermissionRoute>} />

                        {/* Aging / AR AP */}
                        <Route path="aging/ar" element={<PermissionRoute permission="accounting.view" title="AR Aging"><ARAging /></PermissionRoute>} />
                        <Route path="aging/ap" element={<PermissionRoute permission="accounting.view" title="AP Aging"><APAging /></PermissionRoute>} />

                        {/* Sales */}
                        <Route path="sales" element={<Navigate to="/sales/dashboard" replace />} />
                        <Route path="sales/overview/today-summary" element={<PermissionRoute permission="sales.view" title="Today Sales Summary"><TodaySalesSummary /></PermissionRoute>} />
                        <Route path="sales/overview/top-selling-items" element={<PermissionRoute permission="sales.view" title="Top Selling Items"><TopSellingItems /></PermissionRoute>} />
                        <Route path="sales/overview/recent-invoices" element={<Navigate to="/sales/invoices" replace />} />
                        <Route path="sales/overview/pending-payments" element={<PermissionRoute permission="sales.paymentView" title="Pending Payments"><PendingPayments /></PermissionRoute>} />

                        <Route path="customers/groups" element={<PermissionRoute permission="crm.manageGroups" title="Customer Groups"><ModulePlaceholder title="Customer Groups" /></PermissionRoute>} />
                        <Route path="customers/credit-terms" element={<PermissionRoute permission="sales.creditControl" title="Credit Limits and Terms"><CreditLimitsTerms /></PermissionRoute>} />
                        <Route path="customers/ledger" element={<PermissionRoute permission="sales.customerLedger" title="Customer Ledger"><CustomerLedger /></PermissionRoute>} />

                        <Route path="sales/quotations" element={<PermissionRoute permission="sales.quotationView" title="Quotation List"><SalesQuotations /></PermissionRoute>} />
                        <Route path="sales/quotations/new" element={<PermissionRoute permission="sales.quotationCreate" title="Create Quotation"><SalesQuotationForm /></PermissionRoute>} />
                        <Route path="sales/quotations/:id" element={<PermissionRoute permission="sales.quotationView" title="Quotation Details"><SalesQuotationDetail /></PermissionRoute>} />
                        <Route path="sales/quotations/:id/edit" element={<PermissionRoute permission="sales.quotationEdit" title="Edit Quotation"><SalesQuotationForm /></PermissionRoute>} />
                        <Route path="sales/quotations/:id/convert" element={<PermissionRoute permission="sales.quotationConvert" title="Convert Quotation to Order"><SalesQuotationConvert /></PermissionRoute>} />

                        <Route path="sales/orders" element={<PermissionRoute permission="sales.orderView" title="Sales Order List"><SalesOrders /></PermissionRoute>} />
                        <Route path="sales/orders/new" element={<PermissionRoute permission="sales.orderCreate" title="Create Sales Order"><SalesOrderForm /></PermissionRoute>} />
                        <Route path="sales/orders/:id/edit" element={<PermissionRoute permission="sales.orderCreate" title="Edit Sales Order"><SalesOrderForm /></PermissionRoute>} />
                        <Route path="sales/orders/convert" element={<PermissionRoute permission="sales.create" title="Convert Order"><SalesOrderConvert /></PermissionRoute>} />
                        <Route path="sales/orders/status" element={<PermissionRoute permission="sales.orderView" title="Order Status Tracking"><ModulePlaceholder title="Order Status Tracking" /></PermissionRoute>} />
                        <Route path="sales/orders/fulfillment" element={<Navigate to="/sales/orders/convert" replace />} />

                        <Route path="sales/invoices" element={<PermissionRoute permission="sales.view" title="Sales Invoice List"><SalesList /></PermissionRoute>} />
                        <Route path="sales/invoices/new" element={<PermissionRoute permission="sales.create" title="Create Invoice"><SalesInvoiceForm /></PermissionRoute>} />
                        <Route path="sales/invoices/service" element={<PermissionRoute permission="sales.view" title="Service Invoices"><ServiceInvoicesList /></PermissionRoute>} />
                        <Route path="sales/invoices/service/new" element={<PermissionRoute permission="sales.create" title="Service Sales Invoice"><ServiceSalesInvoice /></PermissionRoute>} />
                        <Route path="sales/invoices/service/:id" element={<PermissionRoute permission="sales.view" title="Service Invoice Details"><ServiceInvoiceView /></PermissionRoute>} />
                        <Route path="sales/invoices/cash" element={<PermissionRoute permission="sales.invoiceCash" title="Cash Invoice"><CashInvoices /></PermissionRoute>} />
                        <Route path="sales/invoices/credit" element={<PermissionRoute permission="sales.invoiceCredit" title="Credit Invoice"><CreditInvoices /></PermissionRoute>} />
                        <Route path="sales/invoices/proforma" element={<PermissionRoute permission="sales.invoiceProforma" title="Proforma Invoice"><ProformaInvoices /></PermissionRoute>} />
                        <Route path="sales/returns" element={<PermissionRoute permission="sales.return" title="Sales Return"><SalesReturn /></PermissionRoute>} />
                        <Route path="sales/returns/refund-adjustment" element={<PermissionRoute permission="sales.return" title="Refund and Adjustment"><ModulePlaceholder title="Refund and Adjustment" /></PermissionRoute>} />

                        <Route path="sales/payments" element={<PermissionRoute permission="sales.paymentView" title="Payment List"><SalesPayments /></PermissionRoute>} />
                        <Route path="sales/payments/receive" element={<PermissionRoute permission="sales.paymentReceive" title="Receive Payment"><ReceiveSalesPayment /></PermissionRoute>} />
                        <Route path="sales/payments/advance" element={<PermissionRoute permission="sales.paymentAdvance" title="Advance Payments"><ModulePlaceholder title="Advance Payments" /></PermissionRoute>} />
                        <Route path="sales/payments/allocate" element={<PermissionRoute permission="sales.paymentAllocate" title="Allocate Payments"><ModulePlaceholder title="Allocate Payment to Invoices" /></PermissionRoute>} />
                        <Route path="sales/cash" element={<PermissionRoute permission="sales.cashView" title="Cash Collection Dashboard"><SalesCashDashboard /></PermissionRoute>} />
                        <Route path="sales/cash/runs" element={<PermissionRoute permission="sales.cashView" title="Cash Collection Runs"><SalesCashRuns /></PermissionRoute>} />
                        <Route path="sales/cash/runs/:id" element={<PermissionRoute permission="sales.cashView" title="Cash Collection Run Detail"><SalesCashRunDetail /></PermissionRoute>} />
                        <Route path="sales/cash/vault" element={<PermissionRoute permission="sales.cashVault" title="Cash Vault Intake"><SalesCashVault /></PermissionRoute>} />
                        <Route path="sales/cash/deposits" element={<PermissionRoute permission="sales.cashDeposit" title="Cash Bank Deposits"><SalesCashDeposits /></PermissionRoute>} />
                        <Route path="sales/cash/reconciliation" element={<PermissionRoute permission="sales.cashReconcile" title="Cash Reconciliation"><SalesCashReconciliation /></PermissionRoute>} />
                        <Route path="sales/cash/audit" element={<PermissionRoute permission="sales.cashAudit" title="Cash Audit Trail"><SalesCashAudit /></PermissionRoute>} />

                        <Route path="sales/pricing/price-lists" element={<PermissionRoute permission="sales.pricingManage" title="Price Lists"><SalesPriceLists /></PermissionRoute>} />
                        <Route path="sales/pricing/customer-group-pricing" element={<PermissionRoute permission="sales.pricingManage" title="Customer Group Pricing"><SalesCustomerGroupPricing /></PermissionRoute>} />
                        <Route path="sales/pricing/promotions" element={<PermissionRoute permission="sales.pricingManage" title="Promotions and Offers"><SalesPromotions /></PermissionRoute>} />
                        <Route path="sales/pricing/discount-rules" element={<PermissionRoute permission="sales.pricingManage" title="Discount Rules"><SalesDiscountRules /></PermissionRoute>} />

                        <Route path="sales/delivery/notes" element={<PermissionRoute permission="sales.deliveryManage" title="Delivery Note"><ModulePlaceholder title="Delivery Note" /></PermissionRoute>} />
                        <Route path="sales/delivery/dispatch-tracking" element={<PermissionRoute permission="sales.deliveryManage" title="Dispatch Tracking"><ModulePlaceholder title="Dispatch Tracking" /></PermissionRoute>} />
                        <Route path="sales/delivery/partial-delivery" element={<PermissionRoute permission="sales.deliveryManage" title="Partial Delivery"><ModulePlaceholder title="Partial Delivery" /></PermissionRoute>} />

                        <Route path="sales/control/credit-control" element={<PermissionRoute permission="sales.creditControl" title="Credit Control"><SalesCreditControl /></PermissionRoute>} />
                        <Route path="sales/control/overdue-invoices" element={<PermissionRoute permission="sales.creditControl" title="Overdue Invoices"><OverdueInvoices /></PermissionRoute>} />
                        <Route path="sales/control/approvals" element={<PermissionRoute permission="sales.approvals" title="Sales Approvals"><ModulePlaceholder title="Sales Approvals" /></PermissionRoute>} />

                        <Route path="sales/reports/summary" element={<PermissionRoute permission="reports.view" title="Sales Summary Report"><SalesSummaryReport /></PermissionRoute>} />
                        <Route path="sales/reports/by-item" element={<PermissionRoute permission="reports.view" title="Sales by Item Report"><ModulePlaceholder title="Sales by Item Report" /></PermissionRoute>} />
                        <Route path="sales/reports/by-customer" element={<PermissionRoute permission="reports.view" title="Sales by Customer Report"><ModulePlaceholder title="Sales by Customer Report" /></PermissionRoute>} />
                        <Route path="sales/reports/invoices" element={<PermissionRoute permission="reports.view" title="Invoice Report"><ModulePlaceholder title="Invoice Report" /></PermissionRoute>} />
                        <Route path="sales/reports/payments" element={<PermissionRoute permission="reports.view" title="Payment Report"><ModulePlaceholder title="Payment Report" /></PermissionRoute>} />
                        <Route path="sales/reports/profit-margin" element={<PermissionRoute permission="reports.view" title="Profit Margin Report"><ModulePlaceholder title="Profit Margin Report" /></PermissionRoute>} />
                        <Route path="sales/reports/returns" element={<PermissionRoute permission="reports.view" title="Return Report"><ModulePlaceholder title="Return Report" /></PermissionRoute>} />

                        <Route path="sales/dashboard" element={<PermissionRoute permission="sales.view" title="Sales Dashboard"><SalesAnalytics /></PermissionRoute>} />
                        <Route path="sales/analytics" element={<Navigate to="/sales/dashboard" replace />} />
                        <Route path="purchases" element={<Purchases />} />
                        <Route path="purchases/requisitions" element={<PermissionRoute permission="purchase.view" title="Purchase Requisitions"><PurchaseRequisitions /></PermissionRoute>} />
                        <Route path="purchases/rfq" element={<PermissionRoute permission="purchase.view" title="Request for Quotation"><RequestForQuotation /></PermissionRoute>} />
                        <Route path="purchases/orders" element={<PermissionRoute permission="purchase.view" title="Purchase Orders"><PurchaseOrders /></PermissionRoute>} />
                        <Route path="purchases/orders/new" element={<PermissionRoute permission="purchase.create" title="Create Purchase Order"><PurchaseOrderForm /></PermissionRoute>} />
                        <Route path="purchases/orders/:id" element={<PermissionRoute permission="purchase.view" title="Purchase Order Detail"><PurchaseOrderDetail /></PermissionRoute>} />
                        <Route path="purchases/orders/:id/edit" element={<PermissionRoute permission="purchase.create" title="Edit Purchase Order"><PurchaseOrderForm /></PermissionRoute>} />
                        <Route path="purchases/grn" element={<PermissionRoute permission="purchase.view" title="Goods Receipt (GRN)"><GoodsReceiptNotes /></PermissionRoute>} />
                        <Route path="purchases/control" element={<PermissionRoute permission="purchase.view" title="Purchase Control"><PurchaseControl /></PermissionRoute>} />
                        <Route path="purchases/invoices" element={<StockPurchases />} />
                        <Route path="purchases/new" element={<PurchaseForm />} />
                        <Route path="purchases/:id/edit" element={<PurchaseForm />} />
                        <Route path="purchases/payments" element={<PermissionRoute permission="purchase.payment" title="Purchase Payments"><PurchasePayments /></PermissionRoute>} />
                        <Route path="purchases/payments/new" element={<PermissionRoute permission="purchase.payment" title="Record Purchase Payment"><PurchasePaymentForm /></PermissionRoute>} />
                        <Route path="purchases/returns" element={<PurchaseReturns />} />
                        <Route path="purchases/returns/new" element={<PurchaseReturnForm />} />
                        <Route path="purchases/returns/:id/edit" element={<PurchaseReturnForm />} />
                        <Route path="purchases/returns/:id" element={<PurchaseReturnDetail />} />
                        <Route path="purchases/:id" element={<PurchaseDetail />} />
                        <Route path="purchases/reports" element={<PermissionRoute permission="purchase.view" title="Purchase Reports"><PurchaseReports /></PermissionRoute>} />
                        
                        {/* Expense Purchases */}
                        <Route path="purchases/expense" element={<ExpensePurchaseList />} />
                        <Route path="purchases/expense/new" element={<ExpensePurchaseForm />} />
                        <Route path="purchases/expense/:id" element={<ExpensePurchaseDetail />} />
                        <Route path="purchases/expense/:id/edit" element={<ExpensePurchaseForm />} />

                        <Route path="reports" element={<Navigate to="/reports/sales" replace />} />
                        <Route path="reports/:type" element={<Reports />} />
                        <Route path="users" element={<Users />} />
                        <Route path="roles" element={<Roles />} />
                        <Route path="hr/departments" element={<PermissionRoute permission="hr.departmentView" title="Departments"><Departments /></PermissionRoute>} />
                        <Route path="hr/positions" element={<PermissionRoute permission="hr.positionView" title="Positions"><Positions /></PermissionRoute>} />
                        <Route path="hr/employees" element={<PermissionRoute permission="hr.employeeView" title="Employees"><Employees /></PermissionRoute>} />
                        <Route path="hr/attendance" element={<PermissionRoute permission="hr.attendanceView" title="Attendance"><Attendance /></PermissionRoute>} />
                        <Route path="hr/leaves" element={<PermissionRoute permission="hr.leaveView" title="Leave Management"><Leaves /></PermissionRoute>} />
                        <Route path="services" element={<PermissionRoute permission="service.view" title="Sales Services"><Services /></PermissionRoute>} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="settings/taxes" element={<Taxes />} />
                        <Route path="settings/global-strings" element={<GlobalStrings />} />
                        <Route path="super-admin" element={<SuperAdminShell />}>
                            <Route index element={<Navigate to="dashboard" replace />} />
                            <Route path="dashboard" element={<SuperAdminDashboard />} />
                            <Route path="companies" element={<SuperAdminCompanies />} />
                            <Route path="companies/:id" element={<SuperAdminCompanyProfile />} />
                            <Route path="modules" element={<SuperAdminModules />} />
                            <Route path="broadcasts" element={<SuperAdminBroadcasts />} />
                            <Route path="audit" element={<SuperAdminAudit />} />
                        </Route>
                    </Route>
                </Routes>
            </Suspense>

            {Boolean(token) && showIdleWarning && (
                <div className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 bg-amber-50">
                            <h3 className="text-lg font-bold text-gray-900">Session About To Expire</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                You have been inactive for 5 minutes. For your security, you will be logged out soon.
                            </p>
                        </div>
                        <div className="px-5 py-4 space-y-3">
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                                    Auto logout in
                                </p>
                                <p className="text-2xl font-black text-amber-900 mt-1">
                                    {idleMinutes}:{idleSeconds}
                                </p>
                            </div>
                            <p className="text-sm text-gray-600">
                                Click <span className="font-semibold">Stay signed in</span> to continue your work.
                            </p>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { void logoutForInactivity(); }}
                                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                                Logout Now
                            </button>
                            <button
                                type="button"
                                onClick={() => { void keepSessionAlive(); }}
                                disabled={isKeepingSessionAlive}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isKeepingSessionAlive ? 'Checking session...' : 'Stay Signed In'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
