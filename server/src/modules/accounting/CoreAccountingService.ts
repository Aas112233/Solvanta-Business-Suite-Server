import { PrismaClient, AccountEntityType, AccountMappingType } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';

export interface AccountingResolutionContext {
    companyId: string;
    branchId?: string;
    productId?: string;
    categoryId?: string;
    customerId?: string;
    supplierId?: string;
}

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
type JournalPartyType = 'CUSTOMER' | 'SUPPLIER';
type JournalLine = {
    accountId: string;
    debit: number;
    credit: number;
    partyType?: JournalPartyType;
    partyId?: string | null;
};

const MONEY_EPSILON = 0.005;

function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
}

function asUpper(value: string): string {
    return String(value || '').trim().toUpperCase();
}

export class CoreAccountingService {
    static async resolveAccount(
        tx: TxClient,
        mappingType: AccountMappingType,
        context: AccountingResolutionContext
    ): Promise<string | null> {
        const possibleTargets: { type: AccountEntityType; id: string | null }[] = [{ type: 'GLOBAL', id: null }];

        if (context.branchId) possibleTargets.push({ type: 'BRANCH', id: context.branchId });
        if (context.categoryId) possibleTargets.push({ type: 'CATEGORY', id: context.categoryId });
        if (context.productId) possibleTargets.push({ type: 'PRODUCT', id: context.productId });
        if (context.customerId) possibleTargets.push({ type: 'CUSTOMER', id: context.customerId });
        if (context.supplierId) possibleTargets.push({ type: 'SUPPLIER', id: context.supplierId });

        const mappings = await tx.accountMapping.findMany({
            where: {
                companyId: context.companyId,
                mappingType,
                OR: possibleTargets.map((target) => {
                    const condition: any = { entityType: target.type };
                    if (target.id) condition.entityId = target.id;
                    return condition;
                }),
            },
        });

        if (mappings.length === 0) return null;

        const priorityScore = (type: AccountEntityType): number => {
            switch (type) {
                case 'PRODUCT':
                    return 1;
                case 'CUSTOMER':
                case 'SUPPLIER':
                    return 2;
                case 'CATEGORY':
                    return 3;
                case 'BRANCH':
                    return 4;
                case 'GLOBAL':
                    return 5;
                default:
                    return 99;
            }
        };

        mappings.sort(
            (a, b) => priorityScore(a.entityType as AccountEntityType) - priorityScore(b.entityType as AccountEntityType)
        );

        return mappings[0]?.accountId || null;
    }

    static async resolveAccountOrFail(
        tx: TxClient,
        mappingType: AccountMappingType,
        context: AccountingResolutionContext
    ): Promise<string> {
        const accountId = await this.resolveAccount(tx, mappingType, context);
        if (!accountId) {
            throw AppError.badRequest(
                `Missing Account Mapping for ${mappingType}. Please configure it in Accounting Settings.`
            );
        }
        return accountId;
    }

    private static normalizeJournalLines(lines: JournalLine[]): JournalLine[] {
        const grouped = new Map<string, JournalLine>();

        for (const raw of lines) {
            const accountId = String(raw.accountId || '').trim();
            if (!accountId) throw AppError.badRequest('Journal line is missing accountId');

            const debit = roundMoney(Number(raw.debit || 0));
            const credit = roundMoney(Number(raw.credit || 0));
            if (debit < 0 || credit < 0) throw AppError.badRequest('Journal Total Amounts cannot be negative');
            if (debit === 0 && credit === 0) continue;

            const partyType = raw.partyType;
            const partyId = raw.partyId ? String(raw.partyId) : undefined;
            if (partyType && !partyId) {
                throw AppError.badRequest('Journal line with partyType must include partyId');
            }

            const key = `${accountId}::${partyType || ''}::${partyId || ''}`;
            const existing = grouped.get(key);
            if (!existing) {
                grouped.set(key, {
                    accountId,
                    debit,
                    credit,
                    ...(partyType ? { partyType } : {}),
                    ...(partyId ? { partyId } : {}),
                });
                continue;
            }

            existing.debit = roundMoney(existing.debit + debit);
            existing.credit = roundMoney(existing.credit + credit);
        }

        return Array.from(grouped.values()).filter((line) => line.debit > 0 || line.credit > 0);
    }

    private static assertBalanced(lines: JournalLine[], memo: string): void {
        if (lines.length < 2) {
            throw AppError.badRequest(`Accounting posting failed for "${memo}": at least two journal lines are required.`);
        }

        const totalDebit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
        const totalCredit = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));

        if (Math.abs(totalDebit - totalCredit) > MONEY_EPSILON) {
            throw AppError.badRequest(
                `Accounting posting failed for "${memo}": journal is unbalanced (debit ${totalDebit.toFixed(2)} vs credit ${totalCredit.toFixed(2)}).`
            );
        }
    }

    private static async createJournalEntryStrict(
        tx: TxClient,
        params: {
            companyId: string;
            branchId?: string | null;
            costCenterId?: string | null;
            date: Date;
            memo: string;
            sourceType?: string | null;
            sourceId?: string | null;
            postedById: string;
            lines: JournalLine[];
        }
    ): Promise<{ id: string; entryNo: string }> {
        const normalizedLines = this.normalizeJournalLines(params.lines);
        this.assertBalanced(normalizedLines, params.memo);

        const next = await nextCounter(tx as any, params.companyId, 'JOURNAL_ENTRY');
        const entryNo = formatDocNo('JE', next);

        const entry = await tx.journalEntry.create({
            data: {
                companyId: params.companyId,
                branchId: params.branchId || null,
                costCenterId: params.costCenterId ?? params.branchId ?? null,
                entryNo,
                date: params.date,
                memo: params.memo,
                sourceType: params.sourceType || null,
                sourceId: params.sourceId || null,
                postedById: params.postedById,
                lines: {
                    create: normalizedLines.map((line) => ({
                        accountId: line.accountId,
                        debit: line.debit,
                        credit: line.credit,
                        ...(line.partyType ? { partyType: line.partyType } : {}),
                        ...(line.partyId ? { partyId: line.partyId } : {}),
                    })),
                },
            },
            select: { id: true, entryNo: true },
        });

        return entry;
    }

    private static async resolveProductContext(
        tx: TxClient,
        base: AccountingResolutionContext,
        productId: string
    ): Promise<AccountingResolutionContext> {
        const next: AccountingResolutionContext = { ...base, productId };
        const product = await tx.product.findUnique({
            where: { id: productId },
            select: { categoryId: true },
        });
        if (product?.categoryId) next.categoryId = product.categoryId;
        return next;
    }

    private static async buildSaleSettlementDebitLines(
        tx: TxClient,
        input: {
            companyId: string;
            branchId: string;
            customerId?: string | null;
            paymentMethod: string;
            grandTotal: number;
            cashReceived?: number;
            changeGiven?: number;
        }
    ): Promise<JournalLine[]> {
        const method = asUpper(input.paymentMethod);
        const grandTotal = roundMoney(Number(input.grandTotal || 0));
        const ctxGlobal: AccountingResolutionContext = { companyId: input.companyId, branchId: input.branchId };

        if (grandTotal <= 0) throw AppError.badRequest('Grand total must be greater than zero for accounting posting.');

        if (method === 'CREDIT' || method === 'INSTALLMENT') {
            const arAccountId = await this.resolveAccountOrFail(tx, 'ACCOUNT_RECEIVABLE', {
                ...ctxGlobal,
                customerId: input.customerId || undefined,
            });
            return [
                {
                    accountId: arAccountId,
                    debit: grandTotal,
                    credit: 0,
                    partyType: 'CUSTOMER',
                    partyId: input.customerId || undefined,
                },
            ];
        }

        if (method === 'MIXED') {
            const netCash = roundMoney(
                Math.max(0, Number(input.cashReceived || 0) - Math.max(0, Number(input.changeGiven || 0)))
            );
            const bankAmount = roundMoney(Math.max(0, grandTotal - netCash));

            if (Math.abs(roundMoney(netCash + bankAmount) - grandTotal) > MONEY_EPSILON) {
                throw AppError.badRequest('Invalid mixed-payment split for accounting posting.');
            }

            const lines: JournalLine[] = [];
            if (netCash > 0) {
                const cashAccountId = await this.resolveAccountOrFail(tx, 'CASH', ctxGlobal);
                lines.push({ accountId: cashAccountId, debit: netCash, credit: 0 });
            }
            if (bankAmount > 0) {
                const bankAccountId = await this.resolveAccountOrFail(tx, 'BANK', ctxGlobal);
                lines.push({ accountId: bankAccountId, debit: bankAmount, credit: 0 });
            }
            if (lines.length === 0) throw AppError.badRequest('Invalid mixed-payment amounts for accounting posting.');
            return lines;
        }

        if (method === 'CARD' || method === 'BANK_TRANSFER' || method === 'STC_PAY') {
            const bankAccountId = await this.resolveAccountOrFail(tx, 'BANK', ctxGlobal);
            return [{ accountId: bankAccountId, debit: grandTotal, credit: 0 }];
        }

        if (method === 'CASH') {
            const cashAccountId = await this.resolveAccountOrFail(tx, 'CASH', ctxGlobal);
            return [{ accountId: cashAccountId, debit: grandTotal, credit: 0 }];
        }

        throw AppError.badRequest(`Unsupported payment method "${input.paymentMethod}" for accounting posting.`);
    }

    static async recordPOSSale(
        tx: TxClient,
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
            cashReceived?: number;
            changeGiven?: number;
            createdById: string;
            createdAt: Date;
            items: {
                productId: string;
                qty: number;
                unitPrice: number;
                lineTotal: number;
                taxAmount: number;
                cost: number;
            }[];
        }
    ): Promise<{ id: string; entryNo: string }> {
        const ctxGlobal: AccountingResolutionContext = { companyId: invoice.companyId, branchId: invoice.branchId };
        const lines: JournalLine[] = [];

        lines.push(
            ...(await this.buildSaleSettlementDebitLines(tx, {
                companyId: invoice.companyId,
                branchId: invoice.branchId,
                customerId: invoice.customerId || undefined,
                paymentMethod: invoice.paymentMethod,
                grandTotal: invoice.grandTotal,
                cashReceived: invoice.cashReceived,
                changeGiven: invoice.changeGiven,
            }))
        );

        if (Number(invoice.taxTotal || 0) > 0) {
            const outputTaxAccountId = await this.resolveAccountOrFail(tx, 'OUTPUT_TAX', ctxGlobal);
            lines.push({ accountId: outputTaxAccountId, debit: 0, credit: roundMoney(invoice.taxTotal) });
        }

        const revenueMap = new Map<string, number>();
        const inventoryCreditMap = new Map<string, number>();
        const cogsDebitMap = new Map<string, number>();
        let salesRevenueCreditTotal = 0;

        for (const item of invoice.items) {
            const ctxProduct = await this.resolveProductContext(tx, ctxGlobal, item.productId);
            const revenueAccountId = await this.resolveAccountOrFail(tx, 'SALES_REVENUE', ctxProduct);
            const lineRevenue = roundMoney(Number(item.lineTotal || 0));
            salesRevenueCreditTotal = roundMoney(salesRevenueCreditTotal + lineRevenue);

            revenueMap.set(
                revenueAccountId,
                roundMoney((revenueMap.get(revenueAccountId) || 0) + lineRevenue)
            );

            const itemCostValue = roundMoney(Number(item.qty || 0) * Number(item.cost || 0));
            if (itemCostValue > 0) {
                const inventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
                const cogsAccountId = await this.resolveAccountOrFail(tx, 'COGS_EXPENSE', ctxProduct);

                inventoryCreditMap.set(
                    inventoryAccountId,
                    roundMoney((inventoryCreditMap.get(inventoryAccountId) || 0) + itemCostValue)
                );
                cogsDebitMap.set(cogsAccountId, roundMoney((cogsDebitMap.get(cogsAccountId) || 0) + itemCostValue));
            }
        }

        // Invoice-level settlement reductions (e.g. loyalty redemption / manual settlement discount)
        // reduce grandTotal while line revenue + tax remain gross. Add an explicit debit adjustment
        // so sales journals stay balanced.
        const taxCreditTotal = roundMoney(Number(invoice.taxTotal || 0));
        const settledGrandTotal = roundMoney(Number(invoice.grandTotal || 0));
        const settlementDiscountAdjustment = roundMoney(salesRevenueCreditTotal + taxCreditTotal - settledGrandTotal);
        if (settlementDiscountAdjustment > MONEY_EPSILON) {
            let settlementDiscountAccountId = await this.resolveAccount(tx, 'DISCOUNT_GIVEN', ctxGlobal);
            if (!settlementDiscountAccountId) {
                settlementDiscountAccountId = revenueMap.keys().next().value || null;
            }
            if (!settlementDiscountAccountId) {
                settlementDiscountAccountId = await this.resolveAccount(tx, 'SALES_REVENUE', ctxGlobal);
            }
            if (!settlementDiscountAccountId) {
                throw AppError.badRequest(
                    'Missing Account Mapping for DISCOUNT_GIVEN (or SALES_REVENUE fallback). Please configure it in Accounting Settings.'
                );
            }
            lines.push({ accountId: settlementDiscountAccountId, debit: settlementDiscountAdjustment, credit: 0 });
        }

        for (const [accountId, amount] of revenueMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: 0, credit: amount });
        }
        for (const [accountId, amount] of cogsDebitMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: amount, credit: 0 });
        }
        for (const [accountId, amount] of inventoryCreditMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: 0, credit: amount });
        }

        return this.createJournalEntryStrict(tx, {
            companyId: invoice.companyId,
            branchId: invoice.branchId,
            date: invoice.createdAt,
            memo: `POS Sale ${invoice.invoiceNo}`,
            sourceType: 'POSInvoice',
            sourceId: invoice.id,
            postedById: invoice.createdById,
            lines,
        });
    }

    static async recordSalesPayment(
        tx: TxClient,
        payment: {
            companyId: string;
            branchId: string;
            invoiceId: string;
            invoiceNo: string;
            customerId: string;
            amount: number;
            paymentMethod: string;
            postedAt: Date;
            postedById: string;
            referenceNo?: string | null;
            notes?: string | null;
        }
    ): Promise<{ id: string; entryNo: string }> {
        const amount = roundMoney(Number(payment.amount || 0));
        if (amount <= 0) throw AppError.badRequest('Payment amount must be greater than zero.');

        const ctx: AccountingResolutionContext = {
            companyId: payment.companyId,
            branchId: payment.branchId,
            customerId: payment.customerId,
        };
        const method = asUpper(payment.paymentMethod);

        const receiptAccountId =
            method === 'CARD' || method === 'BANK_TRANSFER'
                ? await this.resolveAccountOrFail(tx, 'BANK', ctx)
                : await this.resolveAccountOrFail(tx, 'CASH', ctx);
        const arAccountId = await this.resolveAccountOrFail(tx, 'ACCOUNT_RECEIVABLE', ctx);

        return this.createJournalEntryStrict(tx, {
            companyId: payment.companyId,
            branchId: payment.branchId,
            date: payment.postedAt,
            memo: `Sales payment for ${payment.invoiceNo}${payment.referenceNo ? ` · Ref ${payment.referenceNo}` : ''}${payment.notes ? ` · ${payment.notes}` : ''}`,
            sourceType: 'SalesPayment',
            sourceId: payment.invoiceId,
            postedById: payment.postedById,
            lines: [
                { accountId: receiptAccountId, debit: amount, credit: 0 },
                {
                    accountId: arAccountId,
                    debit: 0,
                    credit: amount,
                    partyType: 'CUSTOMER',
                    partyId: payment.customerId,
                },
            ],
        });
    }

    static async recordSalesReturn(
        tx: TxClient,
        input: {
            id: string;
            companyId: string;
            branchId: string;
            returnNo: string;
            invoiceNo: string;
            customerId?: string | null;
            originalPaymentMethod: string;
            taxTotal: number;
            grandTotal: number;
            postedAt: Date;
            postedById: string;
            cashRefund?: number;
            bankRefund?: number;
            items: Array<{
                productId: string;
                qty: number;
                unitCost: number;
                lineTotal: number;
            }>;
        }
    ): Promise<{ id: string; entryNo: string }> {
        const ctxGlobal: AccountingResolutionContext = { companyId: input.companyId, branchId: input.branchId };
        const grandTotal = roundMoney(Number(input.grandTotal || 0));
        if (grandTotal <= 0) throw AppError.badRequest('Sales return total must be greater than zero for accounting.');

        const lines: JournalLine[] = [];
        const method = asUpper(input.originalPaymentMethod);

        const salesReturnDebitMap = new Map<string, number>();
        const inventoryDebitMap = new Map<string, number>();
        const cogsCreditMap = new Map<string, number>();

        for (const item of input.items) {
            const ctxProduct = await this.resolveProductContext(tx, ctxGlobal, item.productId);
            const salesReturnAccountId = await this.resolveAccountOrFail(tx, 'SALES_RETURN', ctxProduct);

            const revenueReverseValue = roundMoney(Number(item.lineTotal || 0));
            if (revenueReverseValue > 0) {
                salesReturnDebitMap.set(
                    salesReturnAccountId,
                    roundMoney((salesReturnDebitMap.get(salesReturnAccountId) || 0) + revenueReverseValue)
                );
            }

            const costValue = roundMoney(Number(item.qty || 0) * Number(item.unitCost || 0));
            if (costValue > 0) {
                const inventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
                const cogsAccountId = await this.resolveAccountOrFail(tx, 'COGS_EXPENSE', ctxProduct);

                inventoryDebitMap.set(
                    inventoryAccountId,
                    roundMoney((inventoryDebitMap.get(inventoryAccountId) || 0) + costValue)
                );
                cogsCreditMap.set(cogsAccountId, roundMoney((cogsCreditMap.get(cogsAccountId) || 0) + costValue));
            }
        }

        for (const [accountId, amount] of salesReturnDebitMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: amount, credit: 0 });
        }

        if (Number(input.taxTotal || 0) > 0) {
            const outputTaxAccountId = await this.resolveAccountOrFail(tx, 'OUTPUT_TAX', ctxGlobal);
            lines.push({ accountId: outputTaxAccountId, debit: roundMoney(input.taxTotal), credit: 0 });
        }

        if (method === 'CREDIT' || method === 'INSTALLMENT') {
            if (!input.customerId) {
                throw AppError.badRequest(`Customer is required to post accounting for ${method} sales return.`);
            }
            const arAccountId = await this.resolveAccountOrFail(tx, 'ACCOUNT_RECEIVABLE', {
                ...ctxGlobal,
                customerId: input.customerId,
            });
            lines.push({
                accountId: arAccountId,
                debit: 0,
                credit: grandTotal,
                partyType: 'CUSTOMER',
                partyId: input.customerId,
            });
        } else if (method === 'MIXED') {
            const cashRefund = roundMoney(Number(input.cashRefund || 0));
            const bankRefund = roundMoney(Number(input.bankRefund || 0));
            if (Math.abs(roundMoney(cashRefund + bankRefund) - grandTotal) > MONEY_EPSILON) {
                throw AppError.badRequest('Invalid mixed refund split for sales return accounting.');
            }
            if (cashRefund > 0) {
                const cashAccountId = await this.resolveAccountOrFail(tx, 'CASH', ctxGlobal);
                lines.push({ accountId: cashAccountId, debit: 0, credit: cashRefund });
            }
            if (bankRefund > 0) {
                const bankAccountId = await this.resolveAccountOrFail(tx, 'BANK', ctxGlobal);
                lines.push({ accountId: bankAccountId, debit: 0, credit: bankRefund });
            }
        } else if (method === 'CARD' || method === 'BANK_TRANSFER' || method === 'STC_PAY') {
            const bankAccountId = await this.resolveAccountOrFail(tx, 'BANK', ctxGlobal);
            lines.push({ accountId: bankAccountId, debit: 0, credit: grandTotal });
        } else if (method === 'CASH') {
            const cashAccountId = await this.resolveAccountOrFail(tx, 'CASH', ctxGlobal);
            lines.push({ accountId: cashAccountId, debit: 0, credit: grandTotal });
        } else {
            throw AppError.badRequest(`Unsupported payment method "${input.originalPaymentMethod}" for sales return accounting.`);
        }

        for (const [accountId, amount] of inventoryDebitMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: amount, credit: 0 });
        }
        for (const [accountId, amount] of cogsCreditMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: 0, credit: amount });
        }

        return this.createJournalEntryStrict(tx, {
            companyId: input.companyId,
            branchId: input.branchId,
            date: input.postedAt,
            memo: `Sales return ${input.returnNo} against ${input.invoiceNo}`,
            sourceType: 'SalesReturn',
            sourceId: input.id,
            postedById: input.postedById,
            lines,
        });
    }

    static async recordPurchaseReceipt(
        tx: TxClient,
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
                lineTotal?: number;
            }[];
        }
    ): Promise<{ id: string; entryNo: string }> {
        const ctxGlobal: AccountingResolutionContext = {
            companyId: invoice.companyId,
            branchId: invoice.branchId,
            supplierId: invoice.supplierId,
        };

        const accountsPayableId = await this.resolveAccountOrFail(tx, 'ACCOUNT_PAYABLE', ctxGlobal);
        const lines: JournalLine[] = [
            {
                accountId: accountsPayableId,
                debit: 0,
                credit: roundMoney(invoice.grandTotal),
                partyType: 'SUPPLIER',
                partyId: invoice.supplierId,
            },
        ];

        if (Number(invoice.taxTotal || 0) > 0) {
            const inputTaxAccountId = await this.resolveAccountOrFail(tx, 'INPUT_TAX', ctxGlobal);
            lines.push({ accountId: inputTaxAccountId, debit: roundMoney(invoice.taxTotal), credit: 0 });
        }

        const inventoryMap = new Map<string, number>();
        for (const item of invoice.items) {
            const ctxProduct = await this.resolveProductContext(tx, ctxGlobal, item.productId);
            const inventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
            const lineValue = roundMoney(
                Number(item.lineTotal ?? Number(item.qty || 0) * Number(item.unitCost || 0))
            );
            if (lineValue > 0) {
                inventoryMap.set(
                    inventoryAccountId,
                    roundMoney((inventoryMap.get(inventoryAccountId) || 0) + lineValue)
                );
            }
        }

        for (const [accountId, amount] of inventoryMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: amount, credit: 0 });
        }

        return this.createJournalEntryStrict(tx, {
            companyId: invoice.companyId,
            branchId: invoice.branchId,
            date: invoice.createdAt,
            memo: `Purchase Receipt ${invoice.purchaseNo}`,
            sourceType: 'PurchaseInvoice',
            sourceId: invoice.id,
            postedById: invoice.createdById,
            lines,
        });
    }

    static async recordPurchasePayment(
        tx: TxClient,
        payment: {
            id: string;
            companyId: string;
            branchId: string;
            supplierId: string;
            purchaseNo: string;
            paymentNo: string;
            amount: number;
            paymentMethod: string;
            paymentDate: Date;
            postedById: string;
            referenceNo?: string | null;
            notes?: string | null;
        }
    ): Promise<{ id: string; entryNo: string }> {
        const amount = roundMoney(Number(payment.amount || 0));
        if (amount <= 0) throw AppError.badRequest('Purchase payment amount must be greater than zero.');

        const ctx: AccountingResolutionContext = {
            companyId: payment.companyId,
            branchId: payment.branchId,
            supplierId: payment.supplierId,
        };
        const method = asUpper(payment.paymentMethod);

        const sourceCashOrBankAccountId =
            method === 'CARD' || method === 'BANK_TRANSFER'
                ? await this.resolveAccountOrFail(tx, 'BANK', ctx)
                : await this.resolveAccountOrFail(tx, 'CASH', ctx);
        const accountPayableId = await this.resolveAccountOrFail(tx, 'ACCOUNT_PAYABLE', ctx);

        return this.createJournalEntryStrict(tx, {
            companyId: payment.companyId,
            branchId: payment.branchId,
            date: payment.paymentDate,
            memo: `Purchase payment ${payment.paymentNo} for ${payment.purchaseNo}${payment.referenceNo ? ` · Ref ${payment.referenceNo}` : ''}${payment.notes ? ` · ${payment.notes}` : ''}`,
            sourceType: 'PurchasePayment',
            sourceId: payment.id,
            postedById: payment.postedById,
            lines: [
                {
                    accountId: accountPayableId,
                    debit: amount,
                    credit: 0,
                    partyType: 'SUPPLIER',
                    partyId: payment.supplierId,
                },
                { accountId: sourceCashOrBankAccountId, debit: 0, credit: amount },
            ],
        });
    }

    static async recordPurchaseReturn(
        tx: TxClient,
        input: {
            id: string;
            companyId: string;
            branchId: string;
            supplierId: string;
            returnNo: string;
            purchaseNo: string;
            grandTotal: number;
            taxTotal: number;
            postedAt: Date;
            postedById: string;
            items: Array<{
                productId: string;
                qty: number;
                unitCost: number;
                lineTotal: number;
            }>;
        }
    ): Promise<{ id: string; entryNo: string }> {
        const ctxGlobal: AccountingResolutionContext = {
            companyId: input.companyId,
            branchId: input.branchId,
            supplierId: input.supplierId,
        };

        const lines: JournalLine[] = [];
        const accountPayableId = await this.resolveAccountOrFail(tx, 'ACCOUNT_PAYABLE', ctxGlobal);
        lines.push({
            accountId: accountPayableId,
            debit: roundMoney(input.grandTotal),
            credit: 0,
            partyType: 'SUPPLIER',
            partyId: input.supplierId,
        });

        if (Number(input.taxTotal || 0) > 0) {
            const inputTaxAccountId = await this.resolveAccountOrFail(tx, 'INPUT_TAX', ctxGlobal);
            lines.push({ accountId: inputTaxAccountId, debit: 0, credit: roundMoney(input.taxTotal) });
        }

        const inventoryCreditMap = new Map<string, number>();
        for (const item of input.items) {
            const ctxProduct = await this.resolveProductContext(tx, ctxGlobal, item.productId);
            const inventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
            const value = roundMoney(Number(item.lineTotal ?? Number(item.qty || 0) * Number(item.unitCost || 0)));
            if (value > 0) {
                inventoryCreditMap.set(inventoryAccountId, roundMoney((inventoryCreditMap.get(inventoryAccountId) || 0) + value));
            }
        }

        for (const [accountId, amount] of inventoryCreditMap.entries()) {
            if (amount > 0) lines.push({ accountId, debit: 0, credit: amount });
        }

        return this.createJournalEntryStrict(tx, {
            companyId: input.companyId,
            branchId: input.branchId,
            date: input.postedAt,
            memo: `Purchase return ${input.returnNo} against ${input.purchaseNo}`,
            sourceType: 'PurchaseReturn',
            sourceId: input.id,
            postedById: input.postedById,
            lines,
        });
    }

    static async recordProductionIssue(
        tx: TxClient,
        input: {
            id: string;
            companyId: string;
            branchId: string;
            productionNo: string;
            postedAt: Date;
            postedById: string;
            items: Array<{
                productId: string;
                qty: number;
                unitCost: number;
            }>;
        }
    ): Promise<{ id: string; entryNo: string } | null> {
        if (input.items.length === 0) return null;

        const ctxGlobal: AccountingResolutionContext = { companyId: input.companyId, branchId: input.branchId };
        const lines: JournalLine[] = [];

        for (const item of input.items) {
            const value = roundMoney(Number(item.qty || 0) * Number(item.unitCost || 0));
            if (value <= 0) continue;

            const ctxProduct = await this.resolveProductContext(tx, ctxGlobal, item.productId);
            const inventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
            const wipAccountId = await this.resolveAccountOrFail(tx, 'WIP_ASSET', ctxProduct);

            lines.push({ accountId: wipAccountId, debit: value, credit: 0 });
            lines.push({ accountId: inventoryAccountId, debit: 0, credit: value });
        }

        if (lines.length === 0) return null;

        return this.createJournalEntryStrict(tx, {
            companyId: input.companyId,
            branchId: input.branchId,
            date: input.postedAt,
            memo: `Production issue ${input.productionNo}`,
            sourceType: 'ProductionMaterialConsumption',
            sourceId: input.id,
            postedById: input.postedById,
            lines,
        });
    }

    static async recordProductionReceipt(
        tx: TxClient,
        input: {
            id: string;
            companyId: string;
            branchId: string;
            productionNo: string;
            productId: string;
            qty: number;
            unitCost: number;
            postedAt: Date;
            postedById: string;
        }
    ): Promise<{ id: string; entryNo: string } | null> {
        const value = roundMoney(Number(input.qty || 0) * Number(input.unitCost || 0));
        if (value <= 0) return null;

        const ctxProduct = await this.resolveProductContext(tx, { companyId: input.companyId, branchId: input.branchId }, input.productId);
        const inventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);
        const wipAccountId = await this.resolveAccountOrFail(tx, 'WIP_ASSET', ctxProduct);

        return this.createJournalEntryStrict(tx, {
            companyId: input.companyId,
            branchId: input.branchId,
            date: input.postedAt,
            memo: `Production receipt ${input.productionNo}`,
            sourceType: 'ProductionCompletion',
            sourceId: input.id,
            postedById: input.postedById,
            lines: [
                { accountId: inventoryAccountId, debit: value, credit: 0 },
                { accountId: wipAccountId, debit: 0, credit: value },
            ],
        });
    }

    static async recordInventoryAdjustment(
        tx: TxClient,
        adjustment: {
            id: string;
            companyId: string;
            branchId: string;
            type: 'SHRINKAGE' | 'DAMAGE' | 'OTHER' | 'OPENING_BALANCE';
            createdAt: Date;
            createdById: string;
            items: {
                productId: string;
                qtyChange: number;
                cost: number;
            }[];
        }
    ): Promise<{ id: string; entryNo: string } | null> {
        if (adjustment.items.length === 0) return null;

        const ctxGlobal: AccountingResolutionContext = { companyId: adjustment.companyId, branchId: adjustment.branchId };
        const lines: JournalLine[] = [];

        for (const item of adjustment.items) {
            const ctxProduct = await this.resolveProductContext(tx, ctxGlobal, item.productId);
            const inventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', ctxProduct);

            let offsetType: AccountMappingType = 'EXPENSE';
            if (adjustment.type === 'SHRINKAGE') offsetType = 'SHRINKAGE_EXPENSE';
            if (adjustment.type === 'DAMAGE') offsetType = 'DAMAGED_GOODS_EXPENSE';
            const offsetAccountId = await this.resolveAccountOrFail(tx, offsetType, ctxProduct);

            const value = roundMoney(Math.abs(Number(item.qtyChange || 0) * Number(item.cost || 0)));
            if (value <= 0) continue;

            if (item.qtyChange < 0) {
                lines.push({ accountId: offsetAccountId, debit: value, credit: 0 });
                lines.push({ accountId: inventoryAccountId, debit: 0, credit: value });
            } else {
                lines.push({ accountId: inventoryAccountId, debit: value, credit: 0 });
                lines.push({ accountId: offsetAccountId, debit: 0, credit: value });
            }
        }

        if (lines.length === 0) return null;

        return this.createJournalEntryStrict(tx, {
            companyId: adjustment.companyId,
            branchId: adjustment.branchId,
            date: adjustment.createdAt,
            memo: `Inventory Adjustment (${adjustment.type})`,
            sourceType: 'StockCount',
            sourceId: adjustment.id,
            postedById: adjustment.createdById,
            lines,
        });
    }

    static async recordInventoryTransfer(
        tx: TxClient,
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
    ): Promise<{ id: string; entryNo: string } | null> {
        if (transfer.items.length === 0) return null;

        const ctxFrom: AccountingResolutionContext = { companyId: transfer.companyId, branchId: transfer.fromBranchId };
        const ctxTo: AccountingResolutionContext = { companyId: transfer.companyId, branchId: transfer.toBranchId };
        const lines: JournalLine[] = [];

        for (const item of transfer.items) {
            const fromProductCtx = await this.resolveProductContext(tx, ctxFrom, item.productId);
            const toProductCtx = await this.resolveProductContext(tx, ctxTo, item.productId);

            const sourceInventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', fromProductCtx);
            const destinationInventoryAccountId = await this.resolveAccountOrFail(tx, 'INVENTORY_ASSET', toProductCtx);
            const value = roundMoney(Number(item.qty || 0) * Number(item.cost || 0));
            if (value <= 0) continue;

            lines.push({ accountId: destinationInventoryAccountId, debit: value, credit: 0 });
            lines.push({ accountId: sourceInventoryAccountId, debit: 0, credit: value });
        }

        if (lines.length === 0) return null;

        return this.createJournalEntryStrict(tx, {
            companyId: transfer.companyId,
            branchId: transfer.toBranchId,
            date: transfer.createdAt,
            memo: `Inventory Transfer ${transfer.transferNo}`,
            sourceType: 'Transfer',
            sourceId: transfer.id,
            postedById: transfer.createdById,
            lines,
        });
    }
}
