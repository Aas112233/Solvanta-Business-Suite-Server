import { AppError } from '../../utils/AppError.js';

export interface MutateStockParams {
    companyId: string;
    branchId: string;
    productId: string;
    unitCode: string;
    qtyChange: number;
    cost: number;
    type: any; // e.g. 'PURCHASE_RECEIPT', 'POS_SALE', 'TRANSFER_OUT', 'ADJUSTMENT', etc.
    price?: number;
    referenceType?: string | null;
    referenceId?: string | null;
    createdById: string;
}

// Minimal product shape needed by InventoryService
interface ProductWithUnits {
    id: string;
    name: string;
    itemCode: string;
    units: Array<{ unitCode: string; qtyInBaseUnit: number; isBase: boolean }>;
}

export class InventoryService {
    /**
     * Fetches product with only the fields needed for unit conversion.
     * Reuse this across the service to avoid fetching full product documents.
     */
    private static async getProductUnits(tx: any, productId: string): Promise<ProductWithUnits | null> {
        return tx.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                name: true,
                itemCode: true,
                units: { select: { unitCode: true, qtyInBaseUnit: true, isBase: true } },
            },
        });
    }

    static async getAvailableStockQty(
        tx: any,
        params: { companyId: string; branchId: string; productId: string; unitCode: string },
        /** Optional pre-fetched product to avoid redundant DB lookup */
        prefetchedProduct?: ProductWithUnits | null
    ): Promise<number> {
        const product = prefetchedProduct ?? await this.getProductUnits(tx, params.productId);
        if (!product) return 0;
        const inputUnit = product.units.find((u: any) => u.unitCode === params.unitCode);
        const baseUnit = product.units.find((u: any) => u.isBase);
        if (!inputUnit || !baseUnit) return 0;
        const stock = await tx.inventoryStock.findFirst({ where: { companyId: params.companyId, branchId: params.branchId, productId: params.productId, unitCode: baseUnit.unitCode } });
        if (!stock) return 0;
        const multiplier = Number(inputUnit.qtyInBaseUnit || 1);
        return Number(stock.qtyOnHand) / multiplier;
    }

    /**
     * Atomically mutates inventory stock and creates a movement log.
     * Normalizes all quantities to the product's Base Unit (multiplier/fraction).
     * Accepts optional pre-fetched product to avoid duplicate lookups.
     * 
     * Includes retry logic for MongoDB write conflicts in concurrent scenarios.
     */
    static async mutateStock(
        tx: any,
        params: MutateStockParams,
        /** Optional pre-fetched product to avoid redundant DB lookup */
        prefetchedProduct?: ProductWithUnits | null
    ) {
        const MAX_RETRIES = 3;
        const BASE_DELAY_MS = 50;
        let lastError: any;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await this.mutateStockInternal(tx, params, prefetchedProduct);
            } catch (error: any) {
                lastError = error;

                // Check if it's a transient write conflict or deadlock error
                const isTransientError =
                    error?.message?.includes('write conflict') ||
                    error?.message?.includes('deadlock') ||
                    error?.code === 112 || // WriteConflict
                    error?.code === 262;   // LockTimeout

                if (isTransientError && attempt < MAX_RETRIES) {
                    // Exponential backoff with jitter
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 50;
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // Refresh prefetchedProduct on retry
                    prefetchedProduct = undefined;
                    continue;
                }

                // Not a transient error or max retries exceeded
                throw error;
            }
        }

        // Should not reach here, but just in case
        throw lastError;
    }

    private static async mutateStockInternal(
        tx: any,
        params: MutateStockParams,
        prefetchedProduct?: ProductWithUnits | null
    ) {
        // 0. Fetch Product Units to determine conversion factors
        const product = prefetchedProduct ?? await this.getProductUnits(tx, params.productId);
        if (!product) throw AppError.notFound(`Product ${params.productId}`);

        const inputUnit = product.units.find((u: any) => u.unitCode === params.unitCode);
        const baseUnit = product.units.find((u: any) => u.isBase);

        if (!inputUnit) throw AppError.badRequest(`Invalid unit code '${params.unitCode}' for product '${product.name}'`);
        if (!baseUnit) throw AppError.internal(`Product '${product.itemCode}' missing base unit definition`);

        // NORMALIZE TO BASE UNIT
        const multiplier = Number(inputUnit.qtyInBaseUnit || 1);
        const baseQtyChange = params.qtyChange * multiplier;
        // Movement cost is stored in requested unit. If sale/issue call does not provide cost,
        // fallback to current weighted average cost from stock bucket.
        let movementUnitCost = Number(params.cost || 0);
        let baseUnitCost = movementUnitCost / multiplier;

        const scopedWhere = {
            companyId: params.companyId,
            branchId: params.branchId,
            productId: params.productId,
            unitCode: baseUnit.unitCode,
        };

        // 1. Find existing stock (searching in base unit bucket)
        let stock = await tx.inventoryStock.findFirst({
            where: scopedWhere
        });

        let movementCost = baseUnitCost;

        // 2. Atomic Stock Update
        if (stock) {
            if (baseQtyChange < 0) {
                const nextQty = Number(stock.qtyOnHand) + baseQtyChange;
                if (nextQty < 0) {
                    const availableInUserUnit = Number(stock.qtyOnHand) / multiplier;
                    throw AppError.badRequest(`Insufficient stock for "${product.name}". Available: ${availableInUserUnit.toFixed(2)} ${params.unitCode}`);
                }

                if (movementUnitCost <= 0) {
                    movementUnitCost = Number(stock.avgCost || 0) * multiplier;
                    baseUnitCost = movementUnitCost / multiplier;
                }
            }

            // Update Average Cost for additions
            let nextAvgCost = Number(stock.avgCost);
            if (baseQtyChange > 0) {
                const totalVal = (Number(stock.qtyOnHand) * Number(stock.avgCost)) + (baseQtyChange * baseUnitCost);
                const totalQty = Number(stock.qtyOnHand) + baseQtyChange;
                nextAvgCost = totalQty > 0 ? totalVal / totalQty : baseUnitCost;
            }

            stock = await tx.inventoryStock.update({
                where: { id: stock.id },
                data: {
                    qtyOnHand: { increment: baseQtyChange },
                    avgCost: nextAvgCost
                }
            });
        } else {
            if (baseQtyChange < 0) {
                throw AppError.badRequest(`Cannot reduce stock from non-existent bucket for "${product.name}"`);
            }

            stock = await tx.inventoryStock.create({
                data: {
                    companyId: params.companyId,
                    branchId: params.branchId,
                    productId: params.productId,
                    unitCode: baseUnit.unitCode,
                    qtyOnHand: baseQtyChange,
                    avgCost: baseUnitCost,
                }
            });
        }

        // 3. Create Movement Log
        const movement = await tx.stockMovement.create({
            data: {
                companyId: params.companyId,
                branchId: params.branchId,
                productId: params.productId,
                unitCode: params.unitCode,
                type: params.type,
                qty: params.qtyChange,
                cost: movementUnitCost,
                price: Number(params.price || 0),
                referenceType: params.referenceType,
                referenceId: params.referenceId,
                createdById: params.createdById
            }
        });

        return { stock, movement };
    }
}
