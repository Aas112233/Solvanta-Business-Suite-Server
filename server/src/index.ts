import { app } from './app.js';
import { env } from './config/env.js';
import { basePrisma, prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { ensureDatabaseIndexes } from './lib/indexManager.js';
import { ensureConfiguredSuperAdmin } from './bootstrap/superAdmin.js';
import os from 'os';

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1000; // 1 second

function getNetworkIPv4s() {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const netIf of Object.values(interfaces)) {
        for (const entry of netIf || []) {
            if (entry.family !== 'IPv4' || entry.internal) continue;
            addresses.push(entry.address);
        }
    }

    return Array.from(new Set(addresses));
}

async function connectWithRetry() {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            logger.info(`Attempting database connection (attempt ${attempt}/${MAX_RETRIES})...`);
            await basePrisma.$connect();
            logger.info(`✓ Database connected successfully (attempt ${attempt}/${MAX_RETRIES})`);
            return true;
        } catch (error: any) {
            lastError = error;
            const isLastAttempt = attempt === MAX_RETRIES;
            const errorMessage = error?.message || error?.toString() || 'Unknown error';

            if (isLastAttempt) {
                logger.error(`✗ Database connection failed after ${MAX_RETRIES} attempts`);
                logger.error(`Error details: ${errorMessage}`);
                return false;
            }

            const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            logger.warn(`✗ Attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${delayMs}ms...`);
            logger.warn(`Error: ${errorMessage}`);

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return false;
}

async function main() {
    try {
        // Connect to database with retry logic
        const connected = await connectWithRetry();

        if (!connected) {
            logger.error('Failed to connect to database. Exiting...');
            process.exit(1);
        }

        // Ensure database indexes are created for optimal performance
        await ensureDatabaseIndexes();
        await ensureConfiguredSuperAdmin({ source: 'startup' });

        app.listen(Number(env.PORT), env.HOST, () => {
            const localUrl = `http://localhost:${env.PORT}`;
            logger.info(`Server running on ${localUrl}`);
            logger.info(`API docs: ${localUrl}/api/v1`);

            const networkIps = getNetworkIPv4s();
            if (env.HOST === '0.0.0.0' || env.HOST === '::') {
                if (networkIps.length > 0) {
                    networkIps.forEach((ip) => {
                        logger.info(`Network: http://${ip}:${env.PORT}`);
                    });
                } else {
                    logger.info('Network: no active IPv4 interface detected');
                }
            } else {
                logger.info(`Bound host: ${env.HOST}`);
            }

            logger.info(`Environment: ${env.NODE_ENV}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

main();
