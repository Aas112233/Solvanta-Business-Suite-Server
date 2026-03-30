import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { PERMISSIONS } from '../../config/permissions.js';

export const agingRoutes = Router();
agingRoutes.use(authenticate);

const ADMIN_BRANCH_PERMISSION = PERMISSIONS.ADMIN_MANAGE_BRANCHES;

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(ADMIN_BRANCH_PERMISSION);
}

function applyUserBranchScope(req: any, where: Record<string, any>): Record<string, any> {
    if (!isBranchAdmin(req)) {
        where.branchId = { in: req.user!.branchIds };
    }
    return where;
}

// ═══════════════════════════════════════════════════════════════
// ACCOUNTS RECEIVABLE (AR) AGING
// ═══════════════════════════════════════════════════════════════

// GET /aging/ar - AR Aging Summary
agingRoutes.get('/ar', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const { asOfDate, customerId, branchId } = req.query as any;
        const companyId = req.user!.companyId;
        const referenceDate = asOfDate ? new Date(asOfDate) : new Date();
        
        // Build invoice query
        const invoiceWhere: any = applyUserBranchScope(req, {
            companyId,
            status: { in: ['CREDIT', 'PARTIAL'] },
            isPosted: true,
            createdAt: { lte: referenceDate }
        });

        if (customerId) invoiceWhere.customerId = customerId;
        if (branchId) invoiceWhere.branchId = branchId;

        // Get all unpaid/receivable invoices
        const receivables = await prisma.pOSInvoice.findMany({
            where: invoiceWhere,
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        customerCode: true,
                        creditLimit: true,
                        phone: true,
                        email: true
                    }
                },
                branch: { select: { name: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Calculate aging buckets for each invoice
        const agingBuckets = {
            current: 0,      // 0-30 days
            days31to60: 0,   // 31-60 days
            days61to90: 0,   // 61-90 days
            over90: 0,       // 90+ days
            total: 0
        };

        const customerAging = new Map();

        receivables.forEach((invoice: any) => {
            const daysOld = Math.floor(
                (referenceDate.getTime() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            );

            const balance = invoice.grandTotal;
            if (balance <= 0) return;

            // Add to buckets
            if (daysOld <= 30) agingBuckets.current += balance;
            else if (daysOld <= 60) agingBuckets.days31to60 += balance;
            else if (daysOld <= 90) agingBuckets.days61to90 += balance;
            else agingBuckets.over90 += balance;
            agingBuckets.total += balance;

            // Group by customer
            const customer = invoice.customer;
            if (!customerAging.has(customer.id)) {
                customerAging.set(customer.id, {
                    customer,
                    current: 0,
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    total: 0,
                    invoices: []
                });
            }

            const custAging = customerAging.get(customer.id);
            if (daysOld <= 30) custAging.current += balance;
            else if (daysOld <= 60) custAging.days31to60 += balance;
            else if (daysOld <= 90) custAging.days61to90 += balance;
            else custAging.over90 += balance;
            custAging.total += balance;
            custAging.invoices.push({
                id: invoice.id,
                invoiceNo: invoice.invoiceNo,
                date: invoice.createdAt,
                dueDate: invoice.dueDate,
                daysOld,
                total: invoice.grandTotal,
                paid: 0,
                balance,
                status: invoice.status
            });
        });

        // Sort customers by total balance (highest first)
        const sortedCustomerAging = Array.from(customerAging.values())
            .sort((a: any, b: any) => b.total - a.total);

        sendSuccess(res, {
            summary: agingBuckets,
            asOfDate: referenceDate,
            totalCustomers: sortedCustomerAging.length,
            customers: sortedCustomerAging
        });
    } catch (error) { next(error); }
});

// GET /aging/ar/:customerId - Customer AR Detail
agingRoutes.get('/ar/:customerId', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const customerId = req.params.customerId as string;
        const { asOfDate } = req.query as any;
        const companyId = req.user!.companyId;
        const referenceDate = asOfDate ? new Date(asOfDate) : new Date();

        // Verify customer belongs to company
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, companyId },
            select: {
                id: true,
                name: true,
                customerCode: true,
                creditLimit: true,
                openingBalance: true,
                phone: true,
                email: true,
                address: true
            }
        });

        if (!customer) {
            throw AppError.notFound('Customer not found');
        }

        // Get unpaid invoices
        const invoices = await prisma.pOSInvoice.findMany({
            where: {
                companyId,
                customerId,
                status: { in: ['CREDIT', 'PARTIAL'] },
                isPosted: true,
                createdAt: { lte: referenceDate }
            },
            include: {
                branch: { select: { name: true } },
                items: {
                    select: {
                        product: { select: { name: true } },
                        qty: true,
                        unitPrice: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Calculate aging
        const aging = {
            current: 0,
            days31to60: 0,
            days61to90: 0,
            over90: 0,
            total: 0,
            invoices: [] as any[]
        };

        invoices.forEach((invoice: any) => {
            const daysOld = Math.floor(
                (referenceDate.getTime() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            const balance = invoice.grandTotal;
            
            if (balance > 0) {
                if (daysOld <= 30) aging.current += balance;
                else if (daysOld <= 60) aging.days31to60 += balance;
                else if (daysOld <= 90) aging.days61to90 += balance;
                else aging.over90 += balance;
                aging.total += balance;

                aging.invoices.push({
                    id: invoice.id,
                    invoiceNo: invoice.invoiceNo,
                    date: invoice.createdAt,
                    dueDate: invoice.dueDate,
                    daysOld,
                    total: invoice.grandTotal,
                    paid: 0,
                    balance,
                    status: invoice.status,
                    branch: invoice.branch
                });
            }
        });

        // Calculate credit utilization
        const creditUtilization = customer.creditLimit > 0 
            ? (aging.total / customer.creditLimit) * 100 
            : 0;

        sendSuccess(res, {
            customer,
            aging,
            creditUtilization: Math.round(creditUtilization * 100) / 100,
            availableCredit: Math.max(0, customer.creditLimit - aging.total),
            asOfDate: referenceDate
        });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════
// ACCOUNTS PAYABLE (AP) AGING
// ═══════════════════════════════════════════════════════════════

// GET /aging/ap - AP Aging Summary
agingRoutes.get('/ap', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const { asOfDate, supplierId, branchId } = req.query as any;
        const companyId = req.user!.companyId;
        const referenceDate = asOfDate ? new Date(asOfDate) : new Date();
        
        // Build invoice query
        const invoiceWhere: any = applyUserBranchScope(req, {
            companyId,
            status: { in: ['RECEIVED', 'PARTIAL', 'DRAFT'] },
            createdAt: { lte: referenceDate }
        });

        if (supplierId) invoiceWhere.supplierId = supplierId;
        if (branchId) invoiceWhere.branchId = branchId;

        // Get all unpaid/payable purchase invoices
        const payables = await prisma.purchaseInvoice.findMany({
            where: invoiceWhere,
            include: {
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        supplierCode: true,
                        phone: true
                    }
                },
                branch: { select: { name: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Calculate aging buckets
        const agingBuckets = {
            current: 0,      // 0-30 days
            days31to60: 0,   // 31-60 days
            days61to90: 0,   // 61-90 days
            over90: 0,       // 90+ days
            total: 0
        };

        const supplierAging = new Map();

        payables.forEach((invoice: any) => {
            const daysOld = Math.floor(
                (referenceDate.getTime() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            );

            const balance = invoice.grandTotal;
            if (balance <= 0) return;

            // Add to buckets
            if (daysOld <= 30) agingBuckets.current += balance;
            else if (daysOld <= 60) agingBuckets.days31to60 += balance;
            else if (daysOld <= 90) agingBuckets.days61to90 += balance;
            else agingBuckets.over90 += balance;
            agingBuckets.total += balance;

            // Group by supplier
            const supplier = invoice.supplier;
            if (!supplierAging.has(supplier.id)) {
                supplierAging.set(supplier.id, {
                    supplier,
                    current: 0,
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    total: 0,
                    invoices: []
                });
            }

            const supAging = supplierAging.get(supplier.id);
            if (daysOld <= 30) supAging.current += balance;
            else if (daysOld <= 60) supAging.days31to60 += balance;
            else if (daysOld <= 90) supAging.days61to90 += balance;
            else supAging.over90 += balance;
            supAging.total += balance;
            supAging.invoices.push({
                id: invoice.id,
                invoiceNo: invoice.invoiceNo,
                date: invoice.createdAt,
                dueDate: invoice.dueDate,
                daysOld,
                total: invoice.grandTotal,
                paid: 0,
                balance,
                status: invoice.status
            });
        });

        // Sort suppliers by total balance (highest first)
        const sortedSupplierAging = Array.from(supplierAging.values())
            .sort((a: any, b: any) => b.total - a.total);

        sendSuccess(res, {
            summary: agingBuckets,
            asOfDate: referenceDate,
            totalSuppliers: sortedSupplierAging.length,
            suppliers: sortedSupplierAging
        });
    } catch (error) { next(error); }
});

// GET /aging/ap/:supplierId - Supplier AP Detail
agingRoutes.get('/ap/:supplierId', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const supplierId = req.params.supplierId as string;
        const { asOfDate } = req.query as any;
        const companyId = req.user!.companyId;
        const referenceDate = asOfDate ? new Date(asOfDate) : new Date();

        // Verify supplier belongs to company
        const supplier = await prisma.supplier.findFirst({
            where: { id: supplierId, companyId },
            select: {
                id: true,
                name: true,
                supplierCode: true,
                openingBalance: true,
                phone: true,
                address: true
            }
        });

        if (!supplier) {
            throw AppError.notFound('Supplier not found');
        }

        // Get unpaid purchase invoices
        const invoices = await prisma.purchaseInvoice.findMany({
            where: {
                companyId,
                supplierId,
                status: { in: ['RECEIVED', 'PARTIAL', 'DRAFT'] },
                createdAt: { lte: referenceDate }
            },
            include: {
                branch: { select: { name: true } },
                items: {
                    select: {
                        product: { select: { name: true } },
                        qty: true,
                        unitCost: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Calculate aging
        const aging = {
            current: 0,
            days31to60: 0,
            days61to90: 0,
            over90: 0,
            total: 0,
            invoices: [] as any[]
        };

        invoices.forEach((invoice: any) => {
            const daysOld = Math.floor(
                (referenceDate.getTime() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            const balance = invoice.grandTotal;
            
            if (balance > 0) {
                if (daysOld <= 30) aging.current += balance;
                else if (daysOld <= 60) aging.days31to60 += balance;
                else if (daysOld <= 90) aging.days61to90 += balance;
                else aging.over90 += balance;
                aging.total += balance;

                aging.invoices.push({
                    id: invoice.id,
                    invoiceNo: invoice.invoiceNo,
                    date: invoice.createdAt,
                    dueDate: invoice.dueDate,
                    daysOld,
                    total: invoice.grandTotal,
                    paid: 0,
                    balance,
                    status: invoice.status,
                    branch: invoice.branch
                });
            }
        });

        sendSuccess(res, {
            supplier,
            aging,
            asOfDate: referenceDate
        });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════
// STATEMENTS
// ═══════════════════════════════════════════════════════════════

// GET /aging/statements/customer/:customerId - Generate customer statement
agingRoutes.get('/statements/customer/:customerId', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const customerId = req.params.customerId as string;
        const { startDate, endDate } = req.query as any;
        const companyId = req.user!.companyId;

        const customer = await prisma.customer.findFirst({
            where: { id: customerId, companyId },
            select: {
                id: true,
                name: true,
                customerCode: true,
                address: true,
                phone: true,
                email: true,
                openingBalance: true,
                creditLimit: true
            }
        });

        if (!customer) {
            throw AppError.notFound('Customer not found');
        }

        // Get transactions (invoices and payments) in date range
        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.lte = end;
        }

        const invoices = await prisma.pOSInvoice.findMany({
            where: {
                companyId,
                customerId,
                createdAt: dateFilter,
                isPosted: true,
                status: { not: 'VOID' }
            },
            select: {
                id: true,
                invoiceNo: true,
                createdAt: true,
                grandTotal: true,
                status: true
            },
            orderBy: { createdAt: 'asc' }
        });

        // Create statement transactions from invoices
        const transactions = invoices.map((inv: any) => ({
            date: inv.createdAt,
            type: 'INVOICE',
            reference: inv.invoiceNo,
            debit: inv.grandTotal,
            credit: 0,
            balance: 0 // Will calculate
        }));

        // Calculate running balance
        let runningBalance = customer.openingBalance || 0;
        const statementTransactions = transactions.map((tx: any) => {
            runningBalance += tx.debit - tx.credit;
            return { ...tx, balance: runningBalance };
        });

        // Get current outstanding
        const outstanding = await prisma.pOSInvoice.aggregate({
            where: {
                companyId,
                customerId,
                status: { in: ['CREDIT', 'PARTIAL'] }
            },
            _sum: {
                grandTotal: true
            }
        });

        sendSuccess(res, {
            customer,
            statement: {
                startDate: startDate || null,
                endDate: endDate || null,
                openingBalance: customer.openingBalance || 0,
                transactions: statementTransactions,
                closingBalance: runningBalance,
                currentOutstanding: outstanding._sum.grandTotal || 0
            }
        });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════
// DASHBOARD / SUMMARY
// ═══════════════════════════════════════════════════════════════

// GET /aging/summary - Combined AR/AP summary for dashboard
agingRoutes.get('/summary', requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const referenceDate = new Date();

        const [arResult, apResult] = await Promise.all([
            // AR Summary
            prisma.pOSInvoice.aggregate({
                where: {
                    companyId,
                    status: { in: ['CREDIT', 'PARTIAL'] },
                    isPosted: true
                },
                _sum: { grandTotal: true },
                _count: true
            }),
            // AP Summary  
            prisma.purchaseInvoice.aggregate({
                where: {
                    companyId,
                    status: { in: ['RECEIVED', 'PARTIAL'] }
                },
                _sum: { grandTotal: true },
                _count: true
            })
        ]);

        const arTotal = arResult._sum.grandTotal || 0;
        const apTotal = apResult._sum.grandTotal || 0;

        sendSuccess(res, {
            ar: {
                totalReceivable: arTotal,
                invoiceCount: arResult._count,
                netPosition: arTotal - apTotal
            },
            ap: {
                totalPayable: apTotal,
                invoiceCount: apResult._count
            },
            asOfDate: referenceDate
        });
    } catch (error) { next(error); }
});
