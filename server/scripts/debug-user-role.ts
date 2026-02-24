import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'test@a.com';
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
            role: true
        }
    });

    if (!user) {
        console.log('User not found');
        return;
    }

    console.log('User:', user.name, user.email);
    console.log('Role:', user.role?.name);
    console.log('Permissions:', user.role?.permissions);

    if (user.role?.permissions.includes('admin.manageUsers')) {
        console.log('✅ User has admin.manageUsers permission');
    } else {
        console.log('❌ User MISSING admin.manageUsers permission');
    }
}

main()
    .finally(() => prisma.$disconnect());
