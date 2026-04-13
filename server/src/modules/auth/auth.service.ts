import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { ALL_PERMISSIONS } from '../../config/permissions.js';
import { resolveSuperAdminAccess } from '../../middleware/superAdmin.js';
import { SUPER_ADMIN_PERMISSIONS } from '../super-admin/super-admin.permissions.js';

const jwtExpiry = env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
const jwtRefreshExpiry = env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'];

export interface ImpersonationContext {
    actorUserId: string;
    actorEmail: string;
    actorName: string;
    actorCompanyId: string;
    reason: string;
    startedAt: string;
    sessionId: string;
}

interface AccessTokenPayload {
    userId: string;
    companyId: string;
    impersonation?: ImpersonationContext;
}

interface RefreshTokenPayload extends AccessTokenPayload {
    type: 'refresh' | 'impersonation_refresh';
}

function signAccessToken(payload: AccessTokenPayload) {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: jwtExpiry });
}

function signRefreshToken(payload: RefreshTokenPayload) {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: jwtRefreshExpiry });
}

function buildImpersonationTokens(target: { id: string; companyId: string }, impersonation: ImpersonationContext) {
    return {
        accessToken: signAccessToken({
            userId: target.id,
            companyId: target.companyId,
            impersonation,
        }),
        refreshToken: signRefreshToken({
            userId: target.id,
            companyId: target.companyId,
            type: 'impersonation_refresh',
            impersonation,
        }),
    };
}

export class AuthService {
    static async login(email: string, password: string) {
        email = email.toLowerCase().trim();
        // Optimize: First lookup user with minimal fields to avoid complex aggregation joins during check
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                companyId: true,
                email: true,
                passwordHash: true,
                isActive: true,
                name: true
            }
        });

        if (!user) throw AppError.unauthorized('Invalid email or password');
        if (!user.isActive) throw AppError.unauthorized('Account is deactivated');

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) throw AppError.unauthorized('Invalid email or password');

        // Now that user is authenticated, load the full profile with relations
        // This query will be faster because it uses the _id index
        const fullUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
                role: { select: { id: true, name: true, permissions: true } },
                branches: {
                    select: { branch: { select: { id: true, name: true, code: true } } },
                },
                company: { select: { id: true, name: true, currency: true, logoUrl: true, settings: true } },
            },
        });

        if (!fullUser) throw AppError.unauthorized('User record disappeared');

        // Extract setupCompleted from company settings for wizard flow
        const companySettings = (fullUser.company?.settings && typeof fullUser.company.settings === 'object' && !Array.isArray(fullUser.company.settings))
            ? fullUser.company.settings as Record<string, any>
            : {};
        const superAdminAccess = resolveSuperAdminAccess({
            email: fullUser.email,
            rolePermissions: fullUser.role?.permissions || [],
        });
        const isSuperAdmin = superAdminAccess.isSuperAdmin;
        const effectiveBranches = isSuperAdmin
            ? await prisma.branch.findMany({
                where: { companyId: fullUser.companyId },
                select: { id: true, name: true, code: true },
                orderBy: { name: 'asc' },
            })
            : fullUser.branches.map((ub) => ub.branch);

        const accessToken = signAccessToken({ userId: user.id, companyId: user.companyId });
        const refreshToken = signRefreshToken({ userId: user.id, companyId: user.companyId, type: 'refresh' });

        // Store refresh token
        try {
            console.log('Attempting to update user refresh token/login time...', user.id);
            await prisma.user.update({
                where: { id: user.id },
                data: { refreshToken, lastLoginAt: new Date() },
            });
            console.log('User update successful');
        } catch (updateError) {
            console.error('CRITICAL: Failed to update user login stats:', updateError);
            // Don't crash the request, just log it
        }

        return {
            accessToken,
            refreshToken,
            user: {
                id: fullUser.id,
                name: fullUser.name,
                email: fullUser.email,
                role: fullUser.role ? {
                    ...fullUser.role,
                    permissions: isSuperAdmin ? [...ALL_PERMISSIONS] : fullUser.role.permissions,
                } : fullUser.role,
                company: {
                    id: fullUser.company.id,
                    name: fullUser.company.name,
                    currency: fullUser.company.currency,
                    logoUrl: fullUser.company.logoUrl,
                    setupCompleted: companySettings.setupCompleted !== false, // default true for existing companies
                },
                branches: effectiveBranches,
                isSuperAdmin,
                superAdminPermissions: superAdminAccess.superAdminPermissions,
            },
        };
    }

    static async refresh(refreshToken: string) {
        try {
            const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;

            if (decoded.type === 'impersonation_refresh') {
                if (!decoded.impersonation) {
                    throw AppError.unauthorized('Invalid impersonation refresh token');
                }

                const [actor, target] = await Promise.all([
                    prisma.user.findUnique({
                        where: { id: decoded.impersonation.actorUserId },
                        include: {
                            role: { select: { permissions: true } },
                        },
                    }),
                    prisma.user.findUnique({
                        where: { id: decoded.userId },
                        select: { id: true, companyId: true, isActive: true },
                    }),
                ]);

                if (!actor || !actor.isActive) {
                    throw AppError.unauthorized('Impersonation actor is no longer active');
                }

                const actorSuperAdminAccess = resolveSuperAdminAccess({
                    email: actor.email,
                    rolePermissions: actor.role?.permissions || [],
                });

                if (
                    !actorSuperAdminAccess.isSuperAdmin
                    || !actorSuperAdminAccess.superAdminPermissions.includes(SUPER_ADMIN_PERMISSIONS.USERS_IMPERSONATE)
                ) {
                    throw AppError.unauthorized('Impersonation permission is no longer available');
                }

                if (!target || !target.isActive) {
                    throw AppError.unauthorized('Impersonated user is no longer available');
                }

                return buildImpersonationTokens(
                    { id: target.id, companyId: target.companyId },
                    decoded.impersonation,
                );
            }

            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
            });

            if (!user || !user.isActive || user.refreshToken !== refreshToken) {
                throw AppError.unauthorized('Invalid refresh token');
            }

            const accessToken = signAccessToken({ userId: user.id, companyId: user.companyId });
            const newRefreshToken = signRefreshToken({ userId: user.id, companyId: user.companyId, type: 'refresh' });

            await prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: newRefreshToken },
            });

            return { accessToken, refreshToken: newRefreshToken };
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw AppError.unauthorized('Invalid refresh token');
        }
    }

    static async logout(userId: string, options?: { isImpersonating?: boolean }) {
        if (options?.isImpersonating) {
            return;
        }

        await prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
    }

    static async createImpersonationSession(params: {
        actorUserId: string;
        targetUserId: string;
        reason: string;
    }) {
        const actor = await prisma.user.findUnique({
            where: { id: params.actorUserId },
            include: {
                role: { select: { permissions: true } },
            },
        });

        if (!actor || !actor.isActive) {
            throw AppError.forbidden('Super admin account is not active');
        }

        const actorSuperAdminAccess = resolveSuperAdminAccess({
            email: actor.email,
            rolePermissions: actor.role?.permissions || [],
        });

        if (
            !actorSuperAdminAccess.isSuperAdmin
            || !actorSuperAdminAccess.superAdminPermissions.includes(SUPER_ADMIN_PERMISSIONS.USERS_IMPERSONATE)
        ) {
            throw AppError.forbidden('Missing permission to impersonate tenant users');
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: params.targetUserId },
            include: {
                role: { select: { permissions: true } },
            },
        });

        if (!targetUser || !targetUser.isActive) {
            throw AppError.notFound('User');
        }

        if (targetUser.id === actor.id) {
            throw AppError.badRequest('Cannot impersonate your own account');
        }

        const targetSuperAdminAccess = resolveSuperAdminAccess({
            email: targetUser.email,
            rolePermissions: targetUser.role?.permissions || [],
        });

        if (targetSuperAdminAccess.isSuperAdmin) {
            throw AppError.badRequest('Super admin accounts cannot be impersonated');
        }

        const impersonation: ImpersonationContext = {
            actorUserId: actor.id,
            actorEmail: actor.email,
            actorName: actor.name,
            actorCompanyId: actor.companyId,
            reason: params.reason.trim(),
            startedAt: new Date().toISOString(),
            sessionId: randomUUID(),
        };

        return {
            ...buildImpersonationTokens(
                { id: targetUser.id, companyId: targetUser.companyId },
                impersonation,
            ),
            impersonation,
        };
    }
}
