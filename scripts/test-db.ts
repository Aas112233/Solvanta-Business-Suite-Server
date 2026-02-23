import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function testConnection() {
    console.log('Attempting to connect to MongoDB Atlas using Prisma...');

    try {
        await prisma.$connect();
        console.log('Prisma connected successfully!');

        const count = await prisma.user.count();
        console.log(`User count: ${count}`);

        const firstUser = await prisma.user.findFirst({ select: { email: true } });
        console.log(`First user found: ${firstUser?.email || 'None'}`);

        await prisma.$disconnect();
        console.log('Test completed successfully.');
        process.exit(0);
    } catch (error: any) {
        console.error('Connection/Query failed:');
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

testConnection();
