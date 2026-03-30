/**
 * Data Sanitization Utilities
 * Prevents XSS, SQL injection, and ensures clean data entry
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize HTML string to prevent XSS attacks
 * Allows only safe tags for rich text fields
 */
export function sanitizeHTML(input: string, options?: {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
}): string {
    if (!input || typeof input !== 'string') return '';

    const defaultOptions: sanitizeHtml.IOptions = {
        allowedTags: [], // No tags by default - plain text only
        allowedAttributes: {},
        disallowedTagsMode: 'discard',
        allowProtocolRelative: false,
        enforceHtmlBoundary: false,
    };

    const mergedOptions: sanitizeHtml.IOptions = {
        ...defaultOptions,
        ...options,
    };

    return sanitizeHtml(input.trim(), mergedOptions);
}

/**
 * Sanitize plain text input
 * - Trims whitespace
 * - Removes null bytes
 * - Normalizes unicode
 * - Prevents SQL injection characters in plain text
 */
export function sanitizeText(input: string, options?: {
    maxLength?: number;
    minLength?: number;
    allowEmoji?: boolean;
}): string {
    if (!input || typeof input !== 'string') return '';

    let sanitized = input.trim();

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Normalize unicode (NFC normalization)
    sanitized = sanitized.normalize('NFC');

    // Remove control characters except newlines and tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Optionally remove emoji
    if (options?.allowEmoji === false) {
        sanitized = sanitized.replace(
            /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu,
            ''
        );
    }

    // Enforce length limits
    if (options?.minLength && sanitized.length < options.minLength) {
        throw new Error(`Input must be at least ${options.minLength} characters`);
    }

    if (options?.maxLength && sanitized.length > options.maxLength) {
        sanitized = sanitized.slice(0, options.maxLength);
    }

    return sanitized;
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    // Trim and lowercase
    const sanitized = input.trim().toLowerCase();
    
    // Remove any whitespace
    return sanitized.replace(/\s+/g, '');
}

/**
 * Sanitize phone number
 * Allows: +, digits, spaces, hyphens, parentheses
 */
export function sanitizePhone(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    // Trim
    const sanitized = input.trim();
    
    // Remove all characters except +, digits, spaces, hyphens, parentheses
    return sanitized.replace(/[^+\d\s()-]/g, '');
}

/**
 * Sanitize numeric code (like customer code, item code)
 * Allows only alphanumeric, hyphens, underscores
 */
export function sanitizeCode(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    // Trim and uppercase
    const sanitized = input.trim().toUpperCase();
    
    // Remove invalid characters
    return sanitized.replace(/[^A-Z0-9_-]/g, '');
}

/**
 * Sanitize URL
 */
export function sanitizeUrl(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    const sanitized = input.trim();
    
    try {
        const url = new URL(sanitized);
        
        // Only allow http and https
        if (!['http:', 'https:'].includes(url.protocol)) {
            return '';
        }
        
        return url.toString();
    } catch {
        return '';
    }
}

/**
 * Sanitize array of strings
 */
export function sanitizeStringArray(input: unknown, options?: {
    maxLength?: number;
    itemMaxLength?: number;
}): string[] {
    if (!Array.isArray(input)) return [];
    
    const maxItems = options?.maxLength || 100;
    const itemMax = options?.itemMaxLength || 200;
    
    return input
        .slice(0, maxItems)
        .map(item => {
            if (typeof item !== 'string') return '';
            return sanitizeText(item, { maxLength: itemMax });
        })
        .filter(item => item.length > 0);
}

/**
 * Sanitize object with known schema
 */
export function sanitizeObject<T extends Record<string, any>>(
    input: unknown,
    schema: {
        [K in keyof T]: {
            type: 'string' | 'number' | 'boolean' | 'array' | 'object';
            sanitize?: (value: any) => any;
            required?: boolean;
        };
    }
): Partial<T> {
    if (!input || typeof input !== 'object') return {} as Partial<T>;
    
    const result: Partial<T> = {};
    
    for (const [key, config] of Object.entries(schema)) {
        const value = (input as any)[key];
        
        if (value === undefined || value === null) {
            if (config.required) {
                throw new Error(`Required field missing: ${key}`);
            }
            continue;
        }
        
        if (config.sanitize) {
            result[key as keyof T] = config.sanitize(value);
        } else {
            result[key as keyof T] = value;
        }
    }
    
    return result;
}

/**
 * Prevent SQL injection by escaping special characters
 * Note: Prisma uses parameterized queries, but this adds extra protection
 */
export function escapeSQLSpecialChars(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');
    
    // Escape common SQL injection patterns
    sanitized = sanitized.replace(/['";\\]/g, '');
    
    return sanitized;
}

/**
 * Validate and sanitize file name
 */
export function sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return '';
    
    // Get just the file name without path
    const baseName = fileName.split(/[\\/]/).pop() || '';
    
    // Remove any characters that aren't alphanumeric, dash, underscore, or dot
    let sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Remove multiple consecutive dots
    sanitized = sanitized.replace(/\.{2,}/g, '.');
    
    // Ensure it doesn't start with a dot
    if (sanitized.startsWith('.')) {
        sanitized = '_' + sanitized;
    }
    
    // Limit length
    return sanitized.slice(0, 255);
}

/**
 * Batch sanitize array of objects
 */
export function batchSanitize<T extends Record<string, any>>(
    items: unknown[],
    schema: {
        [K in keyof T]: {
            type: 'string' | 'number' | 'boolean' | 'array';
            sanitize?: (value: any) => any;
        };
    },
    options?: {
        maxItems?: number;
    }
): Partial<T>[] {
    if (!Array.isArray(items)) return [];
    
    const maxItems = options?.maxItems || 1000;
    const limited = items.slice(0, maxItems);
    
    return limited.map(item => sanitizeObject(item, schema));
}

/**
 * Check if input contains potential XSS patterns
 */
export function containsXSSPatterns(input: string): boolean {
    if (!input || typeof input !== 'string') return false;
    
    const xssPatterns = [
        /<script\b/i,
        /<\/script>/i,
        /javascript:/i,
        /on\w+\s*=/i, // onclick=, onerror=, etc.
        /<iframe\b/i,
        /<object\b/i,
        /<embed\b/i,
        /<link\b/i,
        /<meta\b/i,
        /data:text\/html/i,
        /vbscript:/i,
    ];
    
    return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Validate IP address
 */
export function isValidIP(ip: string): boolean {
    if (!ip || typeof ip !== 'string') return false;
    
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^([\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}$/;
    
    if (ipv4Pattern.test(ip)) {
        const octets = ip.split('.').map(Number);
        return octets.every(octet => octet >= 0 && octet <= 255);
    }
    
    return ipv6Pattern.test(ip);
}

/**
 * Rate limit helper - track request counts
 */
export class RateLimitTracker {
    private requests: Map<string, { count: number; resetAt: number }> = new Map();
    
    constructor(
        private windowMs: number,
        private maxRequests: number
    ) {}
    
    checkLimit(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
        const now = Date.now();
        const existing = this.requests.get(identifier);
        
        if (!existing || now > existing.resetAt) {
            this.requests.set(identifier, {
                count: 1,
                resetAt: now + this.windowMs,
            });
            return {
                allowed: true,
                remaining: this.maxRequests - 1,
                resetAt: now + this.windowMs,
            };
        }
        
        if (existing.count >= this.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: existing.resetAt,
            };
        }
        
        existing.count++;
        return {
            allowed: true,
            remaining: this.maxRequests - existing.count,
            resetAt: existing.resetAt,
        };
    }
    
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.requests.entries()) {
            if (now > value.resetAt) {
                this.requests.delete(key);
            }
        }
    }
}

export default {
    sanitizeHTML,
    sanitizeText,
    sanitizeEmail,
    sanitizePhone,
    sanitizeCode,
    sanitizeUrl,
    sanitizeStringArray,
    sanitizeObject,
    escapeSQLSpecialChars,
    sanitizeFileName,
    batchSanitize,
    containsXSSPatterns,
    isValidIP,
    RateLimitTracker,
};
