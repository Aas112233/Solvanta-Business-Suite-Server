const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const companies = await prisma.company.findMany();
    for (const company of companies) {
        console.log(`Processing company: ${company.name}`);

        const accounts = await prisma.account.findMany({
            where: { companyId: company.id }
        });

        const getAccountId = (code) => {
            const acc = accounts.find(a => a.code === code);
            if (!acc) throw new Error(`Account code ${code} not found`);
            return acc.id;
        };

        const mappings = [
            { type: 'CASH', code: '1100' },
            { type: 'BANK', code: '1200' },
            { type: 'ACCOUNT_RECEIVABLE', code: '1110' },
            { type: 'ACCOUNT_PAYABLE', code: '2100' },
            { type: 'INVENTORY_ASSET', code: '1300' },
            { type: 'INPUT_TAX', code: '1400' },
            { type: 'OUTPUT_TAX', code: '2200' },
            { type: 'SALES_REVENUE', code: '4100' },
            { type: 'COGS_EXPENSE', code: '5400' },
            { type: 'EXPENSE', code: '5100' },
            { type: 'SHRINKAGE_EXPENSE', code: '5100' },
            { type: 'DAMAGED_GOODS_EXPENSE', code: '5100' },
        ];

        for (const mapping of mappings) {
            try {
                const accountId = getAccountId(mapping.code);
                await prisma.accountMapping.upsert({
                    where: {
                        companyId_mappingType_entityType_entityId: {
                            companyId: company.id,
                            mappingType: mapping.type,
                            entityType: 'GLOBAL',
                            entityId: '000000000000000000000000' // Prisma handles null weirdly in unique constraints sometimes, but wait - the schema says entityId is String? and unique constraint includes it. Let's do a findFirst.
                        }
                    },
                    update: { accountId },
                    create: {
                        companyId: company.id,
                        mappingType: mapping.type,
                        entityType: 'GLOBAL',
                        accountId: accountId
                    }
                }).catch(async (e) => {
                    // Try exact match by looking for it first if UPSERT complains about unique nulls.
                    const existing = await prisma.accountMapping.findFirst({
                        where: {
                            companyId: company.id,
                            mappingType: mapping.type,
                            entityType: 'GLOBAL',
                            entityId: null
                        }
                    });
                    if (existing) {
                        await prisma.accountMapping.update({
                            where: { id: existing.id },
                            data: { accountId }
                        });
                    } else {
                        await prisma.accountMapping.create({
                            data: {
                                companyId: company.id,
                                mappingType: mapping.type,
                                entityType: 'GLOBAL',
                                accountId: accountId
                            }
                        });
                    }
                });
                console.log(`Mapped ${mapping.type} to account ${mapping.code}`);
            } catch (err) {
                console.error(`Failed mapping ${mapping.type}: ${err.message}`);
            }
        }
    }
    console.log('Finished fixing account mappings.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
