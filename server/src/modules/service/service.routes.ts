import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
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

router.use(authenticate);

// Routes
router.get(
    '/',
    requirePermission(PERMISSIONS.PRODUCT_VIEW),
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
    getServiceById
);

router.post(
    '/',
    requirePermission(PERMISSIONS.PRODUCT_CREATE),
    createService
);

router.put(
    '/:id',
    requirePermission(PERMISSIONS.PRODUCT_EDIT),
    updateService
);

router.delete(
    '/:id',
    requirePermission(PERMISSIONS.PRODUCT_DELETE),
    deleteService
);

export { router as serviceRoutes };
