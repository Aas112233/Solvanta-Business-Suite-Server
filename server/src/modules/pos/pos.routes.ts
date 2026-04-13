import { Router } from 'express';
import { authenticate, requirePermission, requireAnyPermission, requireBranch } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { paginationSchema, getPaginationParams } from '../../utils/pagination.js';
import { formatDocNo, nextCounter, peekNextCounter } from '../../utils/documentCounter.js';
import { Decimal } from '@prisma/client/runtime/library';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getPosTerminalPolicy, issuePosSessionToken, verifyPosSessionToken } from './pos-policy.js';
import { CoreAccountingService } from '../accounting/CoreAccountingService.js';
import { InventoryService } from '../inventory/InventoryService.js';
export const posRoutes = Router();
posRoutes.use(authenticate);

const ADMIN_BRANCH_PERMISSION = PERMISSIONS.ADMIN_MANAGE_BRANCHES;

function isBranchAdmin(req: any): boolean {
    return req.user?.permissions?.includes(ADMIN_BRANCH_PERMISSION);
}

const objectIdRegex = /^[a-f\d]{24}$/i;
const POS_PAYMENT_METHODS = ['CASH', 'CARD', 'MIXED', 'CREDIT', 'BANK_TRANSFER'] as const;

function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}

function normalizeNullableString(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid id');
const optionalObjectIdSchema = z.preprocess(normalizeOptionalString, objectIdSchema.optional());
const nullableObjectIdSchema = z.preprocess(normalizeNullableString, objectIdSchema.nullable().optional());
const optionalTrimmedString = (maxLength: number) =>
    z.preprocess(normalizeOptionalString, z.string().min(1).max(maxLength).optional());
const posPaymentMethodSchema = z.preprocess(
    (value) => typeof value === 'string' ? value.trim().toUpperCase() : value,
    z.enum(POS_PAYMENT_METHODS)
);

async function assertBranchAccessible(req: any, branchId: string): Promise<void> {
    const companyId = req.user!.companyId;
    if (!isBranchAdmin(req) && !req.user!.branchIds.includes(branchId)) {
        throw AppError.forbidden('You do not have access to this branch');
    }
    const branch = await prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: { id: true },
    });
    if (!branch) throw AppError.badRequest('Invalid branch for this company');
}

const posItemSchema = z.object({
    productId: nullableObjectIdSchema,
    serviceId: nullableObjectIdSchema,
    unitCode: z.preprocess(normalizeNullableString, z.string().min(1).max(40).nullable().optional()),
    qty: z.number().positive(),
    unitPrice: z.number().min(0).optional().nullable(),
    discount: z.number().min(0).optional().default(0),
    taxAmount: z.number().min(0).optional().default(0),
    lineTotal: z.number().min(0).optional().nullable(),
}).superRefine((item, ctx) => {
    if (!item.productId && !item.serviceId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['productId'],
            message: 'Each line must include either productId or serviceId',
        });
    }
    if (item.productId && item.serviceId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['serviceId'],
            message: 'A line cannot include both productId and serviceId',
        });
    }
    if (item.productId && !item.unitCode) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['unitCode'],
            message: 'unitCode is required for product lines',
        });
    }
    if (item.serviceId && (item.unitPrice === undefined || item.unitPrice === null)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['unitPrice'],
            message: 'unitPrice is required for service lines',
        });
    }
    if (item.serviceId) {
        const gross = Number(item.qty) * Number(item.unitPrice || 0);
        if (Number(item.discount || 0) > gross) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['discount'],
                message: 'Discount cannot exceed qty * unitPrice for service lines',
            });
        }
    }
});

const posInvoiceSchema = z.object({
    customerId: nullableObjectIdSchema,
    clientRequestId: optionalTrimmedString(120),
    items: z.array(posItemSchema).min(1),
    subtotal: z.number().min(0).optional(),
    discountTotal: z.number().min(0).optional().default(0),
    taxTotal: z.number().min(0).optional().default(0),
    grandTotal: z.number().min(0).optional(),
    paymentMethod: posPaymentMethodSchema,
    cashReceived: z.number().min(0).optional().default(0),
    cardReceived: z.number().min(0).optional().default(0),
    changeGiven: z.number().min(0).optional().default(0),
    notes: optionalTrimmedString(4000),
    branchId: optionalObjectIdSchema,
    posTerminalId: nullableObjectIdSchema,
    posShiftId: nullableObjectIdSchema,
    // Loyalty
    loyaltyCustomerId: nullableObjectIdSchema,
    loyaltyPointsRedeemed: z.number().min(0).optional().default(0),
}).superRefine((data, ctx) => {
    if (data.paymentMethod === 'CREDIT' && !data.customerId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['customerId'],
            message: 'customerId is required for CREDIT payment',
        });
    }
    if (data.paymentMethod === 'CASH' && Number(data.cardReceived || 0) > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cardReceived'],
            message: 'cardReceived must be 0 for CASH payment',
        });
    }
    if ((data.paymentMethod === 'CARD' || data.paymentMethod === 'BANK_TRANSFER') && Number(data.cashReceived || 0) > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cashReceived'],
            message: 'cashReceived must be 0 for non-cash payment methods',
        });
    }
    if ((data.paymentMethod === 'CARD' || data.paymentMethod === 'BANK_TRANSFER' || data.paymentMethod === 'CREDIT') && Number(data.changeGiven || 0) > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['changeGiven'],
            message: 'changeGiven is only allowed for CASH or MIXED payments',
        });
    }
    if (data.paymentMethod === 'CREDIT' && (Number(data.cashReceived || 0) > 0 || Number(data.cardReceived || 0) > 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cashReceived'],
            message: 'CREDIT payment should not include received cash or card amounts',
        });
    }
    if (data.paymentMethod === 'MIXED') {
        if (Number(data.cashReceived || 0) <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cashReceived'],
                message: 'cashReceived is required for MIXED payment',
            });
        }
        if (Number(data.cardReceived || 0) <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cardReceived'],
                message: 'cardReceived is required for MIXED payment',
            });
        }
    }
    if (Number(data.loyaltyPointsRedeemed || 0) > 0 && !data.loyaltyCustomerId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['loyaltyCustomerId'],
            message: 'loyaltyCustomerId is required when redeeming points',
        });
    }
});

const loyaltyCustomerSchema = z.object({
    name: z.string().min(1).max(100),
    phone: z.string().min(5).max(20),
});

const posSessionLoginSchema = z.object({
    terminalId: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(1),
});

const posSessionBootstrapSchema = z.object({
    terminalId: z.string().min(1).optional(),
});

const receiptSettingsPatchSchema = z.object({
    defaultPrinter: z.string().optional(),
    knownPrinters: z.array(z.string()).optional(),
    invoiceTemplate: z.enum([
        'THERMAL_CLASSIC',
        'THERMAL_COMPACT',
        'A4_INVOICE',
        'THERMAL_MINIMAL',
        'THERMAL_BOLD',
        'THERMAL_GRID',
        'THERMAL_RESTAURANT',
        'THERMAL_PHARMACY',
        'THERMAL_GROCERY',
    ]).optional(),
    paperWidth: z.enum(['58MM', '80MM']).optional(),
    autoShowPreview: z.boolean().optional(),
    autoPrintOnComplete: z.boolean().optional(),
    printCopies: z.number().int().min(1).max(5).optional(),
    silentPrint: z.boolean().optional(),
    openCashDrawerAfterPrint: z.boolean().optional(),
    printLogo: z.boolean().optional(),
    showCashier: z.boolean().optional(),
    showCustomer: z.boolean().optional(),
    showTaxBreakdown: z.boolean().optional(),
    showFooterNote: z.boolean().optional(),
    footerNote: z.string().optional(),
    fontSizeBase: z.number().int().min(8).max(30).optional(),
    fontSizeItemName: z.number().int().min(8).max(30).optional(),
    fontSizeItemMeta: z.number().int().min(8).max(30).optional(),
    fontSizePrices: z.number().int().min(8).max(30).optional(),
    fontSizeTitle: z.number().int().min(8).max(30).optional(),
});

const HOTKEY_IDS = [
    'checkout',
    'holdSale',
    'clearCart',
    'focusBarcode',
    'searchItems',
    'customerLookup',
    'paymentCash',
    'paymentCard',
    'reprintReceipt',
    'toggleCatalog',
] as const;

const hotkeyBindingSchema = z.object({
    id: z.enum(HOTKEY_IDS),
    label: z.string().min(1).max(80),
    combo: z.string().max(40).optional().default(''),
    enabled: z.boolean().optional().default(true),
});

const shortcutItemSchema = z.object({
    id: z.string().min(1).max(120).optional(),
    productId: z.string().min(1),
    unitCode: z.string().min(1).max(40),
    label: z.string().max(80).optional(),
    color: z.string().max(16).optional(),
});

const hotkeyShortcutSettingsPatchSchema = z.object({
    hotkeys: z.array(hotkeyBindingSchema).max(40).optional(),
    shortcutItems: z.array(shortcutItemSchema).max(60).optional(),
});

const loyaltySettingsPatchSchema = z.object({
    pointsPerCurrencyUnit: z.number().positive().max(1000).optional(),
    redemptionPointsPerUnit: z.number().positive().max(100000).optional(),
    redemptionCurrencyValue: z.number().positive().max(100000).optional(),
    allowFractionalPoints: z.boolean().optional(),
});

type PosReceiptSettings = {
    defaultPrinter: string;
    knownPrinters: string[];
    invoiceTemplate:
    | 'THERMAL_CLASSIC'
    | 'THERMAL_COMPACT'
    | 'A4_INVOICE'
    | 'THERMAL_MINIMAL'
    | 'THERMAL_BOLD'
    | 'THERMAL_GRID'
    | 'THERMAL_RESTAURANT'
    | 'THERMAL_PHARMACY'
    | 'THERMAL_GROCERY';
    paperWidth: '58MM' | '80MM';
    autoShowPreview: boolean;
    autoPrintOnComplete: boolean;
    printCopies: number;
    silentPrint: boolean;
    openCashDrawerAfterPrint: boolean;
    printLogo: boolean;
    showCashier: boolean;
    showCustomer: boolean;
    showTaxBreakdown: boolean;
    showFooterNote: boolean;
    footerNote: string;
    fontSizeBase: number;
    fontSizeItemName: number;
    fontSizeItemMeta: number;
    fontSizePrices: number;
    fontSizeTitle: number;
};

type PosHotkeyId = typeof HOTKEY_IDS[number];

type PosHotkeyBinding = {
    id: PosHotkeyId;
    label: string;
    combo: string;
    enabled: boolean;
};

type PosShortcutItem = {
    id: string;
    productId: string;
    productName: string;
    itemCode: string;
    unitCode: string;
    label: string;
    color: string;
};

type PosHotkeyShortcutSettings = {
    hotkeys: PosHotkeyBinding[];
    shortcutItems: PosShortcutItem[];
};

type PosLoyaltySettings = {
    pointsPerCurrencyUnit: number;
    redemptionPointsPerUnit: number;
    redemptionCurrencyValue: number;
    allowFractionalPoints: boolean;
};

const DEFAULT_RECEIPT_SETTINGS: PosReceiptSettings = {
    defaultPrinter: '',
    knownPrinters: [],
    invoiceTemplate: 'THERMAL_CLASSIC',
    paperWidth: '80MM',
    autoShowPreview: true,
    autoPrintOnComplete: false,
    printCopies: 1,
    silentPrint: false,
    openCashDrawerAfterPrint: false,
    printLogo: false,
    showCashier: true,
    showCustomer: true,
    showTaxBreakdown: true,
    showFooterNote: true,
    footerNote: 'Thank you for shopping with us.',
    fontSizeBase: 12,
    fontSizeItemName: 12,
    fontSizeItemMeta: 10,
    fontSizePrices: 12,
    fontSizeTitle: 16,
};

const DEFAULT_HOTKEY_SETTINGS: PosHotkeyShortcutSettings = {
    hotkeys: [
        { id: 'checkout', label: 'Checkout Sale', combo: 'CTRL+ENTER', enabled: true },
        { id: 'holdSale', label: 'Hold Current Sale', combo: 'CTRL+H', enabled: true },
        { id: 'clearCart', label: 'Clear Cart', combo: 'CTRL+BACKSPACE', enabled: true },
        { id: 'focusBarcode', label: 'Focus Barcode Input', combo: 'F3', enabled: true },
        { id: 'searchItems', label: 'Focus Item Search', combo: 'F4', enabled: true },
        { id: 'customerLookup', label: 'Customer Lookup', combo: 'F6', enabled: true },
        { id: 'paymentCash', label: 'Switch to Cash Payment', combo: 'F8', enabled: true },
        { id: 'paymentCard', label: 'Switch to Card Payment', combo: 'F9', enabled: true },
        { id: 'reprintReceipt', label: 'Open Reprint Dialog', combo: 'CTRL+R', enabled: true },
        { id: 'toggleCatalog', label: 'Toggle Catalog / Bill', combo: 'TAB', enabled: false },
    ],
    shortcutItems: [],
};

const DEFAULT_LOYALTY_SETTINGS: PosLoyaltySettings = {
    pointsPerCurrencyUnit: 1,
    redemptionPointsPerUnit: 100,
    redemptionCurrencyValue: 0.5,
    allowFractionalPoints: false,
};

function hasPosPermission(perms: string[]): boolean {
    return perms.includes(PERMISSIONS.POS_ACCESS) || perms.includes(PERMISSIONS.POS_SELL) || perms.includes('pos.access');
}

function isManagerOrAdmin(roleName: string, perms: string[]): boolean {
    return String(roleName || '').toLowerCase().includes('manager') || perms.includes(PERMISSIONS.ADMIN_MANAGE_BRANCHES);
}

function resolvePosSession(req: any) {
    const raw = String(req.headers['x-pos-session'] || '').trim();
    if (!raw) return null;
    return verifyPosSessionToken(raw);
}

function sanitizeReceiptSettings(raw: any): PosReceiptSettings {
    const knownPrinters: string[] = Array.isArray(raw?.knownPrinters)
        ? Array.from(
            new Set(
                raw.knownPrinters
                    .map((p: any) => String(p || '').trim())
                    .filter((p: string) => Boolean(p))
            )
        )
        : [];
    const paperWidth = raw?.paperWidth === '58MM' ? '58MM' : '80MM';
    const allowedTemplates = new Set([
        'THERMAL_CLASSIC',
        'THERMAL_COMPACT',
        'A4_INVOICE',
        'THERMAL_MINIMAL',
        'THERMAL_BOLD',
        'THERMAL_GRID',
        'THERMAL_RESTAURANT',
        'THERMAL_PHARMACY',
        'THERMAL_GROCERY',
    ]);
    const invoiceTemplate = allowedTemplates.has(String(raw?.invoiceTemplate))
        ? String(raw?.invoiceTemplate)
        : 'THERMAL_CLASSIC';
    const printCopies = Number(raw?.printCopies);

    return {
        defaultPrinter: String(raw?.defaultPrinter || '').trim(),
        knownPrinters,
        invoiceTemplate: invoiceTemplate as PosReceiptSettings['invoiceTemplate'],
        paperWidth,
        autoShowPreview: raw?.autoShowPreview === false ? false : true,
        autoPrintOnComplete: raw?.autoPrintOnComplete === true,
        printCopies: Number.isFinite(printCopies) ? Math.min(5, Math.max(1, Math.floor(printCopies))) : 1,
        silentPrint: raw?.silentPrint === true,
        openCashDrawerAfterPrint: raw?.openCashDrawerAfterPrint === true,
        printLogo: raw?.printLogo === true,
        showCashier: raw?.showCashier === false ? false : true,
        showCustomer: raw?.showCustomer === false ? false : true,
        showTaxBreakdown: raw?.showTaxBreakdown === false ? false : true,
        showFooterNote: raw?.showFooterNote === false ? false : true,
        footerNote: String(raw?.footerNote || DEFAULT_RECEIPT_SETTINGS.footerNote),
        fontSizeBase: Number(raw?.fontSizeBase) || DEFAULT_RECEIPT_SETTINGS.fontSizeBase,
        fontSizeItemName: Number(raw?.fontSizeItemName) || DEFAULT_RECEIPT_SETTINGS.fontSizeItemName,
        fontSizeItemMeta: Number(raw?.fontSizeItemMeta) || DEFAULT_RECEIPT_SETTINGS.fontSizeItemMeta,
        fontSizePrices: Number(raw?.fontSizePrices) || DEFAULT_RECEIPT_SETTINGS.fontSizePrices,
        fontSizeTitle: Number(raw?.fontSizeTitle) || DEFAULT_RECEIPT_SETTINGS.fontSizeTitle,
    };
}

async function getReceiptSettings(companyId: string): Promise<PosReceiptSettings> {
    const row = await prisma.globalString.findFirst({
        where: {
            companyId,
            group: 'POS_RECEIPT_SETTINGS',
            systemKey: 'DEFAULT',
        },
        select: { metadata: true },
    });
    return sanitizeReceiptSettings(row?.metadata || DEFAULT_RECEIPT_SETTINGS);
}

async function upsertReceiptSettings(companyId: string, settings: PosReceiptSettings): Promise<void> {
    const normalized = sanitizeReceiptSettings(settings);
    await (prisma as any).globalString.upsert({
        where: { companyId_group_systemKey: { companyId, group: 'POS_RECEIPT_SETTINGS', systemKey: 'DEFAULT' } },
        update: {
            value: 'POS Receipt Settings',
            metadata: normalized as any,
            isActive: true,
        },
        create: {
            companyId,
            group: 'POS_RECEIPT_SETTINGS',
            systemKey: 'DEFAULT',
            value: 'POS Receipt Settings',
            metadata: normalized as any,
            isActive: true,
        },
    });
}

function normalizeHotkeyCombo(input: unknown): string {
    const raw = String(input || '').trim().toUpperCase();
    if (!raw) return '';
    return raw
        .replace(/\s+/g, '')
        .replace(/CONTROL/g, 'CTRL')
        .replace(/COMMAND/g, 'CMD');
}

function sanitizeHotkeyShortcutSettings(raw: any): PosHotkeyShortcutSettings {
    const defaultsById = new Map<PosHotkeyId, PosHotkeyBinding>(
        DEFAULT_HOTKEY_SETTINGS.hotkeys.map((h) => [h.id, h])
    );

    const incomingHotkeys = Array.isArray(raw?.hotkeys) ? raw.hotkeys : [];
    const hotkeysById = new Map<PosHotkeyId, PosHotkeyBinding>();

    for (const row of incomingHotkeys) {
        const id = String(row?.id || '') as PosHotkeyId;
        if (!HOTKEY_IDS.includes(id)) continue;
        const fallback = defaultsById.get(id)!;
        hotkeysById.set(id, {
            id,
            label: String(row?.label || fallback.label).trim().slice(0, 80) || fallback.label,
            combo: normalizeHotkeyCombo(row?.combo),
            enabled: row?.enabled === undefined ? true : Boolean(row?.enabled),
        });
    }

    const hotkeys: PosHotkeyBinding[] = HOTKEY_IDS.map((id) => {
        const fallback = defaultsById.get(id)!;
        const candidate = hotkeysById.get(id);
        return candidate
            ? {
                ...candidate,
                combo: candidate.combo || fallback.combo,
            }
            : fallback;
    });

    const incomingShortcuts = Array.isArray(raw?.shortcutItems) ? raw.shortcutItems : [];
    const dedup = new Set<string>();
    const shortcutItems: PosShortcutItem[] = [];
    for (const row of incomingShortcuts) {
        const productId = String(row?.productId || '').trim();
        const unitCode = String(row?.unitCode || '').trim();
        if (!productId || !unitCode) continue;
        const key = `${productId}:${unitCode}`;
        if (dedup.has(key)) continue;
        dedup.add(key);

        const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(row?.color || '').trim())
            ? String(row?.color).trim()
            : '#2563EB';

        shortcutItems.push({
            id: String(row?.id || key).trim().slice(0, 120) || key,
            productId,
            productName: String(row?.productName || '').trim(),
            itemCode: String(row?.itemCode || '').trim(),
            unitCode,
            label: String(row?.label || '').trim().slice(0, 80),
            color,
        });
        if (shortcutItems.length >= 30) break;
    }

    return { hotkeys, shortcutItems };
}

async function getHotkeyShortcutSettings(companyId: string): Promise<PosHotkeyShortcutSettings> {
    const row = await prisma.globalString.findFirst({
        where: {
            companyId,
            group: 'POS_HOTKEY_SHORTCUTS',
            systemKey: 'DEFAULT',
        },
        select: { metadata: true },
    });
    return sanitizeHotkeyShortcutSettings(row?.metadata || DEFAULT_HOTKEY_SETTINGS);
}

async function upsertHotkeyShortcutSettings(companyId: string, settings: PosHotkeyShortcutSettings): Promise<void> {
    const normalized = sanitizeHotkeyShortcutSettings(settings);
    await (prisma as any).globalString.upsert({
        where: { companyId_group_systemKey: { companyId, group: 'POS_HOTKEY_SHORTCUTS', systemKey: 'DEFAULT' } },
        update: {
            value: 'POS Hotkeys and Shortcut Items',
            metadata: normalized as any,
            isActive: true,
        },
        create: {
            companyId,
            group: 'POS_HOTKEY_SHORTCUTS',
            systemKey: 'DEFAULT',
            value: 'POS Hotkeys and Shortcut Items',
            metadata: normalized as any,
            isActive: true,
        },
    });
}

function sanitizeLoyaltySettings(raw: any): PosLoyaltySettings {
    const pointsPerCurrencyUnit = Number(raw?.pointsPerCurrencyUnit);
    const redemptionPointsPerUnit = Number(raw?.redemptionPointsPerUnit);
    const redemptionCurrencyValue = Number(raw?.redemptionCurrencyValue);

    return {
        pointsPerCurrencyUnit: Number.isFinite(pointsPerCurrencyUnit) && pointsPerCurrencyUnit > 0
            ? pointsPerCurrencyUnit
            : DEFAULT_LOYALTY_SETTINGS.pointsPerCurrencyUnit,
        redemptionPointsPerUnit: Number.isFinite(redemptionPointsPerUnit) && redemptionPointsPerUnit > 0
            ? redemptionPointsPerUnit
            : DEFAULT_LOYALTY_SETTINGS.redemptionPointsPerUnit,
        redemptionCurrencyValue: Number.isFinite(redemptionCurrencyValue) && redemptionCurrencyValue > 0
            ? redemptionCurrencyValue
            : DEFAULT_LOYALTY_SETTINGS.redemptionCurrencyValue,
        allowFractionalPoints: raw?.allowFractionalPoints === true,
    };
}

async function getLoyaltySettings(companyId: string): Promise<PosLoyaltySettings> {
    const row = await prisma.globalString.findFirst({
        where: {
            companyId,
            group: 'POS_LOYALTY_SETTINGS',
            systemKey: 'DEFAULT',
        },
        select: { metadata: true },
    });
    return sanitizeLoyaltySettings(row?.metadata || DEFAULT_LOYALTY_SETTINGS);
}

async function upsertLoyaltySettings(companyId: string, settings: PosLoyaltySettings): Promise<void> {
    const normalized = sanitizeLoyaltySettings(settings);
    await (prisma as any).globalString.upsert({
        where: { companyId_group_systemKey: { companyId, group: 'POS_LOYALTY_SETTINGS', systemKey: 'DEFAULT' } },
        update: {
            value: 'POS Loyalty Settings',
            metadata: normalized as any,
            isActive: true,
        },
        create: {
            companyId,
            group: 'POS_LOYALTY_SETTINGS',
            systemKey: 'DEFAULT',
            value: 'POS Loyalty Settings',
            metadata: normalized as any,
            isActive: true,
        },
    });
}

// POST /pos/session/login
posRoutes.post('/session/login', requireAnyPermission(PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_SELL), validate({ body: posSessionLoginSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const { terminalId, email, password } = req.body;

        // SECURITY FIX: Only allow users to create POS sessions for themselves
        // Prevents unauthorized users from attempting to login as other users
        if (req.user!.email.toLowerCase() !== email.toLowerCase()) {
            throw AppError.forbidden('Can only create POS session for your own account. Use your own credentials.');
        }

        const terminal: any = await (prisma as any).pOSTerminal.findFirst({
            where: { id: terminalId, companyId, isActive: true },
            include: { branch: { select: { id: true, name: true, code: true } } },
        });
        if (!terminal) throw AppError.notFound('Terminal not found or inactive');

        // Verify the authenticated user's identity (not just any user)
        const user: any = await prisma.user.findFirst({
            where: { id: req.user!.id, companyId },
            include: {
                role: { select: { name: true, permissions: true } },
                branches: { select: { branchId: true } },
            },
        });
        if (!user || !user.isActive) throw AppError.unauthorized('User account is invalid or inactive');

        // Still verify password for additional security
        const ok = await bcrypt.compare(String(password), user.passwordHash);
        if (!ok) throw AppError.unauthorized('Invalid password');

        const perms = user.role?.permissions || [];
        if (!hasPosPermission(perms)) {
            throw AppError.forbidden('User is not allowed to access POS');
        }

        const managerOrAdmin = isManagerOrAdmin(user.role?.name || '', perms);
        const branchIds = (user.branches || []).map((b: any) => b.branchId);
        if (!managerOrAdmin && !branchIds.includes(terminal.branchId)) {
            throw AppError.forbidden('User is not assigned to this terminal branch');
        }
        if (terminal.defaultUserId && terminal.defaultUserId !== user.id && !managerOrAdmin) {
            throw AppError.forbidden('User is not assigned to this terminal');
        }

        const policy = await getPosTerminalPolicy(companyId, terminal.id);
        const token = issuePosSessionToken({
            type: 'pos-session',
            companyId,
            terminalId: terminal.id,
            branchId: terminal.branchId,
            posUserId: user.id,
            terminalPriceGroupId: terminal.priceGroupId || null,
            policy,
        });

        sendSuccess(res, {
            token,
            terminal: {
                id: terminal.id,
                code: terminal.code,
                name: terminal.name,
                branchId: terminal.branchId,
                branch: terminal.branch,
                priceGroupId: terminal.priceGroupId || null,
            },
            policy,
            posUser: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role?.name || '',
                managerOrAdmin,
            },
        });
    } catch (error) { next(error); }
});

// POST /pos/session/bootstrap
// Starts POS session for already authenticated user (no extra credentials).
posRoutes.post('/session/bootstrap', requireAnyPermission(PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_SELL), validate({ body: posSessionBootstrapSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const { terminalId } = req.body as { terminalId?: string };

        const user: any = await prisma.user.findFirst({
            where: { id: req.user!.id, companyId },
            include: {
                role: { select: { name: true, permissions: true } },
                branches: { select: { branchId: true } },
            },
        });
        if (!user || !user.isActive) throw AppError.unauthorized('User is not active');

        const perms = user.role?.permissions || req.user!.permissions || [];
        if (!hasPosPermission(perms)) throw AppError.forbidden('User is not allowed to access POS');

        const managerOrAdmin = isManagerOrAdmin(user.role?.name || '', perms);
        const branchIds = (user.branches || []).map((b: any) => b.branchId);

        let terminal: any = null;
        if (terminalId) {
            terminal = await (prisma as any).pOSTerminal.findFirst({
                where: { id: terminalId, companyId, isActive: true },
                include: { branch: { select: { id: true, name: true, code: true } } },
            });
            if (!terminal) throw AppError.notFound('Terminal not found or inactive');
        } else {
            const assigned = await (prisma as any).pOSTerminal.findMany({
                where: {
                    companyId,
                    isActive: true,
                    defaultUserId: user.id,
                    ...(managerOrAdmin ? {} : { branchId: { in: branchIds } }),
                },
                include: { branch: { select: { id: true, name: true, code: true } } },
                orderBy: { code: 'asc' },
            });

            if (assigned.length === 0) {
                throw AppError.badRequest('No terminal assigned to this POS user. Configure terminal default user first.');
            }
            if (assigned.length > 1) {
                throw AppError.badRequest('Multiple terminals assigned. Please select terminal.');
            }
            terminal = assigned[0];
        }

        if (!managerOrAdmin && !branchIds.includes(terminal.branchId)) {
            throw AppError.forbidden('User is not assigned to this terminal branch');
        }
        if (terminal.defaultUserId && terminal.defaultUserId !== user.id && !managerOrAdmin) {
            throw AppError.forbidden('User is not assigned to this terminal');
        }

        const policy = await getPosTerminalPolicy(companyId, terminal.id);
        const token = issuePosSessionToken({
            type: 'pos-session',
            companyId,
            terminalId: terminal.id,
            branchId: terminal.branchId,
            posUserId: user.id,
            terminalPriceGroupId: terminal.priceGroupId || null,
            policy,
        });

        sendSuccess(res, {
            token,
            terminal: {
                id: terminal.id,
                code: terminal.code,
                name: terminal.name,
                branchId: terminal.branchId,
                branch: terminal.branch,
                priceGroupId: terminal.priceGroupId || null,
            },
            policy,
            posUser: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role?.name || '',
                managerOrAdmin,
            },
        });
    } catch (error) { next(error); }
});

// GET /pos/session/me
posRoutes.get('/session/me', requireAnyPermission(PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_SELL), async (req, res, next) => {
    try {
        const session = resolvePosSession(req);
        if (!session) throw AppError.unauthorized('POS session not found');
        if (session.companyId !== req.user!.companyId) throw AppError.unauthorized('Invalid POS session');

        const terminal: any = await (prisma as any).pOSTerminal.findFirst({
            where: { id: session.terminalId, companyId: req.user!.companyId, isActive: true },
            include: { branch: { select: { id: true, name: true, code: true } } },
        });
        if (!terminal) throw AppError.unauthorized('Terminal in session is unavailable');

        sendSuccess(res, {
            ...session,
            terminal: {
                id: terminal.id,
                code: terminal.code,
                name: terminal.name,
                branchId: terminal.branchId,
                branch: terminal.branch,
                priceGroupId: terminal.priceGroupId || null,
            },
        });
    } catch (error) { next(error); }
});

// POST /pos/session/logout
// POS session token is stateless JWT; this endpoint confirms connectivity and session validity before client clears it.
posRoutes.post('/session/logout', requireAnyPermission(PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_SELL), async (req, res, next) => {
    try {
        const session = resolvePosSession(req);
        if (!session) throw AppError.unauthorized('POS session not found');
        if (session.companyId !== req.user!.companyId) throw AppError.unauthorized('Invalid POS session');

        sendSuccess(res, { message: 'POS session ended' });
    } catch (error) { next(error); }
});

// GET /pos/receipt-settings
posRoutes.get('/receipt-settings', requireAnyPermission(PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_SELL), async (req, res, next) => {
    try {
        const settings = await getReceiptSettings(req.user!.companyId);
        sendSuccess(res, settings);
    } catch (error) { next(error); }
});

// PATCH /pos/receipt-settings
posRoutes.patch('/receipt-settings', requirePermission(PERMISSIONS.POS_MANAGE_TERMINALS), validate({ body: receiptSettingsPatchSchema }), async (req, res, next) => {
    try {
        const current = await getReceiptSettings(req.user!.companyId);
        const merged = sanitizeReceiptSettings({ ...current, ...req.body });
        await upsertReceiptSettings(req.user!.companyId, merged);
        sendSuccess(res, merged);
    } catch (error) { next(error); }
});

// GET /pos/hotkeys-shortcuts
posRoutes.get('/hotkeys-shortcuts', requireAnyPermission(PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_SELL), async (req, res, next) => {
    try {
        const settings = await getHotkeyShortcutSettings(req.user!.companyId);
        sendSuccess(res, settings);
    } catch (error) { next(error); }
});

// PATCH /pos/hotkeys-shortcuts
posRoutes.patch('/hotkeys-shortcuts', requirePermission(PERMISSIONS.POS_MANAGE_TERMINALS), validate({ body: hotkeyShortcutSettingsPatchSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const current = await getHotkeyShortcutSettings(companyId);
        const merged = sanitizeHotkeyShortcutSettings({ ...current, ...req.body });
        const enabledCombos = merged.hotkeys
            .filter((h) => h.enabled)
            .map((h) => normalizeHotkeyCombo(h.combo))
            .filter(Boolean);
        const comboSeen = new Set<string>();
        for (const combo of enabledCombos) {
            if (comboSeen.has(combo)) {
                throw AppError.badRequest(`Duplicate hotkey combo: ${combo}`);
            }
            comboSeen.add(combo);
        }

        if (merged.shortcutItems.length > 0) {
            const productIds = Array.from(new Set(merged.shortcutItems.map((x) => x.productId)));
            const products = await prisma.product.findMany({
                where: {
                    companyId,
                    id: { in: productIds },
                    deletedAt: null,
                },
                select: {
                    id: true,
                    name: true,
                    itemCode: true,
                    units: { select: { unitCode: true, unitName: true } },
                },
            });
            const productMap = new Map(products.map((p: any) => [String(p.id), p]));

            if (products.length !== productIds.length) {
                throw AppError.badRequest('One or more shortcut products are invalid or inactive');
            }

            merged.shortcutItems = merged.shortcutItems.map((row) => {
                const product = productMap.get(String(row.productId));
                if (!product) throw AppError.badRequest(`Invalid shortcut product: ${row.productId}`);
                const unit = (product.units || []).find((u: any) => String(u.unitCode) === String(row.unitCode));
                if (!unit) {
                    throw AppError.badRequest(`Invalid unit "${row.unitCode}" for product ${product.name}`);
                }
                return {
                    ...row,
                    id: row.id || `${row.productId}:${row.unitCode}`,
                    productName: String(product.name || ''),
                    itemCode: String(product.itemCode || ''),
                    label: row.label || String(product.name || ''),
                };
            });
        }

        await upsertHotkeyShortcutSettings(companyId, merged);
        sendSuccess(res, merged);
    } catch (error) { next(error); }
});

// GET /pos/loyalty-settings
posRoutes.get('/loyalty-settings', requireAnyPermission(PERMISSIONS.POS_ACCESS, PERMISSIONS.POS_SELL), async (req, res, next) => {
    try {
        const settings = await getLoyaltySettings(req.user!.companyId);
        sendSuccess(res, settings);
    } catch (error) { next(error); }
});

// PATCH /pos/loyalty-settings
posRoutes.patch('/loyalty-settings', requirePermission(PERMISSIONS.POS_MANAGE_TERMINALS), validate({ body: loyaltySettingsPatchSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const current = await getLoyaltySettings(companyId);
        const merged = sanitizeLoyaltySettings({ ...current, ...req.body });
        await upsertLoyaltySettings(companyId, merged);
        sendSuccess(res, merged);
    } catch (error) { next(error); }
});

// GET /pos/next-invoice-no
posRoutes.get('/next-invoice-no', requireBranch, async (req, res, next) => {
    try {
        const branch = await prisma.branch.findFirst({
            where: { id: req.activeBranchId!, companyId: req.user!.companyId },
            select: { id: true, code: true },
        });
        if (!branch) throw AppError.notFound('Branch');

        const nextNum = await peekNextCounter(prisma as any, req.user!.companyId, 'POS_INVOICE', req.activeBranchId!);
        const invoiceNo = formatDocNo(branch.code, nextNum);
        sendSuccess(res, { invoiceNo });
    } catch (error) { next(error); }
});

// GET /pos/invoices
posRoutes.get('/invoices', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const query = paginationSchema.parse(req.query);
        const { skip, take, page, limit } = getPaginationParams(query);
        const { branchId, customerId, status, dateFrom, dateTo } = req.query as any;

        const where: any = { companyId: req.user!.companyId };
        if (branchId) {
            await assertBranchAccessible(req, branchId);
            where.branchId = branchId;
        } else if (!isBranchAdmin(req)) {
            where.branchId = { in: req.user!.branchIds };
        }
        if (customerId) where.customerId = customerId;
        if (status) where.status = status;
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) where.createdAt.lte = new Date(dateTo);
        }

        const [invoices, total] = await Promise.all([
            prisma.pOSInvoice.findMany({
                where,
                skip,
                take,
                include: {
                    customer: { select: { id: true, name: true, customerCode: true } },
                    branch: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.pOSInvoice.count({ where }),
        ]);

        sendPaginated(res, invoices, total, page, limit);
    } catch (error) { next(error); }
});

// GET /pos/invoices/:id
posRoutes.get('/invoices/:id', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const invoiceId = String(req.params.id);
        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const invoice = await prisma.pOSInvoice.findFirst({
            where: { id: invoiceId, companyId: req.user!.companyId, ...branchScope },
            include: {
                customer: true,
                loyaltyCustomer: true,
                branch: true,
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: { product: { select: { id: true, itemCode: true, name: true, nameArabic: true, units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true } } } } },
                },
            },
        });
        if (!invoice) throw AppError.notFound('Invoice');
        sendSuccess(res, invoice);
    } catch (error) { next(error); }
});

// GET /pos/invoices/by-no/:invoiceNo
posRoutes.get('/invoices/by-no/:invoiceNo', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const invoiceNo = String(req.params.invoiceNo || '').trim();
        if (!invoiceNo) throw AppError.badRequest('Invoice number is required');

        const branchScope = isBranchAdmin(req) ? {} : { branchId: { in: req.user!.branchIds } };
        const invoice = await prisma.pOSInvoice.findFirst({
            where: { invoiceNo, companyId: req.user!.companyId, ...branchScope },
            include: {
                customer: true,
                loyaltyCustomer: true,
                branch: true,
                createdBy: { select: { id: true, name: true } },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                itemCode: true,
                                name: true,
                                nameArabic: true,
                                units: { select: { unitCode: true, unitName: true, qtyInBaseUnit: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!invoice) throw AppError.notFound('Invoice');

        sendSuccess(res, invoice);
    } catch (error) { next(error); }
});

// ══════════════════════════════════════════════════════════════
// LOYALTY CUSTOMERS
// ══════════════════════════════════════════════════════════════

posRoutes.get('/loyalty-customers', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const raw = typeof req.query.q === 'string'
            ? req.query.q
            : typeof req.query.search === 'string'
                ? req.query.search
                : '';
        const q = raw.trim();
        const companyId = req.user!.companyId;

        const where: any = { companyId };
        if (q.length > 0) {
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
            ];
        }

        const customers = await (prisma as any).loyaltyCustomer.findMany({
            where,
            orderBy: { name: 'asc' },
            take: 20,
        });

        sendSuccess(res, customers);
    } catch (error) { next(error); }
});

posRoutes.post('/loyalty-customers', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), validate({ body: loyaltyCustomerSchema }), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const { name, phone } = req.body;

        // Check if phone already exists for this company
        const existing = await (prisma as any).loyaltyCustomer.findUnique({
            where: { companyId_phone: { companyId, phone } },
        });

        if (existing) {
            throw AppError.badRequest('A loyalty customer with this phone number already exists');
        }

        const customer = await (prisma as any).loyaltyCustomer.create({
            data: {
                companyId,
                name,
                phone,
                pointsBalance: 0,
            },
        });

        sendSuccess(res, customer, undefined, 201);
    } catch (error) { next(error); }
});

posRoutes.get('/loyalty-customers/:id', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const customer = await (prisma as any).loyaltyCustomer.findFirst({
            where: { id: req.params.id, companyId },
            include: {
                pointHistory: {
                    include: {
                        invoice: {
                            select: {
                                id: true,
                                invoiceNo: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                },
            },
        });

        if (!customer) throw AppError.notFound('Loyalty Customer');
        sendSuccess(res, { customer, history: customer.pointHistory });
    } catch (error) { next(error); }
});

posRoutes.get('/loyalty-customers/:id/history', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), async (req, res, next) => {
    try {
        const companyId = req.user!.companyId;
        const customer = await (prisma as any).loyaltyCustomer.findFirst({
            where: { id: req.params.id, companyId },
            select: { id: true },
        });
        if (!customer) throw AppError.notFound('Loyalty Customer');

        const history = await (prisma as any).loyaltyPointHistory.findMany({
            where: { companyId, customerId: req.params.id },
            include: {
                invoice: {
                    select: {
                        id: true,
                        invoiceNo: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        sendSuccess(res, history);
    } catch (error) { next(error); }
});

// POST /pos/invoices — TRANSACTIONAL: create invoice + deduct stock + movements + journal entry
posRoutes.post('/invoices', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS, PERMISSIONS.SALES_CREATE), requireBranch, validate({ body: posInvoiceSchema }), async (req, res, next) => {
    try {
        const {
            customerId,
            clientRequestId,
            items,
            paymentMethod,
            cashReceived = 0,
            cardReceived = 0,
            notes,
            branchId: bodyBranchId,
            posTerminalId,
            posShiftId,
            // Loyalty
            loyaltyCustomerId,
            loyaltyPointsRedeemed = 0,
        } = req.body;
        const usePosSession = Boolean(posTerminalId || posShiftId);
        const posSession = usePosSession ? resolvePosSession(req) : null;
        if (usePosSession && !posSession) {
            throw AppError.unauthorized('POS session is required');
        }
        if (posSession && posSession.companyId !== req.user!.companyId) {
            throw AppError.unauthorized('Invalid POS session');
        }
        const branchId = posSession?.branchId || bodyBranchId || req.activeBranchId!;
        const companyId = req.user!.companyId;
        const userId = posSession?.posUserId || req.user!.id;
        const normalizedClientRequestId = String(clientRequestId || '').trim().slice(0, 120);
        const loyaltySettings = await getLoyaltySettings(companyId);
        await assertBranchAccessible(req, branchId);
        if (usePosSession) {
            if (!posTerminalId) throw AppError.badRequest('Terminal is required for POS checkout');
            if (posTerminalId !== posSession!.terminalId) throw AppError.badRequest('Terminal does not match POS session');
            if (branchId !== posSession!.branchId) throw AppError.badRequest('Branch does not match POS session terminal');
            if (String(paymentMethod).toUpperCase() === 'CREDIT' && !posSession!.policy.allowCreditSales) {
                throw AppError.badRequest('Credit sales are disabled for this POS');
            }
            const allowedMethods = (posSession!.policy.allowedPaymentMethods || []).map((m: string) => String(m).toUpperCase());
            if (allowedMethods.length && !allowedMethods.includes(String(paymentMethod).toUpperCase())) {
                throw AppError.badRequest(`Payment method ${paymentMethod} is not allowed for this POS`);
            }
            if (posSession!.policy.requireShiftForSale) {
                if (!posShiftId) throw AppError.badRequest('Open shift is required to post sale');
                const shift = await (prisma as any).pOSShift.findFirst({
                    where: {
                        id: posShiftId,
                        companyId,
                        terminalId: posTerminalId,
                        status: 'OPEN',
                    },
                    select: { id: true },
                });
                if (!shift) throw AppError.badRequest('Shift is invalid or closed');
            }
        }

        if (normalizedClientRequestId) {
            const existingInvoice = await prisma.pOSInvoice.findFirst({
                where: {
                    companyId,
                    clientRequestId: normalizedClientRequestId,
                } as any,
                include: { items: true },
            });

            if (existingInvoice) {
                sendSuccess(res, existingInvoice);
                return;
            }
        }

        const requestingUser: any = await prisma.user.findFirst({
            where: { id: userId, companyId },
            include: { role: { select: { name: true, permissions: true } } }
        });
        const managerOrAdmin = requestingUser ? isManagerOrAdmin(requestingUser.role?.name || '', requestingUser.role?.permissions || []) : false;

        const result = await prisma.$transaction(async (tx) => {
            const requestedItems = items as Array<{
                productId: string;
                serviceId?: string;
                unitCode: string;
                qty: number;
                unitPrice?: number;
                discount?: number;
            }>;

            const customer = customerId
                ? await tx.customer.findFirst({
                    where: { id: customerId, companyId },
                    select: { id: true, priceGroupId: true, creditLimit: true, openingBalance: true, allowCreditSales: true },
                })
                : null;
            if (customerId && !customer) throw AppError.notFound('Customer');

            const productIds = [...new Set(requestedItems.map((i) => i.productId))];
            const products = await tx.product.findMany({
                where: {
                    companyId,
                    id: { in: productIds },
                    status: 'ACTIVE',
                    deletedAt: { isSet: false },
                } as any,
                include: { units: true, tax: true },
            });
            const productById = new Map(products.map((p) => [p.id, p]));

            if (products.length !== productIds.length) {
                throw AppError.badRequest('One or more products are unavailable for sale');
            }

            const activeSalesTaxes = await tx.tax.findMany({
                where: {
                    companyId,
                    isActive: true,
                    OR: [{ type: 'SALES' }, { type: 'BOTH' }],
                },
                select: {
                    id: true,
                    name: true,
                    rate: true,
                    isDefault: true,
                },
            });

            if (activeSalesTaxes.length === 0) {
                throw AppError.badRequest(
                    'POS sales are blocked: configure at least one active sales tax in Settings > Tax Management.'
                );
            }

            const activeSalesTaxById = new Map(activeSalesTaxes.map((tax) => [tax.id, tax]));
            const defaultSalesTax = activeSalesTaxes.find((tax) => tax.isDefault) || activeSalesTaxes[0];

            const priceOverrides = new Map<string, { salePrice: number; minPrice: number | null }>();
            const customerPriceGroupId = customer?.priceGroupId || null;
            const terminalPriceGroupId = posSession?.terminalPriceGroupId || null;
            const effectivePriceGroupId = posSession?.policy?.pricePriority === 'TERMINAL_FIRST'
                ? (terminalPriceGroupId || customerPriceGroupId)
                : (customerPriceGroupId || terminalPriceGroupId);
            if (effectivePriceGroupId) {
                const rows = await (tx as any).productPriceGroup.findMany({
                    where: {
                        priceGroupId: effectivePriceGroupId,
                        productId: { in: productIds },
                    },
                    select: { productId: true, unitCode: true, salePrice: true, minimumNegotiationPrice: true },
                });
                for (const row of rows) {
                    const key = `${row.productId}::${String(row.unitCode).toUpperCase()}`;
                    priceOverrides.set(key, {
                        salePrice: Number(row.salePrice),
                        minPrice: row.minimumNegotiationPrice != null ? Number(row.minimumNegotiationPrice) : null,
                    });
                }
            }

            const taxConfigErrors = new Set<string>();
            const computedItems = requestedItems.map((item) => {
                // Handle SERVICE items
                if (item.serviceId) {
                    const qty = Number(item.qty);
                    if (!Number.isFinite(qty) || qty <= 0) throw AppError.badRequest('Invalid quantity');

                    const unitPrice = Number(item.unitPrice || 0);
                    const discount = Number(item.discount || 0);
                    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw AppError.badRequest('Invalid unit price');
                    if (!Number.isFinite(discount) || discount < 0) throw AppError.badRequest('Invalid discount');

                    const gross = unitPrice * qty;
                    if (discount > gross) throw AppError.badRequest('Discount cannot exceed Total Amount');

                    const lineSubtotal = gross - discount;
                    // Services use default tax rate
                    const taxRate = defaultSalesTax ? Number(defaultSalesTax.rate) : 0;
                    const taxAmount = lineSubtotal * taxRate;

                    return {
                        serviceId: item.serviceId,
                        unitCode: item.unitCode || 'SERVICE',
                        qty,
                        unitPrice,
                        taxRate,
                        discount,
                        taxAmount,
                        lineTotal: lineSubtotal,
                    };
                }

                // Handle PRODUCT items (existing logic)
                const product = productById.get(item.productId);
                if (!product) throw AppError.badRequest(`Product ${item.productId} not found`);

                const unit = product.units.find(
                    (u) => String(u.unitCode).toUpperCase() === String(item.unitCode).toUpperCase()
                );
                if (!unit) throw AppError.badRequest(`Unit ${item.unitCode} not found for ${product.itemCode}`);

                const qty = Number(item.qty);
                if (!Number.isFinite(qty) || qty <= 0) throw AppError.badRequest('Invalid quantity');

                const overrideKey = `${item.productId}::${String(unit.unitCode).toUpperCase()}`;
                const hasOverride = priceOverrides.has(overrideKey);
                const overrideData = priceOverrides.get(overrideKey);
                const unitPrice = hasOverride && overrideData
                    ? Number(overrideData.salePrice)
                    : Number(unit.salePrice);
                const minPrice = hasOverride && overrideData
                    ? (overrideData.minPrice ?? unit.minimumNegotiationPrice)
                    : unit.minimumNegotiationPrice;
                const discount = Number(item.discount || 0);
                if (!Number.isFinite(discount) || discount < 0) throw AppError.badRequest('Invalid discount');

                const gross = unitPrice * qty;
                if (discount > gross) throw AppError.badRequest('Discount cannot exceed Total Amount');

                const lineSubtotalPreview = gross - discount;
                const effectiveUnitPrice = lineSubtotalPreview / qty;
                if (minPrice != null && effectiveUnitPrice < minPrice) {
                    if (!managerOrAdmin) {
                        throw AppError.badRequest(`Price cannot be lower than the minimum allowed price (${minPrice} SAR) for item ${product.name}`);
                    }
                }
                if (usePosSession) {
                    const maxPct = Number(posSession!.policy.maxDiscountPct || 0);
                    const maxAllowed = gross * (maxPct / 100);
                    if (discount > maxAllowed) {
                        throw AppError.badRequest(`Discount exceeds POS max ${maxPct}% for item ${item.productId}`);
                    }
                }

                const lineSubtotal = gross - discount;
                const productLabel = `${product.itemCode} (${product.name})`;
                let appliedTax = null;

                if (product.taxId) {
                    appliedTax = activeSalesTaxById.get(product.taxId) || null;
                    if (!appliedTax) {
                        taxConfigErrors.add(`${productLabel}: assigned tax is inactive or not valid for sales`);
                        return null;
                    }
                } else if (defaultSalesTax) {
                    appliedTax = defaultSalesTax;
                }

                if (!appliedTax) {
                    taxConfigErrors.add(`${productLabel}: no tax assigned and no default sales tax configured`);
                    return null;
                }

                const taxRate = Number(appliedTax.rate);
                if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
                    taxConfigErrors.add(`${productLabel}: tax rate is invalid`);
                    return null;
                }

                const taxAmount = lineSubtotal * taxRate;
                return {
                    productId: item.productId,
                    unitCode: unit.unitCode,
                    qty,
                    unitPrice,
                    taxRate,
                    discount,
                    taxAmount,
                    lineTotal: lineSubtotal,
                };
            }).filter(Boolean) as Array<{
                productId?: string;
                serviceId?: string;
                unitCode: string;
                qty: number;
                unitPrice: number;
                taxRate: number;
                discount: number;
                taxAmount: number;
                lineTotal: number;
            }>;

            if (taxConfigErrors.size > 0) {
                const errors = Array.from(taxConfigErrors);
                const preview = errors.slice(0, 3).join('; ');
                const suffix = errors.length > 3 ? `; and ${errors.length - 3} more item(s)` : '';
                throw AppError.badRequest(`Tax configuration is incomplete: ${preview}${suffix}`);
            }

            const subtotal = computedItems.reduce((sum, item) => sum + item.lineTotal, 0); // Note: lineTotal was used as subtotal in return
            const discountTotal = computedItems.reduce((sum, item) => sum + item.discount, 0);
            const taxTotal = computedItems.reduce((sum, item) => sum + item.taxAmount, 0);
            let grandTotal = subtotal + taxTotal;

            // LOYALTY REDEMPTION
            let pointsRedemptionValue = 0;
            let effectivePointsRedeemed = Number(loyaltyPointsRedeemed || 0);
            if (!Number.isFinite(effectivePointsRedeemed) || effectivePointsRedeemed < 0) {
                throw AppError.badRequest('Invalid loyalty points redeemed value');
            }
            if (!loyaltySettings.allowFractionalPoints) {
                effectivePointsRedeemed = Math.floor(effectivePointsRedeemed);
            } else {
                effectivePointsRedeemed = Number(effectivePointsRedeemed.toFixed(2));
            }
            if (!loyaltyCustomerId && effectivePointsRedeemed > 0) {
                throw AppError.badRequest('Loyalty customer is required to redeem points');
            }
            let loyaltyCustDetails: any = null;
            if (loyaltyCustomerId) {
                loyaltyCustDetails = await (tx as any).loyaltyCustomer.findFirst({
                    where: { id: loyaltyCustomerId, companyId },
                });
                if (!loyaltyCustDetails) throw AppError.notFound('Loyalty Customer');

                if (effectivePointsRedeemed > 0) {
                    if (loyaltyCustDetails.pointsBalance < effectivePointsRedeemed) {
                        throw AppError.badRequest('Insufficient loyalty points');
                    }

                    const valuePerPoint = loyaltySettings.redemptionPointsPerUnit > 0
                        ? (loyaltySettings.redemptionCurrencyValue / loyaltySettings.redemptionPointsPerUnit)
                        : 0;
                    if (!Number.isFinite(valuePerPoint) || valuePerPoint <= 0) {
                        throw AppError.badRequest('Loyalty redemption settings are invalid');
                    }

                    const maxByGrandTotalRaw = grandTotal / valuePerPoint;
                    const maxByGrandTotal = loyaltySettings.allowFractionalPoints
                        ? Number(maxByGrandTotalRaw.toFixed(2))
                        : Math.floor(maxByGrandTotalRaw);
                    if (effectivePointsRedeemed > maxByGrandTotal) {
                        effectivePointsRedeemed = maxByGrandTotal;
                    }

                    pointsRedemptionValue = Number((effectivePointsRedeemed * valuePerPoint).toFixed(2));
                    grandTotal = Number(Math.max(0, grandTotal - pointsRedemptionValue).toFixed(2));
                }
            }

            if (String(paymentMethod).toUpperCase() === 'CREDIT' && !customerId) {
                throw AppError.badRequest('Customer is required for CREDIT payment');
            }
            if (String(paymentMethod).toUpperCase() === 'CREDIT' && customer && customer.allowCreditSales === false) {
                throw AppError.badRequest('Selected customer is not allowed for CREDIT sales');
            }

            const enteredCash = Number(cashReceived || 0);
            if (!Number.isFinite(enteredCash) || enteredCash < 0) {
                throw AppError.badRequest('Invalid cash received value');
            }
            const enteredCard = Number(cardReceived || 0);
            if (!Number.isFinite(enteredCard) || enteredCard < 0) {
                throw AppError.badRequest('Invalid card received value');
            }

            let normalizedCashReceived = 0;
            let normalizedChangeGiven = 0;
            let normalizedCardApplied = 0;
            if (paymentMethod === 'CASH') {
                if (enteredCash < grandTotal) {
                    throw AppError.badRequest('Cash received cannot be less than grand total');
                }
                normalizedCashReceived = enteredCash;
                normalizedChangeGiven = Math.max(0, enteredCash - grandTotal);
            } else if (paymentMethod === 'CARD') {
                normalizedCardApplied = grandTotal;
            } else if (paymentMethod === 'MIXED') {
                if (enteredCash <= 0 || enteredCard <= 0) {
                    throw AppError.badRequest('For mixed payment, both cash and card amounts are required');
                }
                const totalPaid = enteredCash + enteredCard;
                if (totalPaid < grandTotal) {
                    throw AppError.badRequest('For mixed payment, cash + card must be at least grand total');
                }
                normalizedCashReceived = enteredCash;
                normalizedChangeGiven = Math.max(0, totalPaid - grandTotal);
                if (normalizedChangeGiven > normalizedCashReceived) {
                    throw AppError.badRequest('For mixed payment, return cash cannot exceed received cash');
                }
                const netCash = new Decimal(normalizedCashReceived.toString()).minus(normalizedChangeGiven || 0);
                normalizedCardApplied = new Decimal(grandTotal.toString()).minus(netCash).toNumber();
            }

            // Check credit limit for CREDIT sales using server-computed totals
            if (String(paymentMethod).toUpperCase() === 'CREDIT' && customerId) {
                if (!customer) throw AppError.notFound('Customer');

                const arBalance = await tx.journalEntryLine.aggregate({
                    where: {
                        partyType: 'CUSTOMER',
                        partyId: customerId,
                    },
                    _sum: { debit: true, credit: true },
                });

                const currentBalance = new Decimal((arBalance._sum.debit || 0).toString())
                    .minus(new Decimal((arBalance._sum.credit || 0).toString()))
                    .plus(customer.openingBalance);

                const creditLimit = new Decimal(customer.creditLimit.toString());
                if (currentBalance.plus(grandTotal).gt(creditLimit) && creditLimit.gt(0)) {
                    throw AppError.badRequest(
                        `Credit limit exceeded. Limit: ${creditLimit}, Current: ${currentBalance}, Invoice: ${grandTotal}`
                    );
                }
            }

            // Generate invoice number
            const branch = await tx.branch.findFirst({ where: { id: branchId, companyId }, select: { id: true, code: true } });
            if (!branch) throw AppError.notFound('Branch');

            // Generate invoice number with retry
            let invoiceNo = '';
            let nextNum = 0;
            let attempts = 0;
            const MAX_ATTEMPTS = 5;

            while (attempts < MAX_ATTEMPTS) {
                attempts++;
                nextNum = await nextCounter(tx as any, companyId, 'POS_INVOICE', branchId);
                invoiceNo = formatDocNo(branch.code, nextNum);

                // Check if this specific invoiceNo already exists to avoid throwing inside create()
                // This is a "read before write" check within the transaction to reduce failure rate, 
                // though strictly race conditions could still happen in high concurrency, 
                // but since we are locking the counter row via update, we effectively serialize generation per branch.
                const existing = await tx.pOSInvoice.findUnique({
                    where: { companyId_invoiceNo: { companyId, invoiceNo } }
                });

                if (!existing) break;
                // If exists, loop will run again and increment counter
            }

            if (attempts >= MAX_ATTEMPTS) {
                throw AppError.internal('Failed to generate unique invoice number');
            }

            // Create POS invoice placeholder
            let status: any = paymentMethod === 'CREDIT' ? 'CREDIT' : 'PAID';
            let isPosted = true;

            // Pre-fetch products for stock operations (avoid repeated lookups per item)
            const productUnitCache = new Map<string, any>();
            for (const item of computedItems) {
                if (item.serviceId || !item.productId) continue;
                if (!productUnitCache.has(item.productId)) {
                    const p = await (tx as any).product.findUnique({
                        where: { id: item.productId },
                        select: { id: true, name: true, itemCode: true, units: { select: { unitCode: true, qtyInBaseUnit: true, isBase: true } } },
                    });
                    if (p) productUnitCache.set(item.productId, p);
                }
            }

            // Single-pass stock check
            for (const item of computedItems) {
                if (item.serviceId) continue;
                const cachedProduct = productUnitCache.get(item.productId as string);
                const qtyAvailable = await InventoryService.getAvailableStockQty(tx as any, {
                    companyId,
                    branchId,
                    productId: item.productId as string,
                    unitCode: item.unitCode as string,
                }, cachedProduct);

                if (qtyAvailable < item.qty) {
                    isPosted = false;
                    status = 'UNPOSTED';
                    break;
                }
            }

            // LOYALTY EARNING
            const earnedRaw = Number(grandTotal) * Number(loyaltySettings.pointsPerCurrencyUnit || 1);
            const pointsEarned = loyaltySettings.allowFractionalPoints
                ? Number(earnedRaw.toFixed(2))
                : Math.round(earnedRaw);

            const invoice = await (tx as any).pOSInvoice.create({
                data: {
                    companyId,
                    branchId,
                    invoiceNo,
                    clientRequestId: normalizedClientRequestId || null,
                    customerId: customerId || null,
                    posTerminalId: posTerminalId || null,
                    posShiftId: posShiftId || null,
                    subtotal,
                    discountTotal,
                    taxTotal,
                    grandTotal,
                    paymentMethod,
                    cashReceived: normalizedCashReceived,
                    changeGiven: normalizedChangeGiven,
                    status,
                    isPosted: isPosted as any,
                    notes,
                    createdById: userId,
                    loyaltyCustomerId: loyaltyCustomerId || null,
                    loyaltyPointsEarned: pointsEarned,
                    loyaltyPointsRedeemed: effectivePointsRedeemed,
                    items: {
                        create: computedItems.map((item) => ({
                            productId: item.productId || null,
                            serviceId: item.serviceId || null,
                            unitCode: item.unitCode,
                            qty: item.qty,
                            unitPrice: item.unitPrice,
                            discount: item.discount,
                            taxAmount: item.taxAmount,
                            lineTotal: item.lineTotal,
                        })),
                    },
                } as any,
                include: { items: true },
            });

            // Update Loyalty record
            if (loyaltyCustomerId && loyaltyCustDetails) {
                const balanceChange = pointsEarned - effectivePointsRedeemed;
                await (tx as any).loyaltyCustomer.update({
                    where: { id: loyaltyCustomerId },
                    data: { pointsBalance: { increment: balanceChange } },
                });

                if (effectivePointsRedeemed > 0) {
                    await (tx as any).loyaltyPointHistory.create({
                        data: {
                            companyId,
                            customerId: loyaltyCustomerId,
                            invoiceId: invoice.id,
                            pointsChange: -effectivePointsRedeemed,
                            type: 'REDEEMED',
                            notes: `Redeemed for invoice ${invoiceNo}`,
                        },
                    });
                }

                if (pointsEarned > 0) {
                    await (tx as any).loyaltyPointHistory.create({
                        data: {
                            companyId,
                            customerId: loyaltyCustomerId,
                            invoiceId: invoice.id,
                            pointsChange: pointsEarned,
                            type: 'EARNED',
                            notes: `Earned from invoice ${invoiceNo}`,
                        },
                    });
                }
            }

            // Only process stock and accounting if posted
            if (isPosted) {
                // Deduct inventory stock for each PRODUCT item (skip services)
                for (const item of computedItems) {
                    // Skip service items - they don't have inventory impact
                    if (item.serviceId) continue;

                    const cachedProduct = productUnitCache.get(item.productId!);

                    // Stock check already passed above; use pre-fetched product for mutation
                    const { movement } = await InventoryService.mutateStock(tx, {
                        companyId,
                        branchId,
                        productId: item.productId!,
                        unitCode: item.unitCode,
                        qtyChange: -item.qty,
                        cost: 0,
                        price: item.unitPrice,
                        type: 'POS_SALE',
                        referenceType: 'POSInvoice',
                        referenceId: invoice.id,
                        createdById: userId,
                    }, cachedProduct);

                    (item as any).cost = Number(movement?.cost || 0);
                }

                // Core Accounting Emission
                await CoreAccountingService.recordPOSSale(tx as any, {
                    id: invoice.id,
                    companyId: invoice.companyId,
                    branchId: invoice.branchId,
                    invoiceNo: invoice.invoiceNo,
                    customerId: invoice.customerId,
                    paymentMethod: invoice.paymentMethod,
                    subtotal: invoice.subtotal,
                    taxTotal: invoice.taxTotal,
                    grandTotal: invoice.grandTotal,
                    cashReceived: invoice.cashReceived,
                    changeGiven: invoice.changeGiven,
                    createdById: invoice.createdById,
                    createdAt: invoice.createdAt,
                    items: computedItems.map(i => ({
                        productId: i.productId || '',
                        serviceId: i.serviceId || '',
                        qty: i.qty,
                        unitPrice: i.unitPrice,
                        lineTotal: i.lineTotal,
                        taxAmount: i.taxAmount,
                        cost: (i as any).cost || 0
                    }))
                });

            } // End of isPosted block

            return invoice;
        }, { maxWait: 10000, timeout: 20000 });

        sendSuccess(res, result, undefined, 201);
    } catch (error) { next(error); }
});

// GET /pos/unposted
posRoutes.get('/unposted', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), requireBranch, async (req, res, next) => {
    try {
        const {
            branchId,
            dateFrom,
            dateTo,
            search,
            paymentMethod,
            createdById,
            posTerminalId,
            minAmount,
            maxAmount,
            customerId,
        } = req.query as any;

        const where: any = {
            companyId: req.user!.companyId,
            isPosted: false,
        };

        if (branchId) {
            await assertBranchAccessible(req, String(branchId));
            where.branchId = String(branchId);
        } else if (Array.isArray(req.userBranchIds) && req.userBranchIds.length > 0) {
            where.branchId = { in: req.userBranchIds };
        } else {
            where.branchId = req.activeBranchId!;
        }

        if (customerId) where.customerId = String(customerId);
        if (paymentMethod) where.paymentMethod = String(paymentMethod).trim().toUpperCase();
        if (createdById) where.createdById = String(createdById);
        if (posTerminalId) where.posTerminalId = String(posTerminalId);

        const minAmountNum = Number(minAmount);
        const maxAmountNum = Number(maxAmount);
        if (Number.isFinite(minAmountNum) || Number.isFinite(maxAmountNum)) {
            where.grandTotal = {};
            if (Number.isFinite(minAmountNum)) where.grandTotal.gte = minAmountNum;
            if (Number.isFinite(maxAmountNum)) where.grandTotal.lte = maxAmountNum;
        }

        if (dateFrom || dateTo) {
            const createdAt: any = {};
            if (dateFrom) {
                const d = new Date(String(dateFrom));
                if (!Number.isNaN(d.getTime())) {
                    d.setHours(0, 0, 0, 0);
                    createdAt.gte = d;
                }
            }
            if (dateTo) {
                const d = new Date(String(dateTo));
                if (!Number.isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999);
                    createdAt.lte = d;
                }
            }
            if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
        }

        if (search) {
            const q = String(search).trim();
            if (q) {
                where.OR = [
                    { invoiceNo: { contains: q } },
                    { customer: { is: { name: { contains: q } } } },
                    { createdBy: { is: { name: { contains: q } } } },
                ];
            }
        }

        const invoices = await (prisma as any).pOSInvoice.findMany({
            where,
            include: {
                customer: { select: { id: true, name: true } },
                loyaltyCustomer: { select: { id: true, name: true, phone: true } },
                branch: { select: { id: true, name: true, code: true } },
                createdBy: { select: { id: true, name: true } },
                posTerminal: { select: { id: true, code: true, name: true } },
                items: { include: { product: { select: { name: true, itemCode: true, units: { select: { unitCode: true, qtyInBaseUnit: true } } } } } },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Enrich items with current stock levels for better visibility in unposted list
        const enriched = await Promise.all(invoices.map(async (inv: any) => {
            const itemsWithStock = await Promise.all(inv.items.map(async (item: any) => {
                const currentStock = await InventoryService.getAvailableStockQty(prisma as any, {
                    companyId: req.user!.companyId,
                    branchId: inv.branchId,
                    productId: item.productId,
                    unitCode: item.unitCode,
                });
                return { ...item, currentStock };
            }));
            return { ...inv, items: itemsWithStock };
        }));

        sendSuccess(res, enriched);
    } catch (error) { next(error); }
});

// POST /pos/post-batch
posRoutes.post('/post-batch', requireAnyPermission(PERMISSIONS.POS_SELL, PERMISSIONS.POS_ACCESS), requireBranch, async (req, res, next) => {
    try {
        const { invoiceIds } = req.body;
        if (!Array.isArray(invoiceIds)) throw AppError.badRequest('Expected array of invoice IDs');

        const results: any[] = [];
        const companyId = req.user!.companyId;
        const userId = req.user!.id;

        for (const id of invoiceIds) {
            try {
                await prisma.$transaction(async (tx) => {
                    const invoice = await (tx as any).pOSInvoice.findFirst({
                        where: { id, companyId, isPosted: false },
                        include: { items: true },
                    });

                    if (!invoice) throw AppError.notFound(`Invoice ${id} not found or already posted`);
                    await assertBranchAccessible(req, invoice.branchId);

                    const accountingItems: Array<{
                        productId: string;
                        qty: number;
                        unitPrice: number;
                        lineTotal: number;
                        taxAmount: number;
                        cost: number;
                    }> = [];

                    // Check stock again
                    for (const item of invoice.items) {
                        const qtyAvailable = await InventoryService.getAvailableStockQty(tx as any, {
                            companyId,
                            branchId: invoice.branchId,
                            productId: item.productId,
                            unitCode: item.unitCode,
                        });

                        if (qtyAvailable < item.qty) {
                            throw AppError.badRequest(`Insufficient stock for product ${item.productId} in invoice ${invoice.invoiceNo}`);
                        }

                        const { movement } = await InventoryService.mutateStock(tx as any, {
                            companyId,
                            branchId: invoice.branchId,
                            productId: item.productId,
                            unitCode: item.unitCode,
                            qtyChange: -Number(item.qty),
                            cost: 0,
                            price: Number(item.unitPrice || 0),
                            type: 'POS_SALE',
                            referenceType: 'POSInvoice',
                            referenceId: invoice.id,
                            createdById: userId,
                        });
                        accountingItems.push({
                            productId: String(item.productId),
                            qty: Number(item.qty || 0),
                            unitPrice: Number(item.unitPrice || 0),
                            lineTotal: Number(item.lineTotal || 0),
                            taxAmount: Number(item.taxAmount || 0),
                            cost: Number(movement?.cost || 0),
                        });
                    }

                    // Strict accounting posting (mapping-driven + balanced journal enforced).
                    await CoreAccountingService.recordPOSSale(tx as any, {
                        id: invoice.id,
                        companyId: invoice.companyId,
                        branchId: invoice.branchId,
                        invoiceNo: invoice.invoiceNo,
                        customerId: invoice.customerId,
                        paymentMethod: invoice.paymentMethod,
                        subtotal: Number(invoice.subtotal || 0),
                        taxTotal: Number(invoice.taxTotal || 0),
                        grandTotal: Number(invoice.grandTotal || 0),
                        cashReceived: Number(invoice.cashReceived || 0),
                        changeGiven: Number(invoice.changeGiven || 0),
                        createdById: invoice.createdById,
                        createdAt: invoice.createdAt,
                        items: accountingItems,
                    });

                    // Mark as posted
                    await (tx as any).pOSInvoice.update({
                        where: { id: invoice.id },
                        data: {
                            isPosted: true,
                            status: invoice.paymentMethod === 'CREDIT' ? 'CREDIT' : 'PAID',
                        },
                    });
                }, { maxWait: 10000, timeout: 20000 });
                results.push({ id, status: 'success' });
            } catch (err: any) {
                results.push({ id, status: 'error', message: err.message });
            }
        }

        sendSuccess(res, results);
    } catch (error) { next(error); }
});
