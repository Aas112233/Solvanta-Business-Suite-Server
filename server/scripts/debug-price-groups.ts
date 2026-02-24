
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Testing priceGroup.findMany...');
    try {
        // Mocking user context by fetching first user (assuming tenant isolation)
        const user = await prisma.user.findFirst();
        if (!user) {
            console.log('No users found to simulate request.');
            return;
        }
        const companyId = user.companyId;
        console.log('Using CompanyID:', companyId);

        const groups = await prisma.priceGroup.findMany({
            where: { companyId },
            orderBy: { name: 'asc' }
        });
        console.log('Price Groups Found:', groups.length);
        console.log(JSON.stringify(groups, null, 2));

    } catch (e: any) {
        console.error('Error fetching priceGroups:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
