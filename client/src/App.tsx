import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import api, { refreshSessionTokens } from './lib/api';
import Layout from './components/Layout';
import {
    AccountMappings,
    ArchivedCustomers,
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
    ForgotPassword,
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
    ResetPassword,
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
    SuperAdminSupportSessions,
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
    FixedAssetsList,
    FixedAssetDetail,
} from './pages/lazy';
import SetupWizard from './pages/SetupWizard';
import ModulePlaceholder from './pages/placeholders/ModulePlaceholder';
import AppLoader from './components/ui/AppLoader';
import { SkeletonTable } from './components/ui/Skeleton';
import { Toaster } from 'react-hot-toast';
import { publicRoutes, protectedRoutes, AppRoute } from './config/routes';

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
    permissions,
    moduleKey,
    children,
    title,
}: {
    permission?: string;
    permissions?: string[];
    moduleKey?: string;
    children: React.ReactNode;
    title: string;
}) {
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const isModuleEnabled = useAuthStore((s) => s.isModuleEnabled);

    // Check tenant-level module gating first
    if (moduleKey && !isModuleEnabled(moduleKey as any)) {
        return (
            <ModulePlaceholder
                title={`Module not available: ${title}`}
                description="This module is not enabled for your organization. Contact your administrator."
            />
        );
    }

    const allowed = permission
        ? hasPermission(permission)
        : permissions && permissions.length > 0
            ? permissions.some((candidate) => hasPermission(candidate))
            : true;

    if (allowed) return <>{children}</>;

    const missingPermissionLabel = permission || (permissions && permissions.length > 0 ? permissions.join(' or ') : 'unknown');
    return (
        <ModulePlaceholder
            title={`Access denied: ${title}`}
            description={`Missing permission: ${missingPermissionLabel}`}
        />
    );
}

function LandingRoute() {
    const hasPermission = useAuthStore((s) => s.hasPermission);
    const isModuleEnabled = useAuthStore((s) => s.isModuleEnabled);

    // Check dashboard with module enablement
    if (hasPermission('dashboard.view') && isModuleEnabled('reports')) {
        return <Dashboard />;
    }

    // Fallback routes with module enablement checks
    const fallbackPath =
        ([
            ['sales.view', '/sales/dashboard', 'sales'],
            ['sales.cashView', '/sales/cash', 'sales'],
            ['pos.terminalOnly', '/pos', 'pos'],
            ['pos.access', '/pos', 'pos'],
            ['inventory.view', '/inventory/stock', 'inventory'],
            ['product.view', '/items', 'items'],
            ['production.view', '/production/orders', 'production'],
            ['bom.view', '/production/bom', 'production'],
            ['crm.view', '/customers', 'crm'],
            ['purchase.view', '/purchases', 'purchases'],
            ['accounting.view', '/accounting', 'accounting'],
            ['reports.view', '/reports', 'reports'],
            ['admin.manageUsers', '/users', null],
            ['admin.manageRoles', '/roles', null],
            ['admin.manageSettings', '/settings', null],
        ] as const).find(([perm, _, mod]) => {
            if (!hasPermission(perm)) return false;
            if (mod && !isModuleEnabled(mod as any)) return false;
            return true;
        })?.[1] || null;

    if (fallbackPath) {
        return <Navigate to={fallbackPath} replace />;
    }

    return (
        <ModulePlaceholder
            title="No accessible module"
            description="Your role has no module access or modules are not enabled. Contact administrator."
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
        else if (path.startsWith('/customers/archived')) suffix = 'Archived Customers';
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
        else if (path.startsWith('/super-admin/support-sessions')) suffix = 'Support Sessions';
        else if (path.startsWith('/super-admin')) suffix = 'Super Admin';
        else if (path.startsWith('/login')) suffix = 'Login';

        document.title = suffix ? `Solvanta - ${suffix}` : 'Solvanta Business Suite';
    }, [location.pathname]);

    return null;
}

/**
 * Renders an array of AppRoute config objects into <Route> elements.
 * Handles index routes, redirects, nested children (super-admin), and
 * standard permission-gated routes.
 */
function renderProtectedRoutes(routes: AppRoute[]): React.ReactNode[] {
    return routes.map((route, i) => {
        // Redirect route (check before index — super-admin child index routes use this)
        if (route.redirectTo) {
            return route.index
                ? <Route key={i} index element={<Navigate to={route.redirectTo} replace />} />
                : <Route key={i} path={route.path!} element={<Navigate to={route.redirectTo} replace />} />;
        }

        // Index route → LandingRoute (only reached for non-redirect index routes)
        if (route.index) {
            return <Route key={i} index element={<LandingRoute />} />;
        }

        // Nested route with children (e.g. super-admin shell)
        if (route.children) {
            return (
                <Route key={i} path={route.path!} element={route.element}>
                    {renderProtectedRoutes(route.children)}
                </Route>
            );
        }

        // Standard permission-gated route
        return (
            <Route
                key={i}
                path={route.path!}
                element={
                    <PermissionRoute
                        permission={route.permission}
                        permissions={route.permissions}
                        moduleKey={route.moduleKey}
                        title={route.title}
                    >
                        {route.element}
                    </PermissionRoute>
                }
            />
        );
    });
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

        // Fetch user data without blocking initial render
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
            <Toaster position="top-right" />
            <Suspense fallback={<div className="p-6"><SkeletonTable rows={8} /></div>}>
                <Routes>
                    {publicRoutes.map((route, i) => (
                        <Route
                            key={i}
                            path={route.path}
                            element={
                                route.protected ? (
                                    <ProtectedRoute>{route.element}</ProtectedRoute>
                                ) : (
                                    route.element
                                )
                            }
                        />
                    ))}
                    <Route
                        path="/*"
                        element={
                            <ProtectedRoute>
                                <Layout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<LandingRoute />} />
                        {renderProtectedRoutes(protectedRoutes)}
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
