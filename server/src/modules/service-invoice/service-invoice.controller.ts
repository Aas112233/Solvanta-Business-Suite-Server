import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { formatDocNo, nextCounter } from '../../utils/documentCounter.js';
import { sendSuccess } from '../../utils/response.js';
import { normalizePaymentMethodKey, SERVICE_INVOICE_PAYMENT_METHODS } from '../../utils/paymentMethods.js';

interface ServiceInvoiceItemInput {
    serviceId?: string | null;
    serviceName: string;
    serviceCode?: string;
    unitCode?: string;
    qty: number;
    unitPrice: number;
    discount?: number;
}

const SUPPORTED_PAYMENT_METHODS = new Set<string>(SERVICE_INVOICE_PAYMENT_METHODS);

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseInvoiceDate(value: unknown): Date {
    if (typeof value !== 'string' || !value.trim()) {
        return new Date();
    }

    const normalized = value.includes('T') ? value : `${value}T00:00:00.000`;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        throw AppError.badRequest('Invalid invoice date');
    }

    return parsed;
}

export const createServiceInvoice = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const userId = req.user!.id;

        const {
            branchId,
            customerId,
            walkInCustomerName,
            walkInPhone,
            invoiceDate,
            paymentMethod,
            notes,
            items,
        } = req.body as {
            branchId: string;
            customerId?: string | null;
            walkInCustomerName?: string | null;
            walkInPhone?: string | null;
            invoiceDate?: string;
            paymentMethod?: (typeof SERVICE_INVOICE_PAYMENT_METHODS)[number];
            notes?: string | null;
            items: ServiceInvoiceItemInput[];
        };

        if (!req.user!.isSuperAdmin && req.user!.branchIds.length > 0 && !req.user!.branchIds.includes(String(branchId))) {
            throw AppError.forbidden('You do not have access to create invoices for this branch');
        }

        const normalizedPaymentMethod = normalizePaymentMethodKey(paymentMethod, 'CASH');
        if (!SUPPORTED_PAYMENT_METHODS.has(normalizedPaymentMethod)) {
            throw AppError.badRequest('Unsupported payment method');
        }

        const createdAt = parseInvoiceDate(invoiceDate);

        const invoice = await prisma.$transaction(async (tx) => {
            const branch = await tx.branch.findFirst({
                where: { id: String(branchId), companyId },
                select: { id: true, code: true, name: true },
            });
            if (!branch) {
                throw AppError.badRequest('Invalid branch');
            }

            if (customerId) {
                const customer = await tx.customer.findFirst({
                    where: { id: String(customerId), companyId },
                    select: { id: true },
                });
                if (!customer) {
                    throw AppError.badRequest('Invalid customer');
                }
            }

            const activeSalesTaxes = await tx.tax.findMany({
                where: {
                    companyId,
                    isActive: true,
                    OR: [{ type: 'SALES' }, { type: 'BOTH' }],
                },
                select: {
                    rate: true,
                    isDefault: true,
                },
            });

            const defaultSalesTax = activeSalesTaxes.find((tax) => tax.isDefault) || activeSalesTaxes[0] || null;
            const defaultTaxRate = Number(defaultSalesTax?.rate || 0);

            const normalizedItems = items.map((item, index) => {
                const serviceName = String(item.serviceName || '').trim();
                const unitCode = String(item.unitCode || 'SERVICE').trim().toUpperCase();
                const qty = Number(item.qty);
                const unitPrice = Number(item.unitPrice);
                const discount = Number(item.discount || 0);

                if (!serviceName) {
                    throw AppError.badRequest(`Service name is required for item ${index + 1}`);
                }
                if (!Number.isFinite(qty) || qty <= 0) {
                    throw AppError.badRequest(`Invalid quantity for item ${index + 1}`);
                }
                if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                    throw AppError.badRequest(`Invalid unit price for item ${index + 1}`);
                }
                if (!Number.isFinite(discount) || discount < 0) {
                    throw AppError.badRequest(`Invalid discount for item ${index + 1}`);
                }

                const gross = roundMoney(qty * unitPrice);
                if (discount > gross) {
                    throw AppError.badRequest(`Discount cannot exceed subtotal for item ${index + 1}`);
                }

                const lineSubtotal = roundMoney(gross - discount);
                const taxAmount = roundMoney(lineSubtotal * defaultTaxRate);

                return {
                    serviceId: item.serviceId || null,
                    serviceName,
                    serviceCode: item.serviceCode ? String(item.serviceCode).trim() : null,
                    unitCode,
                    qty,
                    unitPrice,
                    discount,
                    taxAmount,
                    lineTotal: lineSubtotal,
                };
            });

            const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
            const discountTotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.discount, 0));
            const taxTotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.taxAmount, 0));
            const grandTotal = roundMoney(subtotal + taxTotal);
            const cashReceived = normalizedPaymentMethod === 'CREDIT' ? 0 : grandTotal;
            const status = normalizedPaymentMethod === 'CREDIT' ? 'CREDIT' : 'PAID';
            const invoiceNo = formatDocNo(
                `SVC-${branch.code}`,
                await nextCounter(tx as any, companyId, 'SERVICE_INVOICE', branch.id),
                4
            );

            return tx.pOSInvoice.create({
                data: {
                    companyId,
                    branchId: branch.id,
                    invoiceNo,
                    customerId: customerId ? String(customerId) : null,
                    walkInCustomerName: customerId ? null : walkInCustomerName ? String(walkInCustomerName).trim() : null,
                    walkInPhone: customerId ? null : walkInPhone ? String(walkInPhone).trim() : null,
                    subtotal,
                    discountTotal,
                    taxTotal,
                    grandTotal,
                    paymentMethod: normalizedPaymentMethod,
                    cashReceived,
                    changeGiven: 0,
                    status,
                    isPosted: true,
                    notes: notes ? String(notes).trim() : null,
                    createdById: userId,
                    createdAt,
                    items: {
                        create: normalizedItems.map((item) => ({
                            serviceId: item.serviceId,
                            serviceName: item.serviceName,
                            serviceCode: item.serviceCode,
                            unitCode: item.unitCode,
                            qty: item.qty,
                            unitPrice: item.unitPrice,
                            discount: item.discount,
                            taxAmount: item.taxAmount,
                            lineTotal: item.lineTotal,
                        })),
                    },
                },
                include: {
                    items: true,
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                        },
                    },
                    branch: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                    createdBy: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });
        });

        sendSuccess(res, invoice, undefined, 201);
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to create service invoice',
            },
        });
    }
};

export const getServiceInvoices = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const { branchId, customerId, startDate, endDate } = req.query;
        const branchScope =
            !req.user!.isSuperAdmin && req.user!.branchIds.length > 0
                ? { branchId: { in: req.user!.branchIds } }
                : {};

        const where: Record<string, any> = {
            companyId,
            ...branchScope,
            items: {
                some: {
                    serviceName: { not: null },
                },
            },
        };

        if (branchId && typeof branchId === 'string') {
            if (!req.user!.isSuperAdmin && req.user!.branchIds.length > 0 && !req.user!.branchIds.includes(branchId)) {
                throw AppError.forbidden('You do not have access to this branch');
            }
            where.branchId = branchId;
        }

        if (customerId && typeof customerId === 'string') {
            where.customerId = customerId;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (typeof startDate === 'string') where.createdAt.gte = parseInvoiceDate(startDate);
            if (typeof endDate === 'string') where.createdAt.lte = parseInvoiceDate(endDate);
        }

        const invoices = await prisma.pOSInvoice.findMany({
            where,
            include: {
                items: true,
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    },
                },
                branch: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        sendSuccess(res, invoices);
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to retrieve service invoices',
            },
        });
    }
};

export const getServiceInvoiceById = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const id = String(req.params.id);
        const branchScope =
            !req.user!.isSuperAdmin && req.user!.branchIds.length > 0
                ? { branchId: { in: req.user!.branchIds } }
                : {};

        const invoice = await prisma.pOSInvoice.findFirst({
            where: { id, companyId, ...branchScope },
            include: {
                items: true,
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    },
                },
                branch: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!invoice) {
            throw AppError.notFound('Service invoice not found');
        }

        sendSuccess(res, invoice);
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to retrieve service invoice',
            },
        });
    }
};
