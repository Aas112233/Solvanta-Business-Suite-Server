import { Response } from 'express';

interface SuccessResponse<T> {
    success: true;
    data: T;
    meta?: Record<string, any>;
}

interface ErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: any;
    };
}

export function sendSuccess<T>(
    res: Response,
    data: T,
    meta?: Record<string, any>,
    statusCode = 200
): void {
    const response: SuccessResponse<T> = { success: true, data };
    if (meta) response.meta = meta;
    res.status(statusCode).json(response);
}

export function sendError(
    res: Response,
    code: string,
    message: string,
    details?: any,
    statusCode = 400
): void {
    const response: ErrorResponse = {
        success: false,
        error: { code, message },
    };
    if (details) response.error.details = details;
    res.status(statusCode).json(response);
}

export function sendPaginated<T>(
    res: Response,
    data: T[],
    total: number,
    page: number,
    limit: number
): void {
    sendSuccess(res, data, {
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
}
