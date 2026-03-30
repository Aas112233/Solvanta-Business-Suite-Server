/**
 * Enhanced AppError Class
 * Provides detailed error information with proper categorization
 */

export type ErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'VALIDATION_ERROR'
    | 'RATE_LIMIT_EXCEEDED'
    | 'RESOURCE_LOCKED'
    | 'PAYMENT_REQUIRED'
    | 'GONE'
    | 'PRECONDITION_FAILED'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'UNPROCESSABLE_ENTITY'
    | 'TOO_MANY_REQUESTS'
    | 'DATABASE_ERROR'
    | 'EXTERNAL_SERVICE_ERROR'
    | 'INTERNAL_ERROR'
    | 'SERVICE_UNAVAILABLE';

export interface ErrorDetails {
    field?: string;
    message?: string;
    code?: string;
    [key: string]: any;
}

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: ErrorCode;
    public readonly isOperational: boolean;
    public readonly details?: ErrorDetails[];
    public readonly timestamp: string;
    public readonly path?: string;

    constructor(
        message: string,
        statusCode = 400,
        code: ErrorCode = 'BAD_REQUEST',
        details?: ErrorDetails[],
        isOperational = true,
        path?: string
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.details = details;
        this.timestamp = new Date().toISOString();
        this.path = path;
        Object.setPrototypeOf(this, AppError.prototype);
        if ((Error as any).captureStackTrace) {
            (Error as any).captureStackTrace(this, this.constructor);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CLIENT ERRORS (4xx)
    // ─────────────────────────────────────────────────────────────

    static badRequest(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 400, 'BAD_REQUEST', details);
    }

    static unauthorized(message = 'Unauthorized', details?: ErrorDetails[]) {
        return new AppError(message, 401, 'UNAUTHORIZED', details);
    }

    static forbidden(message = 'Forbidden', details?: ErrorDetails[]) {
        return new AppError(message, 403, 'FORBIDDEN', details);
    }

    static notFound(entity = 'Resource', details?: ErrorDetails[]) {
        return new AppError(`${entity} not found`, 404, 'NOT_FOUND', details);
    }

    static conflict(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 409, 'CONFLICT', details);
    }

    static validationError(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 422, 'VALIDATION_ERROR', details);
    }

    static rateLimitExceeded(message = 'Too many requests', details?: ErrorDetails[]) {
        return new AppError(message, 429, 'RATE_LIMIT_EXCEEDED', details);
    }

    static resourceLocked(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 423, 'RESOURCE_LOCKED', details);
    }

    static paymentRequired(message = 'Payment required', details?: ErrorDetails[]) {
        return new AppError(message, 402, 'PAYMENT_REQUIRED', details);
    }

    static gone(message = 'Resource is gone', details?: ErrorDetails[]) {
        return new AppError(message, 410, 'GONE', details);
    }

    static preconditionFailed(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 412, 'PRECONDITION_FAILED', details);
    }

    static unsupportedMediaType(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 415, 'UNSUPPORTED_MEDIA_TYPE', details);
    }

    static unprocessableEntity(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);
    }

    static tooManyRequests(message = 'Too many requests', details?: ErrorDetails[]) {
        return new AppError(message, 429, 'TOO_MANY_REQUESTS', details);
    }

    // ─────────────────────────────────────────────────────────────
    // SERVER ERRORS (5xx)
    // ─────────────────────────────────────────────────────────────

    static internal(message = 'Internal server error', details?: ErrorDetails[]) {
        return new AppError(message, 500, 'INTERNAL_ERROR', details, false);
    }

    static databaseError(message: string, details?: ErrorDetails[]) {
        return new AppError(message, 500, 'DATABASE_ERROR', details, false);
    }

    static externalServiceError(service: string, message: string, details?: ErrorDetails[]) {
        return new AppError(
            `${service} service error: ${message}`,
            502,
            'EXTERNAL_SERVICE_ERROR',
            details,
            false
        );
    }

    static serviceUnavailable(message = 'Service unavailable', details?: ErrorDetails[]) {
        return new AppError(message, 503, 'SERVICE_UNAVAILABLE', details, false);
    }

    // ─────────────────────────────────────────────────────────────
    // DOMAIN-SPECIFIC ERRORS
    // ─────────────────────────────────────────────────────────────

    static authenticationFailed(message = 'Invalid credentials', details?: ErrorDetails[]) {
        return new AppError(message, 401, 'UNAUTHORIZED', details);
    }

    static invalidToken(message = 'Invalid or expired token', details?: ErrorDetails[]) {
        return new AppError(message, 401, 'UNAUTHORIZED', details);
    }

    static insufficientPermissions(requiredPermission?: string, details?: ErrorDetails[]) {
        const message = requiredPermission
            ? `Insufficient permissions. Required: ${requiredPermission}`
            : 'Insufficient permissions';
        return new AppError(message, 403, 'FORBIDDEN', details);
    }

    static duplicateRecord(field: string, value?: string, details?: ErrorDetails[]) {
        const message = value
            ? `A record with ${field} '${value}' already exists`
            : `Duplicate ${field}`;
        return new AppError(message, 409, 'CONFLICT', details);
    }

    static invalidInput(field: string, message: string, details?: ErrorDetails[]) {
        return new AppError(
            `Invalid ${field}: ${message}`,
            400,
            'BAD_REQUEST',
            [{ field, message, ...details }],
            true
        );
    }

    static missingRequiredField(field: string, details?: ErrorDetails[]) {
        return new AppError(
            `Missing required field: ${field}`,
            400,
            'BAD_REQUEST',
            [{ field, message: 'Field is required', ...details }],
            true
        );
    }

    static invalidDateFormat(field: string, details?: ErrorDetails[]) {
        return new AppError(
            `Invalid date format for ${field}. Expected: YYYY-MM-DD`,
            400,
            'BAD_REQUEST',
            [{ field, message: 'Invalid date format', ...details }],
            true
        );
    }

    static invalidEmailFormat(details?: ErrorDetails[]) {
        return new AppError(
            'Invalid email format',
            400,
            'BAD_REQUEST',
            [{ field: 'email', message: 'Invalid email format', ...details }],
            true
        );
    }

    static invalidPhoneNumber(details?: ErrorDetails[]) {
        return new AppError(
            'Invalid phone number format',
            400,
            'BAD_REQUEST',
            [{ field: 'phone', message: 'Invalid phone number format', ...details }],
            true
        );
    }

    static insufficientStock(available: number, requested: number, details?: ErrorDetails[]) {
        return new AppError(
            `Insufficient stock. Available: ${available}, Requested: ${requested}`,
            400,
            'BAD_REQUEST',
            [{ available, requested, message: 'Insufficient stock', ...details }],
            true
        );
    }

    static invalidAmount(min?: number, max?: number, details?: ErrorDetails[]) {
        let message = 'Invalid amount';
        if (min !== undefined && max !== undefined) {
            message = `Amount must be between ${min} and ${max}`;
        } else if (min !== undefined) {
            message = `Amount must be at least ${min}`;
        } else if (max !== undefined) {
            message = `Amount must be at most ${max}`;
        }
        return new AppError(message, 400, 'BAD_REQUEST', details);
    }

    static recordNotFound(entity: string, id?: string, details?: ErrorDetails[]) {
        const message = id
            ? `${entity} with ID '${id}' not found`
            : `${entity} not found`;
        return new AppError(message, 404, 'NOT_FOUND', details);
    }

    static cannotDeleteRecord(reason: string, details?: ErrorDetails[]) {
        return new AppError(
            `Cannot delete record: ${reason}`,
            400,
            'BAD_REQUEST',
            details
        );
    }

    static cannotUpdateRecord(reason: string, details?: ErrorDetails[]) {
        return new AppError(
            `Cannot update record: ${reason}`,
            400,
            'BAD_REQUEST',
            details
        );
    }

    static businessRuleViolation(rule: string, details?: ErrorDetails[]) {
        return new AppError(
            `Business rule violation: ${rule}`,
            400,
            'BAD_REQUEST',
            details
        );
    }

    static workflowInvalidState(currentState: string, requiredState: string, details?: ErrorDetails[]) {
        return new AppError(
            `Invalid workflow state. Current: ${currentState}, Required: ${requiredState}`,
            400,
            'BAD_REQUEST',
            details
        );
    }

    static sessionExpired(details?: ErrorDetails[]) {
        return new AppError('Session expired. Please login again.', 401, 'UNAUTHORIZED', details);
    }

    static accountLocked(reason?: string, details?: ErrorDetails[]) {
        const message = reason
            ? `Account locked: ${reason}`
            : 'Account locked. Please contact support.';
        return new AppError(message, 403, 'FORBIDDEN', details);
    }

    static accountInactive(details?: ErrorDetails[]) {
        return new AppError('Account is inactive', 403, 'FORBIDDEN', details);
    }

    static featureDisabled(feature: string, details?: ErrorDetails[]) {
        return new AppError(
            `Feature '${feature}' is disabled`,
            403,
            'FORBIDDEN',
            details
        );
    }

    static maintenanceMode(message = 'System under maintenance', details?: ErrorDetails[]) {
        return new AppError(message, 503, 'SERVICE_UNAVAILABLE', details, false);
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * Convert error to JSON response
     */
    toJSON() {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                details: this.details,
                timestamp: this.timestamp,
                path: this.path,
            },
        };
    }
}

export default AppError;
