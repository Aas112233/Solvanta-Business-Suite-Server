import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding items module data...');

    // Assuming we seed for the first company found or a specific one?
    // Usually seeds are for a specific setup or demo. 
    // I'll grab the first company.
    const company = await prisma.company.findFirst();
    if (!company) {
        console.log('No company found. Seeding skipped.');
        return;
    }
    const companyId = company.id;

    // Categories
    await prisma.category.upsert({
        where: { companyId_name: { companyId, name: 'General' } },
        update: {},
        create: { companyId, name: 'General' }
    });

    // Groups
    await (prisma as any).itemGroup.upsert({
        where: { companyId_name: { companyId, name: 'General' } },
        update: {},
        create: { companyId, name: 'General' }
    });

    // Price Groups
    await prisma.priceGroup.upsert({
        where: { companyId_name: { companyId, name: 'Retail' } },
        update: {},
        // @ts-ignore
        create: { companyId, name: 'Retail', isDefault: true, code: 'RTL' }
    });

    await prisma.priceGroup.upsert({
        where: { companyId_name: { companyId, name: 'Wholesale' } },
        update: {},
        // @ts-ignore
        create: { companyId, name: 'Wholesale', isDefault: false, code: 'WHL' }
    });

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        // @ts-ignore
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
