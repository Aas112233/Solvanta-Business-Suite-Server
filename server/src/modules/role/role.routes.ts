import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS, ALL_PERMISSIONS, DEFAULT_SYSTEM_ROLES, isSystemRoleName } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { z } from 'zod';

export const roleRoutes = Router();
roleRoutes.use(authenticate);

const roleSchema = z.object({
    name: z.string().min(1).max(100),
    permissions: z.array(z.string()).min(1),
});

// Track companies that have had default roles initialized
const initializedCompanies = new Set<string>();

async function ensureDefaultRoles(companyId: string) {
    // Skip if already initialized in this server instance
    if (initializedCompanies.has(companyId)) {
        return;
    }

    const existing = await prisma.role.findMany({
        where: { companyId },
        select: { id: true, name: true },
    });
    const existingNames = new Set(existing.map((role) => role.name.trim().toLowerCase()));
    const missingDefaults = DEFAULT_SYSTEM_ROLES.filter((role) => !existingNames.has(role.name.toLowerCase()));

    if (missingDefaults.length === 0) {
        initializedCompanies.add(companyId);
        return;
    }

    await prisma.role.createMany({
        data: missingDefaults.map((role) => ({
            companyId,
            name: role.name,
            permissions: role.permissions as string[],
        })),
    });

    initializedCompanies.add(companyId);
}

// GET /roles
roleRoutes.get('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), async (req, res, next) => {
    try {
        await ensureDefaultRoles(req.user!.companyId);
        const roles = await prisma.role.findMany({
            where: { companyId: req.user!.companyId },
            include: {
                _count: { select: { users: true } },
            },
            orderBy: { name: 'asc' },
        });
        sendSuccess(res, roles.map((role) => ({
            ...role,
            isSystem: isSystemRoleName(role.name),
            userCount: role._count.users,
        })));
    } catch (error) { next(error); }
});

// GET /roles/permissions — list all available permissions
roleRoutes.get('/permissions', requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), (_req, res) => {
    sendSuccess(res, ALL_PERMISSIONS);
});

// POST /roles
roleRoutes.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), validate({ body: roleSchema }), async (req, res, next) => {
    try {
        if (isSystemRoleName(req.body.name)) {
            throw AppError.badRequest('Reserved system role name. Use a custom name.');
        }
        const role = await prisma.role.create({
            data: { ...req.body, companyId: req.user!.companyId },
        });
        sendSuccess(res, role, undefined, 201);
    } catch (error) { next(error); }
});

// PATCH /roles/:id
roleRoutes.patch('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), validate({ body: roleSchema.partial() }), async (req, res, next) => {
    try {
        const existing = await prisma.role.findFirst({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
        });
        if (!existing) throw AppError.notFound('Role');

        if (req.body.name && req.body.name.trim() !== existing.name && isSystemRoleName(existing.name)) {
            throw AppError.badRequest('System role name cannot be edited');
        }
        if (req.body.name && req.body.name.trim() !== existing.name && isSystemRoleName(req.body.name)) {
            throw AppError.badRequest('Reserved system role name. Use a custom name.');
        }

        const role = await prisma.role.update({
            where: { id: req.params.id as any },
            data: req.body,
        });
        sendSuccess(res, role);
    } catch (error) { next(error); }
});

// DELETE /roles/:id
roleRoutes.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), async (req, res, next) => {
    try {
        const existing = await prisma.role.findFirst({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
        });
        if (!existing) throw AppError.notFound('Role');
        if (existing.name.toLowerCase() === 'admin') {
            throw AppError.badRequest('The Admin role cannot be deleted');
        }

        // Check if role is in use
        const usersWithRole = await prisma.user.count({
            where: { roleId: req.params.id as any, companyId: req.user!.companyId },
        });
        if (usersWithRole > 0) {
            throw AppError.badRequest(`Cannot delete: ${usersWithRole} users are assigned to this role`);
        }
        await prisma.role.deleteMany({
            where: { id: req.params.id as any, companyId: req.user!.companyId },
        });
        sendSuccess(res, { message: 'Role deleted' });
    } catch (error) { next(error); }
});
