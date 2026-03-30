/**
 * Create Super Admin User Script
 * Creates a super admin with specified credentials
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'mhassantoha@gmail.com';
const SUPER_ADMIN_PASSWORD = 'Aas112233@';
const SUPER_ADMIN_NAME = 'Muhammad Hassantoha';

async function createSuperAdmin() {
    try {
        console.log('🔧 Creating super admin user...\n');

        // Create a default company for super admin first
        console.log('🏢 Creating default company...');
        let company = await prisma.company.findFirst({
            where: { name: 'Solvanta HQ' },
        });

        if (!company) {
            company = await prisma.company.create({
                data: {
                    name: 'Solvanta HQ',
                    settings: {
                        currency: 'SAR',
                        timezone: 'Asia/Riyadh',
                        setupCompleted: true,
                    },
                },
            });
        }
        console.log(`✅ Company created: ${company.name} (${company.id})\n`);

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: { email: SUPER_ADMIN_EMAIL },
            include: { role: true },
        });

        if (existingUser) {
            console.log('⚠️  User already exists. Updating password...\n');

            // Update password
            const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
            await prisma.user.update({
                where: { id: existingUser.id },
                data: { passwordHash },
            });

            // Ensure role is superadmin
            if (existingUser.role?.name !== 'superadmin') {
                const superAdminRole = await prisma.role.findFirst({
                    where: { name: 'superadmin', companyId: company.id },
                });

                if (superAdminRole) {
                    await prisma.user.update({
                        where: { id: existingUser.id },
                        data: { roleId: superAdminRole.id },
                    });
                }
            }

            console.log('✅ Super admin password updated successfully!');
            console.log(`\n📧 Email: ${SUPER_ADMIN_EMAIL}`);
            console.log(`🔑 Password: ${SUPER_ADMIN_PASSWORD}`);
            console.log(`👤 User ID: ${existingUser.id}`);
            console.log(`🏢 Company: ${existingUser.companyId}`);
            return;
        }

        // Create or find super admin role
        let superAdminRole = await prisma.role.findFirst({
            where: { name: 'superadmin', companyId: company.id },
        });

        if (!superAdminRole) {
            console.log('📋 Creating super admin role...');
            superAdminRole = await prisma.role.create({
                data: {
                    companyId: company.id,
                    name: 'superadmin',
                    permissions: ['*'], // All permissions
                },
            });
            console.log('✅ Super admin role created!\n');
        }

        // Hash password
        console.log('🔐 Hashing password...');
        const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

        // Create super admin user
        console.log('👤 Creating super admin user...');
        const superAdmin = await prisma.user.create({
            data: {
                email: SUPER_ADMIN_EMAIL,
                name: SUPER_ADMIN_NAME,
                passwordHash,
                roleId: superAdminRole.id,
                companyId: company.id,
                isActive: true,
            },
        });

        // Create default branch
        console.log('📍 Creating default branch...');
        const branch = await prisma.branch.create({
            data: {
                companyId: company.id,
                name: 'Main Branch',
                code: 'MAIN',
            },
        });

        // Assign branch to user
        await prisma.userBranch.create({
            data: {
                userId: superAdmin.id,
                branchId: branch.id,
            },
        });

        // Set up default accounting accounts
        console.log('📊 Setting up accounting...');
        const accounts = await Promise.all([
            prisma.account.create({
                data: { companyId: company.id, code: '1100', name: 'Cash', type: 'ASSET', isSystem: true },
            }),
            prisma.account.create({
                data: { companyId: company.id, code: '1200', name: 'Bank', type: 'ASSET', isSystem: true },
            }),
            prisma.account.create({
                data: { companyId: company.id, code: '1110', name: 'Accounts Receivable', type: 'ASSET', isSystem: true },
            }),
            prisma.account.create({
                data: { companyId: company.id, code: '2100', name: 'Accounts Payable', type: 'LIABILITY', isSystem: true },
            }),
            prisma.account.create({
                data: { companyId: company.id, code: '4100', name: 'Sales Revenue', type: 'REVENUE', isSystem: true },
            }),
            prisma.account.create({
                data: { companyId: company.id, code: '5100', name: 'Operating Expenses', type: 'EXPENSE', isSystem: true },
            }),
        ]);

        // Create account mappings
        await prisma.accountMapping.createMany({
            data: [
                { companyId: company.id, mappingType: 'CASH', accountId: accounts[0].id, entityType: 'GLOBAL' },
                { companyId: company.id, mappingType: 'BANK', accountId: accounts[1].id, entityType: 'GLOBAL' },
                { companyId: company.id, mappingType: 'ACCOUNT_RECEIVABLE', accountId: accounts[2].id, entityType: 'GLOBAL' },
                { companyId: company.id, mappingType: 'ACCOUNT_PAYABLE', accountId: accounts[3].id, entityType: 'GLOBAL' },
                { companyId: company.id, mappingType: 'SALES_REVENUE', accountId: accounts[4].id, entityType: 'GLOBAL' },
            ],
        });

        console.log('\n✅ Super admin user created successfully!\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎉 SUPER ADMIN READY!');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`📧 Email:      ${SUPER_ADMIN_EMAIL}`);
        console.log(`🔑 Password:   ${SUPER_ADMIN_PASSWORD}`);
        console.log(`👤 Name:       ${SUPER_ADMIN_NAME}`);
        console.log(`🆔 User ID:    ${superAdmin.id}`);
        console.log(`🏢 Company:    ${company.name} (${company.id})`);
        console.log(`📍 Branch:     ${branch.name} (${branch.id})`);
        console.log('═══════════════════════════════════════════════════════');
        console.log('\n💡 Login at: http://localhost:3001/login');
        console.log('📝 Remember to change the password after first login!\n');

    } catch (error) {
        console.error('❌ Error creating super admin:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

createSuperAdmin();
