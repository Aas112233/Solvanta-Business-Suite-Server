
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Get a valid companyId from first product
    const p = await prisma.product.findFirst();
    const companyId = p?.companyId;
    console.log('Using CompanyID:', companyId);

    console.log('--- TEST 4: Nested AND/OR query (Original GET structure) ---');
    try {
        const where: any = {
            companyId: companyId,
            AND: [
                { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
            ],
        };

        // Simulate search adding to AND
        where.AND.push({
            OR: [
                { name: { contains: 'test', mode: 'insensitive' } },
                { itemCode: { contains: 'test', mode: 'insensitive' } }
            ]
        });

        const nestedQuery = await prisma.product.findMany({
            where,
            take: 5
        });
        console.log('Found:', nestedQuery.length);
    } catch (e: any) { console.log('Nested query error:', e.message); }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
