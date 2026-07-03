import { prisma } from '../lib/prisma.js';
import { AppError } from './AppError.js';
import { roundMoney } from './money.js';
import { resolveCompanyTaxSettings } from './companyTax.js';

export interface TaxCalculationItem {
    productId?: string | null;
    description: string;
    qty: number;
    unitPrice: number;
    discount?: number;
    unitCode?: string | null;
}

export interface TaxCalculationResult {
    preparedItems: Array<{
        productId: string | null;
        description: string;
        unitCode: string | null;
        qty: number;
        unitPrice: number;
        discount: number;
        taxAmount: number;
        lineTotal: number;
    }>;
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
}

/**
 * Validates tax configuration for a set of line items and computes
 * tax-inclusive or tax-exclusive pricing based on company settings.
 *
 * Centralized from the duplicated logic in sales.routes.ts and pos.routes.ts.
 * Handles both SALES and BOTH-type taxes. For PURCHASE taxes, use separately.
 */
export async function validateAndCalculateTaxes(
    companyId: string,
    items: TaxCalculationItem[]
): Promise<TaxCalculationResult> {
    const taxes = await (prisma as any).tax.findMany({
        where: { companyId, isActive: true, type: { in: ['SALES', 'BOTH'] } },
        orderBy: { createdAt: 'asc' },
    });

    const activeSalesTaxById = new Map<string, any>(taxes.map((t: any) => [t.id, t]));
    const defaultSalesTax = taxes.find((t: any) => t.isDefault) || taxes[0] || null;

    // Load company tax settings for inclusive pricing
    const companyRecord = await prisma.company.findUnique({
        where: { id: companyId },
        select: { settings: true },
    });
    const companyTaxSettings = resolveCompanyTaxSettings(companyRecord?.settings);

    const productIds = items.map(i => i.productId).filter(Boolean) as string[];
    const products = productIds.length > 0 ? await (prisma as any).product.findMany({
        where: { id: { in: productIds }, companyId }
    }) : [];
    const productById = new Map<string, any>(products.map((p: any) => [p.id, p]));

    const taxConfigErrors = new Set<string>();

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const computedItems = items.map(item => {
        const qty = Number(item.qty);
        const unitPrice = Number(item.unitPrice);
        const discount = Number(item.discount || 0);

        const lineGross = (qty * unitPrice) - discount;
        const product = item.productId ? (productById.get(item.productId) as any) : null;
        const productLabel = product ? `${product.itemCode} (${product.name})` : item.description;

        let appliedTax = null;
        if (product && product.taxId) {
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

        let taxAmount: number;
        let lineSubtotal: number;
        if (companyTaxSettings.inclusivePricing && taxRate > 0) {
            taxAmount = roundMoney(lineGross - (lineGross / (1 + taxRate)));
            lineSubtotal = roundMoney(lineGross - taxAmount);
        } else {
            taxAmount = roundMoney(lineGross * taxRate);
            lineSubtotal = roundMoney(lineGross);
        }
        subtotal += lineSubtotal;
        taxTotal += taxAmount;
        discountTotal += discount;

        return {
            productId: item.productId || null,
            description: item.description,
            unitCode: item.unitCode || null,
            qty,
            unitPrice,
            discount,
            taxAmount,
            lineTotal: lineSubtotal
        };
    }).filter(Boolean);

    if (taxConfigErrors.size > 0) {
        const errors = Array.from(taxConfigErrors);
        const preview = errors.slice(0, 3).join('; ');
        const suffix = errors.length > 3 ? `; and ${errors.length - 3} more item(s)` : '';
        throw AppError.badRequest(`Tax configuration is incomplete: ${preview}${suffix}`);
    }

    return {
        preparedItems: computedItems as NonNullable<typeof computedItems[0]>[],
        subtotal: roundMoney(subtotal),
        taxTotal: roundMoney(taxTotal),
        discountTotal: roundMoney(discountTotal)
    };
}
