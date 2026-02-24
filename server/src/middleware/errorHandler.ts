import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/response.js';
import { logger } from '../lib/logger.js';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    // Already sent
    if (res.headersSent) return;

    // Custom AppError
    if (err instanceof AppError) {
        sendError(res, err.code, err.message, err.details, err.statusCode);
        if (!err.isOperational) {
            logger.error('Non-operational error:', err);
        }
        return;
    }

    // Zod validation errors
    if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        sendError(res, 'VALIDATION_ERROR', 'Validation failed', details, 422);
        return;
    }

    // Prisma known request error
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        switch (err.code) {
            case 'P2002': {
                const target = Array.isArray(err.meta?.target)
                    ? (err.meta?.target as string[]).join(', ')
                    : String(err.meta?.target || 'field');
                sendError(res, 'CONFLICT', `Duplicate value for: ${target}`, undefined, 409);
                return;
            }
            case 'P2025':
                sendError(res, 'NOT_FOUND', 'Record not found', undefined, 404);
                return;
            case 'P2003':
                sendError(res, 'BAD_REQUEST', 'Related record not found (foreign key constraint)', undefined, 400);
                return;
            default:
                logger.error(`Prisma error ${err.code}:`, err);
                sendError(res, 'DATABASE_ERROR', 'Database error', undefined, 500);
                return;
        }
    }

    // Unexpected error
    logger.error('Unhandled error:', err);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', undefined, 500);
}
