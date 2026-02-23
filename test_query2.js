const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const company = await prisma.company.findFirst();
    const possibleTargets = [
        { type: 'GLOBAL', id: null }
    ];

    // TEST 1: The original query 
    const q1 = await prisma.accountMapping.findMany({
        where: {
            companyId: company.id,
            mappingType: 'OUTPUT_TAX',
            OR: possibleTargets.map(t => ({
                entityType: t.type,
                entityId: t.id
            }))
        }
    });

    // TEST 2: Omitting entityId when null
    const q2 = await prisma.accountMapping.findMany({
        where: {
            companyId: company.id,
            mappingType: 'OUTPUT_TAX',
            OR: possibleTargets.map(t => {
                const target = { entityType: t.type };
                if (t.id) target.entityId = t.id;
                return target;
            })
        }
    });

    console.log(`Q1: ${q1.length} mappings.`);
    console.log(`Q2: ${q2.length} mappings.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
