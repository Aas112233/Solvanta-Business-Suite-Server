import { Request, Response } from 'express';
import { ServiceService } from './service.service.js';
import { sendSuccess } from '../../utils/response.js';

export const listServices = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const services = await ServiceService.list(companyId, req.query);
        sendSuccess(res, services, { message: 'Sales services retrieved successfully' });
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to retrieve sales services',
            },
        });
    }
};

export const getServiceById = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const service = await ServiceService.getById(companyId, req.params.id as string);
        sendSuccess(res, service, { message: 'Sales service retrieved successfully' });
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to retrieve sales service',
            },
        });
    }
};

export const createService = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const service = await ServiceService.create(companyId, req.body);
        sendSuccess(res, service, { message: 'Sales service created successfully' }, 201);
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to create sales service',
            },
        });
    }
};

export const updateService = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const service = await ServiceService.update(companyId, req.params.id as string, req.body);
        sendSuccess(res, service, { message: 'Sales service updated successfully' });
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to update sales service',
            },
        });
    }
};

export const deleteService = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        await ServiceService.delete(companyId, req.params.id as string);
        sendSuccess(res, null, { message: 'Sales service deleted successfully' });
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to delete sales service',
            },
        });
    }
};

export const getServiceCategories = async (req: Request, res: Response) => {
    try {
        const companyId = req.user!.companyId;
        const categories = await ServiceService.getCategories(companyId);
        sendSuccess(res, categories, { message: 'Sales service categories retrieved successfully' });
    } catch (error: any) {
        res.status(error.statusCode || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to retrieve sales service categories',
            },
        });
    }
};
