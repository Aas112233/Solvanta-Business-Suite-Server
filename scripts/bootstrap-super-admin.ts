import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { ALL_PERMISSIONS } from '../src/config/permissions.js';

const prisma = new PrismaClient();

const envSchema = z.object({
    SUPER_ADMIN_EMAIL: z.string().email(),
    SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
    SUPER_ADMIN_NAME: z.string().min(1).default('Platform Owner'),
    SUPER_ADMIN_COMPANY_ID: z.string().optional(),
    SUPER_ADMIN_COMPANY_NAME: z.string().optional(),
});

function generateStrongPassword(length = 20) {
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '!@#$%^&*_-+=';
    const all = `${lower}${upper}${digits}${symbols}`;

    const chars: string[] = [
        lower[randomInt(lower.length)],
        upper[randomInt(upper.length)],
        digits[randomInt(digits.length)],
        symbols[randomInt(symbols.length)],
    ];

    for (let i = chars.length; i < length; i += 1) {
        chars.push(all[randomInt(all.length)]);
    }

    for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
}

async function ensureCompany(companyId?: string, companyName?: string) {
    if (companyId) {
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) {
            throw new Error(`Company not found for SUPER_ADMIN_COMPANY_ID=${companyId}`);
        }
        return company;
    }

    if (companyName) {
        const company = await prisma.company.findFirst({ where: { name: companyName } });
        if (company) return company;
    }

    const existing = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;

    return prisma.company.create({
        data: {
            name: companyName || 'Default Company',
            currency: 'SAR',
            settings: {},
        },
    });
}

async function ensureAdminRole(companyId: string) {
    const roles = await prisma.role.findMany({
        where: { companyId },
        select: { id: true, name: true, permissions: true },
    });

    const existingAdmin = roles.find((role) => role.name.toLowerCase() === 'admin');
    if (existingAdmin) {
        if (existingAdmin.permissions.length !== ALL_PERMISSIONS.length) {
            await prisma.role.update({
                where: { id: existingAdmin.id },
                data: { permissions: ALL_PERMISSIONS },
            });
        }
        return existingAdmin.id;
    }

    const created = await prisma.role.create({
        data: {
            companyId,
            name: 'Admin',
            permissions: ALL_PERMISSIONS,
        },
        select: { id: true },
    });

    return created.id;
}

async function ensureBranches(companyId: string) {
    const branches = await prisma.branch.findMany({
        where: { companyId },
        select: { id: true, code: true },
    });

    if (branches.length > 0) return branches.map((branch) => branch.id);

    const created = await prisma.branch.create({
        data: {
            companyId,
            name: 'Head Office',
            code: 'HQ',
            isActive: true,
        },
        select: { id: true },
    });

    return [created.id];
}

async function main() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        console.error('Invalid or missing env for super admin bootstrap:');
        console.error(parsed.error.flatten().fieldErrors);
        process.exit(1);
    }

    const {
        SUPER_ADMIN_EMAIL,
        SUPER_ADMIN_PASSWORD,
        SUPER_ADMIN_NAME,
        SUPER_ADMIN_COMPANY_ID,
        SUPER_ADMIN_COMPANY_NAME,
    } = parsed.data;

    const password = SUPER_ADMIN_PASSWORD || generateStrongPassword(24);
    const passwordWasGenerated = !SUPER_ADMIN_PASSWORD;
    const passwordHash = await bcrypt.hash(password, 12);

    const company = await ensureCompany(SUPER_ADMIN_COMPANY_ID, SUPER_ADMIN_COMPANY_NAME);
    const roleId = await ensureAdminRole(company.id);
    const branchIds = await ensureBranches(company.id);

    const user = await prisma.user.upsert({
        where: { email: SUPER_ADMIN_EMAIL.toLowerCase() },
        create: {
            companyId: company.id,
            email: SUPER_ADMIN_EMAIL.toLowerCase(),
            name: SUPER_ADMIN_NAME,
            passwordHash,
            roleId,
            isActive: true,
        },
        update: {
            companyId: company.id,
            name: SUPER_ADMIN_NAME,
            passwordHash,
            roleId,
            isActive: true,
        },
        select: { id: true, email: true, name: true },
    });

    await prisma.userBranch.deleteMany({ where: { userId: user.id } });
    await prisma.userBranch.createMany({
        data: branchIds.map((branchId) => ({ userId: user.id, branchId })),
    });

    console.log('Super admin user is ready.');
    console.log(`Email: ${user.email}`);
    console.log(`Password: ${password}`);
    console.log(`Company: ${company.name} (${company.id})`);
    console.log(`Branches assigned: ${branchIds.length}`);
    if (passwordWasGenerated) {
        console.log('Password was generated automatically because SUPER_ADMIN_PASSWORD was not provided.');
    }
    console.log('Set SUPER_ADMIN_EMAILS and VITE_SUPER_ADMIN_EMAILS to this email for panel access.');
}

main()
    .catch((error) => {
        console.error('bootstrap-super-admin failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

