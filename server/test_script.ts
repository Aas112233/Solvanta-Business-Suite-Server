import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'admin@test.com' },
        include: { role: true, company: true },
    });
    console.log("User:", JSON.stringify(user, null, 2));

    if (user && user.companyId) {
        const roles = await prisma.role.findMany({ where: { companyId: user.companyId } });
        console.log("Roles for this company:", roles.map(r => r.name));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
