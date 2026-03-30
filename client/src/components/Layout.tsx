import { useState, useMemo, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { isCurrentUserSuperAdmin } from '../lib/superAdmin';
import {
    LayoutDashboard, Users, ShoppingCart, Package, Warehouse,
    Receipt, BookOpen, BarChart3, Settings, LogOut,
    ChevronDown, Building2, Truck, Store, Tags, Layers, Bookmark, DollarSign,
    ChevronsLeft, ChevronsRight, Shield, MonitorSmartphone, Search, Calculator, X, Sun, MoonStar,
    BadgeDollarSign, Boxes, Landmark, ShieldCheck, Briefcase, Globe, Wrench
} from 'lucide-react';
import LanguageSwitcher from './ui/LanguageSwitcher';

interface NavItem {
    to?: string;
    icon: any;
    label: string;
    section: NavSectionKey;
    permission?: string;
    superAdminOnly?: boolean;
    roles?: string[];
    children?: NavChildItem[];
}

interface NavChildItem {
    to: string;
    label: string;
    category?: string;
    permission?: string;
    superAdminOnly?: boolean;
    roles?: string[];
}

interface NavChildGroup {
    category: string;
    children: NavChildItem[];
}

type NavSectionKey = 'Core' | 'Commerce' | 'Operations' | 'Insights' | 'Administration' | 'Human Resources';

const NAV_SECTION_ORDER: NavSectionKey[] = ['Core', 'Commerce', 'Operations', 'Insights', 'Administration', 'Human Resources'];
const DEFAULT_CHILD_CATEGORY = 'General';
const getChildGroupKey = (section: NavSectionKey, parentLabel: string, category: string) =>
    `${section}::${parentLabel}::${category}`;

const groupChildrenByCategory = (children: NavChildItem[]): NavChildGroup[] => {
    const groups = new Map<string, NavChildItem[]>();

    children.forEach((child) => {
        const category = child.category?.trim() || DEFAULT_CHILD_CATEGORY;
        const existing = groups.get(category) ?? [];
        groups.set(category, [...existing, child]);
    });

    return Array.from(groups.entries()).map(([category, groupedChildren]) => ({
        category,
        children: groupedChildren,
    }));
};

const navItems: NavItem[] = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'Core', permission: 'dashboard.view' },
    {
        icon: BadgeDollarSign,
        label: 'Sales',
        section: 'Commerce',
        permission: 'sales.view',
        children: [
            { to: '/sales/dashboard', label: 'Sales Dashboard', category: 'Overview' },
            { to: '/sales/overview/today-summary', label: 'Sales Today Summary', category: 'Overview' },
            { to: '/sales/overview/top-selling-items', label: 'Sales Top Selling Items', category: 'Overview' },
            { to: '/sales/overview/pending-payments', label: 'Sales Pending Payments', category: 'Overview', permission: 'sales.paymentView' },
            { to: '/sales/invoices', label: 'Sales Invoices', category: 'Invoicing', permission: 'sales.view' },
            { to: '/sales/invoices/new', label: 'Create Sales Invoice', category: 'Invoicing', permission: 'sales.create' },
            { to: '/sales/invoices/service', label: 'Service Sales Invoices', category: 'Invoicing', permission: 'sales.view' },
            { to: '/sales/invoices/service/new', label: 'New Service Invoice', category: 'Invoicing', permission: 'sales.create' },
            { to: '/sales/invoices/cash', label: 'Cash Sales Invoices', category: 'Invoicing', permission: 'sales.invoiceCash' },
            { to: '/sales/invoices/credit', label: 'Credit Sales Invoices', category: 'Invoicing', permission: 'sales.invoiceCredit' },
            { to: '/sales/invoices/proforma', label: 'Proforma Sales Invoices', category: 'Invoicing', permission: 'sales.invoiceProforma' },
            { to: '/sales/quotations', label: 'Sales Quotations', category: 'Orders & Quotes', permission: 'sales.quotationView' },
            { to: '/sales/orders', label: 'Sales Orders', category: 'Orders & Quotes', permission: 'sales.orderView' },
            { to: '/sales/returns', label: 'Sales Return', category: 'Orders & Quotes', permission: 'sales.return' },
            { to: '/sales/payments', label: 'Sales Payments', category: 'Collections', permission: 'sales.paymentView' },
            { to: '/sales/payments/receive', label: 'Receive Payment', category: 'Collections', permission: 'sales.paymentReceive' },
            { to: '/sales/cash', label: 'Sales Cash Dashboard', category: 'Collections', permission: 'sales.cashView' },
            { to: '/sales/cash/runs', label: 'Sales Collection Runs', category: 'Collections', permission: 'sales.cashView' },
            { to: '/sales/cash/vault', label: 'Sales Vault Intake', category: 'Collections', permission: 'sales.cashVault' },
            { to: '/sales/cash/deposits', label: 'Sales Bank Deposits', category: 'Collections', permission: 'sales.cashDeposit' },
            { to: '/sales/cash/reconciliation', label: 'Sales Cash Reconciliation', category: 'Collections', permission: 'sales.cashReconcile' },
            { to: '/sales/cash/audit', label: 'Sales Cash Audit Trail', category: 'Collections', permission: 'sales.cashAudit' },
            { to: '/sales/pricing/price-lists', label: 'Sales Price Lists', category: 'Pricing', permission: 'sales.pricingManage' },
            { to: '/sales/pricing/customer-group-pricing', label: 'Sales Group Pricing', category: 'Pricing', permission: 'sales.pricingManage' },
            { to: '/sales/pricing/promotions', label: 'Sales Promotions', category: 'Pricing', permission: 'sales.pricingManage' },
            { to: '/sales/delivery/notes', label: 'Sales Delivery Notes', category: 'Logistics', permission: 'sales.deliveryManage' },
            { to: '/sales/delivery/dispatch-tracking', label: 'Sales Dispatch Tracking', category: 'Logistics', permission: 'sales.deliveryManage' },
            { to: '/sales/control/credit-control', label: 'Sales Control', category: 'Control', permission: 'sales.creditControl' },
            { to: '/sales/control/overdue-invoices', label: 'Sales Overdue Invoices', category: 'Control', permission: 'sales.creditControl' },
            { to: '/sales/reports/summary', label: 'Sales Reports', category: 'Reporting', permission: 'reports.view' },
        ]
    },
    {
        icon: MonitorSmartphone,
        label: 'POS',
        section: 'Commerce',
        children: [
            { to: '/pos', label: 'POS Terminal', category: 'Terminal', permission: 'pos.terminalOnly' },
            { to: '/pos/unposted', label: 'POS Unposted Invoices', category: 'Terminal', permission: 'pos.access' },
            { to: '/pos/hotkeys-shortcuts', label: 'POS Hotkeys & Shortcuts', category: 'Terminal', permission: 'pos.sell' },
            { to: '/pos/hold-resume', label: 'POS Hold & Resume', category: 'Terminal', permission: 'pos.sell' },
            { to: '/pos/terminals', label: 'POS Management', category: 'Operations', permission: 'pos.manageTerminals' },
            { to: '/pos/shifts', label: 'POS Shift History', category: 'Operations', permission: 'pos.viewShifts' },
            { to: '/pos/receipt-print', label: 'POS Receipt Printing', category: 'Operations', permission: 'pos.access' },
            { to: '/pos/loyalty-settings', label: 'Happiness Price', category: 'Customers', permission: 'pos.access' },
            { to: '/pos/loyalty-customers', label: 'POS Walk-in Customers', category: 'Customers', permission: 'pos.access' },
        ],
    },
    {
        icon: Boxes,
        label: 'Items',
        section: 'Operations',
        permission: 'product.view',
        children: [
            { to: '/items', label: 'Item List', category: 'Catalog' },
            { to: '/items/categories', label: 'Item Categories', category: 'Catalog' },
            { to: '/items/groups', label: 'Item Groups', category: 'Catalog' },
            { to: '/items/brands', label: 'Item Brands', category: 'Catalog' },
            { to: '/items/unit-management', label: 'Item Unit Management', category: 'Catalog' },
            { to: '/items/price-channels', label: 'Item Price Channels', category: 'Pricing' },
        ],
    },
    {
        icon: Warehouse,
        label: 'Inventory',
        section: 'Operations',
        permission: 'inventory.view',
        children: [
            { to: '/inventory/stock', label: 'Inventory Stock Overview', category: 'Monitoring' },
            { to: '/inventory/warehouses', label: 'Inventory Warehouses', category: 'Operations' },
            { to: '/inventory/transfers', label: 'Inventory Stock Transfers', category: 'Operations' },
            { to: '/inventory/stock-counts', label: 'Inventory Stock Counts', category: 'Operations' },
            { to: '/inventory/analytics', label: 'Inventory Analytics', category: 'Insights', permission: 'inventory.viewAnalytics' },
            { to: '/inventory/reports', label: 'Inventory Reports', category: 'Insights' },
        ],
    },
    {
        icon: Wrench,
        label: 'Manufacturing',
        section: 'Operations',
        children: [
            { to: '/production/orders', label: 'Production Orders', category: 'Execution', permission: 'production.view' },
            { to: '/production/bom', label: 'Production Recipes', category: 'Engineering', permission: 'bom.view' },
        ],
    },
    {
        icon: Users,
        label: 'Customers',
        section: 'Commerce',
        permission: 'crm.view',
        children: [
            { to: '/customers', label: 'Customer List', category: 'Directory' },
            { to: '/customers/groups', label: 'Customer Groups', category: 'Directory', permission: 'crm.manageGroups' },
            { to: '/customers/credit-terms', label: 'Customer Credit Terms', category: 'Credit', permission: 'sales.creditControl' },
            { to: '/customers/ledger', label: 'Customer Ledger', category: 'Credit', permission: 'sales.customerLedger' },
        ],
    },
    {
        icon: Truck,
        label: 'Suppliers',
        section: 'Commerce',
        permission: 'supplier.view',
        children: [
            { to: '/suppliers', label: 'Supplier List', category: 'Directory', permission: 'supplier.view' },
            { to: '/suppliers/ledger', label: 'Supplier Ledger', category: 'Finance', permission: 'supplier.view' },
        ],
    },
    {
        icon: ShoppingCart,
        label: 'Purchases',
        section: 'Operations',
        permission: 'purchase.view',
        children: [
            { to: '/purchases', label: 'Purchase Overview', category: 'Overview' },
            { to: '/purchases/new', label: 'New Purchase', category: 'Transactions', permission: 'purchase.create' },
            { to: '/purchases/invoices', label: 'Purchase Invoices', category: 'Transactions', permission: 'purchase.view' },
            { to: '/purchases/expense', label: 'Expense Purchases', category: 'Transactions', permission: 'purchase.view' },
            { to: '/purchases/returns', label: 'Purchase Returns', category: 'Transactions', permission: 'purchase.return' },
            { to: '/purchases/requisitions', label: 'Purchase Requisitions', category: 'Procurement', permission: 'purchase.view' },
            { to: '/purchases/rfq', label: 'Purchase Request for Quotation', category: 'Procurement', permission: 'purchase.view' },
            { to: '/purchases/orders', label: 'Purchase Orders', category: 'Procurement', permission: 'purchase.view' },
            { to: '/purchases/grn', label: 'Purchase Goods Receipt Notes', category: 'Procurement', permission: 'purchase.view' },
            { to: '/purchases/payments', label: 'Purchase Payments', category: 'Finance', permission: 'purchase.payment' },
            { to: '/purchases/control', label: 'Purchase Control', category: 'Control', permission: 'purchase.control' },
            { to: '/purchases/reports', label: 'Purchase Reports', category: 'Reporting', permission: 'purchase.view' },
        ],
    },
    {
        icon: Landmark,
        label: 'Accounting',
        section: 'Insights',
        permission: 'accounting.view',
        children: [
            { to: '/accounting/coa', label: 'Accounting Chart of Accounts', category: 'Setup' },
            { to: '/accounting/mappings', label: 'Accounting Mappings', category: 'Setup' },
            { to: '/accounting/journals', label: 'Accounting General Journal', category: 'Ledger' },
            { to: '/accounting/reports/general-ledger', label: 'General Ledger', category: 'Reports' },
            { to: '/accounting/reports/trial-balance', label: 'Trial Balance', category: 'Reports' },
            { to: '/accounting/reports/pl', label: 'Profit & Loss', category: 'Reports' },
            { to: '/accounting/reports/balance-sheet', label: 'Balance Sheet', category: 'Reports' },
            { to: '/bank/accounts', label: 'Bank Accounts', category: 'Banking' },
            { to: '/bank/reconcile', label: 'Bank Reconciliation', category: 'Banking' },
            { to: '/aging/ar', label: 'AR Aging', category: 'Receivables' },
            { to: '/aging/ap', label: 'AP Aging', category: 'Payables' },
        ],
    },
    {
        icon: BarChart3,
        label: 'Reports',
        section: 'Insights',
        permission: 'reports.view',
        children: [
            { to: '/reports/sales', label: 'Sales Invoice Report', category: 'Sales' },
            { to: '/reports/sales-invoice-items', label: 'Sales Invoice Items', category: 'Sales' },
            { to: '/reports/item-price-list', label: 'Item Price List', category: 'General' },
            { to: '/reports/vat', label: 'VAT', category: 'General' },
            { to: '/reports/inventory-current-stock', label: 'Inventory Current Stock', category: 'Stock' },
            { to: '/reports/stock-on-date', label: 'Stock on a Date', category: 'Stock' },
            { to: '/reports/stock-multiple-unit', label: 'Current Stock in Multiple Unit', category: 'Stock' },
            { to: '/reports/moving-non-moving-stock', label: 'Moving and Non Moving Stock', category: 'Stock' },
            { to: '/reports/stock-in-warehouses', label: 'Current Stock in Warehouses', category: 'Stock' },
            { to: '/reports/running-stock-ledger', label: 'Running Stock Ledger', category: 'Stock' },
            { to: '/reports/inventory-transaction-summary', label: 'Inventory Transaction Summary', category: 'Stock' },
            { to: '/reports/purchase-invoices', label: 'Purchase Invoices Report', category: 'Purchase Reports' },
            { to: '/reports/purchases-on-date', label: 'Purchases on a Date', category: 'Purchase Reports' },
            { to: '/reports/purchase-payments', label: 'Purchase Payment Report', category: 'Purchase Reports' },
            { to: '/reports/purchase-returns', label: 'Purchase Return Report', category: 'Purchase Reports' },
            { to: '/reports/purchase-order', label: 'Purchase Order Report', category: 'Purchase Reports' },
        ]
    },
    {
        icon: Briefcase,
        label: 'Human Resources',
        section: 'Human Resources',
        permission: 'hr.employeeView',
        children: [
            { to: '/hr/employees', label: 'Employee Directory', category: 'Directory', permission: 'hr.employeeView' },
            { to: '/hr/departments', label: 'Departments', category: 'Organization', permission: 'hr.departmentView' },
            { to: '/hr/positions', label: 'Positions', category: 'Organization', permission: 'hr.positionView' },
            { to: '/hr/attendance', label: 'Attendance', category: 'Time Management', permission: 'hr.attendanceView' },
            { to: '/hr/leaves', label: 'Leaves', category: 'Time Management', permission: 'hr.leaveView' },
            { to: '/services', label: 'Sales Services', category: 'Sales Services', permission: 'service.view' },
        ],
    },
    {
        icon: ShieldCheck,
        label: 'Administration',
        section: 'Administration',
        permission: 'admin.manageUsers',
        roles: ['Admin'],
        children: [
            { to: '/users', label: 'User Accounts', category: 'Access' },
            { to: '/roles', label: 'Roles & Permissions', category: 'Access' },
            { to: '/settings', label: 'Global Settings', category: 'Configuration' },
            { to: '/settings/taxes', label: 'Tax Management', category: 'Configuration' },
            { to: '/settings/global-strings', label: 'App Setup (Strings)', category: 'Configuration', permission: 'admin.manageStrings' },
        ],
    },
    {
        icon: Shield,
        label: 'Super Admin',
        section: 'Administration',
        superAdminOnly: true,
        children: [
            { to: '/super-admin/dashboard', label: 'Dashboard', category: 'Overview', superAdminOnly: true },
            { to: '/super-admin/companies', label: 'Company Management', category: 'Tenant', superAdminOnly: true },
            { to: '/super-admin/modules', label: 'Module Controls', category: 'Tenant', superAdminOnly: true },
            { to: '/super-admin/broadcasts', label: 'Announcements', category: 'Governance', superAdminOnly: true },
            { to: '/super-admin/audit', label: 'Audit Logs', category: 'Governance', superAdminOnly: true },
        ],
    },
];


/* ── Smooth accordion wrapper ──────────────────────────────────────── */
function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | undefined>(open ? undefined : 0);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            if (open) setHeight(undefined);
            return;
        }
        if (!ref.current) return;
        if (open) {
            const h = ref.current.scrollHeight;
            setHeight(0);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setHeight(h));
            });
        } else {
            setHeight(ref.current.scrollHeight);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setHeight(0));
            });
        }
    }, [open]);

    return (
        <div
            style={{
                height: height === undefined ? 'auto' : height,
                overflow: 'hidden',
                transition: 'height 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onTransitionEnd={() => {
                if (open) setHeight(undefined);
            }}
        >
            <div ref={ref}>{children}</div>
        </div>
    );
}

function SidebarNavIcon({
    Icon,
    isActive,
    compact,
}: {
    Icon: any;
    isActive: boolean;
    compact: boolean;
}) {
    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center rounded-xl border transition-all duration-200 ${compact ? 'h-9 w-9' : 'h-8 w-8'} ${isActive
                ? 'border-brand-400 bg-gradient-brand text-white shadow-md shadow-brand-200/70'
                : 'border-slate-200 bg-white text-slate-500 group-hover:border-brand-200 group-hover:bg-brand-50/70 group-hover:text-brand-600'
                }`}
        >
            <Icon size={compact ? 18 : 17} strokeWidth={2.2} />
        </span>
    );
}

export default function Layout() {
    const [sidebarPinned, setSidebarPinned] = useState(true);
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [expandedItems, setExpandedItems] = useState<string[]>([]);
    const [expandedChildGroups, setExpandedChildGroups] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const { user, hasPermission, logout } = useAuthStore();
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);
    const navigate = useNavigate();
    const location = useLocation();
    const sidebarOpen = sidebarPinned || sidebarHovered;

    const toggleExpand = (label: string) => {
        setExpandedItems((prev) => (prev.includes(label) ? [] : [label]));
        setExpandedChildGroups([]);
        if (!sidebarOpen) setSidebarPinned(true);
    };

    const toggleChildGroup = (groupKey: string) => {
        setExpandedChildGroups((prev) =>
            prev.includes(groupKey) ? [] : [groupKey]
        );
        if (!sidebarOpen) setSidebarPinned(true);
    };

    const canViewSidebar = hasPermission('app.viewSidebar');
    const sidebarWidth = canViewSidebar ? (sidebarOpen ? 280 : 78) : 0;
    const rolePerms = user?.role?.permissions || [];
    const isPosOnlyRole =
        rolePerms.includes('pos.terminalOnly')
        && rolePerms.every((perm) => perm === 'app.viewSidebar' || perm.startsWith('pos.'));
    const hideGlobalHeader = isPosOnlyRole && location.pathname.startsWith('/pos');

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const canAccessSuperAdmin = isCurrentUserSuperAdmin();

    const isChildRouteActive = (to: string): boolean => {
        const [childPath, childSearch] = to.split('?');
        const isPathMatch = location.pathname === childPath || location.pathname.startsWith(`${childPath}/`);
        if (!isPathMatch) return false;
        if (!childSearch) return true;
        return location.search === `?${childSearch}`;
    };

    const filteredNav = useMemo(() => {
        const canAccessNode = (node: { superAdminOnly?: boolean; roles?: string[]; permission?: string }) => {
            if (node.superAdminOnly && !canAccessSuperAdmin) return false;
            if (canAccessSuperAdmin) return true;
            if (node.roles && node.roles.length > 0) {
                const userRole = user?.role?.name;
                if (!userRole || !node.roles.includes(userRole)) return false;
            }
            if (node.permission && !hasPermission(node.permission)) return false;
            return true;
        };

        const items = navItems
            .map((item) => {
                if (!canAccessNode(item)) return null;
                const allowedChildren = item.children?.filter((child) => canAccessNode(child)) || [];
                if (item.children && allowedChildren.length === 0 && !item.to) return null;
                return { ...item, children: item.children ? allowedChildren : undefined };
            })
            .filter(Boolean) as NavItem[];

        if (!searchTerm) return items;

        const lowerTerm = searchTerm.trim().toLowerCase();

        return items.map((item) => {
            const matchesParent = item.label.toLowerCase().includes(lowerTerm);
            const matchingChildren = item.children?.filter((child) => {
                const matchesLabel = child.label.toLowerCase().includes(lowerTerm);
                const matchesCategory = (child.category || '').toLowerCase().includes(lowerTerm);
                return matchesLabel || matchesCategory;
            });

            if (matchesParent) {
                return item;
            }

            if (matchingChildren && matchingChildren.length > 0) {
                return { ...item, children: matchingChildren };
            }

            return null;
        }).filter(Boolean) as NavItem[];
    }, [navItems, canAccessSuperAdmin, hasPermission, searchTerm, user]);

    const groupedNav = useMemo(() => {
        const groups = NAV_SECTION_ORDER.map((section) => ({
            section,
            items: filteredNav.filter((item) => item.section === section),
        }));
        return groups.filter((group) => group.items.length > 0);
    }, [filteredNav]);

    useEffect(() => {
        if (searchTerm) {
            const firstItem = filteredNav.find((item) => (item.children?.length || 0) > 0);
            setExpandedItems(firstItem ? [firstItem.label] : []);
            if (firstItem) {
                const firstGroup = groupChildrenByCategory(firstItem.children || [])[0];
                setExpandedChildGroups(firstGroup ? [getChildGroupKey(firstItem.section, firstItem.label, firstGroup.category)] : []);
            } else {
                setExpandedChildGroups([]);
            }
        }
    }, [searchTerm, filteredNav]);

    useEffect(() => {
        if (searchTerm) return;
        const activeParents = filteredNav
            .filter((item) => item.children?.some((child) => isChildRouteActive(child.to)))
            .map((item) => item.label);

        // Always update — don't bail out. Collapse everything if nothing is active.
        setExpandedItems(activeParents.length > 0 ? [activeParents[0]] : []);

        // Pick the subcategory group containing the MOST SPECIFICALLY matched child.
        // e.g. on /customers/ledger, both /customers and /customers/ledger match via startsWith,
        // but /customers/ledger is longer → its group (Credit) wins over Directory.
        let bestGroupKey: string | null = null;
        let bestMatchLength = -1;

        filteredNav.forEach((item) => {
            groupChildrenByCategory(item.children || []).forEach((group) => {
                group.children.forEach((child) => {
                    const [childPath] = child.to.split('?');
                    const isMatch = location.pathname === childPath || location.pathname.startsWith(`${childPath}/`);
                    if (isMatch && childPath.length > bestMatchLength) {
                        bestMatchLength = childPath.length;
                        bestGroupKey = getChildGroupKey(item.section, item.label, group.category);
                    }
                });
            });
        });

        setExpandedChildGroups(bestGroupKey ? [bestGroupKey] : []);
    }, [filteredNav, location.pathname, location.search, searchTerm]);

    return (
        <div className="h-screen overflow-hidden bg-background-app flex font-sans">
            {/* Sidebar */}
            {canViewSidebar && (
                <aside
                    onMouseEnter={() => {
                        if (!sidebarPinned) setSidebarHovered(true);
                    }}
                    onMouseLeave={() => setSidebarHovered(false)}
                    className="fixed inset-y-0 left-0 z-40 flex flex-col overflow-x-hidden bg-white border-r-2 border-slate-200 transition-[width] duration-300 shadow-2xl shadow-slate-300/60 dark:border-slate-700 dark:shadow-black/40"
                    style={{ width: `${sidebarWidth}px` }}
                >
                    {/* Logo */}
                    <div className="flex items-center gap-3 px-5 h-16 border-b border-border-subtle shrink-0">
                        <img src="/logo.png" alt="Solvanta Logo" className="h-9 w-9 rounded-xl shadow-sm" />
                        <div className={`overflow-hidden transition-all duration-300 ${sidebarOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
                            <p className="text-[14px] font-black uppercase tracking-widest text-[#0F1E2E] whitespace-normal break-words leading-tight whitespace-nowrap">
                                SOLVANTA
                            </p>
                            <p className="text-[10px] font-medium text-[#475569] tracking-wider whitespace-nowrap">
                                Business Suite
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                setSidebarPinned((prev) => {
                                    const next = !prev;
                                    if (!next) setSidebarHovered(false);
                                    return next;
                                });
                            }}
                            className="ml-auto p-1.5 rounded-lg hover:bg-slate-50 text-text-tertiary hover:text-text-primary transition-all"
                            title={sidebarPinned ? 'Shrink sidebar' : 'Expand sidebar'}
                            aria-label={sidebarPinned ? 'Shrink sidebar' : 'Expand sidebar'}
                        >
                            {sidebarPinned ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className={`shrink-0 overflow-hidden transition-all duration-300 ${sidebarOpen ? 'max-h-20 opacity-100 px-3 py-3' : 'max-h-0 opacity-0 px-0 py-0'}`}>
                        <div className="relative group">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search modules..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-2 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                    title="Clear search"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className={`flex-1 overflow-y-auto py-2 custom-scrollbar transition-all duration-300 ${sidebarOpen ? 'px-3 space-y-2' : 'px-2 space-y-0.5'}`}>
                        {groupedNav.map(({ section, items }) => (
                            <div key={section} className={sidebarOpen ? 'space-y-1' : 'space-y-0'}>
                                <div className="relative">
                                    <div className={`px-2 pt-2 pb-1 flex items-center justify-between transition-all duration-300 ${sidebarOpen ? 'opacity-100 max-h-10' : 'opacity-0 max-h-0 overflow-hidden p-0'}`}>
                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#475569]">{section}</p>
                                        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                                            {items.length}
                                        </span>
                                    </div>
                                    <div className={`mx-auto h-px bg-slate-200/60 transition-all duration-300 ${sidebarOpen ? 'opacity-0 my-0 w-full' : 'opacity-100 my-1 w-8'}`} />
                                </div>

                                {items.map((item) => {
                                    const hasChildren = item.children && item.children.length > 0;
                                    const isExpanded = expandedItems.includes(item.label);
                                    const isActiveParent = !!(hasChildren && item.children?.some((child) => isChildRouteActive(child.to)));
                                    const childCategoryGroups = hasChildren ? groupChildrenByCategory(item.children || []) : [];

                                    return (
                                        <div key={item.label} className="space-y-1">
                                            {hasChildren ? (
                                                <button
                                                    onClick={() => toggleExpand(item.label)}
                                                    title={!sidebarOpen ? item.label : undefined}
                                                    className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-200 group ${sidebarOpen ? 'px-3 py-2.5' : 'p-2 justify-center'} ${isActiveParent
                                                        ? 'bg-brand-50 text-brand-700'
                                                        : 'text-text-secondary hover:bg-slate-50 hover:text-text-primary'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <SidebarNavIcon Icon={item.icon} isActive={isActiveParent} compact={!sidebarOpen} />
                                                        {sidebarOpen && (
                                                            <span className="whitespace-normal break-words leading-tight text-left">{item.label}</span>
                                                        )}
                                                    </div>
                                                    <div className={`ml-auto flex items-center gap-2 transition-all duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                                                        <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold ${isActiveParent ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {item.children?.length || 0}
                                                        </span>
                                                        <ChevronDown
                                                            size={16}
                                                            className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                                        />
                                                    </div>
                                                </button>
                                            ) : (
                                                <NavLink
                                                    to={item.to!}
                                                    end={item.to === '/'}
                                                    title={!sidebarOpen ? item.label : undefined}
                                                    onClick={() => {
                                                        if (window.innerWidth < 768) setSidebarPinned(false);
                                                    }}
                                                    className={({ isActive }) =>
                                                        `flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 group ${sidebarOpen ? 'px-3 py-2.5' : 'p-2 justify-center'} ${isActive
                                                            ? 'bg-gradient-brand text-white shadow-md shadow-brand-200'
                                                            : 'text-text-secondary hover:bg-slate-50 hover:text-text-primary'
                                                        }`
                                                    }
                                                >
                                                    {({ isActive }) => (
                                                        <>
                                                            <SidebarNavIcon Icon={item.icon} isActive={isActive} compact={!sidebarOpen} />
                                                            {sidebarOpen && (
                                                                <span className="whitespace-normal break-words leading-tight text-left">{item.label}</span>
                                                            )}
                                                        </>
                                                    )}
                                                </NavLink>
                                            )}

                                            {hasChildren && sidebarOpen && (
                                                <AnimatedCollapse open={isExpanded}>
                                                    <div className="pl-3 space-y-1 mt-1 relative before:absolute before:left-6 before:top-0 before:bottom-0 before:w-px before:bg-slate-100">
                                                        {childCategoryGroups.map((group) => {
                                                            const groupKey = getChildGroupKey(item.section, item.label, group.category);
                                                            const isGroupExpanded = expandedChildGroups.includes(groupKey);
                                                            const isGroupActive = group.children.some((child) => isChildRouteActive(child.to));

                                                            return (
                                                                <div key={`${item.label}-${group.category}`} className="space-y-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleChildGroup(groupKey)}
                                                                        className={`w-full flex items-center rounded-lg py-1.5 pl-9 pr-3 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${isGroupActive
                                                                            ? 'text-brand-600 bg-brand-50/40'
                                                                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                                                            }`}
                                                                    >
                                                                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-tight text-left">{group.category}</span>
                                                                        <span className={`ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold ${isGroupActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                            {group.children.length}
                                                                        </span>
                                                                        <ChevronDown
                                                                            size={14}
                                                                            className={`ml-1 transition-transform duration-200 ${isGroupExpanded ? 'rotate-180' : ''}`}
                                                                        />
                                                                    </button>

                                                                    <AnimatedCollapse open={isGroupExpanded}>
                                                                        {group.children.map((child) => {
                                                                            const isActive = isChildRouteActive(child.to);
                                                                            return (
                                                                                <NavLink
                                                                                    key={child.to}
                                                                                    to={child.to}
                                                                                    onClick={() => {
                                                                                        if (window.innerWidth < 768) setSidebarPinned(false);
                                                                                    }}
                                                                                    className={`block pl-9 pr-3 py-2 rounded-lg text-[13px] font-medium transition-colors relative z-10 ${isActive
                                                                                        ? 'text-brand-600 bg-brand-50/50'
                                                                                        : 'text-text-secondary hover:text-text-primary hover:bg-slate-50'
                                                                                        }`}
                                                                                >
                                                                                    <span className="flex items-start gap-2 min-w-0">
                                                                                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-brand-500' : 'bg-slate-300'}`} />
                                                                                        <span className="whitespace-normal break-words leading-tight text-left">{child.label}</span>
                                                                                    </span>
                                                                                </NavLink>
                                                                            );
                                                                        })}
                                                                    </AnimatedCollapse>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </AnimatedCollapse>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>

                    {/* User section */}
                    <div className="p-4 border-t border-border-subtle bg-slate-50/50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-white border border-slate-200 p-0.5 flex items-center justify-center shadow-sm flex-shrink-0">
                                <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold">
                                    {user?.name?.charAt(0) || 'U'}
                                </div>
                            </div>
                            <div className={`overflow-hidden flex-1 origin-left transition-all duration-300 ${sidebarOpen ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
                                <p className="text-sm font-semibold text-text-primary whitespace-nowrap">
                                    {user?.name}
                                </p>
                                <p className="text-xs text-text-tertiary whitespace-nowrap">
                                    {user?.email}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3">
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                            >
                                {theme === 'dark' ? <Sun size={16} /> : <MoonStar size={16} />}
                                <span className={`text-xs font-semibold uppercase tracking-wide transition-all duration-300 ${sidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}`}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                            </button>
                        </div>
                    </div>
                </aside>
            )}

            {/* Main */}
            <div
                className="flex-1 flex flex-col min-w-0 transition-[margin-left] duration-300 ease-spring"
                style={{ marginLeft: `${sidebarWidth}px` }}
            >
                {/* Header */}
                {!hideGlobalHeader && (
                    <header className="h-16 flex items-center justify-between px-8 border-b border-border/60 bg-white/80 backdrop-blur-md sticky top-0 z-30">
                        <div className="flex items-center gap-4" />

                        <div className="flex items-center gap-3">
                            <LanguageSwitcher />
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                            >
                                {theme === 'dark' ? <Sun size={16} /> : <MoonStar size={16} />}
                            </button>
                            {/* Logout */}
                            <button
                                onClick={handleLogout}
                                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                                title="Logout"
                                aria-label="Logout"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    </header>
                )}

                {/* Content */}
                <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8 custom-scrollbar">
                    <div className="w-full min-w-0 animate-scale-in">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
