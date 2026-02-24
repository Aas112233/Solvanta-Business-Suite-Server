
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS } from '../src/config/permissions.js';

const prisma = new PrismaClient();

async function updateAdminPermissions() {
    console.log('Connecting to database...');
    try {
        // Find the Admin role
        const adminRole = await prisma.role.findFirst({
            where: { name: 'Admin' }
        });

        if (!adminRole) {
            console.error('Admin role not found!');
            return;
        }

        console.log(`Found Admin role: ${adminRole.id}`);
        console.log('Old permissions count:', adminRole.permissions.length);

        // Update permissions to ALL_PERMISSIONS
        await prisma.role.update({
            where: { id: adminRole.id },
            data: {
                permissions: ALL_PERMISSIONS
            }
        });

        console.log('Successfully updated Admin role permissions.');
        console.log('New permissions count:', ALL_PERMISSIONS.length);
        console.log('New permissions:', ALL_PERMISSIONS);

    } catch (error) {
        console.error('Error updating permissions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateAdminPermissions();
