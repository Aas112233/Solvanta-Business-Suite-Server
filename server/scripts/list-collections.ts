import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Checking database name and collections...');
        const collections = await prisma.$runCommandRaw({
            listCollections: 1
        });
        console.log(JSON.stringify(collections, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
