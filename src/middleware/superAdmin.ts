import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function parseSuperAdminEmails() {
    const allEmails = [env.SUPER_ADMIN_EMAILS, env.SUPER_ADMIN_EMAIL]
        .filter(Boolean)
        .join(',');

    return allEmails
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
        .filter((email, index, arr) => arr.indexOf(email) === index);
}

export function isEmailSuperAdmin(email?: string) {
    if (!email) return false;
    return parseSuperAdminEmails().includes(email.trim().toLowerCase());
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) {
        next(AppError.unauthorized());
        return;
    }

    const allowList = parseSuperAdminEmails();
    if (allowList.length === 0) {
        next(AppError.forbidden('SUPER_ADMIN_EMAILS is not configured'));
        return;
    }

    if (!isEmailSuperAdmin(req.user.email)) {
        next(AppError.forbidden('Super admin access required'));
        return;
    }

    next();
}
