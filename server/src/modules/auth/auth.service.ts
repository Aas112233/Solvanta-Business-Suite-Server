import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const jwtExpiry = env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
const jwtRefreshExpiry = env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'];

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

        const accessToken = jwt.sign(
            { userId: user.id, companyId: user.companyId },
            env.JWT_SECRET,
            { expiresIn: jwtExpiry }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, companyId: user.companyId, type: 'refresh' },
            env.JWT_REFRESH_SECRET,
            { expiresIn: jwtRefreshExpiry }
        );

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
                role: fullUser.role,
                company: {
                    id: fullUser.company.id,
                    name: fullUser.company.name,
                    currency: fullUser.company.currency,
                    logoUrl: fullUser.company.logoUrl,
                    setupCompleted: companySettings.setupCompleted !== false, // default true for existing companies
                },
                branches: fullUser.branches.map((ub) => ub.branch),
            },
        };
    }

    static async refresh(refreshToken: string) {
        try {
            const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as {
                userId: string;
                companyId: string;
            };

            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
            });

            if (!user || !user.isActive || user.refreshToken !== refreshToken) {
                throw AppError.unauthorized('Invalid refresh token');
            }

            const accessToken = jwt.sign(
                { userId: user.id, companyId: user.companyId },
                env.JWT_SECRET,
                { expiresIn: jwtExpiry }
            );

            const newRefreshToken = jwt.sign(
                { userId: user.id, companyId: user.companyId, type: 'refresh' },
                env.JWT_REFRESH_SECRET,
                { expiresIn: jwtRefreshExpiry }
            );

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

    static async logout(userId: string) {
        await prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
    }
}
