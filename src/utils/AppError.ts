export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly isOperational: boolean;
    public readonly details?: any;

    constructor(
        message: string,
        statusCode = 400,
        code = 'BAD_REQUEST',
        details?: any,
        isOperational = true
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.details = details;
        Object.setPrototypeOf(this, AppError.prototype);
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message: string, details?: any) {
        return new AppError(message, 400, 'BAD_REQUEST', details);
    }

    static unauthorized(message = 'Unauthorized') {
        return new AppError(message, 401, 'UNAUTHORIZED');
    }

    static forbidden(message = 'Forbidden') {
        return new AppError(message, 403, 'FORBIDDEN');
    }

    static notFound(entity = 'Resource') {
        return new AppError(`${entity} not found`, 404, 'NOT_FOUND');
    }

    static conflict(message: string) {
        return new AppError(message, 409, 'CONFLICT');
    }

    static internal(message = 'Internal server error') {
        return new AppError(message, 500, 'INTERNAL_ERROR', undefined, false);
    }
}
