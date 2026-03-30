/**
 * Enhanced Validation Schemas with Data Sanitization
 * Use these schemas for robust input validation and sanitization
 */

import { z } from 'zod';
import {
    sanitizeText,
    sanitizeEmail,
    sanitizePhone,
    sanitizeCode,
    sanitizeUrl,
    sanitizeHTML,
    sanitizeStringArray,
    containsXSSPatterns,
} from '../utils/sanitizer.js';

// ─────────────────────────────────────────────────────────────
// CUSTOM SCHEMA TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Sanitized string - trims and removes dangerous characters
 */
export const sanitizedString = (options?: {
    minLength?: number;
    maxLength?: number;
    fieldName?: string;
}) => {
    const { minLength = 1, maxLength = 1000, fieldName = 'Field' } = options || {};

    return z.string()
        .min(minLength, { message: `${fieldName} is required` })
        .max(maxLength, { message: `${fieldName} must be less than ${maxLength} characters` })
        .transform((val) => sanitizeText(val, { maxLength }));
};

/**
 * Optional sanitized string - allows empty strings and null
 */
export const optionalSanitizedString = (options?: {
    maxLength?: number;
}) => {
    const { maxLength = 1000 } = options || {};

    return z.string()
        .max(maxLength)
        .transform((val) => {
            if (!val || val.trim() === '') return null;
            return sanitizeText(val, { maxLength });
        })
        .nullable();
};

/**
 * Email with sanitization
 */
export const sanitizedEmail = z.string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Invalid email format' })
    .transform((val) => sanitizeEmail(val));

/**
 * Optional email
 */
export const optionalSanitizedEmail = z.string()
    .transform((val) => {
        if (!val || val.trim() === '') return null;
        const sanitized = sanitizeEmail(val);
        if (!sanitized || !sanitized.includes('@')) return null;
        return sanitized;
    })
    .nullable();

/**
 * Phone number with sanitization
 */
export const sanitizedPhone = z.string()
    .min(7, { message: 'Phone number must be at least 7 digits' })
    .max(20, { message: 'Phone number must be less than 20 characters' })
    .regex(/^[+0-9()\- ]{7,20}$/, { message: 'Invalid phone number format' })
    .transform((val) => sanitizePhone(val));

/**
 * Optional phone number
 */
export const optionalSanitizedPhone = z.string()
    .transform((val) => {
        if (!val || val.trim() === '') return null;
        const sanitized = sanitizePhone(val);
        if (sanitized.length < 7) return null;
        return sanitized;
    })
    .nullable();

/**
 * Code (alphanumeric with hyphens/underscores)
 */
export const sanitizedCode = (options?: {
    minLength?: number;
    maxLength?: number;
    fieldName?: string;
}) => {
    const { minLength = 1, maxLength = 50, fieldName = 'Code' } = options || {};

    return z.string()
        .min(minLength, { message: `${fieldName} is required` })
        .max(maxLength, { message: `${fieldName} must be less than ${maxLength} characters` })
        .regex(/^[A-Za-z0-9_-]+$/, { message: `${fieldName} can only contain letters, numbers, hyphens, and underscores` })
        .transform((val) => sanitizeCode(val));
};

/**
 * Optional code
 */
export const optionalSanitizedCode = z.string()
    .transform((val) => {
        if (!val || val.trim() === '') return null;
        const sanitized = sanitizeCode(val);
        if (!sanitized || sanitized.length === 0) return null;
        return sanitized;
    })
    .nullable();

/**
 * URL with sanitization
 */
export const sanitizedUrl = z.string()
    .url({ message: 'Invalid URL format' })
    .transform((val) => sanitizeUrl(val));

/**
 * Positive number
 */
export const positiveNumber = z.number()
    .positive({ message: 'Value must be positive' })
    .finite({ message: 'Value must be a finite number' });

/**
 * Non-negative number (zero or positive)
 */
export const nonNegativeNumber = z.number()
    .min(0, { message: 'Value cannot be negative' })
    .finite({ message: 'Value must be a finite number' });

/**
 * Percentage (0-100)
 */
export const percentage = z.number()
    .min(0, { message: 'Percentage cannot be negative' })
    .max(100, { message: 'Percentage cannot exceed 100' });

/**
 * Safe HTML/Rich text (allows limited tags)
 */
export const safeHTML = z.string()
    .transform((val) => {
        // Check for XSS patterns
        if (containsXSSPatterns(val)) {
            throw new Error('Invalid content: contains potentially dangerous HTML');
        }
        return sanitizeHTML(val, {
            allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
            allowedAttributes: {},
        });
    });

/**
 * Array of strings with sanitization
 */
export const sanitizedStringArray = z.array(z.string())
    .transform((val) => sanitizeStringArray(val));

/**
 * Date string (ISO format)
 */
export const dateString = z.string()
    .transform((val) => {
        if (!val || val.trim() === '') return null;
        const date = new Date(val);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date format');
        }
        return date.toISOString();
    })
    .nullable();

// ─────────────────────────────────────────────────────────────
// REUSABLE SCHEMA COMPONENTS
// ─────────────────────────────────────────────────────────────

/**
 * Address object schema
 */
export const addressSchema = z.object({
    street: optionalSanitizedString({ maxLength: 250 }),
    city: optionalSanitizedString({ maxLength: 120 }),
    state: optionalSanitizedString({ maxLength: 120 }),
    country: optionalSanitizedString({ maxLength: 120 }),
    postalCode: optionalSanitizedString({ maxLength: 20 }),
});

/**
 * Money/currency amount
 */
export const moneySchema = z.object({
    amount: nonNegativeNumber,
    currency: z.string().length(3).default('SAR'),
});

/**
 * Pagination query parameters
 */
export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: optionalSanitizedString({ maxLength: 100 }),
    sortBy: optionalSanitizedString({ maxLength: 50 }),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Date range query parameters
 */
export const dateRangeQuerySchema = z.object({
    startDate: dateString,
    endDate: dateString,
});

// ─────────────────────────────────────────────────────────────
// AUTHENTICATION SCHEMAS
// ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
    email: sanitizedEmail,
    password: z.string()
        .min(8, { message: 'Password must be at least 8 characters' })
        .max(128, { message: 'Password must be less than 128 characters' })
        .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
        .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
        .regex(/[0-9]/, { message: 'Password must contain at least one number' }),
});

export const registerSchema = z.object({
    name: sanitizedString({ minLength: 2, maxLength: 100, fieldName: 'Name' }),
    email: sanitizedEmail,
    password: z.string()
        .min(8, { message: 'Password must be at least 8 characters' })
        .max(128, { message: 'Password must be less than 128 characters' })
        .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
        .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
        .regex(/[0-9]/, { message: 'Password must contain at least one number' }),
    companyId: z.string().uuid().optional(),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, { message: 'Refresh token is required' }),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, { message: 'Current password is required' }),
    newPassword: z.string()
        .min(8, { message: 'New password must be at least 8 characters' })
        .max(128, { message: 'New password must be less than 128 characters' })
        .regex(/[A-Z]/, { message: 'New password must contain at least one uppercase letter' })
        .regex(/[a-z]/, { message: 'New password must contain at least one lowercase letter' })
        .regex(/[0-9]/, { message: 'New password must contain at least one number' }),
});

// ─────────────────────────────────────────────────────────────
// CUSTOMER SCHEMAS
// ─────────────────────────────────────────────────────────────

export const customerCreateSchema = z.object({
    customerCode: optionalSanitizedCode,
    name: sanitizedString({ minLength: 1, maxLength: 200 }),
    email: optionalSanitizedEmail,
    phone: optionalSanitizedPhone,
    vatNumber: optionalSanitizedString({ maxLength: 50 }),
    address: addressSchema.optional(),
    creditLimit: nonNegativeNumber.default(0),
    allowCreditSales: z.boolean().default(true),
    openingBalance: nonNegativeNumber.default(0),
    priceGroupId: optionalSanitizedCode,
    tags: sanitizedStringArray.default([]),
    notes: optionalSanitizedString({ maxLength: 1000 }),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const customerQuerySchema = paginationQuerySchema.extend({
    search: optionalSanitizedString({ maxLength: 100 }),
    email: optionalSanitizedEmail,
    phone: optionalSanitizedPhone,
});

// ─────────────────────────────────────────────────────────────
// PRODUCT/INVENTORY SCHEMAS
// ─────────────────────────────────────────────────────────────

export const productCreateSchema = z.object({
    itemCode: optionalSanitizedCode,
    name: sanitizedString({ minLength: 1, maxLength: 200 }),
    description: optionalSanitizedString({ maxLength: 1000 }),
    barcodes: z.array(z.string()).default([]),
    status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).default('ACTIVE'),
    taxRate: percentage.default(0),
    categoryIds: z.array(z.string().uuid()).default([]),
    brandId: z.string().uuid().optional().nullable(),
    unitCode: optionalSanitizedString({ maxLength: 10 }),
    salePrice: nonNegativeNumber.default(0),
    costPrice: nonNegativeNumber.default(0),
    minStock: nonNegativeNumber.default(0),
    maxStock: nonNegativeNumber.default(0),
});

export const productUpdateSchema = productCreateSchema.partial();

export const productQuerySchema = paginationQuerySchema.extend({
    categoryIds: z.array(z.string().uuid()).optional(),
    brandId: z.string().uuid().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).optional(),
    minPrice: nonNegativeNumber.optional(),
    maxPrice: nonNegativeNumber.optional(),
});

// ─────────────────────────────────────────────────────────────
// HR MODULE SCHEMAS
// ─────────────────────────────────────────────────────────────

export const departmentCreateSchema = z.object({
    name: sanitizedString({ minLength: 1, maxLength: 100 }),
    code: sanitizedCode({ minLength: 1, maxLength: 20 }),
    description: optionalSanitizedString({ maxLength: 500 }),
    parentId: z.string().uuid().optional().nullable(),
});

export const departmentUpdateSchema = departmentCreateSchema.partial();

export const positionCreateSchema = z.object({
    title: sanitizedString({ minLength: 1, maxLength: 100 }),
    code: sanitizedCode({ minLength: 1, maxLength: 20 }),
    departmentId: z.string().uuid().optional().nullable(),
    level: z.number().int().min(1).max(20).default(1),
    reportsTo: z.string().uuid().optional().nullable(),
    minSalary: nonNegativeNumber.default(0),
    maxSalary: nonNegativeNumber.default(0),
    description: optionalSanitizedString({ maxLength: 1000 }),
});

export const positionUpdateSchema = positionCreateSchema.partial();

export const employeeCreateSchema = z.object({
    employeeNo: optionalSanitizedCode,
    firstName: sanitizedString({ minLength: 1, maxLength: 50 }),
    lastName: sanitizedString({ minLength: 1, maxLength: 50 }),
    email: optionalSanitizedEmail,
    phone: optionalSanitizedPhone,
    departmentId: z.string().uuid().optional().nullable(),
    positionId: z.string().uuid().optional().nullable(),
    managerId: z.string().uuid().optional().nullable(),
    branchId: z.string().uuid().optional(),
    hireDate: dateString,
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']).default('FULL_TIME'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'RESIGNED', 'SUSPENDED']).default('ACTIVE'),
    salary: nonNegativeNumber.default(0),
    currency: z.string().length(3).default('SAR'),
    address: addressSchema.optional(),
    emergencyContact: z.object({
        name: optionalSanitizedString({ maxLength: 100 }),
        phone: optionalSanitizedPhone,
        relationship: optionalSanitizedString({ maxLength: 50 }),
    }).optional(),
});

export const employeeUpdateSchema = employeeCreateSchema.partial();

export const employeeQuerySchema = paginationQuerySchema.extend({
    departmentId: z.string().uuid().optional(),
    positionId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'RESIGNED', 'SUSPENDED']).optional(),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY']).optional(),
});

// ─────────────────────────────────────────────────────────────
// SALES SCHEMAS
// ─────────────────────────────────────────────────────────────

export const salesInvoiceItemSchema = z.object({
    productId: z.string().uuid().optional().nullable(),
    serviceId: z.string().uuid().optional().nullable(),
    description: sanitizedString({ minLength: 1, maxLength: 500, fieldName: 'Description' }),
    unitCode: optionalSanitizedString({ maxLength: 10 }),
    qty: positiveNumber,
    unitPrice: nonNegativeNumber,
    discount: nonNegativeNumber.default(0),
    taxAmount: nonNegativeNumber.default(0),
    lineTotal: nonNegativeNumber.optional(),
});

export const salesInvoiceCreateSchema = z.object({
    customerId: z.string().uuid().optional().nullable(),
    date: dateString,
    dueDate: dateString,
    branchId: z.string().uuid().optional(),
    items: z.array(salesInvoiceItemSchema).min(1, { message: 'At least one item is required' }),
    paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'MIXED']).optional(),
    notes: optionalSanitizedString({ maxLength: 1000 }),
    terms: optionalSanitizedString({ maxLength: 2000 }),
    discountTotal: nonNegativeNumber.default(0),
});

export const salesInvoiceUpdateSchema = salesInvoiceCreateSchema.partial();

// ─────────────────────────────────────────────────────────────
// PURCHASE SCHEMAS
// ─────────────────────────────────────────────────────────────

export const purchaseInvoiceItemSchema = z.object({
    productId: z.string().uuid(),
    unitCode: optionalSanitizedString({ maxLength: 10 }),
    qty: positiveNumber,
    unitCost: nonNegativeNumber,
    taxAmount: nonNegativeNumber.default(0),
    lineTotal: nonNegativeNumber.optional(),
});

export const purchaseInvoiceCreateSchema = z.object({
    supplierId: z.string().uuid(),
    date: dateString,
    dueDate: dateString,
    branchId: z.string().uuid().optional(),
    items: z.array(purchaseInvoiceItemSchema).min(1, { message: 'At least one item is required' }),
    paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT']).optional(),
    notes: optionalSanitizedString({ maxLength: 1000 }),
});

// ─────────────────────────────────────────────────────────────
// POS SCHEMAS
// ─────────────────────────────────────────────────────────────

export const posInvoiceItemSchema = z.object({
    productId: z.string().uuid().optional().nullable(),
    serviceId: z.string().uuid().optional().nullable(),
    unitCode: optionalSanitizedString({ maxLength: 10 }),
    qty: positiveNumber,
    unitPrice: nonNegativeNumber.optional(),
    discount: nonNegativeNumber.default(0),
    taxAmount: nonNegativeNumber.default(0),
    lineTotal: nonNegativeNumber.optional(),
});

export const posInvoiceCreateSchema = z.object({
    customerId: z.string().uuid().optional().nullable(),
    clientRequestId: optionalSanitizedString({ maxLength: 120 }),
    branchId: z.string().uuid().optional(),
    posTerminalId: z.string().uuid().optional().nullable(),
    items: z.array(posInvoiceItemSchema).min(1, { message: 'At least one item is required' }),
    paymentMethod: sanitizedString({ minLength: 1, maxLength: 50, fieldName: 'Payment method' }),
    cashReceived: nonNegativeNumber.optional().default(0),
    cardReceived: nonNegativeNumber.optional().default(0),
    changeGiven: nonNegativeNumber.optional().default(0),
    notes: optionalSanitizedString({ maxLength: 1000 }),
    loyaltyCustomerId: z.string().uuid().optional().nullable(),
    loyaltyPointsRedeemed: nonNegativeNumber.default(0),
});

// ─────────────────────────────────────────────────────────────
// EXPORT ALL SCHEMAS
// ─────────────────────────────────────────────────────────────

export default {
    // Custom types
    sanitizedString,
    optionalSanitizedString,
    sanitizedEmail,
    optionalSanitizedEmail,
    sanitizedPhone,
    optionalSanitizedPhone,
    sanitizedCode,
    optionalSanitizedCode,
    sanitizedUrl,
    positiveNumber,
    nonNegativeNumber,
    percentage,
    safeHTML,
    sanitizedStringArray,
    dateString,

    // Reusable components
    addressSchema,
    moneySchema,
    paginationQuerySchema,
    dateRangeQuerySchema,

    // Auth
    loginSchema,
    registerSchema,
    refreshTokenSchema,
    changePasswordSchema,

    // Customer
    customerCreateSchema,
    customerUpdateSchema,
    customerQuerySchema,

    // Product
    productCreateSchema,
    productUpdateSchema,
    productQuerySchema,

    // HR
    departmentCreateSchema,
    departmentUpdateSchema,
    positionCreateSchema,
    positionUpdateSchema,
    employeeCreateSchema,
    employeeUpdateSchema,
    employeeQuerySchema,

    // Sales
    salesInvoiceItemSchema,
    salesInvoiceCreateSchema,
    salesInvoiceUpdateSchema,

    // Purchase
    purchaseInvoiceItemSchema,
    purchaseInvoiceCreateSchema,

    // POS
    posInvoiceItemSchema,
    posInvoiceCreateSchema,
};
