const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const mappings = await prisma.accountMapping.findMany({
        where: {
            mappingType: 'OUTPUT_TAX'
        },
        include: {
            company: true
        }
    });

    console.log("Mappings for OUTPUT_TAX:");
    console.log(JSON.stringify(mappings, null, 2));

    const users = await prisma.user.findMany({
        select: {
            email: true,
            companyId: true,
            company: { select: { name: true } }
        }
    });
    console.log("\nUsers:");
    console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
