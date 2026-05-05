import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';

export const companyRoutes = Router();

companyRoutes.use(authenticate);

const companySettingsSchema = z.object({
    contact: z.object({
        phone: z.union([z.string().trim().max(40), z.literal(''), z.null()]).optional(),
        email: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
        website: z.union([z.string().trim().max(200), z.literal(''), z.null()]).optional(),
        address: z.union([z.string().trim().max(500), z.literal(''), z.null()]).optional(),
    }).partial().optional(),
    regional: z.object({
        timezone: z.string().trim().max(80).optional(),
        dateFormat: z.string().trim().max(30).optional(),
        timeFormat: z.enum(['12H', '24H']).optional(),
        language: z.string().trim().max(20).optional(),
    }).partial().optional(),
    inventory: z.object({ lowStockThreshold: z.number().min(0).max(1000000).optional(), }).partial().optional(),
    documents: z.object({
        invoicePrefix: z.string().trim().max(12).optional(),
        quotationPrefix: z.string().trim().max(12).optional(),
        salesOrderPrefix: z.string().trim().max(12).optional(),
    }).partial().optional(),
}).passthrough();

const updateCompanySchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    vatNumber: z.union([z.string().trim().max(60), z.null()]).optional(),
    currency: z.string().trim().min(3).max(10).optional(),
    logoUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
    settings: companySettingsSchema.optional(),
});

// GET /companies/me — current user's company
companyRoutes.get('/me', async (req, res, next) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.user!.companyId },
        });
        sendSuccess(res, company);
    } catch (error) { next(error); }
});

// PATCH /companies/me — update company settings
companyRoutes.patch('/me', requirePermission(PERMISSIONS.ADMIN_MANAGE_SETTINGS), validate({ body: updateCompanySchema }), async (req, res, next) => {
    try {
        const { name, vatNumber, currency, settings, logoUrl } = req.body as z.infer<typeof updateCompanySchema>;
        const existing = await prisma.company.findUnique({
            where: { id: req.user!.companyId },
            select: { settings: true },
        });

        const currentSettings = (existing?.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings))
            ? (existing.settings as Record<string, any>)
            : {};
        const incoming = settings || {};

        const mergedSettings = settings ? {
            ...currentSettings,
            ...incoming,
            contact: { ...(currentSettings.contact || {}), ...(incoming.contact || {}) },
            regional: { ...(currentSettings.regional || {}), ...(incoming.regional || {}) },
            inventory: { ...(currentSettings.inventory || {}), ...(incoming.inventory || {}) },
            documents: { ...(currentSettings.documents || {}), ...(incoming.documents || {}) },
            // Backward compatibility with legacy flat keys used in older seeds/builds.            lowStockThreshold: incoming.inventory?.lowStockThreshold ?? currentSettings.lowStockThreshold,
        } : currentSettings;

        const company = await prisma.company.update({
            where: { id: req.user!.companyId },
            data: {
                ...(name !== undefined && { name }),
                ...(vatNumber !== undefined && { vatNumber }),
                ...(currency !== undefined && { currency }),
                ...(settings !== undefined && { settings: mergedSettings as any }),
                ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
            },
        });
        sendSuccess(res, company);
    } catch (error) { next(error); }
});

// GET /companies/me/setup-status — check if tenant setup wizard is completed
companyRoutes.get('/me/setup-status', async (req, res, next) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.user!.companyId },
            select: { settings: true },
        });
        const settings = (company?.settings && typeof company.settings === 'object' && !Array.isArray(company.settings))
            ? company.settings as Record<string, any>
            : {};
        sendSuccess(res, { setupCompleted: settings.setupCompleted !== false });
    } catch (error) { next(error); }
});

// ── Default Chart of Accounts + Auto-Mappings ────────────────────────
const DEFAULT_SEED_ACCOUNTS = [
    { code: '1000', name: 'Cash', type: 'ASSET' as const },
    { code: '1010', name: 'Bank', type: 'ASSET' as const },
    { code: '1200', name: 'Accounts Receivable', type: 'ASSET' as const },
    { code: '1300', name: 'Inventory Asset', type: 'ASSET' as const },
    { code: '1400', name: 'Input Tax (VAT)', type: 'ASSET' as const },
    { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' as const },
    { code: '2100', name: 'Output Tax (VAT)', type: 'LIABILITY' as const },
    { code: '3000', name: 'Owner Equity', type: 'EQUITY' as const },
    { code: '3100', name: 'Retained Earnings', type: 'EQUITY' as const },
    { code: '4000', name: 'Sales Revenue', type: 'REVENUE' as const },
    { code: '4100', name: 'Sales Returns', type: 'REVENUE' as const },
    { code: '4200', name: 'Discount Given', type: 'REVENUE' as const },
    { code: '5000', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE' as const },
    { code: '5100', name: 'Purchase Returns', type: 'EXPENSE' as const },
    { code: '5200', name: 'Discount Received', type: 'EXPENSE' as const },
    { code: '5300', name: 'Damaged Goods', type: 'EXPENSE' as const },
    { code: '5400', name: 'Shrinkage', type: 'EXPENSE' as const },
    { code: '6000', name: 'General Expenses', type: 'EXPENSE' as const },
];

// Maps code → mapping type for auto-mapping
const AUTO_MAPPING_RULES = {
    '1000': 'CASH',
    '1010': 'BANK',
    '1200': 'ACCOUNT_RECEIVABLE',
    '1300': 'INVENTORY_ASSET',
    '1400': 'INPUT_TAX',
    '2000': 'ACCOUNT_PAYABLE',
    '2100': 'OUTPUT_TAX',
    '4000': 'SALES_REVENUE',
    '4100': 'SALES_RETURN',
    '5000': 'COGS_EXPENSE',
    '5200': 'DISCOUNT_RECEIVED',
    '4200': 'DISCOUNT_GIVEN',
    '5300': 'DAMAGED_GOODS_EXPENSE',
    '5400': 'SHRINKAGE_EXPENSE',
} as const;

// POST /companies/me/seed-accounts — create default accounts + auto-map in one transaction
companyRoutes.post('/me/seed-accounts', requirePermission(PERMISSIONS.ADMIN_MANAGE_SETTINGS), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;

        const result = await prisma.$transaction(async (tx) => {
            // 1. Check which accounts already exist
            const existingAccounts = await tx.account.findMany({
                where: { companyId },
                select: { id: true, code: true },
            });
            const existingCodes = new Set(existingAccounts.map((a) => a.code));

            // 2. Create accounts that don't already exist
            const toCreate = DEFAULT_SEED_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
            if (toCreate.length > 0) {
                await tx.account.createMany({
                    data: toCreate.map((a) => ({
                        companyId,
                        code: a.code,
                        name: a.name,
                        type: a.type,
                        isSystem: true,
                    })),
                });
            }

            // 3. Re-fetch all accounts to get their IDs
            const allAccounts = await tx.account.findMany({
                where: { companyId },
                select: { id: true, code: true, name: true, type: true },
            });
            const accountByCode = new Map(allAccounts.map((a) => [a.code, a]));

            // 4. Build mappings from code → mapping type
            const mappingsCreated: Array<{ mappingType: string; code: string; name: string }> = [];
            for (const [code, mappingType] of Object.entries(AUTO_MAPPING_RULES)) {
                const account = accountByCode.get(code);
                if (!account) continue;

                // Upsert: skip if mapping already exists
                const existing = await tx.accountMapping.findFirst({
                    where: { companyId, mappingType, entityType: 'GLOBAL', entityId: null },
                });
                if (existing) continue;

                await tx.accountMapping.create({
                    data: {
                        companyId,
                        mappingType,
                        entityType: 'GLOBAL',
                        entityId: null,
                        accountId: account.id,
                    },
                });
                mappingsCreated.push({ mappingType, code, name: account.name });
            }

            return {
                accountsCreated: toCreate.length,
                accountsExisted: existingCodes.size,
                totalAccounts: allAccounts.length,
                mappingsCreated: mappingsCreated.length,
                accounts: allAccounts,
                mappings: mappingsCreated,
            };
        });

        sendSuccess(res, result, undefined, 201);
    } catch (error) { next(error); }
});

// PATCH /companies/me/setup-complete — mark tenant setup wizard as completed
companyRoutes.patch('/me/setup-complete', requirePermission(PERMISSIONS.ADMIN_MANAGE_SETTINGS), async (req, res, next) => {
    try {
        const existing = await prisma.company.findUnique({
            where: { id: req.user!.companyId },
            select: { settings: true },
        });
        const currentSettings = (existing?.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings))
            ? (existing.settings as Record<string, any>)
            : {};

        const company = await prisma.company.update({
            where: { id: req.user!.companyId },
            data: {
                settings: { ...currentSettings, setupCompleted: true } as any,
            },
        });
        sendSuccess(res, company);
    } catch (error) { next(error); }
});
