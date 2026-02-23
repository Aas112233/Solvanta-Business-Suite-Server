import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'test@a.com';
    // const email = 'Test@A.com'; // Test normalization
    const password = '12345678';

    console.log(`Setting up user: ${email}`);

    // 1. Get Company
    const company = await prisma.company.findFirst();
    if (!company) throw new Error('No company found');
    console.log(`Using Company: ${company.name} (${company.id})`);

    // 2. Get Role (Prefer 'Admin')
    let role = await prisma.role.findFirst({
        where: { companyId: company.id, name: { contains: 'Admin', mode: 'insensitive' } }
    });
    if (!role) {
        role = await prisma.role.findFirst({ where: { companyId: company.id } });
    }
    if (!role) throw new Error('No role found');
    console.log(`Using Role: ${role.name} (${role.id})`);

    // 3. Get Branch
    const branch = await prisma.branch.findFirst({ where: { companyId: company.id } });
    if (!branch) throw new Error('No branch found');
    console.log(`Using Branch: ${branch.name} (${branch.id})`);

    // 4. Hash Password
    const passwordHash = await bcrypt.hash(password, 12);

    // 5. Upsert User
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Normalized email:', normalizedEmail);

    const user = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
            passwordHash,
            companyId: company.id,
            isActive: true,
            roleId: role.id,
        },
        create: {
            email: normalizedEmail,
            name: 'Test Setup User',
            passwordHash,
            companyId: company.id,
            roleId: role.id,
            isActive: true, // Ensure active
        },
    });

    // 6. Link Branch
    // Clear existing
    await prisma.userBranch.deleteMany({ where: { userId: user.id } });
    // Add new
    await prisma.userBranch.create({
        data: { userId: user.id, branchId: branch.id }
    });

    console.log(`User ${user.email} (ID: ${user.id}) updated/created successfully with password: ${password}`);

    // 7. Verify Login Logic Locally (Simulate Auth Service)
    const verifyUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!verifyUser) throw new Error('User not found after creation');

    const isValid = await bcrypt.compare(password, verifyUser.passwordHash);
    console.log(`Local Password verification check: ${isValid ? 'PASSED' : 'FAILED'}`);
}

main()
    .catch(e => {
        console.error('Setup failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
