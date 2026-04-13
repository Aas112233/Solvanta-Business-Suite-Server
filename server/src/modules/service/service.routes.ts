import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { validate } from '../../middleware/validate.js';
import {
    listServices,
    getServiceById,
    createService,
    updateService,
    deleteService,
    getServiceCategories,
} from './service.controller.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';

const router = Router();

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

const optionalTrimmedString = (maxLength: number) =>
    z.preprocess(normalizeOptionalString, z.string().max(maxLength).optional());

const optionalObjectIdSchema = z.preprocess(normalizeOptionalString, objectIdSchema.optional());

const optionalBooleanSchema = z.preprocess((value) => {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes'].includes(normalized)) return true;
        if (['false', '0', 'no'].includes(normalized)) return false;
    }
    return value;
}, z.boolean().optional());

const optionalNonNegativeNumberSchema = z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
}, z.coerce.number().min(0, 'Value cannot be negative').finite().optional());

const optionalPositiveIntSchema = z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
}, z.coerce.number().int().positive('Value must be greater than zero').optional());

const serviceParamsSchema = z.object({
    id: objectIdSchema,
});

const serviceListQuerySchema = z.object({
    isActive: optionalBooleanSchema,
    category: optionalTrimmedString(120),
    search: optionalTrimmedString(120),
});

const serviceSchema = z.object({
    code: z.string()
        .trim()
        .min(1, 'Service code is required')
        .max(50, 'Service code must be 50 characters or less')
        .regex(/^[A-Za-z0-9_-]+$/, 'Service code can only contain letters, numbers, hyphens, and underscores'),
    name: z.string()
        .trim()
        .min(1, 'Service name is required')
        .max(200, 'Service name must be 200 characters or less'),
    description: optionalTrimmedString(1000),
    category: optionalTrimmedString(120),
    standardRate: z.coerce.number()
        .min(0, 'Standard rate cannot be negative')
        .finite('Standard rate must be a valid number'),
    costRate: optionalNonNegativeNumberSchema,
    incomeAccountId: optionalObjectIdSchema,
    expenseAccountId: optionalObjectIdSchema,
    duration: optionalPositiveIntSchema,
    isLabor: optionalBooleanSchema,
    isActive: optionalBooleanSchema,
});

const serviceUpdateSchema = serviceSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field is required' }
);

router.use(authenticate);

// Routes
router.get(
    '/',
    requirePermission(PERMISSIONS.PRODUCT_VIEW),
    validate({ query: serviceListQuerySchema }),
    listServices
);

router.get(
    '/categories',
    requirePermission(PERMISSIONS.PRODUCT_VIEW),
    getServiceCategories
);

router.get(
    '/:id',
    requirePermission(PERMISSIONS.PRODUCT_VIEW),
    validate({ params: serviceParamsSchema }),
    getServiceById
);

router.post(
    '/',
    requirePermission(PERMISSIONS.PRODUCT_CREATE),
    validate({ body: serviceSchema }),
    createService
);

router.put(
    '/:id',
    requirePermission(PERMISSIONS.PRODUCT_EDIT),
    validate({ params: serviceParamsSchema, body: serviceUpdateSchema }),
    updateService
);

router.delete(
    '/:id',
    requirePermission(PERMISSIONS.PRODUCT_DELETE),
    validate({ params: serviceParamsSchema }),
    deleteService
);

export { router as serviceRoutes };
