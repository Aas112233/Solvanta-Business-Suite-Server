import { app } from '../dist/app.js';
import { basePrisma } from '../dist/lib/prisma.js';
import { ensureDatabaseIndexes } from '../dist/lib/indexManager.js';
import { ensureConfiguredSuperAdmin } from '../dist/bootstrap/superAdmin.js';

let systemInitializedPromise;

function ensureDatabaseConnection() {
    if (!systemInitializedPromise) {
        systemInitializedPromise = (async () => {
            // 1. Connect to Prisma database
            await basePrisma.$connect();

            // 2. Ensure optimized MongoDB indexes exist
            try {
                await ensureDatabaseIndexes();
            } catch (error) {
                console.error('Failed to ensure database indexes on Vercel startup:', error);
            }

            // 3. Ensure Super Admin is created and configured
            try {
                await ensureConfiguredSuperAdmin({ source: 'startup' });
            } catch (error) {
                console.error('Failed to run super admin bootstrap on Vercel startup:', error);
            }
        })().catch((error) => {
            systemInitializedPromise = undefined;
            throw error;
        });
    }

    return systemInitializedPromise;
}

export default async (req, res) => {
    await ensureDatabaseConnection();
    return app(req, res);
};
