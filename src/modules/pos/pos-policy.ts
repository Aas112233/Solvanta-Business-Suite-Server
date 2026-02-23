import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';

export type PosPricePriority = 'CUSTOMER_FIRST' | 'TERMINAL_FIRST';

export type PosTerminalPolicy = {
    allowedPaymentMethods: string[];
    allowCreditSales: boolean;
    maxDiscountPct: number;
    returnWindowDays: number;
    allowPosReturns: boolean;
    requireSameShiftForReturns: boolean;
    pricePriority: PosPricePriority;
    requireShiftForSale: boolean;
};

export type PosSessionPayload = {
    type: 'pos-session';
    companyId: string;
    terminalId: string;
    branchId: string;
    posUserId: string;
    terminalPriceGroupId: string | null;
    policy: PosTerminalPolicy;
};

const POS_SESSION_EXPIRY = '12h';

const DEFAULT_POLICY: PosTerminalPolicy = {
    allowedPaymentMethods: ['CASH', 'CARD', 'MIXED', 'CREDIT', 'BANK_TRANSFER'],
    allowCreditSales: true,
    maxDiscountPct: 100,
    returnWindowDays: 30,
    allowPosReturns: true,
    requireSameShiftForReturns: true,
    pricePriority: 'CUSTOMER_FIRST',
    requireShiftForSale: true,
};

function sanitizePolicy(raw: any): PosTerminalPolicy {
    const methods: string[] = Array.isArray(raw?.allowedPaymentMethods)
        ? raw.allowedPaymentMethods
            .map((m: any) => String(m || '').trim().toUpperCase())
            .filter((m: string) => Boolean(m))
        : DEFAULT_POLICY.allowedPaymentMethods;
    const uniqueMethods: string[] = Array.from(new Set(methods));

    const priorityRaw = String(raw?.pricePriority || DEFAULT_POLICY.pricePriority).toUpperCase();
    const pricePriority: PosPricePriority = priorityRaw === 'TERMINAL_FIRST' ? 'TERMINAL_FIRST' : 'CUSTOMER_FIRST';

    const maxDiscountPct = Number(raw?.maxDiscountPct);
    const returnWindowDays = Number(raw?.returnWindowDays);

    return {
        allowedPaymentMethods: uniqueMethods.length ? uniqueMethods : DEFAULT_POLICY.allowedPaymentMethods,
        allowCreditSales: raw?.allowCreditSales === false ? false : true,
        maxDiscountPct: Number.isFinite(maxDiscountPct) ? Math.min(100, Math.max(0, maxDiscountPct)) : DEFAULT_POLICY.maxDiscountPct,
        returnWindowDays: Number.isFinite(returnWindowDays) ? Math.min(365, Math.max(0, returnWindowDays)) : DEFAULT_POLICY.returnWindowDays,
        allowPosReturns: raw?.allowPosReturns === false ? false : true,
        requireSameShiftForReturns: raw?.requireSameShiftForReturns === false ? false : true,
        pricePriority,
        requireShiftForSale: raw?.requireShiftForSale === false ? false : true,
    };
}

export async function getPosTerminalPolicy(companyId: string, terminalId: string): Promise<PosTerminalPolicy> {
    const row = await prisma.globalString.findFirst({
        where: {
            companyId,
            group: 'POS_TERMINAL_POLICY',
            systemKey: terminalId,
            isActive: true,
        },
        select: { metadata: true },
    });
    return sanitizePolicy(row?.metadata || {});
}

export async function upsertPosTerminalPolicy(companyId: string, terminalId: string, policy: PosTerminalPolicy): Promise<void> {
    const normalized = sanitizePolicy(policy);
    const existing = await prisma.globalString.findFirst({
        where: { companyId, group: 'POS_TERMINAL_POLICY', systemKey: terminalId },
        select: { id: true },
    });

    if (existing) {
        await prisma.globalString.update({
            where: { id: existing.id },
            data: {
                value: `Policy-${terminalId}`,
                metadata: normalized as any,
                isActive: true,
            },
        });
        return;
    }

    await prisma.globalString.create({
        data: {
            companyId,
            group: 'POS_TERMINAL_POLICY',
            systemKey: terminalId,
            value: `Policy-${terminalId}`,
            metadata: normalized as any,
            isActive: true,
        },
    });
}

export function issuePosSessionToken(payload: PosSessionPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: POS_SESSION_EXPIRY });
}

export function verifyPosSessionToken(token: string): PosSessionPayload {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as PosSessionPayload;
        if (!decoded || decoded.type !== 'pos-session') throw new Error('Invalid POS session token');
        return decoded;
    } catch {
        throw AppError.unauthorized('POS session is invalid or expired');
    }
}
