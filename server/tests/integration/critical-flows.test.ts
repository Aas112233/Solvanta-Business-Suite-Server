import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { basePrisma } from '../../src/lib/prisma.js';
import { env } from '../../src/config/env.js';
import { PERMISSIONS } from '../../src/config/permissions.js';

type TestUserContext = {
    companyId: string;
    userId: string;
    token: string;
    branchIds: string[];
};

type ApiResponse = {
    status: number;
    body: any;
};

const db = basePrisma as any;
const createdCompanyIds = new Set<string>();

let server: any;
let baseUrl = '';
let seq = 0;

function unique(prefix: string): string {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
}

function nextItemCode(): string {
    seq += 1;
    return `${String(Date.now()).slice(-10)}${String(seq).padStart(6, '0')}`;
}

async function apiRequest(
    method: string,
    path: string,
    options: {
        token: string;
        branchId?: string;
        body?: Record<string, unknown>;
    }
): Promise<ApiResponse> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${options.token}`,
    };

    if (options.branchId) {
        headers['x-branch-id'] = options.branchId;
    }

    let body: string | undefined;
    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
    }

    const response = await fetch(`${baseUrl}/api/v1${path}`, {
        method,
        headers,
        body,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;

    return {
        status: response.status,
        body: parsed,
    };
}

async function createTestUserContext(params: {
    branchCount?: number;
    accessibleBranchIndexes?: number[];
    permissions: string[];
}): Promise<TestUserContext> {
    const branchCount = params.branchCount ?? 1;
    const accessibleIndexes = params.accessibleBranchIndexes ?? [0];

    const company = await db.company.create({
        data: {
            name: unique('company'),
            settings: {},
        },
    });
    createdCompanyIds.add(company.id);

    const branches: Array<{ id: string }> = [];
    for (let i = 0; i < branchCount; i += 1) {
        const branch = await db.branch.create({
            data: {
                companyId: company.id,
                name: unique(`branch-${i + 1}`),
                code: unique(`B${i + 1}`).slice(0, 10).toUpperCase(),
            },
            select: { id: true },
        });
        branches.push(branch);
    }

    const role = await db.role.create({
        data: {
            companyId: company.id,
            name: unique('role'),
            permissions: params.permissions,
        },
    });

    const user = await db.user.create({
        data: {
            companyId: company.id,
            email: `${unique('user')}@example.com`,
            name: unique('User'),
            passwordHash: 'test-hash',
            roleId: role.id,
            isActive: true,
        },
    });

    const selectedBranchIds = accessibleIndexes
        .filter((idx) => idx >= 0 && idx < branches.length)
        .map((idx) => branches[idx]!.id);

    if (selectedBranchIds.length > 0) {
        await db.userBranch.createMany({
            data: selectedBranchIds.map((branchId) => ({
                userId: user.id,
                branchId,
            })),
        });
    }

    const token = jwt.sign(
        {
            userId: user.id,
            companyId: company.id,
        },
        env.JWT_SECRET
    );

    return {
        companyId: company.id,
        userId: user.id,
        token,
        branchIds: branches.map((b) => b.id),
    };
}

async function createProduct(params: {
    companyId: string;
    name: string;
    salePrice: number;
    costPrice: number;
    unitCode?: string;
    taxRate?: number;
}): Promise<{ id: string; unitCode: string }> {
    const unitCode = (params.unitCode ?? 'PCS').toUpperCase();
    const product = await db.product.create({
        data: {
            companyId: params.companyId,
            itemCode: nextItemCode(),
            name: params.name,
            barcodes: [],
            taxRate: params.taxRate ?? 0,
            status: 'ACTIVE',
            units: {
                create: [
                    {
                        unitName: unitCode,
                        unitCode,
                        qtyInBaseUnit: 1,
                        salePrice: params.salePrice,
                        costPrice: params.costPrice,
                        isDefaultSaleUnit: true,
                        isBase: true,
                    },
                ],
            },
        },
        select: { id: true },
    });

    return { id: product.id, unitCode };
}

async function createSupplier(companyId: string): Promise<{ id: string }> {
    return db.supplier.create({
        data: {
            companyId,
            supplierCode: unique('SUP').slice(0, 20),
            name: unique('Supplier'),
        },
        select: { id: true },
    });
}

async function createCustomer(companyId: string, priceGroupId?: string): Promise<{ id: string }> {
    return db.customer.create({
        data: {
            companyId,
            customerCode: unique('CUS').slice(0, 20),
            name: unique('Customer'),
            creditLimit: 100000,
            openingBalance: 0,
            tags: [],
            priceGroupId: priceGroupId ?? null,
        },
        select: { id: true },
    });
}

async function upsertStock(params: {
    companyId: string;
    branchId: string;
    productId: string;
    unitCode: string;
    qty: number;
    avgCost?: number;
}) {
    const existing = await db.inventoryStock.findFirst({
        where: {
            companyId: params.companyId,
            branchId: params.branchId,
            productId: params.productId,
            unitCode: params.unitCode,
            batchNo: null,
            expDate: null,
        },
        select: { id: true },
    });

    if (existing) {
        return db.inventoryStock.update({
            where: { id: existing.id },
            data: {
                qtyOnHand: params.qty,
                avgCost: params.avgCost ?? 0,
            },
        });
    }

    return db.inventoryStock.create({
        data: {
            companyId: params.companyId,
            branchId: params.branchId,
            productId: params.productId,
            unitCode: params.unitCode,
            qtyOnHand: params.qty,
            avgCost: params.avgCost ?? 0,
            batchNo: null,
            expDate: null,
        },
    });
}

beforeAll(async () => {
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
    if (server) {
        await new Promise<void>((resolve, reject) => {
            server.close((err: Error | undefined) => (err ? reject(err) : resolve()));
        });
    }
    await basePrisma.$disconnect();
}, 30000);

describe.sequential('Critical Integration Flows', { timeout: 120000 }, () => {
    it('POS sell + post-batch should maintain invoice and stock integrity', async () => {
        const ctx = await createTestUserContext({
            permissions: [PERMISSIONS.POS_SELL],
        });
        const branchId = ctx.branchIds[0]!;
        const product = await createProduct({
            companyId: ctx.companyId,
            name: unique('POS Product'),
            salePrice: 50,
            costPrice: 20,
            taxRate: 0,
        });

        await upsertStock({
            companyId: ctx.companyId,
            branchId,
            productId: product.id,
            unitCode: product.unitCode,
            qty: 2,
            avgCost: 20,
        });

        const postedSale = await apiRequest('POST', '/pos/invoices', {
            token: ctx.token,
            branchId,
            body: {
                paymentMethod: 'CASH',
                cashReceived: 50,
                items: [
                    {
                        productId: product.id,
                        unitCode: product.unitCode,
                        qty: 1,
                    },
                ],
            },
        });

        expect(postedSale.status).toBe(201);
        expect(postedSale.body.success).toBe(true);
        expect(postedSale.body.data.isPosted).toBe(true);

        const unpostedSale = await apiRequest('POST', '/pos/invoices', {
            token: ctx.token,
            branchId,
            body: {
                paymentMethod: 'CASH',
                cashReceived: 250,
                items: [
                    {
                        productId: product.id,
                        unitCode: product.unitCode,
                        qty: 5,
                    },
                ],
            },
        });

        expect(unpostedSale.status).toBe(201);
        expect(unpostedSale.body.data.isPosted).toBe(false);
        expect(unpostedSale.body.data.status).toBe('UNPOSTED');

        await db.inventoryStock.updateMany({
            where: {
                companyId: ctx.companyId,
                branchId,
                productId: product.id,
                unitCode: product.unitCode,
                batchNo: null,
                expDate: null,
            },
            data: {
                qtyOnHand: { increment: 10 },
            },
        });

        const batchPost = await apiRequest('POST', '/pos/post-batch', {
            token: ctx.token,
            branchId,
            body: {
                invoiceIds: [unpostedSale.body.data.id],
            },
        });

        expect(batchPost.status).toBe(200);
        expect(batchPost.body.success).toBe(true);
        expect(batchPost.body.data[0].status).toBe('success');

        const invoiceAfterPost = await db.pOSInvoice.findUnique({
            where: { id: unpostedSale.body.data.id },
            select: { isPosted: true, status: true },
        });
        expect(invoiceAfterPost?.isPosted).toBe(true);

        const stockAfter = await db.inventoryStock.findFirst({
            where: {
                companyId: ctx.companyId,
                branchId,
                productId: product.id,
                unitCode: product.unitCode,
                batchNo: null,
                expDate: null,
            },
            select: { qtyOnHand: true },
        });
        expect(Number(stockAfter?.qtyOnHand)).toBe(6);
    });

    it('Purchase + return + payment should produce consistent totals and stock', async () => {
        const ctx = await createTestUserContext({
            permissions: [
                PERMISSIONS.PURCHASE_CREATE,
                PERMISSIONS.PURCHASE_VIEW,
                PERMISSIONS.PURCHASE_RETURN,
                PERMISSIONS.PURCHASE_PAYMENT,
            ],
        });
        const branchId = ctx.branchIds[0]!;
        const supplier = await createSupplier(ctx.companyId);
        const product = await createProduct({
            companyId: ctx.companyId,
            name: unique('Purchase Product'),
            salePrice: 20,
            costPrice: 10,
            taxRate: 0,
        });

        const purchaseCreate = await apiRequest('POST', '/purchases', {
            token: ctx.token,
            body: {
                supplierId: supplier.id,
                branchId,
                paymentMethod: 'CREDIT',
                items: [
                    {
                        productId: product.id,
                        unitCode: product.unitCode,
                        qty: 10,
                        unitCost: 10,
                        taxAmount: 5,
                        lineTotal: 100,
                    },
                ],
            },
        });

        expect(purchaseCreate.status).toBe(201);
        expect(purchaseCreate.body.success).toBe(true);

        const purchaseId = purchaseCreate.body.data.id;
        const purchaseItemId = purchaseCreate.body.data.items[0].id;

        const purchaseStock = await db.inventoryStock.findFirst({
            where: {
                companyId: ctx.companyId,
                branchId,
                productId: product.id,
                unitCode: product.unitCode,
                batchNo: null,
                expDate: null,
            },
            select: { qtyOnHand: true },
        });
        expect(Number(purchaseStock?.qtyOnHand)).toBe(10);

        const purchaseReturn = await apiRequest('POST', `/purchases/${purchaseId}/returns`, {
            token: ctx.token,
            body: {
                items: [
                    {
                        purchaseItemId,
                        qty: 3,
                    },
                ],
                reason: 'Damaged at receipt',
            },
        });

        expect(purchaseReturn.status).toBe(201);
        expect(purchaseReturn.body.success).toBe(true);
        expect(purchaseReturn.body.data.status).toBe('POSTED');

        const stockAfterReturn = await db.inventoryStock.findFirst({
            where: {
                companyId: ctx.companyId,
                branchId,
                productId: product.id,
                unitCode: product.unitCode,
                batchNo: null,
                expDate: null,
            },
            select: { qtyOnHand: true },
        });
        expect(Number(stockAfterReturn?.qtyOnHand)).toBe(7);

        const payment = await apiRequest('POST', `/purchases/${purchaseId}/payments`, {
            token: ctx.token,
            body: {
                amount: 50,
                paymentMethod: 'CASH',
                notes: 'Part payment',
            },
        });

        expect(payment.status).toBe(201);
        expect(payment.body.success).toBe(true);

        const paymentSummary = await apiRequest('GET', `/purchases/${purchaseId}/payments`, {
            token: ctx.token,
        });

        expect(paymentSummary.status).toBe(200);
        expect(paymentSummary.body.success).toBe(true);
        expect(Number(paymentSummary.body.data.totals.paid)).toBe(50);
        expect(Number(paymentSummary.body.data.totals.outstanding)).toBeCloseTo(55, 6);
    });

    it('Transfer send/receive should move stock correctly across branches', async () => {
        const ctx = await createTestUserContext({
            branchCount: 2,
            accessibleBranchIndexes: [0, 1],
            permissions: [PERMISSIONS.INVENTORY_TRANSFER, PERMISSIONS.INVENTORY_VIEW],
        });
        const fromBranchId = ctx.branchIds[0]!;
        const toBranchId = ctx.branchIds[1]!;
        const product = await createProduct({
            companyId: ctx.companyId,
            name: unique('Transfer Product'),
            salePrice: 30,
            costPrice: 12,
            taxRate: 0,
        });

        await upsertStock({
            companyId: ctx.companyId,
            branchId: fromBranchId,
            productId: product.id,
            unitCode: product.unitCode,
            qty: 8,
            avgCost: 12,
        });

        const transferCreate = await apiRequest('POST', '/inventory/transfers', {
            token: ctx.token,
            body: {
                fromBranchId,
                toBranchId,
                items: [
                    {
                        productId: product.id,
                        unitCode: product.unitCode,
                        qty: 5,
                    },
                ],
            },
        });

        expect(transferCreate.status).toBe(200);
        expect(transferCreate.body.success).toBe(true);

        const transferId = transferCreate.body.data.id;

        const transferSend = await apiRequest('POST', `/inventory/transfers/${transferId}/send`, {
            token: ctx.token,
        });

        expect(transferSend.status).toBe(200);
        expect(transferSend.body.success).toBe(true);

        const sourceAfterSend = await db.inventoryStock.findFirst({
            where: {
                companyId: ctx.companyId,
                branchId: fromBranchId,
                productId: product.id,
                unitCode: product.unitCode,
                batchNo: null,
                expDate: null,
            },
            select: { qtyOnHand: true },
        });
        expect(Number(sourceAfterSend?.qtyOnHand)).toBe(3);

        const transferReceive = await apiRequest('POST', `/inventory/transfers/${transferId}/receive`, {
            token: ctx.token,
        });

        expect(transferReceive.status).toBe(200);
        expect(transferReceive.body.success).toBe(true);

        const destinationStock = await db.inventoryStock.findFirst({
            where: {
                companyId: ctx.companyId,
                branchId: toBranchId,
                productId: product.id,
                unitCode: product.unitCode,
                batchNo: null,
                expDate: null,
            },
            select: { qtyOnHand: true },
        });
        expect(Number(destinationStock?.qtyOnHand)).toBe(5);

        const transferRecord = await db.transfer.findUnique({
            where: { id: transferId },
            select: { status: true },
        });
        expect(transferRecord?.status).toBe('RECEIVED');
    });

    it('POS should resolve channel pricing from customer price group override', async () => {
        const ctx = await createTestUserContext({
            permissions: [PERMISSIONS.POS_SELL],
        });
        const branchId = ctx.branchIds[0]!;

        const priceGroup = await db.priceGroup.create({
            data: {
                companyId: ctx.companyId,
                name: unique('Channel'),
                isDefault: false,
            },
            select: { id: true },
        });

        const product = await createProduct({
            companyId: ctx.companyId,
            name: unique('Channel Product'),
            salePrice: 100,
            costPrice: 50,
            taxRate: 0,
        });

        await db.productPriceGroup.create({
            data: {
                productId: product.id,
                priceGroupId: priceGroup.id,
                unitCode: product.unitCode,
                salePrice: 80,
            },
        });

        const customer = await createCustomer(ctx.companyId, priceGroup.id);

        await upsertStock({
            companyId: ctx.companyId,
            branchId,
            productId: product.id,
            unitCode: product.unitCode,
            qty: 2,
            avgCost: 50,
        });

        const sale = await apiRequest('POST', '/pos/invoices', {
            token: ctx.token,
            branchId,
            body: {
                customerId: customer.id,
                paymentMethod: 'CASH',
                cashReceived: 80,
                items: [
                    {
                        productId: product.id,
                        unitCode: product.unitCode,
                        qty: 1,
                    },
                ],
            },
        });

        expect(sale.status).toBe(201);
        expect(sale.body.success).toBe(true);
        expect(Number(sale.body.data.items[0].unitPrice)).toBe(80);
        expect(Number(sale.body.data.items[0].lineTotal)).toBe(80);
    });

    it('branch/company access control should block unauthorized cross-scope operations', async () => {
        const userA = await createTestUserContext({
            branchCount: 2,
            accessibleBranchIndexes: [0],
            permissions: [PERMISSIONS.INVENTORY_TRANSFER, PERMISSIONS.INVENTORY_VIEW],
        });

        const fromBranchId = userA.branchIds[0]!;
        const restrictedBranchId = userA.branchIds[1]!;

        const productA = await createProduct({
            companyId: userA.companyId,
            name: unique('ACL Product'),
            salePrice: 40,
            costPrice: 15,
            taxRate: 0,
        });

        await upsertStock({
            companyId: userA.companyId,
            branchId: fromBranchId,
            productId: productA.id,
            unitCode: productA.unitCode,
            qty: 10,
            avgCost: 15,
        });

        const forbiddenTransfer = await apiRequest('POST', '/inventory/transfers', {
            token: userA.token,
            body: {
                fromBranchId,
                toBranchId: restrictedBranchId,
                items: [
                    {
                        productId: productA.id,
                        unitCode: productA.unitCode,
                        qty: 1,
                    },
                ],
            },
        });

        expect(forbiddenTransfer.status).toBe(403);
        expect(forbiddenTransfer.body.success).toBe(false);

        const userB = await createTestUserContext({
            branchCount: 2,
            accessibleBranchIndexes: [0, 1],
            permissions: [PERMISSIONS.INVENTORY_TRANSFER],
        });

        const productB = await createProduct({
            companyId: userB.companyId,
            name: unique('OtherCo Product'),
            salePrice: 60,
            costPrice: 20,
            taxRate: 0,
        });

        const transferOtherCompany = await db.transfer.create({
            data: {
                companyId: userB.companyId,
                fromBranchId: userB.branchIds[0],
                toBranchId: userB.branchIds[1],
                transferNo: unique('TRF'),
                status: 'DRAFT',
                createdById: userB.userId,
                items: {
                    create: [
                        {
                            productId: productB.id,
                            unitCode: productB.unitCode,
                            qty: 1,
                        },
                    ],
                },
            },
            select: { id: true },
        });

        const crossCompanySend = await apiRequest('POST', `/inventory/transfers/${transferOtherCompany.id}/send`, {
            token: userA.token,
        });

        expect(crossCompanySend.status).toBe(404);
        expect(crossCompanySend.body.success).toBe(false);
    });
});
