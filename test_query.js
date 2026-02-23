const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const company = await prisma.company.findFirst();
    const possibleTargets = [
        { type: 'GLOBAL', id: null }
    ];

    const mappings = await prisma.accountMapping.findMany({
        where: {
            companyId: company.id,
            mappingType: 'OUTPUT_TAX',
            OR: possibleTargets.map(t => ({
                entityType: t.type,
                entityId: t.id
            }))
        }
    });

    console.log(`Found ${mappings.length} mappings.`);
    console.dir(mappings);

    // Let's do another query without the OR
    const fallbacks = await prisma.accountMapping.findMany({
        where: {
            companyId: company.id,
            mappingType: 'OUTPUT_TAX',
            entityType: 'GLOBAL'
        }
    });

    console.log(`Fallback found ${fallbacks.length} mappings.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
