import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import os from 'os';

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

async function main() {
    try {
        // Test database connection
        await prisma.$connect();
        logger.info('Database connected');

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
