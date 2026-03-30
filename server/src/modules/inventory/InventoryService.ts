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

export class InventoryService {
    static async getAvailableStockQty(tx: any, params: { companyId: string, branchId: string, productId: string, unitCode: string }): Promise<number> {
        const product = await tx.product.findUnique({ where: { id: params.productId }, include: { units: true } });
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
     */
    static async mutateStock(
        tx: any,
        params: MutateStockParams
    ) {
        // 0. Fetch Product Units to determine conversion factors
        const product = await tx.product.findUnique({
            where: { id: params.productId },
            include: { units: true }
        });
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
