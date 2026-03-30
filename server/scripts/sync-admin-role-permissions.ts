import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS } from '../src/config/permissions.js';

const prisma = new PrismaClient();

async function main() {
    const adminRoles = await prisma.role.findMany({
        where: {
            name: {
                equals: 'Admin',
                mode: 'insensitive',
            },
        },
        select: {
            id: true,
            companyId: true,
            name: true,
            permissions: true,
        },
    });

    let updated = 0;

    for (const role of adminRoles) {
        const nextPermissions = Array.from(new Set([...role.permissions, ...ALL_PERMISSIONS]));
        if (nextPermissions.length === role.permissions.length) continue;

        await prisma.role.update({
            where: { id: role.id },
            data: {
                permissions: nextPermissions,
            },
        });
        updated += 1;
    }

    console.log(`Admin roles scanned: ${adminRoles.length}`);
    console.log(`Admin roles updated: ${updated}`);
    console.log(`Total permissions available: ${ALL_PERMISSIONS.length}`);
}

main()
    .catch((error) => {
        console.error('sync-admin-role-permissions failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
