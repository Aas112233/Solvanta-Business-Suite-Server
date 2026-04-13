import { Router } from 'express';
import { z } from 'zod';
import {
    createServiceInvoice,
    getServiceInvoices,
    getServiceInvoiceById,
    SERVICE_INVOICE_PAYMENT_METHODS,
} from './service-invoice.controller.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

function normalizeNullableString(value: unknown) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

function isValidDateInput(value: string) {
    const normalized = value.includes('T') ? value : `${value}T00:00:00.000`;
    return !Number.isNaN(new Date(normalized).getTime());
}

const optionalDateStringSchema = z.preprocess(
    normalizeOptionalString,
    z.string().refine(isValidDateInput, 'Invalid date').optional()
);

const nullableTrimmedString = (maxLength: number) =>
    z.preprocess(
        normalizeNullableString,
        z.string().max(maxLength).nullable().optional()
    ).transform((value) => value ?? null);

const nullablePhoneSchema = z.preprocess(
    normalizeNullableString,
    z.string()
        .regex(/^[+0-9()\- ]{7,20}$/, 'Invalid walk-in phone number')
        .nullable()
        .optional()
).transform((value) => value ?? null);

const nullableObjectIdSchema = z.preprocess(
    normalizeNullableString,
    objectIdSchema.nullable().optional()
).transform((value) => value ?? null);

const serviceInvoiceParamsSchema = z.object({
    id: objectIdSchema,
});

const serviceInvoiceItemSchema = z.object({
    serviceId: nullableObjectIdSchema,
    serviceName: z.string()
        .trim()
        .min(1, 'Service name is required')
        .max(200, 'Service name must be 200 characters or less'),
    serviceCode: z.preprocess(normalizeOptionalString, z.string().max(50).optional()),
    unitCode: z.preprocess(
        normalizeOptionalString,
        z.string().trim().min(1).max(20).optional()
    ).transform((value) => (value ?? 'SERVICE').toUpperCase()),
    qty: z.coerce.number()
        .positive('Quantity must be greater than zero')
        .finite('Quantity must be a valid number'),
    unitPrice: z.coerce.number()
        .min(0, 'Unit price cannot be negative')
        .finite('Unit price must be a valid number'),
    discount: z.preprocess((value) => {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'string' && value.trim() === '') return 0;
        return value;
    }, z.coerce.number()
        .min(0, 'Discount cannot be negative')
        .finite('Discount must be a valid number')),
}).superRefine((item, ctx) => {
    const gross = item.qty * item.unitPrice;
    if (item.discount > gross) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discount'],
            message: 'Discount cannot exceed subtotal',
        });
    }
});

const createServiceInvoiceSchema = z.object({
    branchId: objectIdSchema,
    customerId: nullableObjectIdSchema,
    walkInCustomerName: nullableTrimmedString(200),
    walkInPhone: nullablePhoneSchema,
    invoiceDate: optionalDateStringSchema,
    paymentMethod: z.preprocess(
        (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
        z.enum(SERVICE_INVOICE_PAYMENT_METHODS).default('CASH')
    ),
    notes: nullableTrimmedString(1000),
    items: z.array(serviceInvoiceItemSchema)
        .min(1, 'At least one service item is required')
        .max(100, 'A maximum of 100 service items is allowed'),
}).superRefine((data, ctx) => {
    if (!data.customerId && !data.walkInCustomerName) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['customerId'],
            message: 'Either customerId or walkInCustomerName is required',
        });
    }
});

const serviceInvoiceListQuerySchema = z.object({
    branchId: z.preprocess(normalizeOptionalString, objectIdSchema.optional()),
    customerId: z.preprocess(normalizeOptionalString, objectIdSchema.optional()),
    startDate: optionalDateStringSchema,
    endDate: optionalDateStringSchema,
}).superRefine((data, ctx) => {
    if (!data.startDate || !data.endDate) return;

    const startDate = new Date(data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00:00.000`);
    const endDate = new Date(data.endDate.includes('T') ? data.endDate : `${data.endDate}T00:00:00.000`);
    if (startDate > endDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'endDate must be on or after startDate',
        });
    }
});

router.use(authenticate);

// Routes
router.post(
    '/',
    requirePermission('sales.create'),
    validate({ body: createServiceInvoiceSchema }),
    createServiceInvoice
);

router.get(
    '/',
    requirePermission('sales.view'),
    validate({ query: serviceInvoiceListQuerySchema }),
    getServiceInvoices
);

router.get(
    '/:id',
    requirePermission('sales.view'),
    validate({ params: serviceInvoiceParamsSchema }),
    getServiceInvoiceById
);

export { router as serviceInvoiceRoutes };
