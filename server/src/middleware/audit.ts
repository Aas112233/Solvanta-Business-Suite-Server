import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export function auditLog(action: string, entity: string) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        // Store original json to capture response
        const originalJson = _res.json.bind(_res);

        _res.json = function (body: any) {
            // Only log successful operations
            if (body?.success && req.user) {
                prisma.auditLog
                    .create({
                        data: {
                            companyId: req.user.companyId,
                            branchId: req.activeBranchId || null,
                            userId: req.user.id,
                            action,
                            entity,
                            entityId: req.params?.id || body?.data?.id || null,
                            before: null,
                            after: req.method !== 'GET' ? (req.body || null) : null,
                            ipAddress: req.ip || req.socket.remoteAddress || null,
                            userAgent: req.headers['user-agent'] || null,
                        },
                    })
                    .catch((err) => logger.error('Audit log failed:', err));
            }
            return originalJson(body);
        } as any;

        next();
    };
}
