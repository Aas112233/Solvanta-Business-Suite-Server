import { AppError } from '../../utils/AppError.js';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';
import { InventoryService } from '../inventory/InventoryService.js';
import { CoreAccountingService } from '../accounting/CoreAccountingService.js';

const PRODUCTION_ORDER_COUNTER = 'PRODUCTION_ORDER';

const ORDER_INCLUDE = {
    branch: { select: { id: true, name: true, code: true } },
    bom: {
        select: {
            id: true,
            name: true,
            version: true,
            status: true,
            outputQty: true,
            outputUnitCode: true,
        },
    },
    product: {
        select: {
            id: true,
            name: true,
            itemCode: true,
            kind: true,
        },
    },
    materials: {
        include: {
            product: { select: { id: true, name: true, itemCode: true, kind: true } },
        },
        orderBy: { id: 'asc' },
    },
    consumptions: {
        orderBy: { createdAt: 'asc' },
    },
    completions: {
        orderBy: { createdAt: 'asc' },
    },
};

function roundQty(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 10000) / 10000;
}

function materialKey(productId: string, unitCode: string): string {
    return `${productId}::${unitCode}`.toLowerCase();
}

function normalizeDate(input?: string): Date | undefined {
    if (!input) return undefined;
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
        throw AppError.badRequest('Invalid date');
    }
    return parsed;
}

export class ProductionService {
    private static async getBomOrThrow(tx: any, companyId: string, bomId: string) {
        const bom = await tx.bom.findFirst({
            where: { id: bomId, companyId },
            include: {
                product: {
                    include: { units: true },
                },
                items: {
                    include: {
                        product: {
                            include: { units: true },
                        },
                    },
                },
            },
        });

        if (!bom) throw AppError.notFound('BOM');
        return bom;
    }

    private static assertUnitExists(product: any, unitCode: string, label: string) {
        const unit = (product?.units || []).find((entry: any) => entry.unitCode === unitCode);
        if (!unit) {
            throw AppError.badRequest(`${label} does not support unit "${unitCode}"`);
        }
        return unit;
    }

    private static buildMaterialPlan(bom: any, plannedQty: number) {
        if (Number(bom.outputQty || 0) <= 0) {
            throw AppError.badRequest('BOM output quantity must be greater than zero');
        }

        const factor = Number(plannedQty) / Number(bom.outputQty);
        return (bom.items || []).map((item: any) => ({
            productId: String(item.productId),
            unitCode: String(item.unitCode),
            plannedQty: roundQty(factor * Number(item.qtyRequired || 0) * (1 + Number(item.scrapPercent || 0) / 100)),
        }));
    }

    static async createOrder(
        tx: any,
        input: {
            companyId: string;
            branchId: string;
            bomId: string;
            plannedQty: number;
            plannedUnitCode: string;
            plannedStartDate?: string;
            plannedEndDate?: string;
            notes?: string;
            createdById: string;
        }
    ) {
        const bom = await this.getBomOrThrow(tx, input.companyId, input.bomId);
        if (bom.status !== 'ACTIVE') {
            throw AppError.badRequest('Only active BOMs can be used for production orders');
        }
        if (input.plannedUnitCode !== bom.outputUnitCode) {
            throw AppError.badRequest(`Planned unit must match BOM output unit "${bom.outputUnitCode}"`);
        }

        this.assertUnitExists(bom.product, input.plannedUnitCode, `Finished good "${bom.product.name}"`);
        for (const item of bom.items) {
            this.assertUnitExists(item.product, item.unitCode, `Material "${item.product.name}"`);
        }

        const materials = this.buildMaterialPlan(bom, input.plannedQty).filter((item: any) => item.plannedQty > 0);
        if (materials.length === 0) {
            throw AppError.badRequest('BOM has no material lines to explode');
        }

        const productionNo = formatDocNo(
            'MFG',
            await nextCounter(tx as any, input.companyId, PRODUCTION_ORDER_COUNTER, input.branchId)
        );

        return tx.productionOrder.create({
            data: {
                companyId: input.companyId,
                branchId: input.branchId,
                bomId: input.bomId,
                productId: bom.productId,
                productionNo,
                status: 'PLANNED',
                plannedQty: Number(input.plannedQty),
                plannedUnitCode: input.plannedUnitCode,
                plannedStartDate: normalizeDate(input.plannedStartDate),
                plannedEndDate: normalizeDate(input.plannedEndDate),
                notes: input.notes?.trim() || undefined,
                createdById: input.createdById,
                materials: {
                    create: materials.map((item: any) => ({
                        productId: item.productId,
                        unitCode: item.unitCode,
                        plannedQty: item.plannedQty,
                    })),
                },
            },
            include: ORDER_INCLUDE,
        });
    }

    static async getOrderOrThrow(tx: any, companyId: string, orderId: string) {
        const order = await tx.productionOrder.findFirst({
            where: { id: orderId, companyId },
            include: ORDER_INCLUDE,
        });
        if (!order) throw AppError.notFound('Production order');
        return order;
    }

    static async startOrder(tx: any, input: { companyId: string; orderId: string }) {
        const order = await this.getOrderOrThrow(tx, input.companyId, input.orderId);
        if (order.status === 'CANCELLED') throw AppError.badRequest('Cancelled production order cannot be started');
        if (order.status === 'COMPLETED') throw AppError.badRequest('Completed production order cannot be started');
        if (order.status === 'IN_PROGRESS') return order;

        await tx.productionOrder.update({
            where: { id: order.id },
            data: {
                status: 'IN_PROGRESS',
                actualStartDate: order.actualStartDate || new Date(),
            },
        });

        return this.getOrderOrThrow(tx, input.companyId, order.id);
    }

    static async consumeMaterials(
        tx: any,
        input: {
            companyId: string;
            orderId: string;
            createdById: string;
            items: Array<{
                productId: string;
                unitCode: string;
                qtyConsumed: number;
                batchNo?: string;
                notes?: string;
            }>;
        }
    ) {
        const order = await this.getOrderOrThrow(tx, input.companyId, input.orderId);
        if (order.status === 'CANCELLED') throw AppError.badRequest('Cannot consume materials for a cancelled order');
        if (order.status === 'COMPLETED') throw AppError.badRequest('Cannot consume materials for a completed order');

        if (order.status !== 'IN_PROGRESS') {
            await tx.productionOrder.update({
                where: { id: order.id },
                data: {
                    status: 'IN_PROGRESS',
                    actualStartDate: order.actualStartDate || new Date(),
                },
            });
        }

        const materialMap = new Map(
            (order.materials || []).map((item: any) => [materialKey(String(item.productId), String(item.unitCode)), { ...item }])
        );
        const accountingItems: Array<{ productId: string; qty: number; unitCost: number }> = [];

        for (const item of input.items) {
            const key = materialKey(item.productId, item.unitCode);
            const material: any = materialMap.get(key);
            if (!material) {
                throw AppError.badRequest(`Material ${item.productId} (${item.unitCode}) is not part of this production order`);
            }

            const { movement } = await InventoryService.mutateStock(tx, {
                companyId: input.companyId,
                branchId: order.branchId,
                productId: item.productId,
                unitCode: item.unitCode,
                qtyChange: -Number(item.qtyConsumed),
                cost: 0,
                type: 'PRODUCTION_ISSUE',
                referenceType: 'ProductionOrder',
                referenceId: order.id,
                createdById: input.createdById,
            });

            await tx.productionMaterialConsumption.create({
                data: {
                    companyId: input.companyId,
                    branchId: order.branchId,
                    productionOrderId: order.id,
                    productId: item.productId,
                    unitCode: item.unitCode,
                    qtyConsumed: Number(item.qtyConsumed),
                    cost: Number(movement.cost || 0),
                    batchNo: item.batchNo?.trim() || undefined,
                    notes: item.notes?.trim() || undefined,
                    createdById: input.createdById,
                },
            });

            const nextIssuedQty = roundQty(Number(material.issuedQty || 0) + Number(item.qtyConsumed));
            await tx.productionOrderMaterial.update({
                where: { id: material.id },
                data: {
                    issuedQty: { increment: Number(item.qtyConsumed) },
                    varianceQty: roundQty(nextIssuedQty - Number(material.plannedQty || 0)),
                },
            });

            material.issuedQty = nextIssuedQty;
            accountingItems.push({
                productId: item.productId,
                qty: Number(item.qtyConsumed),
                unitCost: Number(movement.cost || 0),
            });
        }

        await CoreAccountingService.recordProductionIssue(tx as any, {
            id: order.id,
            companyId: input.companyId,
            branchId: order.branchId,
            productionNo: order.productionNo,
            postedAt: new Date(),
            postedById: input.createdById,
            items: accountingItems,
        });

        return this.getOrderOrThrow(tx, input.companyId, order.id);
    }

    static async completeOrder(
        tx: any,
        input: {
            companyId: string;
            orderId: string;
            createdById: string;
            qtyCompleted: number;
            unitCode: string;
            scrapQty?: number;
            notes?: string;
        }
    ) {
        const order = await this.getOrderOrThrow(tx, input.companyId, input.orderId);
        if (order.status === 'CANCELLED') throw AppError.badRequest('Cannot complete a cancelled order');
        if (order.status === 'COMPLETED') throw AppError.badRequest('Production order is already completed');
        if (input.unitCode !== order.plannedUnitCode) {
            throw AppError.badRequest(`Completion unit must match planned unit "${order.plannedUnitCode}"`);
        }

        const completionTimestamp = new Date();
        const totalConsumedValue = (order.consumptions || []).reduce(
            (sum: number, item: any) => sum + Number(item.qtyConsumed || 0) * Number(item.cost || 0),
            0
        );
        const alreadyCompletedValue = (order.completions || []).reduce(
            (sum: number, item: any) => sum + Number(item.qtyCompleted || 0) * Number(item.unitCost || 0),
            0
        );
        const remainingValue = Math.max(0, totalConsumedValue - alreadyCompletedValue);
        const derivedUnitCost = Number(input.qtyCompleted) > 0 ? remainingValue / Number(input.qtyCompleted) : 0;

        const { movement } = await InventoryService.mutateStock(tx, {
            companyId: input.companyId,
            branchId: order.branchId,
            productId: order.product.id,
            unitCode: input.unitCode,
            qtyChange: Number(input.qtyCompleted),
            cost: derivedUnitCost,
            type: 'PRODUCTION_RECEIPT',
            referenceType: 'ProductionOrder',
            referenceId: order.id,
            createdById: input.createdById,
        });

        const completion = await tx.productionCompletion.create({
            data: {
                companyId: input.companyId,
                branchId: order.branchId,
                productionOrderId: order.id,
                productId: order.product.id,
                unitCode: input.unitCode,
                qtyCompleted: Number(input.qtyCompleted),
                unitCost: Number(movement.cost || derivedUnitCost || 0),
                notes: input.notes?.trim() || undefined,
                createdById: input.createdById,
            },
        });

        await CoreAccountingService.recordProductionReceipt(tx as any, {
            id: completion.id,
            companyId: input.companyId,
            branchId: order.branchId,
            productionNo: order.productionNo,
            productId: order.product.id,
            qty: Number(input.qtyCompleted),
            unitCost: Number(movement.cost || derivedUnitCost || 0),
            postedAt: completionTimestamp,
            postedById: input.createdById,
        });

        const nextCompletedQty = roundQty(Number(order.completedQty || 0) + Number(input.qtyCompleted));
        const nextScrapQty = roundQty(Number(order.scrapQty || 0) + Number(input.scrapQty || 0));
        const isDone = nextCompletedQty + nextScrapQty >= Number(order.plannedQty || 0);

        await tx.productionOrder.update({
            where: { id: order.id },
            data: {
                status: isDone ? 'COMPLETED' : 'IN_PROGRESS',
                completedQty: { increment: Number(input.qtyCompleted) },
                scrapQty: { increment: Number(input.scrapQty || 0) },
                actualStartDate: order.actualStartDate || completionTimestamp,
                actualEndDate: isDone ? completionTimestamp : order.actualEndDate,
            },
        });

        return this.getOrderOrThrow(tx, input.companyId, order.id);
    }

    static async cancelOrder(tx: any, input: { companyId: string; orderId: string }) {
        const order = await this.getOrderOrThrow(tx, input.companyId, input.orderId);
        if (order.status === 'CANCELLED') return order;
        if (order.status === 'COMPLETED') throw AppError.badRequest('Completed production order cannot be cancelled');
        if ((order.consumptions || []).length > 0 || (order.completions || []).length > 0) {
            throw AppError.badRequest('Production order with transactions cannot be cancelled');
        }

        await tx.productionOrder.update({
            where: { id: order.id },
            data: { status: 'CANCELLED' },
        });

        return this.getOrderOrThrow(tx, input.companyId, order.id);
    }
}
