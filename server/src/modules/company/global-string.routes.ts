import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

export const globalStringRoutes = Router();
globalStringRoutes.use(authenticate);

// ── Validation Schemas ──────────────────────────────────────────
const createSchema = z.object({
    group: z.string().min(1),
    value: z.string().min(1),
    systemKey: z.string().nullish(),
    link: z.string().optional().default(''),
    color: z.string().optional().default(''),
    description: z.string().optional().default(''),
    isActive: z.boolean().optional().default(true),
});

const updateSchema = z.object({
    value: z.string().min(1).optional(),
    link: z.string().optional(),
    color: z.string().optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
});

// ── GET / ───────────────────────────────────────────────────────
// List all global strings for a group
globalStringRoutes.get('/', async (req, res, next) => {
    try {
        const { group } = req.query;
        const strings = await (prisma as any).globalString.findMany({
            where: {
                companyId: req.user!.companyId,
                ...(group ? { group: group as string } : {}),
            },
            orderBy: [{ systemKey: 'desc' }, { value: 'asc' }],
        });
        sendSuccess(res, strings);
    } catch (error) { next(error); }
});

// ── POST / ──────────────────────────────────────────────────────
// Create a new global string. If a duplicate exists, return it instead of 409.
globalStringRoutes.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_STRINGS), validate({ body: createSchema }), async (req, res, next) => {
    try {
        const data = req.body;
        const companyId = req.user!.companyId;

        // Check for existing record by systemKey or value
        const orConditions: any[] = [{ value: data.value }];
        if (data.systemKey) orConditions.push({ systemKey: data.systemKey });

        const existing = await (prisma as any).globalString.findFirst({
            where: { companyId, group: data.group, OR: orConditions }
        });

        if (existing) {
            // Update the existing record with any new data instead of failing
            const result = await (prisma as any).globalString.update({
                where: { id: existing.id },
                data: {
                    color: data.color || existing.color,
                    link: data.link || existing.link,
                    description: data.description || existing.description,
                    isActive: true, // Re-enable if it was disabled
                }
            });
            return sendSuccess(res, result, { message: 'Already exists — updated' }, 200);
        }

        // Strip systemKey if empty string or null
        const createPayload: any = {
            companyId,
            group: data.group,
            value: data.value,
            isActive: data.isActive ?? true,
        };
        if (data.systemKey) createPayload.systemKey = data.systemKey;
        if (data.color) createPayload.color = data.color;
        if (data.link) createPayload.link = data.link;
        if (data.description) createPayload.description = data.description;

        const result = await (prisma as any).globalString.create({ data: createPayload });
        sendSuccess(res, result, { message: 'Created successfully' }, 201);
    } catch (error) { next(error); }
});

// ── PUT /:id ────────────────────────────────────────────────────
// Update an existing global string by its ID (edit, rename, toggle)
globalStringRoutes.put('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_STRINGS), validate({ body: updateSchema }), async (req, res, next) => {
    try {
        const { id } = req.params;
        const companyId = req.user!.companyId;
        const data = req.body;

        // Verify the record exists and belongs to this company
        const existing = await (prisma as any).globalString.findFirst({
            where: { id, companyId }
        });
        if (!existing) {
            throw new AppError('Global string not found', 404);
        }

        // Build update payload — only include fields that were sent
        const updatePayload: any = {};
        if (data.value !== undefined) updatePayload.value = data.value;
        if (data.color !== undefined) updatePayload.color = data.color;
        if (data.link !== undefined) updatePayload.link = data.link;
        if (data.description !== undefined) updatePayload.description = data.description;
        if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

        const result = await (prisma as any).globalString.update({
            where: { id },
            data: updatePayload,
        });
        sendSuccess(res, result, { message: 'Updated successfully' });
    } catch (error) { next(error); }
});

// ── DELETE /:id ─────────────────────────────────────────────────
// Delete a global string by its ID
globalStringRoutes.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_STRINGS), async (req, res, next) => {
    try {
        const { id } = req.params;
        const companyId = req.user!.companyId;

        const existing = await (prisma as any).globalString.findFirst({
            where: { id, companyId }
        });
        if (!existing) {
            throw new AppError('Global string not found', 404);
        }

        await (prisma as any).globalString.delete({ where: { id } });
        sendSuccess(res, null, { message: 'Deleted successfully' });
    } catch (error) { next(error); }
});
