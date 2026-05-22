import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { AppError } from '../../utils/AppError.js';
import { FixedAssetService } from './FixedAssetService.js';
import { DepreciationMethod, FixedAssetStatus } from '@prisma/client';

export const fixedAssetRoutes = Router();

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const registerAssetSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    assetCode: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    purchaseDate: z.string().transform((v) => new Date(v)),
    purchaseCost: z.number().positive('Purchase cost must be positive'),
    salvageValue: z.number().nonnegative('Salvage value must be non-negative').default(0),
    usefulLifeMonths: z.number().int().positive('Useful life months must be a positive integer'),
    depreciationMethod: z.nativeEnum(DepreciationMethod),
    assetAccountId: objectIdSchema,
    accumDepAccountId: objectIdSchema,
    depExpAccountId: objectIdSchema,
    branchId: objectIdSchema.optional().nullable(),
});

const runDepreciationSchema = z.object({
    depreciationDate: z.string().transform((v) => new Date(v)),
});

const disposeAssetSchema = z.object({
    disposalDate: z.string().transform((v) => new Date(v)),
    disposalAmount: z.number().nonnegative('Disposal amount must be non-negative'),
    disposalMemo: z.string().optional().nullable(),
    settlementAccountId: objectIdSchema,
    gainLossAccountId: objectIdSchema,
});

// Protect all routes
fixedAssetRoutes.use(authenticate as any);

// List assets
fixedAssetRoutes.get(
    '/',
    requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any),
    async (req, res, next) => {
        try {
            const companyId = req.user!.companyId as string;
            const { search, status, branchId, skip = 0, take = 20 } = req.query;

            const where: any = { companyId };

            if (search) {
                where.OR = [
                    { name: { contains: String(search), mode: 'insensitive' } },
                    { assetCode: { contains: String(search), mode: 'insensitive' } },
                ];
            }

            if (status) {
                where.status = status as FixedAssetStatus;
            }

            if (branchId) {
                where.branchId = branchId as string;
            }

            const assets = await prisma.fixedAsset.findMany({
                where,
                include: {
                    assetAccount: { select: { id: true, name: true, code: true } },
                    accumDepAccount: { select: { id: true, name: true, code: true } },
                    depExpAccount: { select: { id: true, name: true, code: true } },
                    branch: { select: { id: true, name: true } },
                },
                orderBy: { purchaseDate: 'desc' },
                skip: Number(skip),
                take: Number(take),
            });

            const count = await prisma.fixedAsset.count({ where });

            sendSuccess(res, assets, {
                total: count,
                skip: Number(skip),
                take: Number(take),
            });
        } catch (error) {
            next(error);
        }
    }
);

// Get single asset details
fixedAssetRoutes.get(
    '/:id',
    requirePermission(PERMISSIONS.ACCOUNTING_VIEW as any),
    async (req, res, next) => {
        try {
            const companyId = req.user!.companyId as string;
            const id = req.params.id as string;

            const asset = await prisma.fixedAsset.findFirst({
                where: { id, companyId },
                include: {
                    assetAccount: true,
                    accumDepAccount: true,
                    depExpAccount: true,
                    branch: true,
                    depreciationLogs: {
                        orderBy: { depreciationDate: 'desc' },
                        include: {
                            journalEntry: {
                                select: {
                                    id: true,
                                    entryNo: true,
                                    date: true,
                                }
                            }
                        }
                    }
                },
            });

            if (!asset) {
                throw AppError.notFound('Fixed asset not found');
            }

            sendSuccess(res, asset);
        } catch (error) {
            next(error);
        }
    }
);

// Register asset
fixedAssetRoutes.post(
    '/',
    requirePermission(PERMISSIONS.ACCOUNTING_POST as any),
    validate({ body: registerAssetSchema }),
    async (req, res, next) => {
        try {
            const companyId = req.user!.companyId as string;
            const result = await prisma.$transaction(async (tx) => {
                return FixedAssetService.registerAsset(tx, {
                    ...req.body,
                    companyId,
                });
            });

            sendSuccess(res, result, { message: 'Fixed asset registered successfully' }, 201);
        } catch (error) {
            next(error);
        }
    }
);

// Run depreciation for single asset
fixedAssetRoutes.post(
    '/:id/depreciate',
    requirePermission(PERMISSIONS.ACCOUNTING_POST as any),
    validate({ body: runDepreciationSchema }),
    async (req, res, next) => {
        try {
            const id = req.params.id as string;
            const { depreciationDate } = req.body;
            const postedById = req.user!.id as string;
            const companyId = req.user!.companyId as string;

            // Verify asset belongs to company
            const asset = await prisma.fixedAsset.findFirst({
                where: { id, companyId }
            });
            if (!asset) {
                throw AppError.notFound('Fixed asset not found');
            }

            const result = await prisma.$transaction(async (tx) => {
                return FixedAssetService.runDepreciation(tx, id, depreciationDate, postedById);
            });

            sendSuccess(res, result, { message: 'Depreciation run successfully' });
        } catch (error) {
            next(error);
        }
    }
);

// Batch run depreciation for all active assets
fixedAssetRoutes.post(
    '/depreciate-all',
    requirePermission(PERMISSIONS.ACCOUNTING_POST as any),
    validate({ body: runDepreciationSchema }),
    async (req, res, next) => {
        try {
            const { depreciationDate } = req.body;
            const postedById = req.user!.id as string;
            const companyId = req.user!.companyId as string;

            // Find all active assets for this company
            const assets = await prisma.fixedAsset.findMany({
                where: { companyId, status: FixedAssetStatus.ACTIVE }
            });

            const results: any[] = [];
            let processed = 0;
            let skipped = 0;

            for (const asset of assets) {
                try {
                    const resObj = await prisma.$transaction(async (tx) => {
                        return FixedAssetService.runDepreciation(tx, asset.id, depreciationDate, postedById);
                    });
                    results.push({ assetId: asset.id, success: true, amount: resObj.amount });
                    processed++;
                } catch (err: any) {
                    results.push({ assetId: asset.id, success: false, error: err.message || 'Error processing depreciation' });
                    skipped++;
                }
            }

            sendSuccess(res, {
                results,
                processed,
                skipped,
            }, { message: `Batch depreciation complete. Processed: ${processed}, Skipped: ${skipped}` });
        } catch (error) {
            next(error);
        }
    }
);

// Dispose asset
fixedAssetRoutes.post(
    '/:id/dispose',
    requirePermission(PERMISSIONS.ACCOUNTING_POST as any),
    validate({ body: disposeAssetSchema }),
    async (req, res, next) => {
        try {
            const id = req.params.id as string;
            const postedById = req.user!.id as string;
            const companyId = req.user!.companyId as string;

            // Verify asset belongs to company
            const asset = await prisma.fixedAsset.findFirst({
                where: { id, companyId }
            });
            if (!asset) {
                throw AppError.notFound('Fixed asset not found');
            }

            const result = await prisma.$transaction(async (tx) => {
                return FixedAssetService.disposeAsset(tx, {
                    ...req.body,
                    fixedAssetId: id,
                    postedById,
                });
            });

            sendSuccess(res, result, { message: 'Asset disposed successfully' });
        } catch (error) {
            next(error);
        }
    }
);
