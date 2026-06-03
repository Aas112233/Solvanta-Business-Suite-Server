import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { z } from 'zod';

export const taxRoutes = Router();
taxRoutes.use(authenticate);

const taxCreateSchema = z.object({
    name: z.string().min(1),
    rate: z.number().min(0).max(1), // Decimal representing percentage (e.g. 0.15 for 15%)
    type: z.enum(['SALES', 'PURCHASE', 'BOTH']).default('BOTH'),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false)
});

const taxUpdateSchema = taxCreateSchema.partial();

// GET /taxes
taxRoutes.get('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_SETTINGS), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const taxes = await prisma.tax.findMany({
            where: { companyId: req.user!.companyId },
            orderBy: { createdAt: 'desc' }
        });
        sendSuccess(res, taxes);
    } catch (error) { next(error); }
});

// POST /taxes
taxRoutes.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_SETTINGS), validate({ body: taxCreateSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = req.body as z.infer<typeof taxCreateSchema>;
        const companyId = req.user!.companyId;

        const result = await prisma.$transaction(async (tx) => {
            if (body.isDefault) {
                // Remove default status from others of the same type if this is set as default
                await tx.tax.updateMany({
                    where: {
                        companyId,
                        isDefault: true,
                        OR: [
                            { type: body.type },
                            { type: 'BOTH' }
                        ]
                    },
                    data: { isDefault: false }
                });
            }

            return await tx.tax.create({
                data: {
                    ...body,
                    companyId
                }
            });
        });

        // Audit log
        try {
            await prisma.auditLog.create({
                data: {
                    companyId,
                    userId: req.user!.id,
                    action: 'CREATE',
                    entity: 'Tax',
                    entityId: result.id,
                    after: result as any,
                },
            });
        } catch (_) { /* audit is best-effort */ }

        sendSuccess(res, result, { message: 'Tax created successfully' }, 201);
    } catch (error) { next(error); }
});

// PATCH /taxes/:id
taxRoutes.patch('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_SETTINGS), validate({ body: taxUpdateSchema }), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = String(req.params.id);
        const body = req.body as z.infer<typeof taxUpdateSchema>;
        const companyId = req.user!.companyId;

        const existing = await prisma.tax.findFirst({ where: { id, companyId } });
        if (!existing) throw AppError.notFound('Tax rule');

        const result = await prisma.$transaction(async (tx) => {
            if (body.isDefault === true) {
                const targetType = body.type || existing.type;
                await tx.tax.updateMany({
                    where: {
                        companyId,
                        isDefault: true,
                        id: { not: id },
                        OR: [
                            { type: targetType },
                            { type: 'BOTH' }
                        ]
                    },
                    data: { isDefault: false }
                });
            }

            return await tx.tax.update({
                where: { id, companyId },
                data: body
            });
        });

        // Audit log
        try {
            await prisma.auditLog.create({
                data: {
                    companyId,
                    userId: req.user!.id,
                    action: 'UPDATE',
                    entity: 'Tax',
                    entityId: id,
                    before: existing as any,
                    after: result as any,
                },
            });
        } catch (_) { /* audit is best-effort */ }

        sendSuccess(res, result, { message: 'Tax updated successfully' });
    } catch (error) { next(error); }
});

// DELETE /taxes/:id
taxRoutes.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_SETTINGS), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = String(req.params.id);
        const companyId = req.user!.companyId;

        const existing = await prisma.tax.findFirst({ where: { id, companyId } });
        if (!existing) throw AppError.notFound('Tax rule');

        // Prevent deleting the default tax — would break all POS/Sales operations
        if (existing.isDefault) {
            throw AppError.badRequest(
                'Cannot delete the default tax rule. Please assign another tax as default first.'
            );
        }

        // Check if any product is using it
        const productCount = await prisma.product.count({ where: { taxId: id, companyId } });
        if (productCount > 0) {
            throw AppError.badRequest('Cannot delete tax rule because it is assigned to one or more products.');
        }

        await prisma.tax.delete({ where: { id, companyId } });

        // Audit log
        try {
            await prisma.auditLog.create({
                data: {
                    companyId,
                    userId: req.user!.id,
                    action: 'DELETE',
                    entity: 'Tax',
                    entityId: id,
                    before: existing as any,
                },
            });
        } catch (_) { /* audit is best-effort */ }

        sendSuccess(res, { message: 'Tax deleted successfully' });
    } catch (error) { next(error); }
});
