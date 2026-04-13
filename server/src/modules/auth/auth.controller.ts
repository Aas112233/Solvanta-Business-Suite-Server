import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { basePrisma } from '../../lib/prisma.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractSupportSessionMeta(payload: unknown) {
    if (!isRecord(payload)) return null;

    const directSessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
    if (directSessionId) {
        return {
            sessionId: directSessionId,
            actorEmail: typeof payload.actorEmail === 'string' ? payload.actorEmail : '',
            actorName: typeof payload.actorName === 'string' ? payload.actorName : '',
            reason: typeof payload.reason === 'string' ? payload.reason : '',
            startedAt: typeof payload.startedAt === 'string' ? payload.startedAt : '',
        };
    }

    const nested = isRecord(payload.__supportSession) ? payload.__supportSession : null;
    if (!nested) return null;

    return {
        sessionId: typeof nested.sessionId === 'string' ? nested.sessionId.trim() : '',
        actorEmail: typeof nested.actorEmail === 'string' ? nested.actorEmail : '',
        actorName: typeof nested.actorName === 'string' ? nested.actorName : '',
        reason: typeof nested.reason === 'string' ? nested.reason : '',
        startedAt: typeof nested.startedAt === 'string' ? nested.startedAt : '',
    };
}

async function loadSupportSessionTranscript(sessionId: string, companyId: string, startedAt: string) {
    const rows = await basePrisma.auditLog.findMany({
        where: {
            companyId,
            createdAt: {
                gte: new Date(startedAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
            },
        },
        orderBy: { createdAt: 'asc' },
        include: {
            user: { select: { email: true, name: true } },
        },
        take: 1000,
    });

    return rows
        .filter((row) => extractSupportSessionMeta(row.after)?.sessionId === sessionId)
        .map((row) => {
            const supportSession = extractSupportSessionMeta(row.after);
            return ({
            id: row.id,
            action: row.action,
            entity: row.entity,
            entityId: row.entityId || '',
            actor: supportSession?.actorEmail || row.user?.email || row.user?.name || 'unknown',
            createdAt: row.createdAt,
            before: row.before,
            after: row.after,
            kind:
                row.action === 'TENANT_USER_IMPERSONATION_NOTE'
                    ? 'note'
                    : row.action === 'TENANT_USER_IMPERSONATION_STARTED' || row.action === 'TENANT_USER_IMPERSONATION_ENDED'
                        ? 'session'
                        : 'activity',
        });
        });
}

export class AuthController {
    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { email, password } = req.body;
            const result = await AuthService.login(email, password);
            sendSuccess(res, result);
        } catch (error) {
            next(error);
        }
    }

    static async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            const { refreshToken } = req.body;
            const result = await AuthService.refresh(refreshToken);
            sendSuccess(res, result);
        } catch (error) {
            next(error);
        }
    }

    static async logout(req: Request, res: Response, next: NextFunction) {
        try {
            await AuthService.logout(req.user!.id, { isImpersonating: Boolean(req.user?.impersonation) });
            sendSuccess(res, { message: 'Logged out successfully' });
        } catch (error) {
            next(error);
        }
    }

    static async stopImpersonation(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.user?.impersonation) {
                throw AppError.badRequest('Not in an impersonation session');
            }

            await basePrisma.auditLog.create({
                data: {
                    companyId: req.user.companyId,
                    userId: req.user.impersonation.actorUserId,
                    action: 'TENANT_USER_IMPERSONATION_ENDED',
                    entity: 'User',
                    entityId: req.user.id,
                    after: {
                        actorEmail: req.user.impersonation.actorEmail,
                        actorName: req.user.impersonation.actorName,
                        reason: req.user.impersonation.reason,
                        sessionId: req.user.impersonation.sessionId,
                        startedAt: req.user.impersonation.startedAt,
                        endedAt: new Date().toISOString(),
                    } as any,
                    ipAddress: req.ip || req.socket?.remoteAddress || null,
                    userAgent: req.get('user-agent') || null,
                },
            });

            sendSuccess(res, {
                message: 'Impersonation session ended',
                impersonation: req.user.impersonation,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getCurrentImpersonationTranscript(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.user?.impersonation) {
                throw AppError.badRequest('Not in an impersonation session');
            }

            const transcript = await loadSupportSessionTranscript(
                req.user.impersonation.sessionId,
                req.user.companyId,
                req.user.impersonation.startedAt,
            );

            sendSuccess(res, {
                sessionId: req.user.impersonation.sessionId,
                reason: req.user.impersonation.reason,
                startedAt: req.user.impersonation.startedAt,
                transcript,
            });
        } catch (error) {
            next(error);
        }
    }

    static async addCurrentImpersonationNote(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.user?.impersonation) {
                throw AppError.badRequest('Not in an impersonation session');
            }

            const note = String(req.body?.note || '').trim();
            if (note.length < 3) {
                throw AppError.badRequest('Session note must be at least 3 characters');
            }

            const created = await basePrisma.auditLog.create({
                data: {
                    companyId: req.user.companyId,
                    userId: req.user.impersonation.actorUserId,
                    action: 'TENANT_USER_IMPERSONATION_NOTE',
                    entity: 'SupportSession',
                    entityId: req.user.impersonation.sessionId,
                    after: {
                        sessionId: req.user.impersonation.sessionId,
                        actorEmail: req.user.impersonation.actorEmail,
                        actorName: req.user.impersonation.actorName,
                        reason: req.user.impersonation.reason,
                        startedAt: req.user.impersonation.startedAt,
                        note,
                        targetUserId: req.user.id,
                        targetUserEmail: req.user.email,
                        createdAt: new Date().toISOString(),
                    } as any,
                    ipAddress: req.ip || req.socket?.remoteAddress || null,
                    userAgent: req.get('user-agent') || null,
                },
                include: {
                    user: { select: { email: true, name: true } },
                },
            });

            sendSuccess(res, {
                id: created.id,
                action: created.action,
                actor: created.user?.email || created.user?.name || 'unknown',
                createdAt: created.createdAt,
                after: created.after,
            }, undefined, 201);
        } catch (error) {
            next(error);
        }
    }

    static async me(req: Request, res: Response, next: NextFunction) {
        try {
            sendSuccess(res, req.user);
        } catch (error) {
            next(error);
        }
    }
}
