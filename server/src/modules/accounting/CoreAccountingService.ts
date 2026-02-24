import { PrismaClient, AccountMappingType, AccountEntityType } from '@prisma/client';
import { AppError } from '../../utils/AppError';

// Define the context object used for resolution
export interface AccountingResolutionContext {
    companyId: string;
    branchId?: string;
    productId?: string;
    categoryId?: string;
    customerId?: string;
    supplierId?: string;
}

export class CoreAccountingService {
    /**
     * Resolves an account ID based on the mapping type and a hierarchical fallback context.
     * Order of resolution:
     * 1. Product specific mapping (if applicable)
     * 2. Category specific mapping (if applicable)
     * 3. Customer/Supplier specific mapping (if applicable)
     * 4. Branch specific mapping
     * 5. Global default mapping
     * 
     * @param tx The Prisma Transaction
     * @param mappingType The type of account we need (e.g. 'SALES_REVENUE', 'INVENTORY_ASSET')
     * @param context The situational context (what product, what branch, etc)
     * @returns The resolved account ID, or null if not found
     */
    static async resolveAccount(
        tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
        mappingType: AccountMappingType,
        context: AccountingResolutionContext
    ): Promise<string | null> {

        // Load all mappings of this type for the company at once to do in-memory resolution (faster if cached, but OK for now)
        // Or we can just query the DB with an IN clause for the possible targets and sort in memory.
        const possibleTargets: { type: AccountEntityType, id: string | null }[] = [
            { type: 'GLOBAL', id: null }
        ];

        if (context.branchId) possibleTargets.push({ type: 'BRANCH', id: context.branchId });
        if (context.categoryId) possibleTargets.push({ type: 'CATEGORY', id: context.categoryId });
        if (context.productId) possibleTargets.push({ type: 'PRODUCT', id: context.productId });
        if (context.customerId) possibleTargets.push({ type: 'CUSTOMER', id: context.customerId });
        if (context.supplierId) possibleTargets.push({ type: 'SUPPLIER', id: context.supplierId });

        const mappings = await tx.accountMapping.findMany({
            where: {
                companyId: context.companyId,
                mappingType: mappingType,
                OR: possibleTargets.map(t => {
                    const condition: any = { entityType: t.type };
                    if (t.id) condition.entityId = t.id;
                    return condition;
                })
            }
        });

        if (mappings.length === 0) return null;

        // Define Priority (lower number = higher priority)
        const priorityScore = (type: AccountEntityType): number => {
            switch (type) {
                case 'PRODUCT': return 1;
                case 'CUSTOMER': return 2;
                case 'SUPPLIER': return 2;
                case 'CATEGORY': return 3;
                case 'BRANCH': return 4;
                case 'GLOBAL': return 5;
                default: return 99;
            }
        };

        mappings.sort((a, b) => priorityScore(a.entityType as AccountEntityType) - priorityScore(b.entityType as AccountEntityType));

        return mappings[0]?.accountId || null;
    }

    /**
     * Resolves an account ID and throws a standard error if it is not configured.
     * Prevents transactions from silently failing to post to the GL.
     */
    static async resolveAccountOrFail(
        tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
        mappingType: AccountMappingType,
        context: AccountingResolutionContext
    ): Promise<string> {
        const accountId = await this.resolveAccount(tx, mappingType, context);
        if (!accountId) {
            throw AppError.badRequest(`Missing Account Mapping for ${mappingType}. Please configure it in Accounting Settings.`);
        }
        return accountId;
    }

    // ============================================================================
    // BUSINESS EVENTS
    // ============================================================================

    /**
     * Records a POS configuration of a sale into the ledger.
     * Dr Cash/Bank/AR
     * Cr Sales Revenue
     * Cr Output Tax
     * Dr COGS
     * Cr Inventory Asset
     */
    static async recordPOSSale(
        tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
        invoice: {
            id: string;
            companyId: string;
            branchId: string;
            invoiceNo: string;
            customerId?: string | null;
            paymentMethod: string;
            subtotal: number;
            taxTotal: number;
            grandTotal: number;
            createdById: string;
            createdAt: Date;
            items: {
                productId: string;
                qty: number;
                unitPrice: number;
                lineTotal: number;
                taxAmount: number;
                cost: number; // We must pass the calculated cost of the items sold
            }[];
        }
    ) {
        const ctxGlobal: AccountingResolutionContext = { companyId: invoice.companyId, branchId: invoice.branchId };

        let paymentAcctId: string;
        if (invoice.paymentMethod === 'CASH') {
            paymentAcctId = await this.resolveAccountOrFail(tx, 'CASH', ctxGlobal);
        } else if (invoice.paymentMethod === 'CARD' || invoice.paymentMethod === 'MIXED') {
            paymentAcctId = await this.resolveAccountOrFail(tx, 'BANK', ctxGlobal); // Simplifying mixed for now
        } else if (invoice.paymentMethod === 'CREDIT') {
            paymentAcctId = await this.resolveAccountOrFail(tx, 'ACCOUNT_RECEIVABLE', { ...ctxGlobal, customerId: invoice.customerId || undefined });
        } else {
            paymentAcctId = await this.resolveAccountOrFail(tx, 'BANK', ctxGlobal);
        }

        const outputTaxAcctId = invoice.taxTotal > 0 ? await this.resolveAccountOrFail(tx, 'OUTPUT_TAX', ctxGlobal) : null;

        const lines: { accountId: string; debit: number; credit: number; partyId?: string; partyType?: 'CUSTOMER' | 'SUPPLIER' }[] = [];

        // Debit Total Payment (Cash/AR)
        lines.push({
            accountId: paymentAcctId,
            debit: invoice.grandTotal,
            credit: 0,
            ...(invoice.paymentMethod === 'CREDIT' ? { partyType: 'CUSTOMER', partyId: invoice.customerId || undefined } : {})
        });

        // Credit Tax
        if (outputTaxAcctId && invoice.taxTotal > 0) {
            lines.push({ accountId: outputTaxAcctId, debit: 0, credit: invoice.taxTotal });
        }

        // Process Items for Revenue, COGS, Inventory
        // Group by account to minimize journal lines
        const revenueMap = new Map<string, number>();
        const inventoryMap = new Map<string, number>();
        const cogsMap = new Map<string, number>();

        for (const item of invoice.items) {
            const ctxProduct: AccountingResolutionContext = { ...ctxGlobal, productId: item.productId };

            // Look up product category to inject into context
            const product = await tx.product.findUnique({ where: { id: item.productId }, select: { categoryId: true } });
            if (product?.categoryId) ctxProduct.categoryId = product.categoryId;

            const revenueAcctId = await this.resolveAccountOrFail(tx, 'SALES_REVENUE', ctxProduct);
            const invAcctId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
            const cogsAcctId = await this.resolveAccountOrFail(tx, 'COGS_EXPENSE', ctxProduct);

            revenueMap.set(revenueAcctId, (revenueMap.get(revenueAcctId) || 0) + item.lineTotal);

            const totalCost = item.cost * item.qty;
            if (totalCost > 0) {
                inventoryMap.set(invAcctId, (inventoryMap.get(invAcctId) || 0) + totalCost);
                cogsMap.set(cogsAcctId, (cogsMap.get(cogsAcctId) || 0) + totalCost);
            }
        }

        // Add Revenue lines
        for (const [acctId, amt] of revenueMap.entries()) {
            lines.push({ accountId: acctId, debit: 0, credit: amt });
        }

        // Add COGS & Inventory lines
        for (const [acctId, amt] of cogsMap.entries()) {
            lines.push({ accountId: acctId, debit: amt, credit: 0 }); // Dr COGS
        }
        for (const [acctId, amt] of inventoryMap.entries()) {
            lines.push({ accountId: acctId, debit: 0, credit: amt }); // Cr Inventory
        }

        // Generate JE No
        const branchCounter = await tx.documentCounter.findUnique({ where: { companyId_scope_scopeKey: { companyId: invoice.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } } });
        let nextNum = branchCounter ? branchCounter.lastNumber + 1 : 1;
        await tx.documentCounter.upsert({
            where: { companyId_scope_scopeKey: { companyId: invoice.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } },
            update: { lastNumber: nextNum },
            create: { companyId: invoice.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global', lastNumber: nextNum }
        });

        await tx.journalEntry.create({
            data: {
                companyId: invoice.companyId,
                branchId: invoice.branchId,
                costCenterId: invoice.branchId,
                entryNo: `JE-${String(nextNum).padStart(6, '0')}`,
                date: invoice.createdAt,
                memo: `POS Sale ${invoice.invoiceNo}`,
                sourceType: 'POSInvoice',
                sourceId: invoice.id,
                postedById: invoice.createdById,
                lines: {
                    create: lines
                }
            }
        });
    }

    /**
     * Records a Purchase Receipt (Invoice) into the ledger.
     * Dr Inventory Asset
     * Dr Input Tax (if applicable)
     * Cr Accounts Payable
     */
    static async recordPurchaseReceipt(
        tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
        invoice: {
            id: string;
            companyId: string;
            branchId: string;
            supplierId: string;
            purchaseNo: string;
            grandTotal: number;
            taxTotal: number;
            createdAt: Date;
            createdById: string;
            items: {
                productId: string;
                qty: number;
                unitCost: number;
                taxAmount: number;
            }[];
        }
    ) {
        const ctxGlobal: AccountingResolutionContext = { companyId: invoice.companyId, branchId: invoice.branchId, supplierId: invoice.supplierId };

        const accountsPayableId = await this.resolveAccountOrFail(tx, 'ACCOUNT_PAYABLE', ctxGlobal);
        const inputTaxAcctId = invoice.taxTotal > 0 ? await this.resolveAccountOrFail(tx, 'INPUT_TAX', ctxGlobal) : null;

        const lines: { accountId: string; debit: number; credit: number; partyId?: string; partyType?: 'CUSTOMER' | 'SUPPLIER' }[] = [];

        // Credit Accounts Payable
        lines.push({
            accountId: accountsPayableId,
            debit: 0,
            credit: invoice.grandTotal,
            partyType: 'SUPPLIER',
            partyId: invoice.supplierId
        });

        // Debit Input Tax
        if (inputTaxAcctId && invoice.taxTotal > 0) {
            lines.push({ accountId: inputTaxAcctId, debit: invoice.taxTotal, credit: 0 });
        }

        // Process Items for Inventory
        const inventoryMap = new Map<string, number>();

        for (const item of invoice.items) {
            const ctxProduct: AccountingResolutionContext = { ...ctxGlobal, productId: item.productId };

            const product = await tx.product.findUnique({ where: { id: item.productId }, select: { categoryId: true } });
            if (product?.categoryId) ctxProduct.categoryId = product.categoryId;

            const invAcctId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
            const lineValue = item.qty * item.unitCost;

            if (lineValue > 0) {
                inventoryMap.set(invAcctId, (inventoryMap.get(invAcctId) || 0) + lineValue);
            }
        }

        for (const [acctId, amt] of inventoryMap.entries()) {
            lines.push({ accountId: acctId, debit: amt, credit: 0 }); // Dr Inventory
        }

        const branchCounter = await tx.documentCounter.findUnique({ where: { companyId_scope_scopeKey: { companyId: invoice.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } } });
        let nextNum = branchCounter ? branchCounter.lastNumber + 1 : 1;
        await tx.documentCounter.upsert({
            where: { companyId_scope_scopeKey: { companyId: invoice.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } },
            update: { lastNumber: nextNum },
            create: { companyId: invoice.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global', lastNumber: nextNum }
        });

        await tx.journalEntry.create({
            data: {
                companyId: invoice.companyId, branchId: invoice.branchId, costCenterId: invoice.branchId,
                entryNo: `JE-${String(nextNum).padStart(6, '0')}`,
                date: invoice.createdAt,
                memo: `Purchase Receipt ${invoice.purchaseNo}`,
                sourceType: 'PurchaseInvoice', sourceId: invoice.id, postedById: invoice.createdById,
                lines: { create: lines }
            }
        });
    }

    /**
     * Records Inventory Adjustment (e.g. Shrinkage, Damage)
     */
    static async recordInventoryAdjustment(
        tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
        adjustment: {
            id: string;
            companyId: string;
            branchId: string;
            type: 'SHRINKAGE' | 'DAMAGE' | 'OTHER' | 'OPENING_BALANCE';
            createdAt: Date;
            createdById: string;
            items: {
                productId: string;
                qtyChange: number; // positive for gain, negative for loss
                cost: number;
            }[];
        }
    ) {
        if (adjustment.items.length === 0) return;

        const ctxGlobal: AccountingResolutionContext = { companyId: adjustment.companyId, branchId: adjustment.branchId };
        const lines: { accountId: string; debit: number; credit: number; }[] = [];

        // For adjustments, each item might hit different expense/inventory accounts
        for (const item of adjustment.items) {
            const ctxProduct: AccountingResolutionContext = { ...ctxGlobal, productId: item.productId };
            const product = await tx.product.findUnique({ where: { id: item.productId }, select: { categoryId: true } });
            if (product?.categoryId) ctxProduct.categoryId = product.categoryId;

            const invAcctId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);

            let expenseMappingType: AccountMappingType = 'EXPENSE';
            if (adjustment.type === 'SHRINKAGE') expenseMappingType = 'SHRINKAGE_EXPENSE';
            if (adjustment.type === 'DAMAGE') expenseMappingType = 'DAMAGED_GOODS_EXPENSE';

            const offsetAcctId = await this.resolveAccountOrFail(tx, expenseMappingType, ctxProduct);

            const value = Math.abs(item.qtyChange * item.cost);
            if (value > 0) {
                if (item.qtyChange < 0) {
                    // Loss: Dr Expense, Cr Inventory
                    lines.push({ accountId: offsetAcctId, debit: value, credit: 0 });
                    lines.push({ accountId: invAcctId, debit: 0, credit: value });
                } else {
                    // Gain: Dr Inventory, Cr Expense (or Income)
                    lines.push({ accountId: invAcctId, debit: value, credit: 0 });
                    lines.push({ accountId: offsetAcctId, debit: 0, credit: value });
                }
            }
        }

        if (lines.length === 0) return;

        const branchCounter = await tx.documentCounter.findUnique({ where: { companyId_scope_scopeKey: { companyId: adjustment.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } } });
        let nextNum = branchCounter ? branchCounter.lastNumber + 1 : 1;
        await tx.documentCounter.upsert({
            where: { companyId_scope_scopeKey: { companyId: adjustment.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } },
            update: { lastNumber: nextNum },
            create: { companyId: adjustment.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global', lastNumber: nextNum }
        });

        await tx.journalEntry.create({
            data: {
                companyId: adjustment.companyId, branchId: adjustment.branchId, costCenterId: adjustment.branchId,
                entryNo: `JE-${String(nextNum).padStart(6, '0')}`,
                date: adjustment.createdAt,
                memo: `Inventory Adjustment (${adjustment.type})`,
                sourceType: 'StockCount', sourceId: adjustment.id, postedById: adjustment.createdById,
                lines: { create: lines }
            }
        });
    }

    /**
     * Records an Inter-Branch Inventory Transfer.
     * Dr Inventory Asset (Destination)
     * Cr Inventory Asset (Source)
     */
    static async recordInventoryTransfer(
        tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
        transfer: {
            id: string;
            companyId: string;
            fromBranchId: string;
            toBranchId: string;
            createdAt: Date;
            createdById: string;
            transferNo: string;
            items: {
                productId: string;
                qty: number;
                cost: number;
            }[];
        }
    ) {
        if (transfer.items.length === 0) return;

        const ctxFrom: AccountingResolutionContext = { companyId: transfer.companyId, branchId: transfer.fromBranchId };
        const ctxTo: AccountingResolutionContext = { companyId: transfer.companyId, branchId: transfer.toBranchId };

        const lines: { accountId: string; debit: number; credit: number; }[] = [];

        for (const item of transfer.items) {
            const ctxProductFrom = { ...ctxFrom, productId: item.productId };
            const ctxProductTo = { ...ctxTo, productId: item.productId };

            const product = await tx.product.findUnique({ where: { id: item.productId }, select: { categoryId: true } });
            if (product?.categoryId) {
                ctxProductFrom.categoryId = product.categoryId;
                ctxProductTo.categoryId = product.categoryId;
            }

            const sourceInvAcctId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProductFrom);
            const destInvAcctId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProductTo);

            const value = item.qty * item.cost;
            if (value > 0) {
                // Dr Destination Inventory
                lines.push({ accountId: destInvAcctId, debit: value, credit: 0 });
                // Cr Source Inventory
                lines.push({ accountId: sourceInvAcctId, debit: 0, credit: value });
            }
        }

        if (lines.length === 0) return;

        const branchCounter = await tx.documentCounter.findUnique({ where: { companyId_scope_scopeKey: { companyId: transfer.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } } });
        let nextNum = branchCounter ? branchCounter.lastNumber + 1 : 1;
        await tx.documentCounter.upsert({
            where: { companyId_scope_scopeKey: { companyId: transfer.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global' } },
            update: { lastNumber: nextNum },
            create: { companyId: transfer.companyId, scope: 'JOURNAL_ENTRY', scopeKey: 'global', lastNumber: nextNum }
        });

        await tx.journalEntry.create({
            data: {
                companyId: transfer.companyId,
                branchId: transfer.toBranchId, // Record at destination branch
                costCenterId: transfer.toBranchId,
                entryNo: `JE-${String(nextNum).padStart(6, '0')}`,
                date: transfer.createdAt,
                memo: `Inventory Transfer ${transfer.transferNo}`,
                sourceType: 'Transfer',
                sourceId: transfer.id,
                postedById: transfer.createdById,
                lines: { create: lines }
            }
        });
    }

}
