import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

import { tenantStorage } from './tenantContext.js';

// Pool configuration is set via the DATABASE_URL connection string.
// Production: maxPoolSize=50, minPoolSize=5 (see .env.production).
// Development: uses MongoDB driver defaults (maxPoolSize=100).
export const basePrisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: env.NODE_ENV === 'development'
            ? [
                { emit: 'event', level: 'query' },
                { emit: 'stdout', level: 'error' },
                { emit: 'stdout', level: 'warn' },
            ]
            : [{ emit: 'stdout', level: 'error' }],
        transactionOptions: {
            maxWait: 15000,  // Max time to acquire a connection (15s — increased for high concurrency)
            timeout: 60000,  // Max transaction execution time (60s)
        },
    });

// ────────────── Audit Log Batcher ──────────────
// Batches fire-and-forget audit writes to reduce DB connection pressure.
const AUDIT_FLUSH_INTERVAL_MS = 500;
const AUDIT_MAX_BATCH_SIZE = 50;
let auditBuffer: Array<{
    companyId: string;
    userId: string;
    branchId?: string;
    action: string;
    entity: string;
    entityId?: string;
    after?: any;
    before?: any;
}> = [];
let auditFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushAuditBuffer() {
    if (auditBuffer.length === 0) return;
    const batch = auditBuffer.splice(0);
    auditFlushTimer = null;

    basePrisma.auditLog.createMany({ data: batch as any[] })
        .catch(err => logger.error(`Audit batch write failed (${batch.length} entries):`, err));
}

/**
 * Drains any pending audit logs and returns a Promise that resolves when the
 * write completes. Call during graceful shutdown to avoid losing audit entries.
 */
export async function flushAuditLogsAndWait(): Promise<void> {
    if (auditFlushTimer) {
        clearTimeout(auditFlushTimer);
        auditFlushTimer = null;
    }
    if (auditBuffer.length === 0) return;

    const batch = auditBuffer.splice(0);
    try {
        await basePrisma.auditLog.createMany({ data: batch as any[] });
        logger.info(`Flushed ${batch.length} audit log entries on shutdown`);
    } catch (err) {
        logger.error(`Audit log flush failed during shutdown (${batch.length} entries):`, err);
    }
}

function enqueueAuditLog(entry: typeof auditBuffer[0]) {
    auditBuffer.push(entry);
    if (auditBuffer.length >= AUDIT_MAX_BATCH_SIZE) {
        if (auditFlushTimer) { clearTimeout(auditFlushTimer); auditFlushTimer = null; }
        flushAuditBuffer();
    } else if (!auditFlushTimer) {
        auditFlushTimer = setTimeout(flushAuditBuffer, AUDIT_FLUSH_INTERVAL_MS);
    }
}

function attachAuditMetadata(payload: unknown, metadata?: {
    sessionId: string;
    actorUserId: string;
    actorEmail: string;
    actorName: string;
    reason: string;
    startedAt: string;
}) {
    if (!metadata) return payload;

    const supportSession = {
        sessionId: metadata.sessionId,
        actorUserId: metadata.actorUserId,
        actorEmail: metadata.actorEmail,
        actorName: metadata.actorName,
        reason: metadata.reason,
        startedAt: metadata.startedAt,
    };

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            value: payload ?? null,
            __supportSession: supportSession,
        };
    }

    return {
        ...(payload as Record<string, unknown>),
        __supportSession: supportSession,
    };
}

/**
 * Industry-Grade Multi-Tenant Extension
 * Intercepts every query to enforce companyId isolation.
 */
export const prisma = basePrisma.$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                const companyId = tenantStorage.getStore()?.companyId;
                const companyScopedModels = new Set([
                    // Core
                    'Branch', 'Role', 'User', 'Customer', 'Supplier',
                    // Product Catalog
                    'Category', 'ItemGroup', 'Brand', 'UnitMaster', 'Product', 'Tax', 'PriceGroup',
                    // Inventory
                    'InventoryStock', 'StockMovement', 'StockCount',
                    // POS
                    'POSInvoice', 'POSTerminal', 'POSShift',
                    // Sales
                    'SalesReturn', 'SalesQuotation', 'SalesOrder',
                    // Purchase
                    'PurchaseInvoice', 'PurchaseReturn', 'PurchasePayment', 'PurchaseOrder',
                    // Inventory Transfers
                    'Transfer',
                    // Cash Collection
                    'CashCollectionRun', 'CashCollectionBag', 'CashBankDeposit', 'CashCollectionEvent',
                    // Accounting
                    'Account', 'AccountMapping', 'JournalEntry', 'Expense', 'PeriodClose',
                    // Loyalty
                    'LoyaltyCustomer', 'LoyaltyPointHistory',
                    // HR
                    'Department', 'Position', 'Employee',
                    // Banking
                    'BankAccount', 'BankTransaction', 'BankReconciliation', 'BankStatementImport',
                    // Services & Expenses
                    'ExpensePurchase', 'ServiceMaster',
                    // Payroll
                    'PayrollPayment',
                    // Production
                    'Bom', 'ProductionOrder', 'ProductionMaterialConsumption', 'ProductionCompletion',
                    // System
                    'AuditLog', 'GlobalString', 'DocumentCounter',
                ]);
                const isCompanyScoped = companyScopedModels.has(model);

                // If no companyId in context (e.g., public routes or startup), proceed normally
                if (!companyId || model === 'Company') {
                    return query(args);
                }

                // Models that support Soft Delete
                const softDeleteModels = ['Product', 'Customer', 'Supplier'];

                // ── Fast path: findUnique on company-scoped models ──
                // Instead of degrading to findFirst (which loses _id index),
                // we let findUnique execute using MongoDB's fast _id lookup,
                // then validate tenant ownership post-fetch.
                if (operation === 'findUnique' && isCompanyScoped) {
                    const result = await query(args);
                    if (result) {
                        const r = result as any;
                        // Tenant isolation check
                        if (r.companyId && r.companyId !== companyId) return null;
                        // Soft delete check
                        if (softDeleteModels.includes(model) && r.deletedAt) return null;
                    }
                    return result;
                }

                // 1. Automatic Filtering for Read/Update/Delete operations
                if ([
                    'findFirst', 'findMany', 'count', 'aggregate', 'groupBy',
                    'update', 'updateMany', 'upsert', 'delete', 'deleteMany'
                ].includes(operation)) {
                    const typedArgs = (args as any);
                    if (isCompanyScoped) {
                        typedArgs.where = { ...typedArgs.where, companyId };
                    }

                    // 1b. Automatic Soft Delete filtering
                    if (softDeleteModels.includes(model)) {
                        typedArgs.where = {
                            ...typedArgs.where,
                            deletedAt: { isSet: false }
                        };
                    }
                }

                // 2. Automatic Assignment for Create operations
                if ((operation === 'create' || operation === 'createMany') && isCompanyScoped) {
                    const typedArgs = (args as any);
                    if (Array.isArray(typedArgs.data)) {
                        typedArgs.data = typedArgs.data.map((d: any) => ({ ...d, companyId }));
                    } else {
                        typedArgs.data = { ...typedArgs.data, companyId };
                    }
                }

                // 3. Execute query
                const result = await query(args);

                // 4. Batched Automatic Auditing
                const changeOperations = ['create', 'update', 'delete', 'updateMany', 'deleteMany', 'upsert'];
                if (changeOperations.includes(operation) && model !== 'AuditLog') {
                    const tenant = tenantStorage.getStore();
                    const auditData: any = {
                        companyId,
                        userId: tenant?.userId || 'SYSTEM',
                        branchId: tenant?.activeBranchId,
                        action: operation.toUpperCase(),
                        entity: model,
                        entityId: (result as any)?.id || undefined,
                        after: attachAuditMetadata(result as any, tenant?.impersonation),
                        ipAddress: tenant?.ipAddress || null,
                        userAgent: tenant?.userAgent || null,
                    };

                    // Capture `before` state for updates and deletes
                    if ((operation === 'update' || operation === 'delete' || operation === 'updateMany' || operation === 'deleteMany') && args?.where) {
                        // For automatic filtering, the original where clause has companyId injected
                        // We can't easily fetch the old record here without performance impact
                        // The `before` field will be populated by manual audit writes in route handlers
                    }

                    enqueueAuditLog(auditData);
                }

                return result;
            }
        }
    }
});

// Slow query logging — enabled in all environments for visibility.
// Development: 100ms threshold (verbose). Production: 250ms threshold (signal only).
const SLOW_QUERY_THRESHOLD_MS = env.NODE_ENV === 'development' ? 100 : 250;
(basePrisma as any).$on('query', (e: any) => {
    if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
        const level = env.NODE_ENV === 'development' ? 'warn' : 'warn';
        logger.log(level, `Slow query (${e.duration}ms): ${e.query}`);
    }
});

// Graceful shutdown — drain audit logs and disconnect Prisma
async function gracefulShutdown() {
    await flushAuditLogsAndWait();
    await basePrisma.$disconnect();
}
if (env.NODE_ENV === 'production') {
    process.on('beforeExit', gracefulShutdown);
    process.on('SIGTERM', () => { gracefulShutdown().then(() => process.exit(0)); });
    process.on('SIGINT', () => { gracefulShutdown().then(() => process.exit(0)); });
}

if (env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = basePrisma;
}
