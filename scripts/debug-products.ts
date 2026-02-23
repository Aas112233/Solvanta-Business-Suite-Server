
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Fetching first 5 products to inspect...');
    try {
        const products = await prisma.product.findMany({
            take: 5,
            select: { id: true, itemCode: true, deletedAt: true, companyId: true }
        });
        console.log('Products:', JSON.stringify(products, null, 2));

        console.log('--- TEST 1: deletedAt: null ---');
        const explicitNull = await prisma.product.findMany({
            where: { deletedAt: null },
            take: 5
        });
        console.log('Found:', explicitNull.length);

        console.log('--- TEST 2: deletedAt: { isSet: false } ---');
        try {
            const isSetFalse = await prisma.product.findMany({
                where: { deletedAt: { isSet: false } } as any,
                take: 5
            });
            console.log('Found:', isSetFalse.length);
        } catch (e: any) { console.log('isSet not supported or error:', e.message); }

        console.log('--- TEST 3: OR query ---');
        try {
            const orQuery = await prisma.product.findMany({
                where: {
                    OR: [
                        { deletedAt: null },
                        { deletedAt: { isSet: false } }
                    ]
                } as any,
                take: 5
            });
            console.log('Found:', orQuery.length);
        } catch (e: any) { console.log('OR query error:', e.message); }

    } catch (e: any) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
