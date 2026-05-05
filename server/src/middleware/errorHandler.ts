import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/response.js';
import { logger } from '../lib/logger.js';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

/**
 * Enhanced Error Handler
 * Provides detailed error messages, proper categorization, and security-conscious error reporting
 */

interface ErrorDetails {
    code: string;
    message: string;
    field?: string;
    details?: any;
}

/**
 * Format validation errors with field-specific messages
 */
function formatValidationErrors(err: ZodError): ErrorDetails[] {
    return err.errors.map((e) => ({
        code: e.code,
        message: e.message,
        field: e.path.join('.'),
    }));
}

function formatFieldLabel(field: string): string {
    return field
        .replace(/Ids$/, '')
        .replace(/Id$/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase();
}

function getPrismaErrorDetails(code: string, meta: any): ErrorDetails[] | undefined {
    if (code !== 'P2002') return undefined;

    const rawTargets = Array.isArray(meta?.target)
        ? (meta.target as string[])
        : typeof meta?.target === 'string'
            ? [meta.target]
            : [];

    const targets = rawTargets.filter((target) => target && target !== 'companyId');
    if (targets.length === 0) return undefined;

    return targets.map((field) => ({
        code,
        field,
        message: `This ${formatFieldLabel(field)} is already in use.`,
    }));
}

/**
 * Get user-friendly error message for Prisma errors
 */
function getPrismaErrorMessage(code: string, meta: any): { message: string; userMessage: string } {
    switch (code) {
        case 'P2002': {
            const target = Array.isArray(meta?.target)
                ? (meta?.target as string[]).join(', ')
                : String(meta?.target || 'field');
            return {
                message: `Duplicate value for: ${target}`,
                userMessage: `A record with this ${target} already exists. Please use a different value.`,
            };
        }
        case 'P2025':
            return {
                message: 'Record not found',
                userMessage: 'The requested record does not exist or has been deleted.',
            };
        case 'P2003':
            return {
                message: 'Foreign key constraint failed',
                userMessage: 'The related record required for this operation does not exist.',
            };
        case 'P2000':
            return {
                message: `Value too long for column`,
                userMessage: 'One or more values exceed the maximum allowed length.',
            };
        case 'P2006':
            return {
                message: `Invalid value for field`,
                userMessage: 'An invalid value was provided for one of the fields.',
            };
        case 'P2010':
            return {
                message: 'Constraint violation',
                userMessage: 'The operation violates a database constraint.',
            };
        case 'P2021':
            return {
                message: 'Table does not exist',
                userMessage: 'Database configuration error. Please contact support.',
            };
        default:
            return {
                message: `Database error: ${code}`,
                userMessage: 'A database error occurred. Please try again later.',
            };
    }
}

/**
 * Categorize error by severity and type
 */
function categorizeError(err: Error): {
    category: 'validation' | 'authentication' | 'authorization' | 'not_found' | 'conflict' | 'database' | 'network' | 'internal';
    severity: 'low' | 'medium' | 'high' | 'critical';
    isOperational: boolean;
} {
    if (err instanceof AppError) {
        if (err.statusCode === 400 || err.statusCode === 422) {
            return { category: 'validation', severity: 'low', isOperational: err.isOperational };
        }
        if (err.statusCode === 401) {
            return { category: 'authentication', severity: 'medium', isOperational: err.isOperational };
        }
        if (err.statusCode === 403) {
            return { category: 'authorization', severity: 'medium', isOperational: err.isOperational };
        }
        if (err.statusCode === 404) {
            return { category: 'not_found', severity: 'low', isOperational: err.isOperational };
        }
        if (err.statusCode === 409) {
            return { category: 'conflict', severity: 'medium', isOperational: err.isOperational };
        }
    }

    if (err instanceof ZodError) {
        return { category: 'validation', severity: 'low', isOperational: true };
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        return { category: 'database', severity: 'medium', isOperational: true };
    }

    if (err instanceof Prisma.PrismaClientValidationError) {
        return { category: 'validation', severity: 'low', isOperational: true };
    }

    if (err instanceof Prisma.PrismaClientUnknownRequestError) {
        return { category: 'database', severity: 'high', isOperational: false };
    }

    // Check for network/connectivity errors
    const errorMessage = err.message.toLowerCase();
    if (errorMessage.includes('connection') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
        return { category: 'network', severity: 'high', isOperational: false };
    }

    // Default to internal error
    return { category: 'internal', severity: 'critical', isOperational: false };
}

/**
 * Log error with appropriate detail level
 */
function logError(err: Error, category: string, severity: string, req: Request): void {
    const logContext = {
        errorType: err.constructor.name,
        category,
        severity,
        path: req.path,
        method: req.method,
        userId: (req as any).user?.id,
        companyId: (req as any).user?.companyId,
        timestamp: new Date().toISOString(),
    };

    if (severity === 'critical') {
        logger.error('Critical error:', {
            ...logContext,
            error: err.message,
            stack: err.stack,
        });
    } else if (severity === 'high') {
        logger.error('High severity error:', {
            ...logContext,
            error: err.message,
        });
    } else if (severity === 'medium') {
        logger.warn('Medium severity error:', logContext);
    } else {
        logger.info('Low severity error:', logContext);
    }
}

/**
 * Sanitize error message for client (remove sensitive information)
 */
function sanitizeErrorMessage(err: Error, isProduction: boolean): string {
    if (isProduction) {
        // In production, don't expose internal error details
        if (err.message.includes('password') || err.message.includes('secret') || err.message.includes('token')) {
            return 'Authentication failed';
        }
        if (err.message.includes('SQL') || err.message.includes('database')) {
            return 'A database error occurred';
        }
    }
    return err.message;
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    // Already sent
    if (res.headersSent) return;

    const isProduction = env.NODE_ENV === 'production';
    const { category, severity, isOperational } = categorizeError(err);

    // Log the error
    logError(err, category, severity, req);

    // Custom AppError
    if (err instanceof AppError) {
        sendError(res, err.code, err.message, err.details, err.statusCode);
        return;
    }

    // Zod validation errors
    if (err instanceof ZodError) {
        const details = formatValidationErrors(err);
        sendError(
            res,
            'VALIDATION_ERROR',
            'Validation failed. Please check your input.',
            details,
            422
        );
        return;
    }

    // Prisma errors
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const { message, userMessage } = getPrismaErrorMessage(err.code, err.meta);
        const details = getPrismaErrorDetails(err.code, err.meta);

        // Log full error internally
        logger.debug(`Prisma error ${err.code}:`, {
            message: err.message,
            meta: err.meta,
            query: err.meta?.query,
        });

        sendError(
            res,
            'DATABASE_ERROR',
            isProduction ? userMessage : message,
            details,
            400
        );
        return;
    }

    if (err instanceof Prisma.PrismaClientValidationError) {
        sendError(
            res,
            'VALIDATION_ERROR',
            'Invalid data provided',
            [{ field: 'unknown', message: err.message }],
            400
        );
        return;
    }

    if (err instanceof Prisma.PrismaClientUnknownRequestError) {
        // Unknown Prisma error - log internally, show generic message
        logger.error('Unknown Prisma error:', err);
        sendError(
            res,
            'DATABASE_ERROR',
            'A database error occurred. Please try again later.',
            undefined,
            500
        );
        return;
    }

    // Handle JSON parse errors
    if (err instanceof SyntaxError && 'body' in err) {
        sendError(
            res,
            'BAD_REQUEST',
            'Invalid JSON in request body',
            undefined,
            400
        );
        return;
    }

    // Handle file size limit errors
    if (err.message.includes('too large') || err.message.includes('limit')) {
        sendError(
            res,
            'BAD_REQUEST',
            'Request payload too large',
            undefined,
            413
        );
        return;
    }

    // Unexpected error
    const sanitizedMessage = sanitizeErrorMessage(err, isProduction);

    sendError(
        res,
        'INTERNAL_ERROR',
        isProduction ? 'An unexpected error occurred. Please try again later.' : sanitizedMessage,
        isProduction ? undefined : { stack: err.stack },
        500
    );
}

/**
 * Async handler wrapper with automatic error handling
 * Use this to wrap async route handlers
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Create a timed error handler for performance monitoring
 */
export function createTimedErrorHandler(
    thresholdMs: number = 1000
) {
    return (err: Error, req: Request, res: Response, next: NextFunction) => {
        const startTime = (req as any).startTime || Date.now();
        const duration = Date.now() - startTime;

        if (duration > thresholdMs) {
            logger.warn('Slow request detected before error:', {
                path: req.path,
                method: req.method,
                duration: `${duration}ms`,
                threshold: `${thresholdMs}ms`,
                error: err.message,
            });
        }

        errorHandler(err, req, res, next);
    };
}
