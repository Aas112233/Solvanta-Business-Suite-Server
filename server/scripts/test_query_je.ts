import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const posJe = await prisma.journalEntry.findFirst({
        where: { sourceId: '69ad7f966e5f7b58b45baa6f' },
        include: {
            lines: {
                include: { account: true }
            }
        }
    });
    console.log("Journal Entry for MW-000031:");
    console.log(JSON.stringify(posJe, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
