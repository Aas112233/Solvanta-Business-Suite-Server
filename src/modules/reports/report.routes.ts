import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/response.js';

export const reportRoutes = Router();
reportRoutes.use(authenticate, requirePermission(PERMISSIONS.REPORTS_VIEW));

const ADMIN_BRANCH_PERMISSION = PERMISSIONS.ADMIN_MANAGE_BRANCHES;

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(ADMIN_BRANCH_PERMISSION);
}

async function assertBranchAccessible(req: any, branchId: string): Promise<void> {
    const companyId = req.user!.companyId;
    if (!isBranchAdmin(req) && !req.user!.branchIds.includes(branchId)) {
        throw AppError.forbidden('You do not have access to this branch');
    }
    const branch = await prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: { id: true },
    });
    if (!branch) throw AppError.badRequest('Invalid branch for this company');
}

function applyUserBranchScope(req: any, where: Record<string, any>): Record<string, any> {
    if (!isBranchAdmin(req)) {
        where.branchId = { in: req.user!.branchIds };
    }
    return where;
}

// GET /reports/sales
reportRoutes.get('/sales', async (req, res, next) => {
    try {
        const { branchId, dateFrom, dateTo } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId, status: { not: 'VOID' } });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) where.createdAt.lte = new Date(dateTo);
        }

        const [summary, invoices, byPaymentMethod] = await Promise.all([
            prisma.pOSInvoice.aggregate({
                where,
                _sum: { grandTotal: true, taxTotal: true, discountTotal: true, subtotal: true },
                _count: true,
            }),
            prisma.pOSInvoice.findMany({
                where,
                include: {
                    branch: { select: { name: true } },
                    customer: { select: { name: true } },
                    createdBy: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            }),
            prisma.pOSInvoice.groupBy({
                by: ['paymentMethod'],
                where,
                _sum: { grandTotal: true },
                _count: true,
            }),
        ]);

        sendSuccess(res, {
            summary: {
                totalSales: summary._sum.grandTotal || 0,
                totalTax: summary._sum.taxTotal || 0,
                totalDiscount: summary._sum.discountTotal || 0,
                invoiceCount: summary._count,
            },
            byPaymentMethod,
            invoices,
        });
    } catch (error) { next(error); }
});

// GET /reports/purchases
reportRoutes.get('/purchases', async (req, res, next) => {
    try {
        const { branchId, dateFrom, dateTo } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) where.createdAt.lte = new Date(dateTo);
        }

        const [summary, purchases] = await Promise.all([
            prisma.purchaseInvoice.aggregate({
                where,
                _sum: { grandTotal: true, taxTotal: true },
                _count: true,
            }),
            prisma.purchaseInvoice.findMany({
                where,
                include: {
                    supplier: { select: { name: true } },
                    branch: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            }),
        ]);

        sendSuccess(res, {
            summary: {
                totalPurchases: summary._sum.grandTotal || 0,
                totalTax: summary._sum.taxTotal || 0,
                invoiceCount: summary._count,
            },
            purchases,
        });
    } catch (error) { next(error); }
});

// GET /reports/stock
reportRoutes.get('/stock', async (req, res, next) => {
    try {
        const { branchId } = req.query as any;
        const companyId = req.user!.companyId;

        const where: any = applyUserBranchScope(req, { companyId, qtyOnHand: { gt: 0 } });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        }

        const stocks = await prisma.inventoryStock.findMany({
            where,
            include: {
                product: { select: { id: true, itemCode: true, name: true } },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { product: { name: 'asc' } },
        });

        // Calculate total valuation
        let totalValuation = 0;
        const enriched = stocks.map((s) => {
            const value = Number(s.qtyOnHand) * Number(s.avgCost);
            totalValuation += value;
            return { ...s, valuation: value };
        });

        sendSuccess(res, {
            summary: { totalItems: stocks.length, totalValuation },
            stocks: enriched,
        });
    } catch (error) { next(error); }
});

// GET /reports/warehouses — High-level summary of all warehouses stock
reportRoutes.get('/warehouses', async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const scopedStockWhere = applyUserBranchScope(req, { companyId, qtyOnHand: { gt: 0 } });

        const [stockGroups, branches, allStocks] = await Promise.all([
            prisma.inventoryStock.groupBy({
                by: ['branchId'],
                where: scopedStockWhere,
                _count: { productId: true },
                _sum: { qtyOnHand: true },
            }),
            prisma.branch.findMany({
                where: isBranchAdmin(req) ? { companyId } : { companyId, id: { in: req.user!.branchIds } },
                select: { id: true, name: true, code: true }
            }),
            prisma.inventoryStock.findMany({
                where: scopedStockWhere,
                select: { branchId: true, qtyOnHand: true, avgCost: true }
            })
        ]);

        const report = branches.map(b => {
            const group = stockGroups.find(g => g.branchId === b.id);
            const branchStocks = allStocks.filter(s => s.branchId === b.id);
            const valuation = branchStocks.reduce((sum, s) => sum + (Number(s.qtyOnHand) * Number(s.avgCost)), 0);

            return {
                id: b.id,
                name: b.name,
                code: b.code,
                itemCount: group?._count.productId || 0,
                totalQty: Number(group?._sum.qtyOnHand || 0),
                totalValuation: valuation
            };
        });

        sendSuccess(res, report);
    } catch (error) { next(error); }
});

// GET /reports/vat
reportRoutes.get('/vat', async (req, res, next) => {
    try {
        const { dateFrom, dateTo, branchId } = req.query as any;
        const companyId = req.user!.companyId;

        const dateFilter: any = {};
        if (dateFrom) dateFilter.gte = new Date(dateFrom);
        if (dateTo) dateFilter.lte = new Date(dateTo);

        const baseWhere: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            baseWhere.branchId = branchId;
        }

        const [salesTax, purchaseTax] = await Promise.all([
            prisma.pOSInvoice.aggregate({
                where: {
                    ...baseWhere,
                    status: { not: 'VOID' },
                    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
                },
                _sum: { taxTotal: true, grandTotal: true },
            }),
            prisma.purchaseInvoice.aggregate({
                where: {
                    ...baseWhere,
                    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
                },
                _sum: { taxTotal: true, grandTotal: true },
            }),
        ]);

        const outputVAT = Number(salesTax._sum.taxTotal || 0);
        const inputVAT = Number(purchaseTax._sum.taxTotal || 0);

        sendSuccess(res, {
            outputVAT,
            inputVAT,
            netVAT: outputVAT - inputVAT,
            totalSales: Number(salesTax._sum.grandTotal || 0),
            totalPurchases: Number(purchaseTax._sum.grandTotal || 0),
        });
    } catch (error) { next(error); }
});

// GET /reports/dashboard-consolidated
// One stop optimized analytical engine for the landing dashboard.
reportRoutes.get('/dashboard-consolidated', async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchId = req.query.branchId as string | undefined;
        const startDateParam = req.query.startDate as string | undefined;
        const endDateParam = req.query.endDate as string | undefined;

        const now = new Date();
        // Today is just for the "Today's Summary" card independently
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let filterStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        let filterEnd = new Date();
        filterEnd.setHours(23, 59, 59, 999);

        if (startDateParam) {
            filterStart = new Date(startDateParam);
            filterStart.setHours(0, 0, 0, 0);
        }
        if (endDateParam) {
            filterEnd = new Date(endDateParam);
            filterEnd.setHours(23, 59, 59, 999);
        }

        const dateFilter = { gte: filterStart, lte: filterEnd };

        const baseWhere: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            baseWhere.branchId = branchId;
        }

        // 1. Fetch data in parallel for speed
        const [
            todaySales,
            totalProducts,
            totalCustomers,
            lowStockCount,
            recentInvoices,
            financeAgg,
            salesRaw,
            purchasesRaw,
            inventoryAnalytics,
            branches,
            posSessionsRaw,
            allInvoicesForInsights,
            expensesRaw,
        ] = await Promise.all([
            // Summary Cards
            prisma.pOSInvoice.aggregate({
                where: { ...baseWhere, createdAt: { gte: today }, status: { not: 'VOID' } },
                _sum: { grandTotal: true },
                _count: true,
            }),
            prisma.product.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
            prisma.customer.count({ where: { companyId, deletedAt: null } }),
            prisma.inventoryStock.count({ where: { ...baseWhere, qtyOnHand: { lte: 10, gt: 0 } } }),
            prisma.pOSInvoice.findMany({
                where: { ...baseWhere },
                include: {
                    customer: { select: { name: true } },
                    createdBy: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
            // Consolidated Totals (Sales & Purchases)
            Promise.all([
                prisma.pOSInvoice.aggregate({ where: { ...baseWhere, createdAt: dateFilter, isPosted: true, status: { not: 'VOID' } }, _sum: { grandTotal: true, taxTotal: true } }),
                prisma.purchaseInvoice.aggregate({ where: { ...baseWhere, createdAt: dateFilter }, _sum: { grandTotal: true, taxTotal: true } })
            ]),
            // Sales Trend Data — include items count & tax for insights calculations
            prisma.pOSInvoice.findMany({
                where: { ...baseWhere, isPosted: true, status: { not: 'VOID' }, createdAt: dateFilter },
                select: {
                    createdAt: true, grandTotal: true, taxTotal: true,
                    paymentMethod: true, customerId: true,
                    customer: { select: { name: true } },
                    items: { select: { qty: true } },
                },
            }),
            // Purchases raw for trend + top suppliers
            prisma.purchaseInvoice.findMany({
                where: { ...baseWhere, createdAt: dateFilter },
                select: {
                    createdAt: true, grandTotal: true,
                    supplier: { select: { name: true } },
                    supplierId: true,
                },
            }),
            // Inventory Valuation
            prisma.inventoryStock.findMany({
                where: { ...baseWhere, qtyOnHand: { gt: 0 } },
                include: { product: { include: { category: { select: { name: true } } } } }
            }),
            prisma.branch.findMany({ where: { companyId }, select: { id: true, name: true, code: true } }),
            // POS Shifts for variance
            prisma.pOSShift.findMany({
                where: { companyId, createdAt: dateFilter },
                select: { variance: true },
            }),
            // ALL non-void invoices for AOV / Items-per-order / returning customers
            prisma.pOSInvoice.findMany({
                where: { ...baseWhere, createdAt: dateFilter, isPosted: true, status: { not: 'VOID' } },
                select: { grandTotal: true, customerId: true, items: { select: { qty: true } } },
            }),
            // Expenses
            prisma.expense.findMany({
                where: { companyId, createdAt: dateFilter },
                select: { amount: true, category: true, createdAt: true },
            }),
        ]);

        // 2. Post-process trend data
        const trendKeys: { key: string, label: string }[] = [];
        const diffDays = (filterEnd.getTime() - filterStart.getTime()) / (1000 * 3600 * 24);
        const formatKey = (d: Date) => diffDays <= 60
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        if (diffDays <= 60) {
            let limit = new Date(filterStart);
            limit.setHours(0, 0, 0, 0);
            const endLimit = new Date(filterEnd);
            endLimit.setHours(23, 59, 59, 999);
            while (limit <= endLimit) {
                trendKeys.push({
                    key: formatKey(limit),
                    label: limit.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                });
                limit.setDate(limit.getDate() + 1);
                limit.setHours(0, 0, 0, 0);
            }
        } else {
            let limit = new Date(filterStart.getFullYear(), filterStart.getMonth(), 1);
            const endLimit = new Date(filterEnd);
            while (limit <= endLimit) {
                trendKeys.push({
                    key: formatKey(limit),
                    label: limit.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                });
                limit.setMonth(limit.getMonth() + 1);
            }
        }

        const trendMap: Record<string, { month: string; net: number; tax: number; purchases: number; expenses: number }> = {};
        trendKeys.forEach(m => trendMap[m.key] = { month: m.label, net: 0, tax: 0, purchases: 0, expenses: 0 });

        const paymentMap: Record<string, number> = {};
        const customerMap: Record<string, { name: string; value: number }> = {};
        const hourMap: Record<string, number> = {};
        const dayMap: Record<string, number> = {};
        const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        salesRaw.forEach((inv: any) => {
            const d = new Date(inv.createdAt);
            const key = formatKey(d);
            const gt = Number(inv.grandTotal || 0);
            const tax = Number(inv.taxTotal || 0);

            if (trendMap[key]) {
                trendMap[key].net += gt;
                trendMap[key].tax += tax;
            }

            const method = inv.paymentMethod || 'OTHER';
            paymentMap[method] = (paymentMap[method] || 0) + gt;

            if (inv.customerId) {
                const cId = inv.customerId;
                if (!customerMap[cId]) customerMap[cId] = { name: inv.customer?.name || 'Unknown', value: 0 };
                customerMap[cId].value += gt;
            }

            // Sales by hour
            const hour = d.getHours();
            const hourLabel = `${String(hour).padStart(2, '0')}:00`;
            hourMap[hourLabel] = (hourMap[hourLabel] || 0) + gt;

            // Sales by day of week
            const dayLabel = DAY_NAMES[d.getDay()];
            dayMap[dayLabel] = (dayMap[dayLabel] || 0) + gt;
        });

        // Purchases trend + top suppliers
        const supplierMap: Record<string, { name: string; value: number }> = {};
        purchasesRaw.forEach((p: any) => {
            const d = new Date(p.createdAt);
            const key = formatKey(d);
            const gt = Number(p.grandTotal || 0);
            if (trendMap[key]) trendMap[key].purchases += gt;
            if (p.supplierId) {
                const sId = p.supplierId;
                if (!supplierMap[sId]) supplierMap[sId] = { name: p.supplier?.name || 'Unknown', value: 0 };
                supplierMap[sId].value += gt;
            }
        });

        // Expenses trend + categories
        const expenseCatMap: Record<string, number> = {};
        let totalExpenses = 0;
        expensesRaw.forEach((e: any) => {
            const d = new Date(e.createdAt);
            const key = formatKey(d);
            const amt = Number(e.amount || 0);
            if (trendMap[key]) trendMap[key].expenses += amt;
            const cat = e.category || 'Uncategorized';
            expenseCatMap[cat] = (expenseCatMap[cat] || 0) + amt;
            totalExpenses += amt;
        });

        // 3. Insights
        const totalInvoiceCount = allInvoicesForInsights.length;
        let totalGrandSum = 0;
        let totalItemLines = 0;
        const customerInvoiceCounts: Record<string, number> = {};

        allInvoicesForInsights.forEach((inv: any) => {
            totalGrandSum += Number(inv.grandTotal || 0);
            totalItemLines += (inv.items || []).reduce((sum: number, it: { qty: number | null }) => sum + Number(it.qty || 0), 0);
            if (inv.customerId) {
                customerInvoiceCounts[inv.customerId] = (customerInvoiceCounts[inv.customerId] || 0) + 1;
            }
        });

        const returningCustomers = Object.values(customerInvoiceCounts).filter(c => c > 1).length;
        const totalUniqueCustomers = Object.keys(customerInvoiceCounts).length;

        const posTotalVariance = posSessionsRaw.reduce(
            (sum: number, s: any) => sum + Number(s.variance || 0), 0
        );

        // 4. Post-process inventory data
        const catVal: Record<string, number> = {};
        let healthyCount = 0;
        let lowCount = 0;
        const productValMap = inventoryAnalytics.map((s: any) => {
            const val = Number(s.qtyOnHand) * Number(s.avgCost);
            const qty = Number(s.qtyOnHand);
            const catName = s.product?.category?.name || 'Uncategorized';
            catVal[catName] = (catVal[catName] || 0) + val;
            if (qty <= Number(s.minStock || 10)) lowCount++;
            else healthyCount++;
            return { name: s.product.name, value: val, qty };
        });

        const topByValue = [...productValMap].sort((a, b) => b.value - a.value).slice(0, 7);
        const topByQty = [...productValMap].sort((a, b) => b.qty - a.qty).slice(0, 7);

        // Sales by day — ordered Mon-Sun
        const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const salesByDayOfWeek = orderedDays.map(day => ({ day, total: dayMap[day] || 0 }));

        // Sales by hour — ordered 00:00 to 23:00
        const salesByHour = Array.from({ length: 24 }).map((_, h) => {
            const hourLabel = `${String(h).padStart(2, '0')}:00`;
            return { hour: hourLabel, total: hourMap[hourLabel] || 0 };
        });

        sendSuccess(res, {
            summary: {
                todaySales: { total: todaySales._sum.grandTotal || 0, count: todaySales._count },
                totalProducts,
                totalCustomers,
                lowStockCount,
                recentInvoices,
            },
            finance: {
                netSales: Number(financeAgg[0]._sum.grandTotal || 0),
                totalPurchases: Number(financeAgg[1]._sum.grandTotal || 0),
                outputVAT: Number(financeAgg[0]._sum.taxTotal || 0),
                inputVAT: Number(financeAgg[1]._sum.taxTotal || 0),
            },
            insights: {
                averageOrderValue: totalInvoiceCount > 0 ? totalGrandSum / totalInvoiceCount : 0,
                averageItemsPerOrder: totalInvoiceCount > 0 ? totalItemLines / totalInvoiceCount : 0,
                returningCustomersCount: returningCustomers,
                returningCustomerRate: totalUniqueCustomers > 0 ? (returningCustomers / totalUniqueCustomers) * 100 : 0,
                totalExpensesAllTime: totalExpenses,
                posTotalVariance,
            },
            salesTrend: trendKeys.map(m => trendMap[m.key]),
            paymentBreakdown: Object.entries(paymentMap).map(([method, total]) => ({ method, total })),
            topCustomers: Object.values(customerMap).sort((a, b) => b.value - a.value).slice(0, 6),
            topSuppliers: Object.values(supplierMap).sort((a, b) => b.value - a.value).slice(0, 6),
            expenseCategories: Object.entries(expenseCatMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            salesByDayOfWeek,
            salesByHour,
            inventory: {
                categoryValuation: Object.entries(catVal).map(([name, value]) => ({ name, value })),
                topByValue,
                topByQty,
                health: [
                    { name: 'Healthy', value: healthyCount },
                    { name: 'Low Stock', value: lowCount },
                ],
            },
        });
    } catch (error) { next(error); }
});

// GET /reports/dashboard (Legacy support)
reportRoutes.get('/dashboard', async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const branchId = req.query.branchId as string | undefined;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const baseWhere: any = applyUserBranchScope(req, { companyId });
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            baseWhere.branchId = branchId;
        }

        const [
            todaySales,
            totalProducts,
            totalCustomers,
            lowStockCount,
            expiryAlertCount,
            recentInvoices,
        ] = await Promise.all([
            prisma.pOSInvoice.aggregate({
                where: { ...baseWhere, createdAt: { gte: today }, status: { not: 'VOID' } },
                _sum: { grandTotal: true },
                _count: true,
            }),
            prisma.product.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
            prisma.customer.count({ where: { companyId, deletedAt: null } }),
            prisma.inventoryStock.count({ where: { ...baseWhere, qtyOnHand: { lte: 10, gt: 0 } } }),
            Promise.resolve(0), // expiry tracking removed
            prisma.pOSInvoice.findMany({
                where: { ...baseWhere },
                include: {
                    customer: { select: { name: true } },
                    createdBy: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
        ]);

        sendSuccess(res, {
            todaySales: {
                total: todaySales._sum.grandTotal || 0,
                count: todaySales._count,
            },
            totalProducts,
            totalCustomers,
            lowStockCount,
            expiryAlertCount,
            recentInvoices,
        });
    } catch (error) { next(error); }
});
