import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Checking indexes for users collection...');
        const indexes = await prisma.$runCommandRaw({
            listIndexes: 'users'
        });
        console.log(JSON.stringify(indexes, null, 2));
    } catch (error) {
        console.error('Error checking indexes:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
