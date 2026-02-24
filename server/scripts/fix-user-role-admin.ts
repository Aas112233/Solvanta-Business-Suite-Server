import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS } from '../src/config/permissions';

const prisma = new PrismaClient();

async function main() {
    const email = 'test@a.com';
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        console.error('User test@a.com not found');
        return;
    }

    console.log(`Found user: ${user.email} with current role ID: ${user.roleId}`);

    // Check if Admin role exists
    let adminRole = await prisma.role.findFirst({
        where: {
            companyId: user.companyId,
            name: { equals: 'Admin', mode: 'insensitive' }
        }
    });

    if (!adminRole) {
        console.log('Admin role not found. Creating one...');
        adminRole = await prisma.role.create({
            data: {
                name: 'Admin',
                companyId: user.companyId,
                permissions: ALL_PERMISSIONS,
                description: 'Full system access',
                isSystem: true // Mark as system role if schema supports it, strictly speaking strict typing might fail if not in schema, let's check schema/types or just omit for safety as it wasn't in previous view
            }
        });
    } else {
        console.log('Admin role found. Updating permissions to ensure full access...');
        // Ensure it has all permissions
        await prisma.role.update({
            where: { id: adminRole.id },
            data: { permissions: ALL_PERMISSIONS }
        });
    }

    // Assign Role to User
    await prisma.user.update({
        where: { id: user.id },
        data: { roleId: adminRole.id }
    });

    console.log(`✅ Successfully updated user ${email} to Admin Role (${adminRole.id}) with ALL permissions.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
