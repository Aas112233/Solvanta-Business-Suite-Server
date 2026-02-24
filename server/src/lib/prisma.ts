import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

import { tenantStorage } from './tenantContext.js';

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
    });

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
                    'Branch', 'Role', 'User', 'Customer', 'Supplier', 'Category', 'ItemGroup', 'Brand',
                    'UnitMaster', 'Product', 'PriceGroup', 'InventoryStock', 'StockMovement', 'POSInvoice', 'SalesReturn',
                    'PurchaseInvoice', 'PurchaseReturn', 'PurchasePayment', 'Transfer', 'StockCount',
                    'SalesOrder', 'SalesOrderItem',
                    'Account', 'JournalEntry', 'Expense', 'PeriodClose', 'AuditLog', 'GlobalString',
                    'DocumentCounter'
                ]);
                const isCompanyScoped = companyScopedModels.has(model);

                // If no companyId in context (e.g., public routes or startup), proceed normally
                // Models like Company or internal system tables can be exempted here if needed.
                if (!companyId || model === 'Company') {
                    return query(args);
                }

                // Models that support Soft Delete
                const softDeleteModels = ['Product', 'Customer', 'Supplier'];

                // 1. Automatic Filtering for Read/Update/Delete operations
                if ([
                    'findFirst', 'findMany', 'findUnique', 'count', 'aggregate', 'groupBy',
                    'update', 'updateMany', 'upsert', 'delete', 'deleteMany'
                ].includes(operation)) {
                    const typedArgs = (args as any);
                    if (isCompanyScoped) {
                        typedArgs.where = { ...typedArgs.where, companyId };
                    }

                    // Prisma findUnique requires exactly one unique field. 
                    // Adding companyId makes it a non-unique query from Prisma's perspective.
                    // We change it to findFirst to maintain the filter while satisfying Prisma.
                    if (operation === 'findUnique' && isCompanyScoped) {
                        (operation as any) = 'findFirst';
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

                // 4. Industry-Grade Automatic Auditing
                // Triggered for change operations, excluding the AuditLog table itself
                const changeOperations = ['create', 'update', 'delete', 'updateMany', 'deleteMany', 'upsert'];
                if (changeOperations.includes(operation) && model !== 'AuditLog') {
                    const tenant = tenantStorage.getStore();

                    // Simple automated audit log (fire-and-forget for performance)
                    basePrisma.auditLog.create({
                        data: {
                            companyId,
                            userId: tenant?.userId || 'SYSTEM',
                            branchId: tenant?.activeBranchId,
                            action: operation.toUpperCase(),
                            entity: model,
                            entityId: (result as any)?.id || undefined,
                            after: result as any, // Captures final state
                        }
                    }).catch(err => logger.error(`Auto-Audit failed for ${model}:`, err));
                }

                return result;
            }
        }
    }
});

if (env.NODE_ENV === 'development') {
    (basePrisma as any).$on('query', (e: any) => {
        if (e.duration > 100) {
            logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
    });
}

if (env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = basePrisma;
}
