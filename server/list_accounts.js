const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const companies = await prisma.company.findMany();
    for (const company of companies) {
        console.log(`Company: ${company.name}`);
        const accounts = await prisma.account.findMany({
            where: { companyId: company.id }
        });
        console.log("Accounts:");
        accounts.forEach(a => console.log(` - ${a.code}: ${a.name} (${a.type})`));
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
