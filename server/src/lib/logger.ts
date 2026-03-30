import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;
const isServerlessRuntime = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME != null;

const devFormat = combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${stack || message}${metaStr}`;
    })
);

const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    winston.format.json()
);

export const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
    transports: [
        new winston.transports.Console(),
        ...(env.NODE_ENV === 'production' && !isServerlessRuntime
            ? [
                new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/combined.log' }),
            ]
            : []),
    ],
});
