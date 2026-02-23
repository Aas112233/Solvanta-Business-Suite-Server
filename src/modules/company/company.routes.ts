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
        phone: z.string().trim().max(40).optional(),
        email: z.string().trim().email().optional(),
        website: z.string().trim().max(200).optional(),
        address: z.string().trim().max(500).optional(),
    }).partial().optional(),
    regional: z.object({
        timezone: z.string().trim().max(80).optional(),
        dateFormat: z.string().trim().max(30).optional(),
        timeFormat: z.enum(['12H', '24H']).optional(),
        language: z.string().trim().max(20).optional(),
    }).partial().optional(),
    tax: z.object({
        label: z.string().trim().max(30).optional(),
        defaultRate: z.number().min(0).max(1).optional(),
        inclusivePricing: z.boolean().optional(),
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
            tax: { ...(currentSettings.tax || {}), ...(incoming.tax || {}) },
            inventory: { ...(currentSettings.inventory || {}), ...(incoming.inventory || {}) },
            documents: { ...(currentSettings.documents || {}), ...(incoming.documents || {}) },
            // Backward compatibility with legacy flat keys used in older seeds/builds.            lowStockThreshold: incoming.inventory?.lowStockThreshold ?? currentSettings.lowStockThreshold,            taxRate: incoming.tax?.defaultRate ?? currentSettings.taxRate,
            taxLabel: incoming.tax?.label ?? currentSettings.taxLabel,
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
