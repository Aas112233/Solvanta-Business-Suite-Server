import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { ALL_PERMISSIONS } from '../../config/permissions.js';
import { resolveSuperAdminAccess } from '../../middleware/superAdmin.js';
import { SUPER_ADMIN_PERMISSIONS } from '../super-admin/super-admin.permissions.js';
import { loadUserAssignedBranches } from '../user/user-profile.utils.js';
import { resolveCompanyTaxSettings } from '../../utils/companyTax.js';
import { resolveCompanyDocumentSettings, resolveCompanyRegionalSettings } from '../../utils/companySettings.js';

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

        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                companyId: true,
                email: true,
                passwordHash: true,
                isActive: true,
                name: true,
                failedLoginAttempts: true,
                lockedUntil: true,
            }
        });

        if (!user) throw AppError.unauthorized('Invalid email or password');
        if (!user.isActive) throw AppError.unauthorized('Account is deactivated');

        // Check account lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const lockoutMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
            throw AppError.unauthorized(`Account locked. Try again in ${lockoutMinutes} minutes`);
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            // Increment failed login attempts
            const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
            const lockUntil = newFailedAttempts >= 5
                ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes lockout
                : undefined;

            await prisma.user.update({
                where: { id: user.id },
                data: {
                    failedLoginAttempts: newFailedAttempts,
                    lockedUntil: lockUntil || null,
                },
            });

            throw AppError.unauthorized('Invalid email or password');
        }

        // Reset failed login attempts on successful login
        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginAttempts: 0,
                lockedUntil: null,
            },
        });

        // Now that user is authenticated, load the full profile with relations
        const fullUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
                role: { select: { id: true, name: true, permissions: true } },
                company: { select: { id: true, name: true, currency: true, logoUrl: true, settings: true } },
            },
        });

        if (!fullUser) throw AppError.unauthorized('User record disappeared');

        const assignedBranches = await loadUserAssignedBranches(fullUser.id, fullUser.companyId);

        // Check if force password change is required
        if (fullUser.forcePasswordChange) {
            const companySettings = (fullUser.company?.settings && typeof fullUser.company.settings === 'object' && !Array.isArray(fullUser.company.settings))
                ? fullUser.company.settings as Record<string, any>
                : {};
            const taxSettings = resolveCompanyTaxSettings(companySettings);
            const regionalSettings = resolveCompanyRegionalSettings(companySettings);
            const documentSettings = resolveCompanyDocumentSettings(companySettings);
            const superAdminAccess = resolveSuperAdminAccess({
                email: fullUser.email,
                rolePermissions: fullUser.role?.permissions || [],
            });
            const isSuperAdmin = superAdminAccess.isSuperAdmin;

            const accessToken = signAccessToken({ userId: user.id, companyId: user.companyId });
            const refreshToken = signRefreshToken({ userId: user.id, companyId: user.companyId, type: 'refresh' });

            await prisma.user.update({
                where: { id: user.id },
                data: { refreshToken, lastLoginAt: new Date() },
            });

            return {
                accessToken,
                refreshToken,
                user: {
                    id: fullUser.id,
                    name: fullUser.name,
                    email: fullUser.email,
                    role: fullUser.role,
                    company: {
                        id: fullUser.company.id,
                        name: fullUser.company.name,
                        currency: fullUser.company.currency,
                        logoUrl: fullUser.company.logoUrl,
                        setupCompleted: companySettings.setupCompleted !== false,
                        regionalSettings,
                        documentSettings,
                        taxSettings,
                    },
                    branches: assignedBranches,
                    isSuperAdmin,
                    superAdminPermissions: superAdminAccess.superAdminPermissions,
                    forcePasswordChange: true,
                },
            };
        }

        // Extract setupCompleted from company settings for wizard flow
        const companySettings = (fullUser.company?.settings && typeof fullUser.company.settings === 'object' && !Array.isArray(fullUser.company.settings))
            ? fullUser.company.settings as Record<string, any>
            : {};
        const taxSettings = resolveCompanyTaxSettings(companySettings);
        const regionalSettings = resolveCompanyRegionalSettings(companySettings);
        const documentSettings = resolveCompanyDocumentSettings(companySettings);
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
            : assignedBranches;

        const accessToken = signAccessToken({ userId: user.id, companyId: user.companyId });
        const refreshToken = signRefreshToken({ userId: user.id, companyId: user.companyId, type: 'refresh' });

        // Store refresh token and update last login
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken, lastLoginAt: new Date() },
        });

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
                    regionalSettings,
                    documentSettings,
                    taxSettings,
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

    static async forgotPassword(email: string) {
        email = email.toLowerCase().trim();

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, isActive: true, companyId: true },
        });

        // Always return success to prevent email enumeration
        if (!user || !user.isActive) {
            return { message: 'If the email exists, a reset link has been sent' };
        }

        // Generate reset token
        const resetToken = randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetToken,
                passwordResetExpiresAt: resetTokenExpiry,
            },
        });

        // In production, send email with reset token
        // For now, return the token for testing (REMOVE IN PRODUCTION)
        // TODO: Implement email service integration
        return {
            message: 'Password reset token generated',
            resetToken, // REMOVE THIS IN PRODUCTION - only for development
            note: 'In production, this would be sent via email'
        };
    }

    static async resetPassword(token: string, newPassword: string) {
        const user = await prisma.user.findFirst({
            where: {
                passwordResetToken: token,
                passwordResetExpiresAt: { gt: new Date() },
            },
        });

        if (!user) {
            throw AppError.badRequest('Invalid or expired reset token');
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                passwordResetToken: null,
                passwordResetExpiresAt: null,
                forcePasswordChange: false,
                failedLoginAttempts: 0,
                lockedUntil: null,
            },
        });

        return { message: 'Password reset successfully' };
    }

    static async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true },
        });

        if (!user) {
            throw AppError.notFound('User');
        }

        const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!validPassword) {
            throw AppError.badRequest('Current password is incorrect');
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash,
                forcePasswordChange: false,
            },
        });

        return { message: 'Password changed successfully' };
    }
}
