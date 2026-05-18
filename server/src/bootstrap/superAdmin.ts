import bcrypt from 'bcryptjs';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import {
    ALL_SUPER_ADMIN_PERMISSIONS,
    SUPER_ADMIN_ROLE_TEMPLATES,
} from '../modules/super-admin/super-admin.permissions.js';
import {
    DEFAULT_COMPANY_DOCUMENT_SETTINGS,
    DEFAULT_COMPANY_CURRENCY,
    DEFAULT_COMPANY_REGIONAL_SETTINGS,
} from '../utils/companySettings.js';

interface EnsureSuperAdminOptions {
    resetPassword?: boolean;
    source?: 'startup' | 'script';
}

interface EnsureSuperAdminResult {
    email: string;
    created: boolean;
    passwordApplied: boolean;
    companyId: string;
    companyName: string;
    branchCount: number;
}

function readBootstrapConfig() {
    return {
        email: env.SUPER_ADMIN_EMAIL.trim().toLowerCase(),
        password: process.env.SUPER_ADMIN_PASSWORD?.trim() || '',
        name: process.env.SUPER_ADMIN_NAME?.trim() || 'Platform Admin',
        companyId: process.env.SUPER_ADMIN_COMPANY_ID?.trim() || undefined,
        companyName: process.env.SUPER_ADMIN_COMPANY_NAME?.trim() || undefined,
    };
}

async function withDatabase<T>(callback: (db: Db) => Promise<T>) {
    const client = new MongoClient(env.DATABASE_URL);
    await client.connect();

    try {
        return await callback(client.db());
    } finally {
        await client.close();
    }
}

async function ensureCompany(db: Db, companyId?: string, companyName?: string) {
    const companies = db.collection('companies');

    if (companyId) {
        const company = await companies.findOne({ _id: new ObjectId(companyId) });
        if (!company) {
            throw new Error(`Company not found for SUPER_ADMIN_COMPANY_ID=${companyId}`);
        }
        return company;
    }

    if (companyName) {
        const company = await companies.findOne({ name: companyName });
        if (company) return company;
    }

    const existing = await companies.find({}, { sort: { createdAt: 1 } }).limit(1).next();
    if (existing) return existing;

    const now = new Date();
    const created = {
        _id: new ObjectId(),
        name: companyName || 'Default Company',
        currency: DEFAULT_COMPANY_CURRENCY,
        settings: {
            regional: {
                timezone: DEFAULT_COMPANY_REGIONAL_SETTINGS.timezone,
                dateFormat: DEFAULT_COMPANY_REGIONAL_SETTINGS.dateFormat,
                timeFormat: DEFAULT_COMPANY_REGIONAL_SETTINGS.timeFormat,
                language: DEFAULT_COMPANY_REGIONAL_SETTINGS.language,
            },
            documents: {
                invoicePrefix: DEFAULT_COMPANY_DOCUMENT_SETTINGS.invoicePrefix,
                quotationPrefix: DEFAULT_COMPANY_DOCUMENT_SETTINGS.quotationPrefix,
                salesOrderPrefix: DEFAULT_COMPANY_DOCUMENT_SETTINGS.salesOrderPrefix,
            },
        },
        createdAt: now,
        updatedAt: now,
    };

    await companies.insertOne(created);
    return created;
}

async function ensurePlatformAdminRole(db: Db, companyId: ObjectId) {
    const roles = db.collection('roles');
    const existingAdmin = await roles.findOne({
        companyId,
        name: SUPER_ADMIN_ROLE_TEMPLATES.PLATFORM_ADMIN.name,
    });

    if (existingAdmin) {
        const currentPermissions = [...((existingAdmin.permissions as string[]) || [])].sort().join(',');
        const expectedPermissions = [...ALL_SUPER_ADMIN_PERMISSIONS].sort().join(',');
        if (currentPermissions !== expectedPermissions) {
            await roles.updateOne({
                _id: existingAdmin._id,
            }, {
                $set: {
                    permissions: [...ALL_SUPER_ADMIN_PERMISSIONS],
                    updatedAt: new Date(),
                },
            });
        }
        return existingAdmin._id as ObjectId;
    }

    const now = new Date();
    const created = {
        _id: new ObjectId(),
        companyId,
        name: SUPER_ADMIN_ROLE_TEMPLATES.PLATFORM_ADMIN.name,
        permissions: [...ALL_SUPER_ADMIN_PERMISSIONS],
        createdAt: now,
        updatedAt: now,
    };

    await roles.insertOne(created);
    return created._id;
}

async function ensureBranches(db: Db, companyId: ObjectId) {
    const branches = await db.collection('branches').find({ companyId }).toArray();
    if (branches.length > 0) return branches.map((branch) => branch._id as ObjectId);

    const now = new Date();
    const created = {
        _id: new ObjectId(),
        companyId,
        name: 'Head Office',
        code: 'HQ',
        isActive: true,
        createdAt: now,
        updatedAt: now,
    };

    await db.collection('branches').insertOne(created);
    return [created._id];
}

export async function ensureConfiguredSuperAdmin(
    options: EnsureSuperAdminOptions = {},
) {
    const config = readBootstrapConfig();
    if (!config.email) {
        logger.info('Super admin bootstrap skipped: SUPER_ADMIN_EMAIL is not configured.');
        return null;
    }

    const result = await withDatabase(async (db) => {
        const company = await ensureCompany(db, config.companyId, config.companyName);
        const companyObjectId = company._id as ObjectId;
        const roleId = await ensurePlatformAdminRole(db, companyObjectId);
        const branchIds = await ensureBranches(db, companyObjectId);
        const users = db.collection('users');
        const existingUser = await users.findOne({ email: config.email });

        let passwordHash: string | undefined;
        const shouldApplyPassword = Boolean(config.password) && (!existingUser || options.resetPassword);

        if (shouldApplyPassword) {
            passwordHash = await bcrypt.hash(config.password, 12);
        }

        if (!existingUser && !passwordHash) {
            throw new Error(
                `SUPER_ADMIN_PASSWORD must be set before the configured super admin (${config.email}) can be created.`,
            );
        }

        const now = new Date();
        const userId = existingUser?._id ? existingUser._id as ObjectId : new ObjectId();

        if (existingUser) {
            await users.updateOne({
                _id: userId,
            }, {
                $set: {
                    companyId: companyObjectId,
                    name: config.name,
                    roleId,
                    isActive: true,
                    updatedAt: now,
                    ...(passwordHash ? { passwordHash } : {}),
                },
            });
        } else {
            await users.insertOne({
                _id: userId,
                companyId: companyObjectId,
                email: config.email,
                name: config.name,
                passwordHash: passwordHash!,
                roleId,
                isActive: true,
                failedLoginAttempts: 0,
                forcePasswordChange: false,
                refreshToken: null,
                lastLoginAt: null,
                passwordResetToken: null,
                passwordResetExpiresAt: null,
                lockedUntil: null,
                deletedAt: null,
                createdAt: now,
                updatedAt: now,
            });
        }

        const userBranches = db.collection('user_branches');
        await userBranches.deleteMany({ userId });
        if (branchIds.length > 0) {
            await userBranches.insertMany(branchIds.map((branchId) => ({
                _id: new ObjectId(),
                userId,
                branchId,
            })));
        }

        return {
            email: config.email,
            created: !existingUser,
            passwordApplied: Boolean(passwordHash),
            companyId: companyObjectId.toHexString(),
            companyName: String(company.name),
            branchCount: branchIds.length,
        } satisfies EnsureSuperAdminResult;
    });

    const source = options.source || 'startup';
    logger.info(
        `Super admin bootstrap (${source}) completed for ${result.email} `
        + `[created=${result.created}, passwordApplied=${result.passwordApplied}, branches=${result.branchCount}]`,
    );

    return result;
}
