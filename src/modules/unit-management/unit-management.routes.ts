import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAnyPermission, requirePermission } from '../../middleware/auth.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';

export const unitManagementRoutes = Router();
unitManagementRoutes.use(authenticate);

const unitMasterSchema = z.object({
    name: z.string().trim().min(1, 'Unit name is required').max(50, 'Unit name is too long'),
    defaultQtyInBaseUnit: z
        .coerce
        .number()
        .positive('Default quantity must be greater than 0')
        .optional()
        .nullable(),
});

const unitMasterPatchSchema = z.object({
    name: z.string().trim().min(1, 'Unit name is required').max(50, 'Unit name is too long').optional(),
    defaultQtyInBaseUnit: z
        .coerce
        .number()
        .positive('Default quantity must be greater than 0')
        .optional()
        .nullable(),
});

function normalizeUnitName(value: unknown): string {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function toNullableQty(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function ensureUniqueUnitName(name: string, excludeId?: string) {
    const existing = await (prisma as any).unitMaster.findFirst({
        where: {
            name,
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
    });
    if (existing) throw AppError.badRequest('Unit name already exists');
}

// GET /unit-management
unitManagementRoutes.get('/', requirePermission(PERMISSIONS.PRODUCT_VIEW), async (_req, res, next) => {
    try {
        const units = await (prisma as any).unitMaster.findMany({
            orderBy: { name: 'asc' },
        });
        sendSuccess(res, units);
    } catch (error) {
        next(error);
    }
});

// POST /unit-management
unitManagementRoutes.post(
    '/',
    requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER),
    async (req, res, next) => {
        try {
            const parsed = unitMasterSchema.parse(req.body);
            const name = normalizeUnitName(parsed.name);
            if (!name) throw AppError.badRequest('Unit name is required');
            await ensureUniqueUnitName(name);

            const created = await (prisma as any).unitMaster.create({
                data: {
                    name,
                    defaultQtyInBaseUnit: toNullableQty(parsed.defaultQtyInBaseUnit),
                },
            });
            sendSuccess(res, created);
        } catch (error: any) {
            if (error?.code === 'P2002') {
                next(AppError.badRequest('Unit name already exists'));
                return;
            }
            next(error);
        }
    }
);

// PATCH /unit-management/:id
unitManagementRoutes.patch(
    '/:id',
    requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER),
    async (req, res, next) => {
        try {
            const parsed = unitMasterPatchSchema.parse(req.body);
            if (Object.keys(parsed).length === 0) throw AppError.badRequest('No fields provided');

            const payload: Record<string, unknown> = {};
            if (parsed.name !== undefined) {
                const name = normalizeUnitName(parsed.name);
                if (!name) throw AppError.badRequest('Unit name is required');
                await ensureUniqueUnitName(name, req.params.id as string);
                payload.name = name;
            }
            if (Object.prototype.hasOwnProperty.call(parsed, 'defaultQtyInBaseUnit')) {
                payload.defaultQtyInBaseUnit = toNullableQty(parsed.defaultQtyInBaseUnit);
            }

            const updated = await (prisma as any).unitMaster.update({
                where: { id: req.params.id as string },
                data: payload,
            });
            sendSuccess(res, updated);
        } catch (error: any) {
            if (error?.code === 'P2025') {
                next(AppError.notFound('Unit'));
                return;
            }
            if (error?.code === 'P2002') {
                next(AppError.badRequest('Unit name already exists'));
                return;
            }
            next(error);
        }
    }
);

// DELETE /unit-management/:id
unitManagementRoutes.delete(
    '/:id',
    requireAnyPermission(PERMISSIONS.PRODUCT_EDIT, PERMISSIONS.PRODUCT_EDIT_MASTER),
    async (req, res, next) => {
        try {
            await (prisma as any).unitMaster.delete({
                where: { id: req.params.id as string },
            });
            sendSuccess(res, { message: 'Unit deleted' });
        } catch (error: any) {
            if (error?.code === 'P2025') {
                next(AppError.notFound('Unit'));
                return;
            }
            next(error);
        }
    }
);
