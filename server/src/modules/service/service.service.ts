import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';

interface ServiceMasterData {
    code: string;
    name: string;
    description?: string;
    category?: string;
    standardRate: number;
    costRate?: number;
    incomeAccountId?: string;
    expenseAccountId?: string;
    duration?: number;
    isLabor?: boolean;
    isActive?: boolean;
}

interface ServiceListQuery {
    isActive?: boolean | string;
    category?: string;
    search?: string;
}

export class ServiceService {
    static async list(companyId: string, query: ServiceListQuery) {
        const { isActive, category, search } = query;

        const where: any = { companyId };

        if (typeof isActive === 'boolean') {
            where.isActive = isActive;
        } else if (typeof isActive === 'string') {
            where.isActive = isActive === 'true';
        }

        if (category) {
            where.category = category;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, options: 'i' } },
                { code: { contains: search, options: 'i' } },
                { description: { contains: search, options: 'i' } },
            ];
        }

        const services = await prisma.serviceMaster.findMany({
            where,
            include: {
                incomeAccount: { select: { id: true, name: true } },
                expenseAccount: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return services;
    }

    static async getById(companyId: string, id: string) {
        const service = await prisma.serviceMaster.findUnique({
            where: { id, companyId },
            include: {
                incomeAccount: { select: { id: true, name: true } },
                expenseAccount: { select: { id: true, name: true } },
            },
        });

        if (!service) {
            throw new AppError('Sales service not found', 404);
        }

        return service;
    }

    static async create(companyId: string, data: ServiceMasterData) {
        // Check for duplicate code
        const existing = await prisma.serviceMaster.findUnique({
            where: {
                companyId_code: {
                    companyId,
                    code: data.code,
                },
            },
        });

        if (existing) {
            throw new AppError('Sales service code already exists', 400);
        }

        const service = await prisma.serviceMaster.create({
            data: {
                ...data,
                companyId,
                isActive: data.isActive ?? true,
                isLabor: data.isLabor ?? false,
            },
            include: {
                incomeAccount: { select: { id: true, name: true } },
                expenseAccount: { select: { id: true, name: true } },
            },
        });

        return service;
    }

    static async update(companyId: string, id: string, data: Partial<ServiceMasterData>) {
        // Check for duplicate code (excluding current record)
        if (data.code) {
            const existing = await prisma.serviceMaster.findFirst({
                where: {
                    companyId,
                    code: data.code,
                    id: { not: id },
                },
            });

            if (existing) {
                throw new AppError('Sales service code already exists', 400);
            }
        }

        const service = await prisma.serviceMaster.update({
            where: { id, companyId },
            data,
            include: {
                incomeAccount: { select: { id: true, name: true } },
                expenseAccount: { select: { id: true, name: true } },
            },
        });

        return service;
    }

    static async delete(companyId: string, id: string) {
        // Check if service is used in any invoice
        const invoiceCount = await prisma.pOSInvoiceItem.count({
            where: { serviceId: id },
        });

        if (invoiceCount > 0) {
            throw new AppError('Cannot delete sales service that is used in invoices', 400);
        }

        await prisma.serviceMaster.delete({
            where: { id, companyId },
        });
    }

    static async getCategories(companyId: string) {
        const categories = await prisma.serviceMaster.groupBy({
            by: ['category'],
            where: {
                companyId,
                category: { not: null },
                isActive: true,
            },
            _count: { id: true },
        });

        return categories.map((c) => ({
            category: c.category!,
            count: c._count.id,
        }));
    }
}
