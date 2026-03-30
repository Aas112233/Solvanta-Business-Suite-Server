import { Router } from 'express';
import {
    createServiceInvoice,
    getServiceInvoices,
    getServiceInvoiceById,
} from './service-invoice.controller.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Routes
router.post(
    '/',
    requirePermission('sales.create'),
    createServiceInvoice
);

router.get(
    '/',
    requirePermission('sales.view'),
    getServiceInvoices
);

router.get(
    '/:id',
    requirePermission('sales.view'),
    getServiceInvoiceById
);

export { router as serviceInvoiceRoutes };
