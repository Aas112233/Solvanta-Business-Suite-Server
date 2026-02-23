const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const accountsToCreate = [
    { code: '1100', name: 'Cash', type: 'ASSET', isSystem: true },
    { code: '1110', name: 'Accounts Receivable', type: 'ASSET', isSystem: true },
    { code: '1200', name: 'Bank Account', type: 'ASSET', isSystem: true },
    { code: '1300', name: 'Inventory', type: 'ASSET', isSystem: true },
    { code: '1400', name: 'VAT Input', type: 'ASSET', isSystem: true },
    { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', isSystem: true },
    { code: '2200', name: 'VAT Payable (Output VAT)', type: 'LIABILITY', isSystem: true },
    { code: '3100', name: 'Owner Equity', type: 'EQUITY', isSystem: true },
    { code: '3200', name: 'Retained Earnings', type: 'EQUITY', isSystem: true },
    { code: '4100', name: 'Sales Revenue', type: 'REVENUE', isSystem: true },
    { code: '4200', name: 'Other Income', type: 'REVENUE', isSystem: true },
    { code: '5100', name: 'General Expenses', type: 'EXPENSE', isSystem: true },
    { code: '5200', name: 'Rent Expense', type: 'EXPENSE', isSystem: true },
    { code: '5300', name: 'Salary Expense', type: 'EXPENSE', isSystem: true },
    { code: '5400', name: 'Cost of Goods Sold', type: 'EXPENSE', isSystem: true },
    { code: '5500', name: 'Utilities Expense', type: 'EXPENSE', isSystem: true },
];

const mappingsToCreate = [
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

async function main() {
    const companies = await prisma.company.findMany();
    for (const company of companies) {
        console.log(`Setting up accounts for company: ${company.name}`);

        for (const acctDef of accountsToCreate) {
            await prisma.account.upsert({
                where: { companyId_code: { companyId: company.id, code: acctDef.code } },
                update: { name: acctDef.name, type: acctDef.type, isSystem: acctDef.isSystem },
                create: {
                    companyId: company.id,
                    code: acctDef.code,
                    name: acctDef.name,
                    type: acctDef.type,
                    isSystem: acctDef.isSystem
                }
            });
        }

        const accounts = await prisma.account.findMany({ where: { companyId: company.id } });
        const getAccountId = (code) => {
            const acc = accounts.find(a => a.code === code);
            if (!acc) throw new Error(`Account code ${code} not found`);
            return acc.id;
        };

        for (const mapping of mappingsToCreate) {
            try {
                const accountId = getAccountId(mapping.code);
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
                console.log(`Mapped global ${mapping.type} to account code ${mapping.code}`);
            } catch (err) {
                console.error(`Failed mapping ${mapping.type}: ${err.message}`);
            }
        }
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
